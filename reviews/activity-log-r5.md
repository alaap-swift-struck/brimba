# Activity log review — round 5 — Brimba · 2026-08-26

SCORE: **92/100** — round 3: 89 · round 2: 88 · round 1: 82 · the retired 18 August run: 94

> When a record changes, does anything write it down — and does that stay true
> whichever door the change came through?

**The worst gap, in one sentence:** *the write that decides who can do what records
only that it happened* — `setRolePermissions`
(`workers/tenancy/src/lib/roles.ts:355`) has the before sheet and the after sheet
both in scope and logs "Ada updated permissions for the Viewer role", so a feed can
never answer which right moved, on which module, in which direction.

**Mode:** audit, read-only. Nothing in this repository was edited except this file.
`npm run check` was not run (the brief forbids it); every check I credit was read
line by line, and the derivations that matter were **re-implemented out of tree**
in `/private/tmp/.../scratchpad` so the numbers below can be reproduced by anyone.

**Measured at `959c80a`.** `HEAD` advanced to `f30f954` while this run was in
flight. I diffed it: `RULES.md`, `shared/rules/registry.ts` (R1's law text),
`CACHING.md`, `CONVENTIONS.md`, `ERROR-HANDLING.md`, `SCALING.md`,
`DATA-MODEL.md`, `timings.json`, and JSDoc-only edits to
`shared/workers/d1-rest.ts` and `shared/workers/realtime.ts`. No behaviour
changed, so every score below holds at `f30f954` — with one exception that makes a
finding worse rather than better: `DATA-MODEL.md` gained a paragraph asserting the
one-INSERT guarantee **is** machine-checked. See finding 3.

---

## DELTA

| # | Criterion | wt | R2 | R3 | **R5** | Move | Cause |
|---|---|---|---|---|---|---|---|
| 1 | One log, not many | 9 | 60 | 60 | **60** | — | locked: two tables split by database boundary |
| 2 | Every write path logs · **GATE** | 17 | 92 | 94 | **100** | +6 | **code/docs changed** — the 25 deliberately-unlogged tables are now named, derived and machine-checked |
| 3 | Every surface logs the same | 13 | 100 | 100 | **100** | — | held; re-verified end to end this round |
| 4 | The whole lifecycle is covered | 12 | 93 | 96 | **98** | +2 | **code changed** — the bulk row gained its verb; the invite-acceptance scope gap stands |
| 5 | The row says who, what and where | 11 | 94 | 94 | **97** | +3 | **code changed** — all 27 log sites now carry a verb (was 27 of 28); origin now reaches the wire |
| 6 | The change itself is recoverable | 10 | 90 | 90 | **82** | −8 | **+7 code changed** (`before_after` finally has a reader) **−15 the last measurement never asked** whether the PERMISSION write carries a diff |
| 7 | The log cannot silently fail | 9 | 75 | 75 | **77** | +2 | **the last measurement was wrong** — durable evidence already existed one layer down; the purpose-built marker is still unplugged |
| 8 | Nothing rewrites history | 7 | 93 | 97 | **97** | — | unchanged — round 3's file-wide retention exemption is still file-wide |
| 9 | The history is answerable | 7 | 90 | 90 | **97** | +7 | **code changed** — server-side verb/origin/from/to filters, bound and indexed; no caller sends them |
| 10 | The table has a life plan | 5 | 83 | 83 | **100** | +17 | **code/docs changed** — a real growth model in SCALING.md, and the not-logged list is complete |

### Did somebody else's repair break my criteria?

**One criterion moved down, and no repair caused it.** Criterion 6 fell 8 because
this round's `before_after` reader earned back the 7 points round 3 charged, and
then a defect round 3 never looked for cost 15. Everything else moved up or held.

| repair (whose) | effect here |
|---|---|
| the `opt()` / `=== undefined` update-door fix (correctness) | **helped, twice.** `updateLearning` now computes each diff row from the value it actually WROTE, so a preserved link is no longer reported as cleared — history that described a change that never happened. And `Order`/`Required` joined the diff instead of being silently defaulted |
| the ticket-create `d1Batch` fold (round-trip / speed) | **mixed, and honestly documented.** The activity row now rides the ticket's own crossing, so the "row landed, log call failed" hole is gone — and it is the ONE write path where a logging failure now fails the action. Named in the source as a change of contract, which is the right way to do it |
| `truncated` on MCP results, `X-Export-Truncated` (scaling) | **neutral** |
| the paged `COUNT(*)` kept (settled, `ROUND5-RECONCILIATION.md` §3) | **helped.** The activity feed's exact total still passes through the same where-clause as the page, which is what stops a badge counting rows the list will not show |

---

## Arithmetic

```
 #  criterion                          method     score  weight  product
 1  One log, not many                  coverage      60      9      540
 2  Every write path logs        GATE  coverage     100     17     1700
 3  Every surface logs the same        coverage     100     13     1300
 4  The whole lifecycle is covered     coverage      98     12     1176
 5  The row says who, what and where   coverage      97     11     1067
 6  The change itself is recoverable   defect        82     10      820
 7  The log cannot silently fail       defect        77      9      693
 8  Nothing rewrites history           defect        97      7      679
 9  The history is answerable          coverage      97      7      679
10  The table has a life plan          coverage     100      5      500
                                                          ----     ----
                                                           100     9154

                                    total = 9154 / 100 = 91.54  →  92
```

**The gate.** Criterion 2 must clear 40 or the total caps at 35. It scores **100**.
No cap applied.

**Sensitivity on the one judgement call.** Criterion 6's permission finding is
scored **high (−15)**. The rubric names permissions only in its *critical* row, and
the criterion's subject is the log overall — three modules do carry diffs — so
critical overstates and medium understates. At medium (−7) criterion 6 is 90 and
the total is 9234/100 = 92.34 → **92**. The score does not move either way; the
finding's rank does.

### The probe, corrected by hand — fourth round, same shape, bigger denominator

| denominator | sites | logged | coverage |
|---|---|---|---|
| probe as printed (R5) | 139 | 49 | **35%** |
| probe as printed (R3) | 127 | 50 | 39% |
| minus **35** phantom sites parsed from English prose | 104 | 43 | 41% |
| minus **8** sites logged one caller up (probe false negatives) | 104 | 51 | 49% |
| **business-record sites only** (hand-classified, every one opened) | **43** | **43** | **100%** |

**The 35 phantoms**, each confirmed by opening the line — a regex reading
`update <word>` out of a comment: `the` (7), `guard` (5), `what` (3), `accepts`,
`carries`, `door`, `only`, `paths`, `that` (2 each), and `change`, `for`, `here`,
`instantly`, `re`, `refuse`, `wrote`, `your` (1 each). Round 3 found 22; the extra
13 are because the probe now also walks `web/**/*.tsx` and `shared/types.ts`, whose
comments are as English as anyone's. Six of the 35 were counted by the probe as
*logged*, which is why the numerator drops from 49 to 43 in the same step.

**The 8 probe false negatives, all re-opened this round:** `teams.ts:227,230`
(`updateTeamDetails` → logged at `routes/team.ts:127`), `teams.ts:266,273` and
`teams.ts:387,398` (both invite-accept paths → logged inside
`recordInviteAccepted`, `teams.ts:82`), `workers/mcp/src/lib/tokens.ts:45,77`
(→ `mcp_token_created` / `mcp_token_revoked` at `workers/mcp/src/index.ts:145,164`).

**The 43, by table** (logged / total): `help` 5/5 · `help_threads` 1/1 ·
`learning` 4/4 · `member_roles` 4/4 · `role_permissions` 2/2 ·
`selectable_data` 5/5 · `team_members` 5/5 · `invite_index` 4/4 · `invite_logs` 2/2 ·
`teams` 5/5 · `users` (identity) 4/4 · `team_module_databases` 1/1 ·
`email_change_logs` 1/1.

**The 7 sites in business tables that deliberately do not log**, all documented:
`users.current_team_id` × 4 (the active-team pointer — which team you are LOOKING
at, not a change to a record), `teams.shard_count`, `teams.schema_version` (the
migration robot), and `teams.db_status = 'failed'` — the last of which is covered
only by the table's name appearing in the list, not by a reason that fits it. It
also **cannot** log: a team whose database failed to provision has no `activity`
table to write into. Worth one clause in the list; not a defect.

---

## Verification of the five claims in the brief

| claim | verdict | evidence |
|---|---|---|
| 25 deliberately-unlogged tables named in six reasoned groups, machine-checked against the tables no activity row can name | **TRUE, exactly** | I re-implemented `activity-seam.test.ts`'s derivation (`scratchpad/unlogged.mjs`): every table written by worker or shared server code, minus `ACTIVITY_GATE_MAP` ∪ `ACTIVITY_TABLE_EXEMPT`, leaves **25** tables — and all 25 are named in `shared/workers/activity.ts:28-78`. Six groups: secrets/machinery, ledgers/exhaust, per-view telemetry, the active-team pointer, wizard progress, the platform. Three blindness guards on the check (`tables.size > 15`, `unloggable().length > 10`, and both section markers found) |
| `before_after` now has a reader — an Activity-tab expander, record scopes only, honouring a hide-values flag | **TRUE** | `web/components/activity-changes.tsx` (a `Collapsible` labelled "What changed", collapsed by default, `hideValues` → "Updated — the before and after aren't shown"); the server half is `workers/tenancy/src/lib/activity-read.ts:54-76`, which selects `before_after` **only when `scope !== "team"`**, strips values on `hideValues`, and clips the rest to 200 characters. Gated twice on purpose — once in the SELECT, once in the mapper |
| server-side `verb`/`origin`/`from`/`to` filters, wired through the route as bound parameters | **TRUE** | `activity-read.ts:110-163` — `oneOf` against the exported `ACTIVITY_VERBS` / `ACTIVITY_ORIGINS`, `isoBound` against an ISO regex that expands a bare `to` date to end-of-day; clauses pushed into the SAME arrays as the scope so they ride the `COUNT(*)` too. Route: `workers/tenancy/src/routes/team.ts:152+`. Indexes exist for both (`origin, created_at DESC, id DESC` and `verb, created_at DESC, id DESC`) |
| exactly one `INSERT INTO activity` in the codebase, machine-checked | **TRUE of the codebase, NOT of the check** | Grep across `workers/ shared/ web/ db/ scripts/` returns one production occurrence — `shared/workers/activity.ts:333`. But the check (`workers/content/test/ticket-create-batch.test.ts:236-256`) reads **two named files**: it asserts `help.ts` has none and `activity.ts` has exactly one. A hand-copied INSERT in `roles.ts` tomorrow keeps it green. Finding 3 |
| the gap marker can record to the error store | **TRUE of the seam, and NOTHING USES IT** | `logActivity(cfg, db, actor, entry, record?)` and `logAccountActivity(env, uid, event, record?)` both take an optional `OutboundRecorder` and both are tested against a collector. I counted the arguments at every call site: **26 of 26** `logActivity` calls pass four; **6 of 6** `logAccountActivity` calls pass three. Zero callers supply a recorder. Finding 1 |

---

## Criterion arithmetic, row by row

**1 · One log, not many — 60/100 · weight 9** *(unchanged, locked)*
```
 0/40  TWO log tables: `activity` (per team) + `account_activity` (global)
25/25  each has a documented, non-overlapping reason — split by DATABASE boundary
       (shared/workers/account-activity.ts:1-24, DATA-MODEL.md:263-273)
20/20  one documented way to read a person's whole history across both
       (DATA-MODEL.md § "Reading one person's whole history", with the merge SQL)
15/15  no per-feature log table duplicating the central one. `invite_logs` reads
       like one and is not: it is the invite RECORD, team-local, and activity rows
       NAME it as a relatedTable. `error_logs` / `agent_usage_log` are ledgers,
       each documented as its own log
```
Round 3's finding 2 — the two files disagreeing about what `account_activity`
holds — is **still open at HEAD** (finding 4). I again decline to dock row 2: the
*reason* for the split is stated correctly in both places, and only a parenthetical
list of contents disagrees. The rubric's own instruction for two disagreeing
sources is to report the contradiction and cross-reference `story_checks_out_review`
rather than pick a winner. It is reported, for the second round running.

**2 · Every write path logs — 100/100 · weight 17 · THE GATE** *(was 94)*
```
70/70  70 × 1.00 — 43 of 43 business-record write sites log
15/15  15 × 53/53 — EVERY genuinely-unlogged site's table is named in
       shared/workers/activity.ts, verified by script rather than by reading:
       61 real unlogged sites − 8 probe false negatives = 53 genuinely unlogged,
       and 0 of the 53 fail the `\bTABLE\b` test against the stated block
15/15  NO user-editable business table has zero logged writes
```
Round 3 scored this row `15 × 31/47 = 9`. The whole 6-point move is the list, and
the list is derived from the code rather than typed, so it cannot rot the way the
first one did.

**3 · Every surface logs the same — 100/100 · weight 13** *(unchanged)*
```
40/40  no surface sits more than 15 points below the best
25/25  MCP and agent log at the same rate as the API BY CONSTRUCTION — both go
       through forwardToDoor to the same gated door the browser posts to
20/20  background work has a system actor and its rows are stamped `job`
15/15  bulk and import paths log
```

**The origin chain, traced end to end this round** (round 3 asserted it; I followed
it): `forwardToDoor` sets `x-brimba-origin` from its `origin` option
(`shared/workers/http.ts:72`) — `"mcp"` in `workers/mcp/src/lib/tools.ts:192`,
`"agent"` in `workers/data-ops/src/lib/tools.ts:342`. `originFrom` validates it
against the closed set and defaults to `"ui"` (`activity.ts:164-167`). `toActor`
reads it once per request (`gating.ts:129-138`), so every module's existing
`logActivity` call inherits it with no per-site wiring. `SYSTEM_ACTOR` carries
`origin: "job"` explicitly, so a nightly sweep cannot be mistaken for a person.

**The surface parity board**

| surface | how a record change reaches the log | R3 | R5 |
|---|---|---|---|
| web / api | the gated doors | 100% (44/44) | **100% (43/43)** |
| mcp | the same doors via `forwardToDoor`, stamped `mcp`; tokens → `account_activity` | yes | yes |
| agent | the same doors again, acting as the user, stamped `agent` | yes | yes |
| import | each row through the create door stamped `import`, plus a summary row | yes | yes |
| job (cron) | `SYSTEM_ACTOR`, stamped `job` | yes | yes |
| identity (auth) | `account_activity`: created, email, name/photo, tokens | complete | complete |

**A change made through every one of these five doors leaves the same footprint.**
That sentence is the one this rubric demands and it is, for the third round, true.

**4 · The whole lifecycle is covered — 98/100 · weight 12** *(was 96)*
```
30/30  creation is in the central log for every team record AND for the PERSON
30/30  edits are recorded, including the ticket reply
18/20  archive/deactivate carries its own verb — round 3's verbless bulk row is
       fixed (help.ts:528 `verb: "status"`). −2 stands for the one remaining
       SCOPE gap: an invite's ACCEPTANCE is logged as "Member joined" against
       `team_members` (teams.ts:82-89) while `invite_logs` is UPDATED with no row
       naming it — so an invite's own Activity tab shows sent and revoked, never
       accepted
20/20  hard deletes provably do not happen to any master record — every
       `DELETE FROM` in server source is sessions, idempotency_keys or the
       documented retention sweep. Deactivate-not-delete is locked (ARCHITECTURE §4)
```

**5 · The row says who, what and where — 97/100 · weight 11** *(was 94)*
```
25/25  frozen actor snapshot — creator_id + creator_email + creator_name
24/25  target by table AND row id, except `bulkSetStatusByFilter` when more than
       one ticket moves (help.ts:531 sends relatedRowId only for a set of one).
       That is the settled trade — ROUND5-RECONCILIATION §3 refused splitting it
       into N rows because a 500-ticket resolve would write 500 rows into the
       fastest-growing table in a team database. −1, permanently
20/20  the verb is a stable enum — and now ACTUALLY WRITTEN. I counted every
       logActivity/activityStatement call site outside the seam: 27 of 27 carry
       `verb:`. Round 3 measured 27 of 28. A check backs it
       (activity-seam.test.ts: every declared verb must appear in source)
13/15  origin recorded, validated at the boundary, and — new this round — SELECTed
       and carried on the wire (activity-read.ts:249, 272-273). Still: five of six
       values reachable (`api` is declared and nothing writes it), and NO SCREEN
       SHOWS origin or verb to a person — `activityFeedItems` maps a row to
       {id, description, actor, timestamp} and drops both
15/15  timestamp present; tenant implicit in the per-team database
```

**6 · The change itself is recoverable — 82/100 · defect · weight 10** *(was 90)*
```
100  base
−15  high: THE PERMISSION WRITE CARRIES NO BEFORE/AFTER. Finding 2
 −3  minor: 3 of ~7 write-bearing modules build a field diff, and which three IS
     written down (activity.ts:216-223) — which is what keeps this minor rather
     than medium. `selectable_data`, `team_members`, `invites` and `teams` log a
     sentence a person can read and a machine cannot reconstruct from
 ---
  82
```
Round 3's −7 ("`before_after` is written and has NO reader") is fully repaid: the
column is now read, clipped, hide-values-honoured, scope-gated and rendered.

**7 · The log cannot silently fail — 77/100 · defect · weight 9** *(was 75)*
```
100  base
−15  high: the data write and the log write are two statements with no transaction
     spanning them (D1 over the REST door). ONE path is now different —
     createTicket folds the activity row into the ticket's own d1Batch crossing —
     and its own comment declines to claim atomicity ("what the engine does with a
     statement that fails PART-WAY through a batch is D1's business"). So the −15
     stands, with one path improved
 −5  medium (was −7): durable evidence of a gap exists, but not the evidence that
     was built. Finding 1
 −3  minor: workers/tenancy/src/lib/teams.ts:97 is still a bare
     `console.error("invite accept record failed (audit only):", e)` with no event
     name, so the ONE audit failure with its own catch is the one not filterable
 ---
  77
```
Still true, re-checked: all 26 `logActivity` call sites `await`, and
`workers/content/test/idempotent-transitions.test.ts` proves a real transition
writes exactly one row and a repeat writes none.

**8 · Nothing rewrites history — 97/100 · defect · weight 7** *(unchanged)*
```
100  base
 −3  minor: the append-only exemption is still FILE-WIDE. `web/test/rules/
     activity.test.ts:125` is `if (path.endsWith("/retention.ts")) continue` — a
     blanket pass for a whole file, where the thing being excused is one statement
     shape. Round 3's finding 3, unrepaired
```
The scan itself is sound and I re-read every part of it: it walks `serverSources()`
(so `shared/workers/activity.ts` is inside the corpus, asserted at `:138-141`),
reads through `stripComments`, and carries all four patterns including
`DELETE FROM account_activity`. The probe's `historyRewrites` is empty and I
confirmed it by reading. **A clean result, and a real one.**

**9 · The history is answerable — 97/100 · weight 7** *(was 90)*
```
35/35  "this record's history" — idx_activity_record_recent
       (related_table, related_row_id, created_at DESC, id DESC)
30/30  "this actor's actions" — idx_activity_actor (creator_id, created_at DESC, id DESC)
20/20  a real read path: the generic (table,id) route, the team feed, an Activity
       tab on every record detail (Law R2). `account_activity` has its own
       (user_id, created_at) index and its own read path
12/15  filterable by verb, origin and time range — SERVER-SIDE, validated, bound,
       ANDed onto the scope, carried by the COUNT, and each with its own composite
       index. −3 because NOTHING CALLS IT: web/lib/api.ts:409,418 build the URL
       from scope/id/cursor only, no screen offers the control, and the activity
       door is a documented MCP exclusion. The capability is real and reachable by
       anyone who constructs the query; no product surface reaches it
```

**10 · The table has a life plan — 100/100 · weight 5** *(was 83)*
```
35/35  a stated retention window — TEAM_RETENTION `activity` = KEEP_FOREVER,
       overridable by RETAIN_TEAM_ACTIVITY_DAYS
30/30  the growth rate is estimated. SCALING.md:171-215 is now a full model:
       ~600 bytes a row all-in (260 row + ~345 across five indexes + ~150 for a
       diff), one row per logged change, 50 people × 20 mutations × 21 days =
       21,000 rows/month ≈ 150 MB/year, ~35 years of headroom against half a
       10 GB team database — AND the case that actually bites, import, at ~17
       files a day reaching the same budget in 18 months. Round 3's shortfall
       named exactly this and it is now answered with arithmetic
20/20  destruction is a deliberate documented choice, and OFF by default
15/15  what is deliberately NOT logged is written down — all 25 tables, six
       reasoned groups, derived from the code and machine-checked
```

---

## Findings

### 1 · MEDIUM — the durable gap marker is wired and unplugged: 0 of 32 call sites pass it
`shared/workers/activity.ts:272-289` · `shared/workers/account-activity.ts:57-85` ·
26 `logActivity` call sites · 6 `logAccountActivity` call sites

Both loggers gained an optional `record?: OutboundRecorder`, with careful reasoning
for the callback shape ("taking a `CoreDb` here would both force a required argument
onto two dozen call sites and marry the activity seam to the operations database")
and a good test suite proving the seam works when a recorder is supplied — including
that it names the record whose history now has a hole, that it records nothing on
the happy path, and that a recorder which itself throws cannot break the caller.

I counted the arguments at every production call site by parsing the calls, not by
reading them: **26 of 26 `logActivity` calls pass four arguments; 6 of 6
`logAccountActivity` calls pass three.** The fifth and fourth arguments are never
supplied. The comment at `activity.ts:354-359` explains that this marker is
deliberately **not throttled**, because "each row names a DIFFERENT record whose
history is now incomplete, and that list IS the repair list". That list is never
written.

**What DOES happen today, which round 3 got wrong in the other direction.** For
`logActivity`, a failed write is a `d1ExecScript` failure, and `d1ConfigFrom`
already passes `recordFailure: dbRecorder(opsDatabase(env), "d1-rest")`
(`gating.ts:90`), so `failOutbound` → `recordOutbound` **does** land a durable
`error_logs` row. But it is throttled to one row per (integration, kind) per minute
and its `place` is the REST endpoint, not the record — so it says "the D1 door
failed" and never "help-42's history has a hole". For `logAccountActivity` there is
no such fallback at all: it writes over the native `env.DB` binding, which has no
recorder layer, so an identity-log failure is a console line and nothing else.

So round 3's "the gap marker is still a console line" was too harsh for the team log
and exactly right for the identity log — and the round-5 repair built the correct
mechanism and did not connect it.

**The fix.** Two lines each in the four workers that already hold an ops handle:
`logActivity(cfg, db, actor, entry, dbRecorder(opsDatabase(env), "activity"))`.
The awkward part is real — `logActivity` is called from module libraries that take
a `D1Rest`, not an `Env` — so the honest shape is to build the recorder once in
`d1ConfigFrom` and hang it off the config the modules already carry, the same place
`recordFailure` already lives. **This is 5 of the 8 points criterion 7 can still
gain, and it is the binding constraint on the ceiling.**

### 2 · HIGH — the permission write has the before and after in scope and logs neither
`workers/tenancy/src/lib/roles.ts:290-361`

`setRolePermissions` builds `nowBy` (a `Map` of the role's current sheet, read from
`role_permissions`) and `effective(moduleKey)` (the resolved new rights per module).
It uses both — it walks them to refuse privilege amplification at `:327-341`, and
it writes them at `:343-354`. Then:

```ts
await logActivity(cfg, guard.databaseId, actor, {
  type: "Role permissions changed",
  verb: "edited",
  description: `${actor.name} updated permissions for the ${role.title} role`,
  relatedTable: "member_roles",
  relatedRowId: roleId,
})
```

No `changes`. So the one write in this application that decides **who can do what**
leaves a row saying that permissions were updated, and a reader six months later
cannot tell whether someone was granted `delete` on `team_members` or had `read` on
`learning` taken away. The information existed, in two local variables, on the line
above.

Two things make this worse than a plain omission:

- **`activity.ts:216-223` says `member_roles` carries a field diff.** It does — for
  `updateRole` (title and description). It does not for the permission matrix, which
  is the write anyone reads that sentence hoping to hear about. The documentation is
  true and misleading at once.
- **`set_member_role` has the same shape.** `members.ts:315-325` records "changed
  Jane's role to Viewer" and never which role she held before. Two of the three
  privilege-changing writes record only their destination.

**The fix** is about eight lines and uses the seam that already exists — build a
`FieldDiff[]` of `{ label: "learning.create", from: "no", to: "yes" }` for each
right that actually moved, pass it to `changedFields()`, and let the same expander
that renders a learning edit render this. Note it also fixes a second thing: the
door writes all seven module rows unconditionally, so re-granting an identical sheet
writes an identical activity row today. A diff-driven row would let it say nothing
when nothing moved, which is what R17 asks of every other transition.

### 3 · MEDIUM — the "exactly one INSERT INTO activity" check reads two files, not the codebase — and a document now promises otherwise
`workers/content/test/ticket-create-batch.test.ts:236-256` · `DATA-MODEL.md:310-312`
· `shared/workers/activity.ts:307` · `shared/workers/d1-rest.ts:301`

The claim is true at HEAD — I grepped `workers/ shared/ web/ db/ scripts/` and found
one production occurrence. The check that is supposed to keep it true asserts
(a) `help.ts` contains none and (b) `activity.ts` contains exactly one. Both files
are named as string literals. A second author arriving in `roles.ts`, `import.ts` or
a new module's library is invisible to it — which is precisely the drift the
`activityStatement` builder was extracted to prevent, and the reason the builder
exists at all.

**This got worse an hour after I measured it.** Commit `f30f954` added to
`DATA-MODEL.md`:

> There is therefore **exactly one `INSERT INTO activity` in the codebase**, and
> that is machine-checked (`workers/content/test/ticket-create-batch.test.ts`) —
> a second one appearing is a red build, not a review note.

A second one appearing in any third file is **not** a red build. The claim is now
stated in three places (`activity.ts:307`, `d1-rest.ts:301`, `DATA-MODEL.md`) and
checked in none of the scopes those sentences describe — which is the same shape as
the fault R25's "stated once" clause was written to end, and the same shape as the
`MCP.md` exclusion table that was false the day it shipped: **a claim and its
evidence with the same author, and no way for anyone to notice.** Raising this from
LOW-MEDIUM to MEDIUM for that reason: an unchecked invariant is a note; an unchecked
invariant that a document promises is checked is a trap.

**The fix:** count over `serverSources()` instead of two `readSource(...)` calls,
excluding the seam itself, and assert zero. Four lines, and it reads through
`stripComments` already.

### 4 · LOW — the "sign-ins" contradiction is now in its SECOND round unrepaired
`shared/workers/retention.ts:82` vs `shared/workers/activity.ts:89-95`

`activity.ts` says, correctly and with the scaling reason, that `account_activity`
does **not** hold sign-ins — a sign-in row per person per session would land in the
one shared core database that every tenant uses and that has no mover. Twenty lines
away, in a file that is also `shared/workers/` and is the file that decides how long
the table is kept:

```ts
table: "account_activity", days: KEEP_FOREVER,
why: "AUDIT, not exhaust — a person's own security history (sign-ins, email changes)."
```

Round 3 filed this with the exact replacement text. It did not land. An owner
choosing a retention window for "security history including sign-ins" would be
reasoning about a table that has never held one, and it cuts against R25's own
principle — the rule is stated once and pointed at from everywhere else.

**The fix:** one line. Cross-reference `story_checks_out_review`, which owns
doc-vs-doc contradictions.

### 5 · LOW — round 3's file-wide retention exemption is still file-wide
`web/test/rules/activity.test.ts:125`

`if (path.endsWith("/retention.ts")) continue` exempts a whole file from the
append-only scan. The intent is legitimate — the retention sweep genuinely deletes
ageing rows — but the exemption is by path, not by shape, so an
`UPDATE activity SET description = …` added anywhere in that file passes.

**The fix, unchanged from round 3:** scope the skip to the `sweep()` function body
via `declarationBody` (the helper is already imported in that same file for R17), or
allow only the sweep's own statement shape.

### 6 · LOW — nothing shows a person which door a change came through
`web/components/activity-changes.tsx:48-65`

`origin` and `verb` are written, validated, indexed, filterable and now carried on
the wire — and `activityFeedItems` maps a row to `{id, description, actor,
timestamp}`. "Did the assistant do this?" is answerable by a query and not by
looking. The row's own reason for existing (`activity.ts:135-140`) is *"the exact
question 'did the agent do this?' that an owner asks first"*.

**The fix:** a small muted label beside the timestamp for any origin that is not
`ui`. Three lines in the one seam that builds every record feed's rows.

### 7 · LOW — the server-side filters have no caller
`workers/tenancy/src/lib/activity-read.ts:110-163` · `web/lib/api.ts:409,418`

Detailed under criterion 9. The reader validates four filters against closed sets,
binds them, ANDs them onto the scope, carries them through the COUNT and has an
index for each. `web/lib/api.ts` builds the URL from `scope`, `id` and `cursor`. No
screen has a control; no tool exposes it. This is the same shape as the finding
this round repaired (`before_after` written and read by nothing), one layer up —
built and not connected.

**The fix** is a product decision, not a code one: either put a verb/date control on
the team Activity screen, or say in `SEARCH.md` that the filters are a documented
query for support use. Either closes it; leaving it is the worst of both.

### Standing Tier 3 (unchanged, repeated as the rubric requires)

- **Two log tables.** `activity` per team, `account_activity` global. Forced by the
  per-team-D1 model — a teamless person has no team database. Merging crosses the
  tenancy boundary; the rubric tells reviewers not to propose it. **3.6 points,
  permanently.**
- **The bulk row is one row, not N.** Settled in `ROUND5-RECONCILIATION.md` §3 and
  not re-opened. It costs criterion 5 one point and criterion 4 nothing.
- **Creation in the central log** — satisfied. Brimba is not the project this
  standing item was written for; creation lands in `activity` for records and in
  `account_activity` for people. Recorded so it is not re-asked.

---

## FIX IMPACT MAP

| Fix | Files | ADDS / REMOVES | Which other review it could damage |
|---|---|---|---|
| **F1** connect the gap recorder — build it once in `d1ConfigFrom` and hand it to `logActivity`; thread an explicit one into the six `logAccountActivity` sites | `shared/workers/gating.ts`, `shared/workers/activity.ts`, `workers/auth/src/lib/{users,profile,email-change}.ts`, `workers/mcp/src/index.ts` (~15 lines) | ADDS the un-throttled, record-naming gap row the seam was built for; REMOVES a week-long expiry on the only evidence a history has a hole | **`architecture_review`** — mildly negative: it couples the activity seam to the operations database, which it currently does not know exists. Hanging it off the D1 config (where `recordFailure` already lives) keeps that coupling in one file instead of four. **`lean_mean_review`** — an argument threaded through four workers is exactly what it penalises; the config route avoids that. **`spend_review` / `speed_review`** — one extra insert on the failure path only, ~0 rows/day healthy. **`error_log_review`** — positive |
| **F2** build the permission diff in `setRolePermissions` (and the from-role in `set_member_role`) | `workers/tenancy/src/lib/roles.ts`, `workers/tenancy/src/lib/members.ts` (~12 lines) | ADDS a `FieldDiff[]` per changed right; makes the row skippable when nothing moved | **`scaling_review`** — a permission row's `before_after` grows by ~150 bytes, and SCALING.md's own model already budgets that. **`security_sentry_review`** — read it once: the diff names module/right pairs, never a secret, and it rides the record scope which is already gated on `member_roles:read`. **`realtime_review`** — none. **`spend_review`** — negligible |
| **F3** count `INSERT INTO activity` across `serverSources()` | `workers/content/test/ticket-create-batch.test.ts` (~4 lines) | ADDS a check that can actually fail | **`lean_mean_review`** — four lines. **`speed_review`** — milliseconds. Nothing shipped changes |
| **F4** correct the `sign-ins` parenthetical | `shared/workers/retention.ts` (1 line) | REMOVES a false statement | none — helps `story_checks_out_review` |
| **F5** narrow the retention exemption from a path to a shape | `web/test/rules/activity.test.ts` (~6 lines) | ADDS a real bound to an exemption | **`lean_mean_review`** — six lines of test. Nothing else |
| **F6** show origin (and verb) on a record's feed rows | `web/components/activity-changes.tsx` (~3 lines) | ADDS a muted label for non-`ui` origins | **`first_run_review`** — watch the copy: "agent" and "mcp" are not glossary words a 45–55-year-old manager knows; use "the assistant" and "a connected tool" (glossary: Assistant). **`lean_mean_review`** — none; it is the ONE seam that builds every feed row. **`realtime_review`** — none |
| **F7** give the filters a caller — a verb/date control, or a documented query in SEARCH.md | `web/lib/api.ts` + one screen, **or** `SEARCH.md` | ADDS a control (or a doc) for machinery that already exists | **`round_trip_review` / `speed_review`** — positive: today a narrowed question means fetching pages and discarding them client-side. **`scaling_review`** — positive, same reason. **`security_sentry_review`** — none: the reader validates and binds every value and the scope gate is unchanged. **`dead_end_review`** — positive: it closes a built-and-unreachable capability |
| **F8** one clause covering `teams.db_status` in the not-logged list | `shared/workers/activity.ts` (1 line) | ADDS the reason the check cannot check (it matches on the table name, which `teams.shard_count` already supplies) | none |

---

## CEILING

**Unchanged at 95, and the binding constraint has moved again.**

The two caps are the same two:

**Criterion 1 is capped at 60** by a locked decision. Row 1 awards 40 for *one*
central table; Brimba has two, split by the per-team-D1 boundary. Cost:
40 × 9 ÷ 100 = **3.6 points, for ever. True maximum: 96.4.**

**Criterion 7 is capped near 85** by D1's REST door: the −15 for "the log write
sits outside the transaction that commits the data change" has no clean fix while
`d1Query` is one parameterised statement. `d1ExecScript` and `d1Batch` take
multi-statement scripts and D1's REST contract does not promise atomicity across
one — the ticket-create fold says so in its own comment rather than claiming
otherwise.

```
60×9 + 100×17 + 100×13 + 100×12 + 100×11 + 100×10 + 85×9 + 100×7 + 100×7 + 100×5
= 540 + 1700 + 1300 + 1200 + 1100 + 1000 + 765 + 700 + 700 + 500
= 9505  →  95.05  →  95
```

**Still exactly 95, still zero margin, and the gap is now 3.51 points** — the
smallest it has been. Where those 3.51 sit:

| criterion | short by | points | fix |
|---|---|---|---|
| 6 · recoverable | 18 | **1.80** | F2 — the permission diff |
| 7 · cannot silently fail | 8 | **0.72** | F1 — connect the recorder |
| 5 · who/what/where | 3 | 0.33 | F6 (origin shown) — 2 of the 3; the bulk row's missing id is the settled trade |
| 9 · answerable | 3 | 0.21 | F7 — give the filters a caller |
| 4 · lifecycle | 2 | 0.24 | log the acceptance against `invite_logs` as well as `team_members` |
| 8 · rewrites | 3 | 0.21 | F5 — narrow the exemption |

**F2 alone is more than half the remaining gap**, and it is twelve lines against
variables already in scope. Round 3 said criterion 7's console-only marker was "the
only thing between this review and its ceiling"; that is no longer true — F1 is now
worth 0.72 and F2 is worth 1.80. **Every one of the six is reachable, and 95
requires all six.**

**One thing still cannot be verified from this repository.** Whether team migration
0008 (the `verb` / `origin` / `before_after` columns) is applied in staging and
production is **unmeasured** — it needs live `wrangler d1 execute` access no
read-only campaign run has. Criteria 5, 6 and 9 all rest on columns whose existence
in the live databases nobody in this campaign has checked. Round 3 said this; it is
still true, and it is now load-bearing for three criteria instead of hypothetical
for three, because the reader that renders `before_after` will simply show nothing
on a database where the column was never added.

---

**The verdict, in one sentence:** every door into a record leaves the same
footprint, every deliberately-silent table is now named and machine-checked, and
the diff three modules had been writing for months is finally readable — but the
write that hands out power still records only that power was handed out, and the
gap marker built this round to prove the trail is whole has not been handed to a
single caller.
