# Edge cases + gotchas

The non-obvious traps in this base — the places where the obvious change is the
wrong one. Each entry is **the trap → why it exists → the rule to follow**, with
the file that proves it. Read this before you touch navigation, the client
cache, the per-team data door, the agent, or a deploy. If you find yourself
"simplifying" something below, stop: most of these are load-bearing.

The canon lives in [ARCHITECTURE.md](ARCHITECTURE.md), [CACHING.md](CACHING.md),
[CONCURRENCY.md](CONCURRENCY.md), and [RULES.md](RULES.md). This file is the
field guide to the sharp edges those decisions leave behind.

---

## 1 · The static-export SPA and the cross-route hard reload

**The trap.** Brimba ships as a Next.js **static export** (`web/out`, served by
the gateway) with **no service worker**. Inside the deep-link screen, moving
between two `/t/<teamId>/…` URLs feels like a normal route change — but if you
reach for the framework router (`router.push`) to do it, you get a **full-page
reload**: the session check re-runs, every screen refetches, and the in-memory
cache is wiped.

**Why.** In a static export the router has no data file for an arbitrary
`/t/<…>` path, so it falls back to a hard navigation. The whole `/t/*` tree is
**one static shell** — `deep-link-screen.tsx` mounts once and never unmounts —
so a "navigation" within it must not touch the router at all.

**The rule.** Intra-shell navigation goes through the **History API**, not the
router. `go()` in `web/components/deep-link-screen.tsx` decides
per-path:

```ts
const isInAppPath = (p: string) =>
  p.startsWith("/t") || TOP_LEVEL_MODULES.some((m) => p === `/${m}` || p.startsWith(`/${m}/`))

const go = (path, q) => {
  if (isInAppPath(path)) {
    window.history.pushState(null, "", url)   // Next observes it; segment never changes; nothing reloads
    setRoute(parseRoute(path, search))        // swap the screen from local `route` state
  } else {
    router.push(url)                          // leaving /t (Home/Settings) is a real route change
  }
}
```

The shell subscribes to `popstate` so Back/Forward re-read the URL
and re-render in place. **`/learning` and `/help`** are in `TOP_LEVEL_MODULES`,
so they're host-owned too.

**The consequence you'll actually hit: team-switch reloads from Settings.**
`switchTeam` in `web/lib/use-active-team.ts` just swaps the cached context and
re-renders (no reload) — cheap when you're already inside the shell. But
`/settings` is **not** an in-app path. Switch teams from Settings and the next
navigation into `/t/<newTeam>/…` crosses a static-route boundary, which is a
hard reload. This is expected; don't try to "fix" it by forcing the router
through `/t` — that's the very thing that reloads.

The same boundary is why agent **real-screen tracing** is dropped when it points
at a team the shell isn't currently showing: crossing into `/t`
from a static route would hard-reload, so the panel narrates the step instead of
yanking the page.

**version-watch heals the stale tab, it doesn't prevent reloads.** Because there
is no service worker, a long-lived tab holds the **old shell + its hashed
chunks** across a deploy. `web/components/version-watch.tsx` handles the two
failure modes: (1) a `ChunkLoadError` from a now-missing chunk → reload **once**
(a `sessionStorage` guard, `version_watch_reloaded`, stops a reload loop); (2)
on focus/return, fetch `/` and compare the `main-app-<hash>.js` fingerprint — if
it moved, offer a **gentle "reload" toast**, never a surprise reload mid-task.
Don't mistake this for cache-busting: it heals an *already-stale* tab; it does
not make cross-route navigation soft.

---

## 2 · The list cache doubles as the detail data source

**The trap.** A record-detail screen has no "get one record" fetch. It reads the
one record **out of the cached list**. So if you trim a column out of a list
`SELECT` to make the list "lean," you can silently blank a field on the detail
screen (or the agent's reading copy).

**Why.** The client cache is keyed by collection (`learning:<teamId>`,
`help:<teamId>`, members, …). A detail screen subscribes to that **same key**
and `.find()`s its row — so the first tap paints instantly from the warm list
cache, and a row-level live patch updates detail and list together. From
`web/components/learning-detail.tsx`:

```ts
const learningQ = useCached<Learning[]>(`learning:${teamId}`, () => content.learning(teamId))
const item = learningQ.data?.find((l) => l.id === learningId) ?? null
```

This is deliberate (CACHING.md): **derive detail from the list, never
double-fetch a collection for a derived value.**

**The rule.** The list `SELECT`s are intentionally **"fat"** — they carry every
field the detail screen renders, not just the columns the list *shows*. Look at
`listLearning` in `workers/content/src/lib/learning.ts`: it
selects `content_body` — the full article HTML the detail screen and the agent
read — even though the list card only shows a title + a short
`content_description`. **Don't blindly trim a list SELECT to reduce payload.**
Before removing a column, grep the matching `*-detail.tsx` for the field. If a
column is genuinely list-only bloat, fine — but the default assumption is that
every selected column is load-bearing for detail.

(The single-row endpoint that `patchRow` calls on a live ping is the *only* true
"get one" read, and it exists to patch one row into the cached list — not to
back a detail screen. See CACHING.md §3.)

---

## 3 · Every per-team query is an HTTP round-trip

**The trap.** Team databases are created at **runtime**, so a worker can't bind
them — it talks to them over Cloudflare's **D1 REST API** with a scoped token
(`CF_D1_TOKEN`). That means `d1Query(...)` is **a network hop**, not a local
call. Write a loop of ten `await d1Query(...)`s and you've written ten serial
HTTP requests.

**Why.** `shared/workers/d1-rest.ts` is the one door to per-team data (locked
rule: one door). Every `d1Query` / `d1ExecScript` posts to
`https://api.cloudflare.com/client/v4/accounts/<id>/d1/database/<dbId>/query`.
The core global DB is different — it's the native `env.DB` binding (local,
cheap); only per-team data pays the REST tax.

**The rules.**

- **Batch dependent writes into one multi-statement script.** `d1ExecScript`
  runs several statements in a single hop. `appendMessage` in
  `workers/data-ops/src/lib/threads.ts` inserts the message
  **and** updates the thread's `last_message_at` in **one** script:

  ```sql
  INSERT INTO agent_messages (...) VALUES (...);
  UPDATE agent_threads SET last_message_at = ... WHERE id = ...;
  ```

  The catch: the script API forbids bound params, so you inline values with
  `sqlString()` / `sqlValue()` (which coerce-then-escape — `''`-doubling — so a
  non-string body can't 500 the one SQL door).

- **`Promise.all` genuinely independent reads.** `d1QueryAcross` in
  `d1-rest.ts` fans a query across shard databases with
  `Promise.all(databaseIds.map(...))` — the template for parallelising reads
  that don't depend on each other.

- **Deny-before-read must still hold when you batch a gate.** Every route gates
  *before* it reads (`await requireRight(cfg, guard, "member_roles", "read")` in
  `workers/tenancy/src/routes/roles.ts`, before any `d1Query`). If you
  restructure a handler to run reads in parallel for speed, the permission gate
  must still resolve — and throw its `GuardError` — **before** any data query
  fires. Never `Promise.all([requireRight(...), d1Query(...)])`: that races the
  read against its own gate and can leak a row to someone who was about to be
  denied. Gate first; read second.

---

## 4 · The agent acts *as you* — the request host is a placeholder

**The trap.** The AI agent is not a privileged service. It executes each action
by calling the **same gated endpoint** the UI calls, **forwarding the caller's
session cookie**. Two consequences bite if you forget it: (a) the agent's rights
are exactly the signed-in user's — no more; (b) the URL host the agent's inner
requests carry is a **fake internal host**, not the public app origin.

**Why (a) — permissions are the spine.** `executeTool` in
`workers/data-ops/src/lib/tools.ts` fetches the real endpoint
over a service binding with `headers: { Cookie: request.headers.get("Cookie") }`
and `https://internal<path>`. The real door re-runs `requireRight` and
re-validates the body. There is **no separate agent role** — a tool can never
exceed what the user could do by hand. So: adding a new agent capability is not
"grant the agent access"; it's "add a tool that points at an *already-gated*
endpoint." Actions that aren't normal CRUD (controlling other device
**sessions**, **deleting** the team) are simply **absent from the catalog**
(`TOOL_CATALOG`) and structurally unreachable; the `identityBlocked` guard is
belt-and-braces.

**Why (b) — the `https://internal` host is fake.** Because the module workers
have no public route (`workers_dev:false`), the agent reaches them over service
bindings with a **placeholder host** (`https://internal…`). Any user-facing link
baked from `new URL(request.url)` on that path would point at the dead host.

**The rule.** **Outbound links in email must use `PUBLIC_APP_URL`, never the
request host.** `sendInvite` in `workers/tenancy/src/lib/invites.ts` (lines
200–213):

```ts
// PUBLIC_APP_URL MUST win — an agent-sent invite hits tenancy over a service
// binding with a placeholder host, so a link built from the request origin
// would bake in a dead "https://internal" URL.
const base = env.PUBLIC_APP_URL || new URL(request.url).origin
// ...
ctaUrl: `${base}/invitations`
```

The request-origin fallback is only for the human path (a real browser request
where the origin is the public gateway). Any new worker that emails a link must
prefer `PUBLIC_APP_URL`. It's a per-env **var** in `workers/tenancy/wrangler.jsonc`
(set on staging + production) — leave it unset and agent-sent emails point
nowhere.

---

## 5 · The confirm model: only two acts pause; bulk confirms with a count

**The trap.** It's tempting to make the agent "ask before every write." That's
the wrong model here and it double-checks the user. The confirm behaviour is
narrow and specific.

**Why.** Since every write is **already gated** as the user (§4), the confirm
panel isn't a permission check — it's the app double-checking an
*irreversible-feeling* act, the same way the manual UI does. Over-confirming
turns a helpful agent into a nagging one.

**The rules** (`requiresConfirm` in `workers/data-ops/src/lib/tools.ts`, lines
432–437, plus the `confirm:true` flags in `TOOL_CATALOG`):

| Behaviour | Tools | Why |
|---|---|---|
| **Pause for a yes/no panel** | every **privilege/identity write** — `create_role`, `update_role`, `set_role_active`, `set_role_permissions`, `set_member_role`, `invite_member`, `update_team` — plus the only-destructive `remove_member`, `revoke_invite` | Any change to who-can-do-what or team identity is double-checked. Defense-in-depth: even acting AS the user, an agent that mis-picks a tool or is prompt-injected must not silently rename a team or re-grant a role. |
| **Confirm-with-a-count** | `bulk_set_help_status`, `bulk_set_learning_active`, `run_import_batch` | High-blast: "Set 12 tickets to resolved" is confirmed by the count before it runs. |
| **Run straight away** | low-blast single content edits (`create_learning`, `update_learning`, help/dropdown writes) | Ordinary re-gated + reversible CRUD; the server gates each call, so no panel. |

The system prompt (`agent.ts`) tells the model **not** to also ask in
chat for the two panel actions — the app shows one yes/no panel, and a
chat-level "are you sure?" on top would double-check the user.

**What runs on confirm comes from the server, not the client.** When a turn
proposes a dangerous call, the **full proposal** (name + input) is stored
server-side as `status:"proposed"` on the assistant message
(`agent.ts`). `/confirm` executes the **server-recorded** proposal
(`confirmAndRun` → `getPendingProposal`), ignoring any `calls` the client sends
— so a client can't approve a call the model never proposed. After running, the
proposal is flipped `"proposed" → "done"` (`consumePendingProposal`) so a stray
re-POST can't replay a remove/revoke.

---

## 6 · SSE streaming: one terminal event, no early return, keep the isolate alive

**The trap.** The agent chat endpoint streams. If you `return` from the handler
before the stream drains, or emit two terminal events, or let a proxy buffer the
body, the client hangs or double-settles.

**Why.** A client that sends `Accept: text/event-stream` gets a live stream of
text deltas + `step_start`/`step_end` events; anything else gets the plain JSON
outcome (`wantsStream` in `workers/data-ops/src/routes/agent.ts`).
The stream is a `TransformStream` whose **readable side is returned immediately**
while an async IIFE writes to the writable side (`streamRun`).

**The rules.**

- **Return the readable, then write asynchronously — don't await the run first.**
  Returning the `Response` with an open body is what keeps the Worker isolate
  alive: Cloudflare keeps the isolate running as long as the response body
  stream is unclosed. The `void (async () => { … })()` in `streamRun` is
  deliberate — no `waitUntil`, no `await` before the `return`. Await the run and
  you've defeated streaming.

- **Exactly one terminal event.** The **route** owns the single terminal frame:
  a finished `ChatOutcome` becomes one `final` (or `confirm`) event via
  `terminalEvent`; a throw becomes one `error` event. The agent
  loop emits *progress* (`text`, `step_start`, `step_end`) but **never** the
  terminal — see the `Emit` contract note in `agent.ts`. Two terminal
  events double-settle the client.

- **Disable proxy buffering.** The response sets
  `Cache-Control: no-cache, no-transform` and **`X-Accel-Buffering: no`** (lines
  58–66). Without the latter, an intermediary buffers the whole body and the
  "live" deltas arrive all at once at the end. Keep both headers.

- **Every error is a friendly event, never a raw 500.** The `catch` in
  `streamRun` writes `{ t: "error", message }` and the loop's own `catch`
  turns a model hiccup into a saved, friendly turn. A raw 500 must never reach
  the stream.

- **Everything the assistant says goes out as `text` events.** Streamed deltas
  from the model, and one `say()` chunk for server notes (the quota message, the
  failure wrap-up, the pause note) — so the client renders the *accumulated*
  text and an early lead-in ("I can't create teams, but…") is never overwritten
  by a later note. `final` only settles the turn (thread/quota + a fallback
  reply for a turn that streamed nothing). If you add a new server note, route
  it through `say()` in `runPlanLoop`, don't just return it.

- **A failed step explains itself.** `step_end` carries `error` (the door's
  short reason — e.g. which permission the role is missing), the tool row is
  persisted with its outcome (`done`/`failed` + the reason in the summary), and
  the loop's failure path asks the MODEL for an unmetered wrap-up turn
  (`failureWrapUp`) instead of a canned note — the FAILED results are already in
  the convo, so the reply can say what was refused and why.

---

## 7 · The agent context window: bounded steps, windowed history, per-device resume

**The trap.** The full conversation is **not** replayed to the model. Assume it
is and you'll be surprised when the model "forgets" an old turn, or you'll blow
the token budget trying to feed it everything.

**Why + the rules** (`workers/data-ops/src/lib/agent.ts`):

- **`MAX_STEPS = 12`** caps the tool loop so a runaway plan can't spin
  forever; hitting it ends the turn with "I took several steps and paused here."
- **`MAX_HISTORY = 24`** windows what's *replayed* to the model:
  `history.slice(-MAX_HISTORY)`. The **full** thread stays in the DB
  (audit + panel rehydration); only the recent slice is sent as context. So
  cost/context is bounded, but "the model saw the whole thread" is false.
- Only **user + assistant text** is replayed across requests (`replayable`,
). Intermediate `tool_use`/`tool_result` pairs live **within a
  single loop** and are dropped from cross-request history — pairing them across
  turns breaks provider APIs.
- Tool results are handed back **fenced as DATA**, capped at 2000 chars
  (`fence`), never as instructions — a big list can't blow context,
  and data can't smuggle in a prompt.

**Resume is per-device and best-effort.** The panel remembers the last thread
per team in **`localStorage`** (`agent-panel.tsx`) so reopening
resumes that conversation instead of minting a fresh one. It's a nicety, not a
guarantee: another device won't see it, and a write failure is swallowed. Thread
ownership is enforced server-side regardless — `ownThreadOrThrow`
(`threads.ts`) 404s a thread that isn't the caller's.

---

## 8 · Credits are shared per **team**, not per user

**The trap.** The agent's daily allowance and credit balance are **team-wide**,
keyed by `team_id`. It's natural to assume "my 25 free requests" — but it's the
*team's* 25, shared across everyone on it, resetting daily.

**Why.** The quota lives over the **global core DB** so it works without opening
a team database. `agent_usage` is keyed by **`(team_id, period)`** where
`period` is `YYYY-MM-DD` (the daily free counter); `agent_credits` is keyed by
`team_id` (the purchasable balance). See `getQuota` / `consumeAiUnit` in
`workers/data-ops/src/lib/credits.ts` and DATA-MODEL.md.

**The rules / subtleties.**

- One model call costs **one unit** — metered before EACH call inside a turn,
  so a multi-step turn costs one unit per step (capped by `MAX_STEPS`); a
  declined confirm costs nothing; running dry mid-plan stops the turn with a
  saved, plain reply. Free allowance first (code default 25/day, per-env via
  `AGENT_FREE_DAILY` — staging runs 50), then a purchased credit.
- **The credit decrement is race-safe; the free counter is deliberately not.**
  The paid path is `UPDATE agent_credits SET balance = balance - 1 … WHERE
  team_id = ? AND balance > 0` — the `WHERE balance > 0` means it can never go
  negative (that's real money). The free counter is a best-effort
  `INSERT … ON CONFLICT DO UPDATE SET used = used + 1`; under heavy concurrency
  it may **overshoot by a hair**, which is fine — free units cost nothing.
- **Confirmed actions are metered up front.** `confirmAndRun` spends one unit
  **before any write** (`agent.ts`) so an out-of-credit team can't
  drive confirmed actions for free; the resumed loop skips re-metering that
  first step (`prepaid`).
- **Usage logging is never fatal.** `logUsage` (credits.ts)
  swallows every error — a missing table or write hiccup must not break the turn
  the user cares about.

---

## 9 · The last-admin race — the count is the friendly path, the WHERE is the lock

**The trap.** Guarding "a team must keep at least one admin" with a `SELECT
COUNT(*)` **before** the write is a classic time-of-check/time-of-use race: two
admins demoting/removing each other simultaneously can both pass the count and
zero out the team's admins.

**Why + the rule.** The count is kept as the fast, friendly rejection — but the
real guarantee is **inside the write statement**. `changeMemberRole` and
`removeMember` in `workers/tenancy/src/lib/members.ts` re-check the admin floor in the `UPDATE … WHERE`:

```sql
UPDATE team_members SET deactivated_at = ?
WHERE id = ? AND deactivated_at IS NULL
  AND ( ? IS NULL OR role_id != ?
        OR (SELECT COUNT(*) FROM team_members
            WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )
```

`if (!res.meta?.changes) throw new GuardError(409, "last_admin", …)`. **D1
serializes the write**, so the second racer's `WHERE` sees the post-first-write
state and matches zero rows — no Durable Object needed. This is the pattern
CONCURRENCY.md prescribes: *reach for a DO only when a single atomic SQL write
can't express the invariant.* Keep both layers when you copy this — the count for
the nice error, the `WHERE` for the actual safety. Unique indexes play the same
role for uniqueness invariants (one atomic write, DB-enforced); don't replace an
index or an atomic `WHERE` with an application-level check.

---

## 10 · Sharding exists but is **not** wired into the hot reads yet

**The trap.** `d1-rest.ts` and `workers/tenancy/src/lib/sharding.ts` contain a
full split/move machinery — `resolveModuleDatabases`, `queryModule`,
`d1QueryAcross`, `moveModuleToOwnDatabase`. It's easy to assume the hot read
paths already route through it. They don't.

**Why.** Sharding was built up front (a locked decision) as a relief valve:
**alarm** (nightly size check) → **mover** (relocate a module to its own DB) →
**split** (merged reads across shards). But today every module hot-read queries
`guard.databaseId` **directly** — `listLearning`, `listHelp`, `listMembers`,
`listRoles`, `listSelectable` all call `d1Query(cfg, guard.databaseId, …)`, not
`queryModule`. Grep confirms: no hot read path imports `queryModule` /
`resolveModuleDatabases` / `d1QueryAcross`.

**The rules.**

- **A static multi-statement batch (§3) is safe now** — a team's module lives in
  exactly one database, so inlined multi-statement scripts and single-DB queries
  are correct.
- **But revisit if a module is ever split.** Once `moveModuleToOwnDatabase` puts
  a module's tables in a second database, older rows live in the main DB and new
  writes go to the override DB (`resolveModuleDatabases` returns
  `[override, main]`). A **read** that must see both then has to go through
  `queryModule` / `d1QueryAcross` (merged read) — and a **cross-table
  multi-statement script** that assumes both tables are co-located will break.
  When you wire a module onto the split path, audit its batched scripts: any
  script touching two tables that could land in different shards must be
  reworked into merged reads + per-DB writes.

---

## 11 · Deploy is realtime-FIRST, migrations before workers

**The trap.** Deploying the workers in "logical" order (auth first, gateway
last) fails, and deploying a worker before its migration 500s at runtime.

**Why + the rules** (OPERATIONS.md, "Deploy order"):

- **Deploy order: `realtime → auth → tenancy → content → data-ops → gateway`.**
  Realtime is **first** because every other worker service-binds it (they
  publish change pings; the gateway routes its WebSocket). Deploying a binder
  before its target fails with **"Worker not found"** — this bit the very first
  production deploy when `brimba-realtime` didn't exist yet. `data-ops` binds
  `CONTENT` + `TENANCY`, so both precede it; the gateway is last because it
  routes to all of them. The root scripts already encode this order — use them.
- **Apply new migrations to BOTH databases before deploying the workers that
  need them.** Core migrations (e.g. `0008 importable_databases`, `0009
  agent_usage`, `0010 agent_credits`) go to `brimba-core` **and**
  `brimba-core-staging`; the team-schema migration (`0004_modules`) rolls to
  **every** team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key).
  Deploy the worker before the migration and its first query hits a missing
  table. Production is owner-gated: migrations first, then the realtime-first
  deploy.

---

## Quick reference — the "don't do that" list

| If you're about to… | Stop, because… | Instead |
|---|---|---|
| Use `router.push` to move within `/t/*` | Static export → hard reload, cache wiped | `go()` (History API) — `deep-link-screen.tsx` |
| Trim a column from a list `SELECT` | Detail reads the record out of the list cache | Grep the `*-detail.tsx` first; lists are intentionally fat |
| Loop `await d1Query(...)` N times | Each is an HTTP round-trip | Multi-statement `d1ExecScript`, or `Promise.all` independent reads |
| `Promise.all([requireRight, d1Query])` | Races the read against its own gate | Gate first, read second |
| Build an email link from `new URL(request.url)` | Agent's request host is `https://internal` | `env.PUBLIC_APP_URL` first |
| Make the agent confirm every write | Every write is already gated as the user | Only `remove_member` / `revoke_invite` pause; bulk confirms with a count |
| `await` the run before returning the stream | Kills streaming; isolate may drop | Return the readable, write async (`streamRun`) |
| Guard an invariant with a pre-write `COUNT` only | TOCTOU race | Re-check in the `UPDATE … WHERE`; count is just the friendly error |
| Assume hot reads route through sharding | They query `guard.databaseId` directly | Fine today; revisit any batched script if a module is split |
| Deploy auth-first / worker-before-migration | Binder-before-target 500s; missing table | realtime-FIRST; migrations to both DBs first |
