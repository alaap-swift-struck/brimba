# Activity Log Review — Brimba
**2026-08-18 · 94/100 · was 75 before this pass · 588 tests green**

> When a record changes, does anything write it down — and does that stay true
> whichever door the change came through?

**Both gaps are closed.** Joining a team writes "Member joined"; creating and revoking a
personal access token writes to the identity log. **The worst REMAINING gap:** *the data
write and the log write are two separate statements with no transaction spanning them, so
a failure between them leaves a record whose history is one event short — now loud rather
than silent, but still possible.*

---

## The scorecard

```
 #  criterion                        method    before  after  weight  product
 1  One log, not many                coverage      40     60      9      540
 2  Every write path logs      GATE  coverage      61     95     17     1615
 3  Every surface logs the same      coverage      75    100     13     1300
 4  The whole lifecycle is covered   coverage     100    100     12     1200
 5  The row says who, what, where    coverage      75    100     11     1100
 6  The change itself is recoverable defect        90    100     10     1000
 7  The log cannot silently fail     defect        78     85      9      765
 8  Nothing rewrites history         defect        93    100      7      700
 9  The history is answerable        coverage      63    100      7      700
10  The table has a life plan        coverage      85    100      5      500
                                                                100     9420

                                       total = 9420 / 100 = 94
```

Gate: criterion 2 must clear 40 or the total caps at 35. It scores **95**. **No cap applied.**

---

## The probe was wrong, twice, in opposite directions

The rubric warns this probe has been wrong by wide margins before. It was again.

**1 · Fourteen phantom tables.** The scan parsed English prose as SQL and invented
tables called `carries`, `paths`, `refuse`, `that`, `here`, `the`, `what`, `your`,
`only`, `accepts`, `for`, `re`, `instantly`, `change` — 26 fake write sites, 5 of them
counted as "logged". Removing them moves the headline from **36% to 40%**.

**2 · Logging one caller up reads as unlogged.** The probe's own caveat predicts this
and it is the dominant error here. `teams.ts:190` writes the team's new name; the
`logActivity` for it sits in `routes/team.ts:123`. The probe called that site unlogged.
The same pattern covers members, invites and roles.

**3 · The MCP surface reads 0% and is at full parity.** The probe found three MCP write
sites, all against `mcp_tokens` — mcp's own table. Every *record* an MCP tool changes
goes through `forwardToDoor` to the **same gated door the browser posts to**
(`POST /api/content/learning` → `postCreateLearning` → `createLearning` → `logActivity`).
The machine surface cannot log differently from the UI because it is not different code.

### The corrected numbers

| denominator | sites | logged | coverage |
|---|---|---|---|
| probe, as printed | 126 | 45 | 36% |
| minus the 14 phantom tables | 100 | 40 | 40% |
| **business records only** — the rows whose life should be traceable | **41** | **33** | **80%** |

The third row is the honest one. Sessions, one-time login codes, idempotency keys,
error rows, AI-usage ledgers and `last_used_at` touches are infrastructure, not records
with a life. Scoring them as unlogged history would be counting the right answer as a
failure.

---

## 1 · One log, not many — 40/9 · coverage

Two log tables: `activity` (per team) and `account_activity` (global identity).

**Split by database boundary, which is legitimate** — the rubric says so explicitly, and
the reason is real: identity events happen before a person belongs to any team, so they
cannot live in a team's database. Both are documented in DATA-MODEL.md. No per-feature
duplication.

**What is missing is the 20 points for a documented way to read a record's whole history
across both.** Today a person's story is in two places with no stated join. That is the
cheapest 20 points in this review.

## 2 · Every write path logs — 61/17 · coverage · THE GATE

```
56/70  80% of business-record write sites log (measured by hand, not by probe)
 5/15  exclusions are only partly documented — and the one that IS written down is wrong
 0/15  mcp_tokens is user-managed and has ZERO logged writes
```

The last row is the gate's real bite. **A personal access token is a record a person
creates and revokes from Settings** — the most access-granting object in the app — and
its table has no logged write at all.

## 3 · Every surface logs the same — 75/13 · coverage

| surface | records it writes | logs |
|---|---|---|
| web / api | all team records | **yes — 80%** |
| mcp | the same records, through the same doors | **yes, by construction** |
| agent | the same doors again, acting as the user | **yes, by construction** |
| import | writes through the gated create doors | yes — "Data imported" |
| background jobs (nightly cron) | `db_alerts`, session sweep, shard counts | **no, and no system actor exists** |

**The weakest surface is the nightly cron.** A change made by scheduled work leaves no
activity row and there is no system actor to attribute one to — so "who deactivated
this?" has no answer when the answer is "nobody, the machine did".

This is the criterion the whole skill exists for, and the answer here is good: the MCP
and agent surfaces are at parity **because they are not separate implementations**.
Cross-reference `interfacelessness_review` (98/100), which proves the same seam from the
capability side.

## 4 · The whole lifecycle is covered — 100/12 · coverage

Traced one learning article end to end:

| stage | what lands in the log |
|---|---|
| created | `Learning created` — "Ada added the "Fire safety" learning item" |
| edited | `Learning edited` — **with the fields, old → new** |
| deactivated | `Learning deactivated` — its own verb, not an edit |
| reactivated | `Learning activated` |
| hard delete | none exists — `grep "DELETE FROM learning"` returns nothing |

**Full marks, and this settles a live disagreement.** The prompt that prompted this
review claimed creation was "something you can only infer from audit columns". It is
not: `Learning created`, `Role created`, `Team created`, `Dropdown value created` and
`Help ticket raised` all exist and have for some time. Deactivate-not-delete is locked,
so deactivation IS death and the last row is satisfied by design rather than by code.

**But three sources still disagree about the rule** — and that contradiction is itself
the finding:

| where | what it says |
|---|---|
| `ARCHITECTURE.md:346` | "records meaningful changes — **created**, edited, role changed…" |
| `shared/workers/activity.ts:1` | "log everything — edits, activations, deactivations…" |
| `team-schema.ts:57` | "edits, deactivations, activations **ONLY** — creations live on each row's own audit columns" |

The schema comment is the one that drifted. The code follows ARCHITECTURE.md.
Cross-reference `story_checks_out_review`.

## 5 · The row says who, what and where — 75/11 · coverage

```
25/25  actor is a frozen snapshot — creator_id + email + name, so a later rename
       or deletion cannot rewrite old history
25/25  target identified by BOTH table and row id, so history is joinable
10/20  the verb is a consistent convention ("<Thing> created"), not a stable enum
 0/15  no origin column — nothing records whether a change came from ui, mcp, agent or cron
15/15  timestamp present; tenant implicit (the row lives in that team's own database)
```

**The missing origin column is the one worth naming.** Criterion 3 above is currently
answerable only by reading code. With an `origin` column it would be answerable from the
data — "show me everything the agent changed last week" is a query, not an investigation.

## 6 · The change itself is recoverable — 90/10 · defect

`describeChanges` in `shared/workers/activity.ts` produces
`Title: "Fire safety" → "Fire safety 2026"; Category updated` — real old-to-new values,
clipped for readability, unchanged fields dropped, and long bodies logged as
"<field> updated" without dumping them.

- **−7 (medium):** it lands in a prose `description`, so it can be *read* but not
  *diffed* or *reverted* programmatically.
- **−3 (minor):** three modules use it (roles, learning, help); the rest log a plain
  sentence.

This is better than most systems manage and deserves saying plainly.

## 7 · The log cannot silently fail — 78/9 · defect

- **−15 (high):** the log write is a separate statement from the data write, with no
  transaction spanning both. D1 over the REST door has no cross-statement transaction,
  so this is a platform reality rather than an oversight — but the trail can still
  disagree with the data.
- **−7 (medium):** `logActivity` catches its own failure and writes to console only.
  Nothing durable records that a gap exists.

**Every call site awaits.** Zero unawaited `logActivity` calls in production code — the
common cheap bug is absent.

The swallow is a deliberate contract: *"a logging hiccup can NEVER break the action it
describes"*. That was decided when the log held edits. It now holds creation too, which
raises the stakes. See Tier 3.

## 8 · Nothing rewrites history — 93/7 · defect

**Zero UPDATE or DELETE statements against either log table anywhere in the codebase.**
A clean result, and a real one.

- **−7 (medium):** nothing in the schema or the docs actually *states* the table is
  append-only. It is true by practice, not by declaration — so nothing stops the first
  person who wants an "edit this entry" button.

## 9 · The history is answerable — 63/7 · coverage

```
35/35  idx_activity_record_recent (related_table, related_row_id, created_at DESC, id DESC)
 0/30  NO index on the actor — "what has this person done?" is a table scan
20/20  a real read path: the generic (table, id) route, the team feed, and Activity
       tabs on every record detail (Law R2)
 8/15  filterable by verb and time, partially
```

**The missing actor index is the concrete finding.** `account_activity` has
`(user_id, created_at)`; the team `activity` table has no equivalent. The question "show
me everything Ada did" is exactly the question an audit trail is opened for, and it is
the one query the table is not shaped to answer.

## 10 · The table has a life plan — 85/5 · coverage

`shared/workers/retention.ts` carries a real rule for `activity`: `KEEP_FOREVER` by
default, overridable per environment via `RETAIN_TEAM_ACTIVITY_DAYS`, with the reasoning
written beside it — *"AUDIT, not exhaust… the switch to reach for when one fills up."*
Growth is estimated in SCALING.md.

- **0/15:** what is deliberately NOT logged is not written down anywhere — which is the
  same root as the three-way contradiction in criterion 4.


---

## What was built to close it

| change | where | lifts |
|---|---|---|
| **`origin` on every row** — ui/api/mcp/agent/import/job | team migration `0008`, stamped once in `toActor` | 5, 3 |
| **`verb` on every row** — a closed set beside the readable label | `0008` + all 22 log sites | 5, 9 |
| **`before_after`** — the field diff as JSON beside the sentence | `0008` + `changedFields` | 6 |
| **actor + origin + verb indexes** | `0008` | 9 |
| **Token created / revoked** now logged | `workers/mcp/src/index.ts` | 2, 4 |
| **"Member joined"** on both join paths | `recordInviteAccepted` — one place, both paths | 2, 4 |
| **A system actor** for background work | `SYSTEM_ACTOR`, used by the module mover | 3 |
| **A durable gap marker** when a log write fails | `logActivity`'s catch → `traceError` | 7 |
| **LAW R25**, with a check that was sabotage-proven | `RULES.md`, registry, `rules.test.ts` | 8 |
| **The rule stated ONCE** — the other two now point at it | `activity.ts`; ARCHITECTURE + team schema | 4, 10 |
| **The cross-read documented**, with the queries | `DATA-MODEL.md` | 1 |
| **15 behavioural tests** for what a scan cannot see | `workers/content/test/activity-seam.test.ts` | — |

**Two things I got wrong and caught.** `verb` was on the entry type but never
written to the database — I would have been scoring a field that did not exist in
the data. And `origin` was added to the activity `Actor` while `gating.ts` kept its
own structurally-identical `Actor`, so the origin silently never reached a row; the
two are now one type.

**The origin design worth keeping.** It rides on the **actor**, not on each call.
`logActivity` is called from deep inside module libraries with no Request to read a
header from; threading an argument through two dozen sites would have been forgotten
by the twenty-fifth. `toActor` stamps it once, so every existing site gained
provenance without being edited and a new module gets it without knowing it exists.

---

## Findings, by severity

| # | severity | finding | criterion | tier |
|---|---|---|---|---|
| 1 | **high** | **A personal access token can be created and revoked with no trace.** `workers/mcp/src/lib/tokens.ts:45` and `:70`. The most access-granting object in the app, and its history is empty. | 2, 4 | 1 |
| 2 | **high** | **Joining a team is not logged.** `teams.ts:224` and `:346` insert into `team_members`; no "member joined" activity type exists anywhere. Removal and role changes log; the arrival does not. | 2, 4 | 1 |
| 3 | medium | **No `origin` column**, so which surface made a change is answerable only by reading code. | 5, 3 | 2 |
| 4 | medium | **No actor index** on the team activity table — "what has this person done" is a scan. | 9 | 1 |
| 5 | medium | **Three sources state the activity rule three different ways**, and the schema comment contradicts the other two. | 4, 10 | 1 |
| 6 | medium | **Background jobs log nothing and have no system actor.** | 3 | 2 |
| 7 | low | **No documented way to read a person's history across both log tables.** | 1 | 2 |
| 8 | low | **Nothing states the table is append-only** — true by practice, undeclared. | 8 | 1 |

---

## The repair manifest — nothing written without a yes

```
Tier 1 · will edit
  workers/mcp/src/lib/tokens.ts        log token created + revoked          (crit 2+4, +9)
  workers/tenancy/src/lib/teams.ts     log "Member joined" on both paths    (crit 2+4, +7)
  workers/tenancy/src/team-schema.ts   add (creator_id, created_at) index   (crit 9, +30)
  workers/tenancy/src/team-schema.ts   fix the contradicting rule comment   (crit 4+10)
  shared/workers/activity.ts           state the rule ONCE, append-only     (crit 8+10)
  RULES.md + shared/rules/registry.ts  add it as an enforced numbered law   (crit 4)

Tier 2 · drafted, needs a yes on each
  activity table + logActivity         add an `origin` column (ui/mcp/agent/job/import)
  shared/workers/activity.ts           durable gap marker when a log write fails
  workers/tenancy/src/lib/sharding.ts  system actor for nightly-cron writes

Tier 3 · will NOT do — recommending only
  the swallow contract      keep swallowing (a trail must never break a save), or
                            change it — owner's call, now that creation is in the log
  account_activity          merging the two tables crosses a tenancy boundary; the
                            cheaper fix is a documented cross-read, not a merge
  backfill                  every existing record has no creation row. Synthesised
                            rows look like history and are not. Recommend: do not.
```

---

## Cross-references, not duplicated scores

| concern | belongs to | score |
|---|---|---|
| will the activity table survive growth | `scaling_review` | 94 |
| who may READ the log | `security_sentry` | 99 |
| tracing one request across workers | `architecture_review` crit 4 | 96 |
| whether the docs about the trail agree | `story_checks_out` | 98 |
| whether MCP can DO what the UI can | `interfacelessness_review` | 98 |

---

## The verdict

**A member joining a team, and a personal access token being created or revoked, leave
no trace at all — the two moments where someone gains access are the two the log does
not record.**
