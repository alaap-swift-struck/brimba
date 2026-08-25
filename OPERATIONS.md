# Operations — brimba

How this project ships. /ship-staging and /ship-production read the config below.

## Deploy config

- platform: cloudflare-workers (gateway worker serves the app + routes /api)
- staging_url: https://brimba-staging.swift-struck.workers.dev
- production_url: https://brimba.swift-struck.workers.dev
- build_command: npm run build (root; builds web/ static export to web/out)
- deploy_staging_command: npm run deploy:staging (root; builds web/ then deploys ALL seven workers realtime-first: realtime → auth → tenancy → content → data-ops → mcp → gateway, staging names)
- deploy_production_command: npm run deploy:production (root; same seven-worker realtime-first order, production names)
- github_remote: origin (https://github.com/alaap-swift-struck/brimba)

## Reset config

The /clean_slate skill reads this. DESTRUCTIVE — wipes data back to empty.

- reset_command: node scripts/reset-all.mjs <staging|production|both>
- global_db_staging: brimba-core-staging
- global_db_production: brimba-core
- what it does: deletes every team database THIS project's global `teams` table
  references (never other projects' DBs), then removes all rows from the global
  core DB while keeping the schema + d1_migrations. Self-tests with a read-back.

## The pieces

| Worker | Staging name | Production name | What it is |
|---|---|---|---|
| gateway (`workers/gateway`) | brimba-staging | brimba | The front door: serves web/out (marks `/_next/static/**` immutable) + routes /api/* (incl. the /api/realtime WebSocket) via service bindings |
| auth (`workers/auth`) | brimba-auth-staging | brimba-auth | Login (strict email codes only), sessions, users |
| realtime (`workers/realtime`) | brimba-realtime-staging | brimba-realtime | The live switchboard: one `TeamChannel` Durable Object per **channel** fans out row-level `{resource,id,op}` pings over WebSockets. TWO channel scopes — `team:<id>` (per active team) and `user:<id>` (per signed-in user) — so each open browser holds two sockets; idle channels hibernate (≈ free). Binds AUTH + the core DB (to gate connections); holds no app data |
| tenancy (`workers/tenancy`) | brimba-tenancy-staging | brimba-tenancy | Members/roles/invites: team membership, role permissions, invitations, per-team dropdown values + the nightly team-DB sizing cron + the team-DB migration and sharding admin endpoints. UPDATED 2026-06-21: the planned `workers/config` worker was folded into tenancy — there is NO separate config worker. UPDATED 2026-08-25: the per-team screen-recipe config store (`GET/POST /api/tenancy/config/screens`) was DELETED — screen recipes are code (`web/lib/screens.ts`), not rows |
| content (`workers/content`) | brimba-content-staging | brimba-content | BUILT 2026-06-23. The team-DB content modules: **Learning** (how-to items + per-user "mark done" progress) + **Help** (team-wide tickets + threaded replies, fixed status lifecycle). Routes `/api/content/*`. Binds AUTH + REALTIME + the core DB (gating) + two R2 buckets (`LEARNING_MEDIA`, `HELP_MEDIA`). No cron |
| mcp (`workers/mcp`) | brimba-mcp-staging | brimba-mcp | BUILT 2026-07-07. The external machine surface: personal access tokens (core `mcp_tokens`) bridged to team-pinned sessions (auth `/internal/mcp-session`), exposing the gated doors as MCP tools over JSON-RPC at `/mcp` (+ token management at `/api/mcp/tokens*`). Binds AUTH + TENANCY + CONTENT + DATAOPS + the core DB. Secret: `INTERNAL_KEY` (same value as auth/tenancy/content/gateway). No cron |
| data-ops (`workers/data-ops`) | brimba-data-ops-staging | brimba-data-ops | BUILT 2026-06-23. **CSV import** — the 3-stage single-target session AND the agentic multi-file **batch** import (analyze → plan → ordered run with foreign-key resolution; AGENTIC-IMPORT.md), both INSERT-ONLY + act-as-user through the gated create endpoints — plus full-field CSV **export** (`/api/content/learning/export`, `/api/tenancy/roles/export`) + **the AI agent** (swappable model, act-as-user executor, confirm rule, identity blocks, fenced data, step cap, saved threads, credit quota). Routes `/api/data-ops/*`. Binds AUTH + REALTIME + CONTENT + TENANCY + the Workers AI binding (`AI`) + the core DB. No cron |

| D1 database | Bound to | Migrations |
|---|---|---|
| brimba-core-staging | brimba-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply brimba-core-staging --env staging --remote` |
| brimba-core | brimba-auth | `cd workers/auth && npx wrangler d1 migrations apply brimba-core --remote` |

Deploy order when several change: **realtime → auth → tenancy → content → data-ops → mcp → gateway** (root scripts do this — realtime FIRST because every other worker service-binds it: auth/tenancy/content/data-ops publish change pings, the gateway routes the WebSocket. Deploying a binder before its target fails with "Worker not found" — this bit us on the first production deploy, when `brimba-realtime` didn't exist yet; FIXED 2026-06-22). content and data-ops slot in before the gateway because the gateway routes `/api/content/*` and `/api/data-ops/*` to them, and **data-ops binds CONTENT + TENANCY** (so both must exist before data-ops). **COLD-START (a genuinely fresh account — every `new-app` fork):** realtime also binds AUTH, so `realtime → auth` and `auth → realtime` form a cycle; the very first deploy dies with **`code 10143`** ("Worker not found" for the not-yet-deployed side). This is NOT a "usually auth already exists" footnote — on a fresh account NEITHER exists. Break it once: in `workers/realtime/wrangler.jsonc` **temporarily remove the AUTH service binding**, run `npm run deploy:*` (realtime deploys, then auth, …), then **restore the binding and redeploy realtime**. Do it on staging AND production. (A future improvement automates this in the deploy script — BASE-IMPROVEMENTS.) The realtime worker defines the `TeamChannel` Durable Object (a one-time `migrations` tag in its wrangler.jsonc; no team-DB migration involved — the DO holds no app data). Durable Objects need the Workers Paid plan.
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them. The agent-modules build (2026-06-23) adds **core migrations 0008 (`importable_databases`) / 0009 (`agent_usage`) / 0010 (`agent_credits`)**, the credit-usage view (2026-07-01) adds **0011 (`agent_usage_log` — the per-command "why" trail)**, the error store (2026-07-03) adds **0012 (`error_logs` — the central error log, ERROR-HANDLING.md)**, and the MCP front desk (2026-07-07) adds **0013 (`mcp_tokens` + `sessions.team_pin`)** — WITHOUT 0013 the whole MCP surface hits a missing table — and the honest usage log (2026-08-04) adds **0014 (`agent_usage_log.kind` — action rows team-visible, prompt rows the author's; WITHOUT it every usage write fails its best-effort insert, so the log silently stops filling)** — apply them to `brimba-core` + `brimba-core-staging` (same command as below, any of the core-bound workers can run it; 0011 is applied on staging, production is owner-gated) — and the **team-schema migrations** — the `TEAM_MIGRATIONS` list in `workers/tenancy/src/team-schema.ts` IS the list (`0001_team_base` … `0009_speed_indexes` today; never hand-count it, read it), of which `0004_modules` adds learning, learning_progress, help, help_threads, data_import_sessions, agent_threads and agent_messages, `0006_import_batches` the agentic multi-file import shell (AGENTIC-IMPORT.md), and `0007_scale_indexes` / `0008_activity_origin` / `0009_speed_indexes` the scale, audit and speed rounds — rolled to every team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key, and see the resumable loop below). Apply BOTH before deploying content/data-ops.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `CF_D1_TOKEN` (Account→D1→Edit) on brimba-tenancy + brimba-tenancy-staging — SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module) — SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- `INTERNAL_KEY` — shared secret guarding auth's `/internal/send-email` (tenancy sends it; auth enforces it). UPDATED 2026-08-04: every internal door now **FAILS CLOSED** — send-email, log-error and mcp-session all REFUSE every caller while `INTERNAL_KEY` is unset (a half-finished bootstrap must not run with the doors open), and a mismatch is a hard reject. The key MUST match across `brimba-auth*` + `brimba-tenancy*` + `brimba-content*` (help/notify emails via auth) + `brimba*`/`brimba-staging` (the GATEWAY — it forwards client error beacons to auth's /internal/log-error; ADDED 2026-07-03) + `brimba-mcp*` (it mints team-pinned sessions via auth's `/internal/mcp-session`; ADDED 2026-07-07 — omit it and the whole MCP surface can't authenticate), and it MUST be set in EVERY env before the member-notification email feature ships (so "when set" is not an optional/skippable path in production). Defense-in-depth alongside `workers_dev:false`.
- `PUBLIC_APP_URL` — a **var** (not a secret) in `workers/tenancy/wrangler.jsonc`, set per env (staging + production, SET 2026-07-01): the absolute origin used in outbound email links (invites). Without it an agent-sent invite email would link to the internal binding host — see EDGE-CASES §4.

### Agent-modules secrets + vars (BUILT 2026-06-23 — `brimba-content*` + `brimba-data-ops*`)

- `CF_D1_TOKEN` (Account→D1→Edit) on **brimba-content + brimba-content-staging** AND **brimba-data-ops + brimba-data-ops-staging** — both reach per-team databases over the one REST door, same as tenancy. Set per env: `cd workers/content && npx wrangler secret put CF_D1_TOKEN` (and `--env staging`); same for `workers/data-ops`.
- `INTERNAL_KEY` on **brimba-content*** (it calls auth's `/internal/send-email` for help reply/@mention notifications) — same value as auth/tenancy.
- `ADMIN_KEY` on **brimba-data-ops*** (guards the two owner-only endpoints below) — same as the tenancy maintenance key. data-ops also forwards the caller's session cookie to content/tenancy (act-as-user), so no extra cross-worker secret is needed for the import/agent executor.
- `ANTHROPIC_API_KEY` on **brimba-data-ops*** — OPTIONAL. When set, the AI agent's brain is Claude (this is what the owner runs — SET on staging 2026-06-30; production is owner-gated); when unset, it falls back to Cloudflare Workers AI. **BOTH brains do full tool use** — the key changes which model thinks, never whether the agent can act. (Claude also streams word-by-word; Workers AI replies arrive at once but still emits live step events.) Set per env with `wrangler secret put ANTHROPIC_API_KEY`.
- **Vars (in `workers/data-ops/wrangler.jsonc`, not secrets):** `AGENT_MODEL` (the Claude model id, default **`claude-sonnet-5`**, used only when `ANTHROPIC_API_KEY` is set) + `AGENT_EFFORT` (Claude reasoning effort, default **`low`** — the cheap setting; raise when more capability is worth the tokens) + `AGENT_FREE_DAILY` (the team's free daily agent allowance; code default 25, **staging runs 50**) + `WORKERS_AI_MODEL` (the fallback model, default **`@cf/meta/llama-4-scout-17b-16e-instruct`**, verified live: chats, answers from real team data, takes actions). Swap the brain by editing one var or `selectModel()` — "model is a battery". Other good Workers AI swaps: `@cf/openai/gpt-oss-20b` / `gpt-oss-120b` (agentic), `@cf/moonshotai/kimi-k2.6` (frontier, premium, best chat). `cheapText` (inline jobs) always uses the Workers AI var. **HISTORY / GOTCHAS:** (1) the old default `@cf/meta/llama-3.1-8b-instruct` was DEPRECATED+removed 5/30/2026 — calling it threw and crashed the agent on EVERY message (even "hi"); always check a model id is still served. (2) Workers AI models need the **OpenAI-wrapped tools format** `{type:"function",function:{…}}` (a flat shape 400s); the seam handles this. (3) Never send `temperature`/`top_p`/`budget_tokens` to Claude Sonnet 5 — each is a 400; effort is the one knob. Docs: developers.cloudflare.com/workers-ai/function-calling/ + /models/llama-4-scout-17b-16e-instruct/.
- **Workers AI binding:** `brimba-data-ops*` declares `"ai": { "binding": "AI" }` in its wrangler.jsonc — no secret, just the binding (Workers AI is metered on the account). This is what powers the swappable model's fallback path + every `cheapText` call.

### R2 buckets (BUILT 2026-06-23 — bound to `brimba-content*`)

One bucket PER MODULE, per-team key prefix inside (the R2 golden rule). Create both per env before deploying content:

- `brimba-learning-media` + `brimba-learning-media-staging` — learning item media (bound `LEARNING_MEDIA`).
- `brimba-help-media` + `brimba-help-media-staging` — help attachments (bound `HELP_MEDIA`; the attachment UI hook itself is deferred — see AGENT-MODULES-PLAN).
- `brimba-media` + `brimba-media-staging` — profile photos + team logos (bound `MEDIA` on the gateway, which serves them at `GET /media/*`). Pre-dates the module buckets; created with the base.

Create with `npx wrangler r2 bucket create <name>` (run once per bucket per account). (Import has NO bucket of its own — CSV text is uploaded into the import session, not R2.)

### Owner-only endpoints (data-ops, x-admin-key — same key as the tenancy maintenance actions)

- `POST /api/data-ops/admin/seed-targets` — refresh the GLOBAL `importable_databases` catalog's LABELS (display names / descriptions / schemas). **No longer a step anyone must remember**: the catalogue reconciles itself against the code on read (R13 — a fresh env's picker heals on first open; a target the owner switched off stays off, and this door no longer re-activates it either).
- `GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N` — read the central error log (newest first). `POST /api/data-ops/admin/errors/resolve` `{ id, note }` — mark one resolved with the what-went-wrong note. See ERROR-HANDLING.md.
- `POST /api/data-ops/admin/grant-credits` — top up a team's AI credit balance (the purchasable half of the agent quota; the free half defaults to 25/day via the `AGENT_FREE_DAILY` var — staging runs 50). This is the seam real payments wire into later.

### Public surface (LOCKED): only the gateway is public

auth, tenancy, realtime, content, data-ops and mcp all set `"workers_dev": false` **and `"preview_urls": false`** (BOTH, top-level AND env.staging — a per-version preview URL would be a second public door) (top-level AND env.staging — envs don't inherit), so they have NO public `*.workers.dev` URL and are reachable ONLY via service bindings. The **gateway** (`brimba` / `brimba-staging`) is the single public address. This is what makes `/internal/send-email` (and the agent/import act-as-user surface) safe (no public route can reach it). Never add a public route/`workers_dev` to a non-gateway worker.
- **Toolchain (2026-08-06): Next 16 + wrangler 4.120, and `npm audit` is clean at
  every severity.** Two things to know if you touch either. (1) `shared/workers/*.ts`
  must NOT `import` from `@cloudflare/workers-types` — every worker tsconfig already
  loads those types globally, and a module import from `shared/` can only resolve via a
  root hoist that no longer happens. (2) `web/tsconfig.json` deliberately does NOT
  include `../shared/workers/**`: the browser app typechecks only the shared code it
  uses, and each worker typechecks its own. Re-adding either is how the build breaks
  the next time a dependency stops hoisting.
- **Both environments are on the same commit as of 2026-08-06** — production was
  brought up from the pre-hardening build in one rollout: core migration `0014`
  applied to `brimba-core` first, then all seven workers realtime-first. Verified
  on production: four worker healths, the test-login door refused (403) even when
  handed the staging key (`ENVIRONMENT: "production"` ships in the config), the
  activity door gating before scope resolution, and a forged-cookie beacon writing
  zero rows. Production auth holds only `INTERNAL_KEY` + `RESEND_API_KEY` — no
  `TEST_LOGIN_KEY`, and the door would refuse it anyway.
- **Sign-in codes: a 60-second cooldown, never an hour-long lockout.** Asking for
  a code twice inside a minute returns `429 too_soon`. Past the hourly cap the
  live code is ROTATED in place (fresh secret, fresh TTL, fresh attempt budget)
  rather than refused — so nobody, including an operator retrying a flaky email,
  can be locked out of their own account. A CONSUMED code doesn't hold the
  cooldown: signing in on a laptop and then a phone works straight away.
- **Team creation is capped per user** — `MAX_TEAMS_PER_USER` (default 5) counts
  teams the account CREATED, not teams it belongs to, and **deactivated teams
  still count** (their database still exists, so "create five, switch them off,
  repeat" would otherwise be an unbounded database generator). Raise it per
  environment as a var. Setting it to `0` means zero, not the default.
- **`AGENT_FREE_DAILY=0` means zero free AI**, not "fall back to 50". Every
  numeric var behaves that way now (`numberVar`).
- **Uploaded files are capability URLs (a reasoned exception).** `/media/*` serves
  any object whose unguessable key you hold — no session, no membership check, no
  expiry. An ex-member who saved a link keeps it. Fine for photos and logos;
  fix it before launch if your product stores invoices, IDs or anything personal
  (BASE-MANUAL §5 has the patch).
- **Three reads return identity data behind a neighbouring right (a reasoned
  exception).** Stakeholder emails, the team creator's email, and learning-progress
  user ids ride `help:read` / any member / `learning:read`. Tenant-scoped, so it is
  a wrong-right mismatch inside one team, never a cross-customer leak.
- Login codes: **a code appears NOWHERE but the user's inbox — in any environment.** The old `DEV_ECHO_CODES` echo (code in the response + a toast) is DELETED, code path and config var both, so configuration can't re-enable it. Automated runs (the smoke, the e2e suite) sign in through the **test-login door** instead: `POST /api/auth/admin/test-login` `{email}` with an `x-admin-key` header mints a NORMAL hashed-at-rest code (same TTL, same attempt cap, same per-hour throttle as the real send path) and returns it once; the normal verify door consumes it. Its holder can sign in as ANY account on that environment, so it carries **two independent locks**: (1) its OWN `TEST_LOGIN_KEY` secret on the auth worker, which FAILS CLOSED when unset — deliberately NOT the `ADMIN_KEY` maintenance key this same page tells you to set on tenancy and data-ops in BOTH environments, so one mistyped directory can never arm impersonation; and (2) a hard refusal when the worker's `ENVIRONMENT` var is `production`, which ships with the deploy. **Set it on STAGING only** (`cd workers/auth && npx wrangler secret put TEST_LOGIN_KEY --env staging`) — production would refuse it anyway. The smoke + e2e read it from the environment: `export TEST_LOGIN_KEY=…` before `npm run smoke:staging` / the e2e suite.

### Resend (real login emails) — production wiring

The send code is built (`workers/auth/src/lib/email.ts`); it needs two things,
both owner-only:

1. **API key** — create at resend.com → API Keys (Sending access). Set it:
   `cd workers/auth && npx wrangler secret put RESEND_API_KEY` (prod) and again
   with `--env staging`. The moment it's set, real emails send and the staging
   echo stops.
2. **Verified sender domain** — `onboarding@resend.dev` (the current default
   `EMAIL_FROM`) only delivers to the Resend account owner's own inbox, so it's
   fine for our own testing but NOT for real users. To email anyone: in Resend
   add a domain (e.g. `mail.swiftstruck.com`), add the DKIM/SPF records it shows
   to that domain's DNS in Cloudflare, then set `EMAIL_FROM` in
   `workers/auth/wrangler.jsonc` to e.g. `Brimba <login@mail.swiftstruck.com>`
   and redeploy.

## Migrations this release needs

- **core `0015_scale_indexes`** — the sorts and retention sweeps the core database
  needs, plus `teams.moved_modules` (the counter the request path reads to find a
  relocated module). Apply with the usual core-migration step in BOOTSTRAP.md.
- **core `0018_speed_indexes`** — two indexes the core database's own hot reads
  need: the create-team cap, which counted a caller's teams by scanning the whole
  `teams` table on a door any signed-in person can knock on, and the nightly shard
  recount. Same core-migration step.
- **team `0007_scale_indexes`** — the indexes that match the sorts each team
  database actually issues. Rolled to existing teams by
  `POST /api/tenancy/admin/migrate-teams` (x-admin-key), same as any team migration.
- **team `0009_speed_indexes`** — one composite for the agent's own thread list
  (filter by creator AND sort by newest activity, which no single-column index
  could serve), plus the retirement of the two indexes it absorbs. Same
  migrate-teams roll — and see the resumable loop below.

None of them adds, removes or rewrites a row. They create indexes and one defaulted
column, so they are safe to apply while the app is serving. Dropping an index is as
additive as adding one: an index is derived data, rebuilt by re-running the
migration, and no row is touched.

### Rolling a team migration to every team — the loop, not one call

`POST /api/tenancy/admin/migrate-teams` (x-admin-key) rolls every migration a team
is missing to that team's database. It is **safe to re-run**: each team's own
`_migrations` table is read first and only the missing versions are applied, so a
repeat call on an up-to-date fleet does nothing.

**Drive it as a loop, not a single call.** One call walks ONE PAGE of teams — 50,
in team-id order — and answers with `done` and `nextAfter`. While `done` is false,
call again passing `?after=<nextAfter>`. One request per page keeps each one inside
the worker's time limit however many teams exist, and makes an interrupted roll
resumable rather than a restart:

```
curl -s -X POST "$BASE/api/tenancy/admin/migrate-teams" -H "x-admin-key: $ADMIN_KEY"
# -> { "ok": true, "done": false, "nextAfter": "<teamId>", "teamsChecked": 50, "teamsMigrated": 7 }

curl -s -X POST "$BASE/api/tenancy/admin/migrate-teams?after=<teamId>" -H "x-admin-key: $ADMIN_KEY"
# repeat until "done": true, at which point "nextAfter" is null
```

The paging is **keyset, in id order**, so pages tile exactly once — no overlap and
no gap even while teams are being created underneath the loop. A SHORT page is what
means "that was all of them", and `nextAfter` is null once done, so a caller cannot
loop for ever on a cursor that never clears.

**If it stops partway**, resume from the last `nextAfter` you saw. Teams already
migrated are skipped on the next pass regardless, so resuming from too far back
costs time, never correctness.

## Secrets

`npm run vault:check` — is the encrypted vault present and committed? See
[SECRETS.md](SECRETS.md). Cloudflare secrets are write-only; the vault is the only
copy that survives a lost laptop.

## Retention

The nightly tenancy cron now sweeps the LOG tables after sizing the databases
(see [SCALING.md](SCALING.md) §4). Audit tables (`activity`, `account_activity`)
are KEEP_FOREVER until an owner sets `RETAIN_TEAM_ACTIVITY_DAYS` /
`RETAIN_ACCOUNT_ACTIVITY_DAYS`. Every window is an environment variable — no
deploy needed to change one.

## Verify before shipping

- CI runs the same on every push (.github/workflows/ci.yml)
- deploy:staging ends with scripts/smoke-staging.mjs — the LIVE login→team journey must pass or the deploy is considered failed

## The architecture blueprint

`architecture-blueprint.html` is the interactive map — three views and a
plain-English walkthrough. It is **gitignored on purpose**: it is generated, not
source. What makes that safe is that the generator IS committed:

```bash
npm run blueprint
```

It re-reads the repo every run — the workers and their bindings, the migration
counts, the per-team tables, the buckets, the seams — so the map cannot drift
from the code. The plain-English sentences live in `scripts/build-blueprint.mjs`
beside it, and **a worker on disk with no sentence fails the build by name**
rather than quietly vanishing from the map.

It needs the `architecture_blueprint` skill's template
(`~/.claude/skills/architecture_blueprint/assets/`), and says so if it is absent.

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (web on :3000; /api proxies to :8787)

## Notes

- The UI library (`@swift-struck/ui`) installs from GitHub. Update: `npm install github:alaap-swift-struck/swift-struck-ui`.
- `web/app/globals.css` is a COPY of the library theme (master: swift-struck-ui repo, www/app/globals.css). Its `@source` points at the ROOT node_modules (workspaces hoist).
- Missing UI components are placeholdered in `web/components/temp/` and tracked in UI-GAPS.md — the library absorbs them, then placeholders get deleted.

---

## Scaling round 2 (2026-08-11) — what a deploy of this needs

**Core migrations to apply BEFORE deploying** (production is owner-gated):

| Migration | Adds | Why it must land first |
|---|---|---|
| `0016_channel_shards` | `teams.shard_count` | the realtime worker reads it on every publish; absent, the lookup fails and every team falls back to one shard (safe, but the valve does nothing) |
| `0017_idempotency` | `idempotency_keys` | the mutation dispatchers write to it whenever a client sends `Idempotency-Key`; absent, the claim throws and the mutation 500s |

Then `POST /api/tenancy/admin/migrate-teams` (x-admin-key) as usual — team
migration `0007_scale_indexes` is unchanged from the first pass.

**Rate-limit bindings.** `ratelimits` blocks are declared in four wrangler
configs — `gateway` (USER_LIMITER) and `tenancy` / `content` / `data-ops`
(TEAM_LIMITER), in BOTH the top-level (production) and `env.staging` blocks. The
syntax is Cloudflare's `ratelimits` key, and `period` must be **10 or 60** —
anything else is a deploy that fails, which a test asserts. Nothing needs
creating in the dashboard; the namespace ids are labels.

If the account does not have the binding available, the seam **fails open**: the
app runs exactly as before, minus the ceiling. That is by design, but it is also
silent — check a deploy's output rather than assuming. `wrangler deploy
--dry-run` prints the resolved bindings, and a live one reads
`env.USER_LIMITER (600 requests/60s)  Rate Limit`.

**How to actually verify it fires** (a burst against the real ceiling will NOT
prove it — the count is per colocation, so a parallel burst spreads out and no
counter reaches the limit). Temporarily set the STAGING limit to something like
`{"limit": 5, "period": 10}`, deploy the gateway, send ~25 SEQUENTIAL requests to
`/api/auth/me`, and expect 429s from the 6th. Then restore and redeploy. Done on
2026-08-11; the result is recorded in SCALING.md §4.6.

**Retention gains a table.** `idempotency_keys` is swept after 2 days
(`RETAIN_IDEMPOTENCY_DAYS`). It is the fastest-growing table the base has, since
every protected mutation writes a row.

**The nightly cron does one more thing.** After sizing databases and sweeping
retention it now raises `teams.shard_count` for any team past 10,000 members.
The raise is one-way; see SCALING.md §3.

---

## Scaling round 3 (2026-08-12) — the operations database

**A new D1 per environment**, already created:

| Environment | Database | id |
|---|---|---|
| staging | `brimba-ops-staging` | `b622a822-587e-4a67-b75e-922839616e94` |
| production | `brimba-ops` | `b1389453-fe77-48de-bab1-1dd868e02537` |

**Standing one up from scratch** (a fork, or a rebuild):

```
npx wrangler d1 create <project>-ops
npx wrangler d1 execute <project>-ops --remote --file ../../db/ops/0001_operations.sql
npx wrangler d1 execute <project>-ops --remote --file ../../db/ops/0002_error_request_id.sql
```

Apply **every** file in `db/ops/` in order — `0001…0002` today. BOOTSTRAP.md §3
does the same thing with `wrangler d1 migrations apply`, which picks them all up
on its own; the two `execute` lines above are the equivalent when you are standing
one database up by hand.

Then put the returned id in the `OPS` binding of **all SIX workers that carry
one** — auth / tenancy / realtime / content / data-ops / mcp — in BOTH the
top-level and `env.staging` blocks. (realtime joined on 2026-08-25: it had a `DB`
binding and no `OPS` one, so its error rows were landing in the shared core
database. The gateway is NOT in this list — it binds no database at all and
records through auth's `/internal/log-error`.)

**Moving the existing rows** — copy, verify, then delete, in that order:

```
node scripts/move-to-ops.mjs staging --delete-source
node scripts/move-to-ops.mjs production --delete-source
```

Without `--delete-source` the rows are copied and left, which is the fully
reversible state. The script REFUSES to delete unless both sides report the same
count, and there is no flag to override that.

**If you skip all of this**, nothing breaks. `opsDatabase(env)` falls back to the
core database when `OPS` is absent, so the app behaves exactly as it did — the
two tables are simply back where they started.

**A third rate-limit binding.** `HEAVY_LIMITER` (60/60s) on the gateway, for the
expensive doors — agent, import, export, upload. A caller must pass BOTH it and
the ordinary 600/60s ceiling.

**The nightly cron does a fourth job**: sweeping uploaded files that no record
points at, after a seven-day grace period.

---

## Rollback — it is live and it is broken

**The trigger.** Roll back when any of these is true after a deploy, without
waiting to find the cause:

- the staging smoke fails on a step that passed before the deploy
- a health endpoint (`/api/tenancy/health`, `/api/realtime/health`,
  `/api/mcp/health`) returns anything but 200
- `error_logs` shows a new cluster of the same message appearing since the deploy
  (`GET /api/data-ops/admin/errors?status=open`)
- sign-in fails for anyone

Diagnose afterwards. A worker rollback takes seconds and costs nothing.

### Rolling a worker back

Cloudflare keeps previous versions of every worker. Roll back the one that
broke — not all seven — unless the fault is in a shared seam:

```bash
cd workers/<worker>
npx wrangler deployments list
npx wrangler rollback [<version-id>]
```

Omit the version id to go back one deployment. Repeat per worker if a shared
change (anything in `shared/`) is at fault, and **reverse the deploy order**:
gateway first, realtime last. The deploy order exists so a worker never comes up
expecting a peer that is not there yet; rolling back the same way round would
recreate exactly that gap.

### What does NOT roll back

**Database migrations do not.** `wrangler d1 migrations apply` has no undo, so a
migration must be additive — a new column with a default, a new table, a new
index. Every migration in `db/core` and `db/ops` follows that rule, which is why
rolling a worker back to yesterday's code still runs against today's schema.

If a migration ever must be reversed, it is a hand-written forward migration that
undoes it, applied the same way. Never edit an applied migration file: the
ledger records it as applied and it will not run again.

**Data written since the deploy does not.** A rollback restores code, not rows.

### After rolling back

1. Re-run the smoke: `npm run smoke:staging`.
2. Check `error_logs` stops growing.
3. Fix forward on a branch, with a test that reproduces the failure first.

## Backup and restore

**Code, docs and history** — GitHub, plus whatever second remote is configured.

**Secrets** — `secrets.vault`, encrypted, **not yet created**. `npm run vault:save` seals it; `npm run vault:open`
restores every `.dev.vars` after a fresh clone. See SECRETS.md.

**Databases** — Cloudflare D1 Time Travel. **The window is 30 days** on the
Workers Paid plan (7 on Free — checked against Cloudflare's docs 2026-08-18).
Bookmarks are automatic: there is no backup to remember to take, and restoring
costs nothing. Everything older than 30 days is **not recoverable** — if a
retention rule or a support answer ever needs data beyond that, it must be
exported before it ages out, and nothing does that today.

```bash
cf-exec npx wrangler d1 time-travel info <database-name>
cf-exec npx wrangler d1 time-travel restore <database-name> --bookmark=<bookmark>
```

A **bookmark** is exact; `--timestamp <iso-8601>` also works and is what you use
when all you know is "before 14:30". Restoring is irreversible in the forward
direction, but the command prints the bookmark you were AT, so an unwanted
restore can itself be undone — write that bookmark down before you proceed.

Per-team databases are separate, so one team can be restored without touching
anyone else — which is the whole point of the per-team split.

### The restore drill — last proven 2026-08-18

An untested restore is not a restore, so this one was actually run, end to end,
on a throwaway database (`brimba-restore-drill`, created and deleted for the
purpose — no real data was touched):

1. created the database, wrote two rows
2. took a bookmark with `time-travel info`
3. `DELETE FROM invoices` — confirmed 0 rows, the accident
4. `time-travel restore --bookmark=<the bookmark>`
5. **both rows came back, values identical**
6. deleted the drill database

**Two things the drill found, which is the reason for running it.** The command
written here previously was `time-travel info <db> --remote` — `--remote` is not
a valid flag for that subcommand and the command simply fails, so the runbook
would have been wrong in the one moment it mattered. And `restore --timestamp`
was the only form documented; the bookmark form is the precise one and is what
`info` actually hands you.

Re-run this drill whenever wrangler has a major version bump, and update the date
above. It takes about three minutes.

**R2 objects** — not versioned. An overwritten or swept object is gone. The
nightly orphan sweep only removes objects no record references and only after a
seven-day grace period (SCALING.md §4.7), so the exposure is bounded.

## Performance budgets

Numbers, not opinions. `node scripts/timings.mjs` reads them off real responses —
every worker reports its own duration in a `Server-Timing` header beside the
request id — and exits non-zero if any operation is over budget.

**When to run it.** After anything that could touch the request path: a worker
deploy, a new or changed endpoint, an index or migration, a caching or paging
change — and as part of the ship gate, alongside `npm run check`. It takes about a
minute (five runs per probe).

```
node scripts/timings.mjs                  # staging, all probes
node scripts/timings.mjs --production     # public probes only — by design
node scripts/timings.mjs --url https://…  # somewhere else
```

- **Budgets are per CLASS of operation, not per URL** — `read` 400 ms, `write`
  600 ms, `delete` 500 ms, `bulk` 1500 ms, in `CLASS_BUDGET`. A probe inherits its
  class's number, so a newly added endpoint has a line to answer to the day it
  arrives instead of being unmeasured until somebody remembers it. A genuine
  exception overrides with its own `budget`.
- **It keeps a history** in `timings.json` (the last 50 runs, counted by run so a
  run is never half-kept). Each row is compared with the previous run against the
  SAME target, so the output has a "vs last" column, and anything more than **25%
  slower than last time** is called out by name even when it is still inside
  budget. Commit the file — the trend is the point.
- **The authenticated probes need `TEST_LOGIN_KEY`** set on staging — the same
  staging-only secret the smoke test signs in with. Without it they are skipped and
  you are back to measuring health checks.
- **It refuses to measure production, and that is the feature.** One authenticated
  probe RAISES A REAL TICKET, and this base has no delete door, so "don't run this
  against production" could not be left as a sentence in a comment. Three
  independent locks enforce it: `POST /api/auth/admin/test-login` refuses outright
  when `ENVIRONMENT` is production, so no session can be minted there whatever the
  script believes; the script checks the target **by host**, so an explicit
  `--url https://…` at the production host is caught too and refused before a
  single request is sent; and sign-in is hard-wired to one fixed scratch address
  belonging to no person, so even a write that somehow escaped lands in the scratch
  team it makes for itself. `--production` therefore runs the public probes only,
  by design. To measure the real request path, measure staging.

Before 2026-08-25 nothing in this base was instrumented: zero `Server-Timing`,
zero `performance.now`, zero logged durations across 222 files. Every performance
question was answerable only by argument.

> **The numbers that used to sit here are withdrawn, and the conclusion drawn from
> them was wrong.** This table read "every operation is inside budget" and "the
> workers answer in 4–9 ms" on the strength of four probes — the static page and
> the `auth`, `realtime` and `mcp` health checks. **All four return a literal
> `{ok:true}` without opening a database.** None of them crosses the path a real
> request takes (gateway → worker → auth → the D1 REST door), so the slowest and
> most interesting hop in the system was the one hop no number existed for. When
> the first probes that DO cross it were added, they came back **over budget** —
> server-side, not network. A document that says "fast" on the strength of a health
> check is not a measurement; it is a health check with a claim attached.
>
> **`node scripts/timings.mjs` is the live source. Run it and read its output —
> do not read a number from this page.** The real figures for `members list`,
> `one ticket by id` and `raise a ticket` are being diagnosed as this is written
> and will move; they will be filled in here once they settle. Until then this
> section states the shape of the problem and nothing about its size.

**Read a round trip and the server's own duration together** when you do run it.
The script prints both: the round trip includes the network from wherever you ran
it, and `server` does not. A gap between them is distance; a large `server` number
is the app's own work, and that is the one that needs a fix rather than a CDN.
Check the hop count too (below) — a screen asking the same question twice is a
different fault from a slow answer.

### The hop budget

A round trip to a per-team database is a REST call over the network, not a local
query, so hops are the expensive unit in this base and the one worth counting.

| Screen, cold, fresh tab | Requests | Distinct answers | Verdict |
|---|---|---|---|
| `/home` | 8 | 8 | ok |
| `/t/<team>/help/<id>` | 16 | 11 | ok |

Both were roughly double on 25 August — 16 and 24 — before in-flight
de-duplication, the single-row `?id=` doors and the removal of the screen-override
fetch. **A screen that needs more requests than it has distinct questions is asking
something twice**; that is the check worth making when adding one.

`useActiveTeam` mounts twice — `agent-host` and `deep-link-screen` — and read the
session directly, so it was the one caller in-flight de-duplication did not cover.
Both its reads now go through `dedupe()`, which shares the store's map, taking these
rows from 10/8 and 18/11 to the numbers above.

> **These digits have been right, then wrong, then right again — read the history
> before you trust them.** 8 and 16 were first written here from counting through
> the de-duplicated store rather than the network, when the real figures were 10
> and 18. `round_trip` round 4 re-counted independently, caught the miscount, and
> the table was corrected to 10 and 18 and marked **over**. The `useActiveTeam`
> fix above then genuinely removed those two requests, so the table reads 8 and 16
> once more — this time earned. Same digits, opposite reasons. **Re-count against
> the network panel, never against the store**, and if you cannot, say so rather
> than copy these forward: a budget nobody re-derives is a claim, and a budget that
> says you pass when you fail is worse than none.
