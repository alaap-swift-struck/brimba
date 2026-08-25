# Security sentry — round 4 — Brimba · 2026-08-25
SCORE: 83/100   (R1 68 · R2 68 · R3 79 · **R4 83**)

Measured against `main` @ **`8a7e906`**, working tree clean (`git status --porcelain` → 0
lines), local `main` == `origin/main`. Every sabotage ran in
`…/scratchpad/f4-sec-sandbox`, a copy, restored between runs. **Nothing in this
repository was written except this file.**

Sandbox baseline: tenancy **125/125** (R3 measured 119 — the derived guard suite added 6),
web rules **29/29**.

> **A note on the aggregate.** R3 reported `ControlScore 96.47` from a formula I could not
> reproduce from its own ratio table (a plain mean of its thirteen ratios gives 95.58, not
> 96.47). Rather than inherit an unreproducible number, I recompute with a **stated**
> formula — coverage-weighted, i.e. `Σ numerators ÷ Σ denominators` — and I recompute R3
> the same way so the delta is apples-to-apples. Under this formula R3 = 78, not 79.

## Arithmetic

| # | Criterion | R1 | R2 | R3 | **R4** | Ratio | Why it moved |
|---|---|---|---|---|---|---|---|
| C1 | Authorization | 60/61 | 60/61 | 59/60 | **59/60** | 0.98333 | Unchanged *deliberately*. `POST /publish` is now a named exemption whose premise is machine-asserted — but the premise (`workers_dev:false`) was already true in R1, when C6 scored 7/7. Only the **lock** improved, so the credit belongs in C12, not here. Moving C1 for a better test would be scoring my own attention |
| C2 | Authentication | 94/95 | 94/95 | 93/94 | **93/94** | 0.98936 | Unchanged |
| C3 | Query safety | 283/283 | 288/288 | 273/273 | **274/274** | 1.00000 | +1 interpolation: `oneMember` (`members.ts:202`) uses `${MEMBER_SELECT}`, a code-owned constant; the user id is bound `?`. No injection |
| C4 | Boundary validation | 62/87 | 63/87 | 63/85 | **63/85** | 0.74118 | Unchanged. Not one input gained a runtime check this round; the 24 truthiness-only identifier sites are still 24 |
| C5 | Secret hygiene | 12/12 | 12/12 | 12/12 | **12/12** | 1.00000 | Re-swept the 4 new commits — 0 secret-shaped literals |
| C6 | Surface minimization | 7/7 | 7/7 | 7/7 | **7/7** | 1.00000 | Unchanged |
| C7 | Credentials at rest | 4/4 | 4/4 | 4/4 | **4/4** | 1.00000 | Unchanged |
| C8 | Fail-closed gates | 12/12 | 12/12 | 12/12 | **12/12** | 1.00000 | Unchanged |
| C9 | Resource bounds | 42/49 | 44/49 | 45/49 | **45/49** | 0.91837 | Unchanged |
| C10 | Output scoping | 41/43 | 41/43 | 41/43 | **41/43** | 0.95349 | Unchanged — both `/media/*` routes still serve R2 objects with no membership check |
| C11 | Render safety | 3/3 | 3/3 | 3/3 | **3/3** | 1.00000 | Unchanged |
| C12 | Invariant locking | 18/24 | 21/24 | 21/25 | **23/25** | 0.92000 | **+2, the only criterion that moved.** (a) the role-assignment invariant now has a door-level test I could not defeat on either real door; (b) the census tripwire's floor moved 60 → 90 *and* gained per-worker presence assertions, closing R3's silent-skip finding. See the sabotage log |
| C13 | Dependency health | 1/1 | 1/1 | 1/1 | **1/1** | 1.00000 | Independently re-run: `npm install` in a fresh clone → **0 vulnerabilities** |

```
ControlScore = Σ numerators ÷ Σ denominators
  numerators   59+93+274+63+12+7+4+12+45+41+3+23+1 = 637
  denominators 60+94+274+85+12+7+4+12+49+43+3+25+1 = 669
  637 ÷ 669 = 0.95217 → 95.22

Penalty: 0 critical, 0 high, 2 medium, 3 low          = 12
  (R3 = 17: three mediums. M2 "the guard is unlocked" is CLOSED; M1 "the census
   lies in both directions" is half-closed — over-reporting fixed, under-reporting
   not — so it demotes rather than clears.)

Posture = 95.22 − 12 = 83.22 → 83

Same formula applied to R3: 634 ÷ 668 = 94.91 − 17 = 77.91 → 78.   78 → 83 = +5.
```

## The sabotage log — the guard

Every run is `npx vitest run` in `workers/tenancy`, sandbox restored between each.

| # | Attack | Result |
|---|---|---|
| S1 | Delete `assertCanAssignRole` from `members.ts:289` | **CAUGHT** — 124/125, `members.ts → changeMemberRole` |
| S2 | Delete it from `invites.ts:186` | **CAUGHT** — 124/125, `invites.ts → createInvite` |
| S3 | Delete it from **both** (R3's winning attack, which left tenancy at 119/119) | **CAUGHT** — 123/125, both named |
| S4 | New file in `src/lib/`, `export async function`, plain `INSERT INTO team_members`, no guard | **CAUGHT** — 125/126 |
| S5 | Same door placed in **`src/routes/`** | **PASSED — 125/125** |
| S6 | Same door in `src/lib/` as `export const f = async () => {…}` | **PASSED — 125/125** |
| S7 | Same door in `src/lib/`, `INSERT **OR REPLACE** INTO team_members` | **PASSED — 125/125** |

**R3's finding is genuinely closed.** S1–S3 prove both real doors, and S4 proves the
derivation is a derivation and not a list — a brand-new door fails the day it is written.
That is the whole point and it works.

S5–S7 are the residue, and S5 is the one that matters: **`workers/tenancy/src/routes/` is
not hypothetical.** It exists and holds six files (`admin.ts`, `invites.ts`, `members.ts`,
`roles.ts`, `selectable.ts`, `team.ts`). The scan reads `src/lib` only. I verified no route
file assigns a role today — a repo-wide grep for `INSERT INTO team_members` /
`INSERT INTO invite_index` / `UPDATE team_members SET … role_id =` returns hits in
`lib/{members,invites,teams}.ts` and nowhere else — so **this is not a live hole**. It is a
hole the next door falls through, in the sibling directory of the doors it already guards.

## The census — neither claim survives unqualified

Recounted by parsing `ROUTE-CENSUS.md` directly and independently sweeping route literals
out of `workers/*/src`.

**Over-reporting: FIXED.** The table has 99 rows — GET 36, POST 60, ANY 3. The header says
`99 routes · 60 state-changing · 2 with no gate detected`, and 60 is exactly the
POST/PUT/PATCH/DELETE count: `ANY` rows are no longer counted as state-changing. The 2
ungated state-changing doors are `POST /api/auth/email/start` and `POST /publish`, both in
`OPEN_BY_DESIGN` with reasons over the 60-character floor, and `/publish`'s reason rests on
`workers_dev:false` — which is asserted for all six non-gateway workers at
`web/test/rules.test.ts:897-903`. R3's "trains its reader to discount it" complaint is
answered.

**Under-reporting: UNCHANGED at 5 doors.**

| Worker | Route literals in source | Census rows | Missing |
|---|---|---|---|
| auth | 13 | 13 | — |
| tenancy | 35 | 34 | `GET /api/tenancy/health` (`index.ts:146`) |
| content | 20 | 19 | `GET /api/content/health` (`index.ts:102`) |
| data-ops | 24 | 23 | `GET /api/data-ops/health` (`index.ts:110`) |
| mcp | 5 | 5 | — |
| realtime | n/a (different dispatch shape) | 3 | — |
| gateway | n/a | 2 | `GET /media/*`, `GET /media/learning/*` (`index.ts:275,283`) |

True surface **104**, census **99** → 95.2%. All five misses are GET, so the
security-relevant count (60 state-changing, 2 named-open) is **not** affected. But the two
gateway misses are precisely the two doors carrying C10's open finding, so the census omits
the doors with a live finding against them.

**The blindness floor is now real.** `toBeGreaterThan(90)` against a truth of 99, plus
`rows.some(r => r.worker === w)` for gateway/realtime/auth/mcp. Losing any single worker now
fails: tenancy→65, data-ops→76, content→80 all trip the floor; the other four are named.
R3's silent-skip finding is **closed**.

## Findings

### M1 · MEDIUM — the role-guard derivation has three proven escapes, and one is a directory that already exists
`workers/tenancy/test/roles.test.ts:308-360`

The scan reads `src/lib/*.ts` only, matches `export async function (\w+)` only, and detects a
write with `/INSERT INTO team_members\b/i`, `/INSERT INTO invite_index\b/i` and
`/UPDATE team_members SET(?:(?!WHERE)[\s\S])*?\brole_id\s*=/i`. Proven past all three: S5 (a
door in `src/routes/`, which holds six files today), S6 (an arrow-function export), S7
(`INSERT OR REPLACE INTO`). Why it matters: this is a *derived* list precisely so the next
door cannot dodge it, and three ordinary code shapes dodge it. **Fix:** walk `src/**/*.ts`
rather than `src/lib`; match `export (async function|const) (\w+)`; widen the insert
predicate to `/INSERT(\s+OR\s+\w+)?\s+INTO\s+(team_members|invite_index)\b/i`. Add S5/S6/S7
as fixtures so the widening is itself locked.

### M2 · MEDIUM — the census under-reports 5 doors, including both with an open finding against them
`scripts/route-census.mjs` · `ROUTE-CENSUS.md:10`

Three inline `GET /health` routes (an `if (route === "…")` before the `ROUTES` table) and the
two gateway `/media/*` handlers (dispatched by `pathname.startsWith`, not a literal) are
invisible to the parser. The header's "99 routes" is therefore 5 short of 104. Why it
matters: the census exists so a reviewer inherits the surface instead of rediscovering it —
and a reviewer who inherits it will never see the two R2 doors that serve tenant media with
no membership check. **Fix:** teach the parser the `if (route === "METHOD /path")` form and
the `pathname.startsWith("/prefix")` form; assert `rows.length === 104` rather than `> 90`
once it is exact.

### L1 · LOW — the ungated check now excludes `ANY` by method, and `ANY /mcp` carries every external mutation
`web/test/rules.test.ts:883-884`

`r.method !== "GET" && r.method !== "ANY"` fixed the over-reporting, but it also means a
state-changing `ANY` door can never trip the check. `gateway ANY /mcp` is the entry point for
every MCP JSON-RPC call and shows **none detected**. Not a hole today — the gate is
downstream in the mcp worker's own token verification, and mcp's five routes are censused
separately — but the check is now structurally unable to see this shape. **Fix:** classify
`ANY` rows by whether the handler forwards non-GET, rather than excluding them by method.

### L2 · LOW (carried, unchanged) — `/media/*` serves tenant objects with no membership check
`workers/gateway/src/index.ts:275,283`. C10 stands at 41/43. Keys are unguessable and the
orphan sweep bounds exposure, but possession of a key is the whole authorization.

### L3 · LOW (carried, unchanged) — 24 identifier sites are truthiness-checked only
C4 stands at 63/85. Bad input reaches SQL as a bound parameter (so not injectable) but
produces a 500 shape rather than the 400 the base promises.

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| M1 — widen the guard derivation to `src/**`, arrow exports, `INSERT OR …` | `workers/tenancy/test/roles.test.ts` (+~12 lines, 3 fixtures) | ADDS test surface; REMOVES three escape shapes | **lean_mean** — more test code on a criterion where less code scores better. Mild **speed** cost: the scan reads `src/**` instead of one directory, on every `npm run check` |
| M2 — teach the census the `if (route === …)` and `startsWith` forms | `scripts/route-census.mjs` (+~20 lines), `ROUTE-CENSUS.md` (regenerated, +5 rows), `web/test/rules.test.ts` (floor 90 → exact 104) | ADDS 5 rows and an exact assertion; REMOVES a 5-door blind spot | **lean_mean** (parser grows). **story_checks_out** — `ROUTE-CENSUS.md` is generated and any doc quoting "99 routes" goes stale in the same commit; grep for the figure before landing |
| L1 — classify `ANY` by forwarded method instead of excluding it | `web/test/rules.test.ts`, `scripts/route-census.mjs` | ADDS a third `kind` classification | **none** — it changes how three existing rows are labelled; no runtime code and no new door |
| L2 — membership check on `/media/*` | `workers/gateway/src/index.ts` | ADDS an auth hop per media request | **speed_review + round_trip_review directly**: `/media/*` is deliberately outside the surge ceiling and served from cache; adding a gate puts an auth round trip in front of every image. **spend_review** too (a worker invocation per asset). This is a real trade, not a free win — the LOW severity is partly *because* the fix costs more than the finding |
| L3 — `requireText` on the 24 identifier sites | `shared/workers/validate.ts` callers across 4 workers | ADDS ~24 call sites; REMOVES 500-shaped failures | **lean_mean** (24 more lines). Marginal **speed** cost per request, well under a millisecond |

## CEILING

**95 is not reachable by changing code, and the binding constraint is C4.**

C4 sits at 63/85 = 0.741 and is 85/669 = 12.7% of the coverage-weighted denominator. Taking
C4 to 85/85 with every other criterion held moves ControlScore to 659/669 = 98.51; minus a
best-case penalty of 0 that is **98.5**, so 95 is arithmetically reachable *in principle*.

But it requires the penalty to reach 0, and two findings cannot go to zero by commit:

- **L2 is capped by a locked decision.** ARCHITECTURE.md and the gateway's own comment place
  `/media/*` outside the surge ceiling *by design*, served from cache as static objects.
  Gating it contradicts that decision. Until the owner relitigates it, C10 is capped at
  41/43 = 0.953 and one LOW is permanent.
- **The census can be made exact, but "the parser silently contributes zero rows for a
  dispatch shape it cannot read" is a property of parsing source with regex**, not a bug to
  be closed. It can be bounded (an exact row count, per-worker presence) — it cannot be
  eliminated while the census is derived rather than declared.

**True maximum ≈ 92** with C4 fully closed, M1 and M2 fixed, and L2/L3 standing as the two
accepted LOWs. Reaching the low 90s is a real quarter of work on boundary validation, not a
polish pass. The honest present number is **83**.
