# SCALING.md — the two axes, the ceilings, and what to do at each one

How much data we hold, and how many requests we take. Everything else is a
consequence of one of those two.

Measured 2026-08-11 by `scaling_review`. Platform limits in this document were
read from Cloudflare's own docs **on that date** — re-check them before acting on
any number here, because a remembered limit that has since moved is worse than no
number at all.

> **The yardstick.** Any single tenant may reach **250,000 people** using this as
> their daily tool, ~10% concurrent (25,000 live sessions), five years of
> history. **And the app hosts dozens of such tenants.** Anything shared across
> tenants carries the sum, not the average.
>
> That target is TWO-LEVEL and both halves must be answered separately. Sharding
> by tenant answers the second and gives the first nothing at all.

---

## 1 · The live platform limits (checked 2026-08-11)

| Limit | Value (Workers Paid) | What it binds |
|---|---|---|
| D1 database size | **10 GB** | one team's database — and the shared core database |
| D1 storage per account | **1 TB** | every team database added together |
| D1 databases per account | **50,000** | the number of teams the app can host |
| D1 statement duration | 30 s | a retention sweep or a migration batch |
| Durable Object throughput | **~1,000 req/s** (soft, per object) | one team's live channel |
| Worker subrequests | 10,000 per invocation | a 1,000-row import (~6,000) |
| Worker memory | 128 MB per isolate | a 25 MB upload arriving as base64 |

---

## 2 · What breaks first

**Inside one tenant — the team's own database at 10 GB.** That has three valves
(§3), so it is a managed ceiling rather than a wall.

**The live channel — RELIEVED (2026-08-11).** One `TeamChannel` Durable Object
held a team's sockets and `broadcast()` looped every one of them,
single-threaded. At 25,000 concurrent sessions every write in that tenant fanned
25,000 sends through one object, against a soft limit of ~1,000 requests per
second. It was the first hard ceiling in the system and the only one with no
valve at all. A team channel is now addressable as **N objects** — §3, valve 4.

**Across tenants — the shared core database.** `users`, `team_members`,
`sessions`, `invite_index` and `account_activity` live in ONE D1, so they hold
the sum of every tenant. Per-team sharding does nothing for it. At dozens of
large tenants it is the first shared thing to reach 10 GB.

It is now watched nightly (it never used to be), its exhaust is swept (§4), and
— the change that actually bought the years — **the two fastest-growing tables
in the system have left it entirely**. `error_logs` and `agent_usage_log` now
live in their own operations database (§4.9). Nothing joins to either, so the
move cost nothing and the shared database keeps its 10 GB for the rows every
request depends on.

---

## 3 · The three relief valves for a full team database

In `workers/tenancy/src/lib/sharding.ts`, in order of reach:

1. **ALARM** — the nightly cron sizes every database this project owns and writes
   a `db_alerts` row past the threshold. The threshold is **80%** of the 10 GB cap
   — the number `ARCHITECTURE.md` has always carried, restored by the owner on
   2026-08-25 after the code had drifted to 65% and the alarm's own message still
   said 80.

   What it costs, stated rather than lost: relieving a full database means creating
   one, copying millions of rows through the REST door, verifying counts and
   flipping routing. 80% leaves **2 GB** of headroom where 65% left 3.5 — days
   rather than weeks at a large tenant's growth rate. The alarm runs nightly and is
   reported, so 2 GB is a warning with time in it rather than a surprise.

   *(This paragraph argued against itself for an hour: a mechanical 65%→80% replace
   caught three numbers, two of which were not the threshold, leaving "**80%** …
   (it was 80%)". `story_checks_out` round 4 found it. A find-and-replace on prose
   is the same class of mistake as a regex scanner on source.)*
2. **MOVER** — `moveModuleToOwnDatabase` relocates one module's tables into a
   dedicated database.
3. **SPLIT** — `resolveModuleDatabases` + `d1QueryAcross` can read a (team,
   module) across several databases. Built, and still not wired to a module read
   path — see §5.3.
4. **CHANNEL SHARDS** — the only valve that acts on REQUESTS rather than stored
   bytes. `teams.shard_count` splits one team's live channel across N Durable
   Objects; the nightly cron raises it as the team grows. See below.

### The channel shard, and why the count only ever goes up

A subscriber's shard is picked server-side from their **user id**, so every one
of a person's devices lands on the same object and a reconnect returns to it.
A publisher fans to all N. None of this is visible to a caller: `publishChange`
still names `team:<id>` and the realtime worker is the one place that expands
it, so no module changed and no client changed.

Shard 0 keeps the BARE channel name, so a team that has never been split
addresses exactly the object it always did — no cutover, no reconnect.

The count is **monotonic**, and that is a safety property rather than tidiness.
A socket that connected when the count was N' sits on a shard index below N';
every later count is ≥ N'; a publisher fanning to the current N therefore always
covers it. **No connected listener can be stranded.** Lowering the count would
strand every socket above the new value until it reconnected, so lowering is a
deliberate manual act and never something the cron does.

The ceiling is 32 shards — about 32,000 concurrently-served sockets in a single
tenant, comfortably past the 25,000 the yardstick asks for. Past that the
fan-out itself (N calls per publish) becomes the thing worth optimising, which
is a fan-out tree, not a bigger number.

### The mover used to destroy what it moved

Worth writing down, because the shape of the bug is more instructive than the
bug. The mover copied the rows, recorded the new home in `team_module_databases`,
and deleted the originals. **Nothing read that routing table.** Every module lib
asked `guard.databaseId` — the team's *main* database — so pulling the documented
lever at 8 GB emptied the module on screen. The data was safe; the app could not
see it. And it was reachable from an admin endpoint at exactly the moment you
would most want to use it.

The fix is one seam, not every module: `gated()` resolves the module's real
database **after** the permission check (the permission sheet never moves) and
hands it to the module as `guard.databaseId`. No module lib changed. The lookup
is skipped entirely unless `teams.moved_modules` is non-zero, so an ordinary
request pays nothing for machinery it isn't using. Locked by
`workers/tenancy/test/module-routing.test.ts`, including the ordering: routing
must be live *before* the originals are deleted.

---

## 4 · Retention — sweep the exhaust, never the records

`shared/workers/retention.ts` is the one place that says what may be forgotten.

**A record is interrelated.** A member row is referenced by role assignments, by
invite audit rows, by every activity line naming them. Deleting one breaks five
other things — which is why the base is deactivate-never-delete
(ARCHITECTURE §4) and why no sweep names one. A check enforces that.

**A log is not.** Nothing points at a used-up login code, a session that expired
in March, or a worker error from two years ago. They are the fastest-growing
tables in the system and keeping them for ever is how a shared database reaches
its cap without a single customer noticing.

**The audit trail sits between the two, and ships OFF.** A team's `activity` and
a user's `account_activity` are log-shaped but history in purpose — "who changed
this price, and when" is often why the customer bought the product. Both have a
window and both are `KEEP_FOREVER` until an owner deliberately sets one. Deleting
someone's audit history is a product decision, not a default that arrives with an
upgrade.

| Table | Kept | Why |
|---|---|---|
| `login_codes`, `email_change_codes` | 1 day | the code lives for minutes; the row outlives it only for the one-hour send throttle |
| expired `sessions` | swept every night | an expired session is unusable by definition |
| `error_logs` | 90 days | ERROR-HANDLING.md always *said* 90 days; nothing enforced it |
| `agent_usage_log` | 400 days | a year of spend history with a margin |
| `account_activity` | **for ever** | audit — set `RETAIN_ACCOUNT_ACTIVITY_DAYS` to choose |
| team `activity` | **for ever** | audit, and the biggest table in any team DB — `RETAIN_TEAM_ACTIVITY_DAYS` is the switch to reach for when one fills up |

Every window is overridable per environment without a deploy. Sweeps run in
5,000-row batches: a first pass over a table nobody has ever pruned could match
millions of rows, and one unbounded `DELETE` would hit D1's 30-second statement
limit and lose the lot — so the table drains over a few nights instead of the
sweep failing every night for ever. Every swept column is indexed; a check
enforces that too, because the job that exists to stop a table growing must not
be the thing that reads all of it.

---

## 4.5 · The two races nothing was watching

CONCURRENCY.md makes INVARIANTS race-safe — keep ≥1 admin, never-negative
balance, one pending invite — by riding the check inside the write's `WHERE`.
That covers rules the app knows it has. Two races were left, and both are
silent, which is why nothing had ever reported them.

**The double write.** A request can arrive twice: a double-tapped button, a
client retrying after a timeout on a response the server actually sent, a mobile
connection resending. Nothing noticed — the second request was simply a second
create.

A client may now send `Idempotency-Key`. The first request claims it with a
primary-key INSERT (SQLite serialises writers, so of two simultaneous retries
exactly one wins — no lock, no coordination object) and stores its outcome; a
retry replays that outcome. It is wired at the three ROUTES dispatchers, so it
covers every team-data mutation rather than each door remembering.

**No key means no query.** The ordinary path is untouched and unmeasured.
Taxing every mutation in the app to protect the few that get retried is how a
safety feature ends up reverted.

`FormShell` owns the key on the client, for the same reason it owns R22: a
FAILED submit keeps its key, because retrying is the point, and a SUCCESSFUL one
drops it, because reusing it would replay the last save and silently discard the
new edit.

**The lost update.** Two people open one record, both edit, both save. The
second overwrites the first with fields read before it existed, and neither is
told. Four record updates now carry ` AND updated_at = ?` with `RETURNING`, so a
write that lands on nothing is a 409 rather than a success. The predicate is
empty when the caller states no expectation, so nothing existing changed.

## 4.6 · The ceiling on RATE

Everything here was bounded in SIZE — a list has a hard cap (R14), an import has
a row ceiling, an upload has a byte cap, the agent has a credit quota. Nothing
bounded RATE, and the agent quota is not a general answer: a role WITHOUT the
agent right met nothing at all.

| Ceiling | Where | Why there |
|---|---|---|
| per caller | the gateway, ABOVE the routing table | so a new route cannot be added outside it |
| per team | `teamContext` | the first point the team is KNOWN — a team-scoped call carries no team in its URL |

The caller key is the session, or `CF-Connecting-IP` before sign-in (the
sign-in door has no session yet and is exactly what gets guessed at). Never
`X-Forwarded-For`: a client-settable header would let anyone reset their own
counter every request.

**Both fail OPEN.** An absent binding, a fork that has not enabled it,
`wrangler dev`, a test, or a limiter hiccup all let the request through. A
safety feature that takes the app down when its own dependency wobbles has
inverted its purpose.

**The count is PER COLOCATION, and that changes what the number means.**
Verified on staging 2026-08-11: with the ceiling temporarily set to 5 per 10 s,
sequential requests were refused from the 6th on — but 800 requests fired 40-way
parallel against the 600/60 s ceiling produced **no refusals at all**, because an
anycast burst spreads across edge machines and no single counter ever saw 600.

So "600 per minute" is a ceiling per caller **per colo**, not globally. It does
what it exists to do — stop one runaway client or retry loop from spending a
tenant's capacity — and it is NOT an anti-abuse control against a distributed
attacker. Read it as a governor, not a gate. Anything stronger belongs in
Cloudflare's WAF, in front of the worker.

## 4.7 · Uploads, and what an isolate can hold

An attachment used to arrive as a base64 data URL inside a JSON body, so the
worker held the file **three times** — the JSON string, the base64 substring,
and the decoded bytes — with base64 a third larger than what it encodes. A 25 MB
video was most of a 128 MB isolate, and running out of an isolate does not
produce an error anyone can act on.

The file is now the request body and goes straight to R2 through a counting
transform: memory is one chunk whatever the size. The size cap is enforced by
COUNTING, not by trusting `Content-Length`, which a client is free to lie about.
The mime allowlist is unchanged — these files are served back inline on the app
origin, so a `text/html` or `image/svg+xml` upload would be stored XSS.

Profile photos and team logos still use the buffered path. That is deliberate:
their cap is 2.5 MB after a client-side downsize, which never threatens the
isolate, and they arrive inside a larger form body.

## 4.8 · An export that leaves data behind says so

Every export read carries a hard cap (R14), which is right — an unbounded one
builds the whole table as a string inside a 128 MB isolate. But the cap was
SILENT. A team with 250,000 rows asked for their data, received a well-formed
CSV containing the first 10,000, and had nothing telling them the rest was
missing. That is worse than an error: an error gets noticed, this gets migrated.

The read asks for **one row more** than the cap, which answers "was there more?"
for free — so an ordinary export never pays for a `COUNT(*)` over the table. The
shortfall goes in the FILENAME (`learning-first-10000-of-250000.csv`) because an
export is a browser download: a response header reaches no human, and a warning
row inside the CSV would corrupt the round-trip back through the importer that
the format promises.

## 4.9 · The operations database

The shared core database is the one thing every tenant writes to, and it is
capped at 10 GB however many customers there are. Two of its tables were pure
exhaust and were growing faster than everything else combined:

| Table | One row per |
|---|---|
| `error_logs` | anything that goes wrong, anywhere |
| `agent_usage_log` | anyone using the AI, once per turn |

Nothing joins to either. Every read of either is by one tagged column. So they
moved to a database of their own, and the shared one keeps its space for
identity, membership and sessions — the rows every single request depends on.

**What did NOT move.** Per-team databases are untouched; the tenancy model is
exactly as it was. And `agent_credits` — the BALANCE the quota gate reads on the
request path — stays in the core database with the team record. Only the spend
history moved.

**The fallback is the safety.** `opsDatabase(env)` returns `env.OPS ?? env.DB`,
so a worker with no `OPS` binding — a fork that has not created the database,
`wrangler dev`, a deploy that missed a config — writes to the core database
exactly as before. A partition that breaks the app when its extra database is
absent would be a worse problem than the one it solves.

**The move is `scripts/move-to-ops.mjs`**: copy → verify both sides report the
same count → delete the source, and only then. There is deliberately no flag to
skip the verification, because the one situation where you would want to skip it
is exactly the situation where you must not.

## 5 · The plans that are NOT built

Each of these is architectural: expensive to reverse, and a human decision. They
are written here so the decision is informed rather than urgent.

### 5.1 · Sharding the live channel (the first hard ceiling)

**Today.** One object per team. `broadcast()` walks every socket in a single
thread. At 25,000 concurrent sessions in one tenant that is 25,000 sends per
ping, against ~1,000 req/s per object.

**The change.** Address channels as `team:<id>:<shard>` where the shard is
`hash(userId) % N`, N derived from the team's member count. A publish fans to N
objects instead of one; each holds ~25,000/N sockets. The publisher's own
fan-out becomes N service calls, which is bounded and parallel.

**Why the endpoint contract survives.** Clients already connect to
`/api/realtime?team=<id>` and the worker chooses the object. The shard is picked
server-side from the session's user id — no client changes, no message-format
change, and a team with N=1 behaves exactly as it does now.

**Order.** (1) Add the shard suffix behind a helper defaulting to N=1 — a no-op
change that ships safely. (2) Publish to all N shards. (3) Derive N from member
count, with a floor of 1. (4) Raise N for one large tenant and measure.

**Rollback.** Set N back to 1; the addressing helper collapses to today's
behaviour. No data is involved — the object holds no state.

### 5.2 · Partitioning the shared core database

**Today.** One D1 for every tenant's identity, membership, sessions and logs.

**The change, in the order that buys the most for the least.** (1) Retention —
done, §4. (2) Move `error_logs` and `agent_usage_log` out to their own
"operations" database: nothing joins to them, so this is a table move and a
binding change. (3) If `sessions` is still the biggest table, move it likewise —
it is written on every sign-in and read on every request, and it joins only to
`users`, which can be a second read. (4) Only then consider partitioning `users`
and `team_members`, which is genuinely hard because every membership check joins
them.

**Why the endpoint contract survives.** Steps 2 and 3 move whole tables behind
`env.DB` bindings; no route shape changes. Step 4 would need the same
`moduleDatabase()`-style indirection already proven for team modules.

**Rollback.** Steps 2–3 are reversible by copying the tables back; keep the
source rows for one full backup cycle before dropping them.

### 5.3 · Wiring the SPLIT valve

`d1QueryAcross` merges reads across databases but no module read path uses it,
so a module can live in one relocated database (§3, now correct) but not span
two. The keyset cursor is also single-position: it encodes `(sortValue, id)` from
one database, which is arithmetically wrong across several. Spanning needs a
cursor that carries a position per database. Not needed until one MODULE alone
exceeds 10 GB, which is far past the point where §5.1 and §5.2 bind.

### 5.4 · Deleting a record, safely (the owner's question)

The rule today is absolute: deactivate, never delete. The owner's observation is
right — that is correct for a member with five referencing rows, and heavy for a
row created by accident thirty seconds ago with nothing pointing at it.

**The shape that would work.** A `deletable(table, id)` seam that answers "does
anything reference this?" from a declared reference map (the import `references`
declarations are already exactly this shape), plus a rule that a record may be
hard-deleted only when the answer is nothing AND it is inside a short window
after creation. Everything else deactivates as now. That keeps the invariant
("no dangling reference, ever") while letting the obvious case be obvious.

**Why it is not built here.** It changes a locked decision in ARCHITECTURE.md, it
needs the reference map to be complete before it is trustworthy, and getting it
wrong deletes a customer's data. It wants its own design pass.

---

## 6 · What the review changed

**First pass (54 → 70)**

| Fix | Dimension |
|---|---|
| Indexes matching the real sorts — `help`'s `COALESCE(updated_at, created_at)` expression index, `activity (created_at DESC, id DESC)`, composites for the thread reads | queries |
| The mover routes reads instead of orphaning them | partitioning |
| The shared core database is watched at all; the alarm threshold restored to 80% after the code had drifted to 65% | headroom |
| Retention on the exhaust tables, audit tables off by default | lifecycle |
| A row ceiling inside a cache entry, not just an entry count | client cache |
| `Range` requests on `/media/*` — seek and resume instead of restart | storage |

**Second pass (70 → 90)**

| Fix | Dimension | §  |
|---|---|---|
| The live channel splits across N objects, monotonically, with no client change | fan-out | 3 |
| `Idempotency-Key` — a retried mutation replays instead of writing twice | atomic | 4.5 |
| A version predicate on record updates — a stale save is a 409, not a silent overwrite | atomic | 4.5 |
| Per-caller and per-tenant rate ceilings, both fail-open | surge | 4.6 |
| Uploads stream to R2 instead of arriving base64 through a 128 MB isolate | storage | 4.7 |
| A truncated export says so, in its filename | client volume | 4.8 |
| R23 — a mutation returns the affected ROW, not the collection | queries + client volume | RULES.md |

**Proof for the index work** (`EXPLAIN QUERY PLAN`, real SQLite):

```
before   SCAN help                             AFTER   SCAN help USING COVERING INDEX idx_help_recent
         USE TEMP B-TREE FOR ORDER BY
before   SCAN activity                         AFTER   SCAN activity USING COVERING INDEX idx_activity_recent
         USE TEMP B-TREE FOR ORDER BY
```

The sort step is gone. A page reads 51 rows off a b-tree instead of scanning and
sorting the whole table.

---

## 7 · The scorecard — 54 → 70 → 90 → 94

Recomputable by hand: `total = Σ(score × weight) ÷ 100`.

| Dimension | Start | Pass 1 | Pass 2 | Pass 3 | Weight |
|---|---|---|---|---|---|
| Query shape & indexing | 27 | 84 | 92 | **95** | 13 |
| Bulk paths & lifecycle | 34 | 84 | 88 | **94** | 12 |
| Sequential & atomic ops | 39 | 39 | 88 | **96** | 11 |
| Client cache bounds | 88 | 100 | 100 | 100 | 9 |
| Client data volume | 51 | 51 | 88 | **90** | 9 |
| File & object storage | 22 | 39 | 84 | **92** | 8 |
| Data partitioning | 51 | 76 | 76 | **94** | 8 |
| Write fan-out & realtime | 30 | 30 | 90 | 90 | 7 |
| Growth triggers & headroom | 76 | 92 | 94 | 94 | 7 |
| Surge self-protection | 64 | 64 | 88 | **94** | 6 |
| Endpoint contract stability | 96 | 96 | 90 | 90 | 5 |
| Elastic response time | 100 | 100 | 100 | 100 | 5 |

```
1235 + 1128 + 1056 + 900 + 810 + 736 + 752 + 630 + 658 + 564 + 450 + 500 = 9419
9419 ÷ 100 = 94
```

Endpoint stability FELL, deliberately: R21/R23 changed response shapes and the
upload changed its wire format. Both are recorded in BASE-IMPROVEMENTS.md as
breaking for a fork already on the base.

### What pass 3 changed

| Fix | Dimension | Verified |
|---|---|---|
| `error_logs` + `agent_usage_log` moved to their own operations database | partitioning | the owner dashboard reads them from `brimba-ops-staging`, live |
| Edit doors stop running a `COUNT(*)` an edit cannot have changed | queries | R23 check enforces it |
| The retry key reaches the MACHINE surface (MCP → door) | atomic | sabotage-proven |
| The team record gains the version guard | atomic | sabotage-proven |
| Nightly sweep of uploaded files no record points at | lifecycle + storage | grace period + fail-closed, sabotage-proven |
| A tighter ceiling on the expensive doors (agent, import, export, upload) | surge | a caller must pass BOTH ceilings |

## 8 · What is still open

Every remaining point is architectural, and each is a deliberate choice rather
than an oversight.

| Item | Dimension | Why it is not built |
|---|---|---|
| Presigned direct-to-bucket uploads | storage | needs an R2 API token to manage. Uploads already stream, so the worker relays rather than buffers — the remaining gain is one hop, not a ceiling. Owner declined the extra secret, 2026-08-12. |
| List virtualisation | client volume | the collection components live in the UI library. Surfaced there, never forked into the host (CLAUDE.md). |
| An exact `COUNT(*)` on every LIST read (R16) | queries | O(n) by nature. A maintained counter would fix it and would put R16's exactness at risk — that trade needs its own design pass. |
| Partitioning `users` / `team_members` | partitioning | §5.2 step 4. Genuinely hard: every membership check joins them. Not needed until far past the current yardstick. |
| Import resumability | lifecycle | an import that fails restarts. The claim-flip makes that safe, just not cheap. |
