# Speed review — Brimba · 2026-08-25
SCORE: 37/100   (previous: never run)

**Read this line first: nothing in this codebase is instrumented.** There are zero
`Server-Timing` headers, zero `performance.now/mark/measure` calls and zero logged
durations in 222 non-test source files. No number exists for how long a read, a
write, a delete or an import takes. **Everything below is SHAPE analysis, not
measurement.** Every count is derived from source read off disk; every duration in
this report is marked `unmeasured` and carries the command that would produce it.

Evidence: `node ~/.claude/skills/speed_review/assets/probe.mjs .` (222 prod files,
294 SQL operations, 47 declared indexes) — then every one of its 47 read hits, 48
write hits, 8 delete hits and 13 bulk hits opened and read. The probe's raw counts
are upper bounds and roughly **half of them are false positives**; the corrections
are itemised per criterion so the real numerators can be checked.

---

## Arithmetic

Method per the rubric: `DEFECT = clamp(0,100, 100 − Σ penalties)` (critical 30 ·
high 15 · medium 7 · minor 3); `COVERAGE = sum of points earned`.
`total = round( Σ(criterion × weight) / 100 )`.

| # | criterion | score | weight | product |
|---|---|---|---|---|
| 1 | measured (GATE) | 25 | 15 | 375 |
| 2 | readshape | 27 | 14 | 378 |
| 3 | bulk | 20 | 13 | 260 |
| 4 | budget | 40 | 12 | 480 |
| 5 | writeshape | 68 | 11 | 748 |
| 6 | deleteshape | 93 | 10 | 930 |
| 7 | worst known | 0 | 9 | 0 |
| 8 | production timings | 70 | 8 | 560 |
| 9 | deferral | 0 | 5 | 0 |
| 10 | trend | 0 | 3 | 0 |
| | **weights** | | **100** | **Σ 3731** |

**3731 / 100 = 37.31 → 37.**

**The gate:** criterion 1 scored 25, below 40, so the rubric caps the total at 45.
The uncapped weighted total is 37, which is already below the cap — **so the cap is
not what produces this score.** Reporting both, as required: capped 45, actual 37.

---

### 1 · The four operations have real timings — 25/100 · weight 15 · GATE

| pts | check | earned | evidence |
|---|---|---|---|
| 35 | four real numbers, each with a source | **0** | none exist. `grep -rn "Server-Timing"` over the whole repo → 0 hits. `performance.now/mark/measure` in non-test `web/lib`, `web/components`, `workers/*/src`, `shared` → 0 hits. The probe's single `loggedDurations` hit (`workers/realtime/src/index.ts`) is the word "latency" in a comment on line 139, not a measurement. |
| 25 | emitted by the app, not measured by hand | **25** | not by the app — but `"observability": { "enabled": true }` appears **14 times** across `workers/*/wrangler.jsonc` (all 7 workers × both environments), so Cloudflare Workers Logs records per-invocation wall time and CPU time in production continuously, with no code. Awarded on the substance (a live emitted duration stream exists) with the granularity stated: it is per *worker invocation*, never per operation. |
| 20 | includes the slowest realistic case | **0** | no measurement exists to include a worst case in, and both environments were last reset to empty. There is no seeded large-data environment. |
| 20 | anyone can get the number today without asking you | **0** | nothing documents how. `OPERATIONS.md` has no timing section; `scripts/smoke-staging.mjs` (146 lines) measures nothing. |

**The four-operation board.** Where a time is unknown the row says so. An empty bar
and a fast bar must never look alike, so no bars are drawn.

| operation | budget | measured | source | shape verdict |
|---|---|---|---|---|
| read — `GET /api/content/learning` | 100 ms | **unmeasured** | — | 3 sequential HTTPS round trips to `api.cloudflare.com` minimum (`requireRight` → `listLearning` → `countLearning`) |
| write — `POST /api/content/learning` | 250 ms | **unmeasured** | — | 5–8 sequential D1-REST round trips + 2–3 service-binding hops, all awaited |
| delete — retention sweep / `POST …/active` | 250 ms | **unmeasured** | — | soft-deactivate: 2 REST hops. Sweep: indexed and batched except one path |
| bulk — `POST /api/data-ops/import/confirm` | 1 min | **unmeasured** | — | up to 1,000 rows, **one request per row**, sequential, inside the user's request |

**Commands that would produce those four numbers** (none require a code change):

```
npx wrangler tail brimba-content --env staging --format json
npx wrangler tail brimba-data-ops --env staging --format json
curl -sS -o /dev/null -w '%{time_total}\n' -b "$COOKIE" \
  https://brimba-staging.swift-struck.workers.dev/api/content/learning
curl -sS -o /dev/null -w '%{time_total}\n' -X POST -b "$COOKIE" \
  -H 'Content-Type: application/json' -d '{"title":"speed probe"}' \
  https://brimba-staging.swift-struck.workers.dev/api/content/learning
curl -sS -o /dev/null -w '%{time_total}\n' -X POST -b "$COOKIE" \
  -H 'Content-Type: application/json' -d '{"id":"<session id>"}' \
  https://brimba-staging.swift-struck.workers.dev/api/data-ops/import/confirm
```

The `wrangler tail` lines carry `wallTime` and `cpuTime` per invocation; the `curl`
lines give the end-to-end number a person actually feels. **I have no live cloud
access, so none of these were run and no number is quoted.**

---

### 2 · Reads are indexed for the query actually run — 27/100 · weight 14 · defect

Probe raw: 27 reads with a `WHERE` not index-covered, 20 with neither `WHERE` nor
`LIMIT`. **All 47 opened and read.** Corrections:

- **12 of 27 are probe false positives** — the regex only sees `CREATE INDEX` and
  inline single-column `PRIMARY KEY`. It cannot see an inline `UNIQUE` column
  constraint or a table-level composite `PRIMARY KEY (a, b)`, both of which create
  a real SQLite index. Falsely flagged and actually covered: `sessions.token_hash`
  (`db/core/0001_core_auth.sql:32`, UNIQUE), `users.email` (0001:5, UNIQUE, 2 sites),
  `mcp_tokens.token_hash` (0013:12, UNIQUE), `importable_databases.table_key`
  (0008:8, UNIQUE), `agent_usage` (0009:12, `PRIMARY KEY (team_id, period)`),
  `role_permissions` (`team-schema.ts:44`, `UNIQUE (role_id, module)`, 3 sites),
  `team_module_databases` (0004:13, `UNIQUE (team_id, module)`, 3 sites).
- **1 more** is a dynamically-built `WHERE` string the matcher reads as empty —
  `workers/data-ops/src/routes/admin.ts:34`, which `idx_error_logs_status_at` covers.
- **5** are in `scripts/reset-all.mjs` / `scripts/move-to-ops.mjs` — developer wipe
  and migration tooling, not a runtime path.
- Of the 20 "unbounded": **11 are `COUNT(*)` aggregates**, **4 are English prose in
  `.tsx` files** ("select **can**…", "select **it**…" — the failure mode the brief
  warns about), **2 are truncation artefacts** (`help.ts:135` and `:152` both DO
  carry `LIMIT ${PAGE_SIZE + 1}` past the probe's 320-character window), and **3 are
  bounded by construction** (`screens`, `importable_databases` and `_migrations` are
  keyed by module/version and hold single digits).

Real defects, with severity by the rubric's letter for user-facing paths and **one
tier down for paths reachable only from an owner-key endpoint or a nightly cron** —
stated so a strict recompute is possible:

| sev | pts | finding |
|---|---|---|
| critical | 30 | `workers/tenancy/src/routes/team.ts:101` — `SELECT COUNT(*) FROM teams WHERE creator_id = ?` on the user-facing create-team door. `teams` grows with every team in the account and `creator_id` has **no index** in any core migration (0002 declares the table, 0015 adds scale indexes and skips it). A full scan of the shared global table. |
| high | 15 | `workers/tenancy/src/lib/sharding.ts:118` — `SELECT team_id, COUNT(*) FROM team_members WHERE deactivated_at IS NULL GROUP BY team_id` scans the largest global table. Nightly cron (strict letter: critical, 30). |
| high | 15 | `teams WHERE db_status = 'ready'` — `sharding.ts:424` and `workers/tenancy/src/routes/admin.ts:24`. `db_status` unindexed; counted as one defect over two sites. Cron + owner-key (strict letter: critical ×2, 60). |
| medium | 7 | `workers/content/src/routes/learning.ts:38` — `GET /learning?id=` reads the whole capped list (up to 1,000 rows, full `content_body`, LEFT JOIN on progress) and then `.filter()`s in memory, when `learning.id` is the primary key. |
| minor | 3 | `member_roles WHERE is_default = 1` unindexed — `workers/tenancy/src/lib/members.ts:27` and `workers/content/src/lib/stakeholders.ts:47`. Small bounded table, `LIMIT 1`. |
| minor | 3 | `workers/tenancy/src/routes/admin.ts:57` — `db_alerts WHERE resolved_at IS NULL`; `idx_db_alerts_open (database_id, resolved_at)` leads on the wrong column. |

Σ penalties = 73 → **100 − 73 = 27**. Strict letter (no cron/admin reduction):
Σ = 103 → 0, and the total would be 34 rather than 37.

**The pattern worth naming:** every *team* table got a dedicated scale-index
migration (team `0007_scale_indexes`, `0008_activity_origin` — keyset `DESC`
composites, expression indexes on `COALESCE(updated_at, created_at)`, an actor
index, an origin index). The *global core* got `0015_scale_indexes`, which indexed
`team_members(team_id, created_at)` and `invite_index(team_id, created_at)` and
stopped. The two tables that grow across **all** tenants at once — `teams` and
`team_members` — are the least indexed for the queries actually run against them.

---

### 3 · Bulk has a chunk size and a resume point — 20/100 · weight 13 · coverage

Probe: 13 bulk paths, 5 chunked, 1 resumable. Two are `scripts/*.mjs` → **11
runtime bulk paths.** Read individually:

| points | check | earned | evidence |
|---|---|---|---|
| 35 | every bulk path chunks with a stated size | **0** | **2 of 11.** Chunked or set-based: `bulkSetStatusByFilter` (`workers/content/src/lib/help.ts:400`) — 1 `COUNT` + 1 `UPDATE … RETURNING` + 1 activity row for up to 512 tickets; and the retention `sweep()` (`sharding.ts:335`) at `SWEEP_BATCH = 5000`. Not chunked: `confirmImport`, `runBatch`, `bulkSetLearningActive`, `bulkSetSelectableActive`, `migrateTeams` (`routes/admin.ts:18`), the orphan sweep, the module mover, `d1QueryAcross` fan-out. |
| 30 | can resume | **0** | **2 of 11**, and neither is a user-facing one. The retention sweep resumes by night-slicing. Both import paths restart from zero: `confirmImport` releases its claim on failure (`import.ts:498-506`) so a retry re-runs **every** row, re-writing the ones that already landed. |
| 20 | partial failure is defined | **20** | genuinely, and unusually well. `{created, skipped, failed, errors}` per run; parcel-scoped vs row-scoped rejections with `scope` and `rows`; "one bad id must not abandon the other thirty-nine" (`selectable.ts:95`); a 404 inside a bulk loop skips rather than aborts. Earned in full. |
| 15 | progress visible to whoever started it | **0** | `overall_status` moves draft → running → complete and nothing else is emitted. No per-row or per-parcel ping, no counter. The person waits on one request. |

**The finding underneath the number.** `workers/data-ops/src/lib/targets.ts:70`
says it outright: the base's three import targets "omit `bulk` entirely (their doors
are single-row); an app adds it." So `writeParcel` and `packParcels` — the whole
parcel machinery, and the `bulk-parcels.test.ts` that locks its arithmetic — are
**dead code on the base's own targets.** Every import Brimba ships writes one row
per service-binding request, sequentially, up to `MAX_IMPORT_ROWS = 1000`.

Note that R24's bulk twins do not close this: R24 derives from the `edit`/`delete`
gates, so it produced bulk *deactivate* doors (`postBulkSetLearningActive`,
`postBulkSetSelectableActive`, `postBulkHelpStatus`). The importer needs bulk
*create* doors, and R24 never asks for one.

---

### 4 · A budget exists per operation class — 40/100 · weight 12 · coverage

| points | check | earned | evidence |
|---|---|---|---|
| 40 | a target exists for read, write, delete and bulk | **40** | the owner's four numbers, set 24 Aug 2026: read 100 ms · write 250 ms · delete 250 ms · bulk 1 min. |
| 30 | checked, not just declared | **0** | `npm run check` is `tsc --noEmit` ×8 plus vitest. No duration assertion exists anywhere: `grep -rn "toBeLessThan"` across every `*.test.ts` returns ordering assertions (`gateAt < resolveAt`), size caps (`MAX_REPLAY_BYTES`, `EXPORT_HARD_CAP`) and token arithmetic — not one millisecond. |
| 20 | the numbers suit the product | **0** | nothing in 24 markdown files reconciles the budget with the architecture, and the architecture makes 100 ms structurally doubtful: a *gated* read is at minimum two HTTPS round trips to `api.cloudflare.com` (`requireRight` reads `role_permissions` over the REST door, then the query itself — `shared/workers/d1-rest.ts:33`). A budget nobody has reconciled with the data door is not one chosen for this product. |
| 10 | breaching the budget is visible to someone | **0** | nothing watches. |

---

### 5 · Writes do no avoidable work — 68/100 · weight 11 · defect

**Critical tier: clean, and this one matters.** The probe reported 48 unbounded
writes. I read all 47 `UPDATE … SET` statements in `shared/` and `workers/*/src`
and **every single one carries a `WHERE`.** The probe's 48 were 100% English prose
in comments — "update **the**", "update **that**", "update **carries**",
"update **refuse**". There is no mass update in this codebase.

| sev | pts | finding |
|---|---|---|
| high | 15 | **The R21/R23 return path reads a whole collection to return one row.** Five helpers behind twelve mutation doors: `oneLearning` (`workers/content/src/lib/learning.ts:206`), `oneSelectable` (`workers/tenancy/src/lib/selectable.ts:64`), `oneInvite` (`invites.ts:121`), `oneMember` (`members.ts:158`), `oneRole` (`members.ts:167`). Each calls its `list*` function, which reads up to `LIST_HARD_CAP = 1000` rows, and then `.find()`s in JavaScript. `oneMember` and `oneRole` cost two queries each (the list plus a `GROUP BY` member-count rollup). Help proves the fast shape is available and satisfies the same law: `getTicket` (`help.ts:159`) and `oneReply` (`help.ts:190`) are plain `WHERE id = ?` reads. |
| medium | 7 | **The R16 exact `COUNT(*)` rides every create response.** `countLearning`, `countSelectable`, `countRoles`, `countReplies` — a full scan of the table, recomputed on each create rather than derived. |
| medium | 7 | **Four create doors serialize two independent round trips.** `json({ created: await oneX(...), total: await countX(...) })` at `routes/learning.ts:77`, `routes/selectable.ts:54`, `routes/roles.ts:134`, `routes/help.ts:210`. The object literal awaits them one after the other. The same worker family already uses `Promise.all` on 8 read paths (`activity-read.ts:93`, `routes/help.ts:45`, `roles.ts:136`, `routes/roles.ts:52`, `teams.ts:427`, `stakeholders.ts:130`), so the habit exists and simply was not applied to the write responses. |
| minor | 3 | **`verifyToken` writes before it works.** `workers/mcp/src/lib/tokens.ts:101` awaits `UPDATE mcp_tokens SET last_used_at = ?` on **every** MCP request, before any of the caller's work. Auth already solved this exact problem for the busier table: `sessions.last_seen_at` is written only past `LAST_SEEN_THROTTLE_MS` (`workers/auth/src/lib/sessions.ts:124-127`). The pattern exists and was not reused. |

Σ = 32 → **100 − 32 = 68**.

---

### 6 · Delete is not a hidden full scan — 93/100 · weight 10 · defect

The cleanest area in the base, and the reason is structural: deactivate-never-delete
means there are only 8 delete statements in the entire codebase.

- **No critical.** The two `DELETE FROM <table>;` with no `WHERE` are both deliberate
  wipe paths: `sharding.ts:288` (the module mover, which empties the source only
  after a verified `src.n === dst.n` row-count match at `sharding.ts:264-267`) and
  `scripts/reset-all.mjs:98` (the documented destructive script).
- Every other delete is PK-, UNIQUE- or index-covered: `sessions` by `id`,
  `token_hash` and `user_id`; `idempotency_keys` by primary key; and every retention
  rule's date column has a matching index (`idx_login_codes_created`,
  `idx_email_change_codes_created`, `idx_idempotency_created`, `idx_error_logs_at`,
  `idx_agent_usage_log_created`, `idx_activity_recent`).

| sev | pts | finding |
|---|---|---|
| medium | 7 | **One sweep is exempt from its own file's reasoning.** `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`, run at `sharding.ts:355`) is an unbounded `DELETE FROM sessions WHERE expires_at < ?`, while every other rule in the same function is capped at `SWEEP_BATCH = 5000`. The comment 30 lines above it (`sharding.ts:316-322`) explains precisely why: "one unbounded DELETE would sit inside D1's 30-second statement limit and lose the lot." A first sweep of a `sessions` table nobody has pruned would be exactly that case. |

Σ = 7 → **93**.

---

### 7 · The slowest operation is known and named — 0/100 · weight 9 · coverage

| points | check | earned | evidence |
|---|---|---|---|
| 50 | someone can name it without looking | **0** | nothing in 24 markdown files names it. `AGENTIC-IMPORT.md:282` states the shape — "Most targets are written one row at a time" — as a neutral fact about door design, never as "this is the slowest thing in the product". `targets.ts:70` says the same thing the same way. |
| 30 | it has a number | **0** | no number exists. |
| 20 | it is on somebody's list | **0** | `BASE-IMPROVEMENTS.md`, `ROADMAP.md` and `UI-GAPS.md` carry no entry for import duration or for the return-the-row read path. |

---

### 8 · Timings come from production, not a laptop — 70/100 · weight 8 · coverage

| points | check | earned | evidence |
|---|---|---|---|
| 40 | durations recorded in the running system | **40** | `"observability": { "enabled": true }` on all 7 workers × both environments (14 occurrences in `workers/*/wrangler.jsonc`). Cloudflare records per-invocation wall time and CPU time in production, continuously, today. **The probe cannot see this** — it only scans `.ts/.tsx/.js/.mjs/.sql` and never opens a `.jsonc`. Its `observability: []` is a false negative. |
| 30 | enough context to find the slow one — route, tenant, row count | **0** | nothing in the app stamps a duration with a route or a team. The correlation spine already exists and is good: `traceError` (`shared/workers/trace.ts:63`) emits structured JSON with `req` / `worker` / `place`, and `requestIdFrom` mints one id at the public door that all seven workers carry. It fires **only on error** and has no duration field. |
| 30 | a local measurement never presented as a production one | **30** | vacuously true, and honestly so: there are no local measurements presented either. |

---

### 9 · Nothing blocks on work that could be deferred — 0/100 · weight 5 · coverage

Probe: 76 candidates, 0 already deferred. Verified: **`ctx.waitUntil` appears zero
times** in non-`node_modules` source, and the worker entry points do not even accept
the parameter — `async fetch(request: Request, env: Env)` at
`workers/content/src/index.ts:97` and the same in the other six. Nothing *can* be
deferred without threading `ExecutionContext` through.

| points | check | earned | evidence |
|---|---|---|---|
| 50 | work the caller does not need is deferred | **0** | in front of every response: **42** awaited `publishChange` / `publishUserChange` / `publishSignOut` calls, each a service-binding hop to realtime that fans to the Durable Object — and whose own contract at `shared/workers/realtime.ts:3` says "best-effort: a live-layer hiccup must never break the write it describes"; **28** awaited `logActivity` writes; **8** awaited `recordAccountActivity` / `recordWorkerError` writes; plus the `withIdempotency` outcome `UPDATE` (`shared/workers/concurrency.ts:134`), which runs after the work is complete and exists solely to serve a future retry. |
| 30 | what is deferred is guaranteed to run | **0** | nothing is deferred. |
| 20 | the response returns as soon as the answer is ready | **0** | the four serialized `oneX` + `countX` pairs above run entirely after the write has landed. |

Read honestly: much of the awaited work genuinely belongs before the response.
`logActivity` before the live ping keeps the feed correct for a client that re-pulls
on the ping it just received. The clean candidate is `publishChange` — 42 sites, one
seam, contractually best-effort already.

---

### 10 · There is a trend, not one reading — 0/100 · weight 3 · coverage

| points | check | earned | evidence |
|---|---|---|---|
| 60 | the same operation timed more than once, numbers kept | **0** | no number has been taken once. |
| 40 | a regression noticed by someone other than a customer | **0** | `npm run check` has no duration gate; `scripts/smoke-staging.mjs` asserts status codes only. |

---

## Findings

Severity ordered. Each: what it is in plain English · where · why it matters · the fix.

**1 · CRITICAL — a 1,000-row import is roughly half a million rows read, in one request.**
`workers/data-ops/src/lib/import.ts:435-496` (`confirmImport`) loops `for (const r of
parsed.rows)` and calls `writeRow` once per row — a service-binding POST to the
target's ordinary single-row create door. That door is `postCreateLearning`
(`workers/content/src/routes/learning.ts:70-78`), which finishes with
`oneLearning(...)` — a read of the whole learning table, up to 1,000 rows including
every `content_body`. So importing N rows performs N full list reads of a table that
is growing by one row on each pass, plus N `COUNT(*)`s, plus N realtime publishes,
plus N gate reads. At the 1,000-row cap that is on the order of 500,000 rows read and
roughly 8,000 sequential HTTPS round trips to `api.cloudflare.com`, inside a single
user-facing request, with no chunking, no checkpoint and no progress. **Duration
unmeasured** — but the 1-minute bulk budget is not plausibly survivable at this
shape, and a failure at 80% restarts from row one and re-writes what already landed.
*Fix:* declare bulk create doors on the three base targets so the existing
`writeParcel` / `packParcels` machinery engages (it is already written, already
tested, and currently dead), and checkpoint the last completed parcel index into
`data_import_sessions` so a retry resumes.

**2 · HIGH — twelve mutation doors read a whole collection to return one row.**
`oneLearning`, `oneSelectable`, `oneInvite`, `oneMember`, `oneRole`. The comment on
each explains the intent honestly — "picks from the bounded list read rather than
repeating its projection, so a single row can never differ in shape from a listed
one" — and the intent is sound; the implementation is not the only way to get it.
`oneLearning` and `oneSelectable` are pure single-table projections and can become
`WHERE id = ?` with the identical column list. The composite three can share the
`SELECT` fragment with their list function and add the `WHERE`, which preserves
shape parity by construction rather than by reading everything. Help already does
this (`getTicket`, `oneReply`). *Why it matters beyond one click:* this is the
multiplier inside finding 1.

**3 · HIGH — `teams.creator_id` and `teams.db_status` have no index, and `teams` is
the one table shared by every tenant.** `workers/tenancy/src/routes/team.ts:101`
does `COUNT(*) FROM teams WHERE creator_id = ?` on the user-facing create-team door;
`sharding.ts:424` and `routes/admin.ts:24` scan `teams WHERE db_status = 'ready'`;
`sharding.ts:118` scans `team_members WHERE deactivated_at IS NULL`. Team databases
each received a bespoke index migration; the global core did not. *Fix:* one core
migration adding `teams(creator_id)`, `teams(db_status)` and
`team_members(deactivated_at, team_id)`.

**4 · HIGH — nothing measures anything, so every statement above is a shape claim.**
Zero `Server-Timing`, zero `performance.mark`, zero logged durations. The cheapest
real fix is small and reuses a seam that exists: `shared/workers/trace.ts` already
mints a request id and emits structured JSON; adding an elapsed-milliseconds field
and a `Server-Timing` header at the seven `fetch` handlers would give every route a
production duration correlated to a request id, a worker and a team.

**5 · MEDIUM — the two `together` bulk twins run their rows one at a time.**
`bulkSetLearningActive` (`learning.ts:399`) and `bulkSetSelectableActive`
(`selectable.ts:81`) loop `for (const id of ids)` calling the single-row setter,
which is an `UPDATE` plus an activity insert — two REST round trips per id, up to
`BULK_IDS_LIMIT = 512` ids. `bulk-doors.ts` declares both `ordering: "together"`
("forty independent facts"), and R24's machine check only forbids `Promise.all` on
`in-order` twins, so a set-based rewrite is fully in-rule. The help twin
(`bulkSetStatusByFilter`) already proves the shape: one `UPDATE … WHERE … RETURNING
id` for the whole set.

**6 · MEDIUM — the exact `COUNT(*)` that R16 requires is a full scan of the fastest-
growing table on every page of the feed.** `workers/tenancy/src/lib/activity-read.ts:93-102`
runs the keyset page and `SELECT COUNT(*) FROM activity` in parallel, which is the
right structure — but the count is O(rows) and `activity` is described in the schema
itself as "the biggest table in any team database (one row per mutation, for ever)"
(`team-schema.ts:285`). This is a genuine law-versus-duration tension, not a bug:
R16 forbids a capped list's length and demands an exact server count.

**7 · MEDIUM — one retention sweep ignores its own file's batching rule.**
`EXPIRED_SESSIONS_SQL` is an unbounded `DELETE`, 30 lines below a comment explaining
why unbounded deletes on never-pruned tables lose the whole statement to D1's
30-second limit. *Fix:* run it through the same `rowid IN (SELECT … LIMIT
SWEEP_BATCH)` shape as every other rule. *Caveat worth stating:* if expiries exceed
5,000/night the batched version never catches up, so the batch size is a decision,
not a constant to copy.

**8 · MEDIUM — four create doors serialize two independent round trips**
(`json({ created: await oneX(), total: await countX() })`). One `Promise.all` each.

**9 · MEDIUM — `migrate-teams` and the orphan sweep loop every team inside one
request.** `workers/tenancy/src/routes/admin.ts:18-40` reads every ready team, then
per team reads `_migrations` and applies each missing migration, sequentially, with
no cursor. At a few hundred teams this exceeds what one invocation can finish and
there is no resume point — the same defect as finding 1, on the operator's path
instead of the user's.

**10 · MINOR — `verifyToken` awaits a `last_used_at` write on every MCP request**
before doing anything. Auth already throttles the identical write on the busier
table.

**11 · MINOR — `member_roles WHERE is_default = 1` and `db_alerts WHERE resolved_at
IS NULL`** are unindexed lookups on small bounded tables. Real, cheap, low priority.

**Clean results, stated as results.** No `UPDATE` without a `WHERE` anywhere in the
base (47 checked). No `DELETE` without a `WHERE` outside two deliberate, verified
wipe paths. Every retention date column indexed. Every team-DB paged read served by
a matching `DESC` composite or expression index. Partial-failure behaviour on bulk
paths is defined more carefully than most codebases manage.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Emit a duration: add elapsed-ms + `Server-Timing` to the existing trace seam | `shared/workers/trace.ts`, the 7 `workers/*/src/index.ts` `fetch` handlers | ADDS ~25 lines and one log line per request | **spend_review** — Workers Logs are billed per event on the paid plan, and this turns an error-only log stream into a per-request one; **speed_review itself** — a header and a log write on every response is real, if tiny, added work; **lean_mean** — 8 files touched for zero user-visible feature. Helps **error_log_review** and **architecture_review** (the request id finally carries a duration). |
| **F2** Write the four budget numbers into `OPERATIONS.md` and assert one in the staging smoke | `OPERATIONS.md`, `scripts/smoke-staging.mjs` | ADDS ~15 lines of docs, ~5 lines of script | **story_checks_out** gains (a stated guarantee with a check behind it). A smoke that fails on a slow-but-working staging would block a deploy — set the assertion generously or it becomes noise. Otherwise none. |
| **F3** `oneLearning` / `oneSelectable` → `WHERE id = ?` reads | `workers/content/src/lib/learning.ts`, `workers/tenancy/src/lib/selectable.ts` | REMOVES a 1,000-row read per call; ADDS ~12 lines of SQL | **story_checks_out / architecture_review** — the current comments claim list+find is what guarantees a single row matches a listed one; that claim must be rewritten, and the shared `SELECT` fragment must genuinely be shared or the two shapes drift. R21/R23 are satisfied either way (they demand the row, not the mechanism). |
| **F4** by-id variants for `oneMember` / `oneRole` / `oneInvite` sharing the list `SELECT` | `workers/tenancy/src/lib/members.ts`, `invites.ts` | REMOVES 2 queries per mutation response; ADDS ~30 lines | **lean_mean** — three near-duplicate SQL shapes where there was one, unless the fragment is genuinely extracted. **architecture_review** — extracting the fragment adds a small internal seam. |
| **F5** `Promise.all` the four `created` + `total` pairs | `routes/learning.ts`, `routes/selectable.ts`, `routes/roles.ts`, `routes/help.ts` | Neutral line count | none — four one-line rewrites, no new dependency, no behaviour change. |
| **F6** Core migration: index `teams(creator_id)`, `teams(db_status)`, `team_members(deactivated_at, team_id)` | new `db/core/0018_*.sql` | ADDS 3 indexes | **spend_review** and **scaling_review** — three more b-trees to maintain on the two hottest global tables, so every membership write and every team write costs slightly more, and core-DB storage grows. `teams` is written rarely (create/rename/deactivate) so its two are close to free; `team_members(deactivated_at, …)` is the one to weigh. **mac_fell_in_the_ocean** — one more migration to apply on both environments, owner-gated in production. |
| **F7** Bulk create doors on the 3 base import targets + a parcel checkpoint | `workers/data-ops/src/lib/targets.ts`, new bulk routes in `content` + `tenancy`, `shared/workers/bulk-doors.ts`, team schema (a checkpoint column) | ADDS the largest amount of code of any fix here — 3 new gated routes, their declarations, their tests | **lean_mean** — this is the single biggest code addition proposed, against the base's first prime directive. **security_sentry** — three new write doors that must gate (R10) and validate at the boundary. **activity_log_review** — a bulk create must still leave a birth row per record (R25) or the audit trail loses N creations. **base_fork_review** — `targets.ts:70` currently says omitting `bulk` is the base's deliberate posture; that documented stance changes. **interfacelessness_review** — the agent/MCP surface gains doors that R19 filter parity must cover. |
| **F8** Batch `EXPIRED_SESSIONS_SQL` like every other retention rule | `shared/workers/retention.ts`, `workers/tenancy/src/lib/sharding.ts` | ADDS ~4 lines | **scaling_review** — a 5,000-row nightly cap cannot keep up if more than 5,000 sessions expire per night, so the fix trades one failure mode for another and the batch size needs a stated basis. |
| **F9** Set-based (or bounded-parallel) `bulkSetLearningActive` / `bulkSetSelectableActive` | `workers/content/src/lib/learning.ts`, `workers/tenancy/src/lib/selectable.ts` | REMOVES N×2 round trips; roughly neutral on lines | **activity_log_review** — the set-based help twin writes ONE activity row for the whole set. Applying that here means 40 deactivations leave 1 activity row, not 40, which is a direct tension with R25's birth-to-death promise per record. A bounded-parallel loop keeps per-record rows and still cuts wall time; a set-based `UPDATE` is faster and loses them. **This choice is the owner's, not a commit's.** |
| **F10** Thread `ExecutionContext` and `waitUntil` the 42 `publishChange` calls | all 7 `workers/*/src/index.ts`, `shared/workers/route.ts`, `shared/workers/realtime.ts`, ~42 call sites | REMOVES one service-binding hop from every mutation's critical path; ADDS a parameter to ~50 signatures | **THE DANGEROUS ONE.** R1's `publish-seam` checks read handler source off disk by handler name and look for `publishChange`. Wrapping the call in `ctx.waitUntil(...)` may still match the regex while changing what the code does — precisely the "a green check asserting the wrong intent" failure this campaign was called to find. Any version of F10 must be landed with a deliberately-broken control case proving the seam test still fails. Also **lean_mean** (50 signatures) and **realtime_review** (a deferred ping is a slightly later ping). |
| **F11** Throttle `mcp_tokens.last_used_at` like `sessions.last_seen_at` | `workers/mcp/src/lib/tokens.ts` | ADDS ~4 lines, REMOVES a write from most MCP requests | **security_sentry_review** and **activity_log_review** — `last_used_at` becomes accurate only to the throttle window, which is a real loss for "when was this token last used" during an incident. Auth already accepted that trade for sessions; MCP tokens are the more security-sensitive of the two. |
| **F12** Name the slowest operation in a doc, with its measured number, and re-measure each release | `OPERATIONS.md` or `SCALING.md`, `CHANGELOG.md` | ADDS ~20 lines of docs | none — documentation only, and **story_checks_out** gains a capability that currently no document owns. Depends on F1 or F2 producing a number first. |

---

## CEILING

**Yes, 95 is reachable by changing code — but only by adding a meaningful amount of
it, which is the tension this base is built to resist.**

Criterion by criterion, what a commit can and cannot move:

- **Criteria 2, 5, 6, 7, 8, 10 (weight 54) can each reach 100** with the fixes above.
  Nothing structural blocks them: three indexes, one by-id read, one batched delete,
  a duration field on an existing log line, a number written down and re-taken.
- **Criterion 3 (weight 13) can reach 100**, but its last 15 points ("progress
  visible to whoever started it") need a live progress channel and a UI for it —
  work that lands in `realtime_review`'s territory and adds a screen.
- **Criterion 9 (weight 5) can reach 100**, gated on F10 surviving R1's source scan.
- **Criterion 4 (weight 12) can reach 100 by code** — declare the budget, check it,
  make breaches visible. But its "the numbers suit the product" check may resolve by
  *moving the budget rather than meeting it*, and that is an owner decision, not a
  commit. Behind it sits a locked decision in `ARCHITECTURE.md`: per-team D1
  databases reached over the REST door. That decision puts at least two HTTPS
  round trips to `api.cloudflare.com` in front of every gated read, which is the
  floor on every read in this product and cannot be optimised away without
  relitigating the architecture. Whether that floor fits inside 100 ms is
  **unmeasured** — and finding out is the single most valuable thing to do next,
  because it decides whether criterion 4 is a code problem or a budget problem.
- **Criterion 1 (weight 15) is the only one with a genuine cap.** Its first three
  checks (80 points) are pure code and docs. Its last 20 — "anyone on the team can
  get the number today without asking you" — sits against a **single-author
  project**: there is no team. Read literally, criterion 1 caps at 80 and the
  achievable total caps at **97**. Read as "any competent stranger, from a written
  runbook" — the reading `mac_fell_in_the_ocean_review` uses — it reaches 100 and
  the cap disappears.

**So the true maximum is 97, and 95 is comfortably inside it.** The honest caveat is
not about reachability but about cost: getting from 37 to 95 means adding three bulk
create doors, a checkpoint column, a timing seam, three indexes, a progress channel
and a parameter on fifty signatures. Every one of those raises this review's score
and lowers `lean_mean`'s. The two cheapest moves — F1 and F2 — cost about forty lines
between them and would lift criteria 1, 4, 7, 8 and 10 (weight 47) off the floor,
which is where the arithmetic says to start.

---

**Verdict.** The slowest operation in Brimba is a 1,000-row CSV import
(`POST /api/data-ops/import/confirm` → `workers/data-ops/src/lib/import.ts:435`),
which writes one row per service-binding request through a create door that reads
the entire destination table back on every one of them. Its duration is
**unmeasured, because nothing in this codebase has ever been timed** — the number
would come from `curl -w '%{time_total}'` against staging, or from
`npx wrangler tail brimba-data-ops --env staging --format json`, neither of which
needs a line of code to run.
