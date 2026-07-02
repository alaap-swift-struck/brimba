# Lean Mean Check — Brimba
Scanned 2026-07-02 · Overall 92/100 (Grade A) · An A-grade base that got leaner and better-tested through the agent-failure round — the host file split into named concerns, the risky new wire-format and money-safety are test-locked, and the docs can now rebuild the base from zero.

## Fix first (ordered by impact)
- [ ] **(Leanness)** Factor the repeated route-handler shape (`teamContext → requireRight → parse → publish`) into a thin wrapper — _why:_ ~6.7% duplication; DEFERRED on purpose (the 56 handlers gate heterogeneously — dynamic target-rights, no-team bootstrap, admin guards — so a blanket wrapper is the wrong risk right before a prod ship). Do it as a dedicated, test-backed task with a machine check that every mutation route is wrapped — _where:_ `shared/workers/gating.ts` + `workers/*/src/routes/*`.
- [ ] **(Size)** Watch `web/components/agent-panel.tsx` (591 LOC, grew with history + resume) — _why:_ now the second-biggest file; extract the usage + history dialogs if it grows again — _where:_ `web/components/agent-panel.tsx`.
- [ ] **(Robustness)** Add a DB-level integration test for the confirm-resume conversation rebuild — _why:_ review- + staging-verified but not unit-locked — _where:_ `workers/data-ops/test/`.
- [ ] **(Robustness, carried)** Wire the scaffolded Playwright e2e into CI with a seeded staging account — _where:_ `web/e2e/`.
- [ ] **(Scalability)** Build the external `mcp` worker on the existing gating seam — _where:_ `workers/mcp/` (new).

Done this round: split the 823-line host into `use-screen-data` + `use-screen-actions` (→706) ✓; locked the wire-format coalescing + credit money-safety with tests ✓; BOOTSTRAP.md rebuild runbook + BASE-MANUAL fork/scaling sections ✓; stripped drift-prone line-number doc cites ✓; effort-only-where-supported so the model brain is swappable ✓.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 86 | green |
| Robustness | 95 | green |
| Documentation | 96 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 88 | green |
| Scalability & Structure | 92 | green |

## Full findings
### Size & Scope — 86/100 (green)
- Strengths: the 823-line host dropped to 706 (read + write layers moved to named hooks).
- To improve: `agent-panel.tsx` grew to 591 with history/resume; 6 files still over 400.

### Robustness — 95/100 (green)
- Strengths: `toAnthropicMessages` coalescing is unit-locked (the multi-tool + wrap-up shape that would otherwise 400); a source-invariant test locks the never-negative credit balance; Laws + publish-seam per worker; the one XSS fixed + test-locked. 214 tests.
- To improve: DB-level integration test for confirm-resume; e2e into CI.

### Documentation — 96/100 (green)
- Strengths: BOOTSTRAP.md rebuilds the base from a fresh account command-by-command; BASE-MANUAL covers forking the base for a new product + how every subsystem scales; the README states the 7-point completeness bar; drift-prone line-number cites removed.
- To improve: a one-line status header per reference doc.

### Understandability — 91/100 (green)
- Strengths: the host reads fetch → act → render (named hooks); one worker shape everywhere; documented conventions.
- To improve: nav + trace + render still inline in the host (~700 lines) — a further split is higher-risk.

### Leanness & Optimization — 88/100 (green)
- Strengths: one UI library; the extracted hooks removed host duplication; 1 TODO in the repo.
- To improve: the route-boilerplate wrapper (deferred with reason).

### Scalability & Structure — 92/100 (green)
- Strengths: every growth axis scales by an existing seam/knob (now in BASE-MANUAL §6); the model seam is swap-safe (effort-only-where-supported).
- To improve: build the `mcp` worker on the existing seam.
