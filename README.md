# Brimba

**The multi-tenant SaaS base by Swift Struck.** Not an app for one industry —
the reusable foundation every future app (ERP, CRM, portal…) is built on:
login (strict email codes), teams, Member roles (module key `member_roles`;
UPDATED 2026-06-21: was "roles & permissions"), invites, learning,
help desk, dropdown management, CSV data import, and an in-app **AI agent** that
acts AS the signed-in user through the same gated endpoints (never exceeding
their rights), all hosted on Cloudflare.

UPDATED 2026-06-23: the **agent-modules build** landed (branch `agent-modules`) —
learning, help, CSV import, and the AI agent are all BUILT. **Seven workers are on
disk**: auth, tenancy, realtime, gateway, **content** (learning + help),
**data-ops** (import + the AI agent), and **mcp** — the external machine surface
(BUILT 2026-07-07): personal access tokens (hashed, shown-once, team-pinned,
revocable; managed under Settings → Access tokens) bridged to short-lived
team-pinned sessions, exposing the gated doors as MCP tools at `/mcp`. The agent's
model is swappable: Claude when `ANTHROPIC_API_KEY` is set, else Cloudflare
Workers AI (both do full tool use); it confirms on destructive + bulk actions
and is metered by a credit quota (a free daily allowance — default 25, the
`AGENT_FREE_DAILY` var — + a purchasable balance).

UPDATED 2026-06-21: the team area (Overview, Members, Member roles, Invites)
now lives at `/t/<teamId>/…` deep-link URLs (rendered by the screen engine),
not under Settings; top-level `/members` and `/roles` are thin redirects there.

- **Production:** https://brimba.swift-struck.workers.dev
- **Staging:** https://brimba-staging.swift-struck.workers.dev

## The documents

**New here — developer or agent? Read in this order:** [CLAUDE.md](CLAUDE.md) (the
rules) → [BASE-MANUAL.md](BASE-MANUAL.md) (how the base works and *why* — incl. how to
**fork it for a new product** and **how each part scales**) →
[ARCHITECTURE.md](ARCHITECTURE.md) (the locked decisions) →
[BUILD-A-MODULE.md](BUILD-A-MODULE.md) (add a module end to end) →
[CONVENTIONS.md](CONVENTIONS.md) + [UI-CONVENTIONS.md](UI-CONVENTIONS.md) (how code
and screens are written) → the reference docs below as you need them →
[EDGE-CASES.md](EDGE-CASES.md) before touching anything subtle →
[OPERATIONS.md](OPERATIONS.md) to ship.

**Rebuilding the whole base from nothing?** Follow
**[BOOTSTRAP.md](BOOTSTRAP.md)** — the day-zero, command-by-command runbook that takes
a fresh Cloudflare account to a live staging + production Brimba. It is the concrete
answer to "with only these docs and the repo, could I recreate the base?" — yes: run
that list.

**The rulebook — what governs the base (read before you change it).** Every rule for
modifying, recreating, or building on Brimba lives in one of these, and each is
concrete + checkable:

- **The two prime directives** (stay lean; obey the Laws) — [CLAUDE.md](CLAUDE.md), the entry point.
- **The Laws of the Base** (R1–R9) — [RULES.md](RULES.md), *machine-checked*: pinned to `shared/rules/registry.ts` and enforced by tests that read the source off disk (`web/test/rules.test.ts`, the per-worker `publish-seam.test.ts`). Break one → the build goes red. Adding a Law requires the rule, the registry entry, and a check — all three.
- **Code house style** — [CONVENTIONS.md](CONVENTIONS.md): the handler shape, the two data doors, gating, boundary validation, deactivate-not-delete, the comment style.
- **UI conventions** — [UI-CONVENTIONS.md](UI-CONVENTIONS.md): library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the *action-button rows never clip* responsive rule, the voice.
- **Import + export rules** — [AGENTIC-IMPORT.md](AGENTIC-IMPORT.md): audit parity, export-needs-read/import-needs-create, one-confirm, insert-only, and every import place offers a sample file (test-enforced).
- **Error rules** — [ERROR-HANDLING.md](ERROR-HANDLING.md): never swallow; one client seam; every worker records to the central store.
- **The single vocabulary** — `shared/glossary.ts` (Law R6, machine-checked): one word per concept, used in all UI copy.

If a rule isn't machine-checked (e.g. a responsive-CSS convention), the doc says so and names where it's applied.

> **The completeness bar this doc set is held to:** a non-technical owner, an AI agent,
> or a new developer, armed with *only* the repository and these documents, can (1)
> understand exactly how the base works — BASE-MANUAL + ARCHITECTURE; (2) rebuild it
> from scratch — BOOTSTRAP + OPERATIONS; (3) edit it safely — CONVENTIONS + the Laws in
> CLAUDE/RULES; (4) reuse it as the foundation for a bigger product (an ERP, a portal)
> — BASE-MANUAL §5 + BUILD-A-MODULE; (5) read the ruleset — RULES + CLAUDE; (6) wire the
> base's core features into their app — BUILD-A-MODULE + the reference docs; and (7)
> scale every subsystem (teams, roles, permissions, invites, emails, realtime, the
> agent) — BASE-MANUAL §6. If you hit something the docs can't answer, that gap is a
> bug in the docs — file it.

0. **[CLAUDE.md](CLAUDE.md)** — read first if you're an agent (or a new
   developer): the **Laws of the Base** (machine-enforced rules), the build
   style, and this doc map. **[RULES.md](RULES.md)** is the law-book it enforces
   (pinned to `shared/rules/registry.ts`, checked by `web/test/rules.test.ts`).
1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — the locked decisions (incl. the
   workers, the live layer, and the Durable Object code-vs-runtime model). Read
   before building anything; do not relitigate without the user.
2. **[OPERATIONS.md](OPERATIONS.md)** — how it builds and ships.
3. **[CACHING.md](CACHING.md)** — the system-wide caching + loading/feedback
   ruleset (cache-first, row-level live-sync — patch the changed row, never
   refetch the list — examples). Follow it for every screen/module.
4. **[CONCURRENCY.md](CONCURRENCY.md)** — the race-safety ruleset (atomic writes,
   unique indexes, when a Durable Object is the lock). Follow it for any write
   that protects an invariant (counts, balances, uniqueness).
5. **[ERROR-HANDLING.md](ERROR-HANDLING.md)** — the error-capture ruleset (the
   one swappable logging seam, the error boundary, never-swallow).
6. **[ROADMAP.md](ROADMAP.md)** — what's built and what's next, with the
   type/endpoint contracts each phase plugs into.
7. **[SEARCH.md](SEARCH.md)** — the search + in-app-filter ruleset (the layered
   client-side → server `?q=` → per-team FTS5 model; recipe-declared).
8. **[DATA-MODEL.md](DATA-MODEL.md)** — every table (global core + per-team), what's
   built vs. to build, and the cross-cutting model resolutions.
9. **[SCREEN-ENGINE-PLAN.md](SCREEN-ENGINE-PLAN.md)** — the screen-recipe engine and
   the `/t/<teamId>/<module>/<id>` deep-link grammar the team area runs on.
10. **[UI-GAPS.md](UI-GAPS.md)** — the running list of library gaps to close (UI is
    fixed in the library, not per-app).
11. The UI comes ONLY from **[@swift-struck/ui](https://swift-struck-ui.pages.dev/documentation)**
    (installed from GitHub). Missing a component? Add it to the LIBRARY first —
    never build one-off UI here.

### The manual — build on it, understand it, rebuild it from zero

12. **[BASE-MANUAL.md](BASE-MANUAL.md)** — how the whole base works AND *why*: the
    seven workers, the two-tier database, the permission spine, how a new module and
    the base influence each other, and how to change foundational code + how a
    change ripples. Start here to understand the system.
13. **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)** — the golden-path checklist to add a
    team module end to end (table → permissions → worker → web → detail → tests),
    worked through a real module.
14. **[CONVENTIONS.md](CONVENTIONS.md)** — the code + comment house style (the
    handler shape, the data doors, gating, validation, deactivate-not-delete, the
    comment convention, how `npm run check` gates everything).
15. **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)** — how screens are built: the
    library-is-lego rule, recipe vs. bespoke, the enforced UI Laws, the
    action-icon mapping, and the voice.
16. **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)** — the realtime Durable Object
    (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs. plain
    atomic D1.
17. **[EDGE-CASES.md](EDGE-CASES.md)** — the non-obvious traps a maintainer must
    know (the static-export reload, the list-cache-as-detail-source, the REST-door
    round-trips, the confirm model, streaming, and more).
18. **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)** — the agent-driven, multi-table data
    import: dump old-system CSV exports, the agent normalizes + maps + orders
    interdependent tables + resolves foreign keys + rejects honestly, writing every
    row through the gated door (audit parity). How an app declares an import target
    + references. Read before building an import for a new module.
19. **[BOOTSTRAP.md](BOOTSTRAP.md)** — the day-zero, command-by-command runbook to
    rebuild the whole base from a fresh Cloudflare account (also linked at the top).
20. **[MCP.md](MCP.md)** — the machine door: how an outside developer/tool connects to
    the base over MCP (get a token → `Bearer` on `/mcp`), the tool catalogue, and the
    cost model (reads/exports/imports are free endpoint hits; only the assistant tools
    draw the team's AI quota — scope the role to control it).

## Develop

```bash
npm install        # also pulls the UI library from GitHub
npm run dev        # http://localhost:3000
npx tsc --noEmit   # type-check (run before any commit)
```

Ship by saying **"ship to staging"** / **"ship to production"** — the skills
read OPERATIONS.md and handle GitHub + Cloudflare.
