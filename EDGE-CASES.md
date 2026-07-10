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

## 1 · The static-export SPA: ONE shell, all navigation soft (no reload in-app)

**The trap.** Brimba ships as a Next.js **static export** (`web/out`, served by
the gateway) with **no service worker**. In a static export the framework router
has no data file for an arbitrary deep path, so a `router.push` to one is a
**full-page reload** (session re-check, every screen refetches, the in-memory
cache is wiped). Reach for `router.push` to move between app screens and you tear
the whole SPA — a running agent included — down.

**Why it's a non-issue now.** The **entire post-auth app is ONE client-resolved
shell** — `deep-link-screen.tsx` mounts once and never unmounts, and it resolves
*every* app URL from `window.location`: the team tree `/t/**`, the sidebar pages
`/learning` + `/help`, AND the account screens `/home` + `/settings` +
`/invitations` (each renders `<DeepLinkScreen/>` and is dispatched to a screen
component — `ACCOUNT_MODULES` in `deep-link/route.ts`). So there is no cross-route
boundary left to cross *inside the app*. Only the **pre-auth** routes (`/login`,
`/onboarding`) sit outside the shell — entering or leaving the app is the one real
navigation, and a reload there is fine (one-time).

**The rule.** In-app navigation goes through the **History API**, never the
router. `go()` in `deep-link-screen.tsx` pushes state for any `isInAppPath` (the
whole `/t/*` tree + every `TOP_LEVEL_MODULES` entry — now `learning · help · home
· settings · invitations`) and swaps the screen from local `route` state; the
segment never changes, so nothing reloads. Deep components that can't reach `go()`
(the profile menu, team switcher, invite inbox) call **`softNavigate`** from
`web/lib/nav.ts` — the shell registers its `go()` there on mount (`registerHostGo`),
so those links are soft too. The shell subscribes to `popstate` so Back/Forward
re-read the URL and re-render in place.

**Consequences of the one-shell model:**
- **Team-switch from Settings no longer reloads.** `/settings` is in the shell now,
  so `switchTeam` + a soft `go('/t/<newTeam>')` stays in place.
- **Agent screen-tracing drives from ANYWHERE.** Because crossing into `/t` is now
  soft, the trace engine (`screen-trace.tsx`) always hands its target to the shell,
  which `go()`s there — the old "narrate off-host because a reload would kill the
  agent" branch is gone.
- **The one-shell is the machine-checked invariant.** No in-app link may use
  `router.push` (that was the reload); the account modules must each render a screen.

**version-watch heals the stale tab, it doesn't prevent reloads.** Because there
is no service worker, a long-lived tab holds the **old shell + its hashed
chunks** across a deploy. `web/components/version-watch.tsx` handles the two
failure modes: (1) a `ChunkLoadError` from a now-missing chunk → reload **once**
(a `sessionStorage` guard, `version_watch_reloaded`, stops a reload loop); (2)
on focus/return, fetch `/` and compare the `main-app-<hash>.js` fingerprint — if
it moved, offer a **gentle "reload" toast**, never a surprise reload mid-task.
Don't mistake this for cache-busting: it heals an *already-stale* tab; it does
not make cross-route navigation soft.

**The AI co-pilot must survive this reload — it's mounted at the ROOT, and its
open state persists.** The assistant panel is the one surface that spans *all*
screens, so it lives in a single root-mounted host (`web/components/agent-host.tsx`,
rendered once in `app/layout.tsx`), **not** inside any per-route `AppShell`. That
survives *soft* navigation. But crossing into `/t` from a top-level route is a
*hard reload* (above), which wipes all in-memory state — so the panel's open flag
is **mirrored to `sessionStorage`** (`web/lib/agent-open.ts`): on the post-reload
load the host reopens the panel and `useAgentChat` resumes the saved thread, so the
conversation survives even though the live stream was cut. Two consequences to
respect:
- **The screen-trace always soft-drives (one shell), never `router.push`es.** The
  engine (`web/lib/screen-trace.tsx`) hands its target to the shell, which `go()`s
  there via the History API from any screen — no reload. (Before the one-shell
  re-architecture, crossing into `/t` from a top-level route was a hard reload, so
  the trace had to narrate off-host instead; that's gone.) No in-app `router.push`
  is locked out by `web/test/agent-host.test.ts`.
- **The open state still mirrors to `sessionStorage`.** In-app nav no longer
  reloads, so the panel survives it just by being root-mounted. The
  `sessionStorage` mirror (`web/lib/agent-open.ts`) now only matters for a genuine
  page refresh (F5) or a `version-watch` chunk reload — it reopens the panel and
  `useAgentChat` resumes the saved thread.
- **The session cache is reactive.** `useActiveTeam` holds the session in a
  pub-sub'd module cache, so a component mounted *before* login (the root host)
  picks up the session the instant another instance logs in / creates a team —
  without it, the launcher only appeared after a manual reload.

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

## 5 · The confirm model: destructive-only (removals + deactivations) + bulk

**The trap.** It's tempting to make the agent "ask before every write," or to
confirm every privilege change. That's the wrong model here — it double-checks
the user on ordinary, reversible building. The confirm behaviour is narrow and
specific: **only destructive acts pause.**

**Why.** Since every write is **already gated** as the user (§4) and every write
is **reversible + audited**, the confirm panel isn't a permission check — it's
the app double-checking an act that *removes or overwrites at scale*, the same
way the manual UI reserves its red confirm for Remove / Revoke / Deactivate.
Over-confirming turns a helpful agent into a nagging one, so constructive work —
creating a role, inviting a member, setting permissions, renaming the team —
runs straight away. (This intentionally trades the earlier privilege-write
defense-in-depth for a smoother agent; the primary defense against a
prompt-injected write remains — untrusted content is fenced as DATA, and every
call is still gated AS the user + audited. Owner decision, 2026-07-10.)

**The rule** (`requiresConfirm` in `workers/data-ops/src/lib/tools.ts` — the one
place it's decided; a tool's `confirm` is a boolean, or a predicate for the
input-aware toggles):

| Behaviour | Tools | Why |
|---|---|---|
| **Pause for a yes/no panel** | the destructive acts — `remove_member`, `revoke_invite` — plus `set_role_active` / `set_learning_active` / `set_dropdown_active` **only when deactivating** (`active !== true`) | It removes/withdraws access, or switches an existing record OFF. Reversible, but destructive-feeling — the app double-checks, exactly as the red UI action does. |
| **Confirm-with-a-count** | `bulk_set_help_status`, `bulk_set_learning_active`, `run_import_batch` | High-blast: "Set 12 tickets to resolved" / a whole imported file is confirmed by the count before it runs. |
| **Run straight away** | every constructive write — `create_role`, `update_role`, `set_role_permissions`, `invite_member`, `set_member_role`, `update_team`, the (re)activations, and all single content edits | Ordinary re-gated + reversible + audited CRUD; the server gates each call, so no panel. |

The system prompt (`agent.ts`) tells the model **not** to also ask in
chat for a confirmed action — the app shows one yes/no panel, and a chat-level
"are you sure?" on top would double-check the user.

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

- **The `confirm` terminal event MUST carry the `threadId`.** A paused turn never
  reaches `final` (which is where the client otherwise learns the thread id), so
  the confirm frame is the *only* place a **first-turn confirm** — a brand-new
  conversation whose opening message proposes a dangerous act — hands the client
  the thread it must POST back to `/confirm`. Drop it and `resolve()` bails on
  `!threadId`: the Go-ahead / Not-now buttons silently no-op (the dead-button bug,
  fixed 2026-07-10). The client adopts `ev.threadId` in the `confirm` case of
  `use-agent-chat.tsx`. Locked by `workers/data-ops/test/stream.test.ts`
  ("a pause-for-confirm outcome → confirm (carrying the thread id …)").

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

- **Empty assistant turns are NOT painted (the "blank pills").** A multi-step
  turn saves one assistant message per model call, and a call that only ran tools
  carries no text. Those empty messages are kept server-side (the model replay
  needs them) but **dropped on render** — `toChatItems` in
  `web/lib/use-agent-chat.tsx` filters `role:"assistant"` with blank content, or
  they'd paint as empty grey bubbles between the step rows when a saved thread is
  reopened. The tool rows already show what happened.

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
| Make the agent confirm every write (or every privilege write) | Every write is already gated as the user + reversible | Destructive-only: `remove_member` / `revoke_invite` + deactivations pause; bulk confirms with a count; constructive writes run free |
| `await` the run before returning the stream | Kills streaming; isolate may drop | Return the readable, write async (`streamRun`) |
| Guard an invariant with a pre-write `COUNT` only | TOCTOU race | Re-check in the `UPDATE … WHERE`; count is just the friendly error |
| Assume hot reads route through sharding | They query `guard.databaseId` directly | Fine today; revisit any batched script if a module is split |
| Deploy auth-first / worker-before-migration | Binder-before-target 500s; missing table | realtime-FIRST; migrations to both DBs first |
