# Round trip review — round 5 — Brimba · 2026-08-26

SCORE: **76/100**, ungated   (R1 45 · R2 45 · R3 62 · R4 62 → recomputed **66** · **R5 76**)

Measured against `review-round5` @ **`959c80a`** and the working tree at that moment.
Two documentation commits — `93d4f76` and `f30f954` — landed on the branch while this was
being written; I checked both. Between them they touch `RULES.md`, `shared/rules/registry.ts`,
`ERROR-HANDLING.md`, `CONVENTIONS.md`, `DATA-MODEL.md`, `SCALING.md`, `timings.json`, and
comments only in `shared/workers/d1-rest.ts` and `shared/workers/realtime.ts`. **`OPERATIONS.md`
did not change, and no route, screen, store or door did either**, so nothing scored below
moves. Read-only apart from `timings.json`, which the sanctioned measurement command appends
to — see **Disclosure** at the end.

I wrote none of these repairs. Every claim below was verified against source; where a
previous report's claim did not survive that, it is named and corrected.

---

## The one sentence

**Opening a support ticket at `/t/<team>/help/<id>` in a fresh tab costs 14 round trips
— 12 HTTP requests and 2 WebSockets — arranged in 4 dependent waves, and the first two
waves are one request each.**

---

## Arithmetic

| # | Criterion | key | method | wt | R3 | R4 | **R5** | wt × R5 |
|---|---|---|---|---:|---:|---:|---:|---:|
| 1 | Hops per action are counted and bounded | `hops` | coverage · GATE | 15 | 25 | 45 | **45** | 675 |
| 2 | No question is asked twice | `duplicates` | defect | 13 | 56 | 56 | **97** | 1261 |
| 3 | Fetch the row, not the list | `overfetch` | defect | 13 | 63 | 75 | **85** | 1105 |
| 4 | Nothing already in hand is fetched again | `reuse` | coverage | 12 | 60 | 60 | **74** | 888 |
| 5 | No request per row | `nplusone` | defect | 12 | 51 | 51 | **78** | 936 |
| 6 | Independent calls run together | `parallel` | defect | 11 | 79 | 79 | **86** | 946 |
| 7 | A write updates in place | `writeback` | coverage | 9 | 100 | 100 | **92** | 828 |
| 8 | The payload is shaped for the screen | `payload` | coverage | 6 | 30 | 30 | **30** | 180 |
| 9 | First paint does not wait for everything | `firstpaint` | coverage | 5 | 30 | 30 | **70** | 350 |
| 10 | Someone has measured it | `measured` | coverage | 4 | 65 | 100 | **100** | 400 |

```
weights: 15+13+13+12+12+11+9+6+5+4 = 100

15×45  =   675
13×97  =  1261
13×85  =  1105
12×74  =   888
12×78  =   936
11×86  =   946
 9×92  =   828
 6×30  =   180
 5×70  =   350
 4×100 =   400
          -----
           7569  ÷ 100 = 75.69  →  76

GATE: criterion 1 = 45 ≥ 40 → no cap. Reported = uncapped = 76.
```

**Reproducing the move from R4's published rows** (R4 total 6209 ÷ 100 = 62.09):

```
Δ = (0×15)+(41×13)+(10×13)+(14×12)+(27×12)+(7×11)+(−8×9)+(0×6)+(40×5)+(0×4)
  =    0  +  533  +  130  +  168  +  324  +  77  +  −72  +   0  + 200  +  0   = 1360
6209 + 1360 = 7569  →  75.69  →  76      ✓
```

**On the "recomputed 66".** `ROUND5-RECONCILIATION.md` restates R4's 62 as 66 because
"its own CRITICAL and one HIGH landed after the measurement". I can reproduce 66 from
the CRITICAL alone — closing criterion 2's `−30` gives `62.09 + (30×13)/100 = 65.99 → 66`
— but **not** from a CRITICAL *and* a HIGH, which would land at 68 on the same weights.
I report the difference rather than resolve it: **previous = 66, mine = 76, delta = +10.**

---

## Per moved dimension — code changed, or the last measurement was wrong?

| # | Δ | cause | what actually happened |
|---|---:|---|---|
| 1 | 0 | — | The four rows land identically. The *count behind* row 1 fell from R4's 18 to 14, which is real progress and buys nothing: both sit in the 13+ band worth 0 |
| 2 | +41 | **both** | **Code changed:** `useActiveTeam` now reads the session through `dedupe()` (`use-active-team.ts:79,84`), so two mounts cost one `me` and one `active`. R4's standing CRITICAL is closed. **Last measurement wrong:** R3's finding C listed three write-then-read paths; two of the three (`access-tokens.tsx:99,:111`) now use `applyCreated`/`applyUpdated` off the door's own row, and R3's finding H (cross-wave duplication) is closed by `REVALIDATE_AFTER_MS`. R4 carried all of it forward unre-derived |
| 3 | +10 | **code changed** | Both detail screens read the list cache without fetching it (`useCachedValue`) and fall back to a single-row door — R3's findings D and E, closed. R3's G closed at R4. What remains is one layer up and is described below |
| 4 | +14 | **both** | **Code changed:** the freshness window and max age now exist in code (`store.ts:51,61`) with two separate stamps, where R3/R4 credited the row on `CACHING.md` prose alone. **Re-derived:** I score the five rows with partial credit, which is R3's own convention |
| 5 | +27 | **mostly last measurement wrong** | Of the four probe `nPlusOne` hits on a user path, **three are false positives** I read and refuted: `notify.ts:36` and `stakeholders.ts:73,88` are batched `IN (…)` lookups whose `ids.map(() => "?")` matched the loop regex, and `d1-rest.ts:154` is the retry loop. R4's second half — "`forwardToDoor` still carries no timeout" — is now a **documented deliberate decision** (`shared/workers/http.ts:58-60`: an import batch does unbounded work), not an oversight. **Code changed:** the parcelled bulk write path was built (`import-batch.ts:252`) |
| 6 | +7 | **last measurement wrong**, net | Two of R4's three waterfalls are probe artifacts: `use-screen-actions.ts` is one `switch` with five branches of which exactly one runs, and `model.ts:259/295` are two different class methods the probe's declaration regex could not see. Against that I file **two genuine waterfalls R4 missed**, both on the critical path |
| 7 | −8 | **last measurement wrong** | R4 scored this 100 while `role-detail.tsx:115-116` did a write then a read of the same URL — a defect R3 had already filed as finding C and R4 did not carry into this criterion. `postRolePerms` returns `{ ok: true }` (`roles.ts:118`) |
| 8 | 0 | — | `LEARNING_SELECT` still carries `l.content_body` into every list row (`learning.ts:188-192`). Settled as refused in the reconciliation; scored, not re-filed |
| 9 | +40 | **last measurement wrong** | R4 scored this on *wave depth* ("three serial round trips: `auth/me` → `tenancy/active` → `my-permissions`"), which is criteria 1 and 6's subject. The rubric's three rows are about **rendering**, and two of them have been true since R1: cache-first paint, and every secondary read rendered through `?? []` so no slow panel can blank the screen |
| 10 | 0 | — | Already at 100 and still earned. I ran it: 8 probes × 5 runs, `timings.json` at 17 runs before mine |

---

## The four claims I was asked to verify

**1 · The detail screens stopped reading a whole collection to render one record — CONFIRMED.**
`learning-detail.tsx:74-80` and `help-detail.tsx:94-98` both do the same thing:

```ts
const fromList = useCachedValue<HelpTicket[]>(listKey)?.find((t) => t.id === helpId) ?? null
const oneQ = useCached<HelpTicket | null>(fromList ? null : oneKey, () => content.helpOne(helpId))
```

`useCachedValue` reads and subscribes but never fetches; the `null` key means the fallback
costs nothing when the row is already in hand. **Both fallback keys are registered** —
`live-resources.ts:240` (`learning-one:${id}`) and `:274` (`help-one:${id}`) — and the
registration is locked by `web/test/live-deps.test.ts:106,108`, which strips comments and
strips the deps arrays themselves before searching, so a dep cannot find its own
declaration. That is a check built to be able to fail.

**2 · `store.ts` gained a freshness window, a max age and in-flight de-duplication — CONFIRMED.**
`REVALIDATE_AFTER_MS = 5_000` (`:51`), `MAX_AGE_MS = 4h` (`:61`), and — the part that
matters — **two** stamps per key (`:83`): `written` answers the short window, `fetched`
answers the max age, because a row patched in by a live ping keeps `written` young for
ever and that is precisely the case the max age exists for. In-flight de-duplication is
`inflight` + `sharedFetch` (`:104,:129`), keyed identically to the cache, cleared on both
outcomes, and dropped by `invalidate` so a ping's answer cannot be overwritten by a
response that predates it.

**3 · Three write-then-read round trips removed by using the row the door already returns — CONFIRMED, with one survivor.**
Sixteen of seventeen client write paths now fold the door's own row in through
`applyUpdated` / `applyCreated` / `primeCache`. The survivor is `role-detail.tsx:115-116`,
and it survives because `postRolePerms` is the one mutation door outside R21/R23's reach —
it writes a child table, so neither law's derivation names it, and it returns `{ ok: true }`.

**4 · Raising a ticket went from four network crossings to one — CONFIRMED, at the layer that costs.**
`createTicket` (`workers/content/src/lib/help.ts:280-301`) sends INSERT + read-back +
`COUNT(*)` + the activity row as **one** `d1Batch` call, and the activity statement is
carried rather than re-typed (`shared/workers/activity.ts:287` exports the builder, so
there is still exactly one `INSERT INTO activity` in the base). `publishChange` moved to
`ctx.waitUntil`. My own measurement, from SIN against staging:

```
raise a ticket   write   458ms median   411 best   588 worst   262 server   600ms budget   ok
```

**And the caveat that matters: `d1Batch` has exactly one caller.** `grep` for it returns
`help.ts:280` and nothing else. Creating a learning article is still `INSERT` →
`logActivity` → `Promise.all([oneLearning, countLearning])` = **three** crossings
(`learning.ts:309,316` + `routes/learning.ts:90`), and `ensureCategory` can add a fourth.
The seam that made raising a ticket 39% faster is unused by every other create door.

**5 · Round 4's "irreducible gateway→auth hop" — CONFIRMED WRONG, and I did not re-file the refused cache.**
`shared/workers/gating.ts:194-228` shows the shape plainly, and it instruments each hop
by name: `whoAmI:auth-binding` (a same-colo service binding), `requireMember:core-DB` (a
native D1 binding), `limitTeam:rate-limiter`, and only then `requireRight` over the D1
REST door. The gateway is not in that chain. The expensive hop is `api.cloudflare.com`,
and my run puts a number on it: `members list` reports **360 ms server** on a
freshly-reset, near-empty database — that is distance, not work.

The gateway session cache is settled and stays settled. **What it would be worth, since
the brief invites the figure:** it removes the `whoAmI` binding call, which is same-colo
RPC and therefore the *cheapest* of the three hops it was blamed for. On the numbers
above it is worth single-digit milliseconds per request and zero hops from the browser.
It was refused for a 30-second sign-out lag; on this measurement it would have been a bad
trade even for free.

---

## The hop ladder — counted by hand, cold, fresh tab, established team

Budget line at 5. Every screen is over it, and the reason is structural: the session
costs two serial requests, rights cost a third, and the two sockets are two more, so
**5 is the floor and none of the floor is module data.**

```
                                              waves   HTTP  WS   total
/t/<team>/help/<id>        ██████████████       4      12    2    14   ← worst
/t/<team>/learning/<id>    ███████████          4       9    2    11
/t/<team>/roles/<id>       ██████████           4       8    2    10
/t/<team>/members/<id>     ██████████           3       8    2    10
/t/<team>  (overview)      ██████████           3       8    2    10
/t/<team>/help  (list)     █████████            3       7    2     9
/home                      ████████             3       6    2     8
                           ─────┊──────────────────────────────────────
                       budget → 5
```

### `/t/<team>/help/<id>` — the enumeration

| wave | # | request | why it is in this wave |
|---|---|---|---|
| 1 | 1 | `GET /api/auth/me` | `useActiveTeam.load()`; both mounts join through `dedupe` |
| 2 | 2 | `GET /api/tenancy/active` | awaited **after** `me` inside `load()` |
| 3 | 3 | `GET /api/tenancy/my-permissions` | `usePermissions` ×4 mounts → one key |
| 3 | 4 | `GET /api/tenancy/roles` | `useScreenData`, team-area-wide |
| 3 | 5 | `GET /api/tenancy/invites` | `useScreenData`, team-area-wide |
| 3 | 6 | `GET /api/tenancy/selectable` | `useScreenData`; the detail's own copy joins the key |
| 3 | 7 | `GET /api/content/help?scope=all` | `useScreenData` — **keyed on the module, not on `!recordId`** |
| 3 | 8–9 | `WS /api/realtime` ×2 | team channel + user channel |
| 4 | 10 | `GET /api/content/help?id=<id>` | the detail's fallback; fires because the list has not landed yet |
| 4 | 11 | `GET /api/content/help/thread?id=<id>` | the visible tab |
| 4 | 12 | `GET /api/tenancy/members` | @mention list for the thread |
| 4 | 13 | `GET …/record-activity?table=help&id=` | **the Activity tab, which is not open** |
| 4 | 14 | `GET /api/content/help/stakeholders?id=` | the Stakeholders tab; its length is the tab badge |

Wave 4 exists because `module-content.tsx:116` returns a whole-area skeleton while
`perms === undefined`, so **`HelpDetailScreen` does not mount — and therefore does not
start any of its five reads — until the rights read has returned.** None of those five
reads depends on the rights read; every one of them is gated again at the server.

### `/home` — the enumeration

`me` → `active` → { `my-permissions`, `roles`, `invites`, `selectable`, 2 × `WS` }.
**6 HTTP + 2 WS = 8 requests, 8 distinct answers.** `HomeScreen` costs nothing extra on an
established team: the first-run signpost is keyed on `ctx.memberCount === 1`, which is
already in the session context.

### Against the written budget

`OPERATIONS.md` "The hop budget" records `/home` **8 for 8** and `/t/<team>/help/<id>`
**16 for 11**. **`/home` reproduces exactly. The ticket page does not: I count 14, not 16.**
Both are static counts by the same method, so the disagreement is meaningful. It does not
move any band (14 and 16 both sit in 13+ worth 0) and it errs safe. The doc's own warning
—"re-count against the network panel, never against the store" — still applies, and to my
count as much as to its own: I could not run the app.

---

## Criterion by criterion

### 1 · Hops per action are counted and bounded — **45** · weight 15 · GATE

| row | max | earned | evidence |
|---|---:|---:|---|
| busiest screen ≤5 hops (≤5=35, 6–8=20, 9–12=10, 13+=0) | 35 | **0** | 14, enumerated above. 13+ band |
| the median unit of work is 1–2 hops | 25 | **25** | probe `hopsPerUnit.median = 1` across 66 units; `overFive = 1`, and that one unit is a grouping artifact (see below) |
| a hop budget is written down anywhere | 20 | **20** | `OPERATIONS.md` — a per-screen table, a *relative* rule ("a screen that needs more requests than it has distinct questions is asking something twice"), and a written history of the two times its digits were wrong. That last part is the strongest thing in it |
| no single user action fans out to more than 3 distinct services | 20 | **0** | Opening a ticket reaches **4** distinct workers: auth, tenancy, content, realtime. `/home` reaches 3 and would pass |

**45.** Gate lifts (45 ≥ 40); reported total is uncapped.

**The service row is a judgement call and I am showing both readings.** Under the reading
I took — distinct backend workers one user action reaches — the worst screen is 4 and the
row is 0. Under the "one public door" reading, every request goes to the gateway and the
row is worth its full 20, taking criterion 1 to 65 and the total to **79**. I took the
stricter reading because the fan-out is what costs hops and the gateway is a router, not
an answer. Someone re-deriving this may reasonably differ; the arithmetic for either is
above.

**The probe's `max: 6` is an artifact and must not be scored.** It groups
`use-active-team.ts::load` at 6 hops with `/api/auth/me ×2` and `/api/tenancy/active ×2`.
The file's `refresh()` is `const refresh = React.useCallback(async () => …`, which the
probe's declaration regex cannot see, so `refresh`'s already-parallel
`Promise.all([me, active])` pair is attributed to `load`. `load` makes two calls, not four,
and both are de-duplicated.

### 2 · No question is asked twice — **97** · weight 13 · defect

Every one of the probe's six `duplicateRequests` was opened and read.

| probe hit | verdict | pen |
|---|---|---:|
| `use-active-team.ts::load` — `/api/auth/me ×2`, `/api/tenancy/active ×2` | **FALSE POSITIVE + genuinely fixed.** Grouping artifact as above; and both reads now go through `dedupe()`, so the two mounts (`agent-host.tsx:22`, `deep-link-screen.tsx:72`) share one request each. R4's CRITICAL is closed | 0 |
| `onboarding/page.tsx::check` — `/t/:x/:x/:x ×2` | **FALSE POSITIVE.** The probe mapped `recordPath()` (`web/lib/nav.ts:31`) as an endpoint because its body contains a `/`-leading template. It is a URL *builder*, not a fetch | 0 |
| `home-screen.tsx::rows` — `/t/:x/:x/:x ×2` | **FALSE POSITIVE.** Same cause: `href` strings in a link list | 0 |
| `app-shell.tsx::toggleCollapsed` — `/api/auth/me ×2` | **FALSE POSITIVE.** `app-shell.tsx` contains no `auth.` call site at all; see the off-rubric section for why this file is hard to search | 0 |
| `model.ts::logCacheUsage` — `api.anthropic.com ×2` | **FALSE POSITIVE.** `complete()` (`:259`) and `stream()` (`:295`) are two different class methods; the probe cannot see `async name(…)` declarations and attributed both to the last arrow function above them | 0 |
| `role-detail.tsx::save` — `/api/tenancy/roles/permissions ×2` | **REAL** — a POST then a GET on the same path, in one click. Rubric `minor`: it is a write-then-read, not the same question twice, and it lives on one admin screen | **−3** |

**100 − 3 = 97.**

R3's finding H — "cross-wave duplication: `useCached`'s mount effect ends in an
unconditional `void load()`" — is closed. `store.ts:480` now reads
`if (staleOnMount(key)) void load()`.

### 3 · Fetch the row, not the list — **85** · weight 13 · defect

| finding | sev | pen |
|---|---|---:|
| **The component stopped reading the collection; the host did not.** `use-screen-data.ts:52-61` keys `learningQ` and `helpQ` on `module === "learning" \| "help"` with no `!recordId`, so **`/t/<team>/learning/<id>` and `/t/<team>/help/<id>` still fetch the module's whole collection to display one record** — and, because the detail's `fromList` is empty when that list has not landed, a cold deep link fires the single-row door as well and pays for the row **twice, by two routes**. The same shape holds for `members` and `invites`, whose detail branches `.find()` the record out of the list (`module-content.tsx:365,:377`). One finding, one fix. Rubric `high`: "a list endpoint called to render a single record's detail" | high | **−15** |
| `import.ts:104-118 getActiveCatalog` — whole `importable_databases` read, filtered in JS | — | 0 — a fixed-size reference table read in full, with the reason at the line (R13 needs "switched off" and "never existed" to be distinguishable). This is exactly the rubric's `minor` tier, which "is fine and only wants a comment" |
| `admin.ts:70` — `SELECT version FROM _migrations` then filtered | — | 0 — bounded by the migration list, inside an owner-only paged maintenance door |
| `role-detail.tsx:57-60` — reads `member_roles:<teamId>` and `.find()`s one role | — | 0 — the same key the host already loads team-wide, so no request is added. This is criterion 4's "already in hand" behaviour, not criterion 3's defect |

**100 − 15 = 85.**

**On learning, this costs more than one request.** The learning list carries
`l.content_body` (`learning.ts:188-192`) — the full HTML of every article, up to
`LIST_HARD_CAP = 1000` rows — so deep-linking to one article downloads every article in
the team to render it, *and then downloads it again by itself.*

### 4 · Nothing already in hand is fetched again — **74** · weight 12 · coverage

| row | max | earned | evidence |
|---|---:|---:|---|
| data already loaded is passed down rather than re-requested | 30 | **28** | Both detail screens read the list cache without fetching it; `applyCreated`/`applyUpdated` patch from the door's own row; `primeCacheIfCold` yields a microtask so the prewarm joins the screen's richer read instead of replacing it with a poorer one (`store.ts:320`). Held back only by the host's list read on a detail route |
| a client cache exists with a stated freshness rule | 25 | **25** | **New this round in code.** `REVALIDATE_AFTER_MS`, `MAX_AGE_MS`, two stamps, each reasoned at the constant. R3/R4 credited this row on `CACHING.md` prose; it is now true in the file |
| navigating back does not refetch what has not changed | 20 | **8** | `staleOnMount` suppresses the refetch for **five seconds**. A tap-in and a press of Back inside that is free; past it the whole collection is re-read. It is a *time* rule, and the app has a live layer that already knows whether anything changed |
| reference data fetched once per session, not per screen | 15 | **5** | `roles` / `invites` / `selectable` / `my-perms` survive navigation in the cache and join in flight, so it is once per *wave* — but every mount past the window re-asks |
| HTTP cache headers where the answer is cacheable | 10 | **8** | `web/public/_headers:18,25,27` + `gateway/src/index.ts:18`: `immutable` on hashed assets, `no-cache, must-revalidate` on HTML, `no-store` on CSV, `no-cache` on the agent SSE. API answers are per-user permission-filtered and so uncacheable by construction; none carries an explicit `private` either |

**28+25+8+5+8 = 74.**

The probe reports `helpers.clientCache: false`. **That is a false negative** — it looks for
`useQuery|useSWR|queryClient|cacheStorage`, and this app wrote its own in `web/lib/store.ts`.
Scoring the row off the probe would have cost 25 points to a naming convention.

### 5 · No request per row — **78** · weight 12 · defect

Twenty-four probe hits; every one on a user path was read.

| finding | sev | pen |
|---|---|---:|
| **The CSV import writes one gated door call per row, sequentially** (`import-batch.ts:270-277`), and each of those doors then makes 3–5 D1 REST crossings of its own. The parcelled bulk path **exists** beside it (`:252-268`, with `packParcels`, `BULK_MAX_ROWS`, per-door `maxRows`, and parcel-scoped rejection semantics) — and **no base target declares `bulk`**: `targets.ts:71` says so in terms, and the three base targets omit it. The machinery has no caller | high | **−15** |
| **`reconcileCatalog` writes one row at a time on every catalog READ.** `import.ts:90-101` loops five `env.DB.prepare(…).run()` INSERTs, and `getActiveCatalog` (`:104`) calls it first. Five sequential cross-region writes to answer a read; `env.DB.batch([...])` exists | medium | **−7** |
| `notify.ts:36`, `stakeholders.ts:73,88` | **FALSE POSITIVES** — both are single batched `IN (…)` queries; the `unique.map(() => "?")` placeholder build matched the loop regex | 0 |
| `d1-rest.ts:154` | **FALSE POSITIVE** — the jittered retry loop | 0 |
| `teams.ts:526` | **FALSE POSITIVE** — a `.map()` over already-fetched rows, no await | 0 |
| `teams.ts:261` | loop over the signing-up user's own pending invites, typically 0–2 | 0 |
| `profile.ts:98` | one `ctx.waitUntil(publishChange(…))` per team, bounded by `MAX_TEAMS_PER_USER = 5`, and off the critical path | 0 |
| `admin.ts:66-76`, `housekeeping.ts` ×4, `sharding.ts` ×3 | owner maintenance and cron. Housekeeping, and correctly paged. `scaling_review`'s subject, not a click | 0 |
| `import-screen.tsx:75-79` | one POST per selected file, sequential — a tiny user-chosen set, each carrying its own file body, and each mutates the same server-side batch so order matters | 0 |

**100 − 22 = 78.**

**Why the import is `high` and not `critical`.** The rubric's critical tier is "one request
per row over a collection that **grows with use**". An import file is bounded by what a
person uploads; it is not a table that grows. Someone applying the tier more literally
would take `−30` and score this criterion 63, moving the total to **74**. Both are shown so
the choice is arguable rather than hidden.

### 6 · Independent calls run together — **86** · weight 11 · defect

| finding | sev | pen |
|---|---|---:|
| **The session pair is serial, and it is wave 1 and wave 2 of every cold load.** `use-active-team.ts:79,84`: `await dedupe("session:me", …)` then `await dedupe("session:active", …)`. **The same file's `refresh()` already does `Promise.all([me, active])`** at `:123-126`, so the cold path is serial where the warm path is parallel. Nothing paints until both return (`deep-link-screen.tsx:327`). At my measured SIN numbers that is roughly 230 ms of pure sequencing on every fresh tab, and more from a colo further from the core database. The only real dependency is the `onboardingComplete` branch, which can be applied after both settle | medium | **−7** |
| **The rights read gates the mount of every record detail**, so five reads that do not depend on it start a full round trip later than they could (`module-content.tsx:116`). Every one of them is gated again at the server | medium | **−7** |
| `use-screen-actions.ts::useScreenActions` awaited 5 | **FALSE POSITIVE** — one `switch`, five branches, exactly one runs per call |
| `model.ts::logCacheUsage` awaited 2 | **FALSE POSITIVE** — two different class methods |
| `onboarding::check` (`:52,:56`) | genuine dependency chain — `active()` runs only if `me` says onboarding is complete. Correct, recorded as clean |
| `onboarding::finish` (`:91,:92`) | genuine dependency — the profile must be stamped before `bootstrap` snapshots the creator onto the new team |
| `role-detail::save` (`:115,:116`) | a real read-after-write, but a dependency by construction. Scored in criteria 2 and 7, not here |

**100 − 14 = 86.**

### 7 · A write updates in place — **92** · weight 9 · coverage

| row | max | earned | evidence |
|---|---:|---:|---|
| a successful write updates local state from its own response rather than triggering a refetch | 40 | **37** | 16 of 17 client write paths fold the door's row in via `applyUpdated` / `applyCreated` / `primeCache`. The exception is `role-detail.tsx:116` |
| the write response returns the updated record, so no follow-up read is needed | 30 | **25** | R21 and R23 are machine-checked (`create-returns-row`, `mutation-returns-row`) and derived from the door gates, so every row-shaped door returns `{created}` / `{updated}` by construction. Two holes: `postRolePerms` returns `{ ok: true }` (`roles.ts:118`), and no update door returns the activity row it just wrote, so every edit on a record screen costs a follow-up record-activity read (`learning-detail.tsx:154-159`, `help-detail.tsx:148`) |
| no full-page reload or router refresh after a mutation | 20 | **20** | probe `refetchAfterWrite: []`, verified by hand. The one hard navigation — onboarding's `finish` → `softNavigate("/home")` — is a deliberate identity reload with the reason at the line |
| optimistic update where the write is safe to assume | 10 | **10** | `help-detail.tsx:176-208`: an optimistic reply echo, swapped for the door's `created` row, rolled back on failure |

**37+25+20+10 = 92.**

### 8 · The payload is shaped for the screen — **30** · weight 6 · coverage

| row | max | earned | evidence |
|---|---:|---:|---|
| endpoints return the fields the screen uses | 40 | **0** | `LEARNING_SELECT` (`learning.ts:188-192`) ships `l.content_body` in the list; the list card renders `content_description`, a derived preview |
| list endpoints omit heavy fields until asked | 30 | **0** | Same line. `TICKET_COLS` (`help.ts:104`) is comparatively lean but still carries `screen_recording_link` and `source_screen`, which no list row shows |
| pagination or a cap exists on anything that grows | 30 | **30** | R14, machine-checked (`bounded-lists`): `LIST_HARD_CAP` on every capped read with the comment at the query, real keyset paging with an opaque cursor + exact total + `hasMore` through `pagedJson` on help and activity, cursor sidecars, and a `<LoadMore>` that can reach page two |

**30.** Unchanged since R1, and the reason is settled in `ROUND5-RECONCILIATION.md`: trimming
the projection would blank `item.body` in the list cache the detail screen reads, and the
edit dialog seeds from that same object, so a trimmed row round-trips an empty body back
through the update door. I am not re-filing the refusal. I am supplying the precondition
it was missing — see item 9 in the ranked list.

### 9 · First paint does not wait for everything — **70** · weight 5 · coverage

| row | max | earned | evidence |
|---|---:|---:|---|
| the screen renders with what it has and fills in the rest | 40 | **35** | `useCached` is cache-first by construction: a warm key paints synchronously from the Map and revalidates behind (`store.ts:413-416,:468-475`), and the module-level session cache means every navigation after the first paints instantly. Held back because a genuinely cold tab shows `ShellLoading` until wave 2 and a content skeleton until wave 3 |
| secondary panels load after the primary content, not before it | 30 | **5** | There is no staging at all. Opening a ticket fires the thread, the members list, the record activity and the stakeholders in one wave — and `activity:record:help:<id>` is rendered **only** on the Activity tab, which is not the tab that opens |
| a slow non-critical call cannot hold the whole screen blank | 30 | **30** | Every secondary read renders through `?? []`; only the primary row gates, and it distinguishes `undefined` ("still asking") from `null` ("gone") so a deep link cannot flash "doesn't exist" mid-read. A root `ErrorBoundary` now actually wraps the tree (`layout.tsx:82`) |

**35+5+30 = 70.**

### 10 · Someone has measured it — **100** · weight 4 · coverage

| row | max | earned | evidence |
|---|---:|---:|---|
| timings are captured somewhere | 50 | **50** | `scripts/timings.mjs`, `Server-Timing` from every worker, `shared/workers/trace.ts::traceHop` naming each gating hop by kind. I ran it |
| a target exists | 30 | **30** | `CLASS_BUDGET` per class of operation — read 400 / write 600 / delete 500 / bulk 1500 — inherited by every new probe on the day it arrives, plus the written hop budget |
| the number is checked more than once — a trend | 20 | **20** | `timings.json`, last 50 runs, counted by run so a run is never half-kept; my run read "17 run(s)" and printed a `vs same colo` column |

**100.**

**My measurement, staging, SIN, freshly reset (so these are near-empty tables):**

```
operation           class   median   best   worst   server   budget   verdict
cold page load      read     159ms    157    389       —      800ms    ok
auth health         read     156ms    143    224        2     200ms    ok
realtime health     read     197ms    146    481        2     200ms    ok
mcp health          read     163ms    158    230        3     200ms    ok
who am I            read     238ms    228    754       84     100ms    OVER
members list        read     519ms    499    566      360     400ms    OVER
one ticket by id    read     408ms    389    495      240     500ms    ok
raise a ticket      write    458ms    411    588      262     600ms    ok
```

Two over budget, both on the read path, both server-side. `members list` at **360 ms of
server time on an empty table** is the D1 REST distance, stated as a number. This is
`speed_review`'s subject and I am not scoring it; it is here because it prices a hop, and
pricing a hop is what makes a hop count mean something.

---

## Ranked — what still costs points, and the concrete change

| # | item | criterion | pts | tier | the change |
|---:|---|---|---:|---|---|
| 1 | The session pair is serial on every cold load | 6 · 9 | ~+7 | **1** | `use-active-team.ts:77-96` — `const [me, ctx] = await Promise.all([dedupe("session:me", …), dedupe("session:active", () => tenancy.active().catch(() => null))])`, then apply the `onboardingComplete` and teamless branches. The `.catch` is not optional: `active()` throws `409 no_team` for a user mid-onboarding, and the existing `catch` routes a throw to `/login` |
| 2 | The host reads a module's whole collection on a record route | 3 · 4 · 8 | +15 | **2** | `use-screen-data.ts:52-61` — add `&& !recordId` to `learningQ` and `helpQ`; source `recordLabel()`'s learning title from the single-row read instead of `learningQ.data.find()` (`deep-link-screen.tsx:425`). Held cache still serves `fromList` when you walked in from the list, so nothing regresses on the warm path |
| 3 | Import writes one gated door call per row | 5 | +15 | **2/3** | Add a bulk create door per base target and declare `bulk` on the three `TargetDef`s. Everything else — parcel packing, the min-of-two ceiling, whole-parcel rejection reporting — is already written and unreachable (`import-batch.ts:252`, `targets.ts:71`) |
| 4 | The record-activity read fires for a tab nobody opened | 9 | +25 (crit 9) | **1** | `useCached(tab === "activity" ? key : null, …)` in `learning-detail.tsx:82`, `help-detail.tsx:111`, `role-detail.tsx:75`. One request off every record open, three files, no contract change |
| 5 | `postRolePerms` returns `{ok:true}`, so a save costs two crossings | 2 · 7 | +3, +8 | **2** | `workers/tenancy/src/routes/roles.ts:118` → `json(await getRolePermissions(cfg, guard, body.roleId))`; delete `role-detail.tsx:116`. Roughly halves a permission save (458 ms → ~230 ms at measured latencies) |
| 6 | `reconcileCatalog` sends five sequential cross-region writes per catalog read | 5 | +7 | **1** | `import.ts:90-101` → one `env.DB.batch(Object.values(TARGETS).map(t => stmt(t)))` |
| 7 | The freshness window is a clock, not a fact | 4 | ~+20 | **2** | `store.ts:193` — let `staleOnMount` return `false` while the live socket has been continuously connected since that key's last full read. This is **not** the "lengthen the window" idea the reconciliation settled at seconds; it makes the window unnecessary on the path where the socket is already the freshness mechanism, and leaves the 5 s rule intact wherever the connection has gapped |
| 8 | `d1Batch` has one caller | 1 · (speed) | 0 here | **2** | Fold `INSERT` + activity + read-back + count into one `d1Batch` in `createLearning`, `createRole`, `createInvite` and `createSelectable`, exactly as `createTicket` does. Costs this review nothing and is the largest wall-clock win left in the app |
| 9 | The learning list ships every article's body | 8 | +70 (crit 8) | **3** | **The precondition the round-5 refusal was missing:** make `fromList` demand the field before trusting the cached row — `const fromList = row && "body" in row ? row : null` — so a trimmed list falls through to the single-row door instead of rendering and re-submitting an empty body. With that in place, dropping `l.content_body` from the list path is safe. Without it, the refusal stands and is correct |
| 10 | The `dedupe` fix has no test | — | 0 | **1** | Nothing in the repo outside `store.ts`, `use-active-team.ts` and two documents mentions `dedupe`. The change that closed this review's standing CRITICAL and took `/home` from 10/8 to 8/8 is guarded by nothing. Mount two `useActiveTeam`s against a counting `auth.me` stub and assert one call — and watch it fail first |

---

## FIX IMPACT MAP

| fix | files | adds / removes | which other review it could damage, and how |
|---|---|---|---|
| 1 · parallelise the session pair | `web/lib/use-active-team.ts` | removes one wave from every cold load | **first_run_review** — the `onboardingComplete` and teamless branches are the two paths a brand-new account takes, and they currently decide *before* the second call is made. Getting the `.catch` wrong sends a mid-onboarding user to `/login`, which is the first-run dead end that review exists to catch. **error_log_review** — a swallowed `409 no_team` is a real error becoming a silent null; it needs to stay distinguishable from a network failure |
| 2 · stop the host reading the collection on a record route | `web/lib/use-screen-data.ts`, `web/components/deep-link-screen.tsx` | removes 1 request per record route; removes a 1,000-row body-carrying payload from every learning deep link | **realtime_review** — the list cache is what `patchRow` patches; a route that no longer loads it makes the single-row key the only live surface, which is exactly why `learning-one:`/`help-one:` were added to `deps`. That pairing must be re-checked, not assumed. **first_run_review** — the tab-count badges read `total:` sidecars primed by the list fetcher; on a record route the tabs are not shown for learning/help, but confirm that before shipping |
| 3 · bulk import doors | `workers/{content,tenancy}/src/routes/*`, `workers/data-ops/src/lib/targets.ts` | removes N−1 door calls per N rows | **security_sentry_review** — this is the reason the item stayed open for four rounds and the reason still holds: a bulk create door must re-gate and re-validate **per row**, or the import path becomes the one door in the base where R10 is checked once for many writes. **activity_log_review** — one activity row per row, not one per parcel, or the trail loses the per-record history. **spend_review** — a parcel that fails takes N rows with it; the retry shape needs pricing |
| 4 · defer the record-activity read to its tab | three detail components | removes 1 request per record open | **activity_log_review** — the feed becomes invisible until the tab is opened, so anything asserting "the Activity tab is populated on mount" needs re-reading. **realtime_review** — `deps` invalidate `activity:record:*` on a ping; invalidating a key nobody is subscribed to is a silent no-op, which is fine, but the tab must re-read on open rather than trust a stale entry |
| 5 · `postRolePerms` returns the matrix | `workers/tenancy/src/routes/roles.ts`, `web/components/role-detail.tsx` | removes 1 crossing per save | **interfacelessness_review** — this changes a response shape, which is Tier 3 territory: check the MCP tool catalogue and the agent's tool schemas for a consumer of `{ok:true}` before touching it. **story_checks_out_review** — R23's text says "the affected ROW"; a permission matrix is not a row, so either the law's wording or this door's exemption needs to say which it is |
| 6 · batch `reconcileCatalog` | `workers/data-ops/src/lib/import.ts` | 5 writes → 1 | **base_fork_review** — R13's self-heal is what makes a fresh fork's picker non-empty; a batch that fails whole where five singles failed one-by-one changes the recovery shape. `ON CONFLICT DO NOTHING` must survive the batch or an owner's OFF stops staying off |
| 7 · connection-aware freshness | `web/lib/store.ts`, `web/lib/realtime.ts` | removes most back-navigation refetches | **realtime_review** — this makes the cache *depend* on the socket's honesty, which promotes a realtime bug from "one stale screen" to "every screen stale". It must key off a monotonic connected-since stamp, not a boolean, and any reconnect must reset it. **scaling_review** benefits (fewer list reads) |
| 8 · fold the other create doors into `d1Batch` | four worker libs | 3–4 crossings → 1 per create | **security_sentry_review** — `d1Batch` forbids bound parameters (the REST door 400s on statements + params), so every value is inlined through `sqlString`. That is the single largest injection surface in the base and it grows with each caller. **activity_log_review** — a batched activity statement loses `logActivity`'s swallow-my-own-failure property: the trail now fails *with* the write instead of quietly |
| 9 · trim the learning list body | `workers/content/src/lib/learning.ts`, `web/components/learning-detail.tsx` | removes the largest payload in the app | **This is the one with a proven data-loss path behind it.** The precondition (item 9 above) must land and be tested *first*, in its own commit, exactly as `first_run`'s dispatcher-before-`emptyAction` ordering was settled. **realtime_review** — `patchRow` writes the single-row door's answer into the list array, so the list would hold mixed-shape rows; the `"body" in row` guard handles that, and nothing else does |
| 10 · test the dedupe | `web/test/` | adds a test | none |

---

## What no rubric asked about

### A · Two source files are binary to `grep` and to `git diff`

`web/components/app-shell.tsx` contains **four literal NUL bytes**, on lines 82 and 84:

```ts
const TEAM = "<NUL>team<NUL>"   // cannot occur in a real id, so a head is unambiguous
const ID   = "<NUL>id<NUL>"
```

They are deliberate sentinels for deriving `RECORD_KEY_PREFIXES` from the live registry's
`deps` functions, and the idea is good. Writing them as raw bytes rather than `\u0000`
escapes has three consequences nobody chose:

- `file` reports the source as `data`. `grep -r` **silently skips it** — I hit this three
  separate times while writing this review before working out why.
- **`git diff` prints `Binary files a/… and b/… differ`.** I verified this against
  `ab43382..HEAD`. No reviewer — human or agent — can see a diff of this file.
- It is 22 KB holding the live-registry ping handler, both WebSocket subscriptions, the
  reconnect catch-up, the activity coalescing window and the team prewarm. It is arguably
  the highest-consequence file in the web app, and it is invisible to review and to search.

`workers/data-ops/src/lib/import-plan.ts:272` has the same shape (one NUL as a duplicate-row
fingerprint separator). Those are the only two files in the repo (`.ts/.tsx/.js/.mjs/.json/
.md/.css/.toml/.sql`, excluding build output) that contain one.

The law checks themselves are **safe**: `shared/test/source.ts:65` reads through
`readFileSync(p, "utf8")` and NUL is valid UTF-8. But this campaign has found eighteen
checks that guarded nothing, three of them in the source reader, and the standing lesson is
"ask what it would take for the reader to be blind". Here the answer is: any script or
review that shells out to `grep` already is. The fix is one character per site —
`"\u0000team\u0000"` — with an identical runtime value.

There is a second irony worth recording: `shared/workers/validate.ts` strips NUL bytes from
every request body because a NUL reaching D1 is a 500. The base treats NUL as hostile in
data and writes it into its own source.

### B · The fix that closed this review's CRITICAL has no test

Covered as item 10 above, but it belongs here too, because it is the pattern rather than
the instance: the round's single largest hop win is held in place by nothing at all.
`dedupe` appears in exactly two source files and two documents. A future refactor that
"simplifies" `useActiveTeam` back to `auth.me()` restores 4 requests per cold load and
every check stays green.

### C · `deep-link-screen.tsx` has four imports it never uses

`web/components/deep-link-screen.tsx:58,60` import `tenancy`, `content as contentApi`,
`invalidate` and `primeCache`. `tenancy.`, `contentApi.`, `invalidate(` and `primeCache(`
appear nowhere in the file's 573 lines — only inside a comment at `:274`. Ordinarily
`lean_mean_review`'s business, except that `layout.tsx:75-81` records what this exact
class of thing cost the last time: `ErrorBoundary` was imported and never rendered for two
months while a ruleset and a test both said it wrapped the root, because `noUnusedLocals`
is off. Four more unused imports in the most-read component in the app is the same fuse.

### D · The `?scope=mine` list can never be row-patched, and the registry says so honestly

Not a defect — the opposite. `live-resources.ts:291-296` registers `"help:mine"` as a
cache key with no publisher, and the comment explains that it exists only because the
reconnect catch-up walks this map, that its pings arrive on `help`, and that a dep carries
a team id where the record-prefix pass needs a row id. That is the clearest piece of
reasoning I read in the codebase, and it is the shape every `DEAF_EXEMPT` entry should
take: a mechanism named, not a mechanism asserted.

---

## CEILING

**R4 said 78 and blamed the architecture. That was wrong, and 76 is already past it.**

Criterion 1 is still the wall, but a different part of it. Every step below is the same
weighted sum recomputed, so it can be checked line by line.

| step | criteria after the step | Σ(crit × wt) | total |
|---|---|---:|---:|
| now | 45 · 97 · 85 · 74 · 78 · 86 · 92 · 30 · 70 · 100 | 7569 | **76** |
| + items 1, 2, 4, 5, 6, 10 — Tier 1/2, no contract change | 55 · 100 · 100 · 76 · 93 · 93 · 100 · 30 · 100 · 100 | 8456 | **85** |
| + item 3 — bulk import doors, re-gated per row | crit 5 → 100 (+84) | 8540 | **85** |
| + item 7 — connection-aware freshness | crit 4 → 96 (+240) | 8780 | **88** |
| + item 9 — trim the list body, with its precondition | crit 8 → 100 (+420) | 9200 | **92** |
| + one context call (`me` + `active`) and one multiplexed socket | ticket page 12 → 10 — still the 9–12 band, so **no change** | 9200 | **92** |
| + a per-screen composite read, ticket page ≤ 8 | crit 1 row 1 → 20 (+150) | 9350 | **94** |
| … and ≤ 5 | crit 1 row 1 → 35 (+375) | 9575 | **96** |

Working for step 2: `15×55 + 13×100 + 13×100 + 12×76 + 12×93 + 11×93 + 9×100 + 6×30 +
5×100 + 4×100 = 825+1300+1300+912+1116+1023+900+180+500+400 = 8456`.

Two things that table says plainly. **First, merging the two session calls and the two
sockets buys nothing on this rubric** — it saves two real requests and two real waves, and
the ticket page stays inside the same band. That is a rubric limitation, and it is the
same one R3 named from the other side: the band is coarse enough to hide four requests.
**Second, 95 needs the last two rows** — the server answering one question per screen
instead of five. That is an endpoint merge, Tier 3, shared with the MCP surface, and it
should be designed rather than patched.

Add 3 points to every row if the "≤3 distinct services" row is read as one public door
rather than four workers.

The honest reading: **this review's ceiling is not architectural.** 85 needs no endpoint
contract to change at all, 92 is reachable with the two settled-adjacent items above it,
and only the last stretch to 95 asks for a design decision.

---

## Disclosure

`node scripts/timings.mjs` was run once against staging with `TEST_LOGIN_KEY`, as the
brief permitted. It appends its run to `timings.json` by design — 72 lines, run 18 of the
kept history. That file was already modified in the working tree before this review began.
No other file was changed. The report you are reading is the only file I created.
