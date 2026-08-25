# Round trip review — round 2 — Brimba · 2026-08-25
SCORE: 45/100   (round 1: 45/100)   ·   **uncapped 50** (round 1: uncapped 48)

## DELTA

Round 1: **45/100** (uncapped 48) → Round 2: **45/100** (uncapped 50)

**The reported number cannot move.** Criterion 1 scored 25, below the rubric's
gate of 40, so the total is capped at 45 — and criterion 1 did not move, because
nothing in the repair pass touched the hop count. The real delta is in the
uncapped figure: **48 → 50**, from one high finding being resolved.

| # | Criterion | wt | R1 | R2 | Why it moved |
|---|---|---|---|---|---|
| 1 | hops (GATE) | 15 | 25 | **25** | Unchanged. Re-walked the chain by hand: a cold `/t/<team>/help/<id>` is still **24 requests in 4 serial waves** answering 12 distinct questions. None of the seven files that produce waves 1–4 was touched |
| 2 | duplicates | 13 | 33 | **33** | Not addressed. Re-verified from source, not from my own report — see the confirmation section below. Still zero in-flight de-duplication |
| 3 | overfetch | 13 | 48 | **63** | **+15. Finding F (the server's own "one row" reads were whole-list reads) is resolved** — all five `one*` readers now read one row. D, E and G stand, and G is now sharper: the correct readers exist and the `?id=` doors beside them still do not call them |
| 4 | reuse | 12 | 55 | **55** | Unchanged. Detail screens still re-declare `useCached` on the list key, `useCached` still revalidates on mount, reference data is still fetched twice per team entry |
| 5 | nplusone | 12 | 51 | **51** | Unchanged. `confirmImport` still writes one HTTP POST per row, sequentially. `forwardToDoor` changed the transport, not the shape, and by its own comment adds no timeout |
| 6 | parallel | 11 | 79 | **79** | Unchanged. All three waterfalls re-opened at their current lines and all three stand |
| 7 | writeback | 9 | 100 | **100** | Score unchanged under the same reading round 1 used. **Substance got worse** — the realtime repair added two keys to help's live deps, so a reply now invalidates and refetches the very thread the R21 response just patched in. Full finding below |
| 8 | payload | 6 | 30 | **30** | Score unchanged (both losing lines were already at 0). **Substance got worse** — the activity feed now SELECTs `origin` and `verb`, and no web component renders either. Full finding below |
| 9 | firstpaint | 5 | 30 | **30** | Unchanged. `deep-link-screen.tsx:313` and `module-content.tsx:117` are byte-identical; neither file was touched |
| 10 | measured | 4 | 0 | **0** | Unchanged. Probe `helpers.perfMeasurement: []`; direct greps confirm zero |

**No criterion fell as scored.** Two — 7 and 8 — degraded in substance without
moving, because in both cases the line the repair damaged was already at zero or
already carried a stricter-reading caveat. Reporting both as findings anyway, per
the round-2 brief: a criterion that would have fallen if it had had room to fall
is the same signal.

---

## The headline confirmation: the client still has no in-flight de-duplication

Round 1's finding F1 was that six components each fire an identical `my-perms` GET
because nothing de-duplicates a request already on the wire. It was not addressed.
I re-derived it from source rather than re-reading my own report.

**The two guards, read at their current lines:**

- `web/lib/store.ts:281` — `useCached`'s mount effect ends with
  `void load() // revalidate-on-mount (first load / navigation / team switch)`.
  It is unconditional: a warm cache paints instantly *and still fetches*.
- `web/lib/store.ts:139` — `primeCacheIfCold` opens with `if (cache.has(key)) return`.
  `cache.has` is still **false** for every caller while the first fetch is in flight.

**No in-flight map exists.** `grep -n "inflight\|inFlight\|pending\|Map<string, Promise"`
over `web/lib/store.ts` returns nothing.

**The six callers are all still there**, all on the identical key `my-perms:<teamId>`
(`web/lib/perms.ts:24`):

| # | call site | wave |
|---|---|---|
| 1 | `web/lib/use-team-prewarm.ts:31` (`primeCacheIfCold`) | 3 |
| 2 | `web/components/app-shell.tsx:85` (`usePermissions`) | 3 |
| 3 | `web/components/deep-link-screen.tsx:147` | 3 |
| 4 | `web/components/agent-host.tsx:24` | 3 |
| 5 | `web/components/help-detail.tsx:126` | 4 |
| 6 | `web/components/agent-panel.tsx:46` | 4 |

`usePermissions` now has **ten** call sites base-wide (round 1: the six on this
screen). The other four are on screens that do not co-mount with help.

Same shape, unchanged, for `selectable` (×3), `roles` (×2), `invites` (×2) and the
help list (×2). **On one cold help-ticket load that is 9 of 24 requests answering
a question already being asked.**

---

## The measured hop counts

Counted by hand, following `web/app/layout.tsx` → `AgentHost` + `DeepLinkScreen` →
`AppShell` → `useScreenData` → the module component. Effects commit child-first,
and neither `useCached` nor `primeCacheIfCold` has an in-flight guard, so
components sharing a cache key all fire in the same commit.

### `/t/<team>/help/<id>` — cold load (still the worst screen)

| wave | requests | what fires |
|---|---|---|
| 1 | 2 | `GET /api/auth/me` ×2 — `useActiveTeam` instantiated twice (`agent-host.tsx:22`, `deep-link-screen.tsx:71`) |
| 2 | 2 | `GET /api/tenancy/active` ×2 — serial after wave 1 inside each instance (`use-active-team.ts:78` then `:83`) |
| 3 | 12 | `my-permissions` ×4 · `roles` ×2 · `invites` ×2 · `selectable` ×2 · `config/screens` ×1 · `content/help?scope=all` ×1 |
| 4 | 8 | `content/help?scope=all` (2nd) · `help/thread` · `members` · `activity?scope=record` · `selectable` (3rd) · `help/stakeholders` · `my-permissions` ×2 |
| | **24** | **12 unique endpoints** |

**Plus one, conditionally.** `help-detail.tsx:98-101` now declares a fifth query:

```ts
const oneQ = useCached<HelpTicket | null>(
  listSettled && !fromList ? `help-one:${helpId}` : null,
  () => content.helpOne(helpId)
)
```

`useCached` returns early on a null key, so when the ticket **is** in the loaded
page the request is never made and the count stays at 24. When the ticket is
**past page one**, the count becomes **25** — and the screen renders instead of
lying. That is a correctness fix bought with one request, and it is the right
trade; it is recorded here so the hop count is honest, not to argue against it.

None of the seven files that produce waves 1–4 was modified in this repair pass
(`git diff 8751e30..HEAD` touches `help-detail.tsx`, `live-resources.ts` and
`layout.tsx` on the client, and nothing else in `web/`).

### `/home` — cold load

4 (waves 1–2) + 12 (wave 3) = **16 requests, 8 unique**. `HomeScreen` fetches
nothing; every one of the 16 is shell/context. Unchanged.

### Server cost of those 24 requests

`shared/workers/d1-rest.ts` — one `d1Query` is one `POST` to
`api.cloudflare.com/client/v4/.../query`. Every gated route also pays a
`requireRight` REST hop before it reads.

`active` ×2 = 2 · `my-perms` ×6 = 6 · `roles` ×2 = 6 (gate + list + count) ·
`invites` ×2 = 6 · `selectable` ×3 = 9 · `config/screens` = 2 · `help` list ×2 = 6 ·
`help/thread` = 3 · `members` = 2 · `activity` = 4 · `stakeholders` = 5.
**≈ 51 REST round trips** to paint one ticket. Unchanged.

---

## Arithmetic

```
DEFECT    = clamp(0, 100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  = Σ points earned from the rubric's table
TOTAL     = round( Σ (score × weight) / 100 )
```

Probe: `node ~/.claude/skills/round_trip_review/assets/probe.mjs .` →
`transport.endpointsMapped: 74`, `scanned.callSites: 90`, `files: 279`,
`hopsPerUnit.median: 1` across 59 units, `helpers.perfMeasurement: []`. Discovery
succeeded, so the counts below rest on a real map. Every hit was opened; false
positives are named.

### 1 · Hops per action are counted and bounded — **25** · weight 15 · coverage · GATE · unchanged

| line | pts | earned | evidence |
|---|---|---|---|
| busiest screen ≤5 hops | 35 | **0** | 24 (13+ band → 0). Even fully deduped it is 12 unique → the 9–12 band → 10; either way criterion 1 stays under 40 |
| median unit of work 1–2 hops | 25 | **25** | probe `hopsPerUnit.median = 1` across 59 units |
| a hop budget written down | 20 | **0** | still no number anywhere. `EDGE-CASES.md §3` gives a *rule* ("don't loop `d1Query`") and a "don't do that" table, but names no budget and bounds no screen. `grep -rniE "p95\|p99\|ttfb\|latency"` across every non-`reviews/` `.md` → zero |
| ≤3 distinct services per action | 20 | **0** | one help-ticket load still touches 4 workers: auth (every `whoAmI`), tenancy, content, realtime |

**25 < 40 → gate fires → total capped at 45.**

### 2 · No question is asked twice — **33** · weight 13 · defect · unchanged

| # | sev | pen | finding | verified at |
|---|---|---|---|---|
| A | critical | 30 | **No in-flight de-duplication anywhere in the client.** See the confirmation section above | `web/lib/store.ts:281`, `:139` |
| B | critical | 30 | **`/api/auth/me` and `/api/tenancy/active` fetched twice on every cold load.** `useActiveTeam` still runs its own `load()` per instance, and there are still exactly two instances on this screen. Not fixed by A — this hook does not use `useCached`. Confirmed independently by the probe: `hopsPerUnit.worst[0]` is `use-active-team.ts::load` at 6 hops with `/api/auth/me ×2` and `/api/tenancy/active ×2` | `use-active-team.ts:76-100`; `agent-host.tsx:22`, `deep-link-screen.tsx:71` |
| C | medium | 7 | **Write-then-read on three paths.** `role-detail.tsx:115-116` (`await tenancy.saveRolePermissions(...)` then `await tenancy.rolePermissions(...)`); `access-tokens.tsx:96` and `:111` (both `primeCache("mcp-tokens", await mcp.tokens()...)` — the create discards the row the door returned and re-reads the whole list) | as cited |

100 − 67 = **33.**

Verified NOT duplicates (probe false positives, re-checked this round):
`model.ts::push` calling Anthropic twice is the retry path. The probe attributes
`switchTeam`, `createTeam` and `refresh` to `load` because its declaration regex
does not match `const x = React.useCallback(...)` — the real duplication is B,
across instances, which the probe cannot see.

### 3 · Fetch the row, not the list — **63** · weight 13 · defect · **+15**

| # | sev | pen | finding |
|---|---|---|---|
| D | high | 15 | `help-detail.tsx:81` still calls `content.help("all")` — **the list endpoint** — to render one ticket, then `.find()`s it. The rubric's `high` tier is "a list endpoint called to render a single record's detail", and that is still exactly what happens. The fallback added at `:98-101` is **additive**: it fires only when the list does *not* contain the ticket, so the list call is unchanged and a deep link past page one now costs the list *plus* the row. **The correctness half is genuinely fixed** — a ticket below the fold renders instead of showing "That ticket no longer exists" — but that was `dead_end_review`'s finding, not a tier in this criterion |
| E | high | 15 | `learning-detail.tsx:64-67` **untouched**: `useCached<Learning[]>('learning:<team>')` then `.find()`. The whole learning list, `LIST_HARD_CAP = 1000` rows each carrying the full `content_body` article HTML, to render one article. `content.learningOne()` and the server's `oneLearning` — which was rewritten this round into a real `WHERE l.id = ? LIMIT 1` read — both exist and are still unused by this screen |
| F | ~~high~~ | ~~15~~ | **RESOLVED.** `oneRole` and `oneMember` (`workers/tenancy/src/lib/members.ts:213`, `:194`) are now targeted single-row reads sharing `ROLE_COLUMNS`/`MEMBER_SELECT` and `toRole`/`toMember` with the list. Same for `oneLearning` (`learning.ts:217`), `oneSelectable` (`selectable.ts:62`) and `oneInvite` (`invites.ts:122`). I opened all five. Three still cost two round trips (a row plus a join or a count); none reads a collection |
| G | medium | 7 | `?id=` on four tenancy/content list doors **still** reads the whole collection plus a `COUNT(*)` and filters in JS: `routes/roles.ts:38`, `invites.ts:24`, `selectable.ts:29`, `members.ts:16`, and `workers/content/src/routes/learning.ts:38`. `routes/help.ts:56` still shows the correct shape and says why at the line |
| — | minor | 0 | `import.ts:107 getActiveCatalog` reads the catalogue whole and filters `is_active` in JS. Bounded reference table, deliberate, reason written at the line. No penalty |

100 − 37 = **63.**

**G is now the sharper half of what F was.** The repair fixed the mutation
*response* path — what a create/edit/deactivate hands back — and left the *live
re-pull* path alone. `web/lib/store.ts:patchRow` answers a "row X changed" ping by
calling `TEAM_RESOURCES[r].fetchOne(id)`, which resolves to exactly these `?id=`
doors. So every row-level live patch on roles, invites, dropdown values, members
and learning still costs a full list read plus a `COUNT` — on the path CACHING
rule 3 exists to make cheap. The correct reader now sits in the same file, a few
lines away, unused. This is five one-line changes.

### 4 · Nothing already in hand is fetched again — **55** · weight 12 · coverage · unchanged

| line | pts | earned | evidence |
|---|---|---|---|
| loaded data passed down, not re-requested | 30 | **0** | detail screens share the list's cache *key*, but each re-declares `useCached` and `useCached` always revalidates on mount (`store.ts:281`) — so the request is made regardless. `help-detail.tsx` additionally re-requests `members` (`:112`) and `selectable` (`:118`) the shell already holds |
| a client cache with a stated freshness rule | 25 | **25** | `web/lib/store.ts` — a real cache with a documented rule: stale-while-revalidate on mount, live `invalidate` on a ping, LRU at `MAX_ENTRIES` 500 and `MAX_ROWS_PER_ENTRY` 2000, mounted keys unevictable. Probe `helpers.clientCache: false` is wrong — its regex looks for `useQuery\|useSWR\|queryClient` and this cache is hand-rolled. Scored on the code |
| back-navigation does not refetch the unchanged | 20 | **20** | re-verified: leaving `/t/x/learning/<id>` for `/t/x/learning` leaves `learningQ`'s key unchanged, so its effect does not re-run |
| reference data once per session | 15 | **0** | `roles`, `invites`, `selectable` still fetched twice on every team entry (prewarm + `useScreenData`), and `selectable` a third time by each detail screen |
| HTTP cache headers where cacheable | 10 | **10** | `web/public/_headers`, `gateway/src/index.ts` (immutable on `/media/*`), `shared/workers/csv.ts` (`no-store`) |

0 + 25 + 20 + 0 + 10 = **55.**

### 5 · No request per row — **51** · weight 12 · defect · unchanged

| # | sev | pen | finding |
|---|---|---|---|
| H | critical | 30 | `workers/data-ops/src/lib/import.ts:497-511` — `confirmImport` still writes **one internal HTTP POST per row, sequentially**, up to `MAX_IMPORT_ROWS = 1000`. Verified verbatim: `for (const r of parsed.rows) { … const out = await writeRow(...) }`. The repair rerouted `writeRow` through `forwardToDoor` (`import.ts:388`), which adds the request id and an `origin: "import"` stamp and, by its own comment at `shared/workers/http.ts:58-60`, **deliberately adds no timeout**. The bulk-parcel path (`writeParcel` at `import.ts:415`, `packParcels`) still exists and is still used only by the agentic batch importer 60 lines away, which branches on `def.bulk`. **`confirmImport` still has no such branch** |
| I | medium | 7 | `import.ts:89-100 reconcileCatalog` still runs one sequential `INSERT … ON CONFLICT DO NOTHING` per target on **every** `getActiveCatalog` read (`:105` — `await reconcileCatalog(env)`, unconditional), i.e. on every open of the Import screen. `catalogByKey` still shows the cheaper heal-on-miss shape |
| J | minor | 3 | `workers/auth/src/lib/profile.ts:89-95` — still `for (const t of teams.results ?? []) await publishChange(...)`, one per membership, all independent |
| K | minor | 3 | `import-screen.tsx:75-80 addFiles` — one `batchAddFile` per selected file, sequential. Probe still reports `callsInLoop: 1`. Bounded by human file selection |
| L | minor | 3 | `routes/admin.ts:29-44 migrateTeams` — one REST hop per team, sequential, over a growing collection |
| M | minor | 3 | `lib/teams.ts acceptPendingInvites` — 3 writes per pending invite, sequential. Onboarding-only, tiny N |

100 − 49 = **51.**

**What genuinely improved inside H, and why the score does not move.** Each
`writeRow` lands on a create door that finishes with `oneX(...)`, and all five of
those now read one indexed row instead of a 1,000-row list. A 500-row import was
roughly 2,500 sequential HTTPS calls **plus 500 full-table reads**; the latter term
is gone. But this criterion measures **requests per row**, and that is still
exactly one. The multiplier shrank; the loop did not.

Read and re-rejected as false positives: `d1-rest.ts` (the retry loop);
`content/lib/notify.ts` and `content/lib/stakeholders.ts` (all three build an
`IN (...)` placeholder list with `.map` — a single batched query);
`tenancy/lib/teams.ts` (row mapping); `data-ops/lib/model.ts` (building the tools
array). `sharding.ts`'s cron and admin-mover loops are housekeeping over bounded
sets — recorded, not penalised.

### 6 · Independent calls run together — **79** · weight 11 · defect · unchanged

| # | sev | pen | finding |
|---|---|---|---|
| N | medium | 7 | `use-active-team.ts:78` then `:83` — `await auth.me()` then `await tenancy.active()`, serially, on the app's very first paint, so nothing renders for two full round trips. The **same file** still has the parallel version at `:122`: `Promise.all([auth.me(), tenancy.active()])` |
| O | medium | 7 | The list doors still serialise their list read and their `COUNT`: `routes/roles.ts:38`, `invites.ts:24`, `selectable.ts:29` — all still `json({ x: …, total: await countX(...) })`. `lib/members.ts:126-140 listRoles` additionally serialises its REST read and its core-DB member-count read. `routes/help.ts:45` still shows the fix in the same codebase: `Promise.all([listTickets(...), countTickets(...)])` |
| P | medium | 7 | `workers/content/src/routes/help.ts:77 getHelpThread` — `await listReplies(...)` then `await countReplies(...)`, independent; and `:59-60`, the `?id=` branch, `await getTicket(...)` then `await countTickets(...)`, independent |

100 − 21 = **79.**

**One repair added a `Promise.all`, correctly.** The privilege-amplification guard
at `workers/tenancy/src/lib/roles.ts:226` reads two permission sheets and wraps
them in `Promise.all`. It costs the permissions-save door two extra REST hops (a
`speed_review` concern, not this one) but it does not add a waterfall.

Genuine dependency chains, correct as written and recorded as clean: every
`teamContext → requireRight → read` (the gate MUST resolve first —
`EDGE-CASES.md §3` forbids `Promise.all([requireRight, d1Query])`);
`getActiveContext`'s role read; `targetForSession`'s `catalogById`;
`onboarding/page.tsx`. The probe's top waterfall, `use-screen-actions.ts` with 5
awaits, is still a false positive: five branches of one `switch`, never run
together. Server-side parallelism remains unusually good — `lib/roles.ts:136`,
`stakeholders.ts:130`, `teams.ts:425`, `routes/help.ts:45` and `d1QueryAcross` all
`Promise.all` independent reads with the reasoning written at the line.

### 7 · A write updates in place — **100** · weight 9 · coverage · unchanged score, **degraded substance**

| line | pts | earned | evidence |
|---|---|---|---|
| local state updated from the write's own response | 40 | **40** | `applyCreated` / `applyUpdated` (`live-resources.ts`) used systematically — `use-screen-actions.ts` (all 5 actions), `help-detail.tsx:141,157`, `learning-detail.tsx`, `role-detail.tsx` |
| the write returns the updated record | 30 | **30** | machine-enforced base-wide by R21 and R23, both with anti-blindness tripwires in `web/test/rules.test.ts` |
| no full reload / router refresh after a mutation | 20 | **20** | probe `refetchAfterWrite: []`; the only `location.reload()` is `version-watch.tsx`'s deliberate post-deploy heal |
| optimistic update where safe | 10 | **10** | `help-detail.tsx:170-195` posts an optimistic reply echo with rollback; `learning-detail.tsx` patches the done flag locally |

**100** — and, stated openly so the score is not flattering, this criterion got
**worse in substance this round**. The rubric's four lines do not cover post-write
coarse invalidation. Round 1 found five (`use-screen-actions.ts:34,35,44,45` and
`help-detail.tsx:187`, now `:192`); all five stand. The realtime repair added a
sixth path — see finding F13 below. Under the stricter reading of the 40-point
line this criterion would be **70** and the uncapped total **47** rather than 50.

### 8 · The payload is shaped for the screen — **30** · weight 6 · coverage · unchanged score, **degraded substance**

| line | pts | earned | evidence |
|---|---|---|---|
| endpoints return the fields the screen uses | 40 | **0** | the opposite, deliberately: `EDGE-CASES.md:113` — "the list `SELECT`s are intentionally **fat**… Don't blindly trim a list SELECT". **And now one instance that is not deliberate:** `workers/tenancy/src/lib/activity-read.ts:104` SELECTs `origin` and `verb`, and no web component renders either — see finding F14 |
| lists omit heavy fields until asked | 30 | **0** | `LEARNING_SELECT` (`workers/content/src/lib/learning.ts:188-193`) still ships `l.content_body`, the full article HTML, for every row of a 1000-row-capped list — twice per learning-detail load |
| pagination or a cap on anything that grows | 30 | **30** | R14, machine-enforced: `shared/workers/limits.ts` (`LIST_HARD_CAP` 1000, `THREAD_HARD_CAP` 500, `EXPORT_HARD_CAP` 10,000) plus real keyset paging with an opaque cursor and an exact total through `pagedJson` |

0 + 0 + 30 = **30.** The new regression cannot lower a line already at zero, which
is the only reason the number holds.

### 9 · First paint does not wait for everything — **30** · weight 5 · coverage · unchanged

| line | pts | earned | evidence |
|---|---|---|---|
| renders with what it has, fills in the rest | 40 | **0** | `deep-link-screen.tsx:313` still returns `<ShellLoading/>` until `me` **and** `active` both return (2 serial round trips), then `module-content.tsx:117` still returns a skeleton until `my-permissions` returns. Nothing but a skeleton paints for 3 serial round trips. Neither file was modified |
| secondary panels load after the primary content | 30 | **30** | every section owns its `useCached` + `<Skeleton>`; a slow activity feed or stakeholder list never blocks the record |
| a slow non-critical call cannot blank the screen | 30 | **0** | one context call, `my-permissions`, still gates the content of every module screen |

0 + 30 + 0 = **30.**

### 10 · Someone has measured it — **0** · weight 4 · coverage · unchanged

| line | pts | earned | evidence |
|---|---|---|---|
| timings captured anywhere | 50 | **0** | probe `helpers.perfMeasurement: []`. Direct greps: `Server-Timing` → 0 in code; `performance.now/mark/measure` → 0; duration words across `shared/`, all seven `workers/*/src`, `web/lib`, `web/components`, `web/app`, `scripts/` → 1 hit, the word "latency" in a comment at `workers/realtime/src/index.ts:157`; `Date.now() - start` → 2 hits, both `expect()` assertions in `workers/gateway/test/trace.test.ts` |
| a target exists | 30 | **0** | grep for `latency`, `p95`, `p99`, `TTFB`, `time to first` across every non-`reviews/` `.md`: zero |
| checked more than once | 20 | **0** | nothing to trend |

**0.**

### Total

| # | criterion | score | weight | score × weight |
|---|---|---|---|---|
| 1 | hops | 25 | 15 | 375 |
| 2 | duplicates | 33 | 13 | 429 |
| 3 | overfetch | 63 | 13 | 819 |
| 4 | reuse | 55 | 12 | 660 |
| 5 | nplusone | 51 | 12 | 612 |
| 6 | parallel | 79 | 11 | 869 |
| 7 | writeback | 100 | 9 | 900 |
| 8 | payload | 30 | 6 | 180 |
| 9 | firstpaint | 30 | 5 | 150 |
| 10 | measured | 0 | 4 | 0 |
| | | | **100** | **4994** |

4994 / 100 = 49.94 → **uncapped 50**. Criterion 1 = 25 < 40 → **capped: 45**.

---

## Findings

Round-1 numbering kept where the finding is the same, so the two reports read side
by side. New findings from this round carry **NEW**.

### F1 · CRITICAL — the client still has no in-flight request de-duplication
`web/lib/store.ts:281` (`useCached`) · `web/lib/store.ts:139` (`primeCacheIfCold`)

Six components ask for `my-perms:<teamId>` and all six issue a network request.
Same shape for `selectable` (×3), `roles`, `invites` and the module list (×2 each).
On a cold help-ticket load that is **9 of 24 requests** answering a question
already being asked. Full evidence in the confirmation section above.

**Fix, unchanged.** One `Map<string, Promise<unknown>>` in `store.ts`, consulted by
both `load()` and `primeCacheIfCold`, entry deleted in a `finally`.
**`invalidate(key)` must also delete the in-flight entry**, or a live patch could be
overwritten by a response that was already on the wire when the ping arrived —
and that risk is now *higher* than it was in round 1, because the realtime repair
added two more keys that `invalidate` fires on (F13). The test must cover it.

### F2 · CRITICAL — the session is still loaded twice on every cold start, serially
`web/lib/use-active-team.ts:74-100`, called from `agent-host.tsx:22` and `deep-link-screen.tsx:71`

`useActiveTeam` caches the session at module level but not the *load*: each
instance runs its own `load()`, and `load()` awaits `auth.me()` (`:78`) before
`tenancy.active()` (`:83`). Two instances × two serial calls = 4 requests and 2
serial round trips before a single pixel renders. The same file already knows
better — `refresh()` at `:122` uses `Promise.all([auth.me(), tenancy.active()])`.
The probe independently ranks this the worst unit in the app (6 hops).

**Fix, unchanged.** A module-level `let loading: Promise<Session> | null` that both
instances await, and `Promise.all` in `load()` as `refresh()` already does. The
`onboardingComplete` guard moves after the `Promise.all`, costing a half-onboarded
user one extra call they currently avoid — the right trade for two saved round
trips on every other load.

### F3 · HIGH — a record detail still pulls the collection to render one row, and now the doc says it does not
`web/components/help-detail.tsx:81` · `web/components/learning-detail.tsx:64` · **`EDGE-CASES.md:92-121` (unamended)**

Round 1 proposed exactly the fix that landed for help: keep the cache-first paint,
add a single-row fallback on a cache miss. It works, it is well-commented, and it
fixes a real paged-deep-link bug. **The doc edit that was supposed to land in the
same commit did not.** `git diff 8751e30..HEAD -- EDGE-CASES.md CACHING.md` is
empty, and `EDGE-CASES.md:94` still reads:

> "A record-detail screen has no 'get one record' fetch. It reads the one record
> **out of the cached list**."

That is now false for `help-detail.tsx`, which has exactly such a fetch at line 99.
Round 1's fix map said, of this fix: *"this contradicts a locked decision as
currently written; if the code changes and the docs do not, `story_checks_out`
correctly reports a contradiction. The doc edit must be in the same commit and the
owner must approve it."* Half of that happened.

The base is now in the worst position of the three available: it pays the
decision's cost (a full list read to render one detail, on **both** screens) and
has broken the decision's claim on one of them, without anyone having decided to.

**Two things to do, and they are separable.**
1. **Amend `EDGE-CASES.md §2`** to describe what the code now does: cache-first
   paint, single-row door on a miss, shared key so one live patch still updates
   list and detail together. This is an owner decision, not a silent edit — but
   it is now *required regardless of the ceiling*, because the doc is false.
2. **Give `learning-detail.tsx` the same nine lines.** It is the more expensive of
   the two: `LIST_HARD_CAP = 1000` rows each carrying the whole article body, and
   `content.learningOne()` plus the server's freshly-rewritten `oneLearning` both
   already exist and are unused.

**One implementation note, found while verifying.** The guard at `help-detail.tsx:203`
(`if (!ticket && oneQ.loading) return <Skeleton/>`) does not quite achieve what its
comment says. `useCached` initialises `loading` from `key ? !cache.has(key) : false`
(`store.ts:229`), and `useState`'s initialiser does not re-run when the key changes
from `null` to `help-one:<id>`. On the single render where the list settles without
the ticket, `oneQ.loading` is still `false`, so **"That ticket no longer exists"
paints for one frame** before the effect sets `loading` and the skeleton replaces
it. One frame, so barely visible — but it is exactly the flash the comment says it
prevents. *Fix:* gate on the key instead of the flag —
`if (!ticket && listSettled && oneQ.data === undefined) return <Skeleton/>`.

### F4 · CRITICAL — the CSV import still writes one row per HTTP request, sequentially
`workers/data-ops/src/lib/import.ts:497-511`

`confirmImport` still loops `await writeRow(...)` over up to 1000 rows. Each
`writeRow` is a full internal POST to the gated create door, which pays `whoAmI` +
`requireMember` + `requireRight` (REST) + the insert (REST) + `logActivity` (REST)
+ `publishChange` + R21's created-row read + its `COUNT`. `EDGE-CASES.md` names
this exact anti-pattern in its "don't do that" table.

**What changed and what did not.** The repair rerouted the call through
`forwardToDoor` (`import.ts:388`) so the hop carries the trace id and stamps
`origin: "import"` — a real win for `architecture_review` and
`activity_log_review`. It is not a batching change: `forwardToDoor` sends one
request per call and, by its own comment, adds no timeout. Separately, the
five `oneX` readers being fixed removed a 1,000-row list read from *each* of those
1,000 requests, which is a large real improvement in duration. **Requests per row
is still one.**

**Fix, unchanged.** Give `confirmImport` the same `def.bulk` branch
`import-batch.ts:247-253` already has. Two conditions first: that the bulk door
writes one activity row per record (or R25 loses per-row provenance), and that
R24's ordering declaration for each target is honoured.

### F5 · MEDIUM — the list doors still run their list and their count serially
`workers/tenancy/src/routes/roles.ts:38` · `invites.ts:24` · `selectable.ts:29` ·
`workers/tenancy/src/lib/members.ts:126-140` · `workers/content/src/routes/help.ts:60,77`

`return json({ roles: ..., total: await countRoles(cfg, guard) })` — the count is
awaited after the list and the two are independent. On the roles door that is 3
serial REST hops (gate, list, count) where it could be 2. `routes/help.ts:45`
already shows the pattern. **Fix:** `Promise.all` the pair in each; the gate stays
awaited first, so `EDGE-CASES.md §3`'s deny-before-read rule is preserved.

### F6 · MEDIUM — the `?id=` doors still read the whole collection, and the correct readers now exist beside them
`workers/tenancy/src/routes/roles.ts:38` · `invites.ts:24` · `selectable.ts:29` · `members.ts:16` · `workers/content/src/routes/learning.ts:38`

Round 1's F6 had two halves. The half about `oneRole`/`oneMember` is **fixed**. The
half about `?id=` is not, and it is the half on the hot path: `patchRow` answers
every row-level live ping by calling `fetchOne(id)`, which resolves to these doors.
Every "row X changed" ping on roles, invites, dropdown values, members or learning
still costs a full list read plus a `COUNT` to update one row.

**Fix.** Five one-line changes — call the `oneX` that now exists. Response shape
must stay byte-identical, which the new shared projections
(`ROLE_COLUMNS`, `MEMBER_SELECT`, `LEARNING_SELECT`, `toRole`, `toMember`,
`toInvite`, `toValue`) now guarantee structurally rather than by reading
everything. `R16`'s `total` stays on the response; only the list read goes.

### F7 · MEDIUM — write-then-read, and coarse invalidation after a write
`web/components/role-detail.tsx:115-116` · `web/components/access-tokens.tsx:96,111` ·
`web/lib/use-screen-actions.ts:34,35,44,45` · `web/components/help-detail.tsx:192`

`access-tokens.create()` receives the created token from the door and re-reads the
entire token list anyway. `role-detail.save()` POSTs the matrix and immediately
GETs it back. `help-detail.onReply` calls `invalidate('help:<teamId>')`, dropping
the whole cached ticket page and forcing a full page-one refetch plus two server
counts, to move a reply count by one. All five unchanged.

### F8 · MEDIUM — the import catalogue still self-heals on every read
`workers/data-ops/src/lib/import.ts:105`

`getActiveCatalog` still calls `await reconcileCatalog(env)` unconditionally,
which runs one sequential `INSERT … ON CONFLICT DO NOTHING` per target before the
read — every time the Import screen opens. 5 targets today, one more per module
added. `catalogByKey` already has the cheaper heal-on-miss shape, and R13's
guarantee (a fresh environment's picker is never empty) survives it. Confirm
against the `catalog-coverage` check before changing, in case it scans for the
call site itself.

### F9 · MEDIUM — first paint still waits on three serial round trips
`web/components/deep-link-screen.tsx:313` · `web/components/deep-link/module-content.tsx:117`

`me` → `active` → `my-permissions`, each gating the next thing that can render.
Neither file was touched. With F2 fixed, `me` and `active` collapse to one round
trip; `my-permissions` could be fetched in the same wave rather than after.

### F10 · MEDIUM — nothing anywhere measures a request
No `Server-Timing`, no `performance.mark`, no logged duration in any request path;
no latency or hop target in any document. Two rounds. This is still the cheapest
criterion on the list and the reason the 24-request figure above had to be counted
by hand rather than read off a dashboard. `speed_review`'s round-2 report writes
out the forty lines that fix it; the gateway wrapper it proposes is the same one
this review's F10 asked for, so **do not do it twice**.

### F11 · MINOR — `useTeamPrewarm` still duplicates reads the shell already makes
`web/lib/use-team-prewarm.ts:28-31`, called from `app-shell.tsx:70`

It primes `member_roles`, `invites`, `selectable` and `my-perms`. Every screen
renders through `DeepLinkScreen`, whose `useScreenData` fetches the first three
unconditionally and whose `usePermissions` fetches the fourth. Today it only
doubles them. Note F1 makes this optional rather than necessary.

### F12 · MINOR — sequential per-team publish on profile save
`workers/auth/src/lib/profile.ts:89-95` — one `publishChange` per membership, in a
loop, all independent.

### F13 · MEDIUM · **NEW, caused by the realtime repair** — a reply now refetches the thread it just patched
`web/lib/live-resources.ts:236-242` · `web/components/app-shell.tsx:155` · `web/components/help-detail.tsx:170-195`

The realtime review correctly found that `help`'s live `deps` array was missing the
conversation, so two people replying to one ticket each saw only their own replies.
The fix added `help-thread:${id}` and `total:help-thread:${id}` to the array. It is
the right fix for that bug. **It also costs a round trip on every reply, for the
person who wrote it.**

The chain: `postHelpReply` publishes `help_threads` add **and** `help` edit
(`workers/content/src/routes/help.ts:198,200`). The `help` edit ping lands in
`app-shell.tsx:155`, which runs `for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)`.
`invalidate` deletes the key and notifies (`store.ts:98-101`), and a mounted
subscriber whose key has been deleted falls through to a real refetch
(`store.ts:258-266`). So `help-thread:<id>` is refetched — **discarding the exact
value `onReply` had just written into it from the door's own R21 response**
(`help-detail.tsx:188`).

Net effect per reply, for every viewer including the author: one extra
`GET /api/content/help/thread` (3 REST hops), plus the `total:` sidecar blanking
until that fetch re-primes it. On top of the pre-existing
`invalidate('help:<teamId>')` at `:192`, a single reply now costs roughly six
round trips.

**Fix (keeps the realtime correctness).** Have the `help_threads` ping row-patch
the thread rather than having the `help` ping invalidate it — `help_threads`
already carries the reply id (`replyId`), so `patchRow` can append one message
instead of refetching the whole conversation. Failing that, skip the dep
invalidation on the client that originated the write. Either way this needs
`realtime_review`'s agreement, because the correctness they bought must not be
given back.

### F14 · MINOR · **NEW, caused by the activity-log repair** — two columns cross the wire with no reader
`workers/tenancy/src/lib/activity-read.ts:104,120-121` · `shared/types.ts:154-168` · `web/components/help-detail.tsx:232-237`

The activity-log review added `origin` and `verb` to the activity `SELECT`, with a
comment arguing — correctly — that "a column nothing reads is not an audit trail,
it is a cost". The read was added and the reader was not. `ActivityItem` carries
both fields, `getActivity` returns both, and the only mapping into the UI drops
both:

```ts
const activityItems: ActivityFeedItem[] = (activityQ.data ?? []).map((a) => ({
  id: a.id, description: a.description, actor: a.actorName ?? undefined,
  timestamp: formatActivityWhen(a.createdAt),
}))
```

`grep -rn "\.origin\b|\.verb\b" web/components web/lib` returns exactly one hit,
and it is `help-stakeholders.tsx:86` on an unrelated type. So two short strings ×
`PAGE_SIZE = 50` rows travel on every page of every activity feed — team feed,
record feed, user feed — for nothing today.

Small, and honestly reported as small. It is a finding because it is the exact
shape the repair's own comment argued against, one layer out: the cost moved from
the database to the wire instead of being closed. *Fix, either way:* render them
(the door provenance is genuinely useful in a feed — "changed via MCP" answers the
first question anyone asks), or drop them from the projection until a screen wants
them.

---

## FIX IMPACT MAP

Round-1 rows that are now DONE are kept and marked, because the campaign's value
is the record of what a fix cost. New rows carry **NEW**.

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1.** In-flight de-dupe map in the client cache (F1) | `web/lib/store.ts`, `web/test/store.test.ts` | ADDS ~15 lines + a test. Removes 9 of 24 requests on a cold screen | **realtime_review** — real risk, and **higher than in round 1**: `invalidate` now fires on two more help keys, so an in-flight response landing after a ping could overwrite a live row patch. The entry must be dropped on `invalidate`, and that needs a test. **lean_mean** — a small net add |
| **2.** Shared in-flight promise + `Promise.all` in `useActiveTeam` (F2) | `web/lib/use-active-team.ts` | REMOVES 2 of 4 session requests and 1 of 2 serial waves | **first_run_review** — parallelising past the `onboardingComplete` guard fires one `tenancy.active()` for a half-onboarded user who currently avoids it; harmless (it returns an empty context) but it is a behaviour change on the sign-up path |
| **3.** Delete or narrow `useTeamPrewarm` (F11) | `web/lib/use-team-prewarm.ts`, `web/components/app-shell.tsx` | REMOVES a file and 4 requests | **lean_mean** — a clear win. **first_run_review** — confirm no path renders `AppShell` without `useScreenData`; today every route goes through `DeepLinkScreen`, so none does. Fix 1 makes this optional |
| ~~**4.** Detail screens fall back to the single-row door~~ **HALF DONE** | `help-detail.tsx` ✅ · `learning-detail.tsx` ❌ · **`EDGE-CASES.md` ❌** | ADDED ~20 lines to help; fixed the paged deep link | **The predicted harm landed.** `story_checks_out_review` now has a live contradiction: `EDGE-CASES.md:94` states there is no get-one fetch, and there is one. **Finish it in both directions** — amend the doc *and* do `learning-detail.tsx` — or revert help. Leaving it half-done is the only outcome with no upside |
| **5.** `Promise.all` list + count in the five list doors (F5) | `workers/tenancy/src/routes/{roles,invites,selectable}.ts`, `lib/members.ts`, `workers/content/src/routes/help.ts` | REMOVES 1 serial REST hop from each of the app's five hottest read doors | **scaling_review** — 2 concurrent D1 REST calls per request instead of 2 serial ones raises peak concurrency against the same database without changing the query count. **spend_review** — neutral, identical query count. Gate ordering untouched, so no security effect |
| ~~**6a.** Real single-row `oneRole` / `oneMember`~~ **DONE** | `workers/tenancy/src/lib/members.ts` and 4 more | REMOVED a full list read + a `COUNT` from every mutation response | Landed as predicted. **lean_mean** paid ~40 lines for three shared projection constants; **interfacelessness_review**'s shape concern was met structurally. **It also fixed a bug neither review found**: past `LIST_HARD_CAP` the old readers returned `null` and `applyUpdated` dropped a live record off the screen |
| **6b NEW.** Point the five `?id=` doors at the `oneX` readers that now exist (F6) | `workers/tenancy/src/routes/{roles,invites,selectable,members}.ts`, `workers/content/src/routes/learning.ts` | REMOVES a full list read from **every row-level live patch**. ~5 lines changed, net negative | **realtime_review** — this IS their re-pull path; the response must stay byte-identical, which the shared projections now guarantee. **R16** — keep `total` on the response. **interfacelessness_review** — confirm no MCP tool reads the `?id=` shape |
| **7.** `confirmImport` uses the existing `writeParcel` path (F4) | `workers/data-ops/src/lib/import.ts` | ADDS ~12 lines mirroring `import-batch.ts:247-253`. REMOVES up to 999 sequential HTTP requests per import | **activity_log_review** — must verify the bulk door writes one activity row per record; one per parcel loses per-row provenance (R25). **scaling_review** benefits. R24's ordering declaration must be honoured for any `in-order` target. Note the parcel path must keep `forwardToDoor`'s `origin: "import"` stamp, which it already does |
| **8.** `reconcileCatalog` heals on miss, not on every read (F8) | `workers/data-ops/src/lib/import.ts` | REMOVES 5 sequential writes per Import-screen open | **story_checks_out_review / R13** — R13's law is "the catalogue self-heals against the code on read". Heal-on-miss still satisfies the guarantee, but `RULES.md` and the `catalog-coverage` check must be confirmed to allow it. Do not change without reading the check |
| **9.** `Server-Timing` at the gateway + a written hop budget (F10) | `workers/gateway/src/index.ts`, `EDGE-CASES.md`, `CLAUDE.md` | ADDS ~10 lines and a documented number; makes criteria 1 and 10 measurable | **Coordinate with `speed_review`'s F1 — it proposes the same gateway wrapper. Do it once.** Their version carries the mandatory `status === 101` guard, without which `/api/realtime` stops upgrading. **spend_review** — turns an error-only log stream into a per-request one; real. Otherwise negligible |
| **10.** Use the write's own response instead of re-reading (F7) | `web/components/access-tokens.tsx`, `web/components/role-detail.tsx` | REMOVES 2–3 requests per write on those paths | For `access-tokens` this is purely client-side — none. For `role-detail`, having the door return the saved matrix is a response-shape change → Tier 3: **interfacelessness_review** must confirm no MCP or agent tool reads `/api/tenancy/roles/permissions`' current shape. Leave the door alone and reuse the client's own draft if so |
| **11.** `Promise.all` the per-team publish on profile save (F12) | `workers/auth/src/lib/profile.ts` | REMOVES N−1 serial hops on a profile save | none — each publish targets a different team's Durable Object, so there is no ordering dependency and **realtime_review** is unaffected |
| **12.** Do not blank all module content on `my-permissions` (F9) | `web/components/deep-link/module-content.tsx` | REMOVES one serial wave from first paint | **security_sentry_review** — real risk: the record must render with action controls **hidden** until rights land, never shown-then-hidden. A flash of an action the user cannot perform reads as a permission leak even though the server still refuses it |
| **13 NEW.** Row-patch the thread from the `help_threads` ping instead of invalidating it from the `help` ping (F13) | `web/lib/live-resources.ts`, `web/components/app-shell.tsx` | REMOVES 1 refetch (3 REST hops) per reply per viewer; restores the value of R21's created-row response on this path | **realtime_review** — this is their fix; any change must preserve what it bought (two people replying both see replies). A row-patch on `help_threads` is strictly better than a dep invalidation, so this should be a joint win rather than a trade. Verify against their `live-collections` check (R15) that `help_threads` still reaches a listener |
| **14 NEW.** Render `origin`/`verb` in the activity feed, or drop them from the projection (F14) | `web/components/help-detail.tsx` and the other activity mappers, **or** `workers/tenancy/src/lib/activity-read.ts` | Rendering ADDS ~6 lines and a label map; dropping REMOVES 2 columns × 50 rows per feed page | **activity_log_review** — dropping the columns partly undoes their R25 visibility work, so **render is the better half of this choice**: it delivers what they were after and costs this review nothing. The UI library owns `ActivityFeed`, so a new field may need a library change — surface it, do not fork it (`CLAUDE.md`: the library is lego) |

---

## CEILING

**Asked directly: does the deep-link fix change the round-1 arithmetic? No. The
maximum is still 89 while `EDGE-CASES.md §2` stands, and 95 is still not
reachable by code alone. What changed is the price of the owner's yes.**

### Why 89 is unmoved

Round 1's cap rested on two things, and the repair touched neither.

- **Criterion 1's 20-point "no more than 3 distinct services" line is still
  unreachable.** One help-ticket load touches auth, tenancy, content and realtime.
  Auth is on the path of every gated request by design (`gating.ts` — "THE BUSIEST
  CROSS-SERVICE CALL IN THE BASE", ARCHITECTURE §1c, one session master), and
  realtime is a separate worker because the Durable Object model requires it.
  Merging either is relitigating `ARCHITECTURE.md`. **Criterion 1 caps at 80.**
- **Criterion 3's cap of 70 rests on findings D and E, and both survive.** The
  deep-link fix is **additive**: `help-detail.tsx:81` still calls
  `content.help("all")` — the list endpoint — to render one ticket, and the
  fallback fires only when that list does not contain it. The rubric's `high`
  tier is "a list endpoint called to render a single record's detail", and that is
  still literally what the code does. `learning-detail.tsx` is untouched. So
  D (−15) and E (−15) still hold criterion 3 at 70.
- **Criterion 8's cap of 30 is unmoved too** — `LEARNING_SELECT` still ships
  `content_body` on every row of a 1000-row list, and `EDGE-CASES.md:113` still
  instructs that it should.

With every fix in the map applied and both decisions intact:

```
(80×15 + 100×13 + 70×13 + 100×12 + 100×12 + 100×11 + 100×9 + 30×6 + 100×5 + 100×4) / 100
= (1200 + 1300 + 910 + 1200 + 1200 + 1100 + 900 + 180 + 500 + 400) / 100
= 8890 / 100 = 88.9 → 89
```

Identical to round 1, recomputed rather than copied.

### What the fix DID change

Round 1 said: *"If the owner amends `EDGE-CASES.md §2` to permit the
cache-first-with-single-row-fallback described in F3 — which the server doors
already support and which fixes a real paged-deep-link bug — criteria 3 and 8
unlock and the maximum becomes 97."*

```
(8890 − 910 + 1300 − 180 + 600) / 100 = 9700 / 100 = 97
```

That number is also unchanged. **But the work behind it shrank from a build to a
decision.** In round 1, unlocking 97 meant: design the fallback, prove it does not
break the shared-key live patch, write it into two screens, and amend the doc.
Today the fallback is designed, written, commented and shipped for help. What
remains is:

1. one paragraph in `EDGE-CASES.md §2`, and
2. nine lines copied into `learning-detail.tsx`.

**And point 1 is no longer optional.** The doc currently states something the code
does not do. Whatever the owner decides about the ceiling, `EDGE-CASES.md §2` has
to be amended or `help-detail.tsx` reverted, because right now the canon and the
code disagree — which is precisely the condition this campaign exists to find.

### The gate is the real story

None of the above is what holds the *reported* number at 45. **Criterion 1 is, and
it will hold it at 45 through any number of further repair rounds that do not
touch the hop count.** Two fixes move it, and both are already on the map:

- **Fix 1 (in-flight de-dupe)** takes the busiest screen from 24 requests to 15
  unique-ish, and combined with **fix 2** (shared session load) and **fix 3**
  (drop the prewarm) it reaches **12 unique** — which is the 9–12 band, worth 10 of
  the 35 points. Criterion 1 goes 25 → 35. **Still under 40. Still capped.**
- Getting past the gate needs the **20-point written hop budget** as well — one
  number in `EDGE-CASES.md` or `CLAUDE.md`'s planning ritual. Criterion 1 then
  reaches **55**, the cap lifts, and the reported score becomes the real one.

So the cheapest possible unlock of this review's headline number is **fix 1 + fix 2
+ fix 3 + one sentence naming a hop budget.** Until then, every point earned
anywhere else is invisible — which is exactly what happened this round: 15 real
points of criterion 3 bought zero visible movement.

Nothing else is capped. Criteria 2, 4, 5, 6, 7, 9 and 10 can all reach 100 by
code — and criterion 10, at zero across two rounds, is still the cheapest
twenty-five points on the list, now with `speed_review`'s forty lines written out
ready to implement.

---

**Verdict.** Opening a help ticket at `/t/<team>/help/<id>` in a fresh tab still
costs **24 HTTP requests to answer 12 distinct questions, in 4 serial waves**, and
those 24 requests still cost the workers roughly **51 separate HTTPS round trips
to `api.cloudflare.com`**. Nine of the 24 are the same question asked twice. The
repair pass made each of those requests meaningfully cheaper on the server — five
whole-collection reads became five single-row reads — and did not remove a single
request from the client.
