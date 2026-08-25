# Security sentry (round 2) — Brimba · 2026-08-25

SCORE: 68/100   (round 1: 68/100)

**Security 68/100 (D — and capped at C anyway by the still-open HIGH) · sweep coverage
96.7% · 13 findings (0 critical, 1 high, 3 medium, 9 low) · the HIGH is not closed.**

## DELTA

Round 1: 68/100 → Round 2: 68/100

| Criterion | R1 | R2 | Why it moved |
|---|---|---|---|
| C1 Authorization | 60/61 · 0.9836 | 60/61 · 0.9836 | unchanged — `realtime POST /publish` still has no caller check of any kind |
| C2 Authentication | 94/95 · 0.9895 | 94/95 · 0.9895 | unchanged — same route |
| C3 Query safety | 283/283 · 1.0000 | 288/288 · 1.0000 | +5 interpolations from the new code (`tagged`, `isAgent?1:0`, `doneAt`, import's `extra`, sharding's keyset `after`). All five read; all five safe |
| C4 Boundary validation | 62/87 · 0.7126 | 63/87 · 0.7241 | **+1** — `taggedUserIds` now goes through `optionalIdList`. The 24 identifier fields checked by truthiness alone are untouched |
| C5 Secret hygiene | 12/12 · 1.0000 | 12/12 · 1.0000 | unchanged; re-swept the 7 new commits for secret-shaped literals — 0 hits |
| C6 Surface minimization | 7/7 · 1.0000 | 7/7 · 1.0000 | unchanged; re-verified all 12 `workers_dev`/`preview_urls` blocks |
| C7 Credentials at rest | 4/4 · 1.0000 | 4/4 · 1.0000 | unchanged |
| C8 Fail-closed gates | 12/12 · 1.0000 | 12/12 · 1.0000 | unchanged |
| C9 Resource bounds | 42/49 · 0.8571 | 44/49 · 0.8980 | **+2** — the `taggedUserIds` loop and `notify.ts`'s `IN(?…)` now carry an explicit cap |
| C10 Output scoping | 41/43 · 0.9535 | 41/43 · 0.9535 | unchanged — both `/media/*` routes still serve with no membership check |
| C11 Render safety | 3/3 · 1.0000 | 3/3 · 1.0000 | unchanged |
| C12 Invariant locking | 18/24 · 0.7500 | 21/24 · 0.8750 | **+3** — the data-ops gating seam is no longer blind (sabotage-proven), auth has an R10 suite (sabotage-proven), and the self-grant/amplification rule has a test |
| C13 Dependency health | 1/1 · 1.0000 | 1/1 · 1.0000 | `npm audit` → 0 vulnerabilities |

**No criterion went DOWN.** Nobody else's repair cost this review a point. Five went up,
eight held. ControlScore 95.76 → **96.31**.

**So why is the total still 68?** Because the penalty went 27 → 28. One MEDIUM closed
(M1, the blind slicer — genuinely, provably closed) and two new findings opened: a MEDIUM
in the brand-new auth R10 census, and a LOW in the R10 predicate. And the HIGH did not
close. It moved: the door that was fixed is genuinely fixed, and the escalation now walks
through the two doors next to it, which were never in the fix.

That is the honest shape of this round. **The controls improved; the exposure did not.**

---

## Scope and provenance

- Read at `HEAD = 3d8a16d` **plus the uncommitted working tree**, frozen 2026-08-25 14:02 IST.
- **The tree moved twice while I read it.** `3d8a16d` landed mid-review, and five files were
  modified in the working tree during it (`shared/test/gating-seam.ts`,
  `workers/mcp/test/gating-seam.test.ts`, `web/test/rules.test.ts`,
  `workers/data-ops/test/error-seam.test.ts`, `workers/gateway/src/index.ts`). Every probe
  below was **re-run against the final state** after re-syncing, not against the state I
  first read.
- Every sabotage was run in a copy of the repo under
  `…/scratchpad/sec-sandbox`, never in the repository. I wrote nothing to the repo except
  this file.
- Full suite in that sandbox: 460 worker tests green (auth 35, tenancy 115, content 89,
  data-ops 141, mcp 21, realtime 18, gateway 41).

---

## The four things I was asked to verify

### 1. Does the privilege-amplification fix close the escalation? **The fix is sound. The escalation is not closed.**

The new block in `workers/tenancy/src/lib/roles.ts:209-257` is correct, and I could not
defeat it directly. I tried:

- **Fail-open on a missing sheet?** No. `mineBy.get(key)?.[can_x] !== 1` treats absent as
  not-held, so a caller whose own sheet is empty may grant nothing. Fail-closed.
- **Modules outside the catalogue?** No. The check loop and the write loop both iterate
  `TEAM_MODULE_CATALOG`, so a key outside it is ignored by both. Consistent.
- **The auto-flip-read rule as a lever?** No — it flips *read on* for the target, which is
  then also checked against the caller's sheet. Conservative in the safe direction.
- **Laddering role→role?** No. Y ≤ A always, so no chain reaches above the attacker.
- **The CSV/import door?** No — `member_roles` is an import target
  (`workers/data-ops/src/lib/targets.ts:112`), but its `buildBody` posts to
  `/api/tenancy/roles`, which calls `setRolePermissions`. The guard applies there too. That
  is the right design and it holds.
- **`createRole(withMatrix)`?** Covered — `workers/tenancy/src/routes/roles.ts:127` requires
  `member_roles:edit` *and* routes the matrix through `setRolePermissions`.

**But the escalation never needed that door.** Round 1's fix note said the rule must also be
extended to `createInvite`. It was not, and the same gap exists in `changeMemberRole`. Full
detail in H1 below. Two paths, both shorter than the one that was closed.

### 2. Does `postScreen` gate on `screens:edit`? **Yes — and it is sabotage-proven.**

`workers/tenancy/src/routes/config.ts:25-27` now reads
`gatedBody(request, env, "screens", "edit")`. Stripping that gate turns the tenancy R10
suite red. The unenforced half of the 8×4 matrix went 10 → 9 pairs. The worst part of round
1's M2 — a 64 KB screen recipe for every member riding on the rename-the-team switch — is
genuinely closed. The rest of M2 is not; see M2 below.

### 3. Does auth's R10 suite cover all ten state-changing doors, and is its one open door legitimate? **Ten of ten, yes. The open door is legitimate. The census that finds the ten is brittle.**

Auth's switch holds 13 cases; exactly 10 are non-GET, and the suite runs 11 tests — the
tripwire plus one per door. Both sabotages caught it and named the route:

```
auth baseline:                     Tests  11 passed (11)
delete the 401 from POST /profile: Tests  1 failed | 10 passed (11)   × POST /api/auth/profile
delete INTERNAL_KEY from /internal/mcp-session:  × POST /internal/mcp-session
```

The `session` gate deliberately requires **both** the `getSessionUser` lookup and the 401 —
so a handler that looks the user up and ignores the answer fails. That is the right
assertion and it is rare to see it written down.

**`POST /api/auth/email/start` as `OPEN_BY_DESIGN` — I checked all four of its claims
against the code, and all four hold.** No session is possible (it is the login door);
`isValidEmail` runs at the boundary (`index.ts:176`); the code is never in the response
(`json({ ok: true })`, and the same for a known and an unknown address, so no user
enumeration); and `mintLoginCode` really does bound it — a 60-second per-address cooldown
returning 429, and past `MAX_CODES_PER_HOUR = 5` it **rotates the live row in place** rather
than growing the table (`workers/auth/src/lib/login-codes.ts:38-83`). It is a well-argued
exemption, not a route quietly listed to dodge a rule.

One thing the reason does not say, worth writing down rather than filing: an
unauthenticated caller can still make Brimba send mail to any address they name, once per
minute per address, with no cap on *distinct* addresses — bounded only by the gateway's
600/min per-IP ceiling. That is the normal bargain for an OTP front door and I am not
filing it, but it belongs in the reason.

**The gap is the census, not the gate** — see M4.

### 4. Does the gating-seam slicer fix mean a removed gate now fails? **Yes, and far more broadly than round 1 asked.**

Round 1's exact sabotage:

```
delete `await requireRight(cfg, guard, target.module, "create")` from postImportConfirm
  R1: gating-seam stayed GREEN
  R2: × every non-GET route opens with a permission gate   (1 failed | 2 passed)
```

I did not stop there. I stripped **every** gate call from **every** non-GET handler in
tenancy, content and data-ops, one route at a time, re-running the worker's R10 suite after
each (`scratchpad/sec-gatesweep.mjs`):

```
CAUGHT 46 / 46   BLIND 0
```

Round 1: 1 proven blind door. Round 2: none. The mcp suite passes the same test (removing
`requireUser` from `postRevoke`, the last handler in the file, and removing `verifyToken`
from `handleMcp` both go red). **M1 is closed, and closed across the whole surface, not just
the one route that exposed it.** This is the strongest single result of the round.

---

## Arithmetic

```
CONTROL COVERAGE                        passing/applicable   ratio   weight  W×ratio
C1  Authorization ......................... 60/61            0.98361    15   14.7541
C3  Query safety ........................ 288/288            1.00000    12   12.0000
C5  Secret hygiene ........................ 12/12            1.00000    12   12.0000
C2  Authentication ........................ 94/95            0.98947    10    9.8947
C7  Credentials at rest ..................... 4/4            1.00000    10   10.0000
C4  Boundary validation ................... 63/87            0.72414     8    5.7931
C10 Output scoping ........................ 41/43            0.95349     8    7.6279
C6  Surface minimization .................... 7/7            1.00000     6    6.0000
C8  Fail-closed gates ..................... 12/12            1.00000     6    6.0000
C9  Resource bounds ....................... 44/49            0.89796     5    4.4898
C11 Render safety ........................... 3/3            1.00000     4    4.0000
C12 Invariant locking ..................... 21/24            0.87500     2    1.7500
C13 Dependency health ....................... 1/1            1.00000     2    2.0000
                                                          Σ W = 100   Σ W×r = 96.3096

ControlScore = 100 × 96.3096 ÷ 100 = 96.31
FINDINGS PENALTY  0×25 + 1×10 + 3×3 + 9×1 = 10 + 9 + 9 = 28
POSTURE           96.31 − 28 = 68.31 → 68/100
GRADE             D (68) — and an unresolved HIGH caps any result at C regardless
SWEEP COVERAGE    100 × (12/12 classes) × (116/120 sites) = 96.7%
```

### The denominators, recomputable by hand

**C1 — 61 non-GET routes.** Re-counted from every worker's dispatch, unchanged from round 1:

| worker | non-GET | gated | how |
|---|---|---|---|
| tenancy | 20 | 20 | 17 × `requireRight`/`gated*`; 3 identity-gated (reviewed) |
| content | 13 | 13 | all `gatedBody(module, right)` |
| data-ops | 13 | 13 | `requireRight` / `requireAnyImportRight` / `adminGuard` |
| auth | 10 | 10 | 3 × `INTERNAL_KEY`, 1 × `TEST_LOGIN_KEY` + env, 4 × session, 2 login doors public by necessity |
| mcp | 3 | 3 | `verifyToken` (bearer) or `requireUser` (session) |
| gateway | 1 | 1 | `/api/log/client` verifies the session with auth before recording |
| realtime | 1 | **0** | `POST /publish` — **no caller verification of any kind** (M3) |
| **total** | **61** | **60** | |

Counts from `grep -oE '"(POST|PUT|PATCH|DELETE) [^"]+":'` per `index.ts`, plus the two
`if (pathname === …)` doors in gateway and realtime, which no route table contains.

**C3 — 288/288.** `scratchpad/sec-sql-scan.mjs`: every string/template literal in
`workers/*/src` + `shared/` containing a SQL keyword, comments stripped with a
left-to-right scanner (not regexes — the exact bug this repo just fixed). 288 `${…}`
interpolations; 247 safe by shape (`sqlString(` / `intOr(` / `Number(` / a SCREAMING_CASE
constant / `versionPredicate(` / `bit(` / a generated placeholder run); **41 read
individually, all safe.** The five that are new since round 1: `tagged` is
`sqlString(JSON.stringify(...))` or the literal `"NULL"`; `doneAt` likewise;
`isAgent ? 1 : 0` is a bit; import's `extra` is assembled from `sqlString(...)` fragments
(`import.ts:329`); sharding's keyset `after` goes through `sqlValue(`. No injection.

**C4 — 63/87.** Same denominator as round 1 so the delta is real: 62 declared body fields +
25 `searchParams.get` reads. One input moved: `taggedUserIds` now runs through
`optionalIdList`. I re-read all 24 of round 1's truthiness-only identifier sites; **every
one is unchanged** (`if (!body.id)`, `if (!body.roleId)`, `if (!body.sessionId)`, …).

**C9 — 44/49.** Round 1's seven misses, re-checked one at a time: `notify.ts` `IN(?…)` now
bounded upstream ✓ · the `taggedUserIds` loop now bounded ✓ · `stakeholders.ts:75` still
unbounded in aggregate (THREAD_HARD_CAP threads × up to 512 tags each) ✗ ·
`screens-config.ts:21` `SELECT module, recipe FROM screens` still has no `LIMIT` ✗ ·
`acceptPendingInvites` (`teams.ts:233`) still has no `LIMIT` ✗ · `admin.ts:31` `?limit=-1`
✗ · `HEAVY_LIMITER` still never applied to `/mcp` ✗.

**C12 — 21/24.** Same 24 invariants as round 1. Three moved from unlocked to locked: the
data-ops gating seam (proven by the 46/46 sweep), auth's R10 coverage (proven by two
sabotages), and the self-grant/amplification rule (`workers/tenancy/test/roles.test.ts`,
which also asserts nothing is written when the grant is refused). Still unlocked (3):
realtime and gateway have no gating-seam suite at all, and `workers_dev:false` is asserted
by no test anywhere.

**Sweep coverage.** 12/12 threat classes. 103 API routes + 13 secret/config surfaces + 4 R2
buckets = 120 sites; 116 read. **The 4 unread are the R2 bucket ACLs**, which are live
dashboard state no commit can prove. Unchanged and unchangeable from a read-only clone.

---

## Findings

### HIGH

#### H1 — The privilege escalation is still open. The fix closed the long way round; the short way was never closed.

*(Round 1's H1, re-verified. The specific mechanism has changed — the outcome has not.)*

**Plain English.** Someone whose job is "manage the team's people" can still make a second
account they own into a full administrator. They no longer have to build a role and tick
every box — they just invite themselves, under a second address, straight into the Admin
role that already exists.

**Where.** `workers/tenancy/src/lib/invites.ts:156-196` (`createInvite`) ·
`workers/tenancy/src/lib/members.ts:263-290` (`changeMemberRole`) ·
`workers/tenancy/src/lib/members.ts:99-100` (the members list hands out `roleId`).

**The risk (technical).** `setRolePermissions` now refuses to grant a right the caller does
not hold. Neither of the two doors that *assign a role to a person* asks that question.

**Path A — invite into the existing Admin role. Needs `team_members:read` + `team_members:create`.**

1. `GET /api/tenancy/members` — gated on `team_members:read`. `toMember` returns
   `roleId` and `roleTitle` for every member (`members.ts:99-100`), so any admin's row hands
   over the Admin role's id. No `member_roles:read` required.
2. `POST /api/tenancy/invites` with `{ email: "attacker+2@their-domain", roleId: <admin id> }`.
   `createInvite` validates: email format, not-yourself (exact normalized-email equality —
   `trim().toLowerCase()`, no plus-address folding), **role exists and is active**, not
   already a member, no pending invite. There is **no check that the invited role is one the
   inviter could hold.** The Admin role passes the active check trivially: `setRoleActive`
   refuses to deactivate it (`roles.ts:344`), so it is always active.
3. Accept from that inbox. `acceptInvite` (`teams.ts:336-375`) binds `invite.role_id`
   unchanged into `team_members`.

**Path B — promote an accomplice. Needs `team_members:edit`.**
`changeMemberRole` guards: not yourself, target is a member, role exists and is active, and
the ≥1-admin floor. **No rank check on `newRoleId`.** So the holder promotes any *other*
member — including a second identity they invited earlier as a Viewer — straight to Admin.
The self-check (`targetUserId === guard.userId`) is the only thing standing between the
attacker and their own promotion, and a second account walks around it.

There is no rank or level concept anywhere in the model: `member_roles` has
`id, title, description, is_default, …` and nothing else (`team-schema.ts:25-33`), and a
grep of the whole tenancy worker for `rank|outrank|elevat|escalat|amplif` returns only the
new comment block in `roles.ts`.

Both paths are reachable through the agent and through MCP: `list_members`, `list_roles`,
`invite_member` and `set_member_role` are all in `shared/workers/tool-catalog.ts`
(lines 113, 121, 216, 240), and both surfaces act as the signed-in user over these same
doors. The confirm panel is no defence — the attacker is the one clicking it.

**Severity because.** Impact = full administrative control of one tenant. Reachability = a
role holding `team_members:create` (Path A) or `team_members:edit` (Path B) — which is not
an unusual role, it is *the* role an owner builds when they delegate "look after the
people". No race, no timing, no leaked secret. HIGH, unchanged.

**Mitigations that are real.** Every step writes an activity row with a frozen actor
snapshot and an `origin`, so it is loud in the trail. It cannot cross a tenant boundary.
And Path A costs the attacker an email round-trip they must be able to receive.

**Fix.** The rule `setRolePermissions` now states — *you may not confer what you do not
hold* — has to be applied to conferral by assignment, not only by matrix. One helper, two
call sites:

```
// in lib/roles.ts, beside the amplification check
export async function assertRoleWithinReach(cfg, guard, roleId)
//   reads the caller's sheet and the target role's sheet (both already one query)
//   throws GuardError(403,"privilege_amplification", …) if the target role holds
//   any right the caller's role does not
```

Call it in `createInvite` before the INSERT and in `changeMemberRole` before the UPDATE.
Then add the two tests that are still missing — there is a test for the matrix door and
none for either assignment door.

The alternative remains honest and is the owner's to take: declare `team_members:create` /
`team_members:edit` **admin-equivalent** and say so on the Roles screen and in RULES.md. A
rule that holds on one of three doors teaches an owner the wrong lesson about what they
just granted.

---

### MEDIUM

#### M2 — Nine of the thirty-two permission switches still enforce nothing, and two of them are enforced only by the browser

*(Round 1's M2, half fixed. The privilege-conflation half is genuinely closed — see
verification 2 above.)*

**Where.** `workers/tenancy/src/routes/config.ts:13-16` (`getScreens` opens with
`teamContext` alone) · `workers/tenancy/src/routes/team.ts:209-212` (`getTeamMetaFeed`,
same) · `web/lib/screens.ts:79` (`gate: { module: "teams", right: "read" }` — client-side
only).

**The risk (technical).** Re-derived by cross-referencing every
`requireRight`/`gated*`/`hasRight` call in the tree against the 8 × 4 matrix
(`scratchpad/sec-matrix.mjs`):

| module | read | create | edit | delete |
|---|---|---|---|---|
| teams | **✗ UI-only** | **✗** | ✓ | **✗** |
| team_members | ✓ | ✓ | ✓ | ✓ |
| member_roles | ✓ | ✓ | ✓ | ✓ |
| learning | ✓ | ✓ | ✓ | ✓ |
| help | ✓ | ✓ | ✓ | **✗** |
| selectable_data | ✓ | ✓ | ✓ | ✓ |
| screens | **✗** | **✗** | **✓ (new)** | **✗** |
| agent | ✓ | ✓ | **✗** | **✗** |

10 → **9** unenforced. The two that matter are `teams:read` and `screens:read`: both are
consulted only in `web/lib/screens.ts` to hide a tab, so a role with either switch OFF can
still `GET /api/tenancy/team-meta` (team name, creation date, creator name **and creator
email**) and `GET /api/tenancy/config/screens`. The base's own locked sentence, at the top of
`shared/workers/gating.ts`, is *"security is never just hiding UI."*

**Severity because.** Bounded — the leak is team metadata to an existing member of that
team, not cross-tenant. But it is a real authorisation gap plus a grid where a quarter of
the switches are decorative, which trains an admin to distrust all of them. MEDIUM.

**Fix.** `getScreens` → `gated(request, env, "screens", "read")`; `getTeamMetaFeed` →
`gated(request, env, "teams", "read")`. For the seven pairs with no door, either wire them
or stop rendering them, and add the rule-test that walks `TEAM_MODULES × MODULE_RIGHTS` and
asserts every rendered pair is named by at least one real gate — that check would have
caught `screens` on the day it was added, and would now catch the next one.

#### M3 — `realtime POST /publish` still has no caller check, and two workers' doors still sit outside every gating law

*(Round 1's M3, entirely unchanged.)*

**Where.** `workers/realtime/src/index.ts:142-165` · `workers/realtime/wrangler.jsonc` (no
`INTERNAL_KEY` binding) · no `gating-seam` suite in `workers/realtime/test/` or
`workers/gateway/test/`.

**The risk (technical).** `/publish` reads `{channel, event}` from the body and fans it to
`env.CHANNELS.getByName(shardChannel(channel, i)).broadcast(body)` — **the caller names the
channel.** Its three sibling internal doors in auth all open with
`if (!env.INTERNAL_KEY || header !== env.INTERNAL_KEY)`; this one opens with nothing.

**I still could not reach it, and I tried again.** `workers_dev:false` +
`preview_urls:false` (verified in all 12 blocks) leave realtime with no public address, and
the gateway only forwards `pathname.startsWith("/api/realtime")` — `/publish` does not
match, and `new URL()` normalises `/api/realtime/../publish` to `/publish` *before* the
prefix test. **Not exploitable from the internet today.** Blast radius if reached is still
small: the payload carries no row data (verified again at the one seam,
`shared/workers/realtime.ts:125` — `{ resource, id, op }`), so the damage is forced-refetch
storms, not disclosure.

**Severity because.** Unreachable today, so not HIGH. MEDIUM because it is one config
change from mattering, it is inconsistent with three identical doors that *are* keyed, and
— the part that makes it a control failure — **no automated check would notice either the
door or the flip.** `workers_dev:false` is asserted nowhere in 460 tests.

**Fix.** Unchanged from round 1: the four-line `INTERNAL_KEY` guard, the binding, and a
config test asserting `workers_dev === false && preview_urls === false` for every worker but
the gateway. Note the real cost in the impact map — `INTERNAL_KEY` then has to match across
six workers, and SECRETS.md's runbook goes stale in the same commit.

#### M4 — auth's brand-new R10 census cannot see a door written in a slightly different style, and its tripwire cannot tell

**Plain English.** The check that just gave the login worker its first security coverage
finds its list of doors by pattern-matching one exact way of writing them. Write the next
door the other ordinary way and the check does not fail — it simply never learns the door
exists, and reports all clear.

**Where.** `workers/auth/test/gating-seam.test.ts:25-29` (the census regex) and `:70-75`
(the tripwire).

**The risk (technical).** The census is

```js
[...index.matchAll(/case "([A-Z]+) ([^"]+)":\s*return await (\w+)\(/g)]
```

`return await handler(` is load-bearing. A door written `return handler(request, env)` —
valid TypeScript, identical behaviour, the handler already returns `Promise<Response>` —
matches nothing and is silently absent from the list. Proven against the real suite, on the
final tree:

```
auth baseline:                              Tests  11 passed (11)
NEW ungated POST /api/auth/danger, canonical shape:  × POST /api/auth/danger  (1 failed | 11 passed)
NEW ungated POST /api/auth/danger, no `await`:       Tests  11 passed (11)     <-- invisible
```

The door in the second run writes to `users` straight from an unvalidated body, with no gate
of any kind, and the suite is green with the same 11 tests it had before.

The tripwire is `expect(routes.length).toBeGreaterThan(8)` — an **absolute floor set below
today's count**, not a comparison against reality. `index.ts` holds 13 `case "` labels and
the census parses 12; three could drop out before the floor notices. The suite's own comment
says the tripwire exists so the scan "must FAIL rather than quietly find nothing" — it
catches the scan finding *nothing*, not the scan finding *less*.

**Severity because.** No open door today — all ten are enumerated and all ten are gated,
sabotage-proven. But this is a **census** gap, and a census gap is invisible by construction:
it is the exact mechanism that produced the 12-August "45/45 routes gated" when there were
61, and auth's ten were the ones it could not see. MEDIUM, on the same reasoning round 1
used for the blind slicer: the base's whole security argument is that the laws are
machine-checked.

**Fix.** Derive the census from the `case "<METHOD> <path>":` labels alone, then resolve the
handler as a **separate, failing step**: a case whose handler cannot be read is an error
(`could not resolve a handler for POST /x — this scan has gone blind on it`), never a skip.
Allow an inline response (health) explicitly. Then change the tripwire from a floor to an
equality against the label count, so adding a door forces the author to update the number.
Prove it fails, per the repo's own new rule.

---

### LOW

#### L1 — Ticket mentions are bounded now, but the bound is five times D1's parameter limit, so 101 mentions still silently kill the notification *(half fixed)*
**Where.** `workers/content/src/routes/help.ts:196` · `shared/workers/limits.ts:41` ·
`workers/content/src/lib/notify.ts:36-44` · `workers/content/src/lib/stakeholders.ts:65-78`.
`optionalIdList(body.taggedUserIds)` caps at `BULK_IDS_LIMIT`, which computes to
**512** (`(8192 − 512) / 15`) — a token budget, not a database limit. `lookupUsers` then
builds `IN (?, ?, …)` with one placeholder per unique id, and D1 caps bound parameters at
100. So 101–512 mentions still throw, `notifyReplyAndMentions` still wraps everything in
`try/catch`, and **the raiser's "someone replied to you" email is still silently dropped**.
Round 1's "unbounded" is fixed; round 1's actual harm is not.
*Reasoned from the code and D1's documented limit; not executed against a live D1.*
**Fix.** Chunk both `IN` lists at 90 — the ceiling then stops mattering. (Lowering
`BULK_IDS_LIMIT` is the wrong lever: it is shared with the agent's tool schemas.)

#### L2 — 24 identifier fields are still checked for presence, never for type
**Where.** unchanged: `help.ts` ×5 · `learning.ts` ×3 · `config.ts` · `agent.ts` ×2 ·
`import.ts` ×6 · `selectable.ts` ×2 · `team.ts` · `roles.ts` ×3 · `tenancy/routes/admin.ts`.
Re-read every site; all still `if (!body.id)`. `{"id":{"x":1}}` reaches `d1Query(…, [body.id])`,
D1 refuses the param, and the central catch returns **500** where the base's own law says
400. `postScreen` is worse — `setScreenOverride` calls `module.trim()`, a `TypeError` before
any query. This is the exact class `shared/workers/validate.ts` exists to kill, and
`validate.test.ts` locks it **for text fields only**.
**Fix.** `const id = requireText(body.id, "Id", 64)` at each site. 24 one-line edits.

#### L3 — Uploaded files are still served to anyone with the URL, forever, with no membership check
**Where.** `workers/gateway/src/index.ts:270-285`. A learning attachment key is
`<teamId>/<ulid>` (not enumerable), but a profile photo is `users/<userId>` and a team logo
is `teams/<teamId>` — **directly the id**, handed to every teammate in ordinary API
responses. A removed member keeps working URLs. No revocation.
**What DID change here, and it matters:** the working tree adds `decodeKey()`, which turns a
malformed `/media/%zz` into a clean 400. That is a real security fix and it is not mine —
see "what another review caught that I missed" below. It closes the crash, not the
authorisation.
**Fix.** Unchanged: re-check membership before `serveObject` on `/media/learning/*`, or
short-lived signed URLs, or accept it explicitly as a capability-URL decision in
ARCHITECTURE.md. An accepted risk is fine; an unnoticed one is not.

#### L4 — The MCP surface still gets the loose rate ceiling, and everyone behind one IP still shares a bucket
**Where.** `shared/workers/rate-limit.ts:53-56` (`HEAVY_PATHS`) and `:66-77` (`callerKey`).
`isHeavyPath("/mcp")` is false, so `HEAVY_LIMITER` (60/min) never applies: the same caller
doing `agent_chat` through the web app is capped at 60/min and through MCP gets 600/min.
`callerKey` still looks only for a `brimba_session` cookie, so every bearer-token caller
keys to `ip:<CF-Connecting-IP>`. **Fix.** A `Bearer` branch in `callerKey`; charge
`HEAVY_LIMITER` in `forwardTool` when the tool is AI-costed or an export.

#### L5 — `?limit=-1` still turns the owner error dashboard into an unbounded read
**Where.** `workers/data-ops/src/routes/admin.ts:31`. `Math.min(Number("-1") || 100, 200)`
→ `-1`; SQLite reads `LIMIT -1` as no limit. `adminGuard`-only.
**Fix.** `Math.min(Math.max(Math.trunc(Number(...)) || 100, 1), 200)`.

#### L6 — Every signed-out caller still shares one retry-key identity
**Where.** `shared/workers/concurrency.ts:49-53`. Still unreachable (every
idempotency-wrapped route is a gated mutation). Reported 2026-08-12 and again in round 1
with a one-line fix; the line still has not been written.
**Fix.** `SHA-256(cookie || "ip:" + request.headers.get("CF-Connecting-IP"))`.

#### L7 — The lost-update guard is still sent by browsers and by nothing else
**Where.** `shared/workers/tool-catalog.ts` — a grep for `expectedVersion` in that file
returns **nothing**. `update_role`, `update_dropdown_value`, `update_learning` and
`update_help_ticket` build bodies without it, and the doors treat it as optional, so an
agent or MCP edit always wins the race against a human with the record open, silently.
**Fix.** Add `expectedVersion: opt(i, "expectedVersion")` to the four `buildBody`s and the
field to their schemas. Optional stays optional.

#### L8 — SECRETS.md still overstates the vault, and the vault still does not exist
`ls secrets.vault` → not found. `vault:check` is still absent from `npm run check`
(`package.json:15`), so "these secrets exist ONLY on this laptop" is still a silent state
rather than a red build. SECRETS.md:33 still argues for a passphrase "a human can actually
remember" — the one sentence that decides whether publishing ciphertext in a public repo is
safe, and the one this review asked to be rewritten. The crypto assessment and the four
conditions in round 1's report stand unchanged; nothing in them has been acted on.

#### L9 — The R10 predicate treats a CONDITIONAL gate as a gate
**Where.** `shared/test/gating-seam.ts:107-110` — `GATE_RE.test(code)` asks whether a gate
token appears *anywhere* in the handler body, while the assertion's own message says the
route must **open with** one.
**Proven.** Deleting `postCreateRole`'s unconditional
`await requireRight(cfg, guard, "member_roles", "create")` and leaving only
`if (withMatrix) await requireRight(cfg, guard, "member_roles", "edit")` keeps the tenancy
suite green at 3 passed. Deleting both turns it red. So a door gated only on one branch
reads as fully gated.
**Reach today: one route.** `POST /api/tenancy/roles` is the only non-GET route in the three
scanned workers with more than one gate call, and it still carries its unconditional one, so
nothing is open. Filed because it is the residue of exactly the family M1 belonged to, and
because the 46/46 sweep only proves the *fully* ungated case.
**Fix.** Require the first gate call to be at the handler's top level — the gate must appear
before the first `if`/`for`/`try` in the body, or the route must be listed with a reason.

---

## What another review caught that I missed — and the correction it forces

Round 1 of this review inspected the gateway's brand-new central catch and wrote:
*"the unauthenticated `GET /media/%` → `URIError` → bare platform 500 that I would otherwise
have filed is already closed."*

That was wrong, and wrong in the dangerous direction. `scaling_review` and
`error_log_review` both found in round 2 that the central catch did not close it — it
**converted** it. `/media/*` sits deliberately outside the surge ceiling, so an anonymous,
unlimited caller could turn one malformed URL into one row per request written to the shared
operations database (and, on a deployment without the OPS binding, into the **core**
database, which is where sign-in lives). The working tree now fixes it with `decodeKey()`
returning a clean 400, recorded nowhere.

Two things follow, and both belong in this report rather than in a footnote:

1. **A repair to one review's criterion opened a hole in mine, and my own round-1 pass
   looked straight at the new code and declared it safe.** That is the campaign's premise
   demonstrated on this reviewer.
2. **My C9 denominator was too small.** I enumerated "list reads, loops over input, uploads,
   external calls, rate ceilings" and did not enumerate *unbounded write paths reachable
   without authentication*. Adding that class would have made C9 42/50 in round 1. I have
   not retrofitted it — changing a denominator between rounds destroys the delta the round
   exists to measure — but the next run should carry it, and the census below is where it
   belongs.

---

## The committed route census — does one exist? **No. Here is what it must contain.**

Round 1's closing argument was that the durable fix is not a higher score but a committed
denominator. Nothing of the kind has been added. What exists today is four unrelated
floors:

| where | what it asserts | what it can catch |
|---|---|---|
| `shared/test/gating-seam.ts:89` | `routes.length >= minRoutes` (tenancy 14, content 8, data-ops 8) | the ROUTES table being renamed away entirely |
| `workers/auth/test/gating-seam.test.ts:73` | `routes.length > 8` | the switch being renamed away entirely |
| `workers/mcp/test/gating-seam.test.ts:38` | `cases.length >= 4` | the same |
| realtime, gateway | *nothing* | *nothing* |

Every one is an **absolute floor set below today's real count**. Not one of them can catch a
door being *added* invisibly, a handler shape drifting out of the parser's view (M4), or a
worker having no parser at all. And 2 of the 61 state-changing doors are in workers that no
census reads.

**What the census should contain** — one committed file, one test:

1. **Every worker, derived from disk, never from a list.** `readdirSync(workers/)` → for
   each, parse whichever dispatch it uses (a `ROUTES` table, a `switch`, or an
   `if (pathname === …)` chain) into `METHOD path → handler`. **A worker whose dispatch the
   parser cannot read is a FAILURE, not a skip** — that single rule is what makes a census a
   census rather than a longer floor.
2. **The totals pinned as equalities, not floors.** `toBe(61)` for non-GET routes,
   `toBe(103)` for all routes, plus the per-worker breakdown, plus how many of the 61 are
   covered by an R10 suite (today: 59 — realtime and gateway are not). A number that moves
   fails the build and makes the author update it, which is the moment the *next* reviewer's
   denominator gets corrected for them instead of re-guessed.
3. **Every non-GET route classified once, in one vocabulary,** with its gate kind — `right`,
   `identity`, `internalKey`, `ownSecret`, `emailedCode`, `selfScoped`, `open` — and a
   written reason required for `open`. That classification currently lives in four files
   with four vocabularies (`identityGated`, `OPEN_BY_DESIGN`, mcp's
   `verifyToken|requireUser`, and nothing for realtime/gateway), which is why "how many
   doors are gated, and how?" cannot be answered from the test suite today.
4. **The other denominators this review keeps re-deriving by hand:** SQL-bearing
   interpolations (288), request inputs (87), stored credential columns (4), and deployed
   services × `workers_dev`/`preview_urls` (12 blocks — the last of which would also close
   half of M3).
5. **A sabotage that proves it fails,** shipped in the same commit, per the rule
   `shared/test/source.ts` now states in its own header: *a check must derive its own subject
   list from the code, and must be proven to FAIL before it counts.*

Until that exists, a security score for this repo — **including this one** — is a claim
about the reviewer's diligence first and the code second.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **H1** `assertRoleWithinReach` helper, called in `createInvite` and `changeMemberRole` | `workers/tenancy/src/lib/roles.ts` (export the helper), `lib/invites.ts`, `lib/members.ts`, + 2 tests | ADDS ~20 lines and 2 tests; ADDS 2 reads per invite and per role change | **speed_review / spend_review** — two extra `role_permissions` reads on two low-frequency doors; negligible, but not zero. **first_run_review** — the first admin delegating "manage people" now meets a refusal they did not have before; the message must name the missing rights (the helper already formats them, copy the `privilege_amplification` string). **interfacelessness_review** — the agent and MCP must surface the same refusal, which they will, since both go through these doors. **lean_mean** — +1 seam, but it REPLACES nothing and duplicates the matrix check, so consider extracting the shared comparison rather than writing it twice. |
| **M2a** `getScreens` → `screens:read`; `getTeamMetaFeed` → `teams:read` | `workers/tenancy/src/routes/config.ts`, `routes/team.ts` | changes 2 gate arguments | **first_run_review / dead_end_review** — a fresh team's Viewer role has `teams:read=1, screens:read=1` by default (`team-schema.ts:411`), so day one is fine; any *existing* custom role with those switches off loses the team header and the screen overrides and falls back to base recipes. Needs a migration note. **realtime_review** — `publishChange(…, "screens", …)` now reaches listeners who may not be allowed to refetch; the client's 403 handling must not toast. |
| **M2b** rule-test: every rendered `module × right` pair must be named by a real gate | `web/test/rules.test.ts`, `shared/rules/registry.ts`, `RULES.md` | ADDS a check + a law (R26) | **lean_mean** — one more law, one more test; `registry-integrity` forces the RULES.md paragraph too, so it cannot be added cheaply. **story_checks_out** — RULES.md and the law-range sentences in five documents all move together. |
| **M2c** stop rendering the 7 switches with no door | `shared/team-modules.ts` or the matrix projection | REMOVES UI | **base_fork_review** — *negative*: a fork adding a Help delete door would have to re-add the switch. Prefer gating the *rights* per module over removing module rows. |
| **M3a** `INTERNAL_KEY` guard on `realtime POST /publish` | `workers/realtime/src/index.ts`, `workers/realtime/wrangler.jsonc`, `shared/workers/realtime.ts` | ADDS ~6 lines + a binding + a secret on one more worker | **mac_fell_in_the_ocean_review** — *real cost*: `INTERNAL_KEY` must now match across **six** workers; SECRETS.md's table and BOOTSTRAP.md's "set it in one sitting" step both go stale and must move in the same commit. **realtime_review** — a missed secret on deploy silently kills every live update, so deploy order matters more than it did. This is why M3 is MEDIUM-with-a-reason and not "just add the guard". |
| **M3b** gating-seam for auth-style dispatch extended to realtime + gateway; `workers_dev:false` config test | new `workers/{realtime,gateway}/test/gating-seam.test.ts`, `web/test/config-vars.test.ts` | ADDS ~60 lines of test | **lean_mean** — pure test growth. Mitigate by folding it into the census (below) rather than writing two more suites. **speed_review** — negligible, source scans only. |
| **M4 + the census** replace the four floors with one derived, equality-pinned route census | one new `shared/test/route-census.ts` + one test; DELETES the three `minRoutes` floors and auth's/mcp's bespoke censuses | ADDS ~120 lines; **REMOVES ~40** and three vocabularies | **lean_mean** — *net positive*: it is the fourth instance of the same duplication `shared/test/source.ts` was created to end, and it deletes more concepts than it adds. **story_checks_out** — the census becomes the thing RULES.md's R10 paragraph points at, so that paragraph must be rewritten in the same commit. **architecture_review** — *positive*: a machine-readable list of every door and its gate is the artefact its request-tracing criterion keeps asking for. |
| **L1** chunk both `IN` lists at 90 | `workers/content/src/lib/notify.ts`, `lib/stakeholders.ts` | ADDS ~8 lines | **scaling_review** — *positive*: removes a hard failure at 100 mentions. **speed_review** — a >90-recipient reply becomes 2 queries instead of 1; irrelevant at real team sizes. |
| **L2** `requireText(body.id, "Id", 64)` at 24 sites | 9 route files | REMOVES 24 truthiness checks, ADDS 24 validated ones — net zero lines | **lean_mean** — neutral, a substitution. **error_log_review** — *positive*: removes a class of 500 that writes an `error_logs` row per hostile request, which is the same amplification shape the `/media/%zz` fix just closed. |
| **L3** membership check before `serveObject` on `/media/learning/*` | `workers/gateway/src/index.ts` | ADDS one `whoAmI` + `isActiveMember` hop per media request | **speed_review** — this is the real cost: a service hop on every image and video load; a cold page with 20 attachments is 20 extra auth calls. **spend_review** — +1 subrequest per media miss. **scaling_review** — puts auth on the media path, which SCALING.md assumes is cache-only. **If speed_review is near its floor, take the documented-capability-URL option instead** — the honest cheap answer. |
| **L4** `Bearer` branch in `callerKey`; charge `HEAVY_LIMITER` for AI/export tools | `shared/workers/rate-limit.ts`, `workers/mcp/src/lib/tools.ts` | ADDS ~6 lines | **interfacelessness_review** — *direct tension*: it makes the MCP surface **less** capable per minute than today. Frame it as parity (the web path already has this ceiling), not as a new restriction. **spend_review** — *positive*, it is the ceiling that protects the AI bill. |
| **L5** clamp the error-dashboard limit | `workers/data-ops/src/routes/admin.ts` (1 line) | none | none — a one-line clamp on an owner-only read. |
| **L6** include the IP in `ownerOf`'s digest when there is no cookie | `shared/workers/concurrency.ts` (1 line) | ADDS 1 line | none — no behaviour change for signed-in callers, which is every caller that reaches it. |
| **L7** forward `expectedVersion` from the four `buildBody`s | `shared/workers/tool-catalog.ts` | ADDS 4 optional fields to 4 schemas | **interfacelessness_review** — *positive*, it closes a real UI-vs-machine divergence. **realtime_review / scaling_review** — an agent that now gets 409s must retry; the agent's failure narration already reports a refusal honestly. |
| **L8** rewrite SECRETS.md's passphrase paragraph; `read -r`; scrypt + a version byte; `vault:check` in `npm run check` | `SECRETS.md`, `scripts/vault.mjs`, `package.json` | ADDS ~15 lines; **REMOVES a false claim** | **mac_fell_in_the_ocean_review** — *strongly positive*: `vault:check` in the gate turns "the secrets exist only on this laptop" from a silent state into a red build. **story_checks_out** — SECRETS.md and BOOTSTRAP.md both describe `vault:open` in the recovery runbook; a KDF change needs the version note in both or the story breaks. |
| **L9** require the first gate to precede the first branch | `shared/test/gating-seam.ts` (~5 lines) | ADDS ~5 lines | **none — it strengthens an existing check without touching product code.** Its only cost is that it may go red on a route nobody knew was conditionally gated, which is the point. |

---

## CEILING

**Is 95 reachable by changing code? Yes — 96.3 is already the control score, and 100 is
reachable. Nothing structural stops it.** Closing every finding above gives:

- Penalty 28 → 0.
- C1 60/61 → 61/61 (+0.25) · C2 94/95 → 95/95 (+0.11) · C4 63/87 → 87/87 (+2.21) ·
  C9 44/49 → 49/49 (+0.51) · C10 41/43 → 43/43 (+0.37) · C12 21/24 → 24/24 (+0.25).
- ControlScore 96.31 → **100.00**. Posture → **100**, grade A.

Three caveats on what that number would mean — the first two carried from round 1 unchanged,
the third sharpened by what this round found:

1. **Sweep coverage caps at 96.7% from this machine.** The four R2 bucket ACLs are live
   cloud state; no commit can prove them. One `wrangler r2 bucket info` per bucket, run by
   the owner, closes it. Any report produced from a read-only clone should print 96.7%.
2. **L3 is capped by a locked decision, not by code.** ARCHITECTURE.md's static-export +
   one-public-door model makes cheap authenticated media genuinely awkward. Closing it by
   documented decision is legitimate and I would accept it — but then C10 stays at 41/43
   with a stated exemption and the true maximum is **99.6**, not 100.
3. **The number's meaning is still capped by who computes it — and this round proved it
   twice, on me.** My round-1 C9 denominator omitted a whole class (unbounded unauthenticated
   write paths) that two other reviews then found a live instance of; and my round-1 note
   that the gateway's central catch had "closed" the `/media/%` hole was exactly backwards.
   Neither error would have been caught by a higher score. Both would have been caught by a
   committed census that forces the denominators to be written down and re-derived by the
   build rather than by the reviewer. **That remains the single highest-value security
   change available in this repo, and it is still not built.**

**Ship recommendation: not yet.** One unresolved HIGH — privilege escalation to full tenant
admin, reachable from an ordinary "manages the people" role, through the UI, the agent and
MCP alike. It needs either the two-door fix or the owner's explicit, written accept that
`team_members:create` and `team_members:edit` are admin-equivalent rights.
