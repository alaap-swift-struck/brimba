# Lean Mean Check — Brimba
Scanned 2026-07-06 · Overall 92/100 (Grade A) · Held its A through a major feature round — agentic multi-table import, a central error store, and full-field exports all landed test-locked; the docs are audited to rebuild the base from zero.

## Fix first (ordered by impact)
- [ ] **(Leanness)** Factor the repeated route-handler shape (`teamContext → requireRight → parse → publish`) into a thin wrapper — _why:_ ~6.6% duplication; DEFERRED (the 56 handlers gate heterogeneously). Do it as a dedicated task with a machine check. — _where:_ `workers/*/src/routes/*`.
- [ ] **(Size/Understandability)** Watch `web/components/deep-link-screen.tsx` (721) + `agent-panel.tsx` (639) — _why:_ split further when either passes ~800; extract the host's nav/trace or the panel's dialogs. — _where:_ those files.
- [ ] **(Robustness)** Integration test for the agentic-import confirm run + the confirm-resume rebuild — _why:_ unit-locked at the pure layer; a DB-level test locks execution. — _where:_ `workers/data-ops/test/`.
- [ ] **(Robustness, carried)** Wire the Playwright e2e into CI with a seeded staging account. — _where:_ `web/e2e/`.
- [ ] **(Scalability)** Build the external `mcp` worker on the existing gating seam. — _where:_ `workers/mcp/` (new).

Done this round: agentic multi-table import (engine + wizard + tests) ✓, full-field exports (roles/learning/dropdowns) ✓, central error store + the error_analyst skill (which made a structural fix this round) ✓, sample-file-per-target rule (test-enforced) ✓, mobile action-row wrap rule ✓, 3-pass doc audit + rulebook ✓.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 85 | green |
| Robustness | 95 | green |
| Documentation | 96 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 88 | green |
| Scalability & Structure | 92 | green |

## Full findings
### Size & Scope — 85/100 (green)
- Strengths: the agentic-import engine landed as four small files (pure plan · agent · batch · catalog), not a blob.
- To improve: deep-link-screen (721) + agent-panel (639) are the two big files.

### Robustness — 95/100 (green)
- Strengths: the new planner/resolver/normalizers/sample are unit-tested; wire-format + credit + CSV-injection locked; the error store self-cleans (benign network blips no longer logged); machine-checked Laws + publish-seam per worker. 238 tests.
- To improve: confirm-resume + e2e still manual.

### Documentation — 96/100 (green)
- Strengths: three audits confirm the docs rebuild the base + support a new app (2 blockers fixed); a README rulebook names every rule; AGENTIC-IMPORT §10 = the sample rule.
- To improve: a one-line status header per reference doc.

### Understandability — 91/100 (green)
- Strengths: the import engine reads plan → propose → deterministic run; one worker shape; host split into hooks.
- To improve: the 721-line host still inlines nav + trace + render.

### Leanness & Optimization — 88/100 (green)
- Strengths: the batch importer reuses writeRow/parseCsv; samples generate from existing columns.
- To improve: the route-boilerplate wrapper (deferred).

### Scalability & Structure — 92/100 (green)
- Strengths: an import target (even multi-table) is one declarative TargetDef; every axis scales by an existing seam.
- To improve: build the `mcp` worker on the existing seam.
