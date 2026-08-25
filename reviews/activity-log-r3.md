# Activity log review — round 3 — Brimba · 2026-08-25
SCORE: 89/100   (round 1: 82 · round 2: 88 · 18 August: 94)

> When a record changes, does anything write it down — and does that stay true
> whichever door the change came through?

**The worst gap, in one sentence:** *a failed activity write still leaves only a
`console.error`* (`shared/workers/activity.ts:225-235` → `shared/workers/trace.ts:61-71`)
— the trail can develop a hole, and the only evidence of that hole expires in about
a week, in a base that now has a durable 90-day error table three imports away.

Round 2's worst gap — a person's account created with no row anywhere — is fixed
and verified. The gap marker is now the worst thing left, and it is **the binding
constraint on this review's ceiling**: see CEILING.

---

## DELTA

| # | Criterion | wt | R1 | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|---|
| 1 | One log, not many | 9 | 60 | 60 | **60** | unchanged — two tables split by database boundary, still a locked decision. A NEW contradiction about their contents is finding 2; I did not dock for it, and say why below |
| 2 | Every write path logs · **GATE** | 17 | 75 | 92 | **94** | account creation logs (`users.ts:74`), so identity goes 2/3 → 3/3; the `screens` write site left with its subsystem. Hand-count 44 of 44 |
| 3 | Every surface logs the same | 13 | 96 | 100 | **100** | unchanged — no surface moved |
| 4 | The whole lifecycle is covered | 12 | 83 | 93 | **96** | creation is now complete for people as well as records (27/30 → 30/30) |
| 5 | The row says who, what and where | 11 | 82 | 94 | **94** | unchanged — the bulk help-status row still carries no verb and no row id |
| 6 | The change itself is recoverable | 10 | 90 | 90 | **90** | unchanged — `before_after` is still written and read by nothing |
| 7 | The log cannot silently fail | 9 | 78 | 75 | **75** | unchanged in score, **worse in kind**: three other repairs added durable `error_logs` rows this round and the log's own gap marker was not one of them. Finding 1 |
| 8 | Nothing rewrites history | 7 | 93 | 93 | **97** | the append-only scan reads `serverSources()` and has the 4th pattern — sabotage-proven below. −3 remains: the fix turned a dead exemption into a live one |
| 9 | The history is answerable | 7 | 87 | 90 | **90** | unchanged — `activity-read.ts` untouched since round 2; still no server-side verb/origin/time filter |
| 10 | The table has a life plan | 5 | 83 | 83 | **83** | unchanged — the retention loop gained real insert-rate arithmetic for the OPS tables, but `activity` itself still has no rows-per-record-per-month figure |

### Did somebody else's repair break my criteria?

**No criterion went down.** Two other reviews' repairs helped mine, and one hurt
in a way that does not show up in a number:

| repair (whose) | effect here |
|---|---|
| screen-override subsystem REMOVED (dead_end) | **helped.** Its `screens` write was a logged site, so removing it shrinks my denominator from 45 to 44 without changing the numerator's quality. No log path was lost |
| retention loop + bounded sweep (scaling / error_log) | **neutral to helpful.** `TEAM_RETENTION`'s `activity` rule is still `KEEP_FOREVER`, so nothing prunes the trail; the new arithmetic is about `idempotency_keys`, `login_codes`, `error_logs` |
| 5xx `GuardError` recorded in four workers (error_log) | **neutral in score, sharpening in argument.** It proves a durable recording path is cheap and available. `logActivity`'s catch still does not use it — finding 1 |
| `serverSources()` on the R25 scan (this review, round 2's finding 8) | **helped, and half-created a new hole.** Widening the corpus made the `retention.ts` exemption REAL, where before it guarded a file the walk could never reach. Finding 3 |
| account-creation logging (this review, round 2's finding 2) | **helped, incompletely.** It corrected the false "sign-ins" claim in one file and left the identical claim in another. Finding 2 |

---

## Verification of the three claims in the brief

| claim | verdict | evidence |
|---|---|---|
| account creation is logged | **true** | `workers/auth/src/lib/users.ts:73-76` — awaited, `type: "account_created"`, on the ONLY path that inserts a user (`grep "INSERT INTO users"` across `workers/`, `shared/`, `db/` returns this one production site plus one test fixture) |
| the false `account_activity` comment is corrected, with the scaling reason | **true in `activity.ts`, FALSE one file over** | `shared/workers/activity.ts:47-54` now says it does not hold sign-ins and why. `shared/workers/retention.ts:73` still calls the same table "a person's own security history (**sign-ins**, email changes)". Finding 2 |
| R25's scan sees `shared/workers/activity.ts`, plus the `DELETE FROM account_activity` pattern | **true, and sabotage-proven** | `web/test/rules.test.ts:1073` walks `serverSources()`; `:1082` carries the fourth pattern; `:1088` asserts the seam is inside the corpus so the blindness cannot silently return |

**The sabotage proof, run out of tree** (`/private/tmp/.../c3-r25-sabotage.mjs`;
nothing in the repo touched). I re-implemented the check's corpus, `stripComments`
and its four patterns, then injected violations in memory:

```
AS-IS                                                          offenders: []   seesSeam: true
+ DELETE FROM account_activity in shared/workers/account-activity.ts  → CAUGHT
+ UPDATE activity        in shared/workers/activity.ts                → CAUGHT
+ DELETE FROM activity   in workers/tenancy/src/routes/team.ts        → CAUGHT
+ UPDATE activity        in shared/workers/retention.ts               → NOT CAUGHT (the exemption)
```

Three of four. The fourth is finding 3 and is the reason criterion 8 is 97 and
not 100.

---

## Arithmetic

```
 #  criterion                          method     score  weight  product
 1  One log, not many                  coverage      60      9      540
 2  Every write path logs        GATE  coverage      94     17     1598
 3  Every surface logs the same        coverage     100     13     1300
 4  The whole lifecycle is covered     coverage      96     12     1152
 5  The row says who, what and where   coverage      94     11     1034
 6  The change itself is recoverable   defect        90     10      900
 7  The log cannot silently fail       defect        75      9      675
 8  Nothing rewrites history           defect        97      7      679
 9  The history is answerable          coverage      90      7      630
10  The table has a life plan          coverage      83      5      415
                                                          ----     ----
                                                           100     8923

                                    total = 8923 / 100 = 89.23  →  89
```

**The gate.** Criterion 2 must clear 40 or the total caps at 35. It scores **94**.
No cap applied.

### The probe, corrected by hand — third round, same shape

| denominator | sites | logged | coverage |
|---|---|---|---|
| probe as printed (R3) | 127 | 50 | **39%** |
| probe as printed (R2) | 127 | 50 | 39% |
| minus **22** phantom sites parsed from English prose | 105 | 50 | 48% |
| minus 8 sites logged one caller up (probe false negatives) | 105 | 58 | 55% |
| **business-record sites only** (hand-classified, every one opened) | **44** | **44** | **100%** |
| the same basis, scored on round 2's code | 45 | 44 | 97.8% |

**The 22 phantoms**, each confirmed by opening the line: `the` (4), `what` (3),
`only` (2), `paths` (2), `that` (2), and `accepts`, `carries`, `change`, `for`,
`guard`, `here`, `instantly`, `refuse`, `your` (1 each). Every one is a regex
reading `update <word>` out of a comment — e.g. `workers/content/src/lib/learning.ts:233`
is the sentence "Fields a create / update accepts". Round 2 counted 21; the extra
one is `accepts`, which round 2 listed among the phantoms but appears not to have
carried into its subtraction. **A one-site bookkeeping difference, not a change in
the code.**

**The 8 probe false negatives, all re-opened this round and all still logged one
caller up:** `teams.ts:213,216` (`updateTeamDetails` → logged at
`routes/team.ts:121`), `teams.ts:247,254,369,358` (both invite-accept paths →
logged inside `recordInviteAccepted`, `teams.ts:82`), `workers/mcp/src/lib/tokens.ts:45,77`
(→ `mcp_token_created` / `mcp_token_revoked` at `workers/mcp/src/index.ts:137,156`).

**The 44, by table** (logged / total; pointer and seed writes excluded as documented):
`learning` 4/4 · `selectable_data` 5/5 · `help` 5/5 · `help_threads` 1/1 ·
`help_stakeholders` 1/1 · `member_roles` 4/4 · `role_permissions` 2/2 ·
`team_members` 5/5 · `teams` 6/6 · `invite_index` 4/4 · `invite_logs` 2/2 ·
`team_module_databases` 1/1 · `users` (identity) **3/3** · `email_change_logs` 1/1.
`screens` 1/1 is gone with its subsystem.

### Criterion arithmetic, row by row

**1 · One log, not many — 60/100 · weight 9** *(unchanged)*
```
 0/40  TWO log tables: `activity` (per team) + `account_activity` (global)
25/25  each has a documented, non-overlapping reason — split by DATABASE boundary
       (shared/workers/account-activity.ts:1-24, DATA-MODEL.md:242)
20/20  one documented way to read a person's whole history across both
       (DATA-MODEL.md § "Reading one person's whole history")
15/15  no per-feature log table duplicating the central one
```
I considered docking row 2 for finding 2 and did not: the *reason* for the split
is stated correctly in both files, and what disagrees is a parenthetical list of
contents. The rubric's own instruction for two sources that disagree is to report
the contradiction and cross-reference `story_checks_out_review` rather than pick a
winner. It is reported, loudly, as finding 2.

**2 · Every write path logs — 94/100 · weight 17 · THE GATE** *(was 92)*
```
70/70  70 × 1.00 — 44 of 44 business-record write sites log. Round 2, its own
       basis: 70 × 44/45 = 68
 9/15  31 of the 47 genuinely-unlogged sites are a WRITTEN exclusion
       (shared/workers/activity.ts:28-39, byte-identical to rounds 1 and 2).
       15 × 31/47 = 9.9. Recomputing round 2's on my basis gives 15 × 31/48 = 9.7:
       both round to 10, round 2 printed 9, and I hold the row at 9 rather than
       book a point that is hand-classification noise rather than a code change
15/15  NO user-editable business table has zero logged writes
```
The 16 unlogged-and-unexcluded sites, clustered: `data_import_sessions` (3) +
`data_import_batches` (4) — import machinery, whose *rows* log individually;
`agent_threads` (2) + `agent_messages` (2) — the chat transcript, which is its own
record of itself; `importable_databases` (2) — catalogue self-heal; `db_alerts`
(1); `teams.shard_count` (1, `sharding.ts:135`); `teams` admin door (1,
`routes/admin.ts:41`). None is a business record a person edits. **All 16 are
defensible; none of the 16 is written down.** That is the whole of the 6-point
shortfall on this criterion — six comment bullets, not code.

**3 · Every surface logs the same — 100/100 · weight 13** *(unchanged)*
```
40/40  no surface sits more than 15 points below the best
25/25  MCP and agent log at the same rate as the API by construction — both go
       through forwardToDoor to the same gated door the browser posts to
20/20  background work has a system actor and its rows are stamped `job`
15/15  bulk and import paths log; each imported ROW carries origin `import`
```

**The surface parity board**

| surface | how a record change reaches the log | R2 | R3 |
|---|---|---|---|
| web / api | the gated doors | 98% | **100%** (44/44) |
| mcp | the same doors via `forwardToDoor`, stamped `mcp`; tokens → `account_activity` | yes | yes |
| agent | the same doors again, acting as the user, stamped `agent` | yes | yes |
| import | each row through the create door stamped `import`, plus a summary row | yes | yes |
| job (cron) | `SYSTEM_ACTOR`, stamped `job` | yes | yes |
| **identity (auth)** | `account_activity`: created, email, name/photo, tokens | **creation missing** | **complete** |

**4 · The whole lifecycle is covered — 96/100 · weight 12** *(was 93)*
```
30/30  creation is in the central log for every team record AND, now, for the
       PERSON (users.ts:73). Round 2 was 27/30 for exactly this gap
30/30  edits are recorded, including the ticket reply
16/20  archive/deactivate carries its own verb, but two gaps stand from round 2:
       the BULK help-status row (help.ts:427-432) carries no `verb` and no
       `relatedRowId`, so it lands on no individual ticket's feed; an invite's
       ACCEPTANCE is logged as "Member joined" against team_members, never on the
       invite's own feed (teams.ts:82-89). Both re-read this round, both unchanged
20/20  hard deletes provably do not happen to any master record — every
       `DELETE FROM` in server source is sessions, idempotency_keys or the
       documented retention sweep. Deactivate-not-delete is locked (ARCHITECTURE §4)
```

**5 · The row says who, what and where — 94/100 · weight 11** *(unchanged)*
```
25/25  frozen actor snapshot — creator_id + creator_email + creator_name
24/25  target by table AND row id, except the bulk help-status row. −1
18/20  all six verbs written; 1 of 28 sites still verbless (help.ts:427)
12/15  origin recorded; five of six values reachable; `api` unreachable by design;
       no screen shows origin or verb to a person
15/15  timestamp present; tenant implicit in the per-team database
```

**6 · The change itself is recoverable — 90/100 · defect · weight 10** *(unchanged)*
```
100  base
 −3  minor: 3 of ~13 modules build a field diff, and which three is written down
 −7  medium: `before_after` is written and has NO reader — not an endpoint, not a
     screen, not a test, not the documented query. `activity-read.ts` was not
     touched this round; I diffed it (`git diff bf5d07c..HEAD`) to be sure
```

**7 · The log cannot silently fail — 75/100 · defect · weight 9** *(unchanged)*
```
100  base
−15  high: the data write and the log write are two statements with no
     transaction spanning them (D1 over the REST door)
 −7  medium: a failed activity write records ONLY a console line. Finding 1
 −3  minor: workers/tenancy/src/lib/teams.ts:97 is still a bare
     `console.error("invite accept record failed (audit only):", e)` with no
     event name, so it is not filterable even as a console line
```
Still true: all 28 `logActivity` call sites await, and
`workers/content/test/idempotent-transitions.test.ts` proves a real transition
writes exactly one row and a repeat writes none.

**8 · Nothing rewrites history — 97/100 · defect · weight 7** *(was 93)*
```
100  base
 −3  minor: the append-only exemption is now FILE-WIDE and LIVE. Sabotage D above
     puts `UPDATE activity SET description = 1` into shared/workers/retention.ts
     and the check stays green. In round 2 that exemption guarded a path the walk
     could not reach, so it was inert; the corpus fix made it real
```
Zero UPDATE or DELETE against either log table in any request path — the probe's
`historyRewrites` is empty and I confirmed it by reading. A clean result and a
real one, now guarded by a check that can actually fail.

**9 · The history is answerable — 90/100 · weight 7** *(unchanged)*
```
35/35  "this record's history" — idx_activity_record_recent
30/30  "this actor's actions" — idx_activity_actor
20/20  a real read path: the generic (table,id) route, the team feed, an Activity
       tab on every record detail (Law R2). `account_activity` has its own
       (user_id, created_at) index and its own read path (listAccountActivity)
 5/15  still not filterable by verb, origin or time range server-side
```

**10 · The table has a life plan — 83/100 · weight 5** *(unchanged)*
```
35/35  a stated retention window — TEAM_RETENTION `activity` = KEEP_FOREVER,
       overridable by RETAIN_TEAM_ACTIVITY_DAYS (retention.ts:99-110)
18/30  the retention loop now carries real insert-rate arithmetic — but for
       idempotency_keys, login_codes and error_logs (sharding.ts:329-355). The
       `activity` table itself still has no rows-per-active-record-per-month
       figure anywhere. Re-grepped SCALING.md: unchanged
20/20  destruction is a deliberate documented choice, and OFF by default
10/15  what is deliberately NOT logged is written down — the list covers 31 of
       the 47 genuinely-unlogged sites; the 16 named under criterion 2 are not in it
```

---

## Findings

### 1 · MEDIUM — the gap marker is still a console line, and this round the base grew a durable alternative in three other places
`shared/workers/activity.ts:225-235` · `shared/workers/account-activity.ts:64-69`
· `shared/workers/trace.ts:61-71` · `shared/workers/error-log.ts:36-80` · `ERROR-HANDLING.md:41`

Both loggers catch their own failure and call `traceError`, which is
`console.error(JSON.stringify(...))` and nothing else. Cloudflare keeps that about
a week (this repo's own `ERROR-HANDLING.md:41`). So the question "is this record's
history complete?" is answerable for seven days and unanswerable after that —
while `logActivity`'s comment calls it "a DURABLE, filterable gap marker".

**What changed this round is the argument, not the code.** Three separate repairs
landed a durable `error_logs` row where there had been a console line: a 5xx
`GuardError` in four workers, a retention bound that is HIT, and the worker
central catches. The seam is `recordWorkerError(db, source, place, e, request)` and
it already refuses to throw. The audit trail's own hole marker is now the most
prominent thing in the base still recorded only to console.

**The fix:** in `logActivity`'s and `logAccountActivity`'s catch, call `logError`
against the ops DB alongside `traceError`. `logActivity` has no DB binding in scope
— it takes a `D1Rest` config for a *team* database — so the honest shape is an
optional ops-DB argument threaded from the callers that have one, or an
`onGap` callback the workers wire once. **This is the binding constraint on the
ceiling: 7 of the 9 points criterion 7 can still gain.**

### 2 · MEDIUM — the "sign-ins" claim was corrected in one file and left standing in another
`shared/workers/retention.ts:73` vs `shared/workers/activity.ts:47-54`

The repair I asked for landed. It says, correctly and with the scaling reason:
`account_activity` "does NOT hold sign-ins". Sixty lines away, in a file that is
also `shared/workers/` and also read by anyone reasoning about this table:

```ts
table: "account_activity", days: KEEP_FOREVER,
why: "AUDIT, not exhaust — a person's own security history (sign-ins, email changes)."
```

Same false claim, still there, in the file that decides how long the table is kept.
A reader deciding a retention window for "security history including sign-ins"
would be reasoning about a table that has never held one. It also cuts against
R25's own principle — the rule is stated once and pointed at from everywhere else —
which is exactly the drift that produced round 1's three-way contradiction.

**The fix:** one line — `"AUDIT, not exhaust — a person's own identity history
(account created, email changed, tokens). NOT sign-ins: see shared/workers/activity.ts."`
Cross-reference `story_checks_out_review`, which owns doc-vs-doc contradictions.

### 3 · LOW — widening R25's corpus turned a dead exemption into a live one
`web/test/rules.test.ts:1074` — `if (path.endsWith("/retention.ts")) continue`

Round 2's finding was that the scan walked `workers/*/src` only, so
`shared/workers/` — where both loggers live — was invisible. Fixed, and proven
above. But the exemption line was written when `retention.ts` was unreachable, so
it was inert; now that the corpus includes `shared/workers/`, it is a **blanket
pass for the whole file**. Sabotage D: an `UPDATE activity SET description = 1`
added anywhere in `retention.ts` keeps the check green.

The exemption is legitimate in intent — the retention sweep genuinely deletes
ageing rows — but it exempts a file rather than a shape.

**The fix:** narrow it to the sweep's own shape rather than the path, e.g. allow
`DELETE FROM <log> WHERE rowid IN (SELECT rowid … WHERE <column> < ?)` and nothing
else, or scope the skip to the `sweep()` function body via `namedBody` (the helper
already exists in `shared/test/source.ts` and is used elsewhere for exactly this).

### 4 · LOW — nothing proves account creation stays logged
`workers/auth/src/lib/users.ts:73` · no test references `account_created`

The string `account_created` appears in exactly one place in the repository. The
round-2 lesson recorded in this campaign's own `LESSONS.md` is that a green check
is not a working law; here there is no check at all. Deleting those four lines
would take the base straight back to round 2's worst gap with `npm run check`
green.

**The fix:** one assertion in the auth worker's test suite — that
`findOrCreateUserByEmail`'s body calls `logAccountActivity` — in the style of the
existing `activity-seam.test.ts` scans.

### 5 · LOW — a stale doc comment now sits above the wrong function
`workers/auth/src/lib/account-activity.ts:15-18`

When the writer moved to `shared/`, its doc comment stayed behind and now sits
directly above `listAccountActivity`, describing a write path that function does
not have ("Append one activity row… publishing the live event here"). Harmless at
runtime, actively misleading to the next reader of the identity log. Cross-ref
`lean_mean_review`.

### Standing Tier 3 (unchanged, repeated as the rubric requires)

- **Two log tables.** `activity` per team, `account_activity` global. Forced by
  the per-team-D1 model — a teamless person has no team database. Merging crosses
  the tenancy boundary; the rubric tells reviewers not to propose it. It costs
  3.6 points of the total, permanently.
- **`before_after` has no reader.** Written by three modules, read by nothing.
  Either give it a reader (a "what changed" expander on the Activity tab) or stop
  writing it. Owner's call; the current state is the worst of both.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** durable gap marker: `logActivity`/`logAccountActivity` catch also writes `error_logs` | `shared/workers/activity.ts`, `shared/workers/account-activity.ts`, + the workers that must thread an ops-DB handle (tenancy, content, data-ops, mcp) | ADDS ~15 lines and one optional parameter; REMOVES the week-long expiry on evidence of a hole | **`lean_mean_review`** — a new optional argument threaded through four workers is exactly the kind of seam widening it penalises. **`spend_review`** — one extra D1 insert, but ONLY on the failure path, which is ~0 rows/day in a healthy system. **`speed_review`** — none, same reason. **`architecture_review`** — mildly negative: it couples the activity seam to the ops database, which it currently does not know exists |
| **F2** correct the `sign-ins` parenthetical in `retention.ts:73` | `shared/workers/retention.ts` (1 line) | REMOVES a false statement | none — a comment edit with no behaviour. Helps `story_checks_out_review` |
| **F3** narrow R25's retention exemption from a path to a shape | `web/test/rules.test.ts` (~6 lines) | ADDS a real bound to an exemption | **`lean_mean_review`** — six more lines of test. Nothing else: it changes no shipped code |
| **F4** a test that account creation logs | `workers/auth/test/*` (~8 lines) | ADDS a check that can fail | **`lean_mean_review`** — more test code. **`speed_review`** — a few ms on `npm run check` |
| **F5** delete the orphaned doc comment | `workers/auth/src/lib/account-activity.ts` (−4 lines) | REMOVES misleading prose | none — helps `lean_mean_review` |
| **F6** write down the 16 defensible-but-undocumented exclusions | `shared/workers/activity.ts` (comment, ~6 lines) | ADDS 6 comment lines; earns criterion 2 and criterion 10 points | **`lean_mean_review`** — six comment lines in a file already carrying a long preamble. Genuinely the cheapest points in this report |
| **F7** give the bulk help-status row a `verb` and drop the per-set row in favour of per-row rows | `workers/content/src/lib/help.ts` | ADDS one field; the per-row variant would ADD N activity writes per bulk action | **`spend_review` and `scaling_review` both, materially** — a 500-ticket bulk resolve becomes 500 log rows in the fastest-growing table in a team database. **Recommend the `verb` only, not the per-row split.** The verb alone is free |

---

## CEILING

**Round 2 said 95.05 with zero margin. It is now 95.05 with zero margin AND a
different binding constraint — and I can say for the first time which single fix
the whole margin depends on.**

The two caps are unchanged:

**Criterion 1 is capped at 60** by a locked decision. Row 1 awards 40 for *one*
central table; Brimba has two, split by the per-team-D1 boundary. Cost:
40 × 9 ÷ 100 = **3.6 points, for ever. True maximum: 96.4.**

**Criterion 7 is capped near 85** by D1's REST door: the −15 for "the log write
sits outside the transaction that commits the data change" has no clean fix while
`d1Query` is one parameterised statement. `d1ExecScript` takes a multi-statement
script, but D1's REST contract does not promise atomicity across it, and core-DB
writes use the native binding regardless.

```
60×9 + 100×17 + 100×13 + 100×12 + 100×11 + 100×10 + 85×9 + 100×7 + 100×7 + 100×5
= 540 + 1700 + 1300 + 1200 + 1100 + 1000 + 765 + 700 + 700 + 500
= 9505  →  95.05  →  95
```

**Still exactly 95, still zero margin. What changed is which fix is load-bearing.**
In round 2 the ceiling was theoretical: criterion 2 was 8 points short and
criterion 4 was 7, and both needed real work. Both are now nearly spent —
criterion 2 is 6 comment bullets from 100 and criterion 4 is one `verb:` field
plus one relatedRowId from 100.

That leaves **criterion 7 as the binding constraint**, and the brief's question
answers itself: yes. To reach 95, criterion 7 must reach its own maximum of 85,
which means the −7 medium — **the console-only gap marker, finding 1** — must go.
There is no other route: every other criterion at its own maximum still leaves the
total at 95.05 only if criterion 7 is 85. If finding 1 is left alone, the ceiling
is `9505 − 7×9 = 9442 → 94.42 → 94`, and 95 becomes unreachable by any combination
of the other nine.

**So: finding 1 is not merely the worst gap. It is the only thing between this
review and its ceiling.**

**One thing still cannot be verified from this repository.** Whether team
migration 0008 (the `verb` / `origin` / `before_after` columns) is applied in
staging and production is **unmeasured** — it needs live `wrangler d1 execute`
access no read-only campaign run has. Criteria 5, 6 and 9 all rest on columns
whose existence in the live databases nobody in this campaign has checked.

---

**The verdict, in one sentence:** every door into a record now leaves the same
footprint and a person's story finally starts at the beginning — what remains is
that the log's own failures are written in disappearing ink, in a base that
learned how to write durably three times over this round and did not spend the
lesson here.
