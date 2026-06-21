# Lean Mean Check — Brimba
Scanned 2026-06-21 · Overall 85/100 (Grade B) · Lean, well-documented, scale-minded base; the one real gap is the web app has no behaviour tests — exactly where this week's bugs slipped through.

> Prior run 2026-06-18 was 91/A. The dip is honest, not a broad regression: M3 grew the web tier with a large orchestrator file (deep-link-screen.tsx, 648 LOC) and the reload + invite bugs reaching staging exposed that the web app has no behaviour tests (it was always tested server-side only). Closing that one gap + splitting the orchestrator moves it back toward A.

## Fix first (ordered by impact)
- [ ] **(robustness)** Add behaviour/navigation tests for the web app — _why:_ 3.3k lines of UI (`web/`) are only type-checked + smoke-tested; the full-page-reload bug and the invite error that reached staging this week would have been caught by a click-through test of the `/t/*` flows. A small Playwright (or similar) pass over open-team → members → change-role → invite closes the gap CI currently misses. — _where:_ `web/components/deep-link-screen.tsx`, the `/t/[[...path]]` flows; wire into CI alongside `npm run check`.
- [ ] **(size / understandability)** Split the deep-link orchestrator — _why:_ `web/components/deep-link-screen.tsx` is 648 lines doing parse + per-module fetch + shaping + onAction dispatch + render + all the write dialogs; extracting the dialogs and the per-module data/shaping into small pieces (or a data-driven module registry) lowers the "hold it all at once" cost and keeps it flat as more modules join the engine. — _where:_ `web/components/deep-link-screen.tsx`.
- [ ] **(leanness)** Lift duplicated helpers into one util — _why:_ ~7.2% duplicate lines; `fullName` / `initials` / row-shaping logic recur across components — one shared util removes drift risk. — _where:_ `web/components/*` (members/role/invite shaping), `web/lib/format.ts`.
- [ ] **(documentation)** Keep docs reconciled each shipping round — _why:_ the story-check found ~12 stale spots this pass (retired `/settings/team`, phantom `workers/config`, milestones marked to-do); now fixed — the habit to keep is updating the conceptual docs in the same commit as the code so they never lag again.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 89 | green |
| Robustness | 73 | orange |
| Documentation | 91 | green |
| Understandability | 86 | green |
| Leanness & Optimization | 85 | green |
| Scalability & Structure | 91 | green |

## Full findings
### Size & Scope — 89/100 (green)
- Strengths: 125 files / 10.1k LOC is tiny for a multi-tenant SaaS base; net −522 lines last migration; 0 TODOs; only 2 files over 400 LOC.
- To improve: `deep-link-screen.tsx` (648 LOC) is the one large file — split it.

### Robustness — 73/100 (orange)
- Strengths: server is hardened — 71 passing tests, atomic-SQL last-admin + unique-invite guards, GuardError→clean 4xx, full TypeScript across web + 5 workers, defensive seams (reportError, ErrorBoundary, `isScreenRecipe`).
- To improve: the web app has **no** behaviour/nav tests (8% test:code, all server-side) — the reload + invite bugs that reached staging are the evidence. Add web interaction tests to CI.

### Documentation — 91/100 (green)
- Strengths: a full, current conceptual layer with dated LOCKED decisions; comments explain the non-obvious; just reconciled to the shipped code.
- To improve: docs had drifted before this pass — reconcile them in the same commit as code going forward.

### Understandability — 86/100 (green)
- Strengths: predictable by-convention layout; single page/nav registry; central icon vocabulary; clear entry points.
- To improve: the orchestrator concentrates a lot of logic with hoisted nested helpers — extract per-module data + dialogs.

### Leanness & Optimization — 85/100 (green)
- Strengths: UI from one library; shared types + central email template + central icon map; anti-bloat is real (net-negative migrations).
- To improve: ~7% duplicated helper lines (name/shaping) — lift into one util.

### Scalability & Structure — 91/100 (green)
- Strengths: per-team DB isolation, hibernating realtime DOs, atomic-SQL concurrency, config-driven screen engine, swappable seams (error reporter, AI interface, recipe overrides).
- To improve: new engine modules funnel through one host file — a data-driven module registry would keep it flat.
