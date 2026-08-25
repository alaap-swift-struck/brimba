# Round trip review — round 3 — Brimba · 2026-08-25
SCORE: 45/100   (round 1: 45 · round 2: 45)   ·   **uncapped 56** (R1: 48 · R2: 50)

**Measured at `review-campaign` @ `256d21b`**, working tree clean. Line numbers
are that tree's.

**The reported number has not moved for three rounds, and this round it is
actively misleading.** The worst screen went from **24 requests to 16** — a third
of them gone — and criterion 1 did not move a point, because 24 and 16 sit in the
same scoring band (13+). The gate fires on criterion 1, so the total is capped at
45 for the third time. **The uncapped figure moved 50 → 56**, and the section
"How to move the reported number" names the cheapest way out, which is not what
anyone would guess.

---

## DELTA

Round 1: **45** (uncapped 48) → Round 2: **45** (uncapped 50) → Round 3: **45** (uncapped 56)

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---:|---:|---:|---:|---|
| 1 | hops (GATE) | 15 | 25 | 25 | 25 | **24 → 16 requests and the score is identical.** The 35-point row bands at 13+ = 0, and 16 is still 13+. Median unchanged, no hop budget written down, still 4 distinct services per action |
| 2 | duplicates | 13 | 33 | 33 | **56** | **+23. Finding A (no in-flight de-duplication) is RESOLVED and correctly built.** B stands verbatim — `useActiveTeam` does not use `useCached` and the fix cannot reach it. C stands. One NEW medium: cross-wave duplication survives, because `useCached` still revalidates on every mount |
| 3 | overfetch | 13 | 48 | 63 | 63 | **Four of the five `?id=` doors are fixed and the number cannot move**, because G was one `medium 7` covering the set and one door — `members` — still reads the whole collection. The mirror of round 2's "substance worse, number unchanged". Findings D and E stand verbatim |
| 4 | reuse | 12 | 55 | 55 | **60** | **+5.** F11 resolved: `useTeamPrewarm`'s four keys now JOIN the shell's reads instead of racing them, via a deliberate `queueMicrotask` yield. Revalidate-on-mount is untouched, so the 15-point "reference data once per session" row is still zero |
| 5 | nplusone | 12 | 51 | 51 | 51 | Unchanged. `confirmImport` still writes one HTTP POST per row, sequentially. `forwardToDoor` still explicitly carries no timeout |
| 6 | parallel | 11 | 79 | 79 | 79 | Unchanged. All three waterfalls re-opened at their current lines and all three stand, including the new `?id` branch at `help.ts:59-60` (`getTicket` then `countTickets`, independent) |
| 7 | writeback | 9 | 100 | 100 | 100 | Unchanged |
| 8 | payload | 6 | 30 | 30 | 30 | Unchanged. Both losing lines were already at zero; the activity feed still ships `origin` and `verb` with no renderer |
| 9 | firstpaint | 5 | 30 | 30 | 30 | Unchanged. First paint still waits on three serial round trips: `auth/me` → `tenancy/active` → `my-permissions` |
| 10 | measured | 4 | 0 | 0 | **65** | **+65.** `Server-Timing: gateway;dur=N` now rides every response through the public door. Nothing keeps it, so the "checked more than once" row is still zero |

**No criterion fell.** The answer to this round's second question: **no other
agent's repair broke a round-trip criterion.** Two criteria improved in substance
without the number moving (3 and, in part, 1) — reported as findings, because a
rubric that cannot see an 80%-removed defect cannot see one being reintroduced
either.

Arithmetic of the move (uncapped):

```
(+23 × 13)  duplicates  299
(+5  × 12)  reuse        60
(+65 ×  4)  measured    260
                        ---
                        619 ÷ 100 = +6.19    49.94 → 56.13 → uncapped 56
```

---

## The re-count the brief asked for: `/t/<team>/help/<id>` in a fresh tab

**24 requests answering 12 distinct questions → 16 requests answering 11.**

Counted by hand, the same way rounds 1 and 2 counted, following
`web/app/layout.tsx` → `AgentHost` + `DeepLinkScreen` → `AppShell` →
`useScreenData` → `HelpDetailScreen`. Effects commit child-first but within one
commit, and `sharedFetch` claims the key **synchronously** in the same tick, so
components sharing a key in one commit now share one request.

| wave | R2 | R3 | what fires |
|---|---:|---:|---|
| 1 | 2 | **2** | `GET /api/auth/me` ×2 — `useActiveTeam` instantiated twice (`agent-host.tsx:22`, `deep-link-screen.tsx:71`). **Not de-duplicated: this hook does not use `useCached`** |
| 2 | 2 | **2** | `GET /api/tenancy/active` ×2 — serial after wave 1 inside each instance (`use-active-team.ts:78` then `:83`) |
| 3 | 12 | **5** | `my-permissions` ×1 · `roles` ×1 · `invites` ×1 · `selectable` ×1 · `content/help?scope=all` ×1 |
| 4 | 8 | **7** | `content/help?scope=all` (2nd) · `help/thread` · `members` · `activity?scope=record` · `selectable` (2nd) · `help/stakeholders` · `my-permissions` (2nd) |
| | **24** | **16** | **11 unique endpoints** (was 12) |

**Per endpoint, so the eight saved are attributable:**

| endpoint | R2 | R3 | why |
|---|---:|---:|---|
| `auth/me` | 2 | 2 | — |
| `tenancy/active` | 2 | 2 | — |
| `my-permissions` | 6 | **2** | **−4.** Four wave-3 callers (`deep-link-screen.tsx:147`, `app-shell.tsx:85`, `agent-host.tsx:24`, and the prewarm) collapse to one; two wave-4 callers (`help-detail.tsx:126`, `agent-panel.tsx:46`) collapse to one |
| `roles` | 2 | **1** | **−1.** prewarm joins `use-screen-data.ts:39` |
| `invites` | 2 | **1** | **−1.** prewarm joins `use-screen-data.ts:44` |
| `selectable` | 3 | **2** | **−1.** prewarm joins `use-screen-data.ts:69`; `help-detail.tsx:118` still re-asks in wave 4 |
| `config/screens` | 1 | **0** | **−1.** the screen-override subsystem was removed |
| `content/help?scope=all` | 2 | 2 | — |
| `help/thread`, `members`, `activity`, `stakeholders` | 1 each | 1 each | — |
| | **24** | **16** | **−8** |

**Seven of the eight are the de-duplication; one is the screen-override removal.**

**Plus one, conditionally, unchanged.** `help-detail.tsx:98-101` still declares
`help-one:${helpId}` on a null key when the ticket is in the loaded page, so the
common path stays at 16 and a deep link past page one costs **17** and renders
instead of lying. Recorded so the count is honest, not to argue against it.

### `/home` — cold load

4 (waves 1–2) + 4 (wave 3: `my-perms`, `roles`, `invites`, `selectable`, each now
once) = **8 requests, 8 unique**. Was 16. `HomeScreen` still fetches nothing of
its own — every one of the eight is shell or context.

**One addition to note:** `home-screen.tsx:47` now runs
`if (teamId && alone) primeCacheIfCold('learning:<team>', …)` for the first-run
block. For a solo team with no articles that is a **ninth** request. It is
cold-guarded and error-swallowed, so it never fires twice and never surfaces —
the right shape for what it does.

---

## The headline confirmation: the client now asks each question once *per commit*

Round 1 and round 2's F1 was that six components each fired an identical
`my-perms` GET because nothing de-duplicated a request already on the wire. **It
is fixed, and the implementation is correct in the three ways that matter.**

`web/lib/store.ts:61-102`:

```ts
const inflight = new Map<string, Promise<Answer<unknown>>>()

function sharedFetch<T>(key, fetcher): Promise<Answer<T>> {
  const joined = inflight.get(key)
  if (joined) return joined as Promise<Answer<T>>
  const run = fetcher().then(
    (value) => { const current = inflight.get(key) === run; if (current) inflight.delete(key); return { value, current } },
    (err)   => { if (inflight.get(key) === run) inflight.delete(key); throw err }
  )
  inflight.set(key, run)
  return run
}
```

| property the brief named | verdict | evidence |
|---|---|---|
| in-flight requests are de-duplicated | **TRUE** | `inflight.set` happens in the same synchronous tick as `fetcher()`, and `useCached.load` calls `sharedFetch` synchronously from its mount effect (`:320`), so every caller in one commit joins |
| `invalidate` drops the entry, so a stale response cannot overwrite a live row-patch | **TRUE, and it is the subtle half** | `:162` `inflight.delete(key)`. The joined promise still resolves, but `current` was computed once as `inflight.get(key) === run` — now false — so every joiner returns without writing (`:326` `if (!current) return`). `patchRow` (`:255`) and `reconcile` (`:293`) do the same after they write |
| a rejected fetch is cleared | **TRUE** | the rejection handler at `:95-98`. Without it one network blip would make a key permanently unfetchable for the session — the comment at `:77-81` states exactly this |
| the identity check is `entry === run`, not a boolean flag | **TRUE, and it is right** | `:86-88`. A boolean would let a late response delete a *newer* request's claim on the key |
| `primeCacheIfCold` does not win the race | **TRUE, deliberately** | `:212` `queueMicrotask` puts the prewarm behind every read in the same commit, so it joins the *richer* fetcher (the one that also primes the R16 `total:` sidecar) instead of replacing it with a poorer one. This is the fix for round 2's F11 |

**What it does NOT do, and this is the whole residual.** It de-duplicates
*concurrent* callers. It does nothing about a component that mounts in a **later
wave** and finds the answer already cached, because `useCached`'s mount effect
ends with an unconditional `void load()` (`:368`, comment: *"revalidate-on-mount
(first load / navigation / team switch)"*). On this screen that is
`content/help?scope=all` a second time, `selectable` a second time and
`my-permissions` a second time — **3 of the remaining 16**. Plus the 4 the
session hook makes outside the store entirely.

---

## Arithmetic

| # | criterion | score | weight | score × weight |
|---|---|---:|---:|---:|
| 1 | hops | 25 | 15 | 375 |
| 2 | duplicates | 56 | 13 | 728 |
| 3 | overfetch | 63 | 13 | 819 |
| 4 | reuse | 60 | 12 | 720 |
| 5 | nplusone | 51 | 12 | 612 |
| 6 | parallel | 79 | 11 | 869 |
| 7 | writeback | 100 | 9 | 900 |
| 8 | payload | 30 | 6 | 180 |
| 9 | firstpaint | 30 | 5 | 150 |
| 10 | measured | 65 | 4 | 260 |
| | | | **100** | **5613** |

`375+728 = 1103; +819 = 1922; +720 = 2642; +612 = 3254; +869 = 4123; +900 = 5023;`
`+180 = 5203; +150 = 5353; +260 = 5613.`
**5613 / 100 = 56.13 → uncapped 56.** Criterion 1 = 25 < 40 → **capped: 45.**

### 1 · Hops per action are counted and bounded — **25** · weight 15 · GATE

| line | pts | earned | evidence |
|---|---|---:|---|
| busiest screen ≤5 hops | 35 | **0** | **16** (13+ band → 0). Fully deduped across waves it would be 11 unique → 9–12 band → 10; still under 40 |
| median unit of work 1–2 hops | 25 | **25** | unchanged; nothing altered the per-function shape |
| a hop budget written down | 20 | **0** | still no number anywhere. `SLOW_MS = 1_000` is a *duration* budget in code, not a hop budget in a document. `grep -rniE "p95\|p99\|ttfb\|latency\|hop budget"` across every non-`reviews/` `.md` → zero |
| ≤3 distinct services per action | 20 | **0** | one help-ticket load still touches 4 workers: auth (every `whoAmI`), tenancy, content, realtime |

**25 < 40 → gate fires → total capped at 45.**

**Name the worst screen explicitly, as the rubric requires:** *opening
`/t/<team>/help/<id>` in a fresh tab costs **16 round trips** before the ticket
renders — down from 24, still eleven more than the questions it needs answered.*

### 2 · No question is asked twice — **56** · weight 13 · defect

| # | sev | pen | finding | verified at |
|---|---|---:|---|---|
| A | ~~critical~~ | ~~30~~ | **RESOLVED.** In-flight de-duplication exists, joins by key, clears on both outcomes, and is correctly invalidation-aware. See the confirmation section | `web/lib/store.ts:61-102`, `:162`, `:255`, `:293` |
| B | critical | **−30** | **`/api/auth/me` and `/api/tenancy/active` still fetched twice on every cold load.** `useActiveTeam` runs its own `load()` per instance (`:74-106`), has no in-flight map of its own, and does not go through `useCached` — so the store fix cannot reach it. Still exactly two instances on this screen | `use-active-team.ts:74-106`; `agent-host.tsx:22`, `deep-link-screen.tsx:71` |
| C | medium | **−7** | **Write-then-read on three paths, unchanged.** `role-detail.tsx:116-117` (`await tenancy.saveRolePermissions(...)` then `await tenancy.rolePermissions(...)`); `access-tokens.tsx:99` and `:111` (both `primeCache("mcp-tokens", await mcp.tokens()…)` — the create discards the row the door returned and re-reads the whole list) | as cited |
| H | medium | **−7** | **NEW — cross-wave duplication survives the fix.** `useCached`'s mount effect ends in an unconditional `void load()` (`store.ts:368`), so a component mounting after an earlier wave settled re-asks a question already answered and cached. On the help screen: `content/help?scope=all` ×2, `selectable` ×2, `my-permissions` ×2. The rubric's `medium` tier is *"two components independently fetching the same thing on the same screen"* — exactly this, now that the same-tick case is gone | `store.ts:368`; `help-detail.tsx:81`, `:118`, `:126`; `agent-panel.tsx:46` |

100 − 44 = **56.**

**Why B did not come along for free, and why it is now the single biggest item in
this review.** Every other duplicate on the screen went through `useCached`.
`useActiveTeam` is the one read path that predates the store and keeps its own
module-level `sessionCache` (`:31`) with a subscriber set. It has the *cache* half
(a warm session paints instantly) and not the *in-flight* half. Those four
requests are now **4 of 16** — a quarter of the whole screen — and they are the
first two waves, so they are also the ones first paint waits on.

### 3 · Fetch the row, not the list — **63** · weight 13 · defect

| # | sev | pen | finding |
|---|---|---:|---|
| D | high | **−15** | `help-detail.tsx:81` still calls `content.help("all")` — the **list** endpoint — to render one ticket, then `.find()`s it (`:83`). Rubric `high`: "a list endpoint called to render a single record's detail". The `:98-101` fallback is additive and fires only when the list does *not* hold the ticket |
| E | high | **−15** | `learning-detail.tsx:64-66` **untouched, byte-identical**: `useCached<Learning[]>('learning:<team>')` then `.find()`. The whole learning list — up to `LIST_HARD_CAP` rows each carrying the full `content_body` article HTML — to render one article. `content.learningOne()` and the server's `oneLearning` (`learning.ts:217`, a real `WHERE l.id = ? LIMIT 1`) both exist and are still unused by this screen |
| G | medium | **−7** | **Four of five closed; one open, and it is the worst one.** `roles.ts:41`, `invites.ts:29`, `selectable.ts:34`, `learning.ts:40` now call `oneRole` / `oneInvite` / `oneSelectable` / `oneLearning`. **`workers/tenancy/src/routes/members.ts:15-16` still does `listMembers(...)` then `.filter((m) => m.userId === id)`** — with `oneMember` imported at `:6` of the same file and used at `:30` and `:45` |
| — | minor | 0 | `import.ts:114 getActiveCatalog` reads the catalogue whole and filters in JS. Bounded reference table, deliberate, reason at the line. No penalty |

100 − 37 = **63.**

**The number is unchanged and the substance improved by 80%. That is a rubric
limitation, and it is worth naming.** G was one `medium 7` covering five doors.
Four were fixed; the finding is still true, so the penalty still applies in full.
Round 2 reported the opposite asymmetry — criteria that held their number while
the risk rose. Both are the same blind spot seen from two sides.

**Why `members` is the worst of the five to have left behind.** It sits on the
live re-pull path: `store.ts:patchRow` answers a "row X changed" ping by calling
`TEAM_RESOURCES.members.fetchOne(id)` (`live-resources.ts:175` →
`tenancy.member(id)` → `GET /api/tenancy/members?id=`). And `team_members` is the
table `SCALING.md` sizes at **250,000 people per tenant**. So one role change in a
large team makes every connected session read the whole member list to patch one
row — on the path CACHING rule 3 exists to make cheap. This is two lines, in a
file where the correct reader is already imported.

### 4 · Nothing already in hand is fetched again — **60** · weight 12 · coverage

| line | pts | earned | evidence |
|---|---|---:|---|
| data already loaded is passed down rather than re-requested | 30 | **20** | **+5 this round.** `primeCacheIfCold` now yields a microtask (`store.ts:212`) so all four prewarm keys join the shell's richer read instead of opening a second, poorer one — F11 resolved. Still 20 of 30: `help-detail.tsx` re-declares `useCached` on the list key its parent already loaded rather than receiving the row |
| a client cache exists with a stated freshness rule | 25 | **25** | `CACHING.md` + `store.ts`'s stale-while-revalidate contract, unchanged |
| navigating back does not refetch what has not changed | 20 | **10** | unchanged — revalidate-on-mount means back always refetches, though it paints from cache first |
| reference data fetched once per session, not per screen | 15 | **0** | unchanged. `roles`, `invites`, `selectable`, `my-perms` are re-requested on every mount that declares them |
| HTTP cache headers where the answer is cacheable | 10 | **5** | unchanged — set on `/media/*` (the `?v=` cache-busting path), not on API reads |

**60.**

### 10 · Someone has measured it — **65** · weight 4 · coverage

| line | pts | earned | evidence |
|---|---|---:|---|
| timings captured anywhere | 50 | **50** | `Server-Timing: gateway;dur=N` on every non-101 response through the one public door — `shared/workers/trace.ts:162-178`, wired at `workers/gateway/src/index.ts:116`. Round 2's direct greps returned zero for this; they now return a real implementation |
| a target exists | 30 | **15** | `SLOW_MS = 1_000` (`trace.ts:182`) is a real target and it is *enforced* — a breach emits a structured line. Half credit: it is a **duration** target in **code**, not a hop target and not in any document. `grep -rniE "server-timing\|SLOW_MS" --include='*.md'` outside `reviews/` → 0 |
| checked more than once | 20 | **0** | nothing stores the header; the slow line lives in Cloudflare's log buffer, not a table anyone can diff |

**65.**

---

## How to move the reported number — and it is not what you would guess

The gate is criterion 1 and criterion 1 has four rows. Three of them are
essentially immovable in the short term:

- **≤5 hops (35 pts)** — 16 is in the 13+ band. Closing B saves 2 (one `me`, one
  `active`) and closing H saves 3 → **11**, which lands in the 9–12 band for
  **10 points**. Criterion 1 becomes 35 — *still under 40*, so **the gate still
  fires and the reported score is still 45.** Two of the three biggest fixes in
  this review buy nothing on the headline number.
- **≤3 services (20 pts)** — auth is a hop on every gated request by design
  (`whoAmI`), so this needs an architecture change.
- **median 1–2 hops (25 pts)** — already earned.

**The cheapest way to clear the gate is to write a hop budget down.** One row,
20 points, no code:

```
criterion 1 = 25 (median) + 20 (budget) = 45 ≥ 40  →  the cap lifts
uncapped total = 56 + (20 × 15 ÷ 100) = 59
reported: 45 → 59
```

**Fourteen reported points for one documented number.** It belongs in
`EDGE-CASES.md` beside §3 (which already gives a *rule* — "don't loop `d1Query`" —
and bounds no screen) or in `CLAUDE.md`'s planning ritual as an eighth question.
Something like: *"a cold screen costs at most 8 requests; a warm navigation at
most 3; name the ones your screen makes before you build it."*

That is not a scoring trick. The rubric weights it at 20 because a budget is what
turns "24" into "over" — and this review has now reported 24, 24 and 16 across
three rounds with nothing anywhere saying which of them was acceptable.

**Then** close B (−2, and it is the first two waves, so it is also criterion 9's
first paint) and H (−3), reaching 11 and a genuine 9–12 band, and the reported
score is **62**.

---

## Findings

### F2 · CRITICAL — the session is still loaded twice on every cold start, serially, and the de-duplication cannot reach it

`web/lib/use-active-team.ts:74-106` · `agent-host.tsx:22` · `deep-link-screen.tsx:71`

Two `useActiveTeam` instances each run their own `load()`:

```ts
const me = await auth.me()
…
const ctx = await tenancy.active()
```

Serial inside each instance, and both instances run concurrently — so 2 `me` and
2 `active`, in two waves, before anything else can start. That is **4 of the 16
requests, and the first two waves of four**, so criterion 9's first paint waits
on them too.

The module-level `sessionCache` (`:31`) with its reactive subscriber set is a
*result* cache, not an *in-flight* one. It is the exact half of the problem
`store.ts` just solved for every other key.

**Fix, and it is small.** Hoist the same shape: one module-level
`let inflightSession: Promise<Session> | null`, set before the `await`, cleared in
both outcomes, and every instance awaits it. Roughly twelve lines, mirroring
`sharedFetch`. **Do not route this through `useCached`** — the session drives a
router redirect on failure (`:92-93`), which `useCached` has no contract for, and
`ARCHITECTURE.md` treats the session as the one thing loaded outside the cache
layer.

### F1b · HIGH — `useCached` still revalidates on every mount, so a later wave re-asks a settled question

`web/lib/store.ts:357-375`, ending `void load()` at `:368`

The unconditional revalidate is correct for *navigation* and *team switch* — it is
what makes cache-first honest. It is wrong for a component mounting into a screen
whose earlier wave already answered the same key seconds ago. On the help screen
it costs 3 of 16 requests (`help`, `selectable`, `my-perms`), and it will cost
more on any screen that mounts in more than two waves.

**Fix, in-rule and small.** Record the timestamp beside the cached value and skip
the mount revalidate inside a short freshness window:

```ts
if (cache.has(key) && Date.now() - writtenAt(key) < REVALIDATE_AFTER_MS) return
```

`REVALIDATE_AFTER_MS` of a few seconds removes intra-screen re-asks and changes
nothing about navigation. **It must not be longer than a few seconds**, because
`CACHING.md` rule 3 makes live pings the freshness mechanism and a long window
would make the cache authoritative in a way the live layer does not expect. Round
1's F-series proposed passing data down instead; a freshness window is smaller and
touches one file rather than every screen.

### F6b · MEDIUM — one `?id=` door left, on the largest table, on the live re-pull path

`workers/tenancy/src/routes/members.ts:10-17`

```ts
const members = await listMembers(env, cfg, guard)
const id = new URL(request.url).searchParams.get("id")
return json({ members: id ? members.filter((m) => m.userId === id) : members })
```

Detail in criterion 3 above. **Fix:**
`const one = id ? await oneMember(env, cfg, guard, id) : null` returning
`{ members: one ? [one] : [] }` — the identical shape the other four adopted, and
the empty array is what `patchRow`'s null-drop path (`store.ts:246-247`) relies on
to remove a member who no longer belongs.

### F3 · HIGH — a record detail still pulls the collection to render one row

`help-detail.tsx:81-83` and `learning-detail.tsx:64-66`, both unchanged.

Learning is the worse of the two and it has had three rounds: the cached list
carries every article's full `content_body` HTML, and the screen `.find()`s one
out of it. `content.learningOne()` exists in `web/lib/api.ts`; the server's
`oneLearning` was rewritten in round 2 into a genuine single-row read; the screen
calls neither.

**Fix.** The `help-detail.tsx:98-101` pattern is already the answer and is already
in this codebase — a null-keyed `useCached` that fires only when the list does not
hold the row. Copy it to `learning-detail.tsx`. It preserves the locked
list-cache-as-detail-source optimisation (`EDGE-CASES.md §2`, `CACHING.md` rule 3)
for the common case and fixes the deep-link case.

### F4 · CRITICAL — the CSV import still writes one row per HTTP request, sequentially

`workers/data-ops/src/lib/import-batch.ts` · `shared/workers/http.ts:41-103`

Unchanged. `forwardToDoor` gained a `try/catch` in an earlier round and by its own
comment at `shared/workers/http.ts` still deliberately carries **no timeout**, so
a 1,000-row import is 1,000 sequential internal round trips with no bound on any
of them. Rubric `critical`: "one request per row over a collection that grows with
use."

**Fix, and it is genuinely hard, which is why it has survived three rounds.** The
per-row door call is what buys R10 (every write gated) and R18 (rights re-checked
per row) for imported data. The in-rule shape is a **batch door** that takes N
rows, gates once for the batch and validates per row — not bypassing the door.
That is a design change, and it should be planned rather than patched.

### F13 · MEDIUM — a reply still refetches the thread it just patched

Unchanged from round 2, caused by the realtime repair. `addReply`'s live deps
invalidate `help-thread:<id>` and its `total:` sidecar, so the R21 response that
patched the reply in is immediately followed by a full thread refetch plus a
`COUNT(*)`.

**One thing did improve.** With `invalidate` now dropping the in-flight entry
(`store.ts:162`), the refetch can no longer be *overwritten* by a response that
predates the reply. The redundant request remains; the correctness hazard beside
it is gone.

### F10 · RESOLVED — something now measures a request

`shared/workers/trace.ts:162-178`, wired at `workers/gateway/src/index.ts:116`.
Round 1 and round 2's F10 asked for `Server-Timing` at the gateway plus a written
hop budget. **Half of it shipped**, including the mandatory `status === 101`
guard that both this review and `speed_review` flagged as the detail that must not
be missed — without it the WebSocket upgrade throws and the live layer stops for
everyone. It is at `:172`.

**The other half — the written hop budget — did not ship, and per the section
above it is now worth 14 reported points on its own.**

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **Write a hop budget down** (clears the gate; +14 reported) | `EDGE-CASES.md` or `CLAUDE.md` (a paragraph) | ADDS a documented number; REMOVES "nobody set a budget" | **story_checks_out_review** — strictly helps, *provided the number is true of the app today*. A budget of 8 written while the worst screen costs 16 is a new contradiction for them to find. State it as a target with the current figure beside it. **lean_mean** — documentation, not code |
| **F2.** One in-flight promise for the session in `useActiveTeam` | `web/lib/use-active-team.ts` (~12 lines) | REMOVES 2 of 16 requests and one of the two first-paint waves | **realtime_review** — the session drives the team channel's `teamId`; a shared promise must still notify **both** instances, which the existing `sessionSubs` set already does. **security_sentry_review** — the failure path redirects to `/login`; a shared rejection must reject for every joiner, not just the first, or one instance stays on a dead session |
| **F1b.** A short revalidate-freshness window in `useCached` | `web/lib/store.ts` (~10 lines) | REMOVES 3 of 16 requests; ADDS a timestamp per entry | **realtime_review** — **their whole subject.** A window longer than a few seconds makes the cache authoritative where CACHING rule 3 says the live ping is. Agree the constant with them. **scaling_review** — helps: fewer reads per screen |
| **F6b.** Point the `members` `?id=` door at `oneMember` | `workers/tenancy/src/routes/members.ts` (2 lines) | REMOVES a full member-list read from every `members` live patch | **realtime_review** — this IS their re-pull path; the response must stay `{ members: [...] }` and must still return `[]` for a member who no longer belongs. **interfacelessness_review** — confirm no MCP tool reads this door expecting the whole list. **scaling_review** — strictly helps (their finding B) |
| **F3.** Null-keyed single-row fallback in `learning-detail.tsx` | `web/components/learning-detail.tsx` (~6 lines) | ADDS one conditional query; REMOVES a whole-list-with-HTML read on the deep-link path | **dead_end_review** — strictly helps: a deep link past the cap currently renders "no longer exists" about an article that exists. **story_checks_out_review** — `EDGE-CASES.md §2` describes the list-cache-as-detail-source optimisation; amend it to say "unless the row is absent", or it becomes a stale claim |
| **F13.** Drop the thread invalidate that follows the R21 patch | `web/lib/live-resources.ts` (~3 lines) | REMOVES a refetch + a `COUNT(*)` per reply | **realtime_review** — they added these deps for a reason (the thread total badge); the R21 response must carry `total` or the badge goes stale. Coordinate, do not just delete. **R16** — the exact count must still come from the server |
| **F4.** A batch import door | `workers/data-ops/src/lib/import-batch.ts`, a new gated batch route | REMOVES 999 of 1,000 internal round trips; ADDS a new door | **security_sentry_review** — a batch door must gate once and validate **per row**; a batch that validates once is an injection surface. **R10/R18** — the batch must re-check rights, not inherit them. **lean_mean** — a new route. Plan it; do not patch it |

---

## CEILING

**Is 95 reachable by changing code? Only with a composite per-screen read door.
Without one the true maximum is 92.**

Criterion 1 is the whole question, because it is the gate and it carries 15.

**With every in-repo fix in this report and no new door:**

```
hops 45×15 + duplicates 100×13 + overfetch 100×13 + reuse 100×12 + nplusone 100×12
+ parallel 100×11 + writeback 100×9 + payload 100×6 + firstpaint 100×5 + measured 100×4
= 675 + 1300 + 1300 + 1200 + 1200 + 1100 + 900 + 600 + 500 + 400
= 9175 ÷ 100 = 91.75 → 92
```

Criterion 1 tops out at 45 (median 25 + budget 20) because:

- **≤5 hops (35 pts) is unreachable without a composite door.** After F2, F1b and
  every de-duplication, the help screen still needs: session, active context,
  permissions, the ticket, the thread, stakeholders, members, record activity —
  **8 distinct questions**, and eight is not five. The only shape that reaches
  five is one screen-scoped door returning several resources at once.
- **≤3 services (20 pts) is unreachable full stop.** `whoAmI` calls auth on every
  gated request in every worker (`shared/workers/gating.ts:88`) — the permission
  spine `CLAUDE.md` calls the spine of the base. Any team-scoped screen therefore
  touches auth + tenancy + its own module, and the live channel makes four. A
  locked decision in `ARCHITECTURE.md`, not a defect.

**With a composite door**, criterion 1 reaches 80 (35 + 25 + 20, still zero on
services) and the total reaches **97**. So 95 *is* reachable, and exactly one
thing gets there.

**Whether that door should be built is not this review's call.** It cuts against
`CLAUDE.md`'s "add the least code" and against the module-per-door shape the
whole base is built on, and it would need R10 gating, R14 bounds and R16 counts
for every resource it returns. **The honest position: 92 is the ceiling of the
current architecture, it is 47 points above today, and every one of those 47
points is an ordinary commit.** Reach for the composite door only if 92 is ever
achieved and still not enough.
