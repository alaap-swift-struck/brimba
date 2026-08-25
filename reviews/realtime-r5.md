# Realtime review — round 5 — Brimba · 2026-08-26

SCORE: **95**/100   (R1 80 · R2 81 · R3 86 · **R5 95**, +9)

Branch `review-round5` @ `959c80a`. Working tree clean except `timings.json`
(generated, no bearing here). Read-only: nothing in this repo was edited except
this file. I wrote none of the repairs I am scoring.

Gate: criterion 1 = 95 ≥ 40 → the total is **not capped**.

---

## VERDICT CARD

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  95 / 100            band: strong — coverage is no longer the        │
  │  (R3: 86, +9)        weak half of this system                        │
  │                                                                       │
  │  Worst STRICTLY-SILENT table                                          │
  │    a change to `learning_progress` is invisible to everyone else      │
  │    until they refresh.                                                │
  │                                                                       │
  │  Worst MIS-ROUTED broadcast (higher impact, not strictly silent)      │
  │    a change to `invites` is invisible to the one person it is         │
  │    ABOUT — it is broadcast to a channel they cannot join.             │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## SCORECARD

```
 #  criterion                              method    score  w    bar
 1  Every change that matters publishes    coverage    95   16  ███████████████████░
 2  Every screen that shows it subscribes  coverage    96   14  ███████████████████░
 3  Dropped connection recovers the gap    defect      86   13  █████████████████░░░
 4  Deletes and archives propagate         defect     100   12  ████████████████████
 5  The detail view is live, not the list  coverage   100   10  ████████████████████
 6  Local and broadcast agree              defect      97   10  ███████████████████░
 7  The channel is scoped correctly        defect      94    9  ███████████████████░
 8  The UI is honest about being live      coverage    95    8  ███████████████████░
 9  A fallback when realtime is gone       coverage    85    5  █████████████████░░░
10  Somebody tested it with two browsers   coverage   100    3  ████████████████████
                                                           ---
                                            gate NOT applied  100
```

---

## THE ARITHMETIC, IN FULL

```
DEFECT    criterion = clamp(0,100, 100 − Σ penalties)  critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / Σ weights ),  Σ weights = 100
```

### The measured base numbers (every one recomputable)

```
publish call sites           43   grep -rnE '(publishChange|publishUserChange|publishSignOut)\('
                                  workers shared --include='*.ts', minus node_modules, tests,
                                  the 3 definitions, the rule-text string in registry.ts and
                                  the 3 doc-comment mentions in the worker index files
  held by ctx.waitUntil      41   (39 inline + 2 spanning two lines: tenancy/src/lib/teams.ts:172
                                  and tenancy/src/routes/team.ts:139 — both wrapped)
  awaited on the request      2   data-ops/src/lib/tools.ts:272, shared/workers/account-activity.ts:87
  fire-and-forget             0   and the seam now FAILS that shape by name (see criterion 1)
  passing a durable recorder  5   teams.ts ×4, team.ts ×1 — the other 38 record nothing

TEAM_RESOURCES entries        7   members, member_roles, invites, selectable_data, learning,
                                  help, "help:mine"
SIMPLE_INVALIDATIONS          2   team, data_import_batches
DEAF_EXEMPT                   2   help_threads, agent_usage  (both machine-checked)
RECORD_KEY_PREFIXES          12   derived at module load from each resource's own deps —
                                  activity:user: · role-perms: · activity:record:member_roles: ·
                                  invite-audit: · activity:invite: · learning-one: ·
                                  activity:record:learning: · activity:record:help: ·
                                  help-stakeholders: · help-thread: · total:help-thread: · help-one:

client cache keys read       26   enumerated from every useCached/useCachedValue call in web/
  reachable by a ping        23
  NOT reachable               3   learning-progress:<teamId>  ·  invitations  ·  import-targets:<teamId>

probe (raw)                       253 files, 37 declared tables, byOp create 3/48, update 11/59,
                                  delete 0/6, publishedPct 12%
```

**The probe's `byOp` is a proximity artefact and is NOT used for scoring**, for
the same reason as in rounds 1–3 and one new one. Brimba writes in
`src/lib/*.ts` and publishes in `src/routes/*.ts`, one caller up; and this round
moved 41 of 43 publishes into `ctx.waitUntil(...)` at the very end of the
handler, which pushes them *further* from the write than they were. I opened
every silent site in the probe's top-three tables (`help` 5 writes, `sessions` 8,
`data_import_batches` 5) and every silent site in the 40-row `silentSites` list.
Corrected figures are in the split below. All 6 raw SQL `DELETE`s are
`sessions` (4), `idempotency_keys` (1) and `db_sizes` (1) — machinery, all three.

### The should-be-live split — 18 surfaces (R3 counted 17)

A "surface" is a table × screen-scope pair: what a person is actually looking at.
Kept at R3's granularity so the two rounds are comparable, with one surface added
that no previous round counted.

| # | surface | publisher | listener | reaches a screen? |
|---|---|---|---|---|
| 1 | `team_members` — member list + detail | yes | `members:` | YES |
| 2 | `member_roles` — role list + detail | yes | `member_roles:` | YES |
| 3 | `role_permissions` — role access rights | via `member_roles` | `role-perms:<id>` dep | YES |
| 4 | `invites` — the team's invite list | yes | `invites:` | YES |
| 5 | `invite_logs` — invite audit block | via `invites` | `invite-audit:<id>` dep | YES |
| 6 | `selectable_data` — dropdown manager | yes | `selectable:` | YES |
| 7 | `learning` — article list + detail | yes | `learning:` + `learning-one:` dep | YES |
| 8 | `help` — ticket list + detail | yes | `help:` + `help-one:` dep | YES |
| 9 | `activity` — team feed | every ping | `activity:team:` (coalesced 1s) | YES |
| 10 | `activity` — record: help | via `help` deps | `activity:record:help:` | YES |
| 11 | `teams` — switcher / cross-team membership | user channel | `active.refresh()` | YES |
| 12 | `users` — your own profile | user channel | `active.refresh()` | YES |
| 13 | `help_threads` — conversation + reply badge | yes | via `help` deps (DEAF_EXEMPT, checked) | YES |
| 14 | `account_activity` — your own account feed | user channel | `account-activity` | YES |
| 15 | `activity` — record: learning | **NEW this round** | `activity:record:learning:` | **YES (was NO)** |
| 16 | `activity` — record: member_roles | **NEW this round** | `activity:record:member_roles:` | **YES (was NO)** |
| 17 | `data_import_batches` — Past imports | **NEW this round** | `import-batches:` | **YES (was NO)** |
| 18 | `invites` → **the invitee's Invitations inbox** | published to the WRONG channel | none | **NO** |
| — | `learning_progress` — Team progress grid | ping is `learning`, not this key | none | **NO** |

Sixteen of eighteen reach a screen. (R3's #14 `learning_progress` and my new #18
are the two that do not; R3's #15/#16/#17 all closed this round.)

**Correctly silent — machinery nobody watches (18 tables):** `sessions`,
`login_codes`, `email_change_codes`, `idempotency_keys`, `error_logs`,
`db_alerts`, `db_sizes`, `cron_runs`, `mcp_tokens`, `agent_threads`,
`agent_messages`, `agent_credits`, `agent_usage_log`, `users_new`,
`importable_databases` (**and its client key `import-targets:<teamId>`** — a
GLOBAL, owner-maintained catalogue written only by an owner admin door
classified `housekeeping`, with no team channel to publish on),
`data_import_sessions`, `team_module_databases`, and anything written by a
migration or a seed. `agent_usage` is published and correctly DEAF_EXEMPT (the
quota badge rides every chat response).

---

### 1 · Every change that matters publishes — **95** × 16 = 1520 · GATE

| pts | earned | why |
|---|---|---|
| 45 | **40** | 16 of 18 should-be-live surfaces have a broadcast that reaches them. 45 × 16/18 = 40.0. |
| 25 | **25** | One shared publisher, and it can no longer be dodged in the *new* way either. Every site routes through `shared/workers/realtime.ts`; a per-worker `publish-seam.test.ts` reads `ROUTES` + handler source off disk; and the regex now reads the **disposition**, not the call — `/(?:await\s+|ctx\.waitUntil\(\s*)publish(?:Change\|UserChange\|SignOut)\s*\(/` — with `barePublishes()` naming any unheld call. A fire-and-forget publish is cancelled when the isolate finishes, and the old check called that a pass. |
| 20 | **20** | **No user-facing table is entirely silent any more.** `data_import_batches` — 0/20 in all three previous rounds — publishes at `workers/data-ops/src/routes/import.ts:206`. Every remaining defect is a *routing* defect (the broadcast exists but does not reach the key or the channel), and those are scored by the 45-point item and by criterion 2. Counting them here as well would be double-scoring. |
| 10 | **10** | Written down AND machine-checked in both directions — see criterion 2. `DEAF_EXEMPT` reasons are checked against `live-resources.ts`; the housekeeping deny-list is asserted to match the route table exactly, in both directions, with a ≥30-character reason per entry. |

**Gate: 95 ≥ 40 → total not capped.**

> **Sensitivity, stated so it can be argued with.** The 20-point item is the
> single biggest mover in this report (0 → 20 = +3.2 on the total). A reader who
> holds that a *mis-routed* broadcast is the same defect as *no* broadcast would
> score it 0 and land the total at **92**. I score it 20 because the rubric's
> condition is literal — "no user-facing table is **entirely silent**" — and at
> HEAD no user-facing table is: `learning_progress`'s write publishes a `learning`
> ping (`workers/content/src/routes/learning.ts:150`), and `invites` publishes on
> every create and revoke. Both readings are defensible; both numbers are printed.

### 2 · Every screen that shows it subscribes — **96** × 14 = 1344

| pts | earned | why |
|---|---|---|
| 40 | **36** | 16 of 18 surfaces have a listener. 40 × 16/18 = 35.6 → 36. Deaf: `learning-progress:<teamId>` and `invitations`. |
| 25 | **25** | Keys match by construction — `use-screen-data.ts` imports the builders from `live-resources` and `useCached` from `store`; the shell patches the same key the screen reads. |
| 20 | **20** | One hook, one team socket, one user socket. A new module is one registry entry. |
| 15 | **15** | Unsubscribe is real: `store.ts:222-230` deletes the subscriber AND the empty set (so *that* map cannot grow either); `realtime.ts:88-92` closes the socket and clears the retry timer on unmount. |

**R15 now runs BOTH ways, and it closes what I scored.** `web/test/rules/live.test.ts`
has three checks where round 3 had one and a half:

- *no deaf publishers* — the publisher set is DERIVED by scanning `publishChange` /
  `publishUserChange` call sites plus `targets.ts` modules plus the resource names
  inside the helpers themselves, with comments stripped (a commented-out publish
  would otherwise vouch for code that does not run) and a `> 5` tripwire against a
  blind scan.
- *no dead listeners* — the direction that did not exist. `data_import_batches` sat
  registered, subscribed by a real screen and pinged by nothing **for months**, with
  a comment in `live-resources.ts` politely explaining that nothing published it.
  The comment was true, the check was green, the feature did not work. The one shape
  allowed without a publisher of its own — a second server SCOPE of a published
  resource, i.e. `help:mine` — is **derived**, not written down: the scope's key must
  appear in the published resource's own `deps`.
- *every list fetcher is a registry entry* — because that map is what the reconnect
  catch-up walks. This is what caught `helpMine`.

That is a real closure of the R1–R3 finding, not a restatement of it. The two
surfaces still deaf are outside R15's reach by construction, and that is the
residual worth naming: **R15 governs the registry, not every `useCached` key.**
`learning-progress:` and `invitations` are plain cache keys with no registry
entry, so both directions of the law are satisfied while both screens are stale.

### 3 · A dropped connection recovers what it missed — **86** × 13 = 1118

Base 100. Reconnect with capped backoff (1s→15s) and a genuine catch-up:
`app-shell.tsx:223-243` diff-patches all 7 `TEAM_RESOURCES` lists through
`reconcile`, re-primes the R16 totals as the fetchers run, invalidates the 12
derived record-scoped prefixes, the team activity feed and `my-perms`, and
refreshes the active-team context. No page reload.

| penalty | −pts | why |
|---|---|---|
| medium | −7 | Refetches everything loaded, not the gap. No `since` / `lastEventId`; the Durable Object retains no message log. **Unchanged from R3, and structurally permanent** — see CEILING. |
| medium | −7 | **NEW, and nobody has looked for it.** The catch-up walks `TEAM_RESOURCES` and the deps-derived record prefixes. It does **not** walk `SIMPLE_INVALIDATIONS`. So `team-meta:<teamId>` and `import-batches:<teamId>` — two *registered live listeners* — are left stale by a reconnect, for ever, under a dot that has gone back to "Live". Rename the team or run an import while someone's socket is down and their Team screen and Past-imports list never learn. Worse: `web/test/reconnect-catchup.test.tsx:160-168` **pins the stale behaviour as correct**, under the title "leaves unrelated caches alone" — they are not unrelated, they are the other half of the listener registry. This is the exact class of defect round 5 fixed for `help:mine` and missed one map over. |

R3's two other penalties are **gone, verified**:

- *the user channel has no catch-up* (−7) — `app-shell.tsx:276-288` now passes a
  third argument: `auth.me()` (so a missed forced sign-out still bounces),
  `invalidate("account-activity")`, `active.refresh()`.
- *recovery is untested* (−3) — it is now tested twice.
  `web/test/reconnect-catchup.test.tsx` renders the **real `AppShell`**, captures the
  `onReconnect` the component hands `useRealtime`, and calls it — asserting on
  `invalidatePrefix` directly would have proved the store works and said nothing
  about whether anyone calls it, which was the entire bug. Five cases, including
  "drops an OFF-SCREEN record without re-pulling it" (the invalidate-don't-refetch
  choice) and a quantifier over every record-scoped dep any resource declares, with
  a `> 4` blindness tripwire. Plus e2e Case B below.

### 4 · Deletes and archives propagate too — **100** × 12 = 1200

Base 100, no penalties. Deactivate-never-delete: all 6 raw SQL `DELETE`s are
machinery. Removal publishes `op:"remove"`; `patchRow` reads a `null` single-row
answer as "this record left the list" and drops it from every watching client
(`store.ts:354-355`); both the lib and route halves of the single-row read pass
the same server filter, which is what keeps that branch honest. The `total:`
sidecar is bumped ±1 on add/remove so a badge cannot drift between full reads
(`app-shell.tsx:201-205`). A vanished record renders an honest line rather than a
blank or a crash — "That ticket no longer exists." (`help-detail.tsx:219`),
"That article doesn't exist." (`learning-detail.tsx:182`), "That role doesn't
exist." (`role-detail.tsx:150`) — and each distinguishes `undefined` (still
asking) from `null` (the door's answer), so a deep link does not flash "gone"
while its own read is open.

### 5 · The detail view is live, not just the list — **100** × 10 = 1000

Basis 12 detail panes, held identical to rounds 1–3.

| pts | earned | why |
|---|---|---|
| 40 | **40** | 12 of 12 panes update while someone else edits. R3's two deaf panes both closed: `learning.deps` now carries `learning-one:` **and** `activity:record:learning:`; `member_roles.deps` now carries `activity:record:member_roles:` beside `my-perms`/`role-perms`. Locked by `web/test/live-deps.test.ts`, which names all four explicitly ("the generic check above would go green again the moment someone deleted them") and separately proves every dep names a key something **reads** — with comments stripped from the corpus and the `deps` arrays cut out of `live-resources.ts` first, so neither a comment nor a declaration can vouch for itself. |
| 30 | **30** | Per-record `patchRow`, never a whole-list refetch. |
| 20 | **20** | A live patch cannot overwrite what you are typing: `useFormDraft` local state across all 7 form dialogs, plus `expectedVersion` optimistic concurrency on help + learning. |
| 10 | **10** | Two people on one record is thought through — the version guard, and the deep-link record pass on reconnect. |

### 6 · Local and broadcast agree — **97** × 10 = 970

Base 100. `applyCreated` / `applyUpdated` both route through `patchRow`, so the
echoed broadcast re-applies the same row idempotently by id; `sync` re-renders
from cache without refetching (`store.ts:453-463`), which is what makes a
row-level patch stick instead of being clobbered by the subscriber's own GET; a
failed reply rolls its optimistic echo back (`help-detail.tsx:206`).

| penalty | −pts | why |
|---|---|---|
| minor | −3 | No ordering guard. Two rapid pings for one row each call `fetchOne` directly — `patchRow` deliberately does not go through `sharedFetch` — and nothing sequences the responses. Unchanged from R3. |

R3's medium (−7) is **gone, verified**: `invalidate("help:"+teamId)` after posting
a reply no longer exists. `help-detail.tsx:198-204` now says so in terms — the
reply door publishes a `help` ping carrying the ticket id, so the list row is
patched by live-sync exactly as it is for everyone else, and only the single-row
key is re-read on a deep link. That was the one place in the app where the person
who did the work paid more than everyone watching.

**`ctx.waitUntil` costs nothing here, and I checked the three ways it could.**
The ping now leaves after the response, so ordering changes: (a) *the actor's own
screen* is unaffected — R21/R23 hand back the affected row and `applyUpdated`
folds it in from the response, before the ping exists; (b) *other clients* see one
extra round-trip of latency and nothing else, because the payload is
`{resource,id,op}` with no row data and the client re-pulls through the gated
door, so a ping that arrives out of order still resolves to the latest row; (c)
*two rapid writes* can now publish out of order, which lands on the minor already
counted above rather than adding a new one — and the ±1 total bump is
commutative, so badges do not drift either. The one real cost is elsewhere: a
publish failure is now noticed by nobody, because nobody is waiting. See "not on
any rubric" below.

### 7 · The channel is scoped to who should see it — **94** × 9 = 846

Base 100. No cross-tenant broadcast; nothing for `security_sentry_review`. Connect
is gated server-side — `isActiveMember(env.DB, user.id, teamId)` for a team
channel, `userId !== user.id → 403` for an identity channel
(`workers/realtime/src/index.ts:183-207`) — and the shard a socket lands on is
decided from the **session's** user id, never from a parameter. The payload
carries no row content.

| penalty | −pts | why |
|---|---|---|
| minor | −3 | One channel per team, not per module — documented trade-off, CACHING §8. |
| minor | −3 | `/publish` (`workers/realtime/src/index.ts:139`) still takes a channel name and arbitrary JSON with **no `x-internal-key`** — the only internal door in the base without one. Unreachable today only because `workers_dev: false` / `preview_urls: false` in both environments and no gateway route forwards it. The isolation lives in `wrangler.jsonc`, not in the handler. Unchanged across four rounds. |

### 8 · The UI is honest about being live — **95** × 8 = 760

**The claimed library cap does not exist and has not existed since v0.16.0.**
`reviews/LEDGER.md:776` says four reviews are capped by `@swift-struck/ui`,
realtime among them. Measured at HEAD: `web/package.json:15` pins
`github:alaap-swift-struck/swift-struck-ui#v0.16.0`; `package-lock.json:3396`
resolves to `364eea79…`, which R3's own drill identified as `refs/tags/v0.16.0^{}`
(R3's postscript recorded it resolving to v0.4.0 — that is fixed); the installed
tree is 0.16.0 and carries
`registry/primitives/connection-status/connection-status.tsx`; and `ConnectionStatus`
is imported and rendered by `app-shell.tsx:14, 320`. Nothing here is waiting on
the library.

| pts | earned | why |
|---|---|---|
| 40 | **40** | Visible in both layouts — desktop sidebar footer (`app-shell.tsx:366`) and mobile top bar (`:389`), one `liveDot` rendered twice. |
| 30 | **30** | Three distinct states: green `bg-success`, pulsing amber `bg-warning motion-safe:animate-pulse`, red `bg-destructive`, with `role="status" aria-live="polite"`, the word always in the DOM even in dot mode, and a `title` sentence for a mouse. A dropped socket is not a quiet team. |
| 30 | **25** | **The worst-of-two fix is real and correct** — `app-shell.tsx:305-311` builds a `SEVERITY` map, pushes only the channels actually *opened* (so a teamless person's healthy identity socket is not held down by an unopened team one) and reduces to the worst. R3's 22/30 is closed. What is left is one level deeper and I could not find it addressed anywhere: **there is no heartbeat.** No `setWebSocketAutoResponse`, no `WebSocketRequestResponsePair`, no application-level ping/pong, no staleness timer — grepped across `workers/realtime/src` and `web/lib/realtime.ts`. A socket silently dropped by a NAT or a proxy without a FIN leaves `readyState === OPEN`, `onclose` never fires, and the dot stays green while nothing arrives. That is precisely this item's failure — "nothing claims live while the socket is closed" — for the one kind of closed the client cannot see. −5. |

### 9 · There is a fallback when realtime is not available — **85** × 5 = 425

| pts | earned | why |
|---|---|---|
| 50 | **50** | The app works fully, degraded, with no socket: cache-first + revalidate-on-mount, with a 5s freshness window deliberately kept short so the cache never becomes the freshness mechanism (`store.ts:42-51`). |
| 30 | **15** | Still no poll and still no in-app refresh control — grepped `RefreshCw`/`RotateCw`/"Refresh" across `web/components` and `web/lib`: zero. Half credit, unchanged from R3 and for R3's reason: the person can now *tell* live is gone, so reloading is a knowing act rather than a guess. |
| 20 | **20** | Bounded: backoff caps at 15s, `version-watch` throttles to 60s on `visibilitychange`, and there is not a single `setInterval` in `web/`. |

### 10 · Somebody has tested it with two browsers — **100** × 3 = 300

| pts | earned | why |
|---|---|---|
| 60 | **60** | `web/e2e/live-sync.spec.ts` opens two independent `browser.newContext()` sessions on the same record and asserts B sees A's rename with no interaction — with a `window.__E2E_NO_RELOAD__` sentinel proving it arrived through the socket rather than a reload. |
| 40 | **40** | Case B is reconnect-and-catch-up, and it is built to refuse a false green: it severs B two ways (`ctx.setOffline(true)` **and** closing every spied socket), asserts the app's own indicator **leaves** `data-state="live"`, asserts B still shows the OLD title while down, then asserts convergence after reconnect *and* that the socket count increased — "a reconnect nobody counted is indistinguishable from never having dropped". |

Three things I checked rather than assumed, because a spec that cannot run is not
evidence:

- **Every selector resolves to real shipped DOM.** `[role="status"][data-state]`
  exists on the library primitive; `#learning-title`, "New article", "Create
  article", "Save changes" exist in `learning-form-dialog.tsx` /
  `module-content.tsx`; `#first-name` / `#last-name` exist in
  `web/app/onboarding/page.tsx`; `POST /api/auth/admin/test-login` exists at
  `workers/auth/src/index.ts:58` behind its own `TEST_LOGIN_KEY`. The spec is
  runnable against this codebase.
- **The one-mint trap is handled**, and the spec explains why: minting through the
  page *and* the admin door on one address returns `429 too_soon` from
  `mintLoginCode`'s 60-second cooldown, every time, and swapping the order does not
  help because the card only reveals its inputs after its own send succeeds.
  Somebody hit that and wrote it down; you do not learn it by reading.
- **The claim it "ran green against staging" is not recorded anywhere in this
  repo.** No CI job, no run log, no line in `reviews/LEDGER.md`, and
  `web/e2e/README.md` does not mention this spec at all. I did not run it (it needs
  a staging secret and Playwright is deliberately not installed). I award the
  rubric's two published items from source — that is what the table asks for — and
  flag the evidence gap rather than inventing a third deduction the rubric does not
  have.

The spec's opening claim is also **true and worth keeping**:
`workers/realtime/test/realtime.test.ts` said the Durable Object "is exercised
live by the staging smoke", and the smoke only `GET`s `/api/realtime/health`,
which proves the worker is up and nothing else.

### Total

```
crit  score  weight  product
 1      95     16     1520
 2      96     14     1344
 3      86     13     1118
 4     100     12     1200
 5     100     10     1000
 6      97     10      970
 7      94      9      846
 8      95      8      760
 9      85      5      425
10     100      3      300
              ----   ------
               100     9483

9483 / 100 = 94.83  ->  SCORE 95     (gate not applied: crit 1 = 95 ≥ 40)
```

---

## THE PUBLISH / SUBSCRIBE MAP

```
  TABLE / RESOURCE                 →  SCREEN
  ─────────────────────────────────────────────────────────────────────────
  team_members ───────────────────────► members list · member detail · Activity
  member_roles ───────────────────────► role list · role detail · Permissions
  role_permissions ───────────────────► role detail Permissions tab
  invites ────────────────────────────► invite list · invite detail · audit
  selectable_data ────────────────────► dropdown manager
  learning ───────────────────────────► article list · article detail · Activity
  help ───────────────────────────────► ticket list · My tickets · detail · Activity
  help_threads ───────────────────────► conversation · reply badge
  activity (team) ────────────────────► team feed          (coalesced 1s)
  teams / users / account_activity ───► switcher · profile · account feed  [user channel]
  data_import_batches ────────────────► Past imports        ◄── NEW this round
  activity (record: learning) ────────► article Activity    ◄── NEW this round
  activity (record: member_roles) ────► role Activity       ◄── NEW this round

  learning_progress ──────── × ────────  Team progress grid      NO LINE OUT
  invites (to the invitee) ─ × ────────  Invitations inbox       WRONG CHANNEL
  ─────────────────────────────────────────────────────────────────────────
  16 of 18 surfaces have a line. The two without are the report.
```

## THE LIFECYCLE BARS

```
  create   ████████████████████  publishes   (all 4 create doors: add + row id)
  update   ████████████████████  publishes   (edit / status / bulk / deactivate)
  delete   ████████████████████  n/a — deactivate-never-delete; all 6 raw SQL
                                 DELETEs are sessions / idempotency_keys / db_sizes,
                                 and removal from a collection publishes op:"remove"
```

## THE RECONNECT STRIP

```
  connected ──► dropped ──► reconnecting ──► reconnected ──► caught up
     ✓            ✓          ✓ backoff 1→15s    ✓ new socket      ~ PARTIAL
                             ✓ dot leaves live  ✓ dot returns

  caught up covers:  7 TEAM_RESOURCES lists (diff-patched, totals re-primed)
                     12 record-scoped prefixes (deps-derived, invalidate-not-refetch)
                     activity:team · my-perms · active context
                     user channel: auth.me · account-activity · active context

  NOT caught up:     team-meta:<teamId>        ◄── the missing step
                     import-batches:<teamId>   ◄── and a test says this is correct
                     the gap itself (no since / lastEventId — full re-read)
```

---

## FINDINGS, RANKED BY WHAT THEY COST

| # | sev | finding | criterion | total pts |
|---|---|---|---|---|
| 1 | MEDIUM | Reconnect skips `SIMPLE_INVALIDATIONS`, and a test pins it | 3 | **0.91** |
| 2 | MEDIUM | No gap-based catch-up (`since` / `lastEventId`) | 3 | **0.91** |
| 3 | HIGH | The Invitations inbox is deaf — published to a channel the invitee cannot join | 1, 2 | **0.68** |
| 4 | MINOR | No in-app refresh control or poll | 9 | **0.75** |
| 5 | MEDIUM | The Team progress grid is deaf (`learning-progress:`) | 1, 2 | **0.68** |
| 6 | MINOR | No WebSocket heartbeat — a silently-dead socket reads "Live" | 8 | **0.40** |
| 7 | MINOR | `/publish` has no `x-internal-key` | 7 | **0.27** |
| 8 | MINOR | One channel per team, not per module (documented trade-off) | 7 | **0.27** |
| 9 | MINOR | No ordering guard on two rapid `patchRow` re-pulls | 6 | **0.30** |

Total recoverable: **5.17 points**.

### 1 · MEDIUM — a reconnect leaves two registered listeners stale, and a test says that is correct

`web/components/app-shell.tsx:223-243` reconciles `Object.values(TEAM_RESOURCES)`
and invalidates `RECORD_KEY_PREFIXES`, `activity:team:`, `my-perms:`. The listener
registry has **two** maps. `SIMPLE_INVALIDATIONS` — `team-meta:<teamId>` and
`import-batches:<teamId>` — is never walked. `team-meta:` is a separate read from
`/api/tenancy/team-meta` and is *not* covered by `active.refresh()`.

What a person meets: their laptop sleeps on the Team settings screen; a colleague
renames the team; they wake, the dot goes back to "Live", and the name on screen
is wrong until they navigate away. Same for Past imports after a colleague's
import.

`web/test/reconnect-catchup.test.tsx:160-168` asserts both keys **survive** a
reconnect, under the title "leaves unrelated caches alone". They are not
unrelated — they are the other half of the registry the same law governs.

**Fix (Tier 1, ~3 lines).** In the team `onReconnect`, beside the reconcile loop:

```ts
for (const keys of Object.values(SIMPLE_INVALIDATIONS))
  for (const k of keys(teamId)) invalidate(k)
```

and flip the test to assert they are dropped, seeding an unregistered key
(`some-other:team-1`) as the real "unrelated" control.

### 2 · MEDIUM — no gap-based catch-up

Unchanged since round 1. A reconnect re-reads every loaded collection rather than
the delta. Correct, and expensive on a big team. A true gap catch-up means the
Durable Object retaining a message log, which is an ARCHITECTURE.md
code-vs-runtime decision and a `scaling_review` cost, not a repair. **Tier 3.**

### 3 · HIGH — being invited to a team never reaches the person invited

`workers/tenancy/src/routes/invites.ts:47` publishes
`publishChange(env.REALTIME, guard.teamId, "invites", inviteId, "add")` — the
**inviting team's** channel. The invitee is not a member of that team, and
`isActiveMember` refuses the connection, so they are not on it and cannot be. Their
own `user:<userId>` channel — which exists, and which they *are* on, teamless or
not — is told nothing. `web/components/invitations.tsx:33` reads a plain
`useCached("invitations", …)` with no registry entry.

So: someone invites you while your Invitations screen is open and it stays empty.
Someone revokes an invitation you are looking at and it stays there. The accept
path is fine (`primeCache("invitations", res.invitations)` on the actor's own
device), which is exactly why nobody noticed.

Both directions of R15 are green over this, because `invites` publishes *and* has
a listener — the law governs the registry, and `invitations` is not in it.

**Fix (Tier 2 — a new resource tag on an existing channel).** After
`createInvite` / `revokeInvite`, when the invited email resolves to an existing
user id, `publishUserChange(env.REALTIME, invitedUserId, "invitations", inviteId, op)`,
plus a listener branch in the shell's user-channel handler:
`invalidate("invitations")`. Volume: one extra ping per invite, to one person —
negligible, but price it with `scaling_review` because it is a new resource name.

### 4 · MINOR — no in-app refresh control

15 of 30 on criterion 9, and the cheapest 0.75 points in this report: one button
beside the connection dot calling the mounted screens' `refresh()`. It also
resolves finding 6 for the person who notices.

### 5 · MEDIUM — the Team progress grid is deaf

`web/components/learning-progress.tsx:29` reads `learning-progress:${teamId}`.
`setLearningDone` writes `learning_progress` and the route publishes
`publishChange(…, "learning", id, "edit")` (`routes/learning.ts:150`), which
patches the *article* row and invalidates `learning-one:` and
`activity:record:learning:` — never `learning-progress:`. A curator watching the
grid while their team works through an article sees nothing move.

**Fix (Tier 1, 1 line).** Add `` `learning-progress:${t}` `` to `learning.deps`.
It already receives the ping; the dep is the only missing wire. Note this makes
every article edit also drop the progress grid — acceptable (it is one small
read, and `invalidate` on an unmounted key is a no-op), and cheaper than a second
resource tag.

### 6 · MINOR — no heartbeat, so a silently-dead socket reads "Live"

Detail in criterion 8. **Fix (Tier 2).** Either `this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"))`
in `TeamChannel` plus a client-side ping every ~30s that flips the state to
`reconnecting` after two missed pongs, or a client-only watchdog that force-closes
a socket that has received nothing for N minutes and lets the existing backoff
reconnect. The first is honest; the second is 8 lines. Volume: one tiny frame per
socket per 30s — this is `scaling_review`'s number to sign off, and the
auto-response form is handled by the runtime without waking the object.

### 7 · MINOR — `/publish` has no `x-internal-key`

Unchanged for four rounds. `workers/realtime/src/index.ts:139`. Every other
internal door in the base carries one. The isolation is `workers_dev: false` in
a config file, not a check in the handler. **Fix (Tier 1, ~4 lines):** the same
`INTERNAL_KEY` header check the other workers use, set as a secret on realtime and
sent by `shared/workers/realtime.ts`'s single `publish()` — one send site, so this
is genuinely a four-line change.

### 8 · MINOR — one channel per team, not per module

Documented trade-off (CACHING §8). Every member of a team receives every module's
pings and drops the ones they do not listen to. Correct today; it is the first
thing to split if a team gets loud. `scaling_review`'s ground to price.

### 9 · MINOR — no ordering guard on two rapid re-pulls

`patchRow` (`store.ts:341`) calls `fetchOne()` directly, deliberately outside
`sharedFetch`, and nothing sequences two in-flight single-row reads for the same
id. The later *response* wins regardless of which *request* was newer. In practice
both return the latest row, so the window is narrow — but `ctx.waitUntil` widened
it, because two writes can now publish out of order. **Fix (Tier 2):** stamp each
`patchRow` for a key+id with a monotonic sequence and drop a response whose stamp
is not the newest, mirroring `sharedFetch`'s identity check.

---

## DELTA — and whether the cause was code or measurement

| crit | R3 | **R5** | Δ | cause |
|---|---|---|---|---|
| 1 | 77 | **95** | +18 | **Code changed** (+20): `data_import_batches` gained its publisher, so the 20-point item flips 0→20 after three rounds at zero. **Measurement was incomplete** (−2): I counted an 18th should-be-live surface nobody had counted — the invitee's Invitations inbox — which moves the 45-point item 42→40. |
| 2 | 91 | **96** | +5 | **Code changed.** Listener coverage 13/17 → 16/18: the two Activity-tab `deps`, the `data_import_batches` listener, and `help:mine` promoted from a dep to a registry entry. R15 running both ways is what makes it stay true. |
| 3 | 83 | **86** | +3 | **Both.** Code changed: user-channel catch-up (+7) and recovery is now genuinely tested (+3). Measurement was incomplete: a −7 nobody had looked for — `SIMPLE_INVALIDATIONS` is not caught up, and a test pins that. |
| 4 | 100 | **100** | 0 | Flat. |
| 5 | 93 | **100** | +7 | **Code changed.** Both deaf panes closed by `deps`, and `live-deps.test.ts` names all four keys so the generic check cannot go green on their deletion. |
| 6 | 90 | **97** | +7 | **Code changed.** The reply path no longer refetches the whole paged list; the R21 row is folded in instead. `ctx.waitUntil` added no penalty — I traced all three ways it could have. |
| 7 | 94 | **94** | 0 | Flat. Both minors verified still true at HEAD. |
| 8 | 92 | **95** | +3 | **Both.** Code changed: worst-of-two sockets closes R3's 22/30 (+8). Measurement went one level deeper: no heartbeat, so a silently-dead socket reads "Live" (−5). |
| 9 | 85 | **85** | 0 | Flat. No refresh control, no poll. |
| 10 | 0 | **100** | +100 | **Code changed.** `web/e2e/live-sync.spec.ts` exists, covers both rubric items, and every selector resolves to shipped DOM. |

**The LEDGER's library-cap claim is wrong and should be struck.**
`reviews/LEDGER.md:776` lists realtime among four reviews "capped by
`@swift-struck/ui`". `ConnectionStatus` shipped in v0.16.0; the manifest pins it,
the lockfile resolves it, the installed tree has it, and the shell renders it
twice. R3's own criterion 8 (92) had already overtaken that line; nothing in this
review is waiting on the library.

---

## FIX IMPACT MAP

| Fix | Files | Adds / removes | Which OTHER review could this damage |
|---|---|---|---|
| Reconnect walks `SIMPLE_INVALIDATIONS` | `web/components/app-shell.tsx` (~3), `web/test/reconnect-catchup.test.tsx` (~6) | +2 invalidations per *dropped* socket | **`round_trip` / `spend`:** two extra GETs per reconnect, and only for a screen that is mounted — `invalidate` on an unmounted key is a no-op. Bounded by drops, not traffic. **`scaling`:** none, client-side. **`story`:** the test's title and CACHING.md's reconnect paragraph must move in the same commit or the doc now describes the old behaviour. |
| Publish `invitations` on the user channel | `workers/tenancy/src/routes/invites.ts` (~6), `web/components/app-shell.tsx` (~2), `web/lib/live-resources.ts` or `DEAF_EXEMPT` (~3), `workers/tenancy/test/publish-seam.test.ts` | +1 ping per invite create/revoke, to one person | **`scaling` / `spend`:** a NEW resource tag — must be priced there, though the volume is one ping per invite. **`security_sentry`:** the ping must carry the invite id and nothing else; the invitee re-pulls through the gated door, so no team data crosses. **`first_run`:** helps — a brand-new user watching for an invite now sees it arrive. **`lean_mean`:** +~11 lines. Also needs the email→userId lookup to fail closed when the invitee has no account yet. |
| `learning-progress:` into `learning.deps` | `web/lib/live-resources.ts` (1), `web/test/live-deps.test.ts` (0 — generic check covers it) | +1 invalidation per article ping | **`round_trip` / `speed`:** one extra small read per article edit, **only** where the progress grid is mounted. **`scaling`:** the progress read is `articles × members` under a hard cap — if that grid is ever paged, revisit. Nothing else. |
| An in-app refresh control | `web/components/app-shell.tsx` (~10) | +1 button, +N `refresh()` calls when pressed | **`round_trip` / `spend`:** user-initiated only, so bounded by intent. **`lean_mean`:** +10 lines. **`first_run`:** helps. **`dead_end`:** helps — it is the manual way out when live is unavailable. Real tension: a refresh button can become an excuse not to fix liveness. |
| `x-internal-key` on `/publish` | `workers/realtime/src/index.ts` (~4), `shared/workers/realtime.ts` (~2), one secret per env | +1 header check per publish | **`ocean` / `platform_setup`:** a NEW SECRET to provision — it must join `SECRETS.md`, `BOOTSTRAP.md` and the deploy runbook in the **same commit**, or a fresh environment deploys a realtime worker that refuses every ping and the live layer is silently dead. That is the whole risk, and it is bigger than the 0.27 points. **`speed`:** none. |
| A WebSocket heartbeat | `workers/realtime/src/index.ts` (~3), `web/lib/realtime.ts` (~15) | +1 frame per socket per interval | **`scaling` — price this there first.** At 25,000 concurrent sockets a 30s client ping is ~830 frames/s across the fleet; `setWebSocketAutoResponse` is answered by the runtime **without waking a hibernated object**, which is the only version that does not undo the hibernation saving. A hand-rolled ping/pong through `webSocketMessage` wakes every object on every interval and would be a straight regression for `scaling` and `spend`. **`speed`:** none. |
| Sequence `patchRow` re-pulls | `web/lib/store.ts` (~8) | +1 Map of sequence stamps | **`lean_mean`:** +8 lines in the file three other reviews already added to. **`round_trip`:** neutral — it drops answers, never adds requests. Real tension: this is the fourth mechanism in one file for "is my answer still wanted" (`inflight` identity, `Answer.current`, `evictable`); a fifth argues for one explicit generation counter rather than another special case. |
| A gap-based catch-up (`since`) | `workers/realtime/src/index.ts`, `shared/workers/realtime.ts`, `web/lib/realtime.ts` + a DO message log | replaces N list reads with 1 delta read | **Tier 3 — do not schedule from this review.** It puts state in the Durable Object, which ARCHITECTURE.md's code-vs-runtime model addresses directly, and it is a `scaling_review` cost (retention, memory per object, replay bounds). Buys 0.91 points. |

---

## CEILING

**Reachable maximum is 99.** Working from today's 95:

```
crit 1   95 -> 100   +0.80   publish `invitations`; `learning-progress:` into deps
crit 2   96 -> 100   +0.56   the same two wires
crit 3   86 ->  93   +0.91   walk SIMPLE_INVALIDATIONS on reconnect  (Tier 1)
crit 6   97 -> 100   +0.30   sequence the re-pulls
crit 7   94 -> 100   +0.54   x-internal-key + accept the per-team channel as final
crit 8   95 -> 100   +0.40   a heartbeat
crit 9   85 -> 100   +0.75   a refresh control
                     -----
                     +4.26   ->  99.09  ->  99
```

The only genuinely hard floor is **criterion 3 at 93**: the −7 for "refetches
everything rather than the gap" needs a Durable Object message log, which
ARCHITECTURE.md's locked code-vs-runtime model and `scaling_review`'s ground make
a design decision rather than a repair. 99 is the ceiling while that stands, and
95 is already above the owner's benchmark.

Everything in the +4.26 is client-side or a four-line worker change. Two of the
seven items (`SIMPLE_INVALIDATIONS`, `learning-progress:`) are Tier 1 and together
worth 1.5 points for four lines.

---

## THINGS NO RUBRIC ASKED ABOUT

Round 5's brief says its best findings came from agents reading the surrounding
code on the way past. Five, none of which is scored above.

**1 · The durable failure channel is wired at 5 of 43 publish sites — and
`ctx.waitUntil` is what makes that matter.** `publish()`
(`shared/workers/realtime.ts:131-164`) now reads `callService`'s answer and records
a refusal, which is a real fix: a 500 from the realtime worker is an *answer*, so
it never reached `callService`'s catch and produced **no line anywhere**, ever, in
the store that exists to hold exactly this. But `recordOutbound(record, …)` with
`record` undefined writes nothing, and only 5 sites pass a `publishRecorder(env)`
— all five in tenancy. The other 38 still degrade to a console line that
Cloudflare keeps about a week. The file's own comment admits this and then
under-counts it ("FIVE of those 42", "36 of the 42 hand this to `ctx.waitUntil`",
"~53 publish call sites" — measured at HEAD: **43** sites, **41** on `waitUntil`,
**5** recording). Before this round the write in front of the ping was still on
the wire and a human was still watching; now the ping settles after the response
and nobody is watching at all. A wedged live layer is the one fault class that
generates no bug report, because a stale screen looks exactly like a quiet one.
`error_log_review`'s ground to score; flagged here because realtime is what breaks.

**2 · The agent/MCP import path publishes outside the seam's field of view.**
`runImportBatchTool` (`workers/data-ops/src/lib/tools.ts:272`) does
`for (const m of modules) await publishChange(env.REALTIME, guard.teamId, m)`.
The publish-seam scans `<srcDir>/routes` plus functions named in
`indirectPublishers`, and data-ops declares `indirectPublishers: []` — and
`runImportBatchTool` is not exported anyway, so it is unreachable by that scanner.
Its publishes are correct **today**; nothing would go red if they were deleted.
This is the same shape as every other finding in this campaign — the external
machine surface sitting outside the check that governs the door beside it.
Cross-reference `interfacelessness_review`.

**3 · It is also the one publish still on the request path, in a loop.** Same
line: N sequential awaited publishes before the tool returns, where the two
neighbouring HTTP import doors (`import.ts:135, 192, 206`) all use
`ctx.waitUntil`. An agent-driven import across three modules pays three serial
realtime hops the Import screen does not. `speed_review` / `round_trip_review`.

**4 · `web/e2e/README.md` does not know `live-sync.spec.ts` exists.** The spec's
header says "see e2e/README.md to run it"; the README documents only
`team-flows.spec.ts`, and its run instructions say `export ADMIN_KEY=…` while both
specs read `process.env.TEST_LOGIN_KEY`. The most valuable test in this review is
undiscoverable from the document it points at, and the one instruction a reader
would follow is the wrong variable name. `story_checks_out_review` /
`mac_fell_in_the_ocean_review`.

**5 · Two carried residuals worth re-stating because they are unchanged and
correct as findings.** (a) `web/test/rules/live.test.ts:103` still compares
DEAF_EXEMPT's named keys with `liveSrc.includes(m[1])`, a substring test —
`total:help-thread:` contains `help-thread:`, so deleting the conversation dep
alone still leaves it green. Harmless today because both keys are real deps; the
check is one deletion away from lying again, and the fix is to parse the keys
`live-resources.ts` declares into a Set. (b) `activityTimer`
(`app-shell.tsx:44`) is module-level and never cleared on unmount, so a pending
refresh can fire ~1s after the shell is gone. `invalidate` on an unsubscribed key
is a no-op, so it is harmless — until the day two shells can coexist, which is
exactly the condition its own comment relies on.

---

**Verdict:** a change to `learning_progress` is invisible to everyone else until
they refresh — and a change to `invites` is invisible to the one person it is
about, because it is broadcast to a channel they are not allowed to join.
