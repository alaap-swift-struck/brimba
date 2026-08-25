# Lean Mean review — Brimba · 2026-08-25 · ROUND 2
SCORE: 91/100 (Grade A)   (round 1: 89/100 · the 2026-08-18 pass claimed 97)

## DELTA

Round 1: **89**/100 → Round 2: **91**/100

| Criterion | Wt | R1 | R2 | Why it moved |
|---|---|---|---|---|
| Size & Scope | 0.12 | 91 | **90 ▼** | `rules.test.ts` 978 → **1,068** (+90) after being named the #1 split target, and it grew for checks rather than laws. `roles.ts` crossed 400 (360 → 411) on the privilege-amplification fix. Files > 400: 16 → 17. **Full finding at F-DOWN below.** |
| Robustness | 0.22 | 87 | **93 ▲** | The three duplicate R10 blocks are gone (0/3 → **3/3** workers with exactly one R10 implementation). auth went from **zero** R10 coverage to 5/5 workers covered. One canonical source reader now exists **and is itself under test** (`shared/test/source.ts` + `web/test/source.test.ts`). The root error boundary is actually mounted. Held back: the meta-check is still name-matching, and **6 of 8 law-scan families still use a reader with a known bug**. |
| Documentation | 0.16 | 89 | **92 ▲** | Three doc facts moved from prose into machine checks: law ranges across **every** root `.md` (was one file), BOOTSTRAP's migration counts derived from disk, MCP.md's exclusion table checked against `MCP_TOOLS`. Offset by 20 more tracked regenerable files under `reviews/` (transient) and the `RECORD_DETAIL_EXCEPTIONS` phantom still documented in three places. |
| Understandability | 0.20 | 91 | **91 =** | Two large opposite moves cancel. WIN: the "learn the same parser three ways" complaint is largely answered — four private parsers deleted from `rules.test.ts`, six files now share one documented module. LOSS: `stripComments` copies went **2 → 3**, and the two survivors are the *old broken text* sitting beside the new correct one. Plus `rules.test.ts` is longer and still unsplit. |
| Leanness | 0.15 | 88 | **90 ▲** | The pass added ~1,020 lines and moved duplication by **essentially zero** (src 0.99 % → 0.99 %; tests 1.51 % → **1.39 %**). One whole copy cluster retired. Dead code barely moved: **8 of 9** symbols survive, only `sha256Bytes` removed. |
| Scalability & Structure | 0.15 | 91 | **92 ▲** | Imports now route through `forwardToDoor` (one door, not direct writes); the orphan sweep is keyset-paged and fail-closed. Nothing regressed. Still capped by the locked platform decision. |

**Exactly one criterion fell: Size & Scope, by 1 point.** It is caused by two repairs I would keep — the three new `rules.test.ts` checks and the privilege-amplification guard. The cost is real, small, and entirely avoidable by a free refactor (see F-DOWN).

---

> ## ⚠ LATE NOTE — F1 was fixed in the working tree DURING this review
>
> Everything below is measured against commit **`fe7d683`**, the state the ROUND2 brief names. While
> I was writing, a concurrent session applied **exactly the F1 fix** as uncommitted working-tree
> changes:
>
> - `shared/test/gating-seam.ts` −8: local `stripComments` deleted, now
>   `import { declarationBody, stripComments } from "./source"`
> - `workers/mcp/test/gating-seam.test.ts` −4: same, now imports from `../../../shared/test/source`
> - `git grep "function stripComments"` now returns **exactly one** hit (`shared/test/source.ts:74`)
>
> **F1 is closed.** Do not re-file it or re-apply it. I have deliberately **not** rescored against a
> moving working tree — the delta table compares two commits. Had I scored the working tree,
> Robustness would read *3 of 8* law-scan families on the correct reader instead of 2, and
> Understandability would gain back the "three `stripComments`, two of them stale" loss, taking it to
> ~92 and the total to ~91.7. **F2 (the three publish-seam suites) and `web/test/rules.test.ts` are
> untouched** — confirmed by `git status`. The two headline items below still stand.

## Method, and one correction to my own round-1 numbers

Every number below was produced twice by **the same script**: once against `HEAD`, once against
`8751e30` (the round-1 baseline), extracted read-only into the scratchpad with `git archive`. That
makes the *delta* trustworthy independent of whether my script matches round 1's, which matters
because round 1's scripts no longer exist.

**Two round-1 figures do not reproduce, and I am correcting them rather than defending them:**

1. **Round 1 reported product-source duplication as "2.31 % (480 extra / 20,810)".** Rebuilt with two
   different normalizations, the same tree measures **0.99 % (208 extra / 21,026)**. The *test*
   figure reproduces almost exactly (round 1: 95 / 6,436 — mine: 97 / 6,436, identical denominator),
   so the normalization is right and the src number was wrong. **The "≈ 550-line copy-paste budget"
   in round 1 was derived from that wrong figure.** Corrected budget below.
2. **Round 1 reported "0 cross-worker duplicate 12-line blocks"** and used it as proof that "the
   handler shape is shared, never copied". It is **not 0**. `async function send(...)` is duplicated
   verbatim — 21 lines, differing only in a trace label — between
   `workers/tenancy/src/lib/notify.ts:24` and `workers/content/src/lib/notify.ts:55`. Present in
   **both** trees, so this is a correction, not a regression.

I did **not** run `npm run check` or vitest (read-only campaign discipline, same as round 1). *Suite
green/red is unmeasured.* Nothing here credits a test for passing — only for existing, and for what
its source would actually catch.

---

## Baseline counts — R1 vs R2, same script both times

| Measure | R1 (`8751e30`) | R2 (`fe7d683`) | Δ |
|---|---|---|---|
| Tracked source (.ts/.tsx/.mjs/.sql/.css) | 38,248 / 296 files | **39,231 / 299 files** | +983 / +3 |
| — test code (`*/test/`, `web/e2e/`) | 8,818 / 73 | **9,413 / 76** | **+595 / +3** |
| — non-test source | 29,430 | **29,818** | **+388** |
| Test : non-test ratio | 30.0 % | **31.6 %** | +1.6 pt |
| `it()` blocks | 571 | **586** | +15 |
| Repair-pass diff, excluding `reviews/` | — | **+1,336 / −316 = +1,020** | 41 files |
| — of that, docs (`.md`) | — | +37 | |
| Runtime deps in workers | 0 in 7/7 | **0 in 7/7** | = |
| TODO / FIXME | 0 | **0** | = |
| Comment ratio | 21.7 % (7,612 / 35,074) | **22.3 %** (8,015 / 36,001) | +0.6 pt |
| Comment blocks ≥ 18 lines | 31 blocks / 747 lines (2.1 %) | **33 / 789 (2.2 %)** | +2 |
| Dup 8-line windows, product src | 208 extra / 21,026 = **0.99 %** | 211 / 21,242 = **0.99 %** | **flat** |
| Dup 8-line windows, tests | 97 / 6,436 = **1.51 %** | 94 / 6,744 = **1.39 %** | **−0.12 pt** |
| Cross-worker dup 12-line blocks | 5 windows (1 function) | **5 windows (1 function)** | = |
| Files > 400 lines | 16 / 296 | **17 / 299** | +1 |
| `web/test/rules.test.ts` | 978 lines, 24 checks | **1,068 lines, 27 checks** | **+90 / +3** |
| Dead-everywhere symbols (verified by hand) | 9 (~200 lines) | **8 (~192 lines)** | −1 |
| `stripComments` implementations | 2 | **3** | **+1** |
| `indexFunctions`-style parsers | 5 | **4** | −1 |
| Law-scan families using a *correct* reader | **0 / 8** | **2 / 8** | +2 |
| Linter / formatter config | none | **none** | = |
| Tracked regenerable review artifacts | 11 files / 1,700 lines | **31 files / 11,288 lines** | +20 / +9,588 |

---

## Arithmetic

Rubric weights (`~/.claude/skills/lean_mean_review/reference/rubric.md`), unmodified:
`overall = 0.12·size + 0.22·robustness + 0.16·docs + 0.20·understandability + 0.15·leanness + 0.15·scalability`

### 1 · Size & Scope — **90** (weight 0.12) · was 91 · **▼ 1**

- Non-test source grew **+388 lines (+1.3 %)** for: a privilege-escalation fix, five correctness
  fixes, a keyset-paged orphan sweep, `forwardToDoor`, and central crash recording in two workers.
  That is dense, high-value growth. Test grew **+595 (+6.7 %)** for +15 checks — ~40 lines per check,
  reasonable for source scanners.
- 0 TODO/FIXME · 0 runtime deps in 7/7 workers · 0 vendored code · 0 abandoned directories — all held.
- **The deduction, and it is the same one as round 1, one week worse:** `web/test/rules.test.ts` went
  **978 → 1,068** (+9.2 %) while the repo grew 2.6 %. It now holds **27 unrelated law scanners** at a
  mean of 38 lines each. Splitting it was round 1's **#1** item and the 18-August pass's #1 item
  before that. It has now been the top item for three consecutive reviews and has grown both times.
- Files > 400: 16 → 17. The one that crossed is `workers/tenancy/src/lib/roles.ts` (360 → **411**),
  from the privilege-amplification guard — a repair I would keep.
- Deduction: −10 (was −9). One point, entirely the long-file trend.

### 2 · Robustness — **93** (weight 0.22) · was 87 · **▲ 6**

Counted controls. R1's own table had 9 measurable rows; two rows below did not exist as controls in
round 1 and are marked NEW, so read the totals as "8 of 11 clean" against "4 of 10".

| Control | R1 | R2 |
|---|---|---|
| Tests exist and are CI-gated (`npm run check` = tsc ×8 + 8 workspaces) | ✔ 1/1 | ✔ 1/1 |
| Type-checked across all 8 TS projects | ✔ 1/1 | ✔ 1/1 |
| Boundary-validation seam (`shared/workers/validate.ts`) with its own lock test | ✔ 1/1 | ✔ 1/1 |
| Every enforced law has a *named* check | ✔ 25/25 | ✔ 25/25 |
| Workers with state-changing doors covered by an R10 seam | ✘ **4/5** (auth: zero) | ✔ **5/5** |
| Right-gated workers with exactly **one** implementation of R10 | ✘ **0/3** | ✔ **3/3** |
| ONE canonical source reader, itself under test — NEW | ✘ 0/1 (3 readers, all with the bug) | ✔ **1/1** |
| Law source-scan families using the correct reader — NEW | ✘ **0/8** | ✘ **2/8** |
| Root error boundary actually rendered — NEW | ✘ 0/1 (imported, never mounted) | ✔ **1/1** |
| Laws whose check is machine-verified **to exist** | ✘ 0/25 | ✘ **0/25** |
| Linter / formatter | ✘ 0/1 | ✘ 0/1 |
| Suite actually passes | unmeasured | **unmeasured** |

**Probe, stated so nothing is overclaimed.** I re-ran round 1's blindness probe over all **78**
exported route handlers in tenancy/content/data-ops, comparing what the R1 publish-seam check reads
against a correctly-bounded, comment-stripped body:
- handlers satisfied **only** by neighbouring code the over-wide slice swallowed: **0**
- handlers satisfied **only** by a comment: **0**

And for the R10 seams: of the **13** files they read, **0** currently carry the pattern that breaks
the surviving `stripComments`. Repo-wide, **22 of 272** `.ts/.tsx` files do. So both are **fragile,
not blind** — exactly as in round 1. The difference is that in round 1 the excuse was "the correct
seam does not exist yet". It exists now, six files use it, and R1's and R10's own suites do not.

Deduction: −7, driven by the three ✘ rows — and two of them sit on the base's first law and its
security law.

### 3 · Documentation — **92** (weight 0.16) · was 89 · **▲ 3**

- doc : non-test-code = 9,497 / 29,818 = **0.32** (unchanged). README is still a genuine map.
- **The best thing that can happen to this score happened three times:** a fact that lived in prose
  is now machine-checked.
  - `registry-integrity` (`web/test/rules.test.ts:52`) now walks **every** root `.md` for a stale
    `R1–Rn` range, not just `RULES.md`. Round 1 counted "1 of 3 law sources unguarded against drift";
    the *range* half is now guarded in all of them, including CLAUDE.md.
  - `runbook-migrations-current` (`:806`) derives BOOTSTRAP.md's migration counts from disk.
  - MCP.md's exclusion table is now checked against `MCP_TOOLS`.
- **Round 1 was too generous here and the repair proved it.** I wrote "0 dangling refs". Five
  documents were simultaneously stating five different law ranges, and MCP.md was false about three
  live tools. My scan looked for broken links, not for false claims.
- Deduction −8:
  - **Law *wording* is still unchecked.** Each law's text lives in 3 places (RULES.md table ·
    CLAUDE.md bullet · `registry.ts` blurb). Only the ID set and the numeric range are compared.
  - `RECORD_DETAIL_EXCEPTIONS` (`shared/rules/registry.ts:295`) is still empty, still read by nobody,
    and still described as a live escape hatch in **three** docs (BASE-MANUAL.md:391,
    UI-CONVENTIONS.md:246, UI-GAPS.md). Round 1's F6, unaddressed.
  - Tracked regenerable output went **11 files / 1,700 lines → 31 files / 11,288 lines**, while
    `.gitignore:26` still excludes `architecture-blueprint.html` for being "regenerable, not source".
    Counted as −1 only, because `reviews/` is transient by LEDGER.md's own plan; the **11 root files
    are not transient** and have been tracked for weeks.

### 4 · Understandability — **91** (weight 0.20) · was 91 · **= flat**

Two large moves in opposite directions, and they cancel. I am reporting both rather than netting them
into a number that hides either.

**The win — round 1's biggest Understandability complaint is largely answered.**
`shared/test/source.ts` (241 lines) is one documented module with a header naming the eight faults
that produced it. Six files import it. All **four** private parsers are gone from `rules.test.ts`
(`grep '^function ' web/test/rules.test.ts` now returns nothing). `indexFunctions`-style parsers went
5 → 4. For the LLM-agent audience this rubric names, a module whose header explains *why the previous
version was wrong* is worth more than the lines it costs.

**The loss — a new contradiction, in the same repo, under the same name.** `stripComments` now has
**three** implementations:

| Where | Implementation | Guards |
|---|---|---|
| `shared/test/source.ts:74` | correct character scanner, string-aware | `rules.test.ts` (23 laws), auth R10, activity-seam, error-seam, retention |
| `shared/test/gating-seam.ts:40` | **the old two-regex version, block pass first** | **R10 on tenancy, content, data-ops** |
| `workers/mcp/test/gating-seam.test.ts:18` | **the same old two-regex version** | **R10 on the external MCP surface** |

`shared/test/gating-seam.ts` *imports* `declarationBody` from `./source` on line 32 and then defines
its own competing `stripComments` on line 40. A reader who follows the import finds a header saying
the local implementation is a bug, and the local implementation still there. That is worse than one
wrong copy.

**Unmoved:** `rules.test.ts` at 1,068 lines with 27 unrelated checks; the deep-link subsystem
(1,130 lines / 4 files, a 397-line component beside a 555-line host).

### 5 · Leanness & Optimization — **90** (weight 0.15) · was 88 · **▲ 2**

**The headline, and it is the strongest single signal in this report: the repair pass added ~1,020
lines and moved duplication by zero.**

| | R1 | R2 |
|---|---|---|
| product-src duplicate 8-line windows | 208 / 21,026 = 0.99 % | **211 / 21,242 = 0.99 %** |
| test duplicate 8-line windows | 97 / 6,436 = 1.51 % | **94 / 6,744 = 1.39 %** |
| multi-file copy clusters | **3** | **2** |
| redundant copied lines in the publish-seam cluster | ~210 | **92** |

The three publish-seam suites went 343 → 268 lines; measured directly, **46 code lines are identical
in all three** → 92 redundant copies (down from ~210). One whole cluster — the three duplicate R10
blocks — is retired.

**The new per-worker suite is genuinely bespoke, not a copy — I checked, because round 1 said this was
the single most expensive thing anyone could propose.** `workers/auth/test/gating-seam.test.ts` (88
lines) and `workers/mcp/test/gating-seam.test.ts` (80 lines) both parse a `switch` rather than a
`ROUTES` table, but they share **6 identical lines** (four of them `import` and `}`) and **zero**
4-line windows. Auth genuinely diverges — a switch instead of a table, `getSessionUser` instead of
`whoAmI`, and gates that `requireRight` cannot express. Round 1's warning was honoured.

Debt, counted, all of it extractable and none of it in product logic:

| Item | Lines removable | Change since R1 |
|---|---|---|
| 3 publish-seam suites (268) onto one shared scanner, gating-seam precedent | **−130** | was −168 |
| 2 stale broken `stripComments` copies deleted in favour of `source.ts` | −8 | **NEW (+1 copy)** |
| `send()` duplicated across tenancy/content `notify.ts` | −21 | **NEW (R1 missed it)** |
| Dialog open/close + `clearDraft` wrapper in 7 form dialogs | −50 | unchanged |
| Dead code, 8 symbols verified unreferenced in any `.ts/.tsx/.mjs` | **−192** | was −200 |
| — of which **ruled to stay**: `queryModule` chain (69, scaling wins) + `AgentView` (58, owner's call) | (127) | reconciled |
| — genuinely actionable dead code | **−65** | |
| **Total, no capability lost, honouring the reconciliation** | **≈ −274 lines** | was ≈ −420 |
| Plus committed regenerable reports | −1,700 root doc lines | unchanged |

Deduction −10. Only **one** of the nine dead symbols was removed (`sha256Bytes`, dead since 12 June),
and `MUTATING_WORKERS` (round 1's F5) is still a constant whose own comment says "track it here" that
nothing reads.

### 6 · Scalability & Structure — **92** (weight 0.15) · was 91 · **▲ 1**

- Two real structural wins: imports now go through **`forwardToDoor`** (one gated door instead of
  direct writes — a seam replacing N call sites, the good kind), and the nightly orphan sweep is
  keyset-paged and fail-closed instead of capped.
- `shared/test/` is now a proper two-module layer (`source.ts` → `gating-seam.ts`), which is the right
  direction — spoiled only by the half-migration noted in F1.
- The merged-shard read chain stays dead by reconciliation (SCALING.md names it a relief valve;
  scaling wins). Unchanged, and correctly so.
- Deduction −8: platform coupling is total and deliberate (a locked ARCHITECTURE.md decision, a cap
  not a defect), and the shard-split valve is still half-wired by the same locked choice.

### Total

```
0.12×90 + 0.22×93 + 0.16×92 + 0.20×91 + 0.15×90 + 0.15×92
= 10.80 + 20.46 + 14.72 + 18.20 + 13.50 + 13.80
= 91.48  →  91   (Grade A)
```

---

## Findings

### F-DOWN · the one criterion that fell — Size & Scope 91 → 90

**Which repair caused it:** the three new checks added to `web/test/rules.test.ts` by commits
`73a60a4` / `e6676c5` / `fe7d683`, plus `workers/tenancy/src/lib/roles.ts` crossing 400 lines on the
privilege-amplification guard in `3cd3e14`.

- `web/test/rules.test.ts` **978 → 1,068** (+90 net: +186 added, −96 of deleted private parsers).
  Three new checks: `mutation-returns-row: the single-row reader reads ONE row` (`:564`),
  `runbook-migrations-current` (`:806`), `root-layout-renders-what-it-imports` (`:832`).
- `workers/tenancy/src/lib/roles.ts` 360 → **411** (+51, of which ~17 are the explanatory comment).

**I would keep every one of these repairs.** The point of the finding is that the cost was avoidable:
splitting `rules.test.ts` costs **±0 lines** and was round 1's #1 item. It was not done, and the file
absorbed 90 of the ~122 lines of headroom round 1 gave it. See the budget section.

### F1 · HIGH — the reader bug was fixed in one copy and left in the two that guard R10

**Plain English:** the repair pass found that the shared "ignore the comments, read the code" helper
was broken, fixed it, and moved eight checks onto the fixed one. Two copies of the broken version are
still in the repo, and they are the ones the permission-gate law runs on.

- `shared/test/gating-seam.ts:40` — R10 for **tenancy, content, data-ops**
- `workers/mcp/test/gating-seam.test.ts:18` — R10 for the **external MCP surface**

Both still read:

```ts
src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
```

Block pass **first** — precisely the ordering the ROUND2 brief says "ate the next 1,500 characters of
real code". `shared/test/gating-seam.ts` imports `declarationBody` from `./source` on line 32, so it
took the *slicing* fix and left the *comment* fix behind. Four of seven workers' R10 coverage runs on
a reader the repo's own canonical module documents as a bug.

**Measured, not assumed:** of the **13** files these two suites read, **0** carry the trigger pattern
today, so this is latent, not live. **22 of 272** `.ts/.tsx` files repo-wide do carry it, so one
comment added to a route file re-blinds a security law.

**Fix:** delete both local definitions; import `stripComments` from `shared/test/source`. **−8 lines**,
and `stripComments` goes 3 copies → 1.

### F2 · HIGH — R1, the first law, is still read by a scanner with *both* known faults

`workers/{tenancy,content,data-ops}/test/publish-seam.test.ts` still carry a private `indexFunctions`
that does:

```ts
const body = code.slice(m.index, starts[i + 1]?.index ?? code.length)
```

— a slice to the next **exported** function (the fault `declarationBody`'s header says "swallowed
every non-exported helper in between and blames their code on the exported function above them…
Both have shipped here"), and `PUBLISH_RE` is tested against **raw, uncommented-stripped source**.

Every one of the eight faults `shared/test/source.ts` was written to end is present in the check
protecting the law CLAUDE.md lists first. Round 1 filed this as F2 + F3; the repair pass built the
exact seam that fixes it and did not apply it here.

**Probe:** 78 handlers scanned. **0** satisfied only by neighbour code; **0** satisfied only by a
comment. Fragile, not blind — same verdict as round 1, now with less excuse.

**Fix:** one `shared/test/publish-seam.ts` (`describePublishSeam`) built on `source.ts`, plus three
callers of ≤ 12 lines each — the gating-seam precedent exactly (125 + 16 + 16 + 26).
**268 → ~110 lines, −130**, and it eliminates the only remaining test copy cluster.

### F3 · MEDIUM — the meta-law is still a spelling test (round 1's F7, unaddressed)

`web/test/rules.test.ts:1031` — "every enforced law has a known check" still compares each registry
`checkId` against a hard-coded set of **27 strings**. No `existsSync`, no file mapping. Delete
`workers/content/test/publish-seam.test.ts` today and the build stays green. The keystone guarantee —
*"a law cannot be added without its check"* — remains name-matching.

**Fix:** map each `checkId` to its file path and `existsSync` it. **~+15 lines**, and it makes the
`MUTATING_WORKERS` constant (F5) live.

### F4 · MEDIUM — 192 lines nothing can reach; one symbol removed in a week

Re-verified one by one with `git grep -w` over `.ts/.tsx/.mjs` only. **Important measurement trap I
walked into and am reporting:** a naive repo-wide scan now shows six of these as "referenced" —
because my own round-1 report is committed at `reviews/lean-mean.md` and mentions them by name. A
review that cites a dead symbol makes it look alive. Counted against code only:

| Symbol | Location | Status |
|---|---|---|
| `sha256Bytes` | `workers/auth/src/lib/crypto.ts` | **REMOVED ✔** (−8) |
| `AgentView` | `web/components/agent-view.tsx:27` | still dead (58) — **ruled to stay**, owner's call |
| `queryModule` → `resolveModuleDatabases` → `d1QueryAcross` | `workers/tenancy/src/lib/sharding.ts:177,151`; `shared/workers/d1-rest.ts:116` | still dead (~69) — **ruled to stay**, scaling wins |
| `cheapText` | `workers/data-ops/src/lib/model.ts:382` | still dead (~12) |
| `openAgent` | `web/lib/agent-open.ts:48` | still dead (3) |
| `MUTATING_WORKERS` | `shared/rules/registry.ts:286` | still dead (1) — see F5 |
| `RECORD_DETAIL_EXCEPTIONS` | `shared/rules/registry.ts:295` | still dead (1) — see Documentation |
| `ImportSession`, `GlossaryKey`, `ConceptKey` | `shared/types.ts:269`, `shared/glossary.ts:38`, `web/lib/pages.ts:90` | still dead types (~10) |

Honouring the reconciliation, **~65 lines are genuinely actionable**, not 192.

### F5 · MEDIUM — `MUTATING_WORKERS` is still a constant whose comment says "track it here" (round 1's F5)

`shared/rules/registry.ts:286` — `["tenancy","content","data-ops"]`, commented *"A new mutating worker
without a publish-seam test is a gap — track it here."* **0 consumers.** Combined with F3, deleting a
seam suite outright leaves the whole build green. The fix rides free inside F2's shared scanner.

### F6 · MEDIUM — one cross-worker copy round 1 wrongly reported as zero

`workers/tenancy/src/lib/notify.ts:24` and `workers/content/src/lib/notify.ts:55` contain a
byte-identical 21-line `async function send(env, to, subject, content)` — same `brandedEmail` call,
same `callService` to `https://auth/internal/send-email`, same 4-line comment — differing only in
`{ worker: "tenancy" }` vs `{ worker: "content" }`.

Round 1 asserted "**0** duplicate 12-line blocks between any two workers" and used it as proof the
handler shape is shared and never copied. That claim was false in both trees. **This is a correction
to round 1, not a regression from the repair pass.**

**Fix:** `shared/workers/send-email.ts` taking the worker name as a parameter. **−21 lines**, one
outbound-mail seam instead of two.

### F7 · LOW — the FormShell dialog wrapper is still the #1 product-source copy (round 1's F8)

Measured on today's tree, the largest duplicate cluster in product source is unchanged: the
`<Dialog open onOpenChange={o => { if (busy) return; if (!o) clearDraft(); onOpenChange(o) }}>`
wrapper across **7** dialogs (`create-team`, `help-form`, `invite`, `learning-form`, `role-form`,
`team-edit`, `selectable-form`) — 6–7 files sharing each 8-line window. Every screen independently
remembers the busy-guard and the discard-on-dismiss.

**Fix that stays in-Law:** absorb the wrapper **into `FormShell`**. Do *not* extract a `FormDialog` —
`forms-use-formshell` (`rules.test.ts:96`) asserts each dialog's source `.toContain("form-shell")`,
so wrapping FormShell turns R4 red. **~−50 lines.**

### F8 · LOW — tracked regenerable output grew from 1,700 to 11,288 lines

11 root files (`activity-log-review.{md,html}`, `architecture-review.{md,html}`,
`interface-lessness-report.{md,html}`, `lean-mean-report.{md,html}`, `ocean-review.md`,
`security-report.md`, `story-review.md`) plus **20** files under `reviews/`, while `.gitignore:26`
excludes `architecture-blueprint.html` for being "regenerable, not source". Round 1 predicted the
`reviews/` half and LEDGER.md plans to delete it, so only the **11 root files (1,700 lines)** are a
standing defect. Untrack those; keep their conclusions where LEDGER.md says durable output belongs
(RULES.md, the registry, a test, a doc).

### F9 · LOW — still no formatter or linter anywhere

`git ls-files | grep -iE 'eslint|biome|prettier|editorconfig|oxlint'` → **empty**, both trees. Types +
tests carry the whole load. Unchanged from round 1.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** delete the 2 stale broken `stripComments`, import from `source.ts` | `shared/test/gating-seam.ts:40`, `workers/mcp/test/gating-seam.test.ts:18` | **−8 lines**; `stripComments` 3 copies → 1; R10 on 4 workers starts reading the code it believes it reads | **security_sentry** — this *strengthens* R10 on tenancy/content/data-ops/mcp, so it should welcome it, but it MUST re-run its "45/45 gated" count afterwards: a stronger reader can surface a route the weaker one passed. Do not treat a new red as a regression. **interfacelessness_review** depends on the mcp suite; same note. Neutral elsewhere. |
| **F2** one shared `describePublishSeam` on `source.ts` | new `shared/test/publish-seam.ts` (~90); 3 callers shrink to ~12 each | **net −130 test lines**; adds correct slicing + comment stripping to R1's scan | **realtime_review** depends on R1 being enforced — this strengthens it. **architecture_review**: adds one more `shared/test/*` → worker import edge, the same direction `gating-seam` already established, so no new coupling direction. **Same caveat as F1**: a correct reader may turn a currently-green handler red. That is the check working. |
| **F3** meta-check `existsSync` each check file | `web/test/rules.test.ts:1031` | **+~15 lines**, pushes the file to ~1,083 | Costs **this review** ~0.2 pt and eats half the remaining `rules.test.ts` headroom — **do it only after the split**, or it is the check that crosses 1,100. Neutral to every other review. |
| **F4** delete the ~65 actionable dead lines (`cheapText`, `openAgent`, 3 dead types) | `workers/data-ops/src/lib/model.ts`, `web/lib/agent-open.ts`, `shared/types.ts`, `shared/glossary.ts`, `web/lib/pages.ts` | **−65 lines** | **story_checks_out** must drop the OPERATIONS.md + AGENT-MODULES-PLAN.md sentences about `cheapText` in the **same commit** or a doc goes dangling. **spend_review** cites `cheapText` as a cheap-model seam — confirm it is not a planned cost lever before deleting; if it is, keep it and say so. `queryModule` chain and `AgentView` are **already reconciled to stay** — do not re-file. |
| **F5** make `MUTATING_WORKERS` assert its suites exist | rides inside F2's shared scanner | **+~8 lines** inside a net −130 | none — it converts a dead constant into the guarantee its own comment claims. |
| **F6** one `shared/workers/send-email.ts` | `workers/tenancy/src/lib/notify.ts`, `workers/content/src/lib/notify.ts` | **−21 lines**, one outbound-mail seam | **architecture_review**: this *reduces* duplication but creates a new shared→worker edge in the *runtime* layer (F1/F2's edges are test-only). It is the same direction as `shared/workers/trace.ts`, so no cycle. **error_log_review / speed_review**: the `callService` timeout must be preserved verbatim — it is the R11 fetch-timeout guarantee; moving it must not drop the `AbortSignal`. |
| **F7** absorb the Dialog wrapper into `FormShell` | `web/components/form-shell.tsx` (+~15), 7 dialogs (−~9 each) | **net −50 lines** | **first_run_review / round_trip_review** exercise these dialogs — the busy-guard and discard-on-dismiss are load-bearing behaviour and must not change. **R4 and R7 stay green ONLY if FormShell absorbs the wrapper**; a new `FormDialog` wrapping FormShell turns `forms-use-formshell` red. |
| **F8** untrack the 11 generated root reports | `.gitignore`, `git rm --cached` ×11 | **−1,700 tracked doc lines** | **mac_fell_in_the_ocean_review** scores what a stranger recovers from the remote — untracking past audits can read as lost history. **Genuine tension.** Resolve by keeping conclusions in RULES.md / the registry / a test and untracking only the rendered artifacts. Leave `reviews/` alone; LEDGER.md already owns its deletion. |
| **F9** add a formatter (config only) | 1 config file + 1 `check` step | **+~10 lines config**, +1 CI step | Costs **speed_review** a few seconds of CI; costs **spend_review** nothing (tsc ×8 already runs). If anyone proposes a full **eslint** ruleset instead I would refuse it: 7 workers have **zero** runtime deps and near-zero dev deps, which is a headline strength. Formatter yes, linter-with-plugin-tree no. |
| **F-DOWN** split `web/test/rules.test.ts` into 3 files | `rules.test.ts` → `rules-arch/ui/data.test.ts` | **±0 lines**, 1,068 → 3 × ~356 | **none — pure redistribution, no behaviour and no LOC change.** It is the top item for the third review running, it costs nothing, and it is the precondition for every other review's proposed law or check. |
| *(pass-side)* central crash recording in gateway + realtime — **already landed** | `workers/gateway/src/index.ts`, `workers/realtime/src/index.ts` | +~60 lines, 2 new `recordWorkerError` call sites through an existing seam | **Free for lean** (1–3 line call sites, zero duplication) but **not free downstream**: **spend_review** and **scaling_review** should price two new worker-error write paths against the ops database, and **speed_review** should confirm the recording is off the hot path. Flagging because it landed in *my* budget as ~0 and in theirs as a real number. |

---

## The absorption budget — what 15 other reviews need to know

Round 1 gave three numbers. Here is what the repair pass actually spent against each.

### 1 · `rules.test.ts` — **NOT over the line, but 32 lines from it, and the headroom is 1 check**

| | R1 | R2 |
|---|---|---|
| Lines | 978 | **1,068** |
| Checks | 24 | **27** |
| Headroom to 1,100 | ~122 lines / ~3 checks | **~32 lines / ~1 check** |
| New law ids added | — | **0** (R1–R25 in both; `checkId` count 26 in both) |

**Plain answer: no, it is not over the line — 1,068 is under 1,100 — but it spent 90 of its 122-line
headroom on three checks, and the *next* check of any normal size crosses it.** The pass did exactly
what the round-1 budget priced: three additions, ~30 lines each. It got them at a discount by
deleting 96 lines of private parsers first, which is the reason it is at 1,068 and not ~1,160.

That discount cannot be taken twice — there are no private parsers left to delete. **The next
addition is charged at full price.** `git grep '^function ' web/test/rules.test.ts` returns nothing.

**The split is still free and still undone.** Three files of ~356 lines each costs ±0 lines, moves
Size & Scope back to 91 and unlocks Understandability, and it restores roughly 3 checks of headroom
to *each* file instead of 1 to the whole. **Any review proposing a new check must ask for the split
first, or accept that it is the one that crosses 1,100.**

### 2 · Copy-paste — **≈ 850 lines remaining, and the pass RETURNED ~118 rather than spending any**

Round 1's "≈ 550 lines" was computed from a src duplication figure (2.31 %) that does not reproduce.
Recomputed on the measure that does reproduce:

```
src code lines (non-blank, non-comment)          21,242
current duplicate 8-line-window ratio             0.99 %  (211 extra windows)
band edge used for "Leanness drops a band"        5 %
headroom = (0.05 − 0.0099) × 21,242            ≈  852 lines of pure copy-paste
```

**Spent by the repair pass: 0.** src went 0.99 % → 0.99 % (208 → 211 extra windows) across +388
non-test lines; tests went 1.51 % → **1.39 %** (97 → 94) across +595 test lines. **Returned:** the 75
lines of duplicate R10 blocks, dropping the publish-seam cluster's redundant-copy count from ~210 to
**92** — about **118 lines back on the shelf**.

Concretely, in cluster terms (the form the number actually bites in): **3 copy clusters → 2.**
- Product: the 7 form dialogs (F7) — unchanged, still #1.
- Test: the 3 publish-seam suites (F2) — 92 redundant lines, now the *only* multi-file test cluster.
- Retired: the 3 duplicate R10 blocks. ✔

**The contract still holds and was honoured:** one shared `describeXSeam` plus callers of ≤ 26 lines.
Auth's new 88-line suite is bespoke, not a copy — **0** shared 4-line windows with the mcp suite —
because auth genuinely dispatches with a `switch` and gates with `getSessionUser`. That is the right
call, and it is the model for any future "this worker is different" suite.

### 3 · New laws — **0 spent, ~3 still available in registry/doc terms, 1 in `rules.test.ts` terms**

No law ids were added. `registry.ts` grew +8 lines. Every addition was an extension of an existing
check — which is exactly the cheap shape, and it is why this pass added 1,020 lines and *raised* this
score. The registry and the doc set can carry ~3 more laws. **`rules.test.ts` can carry one more
check.** Those two numbers must be reconciled by the split, not by declining laws.

### 4 · The general rule, restated with a week of evidence behind it

- **Code that reuses a seam is free — proven, not asserted.** +1,020 lines, duplication flat, score up.
- **Deleting a copy is worth more than not adding one.** The single biggest contributor to this
  round's Leanness move was removing 75 lines that already existed.
- **A fix that lands in one copy of three is worth less than nothing to Robustness**, because it
  creates a repo where the same named function means two different things (F1). Migrate all callers
  or none.
- **Logging is free to *this* review and not to spend/speed/scaling.** Two new `recordWorkerError`
  sites cost me ~0 and cost them a write path each. Do not read "lean_mean says logging is free" as
  "logging is free".

---

## CEILING

**Is 95 reachable by changing code? Yes — and the slack is wider than it was.**

| Dimension | R1 | R2 | Reachable by commit | Capped by |
|---|---|---|---|---|
| Size & Scope | 91 | 90 | **95** | Needs the `rules.test.ts` split (free) plus `api.ts` (573) and the deep-link host (555). The split alone gets ~93. |
| Robustness | 87 | 93 | **97** | Every remaining fix (F1, F2, F3, F5, F9) is a commit. Nothing structural blocks it. |
| Documentation | 89 | 92 | **95** | **Partly capped by a project mandate** — CLAUDE.md is *required* to restate the laws (it is the agent entry point), so triple-statement is structural. A commit can extend `registry-integrity` from ranges to *wording*, and untrack the 11 root artifacts. |
| Understandability | 91 | 91 | **95** | Reachable. F1 (one `stripComments`) + the split are the whole lever. |
| Leanness | 88 | 90 | **96** | Every fix is a commit; F4's ruled-to-stay 127 lines cost ~1 pt and are a reconciled decision, not a defect. |
| Scalability & Structure | 91 | 92 | **94** | **Capped below 95 by a locked decision.** ARCHITECTURE.md locks Cloudflare Workers + per-team D1 over the REST door + the Durable Object. Platform coupling is total and deliberate; I am not proposing relitigating it. The half-wired shard split is likewise a deliberate "build the valve up front" choice. |

```
0.12×95 + 0.22×97 + 0.16×95 + 0.20×95 + 0.15×96 + 0.15×94 = 95.44 → 95
```

**95 is reachable with 0.44 points of slack** — the same slack as round 1, but the path is shorter:
Robustness has already banked 6 of the 10 points it needed, and the two remaining HIGH findings
(F1, F2) are both *deletions plus a shared import*, i.e. they raise Robustness **and** Leanness **and**
Understandability at negative LOC. That combination did not exist in round 1.

**Two conditions, and one is now urgent rather than advisory:**

1. **`web/test/rules.test.ts` must be split before any review adds a check.** Round 1 said "before
   R26"; the file has since grown 90 lines *without* a new law. It has ~32 lines of headroom. The
   split is free. It is now the cheapest point on the board and the precondition for most of what the
   other 15 reviews will propose.
2. **No fix may add a per-worker copy of anything.** The budget (~850 lines) is healthy and the pass
   spent none of it, but 92 lines are still tied up in the publish-seam cluster and the contract is
   what kept the auth suite honest. Every "add a check per worker" proposal must land as one shared
   scanner plus thin callers — or, if the worker genuinely diverges, as a bespoke suite that shares
   **zero** 4-line windows with any existing one, which is the bar auth cleared.

One thing a commit cannot fix and 95 does not require: this remains a single-author base. Nothing in
this arithmetic depends on that — but it is why two of my own round-1 figures (src duplication,
cross-worker duplication) went a full week unchallenged before I caught them myself this round.
