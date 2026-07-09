---
name: new-app
description: The one-shot foundation builder — given an app name, it clones the Brimba base from GitHub, runs the fork sweep (renames the brimba- prefix everywhere), stands the whole base up on Cloudflare command-by-command (core database + migrations, R2 buckets, secrets, realtime-first deploy of all seven workers, catalog seed, smoke), creates the GitHub repo, verifies everything (npm run check, the staging smoke including the MCP stage, the three quality gates, a browser sanity pass), and hands over a ready-to-brand checklist. Use when the user says "new app", "start a new project", "fork the base", "set up a new app", "bootstrap this project", or wants a fresh product wired up with the full local → GitHub → staging → production pipeline.
---

# new-app — the one-shot foundation builder

> Before running, read the **Swift Struck way** — the global habits every build follows.
> The canonical copy ships in the base repo root as `SWIFT-STRUCK-WAY.md`, so it arrives
> with the clone in step 1 (read it there). A mirror may exist at
> `~/.claude/SWIFT-STRUCK-WAY.md` for pre-clone reading, but the skill needs nothing from
> the author's machine beyond this file — **the skill + the public base repo are enough**,
> so any teammate can reuse it.

Given an **app name** (and an optional platform — default Cloudflare), stand up a
complete new product on the Brimba base: multi-tenant auth, teams, roles, invites,
learning, help, CSV import, the AI agent, and the MCP surface — all working on the
new account under the new name, backed up to GitHub, verified end to end, and ready
to brand. The owner is low-code: keep talk short and plain, summarize, don't dump logs.

The cloned repo carries its own canon — read its `CLAUDE.md`, `BASE-MANUAL.md` (§5
fork, §6 scaling), and `BOOTSTRAP.md` as you go. This skill is the checklist; those
docs are the law.

**Platform note — recommend Cloudflare; the top-10 are mapped.** The base's seven-worker
shape, per-team D1 databases, Durable Object live layer, and R2 media are
Cloudflare-native, and this skill stands them up **turnkey** — so **recommend
Cloudflare**. If the owner names a different platform (AWS, GCP, Azure, Vercel, Supabase,
Fly.io, Render, DigitalOcean, Netlify…), don't refuse and don't pretend it's a flag:
point them at the cloned repo's **`PLATFORMS.md`**, which maps the base's five seams
(per-team data · the live layer · compute · storage · static web) onto each provider's
primitives with an honest effort rating and per-provider notes. A non-Cloudflare stand-up
is a **documented port** (reimplement ~4 seam files — mostly the data door and the live
seam — the app runs unchanged), and a *turnkey* experience there means building a
`new-app`-equivalent skill for that platform (a project in its own right). So: for
Cloudflare, run this skill; for anything else, walk `PLATFORMS.md` + BOOTSTRAP.md (the
Cloudflare runbook to mirror), and decide the tenancy model first (database-per-team vs.
Postgres + RLS).

## What only the owner can do (ask up front, once)
1. **A Cloudflare account for this product** (one account per product is the
   convention), on the **Workers Paid plan** (Durable Objects need it), with
   `npx wrangler login` completed against it.
2. **A scoped D1 API token** (`CF_D1_TOKEN`: Cloudflare dashboard → API tokens → D1
   Edit) — powers the per-team database door.
3. **A Resend API key** (login + notification emails; staging works without it by
   echoing codes, production refuses email login until it's set).
4. *(Optional)* an **Anthropic API key** — makes the agent's brain Claude instead of
   the keyless Workers AI fallback.
5. **GitHub**: if the `gh` CLI is authed you create the repo yourself; otherwise the
   owner creates an empty repo and pastes the link (their one GitHub step).

Collect what's available, note what's missing, and say which steps will wait on it.

## 0 · Preflight (idempotent — look before you leap)
- Does the target folder already exist? If it's already a fork in progress, resume —
  detect which steps below are done (repo cloned? names swept? core DB created?
  workers deployed?) and only do the gaps. Never double-create.
- `npx wrangler whoami` — confirm you're on the NEW product's account, not another
  product's. Wrong account = wrong blast radius; stop and ask.
- Node 20+, npm, `gh auth status`.

Tell the owner in 1–2 lines what exists and what you'll create.

## 1 · Clone the base
```
git clone https://github.com/alaap-swift-struck/brimba <name>
cd <name>
git checkout main
npm install
npm run check
```
`npm run check` green on the clean clone proves the base is intact before you rename
or touch any cloud resource. Re-point git: remove the brimba `origin` (the new repo
is added in step 4).

## 2 · The fork sweep (rename brimba- → <name>- everywhere)
Per BASE-MANUAL §5: rename the identity, never the plumbing. The real spots in the
repo today — sweep them all, then verify:

- **`workers/*/wrangler.jsonc` (all seven: auth, tenancy, realtime, gateway, content,
  data-ops, mcp):** the worker `name` (top-level = production AND `env.staging`),
  every service-binding `service:` name, the `database_name`s (`brimba-core`,
  `brimba-core-staging`), every R2 `bucket_name`, plus the identity vars —
  `APP_ORIGIN` + `EMAIL_FROM` (auth), `PUBLIC_APP_URL` (tenancy). Leave the
  checked-in `database_id` and `CF_ACCOUNT_ID` values alone for now — step 3
  overwrites them with the new account's real values.
- **Package names:** root `package.json` (name, description, and every
  `--workspace=brimba-*` reference in its scripts) + the workspace names in
  `web/package.json` and all seven `workers/*/package.json`.
- **`shared/brand.ts`:** the app `name`, `description`, `motto` (colours and logo
  come later — step 6).
- **Scripts:** `scripts/reset-all.mjs` (the `GLOBAL_DB` names) and
  `scripts/smoke-staging.mjs` (the default `BASE` URL, the `brimba_session` cookie
  check, the `brimba_mcp_` token-prefix check, the `brimba-mcp` server-name check).
- **Source constants:** `workers/auth/src/lib/sessions.ts` (`SESSION_COOKIE`),
  `workers/mcp/src/lib/tokens.ts` (the token prefix), `workers/mcp/src/index.ts`
  (the MCP `serverInfo.name`). Optional/cosmetic: the `brimba:` localStorage
  prefixes in `web/lib/use-form-draft.ts`, `web/lib/agent-trace.ts`,
  `web/lib/use-agent-chat.tsx`.
- **`OPERATIONS.md`:** rewrite the staging/production URLs, the worker-names table,
  the reset database names, and the `github_remote` — the ship and reset skills read
  this file.
- **Host URLs in the docs (easy to miss — the `brimba-` rename skips them).** The base's
  live hosts appear hardcoded as **`brimba.swift-struck.workers.dev`** (production, no
  hyphen) and **`brimba-staging.swift-struck.workers.dev`** (staging) in `MCP.md`,
  `mcp-quickstart.md`, `BOOTSTRAP.md`, `PLATFORMS.md`, and `README.md`. These are **live
  references, not history** — replace the `brimba`/`brimba-staging` host part with the new
  app's hosts everywhere (a `brimba-` prefix rename alone MISSES `brimba.` with a dot).
  The verify grep below must come back clean of `swift-struck.workers.dev` hosts that
  still say `brimba`.

Verify: `grep -ri brimba . --exclude-dir=node_modules --exclude-dir=.git` — code,
configs, and scripts must be clean. Prose mentions of "Brimba" *describing the base's
history* may stay, but **functional references must not** — in particular any
`brimba*.swift-struck.workers.dev` **host URL** is a live pointer, not history, so it
must be swept (grep specifically for `swift-struck.workers.dev` and confirm none still
say `brimba`). Then `npm run check` again — green before any deploy.

## 3 · Stand it up on Cloudflare (BOOTSTRAP.md, command-by-command)
Follow the cloned repo's `BOOTSTRAP.md` — it is the runbook; this is the order:

1. **Core databases** (both envs): `npx wrangler d1 create <name>-core-staging` and
   `npx wrangler d1 create <name>-core`. Paste each returned `database_id` into the
   `d1_databases` block of **all SIX core-bound workers** — auth, tenancy, content,
   data-ops, realtime, **and mcp** (mcp binds the core DB for `mcp_tokens` — the easy
   one to miss; leaving its stale checked-in id is how a fork on a shared account
   silently binds mcp to the ORIGINAL base's core DB — a cross-tenant leak). Top-level
   = production, `env.staging` = staging. Set `CF_ACCOUNT_ID` to the new account's id in
   tenancy + content + data-ops (both vars blocks). A stale id or account silently
   breaks every per-team write.
2. **Core migrations** (currently `0001`–`0013`, additive, applied in order): from
   `workers/auth`, `npx wrangler d1 migrations apply <name>-core-staging --env
   staging --remote` and again without `--env` for production. Per-team databases
   are NOT created here — each team's DB is created at runtime when the team is.
3. **R2 buckets** (six): `<name>-media`, `<name>-learning-media`,
   `<name>-help-media`, each plus its `-staging` twin
   (`npx wrangler r2 bucket create <bucket>`).
4. **Secrets** (per env: `npx wrangler secret put <NAME>` in the worker's folder,
   plus `--env staging`; mirror into git-ignored `.dev.vars`, never print values):
   - `RESEND_API_KEY` → auth
   - `CF_D1_TOKEN` → tenancy, content, data-ops
   - `ADMIN_KEY` (generate a strong one) → tenancy, data-ops
   - `INTERNAL_KEY` (generate one; the SAME value on all five) → auth, tenancy,
     content, gateway, mcp
   - `ANTHROPIC_API_KEY` (optional) → data-ops
5. **Deploy, realtime-first:** `npm run deploy:staging` — builds the web export and
   deploys all SEVEN workers in the locked order realtime → auth → tenancy →
   content → data-ops → mcp → gateway, then runs the smoke automatically.
   **COLD-START — expect this on a fresh account:** realtime binds auth and auth binds
   realtime, so the FIRST deploy dies with `code 10143` (neither exists yet). Break the
   cycle once: temporarily remove the AUTH service binding from
   `workers/realtime/wrangler.jsonc`, run the deploy, then restore it and redeploy
   realtime. Do it on staging AND production (OPERATIONS.md → Deploy order).
6. **Seed the import catalog:** `curl -X POST
   https://<staging-url>/api/data-ops/admin/seed-targets -H "x-admin-key: <ADMIN_KEY>"`.
7. **First team:** open the staging URL, sign in with an email code (echoed in the
   response until Resend is set), complete onboarding — this creates the first team
   and its own database.

Production is **owner-gated**: everything above is repeated for production names by
`npm run deploy:production` + the production catalog seed, only after staging is
verified and the owner says go.

## 4 · GitHub backup
`gh repo create <owner>/<name> --private --source . --push` if `gh` is authed;
otherwise ask the owner to create an empty repo and paste the link, then
`git remote add origin <link> && git push -u origin main`. Build output stays
git-ignored; secrets never reach the repo.

## 5 · Verify everything (nothing ships on faith)
- `npm run check` — green (types across every workspace + the full test suite,
  including the rule and seam tests).
- The staging smoke — `npm run smoke:staging` (or `SMOKE_BASE=<staging-url>`), which
  must include its **MCP end-to-end stage**: token created (secret shown once), the
  `/mcp` door answers initialize + lists tools + whoami acts as the token owner,
  token revoked.
- The **three quality gates**: `lean_mean_check` (92 or better), `story_checks_out`,
  `security_sentry` (no critical/high). Adversarially verify your own findings.
- A **browser sanity pass** on staging: sign in, land in a team, see Home / Learning /
  Help / Settings, open the AI assistant and get a reply.

Report pass/fail per item; fix what fails before handover.

## 6 · Hand over — the "ready to brand" checklist
Tell the owner what exists (repo, staging URL, production plan) and that from now on
"ship to staging" / "ship to production" does the rest. Then name the exact branding
seams — all identity, no plumbing:

- **`shared/brand.ts`** — THE one place: name, description, motto, `logoUrl`, the
  accent colours (`accent` in oklch + the email-safe `accentHex` mirror), and the
  `screen` background tones. The app AND its emails re-skin from this file.
- **Icons** — drop the real logo into `web/public/icons/` (edit the SVGs or set
  `brand.logoUrl`), then `node scripts/gen-icons.mjs` regenerates the PNG set. The
  web manifest (`web/app/manifest.ts`) reads brand.ts automatically.
- **The library theme** — `web/app/globals.css` is a COPY of the `@swift-struck/ui`
  theme (master: swift-struck-ui repo); deeper theme changes belong in the library.
- **Email sender** — verify a domain in Resend and set `EMAIL_FROM` in
  `workers/auth/wrangler.jsonc` when real users need emails.
- **Next steps** — first product module via the repo's `BUILD-A-MODULE.md`; agent
  tools for it per BASE-MANUAL §5; production deploy when the owner gives the word.

**Tearing down a test.** If this run was a throwaway test, everything created carries the
`<name>-` prefix and is fully reversible — follow the cloned repo's **BOOTSTRAP.md §10
(Teardown)**: reset-all → delete the 14 worker deployments → the 2 core DBs → the 6 R2
buckets → the GitHub repo → the local clone. Safest of all: run the test on a throwaway
Cloudflare account, so cleanup is just deleting that account's resources.

## Mandate
- **Idempotent** — every step detects existing state and only fills gaps; safe to
  re-run after any interruption.
- **Lean** — the fork renames, it never restructures; stay inside the base's seams.
- **Verified** — green check + passing smoke + gates before calling it done.
- **Backed up** — code always reaches GitHub; secrets and build output never do.
