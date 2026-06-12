# Brimba

**The multi-tenant SaaS base by Swift Struck.** Not an app for one industry —
the reusable foundation every future app (ERP, CRM, portal…) is built on:
login (Google + email codes), teams, roles & permissions, invites, learning,
help desk, dropdown management, AI-powered data import/export — all
agent-callable via MCP, all hosted on Cloudflare.

- **Production:** https://brimba.swift-struck.workers.dev
- **Staging:** https://brimba-staging.swift-struck.workers.dev

## The three documents

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — the 20 locked decisions. Read
   before building anything; do not relitigate without the user.
2. **[OPERATIONS.md](OPERATIONS.md)** — how it builds and ships.
3. The UI comes ONLY from **[@swift-struck/ui](https://swift-struck-ui.pages.dev/documentation)**
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
