# Durable Objects — the live layer and the one lock (LOCKED 2026-06-15; ROW-LEVEL 2026-06-22)

Brimba uses exactly one Durable Object class today — `TeamChannel`, the live
"switchboard" inside the **realtime** worker. This doc explains what it is, how
its code is versioned and deployed, the end-to-end live-sync flow (a write →
`publishChange` → the DO → the client patches **one** row), and the separate
question of when a Durable Object is the right tool for a **contended write** (a
lock) versus when a plain D1 row is enough.

Two adjacent docs own the halves of the story this one connects:
[ARCHITECTURE.md](ARCHITECTURE.md) §2 (the code-vs-runtime model, locked) and
[CONCURRENCY.md](CONCURRENCY.md) (the race-safety ruleset). [CACHING.md](CACHING.md)
owns the client cache the live layer keeps honest. Read this before touching
`workers/realtime/**`, `shared/workers/realtime.ts`, or reaching for a DO in a
write path.

---

## 1 · Two different things called "Durable Object"

The confusion to retire first (ARCHITECTURE.md §2): **a worker count and a
Durable-Object count are different things**, and a DO *class* and a DO *instance*
are different again.

| Thing | What it is | How many | Grows with teams? |
|---|---|---|---|
| **Worker** | Deployed code (auth, tenancy, realtime, gateway, content, data-ops) | 6 built | No |
| **DO class** | A class *inside* a worker (`TeamChannel` in realtime) | 1 today | No |
| **DO instance** | A *runtime* entity addressed by name (`team:<id>`, `user:<id>`) | Unlimited | Yes — one per team **and** one per signed-in user |

An instance is **not** a worker. Addressing one by name conjures it; idle ones
hibernate and cost ~nothing. Exactly like OOP: one `class` (code), millions of
objects (runtime). 10,000 teams + their members is still 7 workers + one
`TeamChannel` class, but that many instances — almost all asleep.

This doc uses "the DO" for the runtime instance and "`TeamChannel`" for the class.

---

## 2 · What `TeamChannel` is and does

`TeamChannel` lives in `workers/realtime/src/index.ts`. It is a **pub/sub relay
and nothing else**:

- **One instance per channel.** A team's data channel is addressed `team:<id>`;
  a person's identity channel is addressed `user:<id>`. `env.CHANNELS.getByName(
  channel)` resolves the instance by name — creating it on first use.
- **It holds open WebSockets, not data.** The DO stores **no application data**;
  the databases (global core D1 + per-team D1) stay the single source of truth
  (`index.ts` header: *"Stores NO app data"*). It keeps a set of sockets and
  fans a message out to them.
- **It relays opaque tags.** It knows nothing about what "members" or
  "member_roles" mean — it just broadcasts whatever `{resource, id, op}` ping it
  is handed. That is why it is reusable as-is by any app built on this base.

The whole class is ~30 lines:

```ts
export class TeamChannel extends DurableObject<Env> {
  // A browser joins. Accept via the Hibernation API so the runtime keeps the
  // socket even after this object sleeps — we don't pay while idle.
  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  // Fan a tiny message out to everyone currently connected to this channel.
  broadcast(message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(message) } catch { /* dead socket — runtime drops it */ }
    }
  }

  // Clients only listen; inbound frames are ignored. These handlers keep the
  // object hibernation-eligible and tidy up on disconnect.
  async webSocketMessage(): Promise<void> {}
  async webSocketClose(ws: WebSocket): Promise<void> { try { ws.close() } catch {} }
  async webSocketError(): Promise<void> {}
}
```

### The Hibernation API (why idle channels are free)

`this.ctx.acceptWebSocket(server)` uses the **WebSocket Hibernation API**, not a
plain `server.accept()`. The difference is the whole cost model:

- The **runtime** owns the socket, not this isolate. An idle channel's DO is
  **evicted from memory** while its members' sockets stay open.
- A `broadcast` wakes the instance, calls `getWebSockets()`, sends, and lets it
  sleep again. `webSocketMessage` / `webSocketClose` / `webSocketError` are
  handlers the *runtime* calls on the hibernatable object — they exist so the
  DO never has to hold a live JS closure per socket just to receive events.

So 10,000 teams with quiet channels use ~no memory. That is the property that
makes "one instance per team **and** per user" affordable.

### The three entry points

`workers/realtime/src/index.ts`'s default `fetch` handler exposes:

| Route | Method | Who calls it | What it does |
|---|---|---|---|
| `/publish` | POST | Other workers, **service binding only** | `env.CHANNELS.getByName(channel).broadcast(JSON.stringify(event))` |
| `/api/realtime?team=<id>` / `?user=<id>` | GET (WebSocket upgrade) | A browser, via the gateway | Gate, then hand the request to the addressed `TeamChannel` |
| `/api/realtime/health` | GET | Ops | `{ ok: true }` |

`/publish` is internal: it is reached only over the service binding
(`env.REALTIME`), never the public gateway, so it needs no per-caller auth — a
worker only publishes after it has already gated and committed the write it is
describing.

### The connection gate — the same rule as the API

A socket is **gated at connect** exactly like an API request; a gate is an auth
check, not a lock. `fetch` in `index.ts`:

1. `whoAmI` asks the **auth** worker over its service binding (`env.AUTH`) who is
   opening the socket, forwarding the request's `Cookie`. No session → `401`.
2. `?user=<id>`: you may join **only your own** identity channel
   (`userId !== user.id` → `403`). Open for every signed-in user, even before
   they join a team.
3. `?team=<id>`: you must be an **active member of that team** —
   `isActiveMember(env.DB, user.id, teamId)` (`shared/workers/membership.ts`),
   the same `team_members` + `teams` join the API uses. Not a member → `403`.

Because the socket is gated at connect, a listener never receives a ping it
could not already have earned through the API. (CACHING.md rule 8, and
CONCURRENCY.md's "What is NOT a lock".)

### Two channel scopes

Defined in `shared/workers/realtime.ts` and consumed by `web/lib/realtime.ts`:

| Scope | Name | Members | Carries |
|---|---|---|---|
| **Team** | `team:<teamId>` | Every active member of that team | Team data pings (`members`, `member_roles`, `invites`, `learning`, `help`, `activity`, …) |
| **User** | `user:<userId>` | Every signed-in device of one person | Identity/cross-team events (`profile`, `account_activity`, `teams`) + a forced sign-out (`session`) |

A browser opens **two** sockets: the active team's channel
(`useRealtime(teamId, …)`) and its own user channel (`useUserRealtime(userId,
…)`). The user channel exists so identity changes (name/photo), cross-team
membership (joined / removed / new team), and a forced sign-out fan out across a
person's devices without depending on any one team's socket — and work even when
the user is teamless.

---

## 3 · The code-vs-runtime model — versioning, migrations, deploy order

`TeamChannel` is code; it is deployed and versioned like any worker. The runtime
instances are created on demand and never appear in config.

### The wrangler binding + migration

From `workers/realtime/wrangler.jsonc`:

```jsonc
"durable_objects": {
  "bindings": [{ "name": "CHANNELS", "class_name": "TeamChannel" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["TeamChannel"] }],
```

- **`bindings`** exposes the class to the worker as `env.CHANNELS`, a
  `DurableObjectNamespace<TeamChannel>`. Code addresses instances through it:
  `env.CHANNELS.getByName("team:…")`.
- **`migrations`** is the DO *class* lifecycle — not a D1 table migration. `v1`
  with `new_sqlite_classes: ["TeamChannel"]` registers the class on first
  deploy. `new_sqlite_classes` (rather than `new_classes`) gives each instance a
  SQLite-backed storage tier; `TeamChannel` never writes to it (it holds no
  data), but the base is registered SQLite-backed so a future stateful DO uses
  the same tier without a class rename. You only add another migration entry
  (`v2`, …) when you **rename**, **delete**, or **transfer** a DO class — not for
  ordinary code edits, which ship as a normal worker version.
- **Staging repeats everything.** Wrangler envs don't inherit, so the
  `env.staging` block repeats the DO binding, the migration, its own `DB`, and
  its own `AUTH` service. Top-level = production.

### Why realtime deploys FIRST

Deploy order is **realtime-first**, then auth → tenancy → content → data-ops →
gateway (OPERATIONS.md; the "base-completion" and "agent-modules" builds both
fixed regressions here). The reason is a dependency direction:

- Every other worker holds a **service binding to realtime** and calls
  `publishChange` after a write. If realtime is deployed *last*, there is a
  window where a freshly-deployed writer publishes to a channel contract the old
  realtime worker doesn't yet understand.
- A DO **class migration** (a rename/transfer) must be live before code that
  addresses the new class runs. Shipping realtime first means the channel layer
  is always at least as new as the workers that publish to it.
- Failure is **best-effort by design** (see §4) — a publish that lands on a
  not-yet-updated realtime can't corrupt a write — but deploying realtime first
  removes the window entirely rather than relying on the safety net.

The gateway deploys **last** because it is the only public door: nothing is
reachable by users until every worker behind it is already updated.

---

## 4 · The live-sync flow, end to end

The rule (a Law of the Base): **every mutation publishes a live change**, and the
client **patches exactly one row, cache-first, never refetching the list**. Here
is one real write — an admin changing a member's role — from commit to the other
admin's screen.

### Step 1 — the write commits (worker)

`changeMemberRole` in `workers/tenancy/src/lib/members.ts` does the gated,
race-safe D1 write (the atomic last-admin `UPDATE … WHERE … COUNT(*) > 1` — §5),
logs activity, then the route publishes:

```ts
// after the UPDATE succeeds, the route carries the affected row id:
await publishChange(env.REALTIME, guard.teamId, "members", targetUserId, "edit")
```

### Step 2 — `publishChange` → `/publish` (shared seam)

`shared/workers/realtime.ts` turns that into a channel post. The payload is
`{resource, id, op}` and **never row data**:

```ts
export async function publishChange(realtime, teamId, resource, id?, op?) {
  await publish(realtime, `team:${teamId}`, { resource, id, op })
}

async function publish(realtime, channel, event) {
  try {
    await realtime.fetch("https://realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, event }),
    })
  } catch (e) {
    console.error("realtime publish failed:", e)   // best-effort: never rethrow
  }
}
```

**Best-effort is load-bearing.** `publish` swallows its error. A live-layer
hiccup must never break the write it describes — the D1 write is already
committed and is the authority; a dropped ping only means someone's screen
revalidates a moment later (or on reconnect catch-up, §6). The realtime test
asserts this: `publishChange` *"never throws — a live-layer hiccup can't break
the write it describes"*.

Sibling helpers: `publishUserChange(userId, resource, id?, op?)` posts to
`user:<userId>`; `publishSignOut(userId)` posts a `{resource:"session",
op:"session"}` event with no id.

### Step 3 — the DO fans it out (realtime worker)

`/publish` resolves the instance by name and broadcasts:

```ts
await env.CHANNELS.getByName(channel).broadcast(JSON.stringify(event))
```

`broadcast` loops `this.ctx.getWebSockets()` and `ws.send`s the JSON to every
currently-connected socket on that one channel. The DO is single-threaded, so
this is a clean fan-out; a dead socket throws on `send` and is ignored (the
runtime drops it on close).

### Step 4 — the client patches ONE row (browser)

`web/lib/realtime.ts` receives the frame and calls the host's `onEvent`; the
registry-driven handler in `web/components/app-shell.tsx` decides what to do. It
is **not** a per-resource `switch` — every module is one entry in
`TEAM_RESOURCES`:

```ts
members: {
  key: (t) => `members:${t}`,
  idField: "userId",
  fetchOne: (id) => tenancy.member(id),               // gated single-row read
  fetchList: () => tenancy.members().then((r) => r.members), // reconnect catch-up
  deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
  refreshCtx: true,
}
```

The handler, given `{resource:"members", id, op:"edit"}`:

```ts
const r = TEAM_RESOURCES[event.resource]
if (!r) return
const id = event.id
void patchRow(r.key(teamId), r.idField, id, () => r.fetchOne(id))
for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)
```

`patchRow` re-pulls **just that one row** through the gated single-row endpoint
(`tenancy.member(id)`) and swaps it into the cached list in place. It does
**not** refetch the collection. Key properties:

- **`op` is advisory.** The client re-pulls and decides keep-or-drop, so `add`
  vs `edit` vs `remove` need not be exact (`ChangeEvent` docstring). The
  single-row read passes the **same server filter** as the list, so a row that
  no longer belongs (a deactivated member) comes back `null` and is dropped —
  one mechanism for add / edit / remove / soft-delete.
- **Never trust the ping for data.** The re-pull goes through the
  permission-checked endpoint, so a cache can never hold something the viewer
  isn't allowed to see (a viewer with no rights just gets nothing back).
- **Derived numbers recompute client-side** ("N members", badges) from the
  patched rows — never refetch a collection for a count.
- **A full-collection refetch happens only on first load and team switch.**

The identity channel is handled by a parallel `useUserRealtime` block: a
`session` event re-checks auth (`auth.me().catch(() => location.assign("/login"))`
— the acting device keeps its still-valid session, only truly-dead ones bounce);
`profile` / `teams` call `active.refresh()`; `account_activity` invalidates the
small own-account feed.

### The whole path

```
worker write (D1, committed)
  → publishChange(env.REALTIME, teamId, resource, id, op)   [best-effort]
    → POST https://realtime/publish { channel:"team:<id>", event:{resource,id,op} }
      → env.CHANNELS.getByName("team:<id>").broadcast(json)
        → ws.send to every open socket on that channel
          → client onEvent → patchRow(re-pull ONE row via gated endpoint) → swap in place
```

No row content ever leaves the database over this path. The ping says *what*
changed; the client earns the *content* through the same door it always uses.

---

## 5 · When a Durable Object is the right lock — and when it is NOT

`TeamChannel` is pub/sub; it is **not** in any write path and serializes nothing.
The *other* use of a DO — as a **lock** for contended, atomic writes — is a
separate decision governed by [CONCURRENCY.md](CONCURRENCY.md). Brimba's base
modules use **zero** DO locks today; here is the rule for when a future module
would need one.

A write that protects an **invariant** (a count, a balance, "keep ≥1 admin",
stock-on-hand, uniqueness) must be race-safe by **one** of three tools, in
order of preference:

### 1 · Atomic conditional SQL — the default

Re-check the invariant *inside* the write's `WHERE`, and treat "0 rows changed"
as "refused". D1/SQLite runs a single statement atomically and serializes writes
per database, so two concurrent statements can't both win — **no DO needed**.
This is the last-admin rule (`workers/tenancy/src/lib/members.ts`):

```ts
const res = await env.DB.prepare(
  `UPDATE team_members SET role_id = ?, updated_at = ?
   WHERE id = ? AND deactivated_at IS NULL
     AND ( ? = ? OR role_id != ?
           OR (SELECT COUNT(*) FROM team_members
               WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
).bind(/* … */).run()
if (!res.meta?.changes)
  throw new GuardError(409, "last_admin", "A team must keep at least one admin.")
```

The friendly `countRole(...) <= 1` pre-check above it is the fast path; the
`WHERE`-embedded `COUNT(*) > 1` is the **authority**. Two simultaneous demotions
can't both zero out the team's admins because D1 serializes the two `UPDATE`s and
the second one sees `changes === 0`. `removeMember` uses the identical backstop.

### 2 · A unique index — for uniqueness invariants

Let the database reject the duplicate; use a partial index when only some rows
are constrained. Example: at most one **pending** invite per (team, email) —
`db/core/0006_invite_pending_unique.sql`; `createInvite` catches the violation
and reports it kindly. No DO.

### 3 · A per-entity Durable Object — the rare hot counter

**Only** for a **hot, multi-step, contended** entity where many writers hammer
one thing (an inventory cell, a ledger account, a booking slot) and a serialized
read-modify-write genuinely matters. The DO handles its requests one at a time
(single-threaded); apply the **operation** inside it ("decrement by 2", not "set
to 7") and **persist before you ack**. Cross-entity transactions use a
coordinator + idempotency keys. This is reserved for genuine hot counters — most
writes never need it, and Brimba's base has none.

### The decision table

| Invariant shape | Tool | DO? |
|---|---|---|
| Single-statement count / floor ("keep ≥1 admin", stock ≥ 0) | Atomic conditional SQL (`WHERE … COUNT(*) …`, `changes === 0` = refused) | No |
| "No duplicates" | Unique / partial-unique index; catch the violation | No |
| Hot, multi-step counter under heavy concurrent load | Per-entity Durable Object (serialized read-modify-write) | **Yes** |
| Team name, member list, roles, a record's descriptive fields | Plain D1 write + a channel ping | No |

**Don't reach for a DO just because a write touches shared data.** Renaming a
team is a D1 write + a `publishChange(…, "team")` ping — it does not get its own
DO. DO instances scale by key independent of D1 sharding; the two are orthogonal.

---

## 6 · Gotchas

**Deploy realtime first.** Every writer holds a service binding to realtime and
publishes after committing; a DO class migration must be live before code that
addresses it. Realtime-first closes both windows. Gateway last (it's the public
door). (§3, OPERATIONS.md.)

**A publish never blocks a write.** `publish` swallows its error and callers
don't `await`-throw it. The committed D1 write is the authority; a lost ping is
recovered by revalidation or reconnect catch-up. Never make a write's success
depend on the live layer.

**Reconnect re-syncs — pings can be missed.** A backoff-reconnecting socket
(`web/lib/realtime.ts`: 1s, 2s, 4s … capped at 15s) can't prove it saw every
ping while it was down. `onReconnect` fires only on a **re**-connect (not the
first open) and the host `reconcile`s each on-screen list — diff-patching changed
rows in, new rows in order, gone rows out — plus refreshes the small derived
caches. No page reload. So the live layer is *eventually* correct even across a
drop; don't design as if every ping is guaranteed.

**The socket rides the same worker path as any request — SSE/streaming caveat.**
The WebSocket upgrade is a normal `fetch` through the gateway to the realtime
worker to the DO. A DO is single-threaded: a long-lived connection is fine
(that's what Hibernation is for), but any *streaming* response is bounded by the
isolate/request lifetime of the worker carrying it, not the DO's lifetime.
Long-lived PUSH (hours-open, server-initiated) belongs on the hibernatable
WebSocket path, never a held-open HTTP stream. The agent chat DOES stream —
turn-length SSE straight from `data-ops` (seconds, one request's lifetime, the
DO never involved; see EDGE-CASES §6) — which is fine precisely because it ends
with the turn; it is not a long-lived channel.

**`user:<id>` and `team:<id>` are both gated, neither is a lock.** Both scopes
are auth-checked at connect (your own id / active membership of that team) and
neither serializes anything. If you ever need to serialize a contended write,
that's a *different* DO instance chosen by CONCURRENCY.md rule 3 — never
`TeamChannel`.

**Idle is free, but a busy channel wakes the isolate.** Hibernation makes an
idle channel ~free; a burst of writes to one very hot team wakes its DO for each
`broadcast`. Pings are tiny (`{resource,id,op}`) and the client coalesces work
(one row re-pull), so this is cheap — but it is a real cost axis if a single
team fans out thousands of writes a second. That is a workload for the row-level
design (one ping, one row patched), which is exactly why the ping never carries
list-sized payloads.

**Bulk writes are the coarse exception.** (The full list of sanctioned coarse
pings — import per table + the `agent_usage` quota meter — is in CACHING.md.)
CSV import (`data-ops`) writes many
rows then publishes **one id-less** ping on the target table (`member_roles` /
`learning`); the client refetches that one list via reconnect-style `reconcile`
rather than patching N rows. An id-less ping means "refetch this collection", not
"patch a row" — see the `if (!event.id)` branch in the app-shell handler.

---

## 7 · Rebuilding this from scratch

To add the live layer to a new app on this base:

1. **The DO class** — a `TeamChannel` extending `DurableObject`, accepting
   sockets via `this.ctx.acceptWebSocket` (Hibernation) and a `broadcast` that
   loops `getWebSockets()`. Holds no data. (`workers/realtime/src/index.ts`.)
2. **The wrangler binding + migration** — `durable_objects.bindings`
   (`CHANNELS` → `TeamChannel`) and `migrations` (`new_sqlite_classes:
   ["TeamChannel"]`); repeat the block under `env.staging`.
3. **The gate** — `whoAmI` via the auth service binding, then `isActiveMember`
   for `team:` / own-id for `user:` before handing the request to the instance.
4. **The publish seam** — `shared/workers/realtime.ts`
   (`publishChange` / `publishUserChange` / `publishSignOut`), best-effort,
   posting `{resource, id, op}` to `/publish`.
5. **Classify every route** `read` / `mutation` / `housekeeping` in the worker's
   `ROUTES` table; the `publish-seam.test.ts` guard turns the build red if a
   `mutation` doesn't publish. (CACHING.md rule 4.)
6. **The client** — `web/lib/realtime.ts` (two sockets, backoff, reconnect) plus
   one `TEAM_RESOURCES` entry per module (`key` / `idField` / `fetchOne` /
   `fetchList` / `deps`); the generic handler does row-level `patchRow` +
   reconnect `reconcile`. No bespoke per-module code. (CACHING.md rule 3.)
7. **Deploy realtime first.**

For a contended write, do **not** touch any of the above — pick the lock from
CONCURRENCY.md (atomic SQL → unique index → per-entity DO, in that order).
