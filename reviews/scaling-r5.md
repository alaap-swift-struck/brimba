# Scaling review, round 5 — Brimba · 2026-08-26

SCORE: **72/100**   (round 1: 54 · round 2: 57 · round 3: 63 · round 4: 66)

Mode: **ANALYSE only**. Nothing in this repository was changed except this file.
Measured at `review-round5` @ `f30f954`, which is HEAD. I wrote none of the
repairs this round scores.

**Platform, from the scan and confirmed by reading the deploy config:** Cloudflare
Workers (serverless isolates) · Cloudflare D1 (SQLite at the edge, reached both by
native binding and over the HTTPS REST door) · Cloudflare R2 · Durable Objects.
No queue, no KV, no IaC. `platform.unknown` is false.

**Platform limits looked up live on 2026-08-26**, not recalled:

| Limit | Value (Workers Paid) | Source |
|---|---|---|
| Subrequests per invocation | **10,000** | developers.cloudflare.com/workers/platform/limits |
| Simultaneous outgoing connections | **6** | same |
| Cron trigger wall clock | **15 min** | same |
| Memory per isolate | **128 MB** | same |
| D1 database size | **10 GB** | developers.cloudflare.com/d1/platform/limits |
| D1 databases per account | **50,000** (raisable by request) | same |
| D1 queries per Worker invocation | **1,000** | same |
| D1 bound parameters per query | **100** | same |
| D1 statement duration | **30 s** | same |

`SCALING.md §1` records the same figures with a check date of 2026-08-11. Every
one of them still holds fifteen days later. The one the document does **not**
carry is the 6-connection ceiling, which two paths in this codebase meet.

---

## A note on the arithmetic, before any number

The rubric's published formula is:

```
coverage  = good_signals_present / good_signals_applicable
penalty   = Σ over CONFIRMED findings:  blocker 25 | major 12 | minor 4
dimension = clamp(0, 100, round(100 × coverage − penalty))
total     = round( Σ (dimension × weight) / Σ weights )
```

Two things about applying it honestly, both stated here so anyone can recompute:

**1 · The weight table, not the section headings.** The rubric prints weights
twice and they disagree. The table under *"Scoring arithmetic (do not
improvise)"* gives 12/13/7/8/9/9/6/11/7/5/5/8, which sums to 100 and says
"Weights sum to 100". The per-section headings give 14/14/8/10/10/10/8/12/8/6/5/8,
which sums to **113**. The table is the one marked authoritative and the one that
sums to its own stated total, so I use it. Round 4 used the same table.

**2 · One defect is charged once.** Where a confirmed finding *is precisely the
good signal that is absent*, I count it as the missing coverage signal and do not
also levy its penalty. The formula is unchanged — what changes is what counts as
a distinct confirmed finding. Without this rule a dimension is charged twice for
one line of code whenever the defect happens to line up with a listed signal, and
dimensions stop being comparable between rounds. **Every place this rule bites is
marked `[charged once]` below.** Under the literal double-charge reading the
score is **68** rather than 72; both are derived in full at the end so a reader
can take either. I stand behind 72.

---

## Arithmetic

| # | dimension | key | coverage | penalties | score | wt | product |
|---|---|---|---|---|---:|---:|---:|
| 1 | Data partitioning & sharding | `partitioning` | 4/4 = 100 | −12 −12 | **76** | 12 | 912 |
| 2 | Query shape & indexing | `queries` | 2/3 = 67 | −12 −4 | **51** | 13 | 663 |
| 3 | Endpoint contract stability | `contract` | 4/4 = 100 | −12 | **88** | 7 | 616 |
| 4 | Growth triggers & headroom | `headroom` | 3/3 = 100 | −12 −4 −4 | **80** | 8 | 640 |
| 5 | Client data volume & lazy loading | `clientvolume` | 3/4 = 75 | −12 | **63** | 9 | 567 |
| 6 | Client cache freshness & bounds | `clientcache` | 4/4 = 100 | −4 −4 −4 | **88** | 9 | 792 |
| 7 | Surge self-protection | `surge` | 4/5 = 80 | −4 −4 | **72** | 6 | 432 |
| 8 | Sequential, atomic & contended ops | `atomic` | 4/4 = 100 | −12 −4 | **84** | 11 | 924 |
| 9 | Write fan-out & realtime | `fanout` | 2/3 = 67 | −12 | **55** | 7 | 385 |
| 10 | Bulk paths, migrations & lifecycle | `lifecycle` | 2/3 = 67 | −4 −4 | **59** | 5 | 295 |
| 11 | Elastic response time | `elastic` | 2/2 = 100 | −4 −4 | **92** | 5 | 460 |
| 12 | File & object storage | `storage` | 6/7 = 86 | −12 −4 | **70** | 8 | 560 |
| | | | | | | **100** | **7246** |

```
912+663 = 1575; +616 = 2191; +640 = 2831; +567 = 3398; +792 = 4190;
+432 = 4622; +924 = 5546; +385 = 5931; +295 = 6226; +460 = 6686; +560 = 7246
7246 / 100 = 72.46  ->  SCORE 72
```

**Dimension 11 applicability.** On isolates, three of the rubric's five `elastic`
good signals cannot exist and are excluded from the denominator, per the
applicability table: warm/minimum capacity (N/A), autoscaling targets (N/A), and
a connection pooler (N/A — D1 is HTTP-native over the REST door and in-process
over the native binding; there is no pool to exhaust). Two remain and both are
present: expensive setup reused across invocations (`shardMemo`, a module-level
`Map` with a 60-second TTL, `workers/realtime/src/index.ts:77-100`) and readiness
signalling (`/health` on all seven workers). Capacity arrives in milliseconds by
construction, so the dimension is close to free — and the report says so rather
than banking the points silently.

---

## DELTA — 66 → 72, and the cause of each move

| # | dimension | wt | R4 | **R5** | Δ | cause |
|---|---|---:|---:|---:|---:|---|
| 1 | `partitioning` | 12 | 64 | **76** | +12 | **the last measurement was wrong.** R4 carried finding **MOVER** — "relocates tables and orphans the reads" — as open. It was closed on 2026-08-11, before R4 measured: `moduleDatabase()` (`shared/workers/gating.ts:164-189`) routes every module read, gated on the `teams.moved_modules` counter the mover increments (`sharding.ts:478-482`), so an unmoved team pays nothing. Offset by one finding R4 never looked for — placement |
| 2 | `queries` | 13 | 45 | **51** | +6 | **code changed.** Core `0018_speed_indexes` and team `0009_speed_indexes` landed with EXPLAIN-checked reasoning, three declines and three redundant-index drops. R4's carried **INDEXES** finding is stale in every part: the `activity (created_at DESC, id DESC)` composite arrived in team `0007`, the help sort index in `0007`, the thread composites in `0007` and `0009` |
| 3 | `contract` | 7 | 59 | **88** | +29 | **the last measurement was wrong.** R4 scored 59 without arithmetic. All four of the rubric's good signals are present and were present in round 4: zero SQL in route handlers, one data-access helper layer, one tenant resolver, a shard-count-independent response shape |
| 4 | `headroom` | 8 | 78 | **80** | +2 | **code changed, net small.** The digest, the heartbeat and the mailer-failure guard are real and large. Against them, R4's finding **RATE** ("no growth rate recorded") is only half closed, and the half that closed is the half that matters least |
| 5 | `clientvolume` | 9 | 62 | **63** | +1 | **both.** The library does ship auto-virtualisation (R4 right, its ceiling wrong) but `web/` uses it at 3 of ~10 long-list sites (R4 wrong); and the threads repair regressed reachable history from 1,000 to 50 (code changed, for the worse) |
| 6 | `clientcache` | 9 | 92 | **88** | −4 | **the last measurement was wrong.** R4 gave 92 without naming the soft ceiling on eviction. One of the three minors is new (the coalescer's captured `teamId`) |
| 7 | `surge` | 6 | 64 | **72** | +8 | **code changed.** Jitter on the D1 retry (`d1-rest.ts:162`) is new this round and is the rubric's named fix for synchronised retries |
| 8 | `atomic` | 11 | 88 | **84** | −4 | **the last measurement was wrong.** The import's per-row writes carry no idempotency key on a door that supports one — the rubric's "non-idempotent create becomes a duplicate record. Major" verbatim, and `SCALING.md:549` claims the opposite |
| 9 | `fanout` | 7 | 42 | **55** | +13 | **code changed.** R4's finding **C** is closed: `app-shell.tsx:56` now reads `if (activityTimer) return`, the coalesce its comment always claimed. Commit `ab43382`, titled for it |
| 10 | `lifecycle` | 5 | 34 | **59** | +25 | **code changed.** `migrate-teams` is keyset-resumable at 50 teams a call (`admin.ts:55-95`), which closes R4's **LIFECYCLE** finding *and* the "PLATFORM cap of 75" it justified. The retention sweep became bounded and multi-pass with a shortfall alarm. The restore drill is proven and dated (`OPERATIONS.md:414-430`) |
| 11 | `elastic` | 5 | 84 | **92** | +8 | **the last measurement was wrong.** R4 scored 84 against a rubric that makes three of five signals N/A on isolates; excluding them, as the applicability table instructs, the two that remain are both present |
| 12 | `storage` | 8 | 70 | **70** | 0 | **both, cancelling.** The cursor and the meter are real gains; against them, the bucket listing has no cursor, so a team above 10,000 objects is never swept past its first page — on any night, ever |

**Six of twelve moved because the previous measurement was wrong, not because the
code did.** That is the same disease `ROUND5-RECONCILIATION.md §1` found in the
campaign's closing scores, one round later and in this review's own file.

**Closed this round, verified individually and named so they are not re-filed:**
`MOVER` (routing exists and is reachable) · `INDEXES` (all three landed, in `0007`
and `0009`) · `E`, the two-lockfile split (both lockfiles now resolve
`@swift-struck/ui` to `364eea79`, byte-identical) · `C`, the debounce
(now a coalesce) · `LIFECYCLE`, the serial migration robot (resumable).

---

## Findings

### 1 · MAJOR — placement is an accident, and it is 60–85% of every response

`shared/workers/d1-rest.ts:207-213`

```ts
export async function d1CreateDatabase(cfg: D1Rest, name: string): Promise<string> {
  const result = await cf<{ uuid: string }>(cfg, "/d1/database", { name })
  return result.uuid
}
```

No `primary_location_hint`. `grep -rn "primary_location_hint\|location_hint"` over
the whole tree returns nothing. Every team database lands wherever Cloudflare put
it on the day the create call ran, and the core database landed wherever it landed
in 2026.

The consequence is measured, not argued. `scripts/timings.mjs:217-222`:

> *"apart from the same laptop, is served from Amsterdam once and Singapore the
> next … one core read cost 245 ms from AMS and 90 ms from SIN; one team read cost
> 50 ms from AMS and 207 ms from SIN. Nothing in the app changed."*

The core database is in APAC. The team databases are in WEUR. **Every gated
request touches both**: `teamContext` reads `requireMember` from the core database
(`gating.ts:148-153`) and then every module lib reads the team database over the
REST door. One request, two continents, and the two halves are on opposite sides
of it — so no colo is close to both, and moving the client only trades which half
is slow.

Every SQL statement in this app runs in 0.1–0.3 ms. The latency is distance. The
yardstick names *"all time zones and at least five geographies"*, and per-tenant
sharding's single largest latent win — putting a tenant's data near that tenant —
is unavailable because the create call makes no placement decision at all.

**This is an owner decision, and it has not been made.** It is not a bug to fix
quietly: `primary_location_hint` is set at creation and cannot be changed
afterwards, so a wrong default is permanent per tenant, and the existing databases
would need a migration to move. What the code owes today is (a) the parameter
plumbed through `d1CreateDatabase` with the hint taken from a var, so a fork or a
new tenant can be placed deliberately, and (b) the choice for the core database
written down as a decision rather than left as an accident.

### 2 · MAJOR — the shared core database still carries every tenant, with no mover

`workers/tenancy/src/lib/sharding.ts:60-68` says it in terms: *"nothing can move a
module out of it. Its alarm means 'partition or prune', not 'run the mover'."*

Four relief valves exist. Two of them (mover, split) do not apply to the core
database. `SCALING.md §5.2` writes the partitioning plan and does not build it.
`users`, `team_members`, `sessions`, `invite_index` and `account_activity` hold
the sum of every tenant in one 10 GB D1, and `account_activity` is `KEEP_FOREVER`
by an owner decision.

Arithmetic for when: a 250,000-member tenant contributes roughly 250k users +
250k memberships + live sessions at ~1.5 KB each with indexes ≈ **0.4 GB at
rest**, plus `account_activity` growing forever at roughly 2 rows/user/month ×
600 B ≈ **0.3 GB/year**. Ten gigabytes therefore holds about **20–25 tenants of
250,000 people** before the history alone finishes it — which lands exactly on the
yardstick's *"dozens of large tenants"*.

### 3 · MAJOR — an exact `COUNT(*)` rides every paged read

62 `COUNT(*)` sites across 33 files. The three paged doors each pair a keyset page
with an exact server count: `pagedJson` (`shared/workers/http.ts:30-35`) declares
`total` non-optional, and `activity`, `help` and `agent_threads` are the three
fastest-growing team tables.

**I am not re-filing the fix.** `ROUND5-RECONCILIATION.md §3` settles it: the
count skip was investigated, the client-side risk turned out to be imaginary, and
it was refused anyway for a better reason — `shared/workers/tool-catalog.ts`
promises the agent and MCP surfaces "ONE page plus the exact `total`", and those
callers get the raw body with no sidecar. Page two would hand a model no total and
invite it to count its own rows, which is the exact Law R16 failure the seam
exists to prevent. That is correct and it is settled.

The rubric still scores the shape — *"`COUNT(*)` on a growing table is O(n). Is it
cached, approximated, or maintained incrementally? Unmitigated on a hot path is
major"* — and the honest answer is that it is unmitigated. **These 1.56 points are
the price of Law R16, and they will stay paid until a cached counter gets its own
design pass.** Recording it as a priced ceiling rather than a finding is the whole
difference between a decision and a drift.

### 4 · MAJOR — the growth meter meters the wrong database `[R4's finding RATE, half open]`

Migration `db/core/0019_nightly_state.sql` says what the meter is for:

> *"One row per database per night turns 'is this tenant getting bigger, and how
> fast' from a guess into a slope somebody can read."*

That is not what the code writes. The **only** `INSERT INTO db_sizes` in the
repository is `workers/tenancy/src/lib/housekeeping.ts:372-376`:

```ts
    await env.DB.prepare(
      "INSERT INTO db_sizes (database_id, name, size_bytes, at) VALUES (?, ?, ?, ?)"
    )
      .bind(team.database_id, `r2:learning-media/${team.id}`, kept, at)
```

It records **R2 bytes for one bucket**, for the 200 teams on tonight's rota. It
never records a D1 database size. And `checkDatabaseSizes` (`sharding.ts:251-295`)
holds `db.file_size` for *every* database — core, ops and every team — on the same
nightly pass, and discards it unless it is over 80%:

```ts
  for (const db of watched) {
    if ((db.file_size ?? 0) < ALERT_THRESHOLD_BYTES) continue
```

So the D1 slope — the one that decides when the 10 GB cap arrives, which is what
all four relief valves exist for — is still unanswerable, four rounds after R4
first filed it. The fix is one `INSERT` inside a loop that already runs, into a
table and two indexes that already exist.

Two smaller facts in the same place, both confirmed:

- **`db_sizes` is pruned twice, with two different windows.**
  `housekeeping.ts:393` deletes at a hardcoded `DB_SIZES_RETAIN_DAYS = 90`.
  `CORE_RETENTION` (`shared/workers/retention.ts:95-101`) has the same table at
  `days: 90, envVar: "RETAIN_DB_SIZES_DAYS"`. The TODO at `housekeeping.ts:385-392`
  says the rule "is not this change's to edit" and to *"DELETE the statement below
  rather than leaving both"* once it lands. **It has landed.** So
  `RETAIN_DB_SIZES_DAYS` is a dead knob for any value above 90 — the sweep keeps
  365 days and the hardcoded delete, which runs later in the same pass, removes
  them again. `[minor]`
- **Nothing reads `db_sizes`.** Its only non-test references are the writer, the
  pruner, the schema and the migration. A meter with no reader is the same shape
  as a record with no reader, which is the disease the nightly digest was built
  this round to cure, one meter down.

### 5 · MAJOR — the threads repair made the reachable history 20× smaller

The server half is exactly as the brief describes. `workers/data-ops/src/lib/threads.ts:65-83`
is keyset-paged, `LIMIT PAGE_SIZE + 1`, and `threads.ts:58` records that *"This was
`LIMIT 1000`"*. The door assembles `pagedJson` with an exact total
(`routes/agent.ts:182-183`). All correct.

The client cannot reach page two. `web/lib/api.ts:551`:

```ts
  agentThreads: () => api<{ threads: AgentThread[] }>("/api/data-ops/agent/threads"),
```

No `cursor` parameter; the response type discards `total`, `hasMore` and
`nextCursor`. Its only consumer (`web/components/agent-history-dialog.tsx:45-49`)
calls it once on open and renders `r.threads` inside a hand-rolled `<ul>` with no
`LoadMore`. The `LoadMore` component exists and is wired at exactly two other
sites — activity and tickets (`web/components/deep-link/module-content.tsx:156,349`).

**So a user who could previously see 1,000 conversations can now see 50, and there
is no control anywhere that reaches the 51st.** Law R14 requires "a client that
can reach page two"; for this collection there is none. Every other property the
repair claimed is real; this one was not carried across.

### 6 · MAJOR — paging does not survive the fan-out the split valve is for

`shared/workers/paging.ts:42-62` encodes one cursor as `(sortValue, id)` — a single
position in a single database. `d1QueryAcross` (`d1-rest.ts:261-278`) runs the
query against N databases and returns `settled.flatMap(...)` — **no merge sort, no
re-applied LIMIT, no per-shard position.**

The day the SPLIT valve is wired (`SCALING.md §5.3`, listed as a plan), the three
paged doors return the same response *shape* with wrong *contents*: up to N × 51
rows, unsorted across shards, and a cursor that means nothing to N−1 of them. The
rubric asks this dimension's question directly — *"cursor tokens that encode
per-shard position are the fix"* — and the answer is that they do not.

Latent, not live. It is scored because the dimension exists to measure readiness,
and "we have not wired the thing that would break it" is not readiness.

### 7 · MAJOR — the import writes one gated HTTP door call per row, without an idempotency key

`workers/data-ops/src/lib/import.ts:503-512` loops `parsed.rows` and calls
`writeRow` for each. `writeRow` (`:389-399`) calls `forwardToDoor` — and
`forwardToDoor` **accepts** `idempotencyKey` (`shared/workers/http.ts:49-54`,
whose comment says *"A MACHINE caller is the likeliest retrier there is"*) — and
`writeRow` does not pass one.

The failure path releases the claim so the run can be retried (`import.ts:517-523`).
A retry therefore starts at row 1 and recreates every row already written. There
is no per-row dedupe and no resume cursor.

`SCALING.md:549` says: *"Import resumability — an import that fails restarts. The
claim-flip makes that safe, just not cheap."* **The claim-flip makes a retry
possible; it does not make it safe.** It prevents two concurrent runs. It does
nothing about the 998 rows the first run already created.

The bulk door exists — `writeParcel` (`import.ts:423-448`), added in `fb61e02`
("the bulk door nothing could open") — and this path does not use it. A 1,000-row
import is 1,000 service-binding subrequests, each of which itself does a `whoAmI`
hop, a core-database `requireMember`, a D1 REST write and a live publish. Against
a 10,000-subrequest ceiling that fits; against wall clock at the measured
per-request cost it is minutes.

### 8 · MAJOR — one write still costs one read per interested session

The locked half is right and holds. `ROUND5-RECONCILIATION.md §2` confirms the
contentless-ping decision survived contact with the source: a ping carries
`{resource, id, op}` and never row data, which is what stops a client without
rights learning a field through the live channel. That is correct, and it means
every connected client **must** issue a read to learn what changed.

What is scored is what sits on top of it. `web/components/app-shell.tsx:197-221`,
on every ping: one `patchRow(...)` → `r.fetchOne(id)`, plus the `deps` fan-out.
For `help` that is **six** invalidations (`web/lib/live-resources.ts:268-275`):

```ts
    deps: (t, id) => [
      `activity:record:help:${id}`, `help-stakeholders:${id}`, `help-mine:${t}`,
      `help-thread:${id}`, `total:help-thread:${id}`, `help-one:${id}`,
    ],
```

`help-mine:<team>` is a team-wide collection. **Only `activity:team:` is
coalesced.** At the yardstick — 25,000 concurrent sessions in one tenant — one
help edit is 25,000 single-row reads plus up to 150,000 cache invalidations, each
of which becomes a fetch on any screen holding that key. A 512-id bulk action is
512 pings: the feed refreshes once, and the other two costs multiply by 512.

R4's finding C is genuinely closed — `app-shell.tsx:56` is `if (activityTimer)
return`, and I read the four lines rather than the comment above them. What R4
called costs 2 and 3 are byte-for-byte where it left them.

### 9 · MAJOR — a team above 10,000 objects is never swept past its first page

`workers/tenancy/src/lib/housekeeping.ts:355`:

```ts
    const listed = await env.LEARNING_MEDIA.list({ prefix: `${team.id}/`, limit: ORPHAN_SCAN_CAP })
```

No `cursor`, no `startAfter`. R2 returns keys in lexicographic order, so this
returns **the same first 10,000 keys every night, for ever**. The handling of the
overflow is one line, `:377-378`:

```ts
    if (listed.truncated)
      console.warn(`orphan sweep: team ${team.id} has more than ${ORPHAN_SCAN_CAP} objects — the rest wait for tomorrow`)
```

Tomorrow lists the same first 10,000. The tail is uncollectable orphan storage
that grows without bound and is announced only to a console nobody tails at 3am.

This is worth stating plainly because it is the *same shape* the retention half of
this very file was rewritten to remove this round: a bound that reports like a
rota. `SWEEP_MAX_PASSES` was added precisely because *"a partial sweep that reports
like a complete one is how the old ceiling stayed invisible for months"*
(`housekeeping.ts:87-92`). The sentence is right, and the sweep twenty lines below
it still does exactly that.

The `list` response carries `cursor` when `truncated`. Threading it through the
existing `nextCursor` return would make the object walk a rota the way the team
walk already is.

### 10 · The minors, in one place

| # | dim | finding | file |
|---|---|---|---|
| a | `queries` | `SELECT *` at 7 sites / 6 files, including `SELECT * FROM users WHERE email = ?` on the sign-in path. `users` is the widest core table; all are unique-index lookups returning one row, so it is width not scan | `auth/src/lib/users.ts:36`, `profile.ts:102`, `auth/src/index.ts:253` |
| b | `headroom` | `db_sizes` pruned twice; `RETAIN_DB_SIZES_DAYS` is a dead knob above 90 | `housekeeping.ts:393` vs `retention.ts:95-101` |
| c | `headroom` | the retention shortfall alarm still writes into the store whose overflow it may be reporting (`error_logs` is one of the five swept rules). Now one row per run rather than per rule, so much smaller than R4 found it — the shape is unchanged | `housekeeping.ts:200-204` |
| d | `clientcache` | the cache bound is **soft**: `evictable()` pins any key with subscribers and `cacheSet` always succeeds even when that exceeds `MAX_ENTRIES`. Worst case 500 × 2,000 = 1,000,000 rows, with no byte ceiling anywhere | `web/lib/store.ts:152-188` |
| e | `clientcache` | the coalescer is module-level and captures whichever `teamId` opened the window. Switching teams inside the 1 s window refreshes the **old** team's feed | `app-shell.tsx:44-63` |
| f | `clientcache` | `MAX_AGE_MS = 4h` is the revalidate ceiling for a tab open all day. The blocker case (stale data after a permission change) is covered — `my-perms:` is invalidated on a members ping — so 4 hours is the residual, not the hazard | `store.ts:61,193-199` |
| g | `surge` | `POST /api/content/help/reply` fans out to 51 concurrent Resend sends and is **not** in `HEAVY_PATHS`, so one caller at the general 600/min ceiling can emit 30,600 emails a minute | `rate-limit.ts:57-61` vs `notify.ts:106` |
| h | `surge` | `web/lib/realtime.ts:79-82` reconnects for ever with no attempt ceiling — rate-bounded at one per 15 s, unbounded in total. An abandoned tab against a down realtime worker knocks ~5,760 times a day | `web/lib/realtime.ts` |
| i | `atomic` | optimistic concurrency is server-complete and client-unadopted: `expectedVersion` is sent from exactly one screen. Roles, dropdowns and team edits go through doors that support it without using it, so a lost update is still the UI default | `help-detail.tsx:162` is the only sender |
| j | `lifecycle` | `SCALING.md §4` names the activity-growth trigger precisely — *"imported rows per month, not headcount"*, 18 months rather than 35 years — and **nothing measures imported rows per month** | `SCALING.md:203-210` |
| k | `lifecycle` | the O(tenants) walk was cursored in one of the two places it exists. `runRetention`'s team walk is still `d1ListDatabases` + a full loop with no cursor and no limit, behind a flag that is one environment variable from being on | `housekeeping.ts:169-186` |
| l | `elastic` | the D1 REST retry envelope is 3 × 15 s + ~1.1 s jitter ≈ **46 s** on one statement, against a D1 statement limit of 30 s. A hung door can hold a request open longer than the database could ever take to answer it | `d1-rest.ts:116,154-174` |
| m | `elastic` | **six** simultaneous outgoing connections per isolate (checked 2026-08-26). The ≤51-way `Promise.all` in `notify.ts:106` and the up-to-1,000 sequential door calls in the import both meet it. Neither fails; both queue, and nothing in the code models the queue | not in `SCALING.md §1` |
| n | `storage` | the orphan rota is 50 nights at 10,000 tenants, so an abandoned object is charged for up to 50 nights. `housekeeping.ts:243-251` argues this correctly and calls it *"a storage bill and not a data loss"* — which is right, and it is a bill nobody has priced | `housekeeping.ts:252` |

---

## The indexes that were declined — I agree with all of them

`db/core/0018_speed_indexes.sql` declines three and drops one; team `0009` drops
two and explicitly keeps one. I checked each against the query shapes rather than
against the reasoning:

| proposal | verdict | my reasoning |
|---|---|---|
| `teams(db_status)` — declined | **agree** | Every healthy team is `'ready'`, so it separates almost nothing; SQLite will decline a low-cardinality index it is offered. Both readers (the migration robot, the orphan sweep) want every one of those rows anyway, and both now seek on `id > ?` for their page |
| `member_roles(is_default)` — declined | **agree** | Two values over a handful of rows in one page. The index is more work than the scan |
| re-lead `idx_db_alerts_open` to `(resolved_at, database_id)` — declined | **agree** | `database_id` is the selective lead and is what both hot callers constrain. Only the operator's open-alerts list leads with `resolved_at`, against a table holding one row per over-threshold database. Re-leading would slow two to speed one |
| keep `idx_help_status` — kept | **agree** | It looks like the same case as the two drops and is not: `idx_help_recent` does not contain `status` at all, so it cannot stand in, and `bulkSetStatusByFilter` counts by status facet straight off it |
| `DROP idx_team_members_team`, `idx_agent_threads_creator`, `idx_help_creator` | **agree** | Each is the leading column of a composite added in `0015`/`0007`, so nothing can reach for it any more. Dropping a redundant prefix index is rarely done and is right: on `team_members` it saves a b-tree write on every membership change, on the core table that carries every tenant at once |
| `idx_team_members_active (deactivated_at, team_id)` | **agree, and it is the subtle one** | Leading with the near-constant column looks wrong. It is right here: the sweep constrains `deactivated_at IS NULL` alone, so leading with it turns a scan into a seek and delivers `team_id` pre-grouped, removing the temporary b-tree. The hot per-team reads constrain **both** columns as equalities, so they seek either way. The migration's own note says this; I confirmed it against the four query shapes rather than taking it |

**One caution, not a disagreement.** `0018` drops an index from the core schema
and `0009` drops two from every team schema. Both are correct and both are only
correct *given the current query set*. Neither drop has a test asserting that no
query plan regressed. The campaign's own lesson applies: a green check that was
never watched fail is not evidence, and a dropped index fails silently — as a
slower query, never as an error.

---

## Both levels of the yardstick, answered separately

**Across tenants.** The shared core database is the ceiling, and it is a wall
rather than a managed slope: two of the four relief valves cannot reach it and the
partition plan (`SCALING.md §5.2`) is written, not built. It holds roughly
**20–25 tenants of 250,000 people** — which is where the yardstick's *"dozens of
large tenants"* sits — and `account_activity` is `KEEP_FOREVER`, so the arrival is
a function of time as well as headcount. Moving `error_logs` and `agent_usage_log`
into their own operations database (`SCALING.md §4.9`) genuinely bought years and
is the best structural decision in the review. What is missing is not another
valve; it is the D1 size slope, so that "when" is answerable before a user asks it.

**Inside one tenant.** A 250,000-person tenant is genuinely survivable and this is
the stronger half. The team database has three valves, and the mover's routing is
now real and reachable. The live channel splits to 32 objects at ~1,000 sends/s
each, monotonically, raised nightly, and no connected socket can be stranded by a
raise. `activity` is 21,000 rows/month by headcount and 500,000/month under import
load, with the trigger named. **The thing that fails first inside one tenant is
not storage — it is the client.** One help edit costs 25,000 single-row reads and
up to 150,000 invalidations across that tenant's sessions, and a bulk action
multiplies two thirds of that by the batch size.

---

## What breaks first

> **The shared core database — every tenant's users, memberships, sessions and
> forever-kept account activity in one 10 GB D1 with no mover and no partition
> built — is the first hard ceiling, at roughly 20–25 tenants of 250,000 people
> (about 5 million people account-wide), and it will arrive unannounced because
> nothing anywhere records a D1 size *slope*.**

---

## Ranked priority list

Ordered by impact ÷ effort. "Points" is the score movement, computed as
`Δdimension × weight ÷ 100`.

| # | change | dim | pts | effort | tier |
|---|---|---|---:|---|---|
| 1 | **Record every D1 size nightly.** One `INSERT INTO db_sizes` inside the loop in `checkDatabaseSizes` that already holds `db.file_size`, unconditionally rather than only over threshold. Table, indexes and retention rule all already exist | `headroom` | **+0.96** | ~5 lines | A |
| 2 | **Delete the duplicate `db_sizes` prune** at `housekeeping.ts:393` and let `CORE_RETENTION` own the window, exactly as the TODO above it instructs. Restores `RETAIN_DB_SIZES_DAYS` as a working knob | `headroom` | **+0.32** | −4 lines | A |
| 3 | **Give the object listing a cursor.** Thread R2's `cursor` through `sweepOrphanedUploads` beside the team cursor already there, so a team above 10,000 objects becomes a rota instead of a permanent leak | `storage` | **+0.96** | ~10 lines | A |
| 4 | **Add `cursor` to `api.agentThreads` and a `LoadMore` to the history dialog** — the two other paged screens already do exactly this and the component exists. Restores the 950 conversations the paging repair removed | `clientvolume` | **+1.08** | ~15 lines | A |
| 5 | **Pass an idempotency key on each import row write.** `forwardToDoor` already accepts one; a deterministic `${sessionId}:${rowIndex}` makes a retry a replay instead of a duplication | `atomic` | **+1.32** | ~3 lines | A |
| 6 | **Use the bulk door the import already has.** Route `confirmImport` through `writeParcel` where the target declares `bulk`, as the batch engine does. Turns 1,000 subrequests into ⌈1000/parcel⌉ | `queries` | **+1.56** | ~20 lines | B |
| 7 | **Coalesce the `deps` fan-out** on a short trailing window per key, leaving `patchRow` immediate. The deps are where the team-wide keys are and where the cost lives | `fanout` | **+1.68** | ~15 lines | B |
| 8 | **Cursor `runRetention`'s team walk** the way the orphan sweep's is, and raise `TEAM_SWEEP_MAX_PASSES` off 1 — its own comment says the bound exists only "until the team walk itself has a cursor" | `lifecycle` | **+0.20** | ~10 lines | B |
| 9 | **Add `/api/content/help/reply` to `HEAVY_PATHS`** — it is the only door in the base that fans out to 51 third-party sends and it is not on the expensive list | `surge` | **+0.24** | 1 line | B |
| 10 | **Bound the client reconnect** at an attempt ceiling with a visible "reconnecting" state, rather than for ever | `surge` | **+0.24** | ~5 lines | B |
| 11 | **Send `expectedVersion` from the three screens whose doors already accept it** (roles, dropdowns, team). The server half is built and unused | `atomic` | **+0.44** | ~10 lines | B |
| 12 | **Virtualise the activity feed** — 6 mount sites, the longest list in the product, and the library's `useVirtualRows` is auto-on above 100 rows in every collection that adopts it | `clientvolume` | **+1.13** | library-side | B |
| 13 | **Per-shard cursors for `d1QueryAcross`**, or a written statement that the split valve requires them first, so the day it is wired is not the day paging breaks | `contract` | **+0.84** | design | C |
| 14 | **Decide database placement.** Plumb `primary_location_hint` through `d1CreateDatabase` from a var, write down the choice for the core database, and price a migration for the existing ones | `partitioning` | **+1.44** | decision | C |
| 15 | **Partition the core database** (`SCALING.md §5.2`), or set an explicit tenant ceiling and say so | `partitioning` | **+1.44** | architectural | C |

Items 1–5 are **+4.64 points for about forty lines**, and none of them touches a
seam any other review owns.

---

## FIX IMPACT MAP

| Fix | Files | Adds / removes | Which other review could this damage |
|---|---|---|---|
| **1** nightly D1 size row | `sharding.ts` | +1 row per database per night (≈ 4 + one per team, ≤204/night with the rota) | **`spend_review` — small and real:** it is a D1 row write per database per night, in **both** environments, and `COSTS.md §6` must gain the line in the same commit or it becomes their finding. **`scaling_review` (self):** the 90-day rule already exists, so it cannot become the growth it measures |
| **2** delete the duplicate prune | `housekeeping.ts` | −4 lines, −1 statement/night | **none — it is a credit everywhere.** `story_checks_out_review` gains: the TODO stops describing a state that ended |
| **3** cursor the object listing | `housekeeping.ts` | +1 cursor field on the return; more R2 `list` calls only for teams that need them | **`spend_review` — direct:** R2 `list` is a Class A op at $4.50/1M. A team with 40,000 objects goes from 1 call/visit to 4. Bounded by the same rota, so the account-wide rate is unchanged for everyone under 10,000 |
| **4** thread paging in the client | `web/lib/api.ts`, `agent-history-dialog.tsx` | +1 optional param, +1 button | **`round_trip_review` — mild:** page two is a second request, but only on a click. **`dead_end_review` — positive:** it removes a dead end. **`first_run_review`:** neutral |
| **5** idempotency key per import row | `import.ts` | +1 field per call; +1 `idempotency_keys` row per import row | **`spend_review` — real:** one extra D1 row write per imported row, at $1.00/1M, on a table with a 2-day retention rule. A 1,000-row import costs $0.001. **`scaling_review` (self):** `idempotency_keys` is named in `housekeeping.ts` as one of the tables that outgrew a single-pass sweep — it now has 20 passes, so this is inside the budget, but it is the table to watch |
| **6** import through the bulk door | `import.ts` | −N subrequests, −N publishes | **`activity_log_review` — MUST SIGN THIS.** The per-row door writes one activity row per imported row with `origin: "import"`, which is the property that makes an import auditable. A bulk door that writes one row per parcel changes the audit trail, and `ROUND5-RECONCILIATION.md §3` already refused splitting a bulk activity row the *other* way. Route through `writeParcel` only where the target's bulk door writes per-row activity. **`interfacelessness_review`:** the two import surfaces must not diverge |
| **7** coalesce the deps fan-out | `web/lib/store.ts` | +~15 lines; −2/3 of the per-session read amplification | **`realtime_review` — DIRECT AND REAL.** Row-level patching is its criteria 1/2/5. Window the `deps` only and leave `patchRow` immediate, or it becomes "a quarter second late" on the thing that review exists to protect. **`speed_review`:** unchanged for the row itself |
| **8** cursor the retention team walk | `housekeeping.ts` | +1 cursor column use | **none.** It shares `cron_runs`, which already has the shape. `error_log_review` gains a shortfall signal that can actually keep up |
| **9** help/reply into `HEAVY_PATHS` | `rate-limit.ts` | 1 line | **`first_run_review` / `dead_end_review` — check the number.** 60/min is the heavy ceiling; a genuinely busy support team replying fast must not meet it. Measure before applying |
| **10** bound the reconnect | `web/lib/realtime.ts` | +~5 lines, +1 UI state | **`realtime_review` — DIRECT.** Its criterion 8 is "the UI is honest about being connected"; a bounded reconnect must show a manual retry or it becomes a permanent silent disconnection, which is worse than an infinite loop |
| **11** send `expectedVersion` | 3 web components | +1 field per submit | **`first_run_review` — mild:** users start seeing "someone else changed this" 409s. That is correct behaviour and it is a new error state that needs copy |
| **12** virtualise the activity feed | `@swift-struck/ui` | library change | **Not this repo's to make** (CLAUDE.md: the library is lego, never forked into the host). Surface it. **`realtime_review`:** a virtualised feed must still receive patches for rows scrolled out of view |
| **13** per-shard cursors | `shared/workers/paging.ts`, `d1-rest.ts` | a wider cursor token | **`interfacelessness_review` — check it:** the cursor is opaque to the agent and MCP surfaces today and must stay opaque. **`security_sentry_review`:** a cursor encoding N database ids must not leak them |
| **14** placement hint | `d1-rest.ts`, wrangler vars | +1 parameter | **`base_fork_review` — POSITIVE and important:** a fork for a client in another region currently inherits Brimba's accidental placement. **`mac_fell_in_the_ocean_review`:** `BOOTSTRAP.md` must name the hint, or a rebuild silently lands somewhere else. **Irreversible per database** — the hint cannot be changed after creation |
| **15** partition the core database | architectural | a data migration | **everything.** `architecture_review` owns the shape, `security_sentry_review` owns tenant isolation across the split, `activity_log_review` owns `account_activity`'s new home. Tier C by definition |

---

## The ceiling — 95 is not reachable, and the honest maximum is 92

R4 published a hard cap of 90 and `ROUND5-RECONCILIATION.md §2` rejected the
reasoning. I derived my own rather than adjudicating theirs, and I get a different
number for a different set of reasons.

| # | dim | wt | cap | why |
|---|---|---:|---:|---|
| 1 | `partitioning` | 12 | **92** | R4 capped this at 85 on "the core database has no mover". True, and it is not a *cap* — `SCALING.md §5.2` is a buildable plan and placement is a parameter. Expensive is not impossible. The residual is that partitioning identity is a redesign nobody should do speculatively |
| 2 | `queries` | 13 | **88** | **LOCKED at −12.** The exact `COUNT(*)` is refused with reasons that survive re-derivation (`ROUND5-RECONCILIATION.md §3`): the agent and MCP surfaces are promised an exact total and have no sidecar. Costs **1.56 points**, permanently, until a cached counter gets its own design pass |
| 3 | `contract` | 7 | 95 | reachable — per-shard cursors |
| 4 | `headroom` | 8 | 95 | reachable — items 1 and 2, about nine lines |
| 5 | `clientvolume` | 9 | 95 | reachable. Virtualisation is a library change, not a wall — v0.16.0 ships it auto-on above 100 rows and three of `web/`'s collections already get it free |
| 6 | `clientcache` | 9 | 95 | reachable |
| 7 | `surge` | 6 | 95 | reachable — a per-tenant limiter namespace is config, not code |
| 8 | `atomic` | 11 | 95 | reachable |
| 9 | **`fanout`** | 7 | **85** | **LOCKED.** A ping carries no row data, by an architectural decision that is what stops a client without rights learning a field through the live channel. Every connected client must therefore read to learn what changed. Coalescing and scoping bound the reads; nothing removes them without either putting data in the ping or accepting stale screens. Costs **1.05 points** |
| 10 | `lifecycle` | 5 | 95 | reachable. R4 capped this at 75 calling the serial migration robot a platform wall. It was not: `migrate-teams` is now keyset-resumable in 40 lines |
| 11 | `elastic` | 5 | 95 | reachable |
| 12 | **`storage`** | 8 | **86** | **OWNER-DECLINED.** Presigned direct-to-bucket uploads need an R2 API token the owner declined on 2026-08-12 (`SCALING.md §8`), so one of seven good signals cannot be present. Costs **0.72 points** |

```
92×12 = 1104 · 88×13 = 1144 · 95×7 =  665 · 95×8 =  760
95×9  =  855 · 95×9  =  855 · 95×6 =  570 · 95×11 = 1045
85×7  =  595 · 95×5  =  475 · 95×5 =  475 · 86×8  =  688

1104+1144 = 2248; +665 = 2913; +760 = 3673; +855 = 4528; +855 = 5383;
+570 = 5953; +1045 = 6998; +595 = 7593; +475 = 8068; +475 = 8543; +688 = 9231
9231 / 100 = 92.31  ->  92
```

**95 is not reachable by changing code. The honest maximum is 92**, and the three
things that cap it cost **3.33 points** between them: the contentless ping (a
locked privacy property), the exact `COUNT(*)` (refused with reasons, twice) and
owner-declined presigned uploads. All three are decisions, all three are written
down, and none is a defect.

**The distance from 72 to 92 is 20 points and none of it is blocked.** The largest
single lever is `fanout` at +30 × 0.07 = **+2.10**; the second is `queries` at
+37 × 0.13 = **+4.81**, of which +1.56 is the bulk-door fix and the rest is the
locked count. The five Tier-A items are **+4.64 for about forty lines**.

---

## The alternative arithmetic, in full

Under the literal double-charge reading — where a defect that is also a missing
good signal is charged in both halves — five dimensions move:

```
queries      67 − (12 COUNT* + 12 import-N+1 + 4 SELECT*)          = 39   (was 51)
clientvolume 75 − (12 threads + 4 unvirtualised feed)              = 59   (was 63)
surge        80 − (12 no-per-tenant-limit + 4 + 4)                 = 60   (was 72)
lifecycle    67 − (12 no-chunk-no-resume + 4 + 4)                  = 47   (was 59)
storage      86 − (12 proxy-bytes + 12 bucket-tail + 4)            = 58   (was 70)

39×13 = 507 · 59×9 = 531 · 60×6 = 360 · 47×5 = 235 · 58×8 = 464
unchanged: 912 + 616 + 640 + 792 + 924 + 385 + 460 = 4729
4729 + 507 + 531 + 360 + 235 + 464 = 6826
6826 / 100 = 68.26  ->  68
```

**72 under the stated rule, 68 under the literal one.** I report 72 and I have
shown the working for both, because a correction nobody else can recompute is just
a different opinion.

---

## Things no rubric asked about

Four, all found reading the surrounding code on the way past a scoring task.

### 1 · Two committed source files contain raw NUL bytes, and plain `grep` silently skips them

`web/components/app-shell.tsx:82-83` holds four real `0x00` bytes:

```ts
    const TEAM = "\0team\0"
    const ID = "\0id\0"
```

and `workers/data-ops/src/lib/import-plan.ts:272` holds one. Verified with
`od -c`; `file(1)` reports both as `data`, not text, and they are in the commit.

**GNU/BSD `grep` treats a file containing NUL as binary and prints nothing without
`-a`.** Every source-scanning law check in this repository that greps or reads by
line is therefore blind to those two files. `app-shell.tsx` is the file that owns
the live-sync fan-out, the coalescer and the team-switch handler — which is to say
it is load-bearing for Laws R1 and R15 — and `import-plan.ts` is inside the import
engine.

This is the same disease the campaign has now found eighteen times, one layer
down: not a check that guards nothing, but a **reader that cannot see the file the
check is about**. `ab43382`'s own commit message records a census regex that never
matched anything and stayed dead since it was written. This is that, in the input
rather than the pattern.

Fix: replace the NUL sentinels with any other character that cannot appear in a
ULID (``, or simply `|`), and — more importantly — make one check assert
that no tracked source file contains a NUL byte, so the next one cannot land.

### 2 · `HELP_MEDIA` is a bucket nothing writes to, and `INVENTORY.md` says otherwise

`workers/content/src/env.ts:18` binds `HELP_MEDIA: R2Bucket`. Repository-wide,
there is no `.put`, `.get`, `.list` or `.delete` against it. `INVENTORY.md:43-44`
instructs a rebuilder to create it in both environments and warns: *"miss the last
one and Help attachments have nowhere to land."* There are no Help attachments.
Nothing lands there.

That is a bootstrap instruction to create a resource for a feature that does not
exist, in a document whose whole job is to be trusted by someone rebuilding from
nothing.

### 3 · The alarm this round built cannot see the spend this round's failure path creates

`checkAccountAiSpend` (`sharding.ts:204-240`) sums `agent_usage.used` — the only
account-wide meter in the base, and a good addition. `refundAiUnits`
(`credits.ts:111-116`) subtracts from that same column:

```ts
      await env.DB.prepare(
        "UPDATE agent_usage SET used = MAX(0, used - ?), updated_at = ? WHERE team_id = ? AND period = ?"
      )
```

and it is called on every failure exit (`agent.ts:369-377`, `:536`) — the same
exit on which `failureWrapUp` makes an **unmetered** extra model call carrying the
whole conversation. So a turn that fails every step spends real money and then
erases its own trace from the one column the account-wide alarm reads. **The
alarm's blind spot is exactly the path that is free.** Fully priced in
`spend-r5.md §1`; recorded here because it was found while checking a scaling
claim, and because it is a case of two correct repairs, landed the same round,
combining into a hole neither had alone.

### 4 · Two `wrangler` facts that a rebuilder would get wrong

- `INVENTORY.md:73` records the rate-limit namespaces as "ids 1001/1002/1003". The
  gateway declares **1001, 1003 and 1004** (`workers/gateway/wrangler.jsonc:12`).
  One id in the document does not exist and one that does is missing.
- `SCALING.md §1` is otherwise excellent and dated, and it omits the 6-connection
  outgoing ceiling — the only live limit in this review that two code paths
  actually meet.

---

## Verdict

**The round did what it said it did, and I could verify all of it: the cursor, the
cycle length, the meter with its retention in the same change, the resumable
migration robot, the digest with its four properties, the heartbeat, the
account-wide alarm on the existing cron, the jitter, the keyset threads, the three
migrations and the three declined indexes — every one confirmed by reading, and
the three declines are right.**

What moved the score less than that list suggests is that six of twelve dimensions
moved because the *previous measurement* was wrong, in both directions, and that
two of this round's repairs are incomplete in the half nobody re-checked: the
growth meter records R2 bytes and never a D1 size, and the threads keyset paging
has no client that can reach page two. Both were verified as landed. Neither was
verified as *finished*, and the difference between those two words is what this
round of the campaign exists to find.

The thing worth carrying out of this review is not the number. It is that the
sentence `housekeeping.ts:87-92` wrote about retention — *"a partial sweep that
reports like a complete one is how the old ceiling stayed invisible for months"* —
is true, was written this round, and describes the object sweep twenty lines
below it.
