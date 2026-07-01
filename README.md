# Brimba

**The multi-tenant SaaS base by Swift Struck.** Not an app for one industry —
the reusable foundation every future app (ERP, CRM, portal…) is built on:
login (strict email codes), teams, Member roles (module key `member_roles`;
UPDATED 2026-06-21: was "roles & permissions"), invites, learning,
help desk, dropdown management, CSV data import, and an in-app **AI agent** that
acts AS the signed-in user through the same gated endpoints (never exceeding
their rights), all hosted on Cloudflare.

UPDATED 2026-06-23: the **agent-modules build** landed (branch `agent-modules`) —
learning, help, CSV import, and the AI agent are all BUILT. **Six workers are on
disk**: auth, tenancy, realtime, gateway, **content** (learning + help) and
**data-ops** (import + the AI agent). The external **mcp** worker (machine-facing
tool surface) is the one remaining piece — PLANNED, not yet built. The agent's
model is swappable: Claude when `ANTHROPIC_API_KEY` is set, else Cloudflare
Workers AI; it confirms on destructive/dangerous actions and is metered by a
credit quota (free 25/day + a purchasable balance).

UPDATED 2026-06-21: the team area (Overview, Members, Member roles, Invites)
now lives at `/t/<teamId>/…` deep-link URLs (rendered by the screen engine),
not under Settings; top-level `/members` and `/roles` are thin redirects there.

- **Production:** https://brimba.swift-struck.workers.dev
- **Staging:** https://brimba-staging.swift-struck.workers.dev

## The documents

**New here — developer or agent? Read in this order:** [CLAUDE.md](CLAUDE.md) (the
rules) → [BASE-MANUAL.md](BASE-MANUAL.md) (how the base works and *why*) →
[ARCHITECTURE.md](ARCHITECTURE.md) (the locked decisions) →
[BUILD-A-MODULE.md](BUILD-A-MODULE.md) (add a module end to end) →
[CONVENTIONS.md](CONVENTIONS.md) + [UI-CONVENTIONS.md](UI-CONVENTIONS.md) (how code
and screens are written) → the reference docs below as you need them →
[EDGE-CASES.md](EDGE-CASES.md) before touching anything subtle →
[OPERATIONS.md](OPERATIONS.md) to ship. With your own Cloudflare account, that path
takes you from zero to rebuilding and extending the base.

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
    six workers, the two-tier database, the permission spine, how a new module and
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

## Develop

```bash
npm install        # also pulls the UI library from GitHub
npm run dev        # http://localhost:3000
npx tsc --noEmit   # type-check (run before any commit)
```

Ship by saying **"ship to staging"** / **"ship to production"** — the skills
read OPERATIONS.md and handle GitHub + Cloudflare.
