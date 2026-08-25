# Activity log review — Brimba · 2026-08-25
SCORE: 82/100   (previous: 94/100, 18 August)

> When a record changes, does anything write it down — and does that stay true
> whichever door the change came through?

**The worst gap, in one sentence:** *adding a reply to a support ticket — including
a reply written by the AI assistant through the `help_reply` tool — writes to
`help_threads`, bumps the ticket's `updated_at`, and leaves **no row in the activity
log at all**, so the ticket visibly changes and its own Activity tab says nothing
happened.*

**Why the score fell 12 points without the code getting worse.** Nothing regressed.
The 18 August run scored the *intent* of fixes it had just written and never traced
their effect: `origin` was scored 100 without checking that three of its six values
are unreachable and one is falsified; `verb` was scored as a stable enum without
checking that half its values are never written; `before_after` was scored 100
without checking that nothing anywhere reads it. Nine of the ten criteria move down
on evidence opened this run, each with a file and a line. The honest number is 82.

---

## Arithmetic

```
 #  criterion                          method     score  weight  product
 1  One log, not many                  coverage      60      9      540
 2  Every write path logs        GATE  coverage      75     17     1275
 3  Every surface logs the same        coverage      96     13     1248
 4  The whole lifecycle is covered     coverage      83     12      996
 5  The row says who, what and where   coverage      82     11      902
 6  The change itself is recoverable   defect        90     10      900
 7  The log cannot silently fail       defect        78      9      702
 8  Nothing rewrites history           defect        93      7      651
 9  The history is answerable          coverage      87      7      609
10  The table has a life plan          coverage      83      5      415
                                                          ----     ----
                                                           100     8238

                                    total = 8238 / 100 = 82.4  →  82
```

**The gate.** Criterion 2 must clear 40 or the total caps at 35. It scores **75**.
No cap applied.

### The probe lied again, in both directions — corrected by hand

| denominator | sites | logged | coverage |
|---|---|---|---|
| probe, as printed | 127 | 49 | **39%** |
| minus 14 phantom tables parsed from English prose | 100 | 44 | **44%** |
| **business-record sites only** (hand-classified, every one opened) | **47** | **44** | **94%** |

**Phantom tables, again.** The probe's `WRITE` regex reads `update <word>` out of
prose, so comments produced tables called `the` (7 sites), `what` (3), `paths`,
`that`, `only`, `accepts` (2 each), and `carries`, `refuse`, `here`, `your`, `for`,
`re`, `instantly`, `change` (1 each) — **27 phantom write sites, 5 of them scored as
logged**. Same 14 names as the 18 August run. Verified by cross-checking every table
name against the 36 names that actually appear in a `CREATE TABLE`.

**My own 40-line window lied too, and I caught it by opening the files.** Rebuilding
the scan with a same-function check found two sites it had wrongly marked logged:
`workers/content/src/lib/help.ts:458` and `:460`, both inside `addReply`, "logged"
only because an unrelated `logActivity` sits 31 lines earlier in a different
function. That correction is the single biggest finding in this report.

### Criterion arithmetic, row by row

**1 · One log, not many — 60/100 · weight 9**
```
 0/40  TWO log tables, not one: `activity` (per team) + `account_activity` (global)
25/25  each has a documented, non-overlapping reason — split by DATABASE boundary,
       not by feature. Identity events happen before a person belongs to any team,
       so they cannot live in a team database. Stated in shared/workers/
       account-activity.ts:1-24 and DATA-MODEL.md:233
20/20  a single documented way to read a record's full history across them —
       DATA-MODEL.md § "Reading one person's whole history", with both SQL queries
15/15  no per-feature log table duplicating the central one
```

**2 · Every write path logs — 75/100 · weight 17 · THE GATE**
```
66/70  70 × 0.936 — 44 of 47 business-record write sites log (hand-counted)
 9/15  33 of 53 non-logging sites are a WRITTEN exclusion (shared/workers/
       activity.ts:29-42). 20 are reasoned but undocumented: import sessions +
       batches (10), agent threads + messages (4), the import catalog (2),
       db_alerts (2), operator writes on `teams` (2). 15 × 33/53 = 9.3
 0/15  `help_threads` is user-editable and has ZERO logged writes. Same absolute
       condition the 18 Aug run applied to `mcp_tokens`, applied consistently.
```
The three unlogged business sites: `workers/content/src/lib/help.ts:458` (reply
insert), `:460` (the ticket's `updated_at` bump), `workers/auth/src/lib/users.ts:62`
(a person's account is created with no row in either log).

**3 · Every surface logs the same — 96/100 · weight 13**
```
40/40  no surface sits more than 15 points below the best
25/25  MCP and agent log at the SAME rate as the API — by construction, not by
       duplication: both go through forwardToDoor to the same gated door the
       browser posts to (workers/mcp/src/lib/tools.ts:185, workers/data-ops/src/
       lib/tools.ts:294), and both stamp the origin header on the way
16/20  background work HAS a system actor (SYSTEM_ACTOR, used by the module mover
       at workers/tenancy/src/lib/sharding.ts:302) — but its rows are stamped
       origin='ui', see finding 3. −4
15/15  bulk and import paths log: learning + dropdown bulk log per row via the
       single-row function; bulk help status logs one row naming the batch and its
       size; import logs "Data imported" with a count
```

| surface | how a record change reaches the log | verdict |
|---|---|---|
| web / api | the gated doors, 44/47 sites | **yes — 94%** |
| mcp | the same doors, via `forwardToDoor` | **yes, by construction** |
| agent | the same doors again, acting as the user | **yes — except `help_reply`, which is unlogged at the door itself** |
| import | one batch row naming the count | yes |
| job (cron) | module mover only, with a system actor | yes, but stamped as if a person did it in a browser |

**4 · The whole lifecycle is covered — 83/100 · weight 12**
```
27/30  creation is in the CENTRAL log for every team record (Learning created,
       Role created, Team created, Member joined, Invite sent, Help ticket raised,
       Dropdown value created, Stakeholder added). Not for a person's account:
       workers/auth/src/lib/users.ts:62 has no row anywhere. −3
26/30  edits are recorded — except a reply, which changes the ticket and logs
       nothing (help.ts:439-464). −4
10/20  archive / deactivate is its own READABLE type ("Learning deactivated") but
       the `verb` column — the stable half R25 promises — is NULL on 100% of
       deactivations, activations and status moves (finding 1). An invite's
       ACCEPTANCE never appears on the invite's own feed (finding 5). A bulk help
       status change never appears on any individual ticket's feed.
20/20  hard deletes provably do not happen to any master record. Every `DELETE
       FROM` in worker source is sessions, idempotency_keys, or the documented
       retention sweep. Deactivate-not-delete is locked (ARCHITECTURE §4), so
       deactivation IS death and this row is satisfied by design.
```

**5 · The row says who, what and where — 82/100 · weight 11**
```
25/25  the actor is a frozen snapshot — creator_id + creator_email + creator_name,
       so a later rename or deletion cannot rewrite old history
24/25  target identified by BOTH table and row id — except the bulk help status
       row, which carries relatedTable with no relatedRowId (deliberate). −1
12/20  the verb is a real closed TypeScript union, but 3 of its 6 values
       (`deactivated`, `activated`, `status`) are written by NO code path, and 5 of
       26 log sites send no verb at all (finding 1)
 6/15  the origin column exists, is validated against the known set, and is
       stripped at the public gateway so it cannot be forged — but only 3 of its 6
       values are reachable, one of those 3 is FALSE, and nothing reads the column
       (findings 2, 3, 4)
15/15  timestamp present; tenant implicit — the row lives in that team's own
       database, which is a stronger guarantee than a column
```

**6 · The change itself is recoverable — 90/100 · defect · weight 10**
```
100  base
 −3  minor: 3 of ~13 modules build a field diff (learning, help, member_roles).
     Which three IS written down (shared/workers/activity.ts:146-153), so this is
     documented partial cover rather than an oversight.
 −7  medium: the diff is written and has NO READER — not an endpoint, not a screen,
     not a test, not even the documented query in DATA-MODEL.md:253. Recovery
     requires direct `wrangler d1 execute` access (finding 4).
```

**7 · The log cannot silently fail — 78/100 · defect · weight 9**
```
100  base
−15  high: the data write and the log write are two separate statements with no
     transaction spanning them. Partly a platform reality (D1 over the REST door),
     but NOT absolute — `d1ExecScript` accepts a multi-statement script, so a
     team-DB write and its activity INSERT could travel together. See Tier 3.
 −7  medium: workers/tenancy/src/lib/teams.ts:96 catches a failed "Member joined"
     into `console.error("invite accept record failed (audit only):", e)` — console
     only, no durable gap marker, directly contradicting the seam's own contract
     that a hole in the trail must be loud (finding 6).
```
Good, and worth saying: **every one of the 26 `logActivity` call sites awaits**, and
`logActivity`'s own catch writes a durable, filterable `activity_log_gap` through
`traceError` carrying the request id. `workers/content/test/idempotent-transitions.
test.ts` runs a real transition twice and proves the data write and its log row land
together, and that a repeat writes neither — a behavioural test, not a scan.

**8 · Nothing rewrites history — 93/100 · defect · weight 7**
```
100  base
 −7  medium: the check that enforces append-only cannot see the file most likely to
     break it. `workerSources()` (web/test/rules.test.ts:32-44) walks only
     `workers/*/src`, so `shared/workers/` — where `logActivity` itself lives — is
     outside the scan. Its `if (path.endsWith("/retention.ts")) continue` exemption
     guards a file the scan never reaches, and `DELETE FROM account_activity` is
     absent from the pattern list (finding 7).
```
**Zero UPDATE or DELETE against either log table in any request path.** A clean
result and a real one. The retention sweep is a documented policy, defaults to
`KEEP_FOREVER` for both audit tables, and is stated in RULES.md R25, SCALING.md §4
and `shared/workers/retention.ts` — no penalty.

**9 · The history is answerable — 87/100 · weight 7**
```
35/35  "this record's history" — idx_activity_record_recent
       (related_table, related_row_id, created_at DESC, id DESC)
30/30  "this actor's actions" — idx_activity_actor
       (creator_id, created_at DESC, id DESC), team migration 0008
20/20  a real read path: the generic (table, id) route, the team feed, and an
       Activity tab on every record detail (Law R2)
 2/15  NOT filterable by verb, by origin, or by time range. `getActivity`
       (workers/tenancy/src/lib/activity-read.ts:47-115) accepts scope + id + table
       + cursor and nothing else. Migration 0008 created idx_activity_verb and
       idx_activity_origin for queries that no code in this repo issues — and
       idx_activity_verb's own stated example, "every deactivation this month",
       returns ZERO rows because verb is NULL on every deactivation.
```

**10 · The table has a life plan — 83/100 · weight 5**
```
35/35  a stated retention window: TEAM_RETENTION for `activity` is KEEP_FOREVER,
       overridable per environment via RETAIN_TEAM_ACTIVITY_DAYS, reasoning beside
       it (shared/workers/retention.ts:99-110)
18/30  growth is described qualitatively — "the biggest table in any team DB", a
       65%/80% size alarm with a `db_alerts` row, 5,000-row drain batches — but
       there is NO rows-per-active-record-per-month rate anywhere in SCALING.md.
       The 65% threshold's own justification ("2 GB of headroom is days at a large
       tenant's growth rate") implies a rate that is never written down. 30 × 0.6
20/20  destruction is a deliberate, documented choice, and it is OFF by default
10/15  what is deliberately NOT logged is written down — but the list covers 33 of
       the 53 non-logging sites; 20 are reasoned in code and named nowhere. 15×0.66
```

---

## The assignment: does `before_after` fill on a live EDIT?

**In code: yes, for three modules, and I traced it end to end.**

`updateLearning` (`workers/content/src/lib/learning.ts:340-357`), `updateHelp`
(`workers/content/src/lib/help.ts:280-296`) and `updateRole`
(`workers/tenancy/src/lib/roles.ts:258-273`) each build a `FieldDiff[]`, pass it to
`changedFields()` (which drops unchanged fields), and hand the result to
`logActivity` as `entry.changes`. `logActivity`
(`shared/workers/activity.ts:191-232`) JSON-stringifies it into the `before_after`
column. I counted the statement by hand: **12 column names, 12 values, correctly
aligned**, with `origin` / `before_after` / `verb` in positions 10 / 11 / 12.
Escaping is sound — `sqlString` doubles single quotes, JSON's double quotes are
inert inside a SQLite single-quoted literal, and `d1ExecScript` posts the whole
script to D1's `/query` without client-side semicolon splitting, so a semicolon
inside a diff value cannot break the statement.

**At runtime: still unproven, and here is exactly why I cannot close it.**

1. **Nothing reads it back — anywhere.** `before_after` appears in four places in
   the entire repository: the migration, two comments, and the INSERT. The app's
   only read path (`activity-read.ts:97`) selects `id, type, description,
   created_at, creator_name`. The documented recovery query in DATA-MODEL.md:253
   selects `origin` but not `before_after`. No test executes the statement — the
   seam test asserts the substrings "Title", "Old", "New" appear somewhere in the
   generated SQL string. **The round trip has never been exercised by anything.**
2. **The column only exists after an owner action that does not self-heal.** Team
   migrations live in `TEAM_MIGRATIONS` (`workers/tenancy/src/team-schema.ts`) and
   reach existing teams only when the owner runs `POST
   /api/tenancy/admin/migrate-teams`. New teams get 0008 at creation; older teams
   do not, until someone runs the robot. **If 0008 has not been applied to a team's
   database, the INSERT names three columns that do not exist, the whole statement
   fails, and `logActivity` swallows it — so that team's activity log stops
   completely, not just its diffs.** The failure surfaces only as an
   `activity_log_gap` trace row.

Whether 0008 is applied on staging and production is **unmeasured** — it needs live
`wrangler d1 execute` access I do not have in a read-only campaign run. The
one-command check is in FIX IMPACT below.

---

## The one-record trace — a learning article, birth to death

| stage | what lands in `activity` | verb | origin | diff |
|---|---|---|---|---|
| created | `Learning created` — "Ada added the "Fire safety" learning item" | `created` | ui / mcp / agent | — |
| edited | `Learning edited` — with the fields, old → new, in the sentence | `edited` | ui / mcp / agent | **yes, JSON** |
| deactivated | `Learning deactivated` | **NULL** | ui / mcp / agent | no |
| reactivated | `Learning activated` | **NULL** | ui / mcp / agent | no |
| bulk deactivated | one row per article (delegates to the single-row function) | **NULL** | ui / mcp / agent | no |
| hard delete | none exists — no `DELETE FROM learning` anywhere | — | — | — |
| **what the Activity tab shows** | type, description, actor name, timestamp | **dropped** | **dropped** | **dropped** |

A support ticket traces the same way except that a **reply** — the most common thing
that happens to a ticket — appears nowhere at all.

---

## Findings

### 1 · HIGH — half the verb enum is never written, and the test that "covers" it cannot fail
`shared/workers/activity.ts:108` · `workers/content/src/lib/learning.ts:384` ·
`workers/tenancy/src/lib/roles.ts:315` · `workers/tenancy/src/lib/selectable.ts:217` ·
`workers/content/src/lib/help.ts:326` and `:427` · test at
`workers/content/test/activity-seam.test.ts:153-158`

`ACTIVITY_VERBS` declares six values. Grep across all worker and shared source:
`edited` written 11 times, `created` 9, `removed` 2 — **`deactivated`, `activated`
and `status` are written by nothing**. Five log sites send no `verb` at all, and
they are precisely the deactivate / reactivate / status-move sites, so the entire
archive half of every record's life carries `verb = NULL`.

**Why it matters.** R25 states the verb is "the stable half a query can group by".
Migration 0008 created `idx_activity_verb` and named its purpose in a comment:
*"Every deactivation this month"*. That query returns zero rows today, and will
keep returning zero rows, on an index the database pays to maintain on every write.

**And the test hides it.** `it("covers every lifecycle stage a record has")` loops
over `["created","edited","deactivated","activated"]` and asserts
`ACTIVITY_VERBS` contains each — against a constant that literally lists them on
the line above. It cannot fail while the constant is unchanged and proves nothing
about whether a row ever carries the value. This is the failure mode CLAUDE.md
names: *"A green test must never assert the wrong intent."*

**Fix.** Add `verb: active ? "activated" : "deactivated"` at the three
activate/deactivate sites and `verb: "status"` at the two help-status sites; replace
the tautology with a scan of the real `logActivity` entries.

### 2 · HIGH — the AI assistant can add content to a support ticket with no trace
`workers/content/src/lib/help.ts:439-464` · exposed as a tool at
`shared/workers/tool-catalog.ts:361` (`POST /api/content/help/reply`)

`addReply` inserts into `help_threads` and bumps `help.updated_at` — two writes,
zero activity rows. The ticket demonstrably changes and its own Activity tab shows
nothing. `help_threads` is the only user-editable business table in the base with
**zero** logged writes, which is exactly the condition the 18 August run scored 0/15
for when `mcp_tokens` was in this position.

It is worse here than for an ordinary gap: `help_reply` is an **agent and MCP
tool**, so the assistant writing into a customer's ticket is the case with no
footprint — the precise thing this review exists to catch. `is_agent` is stored on
the reply row, so the information exists; it just never reaches the trail.

**Fix.** One `logActivity` call in `addReply`: `type: "Reply added"`, `verb:
"created"`, `relatedTable: "help"`, `relatedRowId: ticketId`, and let the actor's
origin carry `agent` when the assistant wrote it.

### 3 · MEDIUM — the nightly job stamps its own rows as if a person did them in a browser
`shared/workers/activity.ts:79` (`SYSTEM_ACTOR`) · written at
`workers/tenancy/src/lib/sharding.ts:302` · fallback at `activity.ts:213`

`SYSTEM_ACTOR = { id: "system", email: "system", name: "Scheduled job" }` carries no
`origin`, and `logActivity` falls back to `entry.origin ?? actor.origin ?? "ui"`. The
module mover's row therefore reads `creator_name = "Scheduled job", origin = "ui"` —
the row contradicts itself, and `job` becomes a value the column can never hold.

Provenance the system falsifies is worse than provenance it omits, because the
column's whole claim is that it can be trusted. **Fix:** one property —
`origin: "job"` on `SYSTEM_ACTOR`.

### 4 · MEDIUM — three of the six origins are unreachable, and no code reads the column
`shared/workers/activity.ts:82` · `workers/gateway/src/index.ts:103` ·
`workers/tenancy/src/lib/activity-read.ts:97` · `DATA-MODEL.md:262` ·
`ARCHITECTURE.md:352`

| value | written by | reachable |
|---|---|---|
| `ui` | the default, for every request through the public gateway | yes |
| `mcp` | `workers/mcp/src/lib/tools.ts:185` | yes |
| `agent` | `workers/data-ops/src/lib/tools.ts:294` | yes |
| `api` | nothing | **no** — the gateway strips the header at the public door, so no external caller can ever claim it |
| `import` | nothing | **no** — the import doors inherit the caller's origin |
| `job` | nothing (see finding 3) | **no** — falsified as `ui` |

The stripping is correct and I want to be clear it is good security: `originFrom`
validates against the known set and the gateway deletes the header before
forwarding, with a test at `workers/gateway/test/trace.test.ts:117`. The gap is that
`api` and `import` were declared for callers that architecture makes impossible.

Compounding it: `getActivity` never selects `origin`, so even the three values that
DO land are invisible to every screen and endpoint. DATA-MODEL.md and
ARCHITECTURE.md both list all six as if all six were live — cross-reference
`story_checks_out_review`.

**Fix.** Either stamp `import` at the two import log sites and `job` on
`SYSTEM_ACTOR` and delete `api`, or delete `api` and `import` from the union. Update
both documents either way.

### 5 · MEDIUM — an invite's acceptance never appears on the invite's own feed
`workers/tenancy/src/lib/teams.ts:67-99`

`recordInviteAccepted` writes one activity row — `Member joined`, with
`relatedTable: "team_members"` — and then stamps `invite_logs.invite_accepted = 1`
with no row of its own. The read path's `invite` scope filters
`related_table = 'invite_logs'` (`activity-read.ts:73`), so an invite's Activity tab
shows **sent** and **revoked** and never **accepted** — the one event that ends its
life. Doing the same thing in one place for both join paths was the right call; it
just logs one relation where the moment belongs to two.

**Fix.** A second row alongside the first: `type: "Invite accepted"`, `verb:
"created"`, `relatedTable: "invite_logs"`, `relatedRowId: inviteRowId` — inside the
existing `if (!inviteRowId) return` guard, so nothing changes when there is no
invite row to name.

### 6 · MEDIUM — one activity failure still goes to the console only
`workers/tenancy/src/lib/teams.ts:96`

`shared/workers/activity.ts:222` states the contract plainly: *"It used to swallow
into `console.error` and nothing else, so a failed write left a hole in the trail
that nothing anywhere recorded… The swallow stays; the silence does not."*
`recordInviteAccepted` wraps its own body in a try whose catch is
`console.error("invite accept record failed (audit only):", e)`. If the team's
`database_id` lookup fails, "Member joined" is never written and nothing durable
records the hole — the one path where the seam's own rule was not applied.

**Fix.** Replace the `console.error` with `traceError({ worker: "tenancy", place:
"invite-accept", event: "activity_log_gap", detail: e })`. Also raises
`error_log_review` — one more failure path that reaches the store.

### 7 · MEDIUM — the append-only check cannot see the file most likely to break it
`web/test/rules.test.ts:902-937` with `workerSources()` at `:32-44`

The R25 check walks `workers/*/src` only. `shared/workers/` is outside the corpus —
and that is where `logActivity`, `logAccountActivity` and `retention.ts` live. Three
consequences, all provable by reading the two functions:

- an `UPDATE activity SET …` added inside `shared/workers/activity.ts` would keep
  the build green;
- the check's own `if (path.endsWith("/retention.ts")) continue` exemption guards a
  file the scan never reaches — the author knew the file mattered and the corpus
  never included it;
- the pattern list is `[UPDATE activity, DELETE FROM activity, UPDATE
  account_activity]` — `DELETE FROM account_activity` is missing, so hard-deleting
  a person's identity history from a worker passes.

This is the campaign brief's failure mode 1 in a different shape: not a slice that
runs past the end, but a corpus that excludes the target. The law is true today; its
guard is narrower than its claim.

**Fix.** Add `shared/workers/*.ts` to the scanned set, add the missing DELETE
pattern, and move or drop the dead exemption. Then sabotage-prove it: add
`UPDATE activity SET description = ''` to `shared/workers/activity.ts`, watch the
build go red naming that file, restore from a copy.

### 8 · LOW — a person's account is created with no row in either log
`workers/auth/src/lib/users.ts:62`

`INSERT INTO users` writes no `account_activity` row. `account_activity` records
name change, photo change, email change, token created and token revoked — the
person's own birth is not among them, and neither is signing in.

**And two documents say sign-ins are logged when nothing logs one.**
`shared/workers/activity.ts:33` — *"Signing in is identity, not a record change: it
goes to `account_activity` in the global database"* — and
`shared/workers/retention.ts:75` — *"a person's own security history (sign-ins,
email changes)"*. Grep finds five `logAccountActivity` types and none is a sign-in.
Cross-reference `story_checks_out_review`.

**Fix.** Log account creation (one row per person, ever — real value, negligible
cost) and **correct the two comments** rather than log sign-ins. See the impact map:
a row per sign-in lands in the shared core database, which SCALING.md §3 names as
the first shared thing to reach 10 GB.

### 9 · LOW — the "NULL not []" comment argues for a distinction the code destroys
`shared/workers/activity.ts:204-206`, test at `activity-seam.test.ts:98-105`

> *"NULL rather than `[]` when there is nothing to say, so a reader can tell 'no
> fields changed' from 'this door does not send diffs yet' — two different facts an
> empty array would merge into one."*

The code writes NULL in **both** cases. Storing `[]` for "nothing changed" and NULL
for "this door sends no diffs" is what would preserve the distinction; the code does
the opposite of what the comment claims it achieves, and the test asserts the
behaviour while repeating the reasoning. Reachable in practice: an edit that changes
nothing still runs the UPDATE, produces an empty `changedFields`, and logs
"X edited Y" with `before_after = NULL`.

**Fix.** Cheapest honest repair is the comment and the test's justification, not the
code.

### 10 · LOW — 20 non-logging write sites are reasoned in code and written down nowhere
`shared/workers/activity.ts:29-42`

The "deliberately not logged" list is genuinely good and is the reason criterion 2
scores 9/15 rather than 0. It names sessions, login and email codes, idempotency
keys, error rows, AI-usage rows, `learning_progress`, `mcp_tokens.last_used_at` and
the active-team pointer. It does not name: import sessions and batches (10 sites),
agent threads and messages (4), the import catalog self-heal (2), `db_alerts` (2),
and operator writes to `teams.shard_count` / `teams.schema_version` (2).

**Fix.** Five bullets in the list that already exists.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Write the missing verbs at the 5 verb-less sites | `workers/content/src/lib/learning.ts:384`, `roles.ts:315`, `selectable.ts:217`, `help.ts:326`, `help.ts:427` | ADDS one property per call (5 lines) | **none** — same INSERT, same row width; it makes the existing `idx_activity_verb` finally return rows instead of being a write cost with no reader, which slightly *helps* spend_review |
| **F2** Replace the tautological verb test with a real scan | `workers/content/test/activity-seam.test.ts` **or** extend the existing `activity-birth-to-death` case in `web/test/rules.test.ts` | ADDS ~15 lines of check | **lean_mean** (more test code; the prime directive counts code as a defect). Mitigate by EXTENDING the existing R25 check rather than adding an R26 — a new law would need RULES.md + registry + check to satisfy `registry-integrity`, tripling the code for the same guarantee |
| **F3** `origin: "job"` on `SYSTEM_ACTOR` | `shared/workers/activity.ts:79` | ADDS one property | **none** — one property on one constant |
| **F4** Resolve the dead origins: stamp `import`, or delete `api`+`import` from the union | `shared/workers/activity.ts:82`, `workers/data-ops/src/lib/import.ts:515`, `import-batch.ts:291`, plus `DATA-MODEL.md:262` and `ARCHITECTURE.md:352` | ADDS 2 stamps, or REMOVES 2 enum values | **story_checks_out** if the two docs are not updated in the same commit — both currently list all six origins as live. Deleting values is the *lean_mean*-positive option; stamping is the *activity_log*-positive one. They cannot both be right, so pick one and say so in R25 |
| **F5** Log the reply (`addReply`) | `workers/content/src/lib/help.ts:439-464` | ADDS one `logActivity` call | **spend / speed / scaling — real and quantified.** One extra activity row per reply, on the fastest-growing table in a team database. A busy ticket is 5–20 replies, so this is the largest row-count increase of any fix here. It is still the right call: an agent writing into a customer's ticket invisibly is a worse cost than a row |
| **F6** Log the invite acceptance on the invite's own feed | `workers/tenancy/src/lib/teams.ts:88-98` | ADDS one row per invite acceptance | **spend / scaling — negligible.** An invite is accepted exactly once in its life |
| **F7** `traceError` instead of `console.error` in `recordInviteAccepted` | `workers/tenancy/src/lib/teams.ts:96` | REPLACES a console line with a structured trace row | **error_log_review — helps** (one more failure path reaches the durable store). **spend** — only on the failure path, which should be never |
| **F8** Expose `origin` + `verb` on the read path, and a verb/origin filter | `workers/tenancy/src/lib/activity-read.ts:97`, `shared/types.ts:154`, the `ActivityFeed` mapping in `web/components/*-detail.tsx` | ADDS 2 columns to the feed SELECT + 2 optional filter params | **speed / round_trip / scaling — measurable.** A wider SELECT over the biggest table in a team DB, on a query that runs on every record detail and every feed page. Two short TEXT columns is a small cost. **Do NOT add `before_after` to the team feed** — see F9. Also **security_sentry**: the team feed is cross-module and gated by R18's `allowedTables`; adding `origin` is inert, but confirm the filter params cannot widen the visibility clause |
| **F9** Expose `before_after` on the **record-scoped** read only | `activity-read.ts` (a `scope === "record"` branch), `shared/types.ts` | ADDS an unbounded JSON column to ONE query shape | **security_sentry — flag first.** `before_after` carries old and new field VALUES; today the log shows a sentence, and a diff column returns raw prior values to anyone who may read that record's history. **speed / spend** — unbounded payload per row; contain it to `scope=record` so the team feed and its COUNT are untouched. **Cross-check SCALING.md:400**, which claims the feed read is served by a COVERING INDEX (`idx_activity_recent` is `(created_at DESC, id DESC)`, which cannot cover a SELECT returning `type, description, creator_name`) — I did not verify that EXPLAIN and flag it for `scaling_review` / `speed_review` rather than assert it |
| **F10** Log account creation; **fix** the two sign-in comments rather than log sign-ins | `workers/auth/src/lib/users.ts:62`, `shared/workers/activity.ts:33`, `shared/workers/retention.ts:75` | ADDS one row per person ever; REMOVES two false claims | **scaling / spend — this is the tension to get right.** Logging sign-ins would put one row per session into the SHARED core database, which SCALING.md §3 names as the first shared thing to reach 10 GB. Account creation is one row per person for ever and is free. Fixing the comments costs nothing and raises **story_checks_out** |
| **F11** Widen the R25 append-only check to `shared/workers/`, add `DELETE FROM account_activity`, drop the dead exemption | `web/test/rules.test.ts:902-937` | ADDS ~4 lines to an existing check | **lean_mean — trivially** (4 lines inside a check that already exists). Must be sabotage-proven, restoring **from a copy, never `git checkout`** |
| **F12** Name the 20 undocumented exclusions in the existing list | `shared/workers/activity.ts:29-42` (comment only) | ADDS 5 bullets | **none** — a comment. Raises **story_checks_out** (the rule's stated coverage matches the code's) |
| **F13** Add a rows-per-record-per-month estimate for `activity` | `SCALING.md` §4 | ADDS one paragraph of arithmetic | **none — documentation only.** Raises **scaling_review**, which needs that number for its own headroom ladder |
| **F14** Correct the "NULL not `[]`" comment and the test's justification | `shared/workers/activity.ts:204`, `activity-seam.test.ts:98` | REWRITES a comment; no behaviour change | **none — no code path moves** |
| **F15 (verification, not a fix)** Confirm team migration 0008 is applied in both environments | none — a one-off command | Reads `_migrations` per team DB | **none.** `POST /api/tenancy/admin/migrate-teams` with `x-admin-key` is idempotent and self-diffing. Until this is confirmed, every `before_after`, `origin` and `verb` claim in this report is code-true and runtime-unproven — and an unmigrated team has **no activity log at all**, silently |

---

## CEILING

**95 is reachable, by one point of slack, and only if every finding above is fixed.**

**Criterion 1 is capped at 60 by a locked decision a commit cannot change.** Row 1
of that criterion awards 40 points for *one* central table carrying the trail for
the whole app. Brimba has two — `activity` per team, `account_activity` global — and
the split is forced by ARCHITECTURE's per-team-D1 model: identity events happen
before a person belongs to any team, so there is no team database to write them to.
Merging them would cross the tenancy boundary and is a Tier 3 recommendation the
rubric itself tells reviewers not to make. **Cost: 40 × 9 ÷ 100 = 3.6 points, for
ever. True maximum: 96.4.**

**Criterion 7 is capped near 85 by a platform reality.** The −15 for "the log write
sits outside the transaction that commits the data change" is D1 over the REST door:
`d1Query` is one parameterised statement and there is no cross-statement
transaction. It is not *absolutely* fixed — `d1ExecScript` accepts a multi-statement
script, so a team-DB UPDATE and its activity INSERT could travel as one script — but
D1's REST contract does not guarantee atomicity across statements in a script, and
core-DB writes go through the native binding regardless. Assume −15 stays.

**The best plausible total**, with criterion 1 at its 60 ceiling, criterion 7 at 85,
and all eight others driven to 100:

```
60×9 + 100×17 + 100×13 + 100×12 + 100×11 + 100×10 + 85×9 + 100×7 + 100×7 + 100×5
= 540 + 1700 + 1300 + 1200 + 1100 + 1000 + 765 + 700 + 700 + 500
= 9505  →  95.05  →  95
```

**So: exactly 95, with zero margin.** Every finding in this report has to land, and
criterion 2 in particular has to reach a full 100 — which means `help_threads` must
gain a logged write, account creation must be logged, and all 53 non-logging sites
must be named in the exclusion list. If criterion 7 can be lifted to 93 by folding
team-DB log writes into the same script as the data write, the ceiling rises to 96;
that is the only headroom available.

**One criterion cannot be verified from this repository at all.** Whether team
migration 0008 is applied in staging and production is **unmeasured** — it needs
live D1 access. Until F15 is run, criteria 5 and 6 rest on a column whose existence
in the live databases nobody in this campaign has checked.
