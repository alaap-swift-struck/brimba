# Operations — brimba

How this project ships. /ship-staging and /ship-production read the config below.

## Deploy config

- platform: cloudflare-workers (gateway worker serves the app + routes /api)
- staging_url: https://brimba-staging.swift-struck.workers.dev
- production_url: https://brimba.swift-struck.workers.dev
- build_command: npm run build (root; builds web/ static export to web/out)
- deploy_staging_command: npm run deploy:staging (root; builds web/ then deploys ALL six workers realtime-first: realtime → auth → tenancy → content → data-ops → gateway, staging names)
- deploy_production_command: npm run deploy:production (root; same six-worker realtime-first order, production names)
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
| data-ops (`workers/data-ops`) | brimba-data-ops-staging | brimba-data-ops | BUILT 2026-06-23. **CSV import** (the 3-stage session against the global `importable_databases` catalog, INSERT-ONLY, act-as-user through the gated create endpoints) + **the AI agent** (swappable model, act-as-user executor, confirm rule, identity blocks, fenced data, step cap, saved threads, credit quota). Routes `/api/data-ops/*`. Binds AUTH + REALTIME + CONTENT + TENANCY + the Workers AI binding (`AI`) + the core DB. No cron |

| D1 database | Bound to | Migrations |
|---|---|---|
| brimba-core-staging | brimba-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply brimba-core-staging --env staging --remote` |
| brimba-core | brimba-auth | `cd workers/auth && npx wrangler d1 migrations apply brimba-core --remote` |

Deploy order when several change: **realtime → auth → tenancy → content → data-ops → gateway** (root scripts do this — realtime FIRST because every other worker service-binds it: auth/tenancy/content/data-ops publish change pings, the gateway routes the WebSocket. Deploying a binder before its target fails with "Worker not found" — this bit us on the first production deploy, when `brimba-realtime` didn't exist yet; FIXED 2026-06-22). content and data-ops slot in before the gateway because the gateway routes `/api/content/*` and `/api/data-ops/*` to them, and **data-ops binds CONTENT + TENANCY** (so both must exist before data-ops). NOTE: realtime also binds AUTH, so on a truly fresh account (neither exists) the auth↔realtime cycle must be broken once — deploy the pre-existing side first; in practice auth already exists by the time realtime is added. The realtime worker defines the `TeamChannel` Durable Object (a one-time `migrations` tag in its wrangler.jsonc; no team-DB migration involved — the DO holds no app data). Durable Objects need the Workers Paid plan.
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them. The agent-modules build (2026-06-23) adds **core migrations 0008 (`importable_databases`) / 0009 (`agent_usage`) / 0010 (`agent_credits`)**, the credit-usage view (2026-07-01) adds **0011 (`agent_usage_log` — the per-turn "why" trail)**, and the error store (2026-07-03) adds **0012 (`error_logs` — the central error log, ERROR-HANDLING.md)** — apply them to `brimba-core` + `brimba-core-staging` (same command as below, any of the core-bound workers can run it; 0011 is applied on staging, production is owner-gated) — and the **team-schema migrations `0004_modules`** (learning, learning_progress, help, help_threads, data_import_sessions, agent_threads, agent_messages) **… `0006_import_batches`** (the agentic multi-file import shell, AGENTIC-IMPORT.md) — rolled to every team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key). Apply BOTH before deploying content/data-ops.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `CF_D1_TOKEN` (Account→D1→Edit) on brimba-tenancy + brimba-tenancy-staging — SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module) — SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- `INTERNAL_KEY` — shared secret guarding auth's `/internal/send-email` (tenancy sends it; auth enforces it). UPDATED 2026-06-21: when `INTERNAL_KEY` is set, auth REJECTS any `/internal/send-email` whose key does not match — a mismatch is a HARD 401 reject, NOT a silent pass. The key MUST match across `brimba-auth*` + `brimba-tenancy*` + `brimba-content*` (help/notify emails via auth) + `brimba*`/`brimba-staging` (the GATEWAY — it forwards client error beacons to auth's /internal/log-error; ADDED 2026-07-03), and it MUST be set in EVERY env before the member-notification email feature ships (so "when set" is not an optional/skippable path in production). Defense-in-depth alongside `workers_dev:false`.
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

- `POST /api/data-ops/admin/seed-targets` — seed/refresh the GLOBAL `importable_databases` import catalog (which target tables can be imported). Run once per env after the core 0008 migration.
- `GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N` — read the central error log (newest first). `POST /api/data-ops/admin/errors/resolve` `{ id, note }` — mark one resolved with the what-went-wrong note. See ERROR-HANDLING.md.
- `POST /api/data-ops/admin/grant-credits` — top up a team's AI credit balance (the purchasable half of the agent quota; the free half defaults to 25/day via the `AGENT_FREE_DAILY` var — staging runs 50). This is the seam real payments wire into later.

### Public surface (LOCKED): only the gateway is public

auth, tenancy, realtime, content and data-ops all set `"workers_dev": false` (top-level AND env.staging — envs don't inherit), so they have NO public `*.workers.dev` URL and are reachable ONLY via service bindings. The **gateway** (`brimba` / `brimba-staging`) is the single public address. This is what makes `/internal/send-email` (and the agent/import act-as-user surface) safe (no public route can reach it). Never add a public route/`workers_dev` to a non-gateway worker.
- Until RESEND_API_KEY is set: staging echoes login codes in the API response (DEV_ECHO_CODES=1); production refuses email login.

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

## Verify before shipping

- npm run check   (type-checks web + the 6 built workers — auth, tenancy, realtime, gateway, content, data-ops — and runs all unit/integration tests). UPDATED 2026-06-23: 6 workers are on disk (content + data-ops landed in the agent-modules build); the external `mcp` worker is still PLANNED, not built. The recipe config store lives in tenancy, not a separate worker.
- CI runs the same on every push (.github/workflows/ci.yml)
- deploy:staging ends with scripts/smoke-staging.mjs — the LIVE login→team journey must pass or the deploy is considered failed

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (web on :3000; /api proxies to :8787)

## Notes

- The UI library (`@swift-struck/ui`) installs from GitHub. Update: `npm install github:alaap-swift-struck/swift-struck-ui`.
- `web/app/globals.css` is a COPY of the library theme (master: swift-struck-ui repo, www/app/globals.css). Its `@source` points at the ROOT node_modules (workspaces hoist).
- Missing UI components are placeholdered in `web/components/temp/` and tracked in UI-GAPS.md — the library absorbs them, then placeholders get deleted.
