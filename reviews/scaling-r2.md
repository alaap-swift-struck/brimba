# Scaling review, round 2 — Brimba · 2026-08-25
SCORE: 57/100   (round 1: 54/100)

Mode: **ANALYSE only** (campaign brief). Nothing in the repo was changed except this file.
Branch `review-campaign` @ `fe7d683`. Platform limits re-checked live today against
`developers.cloudflare.com/d1/platform/limits/` — **unchanged** from round 1
(100 bound parameters per query, 100 KB max statement, 10 GB per database,
1,000 queries per invocation, 30 s statement duration).

---

## DELTA

Round 1: **54**/100 → Round 2: **57**/100

| # | Criterion | R1 | R2 | Why it moved |
|---|---|---|---|---|
| 1 | Data partitioning & sharding | 64 | 64 | untouched — mover, activity valve and the moved-module activity hole all still exactly as found |
| 2 | Query shape & indexing | 2 | **27** | **+25** — Blocker 4 removed: all five `one*` readers now do `WHERE id = ?` |
| 3 | Endpoint contract stability | 59 | 59 | untouched |
| 4 | Growth triggers & headroom | 68 | 68 | untouched — the ops database is *still* outside the size-alarm filter, and it now has a new way to fill (Blocker 5) |
| 5 | Client data volume & lazy loading | 47 | 47 | untouched |
| 6 | Client cache freshness & bounds | 92 | 92 | untouched (help-thread staleness fixed, but that was realtime's finding, not one of my two minors) |
| 7 | Surge self-protection | 64 | **39** | **−25 — WENT DOWN.** A new blocker: `error_log_review`'s central catch on the gateway turned an unauthenticated, deliberately un-rate-limited path into one database write per request. Full finding below. |
| 8 | Sequential, atomic & contended ops | 88 | 88 | untouched |
| 9 | Write fan-out & realtime | 30 | 30 | number unchanged, **substance worse**: `realtime_review`'s help fix adds two more invalidations per ping per ticket viewer, one of them a `COUNT(*)`. Not separately penalised — same mechanism as Blocker 3, already at blocker severity in this dimension. Reported as a finding anyway. |
| 10 | Bulk paths, migrations & lifecycle | 6 | 6 | number unchanged, **substance worse**: `addReply` now writes an activity row per reply, and the two new central catches accelerate `error_logs` — both against retention that removes 5,000 rows per table per night |
| 11 | Elastic response time | 84 | 84 | untouched |
| 12 | File & object storage | 45 | **70** | **+25** — Blocker 1 removed: the orphan sweep's reference read is keyset-paged and fail-closed |

**Net: two blockers closed, one blocker opened.** The arithmetic of the move:

```
(+25 × 13)  queries    Blocker 4 closed
(+25 ×  8)  storage    Blocker 1 closed
(−25 ×  6)  surge      Blocker 5 opened
= (325 + 200 − 150) ÷ 100 = +3.75      53.74 → 57.49 → 57
```

**One criterion went down, and it went down because of somebody else's fix.**
That is the answer to the question this round was run to ask.

---

## What was verified, specifically

### Blocker 1 — CLOSED, correctly
`workers/tenancy/src/lib/sharding.ts:417–480` (the paged read at `:440–466`)

The reference read is now genuinely keyset-paged:

```sql
SELECT id, content_link FROM learning
  WHERE content_link LIKE '/media/learning/%' AND id > <after>
  ORDER BY id LIMIT 1000
```

looping until a short page, with `after` advanced from the last row. Both the
ordering (`ORDER BY id`) and the predicate (`id > ?`) are present, so the pages
tile without overlap or gap. Exceeding `ORPHAN_SCAN_CAP` **throws into the same
catch that a failed read uses**, and that catch `continue`s to the next team — so
a team whose reference set cannot be completed has **no** objects listed and **no**
objects deleted. That is fail-closed in the strict sense, not "a smaller sweep".

The test at `workers/tenancy/test/retention.test.ts:197–222` asserts all four
properties (`ORDER BY id`, the keyset predicate, the `throw`, the `continue`) and
reads through `namedBody` rather than `slice(indexOf(...))`, so it cannot be
satisfied by code further down the file. It would catch the regression.

Residual, **not counted** (unchanged since round 1, so counting it now would make
the delta measure my attention rather than the code): the *object* side is still
one `R2.list({ limit: 10_000 })` with `truncated` only warned about. If a team's
first 10,000 objects in key order are all referenced, orphans beyond them are
never reached — "the rest wait for tomorrow" is true only while deletions advance
the window.

### Blocker 4 — CLOSED, all five
Every `one*` reader now issues its own single-row read sharing the list's
projection constant, exactly as recommended:

| Reader | File | Now |
|---|---|---|
| `oneLearning` | `workers/content/src/lib/learning.ts:217` | `${LEARNING_SELECT} WHERE l.id = ? LIMIT 1` |
| `oneMember` | `workers/tenancy/src/lib/members.ts:194` | `${MEMBER_SELECT} AND tm.user_id = ? LIMIT 1` + one role by id |
| `oneRole` | `workers/tenancy/src/lib/members.ts:213` | `SELECT ${ROLE_COLUMNS} … WHERE id = ? LIMIT 1` + one `COUNT(*)` |
| `oneSelectable` | `workers/tenancy/src/lib/selectable.ts:62` | `… WHERE id = ? LIMIT 1` |
| `oneInvite` | `workers/tenancy/src/lib/invites.ts:122` | `… WHERE id = ? AND team_id = ?` + one role title |

Both halves of the finding are closed: the wasted read (a mutation no longer
pulls up to 1,000 rows plus, for `oneMember`, another 1,000 roles) **and** the
disappearance past the cap (`null` now means "not there", which is what
`applyUpdated` → `patchRow(… () => null)` is entitled to assume).

The shape guarantee R21/R23 were buying is preserved structurally — `MEMBER_SELECT`,
`ROLE_COLUMNS`, `LEARNING_SELECT` are shared between the list and the single read,
which is the mechanism `TICKET_COLS` already used.

`web/test/rules.test.ts:564–593` locks it, with a `seen > 3` blindness guard so a
scan that stops finding `one*` readers fails loudly rather than passing empty. It
matches the specific regression shape (`await list*(…)` + `.find(`); a differently
spelled re-introduction would slip past, which is worth knowing but is not a fault
in the fix.

### Blocker 2 — **STANDS**, unchanged, and now worth more
`workers/tenancy/src/lib/sharding.ts:322` — `SWEEP_BATCH = 5000`, one
`DELETE … LIMIT 5000` per rule per nightly run, no loop, no continuation, no
shortfall record. Verified by reading `sweep()` in full.

**What it is worth.** In round 1 this was a slow blocker: three core rules
(`idempotency_keys`, `login_codes`, `error_logs`) insert faster than 5,000/day at
a single busy tenant, so the tables grow *despite having a retention rule*, and
the shared databases they live in are capped at 10 GB with no mover.

Round 2 raises its value, because the repairs shipped this week make the tables it
governs grow faster:

- `error_logs` gains two new writers — the gateway's central catch
  (`workers/gateway/src/index.ts:88`) and realtime's (`workers/realtime/src/index.ts:122`)
  — and the gateway one is reachable by an anonymous caller with no rate limit
  (Blocker 5). A sweep that removes 5,000 rows a night against a table an attacker
  can fill at hundreds of rows a second is not a retention policy, it is a comment.
- `activity` gains a writer per help reply (`workers/content/src/lib/help.ts:471`),
  and `activity` has no rule but `KEEP_FOREVER`.

Still a **blocker**, and the single highest-leverage unfixed item in the review:
it is the thing standing between "an unbounded write path exists" and "an
unbounded write path is survivable". Fix is unchanged — loop the sweep until a
pass deletes fewer than `SWEEP_BATCH`, or a wall-clock/subrequest budget is spent,
and record the shortfall so it is visible.

### Blocker 3 — **STANDS**, and got measurably worse
`web/components/app-shell.tsx:120–160` · `web/lib/use-live-refetch.ts:14–24`

Verified line by line, unchanged:
- `invalidate(\`activity:team:${teamId}\`)` still fires on **every** ping, for
  every session, before any resource filtering;
- `patchRow(...)` still issues one single-row read per client holding that
  collection;
- `useLiveRefetch` still re-pulls the current page on every matching ping with
  **no debounce** — `if (ev.kind === "reconnect" || ev.resource === resource) ref.current()`.

`invalidate` (`web/lib/store.ts:98`) deletes the entry **and** notifies, so a
mounted screen refetches immediately. There is no coalescing anywhere on the
receive side.

**What it is worth.** Unchanged from round 1: at the yardstick — 25,000 concurrent
sessions in one tenant — one ordinary write produces up to ~25,000 reads against
that tenant's single D1, and a 512-id bulk deactivate publishes 512 pings
(`workers/content/src/routes/learning.ts:117`), so up to ~12.8M reads from one
click. D1 processes queries one at a time per database. This remains **the real
first ceiling inside a tenant**, and it arrives at a few thousand concurrent
sessions — well before the 32-shard channel ceiling the send-side work was built
to relieve.

**And it grew.** `web/lib/live-resources.ts:233–239` (realtime_review's repair)
adds `help-thread:${id}` and `total:help-thread:${id}` to the `help` resource's
deps. The correctness fix is right — two people replying to one ticket genuinely
did each see only their own replies — but the cost lands squarely here: a reply to
a ticket with *n* watchers now costs 2*n* extra reads instead of 0, and one of the
two is an exact `COUNT(*)` (R16). At the yardstick a busy ticket with 200 watchers
turns one reply into 400 extra reads. Not separately penalised — it is the same
mechanism already scored at blocker severity in this dimension — but it is a real
regression in the underlying quantity and belongs in this report.

---

## Arithmetic

```
coverage   = good_signals_present / good_signals_applicable
penalty    = Σ(blocker 25 | major 12 | minor 4)
dimension  = clamp(0, 100, round(100 × coverage − penalty))
total      = Σ(dimension × weight) ÷ 100
```

Weights are the rubric's "Scoring arithmetic" table (the one that sums to 100),
same as round 1. **Round 1 published dimension scores but not a finding→dimension
map**; the map below is reconstructed, and every carried-forward penalty is stated
so anyone can check that nothing was moved between dimensions to flatter the delta.

### 1 · Data partitioning & sharding readiness — 64 (weight 12)
coverage 4/4 = 1.00 → 100
penalty 36 = major 12 (M10 `activity` has no valve but deletion) + major 12
(M11 the mover breaks on the tables it exists to move) + major 12 (M12 a moved
module silently stops writing activity) → **64** · *unchanged, all three re-read
and confirmed at `sharding.ts:200–299`*

### 2 · Query shape & indexing — 27 (weight 13)
coverage 2/3 = 0.667 → 67 (indexes match shapes ✓ · reads bounded ✓ · no query in
a loop ✗ — bulk doors, the cron team walk and per-row import writes unchanged)
penalty 40 = ~~blocker 25 (B4)~~ **removed** + major 12 (M13 exact `COUNT(*)` on
every page) + major 12 (M14 bulk doors O(3n) sequential round-trips) + major 12
(M15 `IN (?, …)` past D1's 100-parameter cap) + minor 4 (M26 `SELECT *` on
`users`) → clamp(0, 67−40) = **27**

*M15 partially improved and still stands:* `taggedUserIds` is now bounded by
`optionalIdList` → `BULK_IDS_LIMIT`, which computes to
`floor((8192 − 512) / 15) = 512` (`shared/workers/limits.ts:41`). 512 is five times
D1's documented 100-bound-parameter ceiling, and `lookupUsers`
(`workers/content/src/lib/notify.ts:28–54`) still builds one flat `IN (?, …)`.
`getStakeholders`' admin set is still uncapped. Severity unchanged.

*M13 gained a site:* `total:help-thread:${id}`, now invalidated on every help ping.

### 3 · Endpoint contract stability — 59 (weight 7)
coverage 3/4 = 0.75 → 75 · penalty 16 = major 12 (`toPage` derives ONE cursor from
merged rows) + minor 4 (four owner/maintenance handlers build SQL inline) → **59**
· *unchanged; `routes/admin.ts` and `routes/team.ts` untouched by the repair pass*

### 4 · Growth triggers & headroom — 68 (weight 8)
coverage 3/3 = 1.00 → 100
penalty 32 = major 12 (M5 the ops database is outside the size-alarm filter) +
major 12 (M6 nothing receives the alarm) + minor 4 (M22 no growth **rate**
recorded; the log line still says ">=80% of cap" at a 65% threshold) + minor 4
(M23 four nightly jobs share one try/catch) → **68**

Re-verified on disk, all four:
`sharding.ts:67` — `all.filter((db) => db.name.startsWith("team-") || CORE_DB_NAMES.test(db.name))`,
and `CORE_DB_NAMES = /-core(-staging)?$/`. `brimba-ops` matches neither. `sharding.ts:94`
still prints ">=80% of cap". `workers/tenancy/src/index.ts:174–198` still has one
`try` around all four jobs.

### 5 · Client data volume & lazy loading — 47 (weight 9)
coverage 3/4 = 0.75 → 75 (no virtualisation anywhere in `web/`) · penalty 28
(M18 virtualisation, M19 growing collections capped at 1,000, + one carried minor)
→ **47** · *unchanged*

### 6 · Client cache freshness & bounds — 92 (weight 9)
coverage 4/4 = 1.00 → 100 · penalty 8 (two carried minors, incl. M24 the two
ceilings multiplying to a 1,000,000-row worst case) → **92** · *unchanged*

The deep-link fix (`web/components/help-detail.tsx:84–101`) adds a `help-one:<id>`
key, fetched only when the list genuinely lacks the ticket, under the same
`MAX_ENTRIES` ceiling. Neutral.

### 7 · Surge self-protection — 39 (weight 6) — **DOWN FROM 64**
coverage 4/5 = 0.80 → 80
penalty 41 = **blocker 25 (B5, new — see Findings)** + major 12 (no concurrency
bound on expensive operations) + minor 4 (M25 `d1-rest` retries with no jitter)
→ clamp(0, 80−41) = **39**

### 8 · Sequential, atomic & contended operations — 88 (weight 11)
coverage 3/3 = 1.00 → 100 (sequences **N/A** — ULIDs) · penalty 12 → **88** ·
*unchanged; the idempotency seam, credit atomicity and the R17 predicates were not
touched. `setRolePermissions` gained two guard reads before its write
(`roles.ts:226–241`) — a read-then-write on a low-frequency admin door, benign.*

### 9 · Write fan-out & realtime propagation — 30 (weight 7)
coverage 2/3 = 0.667 → 67 · penalty 37 = blocker 25 (B3) + major 12 (unscoped
broadcast) → **30** · *number unchanged, quantity worse — see Blocker 3 above*

### 10 · Bulk paths, migrations & data lifecycle — 6 (weight 5)
coverage 2/3 = 0.667 → 67 · penalty 61 = blocker 25 (B2) + major 12 (M8 the one
unbatched sweep is on the highest-volume table) + major 12 (M9 team retention
names one table out of ten that grow) + major 12 (M10's lifecycle half) →
clamp(0, 67−61) = **6** · *number unchanged, quantity worse*

`shared/workers/retention.ts:117` — `EXPIRED_SESSIONS_SQL = "DELETE FROM sessions
WHERE expires_at < ?"` — still unbatched, still called directly at
`sharding.ts:355`.

### 11 · Elastic response time — 84 (weight 5)
coverage 2/2 = 1.00 → 100 (three signals **N/A** on isolates) · penalty 16 →
**84** · *unchanged*

### 12 · File & object storage — 70 (weight 8) — **UP FROM 45**
coverage 6/7 = 0.857 → 86 (presigned direct-to-storage still absent — the owner
declined the R2 API token on 2026-08-12)
penalty 16 = ~~blocker 25 (B1)~~ **removed** + major 12 (file bytes pass through
the worker on both upload and download) + minor 4 (no R2 lifecycle rule) →
**70**

### Total

| # | Dimension | Score | Weight | Score × weight |
|---|---|---|---|---|
| 1 | Data partitioning & sharding | 64 | 12 | 768 |
| 2 | Query shape & indexing | 27 | 13 | 351 |
| 3 | Endpoint contract stability | 59 | 7 | 413 |
| 4 | Growth triggers & headroom | 68 | 8 | 544 |
| 5 | Client data volume & lazy loading | 47 | 9 | 423 |
| 6 | Client cache freshness & bounds | 92 | 9 | 828 |
| 7 | Surge self-protection | 39 | 6 | 234 |
| 8 | Sequential, atomic & contended ops | 88 | 11 | 968 |
| 9 | Write fan-out & realtime | 30 | 7 | 210 |
| 10 | Bulk paths, migrations & lifecycle | 6 | 5 | 30 |
| 11 | Elastic response time | 84 | 5 | 420 |
| 12 | File & object storage | 70 | 8 | 560 |

```
768 + 351 + 413 + 544 + 423 + 828 + 234 + 968 + 210 + 30 + 420 + 560 = 5749
5749 ÷ 100 = 57.49 → 57
```

---

## The two-level yardstick

*Inside one tenant.* **Still fails at ~1,000 people, not 250,000** — `listMembers`
still carries `LIMIT 1000` and `members` is still absent from `GROWING_COLLECTIONS`,
so R14's paging half still never applies to the collection the yardstick is defined
by. The consequence is now *only* a refusal to answer rather than a record that
vanishes from the screen, which is a real improvement, but the ceiling has not
moved. Immediately behind it, the live layer's read side is still unbounded and is
now slightly heavier per ping.

*Across tenants.* **Still fails in the low thousands of teams** — the nightly cron
is still O(teams) inside one invocation against a 10,000-subrequest ceiling with no
cursor; retention still removes at most 5,000 rows per table per night; every
request in every tenant still reads the one shared core database with read
replication off. **And it now fails sooner and more cheaply**, because the shared
operations database — the one no alarm watches — can be filled by an anonymous
caller (Blocker 5).

**The first ceiling, in one sentence:** unchanged in kind and worse in reach — one
write still fans out to as many reads as there are connected sessions in that
tenant, and as of this week an unauthenticated request can write a row into the
shared operations database that nothing watches and nothing prunes fast enough.

**Observability caveat (rubric, cross-cutting):** nothing in this repo measures p95
latency per endpoint or per-table row counts over time. Every latency and growth
number here is arithmetic from row counts and documented limits, not a measurement.

---

## Findings

Round-1 findings that stand unchanged are listed at the end rather than repeated.
Only what is new or materially changed is written out.

### BLOCKER 5 · NEW · An anonymous request writes a row into the shared operations database, with no rate limit
`workers/gateway/src/index.ts:77–112` (the new central catch) ·
`workers/gateway/src/index.ts:152` (the rate limiter's scope) ·
`workers/gateway/src/index.ts:248,254` (`decodeURIComponent`) ·
`workers/auth/src/index.ts:148–168` (`internalLogError`)

**Introduced by:** `error_log_review`'s repair in commit `73a60a4`
("the gateway and realtime record crashes centrally").

**Plain English.** The gateway now records every crash. `/media/*` is deliberately
outside the rate limiter. And `/media/*` can be made to crash by anyone, without
signing in, by sending a broken percent-escape.

**The chain, verified end to end:**

1. `GET /media/%` (or `/media/learning/%E0%A4%A`) reaches the gateway. Both are
   valid URL syntax — I confirmed in Node that `new URL()` accepts them and
   `decodeURIComponent` throws `URIError: URI malformed` on both. The repair's own
   commit message states this: *"`GET /media/%` is enough: `decodeURIComponent`
   throws a URIError, unauthenticated, and nothing recorded it."*
   **Unmeasured against the live edge:** I could not send a request to a deployed
   gateway, so whether Cloudflare normalises a *lone* `%` before the Worker runs is
   untested. `%E0%A4%A` — a truncated but syntactically valid escape — removes that
   doubt: it is unambiguously legal URL syntax, and it throws.
2. The rate limiter never runs. `workers/gateway/src/index.ts:152` gates it on
   `pathname.startsWith("/api/") || pathname === "/mcp"`, with the comment
   *"static assets and /media/\* are served from cache and are not a load the app
   has to survive."* That reasoning was correct on 2026-08-11 when `/media/*` did
   no writes. The new catch falsified it, and nothing re-examined the exclusion.
3. The throw hits the new catch, which `await`s
   `callService(env.AUTH, ".../internal/log-error", …)` carrying `INTERNAL_KEY`.
4. `internalLogError` writes one row into `error_logs` via `opsDatabase(env)`.
   No dedup, no sampling, no per-source ceiling, no key on `(source, place, message)`
   — every call is a fresh ULID and a fresh row.

**Arithmetic.** Row width is capped (`message` ≤ 500, `stack` ≤ 2,000, `url` ≤ 300);
a `URIError` stack is short, so ~350–500 bytes in practice. D1's per-database cap is
10 GB, so ~20–28M rows fills it. At 500 requests/second from one source that is
**under fifteen hours**. The nightly sweep removes 5,000 rows (Blocker 2). Net
growth is monotonic and the shared database is the one the size alarm does not
watch (Major 5) — so nothing notices, nothing prunes, and nothing alarms.

**And in a fork or a mis-deployed environment it is worse.** `shared/workers/ops-db.ts`
documents the fallback deliberately: a worker without the `OPS` binding writes to
`env.DB` — the **core** database, which holds `users`, `team_members`, `sessions`,
`invite_index` and `idempotency_keys`. Filling that stops sign-in for every tenant
on the platform.

**Why it matters.** Every other unbounded thing in this base needs a session and
meets a rate limit. This one needs neither. It is the only path I found where an
anonymous party controls the growth rate of a resource shared by every tenant.

**Fix (two, and both are worth doing):**

1. **A malformed path is not a crash.** Wrap the two `decodeURIComponent` calls and
   return a clean 400. ERROR-HANDLING.md already draws this line —
   *"Clean GuardError refusals (4xx) are never logged; this table is for the
   unexpected only"* — and a broken percent-escape is a 4xx by any reading. One
   `try` each, no new machinery. Closes the known trigger.
2. **Bound the class, not the instance.** Give `/media/*` its own generous ceiling
   (a separate limiter binding, e.g. 3,000/min per caller — high enough that an
   image-heavy article never meets it) so the *next* unhandled throw on an
   unauthenticated path cannot do this again. Fix 1 alone leaves the shape intact.

A third option — dedup or sample error recording by `(source, place, message)`
within a window — is the structurally right answer but needs shared state (a
Durable Object or KV) and is Tier C.

### MAJOR 13 (widened) · The exact `COUNT(*)` now runs on every help ping, for every ticket viewer
`web/lib/live-resources.ts:233–239` · `workers/content/src/lib/help.ts:143–155, 200–208, 402`

`total:help-thread:${id}` joins the `help` resource's deps, so every reply to a
ticket makes each viewer of that ticket re-run an exact server `COUNT(*)` over the
thread. R16 requires the count to be exact, so this is not a bug — it is the law's
cost arriving on a new, much hotter path. The in-rule mitigation is unchanged from
round 1: cache the count for a few seconds per (team, resource) inside the worker,
and do not recompute it on pages after the first.

### Round-1 findings re-verified as standing, unchanged

| # | What | Where | Still true? |
|---|---|---|---|
| B2 | Retention removes ≤ 5,000 rows per table per night | `sharding.ts:322` | **yes** — and now worth more |
| B3 | One write costs one read per connected session | `app-shell.tsx:128` · `use-live-refetch.ts:21` | **yes** — and now costs 2 more per help ping |
| M5 | The ops database is outside the size-alarm filter | `sharding.ts:67` | **yes** — and it now has an anonymous filler |
| M6 | Nothing receives the size alarm | `sharding.ts:71–96` | yes |
| M7 | The nightly cron is O(teams) in one invocation | `sharding.ts:417–480`, `:380–392` | yes |
| M8 | The one unbatched sweep is on the highest-volume table | `retention.ts:117` | yes |
| M9 | Team retention names one table out of ten that grow | `retention.ts:99–107` | yes — and `activity` now gains a row per help reply |
| M10 | `activity` has no valve but deletion | `team-schema.ts:63` | yes |
| M11 | The mover breaks on the tables it exists to move (100 KB statements, `OFFSET`) | `sharding.ts:242–261` | yes — verified verbatim |
| M12 | A moved module silently stops writing activity | `sharding.ts:222–302` | yes — the mover still creates only the named tables and then writes its own audit row into a database with no `activity` table |
| M14 | Bulk doors are O(3n) sequential remote round-trips | `learning.ts:432–455` · `routes/learning.ts:117` | yes |
| M15 | Two queries build `IN (?, …)` past D1's 100-parameter cap | `stakeholders.ts:53–63,155,159` · `notify.ts:28–54` | yes — one half now capped at 512, still 5× the limit |
| M16 | The per-tenant surge ceiling is sized below the yardstick | `wrangler.jsonc` ×3 | yes |
| M17 | Every request reads one D1 primary; read replication off | `gating.ts:103` | yes — `withSession` still returns zero hits |
| M18 | Nothing is virtualised | `web/` | yes |
| M19 | The collections that scale with the yardstick are capped at 1,000 | `registry.ts` `GROWING_COLLECTIONS` | yes |
| M20–26 | the minors | as listed in round 1 | all yes; M22's ">=80% of cap" message still contradicts the 65% threshold |

### Cross-review note, outside my scoring
`workers/auth/src/index.ts:152–158` destructures the log-error body without
`requestId`, so the `requestId` the gateway's new catch sends is dropped and every
gateway crash row lands with `request_id` NULL. That defeats the correlation the
same commit set out to add. It belongs to `error_log_review` / `architecture_review`,
not to scaling — flagged here because I found it while tracing Blocker 5.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **B5.1** Return a clean 400 for a malformed media path instead of throwing | `workers/gateway/src/index.ts` | ADDS two `try` blocks; REMOVES an anonymous write path | ⚠️ **error_log_review** — this deliberately stops recording a class of failure, and their criterion is "could an error happen here and leave no trace". The reconciliation is ERROR-HANDLING.md's own line: a 4xx refusal is not an error. If they disagree, the honest compromise is B5.2 alone. **security_sentry** — helps (closes an unauthenticated amplification). **speed_review** — neutral |
| **B5.2** A separate, generous rate-limit binding for `/media/*` | `workers/gateway/src/index.ts`, `workers/gateway/wrangler.jsonc` | ADDS one limiter call per media request | **speed_review** — one edge limiter call per image; sub-millisecond, but it is not zero. **spend_review** — a new binding. ⚠️ **This reverses a decision I made myself in round 1's predecessor** (2026-08-11: "/media/* … not a load the app has to survive"). The premise changed; the decision should change with it, and SCALING.md §4 must be corrected or it will read as a contradiction to **story_checks_out** |
| **B2** Loop the retention sweep to a budget, record the shortfall | `workers/tenancy/src/lib/sharding.ts`, `shared/workers/retention.ts` | ADDS a loop + a counter | **spend_review** — many more D1 rows deleted per night (billed as rows written). **speed_review** — the cron runs longer. Both are the point. Now also the mitigation that makes B5 survivable rather than terminal |
| **B3.1/3.2** Scope + debounce the activity invalidation; coalesce ping-driven refetches | `web/components/app-shell.tsx`, `web/lib/use-live-refetch.ts`, `web/lib/store.ts` | ADDS a small buffer/timer; REMOVES up to 25,000 reads per write | ⚠️ **realtime_review** — a debounce delays a live update by up to 250 ms, and they have just *increased* live coverage on help; a coalescing window will read as "less live" to their criteria. This is the sharpest live tension in the campaign. **round_trip_review** — strictly helps. **lean_mean** — a timer is more code |
| **B3.3** Scope the broadcast server-side by declared resource | `workers/realtime/src/index.ts`, `web/lib/realtime.ts` | ADDS a subscription message; REMOVES pings nobody uses | **realtime_review** — the DO holds per-socket state, fighting hibernation's "stores no application data". **architecture_review** — realtime stops being module-agnostic |
| **M5** Widen the size-alarm filter to `-ops` | `workers/tenancy/src/lib/sharding.ts` + a test | ADDS one regex clause | none — a one-line filter widening with no runtime cost. Now urgent rather than tidy: it is the only thing that would notice B5 happening |
| **M13** Cache the R16 count briefly per (team, resource); skip recount past page one | `workers/*/src/lib/*` count helpers, `shared/workers/paging.ts` | REMOVES the repeated `COUNT(*)` | ⚠️ **Tension with Law R16** — the number stops being exact-at-this-instant. Owner decision, not a repair. **realtime_review** — a badge could lag a ping by seconds. Larger now that help pings carry a count |
| **M15** Chunk `lookupUsers` at ≤ 90 ids; cap the admin set | `workers/content/src/lib/{stakeholders,notify}.ts` | ADDS a chunk loop; REMOVES a 500 at scale | **round_trip_review** — more queries per stakeholder read. **spend_review** — helps (`optionalIdList` already bounded the email fan-out; this bounds the query) |
| **M9** A retention rule per growing team table + a derive-don't-list test | `shared/workers/retention.ts` + a test | ADDS ~6 rules + one test | ⚠️ **activity_log_review** — they have just ADDED a writer to `activity` (help replies) for R25 coverage; any non-`KEEP_FOREVER` window shortens the trail they just widened. Ship them all `KEEP_FOREVER` and let the owner choose the numbers |
| **M12** Create `activity` + its indexes in every module database the mover makes | `sharding.ts`, `team-schema.ts`, `activity-read.ts` + a test | ADDS schema creation + a merged read | **activity_log_review** — helps directly (closes an R25 hole that opens the moment the documented scaling lever is pulled). **speed_review** — the team feed may fan across databases |
| **M11** Keyset + byte-budgeted copy in the mover, with resume | `workers/tenancy/src/lib/sharding.ts` | ADDS a byte accumulator + a resume marker; REMOVES `OFFSET` | **lean_mean** — the mover grows. **base_fork_review** — forks inherit a more complex but working valve |
| **M7** Cursor + subrequest budget on the nightly team walk | `sharding.ts`, `db/core/*` | ADDS state + a loop; REMOVES a silent partial run | **lean_mean** — more machinery. **architecture_review** — new persistent cron state to own |
| **M8** Batch the expired-session DELETE through `sweep()` | `shared/workers/retention.ts`, `sharding.ts` | REMOVES a special case (net less code) | **lean_mean** — helps. Interacts with B2: without B2, batching makes session pruning *slower* |
| **M19** Add `members` + `learning` to `GROWING_COLLECTIONS` and page them | `shared/rules/registry.ts`, `members.ts`, `routes/members.ts`, web member screens | ADDS keyset paging + `LoadMore` | ⚠️ **R16** — a paged screen must still badge the whole collection, so M13's cost lands here too. ⚠️ **R15** — the paged screen subscribes via `useLiveRefetch`, which feeds B3 |
| **M17** Enable D1 read replication; `withSession` on read-only core paths | `gating.ts`, `sessions.ts`, D1 config | REMOVES the single-primary read ceiling | ⚠️ **security_sentry** — a replica can lag; a permission check on a stale replica could allow a just-revoked right for seconds. Membership and permission reads may need `first-primary`. The one fix that needs a security opinion before it ships |
| **M6** Email the owner on a newly-opened `db_alerts` row | `sharding.ts` | ADDS one `callService` to the existing sender | **spend_review** — a handful of emails a year. **security_sentry** — a new outbound path from a cron; it carries a database name and a byte count, no customer data |
| **M18** List virtualisation | **`@swift-struck/ui` — a different repo** | — | Cannot be done here (CLAUDE.md: the library is lego, never forked into the host). Surface it, do not fix it |
| **M10** An `activity` archive database + a fallback read | `sharding.ts`, `activity-read.ts`, DATA-MODEL.md | ADDS a second read path | Tier C, plan only. **architecture_review** — a new datastore per team. **activity_log_review** — helps (history survives instead of being deleted) |
| **M20–26** the minors | as listed | small, local | 22/23 ADD lines (**lean_mean** −). 25 (jitter) **speed_review** — a retried request waits marginally longer. 26 (`SELECT *`) neutral |

---

## CEILING

**Is 95 reachable by changing code in this repository? No — and round 1's stated
maximum of 94 was one point too generous. The true maximum is 93.**

**Revision, and why.** Round 1 capped dimension 12 at 86 — the coverage miss from
the absent presigned upload path — but then assumed its **major penalty** could be
cleared. It cannot: the rubric scores "presigned direct-to-storage" as a missing
good signal *and* "do file bytes pass through your app" as a major finding, and
both are consequences of the same declined R2 API token. Carrying the permanent
major, dimension 12's cap is 86 − 12 = **74**, not 86. That removes 96 points of
weighted score:

```
partitioning 100×12 + queries 88×13 + contract 100×7 + headroom 100×8
+ clientvolume 75×9 + clientcache 100×9 + surge 100×6 + atomic 100×11
+ fanout 88×7 + lifecycle 100×5 + elastic 100×5 + storage 74×8
= 1200 + 1144 + 700 + 800 + 675 + 900 + 600 + 1100 + 616 + 500 + 500 + 592
= 9327 ÷ 100 = 93.27 → 93
```

**The four caps, unchanged in kind:**

- **Client data volume (weight 9) is capped at 75.** Virtualisation lives in
  `@swift-struck/ui`; CLAUDE.md forbids editing the library from this repo.
- **File & object storage (weight 8) is capped at 74.** Presigned direct-to-storage
  needs the R2 API token the owner declined on 2026-08-12. A decision, reversible
  by the owner, not by a commit.
- **Query shape (weight 13) tops out at 88.** R16 requires an exact server
  `COUNT(*)` on every collection; the only fix that removes the O(n) cost is a
  maintained counter, which puts R16's exactness at risk.
- **Write fan-out (weight 7) tops out at 88.** Coalescing a bulk door's per-row
  pings into one collection ping contradicts CACHING rule 3 and R1. The client-side
  half (B3.1, B3.2) is in-rule and recovers most of the loss.

**Blocker 5 does not move the ceiling** — it is fixable by a commit, twice over.

**95 still requires exactly one of two things outside this repo**, and either alone
clears it:

- the UI library shipping list virtualisation → clientvolume 75 → 100:
  `93.27 + (25 × 9)/100 = 95.52` → **96**
- the owner granting the R2 API token for presigned uploads → storage 74 → 100:
  `93.27 + (26 × 8)/100 = 95.35` → **95**
