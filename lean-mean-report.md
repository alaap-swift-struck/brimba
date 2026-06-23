# Lean Mean Check — Brimba
Scanned 2026-06-23 · Overall 91/100 (Grade A) · An A-grade base that held its quality through a major build (5 modules + an AI agent); robustness up via 139 tests + a security pass.

## Fix first (ordered by impact)
- [ ] **(Security/Leanness)** Library: make `ArticleBody` reject `javascript:`/`data:`/`vbscript:` link schemes — _why:_ it's the real stored-XSS sink; the Brimba server is already patched (`workers/content/src/lib/learning.ts` `safeLink`/`safeBody`), but the renderer is the proper fix — _where:_ `swift-struck-ui` `registry/collections/article-body/` (owner runs the library — paste-ready prompt provided).
- [ ] **(Size/Understandability)** Split `web/components/deep-link-screen.tsx` (671 LOC) — _why:_ it holds data-fetch + dispatch + dialogs for every module; extracting per-module pieces lowers surprise and speeds edits/review — _where:_ `web/components/deep-link-screen.tsx`.
- [ ] **(Leanness)** Factor the repeated route-handler shape (`teamContext → requireRight → parse → publish`) into a thin wrapper — _why:_ ~7.3% duplication; a wrapper trims it and removes the risk of an inconsistently-gated route — _where:_ `workers/*/src/routes/*`.
- [ ] **(Robustness)** Add regression tests for the agent confirm-resume rebuild + the credit race — _why:_ both are covered by the review but not yet locked by a test — _where:_ `workers/data-ops/test/`.
- [ ] **(Documentation)** Add a short "start here" map to the root README linking the rulesets — _why:_ orients a new reader (or agent) faster than diving into ARCHITECTURE cold — _where:_ `README.md`.
- [ ] **(Scalability)** Build the external `mcp` worker on the existing gating seam — _why:_ it's the one remaining worker (the external auth surface); reusing the seam keeps the structure clean — _where:_ `workers/mcp/` (new).
- [ ] **(Robustness, carried)** Wire the scaffolded Playwright e2e into CI with a seeded staging account — _why:_ browser flows still run by hand; carried from the base report — _where:_ `web/e2e/`.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 88 | green |
| Robustness | 92 | green |
| Documentation | 92 | green |
| Understandability | 90 | green |
| Leanness & Optimization | 88 | green |
| Scalability & Structure | 92 | green |

## Full findings
### Size & Scope — 88/100 (green)
- Strengths: 16.6k LOC for a whole multi-tenant base + 5 modules + an AI agent; only 2 files over 400 LOC.
- To improve: split the 671-line `deep-link-screen.tsx`.

### Robustness — 92/100 (green)
- Strengths: a publish-seam "can't-forget" test per worker; gating + runtime validation on every route; race-safe invariants (>=1 admin, never-negative credits); 12 adversarial-review findings fixed (stored-XSS, quota bypass, confirm-binding, import caps).
- To improve: add regression tests for the agent confirm-resume conversation rebuild and the credit race.

### Documentation — 92/100 (green)
- Strengths: 14 dense rulesets (ARCHITECTURE/DATA-MODEL/CACHING/CONCURRENCY/OPERATIONS) + 14% meaningful "why" comments; docs reconciled to the build (story-check clean).
- To improve: a short README "start here" map linking the rulesets.

### Understandability — 90/100 (green)
- Strengths: every worker mirrors one shape (switchboard + routes + lib + shared gating); declarative ROUTES + screen recipes make intent obvious.
- To improve: split the host file so each module's wiring is local.

### Leanness & Optimization — 88/100 (green)
- Strengths: 9 shared worker seams; UI primitives from one library (no copied markup); ~zero TODOs.
- To improve: factor the per-route boilerplate (~7% duplication); the library-side `ArticleBody` scheme fix.

### Scalability & Structure — 92/100 (green)
- Strengths: per-team D1 + a sharding seam, a swappable model interface, a registry-driven live-sync layer; clean web / shared / workers / db separation.
- To improve: build the `mcp` worker on the existing seam.
