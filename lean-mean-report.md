# Lean Mean Check — brimba
Scanned 2026-08-12 · Overall **96/100 (Grade A)** · was 93 before this pass · 518 tests green · Lean, and now honest about itself — the three days of scaling work had left a rate-limit branch that could never fire and four documents describing a database layout that had moved.

## Fix first (ordered by impact)
- [ ] **(Robustness)** Convert `idempotent-transitions` from a source-scan to a behaviour test — _why:_ it reads source strings, so a rename can blind it. `workers/tenancy/test/activity-scope.test.ts` shows the stronger shape: mock the data door, run the function, assert the SQL that actually comes out. That test exists because a source-scan stayed green through a real leak. — _where:_ `web/test/rules.test.ts:617`
- [ ] **(Leanness)** Collapse the four per-worker `gating-seam` suites onto a shared scanner — _why:_ ~360 lines are near-identical across tenancy/content/data-ops/mcp, and it grew from three to four when mcp landed, which is the shape of a pattern that will keep growing. Each must import its own worker's `ROUTES`, so the fix is one shared helper plus four thin files. — _where:_ `workers/{tenancy,content,data-ops,mcp}/test/gating-seam.test.ts`
- [ ] **(Leanness)** Stop exporting three symbols nothing outside their file uses — _why:_ `HEAVY_PATHS`, `memberLabel`, `PRIVILEGE_MODULES` are public surface with no consumer, which invites a future caller to depend on an internal. Drop `export`. — _where:_ `shared/workers/rate-limit.ts`, `shared/workers/tool-catalog.ts`
- [ ] **(Documentation)** Fold `SCREEN-ENGINE-PLAN.md` and `AGENT-MODULES-PLAN.md` into `ROADMAP.md` — _why:_ both describe shipped work and both carry status banners, but five live canon references point into them, so deleting them dangles links. The fold is a real edit of those five references, not a delete.

## Fixed this pass
- **A rate-limit branch that could never run.** `rateLimit()` is called only by the gateway, which binds `USER_LIMITER` and `HEAVY_LIMITER` — never `TEAM_LIMITER`. The branch and the `teamKey` helper feeding it were dead, and worse, they read as a per-team ceiling at the public door when the real one lives in `teamContext`. Removed, with the comment now pointing where it actually is.
- **28 lines of duplicated comment prose.** The same five-line R23/R16 note pasted into seven mutation doors. Collapsed to one line each pointing at `RULES.md`, which is where the reasoning belongs.
- **Four documents describing the wrong database.** `DATA-MODEL.md`, `ERROR-HANDLING.md` and `BASE-MANUAL.md` still placed `error_logs` and `agent_usage_log` in the core database after they moved to the operations database.
- **Twenty-five undefined seams.** `publishChange`, `whoAmI`, `formatCount`, `pagedJson` and twenty-one others were named across five to ten documents each and defined in none. `BASE-MANUAL.md` §2.5 now defines every one, with its file.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 94 | green |
| Robustness | 97 | green |
| Documentation | 97 | green |
| Understandability | 95 | green |
| Leanness & Optimization | 93 | green |
| Scalability & Structure | 97 | green |

`overall = 0.12×94 + 0.22×97 + 0.16×97 + 0.20×95 + 0.15×93 + 0.15×97 = 95.64 → 96`

## Numbers
312 code files · 34,271 LOC · 30 authored docs (7,557 lines) · 67 test files (518 tests, 21.5% test-to-code) · 2 parked TODOs · 6.1% duplicate lines · 20.1% comment ratio.
