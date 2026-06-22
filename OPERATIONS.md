# Operations — brimba

How this project ships. /ship-staging and /ship-production read the config below.

## Deploy config

- platform: cloudflare-workers (gateway worker serves the app + routes /api)
- staging_url: https://brimba-staging.swift-struck.workers.dev
- production_url: https://brimba.swift-struck.workers.dev
- build_command: npm run build (root; builds web/ static export to web/out)
- deploy_staging_command: npm run deploy:staging (root; builds + deploys brimba-auth-staging then brimba-staging)
- deploy_production_command: npm run deploy:production (root; builds + deploys brimba-auth then brimba)
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

| D1 database | Bound to | Migrations |
|---|---|---|
| brimba-core-staging | brimba-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply brimba-core-staging --env staging --remote` |
| brimba-core | brimba-auth | `cd workers/auth && npx wrangler d1 migrations apply brimba-core --remote` |

Deploy order when several change: auth → realtime → tenancy → gateway (root scripts do this — realtime before the workers that bind it). The realtime worker defines the `TeamChannel` Durable Object (a one-time `migrations` tag in its wrangler.jsonc; no team-DB migration involved — the DO holds no app data). Durable Objects need the Workers Paid plan.
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `CF_D1_TOKEN` (Account→D1→Edit) on brimba-tenancy + brimba-tenancy-staging — SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module) — SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- `INTERNAL_KEY` — shared secret guarding auth's `/internal/send-email` (tenancy sends it; auth enforces it). UPDATED 2026-06-21: when `INTERNAL_KEY` is set, auth REJECTS any `/internal/send-email` whose key does not match — a mismatch is a HARD 401 reject, NOT a silent pass. The key MUST match across `brimba-auth*` + `brimba-tenancy*`, and it MUST be set in EVERY env before the member-notification email feature ships (so "when set" is not an optional/skippable path in production). Defense-in-depth alongside `workers_dev:false`.

### Public surface (LOCKED): only the gateway is public

auth, tenancy and realtime set `"workers_dev": false` (top-level AND env.staging — envs don't inherit), so they have NO public `*.workers.dev` URL and are reachable ONLY via service bindings. The **gateway** (`brimba` / `brimba-staging`) is the single public address. This is what makes `/internal/send-email` safe (no public route can reach it). Never add a public route/`workers_dev` to a non-gateway worker.
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

- npm run check   (type-checks web + the 4 built workers — auth, tenancy, realtime, gateway — and runs all unit/integration tests). UPDATED 2026-06-21: 4 workers are on disk; content + data-ops are PLANNED, not built, so "all 5 workers" / "~6" no longer applies. The recipe config store lives in tenancy, not a separate worker.
- CI runs the same on every push (.github/workflows/ci.yml)
- deploy:staging ends with scripts/smoke-staging.mjs — the LIVE login→team journey must pass or the deploy is considered failed

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (web on :3000; /api proxies to :8787)

## Notes

- The UI library (`@swift-struck/ui`) installs from GitHub. Update: `npm install github:alaap-swift-struck/swift-struck-ui`.
- `web/app/globals.css` is a COPY of the library theme (master: swift-struck-ui repo, www/app/globals.css). Its `@source` points at the ROOT node_modules (workspaces hoist).
- Missing UI components are placeholdered in `web/components/temp/` and tracked in UI-GAPS.md — the library absorbs them, then placeholders get deleted.
