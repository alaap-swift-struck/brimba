# Lean Mean Check — brimba
Scanned 2026-08-12 · Overall **97/100 (Grade A)** · was 96 before this pass · 570 tests green · Leaner *and* better locked — 304 lines of duplicated test collapsed onto one shared scanner, and a rule-check that had been quietly blind since it was written.

## Fix first (ordered by impact)

- [ ] **(Leanness)** Split `web/test/rules.test.ts` (884 lines) — _why:_ it is now the largest file in the repo and holds 23 unrelated law checks. It grew again this pass (R11's internal half). The seam is obvious: one file per dimension (`rules-arch.test.ts`, `rules-ui.test.ts`) sharing the existing helpers, which would also stop every law edit touching one 900-line file. — _where:_ `web/test/rules.test.ts`
- [ ] **(Size)** `web/components/deep-link-screen.tsx` (512) and `web/lib/api.ts` (513) — _why:_ both are hosts that accumulate. Neither is disorderly, but both are past the point where a reader can hold them whole. Long-standing, still not urgent. — _where:_ as named
- [ ] **(Robustness)** Give `users` a machine check if a third writer ever appears — _why:_ auth and tenancy write disjoint columns and DATA-MODEL.md now states the rule, but nothing enforces it. Documentation is the right weight for two writers; it stops being the right weight at three. — _where:_ `DATA-MODEL.md` › users, `shared/rules/registry.ts`

## Fixed this pass

- **A rule-check that was blind since it was written.** `idempotent-transitions` (R17) verified the zero-row skip by slicing from the function to the **end of the file** and grepping for `return false` — so *any* later function's `return false` satisfied it. Proven: the row-count guard was deleted from `setLearningActive`, an unrelated `return false` added 40 lines below, and **the check went green with the exact bug R17 exists to prevent** sitting in the file. Now bounded to the declaration via the `declarationBody` helper that was already there. The same sabotage now fails.
- **304 lines of duplicated security test.** Four near-identical `gating-seam` suites (362 lines) → one shared scanner + three ~16-line callers (138 total). It had grown from three copies to four when the mcp worker landed. The real cost was not the lines: a fix to one copy left the *strongest* version of a security check running in only one worker. Sabotage-proven after the collapse — a gate was stripped from a live door with a comment left behind naming it, and the shared check caught it.
- **A brittle assertion that would have been edited to shut it up.** `concurrency.test.ts` pinned the exact argument *count* of `forwardTool(...)`, so adding the trace id broke a true assertion. Loosened to `[,)]` — the key must still be read and passed in its place. A test that fails on unrelated changes eventually gets weakened, which is how a real lock stops locking.
- **Three dead exports.** `HEAVY_PATHS`, `memberLabel`, `PRIVILEGE_MODULES` were public surface with no consumer outside their own file. Un-exported; 570 tests still green.
- **A law that claimed something false.** R11 exempted service bindings as "Cloudflare-bounded". The platform bounds the *worker*, not the *call* — so a slow auth held every request in every worker open, and `whoAmI` could not tell "not signed in" from "no answer", silently signing working users out. Rewritten, with two checks (source scan + 17 behavioural tests) because the two halves fail differently.
- **A restore runbook with a command that does not run.** `time-travel info --remote` — `--remote` is not a valid flag there. Found by actually performing a restore drill rather than reading the page. See `architecture-review.md` §6.

## Reclassified — not a defect

- **`SCREEN-ENGINE-PLAN.md` + `AGENT-MODULES-PLAN.md` need not be folded into ROADMAP.** The previous report called for folding them and rewriting the eight references that point into them. Reading them settles it: both already carry an honest banner (*"Status: SHIPPED… this file is the why"*) and both name the doc that holds current truth. They are design records — a legitimate category, like an ADR — not stale plans. Folding would churn six documents for a cosmetic gain. **Closed.**

## Scores

| Dimension | Score | Was | Status |
|---|---|---|---|
| Size & Scope | 94 | 94 | green |
| Robustness | 99 | 97 | green |
| Documentation | 98 | 97 | green |
| Understandability | 96 | 95 | green |
| Leanness & Optimization | 96 | 93 | green |
| Scalability & Structure | 97 | 97 | green |

`overall = 0.12×94 + 0.22×99 + 0.16×98 + 0.20×96 + 0.15×96 + 0.15×97 = 96.89 → 97`

## Numbers

321 code files · 35,549 LOC · 41 docs (8,064 lines) · **72 test files, 570 tests, 22.4% test-to-code** · 0 TODOs · **5.8% duplicate lines** (was 6.1%) · 20.7% comment ratio · 12 files over 400 LOC.

Net **+584 LOC**, and worth naming what bought it: one new seam (`shared/workers/trace.ts`, 140 lines) that replaced sixteen scattered ad-hoc cross-service calls, plus two behavioural test suites (23 tests) covering gaps a source scan structurally cannot see — against **−304** lines of duplicated test.

## Full findings

### Size & Scope — 94/100 (green)
- Strengths: 7 workers with clear boundaries; 12 files over 400 lines out of 321, none disorderly; no vendored code, no dead directories.
- To improve: `rules.test.ts` at 884 is now the largest file and grew again this pass — the split is overdue. `deep-link-screen.tsx` and `api.ts` remain the two long-standing hosts.

### Robustness — 99/100 (green)
- Strengths: 570 tests at 22.4% test-to-code. Every cross-service call guarded and the short hops bounded. Laws are machine-checked and, this pass, **sabotage-proven** — every new or changed check was broken deliberately and watched go red naming the right file, then restored from a copy (never `git checkout`). Two behavioural suites now cover what source scans cannot: that a no-answer is not a refusal, and that a repeated transition is silent.
- To improve: three other laws still rest on source scans alone (`bounded-lists`, `activity-gate-coverage`, `static-destinations`). The R17 blindness found this pass is the argument for auditing them the same way — a green check is not a working law.

### Documentation — 98/100 (green)
- Strengths: 41 documents, 8,064 lines, and the canon now describes reality on the two points where it did not — the single point of failure (ARCHITECTURE §2b, previously written down nowhere) and table ownership (DATA-MODEL). Every seam is defined somewhere it can be found. 0 TODOs.
- To improve: `CONVENTIONS.md` (41,598 bytes) and `EDGE-CASES.md` (35,550) are read end-to-end by nobody; both would serve better with a jump index at the top.

### Understandability — 96/100 (green)
- Strengths: 20.7% comment ratio, and the comments explain *why* rather than restating the line. "How do two workers talk?" now has one answer with one file. The gating-seam collapse means one scanner to read instead of four near-copies that had already drifted.
- To improve: the 884-line rules file is the main obstacle to a newcomer understanding how laws are enforced.

### Leanness & Optimization — 96/100 (green)
- Strengths: duplication down to 5.8%; the largest remaining block of near-identical code removed; no dead exports; one seam per job, and the laws enforce that.
- To improve: some duplication is inherent to per-worker route tables and is not worth collapsing — the workers must stay independently deployable.

### Scalability & Structure — 97/100 (green)
- Strengths: per-team databases, keyset paging, bounded lists, sharded live channels, an operations database split off the core. Adding a hop between workers is now a one-line change at one seam.
- To improve: unchanged from last pass — nothing structural moved.

---

**Cross-references:** architecture 96 (`architecture-review.md`) · scaling 94 · security 99 · story 98 · ocean 95 · MCP parity 98.
