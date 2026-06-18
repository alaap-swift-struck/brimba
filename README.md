# Brimba

**The multi-tenant SaaS base by Swift Struck.** Not an app for one industry —
the reusable foundation every future app (ERP, CRM, portal…) is built on:
login (strict email codes), teams, roles & permissions, invites, learning,
help desk, dropdown management, AI-powered data import/export — all
agent-callable via MCP, all hosted on Cloudflare.

- **Production:** https://brimba.swift-struck.workers.dev
- **Staging:** https://brimba-staging.swift-struck.workers.dev

## The documents

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — the locked decisions (incl. the
   workers, the live layer, and the Durable Object code-vs-runtime model). Read
   before building anything; do not relitigate without the user.
2. **[OPERATIONS.md](OPERATIONS.md)** — how it builds and ships.
3. **[CACHING.md](CACHING.md)** — the system-wide caching + loading/feedback
   ruleset (cache-first, live-channel invalidation, examples). Follow it for
   every screen/module.
4. **[CONCURRENCY.md](CONCURRENCY.md)** — the race-safety ruleset (atomic writes,
   unique indexes, when a Durable Object is the lock). Follow it for any write
   that protects an invariant (counts, balances, uniqueness).
5. **[ERROR-HANDLING.md](ERROR-HANDLING.md)** — the error-capture ruleset (the
   one swappable logging seam, the error boundary, never-swallow).
6. **[ROADMAP.md](ROADMAP.md)** — what's built and what's next, with the
   type/endpoint contracts each phase plugs into.
7. The UI comes ONLY from **[@swift-struck/ui](https://swift-struck-ui.pages.dev/documentation)**
   (installed from GitHub). Missing a component? Add it to the LIBRARY first —
   never build one-off UI here.

## Develop

```bash
npm install        # also pulls the UI library from GitHub
npm run dev        # http://localhost:3000
npx tsc --noEmit   # type-check (run before any commit)
```

Ship by saying **"ship to staging"** / **"ship to production"** — the skills
read OPERATIONS.md and handle GitHub + Cloudflare.
