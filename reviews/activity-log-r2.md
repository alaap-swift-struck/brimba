# Activity log review — round 2 — Brimba · 2026-08-25
SCORE: 88/100   (round 1: 82/100 · 18 August: 94/100)

> When a record changes, does anything write it down — and does that stay true
> whichever door the change came through?

**The worst gap, in one sentence:** *a person's account is created with no row in
either log* (`workers/auth/src/lib/users.ts:62`) — the only remaining place in the
base where a real record comes into existence and nothing anywhere says so.

That is a much smaller worst-gap than round 1's, and that is the story of this
round: the assistant can no longer add content to a customer's support ticket
invisibly.

---

## DELTA

Round 1: 82/100 → Round 2: **88/100**

| # | Criterion | wt | R1 | R2 | Why it moved |
|---|---|---|---|---|---|
| 1 | One log, not many | 9 | 60 | **60** | unchanged — still two tables split by database boundary, still a locked decision |
| 2 | Every write path logs · **GATE** | 17 | 75 | **92** | `addReply` logs, so `help_threads` stops being a user-editable business table with zero logged writes (0/15 → 15/15) and hand-counted coverage goes 42/45 → 44/45 |
| 3 | Every surface logs the same | 13 | 96 | **100** | `SYSTEM_ACTOR` carries `origin: "job"`, so the nightly job's rows no longer claim a person did it in a browser |
| 4 | The whole lifecycle is covered | 12 | 83 | **93** | the reply is an edit that now records (26/30 → 30/30); deactivate/activate/status now carry a verb (10/20 → 16/20) |
| 5 | The row says who, what and where | 11 | 82 | **94** | all six verbs written (12/20 → 18/20); five of six origins reachable, `job` no longer falsified, and the read path SELECTs `origin`+`verb` (6/15 → 12/15) |
| 6 | The change itself is recoverable | 10 | 90 | **90** | unchanged — `before_after` is still written and read by nothing, anywhere |
| 7 | The log cannot silently fail | 9 | 78 | **75** | **FELL — see finding 1.** Not a regression: round 1 credited `traceError` as a *durable* gap marker. It is a `console.error`, and this repo's own ERROR-HANDLING.md:41 says console lines last about a week |
| 8 | Nothing rewrites history | 7 | 93 | **93** | unchanged — the append-only scan still walks `workers/*/src` only, so `shared/workers/activity.ts` is outside its corpus |
| 9 | The history is answerable | 7 | 87 | **90** | `verb`/`origin` now reach the client per row, and the verb index finally has rows to return; still no server-side verb/origin/time filter (2/15 → 5/15) |
| 10 | The table has a life plan | 5 | 83 | **83** | unchanged — no rows-per-record-per-month figure anywhere; exclusion list byte-identical |

**One criterion fell. No other review's repair caused it.** Criterion 7 fell
because my round-1 reading of `traceError` was wrong, and correcting it downward
is worth more than a stable number. Full detail in finding 1.

**Nothing any other reviewer changed damaged this review.** I checked every file
in the six commits that touches a log site (`git diff 8751e30..HEAD` on
`invites.ts`, `members.ts`, `sharding.ts`, `routes/help.ts`, `routes/config.ts`
— zero activity-relevant lines), and two repairs from other reviews *helped*
here: the dead-end review's learning-edit fix added `Order` and `Required` to the
field diff, and the architecture/error-log review's `forwardToDoor` migration is
what made `origin: "import"` reachable.

---

## Verification of the six specific claims

Every one checked against source, not against the commit message.

| claim | verdict | evidence |
|---|---|---|
| `addReply` now logs | **true** | `workers/content/src/lib/help.ts:471-478` — awaited, `type: "Ticket reply added"`, `verb: "created"`, `relatedTable: "help"`, `relatedRowId: ticketId`, and the sentence names the assistant when `isAgent` |
| the feed SELECTs `origin`/`verb` | **true, at the endpoint only** | `workers/tenancy/src/lib/activity-read.ts:104` selects them, `:120-121` maps them, `shared/types.ts:163-168` carries them. **No screen shows them** — `help-detail.tsx:232`, `role-detail.tsx:173` and every other `ActivityFeed` mapping still drop to `{id, description, actor, timestamp}` |
| `SYSTEM_ACTOR` carries `origin: "job"` | **true** | `shared/workers/activity.ts:72-81` |
| the three unwritten verbs are written | **true** | `deactivated`/`activated` at `learning.ts:418`, `roles.ts:367`, `selectable.ts:228` (ternary form); `status` at `help.ts:328`. All six of `ACTIVITY_VERBS` now appear |
| imports stamp `origin: "import"` via `forwardToDoor` | **true for the imported ROWS, false for the summary row** | `import.ts:397` (writeRow), `:436` (writeParcel), `import-batch.ts:168` — each created record's own activity row is stamped `import`. The row that literally says *"Data imported"* (`import.ts:533`, `import-batch.ts:296`) is written by the data-ops caller's own actor, whose origin came through the public gateway and is therefore `ui`. Finding 6 |
| the verb test asserts something is WRITTEN | **true, and I sabotage-proved it** | `activity-seam.test.ts:162-181` scans `serverSources()` for `verb:` literals and ternaries and asserts `ACTIVITY_VERBS.filter(not written)` is empty, with a `written.size > 3` blindness guard |

**The sabotage proof, run out of tree** (`/private/tmp/.../al-verbtest.mjs`,
nothing in the repo touched). I re-implemented the test's exact regex and
`stripComments`, then removed the three ternary sites in memory:

```
WRITTEN as-is:                              activated, created, deactivated, edited, removed, status
declared-but-unwritten as-is:               []
after removing the 3 ternary sites:         created, edited, removed, status
  → test would FAIL naming:                 deactivated, activated
after removing verb: "status":               → test would FAIL naming: status
```

The check genuinely fails when a verb stops being written. Its one honest limit:
it proves the string exists in source next to `verb:`, not that the branch is
reachable at runtime. A `verb: "activated"` inside dead code would satisfy it.
That is still an enormous improvement on asserting a constant contains the
strings printed on the line above it.

**The old tautology is still there**, at `activity-seam.test.ts:156-160`. The new
test was added beside it rather than replacing it. Harmless, but it is 5 lines
that can never fail — cross-reference `lean_mean`.

---

## Arithmetic

```
 #  criterion                          method     score  weight  product
 1  One log, not many                  coverage      60      9      540
 2  Every write path logs        GATE  coverage      92     17     1564
 3  Every surface logs the same        coverage     100     13     1300
 4  The whole lifecycle is covered     coverage      93     12     1116
 5  The row says who, what and where   coverage      94     11     1034
 6  The change itself is recoverable   defect        90     10      900
 7  The log cannot silently fail       defect        75      9      675
 8  Nothing rewrites history           defect        93      7      651
 9  The history is answerable          coverage      90      7      630
10  The table has a life plan          coverage      83      5      415
                                                          ----     ----
                                                           100     8825

                                    total = 8825 / 100 = 88.25  →  88
```

**The gate.** Criterion 2 must clear 40 or the total caps at 35. It scores **92**
(was 75). No cap applied.

### The probe, corrected by hand again — and it moved by exactly one

| denominator | sites | logged | coverage |
|---|---|---|---|
| probe, as printed (round 2) | 127 | 50 | **39%** |
| probe, round 1 | 127 | 49 | 39% |
| minus 21 phantom write sites parsed from English prose | 106 | ~45 | 42% |
| **business-record sites only** (hand-classified, every one opened) | **45** | **44** | **97.8%** |
| the same 45 sites, scored on round-1's code | 45 | 42 | 93.3% |

**The phantom tables are still there, same shape.** The probe's `WRITE` regex
reads `update <word>` out of prose, producing tables called `the` (4 sites),
`what` (3), `paths` (2), `that` (2), `only` (2), and `carries`, `refuse`, `here`,
`your`, `accepts`, `for`, `instantly`, `change` (1 each) — **21 phantom write
sites**. Verified by cross-checking every name against the 36 that actually
appear in a `CREATE TABLE`.

**The probe now also reads the campaign's own reports.** `reviews/scaling.md`
appears in `loggerSites` with a function called `oneMember`, and 15 of the 26
"retention signal" files it lists are review markdown. Harmless to my hand count
(I exclude `reviews/` and all `.md`), but worth saying: a probe that scans the
folder the reviews are written into will drift every round.

**My own scan's false negatives, found by opening the files.** A same-function
containment test is stricter than the probe's ±40-line window and produces its
own errors in the other direction. Four clusters, all confirmed logged:

- `teams.ts:213,216` (`updateTeamDetails`) — logged one caller up at
  `workers/tenancy/src/routes/team.ts:122`
- `teams.ts:247,254,369,358` (both invite-accept paths) — logged inside
  `recordInviteAccepted`, called from each
- `workers/mcp/src/lib/tokens.ts:45,77` — logged as `mcp_token_created` /
  `mcp_token_revoked` at `workers/mcp/src/index.ts:137,156`
- `stakeholders.ts` — `INSERT OR IGNORE INTO help_stakeholders` is invisible to
  every `insert\s+into` regex in both the probe and my scan. It **is** logged
  (`stakeholders.ts:200`)

### Criterion arithmetic, row by row

**1 · One log, not many — 60/100 · weight 9** *(unchanged)*
```
 0/40  TWO log tables: `activity` (per team) + `account_activity` (global)
25/25  each has a documented, non-overlapping reason — split by DATABASE boundary,
       not by feature (shared/workers/account-activity.ts:1-24, DATA-MODEL.md:233)
20/20  a single documented way to read a record's full history across them —
       DATA-MODEL.md § "Reading one person's whole history", both SQL queries
15/15  no per-feature log table duplicating the central one
```

**2 · Every write path logs — 92/100 · weight 17 · THE GATE** *(was 75)*
```
68/70  70 × 0.978 — 44 of 45 business-record write sites log (hand-counted; the
       enumeration is below). Round 1, same 45 sites: 42, i.e. 70 × 0.933 = 65
 9/15  32 of 53 non-logging sites are a WRITTEN exclusion (shared/workers/
       activity.ts:28-39 — BYTE-IDENTICAL to round 1). 15 × 32/53 = 9.1
15/15  NO user-editable business table now has zero logged writes.
       `help_threads` was that table in round 1 and scored this row 0/15
```

The one unlogged business site: `workers/auth/src/lib/users.ts:62` — a person's
account is created with no row in `activity` or `account_activity`.

The 45, by table (logged / total, seed and pointer writes excluded as documented):
`learning` 4/4 · `selectable_data` 5/5 · `help` 5/5 · `help_threads` **1/1** ·
`help_stakeholders` 1/1 · `member_roles` 4/4 · `role_permissions` 2/2 ·
`screens` 1/1 · `team_members` 5/5 · `teams` 6/6 · `invite_index` 4/4 ·
`invite_logs` 2/2 · `team_module_databases` 1/1 · `users` (identity) 2/3 ·
`email_change_logs` 1/1.

**3 · Every surface logs the same — 100/100 · weight 13** *(was 96)*
```
40/40  no surface sits more than 15 points below the best
25/25  MCP and agent log at the SAME rate as the API, by construction: both go
       through forwardToDoor to the same gated door the browser posts to
       (workers/mcp/src/lib/tools.ts:185, workers/data-ops/src/lib/tools.ts:294)
20/20  background work has a system actor AND its rows are now stamped `job`
       (shared/workers/activity.ts:80). This row was 16/20 in round 1
15/15  bulk and import paths log — and each imported ROW now carries origin
       `import` on its own activity row, not `ui`
```

**The surface parity board**

| surface | how a record change reaches the log | round 1 | round 2 |
|---|---|---|---|
| web / api | the gated doors, 44/45 sites | 94% | **98%** |
| mcp | the same doors via `forwardToDoor`, stamped `mcp`; tokens → `account_activity` | yes | **yes** |
| agent | the same doors again, acting as the user, stamped `agent` | **no for `reply_help_ticket`** | **yes** |
| import | each row through the create door stamped `import`, plus one summary row | yes, stamped `ui` | **yes, rows stamped `import`** |
| job (cron) | module mover, `SYSTEM_ACTOR` | yes, stamped `ui` — a lie | **yes, stamped `job`** |

**4 · The whole lifecycle is covered — 93/100 · weight 12** *(was 83)*
```
27/30  creation is in the CENTRAL log for every team record. Not for a person's
       account: workers/auth/src/lib/users.ts:62 has no row anywhere. −3
30/30  edits are recorded — including the reply, which is the most common thing
       that happens to a ticket. Was 26/30
16/20  archive / deactivate is its own READABLE type AND now carries the stable
       verb (`activated`/`deactivated`/`status`) the R25 index was built for.
       Was 10/20. Two gaps remain: the BULK help-status row carries no verb and
       no row id, so it appears on no individual ticket's feed (finding 3); an
       invite's ACCEPTANCE still never appears on the invite's own feed
       (finding 4). −4
20/20  hard deletes provably do not happen to any master record. Every
       `DELETE FROM` in worker source is sessions, idempotency_keys, or the
       documented retention sweep. Deactivate-not-delete is locked
       (ARCHITECTURE §4), so deactivation IS death
```

**The lifecycle strip — a learning article, birth to death**

| stage | lands in `activity` | verb | origin | diff | shown on screen |
|---|---|---|---|---|---|
| created | `Learning created` | `created` | ui / mcp / agent / **import** | — | type, sentence, actor, time |
| edited | `Learning edited`, fields old → new in the sentence | `edited` | ui / mcp / agent | **yes, JSON** | sentence only |
| deactivated | `Learning deactivated` | **`deactivated`** | ui / mcp / agent | no | sentence only |
| reactivated | `Learning activated` | **`activated`** | ui / mcp / agent | no | sentence only |
| bulk deactivated | one row per article | **`deactivated`** | ui / mcp / agent | no | sentence only |
| hard delete | none exists | — | — | — | — |
| **the Activity tab shows** | type, description, actor, timestamp | **dropped** | **dropped** | **dropped** | |

A support ticket now traces the same way, and a **reply** — previously invisible
— appears as `Ticket reply added`, naming the assistant when the assistant wrote
it.

**5 · The row says who, what and where — 94/100 · weight 11** *(was 82)*
```
25/25  the actor is a frozen snapshot — creator_id + creator_email + creator_name
24/25  target identified by BOTH table and row id — except the bulk help status
       row, which carries relatedTable with no relatedRowId (deliberate). −1
18/20  the verb is a real closed TypeScript union and ALL SIX values are now
       written. 1 of 28 log sites still sends no verb (help.ts:428, the bulk
       status row). Was 12/20 with 3 of 6 unwritten and 5 of 26 sites verbless
12/15  the origin column: FIVE of six values reachable (ui, mcp, agent, import,
       job); `job` is now truthful; the read path SELECTs it. Remaining: `api` is
       declared and reachable by nothing — correctly, since the gateway strips
       the header at the public door — and no screen or tool shows the value to
       a person (findings 5, 7). Was 6/15
15/15  timestamp present; tenant implicit — the row lives in that team's own
       database, which is stronger than a column
```

**Log table anatomy — `activity`**

| column | present | filled | read by an endpoint | shown to a person |
|---|---|---|---|---|
| `id`, `created_at` | yes | always | yes | yes (time) |
| `creator_id` / `_email` / `_name` | yes | always | name only | yes (name) |
| `type`, `description` | yes | always | yes | yes |
| `related_table`, `related_row_id` | yes | all but the bulk row | filter only | no |
| `verb` | yes | 27 of 28 sites | **yes (new)** | **no** |
| `origin` | yes | always, 5 of 6 values reachable | **yes (new)** | **no** |
| `before_after` | yes | 3 modules | **no** | **no** |

**6 · The change itself is recoverable — 90/100 · defect · weight 10** *(unchanged)*
```
100  base
 −3  minor: 3 of ~13 modules build a field diff (learning, help, member_roles).
     Which three IS written down (shared/workers/activity.ts:155-162). Learning's
     diff gained `Order` and `Required` this round (dead-end review's fix), so the
     covered modules got deeper without getting wider
 −7  medium: `before_after` is written and has NO READER — not an endpoint, not a
     screen, not a test, not the documented query in DATA-MODEL.md:253. The feed
     SELECT gained `origin` and `verb` this round and deliberately did not gain
     this one. Recovery still requires direct `wrangler d1 execute` access
```

**7 · The log cannot silently fail — 75/100 · defect · weight 9** *(was 78 — FELL)*
```
100  base
−15  high: the data write and the log write are two separate statements with no
     transaction spanning them. Partly a platform reality (D1 over the REST
     door), but not absolute — `d1ExecScript` takes a multi-statement script
 −7  medium: a failed activity write records ONLY a `console.error` line, which
     ERROR-HANDLING.md:41 says Cloudflare keeps about a week — while the seam's
     own comment calls it "a DURABLE, filterable gap marker". Finding 1
 −3  minor: workers/tenancy/src/lib/teams.ts:97 is a raw `console.error` with no
     event name at all, so it is not even filterable as an activity gap.
     Downgraded from round 1's medium: now that the seam's own marker is known to
     be console-only, this site is unstructured rather than uniquely undurable
```
Still true and still worth saying: **every one of the 28 `logActivity` call sites
awaits**, and `workers/content/test/idempotent-transitions.test.ts` runs a real
transition twice and proves the data write and its log row land together, and
that a repeat writes neither — a behavioural test, not a scan.

**8 · Nothing rewrites history — 93/100 · defect · weight 7** *(unchanged)*
```
100  base
 −7  medium: the check that enforces append-only cannot see the file most likely
     to break it. `web/test/rules.test.ts:996` walks `workerSources()` —
     `workers/*/src` only — so `shared/workers/`, where `logActivity` and
     `logAccountActivity` live, is outside the corpus. Its
     `if (path.endsWith("/retention.ts")) continue` exemption still guards a file
     the walk can never reach (`retention.ts` exists only in `shared/workers/`),
     and `DELETE FROM account_activity` is still absent from the pattern list
```
**Zero UPDATE or DELETE against either log table in any request path** — the
probe's `historyRewrites` is empty and I confirmed it by reading. A clean result
and a real one.

**Partial credit where it is due:** this check now imports `workerSources` and
`stripComments` from `shared/test/source.ts`, and `stripComments` was broken
before (block pass first, so a slash-star inside a line comment ate real code).
Within its corpus the scan is no longer half-blind. The corpus itself did not
move, so the criterion does not.

**9 · The history is answerable — 90/100 · weight 7** *(was 87)*
```
35/35  "this record's history" — idx_activity_record_recent
30/30  "this actor's actions" — idx_activity_actor, team migration 0008
20/20  a real read path: the generic (table, id) route, the team feed, and an
       Activity tab on every record detail (Law R2)
 5/15  still NOT filterable by verb, by origin, or by time range. `getActivity`
       (activity-read.ts:48-56) accepts scope + id + table + allowedTables +
       cursor and nothing else. Was 2/15: the +3 is real but partial —
       `idx_activity_verb`'s own stated example, "every deactivation this month",
       now RETURNS ROWS instead of zero, and both columns reach the client per
       row so a caller can filter within a page. Server-side, neither index
       serves any query this repo issues
```

**10 · The table has a life plan — 83/100 · weight 5** *(unchanged)*
```
35/35  a stated retention window: TEAM_RETENTION for `activity` is KEEP_FOREVER,
       overridable via RETAIN_TEAM_ACTIVITY_DAYS (shared/workers/retention.ts:99-110)
18/30  growth is described qualitatively — "the biggest table in any team DB", a
       65%/80% size alarm, 5,000-row drain batches — with NO rows-per-active-
       record-per-month rate anywhere in SCALING.md. I re-grepped: unchanged
20/20  destruction is a deliberate, documented choice, and OFF by default
10/15  what is deliberately NOT logged is written down — the list at
       shared/workers/activity.ts:28-39 is byte-identical to round 1 and still
       covers ~32 of the 53 non-logging sites
```

---

## Findings

### 1 · MEDIUM — the "durable" gap marker is a console line, and round 1 said otherwise
`shared/workers/activity.ts:193-198` and `:225-235` · `shared/workers/trace.ts:61-71`
· `shared/workers/error-log.ts:36-80` · `ERROR-HANDLING.md:41`

**This is the criterion that fell, and I caused it.** Round 1 wrote that
`logActivity`'s catch "writes a durable, filterable `activity_log_gap` through
`traceError` carrying the request id", and penalised `teams.ts:97` a full medium
specifically for being console-only *by contrast*. I did not open `traceError`.

```ts
export function traceError(fields: {...}): void {
  const { detail, ...rest } = fields
  ...
  console.error(JSON.stringify({ level: "error", ...rest, message: ... }))
}
```

That is the whole function. The seam that DOES reach durable storage is
`recordWorkerError`, which calls `traceError` **and** `logError(db, …)` — an
`INSERT INTO error_logs`. `logActivity` calls only the first half.

The seam's own comment claims the opposite, in capitals:

> *"The swallow stays; the silence does not. A failure now writes a DURABLE,
> filterable gap marker through the trace seam."*

And this repo's own doc contradicts it: ERROR-HANDLING.md:41 — *"Beyond the
console lines (which Cloudflare keeps only ~a week)…"*.

**Why it matters.** "Is this record's history complete?" is answerable for about
seven days and then is not answerable at all. The gap marker never joins the
error history the owner can actually query, and it is invisible to
`error_analyst`, which reads `error_logs`.

**The fix, and why it is not one line.** `logActivity(cfg, databaseId, actor,
entry)` holds a **team** D1 handle over the REST door and has no reference to the
core `env.DB` that owns `error_logs`. Routing the gap into the table needs either
an optional `db` parameter threaded to the 28 call sites, or the gap written into
the *team* database (which is the database that just failed). Cheapest honest
first step: **correct the comment** so nobody else scores it the way I did, and
raise the durable route as its own decision. Cross-reference `error_log_review` —
this is one more failure path that does not reach the store.

### 2 · LOW→MEDIUM — a person's account is created with no row in either log
`workers/auth/src/lib/users.ts:62` · comments at `shared/workers/activity.ts:33`
and `shared/workers/retention.ts:75`

Now the worst gap, by elimination. `INSERT INTO users` writes no
`account_activity` row. The five types that log are: name change, photo change,
email change, token created, token revoked. A person's own birth is not among
them, and neither is signing in.

**And two comments still say sign-ins are logged when nothing logs one** —
`activity.ts:33` (*"Signing in is identity, not a record change: it goes to
`account_activity`"*) and `retention.ts:75` (*"a person's own security history
(sign-ins, email changes)"*). Grep finds five `logAccountActivity` types and none
is a sign-in.

**Fix.** Log account creation — one row per person, ever, real value, negligible
cost — and **correct the two comments** rather than log sign-ins. A row per
sign-in lands in the shared core database, which SCALING.md §3 names as the first
shared thing to reach 10 GB.

### 3 · LOW — the last verbless log site is the bulk one, and it names no ticket
`workers/content/src/lib/help.ts:428-433`

27 of 28 `logActivity` sites now carry a verb. The exception is
`bulkSetStatusByFilter`, which writes one row for the whole set with
`relatedTable: "help"` and no `verb` and no `relatedRowId`. Two consequences:
"every status move this month" misses every bulk one, and a ticket moved by a
bulk action shows nothing on its own Activity tab.

The one-row-per-set choice is right and its reason is written down beside it
(*"history says what happened, not per-row noise"*). Only the verb is missing.

**Fix.** `verb: "status"` on that entry. The missing `relatedRowId` is inherent
to a set and should stay.

### 4 · LOW — an invite's acceptance still never appears on the invite's own feed
`workers/tenancy/src/lib/teams.ts:82-95`

Unchanged from round 1. `recordInviteAccepted` writes one row — `Member joined`,
`relatedTable: "team_members"` — then stamps `invite_logs.invite_accepted = 1`
with no row of its own. The read path's `invite` scope filters
`related_table = 'invite_logs'` (`activity-read.ts:76`), so an invite's Activity
tab shows **sent** and **revoked** and never **accepted** — the one event that
ends its life.

**Fix.** A second row alongside the first: `type: "Invite accepted"`, `verb:
"created"`, `relatedTable: "invite_logs"`, `relatedRowId: inviteRowId` — inside
the existing `if (!inviteRowId) return` guard, so nothing changes when there is
no invite row to name.

### 5 · LOW — `api` is the last dead origin, and three documents still list it as live
`shared/workers/activity.ts:91` · `RULES.md:43` · `DATA-MODEL.md:262` ·
`ARCHITECTURE.md:351-352`

| value | written by | reachable |
|---|---|---|
| `ui` | the default for every request through the public gateway | yes |
| `mcp` | `workers/mcp/src/lib/tools.ts:185` | yes |
| `agent` | `workers/data-ops/src/lib/tools.ts:294` | yes |
| `import` | `import.ts:397`, `:436`, `import-batch.ts:168` | **yes — new this round** |
| `job` | `SYSTEM_ACTOR` | **yes — new this round** |
| `api` | nothing | **no** — the gateway deletes the header at the public door, so no external caller can ever claim it |

The stripping is correct and is good security (`gateway/src/index.ts:143`, tested
at `workers/gateway/test/trace.test.ts:117`). `api` was declared for a caller the
architecture makes impossible.

**Fix.** Delete `api` from `ActivityOrigin` and `ORIGINS`, and from RULES.md,
DATA-MODEL.md and ARCHITECTURE.md in the same commit. Cross-reference
`story_checks_out_review` — three documents currently list six live origins where
five exist.

### 6 · LOW — the row that says "Data imported" says it came through the UI
`workers/data-ops/src/lib/import.ts:533` · `workers/data-ops/src/lib/import-batch.ts:296`

The per-row writes now stamp `import` correctly, which is the half that matters.
But the summary row is written directly by data-ops using the caller's own actor,
whose origin came through the public gateway and is therefore `ui`. So a feed
filtered to `origin = 'import'` shows every imported record and misses the row
that says an import happened.

Defensible either way — a person did click Import in the app — but it should be a
decision, not an accident.

**Fix.** `origin: "import"` on both entries, or one line of comment saying why
the summary is a UI action.

### 7 · LOW — `origin` and `verb` reach the client and no screen shows them
`workers/tenancy/src/lib/activity-read.ts:104,120-121` · `shared/types.ts:163-168`
· `web/components/help-detail.tsx:232`, `role-detail.tsx:173`,
`learning-detail.tsx`, `member-detail.tsx`

Half of round-1's F8 landed. The endpoint now returns both columns; every
`ActivityFeed` mapping in `web/` still narrows to
`{id, description, actor, timestamp}`, so "did the assistant do this?" is still
not answerable by looking. Nothing in the MCP or agent tool catalogue reads
activity at all.

**Fix.** The library's `ActivityFeed` item shape is the constraint — this is a
`@swift-struck/ui` change, not a host change, so it is a *surface* to raise, not
a commit to write here (UI-CONVENTIONS: the library is lego, do not fork it into
the host). Until then the value is available to any API consumer, which is worth
something and is why the criterion moved 6 → 12 rather than to 15.

### 8 · LOW — the append-only check still cannot see the file most likely to break it
`web/test/rules.test.ts:992-1027`

Unchanged from round 1, and it survived a round in which eight other checks were
rebuilt on `shared/test/source.ts`. The scan walks `workerSources()`, so:

- an `UPDATE activity SET …` added inside `shared/workers/activity.ts` keeps the
  build green;
- the `if (path.endsWith("/retention.ts")) continue` exemption guards a file the
  walk can never reach — `retention.ts` exists only at `shared/workers/retention.ts`;
- the pattern list is `[UPDATE activity, DELETE FROM activity, UPDATE
  account_activity]` — `DELETE FROM account_activity` is missing, so
  hard-deleting a person's identity history from a worker passes.

**Fix.** Swap `workerSources()` for `serverSources()` (one identifier — the
module is already imported in this file), add the missing DELETE pattern, and
move the exemption to a path the walk reaches. Then sabotage-prove it: add
`UPDATE activity SET description = ''` to `shared/workers/activity.ts`, watch the
build go red naming that file, restore **from a copy, never `git checkout`**.

### 9 · LOW — `before_after` is still written by three modules and read by nothing
`shared/workers/activity.ts:211` · `workers/tenancy/src/team-schema.ts:341`

Unchanged. `before_after` appears in the whole repository in: the migration, two
comments, the INSERT, and RULES.md/DATA-MODEL.md. Zero readers. The feed SELECT
gained `origin` and `verb` this round and correctly did not gain this one (it is
unbounded JSON, and it carries prior field *values* — a `security_sentry`
question before it is a feature).

**Fix.** Expose it on the **record-scoped** read only, behind that review's
sign-off. See the impact map.

### 10 · LOW — the "NULL not []" comment argues for a distinction the code destroys
`shared/workers/activity.ts:208-211`, test at `activity-seam.test.ts:95-101`

Unchanged, and the test at `:95` now asserts the behaviour while repeating the
reasoning. The comment says NULL is written so a reader can tell "no fields
changed" from "this door does not send diffs yet". The code writes NULL in
**both** cases. Storing `[]` for the first would preserve the distinction.

**Fix.** Correct the comment and the test's justification, not the code.

### 11 · LOW — 21 non-logging write sites are reasoned in code and written down nowhere
`shared/workers/activity.ts:28-39`

The exclusion list is byte-identical to round 1 and is still the reason criterion
2 scores 9/15 rather than 0. It names sessions, login and email codes,
idempotency keys, error rows, AI-usage rows, `learning_progress`,
`mcp_tokens.last_used_at` and the active-team pointer.

It does not name: import sessions and batches (5 sites), agent threads and
messages (4), the import catalog self-heal (2), `db_alerts` (1), operator writes
to `teams` (`recomputeShardCounts`, `migrateTeams` — 2), the team-creation seed
rows in `team-schema.ts` (5), and `mcp_tokens` create/revoke (2 — which *are*
logged, to `account_activity`, and the list should say so).

**Fix.** Six bullets in the list that already exists.

### 12 · LOW — the probe now reads the campaign's own reports
`reviews/*.md`

Not a Brimba defect; a measurement hazard for every future run. The probe
discovered a logger function named `oneMember` in `reviews/scaling.md`, and 15 of
its 26 "retention signal" files are review markdown. Anyone re-running this skill
on this repo must exclude `reviews/` or the numbers will drift with the number of
reports.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1a** Correct the "DURABLE gap marker" comment to say what `traceError` does | `shared/workers/activity.ts:193-198`, `account-activity.ts:65-68` | REWRITES two comments; no behaviour | **none** — comment only. Raises **story_checks_out** (the seam currently contradicts ERROR-HANDLING.md:41) |
| **F1b** Route the activity gap into `error_logs` | `shared/workers/activity.ts` signature + its 28 call sites, or a new env-carrying wrapper | ADDS an optional core-DB handle and one INSERT on the failure path | **lean_mean — real.** Threading a parameter through 28 sites is exactly the "too much code is a defect" shape. Prefer a wrapper over a parameter. **architecture** — `logActivity` currently knows only the team door; giving it the core DB couples the log seam to the core database. **spend/speed** — failure path only, should be never. **error_log_review — helps** |
| **F2** Log account creation; **fix** the two sign-in comments rather than log sign-ins | `workers/auth/src/lib/users.ts:62`, `shared/workers/activity.ts:33`, `shared/workers/retention.ts:75` | ADDS one row per person ever; REMOVES two false claims | **scaling / spend — this is the tension to get right.** A row per SIGN-IN would put one row per session into the shared core DB, which SCALING.md §3 names as the first shared thing to reach 10 GB. Account creation is one row per person for ever and is free. Fixing the comments costs nothing and raises **story_checks_out** |
| **F3** `verb: "status"` on the bulk help row | `workers/content/src/lib/help.ts:428` | ADDS one property | **none** — same INSERT, same row width; it makes `idx_activity_verb` cover the bulk case it currently misses |
| **F4** Log the invite acceptance on the invite's own feed | `workers/tenancy/src/lib/teams.ts:88-95` | ADDS one row per invite acceptance | **spend / scaling — negligible.** An invite is accepted exactly once in its life. **security** — `invite_logs` already resolves through `ACTIVITY_GATE_MAP` to `team_members`, so R18 is unaffected |
| **F5** Delete `api` from the origin union and from the three documents | `shared/workers/activity.ts:91,98`, `RULES.md:43`, `DATA-MODEL.md:262`, `ARCHITECTURE.md:352` | REMOVES one enum value and three doc claims | **story_checks_out — helps**, provided all four move in ONE commit. **lean_mean — helps** (less surface). **security — neutral**: `originFrom` validates against `ORIGINS`, so shrinking the set can only narrow what a header may become |
| **F6** `origin: "import"` on the two import SUMMARY rows | `workers/data-ops/src/lib/import.ts:533`, `import-batch.ts:296` | ADDS one property each | **none** — the rows are already written; only their provenance value changes |
| **F7** Show `origin`/`verb` in the Activity tab | **`@swift-struck/ui` `ActivityFeed`** first, then `web/components/*-detail.tsx` mappings | ADDS two optional item fields in the library + 2 lines per detail screen | **This is a LIBRARY change, not a host change** — UI-CONVENTIONS forbids forking a primitive into `web/`. Raise it; do not write it here. **round_trip / speed — none** (the payload already crosses the wire). **security_sentry — check first**: showing `origin` on a cross-module team feed reveals that the assistant touched a record in a module the viewer may read — probably fine, but it is a disclosure decision |
| **F8** Widen the R25 append-only check to `serverSources()`, add `DELETE FROM account_activity`, move the dead exemption | `web/test/rules.test.ts:996-1004` | CHANGES one identifier, ADDS one pattern | **lean_mean — trivially positive** (`serverSources` is already imported in this file; this removes a bespoke corpus rather than adding one). Must be sabotage-proven, restoring **from a copy, never `git checkout`** |
| **F9** Expose `before_after` on the **record-scoped** read only | `workers/tenancy/src/lib/activity-read.ts` (a `scope === "record"` branch), `shared/types.ts` | ADDS an unbounded JSON column to ONE query shape | **security_sentry — flag first.** `before_after` carries old and new field VALUES; today the log shows a sentence. **speed / spend / scaling** — unbounded payload per row; contain it to `scope=record` so the team feed and its COUNT are untouched. **scaling** has already flagged (`reviews/scaling.md:517`) that 250 rows × 800-byte diffs exceeds a response limit — page size interacts with this |
| **F10** Name the 21 undocumented exclusions in the existing list | `shared/workers/activity.ts:28-39` (comment only) | ADDS 6 bullets | **none** — a comment. Raises **story_checks_out** and lifts criterion 2's second row and criterion 10's fourth |
| **F11** Add a rows-per-record-per-month estimate for `activity` | `SCALING.md` §4 | ADDS one paragraph of arithmetic | **none — documentation only.** Raises **scaling_review**, which needs that number for its own headroom ladder |
| **F12** Correct the "NULL not `[]`" comment and the test's justification | `shared/workers/activity.ts:208`, `activity-seam.test.ts:95` | REWRITES a comment; no behaviour change | **none — no code path moves** |
| **F13** Delete the tautological verb test now that the real one exists | `workers/content/test/activity-seam.test.ts:155-160` | REMOVES 6 lines that cannot fail | **none.** Raises **lean_mean**. Keep the real check at `:162` |
| **F14 (verification, not a fix)** Confirm team migration 0008 is applied in both environments | none — a one-off command | Reads `_migrations` per team DB | **none.** `POST /api/tenancy/admin/migrate-teams` with `x-admin-key` is idempotent and self-diffing. **STILL UNMEASURED, and it matters more now**: `origin` and `verb` are load-bearing for two criteria, and on a team database without 0008 the INSERT names three columns that do not exist, the whole statement fails, and `logActivity` swallows it — so that team's activity log stops **completely**, visible only as a console line that expires in a week (finding 1) |

---

## CEILING

**Round 1 said 95.05 with zero margin. That still holds — same two caps, same
knife-edge, same arithmetic.** Nothing this round changed either cap, and nothing
I found this round adds a third.

**Criterion 1 is capped at 60 by a locked decision a commit cannot change.** Row
1 awards 40 points for *one* central table carrying the trail for the whole app.
Brimba has two — `activity` per team, `account_activity` global — and the split is
forced by ARCHITECTURE's per-team-D1 model: identity events happen before a
person belongs to any team, so there is no team database to write them to.
Merging them would cross the tenancy boundary and is a Tier 3 recommendation the
rubric itself tells reviewers not to make. **Cost: 40 × 9 ÷ 100 = 3.6 points, for
ever. True maximum: 96.4.**

**Criterion 7 is capped near 85 by a platform reality.** The −15 for "the log
write sits outside the transaction that commits the data change" is D1 over the
REST door: `d1Query` is one parameterised statement and there is no
cross-statement transaction. Not *absolutely* fixed — `d1ExecScript` accepts a
multi-statement script — but D1's REST contract does not guarantee atomicity
across statements in a script, and core-DB writes go through the native binding
regardless.

Finding 1 does **not** lower this ceiling: the console-only gap marker is a
−7 that a commit can remove (F1b), unlike the −15.

```
60×9 + 100×17 + 100×13 + 100×12 + 100×11 + 100×10 + 85×9 + 100×7 + 100×7 + 100×5
= 540 + 1700 + 1300 + 1200 + 1100 + 1000 + 765 + 700 + 700 + 500
= 9505  →  95.05  →  95
```

**So: still exactly 95, still zero margin.** What changed is how *plausible* that
95 now is. In round 1 the gate criterion needed three separate things to reach
100 (a logged reply, a logged account creation, and a complete exclusion list),
and one of them — instrumenting a whole table — was the largest single fix in the
report. That one has landed. The remaining two (F2 and F10) are one INSERT and
six comment bullets. **The hardest part of the ceiling is now behind it, and the
easiest part is what remains.**

The only headroom above 95 is criterion 7: if team-DB log writes are folded into
the same `d1ExecScript` script as the data write and that is judged to lower the
−15 to −7, the ceiling rises to
`60×9 + 900 + 93×9 + … = 9577 → 95.77 → 96`. That is the entire margin available,
and it depends on a judgement about D1's script semantics that this repo cannot
settle from source.

**One criterion still cannot be verified from this repository at all.** Whether
team migration 0008 is applied in staging and production is **unmeasured** — it
needs live `wrangler d1 execute` access I do not have in a read-only campaign
run. Criteria 5 and 6 both rest on columns whose existence in the live databases
nobody in this campaign has checked, and this round made criterion 5's dependence
on them heavier, not lighter.

---

**The verdict, in one sentence:** the assistant can no longer change a customer's
support ticket without leaving a footprint, and the nightly job no longer signs
its work as a person — what remains unrecorded is a person's own account coming
into existence, and what remains unreadable is everything the log now correctly
writes down.
