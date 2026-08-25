# Speed review — round 2 — Brimba · 2026-08-25
SCORE: 39/100   (round 1: 37/100)

**Measured at `fe7d683`** — the state `ROUND2-BRIEF.md` describes (commits
`73a60a4 … fe7d683`). Line numbers are that tree's.

**A round-3 repair pass (`1ef1210`) landed while this review was running.** I
re-verified every load-bearing claim against it at 14:03:51 rather than assume:
`Server-Timing` in code **0**, `performance.now/mark/measure` **0**, `waitUntil`
**0**, `"observability": enabled` still **14**, all five `one*` readers still
single-row, all five `?id=` doors still whole-collection, `EDGE-CASES.md §2` still
unamended. Nothing in `1ef1210` moves a criterion here. Two citations shift and
are marked: the gateway `fetch` handler moves from line 76 to **101** (a new
`decodeKey` guard above it), and `forwardToDoor` gains a `try/catch` while
**explicitly keeping no timeout** (`shared/workers/http.ts:87` — "Deliberately
still NO timeout"), which strengthens rather than changes finding 1.

## DELTA

Round 1: **37/100** → Round 2: **39/100**   (uncapped both times; the gate's cap of
45 is not binding because the uncapped total is below it)

| # | Criterion | wt | R1 | R2 | Why it moved |
|---|---|---|---|---|---|
| 1 | measured (GATE) | 15 | 25 | **25** | Not addressed. Re-verified from scratch — see the confirmation section below. Still zero instrumentation |
| 2 | readshape | 14 | 27 | **27** | All six defects re-opened and re-read; all six stand verbatim. No new core migration was added, so `teams.creator_id`, `teams.db_status` and `team_members.deactivated_at` are still unindexed. Every read the repairs ADDED is PK- or UNIQUE-covered, so nothing new was broken |
| 3 | bulk | 13 | 20 | **20** | The orphan sweep's reference read is now keyset-paged (`ORPHAN_PAGE = 1000`), taking chunked paths from 2-of-11 to 3-of-12. The 35-point line asks for *every* path; three of twelve is still 0. Resume is still 2-of-12 and still not user-facing |
| 4 | budget | 12 | 40 | **40** | Unchanged. The four owner numbers still exist; still no duration assertion in any test, still no document reconciling them with the REST door, still nothing that notices a breach |
| 5 | writeshape | 11 | 68 | **83** | **+15. The high finding is resolved.** All five `one*` readers now read one row. Two mediums and one minor stand. Two repairs added awaited work here and are recorded but not penalised — reasons below |
| 6 | deleteshape | 10 | 93 | **93** | Unchanged. `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`) is still `DELETE FROM sessions WHERE expires_at < ?` with no batch |
| 7 | worst known | 9 | 0 | **0** | Unchanged. 40 root markdown files; none names the slowest operation, none carries a number for it, and it is on no improvement list |
| 8 | production | 8 | 70 | **70** | Unchanged. Observability still on across 14 worker/environment pairs; `traceError` still fires only on error and still has no duration field |
| 9 | deferral | 5 | 0 | **0** | Unchanged, and slightly worse in absolute terms. Zero `ctx.waitUntil`; none of the seven `fetch` handlers accepts an `ExecutionContext`. Awaited pre-response work went UP: `await logActivity` 28 → 29, `await recordWorkerError` 8 → 9 |
| 10 | trend | 3 | 0 | **0** | Unchanged. No number has been taken once, so there is nothing to trend |

**No criterion fell.** The one that moved, moved up. The two repairs that added
work to a write path are itemised as findings 6 and 7 so the owner can see the
cost, but neither meets a penalty tier in this rubric and neither was scored as
one — inventing a penalty to make a delta look balanced would be exactly the
count-tuning the campaign brief forbids.

---

## The headline confirmation: nothing is instrumented. It still stands.

Round 1's first line was that **nothing in this codebase is instrumented**. It was
not addressed, and I re-derived it from zero rather than re-reading my own report.

| probe | command | result |
|---|---|---|
| `Server-Timing` | `grep -rniI "server-timing" --include=*.{ts,tsx,mjs,js,jsonc,md}` over the repo, excluding `node_modules`, `.next` and `reviews/` | **0 hits** |
| `performance.now / mark / measure` | `grep -rnIE "performance\.(now\|mark\|measure)" --include=*.{ts,tsx,mjs,js}`, excluding `node_modules` and `.next` | **0 hits** |
| logged durations | `grep -rnIE "\b(durationMs\|elapsedMs\|tookMs\|latency\|responseTime\|elapsed)\b"` across `shared/`, all seven `workers/*/src`, `web/lib`, `web/components`, `web/app`, `scripts/` | **1 hit** — the word "latency" in a comment at `workers/realtime/src/index.ts:157` |
| `Date.now() - start` | `grep -rnIE "Date\.now\(\) *- *(start\|began\|t0\|startedAt)"` | **2 hits, both `expect()` assertions** in `workers/gateway/test/trace.test.ts:148,198` |
| `ctx.waitUntil` | `grep -rn "waitUntil"` across the same first-party tree | **0 hits** |
| duration assertion in any test | `grep -rn "toBeLessThan" --include=*.test.ts` | 20 hits, **zero milliseconds** — all ordering (`gateAt < resolveAt`), size caps (`MAX_REPLAY_BYTES`, `EXPORT_HARD_CAP`) or token arithmetic |
| a timing budget in any document | `grep -rniE "\b(p95\|p99\|ttfb\|latency budget\|100 ?ms\|250 ?ms\|slowest operation\|time to first)\b" --include=*.md`, excluding `reviews/` | **0 hits** |

**The probe now reports three `timing.marks` hits. All three are false positives**
and I opened every one. The probe's regex is
`/performance\.(now|mark|measure)|Date\.now\(\)[\s\S]{0,80}(elapsed|duration|took|ms\b)/i`
— the second alternative, case-insensitively, matches `ms\b` inside an ordinary
constant name:

- `web/components/install-prompt.tsx:59` — `Date.now() - dismissedAt > COOLDOWN_MS`
- `web/components/version-watch.tsx:72` — `const now = Date.now()` near `..._MS`
- `workers/mcp/src/lib/bridge.ts:22` — `hit.expires > Date.now()` near `CACHE_MS`

Not one of them measures anything. Reported here rather than quietly dropped,
because a reviewer who trusted the probe's `marks: 3` would have concluded the
opposite of the truth.

**Nothing in this report is a measurement.** Every duration below says
`unmeasured` and carries the command that would produce it.

---

## Arithmetic

```
DEFECT    = clamp(0, 100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  = Σ points earned
total     = round( Σ (criterion × weight) / 100 )
```

| # | criterion | method | score | weight | product |
|---|---|---|---|---|---|
| 1 | measured (GATE) | coverage | 25 | 15 | 375 |
| 2 | readshape | defect | 27 | 14 | 378 |
| 3 | bulk | coverage | 20 | 13 | 260 |
| 4 | budget | coverage | 40 | 12 | 480 |
| 5 | writeshape | defect | 83 | 11 | 913 |
| 6 | deleteshape | defect | 93 | 10 | 930 |
| 7 | worst known | coverage | 0 | 9 | 0 |
| 8 | production | coverage | 70 | 8 | 560 |
| 9 | deferral | coverage | 0 | 5 | 0 |
| 10 | trend | coverage | 0 | 3 | 0 |
| | | | | **100** | **Σ 3896** |

**3896 / 100 = 38.96 → 39.**

**The gate:** criterion 1 scored 25, below 40, so the rubric caps the total at 45.
The uncapped total is 39, already below the cap — **the cap is not what produces
this score.** Both figures reported, as required: capped 45, actual **39**.

Evidence: `node ~/.claude/skills/speed_review/assets/probe.mjs .` → 222 production
files, 301 SQL operations, 47 declared indexes, 14 bulk paths, 76 deferral
candidates, 0 already deferred. Every hit quoted below was opened and read; the
false positives are named.

---

### 1 · The four operations have real timings — 25/100 · weight 15 · GATE · unchanged

| pts | check | earned | evidence |
|---|---|---|---|
| 35 | four real numbers, each with a source | **0** | none exist — the seven-probe table above |
| 25 | emitted by the app, not measured by hand | **25** | not by the app, but `"observability"` appears twice in each of the seven `workers/*/wrangler.jsonc` (14 occurrences; `grep -A2 '"observability"' \| grep -c enabled` = 14), so Cloudflare records per-invocation wall time and CPU time in production continuously, with no code. Granularity stated honestly: per **worker invocation**, never per operation. The probe reports `observability: []` — a false negative, because it never opens a `.jsonc` |
| 20 | includes the slowest realistic case | **0** | no measurement exists to include one in, and both environments were last reset to empty |
| 20 | anyone can get the number today without asking you | **0** | `OPERATIONS.md` was not touched in this repair pass (`git diff 8751e30..HEAD -- OPERATIONS.md` is empty) and still has no timing section; `scripts/smoke-staging.mjs` (146 lines) measures nothing |

#### The four-operation board

An empty bar and a fast bar must never look alike, so no bars are drawn.

| operation | budget | measured | source | shape verdict — **round 2** |
|---|---|---|---|---|
| read — `GET /api/content/learning` | 100 ms | **unmeasured** | — | 3 sequential HTTPS round trips to `api.cloudflare.com` minimum (`requireRight` → `listLearning` → `countLearning`). Unchanged |
| write — `POST /api/content/learning` | 250 ms | **unmeasured** | — | still 5–8 sequential D1-REST round trips + 2–3 service-binding hops, all awaited. The tail got shorter: `oneLearning` is now one indexed row, not a 1,000-row list read |
| delete — soft-deactivate / retention sweep | 250 ms | **unmeasured** | — | soft-deactivate: 2 REST hops. Sweep: indexed and batched except the sessions rule |
| bulk — `POST /api/data-ops/import/confirm` | 1 min | **unmeasured** | — | **still one request per row, sequential, up to 1,000.** The per-row multiplier is gone; the per-row loop is not |

Commands that would produce those four numbers, none of which needs a code change:

```
npx wrangler tail brimba-content  --env staging --format json
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
access, so none were run and no number is quoted.**

---

### 2 · Reads are indexed for the query actually run — 27/100 · weight 14 · defect · unchanged

Every round-1 defect re-opened at its current line. All six stand.

| sev | pts | finding | verified at |
|---|---|---|---|
| critical | 30 | `SELECT COUNT(*) AS n FROM teams WHERE creator_id = ?` on the user-facing create-team door. `teams` grows with every team in the account; `creator_id` has no index in any of the seventeen core migrations | `workers/tenancy/src/routes/team.ts:101` |
| high | 15 | `SELECT team_id, COUNT(*) FROM team_members WHERE deactivated_at IS NULL GROUP BY team_id` — scans the largest global table. Nightly cron, so one tier down (strict letter: critical, 30) | `workers/tenancy/src/lib/sharding.ts:119-120` |
| high | 15 | `teams WHERE db_status = 'ready'` — `db_status` unindexed; one defect over two sites, cron + owner-key, one tier down (strict letter: critical ×2) | `workers/tenancy/src/lib/sharding.ts:426`, `workers/tenancy/src/routes/admin.ts:24` |
| medium | 7 | `GET /learning?id=` reads the whole capped list (up to 1,000 rows, full `content_body`, LEFT JOIN on progress) and `.filter()`s in memory | `workers/content/src/routes/learning.ts:38` |
| minor | 3 | `member_roles WHERE is_default = 1` unindexed, small bounded table, `LIMIT 1` | `workers/tenancy/src/lib/members.ts:27`, `workers/content/src/lib/stakeholders.ts:47` |
| minor | 3 | `db_alerts WHERE resolved_at IS NULL`; `idx_db_alerts_open (database_id, resolved_at)` leads on the wrong column | `workers/tenancy/src/routes/admin.ts:57` |

Σ = 73 → **100 − 73 = 27**. Strict letter (no cron/admin reduction): Σ = 103 → 0,
and the total would be 34 rather than 39.

**Why the `?id=` medium is now sharper than it was.** `oneLearning` was repaired
into a real `WHERE l.id = ? LIMIT 1` read (`workers/content/src/lib/learning.ts:217`).
Forty lines away, `getLearning` still answers `?id=` by calling `listLearning()`
and filtering in JavaScript. The correct reader exists, in the same file, and the
door beside it does not call it. Same shape in tenancy: `oneRole`, `oneInvite`,
`oneSelectable` and `oneMember` are all single-row reads now, and all four `?id=`
doors still read the whole collection plus a `COUNT(*)`
(`workers/tenancy/src/routes/roles.ts:38`, `invites.ts:24`, `selectable.ts:29`,
`members.ts:16`). **That is the row-level live-sync re-pull path** — the one
CACHING rule 3 exists to make cheap — so every "row X changed" ping still costs a
full list read on four of the base's collections.

**Every read the repairs ADDED is covered.** Checked individually against the
schema rather than assumed:

| new read | added by | covered by |
|---|---|---|
| `selectable_data WHERE id = ?` | `oneSelectable` | `id TEXT PRIMARY KEY` (`team-schema.ts:48`) |
| `member_roles WHERE id = ?` (×2) | `oneRole`, `oneInvite` | `id TEXT PRIMARY KEY` (`team-schema.ts:26`) |
| `invite_index WHERE id = ? AND team_id = ?` | `oneInvite` | `id TEXT PRIMARY KEY` (`db/core/0002_teams.sql:41`) |
| `team_members WHERE team_id = ? AND user_id = ?` | `oneMember` | `idx_team_members_team`, `idx_team_members_user` |
| `COUNT(*) FROM team_members WHERE team_id = ? AND role_id = ?` | `oneRole` | `idx_team_members_team (team_id)` — leading column, bounded by one team's membership |
| `role_permissions WHERE role_id = ?` (×2) | `setRolePermissions` amplification guard | `UNIQUE (role_id, module)` — leading column |
| `learning … AND id > ? ORDER BY id LIMIT 1000` | orphan sweep paging | `id TEXT PRIMARY KEY` — keyset on the PK |

The probe's `read.unindexed` is 28 (round 1: 27). The extra one is inside that
table and is index-covered; the probe cannot see an inline `UNIQUE` or a
table-level composite `PRIMARY KEY`, which is the same class of false positive
round 1 itemised (12 of 27).

**The pattern still worth naming.** Every *team* table got a dedicated scale-index
migration. The *global core* got `0015_scale_indexes`, which indexed
`team_members(team_id, created_at)` and `invite_index(team_id, created_at)` and
stopped. `0016` and `0017` added channel shards and idempotency. **No migration
was added in this repair pass** — `db/core/` still ends at `0017_idempotency.sql`.
The two tables that grow across all tenants at once, `teams` and `team_members`,
remain the least indexed for the queries actually run against them.

---

### 3 · Bulk has a chunk size and a resume point — 20/100 · weight 13 · coverage · unchanged

Probe: 14 bulk paths (round 1: 13), 5 chunked, 1 resumable. Two are `scripts/*.mjs`
→ **12 runtime bulk paths.**

| points | check | earned | evidence |
|---|---|---|---|
| 35 | every bulk path chunks with a stated size | **0** | **3 of 12** (round 1: 2 of 11). Chunked or set-based: `bulkSetStatusByFilter` (`workers/content/src/lib/help.ts:376` — 1 `COUNT` + 1 `UPDATE … RETURNING` + 1 activity row for up to 512 tickets), the retention `sweep()` at `SWEEP_BATCH = 5000`, and **new**: the orphan sweep's reference read, keyset-paged at `ORPHAN_PAGE = 1000` (`sharding.ts:400,450`). Not chunked: `confirmImport`, `runBatch`, `bulkSetLearningActive`, `bulkSetSelectableActive`, `migrateTeams`, the orphan sweep's own delete loop, the module mover, `d1QueryAcross` fan-out, `acceptPendingInvites` |
| 30 | can resume | **0** | still **2 of 12**, neither user-facing. The retention sweep resumes by night-slicing. **The orphan sweep deliberately does NOT resume** — it now throws past `ORPHAN_SCAN_CAP` and skips the team, which is the right safety call and is not a resume point. `confirmImport` still releases its claim on failure (`import.ts:521-528`) so a retry re-runs every row and re-writes the ones that already landed |
| 20 | partial failure is defined | **20** | unchanged and still unusually good: `{created, skipped, failed, errors}` per run; parcel- vs row-scoped rejections; a 404 inside a bulk loop skips rather than aborts. The orphan sweep's new fail-closed branch strengthens this without earning more, because the line is already full |
| 15 | progress visible to whoever started it | **0** | `overall_status` moves draft → running → complete and nothing else is emitted |

**The finding underneath the number is unchanged.** `workers/data-ops/src/lib/targets.ts:70`
still says the base's three import targets "omit `bulk` entirely (their doors are
single-row); an app adds it." So `writeParcel` and `packParcels` — and
`bulk-parcels.test.ts`, which locks their arithmetic — are still dead code on the
base's own targets. What the repair changed is the *transport*: `writeRow` and
`writeParcel` now go through `forwardToDoor` (`shared/workers/http.ts:41`), which
adds the request id and the `origin: "import"` stamp. It does not batch, and by its
own comment it adds no timeout. **Every import Brimba ships still writes one row
per service-binding request, sequentially, up to `MAX_IMPORT_ROWS = 1000`.**

---

### 4 · A budget exists per operation class — 40/100 · weight 12 · coverage · unchanged

| points | check | earned | evidence |
|---|---|---|---|
| 40 | a target exists for read, write, delete and bulk | **40** | the owner's four numbers, set 24 Aug 2026: read 100 ms · write 250 ms · delete 250 ms · bulk 1 min |
| 30 | checked, not just declared | **0** | `npm run check` is `tsc --noEmit` ×8 plus vitest. All 20 `toBeLessThan` hits across the suite are ordering, size or token assertions — not one millisecond |
| 20 | the numbers suit the product | **0** | none of the 40 root markdown files reconciles the budget with the architecture, and the architecture makes 100 ms structurally doubtful: a *gated* read is at minimum two HTTPS round trips to `api.cloudflare.com` (`requireRight` reads `role_permissions` over the REST door, then the query itself — `shared/workers/d1-rest.ts`) |
| 10 | breaching the budget is visible to someone | **0** | nothing watches |

---

### 5 · Writes do no avoidable work — 83/100 · weight 11 · defect · **+15**

**The high finding is resolved. I verified all five readers rather than trusting
the changelog.**

| reader | round 1 | round 2 | verified at |
|---|---|---|---|
| `oneLearning` | `(await listLearning()).find()` | `${LEARNING_SELECT} WHERE l.id = ? LIMIT 1` | `workers/content/src/lib/learning.ts:217-226` |
| `oneSelectable` | `(await listSelectable()).find()` | `SELECT … FROM selectable_data WHERE id = ? LIMIT 1` | `workers/tenancy/src/lib/selectable.ts:62-73` |
| `oneInvite` | `(await listInvites()).find()` | `invite_index WHERE id = ? AND team_id = ?` + one role-title lookup | `workers/tenancy/src/lib/invites.ts:122-140` |
| `oneMember` | `(await listMembers()).find()` | `${MEMBER_SELECT} AND tm.user_id = ? LIMIT 1` + one role lookup | `workers/tenancy/src/lib/members.ts:194-206` |
| `oneRole` | `(await listRoles()).find()` | `SELECT ${ROLE_COLUMNS} … WHERE id = ? LIMIT 1` + one scoped `COUNT(*)` | `workers/tenancy/src/lib/members.ts:213-227` |

The shape guarantee that motivated the old implementation is preserved
structurally, not by reading everything: `LEARNING_SELECT`, `MEMBER_SELECT`,
`ROLE_COLUMNS`, `toMember`, `toRole`, `toInvite` and `toValue` are now shared
between the list and the single-row read. Three of the five still cost two round
trips (a row plus a join or a count) — real, and a fifth of what a 1,000-row list
read cost.

**Critical tier: still clean.** Re-checked every `UPDATE … SET` in `shared/` and
`workers/*/src`. Every one carries a `WHERE`. The probe's 48 `write.unbounded`
remain 100% English prose in comments — "update **the**", "update **that**",
"update **carries**", "update **refuse**". There is no mass update in this codebase.

| sev | pts | finding | at |
|---|---|---|---|
| medium | 7 | **The R16 exact `COUNT(*)` still rides every create response.** `countLearning`, `countSelectable`, `countRoles`, `countReplies` — a full scan, recomputed on each create rather than derived | `routes/learning.ts:77`, `selectable.ts:54`, `roles.ts:134`, `help.ts:212` |
| medium | 7 | **Four create doors still serialize two independent round trips.** `json({ created: await oneX(...), total: await countX(...) })` — the object literal awaits them one after the other. Verified all four verbatim. The same worker family already `Promise.all`s eight read paths, so the habit exists and still was not applied to the write responses | same four lines |
| minor | 3 | **`verifyToken` still writes before it works.** `await env.DB.prepare("UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?")` on **every** MCP request, before any of the caller's work. Auth solved this for the busier table (`sessions.last_seen_at` past `LAST_SEEN_THROTTLE_MS`) | `workers/mcp/src/lib/tokens.ts:96` |

Σ = 17 → **100 − 17 = 83.**

**Two repairs added awaited work to a write path. Recorded, not penalised.** Both
are required correctness work, and neither meets a tier in this rubric ("reads the
whole table first", "recomputes derived data", "touches more columns than it
changes"). Naming them anyway, because the round-2 question is whether somebody
else's fix cost me something:

- **+2 indexed REST reads on the permissions save.** The privilege-amplification
  guard (`workers/tenancy/src/lib/roles.ts:226`) reads the actor's own permission
  sheet and the target role's before writing. They are correctly `Promise.all`'d,
  both are `UNIQUE(role_id, module)`-covered, and both are bounded by
  `TEAM_MODULE_CATALOG`. This runs on `POST /roles/permissions` **and** on a role
  create that carries a matrix.
- **+1 REST write on every ticket reply.** `addReply` now writes an activity row
  (`workers/content/src/lib/help.ts:472`). R25 requires it; the reply path is one
  insert longer for it.

---

### 6 · Delete is not a hidden full scan — 93/100 · weight 10 · defect · unchanged

Still the cleanest area, and still for a structural reason: deactivate-never-delete
means 8 delete statements in the entire codebase.

- **No critical.** The two `DELETE FROM <table>` with no `WHERE` are both deliberate
  wipe paths: `sharding.ts:288` (the module mover, which empties the source only
  after a verified `src.n === dst.n` row-count match) and `scripts/reset-all.mjs:98`.
- Every other delete is PK-, UNIQUE- or index-covered, and every retention rule's
  date column has a matching index.

| sev | pts | finding |
|---|---|---|
| medium | 7 | **One sweep is still exempt from its own file's reasoning.** `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`) is `"DELETE FROM sessions WHERE expires_at < ?"` — unbounded, while every other rule in the same function is capped at `SWEEP_BATCH = 5000`. The comment thirty lines above the call site explains exactly why: "one unbounded DELETE would sit inside D1's 30-second statement limit and lose the lot" |

Σ = 7 → **93.**

The orphan sweep's repair is a delete-safety win that this criterion has no line
for. Before, a single `LIMIT ORPHAN_SCAN_CAP` on the *reference* read meant a team
with more attachments than the cap had referenced files deleted once the grace
period passed. It is now keyset-paged and throws rather than proceeding with a
partial reference set. Correct, and not scored, because criterion 6 penalises
scan shape and this was never a scan-shape defect — it was a data-loss bug.

---

### 7 · The slowest operation is known and named — 0/100 · weight 9 · coverage · unchanged

| points | check | earned | evidence |
|---|---|---|---|
| 50 | someone can name it without looking | **0** | none of the 40 root markdown files names it. `AGENTIC-IMPORT.md:282` and `targets.ts:70` still state the shape — "Most targets are written one row at a time" — as a neutral fact about door design, never as "this is the slowest thing in the product" |
| 30 | it has a number | **0** | no number exists |
| 20 | it is on somebody's list | **0** | `grep -niE "import (duration\|speed\|slow)\|slowest"` across `BASE-IMPROVEMENTS.md`, `ROADMAP.md`, `UI-GAPS.md` → zero hits |

---

### 8 · Timings come from production, not a laptop — 70/100 · weight 8 · coverage · unchanged

| points | check | earned | evidence |
|---|---|---|---|
| 40 | durations recorded in the running system | **40** | `"observability": { "enabled": true }` × 14 across the seven workers and both environments. The probe's `observability: []` is a false negative — it only scans `.ts/.tsx/.js/.mjs/.sql` and never opens a `.jsonc` |
| 30 | enough context to find the slow one — route, tenant, row count | **0** | nothing in the app stamps a duration with a route or a team. The correlation spine is now *stronger* — `traceError` (`shared/workers/trace.ts`) emits structured JSON with `req`/`worker`/`place`, `requestIdFrom` mints one id at the public door, the gateway and realtime now record crashes centrally, and `forwardToDoor` carries the id across the import hop — but every one of those fires **only on error** and none carries a duration field |
| 30 | a local measurement never presented as a production one | **30** | vacuously true, and honestly so: there are no local measurements either |

The repair pass made this criterion's *missing half* cheaper to build without
building it. The id, the worker name, the place string and the structured log
shape all now exist and are threaded through every worker. What is missing is one
number and one header.

---

### 9 · Nothing blocks on work that could be deferred — 0/100 · weight 5 · coverage · unchanged

Zero `ctx.waitUntil` in first-party source. All seven entry points are still
`async fetch(request: Request, env: Env)` — verified individually
(`workers/{auth,tenancy,realtime,gateway,content,data-ops,mcp}/src/index.ts`).
Nothing *can* be deferred without threading `ExecutionContext` through.

| points | check | earned | evidence |
|---|---|---|---|
| 50 | work the caller does not need is deferred | **0** | in front of every response: **46** awaited `publishChange` / `publishUserChange` / `publishSignOut` calls (43 excluding the three inside the seam itself), each a service-binding hop to realtime that fans to the Durable Object — and whose own contract says "best-effort: a live-layer hiccup must never break the write it describes"; **29** awaited `logActivity` writes (28 in round 1); **9** awaited `recordWorkerError` writes (8 in round 1); plus the `withIdempotency` outcome `UPDATE`, which runs after the work is complete and exists solely to serve a future retry |
| 30 | what is deferred is guaranteed to run | **0** | nothing is deferred |
| 20 | the response returns as soon as the answer is ready | **0** | the four serialized `oneX` + `countX` pairs still run entirely after the write has landed |

The round-2 brief records that `ctx.waitUntil` on `publishChange` was deliberately
**not** applied, because it would keep R1's source check green while changing what
the code does. **That was the right call and I want to be explicit that this
criterion staying at zero is a correct outcome, not a missed fix.** The condition
for doing it safely is in the fix map (F10): land it with a deliberately-broken
control case proving `publish-seam.test.ts` still fails.

---

### 10 · There is a trend, not one reading — 0/100 · weight 3 · coverage · unchanged

| points | check | earned |
|---|---|---|
| 60 | the same operation timed more than once, numbers kept | **0** — no number has been taken once |
| 40 | a regression noticed by someone other than a customer | **0** — `npm run check` has no duration gate; `scripts/smoke-staging.mjs` asserts status codes only |

---

## The forty lines

Round 1 said the two cheapest moves cost about forty lines and lift criteria
**1 (15) + 4 (12) + 7 (9) + 8 (8) + 10 (3) = 47 points of weight** off the floor.
That claim was not implementable as written. Here it is as four concrete diffs.

**Why the gateway and only the gateway.** It is the one public door (`ARCHITECTURE.md`;
every `/api/*` and `/mcp` request proxies through it), so one wrapper covers every
route in the product, and the number it produces is the one a person feels minus
the last-mile network. Per-worker granularity is a later, larger change.

### 1 · `shared/workers/trace.ts` — append 18 lines

```ts
/** ONE duration, emitted two ways: a `Server-Timing` header the browser's own
 * network panel reads with no tooling, and a structured log line Cloudflare's
 * observability can filter by `req`, `worker` and `place`. Nothing else in this
 * base measures anything, so this is the first number that exists.
 *
 * The 101 guard is load-bearing, not defensive: `/api/realtime` returns a
 * WebSocket upgrade through this same handler, and `new Response(res.body, res)`
 * on a 101 throws — instrumenting the live layer would switch it off. */
export async function timed(
  opts: { req?: string; worker: string; place: string; header?: boolean },
  work: () => Promise<Response>
): Promise<Response> {
  const t0 = Date.now()
  const res = await work()
  const ms = Date.now() - t0
  console.log(JSON.stringify({ level: "info", event: "request", req: opts.req, worker: opts.worker, place: opts.place, status: res.status, ms }))
  if (!opts.header || res.status === 101) return res
  const out = new Response(res.body, res)
  out.headers.append("Server-Timing", `app;dur=${ms}`)
  return out
}
```

### 2 · `workers/gateway/src/index.ts` — 4 lines changed

Import `timed` alongside `traceError`, then, inside the `fetch` handler
(line 76 at `fe7d683`, **line 101 at `1ef1210`** — anchor on `const requestId =
requestIdFrom(request)`, not the number):

```ts
    const requestId = requestIdFrom(request)
    const { pathname } = new URL(request.url)                       // hoisted from the catch
    const place = `${request.method} ${pathname}`                   // hoisted from the catch
    try {
      return await timed(
        { req: requestId, worker: "gateway", place, header: pathname.startsWith("/api/") || pathname === "/mcp" },
        () => route(request, env, requestId)
      )
    } catch (e) {
```

The `header` flag keeps the wrapper off `env.ASSETS` responses entirely — static
files are served without being re-wrapped, and they still get the log line. The
existing `const place = …` inside the catch is deleted (net zero).

`Server-Timing` needs no `Timing-Allow-Origin` here: the gateway serves the app
and the API from the same origin, so the browser exposes it to the network panel
and to `PerformanceResourceTiming.serverTiming` for free.

### 3 · `scripts/smoke-staging.mjs` — 9 lines

Inside the existing `api()` helper (line 19 — there is exactly one `fetch` wrapper,
so this covers every smoke call):

```js
const timings = []
// …inside api(), around the existing fetch:
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { … } })
  timings.push({
    path, method: opts.method ?? "GET", wall: Date.now() - t0,
    app: Number(/dur=(\d+)/.exec(res.headers.get("Server-Timing") ?? "")?.[1] ?? NaN),
  })
```

and at the end of the script, beside the existing `ok()` assertions:

```js
for (const t of timings)
  console.log(`TIME ${t.method} ${t.path} wall=${t.wall}ms app=${Number.isNaN(t.app) ? "?" : t.app + "ms"}`)
const worstRead = Math.max(0, ...timings.filter((t) => t.method === "GET").map((t) => t.wall))
ok("read budget (4x headroom for public network + cold start)", worstRead < 400, `worst GET was ${worstRead}ms`)
```

Four times the 100 ms budget is deliberate: `wall` includes the public internet
and a possible cold start, neither of which the budget covers. `app` is the number
to compare against 100 ms; the assertion guards `wall` generously so a slow-but-
working staging never blocks a deploy. Tighten it once a fortnight of numbers
exists.

### 4 · `OPERATIONS.md` — 10 lines

```markdown
## Speed budget

| operation | target | how to get the number today |
|---|---|---|
| read   | 100 ms | `Server-Timing: app;dur=` on any `GET /api/*`, or `npx wrangler tail brimba-gateway --env staging --format json` and read `ms` |
| write  | 250 ms | the same header on the `POST` |
| delete | 250 ms | the same header on the deactivate `POST` |
| bulk   | 1 min  | `POST /api/data-ops/import/confirm` — the slowest operation in the product |

`app;dur` is the gateway's own view (proxy + downstream), so it excludes the
public network. `npm run smoke:staging` prints every call's wall and app time and
fails if the worst `GET` exceeds four times the read budget.
```

### What those 40 lines are worth, criterion by criterion

| criterion | line it moves | from | to |
|---|---|---|---|
| 1 (wt 15) | "four real numbers, each with a source" (35) + "anyone can get the number today" (20) | 25 | **80** |
| 4 (wt 12) | "checked, not just declared" (30) + "breaching the budget is visible" (10) | 40 | **80** |
| 7 (wt 9) | "someone can name it" (50) + "it has a number" (30) | 0 | **80** |
| 8 (wt 8) | "enough context to find the slow one" (30) | 70 | **100** |
| 10 (wt 3) | "a regression would be noticed" (40); the 60-point trend line needs a second reading, which arrives with the next deploy | 0 | **40** |

Recomputing the total with only those five changed and everything else held:
`(80×15 + 27×14 + 20×13 + 80×12 + 83×11 + 93×10 + 80×9 + 100×8 + 0×5 + 40×3) / 100`
= `(1200 + 378 + 260 + 960 + 913 + 930 + 720 + 800 + 0 + 120) / 100` = **62.8 → 63**.

**39 → 63 for forty lines, none of which changes a query, a schema, a response
shape or a Law.** And criterion 1 crosses 40, so the gate stops applying — which
matters for every future run, not this one.

---

## Findings

Severity ordered. Round-1 numbering kept where the finding is the same one, so the
two reports can be read side by side.

**1 · CRITICAL (was critical) — a 1,000-row import is still 1,000 sequential
requests, one per row.** `workers/data-ops/src/lib/import.ts:497-511` still loops
`for (const r of parsed.rows)` calling `writeRow` once per row. The repair
rerouted that call through `forwardToDoor` (`import.ts:388`), which adds the
request id and the `origin: "import"` stamp and — by its own comment at
`shared/workers/http.ts:58-60` — **deliberately adds no timeout**. The transport
changed; the shape did not.

*What genuinely improved:* the multiplier. Each `writeRow` lands on a create door
that finishes with `oneX(...)`, and all five of those now read one indexed row
instead of a 1,000-row list. Round 1 estimated a 1,000-row import at roughly
500,000 rows read; the list-read term is gone, leaving on the order of 1,000 gate
reads + 1,000 inserts + 1,000 activity rows + 1,000 `COUNT(*)`s + 1,000 realtime
publishes ≈ **5,000 sequential HTTPS round trips**, inside one user-facing
request, with no chunking, no checkpoint and no progress. **Duration unmeasured** —
but a failure at 80% still restarts from row one and re-writes what already landed.
*Fix:* unchanged from round 1 — declare bulk create doors on the three base
targets so `writeParcel`/`packParcels` engage, and checkpoint the last completed
parcel index into `data_import_sessions`.

**2 · HIGH — nothing measures anything, so every statement in this report is a
shape claim.** Zero `Server-Timing`, zero `performance.mark`, zero logged
durations, across two rounds. See "The forty lines" above for the implementation.

**3 · HIGH — `teams.creator_id` and `teams.db_status` still have no index, and
`teams` is the one table shared by every tenant.** No core migration was added.
*Fix:* one migration adding `teams(creator_id)`, `teams(db_status)` and
`team_members(deactivated_at, team_id)`.

**4 · HIGH (NEW, from the repair pass) — five correct single-row readers now
exist, the five `?id=` doors beside them still read the whole collection, and
`CACHING.md` calls those doors "gated single-row read".**
`workers/tenancy/src/routes/roles.ts:38` (`:39` at `1ef1210`), `invites.ts:24`,
`selectable.ts:29`, `members.ts:16` and `workers/content/src/routes/learning.ts:38`
all answer `?id=<id>` with `listX().filter()` plus a `COUNT(*)`.

**This is the row-level live-patch re-pull path.** `web/lib/store.ts:patchRow`
answers a "row X changed" ping by calling `TEAM_RESOURCES[r].fetchOne(id)`, and
five of the six entries at `web/lib/live-resources.ts:175-219` resolve straight to
those doors — `tenancy.member`, `tenancy.role`, `tenancy.invite`,
`tenancy.selectableOne`, `contentApi.learningOne`. Only `contentApi.helpOne` hits
a real single-row door (`routes/help.ts:56`). So the repair fixed the mutation
*response* path and left the *live-sync* path reading a whole collection to patch
one row.

**And the canon states otherwise.** `CACHING.md:59` documents the registry entry
as `fetchOne: (id) => tenancy.role(id), // gated single-row read`. It is gated;
it is not a single-row read. That is a stated guarantee with no mechanism behind
it, on the exact path CACHING rule 3 exists to make cheap — a
`story_checks_out_review` contradiction as well as a duration defect.

*Fix:* five one-line changes — call the `oneX` that now exists — after which the
comment becomes true.

**5 · MEDIUM — the two `together` bulk twins still run their rows one at a time.**
`bulkSetLearningActive` (`workers/content/src/lib/learning.ts:441`) and
`bulkSetSelectableActive` (`selectable.ts:90`) loop `for (const id of ids)` calling
the single-row setter — an `UPDATE` plus an activity insert, two REST round trips
per id, up to `BULK_IDS_LIMIT = 512`. `bulk-doors.ts` declares both as
`ordering: "together"`, and R24's check only forbids `Promise.all` on `in-order`
twins, so a bounded-parallel rewrite is in-rule. The help twin
(`bulkSetStatusByFilter`) proves the set-based shape.

**6 · MEDIUM — the R16 exact `COUNT(*)` is still a full scan of the fastest-growing
table on every page of the feed.** `workers/tenancy/src/lib/activity-read.ts:96-110`
runs the keyset page and `SELECT COUNT(*) FROM activity` in parallel — the right
structure — but the count is O(rows) and `activity` is described in the schema as
the biggest table in any team database. A genuine law-versus-duration tension, not
a bug. The round-2 brief records that caching it was correctly rejected because it
breaks R16.

**7 · MEDIUM — one retention sweep still ignores its own file's batching rule.**
`EXPIRED_SESSIONS_SQL` at `shared/workers/retention.ts:117`. *Caveat unchanged:*
if expiries exceed 5,000/night a batched version never catches up, so the batch
size is a decision, not a constant to copy.

**8 · MEDIUM — four create doors still serialize two independent round trips.**
`json({ created: await oneX(), total: await countX() })`. One `Promise.all` each.

**9 · MEDIUM — `migrate-teams` and the orphan sweep still loop every team inside
one request.** `workers/tenancy/src/routes/admin.ts:18-40`. The orphan sweep's
*reference read* is now paged; the *per-team* loop around it is not, and neither
has a cursor.

**10 · MINOR — `verifyToken` still awaits a `last_used_at` write on every MCP
request** before doing anything. `workers/mcp/src/lib/tokens.ts:96`.

**11 · MINOR — `member_roles WHERE is_default = 1` and `db_alerts WHERE
resolved_at IS NULL`** are still unindexed lookups on small bounded tables.

**Cost added by other reviews' repairs, recorded so it is visible.** Neither is
scored as a defect; both are required work. **(a)** Every permissions save now
carries two extra indexed REST reads (`roles.ts:226`). **(b)** Every ticket reply
now carries one extra REST insert (`help.ts:472`). **(c)** The nightly orphan sweep
now issues ⌈N/1000⌉ reads per team instead of one — a team with 5,000 attachments
goes from 1 query to 5.

**Clean results, stated as results.** No `UPDATE` without a `WHERE` anywhere in
the base. No `DELETE` without a `WHERE` outside two deliberate, verified wipe
paths. Every retention date column indexed. Every team-DB paged read served by a
matching `DESC` composite or expression index. Every single-row read the repairs
added is PK- or UNIQUE-covered. Partial-failure behaviour on bulk paths is defined
more carefully than most codebases manage.

---

## FIX IMPACT MAP

Round-1 rows that are now DONE are marked so and kept, because the campaign's
value is the record of what a fix cost. New rows carry **NEW**.

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| ~~**F3/F4** single-row `oneX` readers~~ **DONE** | 5 files across content + tenancy | REMOVED a 1,000-row read from every create/edit/status/deactivate response | Landed as predicted: `story_checks_out` was protected because each comment was rewritten to explain the new guarantee; `lean_mean` paid ~40 lines for three shared projection constants. **It also fixed a bug neither review had found** — past the list cap the old readers returned `null` and `applyUpdated` dropped a live record off the screen |
| **F13 NEW** Point the five `?id=` doors at the `oneX` readers that now exist | `workers/tenancy/src/routes/{roles,invites,selectable,members}.ts`, `workers/content/src/routes/learning.ts` | REMOVES a full list read + a `COUNT(*)` from every row-level live patch. ~5 lines changed, net negative | **realtime_review** — this IS their re-pull path, so the response shape must stay byte-identical or a patched row differs from a listed one. The shared projections make that structural now. **R16** — the `?id=` response still carries `total`, so the `COUNT` stays; only the list read goes. **interfacelessness_review** — confirm no MCP tool reads the `?id=` shape. **story_checks_out_review** — strictly helps: it makes `CACHING.md:59`'s "gated single-row read" true instead of false |
| **F1** Emit a duration: `timed()` in the trace seam + the gateway wrapper (the forty lines) | `shared/workers/trace.ts`, `workers/gateway/src/index.ts`, `scripts/smoke-staging.mjs`, `OPERATIONS.md` | ADDS ~40 lines and one log line per request | **spend_review** — Workers Logs are billed per event on the paid plan, and this turns an error-only stream into a per-request one. Real, and the biggest cost of this fix. **realtime_review** — the 101 guard is mandatory; without it `/api/realtime` stops upgrading. **lean_mean** — 4 files for zero user-visible feature. Helps **error_log_review** and **architecture_review** |
| **F5** `Promise.all` the four `created` + `total` pairs | `routes/learning.ts`, `selectable.ts`, `roles.ts`, `help.ts` | Neutral line count | none — four one-line rewrites, no behaviour change |
| **F6** Core migration: index `teams(creator_id)`, `teams(db_status)`, `team_members(deactivated_at, team_id)` | new `db/core/0018_*.sql` | ADDS 3 indexes | **spend_review** / **scaling_review** — three more b-trees on the two hottest global tables. `teams` is written rarely so its two are near-free; `team_members(deactivated_at, …)` is the one to weigh. **mac_fell_in_the_ocean** — one more migration to apply on both environments, owner-gated in production |
| **F7** Bulk create doors on the 3 base import targets + a parcel checkpoint | `targets.ts`, new bulk routes in content + tenancy, `shared/workers/bulk-doors.ts`, team schema | ADDS the most code of any fix here | **lean_mean** — the single biggest addition proposed, against the first prime directive. **security_sentry** — three new write doors that must gate (R10) and validate at the boundary. **activity_log_review** — a bulk create must still leave a birth row per record (R25) or the trail loses N creations. **base_fork_review** — `targets.ts:70` currently states omitting `bulk` is the base's deliberate posture. **interfacelessness_review** — R19 filter parity must cover the new doors |
| **F8** Batch `EXPIRED_SESSIONS_SQL` like every other retention rule | `shared/workers/retention.ts`, `sharding.ts` | ADDS ~4 lines | **scaling_review** — a 5,000-row nightly cap cannot keep up past 5,000 expiries/night, so the fix trades one failure mode for another and the batch size needs a stated basis |
| **F9** Bounded-parallel `bulkSetLearningActive` / `bulkSetSelectableActive` | `learning.ts`, `selectable.ts` | REMOVES N×2 round trips; roughly neutral on lines | **activity_log_review** — the set-based help twin writes ONE activity row for the whole set. Copying that here means 40 deactivations leave 1 activity row, a direct tension with R25. A bounded-parallel loop keeps per-record rows and still cuts wall time. **This choice is the owner's, not a commit's** |
| **F10** Thread `ExecutionContext` and `waitUntil` the 43 publish calls | all 7 `index.ts`, `shared/workers/route.ts`, `realtime.ts`, ~43 call sites | REMOVES one service-binding hop from every mutation's critical path; ADDS a parameter to ~50 signatures | **STILL THE DANGEROUS ONE, and correctly deferred.** R1's `publish-seam` checks read handler source by name and look for `publishChange`; wrapping it in `ctx.waitUntil(...)` may still match while changing what the code does. Land it only with a deliberately-broken control case proving the seam test fails. Also **lean_mean** (50 signatures) and **realtime_review** (a deferred ping is a later ping) |
| **F11** Throttle `mcp_tokens.last_used_at` like `sessions.last_seen_at` | `workers/mcp/src/lib/tokens.ts` | ADDS ~4 lines, REMOVES a write from most MCP requests | **security_sentry_review** / **activity_log_review** — `last_used_at` becomes accurate only to the throttle window, a real loss during an incident. Auth accepted that trade for sessions; MCP tokens are the more security-sensitive of the two |
| **F12** Name the slowest operation in `OPERATIONS.md` with its measured number | `OPERATIONS.md` (folded into the forty lines above) | ADDS ~10 lines | none — documentation only. **story_checks_out** gains a capability no document owns. Depends on F1 producing a number |

---

## CEILING

**Yes, 95 is reachable by changing code. The true maximum is 97, unchanged from
round 1 — and the repair pass moved 15 points of criterion 5 into the bank
without costing anything anywhere else.**

- **Criteria 2, 5, 6, 7, 8, 10 (weight 54) can each reach 100.** Nothing
  structural blocks them: three indexes, five `?id=` one-liners, one batched
  delete, a duration field on an existing log line, a number written down and
  re-taken. Criterion 5 is already at 83.
- **Criterion 3 (weight 13) can reach 100**, but its last 15 points ("progress
  visible to whoever started it") need a live progress channel and a UI for it —
  `realtime_review`'s territory, and a new screen.
- **Criterion 9 (weight 5) can reach 100**, gated on F10 surviving R1's source
  scan. This round proved that gate is real: the repair team declined F10 for
  exactly the right reason.
- **Criterion 4 (weight 12) can reach 100 by code**, but its "the numbers suit
  the product" check may resolve by *moving the budget rather than meeting it*,
  and that is an owner decision. Behind it sits a locked decision in
  `ARCHITECTURE.md`: per-team D1 databases reached over the REST door. That puts
  at least two HTTPS round trips to `api.cloudflare.com` in front of every gated
  read — the floor on every read in this product, unavoidable without
  relitigating the architecture. **Whether that floor fits inside 100 ms is still
  unmeasured after two rounds, and it is still the single most valuable thing to
  find out**, because it decides whether criterion 4 is a code problem or a
  budget problem. The forty lines above answer it in one deploy.
- **Criterion 1 (weight 15) is the only one with a genuine cap.** Its first three
  checks (80 points) are pure code and docs. Its last 20 — "anyone on the team
  can get the number today without asking you" — sits against a **single-author
  project**: there is no team. Read literally, criterion 1 caps at 80 and the
  achievable total caps at **97**. Read as "any competent stranger, from a
  written runbook" — the reading `mac_fell_in_the_ocean_review` uses — it reaches
  100 and the cap disappears.

**So the true maximum is 97, and 95 is comfortably inside it.** The honest caveat
is still cost, not reachability: getting from 39 to 95 means three bulk create
doors, a checkpoint column, three indexes, a progress channel and a parameter on
fifty signatures. Every one raises this review's score and lowers `lean_mean`'s.
**The forty lines above are the exception** — they cost 40 lines, cross the gate,
and take the total to 63 without touching a query, a schema, a response shape or
a Law.

---

**Verdict.** The slowest operation in Brimba is still a 1,000-row CSV import
(`POST /api/data-ops/import/confirm` → `workers/data-ops/src/lib/import.ts:497`),
which writes one row per service-binding request, sequentially, with no chunk and
no checkpoint. The repair pass removed the 1,000-row list read that each of those
requests used to trigger, which is a real and large improvement and does not
change the shape. Its duration is **unmeasured, because after two rounds nothing
in this codebase has ever been timed** — the number would come from
`Server-Timing: app;dur=` once the forty lines land, or today from
`curl -w '%{time_total}'` against staging, neither of which needs a schema change.
