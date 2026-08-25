# Speed review — round 5 — Brimba · 2026-08-26

SCORE: **70/100**  (R1 37 · R2 39 · R3 45 · R4 55 → recomputed **53** · **R5 70**)

Measured against `review-round5` @ **`f30f954`**. I wrote none of the round-5 repairs.
Read-only: the only file I changed is this one.

**Two things happened at once, and the report separates them.** The code got
genuinely, measurably faster — raising a ticket fell from 1,200 ms of server time to
247 ms, same colo, and the history file proves it. And four of round 4's ten
criterion scores were wrong, in both directions. The arithmetic below shows which
movement is which.

**First line, as the rubric demands:** the app IS instrumented, and I took real
numbers myself. **But the four operation classes are still 2-for-4** — there is no
delete probe and no bulk probe — **and every number in this report was taken against
a team holding one member, two roles, sixteen tickets and zero articles.** I measured
those four counts through the app's own doors rather than assuming them. So the
durations here are real, and they are the *empty* case; the shape analysis is what
covers the rest.

---

## 1 · The measurement I took

```
node scripts/timings.mjs          → https://brimba-staging.swift-struck.workers.dev
5 runs per probe · scratch team · served from SIN · 2026-08-25T18:55:35Z

  operation           class   median   best   worst   server   budget   colo   verdict
  ──────────────────────────────────────────────────────────────────────────────────
  cold page load      read      164ms   155     168       —     800ms    SIN   ok
  auth health         read      177ms   148     325       2     200ms    SIN   ok
  realtime health     read      159ms   120     526       1     200ms    SIN   ok
  mcp health          read      148ms   144     192       2     200ms    SIN   ok
  who am I            read      240ms   228     295      88     100ms    SIN   OVER
  members list        read      523ms   466     895     337     400ms    SIN   OVER
  one ticket by id    read      400ms   384     651     252     500ms    SIN   ok
  raise a ticket      write     395ms   390     929     247     600ms    SIN   ok

  2 operation(s) OVER budget.   History: 16 run(s) in timings.json.
```

### What the scratch team actually contains — measured, not assumed

| door | rows |
|---|---:|
| `GET /api/tenancy/members` | **1** |
| `GET /api/content/help` | **16** |
| `GET /api/content/learning` | **0** |
| `GET /api/tenancy/roles` | **2** |

`members list` costs 337 ms of server time **to return one row.** That is the
strongest single fact in this report, and it settles the diagnosis: the cost is not
rows, it is crossings. It also means criterion 1's 20-point "slowest realistic case"
row is unearned, and that the one read shaped to degrade with volume — the exact
`COUNT(*)` seam — is currently invisible because it counts sixteen rows.

### The trend, same colo, from the checked-in history

`timings.json` holds 17 runs. Filtered to SIN so the comparison is honest
(a colo change alone moves these by hundreds of ms — the file's own rule):

```
run   time      colo    who am I    members list   one ticket   raise a ticket
                        med/srv     med/srv        med/srv      med/srv
 9   17:33:47   SIN     166/ 90      782/687        761/663      1439/1344
10   17:36:40   SIN     177/ 78      781/652        696/616      1291/1218
11   17:58:56   SIN     164/ 80      777/651        667/574      1339/1200
12   18:15:39   SIN     182/ 94      814/721        749/638      1457/1553
13   18:18:20   SIN     173/ 97      770/663        671/569       894/ 792
── the round-5 repairs land here ──
15   18:53:36   SIN     246/ 92      523/343        412/246       404/ 247
16   18:55:35   SIN     240/ 88      523/337        400/252       395/ 247   ← mine
17   18:59:53   SIN     238/ 84      519/360        408/240       458/ 262
```

Server-side, same colo: **raise a ticket 1,200 → 247 ms (−79 %)**, **members list
663 → 337 ms (−49 %)**, **one ticket by id 569 → 252 ms (−56 %)**. Reproduced across
three consecutive runs by two different agents. This is a measurement, not a shape.

**Caveat on my own run.** `timings.mjs` appends to `timings.json` by design, and the
tree was already dirty with an earlier run when I started. Sibling review agents ran
the same script during my session (runs 15 and 17 are not mine), and HEAD moved from
`959c80a` to `f30f954` mid-review. I diffed the two source files that changed —
`shared/workers/d1-rest.ts` and `shared/workers/realtime.ts` — and both changes are
comment-only, so nothing I scored moved underneath me.

---

## 2 · Arithmetic

```
DEFECT:   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE: criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / Σ weights ),  Σ weights = 100
GATE:     criterion 1 < 40 → cap total at 45.   Mine is 62.5 → NOT capped.
```

| # | criterion | method | wt | R4 said | **R5** | weighted | cause of the move |
|---|---|---|---:|---:|---:|---:|---|
| 1 | measured (GATE) | coverage | 15 | 75 | **62.5** | 937.5 | **last measurement was wrong** (R4 withheld the wrong row) — corrected R4 is 53.75, so this actually *rose* |
| 2 | readshape | defect | 14 | 27 | **85** | 1190 | both: two migrations landed (code), three R1 penalties refuted with EXPLAIN evidence + one already fixed (measurement) |
| 3 | bulk | coverage | 13 | 20 | **20** | 260 | neither — unchanged, and R4's supporting number ("2-of-12 resumable") was wrong; it is 1 of 14 |
| 4 | budget | coverage | 12 | 80 | **90** | 1080 | code changed — per-class budgets, a history and a colo column |
| 5 | writeshape | defect | 11 | 83 | **86** | 946 | last measurement was wrong (R4 never showed its penalties; I can only reproduce two of its three) |
| 6 | deleteshape | defect | 10 | 93 | **93** | 930 | **same number, different content** — R4's medium is fixed, a different medium is open |
| 7 | worst known | coverage | 9 | 20 | **55** | 495 | code changed — a reproducible command now names the slowest *measured* operation with a number |
| 8 | production | coverage | 8 | 85 | **80** | 640 | last measurement was wrong (R4's row-2 award is not reproducible from the fields emitted) |
| 9 | deferral | coverage | 5 | 0 | **65** | 325 | code changed — 36 of 37 publishes now held by `ctx.waitUntil`; R4's "permanently 0" ceiling is refuted |
| 10 | trend | coverage | 3 | 20 | **60** | 180 | code changed — 17 dated runs kept, compared same-colo |

```
15 × 62.5 =  937.5
14 × 85   = 1190
13 × 20   =  260
12 × 90   = 1080
11 × 86   =  946
10 × 93   =  930
 9 × 55   =  495
 8 × 80   =  640
 5 × 65   =  325
 3 × 60   =  180
            ------
             6983.5   ÷ 100 = 69.835  →  70
```

### Recomputing round 4 on the same reading

I disagree with R4 on exactly one row, and it is worth stating so the delta is not
inflated. R4 scored criterion 1 at **75**, saying *"the 35-point row is paid … the
remaining 25 is per-operation coverage"*. Those two sentences do not go together: the
25-point row is *"timings are emitted by the app itself"*, which was satisfied then and
is satisfied now (`timed()` puts `Server-Timing` on every response). R4 withheld the
wrong row. Read literally, the 35-point row asks for **four** numbers, one per
operation class; R4 had four numbers all of one class (three health checks returning
`{ok:true}` and a static asset). Scoring that row as a fraction of four:

```
R4 criterion 1, recomputed:  35 × (1/4) + 25 + 0 + 20 = 53.75      (0/4 is also defensible)
R4 criterion 2, per the round-5 analysis:               34          (learning ?id= medium already fixed)
R4 total =  15×53.75 + 14×34 + 13×20 + 12×80 + 11×83
          + 10×93 + 9×20 + 8×85 + 5×0 + 3×20
         =  806.25 + 476 + 260 + 960 + 913 + 930 + 180 + 680 + 0 + 60
         =  5265.25  ÷ 100 = 52.65  →  53
```

So: **R4 as reported 55 · as the round-5 analysis recomputed it 56 · as I recompute it
53 · R5 70.** Delta **+15** against the reported number, **+17** against the corrected
one. If you prefer R4's reading of criterion 1's 35-point row (all-or-nothing, paid),
mine becomes 15×(35+25+0+20)=1200 → total 7246 → **72**; the headline does not depend
on that choice.

---

## 3 · The four-operation board

An empty bar and a fast bar must never look alike, so an unmeasured row says so.

```
                budget    measured (server)   measured (round trip)
read     ▓▓▓▓▓▓▓▓  400ms   337ms  ▓▓▓▓▓▓▓░     523ms ▓▓▓▓▓▓▓▓▓▓▓░  OVER   members list, 1 row
                              88ms  ▓▓░          240ms ▓▓▓▓▓▓░       OVER   who am I (budget 100ms)
                             252ms  ▓▓▓▓▓░       400ms ▓▓▓▓▓▓▓▓░     ok     one ticket by id (budget 500ms)
write    ▓▓▓▓▓▓▓▓  600ms   247ms  ▓▓▓▓▓░       395ms ▓▓▓▓▓░        ok     raise a ticket
delete   ▓▓▓▓▓▓▓▓  500ms   ·············· NOT MEASURED · no probe exists ··············
bulk     ▓▓▓▓▓▓▓▓ 1500ms   ·············· NOT MEASURED · no probe exists ··············
                            projection only: 1,000-row CSV import ≈ 250 s (see F2)
```

**Against the owner's own budget** (read 100 · write 250 · delete 250 · bulk 60 s, set
24 Aug), which the project has replaced with its own: every authenticated round trip
is over the 100 ms read line, and only `who am I` (88 ms) is inside it server-side.
The project's numbers are a genuine re-derivation, not a quiet relaxation — bulk is
*40× stricter* than the owner's — but the read line moved 100 → 400 and the owner
should know that.

---

## 4 · The shape ladder — built to be slow, worst first

| operation | table | grows? | bound | index for the query actually run | crossings |
|---|---|---|---|---|---:|
| 1,000-row CSV import (`confirmImport`) | any target | — | 1,000 rows | n/a | **~1,000 gated writes, serial** |
| exact ticket count (`countTickets`) | `help` | **yes (R14)** | none | none possible — no WHERE | 1 per list read *and* per create |
| exact activity count (`getActivity`) | `activity` | **yes (R14, fastest-growing)** | none on team scope | none possible — empty WHERE | 1 per feed read |
| module mover's wipe (`sharding.ts:484`) | every module table | yes | **none** | n/a | 1 unbounded `DELETE` per table |
| `GET /api/tenancy/members` | `team_members` + `member_roles` | yes | `LIST_HARD_CAP` 1000 | `idx_team_members_team_created` ✓ | **2 REST crossings, serial** |
| create role / create dropdown value | `member_roles` / `selectable_data` | no | 1000 | ✓ | **3 crossings after the write** |
| every edit / status / deactivate door | all | — | pk | ✓ | **2 crossings** (write, then read-back) |
| raise a ticket | `help` | yes | — | ✓ | **1** (`d1Batch`: insert + read-back + count + activity) |

`raise a ticket` is the reference implementation. Everything above it is the same job
done in more crossings.

---

## 5 · The bulk strip

```
path                                            chunked   resumable   partial-failure   progress
scripts/move-to-ops.mjs:39                        ██        ░░            ██              ░░
scripts/move-to-ops.mjs:78                        ██        ██            ██              ░░
data-ops/lib/import.ts:497   runImport            ░░        ░░            ██              ░░   ← 1,000 rows, one at a time
data-ops/lib/import-batch.ts:236  confirmBatch    ░░*       ░░            ██              ░░   ← *see below
data-ops/lib/import.ts:426   writeParcel          ██        ░░            ██              ░░   ← unreachable in the base
content/lib/help.ts:460      bulk status          ░░        ░░            ██              ░░
tenancy/lib/roles.ts:90 · selectable.ts:117 ·
tenancy/lib/teams.ts:134 · routes/admin.ts:38     ░░ / ██   ░░ / ██       ██              ░░
                                                 5 of 14   1 of 14      14 of 14        0 of 14
```

**`*` is the finding the probe cannot see.** `import-batch.ts` branches on
`if (def.bulk)` — and `workers/data-ops/src/lib/targets.ts:70` says in terms:
*"Base targets omit `bulk` entirely (their doors are single-row); an app adds it."*
`grep -n "bulk:" targets.ts` returns **nothing**. So `packParcels`, `parcelSize` and
`writeParcel` — the whole chunking apparatus, plus `BULK_MAX_ROWS` and its tests — are
machinery for a *fork's* targets, and in Brimba itself **both import paths write one
row per gated HTTP write.** The probe counts them as "chunked" because the loop is
there; nothing in this repo can reach it.

R4 reported "import resume is still 2-of-12". The probe at HEAD says **1 of 14**, and
the one is `scripts/move-to-ops.mjs`, a developer tool. No import path resumes.

---

## 6 · Scorecard, criterion by criterion

### 1 · The four operations have real timings — 62.5/100 · weight 15 · coverage · GATE

| pts | check | earned | why |
|---:|---|---:|---|
| 35 | four numbers, one per class, each with a source | **17.5** | read ✓ (three), write ✓. **delete ✗, bulk ✗** — `PROBES` has neither. 2 of 4 classes × 35 |
| 25 | emitted by the app, not measured once by hand | **25** | `timed()` → `Server-Timing` on every response through the public door; `traceHop` per-hop; `d1Cost` per-request door tally. The script reads them off real responses |
| 20 | includes the slowest realistic case | **0** | measured: 1 member, 2 roles, 16 tickets, 0 articles. This is the empty case, and it is the case the two growing-table scans are invisible in |
| 20 | anyone can get the number today without asking you | **20** | `OPERATIONS.md:441–483` gives the command, the flags, the budgets, the history file and the `TEST_LOGIN_KEY` requirement; `timings.json` is checked in |

Gate: 62.5 ≥ 40 → no cap.

### 2 · Reads are indexed for the query actually run — 85/100 · weight 14 · defect

| sev | pts | finding |
|---|---:|---|
| high | 15 | **The R16 exact-count seam is an unfiltered aggregate on both declared GROWING tables.** `SELECT COUNT(*) AS total, SUM(CASE WHEN creator_id = ? …) FROM help` — no WHERE, no LIMIT — at `workers/content/src/lib/help.ts:158`, inlined again at `:289` inside `createTicket`'s batch; and `SELECT COUNT(*) AS n FROM activity${where}` at `workers/tenancy/src/lib/activity-read.ts:256`, where an unrestricted role's team scope produces an empty `where`. `GROWING_COLLECTIONS` (`shared/rules/registry.ts:246`) names exactly these two, and calls `activity` *"the fastest-growing table in the base — EVERY mutation writes a row"*. Runs on every list read **and** every create. Exact rubric row: *"a read with neither `WHERE` nor `LIMIT` on a growing table"* |

Σ = 15 → **85**.

**I am counting the shape once, not per site.** Per table it would be two highs (30 →
criterion 2 at 70), and the total would be 6773.5 ÷ 100 = **68** rather than 70. I
chose once because it is one seam, one fix.

**Why this is scored when four rounds dismissed it.** R1 wrote *"11 are `COUNT(*)`
aggregates"* in the list of dismissals, and R2/R3/R4 carried that forward. The rubric's
row does not exempt aggregates, and the repo's own `ROUND5-RECONCILIATION.md` calls it
"the full scan" that scaling *"keeps and loses the points"* for. A cached counter is
the agreed fix and the reconciliation says it *"needs its own design pass"* — so I am
scoring a defect the project already agrees exists, not re-filing a settled refusal.

**What I checked and did NOT penalise:**

- **All three probe "unindexed" worker hits are false positives.** `sessions.token_hash`
  is `UNIQUE` (`db/core/0001_core_auth.sql:32`), `team_module_databases` has
  `UNIQUE (team_id, module)` (`0004:13`), `role_permissions` has
  `UNIQUE (role_id, module)` (`team-schema.ts:44`). `indexCovered` cannot see a
  constraint-created index.
- **R1's critical 30 and one high 15 are fixed by code that landed this round.**
  `db/core/0018_speed_indexes.sql` adds `idx_teams_creator` (the create-team cap, which
  scanned the whole `teams` table on a door any signed-in person can knock on) and
  `idx_team_members_active (deactivated_at, team_id)` (the nightly shard recount). Both
  are absent from R4's HEAD `8a7e906` — verified with `git cat-file`.
- **R1's remaining high 15 + minor 3 + minor 3 are refuted, with evidence.** 0018's
  comment records three proposed indexes measured with `EXPLAIN QUERY PLAN` and
  deliberately left out: `teams(db_status)` (SQLite declines it — every healthy team is
  `'ready'`, and both readers want those rows anyway), `member_roles(is_default)` (two
  values, one page), and re-leading `idx_db_alerts_open` (its current lead is the
  selective one). The same migration **drops** `idx_team_members_team` after checking
  all five real query shapes choose it for none. That is the standard the rubric asks
  for — the index has to match the query — applied in the direction nobody applies it.
- **R1's medium 7** (`GET /learning?id=` reading the whole capped list) was fixed in
  round 3; `workers/content/src/routes/learning.ts:47` now calls `oneLearning`. R2, R3
  and R4 each carried it anyway.
- Exports are capped **in SQL** (`LIMIT ${EXPORT_HARD_CAP + 1}`), not sliced after
  fetching. `learning` is not in `GROWING_COLLECTIONS`, so `countLearning` is a bounded
  read with the bound stated. Every keyset page carries `LIMIT PAGE_SIZE + 1`.

### 3 · Bulk has a chunk size and a resume point — 20/100 · weight 13 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 35 | every bulk path chunks, with a stated size | **0** | no base import target declares a `bulk` door, so both import paths write one row per gated HTTP write |
| 30 | it can resume | **0** | 1 of 14, and it is a developer script. A `confirmImport` that dies at row 800 releases its claim and restarts from row 1 |
| 20 | partial failure is defined | **20** | precisely, everywhere: skip-with-tally, row-scope vs parcel-scope rejections, the atomic claim/release in `import.ts:489/521`, and `writeParcel`'s "the door refused the request, not any row" |
| 15 | progress is visible to whoever started it | **0** | one ping after the whole run. `overall_status='running'` is written but nothing streams it |

### 4 · A budget exists per operation class — 90/100 · weight 12 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 40 | a target for read, write, delete and bulk | **40** | `CLASS_BUDGET` (`scripts/timings.mjs:77`) — 400/600/500/1500 — plus per-probe overrides for genuine exceptions, documented at `OPERATIONS.md:458` |
| 30 | the budget is checked, not just declared | **20** | `process.exit(over === 0 ? 0 : 1)` ✓ and OVER rows named ✓ — but see F4: it compares a **round-trip** against targets partly derived server-side, so two of eight probes are structurally mis-checked, and both are the two that came back OVER |
| 20 | the numbers suit the product | **20** | derived in the file from the architecture — "one or two round trips to the door plus the worker's own work" — with the class-default-over-per-URL reasoning written out |
| 10 | breaching is visible to someone | **10** | non-zero exit, named OVER rows, a >25 % same-colo regression callout, and `timed()`'s `warn` line |

Take the 30 in full if you disagree with F4 and the total becomes 70.5 → **71**; the
headline is unaffected.

### 5 · Writes do no avoidable work — 86/100 · weight 11 · defect

| sev | pts | finding |
|---|---:|---|
| medium | 7 | **Totals are recomputed by full aggregate on every create.** `createTicket` recomputes `total` and `mineTotal` from scratch; so do `postCreateRole`, `postCreateSelectable`, `postCreateLearning`. Exact rubric row: *"recomputes derived data that could be incremental."* A create knows it added one |
| medium | 7 | **The R21/R23 read-back is a separate serialized crossing on 13 mutation doors**, and **two** on `roles.ts:141` and `selectable.ts:63` (`await oneRole(…)` then `await countRoles(…)`). `createTicket`'s `d1Batch` proves in the same repo that the write, the read-back, the count and the activity row fit in one crossing. Measured cost of a crossing here: ~120 ms |

Σ = 14 → **86**.

**No critical and no high.** I read every `UPDATE` in worker source (57 statements);
every one carries a `WHERE`. Nothing reads a whole table to decide what to change.

R4 scored 83 and never printed its penalties; 100 − 83 = 17 = 7 + 7 + 3, so it held a
minor I cannot reproduce. I score what I can show.

### 6 · Delete is not a hidden full scan — 93/100 · weight 10 · defect

| sev | pts | finding |
|---|---:|---|
| medium | 7 | **`workers/tenancy/src/lib/sharding.ts:484` — `for (const table of tables) await d1ExecScript(cfg, db, \`DELETE FROM ${table};\`)`.** Unbounded, one statement per table, and it runs *precisely* on the largest tables of the fullest database, because the module mover is triggered by the 80 %-of-10 GB alarm. `shared/workers/retention.ts:150-158` explains this exact failure in this exact repo: *an unbounded delete "sits against D1's 30-second statement limit, and on timing out removes NOTHING."* Nearest rubric row: *"a cascade that fans out to unbounded child deletes"* |

Σ = 7 → **93**.

I did **not** score it critical: the rubric's critical row exempts *"a deliberate wipe
path"*, and this is one. Inventing a higher severity than the published table is
exactly the substitution round 4 was pulled up for.

**Same number as R4, entirely different content.** R4's medium was
`EXPIRED_SESSIONS_SQL` being an unbatched `DELETE`. At HEAD it reads
`DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? LIMIT 5000)`
— bounded, and the comment explains why. `workers/tenancy/src/lib/housekeeping.ts:114`
is a bounded multi-pass sweep that *reports its own shortfall*, which is better than
the rubric asks for. Every other delete seeks a PK, a UNIQUE column or an indexed one.

### 7 · The slowest operation is known and named — 55/100 · weight 9 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 50 | someone can name it without looking | **25** | a reproducible one-line command names the slowest *measured* operation every run, and `OPERATIONS.md` tells you to run it. But **no document names the slowest operation in the product**, and the slowest operation is not the one the command names |
| 30 | it has a number attached | **30** | `members list` 523 ms / 337 ms server, staging, SIN, dated, in `timings.json` |
| 20 | it is on somebody's list | **0** | nothing schedules it. `timings.mjs` is in no gate (see F5), and neither `ROADMAP.md` nor `OPERATIONS.md` carries an action item for the two OVER rows |

`OPERATIONS.md:487-500` deliberately *withdraws* its numbers and says *"do not read a
number from this page"* — which is honest and correct, and also means the page names
nothing. The only place the true slowest operation is named is `reviews/speed.md:429`,
a report superseded four rounds ago.

### 8 · Timings come from production, not a laptop — 80/100 · weight 8 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 40 | durations recorded in the running system | **40** | `Server-Timing` on every response through the public door; `traceHop` per-hop lines with `nth`/`soFarMs`; and — the probe reports this as absent, wrongly — `"observability": { "enabled": true }` on **all seven workers**, default and staging env (`workers/*/wrangler.jsonc`), so the lines are queryable in Workers Logs rather than only tailable |
| 30 | enough context to find the slow one — route, tenant, row count | **10** | route ✓ (`METHOD /path`) and a request id ✓. **Tenant ✗ and row count ✗ — and this is worse than "missing".** `shared/workers/trace.ts:222-227` declares a `ctx` parameter carrying exactly `team` and `rows`. `timed()` has **one caller in the entire base** — `workers/gateway/src/index.ts:126` — and it passes no `ctx`. The fields exist; nothing supplies them |
| 30 | a local measurement is never presented as a production one | **30** | emphatically earned this round: three structural production locks, the colo recorded on every row, cross-colo comparison refused by `priorFor`, "round-trip includes the network from wherever you ran this" printed every run, and the old over-claim struck through in `OPERATIONS.md` |

R4 awarded 85 here on the strength of a severity change in `trace.ts`. I cannot
reproduce that from the fields actually emitted.

### 9 · Nothing blocks on work that could be deferred — 65/100 · weight 5 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 50 | caller-irrelevant work is deferred | **25** | **`publishChange`: 36 of 37 real call sites are inside `ctx.waitUntil` — measured, not quoted.** The one holdout is `workers/data-ops/src/lib/tools.ts:272`, the agent's import tool. But the *other* piece of caller-irrelevant awaited work is not deferred: `logActivity` does `await d1ExecScript(...)` — a full REST crossing — at **26 request-path sites**, against 5 that fold the statement into the write's own `d1Batch` |
| 30 | what is deferred is guaranteed to run | **30** | `ctx.waitUntil` is the platform's guarantee, and `shared/test/publish-seam.ts:44` now enforces `await` **or** `ctx.waitUntil(` so the optimisation cannot decay into fire-and-forget. `publishChange` itself records a failed ping through `recordOutbound` |
| 20 | the response returns as soon as the answer is ready | **10** | the R21/R23 read-backs *are* the answer, and `maybeDraftFirstReply` is a genuine no-op (`help.ts:587-594`). But 26 activity crossings still sit between the write and the response |

**R4's ceiling claim is refuted, and the repo records why.** R4 wrote that `waitUntil`
was *"declined deliberately"* and that "500 weighted points" were "permanently
unavailable". `ROUND5-RECONCILIATION.md:46` marks that **FALSE**: it was declined to
protect Law R1's check, whose regex `/(?:await\s+|ctx\.waitUntil\(\s*)publish…/` had
always matched the wrapped form. The refusal protected nothing.

**My count differs from the brief's.** The brief says "41 of 43". Excluding the
definition, three doc comments and the law-check fixture, I count **37 real call sites,
36 held**. Direction identical; the digits are not.

### 10 · There is a trend, not one reading — 60/100 · weight 3 · coverage

| pts | check | earned | why |
|---:|---|---:|---|
| 60 | the same operation timed more than once, numbers kept | **60** | 17 dated runs in `timings.json`, checked in, capped at 50 runs *counted by run* so one is never half-kept, each row carrying target, class, median, server and colo — and `priorFor` refuses to compare across data centres |
| 40 | a regression would be noticed by someone other than a customer | **0** | nothing runs it. Not in `npm run check`, not in the `ship-staging` skill, no cron, no CI |

---

## 7 · What still costs points — ranked, with the concrete change

| # | sev | costs | change |
|---|---|---:|---|
| **F1** | HIGH | crit 3 (13 wt) + crit 1's bulk quarter | **Give the base's import targets a bulk-create door, then chunk and checkpoint the run.** `targets.ts:70` says base targets omit `bulk` "deliberately", so `packParcels`/`writeParcel`/`parcelSize`/`BULK_MAX_ROWS` are dead weight in this repo and both import paths write one row per gated HTTP call. Add `bulk: { path: "…/bulk-create", maxRows: 200 }` to each TargetDef, a bulk-create door beside the existing R24 bulk-status doors, a `last_row` checkpoint on `data_import_sessions` / `data_import_batches` so a failure at 80 % resumes, and a per-parcel `publishChange` so progress is visible. Largest single lever in the report |
| **F2** | HIGH | crit 1 (35-pt row), crit 7 | **Add a delete probe and a bulk probe to `PROBES`.** Two of four operation classes have never been timed. Delete: `POST /api/auth/signout` (a real row delete) or a scratch retention pass. Bulk: import a 200-row CSV into the scratch team, class `bulk`, budget 1500 ms. Today the honest projection — 1,000 rows × the measured 247 ms per gated write — is **≈ 250 s, about 165× the declared bulk budget**, and it is a projection because nothing measures it |
| **F3** | HIGH | crit 1 (20-pt row), crit 2's visibility | **Seed the scratch team before measuring.** I measured 1 member, 2 roles, 16 tickets, 0 articles. Every number here is the empty case, and the `COUNT(*)` seam's cost is invisible at 16 rows. Have `signIn()` top the scratch team up to a stated floor (say 2,000 tickets, 200 members) and record the row count on each history row, so "337 ms" and "337 ms at n=2000" stop looking alike |
| **F4** | MED | crit 4 (row 2) | **Budget the server number, not the round trip — or budget both, separately.** `probe()` compares `r.median` (which includes the network from wherever you ran it — the script says so itself) against targets partly derived server-side. `who am I`'s 100 ms is documented as *"the honest target for one indexed read over an in-colo binding"* and is checked against a round trip with a ~150 ms floor from Singapore; it would read OVER at zero server work. Both OVER rows in my run are this |
| **F5** | MED | crit 10 (40-pt row), crit 7 (20-pt row) | **Run `timings.mjs` in the `ship-staging` flow, after the smoke.** It already exits non-zero on breach and calls out >25 % same-colo regressions — and nothing calls it. R4 filed this; it is still open. Not `npm run check`: it needs the network |
| **F6** | MED | crit 2 (15) | **Replace the R16 exact `COUNT(*)` with a maintained counter** on `help` and `activity` — the two declared GROWING tables. A `collection_counts(table, n)` row incremented in the same `d1Batch` as the write keeps the exact-total contract that `tool-catalog.ts` promises the agent and MCP, and removes a full scan from every list read and every create. The reconciliation already agreed this is the real fix and that it needs its own design pass |
| **F7** | MED | crit 5 (7), crit 9 (10) | **Fold the read-back, the count and the activity row into the write's own `d1Batch`** on the 13 doors that still serialize them — starting with `roles.ts:141` and `selectable.ts:63`, which pay **two** extra crossings. `createTicket` is the worked example, and it is the change that took raise-a-ticket from 1,457 ms to 894 ms. Where folding is not possible, `ctx.waitUntil` the activity write |
| **F8** | MED | crit 8 (20 of 30) | **Pass `ctx` to `timed()`.** `trace.ts:222-227` already declares `{ team?, rows? }`; the gateway is the only caller and passes neither. The gateway knows neither at request time, so either thread the guard's team id back through the response (a header the gateway reads and strips) or move/duplicate `timed()` into the per-worker route wrapper where `guard.teamId` is in hand |
| **F9** | MED | crit 6 (7) | **Bound the module mover's wipe.** `sharding.ts:484` is the last unbounded `DELETE` in the base and it runs on the fullest database in the account. Reuse the shape `housekeeping.ts:114` already uses: `DELETE … WHERE rowid IN (SELECT rowid FROM … LIMIT SWEEP_BATCH)` in a multi-pass loop that reports a shortfall |
| **F10** | LOW | crit 9 (part of 25) | **Hold the last publish.** `workers/data-ops/src/lib/tools.ts:272` — `for (const m of modules) await publishChange(...)` — is the one publish still blocking its response, and it is on the agent's import path, where the caller is waiting on a model anyway. `ctx` is not in scope there; thread it or hoist the loop to the route |
| **F11** | LOW | crit 4 (informational) | **Say in `OPERATIONS.md` that the read budget was moved from the owner's 100 ms to 400 ms, and why.** The re-derivation is sound and bulk went the *other* way (1500 ms vs the owner's 60 s), but a budget that moved without a line saying so is how a bar quietly lowers |

---

## 8 · Fix impact map — which OTHER review each fix could damage

| Fix | Files | What it adds / removes | Which review it could damage, and how |
|---|---|---|---|
| **F1** bulk doors + chunk + resume | `targets.ts`, `import.ts`, `import-batch.ts`, a content + a tenancy bulk-create route, a team migration for the checkpoint column | ADDS resumable chunked imports; REMOVES ~1,000 gated writes per import | **security_sentry** — a bulk-create door is a new mutation surface; it must gate ONCE with the same right (R24's existing pattern) and validate every row at the boundary, or one door undoes R10. **interfacelessness** — a new door needs its MCP/agent tool + filter parity (R19) or the surfaces diverge. **lean_mean** — the largest code addition on this list. **realtime** — per-parcel pings change the fan-out shape; a 1,000-row import must not become 1,000 pings (R24 says one ping per changed row, not per parcel — reconcile before writing). **activity_log** — one import must stay one activity row; the reconciliation already refused splitting a bulk row per record |
| **F2** delete + bulk probes | `scripts/timings.mjs`, `OPERATIONS.md` | ADDS two measured classes | **spend_review** — a bulk probe imports 200 rows per run; that is 200 D1 writes and 200 worker invocations each time anybody runs the script, and it accumulates in the scratch team. **first_run** — a delete probe that signs out must not disturb the scratch session the other probes hold. **security_sentry** — no new secret needed (`TEST_LOGIN_KEY` already exists), but the production locks must be re-proven against the new probes, not assumed |
| **F3** seed the scratch team | `scripts/timings.mjs` | ADDS a realistic case | **spend_review** — 2,000 rows of standing storage in a staging D1, forever. **scaling_review** — none; it *helps* by giving them a populated environment. **first_run** — the scratch team stops being a fresh-account example, which is fine as long as nobody points `first_run` at it |
| **F4** budget the server number | `scripts/timings.mjs`, `OPERATIONS.md` | REMOVES a location-dependent verdict | **none.** It narrows a claim to what it measures. Mildly helps **story_checks_out** |
| **F5** timings in the ship gate | the `ship-staging` skill | ADDS ~60 s to a deploy | **none for a review.** Cost is operator patience; a flaky network fails a deploy for a non-deploy reason, which is exactly why it belongs in ship-staging and not `npm run check` |
| **F6** maintained counters | `help.ts`, `activity.ts`/`activity-read.ts`, a team migration | REMOVES two full scans per read | **scaling_review** — this is the fix they lost points refusing; it *helps* them. **CONCURRENCY** — a counter is a contended write; it must ride the same `d1Batch` as the row it counts and be derived-not-authoritative, or two concurrent creates lose one. **activity_log** — the activity counter must not become a second source of truth for the feed's total. **story_checks_out** — R16 says "an exact server COUNT(\*) through the one `formatCount` seam"; the law's wording has to move with the implementation or the doc contradicts the code |
| **F7** fold read-back into the write | 13 route files across content + tenancy | REMOVES 13–15 REST crossings | **security_sentry** — `d1Batch` **cannot take params**; every value must go through `sqlString`, and this is a door any member can reach. `d1-rest.ts:306-313` says so in capitals. This is the highest-risk item here and should not be done as a sweep. **round_trip_review** — helps. **story_checks_out** — R21/R23's wording is about what is *returned*, not how it is fetched, so no law text moves |
| **F8** pass `ctx` to `timed()` | `trace.ts` or the per-worker route wrapper, `gateway/index.ts` | ADDS tenant + row count to every timing line | **security_sentry** — a team id in a log line is a tenant identifier; confirm it is acceptable in Workers Logs (the base already logs `team_id` in `error_logs`, so precedent exists). **error_log_review** — more fields per line; check the throttle and the field budget. **architecture_review** — moving `timed()` from the gateway into each worker changes where the one timing seam lives; decide deliberately |
| **F9** bound the mover's wipe | `sharding.ts` | REMOVES the last unbounded delete | **CONCURRENCY / architecture_review** — the mover's ordering is load-bearing (`moved_modules` flips *before* the delete); a multi-pass delete lengthens the window in which both copies exist. It is already safe in that direction (routing points at the new home first) but the invariant must be re-stated. **scaling_review** — helps |
| **F10** hold the last publish | `tools.ts`, `routes/agent.ts` | REMOVES one blocking hop | **realtime_review** — none; `ctx.waitUntil` is what the seam law already accepts. **interfacelessness** — the agent's import tool must still report what it published |
| **F11** doc the budget move | `OPERATIONS.md` | REMOVES an unexplained change | **none.** Helps **story_checks_out** |

---

## 9 · Ceiling — R4 said 84 and was wrong

R4 capped the score at **84** on the grounds that criterion 9 was permanently 0
because `ctx.waitUntil` was declined. Criterion 9 is **65** at HEAD, and the repo's own
reconciliation records the refusal as protecting nothing.

With every item above done, and taking a deliberately realistic rather than perfect
figure for the two that need design work:

```
crit  1 measured   95   (delete + bulk probes, a seeded team; 100 needs nothing more)
crit  2 readshape 100   (F6 removes the only defect)
crit  3 bulk       85   (F1: chunk + resume + progress; 100 needs every path, incl. scripts)
crit  4 budget    100   (F4)
crit  5 write     100   (F7 + F6)
crit  6 delete    100   (F9)
crit  7 worst     100   (name it, with its number, on a list)
crit  8 prod      100   (F8)
crit  9 defer      90   (F7 + F10; the read-back genuinely belongs before the response)
crit 10 trend     100   (F5)

15×95 + 14×100 + 13×85 + 12×100 + 11×100 + 10×100 + 9×100 + 8×100 + 5×90 + 3×100
= 1425 + 1400 + 1105 + 1200 + 1100 + 1000 + 900 + 800 + 450 + 300 = 9680 → 97
```

**95 is reachable, and nothing on the path is an owner decision.** Even holding
criterion 3 at 70 and criterion 1 at 90 the arithmetic gives 94. The binding
constraint is not architecture, it is **F1** — the imports — which is the largest
piece of real code on the list and worth 13 weight plus a quarter of the gate.

---

## 10 · Things no rubric asked about

**A. Team-database placement is an accident, and it is most of the latency.**
`shared/workers/d1-rest.ts:212` — `cf(cfg, "/d1/database", { name })`. No
`primary_location_hint`. Cloudflare places each team database wherever it likes; the
global core is somewhere else again. `timings.mjs:220` records the consequence,
measured: *one core read cost 245 ms from AMS and 90 ms from SIN; one team read cost
50 ms from AMS and 207 ms from SIN. Nothing in the app changed.* Every gated request
crosses **both** regions — the core for `whoAmI` and `requireMember`, the team database
for `requireRight` and then the work — so it pays the worse of the two distances twice.
Adding a hint is one field on one call and would make placement a decision. It is a
**scaling/architecture** question as much as a speed one (which region? the owner's?
the tenant's? does a fork inherit it?), which is why it belongs here as an observation
and not as a repair item.

**B. `timed()` has one caller and two unused parameters.** Covered under F8, but the
pattern is the campaign's own: a capability shipped, a caller never written, and a
review (R4) reading the absence as "not implemented" rather than "implemented and
unreached". Worth a grep for the same shape elsewhere.

**C. The permission read is a serialized REST crossing before every gated request
does any work.** `hasRight` (`shared/workers/gating.ts:262`) queries `role_permissions`
on the **team** database, and the handler's first real read then queries the same
database again. `GET /api/tenancy/members` is 337 ms of server time for one row largely
because of this: two crossings to the same database, in sequence, that could be one
`d1Batch`. I did not file it as a repair item because collapsing it means the gate and
the handler share a query, which touches Law R10's spine and needs a design pass, not a
patch. But it is the single biggest structural cost on every read in the base, and it
is invisible in every per-endpoint number because it is charged to all of them equally.

**D. `writeParcel`, `packParcels`, `parcelSize` and `BULK_MAX_ROWS` are unreachable in
this repo** — machinery, tests and a derived constant for a branch no base target takes.
That is a `lean_mean` observation (dead-in-the-base code with a stated reason) and a
`dead_end` one, and F1 is what makes it live rather than what removes it.

**E. The probe under-reports observability and over-reports write defects.**
`timing.observability` came back `[]` while all seven `wrangler.jsonc` files carry
`"observability": { "enabled": true }`; and `write.unbounded: 61` is mostly the English
word "update" in prose — including a match inside `d1-rest.ts:67`, which is the probe
matching the app's own SQL-label regex. Anyone rerunning this should read before
quoting either number.

**F. The reviews are now measurably racing each other.** Three sibling agents ran
`scripts/timings.mjs` against the same staging environment during this session, HEAD
moved twice underneath me, and a scratchpad filename collision silently replaced my
probe output with another review's. None of it changed a score here — I re-ran under
unique names and diffed the two source files that moved — but "measure with agents who
wrote none of it" needs "and who are not writing to the same files at the same time"
next to it.

---

## Verdict

**The slowest operation in Brimba is a 1,000-row CSV import, and it is still the one
operation nobody has ever timed — projected at ≈ 250 s from the measured 247 ms cost of
one gated write, which is about 165× its own declared 1,500 ms bulk budget.** The
slowest operation anyone *has* timed is `GET /api/tenancy/members` at **523 ms
round-trip / 337 ms server**, measured by me against staging from SIN on 2026-08-25 and
recorded in `timings.json` — **to return one row.**
