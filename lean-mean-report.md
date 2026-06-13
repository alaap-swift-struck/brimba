# Lean Mean Check — Brimba
Scanned 2026-06-13 · Overall 90/100 (Grade A) · Still ship-grade and lean as it grows — the one thing to watch is automated tests catching up to the newest backend.

Since the last check (91): added Phase A (the live app shell — team switcher + profile + active-team hub, create/switch teams), the Members backend (list/roles/change-role/remove with all four guard rules + a shared activity log), light/dark mode (follows system + manual toggle), a richer living background, and Resend went live. The permission seam is now WIRED into real endpoints. Score held at 90 (A); the 2-point robustness dip is honest — a lot of new backend shipped and its automated tests haven't caught up yet (verified by hand on staging instead).

## Fix first (ordered by impact)
- [ ] **(Robustness)** Auto-test the member mutations + guards — _why:_ change-role, remove, the last-admin guard and the permission-deny path are verified manually on staging but have NO automated test; they need a seeded 2nd member, so build them WITH Invites — _where:_ `workers/tenancy/src/lib/members.ts`, new tenancy tests
- [ ] **(Robustness)** Add an integration harness for team-DB logic — _why:_ DB-coupled mutations are proven via manual curl; a fake-D1 or a staging integration script covers them on every push — _where:_ `workers/tenancy/`
- [ ] **(Leanness)** Graduate the 3 tracked UI pieces into the library, then delete temps — _why:_ code-input + auth-card (temps) and app-bar (composition); plus the flagged permission-matrix — the only planned debt — _where:_ `web/components/temp/`, `web/components/app-shell.tsx`, UI-GAPS.md
- [ ] **(Scalability)** Server-enforce the auto-flip-read rule when Roles ships — _why:_ "any write needs read" must hold on write, not just in the matrix UI — _where:_ roles backend (Phase B)
- [ ] **(Scalability)** Rehearse one real module move — _why:_ the mover is built + reviewed but has never moved live data — _where:_ POST /api/tenancy/admin/move-module

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 92 | green |
| Robustness | 86 | green |
| Documentation | 91 | green |
| Understandability | 90 | green |
| Leanness & Optimization | 90 | green |
| Scalability & Structure | 90 | green |

## Full findings

### Size & Scope — 92/100 (green)
- Strengths: ~3.9k lines / 59 files now covers auth, teams, the app shell, members management, sharding AND a reset tool; zero files over 400 (largest 307).
- To improve: watch the tenancy router (index.ts ~300 lines) — split handlers per module if it keeps growing.

### Robustness — 86/100 (green)
- Strengths: strict types, validated inputs, rate limits, hashed codes/tokens, graceful failures, retry/backoff on cloud calls; 21 unit tests; an 11-check LIVE smoke on every staging deploy; the reset tool self-tests.
- To improve: the newest member actions (change-role, remove, last-admin guard, permission-deny) are verified by hand, not automated — the #1 gap; no integration harness for DB-coupled logic yet.

### Documentation — 91/100 (green)
- Strengths: ARCHITECTURE actions table (MCP-catalog seed), OPERATIONS runbook (deploy/secrets/reset/Resend), UI-RULES, and UI-GAPS carrying a full build-spec for the one needed library component; zero stale TODOs.
- To improve: keep the actions table growing with each module.

### Understandability — 90/100 (green)
- Strengths: identical worker shape ×3, every handler opens with teamContext(); frontend mirrors it with one useActiveTeam hook + AppShell; honest names; emoji-free UI.
- To improve: nothing pressing — hold the convention.

### Leanness & Optimization — 90/100 (green)
- Strengths: theme + living background + UI rules live ONCE in the library (imported, not copied); shared activity/http/id/data-door helpers; 4.4% dup is mostly inherent SQL audit blocks.
- To improve: three UI pieces (code-input, auth-card, app-bar) wait to graduate into the library — the only planned debt.

### Scalability & Structure — 90/100 (green)
- Strengths: the permission seam is load-bearing (every member action runs through requireMember + requireRight); per-team DB isolation + sharding machinery proven; reset tool keeps the data layer addressable.
- To improve: rehearse one module move; server-enforce auto-flip-read when roles ship.
