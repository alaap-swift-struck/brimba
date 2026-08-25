# Dead end review — round 5 — Brimba · 2026-08-26

SCORE: **85/100** (uncapped 85 — the gate did not fire)
(round 1: 50 · round 2: 50 · round 3: **70 as reported, 75 when recomputed** — see below)

One question: **what did we build that nobody can actually reach?**

**The most expensive dead end, in one sentence:** *the identity half of every audit
block* — `editor_id`, `editor_email`, `deactivator_id`, `deactivator_email` are
written on nineteen UPDATE statements across five tables by the base's own
CONVENTIONS.md rule, and **not one SELECT anywhere in the codebase names them**.

> **Measured at `review-round5` @ `959c80a`**, read-only. I wrote none of these
> repairs. Every claim below was re-derived from source at HEAD; where I disagree
> with a previous report or with the brief I was given, I say so and show both
> numbers. `npm run check` was not run (instructed).

---

## 1 · The previous score was 75, not 70 — verified independently

`reviews/ROUND5-RECONCILIATION.md` claims round 3's 70 should have been **75**
because three of its findings were already fixed and never re-measured. I did not
take that on trust. Here is the recomputation, from round 3's own printed table.

Round 3 findings, checked at the round-4 close commit `892d28b`:

| R3 finding | state at `892d28b` | evidence |
|---|---|---|
| 1 · CRITICAL `selectable/bulk-active` has no caller | **fixed** | `fb61e02` "the bulk door nothing could open" precedes `892d28b`; `workers/data-ops/src/lib/tools.ts:206` forwards to it |
| 3 · MEDIUM MCP.md documents `set_screen_override` | **fixed** | `command grep -rn "set_screen_override\|screens:edit"` over `workers/ shared/ web/ *.md` returns **zero** hits outside `reviews/` |
| 4 · MEDIUM UI-GAPS #8–#11 stale on every row | **fixed** | `UI-GAPS.md` — all four struck through, each carrying the version that shipped it |

Applying only those, to round 3's own arithmetic:

```
criterion 1 :  60 → 90   (the −30 critical removed)          +30 × 16 = +480
criterion 10:  71 → 86   (block 1 47→50, block 3 8→20)       +15 ×  4 = + 60
round 3 weighted total 6977 + 540 = 7517  →  75.17  →  75
```

**The reconciliation's figure is exactly reproducible. The honest previous score is
75.** Everything below is measured against 75; the delta against the *reported* 70
is +15, of which +5 is arithmetic and +10 is engineering.

---

## 2 · Arithmetic

```
DEFECT criteria    = clamp(0, 100, 100 − Σ penalties)
                     critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's own table
total              = round( Σ (criterion × weight) / Σ weights )   [Σ weights = 100]
GATE               = criterion 1 below 40 caps the total at 50
```

| # | criterion | method | wt | score | × wt | basis |
|---|---|---|---|---|---|---|
| 1 | Every endpoint has a way in | defect | 16 | **90** | 1440 | 111 census routes, 70 non-GET; 1 medium + 1 minor |
| 2 | Every permission switch is enforced | coverage | 14 | **92.86** | 1300.0 | 23/28 grid cells enforced; **0** shown-but-unenforced |
| 3 | Every field a person should fill is fillable | defect | 12 | **83** | 996 | 2 medium + 1 minor |
| 4 | Every write has a reader | defect | 12 | **46** | 552 | 2 high + 3 medium + 1 minor |
| 5 | Nothing is set once and stuck | defect | 11 | **97** | 1067 | 1 minor |
| 6 | Every screen is reachable | defect | 11 | **97** | 1067 | 1 minor |
| 7 | Every capability has an owning surface | coverage | 8 | **83** | 664 | 40 + 25 + 18 |
| 8 | Nothing waits behind a flag nobody flips | coverage | 6 | **90** | 540 | 40 + 30 + 20 |
| 9 | Errors and edge states surface somewhere | coverage | 6 | **93** | 558 | 38 + 30 + 25 |
| 10 | What is deliberately unreachable is written down | coverage | 4 | **88** | 352 | 50 + 20 + 18 |
| | | | **100** | | **8536** | **8536 / 100 = 85.36 → 85** |

**The gate did not fire.** Criterion 1 is 90, comfortably over 40. Capped and
uncapped are the same figure.

### Delta, criterion by criterion, with the cause named

| # | criterion | R3 reported | R3 corrected | **R5** | Δ vs corrected | cause |
|---|---|---|---|---|---|---|
| 1 | endpoints (GATE) | 60 | **90** | 90 | 0 | *the last measurement was wrong* — the fix landed before round 4 closed and was never re-measured |
| 2 | permissions | 66.4 | 66.4 | **92.86** | **+26.5** | **code changed** — `getTeamMetaFeed` now gates on `teams:read` |
| 3 | fields | 43 | 43 | **83** | **+40** | **code changed** (+30: the "Raised from" critical is closed) and *measurement* (+10: three of round 3's six penalty items were counted but never named, so they cannot be carried) |
| 4 | readers | 43 | 43 | **46** | +3 | **code changed** — `activity.before_after` finally has a screen |
| 5 | oneway | 90 | 90 | **97** | +7 | **code changed** — a dropdown value can move between lists |
| 6 | screens | 97 | 97 | 97 | 0 | flat |
| 7 | ownership | 79.3 | 79.3 | **83** | +3.7 | **code changed** — the surface-less bulk door gained one |
| 8 | flags | 90 | 90 | 90 | 0 | flat |
| 9 | edges | 90 | 90 | **93** | +3 | **code changed** — onboarding's failure branch stopped being a vanishing toast |
| 10 | declared | 71 | **86** | **88** | +2 | *measurement* (+15 to the corrected baseline) then **code changed** (+2: MCP.md names its one machine-surface gap; DATA-MODEL notes two unused columns) |

**Total: 75 → 85, +10.** Of the ten criteria, six moved and every one moved up.
Nothing regressed.

---

## 3 · Criterion 1 — recounted from the census, door by door

`ROUTE-CENSUS.md` is generated (`scripts/route-census.mjs`) and machine-checked
(`route-census-current` in `web/test/rules/meta.test.ts`). It declares **111
routes, 68 state-changing**. I parsed all 111 rows — zero unparsed — and crossed
every one of the **70 non-GET** routes against every file in `web/`, `workers/`,
`shared/`, `scripts/` and every root `.md`, counting only a *client or tool*
reference as a way in.

**Ten non-GET routes have no web/tool caller. Every one of them is correct:**

| route | what it is | verdict |
|---|---|---|
| `POST /internal/log-error` · `/internal/send-email` | worker→worker, `INTERNAL_KEY` | internal by design, marked as such in the census |
| `POST /publish` | the realtime Durable Object's own door | internal by design |
| `ANY /api/realtime/health` | probe | internal by design |
| `POST /api/auth/admin/test-login` | staging-only, `TEST_LOGIN_KEY`, refuses on production by config | documented in BOOTSTRAP + OPERATIONS; used by `scripts/smoke-staging.mjs` |
| `POST /api/tenancy/admin/migrate-teams` · `admin/move-module` · `POST /api/data-ops/admin/seed-targets` · `admin/errors/resolve` · `admin/grant-credits` | owner-only maintenance, `adminGuard` | documented curl; named in MCP.md's "not on any machine surface" table with a reason |

**The critical is gone and I verified it.** `POST /api/tenancy/selectable/bulk-active`
now has a caller: `workers/data-ops/src/lib/tools.ts:206`, declared as the
symmetric twin of `bulk_set_learning_active`. `web/lib/agent-trace.ts:81` renders
its step label, so a person sees what it did.

### Penalties

| severity | −pts | what |
|---|---|---|
| medium | 7 | **The four bulk twins have no in-app multi-select.** `learning/bulk-active`, `help/bulk-status`, `help/bulk-status-by-filter`, `selectable/bulk-active` are all reachable — through the assistant, with a confirm panel — but `command grep -rn "bulk" web/lib web/components` returns three `agent-trace.ts` label cases and nothing else. The app's own screens can drive none of them. *I considered downgrading this to a minor and did not: the state is byte-identical to round 3's, and manufacturing a delta no commit bought is the failure this round exists to stop.* |
| minor | 3 | **The operator console has no screen.** Six `admin/*` doors plus the `error_logs` and `db_alerts` tables they read are reachable only by an `x-admin-key` curl. Correctly operator-only, correctly written down, and still a capability with no surface. |

`100 − 7 − 3 = 90`.

---

## 4 · Criterion 2 — the grid, recounted from source, fourth time

I took no number from the probe or from any previous report. A script over
`workers/*/src` (tests excluded, comments stripped) pulled the literal
`(module, right)` pair out of every `requireRight` / `gated` / `gatedBody` call:

```
grid          TEAM_MODULES (7) × MODULE_RIGHTS (4)                      = 28 cells
offered       MODULE_RIGHTS_BY_MODULE (shared/team-modules.ts:56-68)    = 23 cells
server-gated  distinct literal (module,right) pairs in worker src       = 23 pairs
not offered   teams.create teams.delete help.delete agent.edit agent.delete = 5
              23 + 5 = 28 ✓
```

The 23 gated pairs, so anyone can recount:
`agent.create agent.read · help.create help.edit help.read ·
learning.create learning.delete learning.edit learning.read ·
member_roles.create member_roles.delete member_roles.edit member_roles.read ·
selectable_data.create selectable_data.delete selectable_data.edit selectable_data.read ·
team_members.create team_members.delete team_members.edit team_members.read ·
teams.edit teams.read`.

**The offered set and the gated set are now IDENTICAL.** Round 3's one
shown-but-unenforced cell — `teams.read`, enforced only in the browser — is
closed: `workers/tenancy/src/routes/team.ts:249` opens with
`gated(request, env, "teams", "read")`, and `teamContext` is gone from that
handler. It is locked by `workers/tenancy/test/team-meta-gate.test.ts`, which
asserts **both halves** — the gate, *and* that `buildTeamSeed` grants Admin and
Viewer `teams:read` on day one, so the fix cannot trade a security hole for a
first-run 403. That second test is the one I would have asked for.

| block | pts | earned | why |
|---|---|---|---|
| every offered switch is enforced | 40 | **32.86** | 23/28 × 40, the same denominator rounds 2 and 3 used. **Stated openly:** against the 23 cells actually OFFERED it is 23/23 × 40 = 40, which puts this criterion at **100** and the total at **86**. I keep the historical denominator so the delta is a real delta |
| none is shown-but-unenforced | 25 | **25** | **zero exist.** Round 1: 10 · round 2: 9 · round 3: 1 · round 5: **0** |
| unoffered switches recorded as planned | 20 | **20** | all five documented in `shared/team-modules.ts:56-68`, each with the reason no door can bind |
| one shared check used everywhere | 15 | **15** | `requireRight` via `shared/workers/gating.ts`, machine-checked by the per-worker `gating-seam` suites over `shared/test/gating-seam.ts` |
| | | **92.86** | |

**But the brief I was given says `MODULE_RIGHTS_BY_MODULE` is now machine-checked.
It is not.** See finding 3.

---

## 5 · Criterion 3 — the item list, printed

Round 3 scored this 43 from "1 critical + 3 medium + 2 minor" and **never named
the six items**; rounds 1 and 2 named three of them. A count without a list cannot
be carried forward, so I re-derived from the probe's `columns.unfillable`
(32 columns, 7 flagged user-facing) plus the forms themselves. Every user-facing
probe hit was opened:

| probe hit | verdict |
|---|---|
| `error_logs.place / message / stack / url` | **false positive** — written by `shared/workers/error-log.ts:41` |
| `mcp_tokens.label` | **false positive** — written by `workers/mcp/src/lib/tokens.ts:45` |
| `cron_runs.job` | **false positive** — written by `workers/tenancy/src/lib/sharding.ts:148` |
| `screens.recipe` | real, but the removed subsystem's leftover table, and `CATALOG_EXEMPT` in `shared/rules/registry.ts` explains in full why the table survives and nothing reads it → **documented, no penalty** |

| severity | −pts | what |
|---|---|---|
| medium | 7 | `learning.sequence` / `learning.is_required` — no field on `LearningFormDialog` (`web/components/learning-form-dialog.tsx:39-44` is title/category/type/link/file/body). Settable only by asking the assistant (`shared/workers/tool-catalog.ts`). Scored medium, not high, because one surface can in fact set it — stated so it can be recomputed: as a high, criterion 3 is 75 and the total is 84 |
| medium | 7 | `help.screen_recording_link` — on `create_help_ticket` **and** `update_help_ticket` (`tool-catalog.ts:412, 420`), absent from `HelpFormDialog`. Also counted in criterion 4 for having no reader; the criterion-3 charge is the missing field, the criterion-4 charge is the missing screen |
| minor | 3 | `data_import_sessions.auto_populate_columns_json` and `extraction_status_code` — declared, written by nothing, read by nothing, on no planned list. Their `importable_databases` twins are now noted as "**unused today**" at `DATA-MODEL.md:141`; these two are not |

`100 − 7 − 7 − 3 = 83`.

**The critical is closed, and I traced it end to end.** `help.source_screen` — the
"Raised from" row printed on every ticket and fillable by nothing — is now filled
by the create path: `deep-link-screen.tsx:530` passes
`sourceScreen={crumbs[crumbs.length - 1]?.label}` → `help-form-dialog.tsx:110` →
`use-screen-actions.ts:111` → `api.ts:470` → `workers/content/src/lib/help.ts:284`.
**And the second half matters more than the first:** the update door was
*erasing* it on every edit. `help.ts:344-347` now distinguishes absent from
cleared (`input.sourceScreen === undefined ? before.source_screen : …`), locked by
`workers/content/test/omitted-fields.test.ts:193, 208` which asserts both
directions.

---

## 6 · Criterion 4 — every item re-opened

| severity | −pts | what | evidence at HEAD |
|---|---|---|---|
| high | 15 | **the identity half of every audit block** — `editor_id`, `editor_email`, `deactivator_id`, `deactivator_email` on `member_roles`, `selectable_data`, `learning`, `help`, `invite_index` | 19 write sites across `selectable.ts:249,298-299`, `roles.ts:403,460-461`, `help.ts:355,405,506`, `learning.ts:396,455-456`. **Zero SELECTs name them.** Only the `*_name` twin is ever read |
| high | 15 | **`email_change_logs` — a whole table with a query index and no reader** | `workers/auth/src/lib/email-change.ts:134` is the only mention outside the migration and one comment |
| medium | 7 | `help.screen_recording_link` written by both doors, mapped into the API response (`help.ts:55`), rendered nowhere | `command grep -rn screenRecordingLink web/` → `web/test/shape.test.ts:92` and nothing else |
| medium | 7 | `agent_credits.lifetime_granted`, whose schema comment says "for admin view" | `db/core/0010_agent_credits.sql:10`; there is still no admin view |
| medium | 7 | `activity.origin` and `activity.verb` — selected by the reader, typed in `shared/types.ts:200,203`, shipped to the browser on every activity load, **dropped at the client boundary** | `web/components/activity-changes.tsx:49-66` maps `id / description / actor / timestamp` and touches neither |
| minor | 3 | `invite_logs` captures 12 columns; `getInviteAudit` reads 7 | `workers/tenancy/src/lib/invites.ts:99-103` |
| ~~minor~~ | ~~3~~ | ~~`activity.before_after` written and read by nothing~~ | **CLOSED.** `activity-read.ts:250,275` selects it and `web/components/activity-changes.tsx` renders the field diff behind a collapsible on the three record Activity tabs |

`100 − 30 − 21 − 3 = 46`.

---

## 7 · Criteria 5–10, briefly

**5 · Nothing is set once and stuck — 97 (was 90).** Round 3's medium is closed:
`workers/tenancy/src/routes/selectable.ts:75` accepts a `type`, and
`workers/tenancy/test/update-doors.test.ts:120-176` locks all five behaviours —
absent leaves the list alone, sent moves it, the activity row says "moved" not
"renamed", a move onto an existing option is refused, a no-op type is not a move.
The probe's five remaining `oneWay` hits are `team_module_databases.module`,
`idempotency_keys.owner`, `role_permissions.module` and `screens.module` (all
structural, correctly immutable) and `agent_messages.content`. **Minor −3** for
that last one: a chat transcript is correctly append-only and the schema comment
(`team-schema.ts:220-221`) never says so.

**6 · Every screen is reachable — 97, flat.** All twelve probe "orphans" are
Next.js route files resolved by the framework — dismissed. The one minor stands:
`web/lib/nav.ts:33`'s teamless fallback `/${segment}/${id}` resolves for
`learning` and `help` (catch-all pages exist) and nowhere for `members`, `roles`
or `invites`. R20's `static-destinations` check does not cover it —
`web/test/shell-nav.test.ts` and `web/test/nav.test.ts` never mention `recordPath`.

**7 · Every capability has an owning surface — 83 (was 79.3).**
40/40 — every capability now has at least one surface; the last write door
without one gained a tool. 25/30 — the API-only capabilities are stated
decisions, except `help/thread`, which MCP.md honourably calls "**a known gap,
named as one rather than defended**" (a gap, not a decision). 18/30 — three
capabilities exist in one whole surface and one half-finished one: bulk writes
(assistant yes, UI no, MCP deliberately no), `screenRecordingLink` (machine yes,
UI no, reader none), `sourceScreen` (UI yes, machine no).

**8 · Nothing waits behind a flag nobody flips — 90, flat.** `flagsSeen: []`.
The config vars are live and documented, and `web/test/config-vars.test.ts`
checks them. 20/30 on the third block: there is no owner or expiry convention
written down, because there are no flags to own.

**9 · Errors and edge states surface somewhere — 93 (was 90).** 38/40 — the one
page in the app with no way off it now keeps its failure reason on screen and
offers two forward actions (`web/app/onboarding/page.tsx:46, 97, 110`); the
comment says it plainly: *"a toast is gone in four seconds"*. 30/30 — validation
renders through `FormShell`, and `requireRight`'s 403 names the missing right in
plain words (`shared/workers/gating.ts:281-286`). 25/30 — two states the code can
enter still have no screen: `teams.db_status = 'failed'`
(`workers/tenancy/src/lib/teams.ts:180`) simply drops the team out of every
`JOIN … AND t.db_status = 'ready'`, so a member watches their team vanish with no
explanation; and `error_logs` / `db_alerts` remain curl-only.

**10 · What is deliberately unreachable is written down — 88 (was 71 reported,
86 corrected).** 50/50 — `ROUTE-CENSUS.md` is generated and machine-checked, the
internal cluster is marked `INTERNAL_KEY`, the phantom `set_screen_override`
paragraph is gone, and MCP.md's exclusion section is now checked against **both**
machine catalogues (`workers/mcp/test/catalog.test.ts:128-212`) — including an
assertion that it names nothing the assistant exposes unless it says which
surface it means. 20/30 — the five unoffered rights and one machine gap are
listed; the bulk multi-select, `lifetime_granted`'s admin view and two import
columns are on no list. 18/20 — UI-GAPS is current (rows 1 and 2 verified still
open: `node_modules/@swift-struck/ui/registry/` has no `code-input` and no
`auth-card` at 0.16.0), and `web/test/rules/doc-facts.test.ts` now fails the build
when a document names a repo path that does not exist.

---

## 8 · Ranked list of what still costs points

| # | item | criterion | worth | the concrete change |
|---|---|---|---|---|
| 1 | **Audit-identity columns have no reader** | 4 · high | **1.8** | Either surface `editor_email` / `deactivator_email` on the Overview audit block (`web/lib/audit-overview.ts` already assembles it), or stop writing them and amend CONVENTIONS.md. Both are product calls — Tier 3 |
| 2 | **`email_change_logs` has no reader** | 4 · high | **1.8** | The account Activity tab (`settings-screen.tsx:108`) already renders `account_activity`. One `UNION` or one extra read gives the table the screen its index was built for |
| 3 | **The bulk twins have no in-app multi-select** | 1 · medium, 7 | **~1.1** | A `selectRows` toggle on the four list recipes wiring the existing `bulk_*` doors. Real UI work — Tier 2 |
| 4 | **`activity.origin` / `verb` are fetched and shown to nobody** | 4 · medium | **0.84** | Carry both through `activityFeedItems` (`activity-changes.tsx:49`) and render `origin` as a chip where it is not `"ui"`. Needs a slot on the library `ActivityFeed` item type → a UI-GAPS entry, not a host fork |
| 5 | **`screenRecordingLink`: machine-writable, unreadable, UI-unfillable** | 3 + 4 · medium ×2 | **1.68** | One field on `HelpFormDialog` and one row on `help-detail.tsx`'s Overview — about fifteen lines, and it closes two criteria at once. The cheapest two points in this report |
| 6 | **`learning.sequence` / `is_required` have no form field** | 3 · medium | **0.84** | Two controls on `LearningFormDialog`. The door already tells absent from cleared (`omitted-fields.test.ts:159`), so nothing else has to move |
| 7 | **`agent_credits.lifetime_granted` — "for admin view", no admin view** | 4 · medium | **0.84** | Either an owner read beside `admin/errors`, or delete the comment's promise |
| 8 | **`MODULE_RIGHTS_BY_MODULE` is still not machine-checked** | risk, not points | **0** today, **1.9** if it rots | ~25 lines: recompute the gated pair set off disk and assert `offered === gated`. See finding 3 |
| 9 | **The operator console has no screen** | 1 · minor | **0.48** | A product call. Recommend, do not build |
| 10 | **Two import columns on no planned list** | 3 · minor, 10 | **0.44** | Two lines in DATA-MODEL.md beside the two that already say "unused today" |
| 11 | **`db_status = 'failed'` has no screen** | 9 | **~0.3** | The team switcher already receives `dbStatus` (`shared/types.ts:25`) and ignores it |
| 12 | **The teamless `recordPath` fallback** | 6 · minor | **0.33** | Either drop the fallback (a record always has a team) or add the three catch-all pages |

---

## 9 · Fix impact map

| Fix | Files | ADDS / REMOVES | Which other review it could damage |
|---|---|---|---|
| **F1** surface the audit-identity columns | `web/lib/audit-overview.ts` + 3 detail components | ADDS 2 rows per Overview | **`security_sentry_review`** — an actor's raw id and email beside their name is more identity on screen than the base shows anywhere else; it would rightly question it. **`round_trip_review`** — nothing, the row is already fetched. The alternative (stop writing them) hits **`activity_log_review`** and contradicts CONVENTIONS.md's audit-block rule |
| **F2** give `email_change_logs` a reader | `workers/auth/src/routes/*` + `settings-screen.tsx` | ADDS one read on the account Activity tab | **`round_trip_review` / `speed_review`** — one more query on a screen that already does one; fold it into the existing `account_activity` read or it is a second round trip. **`security_sentry_review`** improves: an email change is exactly what a person should be able to audit on their own account |
| **F3** multi-select on the four bulk lists | `web/lib/screens.ts` + `deep-link-screen.tsx` + a confirm | ADDS a selection mode and a confirm panel | **`first_run_review`** — a selection affordance on a screen with nothing on it is noise; gate it on a non-empty list. **`scaling_review` / `spend_review`** — the doors already exist and are capped, so no new ceiling. **`interfacelessness_review`** improves |
| **F4** render `origin` / `verb` | library `ActivityFeed` item type, then 1 host seam | ADDS a chip per row | **the library-is-lego rule** — this needs a library change, so it is a UI-GAPS entry first, never a host fork. **`activity_log_review`** improves (its criterion 5). **`lean_mean_review`** neutral: `activityFeedItems` is already the one seam, so it is one mapping, not three |
| **F5** `screenRecordingLink` field + row | `help-form-dialog.tsx`, `help-detail.tsx` | ADDS 1 field, 1 display row | **`first_run_review`** — one more field on the first form a new person meets; `help-form-dialog.tsx:69` already argues deliberately for keeping that form short, so this must be optional and last. **`interfacelessness_review`** improves (it closes a reversed parity gap) |
| **F6** `sequence` / `required` on the learning form | `learning-form-dialog.tsx` | ADDS 2 controls | **`first_run_review`** — same objection, smaller: the article form is not the first one a new person meets. **R7 (draft persistence)** is automatic via `useFormDraft`. Nothing else |
| **F7** lock `MODULE_RIGHTS_BY_MODULE` | a new ~25-line test | ADDS a check that can fail | **`lean_mean_review`** — 25 more test lines. Nothing else: it ships no code. It is the only thing standing between this round's +26.5 and a silent regression |
| **F8** an operator screen for `error_logs` / `db_alerts` | a new admin surface | ADDS a whole screen and a new auth path | **`security_sentry_review`** materially — a cross-tenant read behind a role rather than a key. **`base_fork_review`** — an owner-only console is base furniture a fork inherits. Recommend only |
| **F9** two lines in DATA-MODEL.md | `DATA-MODEL.md` | REMOVES two undeclared columns | none — helps `story_checks_out_review` |

---

## 10 · Findings

### 1 · HIGH — the identity half of every audit block is written and never read · **STANDS (round 1)**
`workers/tenancy/src/lib/selectable.ts:249,298-299` · `roles.ts:403,460-461` ·
`workers/content/src/lib/help.ts:355,405,506` · `learning.ts:396,455-456`

Nineteen UPDATE statements write `editor_id`, `editor_email` and their
`deactivator_*` twins. No SELECT in the codebase names any of them. This is the
base's own CONVENTIONS.md audit-block rule producing four write-only columns on
five tables, on every edit, for ever. **It is the most expensive dead end in this
report** because it is generated by a convention rather than by a mistake — every
new module inherits it.

### 2 · HIGH — a whole table is written and read by nothing · **STANDS (round 1)**
`workers/auth/src/lib/email-change.ts:134` · `db/core/0005_email_change.sql:21,28`

`email_change_logs` has an index built for querying it (`idx_email_change_logs_user
(user_id, created_at)`) and exactly one mention in the code: the INSERT. Cross-ref
`activity_log_review`: a log nobody can read scores here for unreachability and
there for queryability.

### 3 · MEDIUM — the permission narrowing is still not machine-checked, and I was told it was · **NEW · a correction**
`shared/team-modules.ts:56-68`

I was briefed that "`MODULE_RIGHTS_BY_MODULE` is now machine-checked". **It is
not.** `command grep -rn "MODULE_RIGHTS_BY_MODULE\|rightsOf" .` over the whole
repository returns five hits: the declaration, the accessor, and one consumer
(`web/components/role-detail.tsx:47,158`). No test file references it, no rules
check names it, and `command grep -rn "team-modules"` finds no test importing the
module at all. `RULES.md` has no law about the rights grid, and the census's
`Gate` column records *that* a route is gated, never which pair.

The half that *was* machine-checked is `teams.read` — and it is checked very
well (`workers/tenancy/test/team-meta-gate.test.ts` covers both the gate and the
seed). But the data file behind 14 weighted points is still a hand-verified
comment ending *"Verified against the gated routes on 2026-08-25"*, which is
exactly the shape this campaign has now found eighteen times: a rule with no
check is a preference.

Concretely: ship a `help:delete` door tomorrow and the switch that grants it is
invisible, the door 403s for everyone for ever, and `npm run check` stays green.
The script in §4 of this report is the check; it is about 25 lines.

### 4 · MEDIUM — `screenRecordingLink` and `sourceScreen` are now mis-parity in opposite directions · **NEW**
`shared/workers/tool-catalog.ts:412,420` · `web/components/help-form-dialog.tsx` ·
`web/components/help-detail.tsx:236`

Closing the "Raised from" critical produced a mirror of itself. `sourceScreen` is
now filled automatically by the web form and is **not on either help tool's
schema**, so every ticket the assistant or an MCP client raises has an empty
"Raised from" row — the exact display the critical was about, now half-empty
instead of always-empty. `screenRecordingLink` is the reverse: on both tool
schemas, on neither form, rendered on no screen.

No check covers this. R19 (`agent-filter-parity`) derives *filter* parity on list
doors from the door's own source; nothing derives *field* parity on create doors.
Cross-ref `interfacelessness_review`.

### 5 · MEDIUM — the bulk twins are declared, gated, tested, and no screen can drive them · **STANDS**
`shared/workers/bulk-doors.ts` · `web/lib/screens.ts`

R24 makes deciding about bulk mandatory and the base decided well — three twins,
each declaring `together`, with `workers/tenancy/test/bulk-ordering.test.ts` as
the behavioural cover. All four bulk doors are agent tools. **None is reachable
from a list.** The law produced correct doors and no way in.

### 6 · MEDIUM — `activity.origin` / `verb` are fetched on every activity load and shown to nobody · **STANDS (round 2)**
### 7 · MEDIUM — `agent_credits.lifetime_granted`, "for admin view", with no admin view · **STANDS**
### 8 · MEDIUM — `learning.sequence` / `is_required` have no form field · **STANDS**
### 9 · MINOR — `invite_logs` captures 12 columns and the audit reads 7 · **STANDS**
### 10 · MINOR — two `data_import_sessions` columns on no planned list · **STANDS (half-closed)**
### 11 · MINOR — the teamless `recordPath` fallback resolves nowhere · **STANDS**
### 12 · MINOR — the operator console has no screen · **STANDS**
### 13 · MINOR — `agent_messages.content` is immutable by design and nothing says so · **NEW, trivial**

**Closed this round:** round 3's finding 1 (the bulk door with no caller),
finding 2 (`teams.read` enforced only in the browser), finding 3 (MCP.md's phantom
tool), finding 4 (the stale UI-GAPS list), finding 6 (the unfillable "Raised
from"), finding 10 (a dropdown value that could never move list), and round 2's
finding on `activity.before_after`.

---

## 11 · Things no rubric asked about

**A · Two source files are invisible to `grep`, `ripgrep` and `ugrep`.**
`web/components/app-shell.tsx` and `workers/data-ops/src/lib/import-plan.ts`
contain **literal NUL bytes in the source text** — four at `app-shell.tsx:82-84`
(a cache-key sentinel, written as the raw byte between quotes rather than as a
`\u0000` escape) and one at `import-plan.ts:274` (a `.join()` fingerprint
separator, same form). `file(1)` reports both files as `data`, and every grep in
the family skips them silently — no warning, no note, just no match.

I hit this live: `grep -n "ConnectionStatus" web/components/app-shell.tsx`
returned nothing while line 14 imports it. **A zero result from those two files is
not evidence of absence**, and `app-shell.tsx` is the file holding the live
registry consumers, the connection state, the activity coalescing and the team
prewarm — the most grep-searched file in the repository. The law checks are
unaffected (they use `readFileSync(…, "utf8")`), so `npm run check` cannot notice.
The sentinels are a sound idea; writing them as escape sequences, or picking a
printable separator, would do the same job without tripping binary detection. This
is the same disease as round 5’s own "a regex literal containing a quote made
sixteen files leak their comments", one layer out: the *reader* is fine and the
*tool everyone uses* is blind.

**B · CI runs a Node the project forbids.** `.github/workflows/ci.yml` pins
`node-version: 22`; `package.json` declares `"engines": { "node": ">=24.0.0" }`.
The gate that decides whether a change may ship runs on a runtime the manifest
says is unsupported.

**C · CI does not watch this branch.** `ci.yml` triggers on `push: branches:
[main]` and `pull_request`. Everything in round 5 lives on `review-round5`. The
green `npm run check` claimed in `2fc6706`'s message was run locally; nothing has
re-run it on a clean machine.

**D · `POST /api/tenancy/admin/move-module` has no caller at all** — not in
`web/`, not in a tool, not in a script. Only BASE-MANUAL and ARCHITECTURE prose
describe it. It is the one admin door with no runnable path anywhere in the
repository, and BASE-MANUAL.md:640 calls it "BUILT and tested".

**E · The best repair in this round is one nobody scored.** `web/test/empty-action.test.tsx`
does not check that `emptyAction` is declared — it *clicks the rendered button*,
resolves the id the host receives, and then asserts the host actually renders a
dialog on that URL. Its own comment names the trap: `members.create` would have
passed the first two steps and opened nothing, so the Members list's way out is
`invites.create`. That is a check written to catch the failure rather than to
describe the feature, and it is the standard the rest of this repository's checks
should be measured against.

---

## 12 · Ceiling

**95 is not reachable by changing code, and the block is arithmetic, not a locked
decision.** With every finding above repaired:

```
crit 1  →  93   (the bulk-list medium is buyable; the operator-console minor is a
                 product decision, not a defect)
crit 2  →  92.86 (block 1 stays 23/28 while five rights have no door that CAN
                 exist — a permanent 7.14-point floor under the historical
                 denominator; 100 under the "offered" denominator)
crit 3  →  100
crit 4  →  85   (the audit-identity columns are written by CONVENTIONS.md's own
                 rule; giving them a reader puts ids and emails on screen, which
                 security would rightly question, and not writing them
                 contradicts a locked convention)
crit 5  →  100 · crit 6 → 100 · crit 7 → 95 · crit 8 → 90 · crit 9 → 97 · crit 10 → 95
```

```
93×16 + 92.86×14 + 100×12 + 85×12 + 100×11 + 100×11 + 95×8 + 90×6 + 97×6 + 95×4
= 1488 + 1300 + 1200 + 1020 + 1100 + 1100 + 760 + 540 + 582 + 380
= 9470  →  94.7  →  95
```

**95 is reachable — just.** And it needs all of criteria 3, 5 and 6 perfect plus
the audit-identity question answered. Two things hold the last five points and
neither is a commit:

1. **Criterion 2's denominator, 1.0 points, permanently.** Five of 28 cells
   describe rights whose doors *cannot* exist: a teamless person must be able to
   create their first team; a team is never deleted; a ticket is closed, not
   deleted; a conversation is neither edited nor deleted. Each is a locked
   decision in ARCHITECTURE.md or the identity model. Reading the rubric's
   denominator as "offered" instead of "the full grid" erases this entirely and
   takes the total to 86 today — I did not, because rounds 2 and 3 did not.
2. **Criterion 4's audit-identity columns, 1.8 points.** Surfacing them is a
   security question; not writing them contradicts a convention. Whichever way
   the owner answers, one review loses.

**What a single commit is worth right now:** F5 alone (fifteen lines) takes 85 →
87. F5 + F6 + F9 → 88. F5 + F6 + F9 + F2 → 90, and every one of those is a field,
a row, two doc lines, or one read.

---

**The verdict, in one sentence:** every door in this base now has a way in — the
last one gained a tool, the last shown-but-unenforced switch gained a server-side
gate with a test that checks the seed as well as the gate, and the field printed
on every ticket that nothing could fill is now filled and no longer erased on
edit; what is left is not doors but *readers* — four audit columns, one whole
table and two activity fields that this app writes faithfully, ships over the
wire, and shows to nobody.
