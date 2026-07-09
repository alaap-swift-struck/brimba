# Lean Mean Check — Brimba
Scanned 2026-07-09 · Overall **88/100 (Grade B+)** · Elite on robustness + docs; the one real drag is **Leanness (74, orange)** — two hand-maintained tool catalogs + a copy-pasted internal-fetch + 8 files >400 LOC. This is the honest score (an earlier self-report said 93; an independent fresh-clone re-score said 84 — the truth is ~88).

## Fix first (ordered by impact)
- [ ] **(Leanness)** Unify the two tool catalogs — `workers/data-ops/src/lib/tools.ts` (550) and `workers/mcp/src/lib/tools.ts` (404) describe the SAME gated endpoints in two shapes. — _why:_ one shared descriptor table removes the biggest DRY violation AND structurally prevents drift (today only `catalog.test.ts` stops it). — _where:_ the two `tools.ts` + a new `shared/workers/tool-catalog.ts`.
- [ ] **(Leanness/Robustness)** Extract one `callInternal(path, {cookie, timeout})` seam — the cookie-forward service-binding dance is copy-pasted in both executors + the /internal callers, and each flattens 403/409/500 into one generic string. — _why:_ one helper fixes DRY + status-preservation (the "stuck pending step") in one place. — _where:_ `data-ops/tools.ts`, `mcp/tools.ts`, `shared/workers/`.
- [ ] **(Size)** Split the 8 files >400 LOC by seam — `data-ops/tools.ts` (550), `agent.ts` (535), `web/lib/api.ts` (477), `deep-link-screen.tsx` (473), `import-screen.tsx` (458), `teams.ts` (453), `mcp/tools.ts` (404), `types.ts` (402). — _why:_ each is cohesive but the largest; the catalog-unify above dissolves two of them. — _where:_ listed.
- [ ] **(Leanness)** These three are tracked with reasoning in **BASE-IMPROVEMENTS.md** (P1 #8/#9) — deferred because they sit on the agent/MCP production hot paths and want a focused, heavily-verified session, not a rate-limited sweep.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 85 | green |
| Robustness | 94 | green |
| Documentation | 96 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 74 | orange |
| Scalability & Structure | 93 | green |

## Full findings
### Size & Scope — 85/100 (green)
- Strengths: 258 files / 26.7k LOC for a full 7-worker multi-tenant base + web + shared — focused for the surface it covers; growth this session was tests + declarative rule data, not sprawl.
- To improve: 8 files >400 LOC — watch the two `tools.ts` + `agent.ts`; the catalog-unify refactor trims them.

### Robustness — 94/100 (green)
- Strengths: **12 machine-checked Laws (R1–R12)** now — live-sync, gating, agent parity, fetch timeouts, cron-records; 278 tests / 44 files; boundary validation; the error store; import idempotency. An independent fresh-clone review's findings are all fixed + locked.
- To improve: confirm-resume + browser e2e still lean on staging verification, not unit locks.

### Documentation — 96/100 (green)
- Strengths: 30 docs (5.5k LOC) — README doc-map, CLAUDE (+ the planning ritual), BASE-MANUAL, per-subsystem, BOOTSTRAP (+ teardown), PLATFORMS (top-10), MCP.md, BASE-IMPROVEMENTS (honest backlog), decision trees. Airdrop-grade.
- To improve: a one-line "current status" header per reference doc would save a cross-check.

### Understandability — 91/100 (green)
- Strengths: one declarative ROUTES shape, the gating spine, the glossary, and now the planning ritual + decision trees codify the tribal "what to reach for".
- To improve: the forward executors flatten the door's status — restore it (part of `callInternal`).

### Leanness & Optimization — 74/100 (orange) ← the low point
- Strengths: 1 TODO in 26.7k LOC; the rule/seam tests are pure data; deactivate-not-delete + the shared seams keep most modules thin.
- To improve: **two tool catalogs** describe the same endpoints; the **cookie-forward internal-fetch** is copy-pasted 5+ times; **8 god-files >400 LOC**. All three are the same refactor family (BASE-IMPROVEMENTS P1 #8/#9).

### Scalability & Structure — 93/100 (green)
- Strengths: per-team D1 (the tenancy + sharding unit), `d1QueryAcross` (now `allSettled` with shard diagnostics), the hibernating `TeamChannel` DO, the credit quota, the §6.5 shard runbook.
- To improve: `d1QueryAcross` fails loud on any shard by design — true partial-tolerance is a deliberate per-query opt-in when a query can bear it.
