# Scaling review — Brimba · 2026-08-25
SCORE: 54/100   (previous: 94, recorded in SCALING.md §7; ladder 54 → 70 → 90 → 94)

Mode: **ANALYSE only** (campaign brief). Nothing in the repo was changed except this file.

---

## What was measured, and how

**Platform detected** (from `workers/*/wrangler.jsonc`, confirmed by reading):
Cloudflare Workers isolates · 7 workers · D1 (per-team databases over the REST
door + `env.DB` core binding + `env.OPS` operations binding) · R2 (3 buckets) ·
1 Durable Object class (`TeamChannel`) · no queue, no KV, no IaC.

**Platform limits looked up live on 2026-08-25** from
`developers.cloudflare.com/workers/platform/limits/` and
`developers.cloudflare.com/d1/platform/limits/`:

| Limit | Value (Workers Paid) | Where it binds here |
|---|---|---|
| Subrequests per invocation | **10,000** (D1/R2/KV/service-binding calls all count) | the nightly tenancy cron, which is O(teams) |
| D1 queries per Worker invocation | **1,000** | native `env.DB` calls in one request/cron |
| D1 database size | **10 GB** | one team DB, the shared core DB, the ops DB |
| D1 databases per account | 50,000 | teams the app can host |
| D1 **bound parameters per query** | **100** | `IN (?, ?, …)` lists built from user/member sets |
| D1 max SQL statement length | **100,000 bytes** | the module mover's 250-row inlined INSERT |
| D1 statement duration | 30 s | the unbatched expired-session DELETE |
| Cron CPU (interval ≥ 1 h) | 15 min | the nightly job (`10 3 * * *`) — comfortable |
| Isolate memory | 128 MB | exports, import extraction JSON |
| D1 read replication | available, **requires the Sessions API** (`withSession`) | not used anywhere in this repo |

**Weights.** `assets/rubric.md` contains three different weight sets: the
"Scoring arithmetic" table (sums to 100), the per-section headers (sum to 113),
and SCALING.md §7 used a fourth set of its own. I used the table that sums to
100, as the rubric instructs. Recomputing my dimension scores under SCALING.md
§7's weights gives 50, so the weights are not what moved the number.

**Two-level verdict** (both required by the rubric):

> *Inside one tenant.* **Fails at ~1,000 people, not 250,000.** `listMembers`
> carries a hard `LIMIT 1000` and `members` is not in `GROWING_COLLECTIONS`, so
> R14's paging half never applies to it; every member mutation reads that whole
> capped list to return one row, and returns `null` for anyone past row 1,000.
> Immediately behind that, the live layer's **read** side is unbounded: one write
> makes every connected session in the tenant issue its own read against that
> tenant's single D1.
>
> *Across tenants.* **Fails in the low thousands of teams.** The nightly
> maintenance cron walks every team inside one invocation against a
> 10,000-subrequest ceiling, with no cursor and no continuation. The retention
> sweep removes at most 5,000 rows per table per night against insert rates
> orders of magnitude higher. Every request in every tenant reads the one shared
> core database, with read replication not enabled. And the operations database
> that now holds the two fastest-growing tables in the system is not watched by
> the size alarm at all.

**The first ceiling, in one sentence:** the members collection stops at 1,000
people in a product whose stated yardstick is 250,000 — and right behind it, one
write fanning out to 25,000 sessions produces up to 25,000 reads against that
tenant's single SQLite database.

**Observability caveat (rubric, cross-cutting):** nothing in this repo measures
p95 latency per endpoint or per-table row counts over time. Every latency and
growth number below is arithmetic from row counts and documented limits, not a
measurement. Marked **unmeasured** where it matters.

---

## Arithmetic

`coverage = good_signals_present / good_signals_applicable`
`penalty = Σ(blocker 25 | major 12 | minor 4)`
`dimension = clamp(0, 100, round(100 × coverage − penalty))`
`total = Σ(dimension × weight) ÷ 100`

### 1 · Data partitioning & sharding readiness — 64 (weight 12)

coverage 4/4 = 1.00 → 100
- per-tenant database created programmatically — **yes** (`teams.ts:125`, `d1CreateDatabase`)
- one resolver decides which database a request uses — **yes** (`gating.ts:103,128`, `resolveModuleDatabases`)
- shard key explicit in the model — **yes** (`team_id` on every core table; the team DB *is* the shard)
- documented partition strategy for the largest tables — **yes** (SCALING.md §3, §5.2)

penalty 36 = major 12 + major 12 + major 12 → **64**

### 2 · Query shape & indexing — 2 (weight 13)

coverage 2/3 = 0.667 → 67
- indexes match real WHERE/ORDER BY shapes — **yes**, and it is the best work in the repo (`team-schema.ts:283–316, 349–362`; `EXPLAIN QUERY PLAN` proof in SCALING.md §6)
- reads are bounded — **yes**; I re-derived this independently rather than trusting R14: a scan of every SQL string literal in `workers/` + `shared/` (excluding tests) produced 40 unbounded candidates, and reading all 40 showed every one is a primary-key/equality lookup, an aggregate, or admin-only maintenance
- no query inside a loop — **no** (four confirmed N+1 sites)

penalty 65 = blocker 25 + major 12 + major 12 + major 12 + minor 4 → clamp(0, 67−65) = **2**

*The 2 is the additive penalty model flooring a dimension whose coverage is
genuinely 67. Five distinct confirmed faults land here. Read it as "five things
to fix", not "the indexing is bad" — the indexing is excellent.*

### 3 · Endpoint contract stability — 59 (weight 7)

coverage 3/4 = 0.75 → 75
- route handlers never build SQL — **yes for every module route**; 4 owner/maintenance handlers do (counted as present, penalised as a minor)
- all data access through one helper — **yes** (`shared/workers/d1-rest.ts`)
- shard/tenant resolver is one function — **yes**
- response shape independent of how many shards answered — **no**: `toPage` derives ONE cursor from merged rows

penalty 16 = major 12 + minor 4 → **59**

### 4 · Growth triggers & headroom — 68 (weight 8)

coverage 3/3 = 1.00 → 100
- size measured on a schedule — **yes** (`checkDatabaseSizes`, nightly)
- a threshold raises an alarm — **yes** (65% of 10 GB → a `db_alerts` row)
- the alarm names the action — **yes** ("Run the module mover")

penalty 32 = major 12 + major 12 + minor 4 + minor 4 → **68**

### 5 · Client data volume & lazy loading — 47 (weight 9)

coverage 3/4 = 0.75 → 75
- every list has a hard page cap — **yes** (`shared/workers/limits.ts`, R14-enforced)
- long lists virtualised — **no** (zero hits anywhere in `web/`)
- cursor-based pagination — **yes** for the two declared growing collections, opaque cursor, `LoadMore` reaches page two
- no endpoint returns an unbounded array — **yes** (verified by the 40-candidate read above)

penalty 28 = major 12 + major 12 + minor 4 → **47**

### 6 · Client cache freshness & bounds — 92 (weight 9)

coverage 4/4 = 1.00 → 100
- size bound + eviction — **yes** (`MAX_ENTRIES = 500`, `MAX_ROWS_PER_ENTRY = 2000`, LRU by write, mounted keys pinned)
- realtime patches/invalidates cached rows — **yes** (`patchRow`, `applyUpdated`)
- socket reconnects — **yes** (`realtime.ts:59`, 1 s → 15 s backoff)
- resync path after a gap — **yes** (`reconcile` diff-patches on reconnect)
- permission-change staleness — checked and **clean**: `my-perms:<team>` is invalidated on the caller's own membership ping, and every row-level refetch goes back through the permission-checked door

penalty 8 = minor 4 + minor 4 → **92**

### 7 · Surge self-protection — 64 (weight 6)

coverage 4/5 = 0.80 → 80
- rate limits per user **and** per tenant — **yes** (USER 600/60 s, HEAVY 60/60 s, TEAM 6,000/60 s)
- concurrency bound on expensive operations — **no** (size bounds only; no concurrency bound anywhere)
- retries back off — **yes** (client socket; `d1-rest` linear, no jitter)
- timeouts exist — **yes** (R11: `AbortSignal.timeout` on every external fetch, `callService` bounds service calls)
- cacheable responses cached at the edge — **yes** (`immutable` on `/media/*` and `_next/static`)

penalty 16 = major 12 + minor 4 → **64**

### 8 · Sequential, atomic & contended operations — 88 (weight 11)

coverage 3/3 = 1.00 → 100 (one signal **N/A**)
- sequences inside a serialising authority — **N/A**: there are no sequences. Ids are ULIDs (`shared/workers/id.ts`); the only `MAX()+1`-shaped thing in the repo is `shardCount`, and its UPDATE carries `AND shard_count < ?`. Excluded from the denominator per the rubric.
- read-modify-write atomic — **yes**, every one read and confirmed: `agent_credits` (`WHERE balance > 0`), `agent_usage` (`WHERE used < ?` inside the upsert), R17 transitions, the idempotency PK claim
- idempotency key on mutations — **yes** (`withIdempotency` at all three ROUTES dispatchers + the MCP surface)
- optimistic concurrency on edits — **yes** (`AND COALESCE(updated_at, created_at) = ?` with `RETURNING` → 409)

penalty 12 = major 12 → **88**

### 9 · Write fan-out & realtime propagation — 30 (weight 7)

coverage 2/3 = 0.667 → 67
- hibernation — **yes** (`ctx.acceptWebSocket`, Hibernation API)
- broadcast scoped to who needs it — **no**: every ping reaches every member of the team; the client filters after receipt
- per-message work bounded — **yes** on the send side (tiny JSON, no DB read per message, fan-out bounded by `MAX_SHARDS = 32`)

penalty 37 = blocker 25 + major 12 → **30**

### 10 · Bulk paths, migrations & data lifecycle — 6 (weight 5)

coverage 2/3 = 0.667 → 67
- imports stream and chunk — **no**: the extraction is one JSON blob in memory (capped at 1,000 rows), writes are one row per service-binding request, no chunking, no resume
- schema changes online-safe — **yes** (`ALTER TABLE … ADD COLUMN` nullable, `CREATE INDEX IF NOT EXISTS`, no table rewrites)
- retention/archival exists — **yes** (`shared/workers/retention.ts` with declared, overridable windows)

penalty 61 = blocker 25 + major 12 + major 12 + major 12 → clamp(0, 67−61) = **6**

### 11 · Elastic response time — 84 (weight 5)

coverage 2/2 = 1.00 → 100 (three signals **N/A** on isolates)
- warm/minimum capacity — **N/A** · autoscaling targets — **N/A** · connection pooler — **N/A** (HTTP-native store)
- expensive setup reused across invocations — **yes** (`shardMemo` module-scope memo, 60 s; module-scope `ROUTES` tables)
- readiness signalling — **yes** (`/health` on every worker)
- capacity arrives in milliseconds; load rises in seconds. On this platform the compute half of the question is free.

penalty 16 = major 12 + minor 4 → **84**

### 12 · File & object storage — 45 (weight 8)

coverage 6/7 = 0.857 → 86
- presigned direct-to-storage — **no** (owner declined the R2 API token, 2026-08-12; documented in SCALING.md §8)
- streaming upload — **yes** (`request.body` → `R2.put`, one chunk in memory whatever the size)
- keys namespaced per tenant — **yes** (`<teamId>/<ulid>`; `users/<id>`, `teams/<id>` for identity)
- object metadata indexed in the DB — **yes** (`learning.content_link`)
- served through a cache — **yes** (`immutable` + `?v=` busting)
- lifecycle/retention — **yes** in app form (`sweepOrphanedUploads`), no R2 lifecycle rule
- range reads — **yes**, end to end (`serveObject`, 206 + `Content-Range`)
- hot prefixes — **N/A**: R2 does not shard by key prefix the way S3 does; keys lead with the team id anyway

penalty 41 = blocker 25 + major 12 + minor 4 → **45**

### Total

| # | Dimension | Score | Weight | Score × weight |
|---|---|---|---|---|
| 1 | Data partitioning & sharding | 64 | 12 | 768 |
| 2 | Query shape & indexing | 2 | 13 | 26 |
| 3 | Endpoint contract stability | 59 | 7 | 413 |
| 4 | Growth triggers & headroom | 68 | 8 | 544 |
| 5 | Client data volume & lazy loading | 47 | 9 | 423 |
| 6 | Client cache freshness & bounds | 92 | 9 | 828 |
| 7 | Surge self-protection | 64 | 6 | 384 |
| 8 | Sequential, atomic & contended ops | 88 | 11 | 968 |
| 9 | Write fan-out & realtime | 30 | 7 | 210 |
| 10 | Bulk paths, migrations & lifecycle | 6 | 5 | 30 |
| 11 | Elastic response time | 84 | 5 | 420 |
| 12 | File & object storage | 45 | 8 | 360 |

```
768 + 26 + 413 + 544 + 423 + 828 + 384 + 968 + 210 + 30 + 420 + 360 = 5374
5374 ÷ 100 = 53.74 → 54
```

### Why this is 54 and not 94

Not the weights (SCALING.md §7's own weights give 50 on my dimension scores).
Three causes, in order of size:

1. **Four blockers the previous pass did not look for.** The read side of the
   realtime fan-out, the retention sweep's per-night batch ceiling, the
   orphan-sweep reference truncation, and `one*`-from-a-capped-list. None appears
   anywhere in SCALING.md.
2. **Two regressions introduced by pass 3's own repairs.** Moving `error_logs` and
   `agent_usage_log` to `brimba-ops` left them outside the size alarm's filter.
   R21/R23's "return the affected row" was implemented by reading the whole list
   on the server — the wire got cheaper, the database did not.
3. **Limits I checked live that change the arithmetic.** D1's 100-bound-parameter
   cap breaks two member-set queries at scale; the 100 KB statement cap breaks the
   module mover on the tables it exists to move; D1 read replication exists and is
   not enabled.

---

## Findings

### BLOCKER 1 · The nightly upload sweep deletes files that records still point at
`workers/tenancy/src/lib/sharding.ts:437–457`

**Plain English.** Once a team has more than 10,000 learning attachments, the
nightly cleanup starts deleting attachments that articles are still using.

The reference read is capped: `SELECT content_link FROM learning WHERE
content_link LIKE '/media/learning/%' LIMIT ${ORPHAN_SCAN_CAP}` (10,000), with no
`ORDER BY`. The deletion loop then walks up to 10,000 R2 objects **in key order**
(ULID = creation order, so the oldest) and deletes anything not in that set and
older than the 7-day grace. Above 10,000 attachments the two sets are drawn from
different orderings, so referenced objects fall outside the reference set and are
deleted. Keys align exactly (`content_link` = `/media/learning/<teamId>/<ulid>`,
stripped to `<teamId>/<ulid>` = the R2 key), so this is not a mismatch that
would fail loudly — it deletes precisely the right-looking wrong things.

`workers/tenancy/test/retention.test.ts:180–187` checks that the sweep bounds
what it walks and mentions `listed.truncated` — the **object** listing. Nothing
checks the **reference** read's truncation. A green check asserting the wrong
intent.

**Why it matters.** Silent customer data loss, at 4% of the yardstick, with a
7-day delay between cause and symptom.

**Fix.** Gate the deletion on the reference read being complete: read
`ORPHAN_SCAN_CAP + 1` rows and, if the extra row arrives, log and skip the
team's deletions entirely (fail closed, exactly as the read-error path already
does). Longer term, page the reference read by key and diff against a paged
`list({ cursor })` so both sides walk the same order.

---

### BLOCKER 2 · Retention can never remove more than 5,000 rows per table per night
`workers/tenancy/src/lib/sharding.ts:315–345` (`SWEEP_BATCH = 5000`)

**Plain English.** The job that stops tables growing has a speed limit far below
the speed they grow at.

`sweep()` issues **one** `DELETE … LIMIT 5000` per rule per nightly run. No loop,
no continuation, no second pass. The comment frames this as "the table drains
over a few nights", which is true of a one-off backlog and false in steady state:
any table inserting more than ~5,000 rows/day grows without bound *despite having
a retention rule*.

Three of the four core rules exceed that at a single busy tenant:
`idempotency_keys` (one row per protected mutation — `FormShell` sets the key on
every form submit, and `0017_idempotency.sql:23` calls it "the fastest-growing
table the base has"), `login_codes` (one per sign-in request), and in the ops
database `error_logs`. All sit in databases capped at 10 GB that every tenant
shares.

Arithmetic: `idempotency_keys` at ~1 KB/row reaches 10 GB at 10M rows. With a
5,000/night sweep, net growth of 9,100 rows/day fills it in three years — that is
~14,000 protected mutations a day across the entire platform, roughly ten a
minute.

**Why it matters.** The shared core database filling stops writes for every
tenant at once, and there is no mover that can relieve it (SCALING.md §2 says so).

**Fix.** Loop the sweep until a pass deletes fewer than `SWEEP_BATCH` rows or a
wall-clock/subrequest budget is spent, and record how many rows remained so the
shortfall is visible. Keep the per-statement batch — the 30 s statement limit is
still real.

---

### BLOCKER 3 · One write makes every connected session issue its own read
`web/components/app-shell.tsx:119–158` · `web/lib/use-live-refetch.ts:14–24` · `web/lib/store.ts:patchRow`

**Plain English.** Sharding the live channel made the *message* go out fast.
Nothing bounds what comes back.

A ping carries no row data by design (correct — it cannot leak). Every receiving
client therefore reacts by fetching:

- `invalidate('activity:team:<id>')` on **every** ping — any session with the
  activity feed on screen re-pulls a keyset page **plus an exact `COUNT(*)` over
  the largest table in the tenant, carrying the R18 `NOT IN` filter that no index
  serves**;
- `patchRow(...)` — one single-row read per client holding that collection;
- `useLiveRefetch` — a full current-page re-pull (50 rows + a `COUNT(*)`) for
  every paged screen showing that resource, with no debounce.

At the yardstick — 25,000 concurrent sessions in one tenant — one ordinary write
produces up to ~25,000 reads against that tenant's single D1. A 512-id bulk
deactivate publishes 512 pings (`routes/learning.ts:117`), so up to ~12.8M reads
from one click. D1 processes queries one at a time per database.

`MAX_SHARDS = 32` bounds the send side and is well reasoned. The receive side is
unbounded and is not mentioned anywhere in SCALING.md.

**Why it matters.** This is the real first ceiling inside a tenant, and it
arrives at a few thousand concurrent sessions — long before the 32-shard channel
ceiling the previous pass was built to relieve.

**Fix (three, in order of return):**
1. Stop invalidating `activity:team:<id>` on *every* ping — only on pings whose
   resource can appear in the feed, and debounce to one refetch per ~2 s.
2. Coalesce a burst: buffer pings for ~250 ms and issue one refetch per resource
   per window. `patchRow` for a row already in flight should join, not re-issue.
3. Scope the broadcast server-side. A subscriber could declare the resources it
   is showing; `TeamChannel.broadcast` already walks its sockets and can filter.
   **Tension with a Law:** coalescing a *bulk* door's pings into one collection
   ping conflicts with CACHING rule 3 (patch the row, never refetch the list) and
   with R1's per-mutation publish. That half needs a law-level decision, not a
   commit. Items 1 and 2 do not.

---

### BLOCKER 4 · "Return the affected row" is implemented by reading the whole list
`workers/content/src/lib/learning.ts:205` · `workers/tenancy/src/lib/members.ts:152,161` · `workers/tenancy/src/lib/selectable.ts:59` · `workers/tenancy/src/lib/invites.ts:115`

**Plain English.** R21/R23 stopped sending the whole list back to the browser.
The server still reads the whole list to answer.

```ts
export async function oneMember(env, cfg, guard, userId) {
  return (await listMembers(env, cfg, guard)).find((m) => m.userId === userId) ?? null
}
```

Five helpers do this. Every create, edit, status move and deactivate on learning,
members, roles, dropdown values and invites reads up to `LIST_HARD_CAP` (1,000)
rows to return one — and `oneMember` reads 1,000 members **plus** 1,000 roles.
RULES.md R23 names the cost it was written to remove: "a full list read plus a
`COUNT(*)` on the server". The `COUNT(*)` went; the full list read stayed and
moved from the client to the database.

Worse, past row 1,000 the `.find()` misses and the helper returns `null`. R23
defines `null` as "the record left the list", and `applyUpdated` →
`patchRow(..., () => null)` **filters the row out of the client's cache**. At
scale a successful edit is indistinguishable from a deletion.

`oneReply`/`getTicket` in `workers/content/src/lib/help.ts:157,190` do it the
right way — `WHERE id = ?`. The pattern exists in the codebase already.

**Fix.** Give each `one*` its own `WHERE id = ?` read with the same projection.
To keep R21/R23's "a single row can never differ in shape from a listed one"
guarantee, factor the projection + row mapper into a shared constant that both
the list and the single read use — the same way `TICKET_COLS` already works.

---

### MAJOR 5 · The operations database is not watched by the size alarm
`workers/tenancy/src/lib/sharding.ts:47,66`

`checkDatabaseSizes` filters to
`db.name.startsWith("team-") || /-core(-staging)?$/.test(db.name)`. The
operations database is `brimba-ops` / `brimba-ops-staging`
(`workers/tenancy/wrangler.jsonc:15,44`) and matches neither.

Pass 3 moved `error_logs` and `agent_usage_log` there precisely because they were
the two fastest-growing tables in the system. The alarm was never widened to
follow them, so the fastest-growing database in the product is now the only one
nobody is watching. **This is a regression introduced by the previous repair.**

**Fix.** One line: add `|| /-ops(-staging)?$/.test(db.name)` to the filter, and a
test asserting the ops database name matches the watch predicate.

---

### MAJOR 6 · Nothing receives the size alarm
`workers/tenancy/src/lib/sharding.ts:76–95` · `workers/tenancy/src/routes/admin.ts:53`

The alarm writes a `db_alerts` row and a `console.error`. There is no email, no
webhook, no notification of any kind. The row is visible only if an owner
happens to call `GET /admin/db-alerts`. The rubric's question — "does anything
actually receive the alarm, or is it written to a log nobody reads?" — answers
itself. The 65% threshold buys 3.5 GB of lead time, which is worth nothing if
nobody learns about it for a month.

**Fix.** The auth worker already owns a sender (`/internal/send-email`, used by
`content/src/lib/notify.ts`). Send the owner one message per newly-opened alert —
`db_alerts` already de-duplicates on `resolved_at IS NULL`, so it cannot spam.

---

### MAJOR 7 · The nightly cron is O(number of teams) inside one invocation
`workers/tenancy/src/lib/sharding.ts:348–360` · `runRetention` team pass, lines 380–392

`sweepOrphanedUploads` reads `SELECT id, database_id FROM teams WHERE db_status =
'ready'` (unbounded) and then, **per team, serially**: one D1 REST query
(a `fetch` = a subrequest) + one `R2.list` + N `R2.delete` (bindings, which the
Workers limits page confirms also count as subrequests). `runRetention`'s team
pass adds one REST call per team per enabled rule.

Against the 10,000-subrequest ceiling that breaches somewhere between roughly
2,500 and 5,000 teams, depending on how many objects each team holds. There is no
cursor and no continuation, so the run simply dies part-way through the team list
— always the same alphabetical tail, always silently.

**Fix.** Store a cursor (last team id swept) in `db_alerts`-style state, process a
bounded slice per night, and resume from it. Add a subrequest budget counter that
stops cleanly and records where it stopped.

---

### MAJOR 8 · The one unbatched sweep is on the highest-volume table
`shared/workers/retention.ts:117`

```ts
export const EXPIRED_SESSIONS_SQL = "DELETE FROM sessions WHERE expires_at < ?"
```

Every other sweep is deliberately batched at 5,000 rows because — in the code's
own words — "one unbounded `DELETE` would sit inside D1's 30-second statement
limit and lose the lot". This one is not batched, and `sessions` is the
highest-insert-rate table in the shared core database (one row per sign-in across
every tenant). It is the exact failure `SWEEP_BATCH` exists to prevent, on the
table most likely to trigger it, and once it starts failing it fails every night
for ever.

**Fix.** Route it through the same `sweep()` batching with its own rule
(`column: "expires_at"`, cutoff = now). `idx_sessions_expires` already exists.

---

### MAJOR 9 · Team-database retention names one table out of ten that grow
`shared/workers/retention.ts:98–108`

`TEAM_RETENTION` contains exactly one rule (`activity`, `KEEP_FOREVER`). These
team tables also grow with ordinary use, in a 10 GB database, with no rule at all
— not even a `KEEP_FOREVER` line making the choice visible:

| Table | One row per | Notes |
|---|---|---|
| `agent_messages` | chat turn | unbounded per person per day |
| `agent_threads` | chat | |
| `data_import_sessions` | import | stores the **entire uploaded file** as JSON in `extraction_response` |
| `help_threads` | reply | |
| `learning_progress` | article × member | 250,000 × N |
| `invite_logs` | invite event | |

`data_import_sessions` is the sharpest: a 1,000-row CSV lands as a multi-hundred-KB
JSON cell that is never deleted, per import, for ever.

**Fix.** Add a rule per table with a deliberate window (or an explicit
`KEEP_FOREVER` with a stated reason), and a test asserting every team-schema
table appears in `TEAM_RETENTION` or a named exemption — the same
derive-don't-hand-list discipline R13/R21/R23 already use.

---

### MAJOR 10 · `activity` is the largest table in a team database and has no valve but deletion
`workers/tenancy/src/team-schema.ts:63` · SCALING.md §3

At the yardstick — 250,000 people, five years — even one mutation per person per
working day gives 250,000 × 250 × 5 ≈ **312M rows** in one team's `activity`
table. At ~250 bytes/row that is ~78 GB against a 10 GB cap.

The three documented relief valves do not reach it. The MOVER relocates a
**module's** tables; `activity` is not a module and is written by every module
into `guard.databaseId`. The SPLIT valve is dead code. That leaves
`RETAIN_TEAM_ACTIVITY_DAYS` — deleting the audit trail the product is trusted for.

**Fix.** An archival path rather than a deletion window: roll rows older than N
months into a per-team `activity-archive` database and have the record-scope read
fall back to it. That is Tier C (a data migration) and needs a written plan, not
a commit.

---

### MAJOR 11 · The module mover breaks on the tables it exists to move
`workers/tenancy/src/lib/sharding.ts:243–258` (`COPY_BATCH = 250`)

Two independent faults in the documented relief valve:

1. **Statement size.** Each batch inlines 250 whole rows into one
   `d1ExecScript` (the REST script API takes no parameters). D1's maximum SQL
   statement length is **100,000 bytes** (checked 2026-08-25). A `learning` row
   carries `content_body` (rich text — kilobytes); an `activity` row carries
   `before_after` JSON. 250 × 800 bytes already exceeds the limit; 250 rich-text
   bodies exceed it by an order of magnitude. The first batch fails.
2. **`LIMIT ${COPY_BATCH} OFFSET ${offset}`** — the only real SQL `OFFSET` in the
   entire repo (verified: every other "offset" hit is a comment or an R2 byte
   range). Copying 5M rows in 250-row pages costs O(n²) row scans.

Neither corrupts anything (deletes come last, so it fails safe), but the valve
you are told to pull at 65% full does not open. There is also no resume: a second
attempt creates a second database and starts over.

**Fix.** Copy by keyset (`WHERE id > ? ORDER BY id LIMIT ?`) with a **byte
budget** per script — accumulate rows until the built statement approaches ~80 KB,
then flush. Record the last copied id per table so a failed move resumes.

---

### MAJOR 12 · A moved module silently stops writing activity
`workers/tenancy/src/lib/sharding.ts:180–200, 291–299` · `shared/workers/activity.ts:191–226`

`moveModuleToOwnDatabase` copies only the tables it is given. `gated()` then
resolves `guard.databaseId` to the new database for that module. Every module lib
calls `logActivity(cfg, guard.databaseId, …)`, which does `INSERT INTO activity`
— **a table the new database does not have**. `logActivity` catches and emits an
`activity_log_gap` trace line rather than throwing, so the module simply stops
recording history and the app looks fine.

The mover proves this against itself: its own "Module relocated" audit row is
written with `logActivity(cfg, newDbId, SYSTEM_ACTOR, …)` into the database it
just created without an `activity` table.

This also breaks Law R25 (a record's whole life lands in the one activity table)
the moment the documented scaling lever is pulled.

**Fix.** Create the `activity` table (and its 0007/0008 indexes) in every module
database the mover creates, and have the team feed read across
`resolveModuleDatabases` for the modules the caller may see. Add a test that runs
the mover and then asserts a subsequent module write produces an activity row.

---

### MAJOR 13 · An exact `COUNT(*)` runs on every list read and every page
`workers/tenancy/src/lib/activity-read.ts:102` · `workers/content/src/lib/help.ts:143–155,401` · `learning.ts:211` · `members.ts:97` · `invites.ts:126` · `selectable.ts:105`

R16 requires an exact server `COUNT(*)`. It is unmitigated: no cache, no
approximation, no maintained counter. On the two growing collections it runs
alongside **every page**, not just page one — page 40 of the activity feed still
counts the whole table. The team-scope count carries R18's
`related_table NOT IN (…)` predicate, which `idx_activity_recent (created_at
DESC, id DESC)` cannot serve, so it is a full index walk with a per-row filter.

Combined with Blocker 3, this is the single most expensive repeated query in the
system: every ping, for every viewer with the feed on screen.

**Tension with a Law:** R16 says the number must be an exact `COUNT(*)`. A
maintained counter fixes the cost and puts R16's exactness at risk. SCALING.md §8
already flags this as needing its own design pass — I agree, and I am **not**
proposing a silent change. The in-rule mitigation available today: cache the
count for a few seconds per (team, resource) inside the worker, and skip
recomputing it on pages after the first (the total cannot change between pages of
one keyset scroll any more than it already does).

---

### MAJOR 14 · Bulk doors are O(3n) sequential remote round-trips
`workers/content/src/lib/learning.ts:399–422` · `routes/learning.ts:117`

`bulkSetLearningActive` loops ids sequentially; each iteration is
`learningOrThrow` (a read) + the UPDATE + `logActivity` — three separate D1 REST
round-trips to `api.cloudflare.com`. At the `BULK_IDS_LIMIT` of 512 that is
~1,536 sequential HTTPS round-trips, then 512 more sequential `publishChange`
calls. At ~80 ms each that is **over two minutes** for one click. (Unmeasured —
arithmetic from the round-trip count, not a timing.)

R24 correctly declares this door `together` (order does not matter), so the
sequencing buys nothing.

**Fix.** One `UPDATE … WHERE id IN (…) AND deactivated_at IS NULL RETURNING id`
per chunk, plus one multi-row activity INSERT — but chunk to **≤ 100 bound
parameters** (see Major 15) or inline via `sqlValue` with a byte budget. Bound the
publish loop with `Promise.all` over small chunks.

---

### MAJOR 15 · Two queries build `IN (?, ?, …)` past D1's 100-parameter limit
`workers/content/src/lib/stakeholders.ts:53–60, 155–159` · `workers/content/src/lib/notify.ts:36–44`

D1's documented maximum is **100 bound parameters per query** (checked
2026-08-25). Two places build the list from a member set with no cap:

1. `getStakeholders` collects the ticket raiser + every mentioned id across up to
   500 replies + up to 500 manual adds + **every active admin in the team**
   (`adminUserIds`, an unbounded `SELECT user_id FROM team_members WHERE team_id
   = ? AND role_id = ?`), then calls `lookupUsers` with all of them. A tenant with
   more than ~99 admins — entirely ordinary at 250,000 people — exceeds the limit
   and the query throws. `.all()` propagates, so the ticket-detail door **500s**.
2. `notifyReplyAndMentions` passes `taggedUserIds` straight through;
   `routes/help.ts:192` filters them to strings but never caps the count. Swallowed
   (notify is best-effort), so a large mention list silently notifies nobody.

**Fix.** Chunk `lookupUsers` into ≤ 90-id batches and merge, and cap
`taggedUserIds` at the boundary with `requireIdList` (which already exists in
`shared/workers/bulk.ts` and throws a clean 400).

---

### MAJOR 16 · The per-tenant surge ceiling is sized below the yardstick
`workers/{content,data-ops,tenancy}/wrangler.jsonc` — `TEAM_LIMITER 6000/60s`

6,000 requests per 60 s per team, **per colocation** (SCALING.md §4.6 verified the
per-colo behaviour on staging). The yardstick is 25,000 concurrent sessions in
one tenant. At a modest one request per session per ten seconds that is 2,500
req/s for the tenant; a tenant concentrated in two or three geographies lands most
of it on two or three colos, i.e. ~800 req/s per colo against a ceiling of 100/s.
A large tenant behaving entirely normally is throttled, and there is no
per-tenant-size or per-plan ceiling.

**Fix.** Derive the ceiling from the team's member count (the same nightly job
that computes `shard_count` already has it), or move the per-tenant governor to
a Durable Object counter keyed by team so it is global rather than per-colo.

---

### MAJOR 17 · Every request in every tenant reads one D1 primary; read replication is off
`shared/workers/gating.ts:103` · `workers/auth/src/lib/sessions.ts:88` · `shared/workers/concurrency.ts:88–101`

Every single request does `whoAmI` (a `sessions JOIN users` read) and
`requireMember` (a `team_members JOIN teams` read) against the one shared core
database. Every mutation carrying an `Idempotency-Key` — which `FormShell` sets on
every form submit — adds an INSERT and an UPDATE to that same database. D1
processes queries one at a time per database, and there is exactly one of these
for the whole product.

D1 supports read replication (checked 2026-08-25: enabled per-database via
`read_replication.mode: auto`, and a Worker must opt in with the **Sessions API**,
`env.DB.withSession()`). Nothing in this repo uses `withSession` — grep returns
zero hits — so every read goes to the primary regardless.

**Why it matters.** This is the "across tenants" ceiling. Isolates scale in
milliseconds; the one database behind them does not scale at all.

**Fix.** Enable `read_replication.mode: auto` on the core database and route the
read-only paths (`whoAmI`, `requireMember`, `hasRight`) through
`withSession("first-unconstrained")`, keeping the idempotency claim and every
write on `first-primary`. This is a config change plus one seam, not an
architecture change.

---

### MAJOR 18 · Nothing is virtualised, and the paged cache holds 2,000 rows per entry
`web/` (zero hits for any virtualisation library) · `web/lib/store.ts:38`

A 1,000-row members list renders 1,000 DOM rows. A paged collection appends into
one cache entry up to `MAX_ROWS_PER_ENTRY = 2,000` and renders all of them.

Documented in SCALING.md §8 as blocked because the collection components live in
`@swift-struck/ui`, and CLAUDE.md forbids editing the library from this repo. **A
commit in this repo cannot fix this** — see CEILING.

---

### MAJOR 19 · The collections that scale with the yardstick are capped at 1,000
`workers/tenancy/src/lib/members.ts:54` · `learning.ts:196` · `selectable.ts` · `shared/rules/registry.ts:GROWING_COLLECTIONS`

`GROWING_COLLECTIONS` contains exactly two entries — `help` and `activity`.
`members` is not one of them, so R14's paging half never applies to the one
collection the yardstick is defined by: 250,000 people against a 1,000-row cap.
`learning` and `selectable_data` are in the same position.

R14's own words are "a collection that GROWS with ordinary use must PAGE
instead… a cap is an honest refusal to answer". A tenant reaching 250,000 people
is ordinary use by this product's own definition. The law is green because the
registry does not name the table — the check is correct; the declaration is
wrong.

**Fix.** Add `members` (and `learning`) to `GROWING_COLLECTIONS` and give them the
same `pagedJson` + keyset treatment `help` already has. Blocker 4's fix must land
first, or `oneMember` will still read a page-worth of rows per mutation.

### MINOR 20–26

| # | What | Where | Fix |
|---|---|---|---|
| 20 | The split valve (`queryModule` / `d1QueryAcross`) is dead code, and `toPage` derives ONE cursor from merged rows — arithmetically wrong across databases. Nothing stops a module wiring it. | `sharding.ts:177` · `paging.ts:76` | Mark `queryModule` `@internal`/unused with a test, or make the cursor carry a position per database before anything may call it |
| 21 | 4 owner/maintenance handlers build SQL inline, so moving those tables means editing route files | `tenancy/src/routes/admin.ts:20,29,53`, `routes/team.ts:101` | Move them behind a lib helper like every module route |
| 22 | No growth **rate** is recorded — `db_alerts` stores a point-in-time `size_bytes` with no history, so "when will we hit this" is unanswerable. The alarm's log line still says ">=80% of cap" after the threshold moved to 65%. | `sharding.ts:92–94` | Keep a nightly `db_sizes` row per database; fix the message |
| 23 | The four nightly jobs share one `try`/`catch` — a throw in the first cancels the other three, silently, for that night | `tenancy/src/index.ts:174–199` | One try/catch per job; record each failure separately (R12 already requires the recording) |
| 24 | The two client-cache ceilings **multiply** (500 entries × 2,000 rows = a 1,000,000-row worst case), with no byte accounting, and eviction skips every mounted key by design | `web/lib/store.ts:26,38,62–77` | A total-row budget across entries, or measure bytes |
| 25 | `d1-rest` retries with a fixed `250 ms × attempt` and no jitter, so a D1 5xx blip synchronises every worker's retries | `shared/workers/d1-rest.ts:32` | Add jitter: `250 × attempt × (0.5 + Math.random())` |
| 26 | `SELECT *` on the shared `users` table (and `login_codes`) defeats covering indexes; the mover copies with `SELECT *` too | `auth/src/lib/users.ts:35`, `profile.ts:98`, `auth/src/index.ts:229` | Name the columns |

Also noted and **not** findings, having been checked and found sound: idempotency
(`shared/workers/concurrency.ts` — the PK claim, the in-progress 409, the release
on failure, the owner+route check), credit atomicity, the R11 timeout seam,
`shardCount` monotonicity, R2 range reads, the 0007/0008 index migrations, the
reconnect resync path, and the fact that every list read in the repo really is
bounded (I re-derived this from source rather than trusting the R14 check).

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **B1** Fail closed when the orphan-sweep reference read truncates | `workers/tenancy/src/lib/sharding.ts`, `workers/tenancy/test/retention.test.ts` | ADDS ~6 lines + a test; REMOVES silent data loss | **lean_mean** — one more test file grows. **spend_review** — files that would have been deleted are now kept and billed. Correct trade: an orphan costs cents, a deleted attachment is unrecoverable |
| **B2** Loop the retention sweep to a budget | `workers/tenancy/src/lib/sharding.ts` (`sweep`), `shared/workers/retention.ts` | ADDS a loop + a shortfall counter | **spend_review** — many more D1 row-deletes per night (billed as rows written). **speed_review** — the cron runs longer. Both are the point |
| **B3.1/3.2** Debounce + scope the activity invalidation; coalesce ping-driven refetches | `web/components/app-shell.tsx`, `web/lib/use-live-refetch.ts`, `web/lib/store.ts` | ADDS a small buffer/timer; REMOVES up to 25,000 reads per write | **realtime_review** — a debounce delays a live update by up to 250 ms and could read as "less live". **round_trip_review** — strictly helps (fewer requests per event). **lean_mean** — a timer is more code |
| **B3.3** Scope the broadcast server-side by declared resource | `workers/realtime/src/index.ts`, `web/lib/realtime.ts` | ADDS a subscription message; REMOVES pings nobody uses | **realtime_review** — the DO now holds per-socket state, which fights hibernation's "stores no application data". **architecture_review** — the realtime worker stops being module-agnostic, which ARCHITECTURE.md values |
| **B4** Give each `one*` its own `WHERE id = ?` read behind a shared projection | `workers/content/src/lib/learning.ts`, `workers/tenancy/src/lib/{members,roles,selectable,invites}.ts` | ADDS 5 small reads + one shared column constant; REMOVES 5 full-list reads per mutation | **lean_mean** — five more functions. **activity_log_review / round_trip_review** — neutral. Guards R21/R23 rather than breaking them, provided the shared projection lands |
| **5** Widen the size-alarm filter to `-ops` | `workers/tenancy/src/lib/sharding.ts`, a test | ADDS one regex clause + one assertion | none — a one-line filter widening with no runtime cost |
| **6** Send the owner an email on a newly-opened `db_alerts` row | `workers/tenancy/src/lib/sharding.ts` | ADDS one `callService` to the existing sender | **spend_review** — a handful of emails a year. **security_sentry_review** — a new outbound path from a cron; must not carry customer data (it carries a database name and a byte count) |
| **7** Give the nightly team walk a cursor and a subrequest budget | `workers/tenancy/src/lib/sharding.ts`, `db/core/*` (a cursor row) | ADDS state + a loop; REMOVES a silent partial run | **lean_mean** — more machinery. **architecture_review** — a new piece of persistent cron state to own |
| **8** Batch the expired-session DELETE through `sweep()` | `shared/workers/retention.ts`, `workers/tenancy/src/lib/sharding.ts` | REMOVES a special case (net less code) | **lean_mean** — helps. Interacts with B2: without B2 the batching makes session pruning *slower* |
| **9** A retention rule per growing team table + a derive-don't-list test | `shared/workers/retention.ts`, `workers/tenancy/test/retention.test.ts` | ADDS ~6 rules + one test | **activity_log_review** — any non-`KEEP_FOREVER` window on `help_threads` or `invite_logs` shortens an audit trail; ship them all `KEEP_FOREVER` and let the owner choose. **story_checks_out** — SCALING.md §4's table must be updated with them |
| **10** An `activity` archive database + a fallback read (Tier C, plan only) | `sharding.ts`, `activity-read.ts`, DATA-MODEL.md | ADDS a second read path for record history | **architecture_review** — a new datastore per team raises the service graph's fan-out. **activity_log_review** — helps (history survives instead of being deleted). **speed_review** — a record-history read may now hit two databases |
| **11** Keyset + byte-budgeted copy in the mover, with resume | `workers/tenancy/src/lib/sharding.ts` | ADDS a byte accumulator + a resume marker; REMOVES `OFFSET` | **lean_mean** — the mover grows. **base_fork_review** — forks inherit a more complex but working valve |
| **12** Create `activity` (+ its indexes) in every module database the mover makes; feed reads across module DBs | `sharding.ts`, `team-schema.ts`, `activity-read.ts`, a test | ADDS schema creation + a merged read | **activity_log_review** — directly helps (closes an R25 hole). **speed_review** — the team feed may fan across databases. **architecture_review** — write-ownership of `activity` becomes per-module |
| **13** Cache the R16 count briefly per (team, resource); skip recount on pages after the first | `workers/*/src/lib/*` count helpers, `shared/workers/paging.ts` | REMOVES the repeated `COUNT(*)`; ADDS a short in-isolate cache | ⚠️ **Tension with Law R16** — the number stops being exact-at-this-instant. Do not ship without the owner's decision. **realtime_review** — a badge could lag a ping by seconds |
| **14** Set-based bulk UPDATE + chunked publish | `workers/content/src/lib/learning.ts`, `help.ts`, `tenancy/src/lib/selectable.ts` | REMOVES ~1,500 round-trips per bulk call | ⚠️ **R17** — the idempotent per-row predicate must ride the set UPDATE and `RETURNING id` must drive the activity rows and pings, or zero-row silence is lost. ⚠️ **R24** — only `together` doors may do this; an `in-order` twin must stay sequential. **activity_log_review** — the per-row activity rows must survive |
| **15** Chunk `lookupUsers` at ≤ 90 ids; cap `taggedUserIds` with `requireIdList` | `workers/content/src/lib/{stakeholders,notify}.ts`, `routes/help.ts` | ADDS a chunk loop; REMOVES a 500 at scale | **round_trip_review** — more queries per stakeholder read (chunked). **security_sentry_review** — helps: an uncapped, unvalidated user-supplied array becomes a validated one |
| **16** Size the per-tenant ceiling from member count, or move it to a DO counter | `wrangler.jsonc` ×3, `shared/workers/gating.ts` (or a new DO) | ADDS a lookup or a coordination object | **realtime_review / architecture_review** — a DO on the request path is a new hot spot and a new failure mode. **speed_review** — a DO round-trip on every gated request. The config-only variant is neutral |
| **17** Enable D1 read replication; `withSession` on read-only core paths | `shared/workers/gating.ts`, `workers/auth/src/lib/sessions.ts`, D1 config | ADDS a session seam; REMOVES the single-primary read ceiling | ⚠️ **security_sentry_review / architecture_review** — a replica can be behind the primary; a permission check reading a stale replica could allow a just-revoked right for seconds. Membership and permission reads may need `first-primary`; only genuinely non-authorising reads should go unconstrained. This is the one fix that needs a security opinion before it ships |
| **18** List virtualisation | **`@swift-struck/ui` — a different repo** | — | Cannot be done here (CLAUDE.md: the library is lego, never forked into the host). Surface it, do not fix it |
| **19** Add `members` + `learning` to `GROWING_COLLECTIONS` and page them | `shared/rules/registry.ts`, `workers/tenancy/src/lib/members.ts`, `routes/members.ts`, `web/` member screens | ADDS keyset paging + `LoadMore` | ⚠️ **R16** — a paged screen must still badge the WHOLE collection, so the `COUNT(*)` cost of fix 13 lands here too. ⚠️ **R15** — the paged screen must subscribe via `useLiveRefetch`, which feeds Blocker 3. **round_trip_review** — page two is one more request |
| **20–26** the minors | as listed | small, local | 22/23 ADD lines (**lean_mean** −). 25 (jitter) **speed_review** — a retried request waits marginally longer. 26 (`SELECT *`) neutral |

---

## CEILING

**Is 95 reachable by changing code in this repository? No. The true maximum is 94.**

Two criteria are capped by something no commit here can touch:

- **Client data volume (weight 9) is capped at 75.** The "long lists virtualised"
  signal requires the collection components in `@swift-struck/ui`. CLAUDE.md is
  explicit: "The UI library is lego, not this repo… Do not edit the library from
  here." Until the library ships virtualisation, this dimension cannot exceed
  coverage 3/4.
- **File & object storage (weight 8) is capped at 86.** Presigned
  direct-to-storage needs an R2 API token the owner declined on 2026-08-12
  (SCALING.md §8). That is a decision, reversible by the owner, not by a commit.

Two more are capped by **Laws of the Base**, and I am naming them rather than
proposing to break them:

- **Query shape (weight 13) tops out at 88.** R16 requires an exact server
  `COUNT(*)` on every collection. The only fix that removes the O(n) cost is a
  maintained counter, which puts R16's exactness at risk. SCALING.md §8 already
  says this needs its own design pass. I agree; it is not a repair.
- **Write fan-out (weight 7) tops out at 88.** Coalescing a bulk door's per-row
  pings into one collection ping contradicts CACHING rule 3 and R1. Debouncing and
  scoping on the *client* side (Blocker 3, fixes 1 and 2) is in-rule and recovers
  most of the loss; the last major needs a law-level decision.

With every other finding fixed:

```
partitioning 100×12 + queries 88×13 + contract 100×7 + headroom 100×8
+ clientvolume 75×9 + clientcache 100×9 + surge 100×6 + atomic 100×11
+ fanout 88×7 + lifecycle 100×5 + elastic 100×5 + storage 86×8
= 1200 + 1144 + 700 + 800 + 675 + 900 + 600 + 1100 + 616 + 500 + 500 + 688
= 9423 ÷ 100 = 94
```

**95 requires exactly one of two things outside this repo:** the UI library
shipping list virtualisation (+9 points of headroom on client volume), or the
owner granting the R2 API token for presigned uploads (+14 on storage). Either
alone clears 95.
