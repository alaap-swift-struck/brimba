# Security sentry (round 3) — Brimba · 2026-08-25

SCORE: 79/100   (round 1: 68 · round 2: 68)

**Security 79/100 (C) · sweep coverage 96.7% · 11 findings (0 critical, 0 high, 3 medium,
8 low) · the HIGH is CLOSED — I could not defeat it at runtime. It is not locked.**

## DELTA

| Criterion | R1 | R2 | R3 | Why it moved |
|---|---|---|---|---|
| C1 Authorization | 60/61 · 0.98361 | 60/61 · 0.98361 | **59/60 · 0.98333** | `POST /api/tenancy/config/screens` went with the screen-override subsystem: −1 numerator, −1 denominator. `realtime POST /publish` is still the one door with no caller check of any kind |
| C2 Authentication | 94/95 · 0.98947 | 94/95 · 0.98947 | **93/94 · 0.98936** | same removal, same arithmetic |
| C3 Query safety | 283/283 · 1.0000 | 288/288 · 1.0000 | **273/273 · 1.0000** | 15 fewer interpolations (screen-override code deleted). 36 read individually — including all of `sharding.ts`'s bare `${table}` / `${rule.column}`, which come from code-owned constant lists, and the retention sweep's `LIMIT ${SWEEP_BATCH}`. No injection |
| C4 Boundary validation | 62/87 · 0.71264 | 63/87 · 0.72414 | **63/85 · 0.74118** | **up only by deletion.** `postScreen`'s two body fields left the denominator. Not one input gained a runtime check this round; the 24 truthiness-only identifier sites are still 24 |
| C5 Secret hygiene | 12/12 · 1.0000 | 12/12 · 1.0000 | 12/12 · 1.0000 | re-swept the 6 new commits for secret-shaped literals — 0 hits |
| C6 Surface minimization | 7/7 · 1.0000 | 7/7 · 1.0000 | 7/7 · 1.0000 | re-verified all 12 `workers_dev`/`preview_urls` blocks |
| C7 Credentials at rest | 4/4 · 1.0000 | 4/4 · 1.0000 | 4/4 · 1.0000 | unchanged |
| C8 Fail-closed gates | 12/12 · 1.0000 | 12/12 · 1.0000 | 12/12 · 1.0000 | unchanged |
| C9 Resource bounds | 42/49 · 0.85714 | 44/49 · 0.89796 | **45/49 · 0.91837** | **+1** the retention sweep loop is bounded by `SWEEP_BATCH` under a hard iteration bound; `screens-config.ts`'s unlimited `SELECT` left with the subsystem (a miss leaving the denominator), and the new mention cap `MENTION_LIMIT = 50` replaces the 512 that was still above D1's parameter ceiling |
| C10 Output scoping | 41/43 · 0.95349 | 41/43 · 0.95349 | 41/43 · 0.95349 | unchanged — both `/media/*` routes still serve with no membership check |
| C11 Render safety | 3/3 · 1.0000 | 3/3 · 1.0000 | 3/3 · 1.0000 | unchanged |
| C12 Invariant locking | 18/24 · 0.75000 | 21/24 · 0.87500 | **21/25 · 0.84000 ▼** | **the only criterion that went DOWN, and it is a repair that caused it.** The H1 privilege fix created a NEW security invariant — "no door may assign a role stronger than the caller's" — and shipped it with no door-level test. Denominator 24 → 25, numerator unchanged. See M2 |
| C13 Dependency health | 1/1 · 1.0000 | 1/1 · 1.0000 | 1/1 · 1.0000 | `npm audit` → 0 vulnerabilities |

**One criterion went DOWN: C12, 0.875 → 0.840.** The repair that caused it is *this review's
own round-2 recommendation* — the `assertCanAssignRole` fix. It is correct code, and it is
unlocked. That is the honest answer to the round's second question, and it lands on me.

ControlScore 96.31 → **96.47**. Penalty 28 → **17**. Posture **68 → 79 (+11)**, entirely
because the HIGH closed.

---

## Scope and provenance

- Read at `HEAD = 256d21b`, working tree clean, branch `review-campaign`.
- Every sabotage ran in a copy of the repo at `…/scratchpad/a3-sandbox`, restored between
  runs. **I wrote nothing to this repository except this file.** No `--fix`, no `--write`.
- Baselines in that sandbox: `web` rules 29/29 · tenancy 119/119.
  (`web/test/fork.test.ts` fails in the sandbox only — it shells out to `git ls-files` and
  the copy is not a git repo. Not a repository failure.)

---

## The two things I was asked to verify

### 1 · Is the route census honest? **No. It is blind on two of the seven workers — including the one that holds the only ungated door in the base.**

`ROUTE-CENSUS.md` says **94 routes · 58 state-changing · 1 with no gate detected**. Counted
off the source, the real surface is **103 routes · 60 state-changing · 2 with no gate**.

`scripts/route-census.mjs` finds doors with exactly two patterns — a `ROUTES` table entry
(`"POST /x": { handler: fn`) and auth's `case "POST /x": return fn(`. Neither matches an
`if (pathname === "/x" && request.method === "POST")` chain, which is how **realtime and
gateway** dispatch. `census()` reads their `index.ts` successfully, matches nothing, and
adds zero rows — **silently**.

| worker | real doors | in the census | missing |
|---|---|---|---|
| auth | 13 | 13 | — |
| tenancy | 35 | 34 | `GET /api/tenancy/health` |
| content | 20 | 19 | `GET /api/content/health` |
| data-ops | 24 | 23 | `GET /api/data-ops/health` |
| mcp | 5 | 5 | — |
| **realtime** | **3** | **0** | `POST /publish`, `GET /api/realtime/health`, `GET /api/realtime` |
| **gateway** | **3** | **0** | `POST /api/log/client`, `GET /media/learning/*`, `GET /media/*` |
| **total** | **103** | **94** | **9** |

Counts from `grep -oE '"(GET|POST|PUT|PATCH|DELETE) [^"]+"' workers/<w>/src/index.ts | sort -u`
plus the `if (pathname === …)` doors in realtime and gateway, diffed against the census table.

**Proven, twice, by sabotage.** I planted an ungated state-changing door in each blind
worker and re-ran the check that is supposed to notice:

```
baseline                                      Tests  29 passed (29)
+ realtime  POST /danger   (echoes the body)  Tests  29 passed (29)   <-- invisible
+ gateway   POST /api/danger                  Tests  29 passed (29)   <-- invisible
```

Three things make this worse than an ordinary gap:

1. **The census's own comment names the doors it cannot see.** `scripts/route-census.mjs:5`
   and `web/test/rules.test.ts:850` both explain that the 12-August sweep missed "all of
   auth's POST doors, all of mcp's, **realtime's publish door and the gateway beacon**".
   Auth and mcp were fixed. The other two were written into the motivation and left out of
   the artefact.
2. **The one door it hides is the only truly ungated door in the base.** The file's headline
   reads "1 with no gate detected", and that one is the deliberate, well-argued login door.
   A reader — an owner, the next reviewer, me — closes the file believing the base has
   exactly one open door and it is a safe one. `realtime POST /publish` (M3) is the second,
   and it is not in the list.
3. **The tripwire is a floor set 34 below the truth.** `web/test/rules.test.ts:860` asserts
   `rows.length > 60` against a real 94. Auth's own census was given an *equality*
   assertion this round (`toBe(allCases.length)`, `gating-seam.test.ts:82`) precisely
   because a floor lets an unparsed door slip through — the census script did not get the
   same discipline. This is round 2's M4, reproduced one level up.

Round 2's report stated the rule that would have prevented this, in its own words: *"A
worker whose dispatch the parser cannot read is a FAILURE, not a skip — that single rule is
what makes a census a census rather than a longer floor."* It was not implemented.

**Is the one named exception legitimate? Yes.** I re-checked all four claims of
`OPEN_BY_DESIGN["POST /api/auth/email/start"]` against the code and all four still hold: no
session is possible (it *is* the login door); `isValidEmail` runs at the boundary; the
response is `json({ ok: true })` for a known and an unknown address alike, so no user
enumeration; and `mintLoginCode` bounds it with a 60-second per-address cooldown and, past
`MAX_CODES_PER_HOUR = 5`, rotates the live row in place rather than growing the table
(`workers/auth/src/lib/login-codes.ts:38-83`). A well-argued exemption, not a route quietly
listed to dodge a rule.

### 2 · Can the privilege escalation be defeated again? **No. I attacked it fourteen ways and it held every time.**

`assertCanAssignRole` (`workers/tenancy/src/lib/roles.ts:197-231`) is called before the
write in **both** doors that assign a role: `createInvite` (`lib/invites.ts:186`, before the
`invite_index` INSERT) and `changeMemberRole` (`lib/members.ts:289`, before the UPDATE).

Everything I tried, and why each failed:

| attack | why it fails |
|---|---|
| Round 2's **Path A** — invite `you+2@` straight into Admin | `assertCanAssignRole` reads Admin's sheet, finds rights the caller lacks, 403 `privilege_amplification` |
| Round 2's **Path B** — promote an accomplice to Admin | same helper, same refusal, before the UPDATE |
| Invite into your OWN role (the early return at `:202`) | allowed, and correctly: a role cannot exceed itself. Gives a second identity with *equal* rights — lateral, never upward |
| Empty caller sheet | `mineBy.get(m)?.[can_x] !== 1` treats absent as not-held → refuses everything. Fail-closed |
| Empty target sheet | nothing to compare, assignment allowed — and a role with no `role_permissions` rows can pass no `hasRight`, so it grants nothing |
| A module row outside `TEAM_MODULE_CATALOG` (e.g. a stale `screens` row on an existing team) | `assertCanAssignRole` iterates the TARGET's DB rows, not the catalogue, so a stale row is *checked*, not skipped. Strictly more conservative than `setRolePermissions` |
| **Create-then-raise** — create role Y (all zeros), assign it, then grant Y everything | step 3 is `setRolePermissions`, which has held the amplification check since round 1 |
| `postCreateRole` with a matrix | `routes/roles.ts:132` demands `member_roles:edit` as well and routes the matrix through `setRolePermissions` |
| `updateRole` | title/description only; refuses the locked Admin; cannot touch `is_default` or any right |
| `setRoleActive` | deactivate/reactivate only; refuses the locked Admin |
| The **CSV/import** door | the only role-shaped target is `member_roles` (`data-ops/src/lib/targets.ts:114`) and its `buildBody` posts to `/api/tenancy/roles` — the guarded door. There is **no** `team_members` import target, so no import path assigns a person a role |
| Every other write of `team_members.role_id` | three sites, all safe: `teams.ts:140` (your own new team, seeded Admin), `:247` `acceptPendingInvites` and `:369` `acceptInvite` — both bind `invite.role_id`, which passed the check when the invite was created |
| `switchActiveTeam` | `switchTeam` validates membership and returns 403 `not_member` otherwise |
| The **agent and MCP** surfaces | `forwardToDoor` (`shared/workers/http.ts:41-77`) carries the caller's own Cookie, so both re-enter through these same two guarded doors |

**The fix is sound and complete. It is also unlocked — see M2.**

---

## Arithmetic

```
CONTROL COVERAGE                        passing/applicable   ratio   weight  W×ratio
C1  Authorization ......................... 59/60            0.98333    15   14.7500
C3  Query safety ........................ 273/273            1.00000    12   12.0000
C5  Secret hygiene ........................ 12/12            1.00000    12   12.0000
C2  Authentication ........................ 93/94            0.98936    10    9.8936
C7  Credentials at rest ..................... 4/4            1.00000    10   10.0000
C4  Boundary validation ................... 63/85            0.74118     8    5.9294
C10 Output scoping ........................ 41/43            0.95349     8    7.6279
C6  Surface minimization .................... 7/7            1.00000     6    6.0000
C8  Fail-closed gates ..................... 12/12            1.00000     6    6.0000
C9  Resource bounds ....................... 45/49            0.91837     5    4.5918
C11 Render safety ........................... 3/3            1.00000     4    4.0000
C12 Invariant locking ..................... 21/25            0.84000     2    1.6800
C13 Dependency health ....................... 1/1            1.00000     2    2.0000
                                                          Σ W = 100   Σ W×r = 96.4727

ControlScore = 100 × 96.4727 ÷ 100 = 96.47
FINDINGS PENALTY  0×25 + 0×10 + 3×3 + 8×1 = 0 + 0 + 9 + 8 = 17
POSTURE           96.47 − 17 = 79.47 → 79/100
GRADE             C (79). No unresolved CRITICAL or HIGH, so no cap applies.
SWEEP COVERAGE    100 × (12/12 classes) × (116/120 sites) = 96.7%
```

### The denominators, recomputable by hand

**C1 — 60 non-GET routes** (was 61; `POST /api/tenancy/config/screens` was deleted with the
screen-override subsystem):

| worker | non-GET | gated | how |
|---|---|---|---|
| tenancy | 19 | 19 | 16 × `requireRight`/`gated*`; 3 identity-gated (reviewed) |
| content | 13 | 13 | all `gatedBody(module, right)` |
| data-ops | 13 | 13 | `requireRight` / `requireAnyImportRight` / `adminGuard` |
| auth | 10 | 10 | 3 × `INTERNAL_KEY`, 1 × `TEST_LOGIN_KEY`, 4 × session, 2 login doors public by necessity |
| mcp | 3 | 3 | `verifyToken` (bearer) or `requireUser` (session) |
| gateway | 1 | 1 | `/api/log/client` verifies the session with auth before recording |
| realtime | 1 | **0** | `POST /publish` — **no caller verification of any kind** (M3) |
| **total** | **60** | **59** | |

**C3 — 273/273.** `scratchpad/a3-scan.mjs`: every template literal in `workers/*/src` +
`shared/` containing a SQL keyword, comments removed by a left-to-right scanner (not a
regex — the exact bug this repo fixed). 273 `${…}` interpolations; 237 safe by shape
(`sqlString(` / `intOr(` / `Number(` / `versionPredicate(` / a SCREAMING_CASE constant / a
generated placeholder run); **36 read individually, all safe.** The ones worth naming:
`sharding.ts`'s `${table}`, `${rule.table}` and `${rule.column}` come from code-owned
constant arrays reached only through `adminGuard` or the cron, and `${offset}` is a loop
counter; `teams.ts`'s `${guardClause}` is an assembled SQL fragment, not a value.

**C4 — 63/85.** 60 declared body fields + 25 `searchParams.get` reads.
`grep -rn 'if (!body\.' workers/*/src` returns **24** identifier fields still checked by
truthiness alone — the same 24 as round 2 (`config.ts`'s left with the subsystem; my own
grep is one site broader than round 2's, so treat this as 24 ± 1). Nothing gained a runtime
check this round.

**C9 — 45/49.** Round 2's five misses re-checked: `stakeholders.ts:65-78` still unbounded in
aggregate ✗ · `screens-config.ts:21` GONE (deleted, not fixed — a miss leaving the
denominator) · `acceptPendingInvites` (`teams.ts:233`) still no `LIMIT` ✗ · `admin.ts:31`
`?limit=-1` ✗ · `HEAVY_LIMITER` still never applied to `/mcp` ✗. New bounded path: the
retention sweep (`sharding.ts:395`, `LIMIT ${SWEEP_BATCH}` inside a hard iteration bound).

**C12 — 21/25.** Round 2's 24 invariants plus one new one created by the H1 repair. Locked:
21. Unlocked: (a) realtime and gateway still have no gating-seam suite, (b) `workers_dev:false`
is asserted by no test, (c) the conditional-gate hole (L7), (d) **new — no door-level test
asserts either assignment door calls `assertCanAssignRole`** (M2).

**Sweep coverage.** 12/12 threat classes. 103 API routes + 13 secret/config surfaces + 4 R2
buckets = 120 sites; 116 read. The 4 unread are the R2 bucket ACLs — live cloud state no
commit can prove, unchanged and unchangeable from a read-only clone.

---

## Findings

### MEDIUM

#### M1 — The route census is blind on two workers, and the door it hides is the only ungated one in the base

**Plain English.** The file that tells the next reviewer "here is every door this app has"
is missing nine of them, including the single door in the whole system that lets anyone
through without checking who they are. The file's headline says there is exactly one open
door and that it is a safe one. There are two.

**Where.** `scripts/route-census.mjs:95-101` (the two `matchAll` patterns) ·
`ROUTE-CENSUS.md:11` (the "1 with no gate detected" headline) ·
`web/test/rules.test.ts:860` (the `> 60` floor against a real 94).

**The risk (technical).** Both patterns require a `ROUTES`-table entry or a `case "…":`
label. `workers/realtime/src/index.ts:142` and `workers/gateway/src/index.ts:219, 275, 283`
dispatch with `if (pathname === …)`. `census()` reads their `index.ts`, matches nothing, and
returns without a row — no warning, no failure. Full table above; proven by two sabotages.

**Severity because.** Impact = the artefact the campaign was told to inherit understates the
attack surface by 9 doors and mis-states the count of ungated ones. Reachability = read by
every future reviewer and by the build itself, on every run. No new hole is opened today —
which is why this is MEDIUM and not HIGH — but it is the mechanism that produced the
"45/45 gated" error the census exists to prevent, re-implemented.

**Fix.** Three changes, all in `scripts/route-census.mjs` and its test:
1. Add a third dispatch parser for the `if (pathname === "…" && request.method === "…")`
   shape, and one for the inline `GET /health` returns.
2. **Make an unparseable worker a FAILURE, not a skip** — after the parse, assert every
   directory under `workers/` produced at least one row, naming the worker that did not.
   This one rule is the difference between a census and a longer floor.
3. Replace `toBeGreaterThan(60)` with `toBe(103)` — auth's own suite was given exactly this
   equality this round (`workers/auth/test/gating-seam.test.ts:82`); the census script did
   not get it.
Then ship the sabotage that proves it fails, per `shared/test/source.ts`'s own header rule.

#### M2 — The privilege-escalation fix is correct and completely unlocked: deleting it from both doors leaves 119 of 119 tenancy tests green

**Plain English.** The repair that closed this campaign's only serious hole has no test that
notices if someone deletes it. A tidy-up six months from now removes two lines and the build
stays green.

**Where.** `workers/tenancy/src/lib/invites.ts:186` · `workers/tenancy/src/lib/members.ts:289`
· `workers/tenancy/test/roles.test.ts:134-170` (three tests, all of the helper in isolation).

**The risk (technical).** `roles.test.ts` proves `assertCanAssignRole` refuses a stronger
role, allows a weaker one, and never blocks the caller's own. Nothing asserts either **door**
calls it. Proven:

```
tenancy baseline                                          Tests  119 passed (15 files)
delete `await assertCanAssignRole(...)` from createInvite
  AND from changeMemberRole                               Tests  119 passed (15 files)
```

Both escalation paths from round 2's H1 are fully live in that tree and the suite is
indistinguishable from the fixed one. Note the R10 gating seam cannot catch this: both doors
still open with `gatedBody("team_members", …)`, so they are *gated* — the missing check is a
rule inside the handler, not the gate on it.

**Severity because.** No hole today — the calls are present and I could not defeat them. But
this is the security counterpart of the base's own stated lesson (*a green check is not a
working law*), applied to the single highest-impact security control in the repo, and it is
what dropped C12. MEDIUM.

**Fix.** Two tests beside the existing three, at the door level: mock the D1 sheets so the
caller is weaker than the target role, call `createInvite` and `changeMemberRole`, and assert
each rejects with `privilege_amplification` **and that no write was issued**
(`expect(d1ExecScript).not.toHaveBeenCalled()`, the shape `roles.test.ts` already uses).
Then delete each call in a sandbox and prove both go red.

#### M3 — `realtime POST /publish` still has no caller check, and two workers' doors still sit outside every gating law

*(Round 1's and round 2's M3, entirely unchanged — and now compounded by M1.)*

**Where.** `workers/realtime/src/index.ts:142-165` · `workers/realtime/wrangler.jsonc` (no
`INTERNAL_KEY` binding) · no `gating-seam` suite in `workers/realtime/test/` or
`workers/gateway/test/` · absent from `ROUTE-CENSUS.md`.

**The risk (technical).** `/publish` reads `{channel, event}` from the body and fans it to
`env.CHANNELS.getByName(shardChannel(channel, i)).broadcast(body)` — the caller names the
channel. Its three sibling internal doors in auth all open with
`if (!env.INTERNAL_KEY || header !== env.INTERNAL_KEY)`; this one opens with nothing.

**I still could not reach it.** `workers_dev:false` + `preview_urls:false` (verified in all
12 blocks) leave realtime with no public address, and the gateway forwards only
`pathname.startsWith("/api/realtime")` — `/publish` does not match, and `new URL()`
normalises `/api/realtime/../publish` to `/publish` *before* the prefix test. Blast radius if
reached stays small: the payload carries no row data (re-verified at the one seam,
`shared/workers/realtime.ts:125` — `{ resource, id, op }`), so the damage is forced-refetch
storms, not disclosure.

**Severity because.** Unreachable today, so not HIGH. MEDIUM because it is one config change
from mattering, it contradicts three identical doors that *are* keyed, and no automated check
would notice either the door or the flip — `workers_dev:false` is asserted nowhere in 460+
tests, and now the census cannot see the door either.

**Fix.** Unchanged: the four-line `INTERNAL_KEY` guard, the binding, and a config test
asserting `workers_dev === false && preview_urls === false` for every worker but the gateway.
The real cost stays real: `INTERNAL_KEY` then has to match across six workers, and SECRETS.md
plus BOOTSTRAP.md must move in the same commit.

---

### LOW

#### L1 — Mentions are properly bounded now; the *aggregate* path is not *(mostly fixed)*
`MENTION_LIMIT = 50` (`shared/workers/bulk.ts:68`) caps one reply's mentions below D1's
100-bound-parameter ceiling — round 2's 512 is gone and the "reply saved, nobody told" bug
with it. But `stakeholders.ts:65-78` builds `IN (?, …)` from the *thread's* accumulated
participants, and `LIMIT ${THREAD_HARD_CAP}` bounds the rows returned, not the parameters
bound. A thread whose unique participants exceed 99 still throws inside the try/catch.
*Reasoned from the code and D1's documented limit; not executed against a live D1.*
**Fix.** Chunk the `IN` list at 90 in `stakeholders.ts` as well.

#### L2 — 24 identifier fields are still checked for presence, never for type
**Where.** `help.ts` ×5 · `learning.ts` ×3 · `agent.ts` ×2 · `import.ts` ×6 ·
`selectable.ts` ×2 · `team.ts` · `roles.ts` ×3 · `tenancy/routes/admin.ts`. All still
`if (!body.id)`. `{"id":{"x":1}}` reaches `d1Query(…, [body.id])`, D1 refuses the parameter,
and the central catch returns **500** where the base's own law says 400. This is exactly the
class `shared/workers/validate.ts` exists to kill, and `validate.test.ts` locks it for text
fields only. **Fix.** `const id = requireText(body.id, "Id", 64)` at each site — 24 one-line
substitutions, net zero lines.

#### L3 — Uploaded files are still served to anyone with the URL, forever, with no membership check
**Where.** `workers/gateway/src/index.ts:275-285`. A learning attachment key is
`<teamId>/<ulid>` (not enumerable), but a profile photo is `users/<userId>` and a team logo
is `teams/<teamId>` — directly the id, handed to every teammate in ordinary API responses. A
removed member keeps working URLs; there is no revocation. `decodeKey()` closed the
malformed-URL crash, not the authorisation.
**Fix.** Re-check membership before `serveObject`, or short-lived signed URLs — or accept it
explicitly in ARCHITECTURE.md as a capability-URL decision. An accepted risk is fine; an
unnoticed one is not. (See the impact map: the accept is the cheap honest option.)

#### L4 — The MCP surface still gets the loose rate ceiling, and everyone behind one IP still shares a bucket
**Where.** `shared/workers/rate-limit.ts:53-56` (`HEAVY_PATHS`) and `:66-77` (`callerKey`).
`isHeavyPath("/mcp")` is false, so `HEAVY_LIMITER` (60/min) never applies: the same caller
doing `agent_chat` through the web app is capped at 60/min and through MCP gets 600/min.
`callerKey` still looks only for a `brimba_session` cookie, so every bearer-token caller keys
to `ip:<CF-Connecting-IP>`. **Fix.** A `Bearer` branch in `callerKey`; charge `HEAVY_LIMITER`
in `forwardTool` when the tool is AI-costed or an export.

#### L5 — `?limit=-1` still turns the owner error dashboard into an unbounded read
**Where.** `workers/data-ops/src/routes/admin.ts:31`. `Math.min(Number("-1") || 100, 200)`
→ `-1`; SQLite reads `LIMIT -1` as no limit. `adminGuard`-only, and the error table is now
the busiest table in the base after this round's logging repairs — so the read it returns
got bigger, not smaller. **Fix.** `Math.min(Math.max(Math.trunc(Number(...)) || 100, 1), 200)`.

#### L6 — Every signed-out caller still shares one retry-key identity
**Where.** `shared/workers/concurrency.ts:49-53`. `ownerOf` digests the Cookie header alone,
so every caller without one hashes to the same owner. Still unreachable (every
idempotency-wrapped route is a gated mutation). Reported 2026-08-12 and in both prior rounds
with a one-line fix; the line still has not been written.
**Fix.** `SHA-256(cookie || "ip:" + request.headers.get("CF-Connecting-IP"))`.

#### L7 — The R10 predicate still treats a CONDITIONAL gate as a gate *(was L9)*
**Where.** `shared/test/gating-seam.ts:107-110` — `GATE_RE.test(code)` asks whether a gate
token appears *anywhere* in the handler body, while the assertion's own message says the
route must **open with** one. Re-proven: deleting `postCreateRole`'s unconditional
`requireRight(cfg, guard, "member_roles", "create")` and leaving only the
`if (withMatrix) await requireRight(…, "edit")` keeps tenancy green.
**Reach today: one route** — `POST /api/tenancy/roles` is still the only non-GET route with
more than one gate call, and it still carries its unconditional one.
**Fix.** Require the first gate call to precede the first `if`/`for`/`try` in the body, or the
route to be listed with a reason.

#### L8 — One permission switch still enforces nothing, and it is enforced only by the browser *(was M2, largely fixed — downgraded)*
**Where.** `shared/team-modules.ts:57-66` (`MODULE_RIGHTS_BY_MODULE`) ·
`workers/tenancy/src/routes/team.ts` (`getTeamMetaFeed` opens with `teamContext` alone) ·
`web/lib/screens.ts` (`gate: { module: "teams", right: "read" }`, client-side only).
The narrowing genuinely worked: the grid renders **23** cells (2+4+4+4+3+4+2), down from 32,
and **22** are named by a real server gate. The residue is `teams:read` — kept deliberately,
because it does gate a screen recipe, but a member with it off can still
`GET /api/tenancy/team-meta` and read the team name, creation date, creator name **and
creator email**. Round 2's "9 of 32 decorative" is now "1 of 23".
**Severity because.** Bounded — metadata to an existing member of that team, never
cross-tenant — and it is one switch, not a pattern. LOW, down from MEDIUM.
**Fix.** `getTeamMetaFeed` → `gated(request, env, "teams", "read")`, plus the migration note
(an existing custom role with the switch off loses the team header). Or state in
`MODULE_RIGHTS_BY_MODULE` that this one right is a screen gate by design, which the comment
block there is already the right home for.

**Closed this round, verified:** round 2's **H1** (both assignment doors now guarded —
fourteen attacks, all refused) · **M4** (auth's census now makes `await` optional *and*
pins `routes.length` to `allCases.length` as an equality) · **L7** (`expectedVersion` now
appears 7× in `shared/workers/tool-catalog.ts`, exposed and forwarded by all four edit tools)
· **L1's harmful half** (`MENTION_LIMIT = 50`). Round 2's **L8** (SECRETS.md overstating the
vault) is not re-filed: the vault itself is a deliberate owner deferral, and the false-claim
half is now machine-checked by `vault-claims-match-reality`.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **M1a** third dispatch parser (`if (pathname === …)`) + inline-health parser in the census | `scripts/route-census.mjs` (~20 lines), `ROUTE-CENSUS.md` regenerated (+9 rows) | ADDS ~20 lines; ADDS 9 rows | **lean_mean** — +20 lines in a script that is already 150. Small, and it is the fourth instance of the duplication `shared/test/source.ts` exists to end, so consider parsing dispatch ONCE in `shared/test/source.ts` and having both the census and the R10 suites read it — that version REMOVES lines. **story_checks_out** — `ROUTE-CENSUS.md`'s headline changes from "1 with no gate" to "2", and the second one is `POST /publish`; RULES.md's R10 paragraph and BASE-MANUAL's route table both then reference a number that moved. |
| **M1b** unparseable worker ⇒ FAILURE, not skip | `web/test/rules.test.ts` (~6 lines) | ADDS ~6 lines | **none — it strengthens an existing check without touching product code.** Its only cost is that it goes red the day someone adds a worker, which is the point. |
| **M1c** `toBe(103)` instead of `> 60` | `web/test/rules.test.ts` (1 line) | net zero | **base_fork_review** — *real, small*: a fork that removes a module now fails the build until it updates the number. That is the intended friction, but `scripts/fork.mjs` must regenerate the census, or R26's "leaves `npm run check` green" promise breaks. Check that one line before shipping this. |
| **M2** two door-level tests for `assertCanAssignRole` | `workers/tenancy/test/roles.test.ts` (~40 lines) | ADDS ~40 lines of test | **lean_mean** — pure test growth, ~40 lines, and `lean_mean` scores test bulk. It is the cheapest possible lock on the highest-impact control in the repo; take the points. **architecture_review** — *positive*, it pins a cross-file invariant (lib helper ↔ two callers) that nothing else expresses. |
| **M3a** `INTERNAL_KEY` guard on `realtime POST /publish` | `workers/realtime/src/index.ts`, `wrangler.jsonc`, `shared/workers/realtime.ts` | ADDS ~6 lines + a binding + a secret on one more worker | **mac_fell_in_the_ocean_review** — *real cost*: `INTERNAL_KEY` must now match across **six** workers; SECRETS.md's table and BOOTSTRAP.md's "set it in one sitting" step go stale in the same commit and must move with it. **realtime_review** — a missed secret on deploy silently kills every live update, so deploy order matters more than it did. This is why M3 is MEDIUM-with-a-reason and not "just add the guard". |
| **M3b** `workers_dev:false` config test | new `web/test/config-vars.test.ts` (~25 lines) | ADDS ~25 lines of test | **lean_mean** — pure test growth. Fold it into the census test rather than a new file and it is ~8 lines. **none else.** |
| **L1** chunk `stakeholders.ts`'s `IN` list at 90 | `workers/content/src/lib/stakeholders.ts` (~8 lines) | ADDS ~8 lines | **scaling_review** — *positive*: removes a hard failure on a busy thread. **speed_review** — a >90-participant thread becomes 2 queries instead of 1; irrelevant at real team sizes. |
| **L2** `requireText(body.id, "Id", 64)` at 24 sites | 8 route files | REMOVES 24 truthiness checks, ADDS 24 validated ones — net zero lines | **lean_mean** — neutral, a substitution. **error_log_review** — *positive*: removes a class of 500 that writes an `error_logs` row per hostile request, the same amplification shape `decodeKey()` just closed. |
| **L3** membership check before `serveObject` | `workers/gateway/src/index.ts` (~10 lines) | ADDS one `whoAmI` + `isActiveMember` hop per media request | **speed_review** — this is the real cost: a service hop on every image and video load; a cold page with 20 attachments is 20 extra auth calls. **spend_review** — +1 subrequest per media miss. **scaling_review** — puts auth on the media path, which SCALING.md assumes is cache-only. **If speed_review is near its floor, take the documented-capability-URL option instead** — the honest cheap answer, and it costs C10 nothing once written down. |
| **L4** `Bearer` branch in `callerKey`; charge `HEAVY_LIMITER` for AI/export tools | `shared/workers/rate-limit.ts`, `workers/mcp/src/lib/tools.ts` (~6 lines) | ADDS ~6 lines | **interfacelessness_review** — *direct tension*: it makes MCP **less** capable per minute than today. Frame it as parity (the web path already has this ceiling), not as a new restriction. **spend_review** — *positive*, it is the ceiling that protects the AI bill. |
| **L5** clamp the error-dashboard limit | `workers/data-ops/src/routes/admin.ts` (1 line) | net zero | none — a one-line clamp on an owner-only read. |
| **L6** include the IP in `ownerOf`'s digest when there is no cookie | `shared/workers/concurrency.ts` (1 line) | ADDS 1 line | none — no behaviour change for signed-in callers, which is every caller that reaches it. |
| **L7** require the first gate to precede the first branch | `shared/test/gating-seam.ts` (~5 lines) | ADDS ~5 lines | **none — it strengthens an existing check without touching product code.** It may go red on a route nobody knew was conditionally gated, which is the point. |
| **L8** `getTeamMetaFeed` → `gated(…, "teams", "read")` | `workers/tenancy/src/routes/team.ts` (1 argument) | net zero | **first_run_review / dead_end_review** — a fresh team's Viewer has `teams:read = 1` by default (`team-schema.ts:411`), so day one is fine; an *existing* custom role with the switch off loses the team header. Needs a migration note. **realtime_review** — `publishChange(…, "teams", …)` then reaches listeners who may not be allowed to refetch; the client's 403 handling must not toast. |

---

## CEILING

**Is 95 reachable by changing code? Yes, and comfortably — the control score is already
96.47 and 100 is reachable.** Closing everything above gives:

- Penalty 17 → 0.
- C1 59/60 → 60/60 (+0.25) · C2 93/94 → 94/94 (+0.11) · C4 63/85 → 85/85 (+2.07) ·
  C9 45/49 → 49/49 (+0.41) · C10 41/43 → 43/43 (+0.37) · C12 21/25 → 25/25 (+0.32).
- ControlScore 96.47 → **100.00**. Posture → **100**, grade A.

Three caveats on what that number would mean:

1. **Sweep coverage caps at 96.7% from this machine.** The four R2 bucket ACLs are live cloud
   state; no commit can prove them. One `wrangler r2 bucket info` per bucket, run by the
   owner, closes it. Any report produced from a read-only clone should print 96.7%.
2. **L3 is capped by a locked decision, not by code.** ARCHITECTURE.md's static-export +
   one-public-door model makes cheap authenticated media genuinely awkward. Closing it by
   documented decision is legitimate and I would accept it — but then C10 stays at 41/43 with
   a stated exemption and the true maximum is **99.6**, not 100.
3. **The census is the ceiling on the ceiling, and it moved the wrong way.** Round 2 said the
   single highest-value security change available was a committed denominator that the build
   re-derives. It was built — and it inherited the same blindness it was designed to end,
   in the two workers its own comment names. Until M1a–c land, every number in this report,
   **including this one**, is still a claim about the reviewer's diligence first and the code
   second. The difference this round is that the claim is now falsifiable in one command,
   which is real progress.

**Ship recommendation: yes, with the three MEDIUMs on the list.** No CRITICAL, no HIGH. The
escalation that blocked round 2 is genuinely closed — I attacked it fourteen ways and it
refused every one. Take M2 first: it is 40 lines of test and it is the only thing standing
between "closed" and "closed and it stays closed".
