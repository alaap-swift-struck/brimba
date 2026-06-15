# Caching — the system-wide ruleset (LOCKED 2026-06-15)

How Brimba (and every app built on this base) caches data on the client. These
rules make caching **safe** because the live channel keeps it honest: you never
sit on stale data, and a cache can never hold something you're not allowed to
see. Follow them for every new screen and module.

The whole layer is tiny and dependency-free:
[`web/lib/store.ts`](web/lib/store.ts) (the cache + `useCached`/`invalidate`/`primeCache`),
[`web/lib/realtime.ts`](web/lib/realtime.ts) (the live channel client), and the
publish side in workers via [`shared/workers/realtime.ts`](shared/workers/realtime.ts).

## The seven rules

### 1 · Cache-first reads (stale-while-revalidate)
Every list/record read shows the cached copy **instantly** and revalidates in
the background. First view = skeleton; every revisit = instant.

```tsx
// members-panel.tsx
const membersQ = useCached(`members:${teamId}`, () =>
  tenancy.members().then((r) => r.members)
)
// membersQ.data is the cached value (or undefined on a true first load)
```

### 2 · Key by tenant + resource (+ id)
Keys are `resource:<teamId>` or `resource:<rowId>`. **Never** share a key across
teams — switching teams uses different keys, so one team's data can't leak into
another's view.

```
members:<teamId>          member_roles:<teamId>       my-perms:<teamId>
role-perms:<roleId>       (future) products:<teamId>   product:<productId>
```

### 3 · The live channel is the invalidator — not timers
A write publishes a "changed" ping; only the matching key refetches. **No
polling, no guessing TTLs.** Freshness comes from events.

```ts
// after a successful write, in the worker (tenancy/src/index.ts):
await publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId)

// the browser side, once per active team (app-shell.tsx):
useRealtime(teamId, (event) => {
  if (event.resource === "member_roles") {
    invalidate(`member_roles:${teamId}`)
    if (event.id) invalidate(`role-perms:${event.id}`)
  }
})
```

### 4 · Mutations prime the cache
After a write, drop the fresh result straight in, so the person who made the
change sees it with **zero refetch**; everyone else gets the ping (rule 3).

```ts
const { members } = await tenancy.setMemberRole(userId, roleId)
primeCache(`members:${teamId}`, members)   // instant for the actor
```

### 5 · Pings carry "what", never the data
The ping says only `{ resource, id? }`. The refetch goes through the normal
**permission-checked endpoint**, so a cache can never hold data the viewer isn't
allowed to see. (This is why a viewer with no rights simply gets nothing back.)

### 6 · Lifetime: in-memory per session
The cache lives in module memory, cleared on sign-out / team switch (different
keys). Cross-reload persistence (`sessionStorage`) is an **opt-in** we can add
later — the live channel keeps it correct while the tab is open.

### 7 · Edge / server
- Content-hashed assets (`/_next/static/**`) → cached **forever, immutable**
  (set in [`web/public/_headers`](web/public/_headers)).
- HTML → revalidated (`max-age=0, must-revalidate`).
- Per-user API responses → **private, never edge-cached**. The client cache
  (rules 1–6) handles them.

## Checklist for a new screen / module
1. Read with `useCached("<resource>:<scopeId>", fetcher)`.
2. On every server write, call `publishChange(env.REALTIME, teamId, "<resource>", id?)`.
3. In `AppShell`'s `useRealtime` handler, map that `resource` → `invalidate(...)`.
4. After a client mutation, `primeCache` the fresh result.
5. Never cache cross-tenant; never trust the ping for data — always refetch through the gated endpoint.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the live layer (the realtime worker +
the Durable Object model) that powers rule 3.
