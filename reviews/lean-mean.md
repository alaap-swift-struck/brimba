# Lean Mean review — Brimba · 2026-08-25
SCORE: 89/100   (previous: 97/100, 2026-08-18)

**Read the delta correctly.** Almost none of the 8-point drop is regression. It is a
re-measure that found things the 18 August pass asserted were absent. That pass wrote
"no dead exports" (Leanness 96) — there are nine, the oldest dead since 12 June. It wrote
"the largest remaining block of near-identical code removed" — three copies of the check it
had just centralised were still sitting one file over, untouched since 8 July. It scored
Robustness 99 in the same paragraph where it wrote *"a green check is not a working law"*
after finding a check blind since birth. One week of growth (+1,293 LOC, one law) explains
maybe 1 point. The rest is that the previous number was not reproducible.

Method: every count below is from git-tracked files only (`git ls-files`), node_modules
excluded, produced by scripts kept in the scratchpad. I did **not** run `npm run check` or
vitest — read-only campaign discipline — so *suite green/red is unmeasured* and nothing here
credits a test for passing, only for existing and for what its source would actually catch.

---

## Baseline counts (all recomputable)

| Measure | Value | How counted |
|---|---|---|
| Tracked source (.ts/.tsx/.mjs/.sql/.css) | **38,248 lines / 296 files** | `git ls-files` + `wc -l` |
| — shared / web / workers / scripts / db | 3,973 / 14,607 / 18,175 / 1,015 / 478 | same, per dir |
| Test code | **8,818 lines / 73 files** | paths under `*/test/` + `web/e2e/` |
| Non-test source | **29,430 lines** | 38,248 − 8,818 |
| Test : non-test ratio | **30.0 %** | 8,818 / 29,430 |
| Runtime dependencies | **0 in 7/7 workers**, 5 in web | each `package.json` |
| TODO / FIXME | **0** | scanner |
| Comment ratio | **21.4 %** (7,209 / 33,670 non-blank) | scratchpad `comments.py` |
| Comment blocks ≥ 18 lines | 26 blocks, 628 lines (**1.9 %** of source) | same |
| Duplicate 8-line windows, product source | **2.31 %** (480 extra / 20,810) | scratchpad `dup.py src 8` |
| Duplicate 8-line windows, tests | **1.48 %** (95 / 6,436) | `dup.py test 8` |
| **Cross-worker duplicate 12-line blocks** | **0** | `dup2.py` over `workers/*/src/` |
| Files > 400 lines | **16 / 296 (5.4 %)** | `wc -l`, tracked only |
| Exports referenced nowhere outside their own file | 63 | scratchpad `dead.py` |
| — of those, referenced **nowhere in the repo at all** | **9 symbols ≈ 200 lines (0.68 %)** | verified one by one with `git grep` |
| Tracked root docs (excl. generated reports) | 9,408 lines / 32 files | `git ls-files` |
| Tracked **generated** review artifacts | **1,700 lines / 10 files** | 4 HTML dashboards + 6 report .md |
| Lint / format config anywhere | **none tracked** | `git ls-files \| grep eslint\|biome\|prettier` |

---

## Arithmetic

Rubric weights (`~/.claude/skills/lean_mean_review/reference/rubric.md`), unmodified:
`overall = 0.12·size + 0.22·robustness + 0.16·docs + 0.20·understandability + 0.15·leanness + 0.15·scalability`

### 1 · Size & Scope — **91** (weight 0.12) · was 94
- 29,430 non-test LOC delivering 7 workers + auth, teams, roles, invites, learning, help desk,
  dropdowns, CSV import, an AI agent, an MCP server, a realtime DO and a static Next app. Dense.
- **16 / 296** files over 400 lines (5.4 %). The largest file in the repo is a **test** (978),
  not product code.
- 0 vendored code, 0 runtime deps in 7/7 workers, 0 abandoned directories.
- ~200 lines (0.68 % of non-test source) unreachable — itemised under Leanness.
- **Trend, and it is the wrong way:** the scanner measured 35,549 → 36,842 LOC in the 7 days
  since the last pass (+1,293) for one law (R25). `web/test/rules.test.ts` went 884 → **978**
  (+11 %) in that same week — after "split it" was the previous pass's **#1** fix item.
- Deduction: −3 for long-file count and the enforcement file compounding against its own advice.

### 2 · Robustness — **87** (weight 0.22) · was 99
Counted controls, 5 clean of 9 measurable (1 unmeasured):

| Control | Result |
|---|---|
| Tests exist and are CI-gated on every push + PR (`npm run check` = tsc ×8 + all 8 workspaces) | ✔ 1/1 |
| Type-checked across all 8 TS projects | ✔ 1/1 |
| Boundary-validation seam (`shared/workers/validate.ts`) with its own lock test | ✔ 1/1 |
| Every enforced law has a *named* check (25/25) | ✔ 1/1 |
| Laws whose check is verified **to exist** by machine | ✘ **0 / 25** |
| Source-scan families hardened against comment-as-code | ✘ **2 / 3** (publish-seam is not) |
| Right-gated workers with exactly **one** implementation of R10 | ✘ **0 / 3** |
| Linter / formatter | ✘ **0 / 1** |
| Suite actually passes | **unmeasured** (not run) |
- Probe result, stated so it is not overclaimed: I simulated the publish-seam scan with and
  without comment stripping across all **78** exported route handlers (tenancy 36, content 19,
  data-ops 23). **0** mutation handlers are satisfied by a comment alone today. The check is
  *fragile*, not currently blind.
- Deduction: −12, driven by the three counted ✘ rows above, all of which sit in the layer the
  base sells as its guarantee.

### 3 · Documentation — **89** (weight 0.16) · was 98
- 32 tracked docs, 9,408 lines. doc : non-test-code = **0.32**. README is a genuine map;
  **5 / 5** superseded plan docs self-mark historical with a forward pointer; 0 dangling refs.
- Comments carry the *why*: 21.4 % ratio but only **1.9 %** in blocks ≥ 18 lines.
- Deduction −9:
  - Each law's text lives in **3** places (RULES.md table · CLAUDE.md bullet · `registry.ts`
    blurb) and is cited in up to **12** files (R14 hits 12). `registry-integrity`
    (`web/test/rules.test.ts:125`) compares only the **ID set** between RULES.md and the
    registry — not the wording — and CLAUDE.md is not checked at all. **1 of 3** law sources
    is unguarded against drift.
  - **10 regenerable review artifacts (1,700 lines)** are tracked in the repo root, while
    `.gitignore:26` excludes `architecture-blueprint.html` as *"regenerable, not source"*.
    1 of 11 regenerable outputs is treated consistently.
  - `RECORD_DETAIL_EXCEPTIONS` is described in BASE-MANUAL.md:391 and UI-CONVENTIONS.md:246 as
    a live escape hatch. Nothing reads it. **1 documented mechanism that does not exist.**

### 4 · Understandability — **91** (weight 0.20) · was 96
- One handler shape across 7 workers, and this is *proved*, not asserted: **0** duplicate
  12-line blocks between any two workers means the shape is shared, never copied.
- Glossary-enforced naming; CLAUDE.md → README → doc map is a first-class agent entry point.
- Deduction −9:
  - `web/test/rules.test.ts` — 978 lines, 24 unrelated law scanners, 4 private parsers
    (`stripComments`, `declarationBody`, `stringLiterals`, `componentFiles`). It is the single
    biggest obstacle to understanding how the laws work, and it grew this week.
  - The deep-link subsystem is **1,370 lines** across 6 files, with a **486-line** component
    inside the 555-line host.
  - A reader must learn the same "read source off disk" parser **three different ways**:
    `stripComments` is defined byte-identically twice (`shared/test/gating-seam.ts:38`,
    `web/test/rules.test.ts:56`), and "index exported functions" exists in 5 copies.

### 5 · Leanness & Optimization — **88** (weight 0.15) · was 96
Strengths, counted: 2.31 % source duplication · 1.48 % test duplication · **0** cross-worker
duplicate blocks · **0** runtime deps in 7/7 workers · 17 shared seams in `shared/workers/`
· `route.ts` already collapsed the ~50-handler opening.

Debt, counted — none of it in product logic, all of it extractable:

| Item | Lines removable |
|---|---|
| 3 publish-seam suites (343) collapsed onto one shared scanner, gating-seam precedent | **−168** |
| — of which a redundant, weaker, July-vintage copy of the R10 check | (72 of the above) |
| — of which 3 copies of one 14-line `indexFunctions` parser | (42 of the above) |
| `stripComments` defined twice, byte-identical | −5 |
| Dialog open/close + `clearDraft` wrapper repeated in 7 form dialogs (~9 lines each) | −50 |
| Dead code (9 symbols, verified unreferenced anywhere) | **−200** |
| **Total, with no capability lost** | **≈ −420 source/test lines** |
| Plus committed regenerable reports | −1,700 doc lines |

Deduction −8. The previous pass claimed "no dead exports"; the oldest of the nine
(`sha256Bytes`) has been dead since **12 June**.

### 6 · Scalability & Structure — **91** (weight 0.15) · was 97
- Layers are clean and the 0 cross-worker duplication is the structural proof:
  `shared/workers` seams → `routes` doors → `lib` logic → `d1-rest` data door.
  Config externalised (`limits.ts`, `registry.ts`, wrangler vars). Adding a module is a written
  checklist; adding a hop between services is one seam (`trace.ts`).
- Deduction −6:
  - The sharding relief valve is **half-wired**. `moveModuleToOwnDatabase` is live behind
    `POST /api/tenancy/admin/move-module`, and `moduleDatabase()` (`shared/workers/gating.ts:154`)
    does redirect a whole module. But the *merged-read* half —
    `queryModule` → `resolveModuleDatabases` + `d1QueryAcross` — has **0 callers**. Three
    functions of structure that have never run. Honestly documented (EDGE-CASES §10), still dead.
  - Platform coupling is total and deliberate — a locked decision, not a defect, but a cap.

### Total

```
0.12×91 + 0.22×87 + 0.16×89 + 0.20×91 + 0.15×88 + 0.15×91
= 10.92 + 19.14 + 14.24 + 18.20 + 13.20 + 13.65
= 89.35  →  89   (Grade B)
```

---

## Findings

### F1 · HIGH — R10 is enforced twice per worker, and the older copy is the weaker one
**Plain English:** the permission-gate check was rewritten and centralised on 12 August. The
three old copies were never deleted, so every right-gated worker now runs two different
versions of the same security law — and the leftover version is missing both of the
protections the new one was written to add.

- `workers/tenancy/test/publish-seam.test.ts:88–123` (36 lines)
- `workers/data-ops/test/publish-seam.test.ts:96–114` (19 lines)
- `workers/content/test/publish-seam.test.ts:90–106` (17 lines)
- vs the canonical `shared/test/gating-seam.ts` (added 2026-08-12, commit `5c37db4`)

The leftovers were last touched **2026-07-08** (`8592c6e`) — a month before the collapse.
They use `const GATED_RE = /require\w*Right|\bgated|adminGuard/` against **unstripped** source.
The shared file's own header states why that is wrong: *"a handler whose real gate was DELETED
stayed green, satisfied by prose thirty lines below"*, and *"the leading boundary is
load-bearing"*. Neither hardening is present in any of the three copies.

**Why it matters:** two divergent implementations of one law read as *double* coverage and are
actually *split* coverage. This is precisely the failure the shared file was created to end, one
file over. It is also the exact pattern the campaign brief warns reviewers about.

**Fix:** delete the three R10 blocks (72 lines). The hardened `describeGatingSeam` already covers
all three workers via `workers/{tenancy,content,data-ops}/test/gating-seam.test.ts`. Verify
coverage is identical before deleting — the tenancy leftover carries an `IDENTITY_GATED` set of 4
routes that must already be mirrored in `gating-seam.test.ts`'s `identityGated` map (it is:
bootstrap, switch-team, teams, invitations/accept).

### F2 · HIGH — R1, the base's first law, is scanned without the hardening its sibling documents
**Plain English:** the check that guarantees "every mutation publishes a live change" reads the
handler's source and greps it, including its comments. This codebase comments heavily and its
comments discuss `publishChange` constantly.

`workers/{tenancy,content,data-ops}/test/publish-seam.test.ts` — `indexFunctions()` slices
`code.slice(m.index, starts[i+1]?.index ?? code.length)` (the last function in a file runs to
EOF) and `PUBLISH_RE` is tested against raw source. No `stripComments`.

**Measured, not assumed:** I re-ran the scan with and without stripping over all 78 exported
handlers. **0** mutation handlers currently pass on a comment alone. So this is a latent defect,
not a live blindness — but it is one comment away, in the check protecting the law CLAUDE.md
lists first.

**Fix:** fold it into F3 — a shared `describePublishSeam` that reuses the already-written
`stripComments` from `shared/test/gating-seam.ts`.

### F3 · MEDIUM — the publish-seam family is the duplication the gating-seam collapse was supposed to end
343 lines across three near-identical files sharing one byte-identical 14-line parser. The
gating-seam precedent shows the target shape exactly: a 117-line shared scanner plus 16–26 line
per-worker callers. Applying it here yields ~175 lines — **−168**, and it makes `MUTATING_WORKERS`
(F5) a live constant instead of a dead one.

**Files:** `workers/{tenancy,content,data-ops}/test/publish-seam.test.ts` → new
`shared/test/publish-seam.ts` + three thin callers.

### F4 · MEDIUM — 200 lines of code nothing can reach
Each verified with `git grep` across every tracked file, not just TypeScript:

| Symbol | Location | Status |
|---|---|---|
| `AgentView` | `web/components/agent-view.tsx:27` | 58-line component; **the file is imported by nothing**. Its own header says *"the panel simply never mounts an AgentView"*. Dead since 2026-06-23. |
| `queryModule` → `resolveModuleDatabases` + `d1QueryAcross` | `workers/tenancy/src/lib/sharding.ts:177,151`; `shared/workers/d1-rest.ts:116` | ~69 lines. The whole merged-read chain is rooted at `queryModule`, which has 0 callers. Documented in EDGE-CASES §10. |
| `cheapText` | `workers/data-ops/src/lib/model.ts:382` | ~12 lines. Referenced only in prose (OPERATIONS.md, AGENT-MODULES-PLAN.md). |
| `sha256Bytes` | `workers/auth/src/lib/crypto.ts:14` | ~6 lines. Dead since **2026-06-12**. |
| `openAgent` | `web/lib/agent-open.ts:48` | 3 lines wrapping `setAgentOpen(true)`; every caller uses `setAgentOpen` directly. |
| `MUTATING_WORKERS` | `shared/rules/registry.ts:278` | see F5 |
| `RECORD_DETAIL_EXCEPTIONS` | `shared/rules/registry.ts:287` | see F6 |
| `ImportSession`, `GlossaryKey`, `ConceptKey` | `shared/types.ts:263`, `shared/glossary.ts:38`, `web/lib/pages.ts:90` | dead types |

`AgentView` and `cheapText` are *deliberate* forward hooks — both documented. That makes them
speculative generality rather than accidents, which is a smaller sin, not none: the merged-read
path is the cautionary example, three functions that have never executed guarding a valve the
mover half of which is already live.

### F5 · MEDIUM — a constant whose comment says "track it here", that nothing reads
`shared/rules/registry.ts:278` — `MUTATING_WORKERS = ["tenancy","content","data-ops"]`, commented
*"A new mutating worker without a publish-seam test is a gap — track it here."* **0 consumers.**
No test asserts that each entry has a publish-seam suite. Combined with F7, deleting a seam suite
outright would leave the whole build green.

**Fix:** F3's shared scanner should iterate `MUTATING_WORKERS` and assert each worker's suite file
exists. That converts a dead constant into the guarantee its comment already claims.

### F6 · LOW — a documented escape hatch that is not wired
`shared/rules/registry.ts:287` — `RECORD_DETAIL_EXCEPTIONS` is empty and read by nobody. The R2
check (`web/test/rules.test.ts:136`) iterates `RECORD_DETAIL_COMPONENTS` only. BASE-MANUAL.md:391
and UI-CONVENTIONS.md:246 both cite it as a working reviewed-bypass mechanism. Adding an entry
today would have no effect and the check would still fail. Fails closed, so harmless — but two
docs describe a lever that is not connected.

### F7 · LOW — the meta-law is a spelling test, not a proof
`web/test/rules.test.ts:941` — *"every enforced law has a known check"* compares each registry
`checkId` against a **hard-coded set of 26 strings**. It never asserts the corresponding test file
exists or runs. Delete `workers/content/test/publish-seam.test.ts` and `registry-integrity` stays
green. The keystone guarantee — *"a law cannot be added without its check"* — is name-matching.

**Fix:** map each `checkId` to a file path and `existsSync` it. ~15 lines.

### F8 · LOW — the FormShell seam stops one layer short of where its own argument points
`web/components/form-shell.tsx:11` states the principle: R22 lives here *"for the same reason the
layout does — a module should get the behaviour by declaring one thing, and a screen should not be
able to forget it."* Yet the `<Dialog open onOpenChange={o => { if (busy) return; if (!o)
clearDraft(); onOpenChange(o) }}><DialogContent>` wrapper is re-typed in **7** dialogs
(`create-team`, `help-form`, `invite`, `learning-form`, `role-form`, `team-edit`,
`selectable-form`) — the largest duplicate block in the product source (6 copies at an 8-line
window). Each screen independently remembers the busy-guard and the discard-on-dismiss.

**Fix that stays in-Law:** fold the Dialog + DialogContent + busy/clearDraft wrapper **into
FormShell**. Do *not* extract a separate `FormDialog` component — `forms-use-formshell`
(`rules.test.ts:152`) asserts each dialog's source `.toContain("form-shell")`, so moving FormShell
behind a wrapper turns R4 red. Absorbing into FormShell keeps every dialog importing `form-shell`
and `useFormDraft`, so R4 and R7 both stay green. ~−50 lines.

### F9 · LOW — 1,700 lines of regenerable review output committed to the repo root
10 tracked files: `activity-log-review.{md,html}`, `architecture-review.{md,html}`,
`interface-lessness-report.{md,html}`, `lean-mean-report.{md,html}`, `ocean-review.md`,
`security-report.md`, `story-review.md` — while `.gitignore:26` excludes
`architecture-blueprint.html` for being *"regenerable, not source"*. The rule exists and is
applied to 1 of 11 candidates. This campaign is about to add 16 more under `reviews/`, which
LEDGER.md already plans to delete wholesale — the same treatment the root artifacts never got.

### F10 · LOW — no formatter or linter anywhere
No `eslint`, `biome`, `prettier` or `.editorconfig` is tracked in any workspace. Types + tests
carry the whole load. Style consistency is currently a human habit, and it is a *good* habit —
but it is unenforced, in a repo where 25 other invariants are machine-checked.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** delete the 3 stale R10 blocks | `workers/{tenancy,content,data-ops}/test/publish-seam.test.ts` | **−72 test lines**, removes a second (weaker) implementation of a security law | **security_sentry** will see a security assertion deleted and may score it as lost coverage. It is not: the hardened `describeGatingSeam` covers all three workers with strictly stronger regexes. **Reconcile by having security_sentry confirm route-for-route equivalence before the delete**, not after. Neutral to everyone else. |
| **F2+F3** one shared `describePublishSeam` | new `shared/test/publish-seam.ts` (+~100); 3 callers shrink to ~25 each | **net −168 test lines**, adds `stripComments` to R1's scan | **architecture_review**: adds one more `shared/test/*` import edge from 3 workers — the same edge `gating-seam` already created, so no new direction of coupling. **realtime_review** depends on R1 being enforced; this strengthens it. No cost anywhere. |
| **F4** delete 200 lines of unreachable code | `web/components/agent-view.tsx` (whole file), `workers/tenancy/src/lib/sharding.ts`, `shared/workers/d1-rest.ts`, `workers/data-ops/src/lib/model.ts`, `workers/auth/src/lib/crypto.ts`, `web/lib/agent-open.ts`, `shared/types.ts`, `shared/glossary.ts`, `web/lib/pages.ts` | **−200 lines** | **scaling_review** will object to removing the merged-shard read path — it is a named relief valve in SCALING.md. **Real tension, and scaling should win on that one item**: keep `queryModule`/`resolveModuleDatabases`/`d1QueryAcross` (69 lines) and delete the other ~130. **dead_end_review** will independently find `AgentView` — coordinate so it is deleted once, not twice. **story_checks_out** must drop the OPERATIONS.md/AGENT-MODULES-PLAN.md sentences about `cheapText` in the same commit or a doc goes dangling. |
| **F5** make `MUTATING_WORKERS` assert its suites exist | `shared/test/publish-seam.ts` (in F3) | **+~8 lines**, converts a dead constant to a live guard | none — it rides inside F3's net −168, so leanness still falls. |
| **F6** delete `RECORD_DETAIL_EXCEPTIONS` + its 2 doc mentions | `shared/rules/registry.ts`, `BASE-MANUAL.md:391`, `UI-CONVENTIONS.md:246` | **−1 line code, −2 doc claims** | **story_checks_out** — it is *removing* a stale claim, which helps that review. But if story_checks_out instead proposes *wiring* the hatch (making the R2 check honour it), that ADDS ~6 lines and a bypass door. **Prefer deletion**: the field has been empty since 2026-07-06 and fails closed. |
| **F7** make the meta-check `existsSync` each check file | `web/test/rules.test.ts:941` | **+~15 lines** | Costs **lean_mean** (this review) ~0.2 points and pushes `rules.test.ts` to ~993 lines — **it is worth it**, and it is the one addition I actively want. Neutral elsewhere. |
| **F8** absorb the Dialog wrapper into FormShell | `web/components/form-shell.tsx` (+~15), 7 dialogs (−~9 each) | **net −50 lines** | **first_run_review / round_trip_review** exercise these dialogs — behaviour must not change (busy-guard and discard-on-dismiss are load-bearing). **R4 and R7 stay green only if FormShell absorbs the wrapper rather than a new `FormDialog` wrapping FormShell** — see F8 above; the wrong shape turns `forms-use-formshell` red. |
| **F9** untrack the 10 generated root reports | `.gitignore`, `git rm --cached` ×10 | **−1,700 tracked doc lines** | **mac_fell_in_the_ocean_review** scores what a stranger can recover from the remote — deleting evidence of past audits could read as lost history. **Genuine tension.** Resolve by keeping their *conclusions* where LEDGER.md already says durable output belongs (RULES.md, the registry, a test, a doc) and untracking only the rendered artifacts. |
| **F10** add a formatter (e.g. prettier, config only) | 1 config file + a `check` script step | **+~10 lines config**, +1 CI step | Costs **speed_review** a few seconds of CI. Costs **spend_review** nothing (CI minutes are already spent on tsc ×8). If anyone proposes a full **eslint** ruleset instead, that is +1 config +~40 dependency packages — **that one I would refuse**: 7 workers currently have *zero* runtime and near-zero dev deps, which is a headline strength. Formatter yes, linter-with-plugin-tree no. |
| **F(none)** split `rules.test.ts` into 3 files | `web/test/rules.test.ts` → `rules-arch/ui/data.test.ts` | **±0 lines**, 978 → 3×~330 | none — pure redistribution. It is the previous pass's #1 item, still undone, and it raises Understandability and Size at zero LOC cost. **Do this before anyone adds R26.** |

### What this codebase can absorb — the numbers 15 other reviews need

The prime directive is "too much code is a defect", but the scoring does **not** react to raw
LOC. It reacts to *copies* and to *files that get long*. Concretely:

- **New code that reuses an existing seam is free — genuinely unlimited.** Adding N non-duplicating
  lines grows the denominator, so the 2.31 % duplicate ratio and the 0.68 % dead-code fraction both
  *fall*. Leanness goes up.
- **Copy-pasted code has a hard budget of ≈ 550 lines.** Duplication would have to reach ~5 % to drop
  Leanness a band: (0.05 − 0.0231) × 20,810 ≈ 560 lines. **The three publish-seam suites already
  spend 210 of that budget.** A fourth per-worker copy of anything is the single most expensive
  thing anyone can propose.
- **Tests are free if they go through a shared scanner, expensive if they are per-worker copies.**
  The gating-seam precedent is the contract: one shared `describeXSeam` + callers of ≤ 26 lines.
  A review that wants "a test per worker" should be pointed at `shared/test/gating-seam.ts` first.
- **Logging is free.** `shared/workers/activity.ts`, `error-log.ts`, `account-activity.ts` all exist;
  a new call site is 1–3 lines and duplicates nothing. A *new logging module* would cost.
- **Indexes are free here** (one line in a `db/` migration) — they cost storage and spend, not lean.
- **A new seam is net-negative LOC if it replaces ≥ 3 call sites, and speculative generality if it
  replaces 1.** The merged-shard read path is the in-repo cautionary example: 69 lines, 0 callers,
  never executed.
- **New laws are the expensive kind, and 15 reviews are about to propose them.** R25 cost +1,293 LOC
  in one week; each law costs ~40 lines in `rules.test.ts` + ~12 in the registry + edits in 3+ docs
  (RULES.md, CLAUDE.md, and whichever manual). `rules.test.ts` is 978 lines *now*. **Roughly 3 more
  laws before it passes 1,100 and Understandability drops another band** — unless it is split first,
  which costs zero lines. **Split before R26.**
- **New docs:** a new *canonical* doc is fine. A new *restatement* of an existing law costs
  Documentation, because the law text already lives in 3 places with only ID-level drift protection.

**How much new code can the score survive?** If every addition reuses seams: effectively all of it —
the score would *rise*. If the campaign lands 16 fixes averaging 1 new per-worker test copy and 1 new
law each, that is roughly +1,600 lines of which ~600 is duplication, and this review lands near **82**.
The difference between those two outcomes is entirely whether additions go through a shared seam.

---

## CEILING

**Is 95 reachable by changing code? Yes — but only just, and only if the enforcement layer is
refactored rather than extended.**

Per-dimension true maxima:

| Dimension | Today | Reachable by commit | Capped by |
|---|---|---|---|
| Size & Scope | 91 | **95** | Reachable, but needs the deep-link host (555) and `api.ts` (573) split — declined as "not urgent" by the last two passes. Splitting `rules.test.ts` alone gets ~94. |
| Robustness | 87 | **97** | Every fix (F1, F2, F3, F5, F7, F10) is a commit. Nothing structural blocks it. |
| Documentation | 89 | **95** | **Partly capped by a project mandate.** CLAUDE.md is required to restate the laws — it is the agent entry point — so triple-statement is structural, not sloppy. A commit *can* fix the drift protection (extend `registry-integrity` to compare CLAUDE.md's bullet text) and untrack the generated reports. |
| Understandability | 91 | **95** | Reachable; splitting `rules.test.ts` is the whole lever. |
| Leanness | 88 | **96** | Every fix is a commit. |
| Scalability & Structure | 91 | **94** | **Capped below 95 by a locked decision.** ARCHITECTURE.md locks Cloudflare Workers + per-team D1 over the REST door + the Durable Object. Platform coupling is total and deliberate; a commit cannot decouple it without relitigating a locked decision, and I am not proposing that. The half-wired shard split is likewise a locked "build the valve up front" choice. |

`0.12×95 + 0.22×97 + 0.16×95 + 0.20×95 + 0.15×96 + 0.15×94 = 95.44 → **95**`

So the campaign's 95 benchmark is achievable for this review, with **0.44 points of slack** — and
that slack is smaller than the cost of a single new law. Two conditions:

1. **`web/test/rules.test.ts` must be split before any review adds a law.** At 978 lines it already
   costs Size and Understandability; each further law costs ~40 more.
2. **No fix may add a per-worker copy of anything.** The 550-line duplication budget is real and
   210 of it is already spent. Every "add a check per worker" proposal must land as one shared
   scanner plus thin callers, or this review falls below 95 no matter what else is repaired.

One thing a commit cannot fix and 95 does not require: this is a single-author base. Nothing in
this review's arithmetic depends on that, but it is why "the previous number was not reproducible"
matters more here than it would elsewhere — there is no second reader between a claim and the score.
