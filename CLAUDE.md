# CLAUDE.md — read this first

You are working on **Brimba**, the multi-tenant SaaS base by Swift Struck — the reusable Cloudflare-hosted foundation (auth, teams, member roles, invites, learning, help desk, dropdown management, CSV import, and an in-app AI agent) that every future app is built on. This file is the entry point for any agent working in this repo. It does not duplicate the docs — it tells you the **rules you must follow** and **where the canon lives**.

## The two prime directives

1. **Stay lean.** This codebase is deliberately small and well-layered. Add the least code that solves the problem; reuse the existing seams; don't introduce a dependency, a worker, a table, or an abstraction you don't need. "Too much code" is a defect here.
2. **Obey the Laws of the Base** (below). They are not suggestions — they are machine-checked. A change that breaks one turns the build red.

## The Laws of the Base (enforced, not aspirational)

The laws live in **[RULES.md](RULES.md)** (the human law-book) and are pinned to data in **`shared/rules/registry.ts`**. They are enforced by tests that read the source straight off disk — break a law and `npm run check` fails:

- **Every mutation publishes a live change.** Any non-GET route that changes state must call `publishChange` (cache-first + row-level live-sync — patch the changed row, never refetch the list). Enforced by `workers/*/test/publish-seam.test.ts` (tenancy, content, data-ops; auth's user-channel publishes and mcp's caller-private token rows are the reviewed exceptions — CACHING rule 5). See [CACHING.md](CACHING.md).
- **Every record detail exposes Overview + Activity tabs**, via the library `TabsView` + `ActivityFeed`. Enforced by `web/test/rules/ui.test.ts` (`record-detail-tabs`).
- **No hand-rolled tab strips / toggles** — collection tabs use the library `TabsView`. (`no-handrolled-toggles`)
- **Every form renders through the shared `FormShell`.** (`forms-use-formshell`)
- **One generic record-activity read path.** (`generic-activity-path`)
- **The glossary is the single source of product terms** — `shared/glossary.ts`, one clear, brief definition each. Use those words in UI copy; never invent a synonym. (`glossary-wellformed`)
- **The agent knows what the app can do** — its system prompt carries a capability brief GENERATED from the import/export catalog + the glossary, so the UI and the agent can never disagree about a capability. (`agent-app-parity`, `workers/data-ops/test/agent-parity.test.ts`)
- **Input is validated at the boundary.** Never trust request bodies. Use `shared/workers/validate.ts` (`requireText` / `optionalText`: type-check, strip NUL bytes, cap length, throw the `GuardError` the workers map to a clean 400). Bad input is a 400, never a 500. Locked by `workers/content/test/validate.test.ts`.
- **Shipping the code ships the capability (R13)** — every module is an import TargetDef or a reviewed exemption, and the catalogue self-heals against the code on read (a fresh environment's picker is never empty; an owner's OFF stays off). (`catalog-coverage`)
- **No unbounded list endpoint, and no capped GROWING one (R14)** — every `list*`/`search*` read carries a hard cap from `shared/workers/limits.ts`, said in a comment; a collection that GROWS with use (`GROWING_COLLECTIONS`) must PAGE by key instead — opaque cursor + exact total + `hasMore` through `pagedJson`, with a client that can reach page two. (`bounded-lists`)
- **Every published resource reaches a listener (R15)** — the live registry (`web/lib/live-resources.ts`) or a reasoned `DEAF_EXEMPT` entry whose named cache keys are machine-checked; paged screens stay live by reading the SAME cache keys the shell patches, not by subscribing. (`live-collections`)
- **Every collection shows its count exactly once (R16)** — an exact server COUNT(*) through the one `formatCount` seam; tab badge wins, `CollectionHeading` stands down via the arbitration context. (`counted-collections`)
- **State transitions are idempotent (R17)** — the current-status predicate rides the UPDATE; zero rows moved = no activity row, no ping. (`idempotent-transitions`)
- **A cross-module read carries the caller's rights (R18)** — the team activity feed subtracts denied modules; every `relatedTable` resolves through `ACTIVITY_GATE_MAP` or a pinned exemption. (`activity-gate-coverage`)
- **Agent/MCP filter parity (R19)** — a tool on a list door exposes + forwards every filter the door parses, derived from the door's own source. (`agent-filter-parity`)
- **Every navigable destination resolves in a FRESH TAB (R20)** — this is a static export, so a top-level `/<segment>` needs a page source, `/<segment>/<id>` needs the gateway's `MODULE_SHELLS`, and soft nav needs `TOP_LEVEL_MODULES`. THREE lists in three workspaces, all invisible from a click (the client router never leaves the page), all now DERIVED from the nav registries. (`static-destinations`)
- **A mutation door returns the AFFECTED ROW, never the collection (R23)** — R21 did this for creates and stopped; every edit/status/deactivate door still shipped the whole list, which is a full list read plus a COUNT to change one row AND contradicts CACHING rule 3 (every OTHER client patches one row; the one that did the work replaced everything). `{ updated, total? }` → `applyUpdated`; a NULL row means the record left the list, so drop it. Derived from the `edit`/`delete` gate. (`mutation-returns-row`)
- **A create door returns the CREATED RECORD, never the collection (R21)** — `{ created, total }`; the client patches that one row in through `applyCreated`. Shipping the list back to add one row contradicts CACHING rule 3 + the paging rule, and leaves the caller unable to learn the new id. Derived from the `create` gate. (`create-returns-row`)
- **Creating a MASTER record through a form OPENS it (R22)** — in the shared form seam (`FormShell`'s `opensRecord`), so a module declares one prop instead of every screen remembering. The navigation IS the close. Exceptions named per table. (`create-opens-record`)
- **Every state-changing route gates (R10).** Any non-GET route opens with a permission gate — `requireRight` (or the `gated`/`gatedBody` wrapper / `requireAnyImportRight` / `adminGuard`), except a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on `whoAmI`. The security counterpart to R1: enforced by a per-worker `gating-seam` suite (beside `publish-seam`) that reads handler source off disk — and the EXTERNAL machine surface (mcp) has its own suite asserting every non-GET route opens with token/user verification. No ungated door can ship, on either surface. (`gating-seam`)

A law cannot be added without its check (`registry-integrity`). When you add a rule, add it to RULES.md **and** the registry **and** a check — or the build fails.

## Before you build — the planning ritual

Answer these seven, in order, *before* you write code. It's the thinking that keeps a change in-rule and lean — the antidote to the failure mode that bit us (a change that looked fine but broke an unstated invariant, or rebuilt a seam that already existed).

1. **Say it in one glossary sentence.** What changes, in [the glossary's](shared/glossary.ts) words — never a synonym. No word for it yet? That's a glossary decision first (Law R6).
2. **Which Laws bite?** Walk R1–R26 — the full list with its checks is [RULES.md](RULES.md); this is the walk: it needs a word the glossary doesn't have → that's a glossary decision first (R6); it mutates → gate (R10) + publish (R1) + a reachable listener (R15); renders a form → FormShell (R4) + draft (R7); a collection → tabs (R2/R3/R8), a bounded read — or real keyset paging if it GROWS (R14) — and an exact, once-only count through the one seam (R16); a deactivate/reactivate or status move → the idempotent predicate + zero-row silence (R17); WRITES activity → its relatedTable resolves through the gate map (R18), and the record's whole life — created, edited, deactivated, reactivated — lands in the one activity table carrying who, what, when and which door (R25); READS record activity → the one generic `(table, id)` path, never a bespoke one (R5); a new module → an import TargetDef or a reasoned exemption (R13); a new SECTION → a page, a gateway shell and an in-app path (R20); a CREATE door → return the created row (R21) and, through a form, open it (R22); an EDIT/STATUS/DEACTIVATE door → return the affected row, never the collection (R23); any single-record write door → a bulk twin, or a written reason it cannot have one, and either way a declaration of whether its rows may run TOGETHER or must run IN ORDER (R24); touches the agent/MCP → capability parity (R9), every door filter exposed + forwarded (R19), and the confirm rule; calls an external service → a fetch timeout (R11); runs on a cron → record failures (R12); renames anything that carries the product name → it must still sweep in one command (R26). Name them now, not in review.
3. **Which seams do I reuse — not rebuild?** The data door (`shared/workers/d1-rest`), gating (`requireRight`), validation (`shared/workers/validate`), `publishChange`, `FormShell`, the recipe engine, the tool catalog. If you're writing what a seam already does, stop.
4. **What's the smallest shape?** A route on an existing worker (not a new worker); a column (not a table); a recipe (not a bespoke screen); a flag (not a code path). "Too much code is a defect."
5. **What could break?** Name the failure path *before* the happy path: tenant isolation, ≥1 admin, a unique pending invite, a never-negative balance, a concurrent write, a partial failure, a hung fetch. Validate at the boundary; make retryable writes idempotent.
6. **What test locks it?** The seam/rule test that catches the regression. A new invariant → write the test first (red), then make it green. A green test must never assert the *wrong* intent (that's how the agent-confirm gap hid).
7. **Gate before ship.** `npm run check` + the quality trio (lean/story/security), and — for anything security-shaped — a **fresh, no-prior-context review** (a clean clone, independent eyes). An incumbent review rationalises what's already there.

## Build style — how code here is written

- **Workers (7):** auth, tenancy, realtime, gateway (the only public door), content (learning + help), data-ops (import + AI agent), mcp (the external machine surface: personal access tokens → team-pinned sessions → MCP tools over the same gated doors; reached only through the gateway at `/mcp` + `/api/mcp/*`). Per-team D1 databases reached over the REST door (`CF_D1_TOKEN`); the global core DB via the native `env.DB` binding. Shared worker code lives in `shared/workers/` (gating, http, validate, …).
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
- **[SCALING.md](SCALING.md)** — the two axes (how much data, how many requests), the live platform limits, what breaks first, the four relief valves, retention, idempotency + the version guard, the rate ceilings, and the architectural plans that are deliberately NOT built.
- **[SECRETS.md](SECRETS.md)** — the encrypted vault: what could not be recovered if this laptop vanished, and the runbook that recovers it.

**The manual — to build on the base, or rebuild it from zero:**

- **[BOOTSTRAP.md](BOOTSTRAP.md)** — the day-zero, command-by-command runbook to stand the WHOLE base up on a fresh Cloudflare account (core DB + migrations → R2 buckets → secrets/vars → realtime-first deploy → seed → first team → verify). The concrete "rebuild from nothing" answer.
- **[BASE-MANUAL.md](BASE-MANUAL.md)** — how the base works AND *why*: the seven workers, the two-tier database, the permission spine, how a new module and the base influence each other, how to change foundational code + how a change ripples, **how to fork the base for a new product (§5)**, and **how each subsystem scales (§6)**. Read this to understand the whole.
- **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)** — the end-to-end golden-path checklist to add a team module (table → permissions → worker → web → detail → tests).
- **[CONVENTIONS.md](CONVENTIONS.md)** — the code + comment house style (handler shape, data doors, gating, validation, deactivate-not-delete).
- **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)** — how screens are built (library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the voice).
- **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)** — the realtime Durable Object (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs plain atomic D1.
- **[EDGE-CASES.md](EDGE-CASES.md)** — the non-obvious traps (static-export reload, list-cache-as-detail-source, REST-door round-trips, the confirm model, streaming, and more).
- **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)** — the agent-driven multi-table import (normalize → map → order interdependent tables → resolve foreign keys → reject honestly → write through the gated door). How to declare an import target + references for a new module.
- **[MCP.md](MCP.md)** — the external machine surface for developers: how an outside tool connects (token → `Bearer` on `/mcp`), the opt-in tool catalogue, the act-as-user/one-team/live-role security posture, and the cost model (reads/exports/imports = free endpoint hits; only `agent_chat`/`agent_confirm`/`plan_import` draw the team's AI quota — a role without the agent right spends zero AI).

## Working agreement

- **`npm run check` must stay green** (TypeScript across every workspace + the full test suite, including the rule + seam tests). Run it before you commit. It is the gate.
- **Ship gate** (before `/ship-staging`): `npm run check`, then the quality skills — `lean_mean` (≥ 92), `story_checks_out`, and `security_sentry` (no critical/high) — then deploy. Adversarially verify your own findings.
- **Deploy order is realtime-FIRST**, then auth → tenancy → content → data-ops → mcp → gateway. Production is owner-gated (apply new core + team migrations first). See OPERATIONS.md.
- **Commit messages** end with the Co-Authored-By line. Branch off `main`; don't commit straight to it.
- **Resetting data:** `node scripts/reset-all.mjs <staging|production|both>` (destructive; schema + migrations survive). Confirm production explicitly.

If a request conflicts with a Law of the Base or a locked decision in ARCHITECTURE.md, say so and propose the in-rule way — don't quietly break the rule.
