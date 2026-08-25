# Round trip review — Brimba · 2026-08-25
SCORE: 45/100   (previous: never run)

**Uncapped total: 48.** Criterion 1 scored 25, below the rubric's gate of 40, so the
total is capped at 45. Both figures are shown below and both are recomputable by hand.

**The one-sentence verdict:** opening a help ticket at `/t/<team>/help/<id>` in a fresh
tab costs **24 HTTP requests to answer 12 distinct questions**, in 4 serial waves, and
those 24 requests cost the workers roughly **51 separate HTTPS round trips to
`api.cloudflare.com`** because every per-team query is a REST hop.

Probe: `node ~/.claude/skills/round_trip_review/assets/probe.mjs .` →
`transport.endpointsMapped: 74`, `scanned.callSites: 93`, `files: 276`. The transport
chain discovered correctly (`api()` in `web/lib/api.ts` → the `auth`/`tenancy`/`content`/
`dataOps`/`mcp` namespaces → 93 call sites), so the counts below rest on a real map, not
on raw `fetch` grepping. Every probe hit was opened and read before it was counted; the
false positives are listed by name.

---

## The measured hop counts

Counted by hand, following the chain through `web/app/layout.tsx` → `AgentHost` +
`DeepLinkScreen` → `AppShell` → `useScreenData` → the module component. Effects commit
child-first, and neither `useCached` nor `primeCacheIfCold` has any in-flight guard, so
components sharing a cache key all fire in the same commit.

### `/t/<team>/help/<id>` — cold load (the worst screen)

| wave | requests | what fires |
|---|---|---|
| 1 | 2 | `GET /api/auth/me` ×2 — `useActiveTeam` is instantiated twice (`agent-host.tsx:22`, `deep-link-screen.tsx:71`) |
| 2 | 2 | `GET /api/tenancy/active` ×2 — serial after wave 1 inside each instance (`use-active-team.ts:78,83`) |
| 3 | 12 | `my-permissions` ×4 · `roles` ×2 · `invites` ×2 · `selectable` ×2 · `config/screens` ×1 · `content/help?scope=all` ×1 |
| 4 | 8 | `content/help?scope=all` (2nd) · `help/thread` · `members` · `activity?scope=record` · `selectable` (3rd) · `help/stakeholders` · `my-permissions` ×2 |
| | **24** | **12 unique endpoints** |

Wave 3 fires when `active.ctx` lands (`deep-link-screen.tsx:313` gates `AppShell` on it);
wave 4 fires when `my-permissions` lands (`module-content.tsx:117` blocks all module
content on `perms === undefined`).

The four `my-permissions` in wave 3 come from `use-team-prewarm.ts:31`,
`app-shell.tsx:85`, `deep-link-screen.tsx:147` and `agent-host.tsx:24`; the two in wave 4
from `help-detail.tsx:108` and `agent-panel.tsx:46`. All six use the identical cache key
`my-perms:<teamId>` and all six call `void load()` on mount (`store.ts:281`).

### `/home` — cold load

4 (waves 1–2) + 12 (wave 3) = **16 requests, 8 unique**. `HomeScreen` itself fetches
nothing; every one of the 16 is shell/context.

### Server cost of those 24 requests

`shared/workers/d1-rest.ts:97` — one `d1Query` is one `POST` to
`https://api.cloudflare.com/client/v4/.../query`. Every gated route also pays a
`requireRight` REST hop before it reads (`gating.ts:223`). Counting per endpoint:

`active` ×2 = 2 · `my-perms` ×6 = 6 · `roles` ×2 = 6 (gate + list + count) ·
`invites` ×2 = 6 · `selectable` ×3 = 9 · `config/screens` = 2 · `help` list ×2 = 6 ·
`help/thread` = 3 · `members` = 2 · `activity` = 4 · `stakeholders` = 5.
**≈ 51 REST round trips** to paint one ticket.

---

## Arithmetic

```
DEFECT criteria:   score = clamp(0, 100, 100 − Σ penalties)
                   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria: score = Σ points earned from the rubric's table
TOTAL              = round( Σ (score × weight) / 100 )
```

### 1 · Hops per action are counted and bounded — **25** · weight 15 · coverage · GATE

| line | pts | earned | evidence |
|---|---|---|---|
| busiest screen ≤5 hops | 35 | **0** | 24 (13+ band → 0). Even the fully-deduped count is 12 unique, which is the 9–12 band → 10; either way criterion 1 stays under 40 |
| median unit of work 1–2 hops | 25 | **25** | probe `hopsPerUnit.median = 1` across 62 units |
| a hop budget written down | 20 | **0** | no number anywhere. `EDGE-CASES.md §3` gives a *rule* ("don't loop `d1Query`") and a "don't do that" table, but names no budget and bounds no screen |
| ≤3 distinct services per action | 20 | **0** | one help-ticket load touches 4 workers: auth (every `whoAmI`), tenancy, content, realtime. Under the alternative reading — the browser talks to one origin, the gateway — this line would earn 20 and criterion 1 would be 45 |

**25 < 40 → gate fires → total capped at 45.**

### 2 · No question is asked twice — **33** · weight 13 · defect

Clustered by root cause, per the rubric.

| # | severity | pen | finding |
|---|---|---|---|
| A | critical | 30 | **No in-flight de-duplication anywhere in the client.** `useCached` (`store.ts:281`) calls `void load()` on every mount and `primeCacheIfCold` (`store.ts:138`) guards only on `cache.has`, which is still false while a fetch is in flight. Result on one cold screen: `my-permissions` ×6, `selectable` ×3, `roles` ×2, `invites` ×2, the help list ×2. An identity/context call repeated on every screen load → critical. One fix |
| B | critical | 30 | **`/api/auth/me` and `/api/tenancy/active` fetched twice on every cold load** — `useActiveTeam` runs its own `load()` per instance and there are two instances (`agent-host.tsx:22`, `deep-link-screen.tsx:71`). Not fixed by A (this hook does not use `useCached`) |
| C | medium | 7 | **Write-then-read on three paths**: `role-detail.tsx:115-116` (POST perms → GET perms), `access-tokens.tsx:96-99` (POST token → GET the whole token list, discarding the created row the door returned), `access-tokens.tsx:111-112` (POST revoke → GET the list) |

100 − 67 = **33**.

Verified NOT duplicates (probe false positives): `use-active-team.ts::load` reporting
`/api/auth/me` ×2 and `/api/tenancy/active` ×2 — the probe attributed `switchTeam`,
`createTeam` and `refresh` to `load` because its declaration regex does not match
`const x = React.useCallback(...)`. The real duplication is B, across instances, which
the probe could not see. `model.ts::push` calling Anthropic twice is the retry path.

### 3 · Fetch the row, not the list — **48** · weight 13 · defect

| # | severity | pen | finding |
|---|---|---|---|
| D | high | 15 | `help-detail.tsx:81` pulls the whole (paged) ticket list to render one ticket, then `.find()`s it. `content.helpOne()` (`api.ts:473`) and the server's real single-row door (`routes/help.ts:56-64`) both exist and are unused. Because help is a GROWING paged collection (R14), a deep link to a ticket past page one renders "That ticket no longer exists" |
| E | high | 15 | `learning-detail.tsx:64-67` same pattern — the whole learning list (`LIST_HARD_CAP` = 1000 rows, each carrying the full `content_body` article HTML, `lib/learning.ts:190-195`) to render one article. `content.learningOne()` and `getLearningOne` (`lib/learning.ts:137`) exist and are unused |
| F | high | 15 | The **server's** own "one row" reads are whole-list reads: `lib/members.ts:161 oneRole` and `:152 oneMember` both run the full list read and `.find()` in JS. These are on the hot path of every role/member create, edit and deactivate (R21/R23) **and** of every row-level live patch — precisely the path CACHING rule 3 exists to make cheap |
| G | medium | 7 | `?id=` on three tenancy list doors reads the whole collection plus a `COUNT(*)`, then filters in JS: `routes/roles.ts:36-38`, `routes/invites.ts:22-24`, `routes/selectable.ts:28-29`, `routes/members.ts:15`. The content worker already does this correctly (`routes/help.ts:56`) |
| — | minor | 0 | `lib/import.ts:107 getActiveCatalog` reads the catalogue whole and filters `is_active` in JS. Bounded reference table, deliberate, and the reason is written at the line (R13 needs "off" and "never existed" to be distinguishable). The rubric's minor tier says this "is fine and only wants a comment" — it has one. No penalty |

100 − 52 = **48**.

**D, E and F are a locked decision, not an oversight.** `EDGE-CASES.md §2` ("The list
cache doubles as the detail data source") and `CACHING.md §3` state that a detail screen
deliberately has no get-one fetch. The penalty stands anyway because the decision's own
premise fails in three ways — see Findings F3.

### 4 · Nothing already in hand is fetched again — **55** · weight 12 · coverage

| line | pts | earned | evidence |
|---|---|---|---|
| loaded data passed down, not re-requested | 30 | **0** | the detail screens share the list's cache *key* (so the data is reused), but each re-declares `useCached` on it and `useCached` always revalidates on mount — so the request is made regardless. `help-detail.tsx` additionally re-requests `members` and `selectable` the shell already holds |
| a client cache with a stated freshness rule | 25 | **25** | `web/lib/store.ts` — a real cache with a documented rule: stale-while-revalidate on mount, live `invalidate` on a ping, LRU at `MAX_ENTRIES` 500 and `MAX_ROWS_PER_ENTRY` 2000, mounted keys unevictable |
| back-navigation does not refetch the unchanged | 20 | **20** | verified: leaving `/t/x/learning/<id>` for `/t/x/learning` leaves `learningQ`'s key unchanged, so its effect does not re-run and no refetch happens |
| reference data once per session | 15 | **0** | `roles`, `invites`, `selectable` are fetched twice on every team entry, and `selectable` a third time by each detail screen |
| HTTP cache headers where cacheable | 10 | **10** | `web/public/_headers` (immutable on `/_next/static/*`, no-cache on the shell), `gateway/src/index.ts:18` (immutable on `/media/*`), `shared/workers/csv.ts:62` (`no-store`) |

0 + 25 + 20 + 0 + 10 = **55**.

Probe reported `helpers.clientCache: false` — wrong. Its regex looks for
`useQuery|useSWR|queryClient`; this app has a hand-rolled cache in `web/lib/store.ts`.
Scored on the code, not the probe.

### 5 · No request per row — **51** · weight 12 · defect

| # | severity | pen | finding |
|---|---|---|---|
| H | critical | 30 | `lib/import.ts:479-494 confirmImport` writes **one internal HTTP POST per row, sequentially**, up to `MAX_IMPORT_ROWS` = 1000. Each POST costs 4–6 D1 REST hops of its own (gate + insert + activity row + the R21 "return the created row" list read + its `COUNT`). A 500-row CSV ≈ 2,500 sequential HTTPS calls. The bulk-parcel path (`writeParcel` `:407`, `packParcels`) already exists and is used by the agentic batch importer 60 lines away (`import-batch.ts:247-253`) |
| I | medium | 7 | `lib/import.ts:87-97 reconcileCatalog` runs one sequential INSERT per import target on **every** `getActiveCatalog` read — i.e. on every open of the Import screen. 5 targets today, one more per module added. `catalogByKey` (`:143-152`) already shows the cheaper heal-on-miss shape |
| J | minor | 3 | `auth/src/lib/profile.ts:92-95` — one sequential `publishChange` per team the user belongs to on every profile save. Independent; `Promise.all` would do |
| K | minor | 3 | `import-screen.tsx:75-80 addFiles` — one `batchAddFile` request per selected file, sequential. Bounded by human file selection |
| L | minor | 3 | `routes/admin.ts:29-44 migrateTeams` — one REST hop per team, sequential, over a collection that grows. Admin housekeeping, run rarely |
| M | minor | 3 | `lib/teams.ts:242-256 acceptPendingInvites` — 3 writes per pending invite, sequential. Onboarding-only, tiny N |

100 − 49 = **51**.

Read and rejected as false positives: `d1-rest.ts:29` (the retry loop),
`content/lib/notify.ts:36` and `content/lib/stakeholders.ts:73,88` (all three build an
`IN (...)` placeholder list with `.map` — a single batched query),
`tenancy/lib/teams.ts:497` (row mapping), `data-ops/lib/model.ts:327` (building the tools
array). `sharding.ts:70,126,287,330` are nightly-cron and admin-mover loops over bounded
sets — housekeeping, not a click; recorded, not penalised.

### 6 · Independent calls run together — **79** · weight 11 · defect

| # | severity | pen | finding |
|---|---|---|---|
| N | medium | 7 | `use-active-team.ts:78,83` — `auth.me()` then `tenancy.active()` serially, on the app's very first paint, so nothing renders for two full round trips. The **same file** already has the parallel version: `refresh()` at `:122` runs `Promise.all([auth.me(), tenancy.active()])` |
| O | medium | 7 | The three tenancy list doors serialise their list read and their `COUNT`: `routes/roles.ts:38`, `routes/invites.ts:24`, `routes/selectable.ts:29`. `lib/members.ts:108-124 listRoles` additionally serialises its REST read and its core-DB member-count read. The content worker already shows the fix — `routes/help.ts:45 ticketPage` uses `Promise.all` |
| P | medium | 7 | `routes/help.ts:77 getHelpThread` — `await listReplies(...)` then `await countReplies(...)`, independent; and `:58-59` `getTicket` then `countTickets`, independent |

100 − 21 = **79**.

Read and recorded as genuine dependency chains, correct as written: every
`teamContext → requireRight → read` (the gate MUST resolve first — `EDGE-CASES.md §3`
forbids `Promise.all([requireRight, d1Query])`); `getActiveContext`'s role read, which
needs `dbRow.database_id`; `targetForSession`'s `catalogById(row.table_id)`;
`onboarding/page.tsx:43,47` and `:81,82`; `access-tokens.tsx` create/revoke (write then
read — counted under criterion 2, not here). The probe's top waterfall,
`use-screen-actions.ts::useScreenActions` with 5 awaits, is a **false positive**: those
are five branches of one `switch`, never run together.

Server-side parallelism is, on the whole, unusually good here —
`lib/roles.ts:136`, `lib/stakeholders.ts:130`, `lib/teams.ts:425`, `routes/help.ts:45`
and `d1QueryAcross` all `Promise.all` independent reads with the reasoning written at the
line.

### 7 · A write updates in place — **100** · weight 9 · coverage

| line | pts | earned | evidence |
|---|---|---|---|
| local state updated from the write's own response | 40 | **40** | `applyCreated` / `applyUpdated` (`live-resources.ts:53-84`) used systematically — `use-screen-actions.ts` (all 5 actions), `help-detail.tsx:122,140`, `learning-detail.tsx`, `role-detail.tsx:129` |
| the write returns the updated record | 30 | **30** | machine-enforced base-wide by R21 (`create-returns-row`) and R23 (`mutation-returns-row`), both with anti-blindness tripwires in `web/test/rules.test.ts:544-595` |
| no full reload / router refresh after a mutation | 20 | **20** | probe `refetchAfterWrite: []`; confirmed by grep — the only `location.reload()` is `version-watch.tsx`'s deliberate post-deploy heal |
| optimistic update where safe | 10 | **10** | `help-detail.tsx:152-176` posts an optimistic reply echo with rollback; `learning-detail.tsx:96` patches the done flag locally |

**100.** Stated openly so the score is not flattering: the rubric's four lines do not
cover **post-write coarse invalidation**, of which there are five —
`use-screen-actions.ts:34,35,44,45` and `help-detail.tsx:187`
(`invalidate('help:<teamId>')` after a reply drops the entire cached ticket page and
forces a full page-one refetch plus two server `COUNT`s to move a reply count). Each
costs 1–3 extra round trips per write. Under a stricter reading of the 40-point line
this criterion would score 70 and the uncapped total would be 45 rather than 48.

### 8 · The payload is shaped for the screen — **30** · weight 6 · coverage

| line | pts | earned | evidence |
|---|---|---|---|
| endpoints return the fields the screen uses | 40 | **0** | the opposite, deliberately: `EDGE-CASES.md §2` — "the list `SELECT`s are intentionally **fat**… Don't blindly trim a list SELECT" |
| lists omit heavy fields until asked | 30 | **0** | `lib/learning.ts:190-195` ships `l.content_body`, the full article HTML, for every row of a 1000-row-capped list — twice per learning-detail load |
| pagination or a cap on anything that grows | 30 | **30** | R14, machine-enforced: `shared/workers/limits.ts` (`LIST_HARD_CAP` 1000, `THREAD_HARD_CAP` 500, `EXPORT_HARD_CAP` 10,000) plus real keyset paging with an opaque cursor and an exact total through `pagedJson` |

0 + 0 + 30 = **30**.

### 9 · First paint does not wait for everything — **30** · weight 5 · coverage

| line | pts | earned | evidence |
|---|---|---|---|
| renders with what it has, fills in the rest | 40 | **0** | `deep-link-screen.tsx:313` returns `<ShellLoading/>` until `me` **and** `active` both return (2 serial round trips), then `module-content.tsx:117` returns a skeleton until `my-permissions` returns. Nothing but a skeleton paints for 3 serial round trips |
| secondary panels load after the primary content | 30 | **30** | every section owns its `useCached` + `<Skeleton>` (`module-content.tsx:116,144,174,185,211,227,304,365,377`); a slow activity feed or stakeholder list never blocks the record |
| a slow non-critical call cannot blank the screen | 30 | **0** | one context call, `my-permissions`, gates the content of every module screen |

0 + 30 + 0 = **30**.

### 10 · Someone has measured it — **0** · weight 4 · coverage

| line | pts | earned | evidence |
|---|---|---|---|
| timings captured anywhere | 50 | **0** | direct grep for `Server-Timing`, `performance.now/mark/measure`, `Date.now() - start`, `durationMs`, `elapsed` across `web/`, `shared/`, `workers/`, `scripts/`: **two hits, both `expect()` assertions on a timeout in `workers/gateway/test/trace.test.ts`**. Nothing in the request path |
| a target exists | 30 | **0** | grep for `latency`, `p95`, `p99`, `TTFB`, `time to first` across every `.md`: zero |
| checked more than once | 20 | **0** | nothing to trend |

**0.**

### Total

| # | criterion | score | weight | score × weight |
|---|---|---|---|---|
| 1 | hops | 25 | 15 | 375 |
| 2 | duplicates | 33 | 13 | 429 |
| 3 | overfetch | 48 | 13 | 624 |
| 4 | reuse | 55 | 12 | 660 |
| 5 | nplusone | 51 | 12 | 612 |
| 6 | parallel | 79 | 11 | 869 |
| 7 | writeback | 100 | 9 | 900 |
| 8 | payload | 30 | 6 | 180 |
| 9 | firstpaint | 30 | 5 | 150 |
| 10 | measured | 0 | 4 | 0 |
| | | | **100** | **4799** |

4799 / 100 = 47.99 → **uncapped 48**. Criterion 1 = 25 < 40 → **capped: 45**.

---

## Findings

### F1 · CRITICAL — the client has no in-flight request de-duplication
`web/lib/store.ts:281` (`useCached`) and `web/lib/store.ts:138` (`primeCacheIfCold`)

Six components ask for `my-perms:<teamId>` and all six issue a network request, because
`useCached` calls `void load()` on every mount and the only guard anywhere is
`cache.has(key)` — which is still false for every caller while the first fetch is in
flight. Same shape for `selectable` (×3), `roles`, `invites` and the module list (×2
each). On a cold help-ticket load that is **9 of 24 requests** that answer a question
already being asked.

**Fix.** One `Map<string, Promise<unknown>>` in `store.ts`, consulted by both `load()`
and `primeCacheIfCold`, entry deleted in a `finally`. `invalidate(key)` must also delete
the in-flight entry, or a live patch could be overwritten by a response that was already
on the wire when the ping arrived.

### F2 · CRITICAL — the session is loaded twice on every cold start, serially
`web/lib/use-active-team.ts:74-106`, called from `agent-host.tsx:22` and `deep-link-screen.tsx:71`

`useActiveTeam` caches the session at module level but not the *load*: each instance runs
its own `load()`, and `load()` awaits `auth.me()` before `tenancy.active()`. Two
instances × two serial calls = 4 requests and 2 serial round trips before a single pixel
of app renders. The same file already knows better — `refresh()` at `:122` uses
`Promise.all([auth.me(), tenancy.active()])`.

**Fix.** A module-level `let loading: Promise<Session> | null` that both instances await,
and `Promise.all` in `load()` as `refresh()` already does. The `onboardingComplete` guard
moves after the `Promise.all` — it then costs a half-onboarded user one extra call they
currently avoid, which is the right trade for two saved round trips on every other load.

### F3 · HIGH — a record detail pulls the whole collection to render one row
`web/components/help-detail.tsx:81` · `web/components/learning-detail.tsx:64`

This is `EDGE-CASES.md §2` / `CACHING.md §3` working as designed: the detail reads its
row out of the list cache so the first tap paints instantly and one live patch updates
list and detail together. **The decision is sound; its premise has three holes.**

1. **A cold deep link has no warm list.** An emailed ticket link, a fresh tab, a reload —
   the cache is empty, so the "instant paint" benefit is zero and the cost is a full list
   read (learning: up to 1000 rows each carrying the whole article body).
2. **`useCached` revalidates on mount regardless**, so even a warm cache does not save
   the round trip. The design buys a fast *paint*, never a saved *hop*.
3. **For help it is now a correctness bug.** Help became a GROWING paged collection under
   R14. `help-detail.tsx:81` fetches page one and `.find()`s; a deep link to a ticket
   below the fold renders "That ticket no longer exists." The server-side single-row door
   was added for exactly this (`routes/help.ts:56-64` — "One ticket by id is a LOOKUP, not
   a page — answer it directly rather than filtering a page (which could legitimately not
   contain it once paged)") and the detail screen was never switched over.

**Fix (in-rule).** Keep the cache-first paint; add a fallback. If the row is not in the
cached list, call the existing single-row door (`content.helpOne` / `content.learningOne`)
and `primeCache` the result into the list key. Nothing about the shared-key live patch
changes. `EDGE-CASES.md §2` must be amended in the same commit or the docs and the code
will disagree — this is a decision the owner should sign off, not a silent edit.

### F4 · CRITICAL — the CSV import writes one row per HTTP request, sequentially
`workers/data-ops/src/lib/import.ts:479-494`

`confirmImport` loops `await writeRow(...)` over up to 1000 rows. Each `writeRow` is a
full internal POST to the gated create door, which itself pays `whoAmI` + `requireMember`
+ `requireRight` (REST) + the insert (REST) + `logActivity` (REST) + `publishChange` +
R21's "return the created row" (which for roles is `oneRole` → a whole-list read) + its
`COUNT`. A 500-row import is roughly 2,500 sequential HTTPS calls to
`api.cloudflare.com`. `EDGE-CASES.md` names this exact anti-pattern in its "don't do
that" table.

The fix already exists in the same codebase: `writeParcel` (`import.ts:407`) and
`packParcels`, used by the agentic batch importer at `import-batch.ts:247-253`, which
branches on `def.bulk` and falls back to `writeRow` only when a target has no bulk door.

**Fix.** Give `confirmImport` the same branch. Two conditions to check first: that the
bulk door still writes one activity row per record (or the audit trail loses per-row
provenance), and that R24's `bulk-twin-declared` ordering declaration for each target is
honoured — parcels here are sequential, so an `in-order` twin stays safe.

### F5 · MEDIUM — the three tenancy list doors run their list and their count serially
`workers/tenancy/src/routes/roles.ts:38` · `invites.ts:24` · `selectable.ts:29` ·
`workers/tenancy/src/lib/members.ts:108-124` · `workers/content/src/routes/help.ts:59,77`

`return json({ roles: ..., total: await countRoles(cfg, guard) })` — the count is awaited
after the list, and the two are independent. On the roles door that is 3 serial REST hops
(gate, list, count) where it could be 2 (gate, then both together). `routes/help.ts:45`
already shows the pattern: `Promise.all([listTickets(...), countTickets(...)])`.

**Fix.** `Promise.all` the pair in each. The gate stays awaited first, so
`EDGE-CASES.md §3`'s deny-before-read rule is preserved.

### F6 · MEDIUM — the server's "one row" reads are whole-list reads
`workers/tenancy/src/lib/members.ts:152 oneMember`, `:161 oneRole`

```ts
return (await listRoles(env, cfg, guard)).find((r) => r.id === id) ?? null
```

This is what every role/member create, edit and deactivate returns under R21/R23, and
what the row-level live-patch endpoint answers with. The rule exists so a client patches
one row instead of refetching a collection — and the door that serves it refetches the
collection. The reason given at the line is real (a single row must not drift in shape
from a listed one), but it is solvable with a shared projection rather than a full read.

Related: `routes/roles.ts:36-38`, `invites.ts:22-24`, `selectable.ts:28-29` and
`members.ts:15` all answer `?id=` by reading the whole collection plus a `COUNT(*)` and
filtering in JS. `routes/help.ts:56` shows the correct shape.

### F7 · MEDIUM — write-then-read, and coarse invalidation after a write
`web/components/role-detail.tsx:115-116` · `web/components/access-tokens.tsx:96-99,111-112` ·
`web/lib/use-screen-actions.ts:34,35,44,45` · `web/components/help-detail.tsx:187`

`access-tokens.create()` receives the created token from the door and then re-reads the
entire token list anyway. `role-detail.save()` POSTs the matrix and immediately GETs it
back (the door returns `{ok: true}` — permitted by R23's own text, but the client pays
for it). `help-detail.onReply` calls `invalidate('help:<teamId>')`, dropping the whole
cached ticket page and forcing a full page-one refetch plus two server counts, to move a
reply count by one.

### F8 · MEDIUM — the import catalogue self-heals on every read
`workers/data-ops/src/lib/import.ts:96-103`

`getActiveCatalog` calls `reconcileCatalog` unconditionally, which runs one sequential
`INSERT … ON CONFLICT DO NOTHING` per target before the read — every time the Import
screen opens. `catalogByKey` (`:143-152`) already has the cheaper shape: heal only on a
miss. R13's guarantee (a fresh environment's picker is never empty) survives heal-on-miss.
Confirm against the `catalog-coverage` check before changing, in case it scans for the
call site itself.

### F9 · MEDIUM — first paint waits on three serial round trips
`web/components/deep-link-screen.tsx:313` · `web/components/deep-link/module-content.tsx:117`

`me` → `active` → `my-permissions`, each gating the next thing that can render. With F2
fixed, `me` and `active` collapse to one round trip; `my-permissions` could be fetched in
the same wave rather than after, and the record could paint with its action buttons
hidden until rights land.

### F10 · MEDIUM — nothing anywhere measures a request
No `Server-Timing`, no `performance.mark`, no logged duration in any request path; no
latency or hop target in any document. This is the cheapest criterion on the list and the
reason the 24-request figure above had to be counted by hand rather than read off a
dashboard.

### F11 · MINOR — `useTeamPrewarm` duplicates reads the shell already makes
`web/lib/use-team-prewarm.ts:28-31`, called from `app-shell.tsx:70`

It primes `member_roles`, `invites`, `selectable` and `my-perms`. Every screen renders
through `DeepLinkScreen`, whose `useScreenData` fetches the first three unconditionally
(`use-screen-data.ts:43,48,73`) and whose `usePermissions` fetches the fourth. The
prewarm's stated purpose — "the first tap into a team tab paints from cache instead of a
skeleton" — is already served by those always-on reads, so today it only doubles them.

### F12 · MINOR — sequential per-team publish on profile save
`workers/auth/src/lib/profile.ts:92-95` — one `publishChange` per membership, in a loop,
all independent.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1.** In-flight de-dupe map in the client cache (F1) | `web/lib/store.ts`, `web/test/store.test.ts` | ADDS ~15 lines + a test. Removes 9 of 24 requests on a cold screen | **realtime_review** — real risk: an `invalidate` during an in-flight fetch could let a stale response overwrite a live row patch. The entry must be dropped on `invalidate`, and that needs a test. **lean_mean** — a small net add |
| **2.** Shared in-flight promise + `Promise.all` in `useActiveTeam` (F2) | `web/lib/use-active-team.ts` | REMOVES 2 of 4 session requests and 1 of 2 serial waves | **first_run_review** — parallelising past the `onboardingComplete` guard fires one `tenancy.active()` for a half-onboarded user who currently avoids it; harmless (it returns an empty context) but it is a behaviour change on the sign-up path. Neutral elsewhere |
| **3.** Delete or narrow `useTeamPrewarm` (F11) | `web/lib/use-team-prewarm.ts`, `web/components/app-shell.tsx` | REMOVES a file and 4 requests | **lean_mean** — a clear win (less code). **first_run_review** — must confirm no path renders `AppShell` without `useScreenData`; today every route goes through `DeepLinkScreen`, so none does. Note fix 1 makes this optional rather than necessary |
| **4.** Detail screens fall back to the single-row door on a cache miss (F3) | `web/components/help-detail.tsx`, `web/components/learning-detail.tsx`, **`EDGE-CASES.md §2`**, `CACHING.md §3` | ADDS ~6 lines per screen. REMOVES a full-collection read per cold detail load, and fixes the paged-help deep-link bug | **story_checks_out_review** — this contradicts a locked decision as currently written; if the code changes and the docs do not, that review correctly reports a contradiction. The doc edit must be in the same commit and the owner must approve it. **dead_end_review** benefits (removes a false "no longer exists") |
| **5.** `Promise.all` list + count in the three tenancy doors and the two content doors (F5) | `workers/tenancy/src/routes/{roles,invites,selectable}.ts`, `workers/tenancy/src/lib/members.ts`, `workers/content/src/routes/help.ts` | REMOVES 1 serial REST hop from each of the app's five hottest read doors | **scaling_review** — 2 concurrent D1 REST calls per request instead of 2 serial ones raises peak concurrency against the same database without changing the query count. **spend_review** — neutral, identical number of queries. Gate ordering is untouched, so no security effect |
| **6.** Real single-row reads for `?id=` and for `oneRole`/`oneMember` (F6) | `workers/tenancy/src/lib/members.ts`, `routes/{roles,invites,selectable,members}.ts` | ADDS a shared projection constant. REMOVES a full list read + a `COUNT` from every mutation response and every live patch | **lean_mean** — one more abstraction (the shared projection) to stop the single row drifting from the listed one; the current code chose the full read *precisely* to avoid that drift, so removing the abstraction is not an option. **interfacelessness_review** — response shape must stay byte-identical or an MCP consumer sees a changed row |
| **7.** `confirmImport` uses the existing `writeParcel` path (F4) | `workers/data-ops/src/lib/import.ts` | ADDS ~12 lines mirroring `import-batch.ts:247-253`. REMOVES up to 999 sequential HTTP requests per import | **activity_log_review** — must verify the bulk door writes one activity row per record; if it writes one per parcel, per-row provenance is lost and that review's lifecycle-cover score drops. **scaling_review** benefits. R24's ordering declaration must be honoured for any `in-order` target |
| **8.** `reconcileCatalog` heals on miss, not on every read (F8) | `workers/data-ops/src/lib/import.ts` | REMOVES 5 sequential writes per Import-screen open (one more per module added later) | **story_checks_out_review / R13** — R13's law is "the catalogue self-heals against the code on read". Heal-on-miss still satisfies the guarantee, but the wording in `RULES.md` and the `catalog-coverage` check must be confirmed to allow it. Do not change without reading the check |
| **9.** `Server-Timing` at the gateway + a written hop budget (F10) | `workers/gateway/src/index.ts`, `EDGE-CASES.md`, `CLAUDE.md` planning ritual | ADDS ~10 lines and a documented number; makes criterion 1 and 10 measurable | **spend_review** — a response header costs bytes, not requests; negligible. **speed_review** — one `Date.now()` pair per request, immaterial. **lean_mean** — a small add. Nothing else |
| **10.** Use the write's own response instead of re-reading (F7) | `web/components/access-tokens.tsx`, `web/components/role-detail.tsx` | REMOVES 2–3 requests per write on those paths | For `access-tokens` this is purely client-side — none. For `role-detail`, having the door return the saved matrix is a **response-shape change** → Tier 3: **interfacelessness_review** must confirm no MCP tool or agent tool reads `/api/tenancy/roles/permissions`' current shape. Leave the door alone and reuse the client's own draft if so |
| **11.** `Promise.all` the per-team publish on profile save (F12) | `workers/auth/src/lib/profile.ts` | REMOVES N−1 serial hops on a profile save | none — each publish targets a different team's Durable Object, so there is no ordering dependency between them and **realtime_review** is unaffected |
| **12.** Do not blank all module content on `my-permissions` (F9) | `web/components/deep-link/module-content.tsx` | REMOVES one serial wave from first paint | **security_sentry_review** — real risk: the record must render with action controls **hidden** until rights land, never shown-then-hidden. A flash of an action the user cannot perform reads as a permission leak even though the server still refuses it |

---

## CEILING

**95 is not reachable by changing code alone. The true maximum is 89** while two locked
decisions stand.

Two criteria are capped by things a commit must not decide on its own:

- **Criterion 1's 20-point "no more than 3 distinct services" line is unreachable.** One
  help-ticket load touches auth, tenancy, content and realtime. Auth is on the path of
  *every* gated request by design (`gating.ts:89` — "THE BUSIEST CROSS-SERVICE CALL IN THE
  BASE", ARCHITECTURE §1c, one session master), and realtime is a separate worker because
  the Durable Object model requires it. Merging either is relitigating ARCHITECTURE.md.
  Criterion 1 therefore caps at 80.
- **Criteria 3 and 8 are capped by `EDGE-CASES.md §2` + `CACHING.md §3`** — "the list
  cache doubles as the detail data source" and "list `SELECT`s are intentionally fat".
  While those stand, findings F3-D and F3-E (−30) hold criterion 3 at 70, and the two
  payload lines (70 points) hold criterion 8 at 30.

With every fix in the map applied and both decisions intact:
`(80×15 + 100×13 + 70×13 + 100×12 + 100×12 + 100×11 + 100×9 + 30×6 + 100×5 + 100×4) / 100`
= `(1200 + 1300 + 910 + 1200 + 1200 + 1100 + 900 + 180 + 500 + 400) / 100` = **88.9 → 89**.

**If the owner amends `EDGE-CASES.md §2`** to permit the cache-first-with-single-row-
fallback described in F3 — which the server doors already support and which fixes a real
paged-deep-link bug — criteria 3 and 8 unlock and the maximum becomes
`(8890 − 910 + 1300 − 180 + 600) / 100` = **97**. So 95 is reachable, but only through a
decision the owner makes, not a commit an agent writes.

Nothing else is capped. Criteria 2, 4, 5, 6, 7, 9 and 10 can all reach 100 by code — and
criterion 10, at zero today, is the cheapest twenty-five points on the list.
