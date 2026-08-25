# Dead end review — Brimba · 2026-08-25
SCORE: 50/100 (capped by the criterion-1 gate; uncapped 61)   (previous: never run)

One question: **what did we build that nobody can actually reach?**

---

## Probe integrity — read this before trusting any number below

The skill's collector (`~/.claude/skills/dead_end_review/assets/probe.mjs`) was run and
then **largely overridden**. Its raw output is unusable as a verdict on this repo, for
four separate reasons I confirmed by opening the code:

1. **Shared scratchpad collision.** All 16 campaign agents share one scratchpad
   directory. My first `probe.json` came back containing the *realtime* review's output.
   Re-run under a private filename. Any agent in this campaign that wrote `probe.json`
   and read it back may have read someone else's probe. Worth telling the other reviews.
2. **The endpoint scan misses every query-string caller.** Its reference regex requires a
   closing quote straight after the path, so `` `/api/tenancy/activity?scope=${s}` ``
   matches nothing. Six of its 30 "unreachable" endpoints are reachable from
   `web/lib/api.ts` and were false positives.
3. **The SQL windows truncate.** `insert into[\s\S]{0,700}?;` with a `g` flag skips past
   later statements nested inside an earlier match. It reported `help.help_type`,
   `help.screen_recording_link`, `error_logs.message`, `mcp_tokens.label`,
   `learning.category` and 10 others as never-written; every one is written. It also
   reported `users.google_sub`, a column **deleted by migration `db/core/0003_remove_google.sql`**.
4. **`shownButUnenforced: 1` is a 10× under-count.** The probe looks for a literal
   `"module"…"right"` pair in client source. The roles screen doesn't spell pairs — it
   renders `TEAM_MODULE_CATALOG` × a fixed four-column `RIGHTS` list from the library
   (`node_modules/@swift-struck/ui/registry/collections/permission-matrix/logic.ts:57`).
   **All 32 cells are rendered as live toggles. All 10 dead switches are shown.**

Every finding below was re-derived by reading source off disk and confirmed by opening
the file. Two independent scripts are in the scratchpad
(`deadend-agent/reach.mjs` — routes vs. literal callers with query strings stripped;
`deadend-agent/perms.mjs` — every `requireRight`/`gated`/`gatedBody` pair, multi-line
call sites included).

---

## Arithmetic

```
DEFECT criteria    = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's table
total              = round( Σ (criterion × weight) / 100 )
GATE               = criterion 1 below 40 caps the total at 50
```

| # | criterion | method | score | weight | weighted | the counted basis |
|---|---|---|---|---|---|---|
| 1 | Every endpoint has a way in | defect | **30** | 16 | 480 | 99 declared routes; 2 critical + 1 medium + 1 minor confirmed |
| 2 | Every permission switch is enforced | coverage | **42.5** | 14 | 595 | 22/32 enforced; 10/10 dead switches shown in the UI |
| 3 | Every field a person should fill is fillable | defect | **35** | 12 | 420 | 1 critical + 1 high + 2 medium + 2 minor |
| 4 | Every write has a reader | defect | **53** | 12 | 636 | 2 high + 2 medium + 1 minor |
| 5 | Nothing is set once and stuck | defect | **90** | 11 | 990 | 1 medium + 1 minor (7 of 9 probe hits were structural or false) |
| 6 | Every screen is reachable | defect | **90** | 11 | 990 | 1 medium + 1 minor (11 of 13 probe hits are Next.js page exports) |
| 7 | Every capability has an owning surface | coverage | **78.7** | 8 | 630 | 58/60 write doors have a surface; 12/13 API-only decisions stated; 3 split capabilities |
| 8 | Nothing waits behind a flag nobody flips | coverage | **90** | 6 | 540 | 0 boolean flags; 6/6 config vars live and documented; expiry not stated |
| 9 | Errors and edge states surface somewhere | coverage | **85** | 6 | 510 | 35/40 + 30/30 + 20/30 |
| 10 | What is deliberately unreachable is written down | coverage | **73** | 4 | 292 | 45/50 + 8/30 + 20/20 |
| | | | | **100** | **6082.6** | |

**Uncapped total = 6082.6 / 100 = 60.8 → 61**
**Criterion 1 = 30, which is below 40 → the gate applies → SCORE 50.**

### Criterion 1 — 99 declared routes, worked line by line

Declared route count is authoritative, not regex-guessed: 78 from the `ROUTES` tables in
tenancy/content/data-ops, 13 `switch` cases in `workers/auth/src/index.ts`, 5 in
`workers/mcp/src/index.ts`, 3 `if` blocks in `workers/realtime/src/index.ts`.

| severity | count | penalty | what |
|---|---|---|---|
| critical | 2 | 60 | `POST /api/tenancy/config/screens`, `POST /api/tenancy/selectable/bulk-active` — write doors no surface can call |
| high | 0 | 0 | every read door powering a screen is consumed |
| medium | 1 | 7 | the three R24 bulk twins: the app's own screens can reach **none** of them |
| minor | 1 | 3 | the operator console cluster (`admin/errors`, `admin/db-sizes`) — documented curl, no screen |
| no penalty | — | — | 3 `/internal/*`, 6 `/health`, `/publish`, `POST /mcp` (the external MCP door, reached by Bearer token — correct), `GET /api/realtime` (gateway-proxied), 5 further `admin/*` doors, `admin/test-login` — all named in ARCHITECTURE.md §route table + OPERATIONS.md §owner-only |

`100 − 60 − 7 − 3 = 30`.

*Robustness of the gate:* if you disagree that the bulk cluster deserves a medium (MCP.md
does state the agent-only decision for two of the three), criterion 1 becomes **37** —
still under 40, gate still fires. The cap does not hinge on that judgment.

### Criterion 2 — the grid, cell by cell

Grid confirmed: `TEAM_MODULES` (8) × `MODULE_RIGHTS` (4) = 32 (`shared/team-modules.ts:8,38`).
Enforced = a literal `requireRight` / `gated` / `gatedBody` pair anywhere in worker source,
plus the two variable-driven gates (`team.ts:170` via `ACTIVITY_GATE_MAP`,
`import.ts:66-129` via `target.module`) — neither of which reaches any dead cell, because
`ACTIVITY_GATE_MAP` (`shared/rules/registry.ts:212`) maps only to help, learning,
selectable_data, member_roles and team_members, and the import targets declare only
selectable_data, member_roles and learning.

**22 of 32 enforced. The 10 dead cells, each rendered as a live toggle:**

| module | dead rights | what the switch actually does |
|---|---|---|
| `teams` | read, create, delete | `read` hides the Overview **tab** client-side (`web/components/team-section-nav.tsx:34`) while `getTeamMetaFeed` stays any-member (`workers/tenancy/src/routes/team.ts:209`); `create` cannot bind — `createNamedTeam` is identity-gated because a teamless person must be able to make a first team; `delete` has no door because teams are never deleted |
| `screens` | read, create, edit, delete | the whole row. `getScreens` is any-member; `postScreen` gates on **`teams:edit`** (`workers/tenancy/src/routes/config.ts:20`) — deny `screens.edit`, grant `teams.edit`, and the role can still rewrite screen recipes |
| `help` | delete | no deactivate/delete door exists for tickets |
| `agent` | edit, delete | the agent has read + create only |

| block | points | earned | why |
|---|---|---|---|
| every offered switch is enforced | 40 | **27.5** | 22/32 × 40 |
| none is shown-but-unenforced | 25 | **0** | 10 exist — the block is all-or-nothing by the rubric |
| unoffered switches recorded as planned | 20 | **0** | no document lists any of the 10 |
| one shared check used everywhere | 15 | **15** | `requireRight` via `shared/workers/gating.ts` + `route.ts`, machine-checked by R10's per-worker `gating-seam` |
| | | **42.5** | |

### Criterion 7 — the counted basis
- **40-block**: capability unit = write doors (non-GET). 46 in the `ROUTES` tables +
  10 auth + 3 mcp + 1 realtime = **60**. Two have no surface at all → 58/60 × 40 = **38.7**.
- **30-block**: 13 capabilities are API-only by design. 12 carry a written decision;
  `selectable/bulk-active` carries none, and `config/screens` carries a decision that is
  **false** ("agent-callable"). 11/13 → **25**.
- **30-block**: three capabilities are split across half-finished surfaces (below) → **15**.

### Criterion 9 / 10 — the counted basis
- 9: 40-block → 35 (every user-caused failure is voiced: `GuardError` → clean 4xx → `ApiFailure` → toast; the 429 has its own copy at `shared/workers/rate-limit.ts:83`; the 409s at `concurrency.ts:109,112`; `ErrorBoundary` is mounted in `web/app/layout.tsx:9`; `version-watch.tsx` heals a stale shell — minus 5 because the DB-size alarm has no user surface). 30-block → 30 (FormShell + toast, R4). 30-block → 20 (expired/revoked/over-limit all have labels or a dialog; `db_alerts` and `error_logs` have no screen).
- 10: 50-block → 45 (18/18 internal + operator doors named in code and docs; minus 5 for the false "agent-callable" claim). 30-block → 8 (AGENT-MODULES-PLAN.md declares the deferred agent recipe views; UI-GAPS.md is a real, current gap list — but five other gaps found here are recorded nowhere). 20-block → 20 (UI-GAPS.md entries are struck through with ship dates; nothing on it has silently shipped).

---

## Findings

### 1 · CRITICAL — the runtime screen-override subsystem has no way to author one
`workers/tenancy/src/routes/config.ts:19` · `web/lib/api.ts:426` · `workers/tenancy/src/index.ts:32`

A team can override any screen's recipe at runtime, no deploy needed. Everything for it
exists: a `screens` table in the team schema (`team-schema.ts`), a gated + validated +
publishing write door, a read door, a client wrapper `tenancy.setScreenOverride`, an
override-merge that runs on every screen load (`web/lib/use-screen-data.ts:34`), a
structural validator, a dedicated unit test, and a whole `screens` row in the permission
matrix. **Nothing anywhere calls the write door.** Not a component, not an agent tool,
not an MCP tool, not a script. Grep across web + workers + shared + scripts returns
exactly four references to `config/screens`, all definitional.

The source comment at `workers/tenancy/src/index.ts:32` says *"set a screen override
(teams:edit; agent-callable)"*. There is no such agent tool — I checked
`shared/workers/tool-catalog.ts`, `workers/data-ops/src/lib/tools.ts` and
`workers/mcp/src/lib/tools.ts`. Every team's `screens` table is permanently empty and the
merge path always merges nothing.

**Why it matters:** this is the single largest block of paid-for, unreachable capability
in the base, and it is invisible — the read half works perfectly, so nothing errors.
Its companion, `web/components/agent-view.tsx`, is the component built to render
agent-authored recipes, and its own header comment admits *"the panel simply never mounts
an AgentView."*

**The fix (Tier 2 — product call):** either add the authoring surface (an agent tool
forwarding to the door is the smallest shape — the executor pattern already exists in
`tools.ts`), or, if runtime authoring is not wanted yet, correct the comment, record it
in AGENT-MODULES-PLAN.md's deferred list beside the temporary-view entry, and leave the
door in place. **Do not delete it** — that is a product decision, not cleanup.

### 2 · CRITICAL — ten permission switches are shown to administrators and enforce nothing
`shared/team-modules.ts:8` · `workers/tenancy/src/lib/roles.ts:43` · `web/components/role-detail.tsx:152`

The matrix renders `TEAM_MODULE_CATALOG` (all 8 modules) against the library's fixed
four-column `RIGHTS`. Every cell is a live, saveable toggle. Ten of the 32 combinations
are checked by no code path on any surface (table above). An administrator turning off
*Team · Read*, *Screens · Edit*, *Help · Delete* or *Assistant · Delete* is told the
change saved, and nothing changed.

The sharpest one: **`screens.edit` is dead while `postScreen` gates on `teams.edit`**
(`workers/tenancy/src/routes/config.ts:20`). A role denied *Screens · Edit* but granted
*Team · Edit* can still rewrite screen recipes. (It cannot today, because nothing can
call that door at all — finding 1 — but the moment finding 1 is fixed, this becomes a
live authorisation hole. `security_sentry_review` owns the exposure; I own the lie.)

The second sharpest: **`teams.read` is half-honoured.** It hides the Overview tab in the
client (`team-section-nav.tsx:34`) while `getTeamMetaFeed` remains any-member. It looks
enforced, which is worse than looking dead.

**Why it matters:** the rubric calls this the worst finding in the skill, and it is right.
A gap is a missing feature; a switch shown but not enforced is a false statement to the
person administering the account, and it is the kind of thing a customer discovers during
a security review rather than during use.

**The fix — and it is genuinely constrained:**
- `teams.create` **cannot** be enforced. Teamless onboarding is a reviewed R10
  identity-gated write; a person with no team must be able to make one.
- Hiding the other nine cells needs the matrix to accept a per-module rights list.
  `PermissionMatrix` hard-codes `RIGHTS` in the **library**, and CLAUDE.md forbids
  editing the library from this repo. So the honest options are (a) raise it as a
  library gap in UI-GAPS.md, (b) enforce them (a product decision: it changes who can do
  what today), or (c) at minimum, record all ten in RULES.md or the registry as known,
  reviewed, unenforced — turning a lie into a declared gap.
- One is cheap and in-repo today: drop `screens` from `TEAM_MODULES`, which removes four
  of the ten. That is a schema-adjacent change and touches R13/R18 coverage lists.

### 3 · CRITICAL — "Raised from" is printed on every support ticket and nothing can fill it
`workers/content/src/lib/help.ts:237` · `web/components/help-detail.tsx:200,305` · `web/lib/use-screen-actions.ts:113`

`help.source_screen` is rendered as a labelled Overview row (`{ label: "Raised from" }`)
and again in the ticket header (`fromScreen`). The create door accepts it. **No surface
sends it.** The UI's `createHelp` passes `{description, helpType}` only; the tool schema
`raise_help_ticket` is `{description, helpType, screenRecordingLink}` — no `sourceScreen`;
there is no help import target. Every ticket ever raised shows an empty "Raised from".

Worse, `postUpdateHelp` writes `source_screen = <input> ?? NULL` unconditionally
(`help.ts:273`), and `web/components/help-detail.tsx:134` sends only
`{id, description, helpType}` — so if a value ever *did* get in, the first UI edit erases it.

**The fix (Tier 2):** pass the current screen into `createHelp` from
`use-screen-actions.ts` (the router already knows it), or drop the Overview row. Same
call decides `source_related_table` / `source_related_row_id`, which are accepted, never
sent, and never read — the "raise a ticket about this record" feature, unbuilt.

### 4 · HIGH — editing a learning article through the UI silently clears "Required" and its sequence
`workers/content/src/lib/learning.ts:334` · `web/components/learning-detail.tsx:114` · `web/components/learning-form-dialog.tsx:147`

The update SQL is `sequence = ${intOr(input.sequence, 0)}, is_required = ${input.required ? 1 : 0}`.
The form submits `{title, category, contentType, contentLink, body}` — neither field.
The detail screen **displays** the Required badge (`learning-detail.tsx:196`).

So: a person marks an article required (only possible by asking the assistant — the tool
schema `update_learning` does expose `sequence` and `required`,
`shared/workers/tool-catalog.ts:313`), then edits its title in the UI, and the badge
disappears with no message. The CSV import target for learning doesn't carry the columns
either (`workers/data-ops/src/lib/targets.ts:147`).

**The fix (Tier 2):** add the two fields to `LearningFormDialog`, **or** make the update
door patch-shaped (`COALESCE`-style: absent means unchanged) so an omitted field cannot
wipe a value. The second is smaller and fixes the whole family at once — `help`'s
`screen_recording_link` and `source_screen` have the identical shape.

### 5 · HIGH — a bulk door with no surface, and a bulk law with no screen
`workers/tenancy/src/routes/selectable.ts:82` · `shared/workers/bulk-doors.ts:70`

R24 produced three bulk twins. `postBulkSetLearningActive` and `postBulkHelpStatus` (+
`postBulkHelpStatusByFilter`) are agent-only **by a written decision** (MCP.md:156-163 —
no confirm panel on a headless client). `postBulkSetSelectableActive` is reachable by
**nothing**: not the UI, not the agent catalogue, not MCP, not a script, and it appears
in **zero** markdown files in the repo. It is fully built — gate, boundary validation,
R17 idempotence, one ping per changed row — and its own registry note says *"Added
2026-08-12 — it was the one twin genuinely missing."* It was added to satisfy the law.

The wider truth the law surfaced without meaning to: **this app has no multi-select
anywhere.** `bulk-doors.ts` says so twice in passing ("No screen offers a multi-select").
So the bulk capability the base is proud of exists only through natural language.

**The fix (Tier 2/3):** either give the collections a selection mode (large, and it needs
the library's `data-table`) or add `bulk_set_dropdown_active` to the agent catalogue so
the third twin matches its two siblings (small, in-repo, one entry in `tools.ts`). Either
way, record the "no multi-select UI" decision somewhere a reader will find it.

### 6 · HIGH — the identity half of every audit block is written and never read
6 tables · e.g. `workers/tenancy/src/lib/roles.ts:255,310` · `workers/content/src/lib/learning.ts:334,379`

`editor_id`, `editor_email`, `deactivator_id`, `deactivator_email` are written on every
edit and every deactivate across `member_roles`, `selectable_data`, `learning`, `help`,
`screens` and `importable_databases`. **No SELECT anywhere reads any of them.** Only the
`*_name` twin is read and shown. Four extra columns per write, six tables, forever, to
answer a question no screen asks.

The same shape, smaller: `agent_credits.lifetime_granted` is maintained on every grant
and its own schema comment says *"for admin view"* (`db/core/0010_agent_credits.sql:10`)
— there is no admin view. `invite_logs` captures 11 columns and the invite-audit screen
reads 7 (`workers/tenancy/src/lib/invites.ts:95`); `inviter_user_row_id`, `invitee_email`,
`proposed_member_role_id` and `created_on` are never surfaced.

**The fix (Tier 1/3):** frozen-actor snapshots are R25's design and the ids are the
recoverable half — so the answer is probably *keep and document*, not delete. One comment
in `shared/workers/activity.ts` naming them as forensic-only closes it. **Cross-reference:
`activity_log_review` scores the same columns for queryability; reported once, here.**

### 7 · HIGH — a whole table is written and read by nothing
`workers/auth/src/lib/email-change.ts:131` · `db/core/0005_email_change.sql:21`

`email_change_logs` receives a row on every email change (`old_email`, `new_email`,
`user_id`, `created_at`) and has an index built for querying it. Nothing selects from it —
not a route, not a screen, not an admin endpoint, not a script. Its sibling
`account_activity` **does** have a reader (`GET /api/auth/activity`), which makes the
omission look accidental rather than intended.

**The fix (Tier 1 or 2):** add `email_change_logs` to the account-activity read (it is the
same shape and the same screen), or write down that it is retention-only forensics.

### 8 · MEDIUM — the assistant can set a field no screen will ever show
`shared/workers/tool-catalog.ts:338,346` · `workers/content/src/lib/help.ts:237`

`help.screen_recording_link` is on both help tool schemas, is written by both doors, is
mapped into the API response (`help.ts:48`) — and is rendered **nowhere** in `web/`. A
person can ask the assistant to attach a recording link to a ticket and no human will ever
see it. Reachable to write, unreachable to read.

### 9 · MEDIUM — a finished screen that is never mounted
`web/components/agent-view.tsx:27`

`AgentView` renders an agent-conjured temporary recipe through the library
`ScreenRenderer`, with the same structural guard the override store uses. Zero references
outside its own file. Its header comment is honest about it and
`AGENT-MODULES-PLAN.md:112` lists *"The agent generating temporary-view recipes —
deferred"*, which is why this is medium rather than high: it is declared. It is the same
subsystem as finding 1 and should be finished or retired with it.

### 10 · MEDIUM — a dropdown value can never move to another list
`workers/tenancy/src/lib/selectable.ts:147` · `shared/workers/tool-catalog.ts`

`selectable_data.type` is set at creation and no surface can change it: `updateSelectable`
takes `value` only, and the tool schema matches. Pick the wrong list and the only route is
deactivate-and-recreate — which, under deactivate-never-delete, leaves the wrong-list row
visible forever in the inactive view. Arguable as structural (the `type` *is* which list
the row belongs to), which is why it is medium and not high — but if it is deliberate it
deserves the one-line note criterion 5 asks for, and it has none.

### 11 · MINOR — a team-less record path resolves nowhere in a fresh tab
`web/lib/nav.ts:32`

`recordPath` falls back to `/${segment}/${id}` when `teamId` is null. For the R22 segments
that means `/roles/<id>` and `/invites/<id>` — neither has a page source nor a gateway
`MODULE_SHELLS` entry, so both 404 on a paste. R20's `static-destinations` check
(`web/test/rules.test.ts:607`) covers `NAV` paths and sidebar segments; it does not see
this fallback. The check itself is sound — it has real tripwires on `placement`,
`TOP_LEVEL_MODULES` and `MODULE_SHELLS`, all three of which I verified would fire.
Everything the app normally produces (`/t/*`, `/learning/<id>`, `/help/<id>`) resolves.

### 12 · MINOR — four columns awaiting a feature, with nothing saying so
`db/core/0008_importable_databases.sql:13,14` · `workers/tenancy/src/team-schema.ts:193,199`

`importable_databases.auto_populate_columns_json` ("columns the agent may fill itself"),
`importable_databases.reference_dataset_url`, `data_import_sessions.auto_populate_columns_json`
and `data_import_sessions.extraction_status_code` are declared and never written or read
by anything. The first is a named, unbuilt agent capability; none is on any planned list.

### 13 · MINOR — two operator states with no screen
`workers/tenancy/src/lib/sharding.ts:81` · `shared/workers/error-log.ts:40`

`db_alerts` (a team database crossing 80%) and `error_logs` are both written and both
readable only by an `x-admin-key` curl documented in OPERATIONS.md §73-77. Correctly
operator-only and correctly written down — noted because a growth alarm nobody sees is a
state the code can enter with no surface at all.

---

## Clean results worth recording

- **Flags: nothing waiting behind one.** No boolean feature flags exist. All six config
  vars (`AGENT_MODEL`, `AGENT_EFFORT`, `AGENT_FREE_DAILY`, `WORKERS_AI_MODEL`,
  `ENVIRONMENT`, `TEST_LOGIN_KEY`) are read by live code and documented with who sets
  them. `DEV_ECHO_CODES` was removed code-and-config so configuration cannot re-enable it.
- **One-way values: almost none.** Seven of the probe's nine were structural or
  append-only by design; `learning.category` was a truncation artefact. The base lets you
  change your name, photo, email, team name, team logo, role title, role description,
  every article field and every ticket field.
- **Edge states are voiced.** 429, both 409s, the version conflict, expired/revoked
  invites, the credit ceiling and a stale shell all produce something a person sees.
- **Internal doors are declared.** All 18 internal/operator/health routes are named in
  code and in ARCHITECTURE.md's route table or OPERATIONS.md, with the call path.
- **UI-GAPS.md is current** — every shipped item struck through with a date.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Add an agent tool forwarding to `POST /api/tenancy/config/screens` (finishes finding 1) | `shared/workers/tool-catalog.ts` or `workers/data-ops/src/lib/tools.ts`, `workers/data-ops/test/agent-parity.test.ts` | ADDS one catalogue entry (~10 lines) and a surface for a whole subsystem | **security_sentry_review** — it makes finding 2's `screens.edit`/`teams.edit` mismatch *live*; fix F3 first or together. **interfacelessness_review** improves. **lean_mean** neutral. **spend_review** — a new agent-callable write draws AI quota when used |
| **F1-alt** Instead, correct the false "agent-callable" comment and list the deferral | `workers/tenancy/src/index.ts:32`, `AGENT-MODULES-PLAN.md` | REMOVES a false claim, ADDS a declared gap. No behaviour change | **story_checks_out_review** improves (a doc claim becomes true). None else — comment-only |
| **F2** Add `bulk_set_dropdown_active` to the agent catalogue (finding 5) | `shared/workers/tool-catalog.ts` or `workers/data-ops/src/lib/tools.ts`, `MCP.md` | ADDS ~10 lines; the third bulk twin matches its two siblings | **interfacelessness_review** improves. **security_sentry_review** — a new mass-write path; it is confirm-gated like its siblings, so neutral if the `confirm: true` pattern is copied |
| **F3** Gate `postScreen` on `screens.edit` instead of `teams.edit` (finding 2's sharp edge) | `workers/tenancy/src/routes/config.ts:20` | REMOVES an authorisation mismatch; enforces 1 of the 10 dead switches | **CHANGES WHO CAN DO WHAT** — Tier 3, product call. Roles holding `teams.edit` today lose screen authoring. **security_sentry_review** improves |
| **F4** Record the 10 unenforced switches as a reviewed, declared gap | `RULES.md`, `shared/rules/registry.ts` | ADDS a data list + its reason; no behaviour change | **lean_mean_review** — a few more lines of registry data. **story_checks_out_review** improves. Does **not** close criterion 2's 25-point block (a declared lie is still shown) |
| **F5** Make `postUpdateLearning` / `postUpdateHelp` patch-shaped so an omitted field means unchanged (findings 3, 4, 8) | `workers/content/src/lib/learning.ts:334`, `workers/content/src/lib/help.ts:273`, their tests | REMOVES silent data loss on every UI edit; ADDS ~6 lines of COALESCE | **round_trip_review / speed_review** neutral (same one statement). **R23 safe** (still returns the row). **security_sentry_review** neutral. **lean_mean** slightly negative (+6 lines, +2 tests) |
| **F6** Pass the current screen into `createHelp`, or drop the "Raised from" row (finding 3) | `web/lib/use-screen-actions.ts:111`, `web/components/help-detail.tsx:200` | ADDS one argument, or REMOVES one Overview row | **story_checks_out_review** — DATA-MODEL.md documents `source_screen`; dropping the row means updating it. Nothing else |
| **F7** Add Required + Sequence fields to `LearningFormDialog` (finding 4) | `web/components/learning-form-dialog.tsx`, `web/components/learning-detail.tsx` | ADDS two fields (~25 lines) | **lean_mean_review** costs ~25 lines. **R4/R7 safe** (inside FormShell, inside the draft key). **first_run_review** improves |
| **F8** Read `email_change_logs` into the account-activity screen (finding 7) | `workers/auth/src/index.ts`, `workers/auth/src/lib/*`, `web` account activity | ADDS one UNION or a second read + rows on a screen | **speed_review / spend_review** — one more read per account-activity load. **scaling_review** — the account-activity list must stay bounded (R14) |
| **F8-alt** Document `email_change_logs` as retention-only | `db/core/0005_email_change.sql`, `ERROR-HANDLING.md` or `DATA-MODEL.md` | ADDS a comment | none — comment-only |
| **F9** Comment the forensic-only audit id/email columns (finding 6) | `shared/workers/activity.ts`, `DATA-MODEL.md` | ADDS a note naming them as recoverable-identity, never displayed | **activity_log_review** improves (it scores the same columns for recoverability). **lean_mean** neutral |
| **F10** Comment `selectable_data.type` as fixed at creation (finding 10) | `workers/tenancy/src/lib/selectable.ts:147` | ADDS one comment | none — comment-only. (Making it *editable* instead would be Tier 2 and would need a uniqueness re-check per list, which touches **CONCURRENCY.md**) |
| **F11** Extend R20's check to `recordPath`'s team-less fallback (finding 11) | `web/test/rules.test.ts:607` | ADDS ~8 assertion lines | **lean_mean_review** — more test code lowers its ratio; **architecture_review** improves (one more invisible invariant caught) |
| **F12** Note the four awaiting-a-feature columns in ROADMAP.md (finding 12) | `ROADMAP.md`, the two schema files | ADDS four one-line notes | none — documentation-only |

**Campaign-level tension to state plainly:** the two biggest fixes here (F1, F2, F7)
all *add* code, and `lean_mean_review` is scored at 92+ where less code is better. The
cheapest honest reconciliation is that F1-alt, F4, F8-alt, F9, F10 and F12 are almost
entirely comments and registry data — they close six findings for roughly forty lines and
cost `lean_mean` almost nothing. The expensive ones (a multi-select UI, the screen
authoring surface) are product decisions, not cleanups, and should be decided as such.

---

## CEILING

**95 is reachable by changing code, but only just — the true maximum is 96.3 — and one
criterion is capped by something outside this repo.**

- **Criterion 2's 25-point block cannot be earned by a commit in this repository.**
  It scores zero while any switch is shown-but-unenforced. Hiding a cell requires
  `PermissionMatrix` to accept a per-module rights list; that component hard-codes its
  four `RIGHTS` columns and lives in `@swift-struck/ui`, which **CLAUDE.md explicitly
  forbids editing from here** ("the UI library is lego, not this repo"). The in-repo
  alternative is to enforce the ten switches, which is a Tier-3 product decision about
  who can do what.
- **`teams.create` is structurally unenforceable at any price.** A person with no team
  must be able to create one; that is the reviewed identity-gated write R10 already
  exempts. So even the 40-point block tops out at 31/32 → 38.75 unless the switch is
  removed from the matrix, which is the same library constraint.
- Criterion 2's realistic in-repo maximum is therefore `38.75 + 0 + 20 + 15 = 73.75`.
  With every other criterion at 100, the total maximum is
  `(73.75 × 14 + 100 × 86) / 100 = 96.3`.
- Nothing else is capped. Criteria 1, 3, 4, 5, 6, 7, 9 and 10 are all reachable by
  ordinary commits; criterion 8 is already effectively clean.
- Raising the matrix gap in UI-GAPS.md — the base's own documented procedure for exactly
  this situation — and shipping the library fix would lift the ceiling to 100.

---

## Verdict

**The most expensive dead end is the runtime screen-override system: a team table, a
migration, two doors, a client wrapper, a validator, a merge that runs on every screen
load, a dedicated test, a whole `screens` row in the permission matrix, and a finished
`AgentView` component to render what it produces — and no surface anywhere that can
write a single override.**

**The most damaging one is different: ten switches in the roles matrix that an
administrator can toggle, save, and be told nothing about — because nothing enforces
them.**
