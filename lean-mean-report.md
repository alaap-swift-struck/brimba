# Lean Mean Check — Brimba
Scanned 2026-07-02 · Overall 90/100 (Grade A) · Still an A after a second major build — the agent co-pilot landed with more tests and a real manual; the debt is one oversized screen file and repeated route boilerplate.

## Fix first (ordered by impact)
- [ ] **(Size/Understandability)** Split `web/components/deep-link-screen.tsx` (823 LOC, carried twice: 671 → 823) — _why:_ it holds fetch + dispatch + dialog wiring for every module; extracting per-module pieces makes each module's wiring local and reviewable — _where:_ `web/components/deep-link-screen.tsx`.
- [ ] **(Leanness)** Factor the repeated route-handler shape (`teamContext → requireRight → parse → publish`) into a thin wrapper — _why:_ ~6.7% duplication; a wrapper trims it and removes the risk of an inconsistently-gated route — _where:_ `workers/*/src/routes/*`.
- [ ] **(Robustness)** Add regression tests for the agent confirm-resume conversation rebuild + the credit race — _why:_ both are review-verified only; a test locks them against refactors — _where:_ `workers/data-ops/test/`.
- [ ] **(Robustness, carried)** Wire the scaffolded Playwright e2e into CI with a seeded staging account — _why:_ browser flows still run by hand — _where:_ `web/e2e/`.
- [ ] **(Documentation)** Replace line-number citations in docs with function names — _why:_ EDGE-CASES cites `agent.ts` line ranges that drift with every edit — _where:_ `EDGE-CASES.md` §6.
- [ ] **(Scalability)** Build the external `mcp` worker on the existing gating seam — _why:_ the one remaining planned worker (the external machine surface) — _where:_ `workers/mcp/` (new).
- [ ] **(Size, watch)** `agent-panel.tsx` (470), `tools.ts` (463), `agent.ts` (458), `teams.ts` (453) are nearing 500 — _why:_ natural agent-round growth; split the tool catalog by module next time it grows — _where:_ those files.

Done since the 2026-06-23 report: README "start here" map ✓ (the 6-doc manual + onboarding path), duplication down 7.3% → 6.7% ✓, tests 139 → 205 ✓, the agent failure path now explains itself ✓. Still with the owner (library repo): the `ArticleBody` link-scheme fix in `swift-struck-ui` (Brimba's server is already patched).

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 85 | green |
| Robustness | 93 | green |
| Documentation | 94 | green |
| Understandability | 89 | green |
| Leanness & Optimization | 88 | green |
| Scalability & Structure | 92 | green |

## Full findings
### Size & Scope — 85/100 (green)
- Strengths: 21.6k LOC for a full multi-tenant base + 5 modules + a streaming AI co-pilot; scope matches purpose.
- To improve: split the 823-line `deep-link-screen.tsx` (carried twice); watch the four files nearing 500 LOC.

### Robustness — 93/100 (green)
- Strengths: 205 tests incl. machine-checked Laws (R1–R8) + a publish-seam test per worker; boundary validation everywhere; race-safe credits/last-admin invariants; the security sweep's one real XSS fixed + test-locked; the streaming wire contract unit-locked and live-verified.
- To improve: regression tests for confirm-resume + the credit race; e2e into CI.

### Documentation — 94/100 (green)
- Strengths: the 6-doc manual (BASE-MANUAL, BUILD-A-MODULE, CONVENTIONS, UI-CONVENTIONS, DURABLE-OBJECTS, EDGE-CASES) explains how AND why, with a "read in this order" README path; 15% meaningful comments; one glossary, one name per concept.
- To improve: swap line-number doc citations for function names.

### Understandability — 89/100 (green)
- Strengths: one worker shape everywhere (switchboard → routes → lib → gating); screens are declarative recipes; conventions are documented, not tribal.
- To improve: the 823-line host file makes module wiring non-local.

### Leanness & Optimization — 88/100 (green)
- Strengths: duplication FELL during a feature round (7.3% → 6.7%); UI primitives come from the shared library; 1 TODO in the whole repo.
- To improve: the per-route boilerplate wrapper (carried).

### Scalability & Structure — 92/100 (green)
- Strengths: per-team D1 + the REST-door seam; the model seam proved itself (Workers AI → Claude in one line); bulk/live-sync/Laws are registries, not copies; clean web / shared / workers / db separation.
- To improve: build the `mcp` worker on the existing seam.
