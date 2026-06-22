# Lean Mean Check — Brimba (the SaaS base)
Scanned 2026-06-22 · Overall 92/100 (Grade A) · A lean, thoroughly-documented, genuinely scalable SaaS base — now fully tested, with a structural guarantee that live-updates can't be forgotten.

## Fix first (ordered by impact)
- [ ] **(robustness)** Wire the scaffolded Playwright e2e suite into CI — _why:_ today's coverage is strong unit + real-SQLite integration, but the browser flows (login → team → members → change role → invite, asserting no reload + live row update) only run by hand; they need a seeded teamful staging account + `DEV_ECHO_CODES`. Until then end-to-end regressions can slip. — _where:_ `web/e2e/team-flows.spec.ts`, `web/playwright.config.ts`, `web/e2e/README.md`.
- [ ] **(understandability/size)** Extract the dialog-wiring block from the deep-link orchestrator — _why:_ `deep-link-screen.tsx` is still the densest file (496 LOC) because it wires routing + data + the 5 dialogs; pulling the dialogs into a `ScreenDialogs` component (props-driven) would drop it ~70 lines and lower the surprise for a newcomer. — _where:_ `web/components/deep-link-screen.tsx` (the `<RolePickerDialog>…<ConfirmAction>` block).
- [ ] **(size)** Split `teams.ts` along its seam — _why:_ 453 LOC mixing the team-factory (create/migrate/seed/stamp) with the read/context functions (active context, switcher, accept); separating factory vs. queries would ease review without changing behavior. — _where:_ `workers/tenancy/src/lib/teams.ts`.
- [ ] **(leanness)** Trim the residual route-handler repetition — _why:_ ~6.7% duplicate lines, mostly inherent (per-table SQL audit columns, near-identical `teamContext → requireRight → mutate → publish` shapes); a small route-handler helper could fold the rest. — _where:_ `workers/tenancy/src/routes/*.ts`.
- [ ] **(documentation)** Prefer "the full suite" over hard test counts in prose — _why:_ specific counts rot as tests are added; phrase docs so they can't go stale. — _where:_ already done in ARCHITECTURE.md §2; watch OPERATIONS.md.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 91 | green |
| Robustness | 92 | green |
| Documentation | 93 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 88 | green |
| Scalability & Structure | 94 | green |

## Full findings
### Size & Scope — 91/100 (green)
- Strengths: ~83 lines/file average; a real multi-worker SaaS base in 11.5k lines with no sprawl; biggest file dropped 727→496 this pass.
- To improve: two cohesive files remain long (deep-link-screen 496, teams 453) — _why:_ extracting the dialog-wiring and the team-factory would ease review.

### Robustness — 92/100 (green)
- Strengths: web went from untested → 44 tests including the live-update core (patchRow/reconcile); a CI guard test (`publish-seam.test.ts`) fails the build if any mutation forgets to publish; real-SQLite integration tests cover the atomic last-admin / unique-invite races; the diff just passed an adversarial review with both findings fixed.
- To improve: end-to-end browser tests are scaffolded but not in CI — _why:_ they need a live target + seeded account; coverage today is unit + integration.

### Documentation — 93/100 (green)
- Strengths: 11 root rulesets, one source of truth per topic; just reconciled to zero story-gaps (story_checks_out clean); 14% comment ratio focused on the non-obvious (the publish seam, patchRow, the live-sync rules).
- To improve: avoid hard counts in prose so docs can't drift.

### Understandability — 91/100 (green)
- Strengths: predictable by-convention layout; a declarative route table + a registry-driven live handler that read like documentation; self-explaining names.
- To improve: the orchestrator file is the densest spot — _why:_ pulling the dialog block out lowers newcomer surprise.

### Leanness & Optimization — 88/100 (green)
- Strengths: identity helpers de-duped into one util; 4 hand-built lists migrated to the library List; UI only from the shared library; shared worker/web utils.
- To improve: ~6.7% duplicate lines, mostly inherent SQL/CRUD similarity — _why:_ a route-handler helper could trim the rest.

### Scalability & Structure — 94/100 (green)
- Strengths: per-team databases + Durable Objects addressed by key (scales by tenant, not code); swappable seams (live publish, data layer, screen-recipe engine); clean lib/routes/web separation.
- To improve: sharding machinery is built but not yet exercised at scale — _why:_ wants a real load test before very large tenants.
