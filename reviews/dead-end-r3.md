# Dead end review — round 3 — Brimba · 2026-08-25
SCORE: **70/100** (uncapped 70 — **the gate has lifted**)   (round 1: 50 · round 2: 50, uncapped 61)

One question: **what did we build that nobody can actually reach?**

**The most expensive dead end, in one sentence:** *`POST /api/tenancy/selectable/bulk-active`*
— a gated, published, R23-compliant write door that **no screen, no client function,
no MCP tool and no agent tool calls**, and the last thing standing between this
review and a score in the eighties.

> **Measured at `256d21b`.** Two `npm install` processes were running in this
> working tree during the run (someone else's), and `web/node_modules/@swift-struck/ui`
> was empty for part of it. Every claim below is derived from **repo source**, not
> from installed packages; the two places where an installed library would have been
> the better witness are marked **unverified-from-source** and named.

---

## DELTA

**Round 2: 50 (uncapped 61) → Round 3: 70.** The headline moved 20 points and every
one of them came from the same place: **one of the two criticals holding criterion 1
under 40 was removed, so the gate stopped firing.**

| Criterion | wt | R1 | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|
| 1 · Every endpoint has a way in (GATE) | 16 | 30 | 30 | **60** | **UP 30.** `POST /api/tenancy/config/screens` is gone with its subsystem. One critical left (`selectable/bulk-active`), re-verified below. 60 ≥ 40, so **no cap** |
| 2 · Every permission switch is enforced | 14 | 42.5 | 43.75 | **66.4** | **UP 22.7.** The grid is 7×4=28, not 8×4=32; 5 unenforceable cells are no longer rendered and each is documented. One shown-but-unenforced cell remains — `teams.read`, and the reason it was kept is only half true (finding 2) |
| 3 · Every field a person should fill is fillable | 12 | 35 | 43 | **43** | unchanged. "Raised from" re-verified still unfillable from every surface |
| 4 · Every write has a reader | 12 | 53 | 43 | **43** | unchanged. All seven items re-opened and re-confirmed; `screens` simply left one of the lists |
| 5 · Nothing is set once and stuck | 11 | 90 | 90 | **90** | unchanged. `selectable_data.type` still has no editor (`web/lib/api.ts:340` — "its type stays") |
| 6 · Every screen is reachable | 11 | 90 | 90 | **97** | **UP 7.** `AgentView` is deleted — zero references in the whole workspace. The teamless `recordPath` fallback minor stands |
| 7 · Every capability has an owning surface | 8 | 78.7 | 78.7 | **79.3** | UP 0.6 — one of the two surface-less write doors went away |
| 8 · Nothing waits behind a flag nobody flips | 6 | 90 | 90 | **90** | unchanged. No flag added or removed |
| 9 · Errors and edge states surface somewhere | 6 | 85 | 85 | **90** | **UP 5.** `offline` / `reconnecting` were states the code could enter with nowhere to show them; `ConnectionStatus` in the shell now shows them |
| 10 · What is deliberately unreachable is written down | 4 | 73 | 70 | **71** | net UP 1, **with a block that fell hard** — see below |

### Did somebody else's repair break my criteria?

**No criterion went down overall, but one BLOCK inside criterion 10 fell by 12, and a
second repair left a phantom capability in the docs.** Both are other people's fixes.

| repair (whose) | effect here |
|---|---|
| screen-override subsystem REMOVED (owner) | **the single biggest help this review has had.** It cleared one criterion-1 critical, one criterion-2 module (4 cells, 3 of them dead), one criterion-4 table and `AgentView`. It is also the right call: the rubric says deleting is a product decision, and the owner made it |
| library 0.9.1 → 0.16.0 (owner) | **helped criteria 2, 6 and 9; broke criterion 10's currency block.** `UI-GAPS.md` gaps #9, #10 and #11 all shipped in the library and are still listed as open, un-struck, ONE DAY after being written. Block 3 of criterion 10 ("the list is current") falls 20/20 → 8/20. Finding 4 |
| MCP.md correction (round 2's repair) | **left a phantom.** The exclusion table lost its `config/screens` row correctly, but the paragraph below it still tells a reader that `set_screen_override` is a tool. It is not — zero references outside MCP.md. Finding 3 |
| `ROUTE-CENSUS.md` (security/story) | **helped.** 94 routes with the gate each opens with, generated and checked. Criterion 10's first block goes 42/50 → 47/50, and it is what let me count criterion 1's denominator without re-deriving it |
| bounded retention + 5xx recording (scaling/error_log) | **neutral here, and it widens finding 7 slightly**: `error_logs` gains yet another writer and still has no screen. Already counted as a minor; not re-charged |

---

## Independent verification of the permission re-measure

The brief asked me to verify the count independently, because a wrong narrowing
removes a control that works. I did not take any number from the repair.

**Method.** A script over `workers/*/src` (tests excluded) matching every
`requireRight` / `gated` / `gatedBody` call and pulling the adjacent
`"module"`,`"right"` string pair out of each — the same technique round 2 used, run
fresh. Then the offered set read straight from `MODULE_RIGHTS_BY_MODULE`
(`shared/team-modules.ts:56-70`), and every non-literal gate hunted separately
(`hasRight(` — 2 production call sites, both already-counted `create` pairs;
`requireAnyImportRight` — a loop over import TARGETS on `create`).

```
grid          TEAM_MODULES (7) × MODULE_RIGHTS (4)                        = 28 cells
offered       teams 2 + team_members 4 + member_roles 4 + learning 4
              + help 3 + selectable_data 4 + agent 2                     = 23 cells
server-gated  distinct literal (module,right) pairs found in worker src  = 22 pairs
not offered   teams.create teams.delete help.delete agent.edit agent.delete = 5 cells
offered, not server-gated                                      teams.read = 1 cell
              22 + 5 + 1 = 28 ✓
```

**Every number in the brief checks out.** The 22 pairs, listed so anyone can recount:
`agent.read` `agent.create` · `help.read` `help.create` `help.edit` ·
`learning.read` `learning.create` `learning.edit` `learning.delete` ·
`member_roles.read` `member_roles.create` `member_roles.edit` `member_roles.delete` ·
`selectable_data.read` `selectable_data.create` `selectable_data.edit` `selectable_data.delete` ·
`team_members.read` `team_members.create` `team_members.edit` `team_members.delete` ·
`teams.edit`.

**The safety check the brief actually asked for — did the narrowing remove a control
that works?** The answer is **no, and it is provable in one line**: the offered set
minus `teams.read` **equals** the gated set exactly. There is no (module, right) pair
that a door gates and the matrix no longer shows. If there were, that right would be
ungrantable and its door permanently 403 — the specific harm named in the brief. It
does not exist.

**But the reason given for keeping `teams.read` is only half true, and that half
matters.** The comment says *"`read` stays: it is the gate on the team Overview
screen recipe"* — true, and I confirmed it twice over:

- `web/lib/screens.ts:100` — `teamDetailRecipe.gate = { module: "teams", right: "read" }`,
  honoured by the library renderer (`screen-renderer.tsx:774`: a denied screen
  renders nothing) — **unverified-from-source this run**, read from the installed
  0.16.0 before the concurrent `npm install` emptied it
- `web/components/deep-link/module-content.tsx:136` — `if (!can(permKey, "read")) return <NoAccess />`,
  with `MODULE_PERMISSION.team = "teams"` (`screens.ts:83`). This one is host source
  and is verified

So toggling `teams.read` off genuinely changes what the person sees. What it does
**not** do is withhold the data:

```ts
// workers/tenancy/src/routes/team.ts:209
export async function getTeamMetaFeed(request: Request, env: Env): Promise<Response> {
  const { guard } = await teamContext(request, env)          // membership only
  return json(await getTeamMeta(env, guard.teamId))          // no requireRight
}
```

`teams.read` is enforced **only in the browser** — in code the restricted person's own
machine runs. That is finding 2, it is one line to fix, and it is the last
shown-but-unenforced cell in the base.

---

## Arithmetic

```
DEFECT criteria    = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's table
total              = round( Σ (criterion × weight) / 100 )
GATE               = criterion 1 below 40 caps the total at 50 — DID NOT FIRE this round
```

| # | criterion | method | score | weight | weighted | counted basis |
|---|---|---|---|---|---|---|
| 1 | Every endpoint has a way in | defect | **60** | 16 | 960 | 94 declared routes; 1 critical + 1 medium + 1 minor |
| 2 | Every permission switch is enforced | coverage | **66.4** | 14 | 929.6 | 22/28 gated; 1 shown-but-unenforced; 5/5 unoffered documented |
| 3 | Every field a person should fill is fillable | defect | **43** | 12 | 516 | 1 critical + 3 medium + 2 minor |
| 4 | Every write has a reader | defect | **43** | 12 | 516 | 2 high + 3 medium + 2 minor |
| 5 | Nothing is set once and stuck | defect | **90** | 11 | 990 | 1 medium + 1 minor |
| 6 | Every screen is reachable | defect | **97** | 11 | 1067 | 1 minor |
| 7 | Every capability has an owning surface | coverage | **79.3** | 8 | 634.4 | 39.3 + 25 + 15 |
| 8 | Nothing waits behind a flag nobody flips | coverage | **90** | 6 | 540 | 0 flags; config vars live + documented |
| 9 | Errors and edge states surface somewhere | coverage | **90** | 6 | 540 | 35/40 + 30/30 + 25/30 |
| 10 | What is deliberately unreachable is written down | coverage | **71** | 4 | 284 | 47/50 + 16/30 + 8/20 |
| | | | | **100** | **6977** | **6977 / 100 = 69.77 → 70** |

**The gate did not fire.** Criterion 1 is 60, comfortably over 40. This is the first
round of three in which this review's headline is its own arithmetic rather than a cap.

### Criterion 1 — recounted against the census

`ROUTE-CENSUS.md` declares **94 routes, 58 state-changing**. Round 2 counted 99 by
hand; the difference is the census's own scope plus the five routes the
screen-override removal took out. I did not adopt the census blindly — I re-derived
the one number that matters, the unreachable set, by grepping each candidate path
across `workers/`, `shared/`, `web/`, `scripts/` and every `.md` outside `reviews/`.

| severity | count | penalty | what |
|---|---|---|---|
| critical | 1 | 30 | `POST /api/tenancy/selectable/bulk-active` — a write door no surface calls |
| high | 0 | 0 | every read door powering a screen is consumed |
| medium | 1 | 7 | the R24 bulk twins: the app's own screens can reach none of them — still no multi-select anywhere in `web/` (`grep "bulk"` in `web/lib` + `web/components` returns two `agent-trace.ts` label cases and nothing else) |
| minor | 1 | 3 | the operator console (`admin/errors`, `admin/db-sizes`) — documented curl, no screen |

`100 − 30 − 7 − 3 = 60`.

**The removed critical, verified as removed:** `grep -rn "screen_override\|set_screen_override\|screens:edit"`
across `workers/ shared/ web/ *.md` returns **two hits, both in MCP.md prose**. No
route, no handler, no table, no tool, no client function. It is gone.

**The surviving critical, verified as still dead:**

```
grep -rn "selectable/bulk-active" workers shared web scripts *.md
→ workers/tenancy/src/index.ts:132   the route registration itself
→ ROUTE-CENSUS.md:100                a generated inventory row
```

Two hits, and **neither is a caller**. `web/lib/api.ts` has five `selectable` calls
(`selectable`, `selectableOne`, create, update, active) and no bulk one. No MCP tool
and no agent tool names it — its two siblings (`learning/bulk-active`,
`help/bulk-status`) are both agent tools, which is what makes this one's absence a
gap rather than a policy.

### Criterion 2 — the grid, cell by cell, third recount

| block | points | earned | why |
|---|---|---|---|
| every offered switch is enforced | 40 | **31.4** | 22/28 × 40, the same denominator round 2 used (enforced ÷ full grid). **Stated openly:** measured against the 23 cells actually OFFERED it is 22/23 × 40 = 38.3, which would put the criterion at 73.3 and the total at 71. I keep the round-2 method so the delta is a real delta |
| none is shown-but-unenforced | 25 | **0** | one exists — `teams.read`. The rubric says score 0 if any exist, and I am applying it strictly even though the practical harm is a ninth of round 2's. Fixing it moves this criterion to 91.4 and the total to 73.5 |
| unoffered switches recorded as planned | 20 | **20** | all five are documented in `shared/team-modules.ts:56-70`, each with the reason no door can bind: teams create/delete (identity-gated first team; deactivate-never-delete), help delete (a ticket is closed, never deleted), agent edit/delete (a conversation is neither). Round 2 earned 0 here |
| one shared check used everywhere | 15 | **15** | `requireRight` via `shared/workers/gating.ts` + `route.ts`, machine-checked by R10's per-worker `gating-seam` suites |
| | | **66.4** | |

### Criterion 4 — all seven items re-opened, all seven stand

- **high** — `editor_id` / `editor_email` / `deactivator_id` / `deactivator_email` across
  `member_roles`, `selectable_data`, `learning`, `help`, `importable_databases`
  (`screens` left the list by leaving the codebase). 9 write sites; **zero** SELECTs
  name them. Only the `*_name` twin is read.
- **high** — `email_change_logs`: a whole table with an index built for querying it and
  no reader (`workers/auth/src/lib/email-change.ts:131` is the only mention outside
  the migration).
- **medium** — `help.screen_recording_link`: written by both doors, on both tool
  schemas, mapped into the API response (`help.ts:49`), rendered in `web/` **nowhere**
  (`grep screenRecordingLink web/` → `web/test/shape.test.ts:92`, and nothing else).
- **medium** — `agent_credits.lifetime_granted`, whose schema comment says "for admin
  view" (`db/core/0010_agent_credits.sql:10`). There is still no admin view.
- **medium** — `activity.origin` and `activity.verb`: read by the endpoint, shipped to
  the browser on every activity load, dropped at the client boundary. Cross-ref
  `activity_log_review` criterion 5.
- **minor** — `invite_logs` captures 11 columns; `getInviteAudit` reads 7.
- **minor** — `activity.before_after`, written and read by nothing at all.

`2×15 + 3×7 + 2×3 = 57 → 43`.

### Criterion 10 — the block that fell

| block | points | earned | why |
|---|---|---|---|
| internal-only endpoints marked as such | 50 | **47** | **UP from 42.** `ROUTE-CENSUS.md` names every door and the gate it opens with, generated by `scripts/route-census.mjs` and machine-checked, and the internal cluster (`/internal/log-error`, `/internal/mcp-session`, `/internal/send-email`) is marked `INTERNAL_KEY`. Round 2's −5 was `workers/tenancy/src/index.ts:32` describing the screens route's gate; that route no longer exists. **−3** remains for MCP.md's phantom tool (finding 3) |
| planned-but-unbuilt capabilities listed somewhere | 30 | **16** | **UP from 8.** The five unoffered rights are now documented where they live. `selectable/bulk-active` and the four awaiting-a-feature columns are still on no list anywhere |
| the list is current | 20 | **8** | **DOWN from 20.** `UI-GAPS.md`'s brand-new "Raised 2026-08-25" section lists four library gaps; **all four have since shipped in 0.16.0** and none is struck through. Gap #9 even states the number it caps ("9 of 32 switches… caps `dead_end`'s criterion 2 at 73.75") — a figure this report has just superseded twice over |

---

## Findings

### 1 · CRITICAL — a bulk write door reachable by nothing · **STANDS (now alone)**
`workers/tenancy/src/index.ts:132` · `workers/tenancy/src/routes/selectable.ts`

`POST /api/tenancy/selectable/bulk-active` is gated (`selectable_data:delete`),
idempotent, R23-shaped, and callable by **nobody**. Its two siblings —
`learning/bulk-active` and `help/bulk-status` — are both agent tools; this one is
not in `shared/workers/tool-catalog.ts`, not in `web/lib/api.ts`, not in MCP.md's
exclusion table with a reason. It is not a policy, it is an omission.

**It is now the entire criterion-1 penalty above the medium.** Give it a caller — an
agent tool beside its two siblings is ~10 lines and reuses `forwardToDoor` — or name
it in MCP.md's exclusion table, and criterion 1 goes to 90 and this review to 75.

### 2 · HIGH — the one surviving shown-but-unenforced switch is enforced only in the browser
`workers/tenancy/src/routes/team.ts:209-212` · `web/components/deep-link/module-content.tsx:136`
· `shared/team-modules.ts:63`

`teams.read` was kept because it gates the team Overview screen. It does — twice, in
the host guard and in the recipe gate. But `GET /api/tenancy/team-meta` opens with
`teamContext` alone, so any member can read the team's metadata straight from the
API regardless of the switch. An administrator who turns `teams.read` off has hidden
a screen, not withheld data.

This is the **only** cell of 28 in that state (round 1: 10; round 2: 9). The fix is
one line — `const { guard } = await gated(request, env, "teams", "read")` — and it
makes criterion 2's second block whole. Cross-ref `security_sentry_review`, which
owns "client-side-only enforcement" as a class.

### 3 · MEDIUM — MCP.md documents a tool that does not exist · **NEW · caused by the removal**
`MCP.md:263-270`

The exclusion table correctly dropped its `config/screens` row. The paragraph under
it did not:

> **`config/screens` was on this list until 2026-08-25 and is now a tool**
> (`set_screen_override`) … it **confirms before it runs** and needs the
> `screens:edit` right, which no role holds by default.

There is no `set_screen_override`, no `screens:edit`, and no `screens` module.
`grep` returns these two lines and nothing else in the entire repository. A
developer reading MCP.md — the document written *for* external developers — will go
looking for a tool that was built and then deleted, which is the exact cost this
skill exists to measure, inverted. Cross-ref `story_checks_out_review`.

### 4 · MEDIUM — the gap list written yesterday is stale on every row · **NEW · caused by the library upgrade**
`UI-GAPS.md:39-52`

Four gaps raised 2026-08-25 as "unfixable in the host". By the end of the same day:
#9 (`PermissionMatrix` hard-codes four rights) is the feature this round's permission
narrowing is built on; #10 (no connection-state primitive) is imported at
`web/components/app-shell.tsx:14` and rendered at `:221`; #11 (no list
virtualisation) shipped in 0.10.0 per the round-3 brief; #8 (`emptyAction`) shipped
and was deliberately not wired. None is struck through, and every earlier entry in
the same file **is** struck through with a date — so the file's own convention says
these are open.

Worse, #9 asserts a number this report has now measured twice: "9 of 32 switches…
caps `dead_end`'s criterion 2 at 73.75". Criterion 2 is 66.4 and its cap is
elsewhere. A stale list is worse than no list because it is cited.

### 5 · MEDIUM — nothing locks the permission narrowing that just fixed nine dead switches · **NEW**
`shared/team-modules.ts:56-70`

`MODULE_RIGHTS_BY_MODULE` is the whole of the repair. Its own comment states the
rule for editing it and ends *"Verified against the gated routes on 2026-08-25"* —
verified by hand, once, by the person who wrote it. `grep -rn "rightsOf\|MODULE_RIGHTS_BY_MODULE"`
across `web/test`, `shared/rules` and every `workers/*/test` returns **nothing**.

So: ship a `help:delete` door tomorrow and the switch to grant it is invisible, the
door permanently 403s, and `npm run check` is green. Or drop `teams:edit`'s door and
a live switch silently becomes a lie again. This base's own recorded lesson is that
a design rule with no check is a preference — and this rule is one line of data
holding up 14 points of this criterion.

**The fix, and it is nearly free:** a test that recomputes the gated pair set off
disk (the script in this report is ~25 lines) and asserts `offered ⊇ gated` and
`gated ⊇ offered − {teams.read}` with the exception named. It is the same shape as
the existing `gating-seam` suites.

### 6 · CRITICAL — "Raised from" is printed on every support ticket and nothing can fill it · **STANDS**
`web/components/help-detail.tsx:221` · `web/components/help-form-dialog.tsx:78-81`
· `shared/workers/tool-catalog.ts:375`

`help.source_screen` is written by both doors, mapped into the API response, and
rendered as a labelled Overview row on every ticket. The create dialog's payload is
`{ description, helpType }` — no third field. The agent tool's schema is
`{ description, helpType, screenRecordingLink }` — `sourceScreen` is not on it
either. **Unfillable from every surface the product has**, while being displayed on
every ticket as an empty row.

Noted for `interfacelessness_review`: the same schema exposes `screenRecordingLink`,
which the **UI** cannot fill — a parity gap pointing the other way.

### 7 · HIGH — the identity half of every audit block is written and never read · **STANDS**
### 8 · HIGH — a whole table is written and read by nothing (`email_change_logs`) · **STANDS**
### 9 · MEDIUM — the assistant can set a field no screen will ever show · **STANDS**
### 10 · MEDIUM — a dropdown value can never move to another list · **STANDS**
### 11 · MINOR — a teamless record path resolves nowhere in a fresh tab · **STANDS**
### 12 · MINOR — four columns awaiting a feature, with nothing saying so · **STANDS**
### 13 · MINOR — two operator states with no screen, now with even more writers · **STANDS**

All seven re-opened this round and unchanged in substance; full detail in
`dead-end-r2.md` findings 6, 7, 8, 11, 12, 13, 14. `AgentView` (round 2's finding 10)
is **CLOSED by deletion**.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** give `selectable/bulk-active` a caller — an agent/MCP tool beside its two siblings | `shared/workers/tool-catalog.ts` (~10 lines) | ADDS one tool definition; REMOVES the last criterion-1 critical | **`security_sentry_review`** — a new mass-write path on the machine surface; neutral only if the siblings' `confirm: true` is copied. **`spend_review` / `scaling_review`** — a bulk deactivate is one statement, so negligible. **`interfacelessness_review`** improves. The cheaper alternative — naming it in MCP.md's exclusion table — is free and hurts nothing, but leaves the door dead |
| **F2** gate `getTeamMetaFeed` on `teams:read` | `workers/tenancy/src/routes/team.ts` (1 line) | ADDS one permission read per team-meta request | **`round_trip_review` / `speed_review`** — one extra D1 read on a hot path, though `requireRight` results are already read per request elsewhere in the same handler chain. **`first_run_review`** — check the Admin role seeds `teams:read` on, or a fresh owner loses their own Overview. That is the real risk and it must be checked before shipping this |
| **F3** delete MCP.md's `set_screen_override` paragraph | `MCP.md` (−8 lines) | REMOVES a phantom capability | none — helps `story_checks_out_review` and `lean_mean_review` |
| **F4** strike through UI-GAPS #8–#11 with the version that shipped them | `UI-GAPS.md` (4 rows) | REMOVES four false "open" claims | none — helps `story_checks_out_review`. It also removes the standing excuse for four capped scores |
| **F5** a test locking `MODULE_RIGHTS_BY_MODULE` against the gated pairs | `web/test/rules.test.ts` or a new `shared` test (~25 lines) | ADDS a check that can fail | **`lean_mean_review`** — 25 more lines of test. Nothing else: it changes no shipped code, and it is the only thing that keeps this round's 22-point gain from silently rotting |
| **F6** add `sourceScreen` to the help create dialog (or stop rendering the row) | `web/components/help-form-dialog.tsx` + `use-screen-actions.ts`, or `help-detail.tsx` | ADDS a field, or REMOVES a display row | **`first_run_review`** — one more field on the first form a new user meets. Removing the row instead is free and loses a real capability. Ask the owner: the column already carries data from nowhere |
| **F7** render `activity.origin` / `verb` on the record Activity tab | 3 detail components + the feed mapper | ADDS a chip per row | **`activity_log_review`** improves (its criterion 5). **`lean_mean_review`** — three near-identical mappings, unless the mapping is hoisted, which is the right shape anyway |

---

## CEILING

**95 is not reachable by changing code, and the block is not a locked decision — it
is arithmetic.** Even with every finding in this report fixed:

```
crit 1  →  90   (kill the critical; the bulk-twins medium and operator minor remain
                 legitimate: a screen for either is a product decision, not a defect)
crit 2  →  91.4 (fix teams.read; block 1 stays 22/28 while five rights have no door
                 that CAN exist — 40 × 22/28 = 31.4 is a permanent 8.6-point floor
                 unless the rubric's denominator is read as "offered")
crit 3  →  79   (the two structural mediums — learning.sequence/required behind a
                 form, screen_recording_link — are real work, not comment edits)
crit 4  →  85   (the audit-identity columns are written by the base's own convention;
                 giving all four a reader is a product feature, not a cleanup)
others  →  100 / 97 / 100 / 90 / 100 / 100
```

```
90×16 + 91.4×14 + 79×12 + 85×12 + 100×11 + 97×11 + 100×8 + 90×6 + 100×6 + 100×4
= 1440 + 1279.6 + 948 + 1020 + 1100 + 1067 + 800 + 540 + 600 + 400
= 9194.6  →  91.9  →  92
```

**True maximum: about 92**, and the last eight points are held by two things a commit
cannot honestly remove:

1. **Criterion 2's block 1 denominator.** Five of 28 cells describe rights whose doors
   *cannot exist* — a teamless person must be able to create their first team; a team
   is never deleted; a ticket is closed not deleted; a conversation is neither edited
   nor deleted. Every one of those is a locked decision in ARCHITECTURE.md
   (deactivate-never-delete) or in the identity model. Scored against the full grid,
   they are permanently unenforced. **Cost: 8.6 × 14 ÷ 100 = 1.2 points, for ever.**
2. **Criterion 4's audit-identity columns.** `editor_id`/`editor_email` and their
   deactivator twins are written by CONVENTIONS.md's own audit-block rule on every
   table. Reading them means a screen that shows an actor's id and email beside their
   name — which `security_sentry_review` would rightly question. The honest options
   are "surface them" or "stop writing them", and the second contradicts a locked
   convention. **Cost: ~1.8 points.**

**What a single commit is worth right now, so the next round can be planned:**
F1 alone takes 70 → 75. F1 + F2 takes it to 78. F1 + F2 + F3 + F4 + F5 takes it to
**80 for roughly forty lines**, and every one of those forty is either a deletion, a
one-liner, or a test.

**One thing could not be verified this run.** The installed `@swift-struck/ui` was
being reinstalled underneath me (two concurrent `npm install` processes; the package
directory was empty for part of the run, and the root-hoisted copy still reads
`0.4.0` against `web/package.json`'s `#v0.16.0`). The library's honouring of
`recipe.gate` and of per-module `rights` is therefore **read from source I saw
earlier in the run rather than re-confirmed at the end**. If 0.16.0's
`PermissionMatrix` ignores the `rights` prop, all 28 cells still render and
criterion 2 falls back to roughly 45 — so this is worth one grep by whoever repairs
next, not a re-run of the review.

---

**The verdict, in one sentence:** removing an unreachable subsystem rather than
finishing it lifted this review's gate for the first time in three rounds — and what
is left is one bulk door nobody can call, one switch enforced only where the
restricted person controls the code, and two documents still describing a world that
was deleted yesterday.
