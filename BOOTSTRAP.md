# BOOTSTRAP.md — rebuild Brimba from zero on a fresh Cloudflare account

This is the **day-zero runbook**. Assume you have *only this repository* and an
empty Cloudflare account, and you want a running Brimba — staging first, then
production. Every command is here, in order. If you follow it top to bottom you
end with a live base you can sign into and build on.

> **Who this is for.** A developer, or an AI agent, standing the base up from
> scratch. You do not need any prior context beyond this repo — that is the whole
> point of this file. When something here disagrees with reality, **ARCHITECTURE.md
> is the master** and OPERATIONS.md holds the live deploy config.

> **The mental model in one paragraph.** Brimba is **six Cloudflare Workers** behind
> **one public door** (the gateway). Global identity/billing lives in **one core D1
> database** (`brimba-core`), reached by the native `env.DB` binding. Every *team*
> gets its **own D1 database**, created at runtime and reached over the **D1 REST
> API** (a scoped token, `CF_D1_TOKEN`). Uploaded files live in **R2**. Live updates
> fan out through **one Durable Object** (`TeamChannel`) in the realtime worker. The
> web app is a **Next.js static export** served by the gateway. Read BASE-MANUAL.md
> for the *why*; this file is the *how to stand it up*.

---

## 0 · Prerequisites (once per machine)

- **Node 20+** and **npm**.
- **A Cloudflare account on the Workers Paid plan** (Durable Objects need Paid).
- **Wrangler** (comes via `npx wrangler` — no global install needed).
- **A domain** on Cloudflare if you want custom URLs; otherwise the free
  `*.workers.dev` subdomains are fine (that's what the defaults use).
- **A [Resend](https://resend.com) account** for sending login-code + notification
  emails (or another provider — see OPERATIONS.md; auth is the only sender).
- *(Optional)* an **Anthropic API key** if you want the AI agent's brain to be
  Claude rather than the keyless Cloudflare Workers AI fallback.

```bash
git clone <this-repo> brimba && cd brimba
npm install            # also pulls @swift-struck/ui from GitHub
npx wrangler login     # authenticate wrangler to your Cloudflare account
npm run check          # sanity: TypeScript across every workspace + the full test suite must be green
```

`npm run check` green on a clean clone proves the code is intact before you touch
any cloud resource.

---

## 1 · The six workers (what you are about to create)

Each worker is its own `wrangler.jsonc` under `workers/<name>/`. Only the **gateway**
is public; every other worker sets `"workers_dev": false` and is reachable **only**
over service bindings (this is the locked "one public door" rule — never add a public
route to a non-gateway worker).

| Worker | Public? | Does |
|---|---|---|
| `realtime` | no | the `TeamChannel` Durable Object — fans out live change pings |
| `auth` | no | email-code login, sessions, the email sender |
| `tenancy` | no | teams, members, Member roles + permissions, invites, dropdown values |
| `content` | no | Learning + Help |
| `data-ops` | no | CSV import + the AI agent |
| `gateway` | **YES** | the single front desk: serves the web app + routes `/api/*` + serves `/media/*` |

**Deploy order is `realtime → auth → tenancy → content → data-ops → gateway`** and it
matters: realtime is FIRST because every other worker service-binds it (deploying a
binder before its target fails with "Worker not found"). The root `npm run deploy:*`
scripts already encode this order.

---

## 2 · The core database (global identity + billing)

One global D1 database holds users, teams, the team→member→role index, and the agent
quota tables. Create it for each environment and apply the core migrations in
`db/core/` (they are numbered `0001` … and applied in order; `0012` adds the central error log).

```bash
# Create the core DB for each env (copy the returned database_id into the
# tenancy + auth wrangler.jsonc d1_databases blocks if they aren't already set).
npx wrangler d1 create brimba-core-staging
npx wrangler d1 create brimba-core

# Apply every core migration (0001…0012) to each env. Any core-bound worker can run it;
# auth is the canonical one. Run WITHOUT --env for production.
cd workers/auth
npx wrangler d1 migrations apply brimba-core-staging --env staging --remote
npx wrangler d1 migrations apply brimba-core --remote
cd ../..
```

The current core migrations are `0001`–`0012` (users, teams, team_members, the
email-change security records, account activity, the import catalog, and the three
agent quota tables `agent_usage` / `agent_credits` / `agent_usage_log`, plus the
central error log `error_logs`). DATA-MODEL.md
lists every table. **Migrations are additive — never edit an applied one.**

> **Per-team databases are NOT created here.** Each team's database is created at
> runtime when the team is created (`applyTeamSchema` runs the `TEAM_MIGRATIONS` from
> `workers/tenancy/src/team-schema.ts` — `0001`…`0006` today). You only apply *team-schema* migrations to
> *existing* teams later, via the migrate-teams robot (§7).

---

## 3 · R2 buckets (uploaded files)

One bucket per media concern, per env. Create all six before deploying content/gateway:

```bash
npx wrangler r2 bucket create brimba-media                    # profile photos + team logos (gateway MEDIA)
npx wrangler r2 bucket create brimba-media-staging
npx wrangler r2 bucket create brimba-learning-media           # learning attachments (content LEARNING_MEDIA)
npx wrangler r2 bucket create brimba-learning-media-staging
npx wrangler r2 bucket create brimba-help-media               # help attachments (content HELP_MEDIA)
npx wrangler r2 bucket create brimba-help-media-staging
```

Inside each bucket, keys are prefixed per team (`teams/<id>`, `learning/<teamId>/<fileId>`, …).
`/media/*` is served by the gateway **without a session check** — safe for the current
low-sensitivity uploads because learning keys carry an unguessable file id; see the
ARCHITECTURE.md `/media/*` note before storing anything sensitive.

---

## 4 · Secrets + vars (per env, never in git)

**Secrets** (set with `wrangler secret put <NAME>` in the worker's directory; add
`--env staging` for staging). Store the values in each worker's git-ignored
`.dev.vars` for local dev too.

| Secret | On workers | Why |
|---|---|---|
| `RESEND_API_KEY` | auth | send login codes + notifications. Until it's set, staging echoes login codes in the API response and production refuses email login. |
| `CF_D1_TOKEN` | tenancy, content, data-ops | the scoped D1 REST token (Cloudflare → D1 → Edit) that reaches per-team databases. |
| `ADMIN_KEY` | tenancy, data-ops | guards the maintenance endpoints (migrate-teams, db-sizes, seed the import catalog, grant credits). |
| `INTERNAL_KEY` | auth, tenancy, content, gateway | shared secret gating auth's `/internal/send-email` (tenancy + content call it). MUST match across all four. |
| `ANTHROPIC_API_KEY` | data-ops | *optional* — when set, the agent's brain is Claude; unset falls back to Workers AI. Both do full tool use. |

**Vars** (plain config in `wrangler.jsonc`, not secret):

- `tenancy` → `PUBLIC_APP_URL` = the environment's absolute origin (e.g.
  `https://brimba-staging.swift-struck.workers.dev`). Outbound email links use it;
  leave it unset and agent-sent invite links point at the internal binding host.
- `data-ops` → `AGENT_MODEL` (default `claude-sonnet-5`), `AGENT_EFFORT` (default
  `low`), `AGENT_FREE_DAILY` (the free daily agent allowance — code default 25),
  `WORKERS_AI_MODEL` (the keyless fallback).

---

## 5 · Deploy (realtime-first) + the web build

The root scripts build the web static export and deploy all six workers in the
correct order:

```bash
npm run deploy:staging      # build web/ → deploy realtime,auth,tenancy,content,data-ops,gateway (staging) → smoke
npm run deploy:production   # same order, production names (run only after staging is verified)
```

The realtime worker defines the `TeamChannel` Durable Object via a one-time
`migrations` tag in its `wrangler.jsonc` — no data migration, the DO holds no app
data. Durable Objects require the Workers Paid plan.

---

## 6 · Seed the import catalog (once per env)

The CSV-import feature reads a global catalog of allowed target tables. Seed it after
the core `0008` migration and after data-ops is deployed:

```bash
curl -X POST https://<gateway-url>/api/data-ops/admin/seed-targets -H "x-admin-key: <ADMIN_KEY>"
```

---

## 7 · Create the first team + migrate-teams

1. Open the gateway URL, sign in with an email code (staging echoes the code if
   `RESEND_API_KEY` isn't set yet), and complete onboarding — this creates your first
   **team**, which creates that team's own D1 database and runs every `TEAM_MIGRATIONS`
   entry on it.
2. Whenever you later ship a NEW team-schema migration, roll it to all existing teams:

```bash
curl -X POST https://<gateway-url>/api/tenancy/admin/migrate-teams -H "x-admin-key: <ADMIN_KEY>"
```

That robot diffs each team's `_migrations` against `TEAM_MIGRATIONS` and applies the gap.

---

## 8 · Verify

```bash
npm run smoke:staging     # scripted end-to-end: health, login, team, context, logout
```

Or by hand: the gateway URL returns the app (HTTP 200); you can sign in, land in a
team, see Home / Learning / Help / Settings, and open the AI assistant. If the smoke's
login step reports `too_many_codes`, that's a per-email rate limit from repeated test
logins — wait it out; the deploy itself is fine.

---

## 9 · Reset (wipe data back to empty, keep the schema)

Destructive — deletes every per-team database and blanks the core DB (rows gone,
schema kept). Confirm production explicitly.

```bash
node scripts/reset-all.mjs staging          # or: production | both
```

After a reset, re-seed the import catalog (§6) and create a fresh first team (§7).

---

## The one-screen summary

```
prereqs → npm install → wrangler login → npm run check
  → d1 create (core, both envs) → migrations apply (core 0001–00NN)
  → r2 bucket create (media × 3 × 2 envs)
  → secret put (RESEND, CF_D1_TOKEN, ADMIN_KEY, INTERNAL_KEY, [ANTHROPIC]) + set vars (PUBLIC_APP_URL, AGENT_*)
  → npm run deploy:staging  (realtime→auth→tenancy→content→data-ops→gateway) → smoke
  → seed-targets → sign in → first team (creates its DB) → migrate-teams as needed
  → verify → (repeat for production, owner-gated)
```

If you can run this list, you can rebuild Brimba from nothing. To then *build a new
product on it*, read **BASE-MANUAL.md → "Fork the base for a new product"** and
**BUILD-A-MODULE.md**.
