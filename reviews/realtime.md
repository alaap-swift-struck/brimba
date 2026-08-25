# Realtime review — Brimba · 2026-08-25
SCORE: 80/100   (previous: never run)

Transport: present and real — one `TeamChannel` Durable Object per team (sharded),
WebSocket with hibernation, one shared publish seam (`shared/workers/realtime.ts`),
one socket per client held in `app-shell.tsx`, one data-driven listener registry
(`web/lib/live-resources.ts`). The socket layer is genuinely good. The failures are
all **coverage**: five surfaces a person is looking at receive no ping, and the two
checks that were supposed to prevent exactly that are one honest and one vacuous.

**Verdict sentence:** *a change to `help_threads` is invisible to everyone else
until they refresh* — a reply to a help ticket, the most obviously two-person thing
in the product, does not reach the other person's open ticket.

---

## The silent split (the judgement everything below rests on)

The probe reported 25 silent tables. That raw number is meaningless until split.
Splitting it is the whole review.

### Should be live — a person is looking at it (18 surfaces)

| # | surface | screen | does a change reach that screen? |
|---|---|---|---|
| 1 | `team_members` | Members list + detail | YES — `members` |
| 2 | `member_roles` | Roles list + detail | YES |
| 3 | `role_permissions` | Role permission matrix | YES — via `member_roles` ping (`roles.ts:168`), `role-perms:<id>` dep |
| 4 | `invites` | Invites list + detail | YES |
| 5 | `invite_logs` | Invite detail audit | YES — `invite-audit:<id>` dep |
| 6 | `selectable_data` | Dropdown manager + form pickers | YES |
| 7 | `learning` | Learning list + article Overview | YES |
| 8 | `help` | Ticket list + ticket Overview | YES |
| 9 | `activity` (team) | Team activity feed | YES — invalidated on every ping |
| 10 | `activity` (record: help) | Ticket Activity tab | YES — `activity:record:help:<id>` dep |
| 11 | `teams` | Team switcher / membership | YES — user channel |
| 12 | `users` (profile) | Your identity + member rows | YES — user channel + team `members` |
| 13 | `screens` | Screen-recipe overrides | YES |
| 14 | **`help_threads`** | **Ticket conversation + reply badge** | **NO** |
| 15 | **`learning_progress`** | **Team progress grid** | **NO** |
| 16 | **`activity` (record: learning)** | **Article Activity tab** | **NO** |
| 17 | **`activity` (record: member_roles)** | **Role Activity tab** | **NO** |
| 18 | **`data_import_batches`** | **Import history (team-scoped)** | **NO — never published at all** |

**13 of 18 reach a screen. 5 do not.**

### Correctly silent — machinery nobody watches (17 tables)

`sessions`, `login_codes`, `email_change_codes`, `idempotency_keys`, `error_logs`,
`users_new` (a migration artefact), `db_alerts` (ops), `importable_databases` (seed),
`team_module_databases` (owner maintenance), `data_import_sessions` (one person's
own wizard), `agent_threads` + `agent_messages` (your own chat; the SSE stream
carries it inside a session), `agent_credits` + `agent_usage` + `agent_usage_log`
(reasoned `DEAF_EXEMPT`), `mcp_tokens` (caller-private — CACHING rule 5 reviewed
exception), plus the `activity` write itself (`logActivity` publishes nothing of its
own; every caller publishes its resource ping, which is what refreshes the feed).

**The probe's own numbers were wrong for this codebase and I did not use them.**
`mutations.byOp` read create 5/44, update 11/59, delete 0/5 — 15% overall. That is a
proximity artefact: Brimba writes in `src/lib/*.ts` and publishes in `src/routes/*.ts`,
one caller up, so almost every publish is invisible to a ±25-line window. I replaced
it with a full enumeration of all **43 publish call sites** (grep for
`publishChange|publishUserChange|publishSignOut` across `workers/` + `shared/`,
excluding tests) crossed against the listener registry. The `0/5 deletes` figure is
also an artefact of a different kind: all 5 real SQL `DELETE`s are `sessions` (4) and
`idempotency_keys` (1) — machinery. Brimba deactivates, never deletes.

---

## Arithmetic

```
DEFECT    criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / 100 )
```

### 1 · Every change that matters publishes — 77 × weight 16 = 1232  · GATE

| pts | earned | why |
|---|---|---|
| 45 | **42** | 17 of 18 should-be-live surfaces have a publish behind the write (45 × 17/18 = 42.5). Only `data_import_batches` has no publisher at all. Note 14–17 above DO publish — they fail at the listener, scored in criterion 2, not here. |
| 25 | **25** | One shared publisher, and it cannot be dodged: all 43 sites go through `shared/workers/realtime.ts`, and a per-worker `publish-seam.test.ts` reads the `ROUTES` table + handler source off disk and fails any mutation route that does not publish. I adversarially tested this check (below) — it is honest today. |
| 20 | **0** | `data_import_batches` is a user-facing, team-scoped collection that is entirely silent. One table, but the criterion is "no user-facing table is entirely silent". |
| 10 | **10** | Written down thoroughly: `DEAF_EXEMPT` with per-entry reasons (`shared/rules/registry.ts:258`), `HOUSEKEEPING` deny-lists in each publish-seam test, CACHING rule 5's reviewed exceptions, and inline reasons in `live-resources.ts`. |

**Gate check: 77 ≥ 40 → total NOT capped.**

**I tried to break the R1 check and could not.** `indexFunctions` in each
`publish-seam.test.ts` slices source from one `export async function` to the next,
which is precisely the "matches past the end" pattern that has bitten this repo. I
reproduced it and compared each slice against a brace-matched true body across all
three mutating workers. Result: **0 handlers where the slice sees a `publish` the
function itself does not**. It over-reads (worst: `getLearningProgress`, 1218 chars
past its closing brace) but nothing currently exploits that. Recorded as a latent
fragility, not a defect.

### 2 · Every screen that shows it subscribes — 89 × weight 14 = 1246

| pts | earned | why |
|---|---|---|
| 40 | **29** | 13 of 18 should-be-live surfaces have a listener (40 × 13/18 = 28.9). The 5 deaf ones are rows 14–18 above. |
| 25 | **25** | Keys match by construction: `use-screen-data.ts` fetches on exactly the keys `live-resources.ts` patches, and says so in its header comment. No drift found. |
| 20 | **20** | One hook, not per-screen plumbing. ONE team socket + ONE user socket in `app-shell.tsx`; every screen just calls `useCached(key, …)`. Adding a module is one registry entry. This is the strongest thing in the design. |
| 15 | **15** | Unsubscribe is real: `subscribeKey` returns a deleter and drops the empty Set so the subscriber map cannot grow (`store.ts:87–95`); `useLiveChannel` closes the socket and clears the retry timer on unmount or id change (`realtime.ts:68–72`). |

### 3 · A dropped connection recovers what it missed — 83 × weight 13 = 1079

Base 100. Reconnect exists with capped backoff (1s→15s, `realtime.ts:57–63`) **and**
catch-up exists — `onReconnect` runs `reconcile` over all 6 `TEAM_RESOURCES` lists
(diff-patch by id: changed rows update, new rows appear, gone rows drop, unchanged
rows keep identity), re-primes the R16 totals, and replays `{kind:"reconnect"}` to
the bus. No page reload. This is a genuinely well-built criterion — the critical and
high cases both do not apply.

| penalty | −pts | why |
|---|---|---|
| medium | −7 | Refetches everything rather than the gap. `reconcile` re-pulls all 6 whole lists on every reconnect regardless of whether anything changed. Correct but expensive. There is no `since` / `lastEventId`. |
| medium | −7 | **The user channel has no catch-up at all.** `app-shell.tsx:181` passes no `onReconnect` to `useUserRealtime`, while `:162` passes a full one to `useRealtime`. A user-channel drop loses profile changes, team-membership changes and — worst — a forced sign-out signal. |
| minor | −3 | Recovery is untested. Nothing drops a socket and asserts catch-up. |

= 100 − 17 = **83**

### 4 · Deletes and archives propagate too — 100 × weight 12 = 1200

Base 100, no penalties, and I looked hard for one.

- All 5 real SQL `DELETE`s are machinery (`sessions` ×4, `idempotency_keys` ×1).
- Removal publishes `op:"remove"` (`members.ts:40`, `:43`, `teams.ts`), and
  `patchRow` re-pulls the row through the same permission-checked door — `null` back
  means "no longer belongs" and the row is filtered out (`store.ts:171–172`).
- Deactivation is an in-place state change, and I checked the counts: `COUNT(*) FROM
  learning` / `FROM selectable_data` / `FROM help` are **unfiltered**, and the list
  reads are unfiltered too — so a deactivate does not move the total and the "archive
  broadcast as a plain update" medium does not apply here.
- An open detail whose record vanishes renders an honest line, not stale content:
  "That ticket no longer exists." (`help-detail.tsx:183`), "That member isn't on this
  team." (`module-content.tsx:367`), "That invite no longer exists." (`:379`).

A clean result is a real result; I am not inventing a penalty to decorate this.

### 5 · The detail view is live, not just the list — 87 × weight 10 = 870

| pts | earned | why |
|---|---|---|
| 40 | **27** | Of 9 live-relevant detail panes, 6 update while someone else edits (40 × 6/9 = 26.7). Live: member Overview+Activity, invite Overview+audit, role Permissions, help Overview+Activity+Stakeholders, learning Overview. Not live: **help thread**, **learning Activity tab**, **role Activity tab**. |
| 30 | **30** | Per-record, not whole-list: `patchRow(key, idField, id, fetchOne)` re-pulls exactly one row. |
| 20 | **20** | A live patch cannot overwrite what you are typing — form values live in `useFormDraft` local state re-seeded only on `open` (`help-form-dialog.tsx:71`), and every edit carries `expectedVersion`. |
| 10 | **10** | Two people on one record is a thought-through case, not a hope: optimistic-concurrency `expectedVersion` on help and learning edits (`help-detail.tsx:138`, `learning-detail.tsx:122`). |

### 6 · Local and broadcast agree — 90 × weight 10 = 900

Base 100. The acting client deliberately takes the same path a ping takes —
`applyCreated`/`applyUpdated` both route through `patchRow` (`live-resources.ts:30–86`),
so the echoed broadcast re-applies the same row idempotently rather than doubling it.
`useCached`'s `sync` re-renders from cache without refetching when the key is present
(`store.ts:258–268`), explicitly so a patch is not clobbered — no flicker. A failed
reply rolls its optimistic echo back (`help-detail.tsx:176`).

| penalty | −pts | why |
|---|---|---|
| medium | −7 | One place still has two update paths for one event: `help-detail.tsx:174` calls `invalidate("help:"+teamId)` after posting a reply, blowing away the actor's whole paged ticket list and refetching page one, while every other client patches one row. This is the exact shape LAW R23 exists to remove. |
| minor | −3 | No ordering guard. Two rapid pings for one row both call `fetchOne`; nothing stops the older response landing last (`store.ts:158–183`). |

= **90**

### 7 · The channel is scoped to who should see it — 97 × weight 9 = 873

Base 100. **No cross-tenant broadcast** — nothing here belongs to `security_sentry_review`.
Connect is gated server-side: the team channel requires `isActiveMember(env.DB, user.id,
teamId)` (`workers/realtime/src/index.ts:174`), the user channel requires
`userId === user.id` (`:166`). Scoping does **not** rely on client filtering: the payload
is `{resource,id,op}` with no row content, and the re-pull goes through the normal
permission-checked endpoint.

| penalty | −pts | why |
|---|---|---|
| minor | −3 | One channel per team, not per module: a member with no `help:read` right still receives `{resource:"help", id:<ulid>}`. No data leaks (the re-pull 403s), and it is documented as a reviewed trade-off in CACHING §8 — so, minor. |

= **97**

### 8 · The UI is honest about being live — 30 × weight 8 = 240

| pts | earned | why |
|---|---|---|
| 40 | **0** | **The connection state is never shown.** `useLiveChannel` tracks `everConnected`, `retry` and `closed` internally and returns `void` (`realtime.ts:19–74`). Nothing in `web/components/` renders it. The probe's `connectionStateShown` hits were all false positives — I opened each: `log.ts:31`, `realtime.ts:10`, `store.ts:194`, `use-agent-chat.tsx:91` are comments, and `version-watch.tsx` watches the build fingerprint, not the socket. |
| 30 | **0** | A dropped socket is indistinguishable from a quiet team. Both look like a screen that is simply not changing. |
| 30 | **30** | Nothing in the UI claims "live" in words while the socket is closed, so nothing actively lies. |

### 9 · There is a fallback when realtime is not available — 80 × weight 5 = 400

| pts | earned | why |
|---|---|---|
| 50 | **50** | The app works fully, degraded, with no socket: cache-first plus `void load()` revalidate-on-mount on every key change and navigation (`store.ts:281`), and `refresh()` on every query. |
| 30 | **10** | No poll and no refresh affordance offered *because* live is unavailable — the user cannot tell that it is. Navigation happens to re-pull; that is a side effect, not an offer. |
| 20 | **20** | Bounded, not a tight loop: reconnect backoff caps at 15s, `version-watch` throttles to 60s, and there is no `setInterval` polling anywhere (probe `pollingFallback: []`, which I confirmed). |

### 10 · Somebody has tested it with two browsers — 0 × weight 3 = 0

| pts | earned | why |
|---|---|---|
| 60 | **0** | No test opens two clients. `web/e2e/team-flows.spec.ts` is a single `page`; zero `newContext` / `newPage` anywhere under `web/e2e/`. Its comments say "live patch" (`:117`, `:134`) but the assertions pass off the acting client's own `applyCreated`/`applyUpdated` — they would pass with the realtime worker switched off entirely. A green test asserting the wrong intent. |
| 40 | **0** | Reconnect-and-catch-up is not among the cases covered. |

### Total

```
crit  score  weight  product
 1      77     16     1232
 2      89     14     1246
 3      83     13     1079
 4     100     12     1200
 5      87     10      870
 6      90     10      900
 7      97      9      873
 8      30      8      240
 9      80      5      400
10       0      3        0
              ----   ------
               100     8040

8040 / 100 = 80.4  ->  SCORE 80    (gate not applied: crit 1 = 77 ≥ 40)
```

---

## Findings

### CRITICAL — the help ticket conversation is not live, and the exemption that permits it describes a mechanism that does not exist

`web/components/help-detail.tsx:86` · `web/lib/live-resources.ts:224` · `shared/rules/registry.ts:259`

Two people work a ticket. Each posts replies. Neither sees the other's until they
navigate away and come back.

`help-detail` reads the conversation from `help-thread:<helpId>` and its exact reply
badge from `total:help-thread:<helpId>`. The `help` entry's deps are
`[activity:record:help:<id>, help-stakeholders:<id>, help-mine:<t>]` — **neither
thread key is there**, and nothing else invalidates them. `useCached` only refetches
on a cache miss or a remount, so a mounted ticket sits stale indefinitely.

`workers/content/src/routes/help.ts:197` genuinely publishes `help_threads`, so R15
demanded a listener — and it got a `DEAF_EXEMPT` entry instead, reading: *"a reply
pings the parent help row too (op edit), whose row-level patch refreshes the open
ticket's deps; the thread list itself re-pulls when the detail (re)opens."* The first
clause is true and irrelevant (the parent's deps do not include the thread); the
second is the bug restated as a justification. The reply badge is stale for the same
reason, so the tab says "3" while showing 5.

**Fix:** add `help-thread:<id>` and `total:help-thread:<id>` to the `help` deps in
`live-resources.ts:224`, then delete the `help_threads` `DEAF_EXEMPT` entry and give
it a real `TEAM_RESOURCES`-style listener (or leave it exempt with a reason that is
actually true). Better still, patch the one new reply in rather than invalidating.

### HIGH — R15's paged-screen check is vacuous, and the seam it guards has zero callers

`web/test/rules.test.ts:833–840` · `web/lib/use-live-refetch.ts:14` · `web/lib/live-bus.ts:19`

```js
const offenders = componentFiles().filter((f) => {
  const src = read(f)
  return /\/search\?|usePagedList/.test(src) && !src.includes("useLiveRefetch")
})
expect(offenders, `paged screen without a live subscription …`).toEqual([])
```

`componentFiles()` walks `web/components/**/*.tsx`. **Not one of those files contains
`/search?` or `usePagedList`** — every fetch goes through the helpers in
`web/lib/api.ts`, so neither token ever appears in a component. I checked with fixed-string
greps (the campaign's own warning about zero-results): both return empty. `offenders`
is therefore always `[]` and this assertion cannot fail. It has been green since the
day it was written, exactly like the R17 case.

The consequence: `useLiveRefetch` has **zero call sites**. The only non-generated
files naming it are its own definition, two comments, and this test. `emitLive({kind:
"ping"})` in `app-shell.tsx:126` iterates an empty listener Set on every single ping,
as does the reconnect replay. R15's law text in `shared/rules/registry.ts:121` names
`useLiveRefetch` as the mechanism every paged screen must consume — the law describes
dead code.

The *intent* is met by a different mechanism, which is why nobody noticed: paging
appends into the **same** cache key (`loadMore` → `primeCache(listKey, [...prev,
...next.rows])`), so paged rows do live inside the row-level cache the shell patches.
`useLiveRefetch` became unnecessary and was never removed.

**Fix (pick one, do not do both):** either delete `use-live-refetch.ts` + `live-bus.ts`
+ the `emitLive` calls and rewrite R15's law text and check to describe what actually
keeps paged screens live; or wire the paged screens to it and make the detector look
for the real fetch pattern (e.g. `cursorKey(` / `<LoadMore`) instead of `/search?`.
Either way the check must be re-pointed at something that exists.

### HIGH — two of the three record Activity tabs are not live, and look live to the person acting

`web/lib/live-resources.ts:208–213` and `:180–186` · `web/components/learning-detail.tsx:69` · `web/components/role-detail.tsx:75`

Law R2 requires every record detail to expose an Activity tab. All three do. Only
one is live.

- `help` deps include `activity:record:help:<id>` (`:224`). Live.
- `learning` has **no `deps` at all** (`:208–213`). `activity:record:learning:<id>` is
  never invalidated.
- `member_roles` deps are `[my-perms:<t>, role-perms:<id>]` (`:185`) — the activity
  key is missing.

Worse, it looks correct to whoever made the change: `learning-detail.tsx:131–135`
re-fetches and primes `activity:record:learning:<id>` locally after every edit and
(de)activate. So the editor watches their action appear instantly and concludes the
tab is live. A colleague on the same article sees nothing. That is the rubric's
"stale screen that looks live", produced by the actor's own optimistic path.

**Fix:** add `activity:record:learning:<id>` to the `learning` deps and
`activity:record:member_roles:<id>` to the `member_roles` deps. One line each; the
pattern already exists on `help`.

### HIGH — the UI never tells anyone whether it is live

`web/lib/realtime.ts:19–74`

`useLiveChannel` knows exactly what state the socket is in and returns `void`. There
is no indicator anywhere. Every failure mode above — a dropped socket, a deaf key, a
missed sign-out — presents identically to a quiet team: a screen that simply is not
changing. The user has no way to distinguish "nothing happened" from "I stopped
receiving", and therefore no reason to reload.

**Fix:** return `{connected, reconnecting}` from `useLiveChannel`, surface it in the
shell (a quiet dot, not a banner), and — the part that actually earns its keep —
show a "reconnecting…" state after the first failed retry so the user knows to trust
the screen less. Note UI-CONVENTIONS' library-is-lego rule: if this needs a new
primitive it belongs in `@swift-struck/ui`, not here.

### MEDIUM — the user channel never catches up after a drop, including a missed sign-out

`web/components/app-shell.tsx:181` (compare `:162–177`)

`useRealtime(teamId, onEvent, onReconnect)` gets a full catch-up handler.
`useUserRealtime(userId, onEvent)` gets **no third argument**. The hook supports it
(`realtime.ts:87–93`); the shell just does not pass one.

So a user-channel drop silently loses: a profile edit made on another device, a
cross-team membership change (you were added to or removed from a team), and
`publishSignOut` — the forced sign-out after an email change
(`workers/auth/src/lib/email-change.ts:140`). A device that should have bounced to
login stays signed in until something else calls `auth.me()`. The team channel's
`reconcile` does not cover any of this; those are different caches on a different
socket.

**Fix:** pass an `onReconnect` that runs `void active.refresh()` and
`auth.me().catch(() => window.location.assign("/login"))` — the same two things the
individual event handlers already do.

### MEDIUM — the Team progress grid goes stale when anyone marks an article done

`web/components/learning-progress.tsx:29` · `workers/content/src/routes/learning.ts:129`

`postLearningDone` publishes `learning`/`edit`, so the ping fires. The curator's grid
reads `learning-progress:<teamId>`, which has no listener (the `learning` entry has
no deps). A manager watching "Team progress" while their team works through the
material sees a frozen grid.

There is a second-order oddity worth naming: a *personal* done-toggle broadcasts to
the entire team channel, causing every connected member to re-pull that learning row.
Each gets their own correct row back, so nothing is wrong — but it is one team-wide
fan-out per personal checkbox. Message volume is `scaling_review`'s ground, not mine;
flagging the shape, not pricing it.

**Fix:** add `learning-progress:<t>` to the `learning` deps.

### MEDIUM — paged feeds collapse to page one on any ping

`web/components/app-shell.tsx:128`

The shell calls `invalidate("activity:team:"+teamId)` unconditionally at the top of
every ping handler, whatever changed. `invalidate` deletes the key, so `useCached`
falls through to a real fetch of **page one only**. Anyone who has pressed "Load more"
through the activity history loses everything they loaded the moment any teammate does
anything at all. The same happens to `help-mine:<t>` (a dep of `help`) and to
`activity:record:help:<id>`.

This is the failure R15 was written to prevent, arriving through the coarse path
instead of the paged one.

**Fix:** re-pull page one and *merge* by id rather than dropping the key — `reconcile`
already does exactly this for the row-level lists and could be reused here.

### MEDIUM — the actor takes a different, more expensive path than everyone else on a reply

`web/components/help-detail.tsx:174`

After posting a reply the acting client calls `invalidate("help:"+teamId)`, refetching
the whole paged ticket list to reflect one row's `updated_at`, while every other client
patches that one row from the ping. CACHING rule 3 and LAW R23 both say the opposite,
and R23 exists precisely because the expensive path kept landing on the person who was
waiting.

**Fix:** the reply door already returns the ticket's new state via the `help`/`edit`
ping — use `applyUpdated({listKey: "help:"+teamId, id: helpId, row})` instead.

### LOW — the import history is entirely silent

`web/components/import-screen.tsx:434` · `workers/data-ops/src/routes/import.ts:191–197`

`import-batches:<teamId>` is a team-scoped collection, so two admins importing in
parallel do not see each other's batches. Import publishes the *target modules* it
wrote (`:131`, `:187`) but never a resource for the batch list itself. This is the one
should-be-live surface with no publisher at all, and it is what costs criterion 1 its
20-point "no user-facing table entirely silent" item.

**Fix:** publish an `import` resource after confirm and give it a listener — or, if
the team view is not worth a channel message, make it caller-private and record that
decision, which turns it from a gap into a reviewed exemption.

### LOW — no ordering guard on a row patch

`web/lib/store.ts:158–183`

Two rapid pings for one row fire two `fetchOne` calls; nothing sequences the responses,
so an older read can land last and overwrite a newer one. Self-corrects on the next
ping or reconnect. Real, small.

### LOW (latent, not a current defect) — the R1 publish-seam slice over-reads

`workers/{content,tenancy,data-ops}/test/publish-seam.test.ts:18–29`

`indexFunctions` slices from one `export async function` to the next, so anything
between two exported handlers — a non-exported helper, an `export function` (not
async), a `const x = async () =>` — is folded into the preceding handler's body. Today
that is harmless: I brace-matched every handler in all three workers and found **0**
where the slice sees a publish the function does not. But a helper containing
`publishChange` placed after a non-publishing mutation handler would make R1 go green
on a genuinely silent route. Worst current over-read: 1218 chars past a function's
closing brace.

**Fix:** brace-match the body instead of slicing to the next export (about six lines),
or split on `\n(export |function |const )` rather than `export async function`.

### LOW — the team channel is not module-scoped

A member with no `help:read` right still receives `{resource:"help", id:<ulid>}` on the
team channel. No data leaks — the re-pull goes through the gated door and 403s — and
CACHING §8 documents the trade-off explicitly. Noting it once so it is not rediscovered
as a surprise; **not** a `security_sentry_review` handoff, because nothing crosses a
tenant boundary and no content is exposed.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1. Make the help thread live** — add `help-thread:<id>` + `total:help-thread:<id>` to `help` deps; drop the false `DEAF_EXEMPT` reason | `web/lib/live-resources.ts:224`, `shared/rules/registry.ts:259` | ADDS 2 cache keys to one deps array; REMOVES a `DEAF_EXEMPT` entry whose stated mechanism is fiction | **speed_review / spend_review / scaling_review**: every reply now triggers a thread refetch on every viewer with that ticket open — a coarse invalidate, so it is a full thread read (capped at `THREAD_HARD_CAP`) per viewer per reply. Patching the single new reply in instead would cost more code (**lean_mean**) but no extra read. **story_checks_out** gains: it removes a documented claim that is untrue. |
| **2. Re-point the vacuous R15 paged check** (option A: delete `use-live-refetch.ts` + `live-bus.ts` + both `emitLive` calls, rewrite R15's law text and check) | `web/lib/use-live-refetch.ts`, `web/lib/live-bus.ts`, `web/components/app-shell.tsx:126,170`, `web/test/rules.test.ts:833`, `shared/rules/registry.ts:121`, `RULES.md` | REMOVES ~50 lines of dead code and a fan-out that iterates an empty Set on every ping | **lean_mean** gains (dead code removed). **story_checks_out** must land in the same commit — R15's law text in RULES.md and the registry both name `useLiveRefetch`, and `registry-integrity` fails if RULES.md and the registry drift. **dead_end_review** will independently flag the same dead export; coordinate so it is not fixed twice or counted twice. **architecture_review**: removes a seam, so a future genuinely-out-of-cache paged screen has to reintroduce one — the reason to prefer option B if any such screen is planned. |
| **3. Make the learning + role Activity tabs live** — add the two `activity:record:*` keys to their deps | `web/lib/live-resources.ts:185, 208–213` | ADDS 2 cache keys to 2 deps arrays | **speed_review / spend_review**: a role or article ping now costs each viewer one extra activity read. Small — record feeds are short and only fetched when that detail is mounted. **activity_log_review**: neutral, this changes only who *reads* the feed, never what is written. |
| **4. Surface the connection state** — return `{connected, reconnecting}` from `useLiveChannel`, render a quiet indicator in the shell | `web/lib/realtime.ts`, `web/components/app-shell.tsx`, possibly `@swift-struck/ui` | ADDS returned state, a `useState` per socket, and one small UI element | **lean_mean**: more code, and a re-render on every connect/disconnect. **UI-CONVENTIONS conflict**: library-is-lego means a new indicator primitive belongs in the `swift-struck-ui` repo, which this repo is forbidden to edit — so the honest version of this fix is partly out-of-repo and needs the owner. **first_run_review** gains: a new user learns the app is live. |
| **5. Give the user channel an `onReconnect`** | `web/components/app-shell.tsx:181` | ADDS a 3-line handler reusing `active.refresh()` + `auth.me()` | **security_sentry_review** gains: a missed `publishSignOut` currently leaves a device signed in that should not be. **round_trip_review / spend_review**: two extra requests per user-channel reconnect — negligible, and only after a real drop. |
| **6. Merge instead of drop on the paged activity feed** — reuse `reconcile` for `activity:team:<t>` rather than `invalidate` | `web/components/app-shell.tsx:128`, `web/lib/store.ts` (reuse, no change) | REMOVES a page-one collapse; ADDS a diff-patch call | **speed_review**: `reconcile` re-pulls page one and diffs — same request count as today, slightly more client CPU. **scaling_review**: unchanged message volume; this is purely client-side. |
| **7. Use `applyUpdated` for the help reply instead of `invalidate`** | `web/components/help-detail.tsx:174` | REMOVES a full paged-list refetch on every reply | **round_trip_review / speed_review** both gain (one fewer list read per reply). **lean_mean** neutral — it swaps one call for another. Aligns with LAW R23, so **story_checks_out** gains. |
| **8. Publish an `import` resource for the batch list** | `workers/data-ops/src/routes/import.ts`, `web/lib/live-resources.ts`, `shared/rules/registry.ts` | ADDS one publish call + one listener entry (or one reasoned exemption) | **scaling_review**: one more team-wide message per import — rare and cheap. **R15 constraint**: a new resource string *must* land with a listener or a `DEAF_EXEMPT` entry in the same commit or `live-collections` goes red. If the answer is "make it caller-private", the fix is documentation only and costs nothing anywhere. |
| **9. Brace-match the publish-seam body** | `workers/{content,tenancy,data-ops}/test/publish-seam.test.ts` | ADDS ~6 lines per test, three copies | **lean_mean** loses slightly (three copies of the same helper — a case for hoisting it into `shared/test/`, which `gating-seam.ts` already sets a precedent for). No runtime cost; test-only. |
| **10. Add a two-browser e2e test** — second `browser.newContext()`, act in one, assert in the other, then drop and restore the socket | `web/e2e/team-flows.spec.ts` (or a new `realtime.spec.ts`) | ADDS a real test of the one thing nothing currently tests | **lean_mean**: more test code. **speed_review** (CI wall-clock): a two-context test with a socket drop is slow — seconds, not milliseconds. Worth it: this single test would have caught findings 1, 3, 5 and 6 in one run, which is why it is weight 3 and highest leverage. |
| **11. Ordering guard on `patchRow`** | `web/lib/store.ts:158–183` | ADDS a per-key sequence counter, discard stale responses | **lean_mean**: more state in the tightest, most-read file in the client. Genuinely marginal — the condition self-corrects on the next ping. Listing it for completeness; I would not spend the lines. |
| **12. Gap-replay on reconnect (`since` / `lastEventId`)** — **DO NOT DO** | — | Would ADD an event buffer to the Durable Object | **Conflicts with a locked decision.** `DURABLE-OBJECTS.md:48–49`: "It holds open WebSockets, not data. The DO stores no application data; the databases stay the single source of truth." A true gap replay requires the DO to buffer events, which breaks that. `reconcile` is the in-rule answer and already exists — the −7 on criterion 3 is the price of the locked decision, and I am naming it rather than proposing the fix silently. |

---

## CEILING

**Yes, 95 is reachable by changing code — but not by this repo alone.**

Applying fixes 1, 3, 5, 6, 7, 8, 9 and 10 (all in-rule, all inside this repository)
moves criterion 1 → 97, 2 → 100, 3 → 93, 5 → 100, 6 → 97, 10 → 100 and leaves 4, 7, 9
where they are. That recomputes to:

```
97×16 + 100×14 + 93×13 + 100×12 + 100×10 + 97×10 + 97×9 + 30×8 + 80×5 + 100×3
= 1552 + 1400 + 1209 + 1200 + 1000 + 970 + 873 + 240 + 400 + 300 = 9144  ->  91
```

**91 is the ceiling without touching criterion 8**, and criterion 8 is the one capped
by something outside a commit in this repo: showing connection state well needs a UI
primitive, and UI-CONVENTIONS plus CLAUDE.md forbid this repo from adding one — the
library lives in `swift-struck-ui` and must be changed there. That is an owner action,
not a commit here. With fix 4 done properly in the library, criterion 8 → 100 and the
total reaches **97**.

Two smaller caps, both deliberate and both cheap:

- **Criterion 3 is capped at 93** by the locked "the DO stores no application data"
  decision (`DURABLE-OBJECTS.md:48`). Full marks would need an event buffer on the
  Durable Object. Do not relitigate this for 7 points on a weight-13 criterion — worth
  0.9 of the final total.
- **Criterion 7's −3** (one channel per team, not per module) is a documented
  architecture choice, reaffirmed by the sharding design which keys shards by *user*,
  not module. Worth 0.27 of the total. Leave it.

**Nothing here is capped by single-authorship or a platform limit.** The realtime
transport itself — hibernating Durable Objects, monotonic sharding, server-gated
connect, content-free pings, diff-patch reconnect — is the strongest subsystem I
looked at. Every point lost is a wiring gap in the last hop to a screen, and every one
of them is a one-to-three-line change in `web/lib/live-resources.ts` or
`web/components/app-shell.tsx`.

**The one sentence to keep:** *a change to `help_threads` is invisible to everyone
else until they refresh.*
