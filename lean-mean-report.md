# Lean Mean Check — Brimba
Scanned 2026-06-12 · Overall 80/100 (Grade B) · Small, clean, and built on the right architecture — make the tests and the borrowed theme file catch up and it's an A.

## Fix first (ordered by impact)
- [ ] **(Robustness)** Add CI that runs `npm run check` on every push — _why:_ the repo has no automated gate (the library repo does); one small GitHub Action catches breakage before any deploy — _where:_ `.github/workflows/ci.yml` (new)
- [ ] **(Robustness)** Add an integration test for the team factory — _why:_ `createTeam`/`bootstrap` is the most critical path in the product and is only proven by manual e2e; a staging smoke script or fake-D1 test protects it permanently — _where:_ `workers/tenancy/` (test), `workers/tenancy/src/lib/teams.ts`
- [ ] **(Leanness)** Replace the copied theme with a library import — _why:_ `web/app/globals.css` (317 lines, 13% of the codebase) duplicates the master in swift-struck-ui; until the library exports it, every theme change is hand-copied (drift risk #1). Library-side chip already spawned — _where:_ `web/app/globals.css`, swift-struck-ui repo
- [ ] **(Robustness)** Add one retry with backoff to the D1 REST door + cleanup for half-created teams — _why:_ `d1-rest.ts` fails on the first transient API blip; a failed `createTeam` can leave an orphaned database with the team row marked `failed` — _where:_ `shared/workers/d1-rest.ts`, `workers/tenancy/src/lib/teams.ts`
- [ ] **(Leanness/Understandability)** Move the duplicated `json()`/`fail()` response helpers to shared — _why:_ defined 3× across workers (~25 lines); one `shared/workers/http.ts` removes the only real copy-paste — _where:_ `workers/{auth,tenancy,gateway}/src/index.ts`
- [ ] **(Scalability)** Build the locked sharding machinery — _why:_ the locked decision says 80% size alarms + module-mover + splitter get built up front; the seams exist (one data door, ULIDs) but the machinery doesn't yet — _where:_ `workers/tenancy/` (+ a cron trigger), `shared/workers/d1-rest.ts`
- [ ] **(Scalability)** Land permission ENFORCEMENT with the first module — _why:_ `role_permissions` rows are seeded but no request is checked against them yet; locked rule: server-side checks on every call — _where:_ next module worker (content), `workers/tenancy`

## Scores
| Dimension | Score | Status |
|---|---|---|
| Size & Scope | 90 | green |
| Robustness | 68 | orange |
| Documentation | 88 | green |
| Understandability | 88 | green |
| Leanness & Optimization | 72 | orange |
| Scalability & Structure | 78 | green |

## Full findings

### Size & Scope — 90/100 (green)
- Strengths: login + onboarding + per-team DB factory in ~2,500 lines across 44 files; nothing over 400 lines (largest hand-written file: 158).
- To improve: the single biggest file (317-line globals.css) is a copy of the library theme — shrinks to ~3 lines once the library exports it.

### Robustness — 68/100 (orange)
- Strengths: strict TS everywhere; all inputs validated (emails, codes, names, image type/size); abuse limits (5 codes/hr, 5 tries/code); codes + session tokens stored as hashes only; graceful failure paths (`cloud_key_missing`, `db_status='failed'`); 12 green unit tests on the pure logic.
- To improve: no CI on push; no integration test for createTeam/bootstrap; no retry/backoff on the Cloudflare REST calls; orphaned-DB cleanup path missing.

### Documentation — 88/100 (green)
- Strengths: README orients in a minute; ARCHITECTURE.md = the 20 locked decisions; OPERATIONS.md is a real runbook (deploys/secrets/migrations/local dev); UI-GAPS.md tracks placeholder debt; plain-English header comment in every file; zero stale TODOs.
- To improve: no single list of API actions yet — the MCP front-desk catalog (locked decision) becomes exactly that; write it as actions grow.

### Understandability — 88/100 (green)
- Strengths: identical worker pattern (env → router → lib) ×3; guessable top-level layout (web/workers/shared/db); plain names; short functions.
- To improve: json()/fail() re-defined per worker — share them and the pattern is literally one thing to learn.

### Leanness & Optimization — 72/100 (orange)
- Strengths: ONE data door to all team DBs (d1-rest.ts); shared types + id helper prevent web/worker drift; Google removal left zero residue; no dead code; 4% duplicate lines overall.
- To improve: the 317-line theme copy (main drift risk; library fix flagged); 3× response helpers; two temp UI components (code-input, auth-card) tracked in UI-GAPS.md and waiting on the library.

### Scalability & Structure — 78/100 (green)
- Strengths: per-team database isolation proven live; ULIDs everywhere (shard-ready row moves); migrate-all-teams robot already built; domain-worker boundaries match the locked architecture.
- To improve: sharding machinery (alarms/mover/splitter) not yet built despite the build-up-front decision; permission enforcement not yet wired to requests (must land with the first module).
