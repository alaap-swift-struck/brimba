# CLAUDE.md — read this first

You are working on **Brimba**, the multi-tenant SaaS base by Swift Struck — the reusable Cloudflare-hosted foundation (auth, teams, member roles, invites, learning, help desk, dropdown management, CSV import, and an in-app AI agent) that every future app is built on. This file is the entry point for any agent working in this repo. It does not duplicate the docs — it tells you the **rules you must follow** and **where the canon lives**.

## The two prime directives

1. **Stay lean.** This codebase is deliberately small and well-layered. Add the least code that solves the problem; reuse the existing seams; don't introduce a dependency, a worker, a table, or an abstraction you don't need. "Too much code" is a defect here.
2. **Obey the Laws of the Base** (below). They are not suggestions — they are machine-checked. A change that breaks one turns the build red.

## The Laws of the Base (enforced, not aspirational)

The laws live in **[RULES.md](RULES.md)** (the human law-book) and are pinned to data in **`shared/rules/registry.ts`**. They are enforced by tests that read the source straight off disk — break a law and `npm run check` fails:

- **Every mutation publishes a live change.** Any non-GET route that changes state must call `publishChange` (cache-first + row-level live-sync — patch the changed row, never refetch the list). Enforced by `workers/*/test/publish-seam.test.ts` (tenancy, content, data-ops; auth's user-channel publishes are the reviewed exception — CACHING rule 5). See [CACHING.md](CACHING.md).
- **Every record detail exposes Overview + Activity tabs**, via the library `TabsView` + `ActivityFeed`. Enforced by `web/test/rules.test.ts` (`record-detail-tabs`).
- **No hand-rolled tab strips / toggles** — collection tabs use the library `TabsView`. (`no-handrolled-toggles`)
- **Every form renders through the shared `FormShell`.** (`forms-use-formshell`)
- **One generic record-activity read path.** (`generic-activity-path`)
- **The glossary is the single source of product terms** — `shared/glossary.ts`, one clear, brief definition each. Use those words in UI copy; never invent a synonym. (`glossary-wellformed`)
- **The agent knows what the app can do** — its system prompt carries a capability brief GENERATED from the import/export catalog + the glossary, so the UI and the agent can never disagree about a capability. (`agent-app-parity`, `workers/data-ops/test/agent-parity.test.ts`)
- **Input is validated at the boundary.** Never trust request bodies. Use `shared/workers/validate.ts` (`requireText` / `optionalText`: type-check, strip NUL bytes, cap length, throw the `GuardError` the workers map to a clean 400). Bad input is a 400, never a 500. Locked by `workers/content/test/validate.test.ts`.

A law cannot be added without its check (`registry-integrity`). When you add a rule, add it to RULES.md **and** the registry **and** a check — or the build fails.

## Build style — how code here is written

- **Workers (6):** auth, tenancy, realtime, gateway (the only public door), content (learning + help), data-ops (import + AI agent). Per-team D1 databases reached over the REST door (`CF_D1_TOKEN`); the global core DB via the native `env.DB` binding. Shared worker code lives in `shared/workers/` (gating, http, validate, …).
- **Worker handler shape:** a declarative `ROUTES` table (each route tagged read / mutation / housekeeping) → gate with `requireRight` from `shared/workers/gating` → team-DB CRUD via `d1Query` / `d1ExecScript` + `sqlString` + `ulid` → `publishChange` → return. Throw `GuardError(status, code, msg)`; the central catch maps it to a response.
- **Deactivate, never delete** (data + audit survive). Keep an audit block (actor + timestamp) on every write.
- **Permissions are the spine.** The AI agent **acts AS the signed-in user through the same gated endpoints** and never exceeds their rights. There is no separate agent role.
- **The screen engine:** `/t/<teamId>/<module>/<id>` is one client-resolved shell (`web/components/deep-link-screen.tsx`); recipes in `web/lib/screens.ts`; nav in `web/lib/pages.ts`. Learning + Help also have clean top-level URLs (`/learning`, `/help`). Engine-expressible screens → a recipe; bespoke screens → a host-composed component (like `role-detail.tsx`).
- **The UI library is lego, not this repo.** Primitives/collections come from `@swift-struck/ui` (a separate repo). `web/` assembles recipes from them. **Do not edit the library from here** — if a primitive needs changing, surface it; don't fork it into the host.
- **Voice:** warm, plain, sentence case, no jargon, no emoji. Write for a 45–55-year-old manager. Use the glossary terms. See `shared/glossary.ts`.
- **Action buttons carry an icon** (lucide, ~`size-3.5`, before the label): edit = `Pencil`, switch off / deactivate = `Power`, remove = `UserMinus`, revoke = `Ban`, create = `Plus`, import = `Upload`. Destructive actions use the destructive (red) colour + a confirm. Keep the icon-for-action mapping consistent across the app; on narrow screens icon-only is acceptable.

## Where the canon lives — read before building

Start with **[README.md](README.md)** (the doc map), then:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the locked decisions (workers, the live layer, the Durable Object code-vs-runtime model). Do not relitigate without the user.
- **[OPERATIONS.md](OPERATIONS.md)** — how it builds, ships, and resets.
- **[CACHING.md](CACHING.md)** — cache-first + row-level live-sync (every screen follows it).
- **[CONCURRENCY.md](CONCURRENCY.md)** — race-safety (atomic writes, unique indexes, when a Durable Object is the lock).
- **[ERROR-HANDLING.md](ERROR-HANDLING.md)** — the one logging seam, the error boundary, never-swallow.
- **[DATA-MODEL.md](DATA-MODEL.md)** — every table (global core + per-team).
- **[SEARCH.md](SEARCH.md)** — the layered search / filter model.
- **[ROADMAP.md](ROADMAP.md)** — what's built and what's next, with the contracts each phase plugs into.

**The manual — to build on the base, or rebuild it from zero:**

- **[BOOTSTRAP.md](BOOTSTRAP.md)** — the day-zero, command-by-command runbook to stand the WHOLE base up on a fresh Cloudflare account (core DB + migrations → R2 buckets → secrets/vars → realtime-first deploy → seed → first team → verify). The concrete "rebuild from nothing" answer.
- **[BASE-MANUAL.md](BASE-MANUAL.md)** — how the base works AND *why*: the six workers, the two-tier database, the permission spine, how a new module and the base influence each other, how to change foundational code + how a change ripples, **how to fork the base for a new product (§5)**, and **how each subsystem scales (§6)**. Read this to understand the whole.
- **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)** — the end-to-end golden-path checklist to add a team module (table → permissions → worker → web → detail → tests).
- **[CONVENTIONS.md](CONVENTIONS.md)** — the code + comment house style (handler shape, data doors, gating, validation, deactivate-not-delete).
- **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)** — how screens are built (library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the voice).
- **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)** — the realtime Durable Object (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs plain atomic D1.
- **[EDGE-CASES.md](EDGE-CASES.md)** — the non-obvious traps (static-export reload, list-cache-as-detail-source, REST-door round-trips, the confirm model, streaming, and more).
- **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)** — the agent-driven multi-table import (normalize → map → order interdependent tables → resolve foreign keys → reject honestly → write through the gated door). How to declare an import target + references for a new module.

## Working agreement

- **`npm run check` must stay green** (TypeScript across every workspace + the full test suite, including the rule + seam tests). Run it before you commit. It is the gate.
- **Ship gate** (before `/ship-staging`): `npm run check`, then the quality skills — `lean_mean` (≥ 92), `story_checks_out`, and `security_sentry` (no critical/high) — then deploy. Adversarially verify your own findings.
- **Deploy order is realtime-FIRST**, then auth → tenancy → content → data-ops → gateway. Production is owner-gated (apply new core + team migrations first). See OPERATIONS.md.
- **Commit messages** end with the Co-Authored-By line. Branch off `main`; don't commit straight to it.
- **Resetting data:** `node scripts/reset-all.mjs <staging|production|both>` (destructive; schema + migrations survive). Confirm production explicitly.

If a request conflicts with a Law of the Base or a locked decision in ARCHITECTURE.md, say so and propose the in-rule way — don't quietly break the rule.
