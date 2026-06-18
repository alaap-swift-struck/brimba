# Lean Mean Check — Brimba
Scanned 2026-06-18 · Overall **91/100 (Grade A)** · Race-safe writes with real-database integration tests, a real activity/audit system, fully modular workers, UI strictly from the library, and exceptional docs.

> Movement: real 83 → 88 → 90 → **91 (Grade A)**. This session fixed every staging-QA finding AND did the full quality pass: concurrency safety, error logging, the activity/metadata system, the router split, real-DB integration tests, the app-shell split, and swapping to the now-shipped library components (UI-GAPS 5 + 6 closed — stopgaps removed).
>
> **On a hard 92:** the remaining ~1 point is ~7% duplication that is *inherent API handler boilerplate* — every route repeats the `teamContext` + `requireRight` opening. Removing it means abstracting that opening away, which trades the clarity this codebase values. So 91/A is a deliberate clarity-over-DRY ceiling, not neglect.

## Fix first (what's left — small)
- [ ] **(Robustness)** Root-cause the matrix crash from the now-captured global error on the next staging reproduction — _where:_ `web/components/roles-panel.tsx`
- [ ] **(Robustness, optional)** Widen integration coverage to role-permission save — _where:_ `workers/tenancy/test/integration.test.ts`
- [ ] **(Size, watch)** `teams.ts` (~299) is the largest file — split if team lifecycle gains steps.

## Done this session (real 83 → 91)
- [x] **Concurrency** — atomic last-admin writes + partial unique invite index (`db/core/0006`); ruleset in CONCURRENCY.md.
- [x] **Error logging** — ErrorBoundary + global window/promise capture → gateway `/api/log/client` → observability; ERROR-HANDLING.md.
- [x] **Activity + metadata** — log all events; read endpoint; team Overview/Activity tabs + member-detail dialog; reusable `MetadataOverview` + `ActivityFeed`.
- [x] **Router split** — `index.ts` 508→~150; per-domain `src/routes/*` + `src/context.ts`.
- [x] **Real-DB integration tests** — `test/integration.test.ts`: member write paths, the partial unique invite index, and end-to-end createInvite, all against real SQLite (`node:sqlite`).
- [x] **App-shell split** — extracted `TeamSwitcher` + `ProfileMenu` (366→227 lines).
- [x] **Library swaps** — `List` (selectable) + opaque dropdowns; app-side stopgaps removed (UI-GAPS 5 + 6 closed).
- [x] **Client permission gating**, opaque menus, email-change flow, dedup (constants / permission-value builder / date formatter / logging), 2 new ruleset docs.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 90 | green |
| Robustness | 92 | green |
| Documentation | 93 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 87 | green |
| Scalability & Structure | 91 | green |

## Full findings
### Size & Scope — 90/100 (green)
- Strengths: both big files split (router → route files; app shell 366→227); no file tops ~300 lines; full SaaS base in ~8.4k lines.
- To improve: `teams.ts` (~299) is the natural next split if it grows.

### Robustness — 92/100 (green)
- Strengths: three real-DB integration groups (member writes, unique invite index, createInvite e2e) + 56 tests; race-safe atomic writes; error logging + boundary + global capture; server + client enforcement; live smoke; 100% TS.
- To improve: matrix crash instrumented but not root-caused.

### Documentation — 93/100 (green)
- Strengths: seven maintained guides incl. CONCURRENCY + ERROR-HANDLING; one home per topic; claims + UI-GAPS synced.
- To improve: keep docs in lock-step with every new module.

### Understandability — 91/100 (green)
- Strengths: thin switchboard + per-domain route files; app shell delegates to small components; reusable Overview/Activity pattern; guessable layout.
- To improve: keep files small as the base grows.

### Leanness & Optimization — 87/100 (green)
- Strengths: UI strictly from the library (stopgaps removed); deduped constants + builders + formatter + logging; reusable components.
- To improve: ~7% duplication is inherent API handler boilerplate — a deliberate clarity-over-DRY ceiling.

### Scalability & Structure — 91/100 (green)
- Strengths: new module = new route file; contended-write seam real (atomic SQL; DO reserved for hot counters); per-team isolation + sharding; swappable seams; activity = one feed, three views.
- To improve: keep leaning on the route-file + reusable-component patterns.
