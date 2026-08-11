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

The /reset-all skill reads this. DESTRUCTIVE — wipes data back to empty.

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
| tenancy (`workers/tenancy`) | brimba-tenancy-staging | brimba-tenancy | Members/roles/invites/config: team membership, role permissions, invitations + the nightly team-DB sizing cron + the per-team screen-recipe config store (served at GET/POST `/api/tenancy/config/screens`). UPDATED 2026-06-21: the planned `workers/config` worker was folded into tenancy — there is NO separate config worker |
| content (`workers/content`) | brimba-content-staging | brimba-content | BUILT 2026-06-23. The team-DB content modules: **Learning** (how-to items + per-user "mark done" progress) + **Help** (team-wide tickets + threaded replies, fixed status lifecycle). Routes `/api/content/*`. Binds AUTH + REALTIME + the core DB (gating) + two R2 buckets (`LEARNING_MEDIA`, `HELP_MEDIA`). No cron |
| mcp (`workers/mcp`) | brimba-mcp-staging | brimba-mcp | BUILT 2026-07-07. The external machine surface: personal access tokens (core `mcp_tokens`) bridged to team-pinned sessions (auth `/internal/mcp-session`), exposing the gated doors as MCP tools over JSON-RPC at `/mcp` (+ token management at `/api/mcp/tokens*`). Binds AUTH + TENANCY + CONTENT + DATAOPS + the core DB. Secret: `INTERNAL_KEY` (same value as auth/tenancy/content/gateway). No cron |
| data-ops (`workers/data-ops`) | brimba-data-ops-staging | brimba-data-ops | BUILT 2026-06-23. **CSV import** — the 3-stage single-target session AND the agentic multi-file **batch** import (analyze → plan → ordered run with foreign-key resolution; AGENTIC-IMPORT.md), both INSERT-ONLY + act-as-user through the gated create endpoints — plus full-field CSV **export** (`/api/content/learning/export`, `/api/tenancy/roles/export`) + **the AI agent** (swappable model, act-as-user executor, confirm rule, identity blocks, fenced data, step cap, saved threads, credit quota). Routes `/api/data-ops/*`. Binds AUTH + REALTIME + CONTENT + TENANCY + the Workers AI binding (`AI`) + the core DB. No cron |

| D1 database | Bound to | Migrations |
|---|---|---|
| brimba-core-staging | brimba-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply brimba-core-staging --env staging --remote` |
| brimba-core | brimba-auth | `cd workers/auth && npx wrangler d1 migrations apply brimba-core --remote` |

Deploy order when several change: **realtime → auth → tenancy → content → data-ops → mcp → gateway** (root scripts do this — realtime FIRST because every other worker service-binds it: auth/tenancy/content/data-ops publish change pings, the gateway routes the WebSocket. Deploying a binder before its target fails with "Worker not found" — this bit us on the first production deploy, when `brimba-realtime` didn't exist yet; FIXED 2026-06-22). content and data-ops slot in before the gateway because the gateway routes `/api/content/*` and `/api/data-ops/*` to them, and **data-ops binds CONTENT + TENANCY** (so both must exist before data-ops). **COLD-START (a genuinely fresh account — every `new-app` fork):** realtime also binds AUTH, so `realtime → auth` and `auth → realtime` form a cycle; the very first deploy dies with **`code 10143`** ("Worker not found" for the not-yet-deployed side). This is NOT a "usually auth already exists" footnote — on a fresh account NEITHER exists. Break it once: in `workers/realtime/wrangler.jsonc` **temporarily remove the AUTH service binding**, run `npm run deploy:*` (realtime deploys, then auth, …), then **restore the binding and redeploy realtime**. Do it on staging AND production. (A future improvement automates this in the deploy script — BASE-IMPROVEMENTS.) The realtime worker defines the `TeamChannel` Durable Object (a one-time `migrations` tag in its wrangler.jsonc; no team-DB migration involved — the DO holds no app data). Durable Objects need the Workers Paid plan.
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them. The agent-modules build (2026-06-23) adds **core migrations 0008 (`importable_databases`) / 0009 (`agent_usage`) / 0010 (`agent_credits`)**, the credit-usage view (2026-07-01) adds **0011 (`agent_usage_log` — the per-command "why" trail)**, the error store (2026-07-03) adds **0012 (`error_logs` — the central error log, ERROR-HANDLING.md)**, and the MCP front desk (2026-07-07) adds **0013 (`mcp_tokens` + `sessions.team_pin`)** — WITHOUT 0013 the whole MCP surface hits a missing table — and the honest usage log (2026-08-04) adds **0014 (`agent_usage_log.kind` — action rows team-visible, prompt rows the author's; WITHOUT it every usage write fails its best-effort insert, so the log silently stops filling)** — apply them to `brimba-core` + `brimba-core-staging` (same command as below, any of the core-bound workers can run it; 0011 is applied on staging, production is owner-gated) — and the **team-schema migrations `0004_modules`** (learning, learning_progress, help, help_threads, data_import_sessions, agent_threads, agent_messages) **… `0006_import_batches`** (the agentic multi-file import shell, AGENTIC-IMPORT.md) — rolled to every team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key). Apply BOTH before deploying content/data-ops.

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
- **team `0007_scale_indexes`** — the indexes that match the sorts each team
  database actually issues. Rolled to existing teams by
  `POST /api/tenancy/admin/migrate-teams` (x-admin-key), same as any team migration.

Neither adds, removes or rewrites a row. They create indexes and one defaulted
column, so they are safe to apply while the app is serving.

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
silent — check a deploy's output rather than assuming.

**Retention gains a table.** `idempotency_keys` is swept after 2 days
(`RETAIN_IDEMPOTENCY_DAYS`). It is the fastest-growing table the base has, since
every protected mutation writes a row.

**The nightly cron does one more thing.** After sizing databases and sweeping
retention it now raises `teams.shard_count` for any team past 10,000 members.
The raise is one-way; see SCALING.md §3.
