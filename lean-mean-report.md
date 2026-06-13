# Lean Mean Check — Brimba
Scanned 2026-06-13 · Overall 91/100 (Grade A) · Ship-grade and getting safer — the member guards are now auto-tested, branding is fully centralised and audited, and it's still lean.

Since the last check (90): fixed the #1 robustness gap (8 new automated tests for the member-mutation guards), added a centralised branding system (name/logo/motto/description + accent colours in shared/brand.ts — proven to re-skin the whole app from one edit, audited by 4 agents for zero hardcoded leaks), and refined the living background. Robustness 86 → 90.

## Fixed since last check
- [x] **(Robustness)** Member mutations + guards now auto-tested — change-role, remove, self-lockout, last-admin, unknown-target/role (8 tests, mocked team DB + global stub). The top finding is closed.
- [x] **(Leanness)** Branding + theme each have ONE source; a 4-agent audit confirmed zero hardcoded name/colour leaks.

## Fix next (ordered)
- [ ] **(Robustness)** Browser-level e2e once the Members/Roles screens land — _why:_ API + unit are strong; Playwright covers the UI layer — _where:_ web/
- [ ] **(Robustness)** Confirm the permission-deny path with a real 2nd member — _why:_ unit-tested via mocks; a live Viewer (via Invites) proves it end-to-end — _where:_ workers/tenancy, Invites phase
- [ ] **(Leanness)** Graduate code-input + auth-card + app-bar into the library, delete temps — _why:_ the only planned debt — _where:_ web/components/temp, web/components/app-shell.tsx, UI-GAPS.md
- [ ] **(Scalability)** Server-enforce auto-flip-read when Roles ships — _why:_ "any write needs read" must hold on write, not just the matrix UI — _where:_ roles backend
- [ ] **(Scalability)** Rehearse one real module move — _why:_ the mover is built but hasn't moved live data — _where:_ POST /api/tenancy/admin/move-module

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 92 | green |
| Robustness | 90 | green |
| Documentation | 91 | green |
| Understandability | 91 | green |
| Leanness & Optimization | 91 | green |
| Scalability & Structure | 90 | green |

## Full findings

### Size & Scope — 92/100 (green)
- Strengths: ~4.2k lines / 63 files covers auth, teams, the app shell, members, sharding, a reset tool AND a full branding system; zero files over 400 (largest ~330).
- To improve: split the tenancy router into per-module handler files as it grows.

### Robustness — 90/100 (green)
- Strengths: the #1 prior gap is fixed — member guards (change-role/remove/self-lockout/last-admin/unknown-target) are automated; strict types, validation, rate limits, hashed secrets, retry/backoff, an 11-check live smoke each deploy; 29 tests.
- To improve: no browser e2e yet; the permission-deny path is mock-tested, pending a live 2nd member via Invites.

### Documentation — 91/100 (green)
- Strengths: shared/brand.ts self-documents how to rebrand; OPERATIONS runbook + ARCHITECTURE actions table stay current.
- To improve: grow the actions table per module.

### Understandability — 91/100 (green)
- Strengths: one worker pattern (teamContext), one frontend pattern (useActiveTeam + AppShell), one obvious brand source; emoji-free UI.
- To improve: nothing pressing.

### Leanness & Optimization — 91/100 (green)
- Strengths: brand + theme each single-source; a 4-agent adversarial audit found ZERO hardcoded name/colour leaks; shared helpers; theme imported, never copied.
- To improve: three UI pieces (code-input, auth-card, app-bar) wait to graduate into the library — the only planned debt.

### Scalability & Structure — 90/100 (green)
- Strengths: permission seam is load-bearing (every member action checked server-side); per-team DB isolation + sharding proven; the base re-skins for a new app from one file.
- To improve: rehearse one module move; server-enforce auto-flip-read when Roles ships.
