# Realtime review — round 3 — Brimba · 2026-08-25
SCORE: 86/100   (round 1: 80 published / 79 corrected · round 2: 81)

Branch `review-campaign` @ `256d21b`. Read-only: nothing in this repo was edited
except this file. Scratch work in `scratchpad/d3-*`.

## DELTA

**No criterion went down.** Two went up, both from repairs made for THIS review's
round-2 findings. One other review's repair landed inside my own seam
(`web/lib/store.ts`, the in-flight de-duplication) and I checked it specifically
for the two races it could have caused — it caused neither. Detail below.

| Criterion | w | R1 (pub) | R1 (corr) | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|---|
| 1 · Every change that matters publishes | 16 | 77 | 77 | 77 | **77** | Flat. The screen-override removal took a published resource AND its listener away together, so the ratio is unchanged (was 17/18 with a publisher, now 16/17). `data_import_batches` is still the one user-facing table with no publisher at all, still costing the whole 20-point item. |
| 2 · Every screen that shows it subscribes | 14 | 89 | 89 | 91 | **91** | Flat, same reason: 14/18 → 13/17 = 31 points either way. |
| 3 · A dropped connection recovers what it missed | 13 | 83 | 83 | 83 | **83** | Flat. The user channel still has no `onReconnect` (`app-shell.tsx:181`); still no `since`/`lastEventId`; still untested. |
| 4 · Deletes and archives propagate too | 12 | 100 | 85 | 100 | **100** | Flat at 100, but now on a second leg. R2 credited the `oneX` *lib* readers; `2718f06` fixed the matching `?id=` *route* readers, which are the live re-pull path. Both halves of the null-means-gone hazard are now closed. |
| 5 · The detail view is live, not just the list | 10 | 87 | 90 | 93 | **93** | Flat. `learning` still has no `deps`, `member_roles`' deps are `my-perms`/`role-perms` — so the article Activity tab and the role Activity tab are still the two deaf panes of twelve. |
| 6 · Local and broadcast agree | 10 | 90 | 90 | 90 | **90** | Flat. `help-detail.tsx:192` still `invalidate("help:"+teamId)` after a reply; still no ordering guard on two rapid `patchRow`s. The new in-flight dedup added no penalty — see below. |
| 7 · The channel is scoped to who should see it | 9 | 97 | 94 | 94 | **94** | Flat. `/publish` (`workers/realtime/src/index.ts:141`) still takes a channel + arbitrary JSON with no `x-internal-key`; isolation still lives in `wrangler.jsonc`, not the handler. |
| 8 · The UI is honest about being live | 8 | 30 | 30 | 30 | **92** | **+62.** The one in-repo cap is gone. `ConnectionStatus` (library v0.16.0) is rendered from the socket's own state in both the desktop sidebar footer and the mobile top bar. R2 predicted 92 in-repo; measured 92 for a reason R2 could not have known — see criterion 8. |
| 9 · Fallback when realtime is unavailable | 5 | 80 | 80 | 80 | **85** | **+5.** Judgement call, worth 0.25 of a point on the total: the reason R2 held this item at 10/30 was "the user cannot tell live is unavailable". They can now. There is still no in-app refresh control and still no poll, so it is 15/30, not 30. |
| 10 · Somebody has tested it with two browsers | 3 | 0 | 0 | 0 | **0** | Flat. `web/e2e/team-flows.spec.ts` is byte-identical: one `page`, zero `newContext`/`newPage`/`browser.`. |

---

## What I was asked to verify

### 1 · The connection dot — VERIFIED, and it is the right shape

`web/node_modules/@swift-struck/ui/registry/primitives/connection-status/connection-status.tsx`
is real (three states, `role="status" aria-live="polite"`, colour on the existing
success/warning/destructive tokens, the word always in the DOM even in `dot`
mode). `web/lib/realtime.ts:41-97` returns it honestly:

- `setState("reconnecting")` at the top of the effect, so a new channel (first
  mount OR a team switch) never inherits the previous socket's `"live"`
- `onclose` splits `navigator.onLine === false ? "offline" : "reconnecting"`,
  re-read on **every** retry — so it settles within one backoff step (≤15s) of
  the network returning, rather than latching at connect time
- `return query ? state : "offline"` — no channel asked for is not "live"

`app-shell.tsx:219-221` builds one `liveDot` and renders it twice: `:267`
(desktop sidebar footer, beside ProfileMenu/ModeToggle) and `:290` (mobile top
bar). A `title` gives the sentence to a mouse; the sr-only label gives it to a
screen reader.

Scoring it: 40/40 for visible, 30/30 for distinguishable — but **22/30** on
"nothing claims live while the socket is closed", for a reason that is specific
and checkable:

> `const link = teamId ? teamLink : userLink` (`app-shell.tsx:212`). There are
> **two** sockets. Inside a team the dot shows only the TEAM one. The USER
> channel carries the forced sign-out, your own profile edits and cross-team
> membership — and it can be closed while the team socket is open, in which case
> the dot is green and four resources are silently not arriving. It is also the
> channel with no reconnect catch-up (criterion 3), so a drop there loses those
> events permanently.

The one-line fix is to show the worse of the two states rather than one of them.

### 2 · The `DEAF_EXEMPT` two-colon hole — FIXED, and I watched it fail

`web/test/rules.test.ts:968` is now `` /`([a-z-]+(?::[a-z-]*)+)`/g `` — one or
more colon-separated segments. Re-ran round 2's sabotage
(`scratchpad/d3-rt-sabotage.mjs`, real file bytes, in-memory substitutions):

```
                                            NEW regex   OLD regex
baseline                                    green       green
delete `total:help-thread:${id}` only       RED   <--    green   <-- the R2 hole
delete BOTH thread keys                     RED         RED
```

The exact sabotage that stayed green in round 2 now goes red. Closed.

**Residual, one level down (MINOR, new).** The comparison is
`liveSrc.includes(key)`, a substring test. `live-resources.ts:237-238` holds
`` `help-thread:${id}` `` and `` `total:help-thread:${id}` `` as separate deps —
and the second contains the first as a substring. So deleting line 237 alone
(the key that refreshes the open **conversation**, which is the bug R2 originally
reported) leaves `includes("help-thread:")` true and the check green. Verified in
the same script. The fix is to extract the keys `live-resources.ts` actually
declares and compare as a set, not with `includes`.

### 3 · The dead live-refetch seam — REMOVED, correctly, and the law now describes the real mechanism

`web/lib/use-live-refetch.ts` and `web/lib/live-bus.ts` no longer exist; `grep`
for `emitLive|useLiveRefetch|live-bus` across `web/` and `shared/` returns
nothing. R15's text in all three places (`RULES.md:33`,
`shared/rules/registry.ts:119`, `CLAUDE.md:24`) now names the cache-key
mechanism — "paged screens stay live by reading the SAME cache keys the shell
patches, not by subscribing" — which is what actually happens
(`use-screen-data.ts` keys off `live-resources`, `LoadMore` appends into the same
key). And `rules.test.ts:988-1001` asserts that mechanism plus the blindness
canary. **This is what I asked for and it removed ~50 lines rather than pinning
them.** The tension I flagged with `lean_mean_review` and `dead_end_review` is
gone.

**But round 2's S2 is still not caught, and should be said plainly.** The paged
half checks *one file* (`use-screen-data.ts` contains `useCached`, imports
`@/lib/live-resources`) plus `pagers.length > 0`. Measured subject list today:

```
web/components/deep-link/module-content.tsx   screenData:yes  liveKeys:yes
web/components/load-more.tsx                  useCached:yes   liveKeys:yes
web/lib/api.ts / live-resources.ts            (matched on the word, not pagers)
web/lib/use-screen-data.ts                    screenData:yes  useCached:yes
```

A NEW paged component holding its rows in local `useState` beside a `<LoadMore>`
would *raise* `pagers.length`, so the canary stays green and nothing looks at the
new file. R2's recommendation was to quantify over the derived pager list and
assert each one's key comes from `live-resources` and is read through
`useCached`; the implementation asserts the one file instead. The law is now
true; its check is a spot-check of the incumbent rather than a quantifier over
new code.

### 4 · Did another review's repair break my criteria? — I checked the three that could have

**a. The screen-override removal (`a6d571e`) — score-neutral, and cleanly done.**
It removed the `screens` publish (`workers/tenancy/src/routes/config.ts:33`), the
`screens` `DEAF_EXEMPT` entry, and the surface a person looked at, all together.
Publish call sites 43 → 42; should-be-live surfaces 18 → 17; reaching a screen
14 → 13. Both ratios round to the same points. This is the correct way to remove
a live resource — I would have flagged it as a new deaf publisher if the entry
had outlived the caller.

*Residual (cross-review, not mine to score):* two exemption maps still name the
dead module — `CATALOG_EXEMPT.screens` (`shared/rules/registry.ts:209`) and
`ACTIVITY_TABLE_EXEMPT.screens` (`:285`). Dead config for a table that no longer
exists. `lean_mean_review` / `dead_end_review` / `base_fork_review` ground.

**b. The round_trip in-flight de-duplication (`256d21b`, `web/lib/store.ts`) —
lands inside my seam, and does NOT break it.** This is the repair I was most
worried about, because de-duplicating fetches on keys that are simultaneously
being row-patched by live pings is exactly how "local and broadcast agree" goes
wrong. Both hazards are handled, and I verified each:

- *A stale in-flight answer landing on top of a live patch.* `sharedFetch`
  (`store.ts:82-102`) claims the key by **identity** — `inflight.get(key) === run`
  — and returns `{value, current}`. `patchRow:255` and `reconcile:293` both
  `inflight.delete(key)`, so any request in flight is no longer current and
  `useCached:322` drops its answer. The patched cache is then delivered by
  `notify` → `sync` (`:346-353`), which re-renders from cache without refetching.
  So dropping the answer never leaves the key unsettled — I traced that
  specifically, because "return early" plus "no refetch" is the shape that
  usually strands a screen on a spinner. It does not: `finally` clears `loading`
  unconditionally (`:332`).
- *One network blip poisoning a key for the session.* The reject arm deletes the
  entry (`:96`).
- *Two callers, one key, different fetchers.* Real here — the team prewarm's
  fetcher does not prime the R16 `total:` sidecars and the screens' fetchers do.
  Handled at `:212` with a `queueMicrotask` so the prewarm always joins the
  richer request rather than replacing it. Correct today, but it is ordering,
  not structure: it depends on React committing child effects before parent
  ones. If that ever shifts, count badges go blank on team entry with nothing
  red. `round_trip_review`'s ground, flagged here because I traced it.

**c. The `?id=` route repair (`2718f06`) — strengthens criterion 4.** R2 raised
this criterion to 100 on the `oneX` lib readers alone; the routes still did
`listX().filter(...)`. Both paths now read one row, which matters because
`patchRow` reads `null` as "this record left the list" and drops it from every
watching client.

---

## Arithmetic

```
DEFECT    criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / 100 )
```

### The measured base numbers

```
publish call sites   42   grep -rnE '\b(publishChange|publishUserChange|publishSignOut)\(' workers shared --include='*.ts'
                          minus tests, imports and the 3 definitions in shared/workers/realtime.ts   (R2: 43)
resources published  members member_roles invites team selectable_data learning help help_threads
                     agent_usage  +  user-channel teams profile account_activity session
                     +  the 3 import target modules (targets.ts)      -- `screens` is gone
listeners            TEAM_RESOURCES{members,member_roles,invites,selectable_data,learning,help}
                     SIMPLE_INVALIDATIONS{team}  +  DEAF_EXEMPT
probe (raw)          scanned 246 files, 35 declared tables, byOp create 5/44 update 11/59 delete 0/5
```

The probe's `byOp` is again a proximity artefact — Brimba writes in
`src/lib/*.ts` and publishes in `src/routes/*.ts`, one caller up — and again it
is not used for scoring. All 5 real SQL `DELETE`s are `sessions` (4) and
`idempotency_keys` (1), both machinery.

### The silent split — 17 should-be-live surfaces (was 18)

| # | surface | reaches a screen? |
|---|---|---|
| 1–12 | `team_members`, `member_roles`, `role_permissions`, `invites`, `invite_logs`, `selectable_data`, `learning`, `help`, team `activity`, `activity`(record: help), `teams`, `users` | YES |
| 13 | `help_threads` — ticket conversation + reply badge | YES |
| 14 | `learning_progress` — Team progress grid | NO |
| 15 | `activity`(record: learning) — article Activity tab | NO |
| 16 | `activity`(record: member_roles) — role Activity tab | NO |
| 17 | `data_import_batches` — import history | NO — **never published at all** |

(`screens` was #13 of the round-2 list and is gone with its subsystem.)

**Correctly silent — machinery nobody watches (17 tables):** `sessions`,
`login_codes`, `idempotency_keys`, `error_logs`, `db_alerts`, `mcp_tokens`,
`agent_threads`, `agent_messages`, `agent_credits`, `agent_usage_log`,
`users_new`, `importable_databases`, `data_import_sessions`,
`team_module_databases`, and the migration/seed-written rows. Unchanged.

### 1 · Every change that matters publishes — 77 × 16 = 1232 · GATE

| pts | earned | why |
|---|---|---|
| 45 | **42** | 16 of 17 should-be-live surfaces have a publish behind the write. 45 × 16/17 = 42.35. |
| 25 | **25** | One shared publisher and it cannot be dodged: every site routes through `shared/workers/realtime.ts`, and a per-worker `publish-seam.test.ts` reads `ROUTES` + handler source off disk. |
| 20 | **0** | `data_import_batches` is user-facing (`import-screen.tsx:434` subscribes `import-batches:${teamId}`), team-scoped, and entirely silent. |
| 10 | **10** | Written down and machine-checked: `DEAF_EXEMPT` reasons verified against `live-resources.ts` (two-colon hole now closed; substring hole remains), `HOUSEKEEPING` deny-lists, CACHING rule 5. |

**Gate: 77 ≥ 40 → total not capped.**

### 2 · Every screen that shows it subscribes — 91 × 14 = 1274

| pts | earned | why |
|---|---|---|
| 40 | **31** | 13 of 17 should-be-live surfaces have a listener. 40 × 13/17 = 30.6. |
| 25 | **25** | Keys match by construction (`use-screen-data.ts` imports the builders from `live-resources` and `useCached` from `store`). |
| 20 | **20** | One hook, one team socket, one user socket; a new module is one registry entry. |
| 15 | **15** | Unsubscribe is real (`store.ts:87-95`, `realtime.ts:86-90`). |

### 3 · A dropped connection recovers what it missed — 83 × 13 = 1079

Base 100. Reconnect with capped backoff **and** catch-up: `app-shell.tsx:160-175`
diff-patches all 6 `TEAM_RESOURCES` lists via `reconcile`, re-primes the R16
totals, no page reload.

| penalty | −pts | why |
|---|---|---|
| medium | −7 | Refetches everything, not the gap. No `since` / `lastEventId`. |
| medium | −7 | The user channel has no catch-up at all — `useUserRealtime` at `:181` is called with two arguments; the team channel at `:120` gets three. A user-channel drop permanently loses profile, membership and forced-sign-out events. |
| minor | −3 | Recovery is untested. |

### 4 · Deletes and archives propagate too — 100 × 12 = 1200

Base 100, no penalties. All 5 SQL `DELETE`s are machinery; removal publishes
`op:"remove"`; the `total:` sidecar is bumped on add/remove
(`app-shell.tsx:137-141`) so a badge does not drift; deactivation counts are
unfiltered so a switch-off does not silently move a total; a vanished record
renders an honest line. Both the lib and the route halves of the single-row read
are now correct, which is what keeps `patchRow`'s null-means-gone branch honest.

### 5 · The detail view is live, not just the list — 93 × 10 = 930

Basis 12 detail panes, held identical to rounds 1 and 2.

| pts | earned | why |
|---|---|---|
| 40 | **33** | 10 of 12 panes update while someone else edits. Deaf: **learning Activity tab** (`TEAM_RESOURCES.learning` has no `deps`), **role Activity tab** (`member_roles.deps` = `my-perms`, `role-perms` only). |
| 30 | **30** | Per-record `patchRow`, not whole-list. |
| 20 | **20** | A live patch cannot overwrite what you are typing (`useFormDraft` local state + `expectedVersion`). |
| 10 | **10** | Two people on one record is thought through (optimistic concurrency on help + learning edits). |

### 6 · Local and broadcast agree — 90 × 10 = 900

Base 100. `applyCreated`/`applyUpdated` both route through `patchRow`, so the
echoed broadcast re-applies the same row idempotently; `sync` re-renders from
cache without refetching; a failed reply rolls its optimistic echo back
(`help-detail.tsx:195`).

| penalty | −pts | why |
|---|---|---|
| medium | −7 | `help-detail.tsx:192` still `invalidate("help:"+teamId)` after posting a reply — the actor refetches the whole paged ticket list while every other client patches one row. Contradicts CACHING rule 3 and LAW R23, and now also contradicts the R21 comment eight lines above it. |
| minor | −3 | No ordering guard: two rapid pings for one row each call `fetchOne` directly (`patchRow` does not go through `sharedFetch`), and nothing sequences the responses. |

### 7 · The channel is scoped to who should see it — 94 × 9 = 846

Base 100. No cross-tenant broadcast; nothing for `security_sentry_review`.
Connect is gated server-side (`isActiveMember` for a team channel,
`userId === user.id` for a user channel). The payload is `{resource,id,op}` with
no row content; the re-pull goes through the permission-checked door.

| penalty | −pts | why |
|---|---|---|
| minor | −3 | One channel per team, not per module — documented trade-off, CACHING §8. |
| minor | −3 | `/publish` (`workers/realtime/src/index.ts:141`) takes a channel name and arbitrary JSON with no `x-internal-key` — the only internal door in the base without one. Unreachable today only because `workers_dev: false` / `preview_urls: false`. The isolation lives in `wrangler.jsonc`, not the handler. |

### 8 · The UI is honest about being live — 92 × 8 = 736  *(was 30)*

| pts | earned | why |
|---|---|---|
| 40 | **40** | Visible in both layouts: desktop sidebar footer (`app-shell.tsx:267`) and mobile top bar (`:290`). |
| 30 | **30** | Three distinct states — green / pulsing amber / red, plus an always-present label and a `title` sentence. A dropped socket is not a quiet team. |
| 30 | **22** | One dot, two sockets. Inside a team it reflects the team channel only; the user channel can be closed while the dot reads "Live". |

### 9 · Fallback when realtime is not available — 85 × 5 = 425  *(was 80)*

| pts | earned | why |
|---|---|---|
| 50 | **50** | The app works fully, degraded, with no socket: cache-first + revalidate-on-mount. |
| 30 | **15** | No poll and no in-app refresh control (grepped: no `RefreshCw`/`RotateCw`/user-facing refresh button anywhere in `web/components`). Half credit because the reason this sat at 10 — the person could not tell live was gone — is now fixed, so reloading is a knowing act. |
| 20 | **20** | Bounded: backoff caps at 15s, `version-watch` throttles to 60s, no `setInterval` polling. |

### 10 · Somebody has tested it with two browsers — 0 × 3 = 0

`web/e2e/` holds one spec. Zero `newContext`, `newPage` or `browser.`. The
probe's `twoBrowserTests` list is 8 false positives — the source-scanning rule
suites, opened and checked.

### Total

```
crit  score  weight  product
 1      77     16     1232
 2      91     14     1274
 3      83     13     1079
 4     100     12     1200
 5      93     10      930
 6      90     10      900
 7      94      9      846
 8      92      8      736
 9      85      5      425
10       0      3        0
              ----   ------
               100     8622

8622 / 100 = 86.22  ->  SCORE 86    (gate not applied: crit 1 = 77 ≥ 40)
```

---

## Findings

### HIGH — `data_import_batches` reaches a real screen and nothing publishes it

`web/components/import-screen.tsx:434` subscribes `import-batches:${teamId}`.
`workers/data-ops/src/routes/import.ts:131,187` publish the imported *module*
(`learning`, `selectable_data`…) but never the batch row. So the import history
list is stale for everyone but the importer until a reload — and on a team where
two admins import in parallel, neither sees the other's run. Unchanged across all
three rounds; it is the entire 20-point item on the gating criterion.

**Fix:** `await publishChange(env.REALTIME, guard.teamId, "data_import_batches", batchId, "add")`
beside the existing publishes, plus a `TEAM_RESOURCES` entry (or a
`SIMPLE_INVALIDATIONS` one — the list is small and coarse invalidation is
enough). Existing channel, no new key scheme: Tier 1.

### MEDIUM — the connection dot shows one of two sockets

`app-shell.tsx:212`, `const link = teamId ? teamLink : userLink`. Detail in
criterion 8 above. **Fix:** `const link = worst(teamLink, userLink)` with
`live < reconnecting < offline`, so a dead identity channel cannot show green.

### MEDIUM — the user channel still has no catch-up

`app-shell.tsx:181`. The team channel got `onReconnect` and the user channel did
not. A drop there silently loses a forced sign-out (the security-relevant one),
your own profile edits and cross-team membership changes — permanently, because
nothing refetches them. **Fix:** pass a third argument that calls
`auth.me()`, `invalidate("account-activity")` and `active.refresh()`.

### MEDIUM — `package.json` and `package-lock.json` disagree about the UI library

Not a realtime defect, but it is the supply line for criterion 8's primitive, so
I traced it. Root `package.json:29` pins `github:alaap-swift-struck/swift-struck-ui`
with **no committish**; `package-lock.json:16` and `:6986` both record it as
`#v0.16.0`. These are source files, so the mismatch is a fact independent of any
install.

`npm ci` refuses to run when a manifest and its lockfile disagree on a spec, so a
clean clone very likely cannot install. I could not confirm that by running it —
the campaign forbids `npm install` — so this is **measured by inspection, not
execution**, and it belongs to `mac_fell_in_the_ocean_review` (clone-to-running)
and `base_fork_review` (does a fresh fork stand up unattended). **Fix:** add
`#v0.16.0` to root `package.json:29` so the two agree.

> **Measurement caveat — `node_modules` was in flux during this run.** At ~20:20
> I read `web/node_modules/@swift-struck/ui` at **0.16.0**, containing
> `registry/primitives/connection-status/connection-status.tsx`; those are the
> bytes criterion 8 is scored against and they are quoted above. By 20:28 that
> tree was gone: `web/node_modules/@swift-struck/` was an empty directory and the
> only installed copy was **0.4.0** at the repo root, with no
> `connection-status` — a state in which `web/lib/realtime.ts`'s import cannot
> resolve and `npm run check` cannot pass. `ps` at 20:29 shows an `npm install`
> running (pid 89656, started 20:29), so this is an install in progress rather
> than a committed defect. **Nothing in this report is scored from
> `node_modules`** — every criterion is scored from repository source. Flagged
> because the campaign's own warning is that a green `tsc` against an empty
> `node_modules` proves nothing: any agent that ran `npm run check` in this
> window should re-run it.
>
> Also visible: `npm run vault:save` (pid 49553) has been running since **15:20**
> — over five hours. Handed to `mac_fell_in_the_ocean_review`, which owns the
> vault.

### MINOR (new) — the `DEAF_EXEMPT` key check compares by substring

`rules.test.ts:969`, `liveSrc.includes(m[1])`. `total:help-thread:` contains
`help-thread:`, so deleting the conversation dep alone leaves the check green.
Same defect class as the one just fixed, one level down. **Fix:** parse the keys
`live-resources.ts` declares into a Set and compare exactly.

### MINOR — R15's paged half is a spot-check, not a quantifier

Detail in section 3 above. A new paged component that bypasses
`use-screen-data.ts` is not looked at, and raising `pagers.length` keeps the
canary green.

### MINOR — two exemption maps still name the removed `screens` module

`shared/rules/registry.ts:209` (`CATALOG_EXEMPT`) and `:285`
(`ACTIVITY_TABLE_EXEMPT`). The `DEAF_EXEMPT` entry *was* correctly removed; these
two were missed. Cross-review: `lean_mean_review`, `dead_end_review`.

### MINOR — no two-browser test exists

Criterion 10, 0/100 across three rounds. One Playwright spec with two
`browser.newContext()` sessions asserting that B sees A's edit — and a second
asserting catch-up after a forced socket close — would settle criteria 3, 4, 5
and 6 empirically instead of by inference from source.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| Publish `data_import_batches` | `workers/data-ops/src/routes/import.ts`, `web/lib/live-resources.ts`, `workers/data-ops/test/publish-seam.test.ts` | +1 publish call, +1 listener entry | **`spend_review` / `scaling_review`:** one more broadcast per import — negligible (imports are rare and already fan out per module). **`lean_mean_review`:** +~8 lines. **Helps `dead_end_review`:** a screen that currently goes stale becomes live. |
| Dot shows the worse of two sockets | `web/components/app-shell.tsx` (~4 lines) | +a `worst()` comparison | none — pure client state already held in memory, no request, no broadcast. |
| User-channel `onReconnect` | `web/components/app-shell.tsx` (~5 lines) | +3 refetches, only after a *dropped* user socket | **`round_trip_review` / `spend_review`:** three extra GETs per user-channel reconnect. Bounded by drops, not by traffic. **`speed_review`:** none — off the critical path. |
| Pin `#v0.16.0` in root `package.json` | `package.json` (1 line) | manifest matches lockfile | none — it makes the state that already exists in the lockfile explicit. Directly helps `mac_fell_in_the_ocean_review` and `base_fork_review`. |
| Exact-set `DEAF_EXEMPT` key compare | `web/test/rules.test.ts` (~6 lines) | +a key-extraction pass over `live-resources.ts` | **`lean_mean_review`:** +6 test lines. **`speed_review`:** none (test-time only). Real tension: the check gets stricter, so a future legitimate rename fails the build until the reason is updated — which is the point. |
| Quantify R15's paged half over the derived pager list | `web/test/rules.test.ts` (~10 lines, replacing 6) | +a loop over `pagers`, −the single-file spot-check | **`lean_mean_review`:** roughly neutral (+4 net lines). Could go red on a legitimate new pager, which is the intended behaviour. |
| Drop `screens` from the two stale exemption maps | `shared/rules/registry.ts` (2 lines) | −2 dead entries | none — the module and its table no longer exist; nothing can reference them. |
| Two-browser Playwright spec | `web/e2e/live-sync.spec.ts` (new, ~60 lines) | +1 test file, +CI time | **`lean_mean_review`:** +60 lines against a leanness score. **`speed_review` (CI):** two browser contexts add real seconds to the suite. Worth it: it is the only criterion here that replaces inference with observation. |
| Remove `invalidate("help:"+teamId)` from the reply path | `web/components/help-detail.tsx` (1 line) + a total bump | −1 full paged-list refetch per reply | **Risk to me:** the ticket's `updated_at`/reply count must then arrive by the ping alone. The ping already fires (`help.ts:200`) and `patchRow` re-reads the row, so it should hold — but this is the one fix here I would want the two-browser test to guard first. Helps `round_trip_review` and `spend_review`. |

---

## CEILING

**95 is reachable by changing code.** Nothing here is capped by a platform limit,
a locked ARCHITECTURE.md decision, or the single-author constraint. Working from
today's 86:

```
crit 1  77 -> 97   publish data_import_batches (the 20-pt item) — Tier 1
crit 2  91 -> 100  +1 listener there, + deps for the two Activity tabs
crit 5  93 -> 100  the same two deps close both deaf panes
crit 8  92 -> 100  worst-of-two-sockets, ~4 lines
crit 10  0 -> 100  one Playwright spec with two contexts
                                                 -> total 96
```

The only criterion with a genuinely hard floor is **3**, at 93: a true
gap-based catch-up (`since`/`lastEventId`) means the Durable Object retaining a
message log, and ARCHITECTURE.md's code-vs-runtime model plus
`scaling_review`'s ground make that a design decision rather than a repair. Its
−7 for "refetches everything rather than the gap" is therefore fair to treat as
permanent, and 93 there still leaves the total above 95.

**Verdict:** a change to `data_import_batches` is invisible to everyone else
until they refresh.
