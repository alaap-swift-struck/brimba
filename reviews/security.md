# Security sentry — Brimba · 2026-08-25
SCORE: 68/100   (previous: 99/100 on 2026-08-12)

**Security 68/100 (D — and capped at C anyway by the open HIGH) · sweep coverage 97% ·
12 findings (0 critical, 1 high, 3 medium, 8 low) · do not ship until the HIGH is
decided.**

Read the next paragraph before the number.

**Why 99 → 68, honestly.** Almost none of the drop is new broken code. Two thirds of it
is that the previous run measured a smaller surface than exists. Its own scorecard says
`SWEEP COVERAGE 12/12 classes × 45/45 state-changing routes = 100%`. There are **61**
state-changing routes in this repo. The 16 it did not count are the entire `auth`
worker's ten POST doors, the `mcp` worker's three, `realtime POST /publish`, and the
gateway's public beacon — and the one route in the whole base with no caller check at all
is in that missing set. A denominator that excludes the un-swept part of the app cannot
report anything but 100%. The rest of the drop is a stricter definition of "validated"
(presence ≠ type) and findings the earlier sweep did not reach. Every count below is
printed so it can be recomputed by hand.

**What the score does NOT mean.** It is not "the app is 68% secure" and it is not a breach
probability. It measures countable controls across the surface I actually read, minus what
I proved broken. This codebase is, on the evidence, unusually well built: zero SQL
injection across 283 interpolations, every credential hashed at rest, every external call
bounded, every render site escape-first, no hardcoded secret in the tree or its history,
and race-safe atomic writes on all three named invariants. A 68 here would be an 88
somewhere else. The number is low because the *countable* surface is bigger than anyone
had counted, not because the code got worse.

---

## Scope and provenance

- Tree read at `HEAD = 8751e30`, 2026-08-25 13:17 IST.
- **The tree moved while I read it.** The main session applied error-log repairs mid-review
  to `workers/gateway/src/index.ts`, `workers/realtime/src/index.ts`,
  `workers/data-ops/src/lib/import{,-batch}.ts`, `workers/tenancy/src/lib/sharding.ts`,
  `web/test/rules.test.ts` and added `shared/test/source.ts`. Every measurement below is
  against the **working tree as of 13:17**, not `HEAD`. Notably the gateway gained a
  central catch during the review; the unauthenticated `GET /media/%` → `URIError` → bare
  platform 500 that I would otherwise have filed is already closed.
- I wrote nothing to the repo except this file. Scratch work is under
  `…/scratchpad/sec-*.mjs`.

---

## Arithmetic

### Step 1 · Control coverage

```
CONTROL COVERAGE                        passing/applicable   ratio   weight  W×ratio
C1  Authorization ......................... 60/61            0.9836     15   14.7541
C3  Query safety ........................ 283/283            1.0000     12   12.0000
C5  Secret hygiene ........................ 12/12            1.0000     12   12.0000
C2  Authentication ........................ 94/95            0.9895     10    9.8947
C7  Credentials at rest ..................... 4/4            1.0000     10   10.0000
C4  Boundary validation ................... 62/87            0.7126      8    5.7011
C10 Output scoping ........................ 41/43            0.9535      8    7.6279
C6  Surface minimization .................... 7/7            1.0000      6    6.0000
C8  Fail-closed gates ..................... 12/12            1.0000      6    6.0000
C9  Resource bounds ....................... 42/49            0.8571      5    4.2857
C11 Render safety ........................... 3/3            1.0000      4    4.0000
C12 Invariant locking ..................... 18/24            0.7500      2    1.5000
C13 Dependency health ....................... 1/1            1.0000      2    2.0000
                                                          Σ W = 100   Σ W×r = 95.7635

ControlScore = 100 × 95.7635 ÷ 100 = 95.76
FINDINGS PENALTY  0×25 + 1×10 + 3×3 + 8×1 = 10 + 9 + 8 = 27
POSTURE           95.76 − 27 = 68.76 → 68/100
GRADE             D (68) — and an unresolved HIGH caps any result at C regardless
SWEEP COVERAGE    100 × (12/12 classes) × (116/120 sites) = 96.7%
```

### The denominators, so they can be recomputed

**C1 Authorization — 60/61 non-GET routes.** Enumerated from every worker's switchboard,
not just the three with a `ROUTES` table.

| worker | non-GET | gated | how |
|---|---|---|---|
| tenancy | 20 | 20 | 17 × `requireRight`/`gated*`; 3 identity-gated (bootstrap, switch-team, teams-create, invitations/accept — reviewed) |
| content | 13 | 13 | all `gatedBody(module, right)` |
| data-ops | 13 | 13 | `requireRight` / `requireAnyImportRight` / `adminGuard` |
| mcp | 3 | 3 | `verifyToken` (bearer) or `requireUser` (session) |
| auth | 10 | 10 | 3 × `INTERNAL_KEY`, 1 × `TEST_LOGIN_KEY` + env, 4 × `getSessionUser`, 2 login doors public by necessity (throttled + attempt-capped) |
| gateway | 1 | 1 | `/api/log/client` verifies the session with auth before recording |
| realtime | 1 | **0** | `POST /publish` — **no caller verification of any kind** (finding M3) |
| **total** | **61** | **60** | |

**C2 Authentication — 94/95.** 103 API routes total; 8 deliberately public (2 login doors +
6 `/health`); 95 non-public. All resolve identity, an internal key, or an admin key
server-side, except `realtime POST /publish`.

**C3 Query safety — 283/283.** Scanned every backtick/quote literal in
`workers/*/src` + `shared/` containing a SQL keyword (`scratchpad/sec-sql-scan.mjs`).
283 `${…}` interpolations; 242 safe by shape (`sqlString(` / `intOr(` / `Number(` / a
SCREAMING_CASE constant / `versionPredicate(` / `bit(`); **41 read individually, all
safe.** The 41: `resolveBlock`/`extraSql` in `help.ts` are literal fragments with `?`
placeholders and every value in `params`; `${placeholders}` in `notify.ts:38` and
`stakeholders.ts:75` is a generated `?, ?, ?` run; `${table}`/`${rule.table}` in
`sharding.ts` is either read back from `sqlite_master` or comes off `moveModule`, which
validates against `/^[A-Za-z_][A-Za-z0-9_]*$/` at the boundary
(`workers/tenancy/src/routes/admin.ts:78-81`); `${limit}` in `data-ops/routes/admin.ts:31`
is `Math.min(Number(...)||100, 200)`. **No injection.** `sqlString` doubles `'` and SQLite
has no backslash escape, so the escaping is complete.
*Two hits in the raw scan were English prose parsed as SQL* (`learning.ts:52` is a regex,
`bulk-doors.ts:88` is a comment sentence) — the failure mode the brief warns about. Read,
discarded, not counted.

**C4 Boundary validation — 62/87.** 62 declared body fields + 25 `searchParams.get`
reads = 87 inputs. Definition used: an input counts as *validated* when a hostile value of
any JSON type produces a clean 4xx rather than a 5xx or wrong behaviour. Misses = 25:

- 24 identifier body fields checked with truthiness only (`if (!body.id)`), never
  `typeof === "string"` — finding L2. Full list in the finding.
- `taggedUserIds` (`content/routes/help.ts:191`) — element type-checked, count and
  per-element length not — finding L1.

Everything routed through `requireText` / `optionalText` / `requireIdList` (57 call sites),
every enum checked against an allow-list (`HELP_STATUSES`, the activity `SCOPES`), and
`grant-credits`' `amount` (`Number.isFinite` + `Math.trunc` + `> 0`) passes.

**C5 Secret hygiene — 12/12.** 6 named env secrets (`INTERNAL_KEY`, `CF_D1_TOKEN`,
`ADMIN_KEY`, `TEST_LOGIN_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) all read from `env`,
never literal. 2 runtime-minted credentials (session token, MCP token secret) from
`crypto.getRandomValues`, 256-bit. 4 storage columns hashed. Regex sweep for
`key|secret|token|password = "<16+ chars>"` across `workers/ shared/ web/ scripts/`:
**0 hits.** History: `git log --all --diff-filter=A` shows no `.dev.vars` was ever added;
a grep of the last 200 commits for Cloudflare/Anthropic/Resend token shapes:
**0 hits.** `.gitignore` covers `.dev.vars`, `.env*`, `.wrangler/`.

**C6 Surface minimization — 7/7 services.** All six non-gateway workers carry
`"workers_dev": false` **and** `"preview_urls": false`, in both the top-level (production)
block and the `env.staging` block — verified in all 12 blocks. The gateway is public by
design. **Unmeasured:** the four R2 buckets' public-access ACLs are dashboard state, not
code; no `public_bucket` flag appears anywhere and R2 is private by default, but I cannot
read the live setting. That drops sweep coverage, not this ratio.

**C7 Credentials at rest — 4/4.** `sessions.token_hash`, `login_codes.code_hash`,
`email_change_codes.code_hash`, `mcp_tokens.token_hash` — all SHA-256, all compared by
digest, none ever read back. The 6-digit codes are salted by the email
(`sha256(code:email)`) and protected by an *atomic* attempt cap
(`workers/auth/src/index.ts:236-243` consumes the slot in the same UPDATE that checks it).

**C8 Fail-closed gates — 12/12.** Gates that read a secret or config: auth's three
`/internal/*` doors, `adminTestLogin`, six `adminGuard` call sites, and `d1ConfigFrom`.
All refuse (403/503/throw) when the secret is absent. Explicitly **excluded from this
denominator**: the three rate ceilings (`USER_LIMITER`, `HEAVY_LIMITER`, `TEAM_LIMITER`),
which fail *open* by documented design — a missing limiter removes a ceiling, it does not
open a closed door, so it belongs in C9. Counting them here would be double-counting;
if you prefer to, the ratio is 12/15 = 0.80 and the score is 67.

**C9 Resource bounds — 42/49.** Sites: 31 multi-row request-path reads + 7 loops over
caller-supplied arrays + 2 upload paths + 6 external-call families + 3 rate ceilings.
Misses (7): `notify.ts:38` unbounded `IN(?…)`; `stakeholders.ts:75` unbounded `IN(?…)`;
`screens-config.ts:21` `SELECT module, recipe FROM screens` with no cap;
`teams.ts:295-302` a user's pending-invite sweep (capped) vs `acceptPendingInvites`'s
onboarding path; `data-ops/routes/admin.ts:31` `?limit=-1` → `LIMIT -1` = unbounded;
`taggedUserIds` loop; `HEAVY_LIMITER` never applied to `/mcp`.
All three external fetch families **are** bounded and I verified it in code, not docs:
`AbortSignal.timeout(15_000)` on Resend (`auth/lib/email.ts:63`) and the D1 REST door
(`d1-rest.ts:42`), `120_000` on both Anthropic calls (`model.ts:158,191`), `5_000` on every
service binding (`trace.ts:SERVICE_TIMEOUT_MS`).

**C10 Output scoping — 41/43.** 31 collection responses (all scoped by
`guard.databaseId`/`guard.teamId`), 3 exports, 2 publish payload shapes (`{resource,id,op}`
only — no row data, verified at the one seam in `shared/workers/realtime.ts`), 2 realtime
channel joins (own user id only; team membership re-checked), 2 owner cross-team reads
(both behind `adminGuard`, documented), 1 error/log output (every field length-capped in
`logError`), 2 R2 media routes. **Misses: the 2 media routes** — finding L3.

**C11 Render safety — 3/3.** `rich-text.tsx` → `sanitizeRichHtml` (DOMParser into a
detached document, tag allowlist, all attributes dropped, `safeHref` protocol allowlist,
`escapeAttr` closes the quote-breakout hole). `agent-markdown.tsx` → `toHtml`
(escape-first, then a tiny subset). `brand-theme.tsx` injects colours from
`shared/brand.ts`, a build-time constant with no request input.

**C12 Invariant locking — 18/24.** Locked ✓: gating-seam × tenancy/content/mcp,
`sqlString`, hashed credentials, MCP verify-before-parse, agent confirm-on-privilege-write,
agent catalog opt-in, ≥1-admin atomicity, unique pending invite, never-negative credits,
publish-payload shape, upload mime allowlist, boundary 400-not-500 *for text*, both XSS
sanitizers, origin-header strip, rate-limit path coverage, `expectedVersion` on edit doors.
Unlocked ✗ (6): the data-ops gating-seam (**green but blind** — M1), auth / realtime /
gateway have no gating-seam suite at all (M3), `workers_dev:false` has no test anywhere,
and the `self_grant` block has no test.

**C13 Dependency health — 1/1.** `npm audit` against the committed lockfile:
`found 0 vulnerabilities`. Confirmed the tool actually ran (it printed a result, not help
text).

### Step 3 · Sweep coverage
12/12 threat classes swept. Sites enumerated = 103 API routes + 13 secret/config surfaces
+ 4 R2 buckets = 120. Sites read = 116. **The 4 unread are the R2 bucket ACLs, which need
live cloud data I cannot reach.** 100 × 1.00 × (116/120) = **96.7%**.

---

## Findings

### HIGH

#### H1 — A "manager" role can make itself a full admin in three calls

**Plain English.** The app deliberately stops someone with permission-editing rights from
ticking every box on their *own* role. It does not stop them making a *new* role with
every box ticked, inviting a second email address they own into it, and signing in as that
account. The block reads like a wall and is a doorway.

**Where.** `workers/tenancy/src/lib/roles.ts:271-278` (the `self_grant` guard) ·
`workers/tenancy/src/lib/invites.ts:151-153` (the self-invite check) ·
`workers/tenancy/src/lib/teams.ts:333+` (`acceptInvite` assigns the invite's `role_id`).

**The risk (technical).** `setRolePermissions` refuses only when
`roleId === guard.roleId`, with the stated intent *"member_roles:edit … must not be a
ladder to every right you weren't given."* The ladder still exists:

1. `POST /api/tenancy/roles` — needs `member_roles:create` — create role **Y**.
2. `POST /api/tenancy/roles/permissions` — needs `member_roles:edit` — set every module on
   Y to `read+create+edit+delete`. `roleId ≠ guard.roleId`, so the guard does not fire.
3. `POST /api/tenancy/invites` — needs `team_members:create` — invite
   `attacker+2@their-domain.test` as role Y. The self-invite check is exact normalized-email
   equality (`normalizeEmail` is `trim().toLowerCase()` — no plus-address folding), so any
   second address the attacker controls passes, as does the already-a-member check.
4. Accept the invite from that inbox (they own it; the 6-digit code arrives there).
   `acceptInvite` binds `i.role_id` unchanged.

The second identity now holds all 32 rights. Role Y is not `is_default`, so it is not
counted toward the ≥1-admin floor and a real admin can still deactivate it — but
operationally it is an admin. Every step is also reachable through the agent and through
MCP (`create_role`, `set_role_permissions`, `create_invite` are all in the shared
catalogue); the agent's confirm panel is no defence here, because the attacker is the one
clicking it.

**Severity because.** Impact = full administrative control of one tenant. Reachability =
a custom role holding `member_roles:create|edit` + `team_members:create` — i.e. exactly the
"team manager who can shape roles and invite people" configuration the permission matrix
invites an owner to build. No unusual timing, no race, no leaked secret.

**Mitigations that are real and should be stated.** Every step writes an activity row
(`Role created`, `Role permissions changed`, `Invite sent`) with a frozen actor snapshot
and an `origin`, so this is loud in the audit trail, not silent. It also cannot cross a
tenant boundary.

**Fix — two honest options, pick one.**
- **(a) Close it.** Add a no-amplification rule in `setRolePermissions` and
  `createRole(withMatrix)`: a caller may not grant a right their own role does not hold.
  ~6 lines, reads the caller's own matrix (already fetched by `getMyPermissions`). Then
  extend it to `createInvite`: refuse an invite naming a role that outranks the inviter's.
- **(b) Stop claiming otherwise.** If `member_roles:edit` is *intended* to be
  admin-equivalent, delete the `self_grant` guard and say so in RULES.md and the Roles
  screen. A guard that stops one route out of two teaches an owner the wrong lesson about
  what they just granted.

Either way, add the test that is missing — there is no test asserting the `self_grant`
behaviour today, in either direction.

---

### MEDIUM

#### M1 — The law that guarantees "no ungated door can ship" is provably blind on one door

**Plain English.** There is an automated check whose whole job is to fail the build if a
state-changing endpoint loses its permission check. I deleted an endpoint's permission
check (in memory, not in the repo) and the check stayed green.

**Where.** `shared/test/gating-seam.ts:44-54` (`exportedFunctions`) ·
the blind route is `POST /api/data-ops/import/confirm`
(`workers/data-ops/src/routes/import.ts:124-134`).

**The risk (technical).** `exportedFunctions` slices each handler from its
`export async function` to the **next** `export async function` — so the slice runs past the
handler's closing brace. `postImportConfirm` (line 124) is followed by the *non-exported*
helper `requireAnyImportRight` (line 140) before the next export (line 146). That helper's
own declaration line, `async function requireAnyImportRight(cfg…`, matches the gate regex
(the leading-boundary lookbehind sees a space, not an identifier character). So the slice
contains a "gate" no matter what the handler does.

Proof, run against the real file:

```
$ node scratchpad/sec-sabotage-probe.mjs
sabotage applied: true
ORIGINAL:  gating-seam sees a gate for postImportConfirm -> true
SABOTAGED: gating-seam sees a gate for postImportConfirm -> true
```

The sabotage deleted the line `await requireRight(cfg, guard, target.module, "create")`.
The check does not notice. `import/confirm` is the door that writes every mapped row into a
team's tables — the highest-blast write in data-ops.

**Severity because.** Impact today = zero; the door *is* gated. Impact of the control
failing = an ungated bulk-write door could ship and the build would stay green. This is
"weakens a defence in depth", and it is the fourth instance of this exact family
(`shared/test/source.ts`, added to this repo *during this review*, catalogues eight
others). MEDIUM, not LOW, because the base's entire security argument is "the laws are
machine-checked, not aspirational."

**Fix.** One import. `shared/test/source.ts` already exports `namedBody`/`declarationBody`,
whose terminator regex includes `\nasync function `, so it stops at the helper and would
have caught the sabotage. Replace `exportedFunctions`' slicing with `declarationBody` and
re-run the sabotage probe to prove the check now fails. Then apply the repo's own new rule
— *"a check must be proven to FAIL before it counts"* — to the other three gating-seam
suites.

#### M2 — Ten of the thirty-two permission switches are live toggles that enforce nothing, and one of them silently carries someone else's power

**Plain English.** The Roles screen shows a grid of 32 on/off switches. Ten of them do
nothing at all on the server. And the "Team → edit" switch — which a person would read as
"can rename the team and change its logo" — also grants the power to rewrite every screen
in the app for everybody.

**Where.** `workers/tenancy/src/routes/config.ts:19-21` (`postScreen` gates on
`"teams","edit"`) · `workers/tenancy/src/routes/config.ts:13-16` (`getScreens` gates on
nothing but membership) · `shared/team-modules.ts:8-18` (the 8 modules) ·
`web/lib/screens.ts:79` (`gate: { module: "teams", right: "read" }` — client-side only).

**The risk (technical).** Cross-referencing every `requireRight`/`gated*` call in the
tree against the 8 × 4 matrix:

| module | read | create | edit | delete |
|---|---|---|---|---|
| teams | **✗ UI-only** | **✗** | ✓ | **✗** |
| team_members | ✓ | ✓ | ✓ | ✓ |
| member_roles | ✓ | ✓ | ✓ | ✓ |
| learning | ✓ | ✓ | ✓ | ✓ |
| help | ✓ | ✓ | ✓ | **✗** |
| selectable_data | ✓ | ✓ | ✓ | ✓ |
| screens | **✗** | **✗** | **✗** | **✗** |
| agent | ✓ | ✓ | **✗** | **✗** |

10 unenforced. Two consequences that are security, not tidiness:

1. **Privilege conflation.** `screens:edit` exists, is offered, and is ignored;
   `postScreen` uses `teams:edit` instead. A screen recipe is a 64 KB JSON blob that
   defines what every member of the team sees — it is the most leverage-per-byte object in
   the product. It should not ride on the rename-the-team switch, and an owner turning
   "Team → edit" on has no way to know it does.
2. **Security by hiding UI.** `teams:read` is consulted only in `web/lib/screens.ts` to
   hide a tab. `getTeamMetaFeed` and `getScreens` gate on `teamContext` alone, so a role
   with that switch OFF can still `GET /api/tenancy/team-meta` (team name, creation date,
   creator name **and creator email**) and `GET /api/tenancy/config/screens`. The base's own
   locked rule, written at the top of `shared/workers/gating.ts`, is *"EVERY server request
   validates membership + rights — security is never just hiding UI."*

**Severity because.** Bounded (the leaked data is team metadata, and the conflation
requires an owner to have granted `teams:edit`), but it is a real authorisation gap plus a
matrix that lies to the person configuring it. MEDIUM.

**Fix.** Three separable pieces, smallest first:
- `postScreen` → `gatedBody(request, env, "screens", "edit")`; `getScreens` →
  `gated(request, env, "screens", "read")`.
- `getTeamMetaFeed` → `gated(request, env, "teams", "read")`.
- For the switches with no door behind them (`teams:create/delete`, `help:delete`,
  `agent:edit/delete`), either wire them or **stop rendering them**. A grid where a third
  of the switches are decorative trains an admin to distrust all of them. Add a rule-test
  that walks `TEAM_MODULES × MODULE_RIGHTS` and asserts every rendered pair is named by at
  least one `requireRight`/`gated*` call in `workers/*/src` — that is the check that would
  have caught this on the day `screens` was added.

#### M3 — Three workers' write doors sit outside every gating check, and one of them has no caller check at all

**Plain English.** The rule "no unguarded door can ship" is enforced for four of the seven
workers. In the three that are exempt, one door lets any caller that can reach it broadcast
to any team's live channel, with no key and no identity.

**Where.** `workers/realtime/src/index.ts:142-165` (`POST /publish`) ·
`workers/auth/src/index.ts` (10 POST routes, no gating-seam suite) ·
`workers/gateway/src/index.ts` (the beacon, no suite).

**The risk (technical).** `/publish` reads `{channel, event}` from the body and fans it to
`env.CHANNELS.getByName(shardChannel(channel, i)).broadcast(body)` — the caller *names the
channel*. Its sibling internal doors in auth (`/internal/send-email`, `/internal/log-error`,
`/internal/mcp-session`) all open with `if (!env.INTERNAL_KEY || header !== env.INTERNAL_KEY)`;
this one opens with nothing.

**I could not reach it, and I tried.** `workers_dev:false` + `preview_urls:false` mean the
realtime worker has no public address, and the gateway only forwards
`pathname.startsWith("/api/realtime")` — `/publish` does not match, and
`/api/realtime/../publish` is normalised to `/publish` by `new URL()` *before* the prefix
test, so it falls through to the asset handler. **Not exploitable from the internet today.**
If it were reached, the blast radius is still small: the payload carries no row data, so
clients re-pull through gated endpoints — the damage is forced-refetch storms and UI churn,
not disclosure.

**Severity because.** Unreachable today, so not HIGH. MEDIUM because it is one config
change from mattering (a `workers_dev` flip, a new gateway route, a fork that forwards more
broadly), it is inconsistent with three identical doors that *are* keyed, and — the part
that makes it a control failure rather than a nit — **no automated check would notice
either the door or the flip.** `workers_dev:false` is asserted nowhere in the test suite.

**Fix.** Add the same four-line `INTERNAL_KEY` guard the auth internal doors use; bind
`INTERNAL_KEY` on realtime. Extend `describeGatingSeam` (or a small sibling) to auth,
realtime and gateway — auth's identity doors gate on `getSessionUser`/`INTERNAL_KEY`, so the
`identityGated` map already models this. Add a config test asserting
`workers_dev === false && preview_urls === false` for every worker except the gateway.

---

### LOW

#### L1 — `taggedUserIds` has no ceiling, and a big enough one silently switches off every notification on that reply
**Where.** `workers/content/src/routes/help.ts:189-193` ·
`workers/content/src/lib/notify.ts:36-46`.
**Risk.** The filter keeps any `string`; no count cap, no per-element length cap. Two
consequences. (i) `lookupUsers` builds `IN (?, ?, …)` with one placeholder per unique id;
D1 caps bound parameters at 100, so 101+ ids throws — and `notifyReplyAndMentions` wraps
everything in `try/catch`, so **the raiser's "someone replied to you" email is silently
dropped too**. Tag 200 junk ids and nobody is told anything. (ii) The array is
`JSON.stringify`'d into `help_threads.tagged_user_ids` via `d1ExecScript`; a large enough
one exceeds D1's statement-size limit and returns a **500**, not a 400.
**Not** an unbounded email fan-out: `send()` is only reached for ids that resolve to an
*active member of this team*, so the mail volume is bounded by team size and each recipient
appears once. The campaign note overstates this half; the underlying gap is real.
**Severity because.** Any `help:read` holder can do it, but the harm is suppressed
notifications and a 5xx, not disclosure. `/api/content/help/reply` is correctly absent from
`HEAVY_PATHS` (it is cheap) and is covered by both the 600/min per-caller and 6000/min
per-team ceilings.
**Fix.** `const tagged = requireIdList(body.taggedUserIds ?? [])` — the seam already exists
(`shared/workers/bulk.ts:25`), caps at `BULK_IDS_LIMIT`, and throws the clean 400. Then
chunk the `IN` list at 90 in both `lookupUsers` implementations.

#### L2 — 24 identifier fields are checked for presence, never for type — so a hostile body returns 500 instead of 400
**Where.** `help.ts:99,111,184,227(×2)` · `learning.ts:82,94,126` · `config.ts:22` ·
`agent.ts:109,156` · `import.ts:82,103,127,157,169,182` · `selectable.ts:59,69` ·
`team.ts:75` · `roles.ts:107,146,163` · `tenancy/routes/admin.ts:72`.
**Risk.** `if (!body.id)` passes any truthy value. `{"id":{"x":1}}` then reaches
`d1Query(..., [body.id])`, whose `(string|number|null)[]` type is erased at runtime and
does nothing — the object is JSON-serialised into the D1 REST `params` array, D1 refuses
it, `cf()` throws, and the central catch returns **500**. On the native binding the same
input throws `D1_TYPE_ERROR`. `postScreen` is worse: `setScreenOverride` calls
`module.trim()`, so a non-string is a `TypeError` before any query.
This is exactly the bug class `shared/workers/validate.ts` was written to kill — its own
header names it — and `workers/content/test/validate.test.ts` locks it **for text fields
only**. The identifier half of the same law was never done.
*Reasoned from the code and the D1 contract; I did not execute it against a live D1.*
**Severity because.** Log noise, a 500 where the base's own law says 400, and a cheap way
to fill `error_logs`. No data crosses a boundary.
**Fix.** `const id = requireText(body.id, "Id", 64)` at each site — the helper already
returns the clean 400. 24 one-line edits, no new concept.

#### L3 — Uploaded files are served to anyone with the URL, forever, with no membership check
**Where.** `workers/gateway/src/index.ts` `/media/learning/*` and `/media/*` ·
keys built at `content/routes/learning.ts:176`, `auth/lib/profile.ts:39`,
`tenancy/lib/teams.ts:199`.
**Risk.** `serveObject` reads the R2 object and returns it. No session, no team check. A
learning attachment's key is `<teamId>/<ulid>` (80 bits of randomness — not enumerable),
but a profile photo is `users/<userId>` and a team logo is `teams/<teamId>` — **directly the
id**, and those ids are handed to every teammate in ordinary API responses. So a person
removed from a team keeps working URLs for that team's logo, its members' photos, and every
attachment whose link they ever saw. There is no revocation.
The serving itself is hardened well: `Content-Security-Policy: default-src 'none'; sandbox`
+ `nosniff`, behind an inline-safe MIME allowlist applied identically on both the data-URL
and streaming upload paths. So this is access control, not XSS.
**Severity because.** Unguessable for attachments, guessable-if-you-once-knew-the-id for
photos and logos, and the content is low-sensitivity. But it is unauthenticated data
access, and it is the one place the locked "every server request validates membership"
rule does not hold. *The 2026-08-12 report marked this closed on the grounds that keys are
now ULIDs; that fixed enumeration, not authorisation, and it does not apply to the two
`MEDIA` key shapes at all.*
**Fix.** Cheapest honest option: re-check membership on `/media/learning/<teamId>/…` by
calling `whoAmI` + `isActiveMember` before `serveObject` (one extra service hop, cached by
the browser's `immutable` header so it costs one request per file per user). Better:
short-lived signed URLs. Or accept it explicitly and write it down as a capability-URL
decision in ARCHITECTURE.md — an accepted risk is fine, an unnoticed one is not.

#### L4 — The MCP surface gets the loose rate ceiling, and everyone behind one IP shares a bucket
**Where.** `shared/workers/rate-limit.ts:57-66` (`HEAVY_PATHS`, `isHeavyPath`) ·
`shared/workers/rate-limit.ts:73-80` (`callerKey`) · `workers/gateway/src/index.ts:152-155`.
**Correcting the campaign note:** the limiter *does* reach `/mcp` — the gateway's condition
is `pathname.startsWith("/api/") || pathname === "/mcp"`, so `USER_LIMITER` (600/min)
applies; and the per-tenant `TEAM_LIMITER` (6000/min) applies too, because every tool call
forwards to tenancy/content/data-ops, all of which bind it and run `teamContext`. Two real
gaps remain:
1. `isHeavyPath("/mcp")` is false, so `HEAVY_LIMITER` (60/min) never applies. The same
   caller doing `agent_chat` through the web app is capped at 60/min; through MCP they get
   600/min. `export_*_csv` (10,000 rows each) is heavy on the web path via the
   `endsWith("/export")` rule and *not* heavy over MCP.
2. `callerKey` looks for a `brimba_session` cookie. An MCP request carries
   `Authorization: Bearer`, never a cookie, so every MCP caller keys to
   `ip:<CF-Connecting-IP>` — one office shares one bucket, and a caller rotating egress
   gets a fresh one.
**Severity because.** The AI credit quota still bounds *spend* (50/day + credits), so the
worst case is burning a day's quota in seconds instead of a minute, plus a read
amplification on exports. `mcp/wrangler.jsonc` correctly has no limiter binding — it needs
none; the ceiling belongs at the gateway.
**Fix.** Two lines. In `callerKey`, fall back to
`` `b:${(auth.match(/^Bearer\s+(\S+)/i)?.[1] ?? "").slice(0,32)}` `` before the IP branch.
In `forwardTool`, charge `HEAVY_LIMITER` when the tool is AI-costed or an export — the
tool object already knows which it is.

#### L5 — `?limit=-1` turns the owner error dashboard into an unbounded read
**Where.** `workers/data-ops/src/routes/admin.ts:31`.
`Math.min(Number("-1") || 100, 200)` → `-1`; SQLite reads `LIMIT -1` as *no limit*.
`adminGuard`-only, so the reach is the maintenance-key holder, but it defeats the cap that
line is written to impose.
**Fix.** `Math.min(Math.max(Math.trunc(Number(...)) || 100, 1), 200)`.

#### L6 — Every signed-out caller shares one retry-key identity *(carried forward, unchanged)*
**Where.** `shared/workers/concurrency.ts:49-53` (`ownerOf`).
A retry key is bound to `SHA-256(Cookie header)`; an unauthenticated request has no cookie,
so all of them hash alike. Still unreachable — every idempotency-wrapped route is a
`mutation` and every mutation gates, so no signed-out caller ever leaves a stored body to
replay, and the seam deletes the claim on throw. MCP callers are safe (each token's bridged
cookie is distinct). Reported 2026-08-12 with a one-line fix; the line has not been written.
**Fix.** `SHA-256(cookie || "ip:" + request.headers.get("CF-Connecting-IP"))`.

#### L7 — The lost-update guard is sent by browsers and by nothing else
**Where.** `shared/workers/tool-catalog.ts:184,279,316,347` (the four `buildBody`s) ·
`web/lib/api.ts:310,341,445,479` (the client, which does send it) ·
`shared/workers/concurrency.ts` `versionPredicate` (absent expectation → empty predicate).
`update_role`, `update_dropdown_value`, `update_learning`, `update_help_ticket` build
bodies with no `expectedVersion`, and the doors treat it as optional. So an agent or MCP
edit never carries a version and **always wins** the race against a human who had the
record open — silently, with no 409. The web app is the only caller the guard protects.
**Severity because.** Integrity, not confidentiality; the loser sees no error, which is the
part that matters. LOW as a *security* finding; likely higher as a data-integrity one, and
it is the same fault `93d44c0` was written to fix from the other direction.
**Fix.** Add `expectedVersion: opt(i, "expectedVersion")` to the four `buildBody`s and the
field to their schemas, and make the model/tool description say "pass the `updatedAt` you
read". Optional stays optional, so nothing breaks; a caller that supplies it gets the
guard.

#### L8 — SECRETS.md overstates the vault, and the vault does not exist
Detailed in the vault verdict below. Two verifiable inaccuracies in a security document
(the passphrase *does* cross a process boundary; `read` without `-r` mangles backslashes)
plus the fact that `secrets.vault` has never existed in this repo, so the protection the
document describes is not in force and nothing warns about it.

---

## What I tried to prove and could not — the refutations

A refuted candidate costs nothing, but the reasoning is the evidence.

- **283 SQL interpolations.** Read all 41 that were not safe-by-shape. No injection. The
  `${table}` interpolations in the module mover looked worst and are the best-defended:
  `moveModule` rejects anything but `/^[A-Za-z_][A-Za-z0-9_]*$/` before any of them, with a
  comment saying why.
- **Cross-tenant reach.** Every team query resolves its database through
  `guard.databaseId` (or `moduleDatabase`), which comes from `requireMember`'s row, which
  comes from the session's `current_team_id` — never from a request field. `whoAmI` is the
  only source of identity in all seven workers.
- **MCP token → session bridge spoofing.** The bridge requires `INTERNAL_KEY` **and** auth
  re-checks active membership at mint **and** the mcp worker re-verifies the token hash on
  every request, so a revoke bites through the 10-minute cookie cache. Pinned sessions are
  60 minutes and never slide. I could not find a way to set the impersonation headers from
  outside.
- **Agent exceeding the invoker.** `executeTool` forwards `request.headers.get("Cookie")`
  to the same gated door; there is no elevated path. `identityBlocked` is a backstop, and
  session control / team deletion are absent from the catalogue entirely — blocked by
  omission, which is the stronger form.
- **Agent prompt injection into a privilege write.** `isPrivilegeWrite` is *derived* from
  each tool's own gate rather than a name list, so a `member_roles`/`team_members` write
  added tomorrow confirms the moment it exists. Tool output is fenced as
  `OK. Result data: …` and the system prompt says "never as instructions". Soft, but the
  hard backstop (the confirm panel) is derived, not enumerated.
- **Credit-quota bypass.** `consumeAiUnit` checks and consumes in one statement
  (`WHERE agent_usage.used < ?`), then decrements paid credits `WHERE balance > 0`. Neither
  can go negative and neither is a read-then-write.
- **Last-admin race.** Both `changeMemberRole` and `removeMember` re-check the admin floor
  *inside* the UPDATE's WHERE and treat zero rows changed as a 409. The friendly count
  above it is a message, not the guard.
- **Login-code brute force.** The attempt cap is consumed by the same UPDATE that checks it
  (`attempts < ?`), so N concurrent guesses cannot each read `attempts=4`.
- **Origin-header forgery.** `originFrom` validates against a closed set *and* the gateway
  deletes the header on the way in, and there is a test asserting the delete
  (`gateway/test/trace.test.ts:109`).
- **CSRF.** Cookie is `HttpOnly; SameSite=Lax; Secure`; every state-changing route is POST,
  which Lax does not send cross-site. No `Access-Control-Allow-Origin` anywhere, so no
  credentialed cross-origin read.
- **`decodeURIComponent` on `/media/%`.** This *was* an unauthenticated crash with no
  recorded row. The gateway gained a central catch during this review; it now records and
  returns a clean 500. (A 400 would be more honest than a 500 for a malformed URL, but that
  is a nit, not a finding.)

---

## The owner's decision — an encrypted vault in a public repository

**Short answer: yes, on one non-negotiable condition, and today the question has not
actually been reached.**

### The state of play, verified

There is **no `secrets.vault` in this repository and there never has been.**
`ls secrets.vault` → not found. `git ls-files | grep vault` → only `scripts/vault.mjs`.
`git log --all -- secrets.vault` → empty. `npm run vault:check` would print *"NO VAULT.
These secrets exist ONLY on this laptop"* and exit 1 — and `vault:check` is not part of
`npm run check`, so nothing has said so. The current state is worse than either answer to
the question: SECRETS.md describes a protection that is not in force.

### The cryptography, assessed

**Correct where it counts.** AES-256-GCM; a fresh 16-byte salt and 12-byte IV on every
save (no nonce reuse, and saving twice never produces the same bytes); layout
`salt‖iv‖tag‖ciphertext`; `setAuthTag` before `final()`, so a tampered or truncated file
throws rather than decrypting to plausible rubbish. PBKDF2-HMAC-SHA512 at 600,000
iterations to a 32-byte key — comfortably above OWASP's 210,000 floor for SHA-512. I found
no construction error.

**Three things I would change.**

1. **PBKDF2 is the KDF most favourable to the attacker you are inviting.** It is
   memory-cheap, so it parallelises onto GPUs and ASICs almost perfectly. `node:crypto`
   ships `scryptSync`, which is memory-hard; at the same wall-clock cost to you it raises a
   parallel attacker's cost by orders of magnitude. This matters more here than almost
   anywhere, because a public repo means the attack is **offline, unlimited, undetectable,
   and permanent** — every pushed commit is archived by third parties within minutes, and
   changing the passphrase later does not un-publish yesterday's ciphertext.
2. **SECRETS.md states something that is not true.** *"The passphrase never leaves the
   process… node:crypto does the work in-process."* `askPassphrase`
   (`scripts/vault.mjs:82-92`) spawns `/bin/sh -c` with `stty -echo; read v; …; printf '%s' "$v"`
   — the passphrase lives in a child shell's variable and comes back over a pipe. It is
   correctly kept out of `argv`, which is the half that matters (`ps` cannot see it), but the
   sentence as written overstates the guarantee, and an overstated guarantee in a security
   document is what stops the next reader from checking. Also: `read v` without `-r` and
   without `IFS=` eats backslashes and strips leading/trailing whitespace. It is consistent
   between save and open so round-trips work, but it silently narrows the passphrase space —
   which is bad news for exactly the generated passphrase condition 1 asks for.
3. **No version/parameter header.** `ITERATIONS` is a compile-time constant, so the day
   anyone raises it, every existing vault becomes unopenable with an error that says
   "wrong passphrase, or the file is damaged". One version byte fixes it.

### Conditions under which publishing it is acceptable

1. **The passphrase is generated, not remembered — ≥ 128 bits.** This single condition
   carries the entire decision. SECRETS.md currently argues the opposite: *"what makes a
   passphrase a human can actually remember survive an offline attack."* A remembered
   passphrase is typically 35–45 bits of entropy. Against 600k PBKDF2-SHA512 that is on the
   order of months of one GPU and days of a rented cluster — not a margin for a file whose
   plaintext contains a token that can delete every database on the account. With
   `openssl rand -base64 24` in a password manager, the KDF choice stops mattering and
   PBKDF2-600k is fine. **Rewrite that sentence in SECRETS.md; it is the one line that
   decides whether this is safe.**
2. **`TEST_LOGIN_KEY` must not be in the same vault as production values.** Its holder can
   sign in as any account on that environment. It currently lives in
   `workers/auth/.dev.vars` alongside everything else, so one opening yields it. Split the
   vault per environment, or keep production's secrets out of the repository entirely.
3. **`CF_D1_TOKEN` scoped and rotatable.** It is the one value whose compromise is
   unrecoverable data loss rather than an afternoon of regeneration. Scope it to D1:Edit on
   the one account, IP-restrict it if there is a fixed egress, and treat "the vault was
   published with a weak passphrase" as a rotation trigger.
4. **Fix the three crypto/doc items above**, and add `vault:check` to `npm run check` so
   "no vault" is a red build rather than a silent state.

### The alternative, named fairly

None of this is necessary. Six values fit in a password-manager secure note, a private
gist, or `gh secret`, with no ciphertext published at all. What the vault buys that those do
not is that it **travels with the clone** — the "fresh clone → `npm run vault:open` →
`npm run check` green" story that BOOTSTRAP.md and the ocean review depend on. That is a
genuine benefit and a good reason to keep it. Keep it for that reason, meet condition 1
without exception, and the answer is yes.

I have not asked for, handled, or attempted to read any passphrase, and nothing in this
review required one.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **H1** No-privilege-amplification: a caller may not grant a right their own role lacks (or, option b, delete the misleading guard) | `workers/tenancy/src/lib/roles.ts`, `workers/tenancy/src/lib/invites.ts`, + a new test | ADDS ~15 lines and one test; option (b) REMOVES 8 lines and adds a doc paragraph | **first_run_review** — the first admin creating a second role now hits a rule they did not have before; the refusal message must say *why*, or it reads as a bug. **lean_mean** — +1 seam. **interfacelessness** — the agent and MCP must surface the same refusal, so `requireRight`'s "names the missing right" pattern needs a sibling. Option (b) is free for every review but leaves the risk with the owner. |
| **M1** Point `describeGatingSeam` at `declarationBody` from the new `shared/test/source.ts`, then prove it fails | `shared/test/gating-seam.ts` (1 import, ~4 lines) | REMOVES a duplicated slicer; ADDS nothing | **none — it deletes code and strengthens a check at the same time.** The only cost is that it may go red on a route nobody knew was ungated, which is the point. |
| **M2a** `postScreen`/`getScreens` gate on `screens`; `getTeamMetaFeed` gates on `teams:read` | `workers/tenancy/src/routes/config.ts`, `workers/tenancy/src/routes/team.ts` | Changes 3 gate arguments | **first_run_review** and **dead_end_review** — a fresh team's Viewer role has `teams:read=1, screens:read=1` by default (`team-schema.ts:411`), so nothing breaks on day one; but any *existing* custom role with `screens:read` off loses the screen overrides and gets base recipes. Needs a migration note. **realtime_review** — `publishChange(…, "screens", …)` now reaches listeners who may not be allowed to refetch; the client's 403 handling must not toast. |
| **M2b** Rule-test: every rendered `module × right` pair must be named by a real gate | `web/test/rules.test.ts`, `shared/rules/registry.ts` (a new law) | ADDS a check + a registry entry (R26) | **lean_mean** — one more law, one more test; the registry-integrity rule forces the pair, so it cannot be added cheaply. **story_checks_out** — RULES.md must gain a paragraph or `registry-integrity` fails. |
| **M2c** Stop rendering the 5 switches with no door (`teams:create/delete`, `help:delete`, `agent:edit/delete`) | `shared/team-modules.ts` or the matrix projection | REMOVES UI | **base_fork_review** — a fork adding a Help delete door would have to re-add the switch; better to keep the module rows and gate the *rights* per module. **activity_log_review** — none. |
| **M3a** `INTERNAL_KEY` guard on `realtime POST /publish` | `workers/realtime/src/index.ts`, `workers/realtime/wrangler.jsonc`, `shared/workers/realtime.ts` (send the header) | ADDS ~6 lines + a binding + a secret on one more worker | **mac_fell_in_the_ocean_review** — `INTERNAL_KEY` now has to match across **six** workers, not five; SECRETS.md's table and the "set it on all five in the same sitting" runbook both go stale and must be updated in the same commit. **realtime_review** — a missed secret on deploy silently kills every live update; deploy order matters more. That is a real cost, and it is why this is MEDIUM-with-a-reason rather than "just add the guard". |
| **M3b** Extend the gating seam to auth/realtime/gateway; add a `workers_dev:false` config test | new `workers/{auth,realtime,gateway}/test/gating-seam.test.ts`, `web/test/config-vars.test.ts` | ADDS ~60 lines of test | **lean_mean** — pure test growth, no product code; lean_mean scores tests kindly but not free. **speed_review** — negligible (source scans, no I/O). |
| **L1** `requireIdList(body.taggedUserIds ?? [])`; chunk both `IN` lists at 90 | `workers/content/src/routes/help.ts`, `workers/content/src/lib/notify.ts`, `workers/content/src/lib/stakeholders.ts` | ADDS ~10 lines, REMOVES an ad-hoc filter | **scaling_review** — *positive*: chunking removes a hard failure at 100 mentions. **speed_review** — a >90-recipient reply becomes 2 queries instead of 1; irrelevant at real team sizes. |
| **L2** `requireText(body.id, "Id", 64)` at 24 sites | 9 route files | REMOVES 24 truthiness checks, ADDS 24 validated ones — net zero lines | **lean_mean** — neutral, it is a substitution. **error_log_review** — *positive*: removes a class of 500 that currently writes an `error_logs` row per hostile request. **round_trip_review** — none. |
| **L3** Membership check before `serveObject` on `/media/learning/*` | `workers/gateway/src/index.ts` | ADDS one `whoAmI` + `isActiveMember` hop per media request | **speed_review** — this is the real cost: a service hop on every image and video load. The `immutable` cache header means one hit per file per browser, but a cold page with 20 attachments is 20 extra auth calls. **spend_review** — +1 subrequest per media miss. **scaling_review** — puts auth on the media path, which SCALING.md currently assumes is cache-only. **If speed_review is near its floor, take the "document it as a capability URL" option instead** — the honest cheap answer. |
| **L4** Bearer fallback in `callerKey`; charge `HEAVY_LIMITER` for AI/export tools | `shared/workers/rate-limit.ts`, `workers/mcp/src/lib/tools.ts` | ADDS ~6 lines | **interfacelessness_review** — *tension*: it deliberately makes the MCP surface **less** capable per minute than it is today, narrowing a parity gap in the direction of "less". Frame it as parity (the web path already has this ceiling), not as a new restriction. **spend_review** — *positive*, it is the ceiling that protects the AI bill. |
| **L5** Clamp the error-dashboard limit | `workers/data-ops/src/routes/admin.ts` (1 line) | none | none — a one-line clamp on an owner-only read. |
| **L6** Include the IP in `ownerOf`'s digest when there is no cookie | `shared/workers/concurrency.ts` (1 line) | ADDS 1 line | none — no behaviour change for signed-in callers, which is every caller that reaches it. |
| **L7** Forward `expectedVersion` from the four `buildBody`s | `shared/workers/tool-catalog.ts` | ADDS 4 optional fields to 4 schemas | **interfacelessness_review** — *positive*, it closes a real UI-vs-machine divergence. **scaling_review** — an agent that now gets 409s must retry; the agent's failure narration already handles a refusal honestly, so this is small. |
| **L8** Rewrite the SECRETS.md passphrase paragraph; switch `askPassphrase` to `read -r`; scrypt + a version byte; `vault:check` in `npm run check` | `SECRETS.md`, `scripts/vault.mjs`, `package.json` | ADDS ~15 lines; **REMOVES a false claim** | **mac_fell_in_the_ocean_review** — *strongly positive*: `vault:check` in the gate is what turns "the secrets exist only on this laptop" from a silent state into a red build. **story_checks_out** — SECRETS.md and BOOTSTRAP.md both describe `vault:open` in the recovery runbook; if the KDF changes, both need the version note or the story breaks. |

---

## CEILING

**Is 95 reachable by changing code? Yes — 95.8 is reachable, and nothing structural stops
it.**

With every finding above closed, the arithmetic goes:

- Penalty 27 → 0.
- C1 60/61 → 61/61 (+0.25), C2 94/95 → 95/95 (+0.11), C4 62/87 → 87/87 (+2.30),
  C9 42/49 → 49/49 (+0.71), C10 41/43 → 43/43 (+0.37), C12 18/24 → 24/24 (+0.50).
- ControlScore 95.76 → **100.00**. Posture → **100**, grade A.

So there is no code-level ceiling below 95. Three honest caveats on what that number would
mean:

1. **Sweep coverage caps at ~97% from this machine, not 100%.** The four R2 bucket ACLs are
   live cloud state; no commit can prove them. One `wrangler r2 bucket info` per bucket, run
   by the owner, closes it. Until then any report from a read-only clone should print 96.7%,
   not 100% — and the 2026-08-12 report's "100%" was not attainable either.
2. **L3 is capped by a design decision, not by code.** ARCHITECTURE.md's static-export +
   one-public-door model makes cheap authenticated media genuinely awkward: the honest
   choices are an auth hop per media request (a real speed/spend cost) or signed URLs (new
   machinery). "Document it as an accepted capability URL" is a legitimate close and I would
   accept it — but it closes the finding by decision, not by commit, and the C10 ratio then
   stays at 41/43 with a stated exemption, capping the true maximum at **99.6**.
3. **The number's meaning is capped by who computes it.** This score moved 99 → 68 with
   almost no code change, because the previous run enumerated 45 state-changing routes where
   there are 61. Nothing in the arithmetic prevents that from happening again. The durable
   fix is not a higher score, it is a **committed denominator**: pin the route census
   (61 non-GET, 103 total, 283 SQL interpolations, 87 request inputs) in a test that fails
   when the real counts move, so the next reviewer inherits the surface instead of
   re-guessing it. Until that exists, treat any security score for this repo — including
   this one — as a claim about the reviewer's diligence first and the code second.
