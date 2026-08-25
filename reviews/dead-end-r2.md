# Dead end review — round 2 — Brimba · 2026-08-25
SCORE: **50/100** (capped by the criterion-1 gate; uncapped **61**)   (round 1: 50/100, uncapped 61)

One question: **what did we build that nobody can actually reach?**

---

## DELTA

**Round 1: 50/100 → Round 2: 50/100.** Uncapped 60.8 → 60.6. The headline did not
move, and the reason is the whole story: **both critical unreachable write doors
are untouched, so criterion 1 is still 30, so the gate is still closed.** Two
criteria rose, one fell, one fell for a reason that is my own round-1 error and
not anybody's repair.

| Criterion | R1 | R2 | Why it moved |
|---|---|---|---|
| 1 · Every endpoint has a way in (GATE) | 30 | **30** | unchanged. 99 declared routes, same set — no route added or removed. Both criticals confirmed still live (§below) |
| 2 · Every permission switch is enforced | 42.5 | **43.75** | **UP.** `postScreen` now gates `screens:edit`, so one dead cell became live. 22/32 → **23/32** enforced |
| 3 · Every field a person should fill is fillable | 35 | **43** | **UP.** The learning edit no longer wipes `sequence`/`required`, and both now appear in the activity diff. Severity high → medium: the silent-wipe half is gone, the no-form-field half is not |
| 4 · Every write has a reader | 53 | **43** | **DOWN — and NOT because of a repair.** I missed `activity.origin`, `activity.verb` and `activity.before_after` in round 1. Measured like-for-like the activity repair *raised* this criterion from a true 35 to 43. Full accounting below |
| 5 · Nothing is set once and stuck | 90 | **90** | unchanged. `selectable_data.type` still has no editor |
| 6 · Every screen is reachable | 90 | **90** | unchanged. `AgentView` still unmounted; `recordPath`'s teamless fallback still invisible to R20's check |
| 7 · Every capability has an owning surface | 78.7 | **78.7** | unchanged. 58/60 write doors have a surface; 11/13 API-only decisions are honestly stated |
| 8 · Nothing waits behind a flag nobody flips | 90 | **90** | unchanged. No new flag or config var; `INTERNAL_KEY` on the gateway pre-dates the crash-recording change |
| 9 · Errors and edge states surface somewhere | 85 | **85** | number unchanged, **basis corrected**. Round 1 credited a mounted root `ErrorBoundary` that was imported and never rendered. It is now genuinely rendered (`web/app/layout.tsx:79`). My R1 85 was overstated; R2's 85 is true |
| 10 · What is deliberately unreachable is written down | 73 | **70** | **DOWN — caused by two repairs.** The security fix moved `postScreen`'s gate and left the route manifest stating the old one; the MCP.md correction added a row asserting a UI ownership that does not exist. Finding 4 below |

**The criterion that fell for a real reason is 10, and it fell by 3.** Criterion 4's
fall is mine to own, not the activity-log review's.

---

## Probe integrity — round 2

The skill's collector (`~/.claude/skills/dead_end_review/assets/probe.mjs`) was re-run
to `de-probe-deadend.json` (prefixed, per the round-2 brief — round 1's `probe.json`
came back containing another agent's output). Its raw numbers are **again** unusable
and for the same four reasons, all re-confirmed:

- `shownButUnenforced: 1` — still a 9× under-count. The roles screen does not spell
  `"module"…"right"` pairs; it renders `TEAM_MODULE_CATALOG` (8) against the library's
  hard-coded four-column `RIGHTS`
  (`node_modules/@swift-struck/ui/registry/collections/permission-matrix/logic.ts:57`).
  **All 32 cells are live toggles.**
- 30 "unreachable" endpoints — the reference regex still requires a closing quote
  straight after the path, so every query-string caller reads as dead.
- 13 orphan screens — 12 are Next.js page exports.
- 33 unfillable / 43 write-only / 9 one-way columns — the SQL windows still truncate.

Everything below was re-derived by reading source off disk. Three scripts, all
`de-`-prefixed in the scratchpad: `de-perms.mjs` (every literal and variable-driven
gate pair), `de-reach.mjs` (99 declared routes against every literal reference in
every non-index source and markdown file), `de-probe-deadend.json` (the raw probe).

---

## Arithmetic

```
DEFECT criteria    = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's table
total              = round( Σ (criterion × weight) / 100 )
GATE               = criterion 1 below 40 caps the total at 50
```

| # | criterion | method | score | weight | weighted | counted basis |
|---|---|---|---|---|---|---|
| 1 | Every endpoint has a way in | defect | **30** | 16 | 480 | 99 declared routes; 2 critical + 1 medium + 1 minor |
| 2 | Every permission switch is enforced | coverage | **43.75** | 14 | 612.5 | 23/32 enforced; 9/9 dead switches shown in the UI |
| 3 | Every field a person should fill is fillable | defect | **43** | 12 | 516 | 1 critical + 3 medium + 2 minor |
| 4 | Every write has a reader | defect | **43** | 12 | 516 | 2 high + 3 medium + 2 minor |
| 5 | Nothing is set once and stuck | defect | **90** | 11 | 990 | 1 medium + 1 minor |
| 6 | Every screen is reachable | defect | **90** | 11 | 990 | 1 medium + 1 minor |
| 7 | Every capability has an owning surface | coverage | **78.7** | 8 | 629.6 | 38.7 + 25 + 15 |
| 8 | Nothing waits behind a flag nobody flips | coverage | **90** | 6 | 540 | 0 flags; 6/6 config vars live + documented |
| 9 | Errors and edge states surface somewhere | coverage | **85** | 6 | 510 | 35/40 + 30/30 + 20/30 |
| 10 | What is deliberately unreachable is written down | coverage | **70** | 4 | 280 | 42/50 + 8/30 + 20/20 |
| | | | | **100** | **6064.1** | |

**Uncapped total = 6064.1 / 100 = 60.6 → 61.**
**Criterion 1 = 30, below 40 → the gate applies → SCORE 50.**

### Criterion 1 — 99 declared routes, recounted

Declared route count is authoritative, not regex-guessed: 78 from the `ROUTES` tables
(tenancy 36 + content 19 + data-ops 23), 13 `switch` cases in `workers/auth/src/index.ts`,
5 in `workers/mcp/src/index.ts`, 3 `if` blocks in `workers/realtime/src/index.ts`.
**Identical to round 1 — the six repair commits added no route and removed none.**

| severity | count | penalty | what |
|---|---|---|---|
| critical | 2 | 60 | `POST /api/tenancy/config/screens`, `POST /api/tenancy/selectable/bulk-active` — write doors no surface can call |
| high | 0 | 0 | every read door powering a screen is consumed |
| medium | 1 | 7 | the three R24 bulk twins: the app's own screens can reach none of them (still no multi-select anywhere) |
| minor | 1 | 3 | the operator console cluster (`admin/errors`, `admin/db-sizes`) — documented curl, no screen |

`100 − 60 − 7 − 3 = 30`. The gate fires for the second round running.

*Robustness:* drop the bulk medium entirely and criterion 1 is 37 — still under 40,
gate still fires. The cap does not hinge on a judgment call. It hinges on the two
criticals, and **both were re-verified this round.**

### Criterion 2 — the grid, cell by cell, recounted

`TEAM_MODULES` (8) × `MODULE_RIGHTS` (4) = 32 (`shared/team-modules.ts:8,38`).
Enforced = a literal `requireRight`/`gated`/`gatedBody` pair anywhere in worker source.
`de-perms.mjs` finds **23** distinct literal pairs (round 1: 22). The one new pair is
`screens:edit` at `workers/tenancy/src/routes/config.ts:25`.

The variable-driven gates still reach no dead cell: `ACTIVITY_GATE_MAP`
(`shared/rules/registry.ts:212`) maps only help, learning, selectable_data,
member_roles, users, invite_logs and team_members; the import targets
(`workers/data-ops/src/lib/targets.ts:99,114,144`) declare only selectable_data,
member_roles and learning, all on `create`, all already enforced literally.

**23 of 32 enforced. The 9 dead cells, each still rendered as a live toggle:**

| module | dead rights | what the switch actually does |
|---|---|---|
| `teams` | read, create, delete | `read` hides the Overview **tab** client-side (`web/components/team-section-nav.tsx:34`) while `getTeamMetaFeed` stays any-member; `create` cannot bind — `createNamedTeam` is identity-gated because a teamless person must be able to make a first team; `delete` has no door because teams are never deleted |
| `screens` | read, create, delete | `edit` was fixed this round. `getScreens` is still any-member; create and delete have no door |
| `help` | delete | no deactivate/delete door exists for tickets |
| `agent` | edit, delete | the agent has read + create only |

| block | points | earned | why |
|---|---|---|---|
| every offered switch is enforced | 40 | **28.75** | 23/32 × 40 |
| none is shown-but-unenforced | 25 | **0** | 9 exist — all-or-nothing by the rubric |
| unoffered switches recorded as planned | 20 | **0** | no document lists any of the 9. `RULES.md` and `shared/rules/registry.ts` were both edited this round and neither gained an entry |
| one shared check used everywhere | 15 | **15** | `requireRight` via `shared/workers/gating.ts` + `route.ts`, machine-checked by R10's per-worker `gating-seam` — **and auth gained its first `gating-seam` suite this round** (`workers/auth/test/gating-seam.test.ts`) |
| | | **43.75** | |

### Criterion 3 — the counted basis, and the one severity that moved

R1 penalties: 1 critical + 1 high + 2 medium + 2 minor = 65 → 35.
R2 penalties: 1 critical + **3** medium + 2 minor = 57 → **43**.

The single change is `learning.sequence` / `learning.is_required` moving **high → medium**.
`updateLearning` (`workers/content/src/lib/learning.ts:352`) now reads
`input.sequence == null ? before.sequence : …` and
`input.required == null ? before.is_required : …`, and both appear in the diff at
lines 363–374. **The silent data loss is genuinely gone.** What is not gone: neither
field exists on `LearningFormDialog`, so a person still cannot mark an article
required through a form — only by asking the assistant
(`shared/workers/tool-catalog.ts:313`). Under the rubric's table that is still
literally "a user-facing column with no form field anywhere" = high; I have scored it
**medium** because a person can in fact set it, through one surface. *Stated openly so
it can be recomputed: scored high instead, criterion 3 is 35 and the uncapped total
stays 61 — the headline is 50 either way.*

### Criterion 4 — the fall, and who owns it

R1 published 53 on this basis: 2 high + 2 medium + 1 minor = 47.
Re-verified this round, item by item, all five **stand unchanged**:

- **high** — `editor_id`, `editor_email`, `deactivator_id`, `deactivator_email` across
  `member_roles`, `selectable_data`, `learning`, `help`, `screens` and
  `importable_databases`. Written on every edit and deactivate. `grep` for any
  `SELECT` naming them returns **zero rows**. Only the `*_name` twin is read.
- **high** — `email_change_logs`, a whole table with an index built for querying it and
  no reader anywhere (`workers/auth/src/lib/email-change.ts:131` is its only mention
  outside the migration).
- **medium** — `help.screen_recording_link`: on both help tool schemas, written by both
  doors, mapped into the API response (`help.ts:48`), rendered in `web/` **nowhere**
  (the only occurrence in the whole workspace is `web/test/shape.test.ts:92`).
- **medium** — `agent_credits.lifetime_granted`, whose own schema comment says
  "for admin view" (`db/core/0010_agent_credits.sql:10`). There is no admin view.
- **minor** — `invite_logs` captures 11 columns; `getInviteAudit` reads 7
  (`workers/tenancy/src/lib/invites.ts:98-101`).

**Two items I missed in round 1 and am adding now:**

- **medium (7)** — `activity.origin` and `activity.verb`. Migration 0008 added them
  and, until this round, nothing read them. The activity-log repair made
  `getActivity` SELECT them (`workers/tenancy/src/lib/activity-read.ts:104`) and put
  them on `ActivityItem` (`shared/types.ts:163,166`). **No screen renders either.**
  Every record-detail feed maps exactly four fields —
  `web/components/learning-detail.tsx:168-173` is `{id, description, actor, timestamp}`,
  and `help-detail.tsx` and `role-detail.tsx` are identical. So the columns are now
  read from D1, serialised, shipped to the browser on every activity load, and dropped
  at the client boundary. That is a real improvement on "never read at all" and it is
  not yet "a person can see which door the change came through".
- **minor (3)** — `activity.before_after`, written on every diffed change and read by
  nothing at all. Scored minor rather than high because it is a deliberate
  machine-readable duplicate of information the `description` sentence already
  surfaces, and the schema comment says so (`workers/tenancy/src/team-schema.ts:334`).

R2 penalties: 2 high + 3 medium + 2 minor = 30 + 21 + 6 = 57 → **43**.

**The honest accounting, because this is exactly the question round 2 exists to ask.**
Criterion 4 falling from 53 to 43 is **not** a repair breaking my criterion. Measured
like-for-like — both rounds with today's knowledge — the activity repair *raised* it:

| | origin/verb | before_after | other five | penalty | criterion 4 |
|---|---|---|---|---|---|
| R1 as published | not counted (my miss) | not counted (my miss) | 47 | 47 | 53 |
| R1 measured honestly | **high 15** (written, never read) | minor 3 | 47 | 65 | **35** |
| R2 | **medium 7** (read, never shown) | minor 3 | 47 | 57 | **43** |

So: **+8 on a like-for-like basis.** The published figure fell because round 1 was
wrong, and the campaign is worth more with that said than with it smoothed over.

### Criterion 10 — the fall, and which repairs caused it

| block | points | earned | why |
|---|---|---|---|
| internal-only endpoints marked as such | 50 | **42** | 18/18 internal + operator doors named in code and in ARCHITECTURE.md's route table or OPERATIONS.md, with the call path. **−5** for `workers/tenancy/src/index.ts:32` and **−3** for `MCP.md:260` — both below |
| planned-but-unbuilt capabilities listed somewhere | 30 | **8** | unchanged. `AGENT-MODULES-PLAN.md:112` declares the deferred agent recipe views and `UI-GAPS.md` is a real gap list, but the 9 dead switches, `selectable/bulk-active` and the four awaiting-a-feature columns are recorded nowhere |
| the list is current | 20 | **20** | unchanged. `UI-GAPS.md`'s shipped entries are struck through with dates; nothing on it has silently shipped |

R1 earned 45 on the first block (−5 for one false claim). R2 earns 42, because the
one false claim became two-and-a-half.

---

## Findings

### 1 · CRITICAL — the runtime screen-override subsystem still has no way to author one · **STANDS**
`workers/tenancy/src/routes/config.ts:19` · `web/lib/api.ts:426` · `workers/tenancy/src/index.ts:32`

Re-verified this round by exhaustive grep across `web/`, `workers/`, `shared/`,
`scripts/` and every markdown file. `config/screens` appears **21 times**. Every one
is definitional: the route table, the handler, the lib function, a unit test, the
client wrapper `tenancy.setScreenOverride` — and six documents describing it.
**`setScreenOverride` has no caller.** Not a component, not an agent tool, not an MCP
tool, not a script. Every team's `screens` table is permanently empty and
`web/lib/use-screen-data.ts:34` merges nothing on every screen load, forever.

**What it is worth, concretely.** It is one of the two criticals holding criterion 1
at 30. Close it alone and criterion 1 becomes `100 − 30 − 7 − 3 = 60`, the gate lifts,
and the total goes from **50 to 65** — the single largest score movement available in
this report, and by a distance. (Criterion 7's 40-block also improves 58/60 → 59/60.)

**Round 2 makes it slightly worse, not better.** Two documents now describe a
non-existent surface:

- `workers/tenancy/src/index.ts:32` still reads
  `POST /api/tenancy/config/screens -> set a screen override (teams:edit; agent-callable)`.
  The gate moved to `screens:edit` in commit `3cd3e14` and this line did not. It now
  states the wrong right **and** the agent-callability that has never existed.
- `MCP.md:260` gained a new exclusion row: ``| `config/screens` | changes what every
  member of the team SEES. A UI decision, not a data one. |``. It is not a UI decision,
  because there is no UI. The new machine check
  (`workers/mcp/test/catalog.test.ts:112-138`) verifies one direction only — that no
  row names a path a live tool forwards to. It cannot see that a row's *reason* is
  false, which is the same shape of fault the check was written to catch.

**The fix (Tier 2 — product call):** add the authoring surface (an agent tool
forwarding to the door is the smallest shape), **or** decide against it, correct both
comments, and record the deferral beside the temporary-view entry in
`AGENT-MODULES-PLAN.md`. **Do not delete it** — that is a product decision.

### 2 · CRITICAL — nine permission switches are shown to administrators and enforce nothing · **STANDS (was ten)**
`shared/team-modules.ts:8` · `web/components/role-detail.tsx:152` · `node_modules/@swift-struck/ui/.../permission-matrix/logic.ts:57`

One of the ten was closed this round, and it was the sharpest one:
`postScreen` now gates `screens:edit` (`workers/tenancy/src/routes/config.ts:25`), so
a role granted *Team · Edit* can no longer rewrite screen recipes. That is a real fix
and it is the reason criterion 2 moved at all.

Nine remain. Every one is still a live, saveable toggle — the matrix renders
`TEAM_MODULE_CATALOG` (8 modules) against the library's fixed four `RIGHTS` columns,
and the library hard-codes them. An administrator turning off *Team · Read*,
*Screens · Read*, *Help · Delete* or *Assistant · Delete* is told the change saved,
and nothing changed.

The remaining sharp one is **`teams.read`, which is half-honoured**: it hides the
Overview tab in the client (`web/components/team-section-nav.tsx:34`) while
`getTeamMetaFeed` remains any-member. It looks enforced, which is worse than looking
dead.

**What it is worth, concretely.** Criterion 2 is 43.75 of a realistic in-repo maximum
of 73.75, weight 14 → **+4.2 points of total score**, and it cannot reach 100 from
this repository at all (see CEILING). Its real cost is not score. A switch shown but
not enforced is a false statement to the person administering the account, and it is
the kind of thing a customer finds during a security review rather than during use.

**The fix, and it is still genuinely constrained:**
- `teams.create` **cannot** be enforced — teamless onboarding is a reviewed R10
  identity-gated write.
- Hiding the other eight needs `PermissionMatrix` to accept a per-module rights list;
  that component lives in `@swift-struck/ui`, which CLAUDE.md forbids editing from
  here. The in-rule move is a **UI-GAPS.md entry** requesting it. There is still none —
  `UI-GAPS.md` was not touched this round.
- The one cheap in-repo option: with `screens:edit` now real, dropping `screens` from
  `TEAM_MODULES` would remove three of the nine — but it would also delete the switch
  that was just made to work, so it is now the wrong move rather than merely a
  schema-adjacent one.
- At minimum: record all nine in `RULES.md` or the registry as known, reviewed,
  unenforced. That converts a lie into a declared gap and earns criterion 2's
  20-point block, which is the only block still available in-repo.

### 3 · CRITICAL — "Raised from" is printed on every support ticket and nothing can fill it · **STANDS**
`workers/content/src/lib/help.ts:237,273` · `web/components/help-detail.tsx:221,326` · `web/lib/use-screen-actions.ts:111`

Re-verified. `help.source_screen` is still rendered as a labelled Overview row
(`{ label: "Raised from" }`) and again in the ticket header (`fromScreen`). The create
door accepts it and `web/lib/api.ts:477` types it. **No surface sends it.**
`use-screen-actions.ts:111` still declares
`async (input: { description: string; helpType?: string })` — no `sourceScreen`. The
tool schema `raise_help_ticket` is still `{description, helpType, screenRecordingLink}`
(`shared/workers/tool-catalog.ts:338`). There is no help import target.

**Notably not fixed alongside its twin.** `updateLearning` was made patch-shaped this
round; `postUpdateHelp` in the same subsystem was not. `help.ts:273` still writes
`source_screen = <input> ?? NULL` and `screen_recording_link = <input> ?? NULL`
unconditionally, and `web/components/help-detail.tsx:134` still sends only
`{id, description, helpType}` — so if a value ever did get in, the first UI edit
erases it. The fix that landed for learning is the exact fix this needs.

### 4 · HIGH — two documents now describe a surface that does not exist, and the new check cannot see it · **NEW · caused by this round's repairs**
`workers/tenancy/src/index.ts:32` (commit `3cd3e14`) · `MCP.md:260` (commit `138c3e4`)

Detailed under finding 1. Filed separately because it is the round-2 answer to
"did somebody else's fix break your criteria?" — **yes, criterion 10, by 3 points.**

Both are one-line edits with no behaviour change, and both are worth doing now rather
than later: a route manifest that states the wrong gate is exactly the artefact the
next reviewer will trust.

**The wider lesson, which belongs to the campaign more than to this review.** The
MCP.md check was written because a doc claimed an exclusion that was false. Its
replacement verifies that no excluded path is exposed — and the very next row added
under it is false in the other direction: it names an owner (the UI) that does not
exist. A check that confirms half of a claim licenses the other half.

### 5 · HIGH — a bulk door reachable by nothing, and a bulk law with no screen · **STANDS**
`workers/tenancy/src/routes/selectable.ts:82` · `shared/workers/bulk-doors.ts:70` · `MCP.md:258`

`de-reach.mjs` re-ran the whole sweep: `POST /api/tenancy/selectable/bulk-active` has
**zero references** outside its own worker index — not the client, not another worker,
not a script, and **zero markdown files**. It is the only route of 99 with that
property. It is fully built: gate, boundary validation, R17 idempotence, one ping per
changed row.

MCP.md's exclusion table was corrected this round and it still does not name this
door, while it does name its two siblings (`learning/bulk-active`,
`help/bulk-status`). So the one bulk twin with no surface at all is also the one with
no written decision — in a table that was just audited.

The wider truth stands: **this app has no multi-select anywhere.**
`shared/workers/bulk-doors.ts` says so twice in passing. The bulk capability the base
is proud of exists only through natural language.

### 6 · HIGH — the identity half of every audit block is written and never read · **STANDS**
6 tables · e.g. `workers/tenancy/src/lib/roles.ts` · `workers/content/src/lib/learning.ts:352`

Re-verified by grep: `editor_id`, `editor_email`, `deactivator_id`,
`deactivator_email` appear only in `CREATE TABLE` statements and in `SET`/`INSERT`
clauses. **No `SELECT` anywhere names one.** Four extra columns per write, six tables,
forever, to answer a question no screen asks.

Frozen-actor snapshots are R25's design and the ids are the recoverable half, so the
answer is probably *keep and document*, not delete. One comment in
`shared/workers/activity.ts` naming them forensic-only closes it.
**Cross-reference: `activity_log_review` scores the same columns for recoverability.**

### 7 · HIGH — a whole table is written and read by nothing · **STANDS**
`workers/auth/src/lib/email-change.ts:131` · `db/core/0005_email_change.sql:21`

`email_change_logs` receives a row on every email change and has an index built for
querying it. Nothing selects from it. Its sibling `account_activity` does have a
reader (`GET /api/auth/activity`), which makes the omission look accidental.

Worth noting for the campaign: **auth was the worker that gained R10 coverage this
round** (`workers/auth/test/gating-seam.test.ts`, ten state-changing doors, none
previously checked). The same file was opened and this table was not noticed, which is
a fair illustration of how invisible a write-only table is.

### 8 · MEDIUM — the assistant can set a field no screen will ever show · **STANDS**
`shared/workers/tool-catalog.ts:338,346` · `workers/content/src/lib/help.ts:48`

`help.screen_recording_link` is on both help tool schemas, written by both doors,
mapped into the API response — and rendered nowhere in `web/`. Reachable to write,
unreachable to read.

### 9 · MEDIUM — which door a change came through is now fetched on every activity load and shown to nobody · **NEW**
`workers/tenancy/src/lib/activity-read.ts:104` · `shared/types.ts:163,166` · `web/components/learning-detail.tsx:168-173`

Detailed under criterion 4. The repair's own comment says *"A column nothing reads is
not an audit trail — it is a cost"* — and it is now read by the server and still shown
to no person. `origin` distinguishes a change made by hand from one made by the
assistant, by MCP, or by the nightly job; `SYSTEM_ACTOR` was given `origin: "job"` in
the same commit so the answer is finally true. All of it stops at the client boundary.

**The fix is small:** carry `origin` and `verb` through the four-field map in the three
record-detail components and the team feed, and render `origin` as a chip where it is
not `"ui"`. The library `ActivityFeed`'s item type would need a slot for it — which
makes this a **UI-GAPS.md** entry, not a host change, under the library-is-lego rule.
Until then it is a per-request wire cost with no reader, which is also a
`round_trip_review` and `spend_review` concern.

### 10 · MEDIUM — a finished screen that is never mounted (`AgentView`) · **STANDS — and I agree it should stay**
`web/components/agent-view.tsx:3-13`

Re-verified: `AgentView` has zero references outside its own file. The round-2 brief
asks whether I agree with the reconciliation that kept it. **I do**, for three
reasons, and with one condition.

Agreed, because: (a) its own header comment is honest — *"until it does, the panel
simply never mounts an AgentView"* — so it is a declared state, not a hidden one;
(b) `AGENT-MODULES-PLAN.md:112` lists *"The agent generating temporary-view recipes —
deferred"*; and (c) this skill's own rubric says it plainly: **"Deleting is a product
decision, not a cleanup — an unreachable capability is sometimes a half-built feature
someone still wants."** Deleting a planned capability on a reviewer's say-so is
exactly the failure mode the tier system exists to prevent. It stays a **medium**, not
a high, precisely because it is declared.

**The condition, and it is not decoration.** `AgentView` and finding 1 are one
subsystem: `config/screens` stores agent-authored recipes and `AgentView` renders
them. Keeping `AgentView` is defensible only while the thing it renders has a route to
existing. If `config/screens` is never given a writer, `AgentView` is not a planned
capability — it is the second half of an abandoned one, and the honest record would
say so. **Decide the two together, in one sitting, and let whichever way it goes be
written down once.** Right now they are declared in two different documents with two
different degrees of honesty.

### 11 · MEDIUM — a dropdown value can never move to another list · **STANDS**
`workers/tenancy/src/lib/selectable.ts:156` · `shared/workers/tool-catalog.ts`

`selectable_data.type` is set at creation and no surface can change it.
`updateSelectable` still takes `value` only — re-read this round after
`oneSelectable` was rewritten in the same file, so the file was open and this was not
changed. Pick the wrong list and the only route is deactivate-and-recreate, which
under deactivate-never-delete leaves the wrong-list row visible forever in the
inactive view. Arguable as structural, which is why it is medium — but if it is
deliberate it deserves the one-line note criterion 5 asks for, and it has none.

### 12 · MINOR — a team-less record path resolves nowhere in a fresh tab · **STANDS**
`web/lib/nav.ts:32`

`recordPath` still falls back to `/${segment}/${id}` when `teamId` is null. For the
R22 segments that means `/roles/<id>` and `/invites/<id>` — neither has a page source
nor a gateway `MODULE_SHELLS` entry, so both 404 on a paste. R20's
`static-destinations` check (`web/test/rules.test.ts:606-655`) was re-read in full
this round: it now carries three real tripwires (`placement`, `NAV`,
`TOP_LEVEL_MODULES`) and I confirmed each would fire — but it walks `NAV` and
`TEAM_SECTIONS` only. It cannot see a path built inside `recordPath`.

### 13 · MINOR — four columns awaiting a feature, with nothing saying so · **STANDS**
`db/core/0008_importable_databases.sql:13,14` · `workers/tenancy/src/team-schema.ts:193,199`

`importable_databases.auto_populate_columns_json`, `reference_dataset_url`,
`data_import_sessions.auto_populate_columns_json` and `extraction_status_code` are
declared and never written or read. The first is a named, unbuilt agent capability;
none is on any planned list.

### 14 · MINOR — two operator states with no screen, now with more writers · **STANDS**
`workers/tenancy/src/lib/sharding.ts` · `shared/workers/error-log.ts:40`

`db_alerts` and `error_logs` are still readable only by an `x-admin-key` curl
documented in OPERATIONS.md. Correctly operator-only and correctly written down.
Noted again because this round **added two writers** — the gateway now records its
crashes through auth's `/internal/log-error` (`workers/gateway/src/index.ts:99`) and
realtime records into `error_logs` directly (`workers/realtime/src/index.ts:130`). The
table is now fed by every worker in the base and read by no screen at all. That is a
correct repair on the error side and it widens this dead end rather than narrowing it.

---

## Clean results worth recording

- **The root error boundary is now genuinely mounted** (`web/app/layout.tsx:79`).
  Round 1 credited a mount that did not exist — the component was imported on 19 June
  and never rendered, and `noUnusedLocals` being off kept the gate green for two
  months. Criterion 9's 85 is true this round and was not last round.
- **Auth has R10 coverage for the first time** — `workers/auth/test/gating-seam.test.ts`,
  ten state-changing doors that no check had ever read.
- **No new dead end was created by six repair commits.** `de-reach.mjs` re-ran the full
  99-route sweep: the route set is byte-identical, and every new symbol added this
  round (`optionalIdList`, `traceError`, `toInvite`, `LEARNING_SELECT`) has a caller.
- **Flags: still nothing waiting behind one.** No boolean feature flags exist. All six
  config vars are read by live code and documented. The gateway's `INTERNAL_KEY` use
  in the new crash path reuses a binding that already existed.
- **One-way values: still almost none.** The base lets you change your name, photo,
  email, team name, team logo, role title, role description, every article field and
  every ticket field.
- **`UI-GAPS.md` is still current** — every shipped item struck through with a date,
  nothing silently shipped.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Add an agent tool forwarding to `POST /api/tenancy/config/screens` (finding 1 — **the single largest score movement available: 50 → 65**) | `shared/workers/tool-catalog.ts` or `workers/data-ops/src/lib/tools.ts`, `workers/data-ops/test/agent-parity.test.ts`, `MCP.md:260` | ADDS one catalogue entry (~10 lines) and a surface for a whole subsystem; REMOVES a false MCP.md row | **security_sentry_review** — safe now that `screens:edit` is real (that was F3 in round 1 and it landed). **interfacelessness_review** improves. **spend_review** — a new agent-callable write draws AI quota when used. **lean_mean** neutral (~10 lines against a subsystem already paid for) |
| **F1-alt** Instead, correct both comments and record the deferral | `workers/tenancy/src/index.ts:32`, `MCP.md:260`, `AGENT-MODULES-PLAN.md` | REMOVES two false claims, ADDS a declared gap. No behaviour change. Lifts criterion 10 back to 73, does **not** lift the gate | **story_checks_out_review** improves. None else — comment-only |
| **F2** Correct `workers/tenancy/src/index.ts:32` to say `screens:edit` (finding 4) | one comment line | REMOVES a route manifest that states the wrong gate | none — comment-only, and it is the cheapest correct thing in this report |
| **F3** Add `bulk_set_dropdown_active` to the agent catalogue, or name it in MCP.md's exclusion table (finding 5) | `shared/workers/tool-catalog.ts` or `MCP.md` | ADDS ~10 lines, or one table row | **interfacelessness_review** improves. **security_sentry_review** — a new mass-write path; neutral if the siblings' `confirm: true` pattern is copied. If instead it is only *documented*, criterion 1's critical becomes a minor and the gate lifts on that half too |
| **F4** Record the 9 unenforced switches as a reviewed, declared gap | `RULES.md`, `shared/rules/registry.ts` | ADDS a data list + its reason; no behaviour change. Earns criterion 2's 20-block — **the only block still available in-repo** | **lean_mean_review** — a few more lines of registry data. **story_checks_out_review** improves. Does **not** close the 25-block (a declared lie is still shown) |
| **F5** UI-GAPS entry: `PermissionMatrix` needs a per-module rights list (finding 2) | `UI-GAPS.md` only | ADDS one table row. Changes no code here | **none** — a row in the file whose purpose is exactly this. Note `first_run_review` needs a UI-GAPS row too (`emptyAction`); file both together |
| **F6** Make `postUpdateHelp` patch-shaped, as `updateLearning` now is (finding 3) | `workers/content/src/lib/help.ts:273`, its tests | REMOVES silent data loss on every UI help edit; ADDS ~4 lines matching a pattern that already landed next door | **round_trip_review / speed_review** neutral (same one statement). **R23 safe.** **lean_mean** slightly negative (+4 lines, +1 test) |
| **F7** Pass the current screen into `createHelp`, or drop the "Raised from" row (finding 3) | `web/lib/use-screen-actions.ts:111`, `web/components/help-detail.tsx:221` | ADDS one argument, or REMOVES one Overview row | **story_checks_out_review** — DATA-MODEL.md documents `source_screen`; dropping the row means updating it |
| **F8** Add Required + Order fields to `LearningFormDialog` (criterion 3's remaining medium) | `web/components/learning-form-dialog.tsx` | ADDS two fields (~25 lines) | **lean_mean_review** costs ~25 lines. **R4/R7 safe.** **first_run_review** improves slightly |
| **F9** Carry `origin`/`verb` to a rendered chip (finding 9) | `UI-GAPS.md` (library `ActivityFeed` item slot), then the three record-detail maps | ADDS a chip; REMOVES a per-request payload with no reader | **lean_mean** small. **round_trip_review / spend_review** improve only if it is rendered — today the bytes are already on the wire. **activity_log_review** improves directly. **Cannot be done host-side** without forking the library |
| **F10** Read `email_change_logs` into account activity, **or** document it as retention-only (finding 7) | `workers/auth/src/index.ts` + web, **or** one schema comment | ADDS one read + rows on a screen, or ADDS a comment | **speed_review / spend_review** — one more read per account-activity load. **scaling_review** — the list must stay bounded (R14). The comment-only variant is free |
| **F11** Comment the forensic-only audit id/email columns (finding 6) | `shared/workers/activity.ts`, `DATA-MODEL.md` | ADDS a note naming them recoverable-identity, never displayed | **activity_log_review** improves. **lean_mean** neutral |
| **F12** Comment `selectable_data.type` as fixed at creation (finding 11) | `workers/tenancy/src/lib/selectable.ts:156` | ADDS one comment | none — comment-only. Making it *editable* instead is Tier 2 and needs a per-list uniqueness re-check, which touches **CONCURRENCY.md** |
| **F13** Extend R20's check to `recordPath`'s teamless fallback (finding 12) | `web/test/rules.test.ts:606` | ADDS ~8 assertion lines | **lean_mean_review** — more test code lowers its ratio; **architecture_review** improves |
| **F14** Note the four awaiting-a-feature columns in ROADMAP.md (finding 13) | `ROADMAP.md`, two schema files | ADDS four one-line notes | none — documentation-only |

**Campaign-level tension, restated for round 2.** The cheapest path from 50 to 65 is a
single ~10-line agent-tool entry (F1). Everything else in this report that moves the
score is either a comment (F2, F4, F11, F12, F14 — perhaps sixty lines in total,
closing six findings, costing `lean_mean` almost nothing) or blocked outside this
repository (F5, F9 — both need `@swift-struck/ui`). The expensive items — a
multi-select UI, the screen-authoring surface — remain product decisions, not
cleanups.

**One tension specific to this round:** F9 and `first_run_review`'s empty-state fix
both need a library change and both are currently unrecorded in `UI-GAPS.md`. Filing
one row and not the other repeats exactly the pattern criterion 10 penalises.

---

## CEILING

**95 is reachable by changing code, but only just — the true maximum is 96.3 — and it
is unchanged from round 1.** One criterion is capped by something outside this
repository.

- **Criterion 2's 25-point block cannot be earned by a commit here.** It scores zero
  while any switch is shown-but-unenforced. Hiding a cell requires `PermissionMatrix`
  to accept a per-module rights list; that component hard-codes its four `RIGHTS`
  columns (`logic.ts:57`, re-read this round) and lives in `@swift-struck/ui`, which
  CLAUDE.md forbids editing from here.
- **`teams.create` is structurally unenforceable at any price.** A person with no team
  must be able to create one — the reviewed identity-gated write R10 already exempts.
  So the 40-point block tops out at 31/32 → 38.75.
- Criterion 2's realistic in-repo maximum is `38.75 + 0 + 20 + 15 = 73.75`.
  With every other criterion at 100: `(73.75 × 14 + 100 × 86) / 100 = ` **96.3**.
- Nothing else is capped. Criteria 1, 3, 4, 5, 6, 7, 9 and 10 are all reachable by
  ordinary commits; criterion 8 is effectively clean.
- Filing the matrix gap in `UI-GAPS.md` — the base's own documented procedure for
  exactly this situation — and shipping the library fix would lift the ceiling to 100.

**The gate is the practical ceiling, not 96.3.** While either critical write door
stays unreachable, criterion 1 stays at 30 and the score stays at 50 no matter what
else improves. Round 2 demonstrates that empirically: criteria 2 and 3 both rose,
criterion 9's basis became true, six commits landed, and the headline did not move by
a single point.

---

## Verdict

**The most expensive dead end is unchanged: the runtime screen-override system — a
team table, a migration, two doors, a client wrapper, a validator, a merge that runs
on every screen load, a dedicated test, a `screens` row in the permission matrix, and
a finished `AgentView` to render what it produces — and still no surface anywhere that
can write a single override. This round it acquired a second document describing the
UI that owns it, and there is still no UI.**
