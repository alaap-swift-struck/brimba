# Lean Mean Check — brimba
Scanned 2026-08-04 · Overall **95/100 (Grade A)** · security posture **100/100** at 100% sweep coverage · **0 dependency advisories** · Lean, and self-checking down to the checks themselves — four scanners that could not fail now can, every numeric config value parses in one place, and a growing collection pages instead of refusing.

## Fix first (ordered by impact)
- [ ] **(Robustness)** Convert `idempotent-transitions` from a source-scan to a behaviour test — _why:_ both read source strings, so a rename can blind them. `workers/tenancy/test/activity-scope.test.ts` shows the stronger shape: mock the data door, run the function, assert the SQL that actually comes out. That test exists because a source-scan stayed green through a real leak. — _where:_ `web/test/rules.test.ts`
- [ ] **(Leanness)** Collapse the three per-worker `gating-seam` suites onto a shared scanner — _why:_ ~150 lines are the same code three times (most of the 6.6% duplication). Each must import its own worker's `ROUTES`, so the fix is a shared helper plus three thin files. Only worth doing if a fourth worker appears. — _where:_ `workers/{tenancy,content,data-ops}/test/gating-seam.test.ts`
- [ ] **(Documentation)** Fold `SCREEN-ENGINE-PLAN.md` and `AGENT-MODULES-PLAN.md` into `ROADMAP.md` — _why:_ both describe shipped work, but five live canon references still point into them (SEARCH, README, OPERATIONS, DATA-MODEL, ROADMAP), so deleting them dangles links. They now carry a status banner; the fold is a real edit of those five references, not a delete.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 95 | green |
| Robustness | 98 | green |
| Documentation | 96 | green |
| Understandability | 92 | green |
| Leanness & Optimization | 91 | green |
| Scalability & Structure | 96 | green |

## Numbers
297 code files · 30,353 LOC · 33 docs (6,471 lines) · 64 test files (390 tests, 21.5% test-to-code) · 0 parked TODO/FIXME in source · 6.6% duplicate lines.

## Full findings

### Size & Scope — 95/100
- Strengths: 30.3k lines carries seven workers, per-tenant databases, an AI assistant, an external machine surface and a CSV importer; zero parked TODOs; this round added ~1.2k lines and removed a whole class of refusal.
- To improve: three near-identical seam-test triplets (see Fix first).

### Robustness — 98/100
- Strengths: all source-scanning checks were swept for THREE flaw classes — unbounded substring match, silent skip of an unrecognised shape, and (ported back from the downstream fork) reading COMMENTS AS CODE. Four gate scans and R14 were blind to the third; all fixed and sabotage-proven. Every new check was **sabotage-proven**, which caught three real scanner bugs this round — a missing word boundary that let `ungatedBody(` read as a gate, and a braced guard clause that switched the hooks-order check off for whole files. 19 machine-checked laws. R10's three claimed-but-missing suites now exist.
- To improve: two checks still assert on text rather than behaviour.

### Documentation — 96/100
- Strengths: laws pinned doc → registry → check; comments name the failure that earned each rule; a reversed owner decision is recorded with its date, its evidence, and how to reverse it again.
- To improve: 33 files is a lot to keep mapped.

### Understandability — 92/100
- Strengths: one handler shape everywhere; new seams are one file with one job; failure paths are named in comments.
- To improve: `agent.ts` (616) and `deep-link-screen.tsx` (508) are still read-whole files — both cohesive, so splitting would move a number rather than reduce load.

### Leanness & Optimization — 91/100
- Strengths: `pagedJson` collapsed four hand-built responses into one; the bulk cap is derived, not a second hand-picked number; exemption lists are DATA in one registry; the misleading frame count was switched OFF rather than a second count being added.
- To improve: 6.6% duplication, mostly the deliberate seam-test triplication.

### Scalability & Structure — 96/100
- Strengths: keyset paging on the growing collections (constant cost per page, stable under concurrent writes); caps derived from one place; per-team databases with a shard runbook and an 80%-of-cap alarm.
- To improve: only two collections page today — R14 now forces the choice at build time for any new one.
