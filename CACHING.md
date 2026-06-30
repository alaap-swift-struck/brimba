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
module = one entry in `TEAM_RESOURCES` (app-shell.tsx). Two channels:

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

Computed values (count badges, "N members", relative times) **recompute
client-side** from the patched rows — never refetch a collection for a derived
number.

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

### 8 · Pings carry "what", never the content
The ping says only `{ resource, id, op }` — that a row of some resource changed,
never the row's CONTENT. (The id/op/timing ARE visible to anyone already on the
channel — which is exactly why the socket itself is gated at connect, rule 5.)
The re-pull then goes through the normal **permission-checked endpoint**, so a
cache can never hold data the viewer isn't allowed to see. (A viewer with no
rights simply gets nothing back.)

### 9 · Lifetime: in-memory per session
The cache lives in module memory, cleared on sign-out / team switch (different
keys). Cross-reload persistence of FETCHED data stays off on purpose — the live
channel keeps it correct while the tab is open. (Unsaved FORM INPUT is different:
it DOES persist to `sessionStorage` so a half-filled form survives navigation —
see §11.)

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
  private conversation, so the chat turn itself publishes NOTHING. The TEAM-VISIBLE
  EFFECTS of an action the agent takes still publish normally — because the agent
  acts AS the user through the SAME gated endpoints (rule 8), the executor it calls
  is the one that fires the row-level ping. So a private turn stays private, but
  the moment it changes a real row, that row's ping fans out like any other write.

## Checklist for a new screen / module
1. Read with `useCached("<resource>:<scopeId>", fetcher)`.
2. On every server write, `publishChange(env.REALTIME, teamId, "<resource>", id, op)`
   **with the affected row id** (classify the route `mutation` so the seam test passes).
3. Add ONE `TEAM_RESOURCES` entry (key / idField / fetchOne / fetchList / deps) — the
   generic handler does row-level patch + reconnect catch-up; no bespoke code.
4. After a client mutation, `primeCache` the fresh result.
5. Never cache cross-tenant; never trust the ping for data — always re-pull through the gated endpoint.

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

The deep-link team area (`/t/<teamId>/…`) is ONE static shell. Move WITHIN it with
the **History API** (`window.history.pushState` / `replaceState`) — Next observes
it, the route segment never changes, nothing reloads, the cache stays warm — then
re-render from URL state. NEVER use the framework router (`router.push`) for an
in-shell hop: in a static export it has no data file for an arbitrary `/t/<…>`
path and falls back to a full-page reload. The router is only for ENTERING /
LEAVING the shell (Home, Settings). (Bug found + fixed 2026-06-21.)
