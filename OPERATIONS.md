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

## The pieces

| Worker | Staging name | Production name | What it is |
|---|---|---|---|
| gateway (`workers/gateway`) | brimba-staging | brimba | The front door: serves web/out + routes /api/* via service bindings |
| auth (`workers/auth`) | brimba-auth-staging | brimba-auth | Login (strict email codes only), sessions, users |

| D1 database | Bound to | Migrations |
|---|---|---|
| brimba-core-staging | brimba-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply brimba-core-staging --env staging --remote` |
| brimba-core | brimba-auth | `cd workers/auth && npx wrangler d1 migrations apply brimba-core --remote` |

Deploy order when several change: auth → tenancy → gateway (root scripts do this).
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `CF_D1_TOKEN` (Account→D1→Edit) on brimba-tenancy + brimba-tenancy-staging — SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module) — SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- Until RESEND_API_KEY is set: staging echoes login codes in the API response (DEV_ECHO_CODES=1); production refuses email login.

## Verify before shipping

- npm run check   (type-checks web + all workers, runs all 21 unit/integration tests)
- CI runs the same on every push (.github/workflows/ci.yml)
- deploy:staging ends with scripts/smoke-staging.mjs — the LIVE login→team journey must pass or the deploy is considered failed

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (web on :3000; /api proxies to :8787)

## Notes

- The UI library (`@swift-struck/ui`) installs from GitHub. Update: `npm install github:alaap-swift-struck/swift-struck-ui`.
- `web/app/globals.css` is a COPY of the library theme (master: swift-struck-ui repo, www/app/globals.css). Its `@source` points at the ROOT node_modules (workspaces hoist).
- Missing UI components are placeholdered in `web/components/temp/` and tracked in UI-GAPS.md — the library absorbs them, then placeholders get deleted.
