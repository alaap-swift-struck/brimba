# Caching — the system-wide ruleset (LOCKED 2026-06-15; ROW-LEVEL live-sync added 2026-06-22; agent-modules resources added 2026-06-23)

How Brimba (and every app built on this base) caches data on the client. These
rules make caching **safe** because the live channel keeps it honest: you never
sit on stale data, and a cache can never hold something you're not allowed to
see. Follow them for every new screen and module.

The whole layer is tiny and dependency-free:
- [`web/lib/store.ts`](web/lib/store.ts) — the cache + `useCached` / `invalidate` /
  `primeCache`, plus `patchRow` (row-level: patch ONE row in a cached list) and
  `reconcile` (reconnect catch-up: diff-patch a whole list back in place).
- [`web/lib/realtime.ts`](web/lib/realtime.ts) — the live channel client. A browser
  opens **two** sockets: the active **team** channel and its **own user** channel.
- [`shared/workers/realtime.ts`](shared/workers/realtime.ts) — the publish side:
  `publishChange` (team channel), `publishUserChange` (one user's devices),
  `publishSignOut` (forced sign-out).

## The rules

### 1 · Cache-first reads (stale-while-revalidate)
Every list/record read shows the cached copy **instantly** and revalidates in
the background. First view = skeleton; every revisit = instant.

```tsx
const membersQ = useCached(`members:${teamId}`, () =>
  tenancy.members().then((r) => r.members)
)
// membersQ.data is the cached value (or undefined on a true first load)
```

### 2 · Key by SCOPE + resource (+ id)
Team data is keyed `resource:<teamId>` (or `resource:<rowId>`); identity data
(yours across devices) is keyed by the user — e.g. `account-activity`,
`invitations`. **Never** share a key across teams — switching teams uses
different keys, so one team's data can't leak into another's view.

```
members:<teamId>     member_roles:<teamId>   my-perms:<teamId>   invites:<teamId>
role-perms:<roleId>  invite-audit:<inviteId> activity:user:<userId>  account-activity
```

### 3 · ROW-LEVEL live updates — patch the changed row, never refetch the list
A write publishes a ping `{ resource, id, op }`; the client re-pulls **just that
one row** through the gated single-row endpoint and patches it into the cached
list in place (`patchRow`) — it does **not** refetch the whole collection. The
single-row read passes the **same server filter** as the list, so a row that no
longer belongs (deactivated member, etc.) comes back `null` and is dropped. One
mechanism covers add / edit / remove / soft-delete. A full-collection refetch
happens only on **first load** and **team switch**.

The client handler is **registry-driven**, not a per-resource `switch`: adding a
module = one entry in `TEAM_RESOURCES` (`web/lib/live-resources.ts` — moved out of
app-shell so the R15 `live-collections` check imports it as data). Two channels:

```ts
// worker, after a successful write — carry the affected row id:
await publishChange(env.REALTIME, guard.teamId, "member_roles", roleId, "edit")

// client registry (app-shell.tsx) — one line per module, generic handler:
member_roles: {
  key: (t) => `member_roles:${t}`,
  idField: "id",
  fetchOne: (id) => tenancy.role(id),         // gated single-row read
  fetchList: () => tenancy.roles()...,        // used by reconnect catch-up
  deps: (t, id) => [`my-perms:${t}`, `role-perms:${id}`], // small derived caches
}
```

Relative times, "N members" and other derived text **recompute client-side**
from the patched rows. But a **count BADGE is NOT one of these** (LAW R16): a
capped list's length is a ceiling, not a total, so every list door returns its
exact server `COUNT(*)` (`total`; help also `mineTotal`) and the client keeps it
in a `total:<prefix>:<teamId>` cache sidecar — primed by the list fetchers,
bumped ±1 by an `add`/`remove` ping, re-primed on reconnect — rendered through the
one `web/lib/format-count.ts` seam. Never `rows.length`.

**No deaf publishers, no deaf paged screens (LAW R15).** Every resource string a
worker publishes must reach a listener: a `TEAM_RESOURCES` row-level entry, a
coarse `SIMPLE_INVALIDATIONS` entry (team meta, screen recipes), or a reasoned
`DEAF_EXEMPT` line in the rules registry (today: `help_threads`, `agent_usage`).
The `selectable_data` manager was a deaf listener before R15 — its worker pinged
and nothing heard — so it now has a row-level entry. A server-PAGED screen's rows
live in page state outside these caches, so the shell fans every team ping (and a
reconnect) into a bus (`web/lib/live-bus.ts`) and each paged screen re-pulls its
current page via `useLiveRefetch`.

### 4 · Every mutation publishes (structurally can't-forget)
Every state-changing route broadcasts a change ping — it is **not** per-call
discipline. In the tenancy worker each route is classified `read` / `mutation` /
`housekeeping` in a declarative table (`ROUTES` in `index.ts`), and a guard test
(`publish-seam.test.ts`) turns the build **red** if a `mutation` doesn't publish
or a new route is left unclassified. The only writes that broadcast nothing are
the explicit housekeeping deny-list (a private session pointer, ops-only admin
actions) — matching login_codes / sessions / db_alerts / the nightly size cron.

### 5 · Identity scope — your changes follow YOU everywhere
Identity is read fresh from one global `users` row wherever it's shown, so a
name/photo edit fans out on **two** axes: `publishUserChange(userId, "profile")`
refreshes your own devices, and a `members` ping on **every team you belong to**
refreshes how others see your member row. Cross-team membership (joined / removed
/ new team) rides your **user** channel (`teams` event) so the switcher updates
without that team's socket. A forced sign-out is a `session` event on the user
channel (other devices re-check auth, dead ones bounce to login).

### 6 · Reconnect re-syncs (no missed changes after a drop)
After a dropped socket reconnects, the client doesn't trust that it saw every
ping: it **diff-patches** each on-screen list back in place (`reconcile` re-pulls
the list, updates changed rows, adds new ones, drops gone ones, keeping unchanged
rows' identity so only real changes re-render) and refreshes the small derived
caches. No page reload.

### 7 · Mutations prime the cache (instant for the actor)
After a write, drop the fresh result straight in, so the person who made the
change sees it with **zero refetch**; everyone else gets the ping (rules 3–6).

```ts
const { members } = await tenancy.setMemberRole(userId, roleId)
primeCache(`members:${teamId}`, members)   // instant for the actor
```

**A CREATE is different — it returns the ROW, never the collection (LAW R21).**
Handing the whole (capped) list back to add one row costs a read nobody asked
for, contradicts rule 3, and — the part that actually bites — leaves the caller
unable to learn the new record's id without a follow-up search. Every create door
answers `{ created, total }` (plus honest extras like `emailSent`), and the client
puts that one row in through the one `applyCreated` seam:

```ts
const { created, total } = await tenancy.createRole(title, description)
await applyCreated({
  listKey: `member_roles:${teamId}`,
  created,
  total,
  totalCacheKey: totalKey("member_roles", teamId),   // R16: the exact new total
})
```

`applyCreated` goes through `patchRow`, so the person who created the row sees
exactly what everyone else's "add" ping produces — including its position at the
head of the list. An unloaded list is correctly a no-op.

### 8 · Pings carry "what", never the content
The ping says only `{ resource, id, op }` — that a row of some resource changed,
never the row's CONTENT. (The id/op/timing ARE visible to anyone already on the
channel — which is exactly why the socket itself is gated at connect, rule 5.)
The re-pull then goes through the normal **permission-checked endpoint**, so a
cache can never hold data the viewer isn't allowed to see. (A viewer with no
rights simply gets nothing back.)

### 9 · Lifetime: in-memory per session, with a CEILING
The cache lives in module memory, cleared on sign-out / team switch (different
keys). Cross-reload persistence of FETCHED data stays off on purpose — the live
channel keeps it correct while the tab is open. (Unsaved FORM INPUT is different:
it DOES persist to `sessionStorage` so a half-filled form survives navigation —
see §11.)

**It is BOUNDED** (`MAX_ENTRIES` in `web/lib/store.ts`, 500 — "roughly 500
screens' worth of data"). Without a ceiling the cache only ever grows: every
record detail opened, every collection visited and every sidecar they prime is a
key of its own, and nothing removes a key except an explicit `invalidate`. A long
session would hold every screen it had ever shown. Three properties make the
ceiling safe:

- **"Used" means WRITTEN** — fetched, primed or patched — not read. Every read
  comes from a mounted component, whose key is already unevictable, so ordering by
  reads would buy nothing and would mean mutating the cache inside React's
  render-phase snapshot read. Recency of the last write says when the data arrived.
- **Anything on screen is never dropped.** An entry with a live subscriber is
  unevictable, and so is a paged list's `cursor:` sidecar while that list is
  mounted (Load more reads it imperatively, so it has no subscription of its own —
  drop it and page two silently vanishes). Nothing else is pinned by name: a hot
  team key (`my-perms:`, the active team) is held by a mounted screen for as long
  as it matters, so the subscriber rule already covers it — a hand-kept pin list
  would be a second policy that drifts.
- **The ceiling is SOFT.** If every older entry is pinned, the write still lands
  and the cache goes over. Blanking a screen someone is looking at is worse than
  briefly exceeding a budget.

Eviction is silent — no `notify`, so nothing refetches. Cache-first paint,
stale-while-revalidate, `patchRow`, `reconcile` and priming are unchanged.

### 10 · Edge / server
- Content-hashed assets (`/_next/static/**`) → cached **forever, immutable**
  (set in [`web/public/_headers`](web/public/_headers)).
- HTML → revalidated (`max-age=0, must-revalidate`).
- Per-user API responses → **private, never edge-cached**. The client cache
  (rules 1–9) handles them.

### 11 · Form drafts (unsaved input) — a LAW
The data cache above keeps FETCHED data warm; this keeps UNSAVED FORM INPUT from
being lost. A half-filled create/edit form whose screen unmounts because you
navigated elsewhere in the same tab would otherwise reset to empty on return — the
input lived only in component state. **Rule: every form dialog persists its draft.**

- Back the form's values with `useFormDraft(draftKey, initialValues, open)`
  ([`web/lib/use-form-draft.ts`](web/lib/use-form-draft.ts)) instead of plain
  `useState`. It restores a saved draft when the form opens and saves every change to
  `sessionStorage` (survives navigation AND reload within the tab; gone when the tab
  closes — "on-device per session").
- `draftKey` is a STABLE id the caller supplies: `"<module>:new:<teamId>"` for a
  create form, `"<module>:edit:<recordId>"` for an edit form. Omit it to disable.
- Lifetime: a draft is CLEARED on submit (the record now exists) and on an explicit
  dismiss (Esc / backdrop / close button); it is PRESERVED when the form simply
  unmounts from navigation — the case we protect. All drafts drop on sign-out
  (`clearAllFormDrafts`).
- Machine-enforced: every dialog in `FORM_DIALOGS` (`shared/rules/registry.ts`) must
  route its state through `useFormDraft` — checked by `web/test/rules.test.ts`.

## The agent-modules resources (BUILT 2026-06-23)

The agent + modules build adds these resources; each follows the rules above.

- **Learning, help, help_threads → ROW-LEVEL pings** (rule 3). Every CRUD write in
  the content worker publishes `publishChange(env.REALTIME, teamId, "<resource>",
  id, op)` carrying the affected row id, so open lists patch just that one row.
  (A reply both pings `help_threads` (add) and the parent `help` row (edit) so the
  ticket and its thread stay in sync.)
- **Import → ONE coarse list-ping per table.** A bulk write is the explicit
  exception to row-level: `confirm` writes every mapped row INSERT-ONLY, then
  publishes a SINGLE id-less ping on the **target table** (e.g. `member_roles` or
  `learning`) — one ping, not one per row — and the client refetches that one list
  (rule 6's reconcile). One list-ping per imported table.
- **agent_usage → a coarse list-ping** too: after an agent turn spends quota, the
  data-ops worker publishes an id-less `agent_usage` ping so the team's quota
  meter refreshes (no row content; just "the meter moved").
- **The agent chat / confirm endpoints are "housekeeping"** (rule 4): one person's
  private conversation, so the CONVERSATION (thread + messages) publishes NOTHING —
  the only broadcast a turn itself makes is the id-less `agent_usage` quota ping
  above. The TEAM-VISIBLE
  EFFECTS of an action the agent takes still publish normally — because the agent
  acts AS the user through the SAME gated endpoints (rule 8), the executor it calls
  is the one that fires the row-level ping. So a private turn stays private, but
  the moment it changes a real row, that row's ping fans out like any other write.

### 12 · Paged collections — the cache holds a PREFIX, not the list (R14)

A growing collection (support tickets, the team activity feed) doesn't load in one
go; its cache key holds the rows loaded **so far**, newest first, and a sidecar
`cursor:<listKey>` holds the opaque cursor for the next page (`null` = that was the
last page, `undefined` = nothing loaded yet).

- **`<LoadMore>` APPENDS** the next page to the cache — it never refetches what's
  already on screen. That is the whole difference between paging and a bigger cap.
- **Row-level live-sync is unchanged**: a ping patches the changed row inside the
  loaded prefix, exactly as before. Nothing about paging weakens rule 3.
- **A reconnect catch-up re-pulls page ONE** (`fetchList`), which is what a
  reconnect should do — you come back to the freshest rows, and can page again.
- **Tabs over a paged list must be SERVER scopes**, each with its own cache key
  (`help:<teamId>` / `help-mine:<teamId>`). Filtering a loaded page client-side
  would show "my tickets among the newest 50" beneath a badge counting all of
  them — the count is exact (R16), so the list must be too.
- **The cursor is opaque.** It travels cache → door → cache and is never built,
  parsed, or stored anywhere else. A malformed one is a clean 400, so a stale
  link fails loudly instead of quietly re-serving page one forever.

## Checklist for a new screen / module
1. Read with `useCached("<resource>:<scopeId>", fetcher)`.
2. On every server write, `publishChange(env.REALTIME, teamId, "<resource>", id, op)`
   **with the affected row id** (classify the route `mutation` so the seam test passes).
3. Add ONE `TEAM_RESOURCES` entry (key / idField / fetchOne / fetchList / deps) — the
   generic handler does row-level patch + reconnect catch-up; no bespoke code.
4. After a client mutation, `primeCache` the fresh result.
5. Never cache cross-tenant; never trust the ping for data — always re-pull through the gated endpoint.
6. If the collection GROWS with ordinary use, page it (rule 12): register it in
   `GROWING_COLLECTIONS`, prime the `cursor:` sidecar in its fetcher, and render
   `<LoadMore>`.

## Loading & feedback (the rule for "something's happening")

The user should never face a dead or silent UI. The locked sequence for every
screen and action:

1. **First load → skeleton.** Show a `Skeleton` shaped like the content (never a
   bare spinner for a whole screen). `useCached` returns `undefined` until the
   first fetch lands.
2. **Revisit → instant.** Cache-first means a revisit paints immediately and
   revalidates in the background (rules 1–9 above). No spinner on navigation.
3. **A write in flight → button spinner + disabled.** The button that triggered
   it shows a `Spinner` and disables (and the dialog blocks close) so it can't be
   double-fired. This also covers the rare case where a write serializes behind a
   Durable Object (see [CONCURRENCY.md](CONCURRENCY.md)) — the wait is visible,
   not mysterious.
4. **Optimistic for the actor.** After a successful write, `primeCache` the fresh
   result so the person who acted sees it with zero refetch; everyone else gets
   the live ping (rule 3).
5. **Always resolve.** Finish with a `toast` — success or a plain-English error
   (the technical detail goes to the logs, see [ERROR-HANDLING.md](ERROR-HANDLING.md)).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the live layer (the realtime worker +
the Durable Object model) that powers rule 3.

## Navigation never reloads (single-shell SPA)

In-app navigation must **swap the screen, never reload the document**. A full page
reload re-runs the session check, refetches every screen, AND wipes the in-memory
cache (rule 9) — defeating cache-first entirely and multiplying server calls (this
enforces "no spinner on navigation" from Loading rule 2 above).

The **whole post-auth app** is ONE static shell (`deep-link-screen.tsx` resolves
`/home`, `/settings`, `/invitations`, `/learning`, `/help`, and the `/t/**` tree
from the URL). Move between any of them with the **History API**
(`window.history.pushState` / `replaceState`) — Next observes it, the route
segment never changes, nothing reloads, the cache stays warm — then re-render from
URL state. Deep components use the `softNavigate` bus (`web/lib/nav.ts`), which
routes to the shell's `go()`. NEVER use the framework router (`router.push`) for an
in-app hop: in a static export it has no data file for an arbitrary deep path and
falls back to a full-page reload. The router is only for the **pre-auth** routes
(`/login`, `/onboarding`) — entering / leaving the app. (One-shell re-architecture
2026-07-10; the original /t-only shell landed 2026-06-21.)

---

## 13 · A mutation hands back ONE row (LAW R23)

Rule 3 says: patch the changed row, never refetch the collection. Every client
receiving a live ping did exactly that. The client that did the WORK did not —
its mutation shipped the whole capped list back, so it threw away everything it
was showing and took a fresh one.

Two update paths for one event, and the expensive one belonged to the person
actually waiting for their own save.

A mutation door now returns `{ updated, total? }` and the client folds it in
through **`applyUpdated`** (`web/lib/live-resources.ts`) — the same patch a ping
would make. `applyCreated` is its sibling for R21.

A **null** row is the answer, not a miss: it means the record left the list
(removed from the team, deactivated out of the active view), so the row is
dropped. That is why the id travels next to the row rather than being read off
it.
