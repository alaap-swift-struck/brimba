# Realtime review — round 2 — Brimba · 2026-08-25
SCORE: 81/100   (round 1: 80/100 as published · 79 on a corrected basis, see below)

## DELTA

Round 1: 80/100 → Round 2: **81/100**

**No criterion went down.** Two went up, and one of those was lifted by somebody
else's fix, not mine. But I found two errors in my own round-1 arithmetic and one
defect I read straight past, so the honest like-for-like movement is **79 → 81**.

| Criterion | R1 (published) | R1 (corrected) | R2 | Why it moved |
|---|---|---|---|---|
| 1 · Every change that matters publishes | 77 | 77 | **77** | Unchanged. 43 publish call sites, same as round 1; no new publisher, no new deaf resource. `data_import_batches` is still the one user-facing table with no publisher at all, still costing the whole 20-point item. |
| 2 · Every screen that shows it subscribes | 89 | 89 | **91** | +2. The help conversation got its listener: 14 of 18 should-be-live surfaces now reach a screen, was 13. |
| 3 · A dropped connection recovers what it missed | 83 | 83 | **83** | Unchanged — `web/lib/realtime.ts`, `web/lib/store.ts` and `web/components/app-shell.tsx` are byte-identical to round 1. The user channel still has no `onReconnect`. |
| 4 · Deletes and archives propagate too | 100 | **85** | **100** | +15 against the corrected baseline. **Lifted by scaling/speed's repair, not mine.** All five `one*` readers used to read the whole capped list and `.find()` — past 1,000 rows they returned `null`, `patchRow` reads `null` as "this record left the list", and a live edit therefore **deleted a live record off every teammate's screen**. I scored this 100 in round 1 having read `patchRow`'s null semantics and not checked what `fetchOne` returns. That was a −15 I missed. |
| 5 · The detail view is live, not just the list | 87 | **90** | **93** | +3 from the fix (help Conversation pane now live: 10 of 12 detail panes, was 9), +3 from correcting a round-1 slip — I wrote "6 of 9" over a list that named 9 live and 3 deaf, which is 9/12. |
| 6 · Local and broadcast agree | 90 | 90 | **90** | Unchanged. `help-detail.tsx:192` still calls `invalidate("help:"+teamId)` after a reply; still no ordering guard on `patchRow`. |
| 7 · The channel is scoped to who should see it | 97 | **94** | **94** | −3 against round 1, **not** caused by any repair: I found in round 2 that realtime's `/publish` door is isolated by `workers_dev: false` in wrangler rather than by the `x-internal-key` every other internal door in the base uses. Rubric minor: "scoping correct but not obvious from the code". My round-1 97 was three points generous. |
| 8 · The UI is honest about being live | 30 | 30 | **30** | Unchanged. `useLiveChannel` still returns `void`. |
| 9 · Fallback when realtime is unavailable | 80 | 80 | **80** | Unchanged. |
| 10 · Somebody has tested it with two browsers | 0 | 0 | **0** | Unchanged. `web/e2e/` is untouched; still one `page`, still zero `newContext`. |

**Corrected round-1 total** (same rules, applied retroactively so the movement is
real and not an artefact of me changing denominators):

```
77×16 + 89×14 + 83×13 + 85×12 + 90×10 + 90×10 + 94×9 + 30×8 + 80×5 + 0×3
= 1232 + 1246 + 1079 + 1020 + 900 + 900 + 846 + 240 + 400 + 0 = 7863  ->  79
```

---

## What I was asked to verify, and what I found

### 1. The help conversation is live — YES, and it is the right fix

`web/lib/live-resources.ts:232-239`. The `help` resource's `deps` now read:

```
activity:record:help:${id}, help-stakeholders:${id}, help-mine:${t},
help-thread:${id}, total:help-thread:${id}
```

`workers/content/src/routes/help.ts:199-200` publishes `help_threads` **and**
`help` on every reply, unconditionally, and both the agent and the MCP tool
`add_help_reply` route through that same door (`shared/workers/tool-catalog.ts:361`)
— so there is no reply path that pings the thread without pinging the parent. The
conversation and the reply-count badge both refresh on every surface. My round-1
CRITICAL is closed.

No flicker was introduced. `useCached`'s miss path (`web/lib/store.ts:265`) calls
`load()` without clearing `data`, so an invalidated thread keeps rendering its
current replies while the refetch is in flight.

### 2. The false `DEAF_EXEMPT` reason is gone — but the check that replaced it backs only HALF of the new one

The reason now reads: *"a reply also pings the parent help row (op edit), and that
resource's deps now include `` `help-thread:` `` and `` `total:help-thread:` `` — so the
open conversation and its count both refresh"*. That is true.

`web/test/rules.test.ts:886-895` machine-checks it: every backticked cache key in a
`DEAF_EXEMPT` reason must appear in `stripComments(live-resources.ts)`. Stripping
comments is right and deliberate — line 226 of `live-resources.ts` is a comment
containing the literal `` `help-thread:` ``, which would otherwise have satisfied the
check on its own.

**But I ran the extraction and it only picks up one of the two keys.** The regex is
`` /`([a-z-]+:[a-z-]*)`/g `` — one colon only. Measured:

```
DEAF_EXEMPT reason keys extracted:  ["help-thread:"]
                        NOT extracted: total:help-thread:   (two colons)

baseline unbacked                                        -> []          green
sabotage: delete BOTH dep keys from live-resources.ts    -> ["help-thread:"]   RED   (caught)
sabotage: delete ONLY `total:help-thread:${id}`          -> []          GREEN (missed)
```

So the "and its count both refresh" half of the reason is unbacked. Delete the
badge key and the stale-count bug I reported in round 1 comes straight back with a
green build. The parser's failure mode is **silent** — a key it cannot express is
simply not checked, rather than being flagged as unparseable. That is the exact
pattern this check was written to end, reproduced inside it.

### 3. R15's paged half — the check can now fail, but it is enforcing the wrong thing, and it now mandates dead code

I sabotage-tested all six assertions (script:
`scratchpad/rt-sabotage.mjs`, run against real file content with targeted
substitutions):

| sabotage | caught? |
|---|---|
| S2 · a NEW paged component holding rows in local `useState` + `<LoadMore>` | **NO** |
| S3 · `use-screen-data.ts` stops reading through `useCached` | yes |
| S4 · delete `web/lib/use-live-refetch.ts` (zero call sites) | **yes — and that is the problem** |
| S5 · remove the `emitLive` ping fan-out from the shell (zero listeners) | **yes — and that is the problem** |

**Verdict: the seam should have been removed. The check should not have been
pointed at it.**

Three of the six assertions read `use-live-refetch.ts` and the `emitLive` calls.
`useLiveRefetch` still has **zero call sites** — the only files naming it are its
own definition, one comment in `app-shell.tsx:124`, and this test. `emitLive`
iterates an empty `Set` on every ping and once per reconnect. R15 now *requires*
about 50 lines of code that nothing consumes: deleting them turns a Law red. That
is a new tension the repair created with `lean_mean_review` and `dead_end_review`,
both of which will independently flag the same dead export and now cannot remove
it without editing a law check.

Meanwhile the law's actual claim is unenforced. R15's text — identical in
`RULES.md:33`, `shared/rules/registry.ts:121` and `CLAUDE.md:24` — still says *"Every
paged screen consumes the live channel (`useLiveRefetch` re-pulls its CURRENT page
on its module's ping…)"*. Zero paged screens consume it, and the check no longer
looks. `registry-integrity` (`web/test/rules.test.ts:52-75`) checks law **ids and
ranges only**, never law text, so nothing catches the drift. This is the same
defect class as the false `DEAF_EXEMPT` reason — prose describing a mechanism that
does not exist — fixed in one function and left in place fifteen lines below it.

**Credit where it is due:** the blindness canary is the right lesson learned. Line
928, `expect(pagers.length).toBeGreaterThan(0)`, means the check announces itself if
the subject list ever empties. Every source-scanning check in this repo should have
one. And the *observation* the new comment makes is correct: what actually keeps a
paged screen live here is the cache key, not a subscription — `loadMore` appends
into the same key the shell patches (`live-resources.ts:99`), so a page-two row is
patched exactly like a page-one row.

**What it should have been.** Delete `use-live-refetch.ts` and `live-bus.ts` and
both `emitLive` calls; rewrite R15's text in all three places to describe the cache
key; and replace the check with the coverage assertion the law actually claims —
enumerate the paging surfaces (`componentFiles()` matching `LoadMore|nextCursor`,
already computed on line 924 and then only counted) and assert each one's list key
comes from `@/lib/live-resources` and is read through `useCached`. That is a real
quantifier over a derived subject list, it catches S2, and it removes 50 lines
instead of pinning them.

---

## Arithmetic

```
DEFECT    criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / 100 )
```

### The silent split, re-derived

43 publish call sites (`publishChange|publishUserChange|publishSignOut` across
`workers/` + `shared/`, excluding tests and imports) — **unchanged from round 1**.
Published resource strings: `members`, `member_roles`, `invites`, `team`, `screens`,
`selectable_data`, `learning`, `help`, `help_threads`, `agent_usage`, plus the
user-channel `teams` / `profile` / `account_activity` / `session`, plus the three
import target modules (`targets.ts:99,114,144` → all already listed). No new
resource, no new deaf publisher.

**Should be live — a person is looking at it (18 surfaces):**

| # | surface | reaches a screen? |
|---|---|---|
| 1–13 | `team_members`, `member_roles`, `role_permissions`, `invites`, `invite_logs`, `selectable_data`, `learning`, `help`, team `activity`, `activity` (record: help), `teams`, `users`, `screens` | YES (13, unchanged) |
| 14 | **`help_threads`** — ticket conversation + reply badge | **YES — new this round** |
| 15 | `learning_progress` — Team progress grid | NO |
| 16 | `activity` (record: learning) — article Activity tab | NO |
| 17 | `activity` (record: member_roles) — role Activity tab | NO |
| 18 | `data_import_batches` — import history | NO — never published at all |

**14 of 18 reach a screen** (was 13).

**Correctly silent — machinery nobody watches (17 tables):** unchanged from round 1.

The probe's own `mutations.byOp` again read create 5/44, update 11/59, delete 0/5.
Again a proximity artefact — Brimba writes in `src/lib/*.ts` and publishes in
`src/routes/*.ts`, one caller up — and again I did not use it. All 5 real SQL
`DELETE`s are `sessions` (4) and `idempotency_keys` (1).

### 1 · Every change that matters publishes — 77 × 16 = 1232 · GATE

| pts | earned | why |
|---|---|---|
| 45 | **42** | 17 of 18 should-be-live surfaces have a publish behind the write (45 × 17/18 = 42.5). Only `data_import_batches` has no publisher. |
| 25 | **25** | One shared publisher, undodgeable: all 43 sites go through `shared/workers/realtime.ts`, and a per-worker `publish-seam.test.ts` reads `ROUTES` + handler source off disk. Re-tested adversarially this round (below) — 0 false greens. |
| 20 | **0** | `data_import_batches` is user-facing, team-scoped and entirely silent. |
| 10 | **10** | Written down, and now partly machine-checked: `DEAF_EXEMPT` reasons are verified against `live-resources.ts` (with the two-colon hole above), `HOUSEKEEPING` deny-lists per worker, CACHING rule 5. |

**Gate: 77 ≥ 40 → total not capped.**

**I re-ran the R1 seam sabotage and my own first probe was wrong.** My brace matcher
stopped on the `{` inside the return-type annotation `Promise<{ teamId: string }>`,
which reported `createTeam` as a false green. Corrected matcher (skip `<…>` depth
after the parameter list) over all three mutating workers:

```
false-green (slice sees a publish the function does not):  0
comment-only publish inside a true body:                   0
worst over-read past a closing brace:  12,183 chars  (data-ops/lib/agent.ts: runChat)
```

Still 0 exploits, so no penalty — but see the finding below: the R1 seam was the one
check the repair pass did **not** migrate to the new `shared/test/source.ts`.

### 2 · Every screen that shows it subscribes — 91 × 14 = 1274

| pts | earned | why |
|---|---|---|
| 40 | **31** | 14 of 18 should-be-live surfaces have a listener (40 × 14/18 = 31.1). The 4 deaf ones are rows 15–18. |
| 25 | **25** | Keys match by construction; `use-screen-data.ts:17-18` imports both the key builders from `live-resources` and `useCached` from `store`. No drift found. |
| 20 | **20** | One hook, one team socket, one user socket. Adding a module is one registry entry. |
| 15 | **15** | Unsubscribe is real (`store.ts:87-95`, `realtime.ts:68-72`). |

### 3 · A dropped connection recovers what it missed — 83 × 13 = 1079

Base 100. Reconnect with capped backoff **and** catch-up (`reconcile` diff-patches
all 6 `TEAM_RESOURCES` lists, re-primes R16 totals, no page reload).

| penalty | −pts | why |
|---|---|---|
| medium | −7 | Refetches everything, not the gap. No `since` / `lastEventId`. |
| medium | −7 | The user channel has no catch-up at all (`app-shell.tsx:181` passes no `onReconnect`; `:162` passes a full one). A user-channel drop loses profile changes, membership changes and a forced sign-out. |
| minor | −3 | Recovery is untested. |

### 4 · Deletes and archives propagate too — 100 × 12 = 1200

Base 100, no penalties **today**. The defect I missed in round 1 is fixed:

- `oneLearning`, `oneMember`, `oneRole`, `oneInvite`, `oneSelectable` now each read
  **one row** (`learning.ts:216`, `members.ts:194,213`, `invites.ts:122`,
  `selectable.ts:62`). They used to read the `LIST_HARD_CAP = 1000` list and
  `.find()`, returning `null` past the cap.
- That mattered because `patchRow` (`store.ts:169-171`) reads `null` as "gone" and
  filters the row out. So on a team with more than 1,000 learning items or dropdown
  values, editing row 1,001 fired a ping that **removed a live record from every
  other person's screen**. `SCALING.md` names a 24,000-row catalogue as the failure
  that earned the cap, so the threshold was reachable.
- Everything I checked in round 1 still holds: all 5 SQL `DELETE`s are machinery,
  removal publishes `op:"remove"`, the counts behind deactivation are unfiltered so
  a deactivate does not silently move a total, and a vanished record renders an
  honest line rather than stale content.

### 5 · The detail view is live, not just the list — 93 × 10 = 930

Basis (kept identical to round 1 so the movement is real): 12 detail panes.

| pts | earned | why |
|---|---|---|
| 40 | **33** | 10 of 12 panes update while someone else edits (40 × 10/12 = 33.3). Live: member Overview + Activity, invite Overview + audit, role Permissions, help **Conversation** + Overview + Activity + Stakeholders, learning Overview. Deaf: **learning Activity tab**, **role Activity tab**. |
| 30 | **30** | Per-record, not whole-list. |
| 20 | **20** | A live patch cannot overwrite what you are typing (`useFormDraft` local state + `expectedVersion`). |
| 10 | **10** | Two people on one record is thought through (optimistic concurrency on help and learning edits). |

### 6 · Local and broadcast agree — 90 × 10 = 900

Base 100. `applyCreated`/`applyUpdated` both route through `patchRow`, so the
echoed broadcast re-applies the same row idempotently. `useCached`'s `sync`
re-renders from cache without refetching when the key is present. A failed reply
rolls its optimistic echo back.

| penalty | −pts | why |
|---|---|---|
| medium | −7 | `help-detail.tsx:192` still calls `invalidate("help:"+teamId)` after posting a reply — the actor refetches the whole paged ticket list while every other client patches one row. Unchanged from round 1; contradicts CACHING rule 3 and LAW R23. |
| minor | −3 | No ordering guard: two rapid pings for one row both call `fetchOne` and nothing sequences the responses. |

Observation, not a penalty: with the new `help-thread:` dep, a reply now costs the
actor a thread refetch *on top of* the `primeCache` swap the R21 comment describes.
Both converge on server truth and neither doubles, so no flicker and no double-apply
— but the R21 comment at `:187` ("rather than re-pulling the whole thread to add one
message") is now contradicted by the ping the same action fires.

### 7 · The channel is scoped to who should see it — 94 × 9 = 846

Base 100. No cross-tenant broadcast, nothing for `security_sentry_review`. Connect
is gated server-side after the try/catch refactor: `isActiveMember` for a team
channel, `userId === user.id` for a user channel (`workers/realtime/src/index.ts:178,
192`). The payload is `{resource,id,op}` with no row content; the re-pull goes
through the permission-checked door.

| penalty | −pts | why |
|---|---|---|
| minor | −3 | One channel per team, not per module — documented trade-off, CACHING §8. |
| minor | −3 | **New in round 2, present in round 1.** Realtime's `/publish` door (`index.ts:141`) takes a channel name and an arbitrary JSON body with **no** `x-internal-key` — the only internal door in the base without one. It is unreachable today because `workers_dev: false` and `preview_urls: false` in both prod and staging. The isolation lives in `wrangler.jsonc`, not in the handler: rubric minor, "scoping correct but not obvious from the code". |

### 8 · The UI is honest about being live — 30 × 8 = 240

| pts | earned | why |
|---|---|---|
| 40 | **0** | Connection state is never shown. `useLiveChannel` tracks `everConnected`, `retry`, `closed` and returns `void` (`web/lib/realtime.ts:19-74`), unchanged this round. |
| 30 | **0** | A dropped socket is indistinguishable from a quiet team. |
| 30 | **30** | Nothing claims "live" in words while the socket is closed. |

### 9 · Fallback when realtime is not available — 80 × 5 = 400

| pts | earned | why |
|---|---|---|
| 50 | **50** | The app works fully, degraded, with no socket: cache-first + revalidate-on-mount + `refresh()`. |
| 30 | **10** | No poll and no refresh affordance offered *because* live is unavailable — the user cannot tell that it is. |
| 20 | **20** | Bounded: backoff caps at 15s, `version-watch` throttles to 60s, no `setInterval` polling anywhere. |

### 10 · Somebody has tested it with two browsers — 0 × 3 = 0

`web/e2e/` is byte-identical to round 1. One `page`, zero `newContext` / `newPage`.
The probe's `twoBrowserTests` list (`shared/test/source.ts`, `web/test/*.test.ts`) is
false positives — I opened them.

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
 8      30      8      240
 9      80      5      400
10       0      3        0
              ----   ------
               100     8101

8101 / 100 = 81.01  ->  SCORE 81    (gate not applied: crit 1 = 77 ≥ 40)
```

---

## Findings

### HIGH (regression caused by a repair) — R15 now mandates dead code, and its law text describes a mechanism with zero consumers

`web/test/rules.test.ts:898-930` · `web/lib/use-live-refetch.ts` · `web/lib/live-bus.ts` ·
`RULES.md:33` · `shared/rules/registry.ts:121` · `CLAUDE.md:24`

The paged half of `live-collections` was rewritten because I reported it could never
fail. It can fail now — but three of its six assertions require the existence of
`use-live-refetch.ts` and the two `emitLive` calls, and `useLiveRefetch` has **zero
call sites**. Proven by sabotage: deleting the file (S4) or removing the ping
fan-out (S5) both turn R15 red. `emitLive` iterates an empty `Set` on every ping and
once per reconnect, and that is now load-bearing on a Law.

Separately, the law's own text in three documents still names `useLiveRefetch` as the
mechanism *"every paged screen consumes"*. None do, and the check no longer looks.
`registry-integrity` verifies law ids and ranges, never law text, so nothing catches
it. This is the same false-mechanism-in-prose defect that was fixed in the
`DEAF_EXEMPT` block fifteen lines above.

And the law's quantifier is unenforced: a new paged screen holding its rows in local
`useState` with a `<LoadMore>` passes every assertion (S2, measured).

**Fix:** delete `use-live-refetch.ts`, `live-bus.ts` and both `emitLive` calls;
rewrite R15's text in `RULES.md`, `shared/rules/registry.ts` and `CLAUDE.md` to
describe the cache-key mechanism; replace the six assertions with a real coverage
check over the `pagers` list the code already computes on line 924 — for each
component matching `LoadMore|nextCursor`, assert its list key comes from
`@/lib/live-resources` and is read through `useCached`. Land all of it in one commit
or `registry-integrity` and `live-collections` will disagree.

### MEDIUM — the `DEAF_EXEMPT` backing check silently drops any key with more than one colon

`web/test/rules.test.ts:889-895`

`/`([a-z-]+:[a-z-]*)`/g` cannot express `total:help-thread:`, so it extracts one of
the reason's two keys and never reports that it skipped the other. Measured:
removing `` `total:help-thread:${id}` `` alone from `live-resources.ts:238` leaves the
check green, and the stale reply-count badge returns. A key the parser cannot read
should be a failure, not a silent skip.

**Fix:** widen to `` /`([a-z-]+(?::[a-z-]*)+)`/g ``, and add a second assertion that
every backtick-delimited token in a reason was successfully parsed — so an
unparseable key fails loudly rather than passing invisibly.

### MEDIUM — the R1 publish-seam was the one check left on the old, blind source reader

`workers/{content,tenancy,data-ops}/test/publish-seam.test.ts:18-29`

The repair pass created `shared/test/source.ts` because eight checks were reading
source incorrectly, and migrated those eight. Three identical copies of
`indexFunctions` were not migrated, and they gate criterion 1 — the heaviest
criterion in this review and the Law that everything else depends on. They still:

- slice from one `export async function` to the next, folding every private helper
  and non-async export in between into the preceding handler's body (worst current
  over-read: **12,183 characters** past `data-ops/lib/agent.ts: runChat`'s closing
  brace). `declarationBody()` in the new module fixes exactly this.
- test `PUBLISH_RE` against source **with its comments**, so a comment naming
  `publishChange(` would satisfy R1 — the precise hole the new `stripComments()`
  exists to close.

I measured both: **0 false greens and 0 comment-only publishes today.** This is a
latent fragility, not a live defect — but it is the last copy of a pattern the repo
has now decided is wrong, sitting on its most important check.

**Fix:** replace all three `indexFunctions` with `namedBody` + `stripComments` from
`shared/test/source.ts`. `shared/test/gating-seam.ts` already sets the precedent for
hoisting a shared worker-test helper.

### MEDIUM (unchanged) — the user channel never catches up after a drop, including a missed sign-out

`web/components/app-shell.tsx:181` (compare `:162-177`)

`useUserRealtime(userId, onEvent)` gets no third argument; the hook supports one
(`realtime.ts:87-93`). A user-channel drop silently loses a profile edit made on
another device, a cross-team membership change, and `publishSignOut` — the forced
sign-out after an email change (`workers/auth/src/lib/email-change.ts:140`). A device
that should have bounced to login stays signed in.

**Fix:** pass an `onReconnect` running `void active.refresh()` and
`auth.me().catch(() => window.location.assign("/login"))` — the same two things the
individual event handlers already do.

### MEDIUM (unchanged) — two of the three record Activity tabs are not live, and look live to the person acting

`web/lib/live-resources.ts:185` and `:208-213` · `learning-detail.tsx:69` · `role-detail.tsx:75`

`help` deps include `activity:record:help:${id}`. `learning` has **no `deps` at all**.
`member_roles` deps are `[my-perms:${t}, role-perms:${id}]`. Worse, it looks correct
to whoever made the change: `learning-detail.tsx:131-135` re-primes
`activity:record:learning:<id>` locally after every edit, so the editor watches their
action appear instantly and concludes the tab is live. A colleague sees nothing.

**Fix:** add `activity:record:learning:${id}` to the `learning` deps and
`activity:record:member_roles:${id}` to the `member_roles` deps. One line each; the
pattern already exists on `help`.

### MEDIUM (unchanged) — the Team progress grid goes stale when anyone marks an article done

`web/components/learning-progress.tsx:29` · `workers/content/src/routes/learning.ts:129`

`postLearningDone` publishes `learning`/`edit`, so the ping fires, but the curator's
grid reads `learning-progress:<teamId>`, which has no listener.

**Fix:** add `learning-progress:${t}` to the `learning` deps.

### MEDIUM (unchanged) — paged feeds collapse to page one on any ping

`web/components/app-shell.tsx:128`

`invalidate("activity:team:"+teamId)` fires unconditionally at the top of every ping
handler. Anyone who has pressed "Load more" through the activity history loses
everything they loaded the moment any teammate does anything. Same for
`help-mine:<t>` and `activity:record:help:<id>`.

**Fix:** re-pull page one and *merge* by id rather than dropping the key —
`reconcile` already does exactly this for the row-level lists.

### MEDIUM (unchanged) — the actor takes a different, more expensive path than everyone else on a reply

`web/components/help-detail.tsx:192`

`invalidate("help:"+teamId)` refetches the whole paged ticket list to reflect one
row's `updated_at`. LAW R23 exists precisely to remove this shape.

**Fix:** `applyUpdated({ listKey: "help:"+teamId, id: helpId, row })` — the same call
the two handlers 30 lines above already make.

### HIGH (unchanged) — the UI never tells anyone whether it is live

`web/lib/realtime.ts:19-74`

Every failure mode above presents identically to a quiet team. The user has no way
to distinguish "nothing happened" from "I stopped receiving", and therefore no
reason to reload.

**Fix:** return `{connected, reconnecting}` from `useLiveChannel` and surface it in
the shell. Note UI-CONVENTIONS' library-is-lego rule — a new indicator primitive
belongs in `swift-struck-ui`, which this repo may not edit.

### LOW (unchanged) — the import history is entirely silent

`web/components/import-screen.tsx:434` · `workers/data-ops/src/routes/import.ts:131,187`

`import-batches:<teamId>` is a team-scoped collection with no publisher. Import
publishes the *target modules* it wrote but never a resource for the batch list. It
is the one should-be-live surface with no publisher at all, and it costs criterion 1
its entire 20-point item.

**Fix:** publish an `import` resource after confirm and give it a listener — or make
it caller-private and record that, which turns a gap into a reviewed exemption.

### LOW (new) — realtime's `/publish` is the only internal door in the base without `x-internal-key`

`workers/realtime/src/index.ts:141` · `workers/realtime/wrangler.jsonc`

It accepts a channel name and an arbitrary JSON event and broadcasts to that team.
It is unreachable today: `workers_dev: false` and `preview_urls: false` on both prod
and staging, and the gateway only routes `/api/realtime`. So the isolation is
correct — it just lives in deployment config rather than in the handler, one flag
away from an arbitrary cross-tenant broadcast, while `auth`'s `/internal/log-error`
(used by the gateway's new central catch) does carry a key.

**Fix:** one `if (request.headers.get("x-internal-key") !== env.INTERNAL_KEY) return
fail(401, …)` at the top of `/publish`. Not a `security_sentry_review` handoff —
nothing crosses a tenant boundary today.

### LOW (unchanged) — no ordering guard on a row patch

`web/lib/store.ts:158-183`. Two rapid pings for one row fire two `fetchOne` calls;
an older read can land last. Self-corrects on the next ping or reconnect.

### Corrections to my own round-1 report

1. **Criterion 4 should have been 85, not 100.** I read `patchRow`'s null semantics
   and wrote that `null` correctly means "no longer belongs" — and did not check what
   the five `one*` readers returned past `LIST_HARD_CAP`. They returned `null` for a
   record that was still there, so a live edit deleted it off every teammate's
   screen. The fix arrived from scaling/speed, not from me.
2. **Criterion 5's fraction was wrong.** I wrote "6 of 9" over a table that named 9
   live panes and 3 deaf ones. The correct round-1 figure was 9/12 → 90, not 87.
3. **Criterion 7 was 3 points generous** — the unkeyed `/publish` door, above.
4. **My first round-2 seam probe reported a false green on `createTeam`** that did
   not exist: my brace matcher stopped on the `{` inside `Promise<{ teamId: string }>`.
   Corrected and re-run; 0 false greens, same as round 1.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1. Remove the dead R15 seam and re-point its check** — delete `use-live-refetch.ts` + `live-bus.ts` + both `emitLive` calls; rewrite R15's text in RULES.md, registry.ts and CLAUDE.md; assert coverage over the `pagers` list already computed | `web/lib/use-live-refetch.ts`, `web/lib/live-bus.ts`, `web/components/app-shell.tsx:22,126,170`, `web/test/rules.test.ts:898-930`, `shared/rules/registry.ts:121`, `RULES.md:33`, `CLAUDE.md:24` | REMOVES ~50 lines of dead code and a fan-out over an empty Set on every ping; ADDS a real per-screen coverage assertion | **lean_mean** and **dead_end** both GAIN — they will flag the same dead export and are currently blocked by the law check. **story_checks_out** GAINS: three documents stop describing a mechanism with zero consumers. **architecture_review**: removes a seam, so a future genuinely-out-of-cache paged screen must reintroduce one — the only argument for keeping it, and no such screen is planned. Must be ONE commit or `registry-integrity` fails. |
| **2. Widen the `DEAF_EXEMPT` key regex + fail on unparseable tokens** | `web/test/rules.test.ts:889-895` | ADDS ~3 lines; REMOVES a silent skip | none — test-only, no runtime cost, no other review reads this check. |
| **3. Migrate the three `publish-seam.test.ts` copies to `shared/test/source.ts`** | `workers/{content,tenancy,data-ops}/test/publish-seam.test.ts` | REMOVES 3 copies of a 12-line broken reader; ADDS 2 imports each | **lean_mean** GAINS (three duplicate helpers deleted, matching the precedent `shared/test/gating-seam.ts` already set). Test-only; no runtime cost. Small risk it turns R1 red on a handler that was passing on a neighbour's text — which would be the check working. |
| **4. Give the user channel an `onReconnect`** | `web/components/app-shell.tsx:181` | ADDS a 3-line handler reusing `active.refresh()` + `auth.me()` | **security_sentry** GAINS: a missed `publishSignOut` currently leaves a device signed in that should not be. **round_trip / spend**: two extra requests per user-channel reconnect — only after a real drop. |
| **5. Make the learning + role Activity tabs live** | `web/lib/live-resources.ts:185, 208-213` | ADDS 2 cache keys to 2 deps arrays | **speed / spend**: one extra small activity read per viewer per ping, and only while that detail is mounted. **activity_log**: neutral — changes who reads the feed, never what is written. |
| **6. Add `learning-progress:${t}` to the `learning` deps** | `web/lib/live-resources.ts:208-213` | ADDS 1 cache key | **scaling**: a *personal* done-toggle already fans out to the whole team channel; this makes each recipient also re-pull the progress matrix (`THREAD_HARD_CAP` 500). Price it with `scaling_review` before shipping — it is the one fix here with real per-ping cost. |
| **7. `applyUpdated` for the help reply instead of `invalidate`** | `web/components/help-detail.tsx:192` | REMOVES a full paged-list refetch on every reply | **round_trip / speed** both GAIN. **lean_mean** neutral — one call swapped for another. Aligns with R23, so **story_checks_out** gains. |
| **8. Merge instead of drop on the paged activity feed** | `web/components/app-shell.tsx:128` (reuse `reconcile`, no change to `store.ts`) | REMOVES a page-one collapse; ADDS a diff-patch call | **speed**: same request count, slightly more client CPU. **scaling**: unchanged message volume, purely client-side. |
| **9. Publish an `import` resource for the batch list** | `workers/data-ops/src/routes/import.ts`, `web/lib/live-resources.ts`, `shared/rules/registry.ts` | ADDS one publish call + one listener (or one reasoned exemption) | **scaling**: one more team-wide message per import — rare. **R15 constraint**: a new resource string must land with a listener or a `DEAF_EXEMPT` entry in the same commit. If the answer is "make it caller-private", the fix is documentation only and costs nothing anywhere. |
| **10. `x-internal-key` on realtime's `/publish`** | `workers/realtime/src/index.ts:141`, `workers/realtime/wrangler.jsonc` (secret) | ADDS a 2-line guard + one secret per environment | **ops**: a new secret to set in both environments — `BOOTSTRAP.md` and `SECRETS.md` must gain a line or **mac_fell_in_the_ocean** loses a point. **speed**: one header comparison. Deploy order matters: set the secret before the publisher sends it, or every ping 401s. |
| **11. Surface the connection state** | `web/lib/realtime.ts`, `web/components/app-shell.tsx`, and `@swift-struck/ui` | ADDS returned state, a `useState` per socket, one small UI element | **lean_mean**: more code and a re-render per connect/disconnect. **UI-CONVENTIONS conflict**: library-is-lego means the indicator primitive belongs in `swift-struck-ui`, which this repo is forbidden to edit — the honest version is partly out-of-repo and needs the owner. **first_run** gains. |
| **12. A two-browser e2e test** | `web/e2e/` (new `realtime.spec.ts`) | ADDS the one test of the one thing nothing tests | **lean_mean**: more test code. **speed** (CI wall-clock): a two-context test with a socket drop takes seconds. Worth it — this single test would have caught findings 4, 5, 6 and the round-1 help-thread CRITICAL in one run. |
| **13. Gap-replay on reconnect — DO NOT DO** | — | Would ADD an event buffer to the Durable Object | **Conflicts with a locked decision.** `DURABLE-OBJECTS.md:48-49`: the DO holds open WebSockets, not data. `reconcile` is the in-rule answer and already exists. The −7 on criterion 3 is the price of the locked decision. |

---

## CEILING

**95 is not reachable by a commit in this repository. The true maximum is 92.**

Applying fixes 1, 4, 5, 6, 7, 8, 9, 10 and 12 — every one of them in-rule and inside
this repo — moves criterion 1 → 97, 2 → 100, 3 → 93, 5 → 100, 6 → 97, 7 → 100,
10 → 100, and leaves 4, 8 and 9 where they are:

```
97×16 + 100×14 + 93×13 + 100×12 + 100×10 + 97×10 + 100×9 + 30×8 + 80×5 + 100×3
= 1552 + 1400 + 1209 + 1200 + 1000 + 970 + 900 + 240 + 400 + 300 = 9171  ->  92
```

**Criterion 8 (weight 8, currently 30) is the cap, and it is capped by a rule, not
by effort.** Showing connection state properly needs a UI primitive, and
UI-CONVENTIONS plus CLAUDE.md forbid this repo from adding one — the library lives
in `swift-struck-ui` and must be changed there. That is an owner action in another
repository. Without it the ceiling is 92. With it, criterion 8 → 100 (+70×8 = +560 →
9731 → **97**), and because criterion 9's "offer a refresh where live is
unavailable" item only becomes answerable once the app knows it is unavailable,
9 → 100 as well (+20×5 = +100 → 9831 → **98**).

Two smaller caps, both deliberate:

- **Criterion 3 is capped at 93** by the locked "the DO stores no application data"
  decision (`DURABLE-OBJECTS.md:48`). Worth 0.9 of the final total. Do not relitigate.
- **Criterion 9's 30-point item is capped at 10** for as long as criterion 8 is
  capped — you cannot offer a refresh *because live is unavailable* until the app
  knows it is unavailable. It is a dependent cap, counted once in the 97 → 98 step
  above and not separately.

**Nothing is capped by single-authorship or a platform limit.** The transport —
hibernating Durable Objects, monotonic sharding, server-gated connect, content-free
pings, diff-patch reconnect — remains the strongest subsystem in this base. Every
point still missing is a wiring gap in the last hop to a screen, and all but one of
them is a one-to-three-line change in `web/lib/live-resources.ts` or
`web/components/app-shell.tsx`.

**The one sentence to keep, updated:** *a change to `learning_progress` is invisible
to everyone else until they refresh* — the help conversation, which held this title
in round 1, is now live.
