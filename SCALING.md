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

**Inside one tenant — the live channel.** One `TeamChannel` Durable Object holds
a team's sockets and `broadcast()` loops every one of them, single-threaded. At
25,000 concurrent sessions every write in that tenant fans 25,000 sends through
one object, against a soft limit of ~1,000 requests per second. **This is the
first hard ceiling and it has no relief valve today** — see the plan in §5.1.
Before it: the team database passes 10 GB, which does have a valve (§3).

**Across tenants — the shared core database.** `users`, `team_members`,
`sessions`, `invite_index`, `error_logs`, `account_activity`, `agent_usage_log`
all live in ONE D1, so they hold the sum of every tenant. Per-team sharding does
nothing for it and there is no mover for it. At dozens of large tenants it is the
first shared thing to reach 10 GB. It is now watched nightly (it never used to
be) and its exhaust is now swept (§4), which buys years — not for ever. Plan in §5.2.

---

## 3 · The three relief valves for a full team database

In `workers/tenancy/src/lib/sharding.ts`, in order of reach:

1. **ALARM** — the nightly cron sizes every database this project owns and writes
   a `db_alerts` row past the threshold. The threshold is **65%** of the 10 GB
   cap (it was 80%). Relieving a full database means creating one, copying
   millions of rows through the REST door, verifying counts and flipping routing;
   2 GB of headroom is days at a large tenant's growth rate, and that is not
   enough time to notice, decide and act. 3.5 GB is.
2. **MOVER** — `moveModuleToOwnDatabase` relocates one module's tables into a
   dedicated database.
3. **SPLIT** — `resolveModuleDatabases` + `d1QueryAcross` can read a (team,
   module) across several databases. Built, and still not wired to a module read
   path — see §5.3.

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

| Fix | Dimension |
|---|---|
| Indexes matching the real sorts — `help`'s `COALESCE(updated_at, created_at)` expression index, `activity (created_at DESC, id DESC)`, composites for the thread reads | queries |
| The mover routes reads instead of orphaning them | partitioning |
| The shared core database is watched at all; threshold 80% → 65% | headroom |
| Retention on the exhaust tables, audit tables off by default | lifecycle |
| A row ceiling inside a cache entry, not just an entry count | client cache |
| `Range` requests on `/media/*` — seek and resume instead of restart | storage |

**Proof for the index work** (`EXPLAIN QUERY PLAN`, real SQLite):

```
before   SCAN help                             AFTER   SCAN help USING COVERING INDEX idx_help_recent
         USE TEMP B-TREE FOR ORDER BY
before   SCAN activity                         AFTER   SCAN activity USING COVERING INDEX idx_activity_recent
         USE TEMP B-TREE FOR ORDER BY
```

The sort step is gone. A page reads 51 rows off a b-tree instead of scanning and
sorting the whole table.
