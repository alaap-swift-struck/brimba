# Scaling review, round 3 — Brimba · 2026-08-25
SCORE: 63/100   (round 1: 54 · round 2: 57)

Mode: **ANALYSE only**. Nothing in this repository was changed except this file.
Branch `review-campaign` @ `256d21b`, working tree clean.

Platform limits re-checked live today against
`developers.cloudflare.com/workers/platform/limits/` — the subrequest row now
reads **"10,000/request (up to 10M)"** on Workers Paid, 50/request on Free.
That confirms the 10,000 figure this review has used since round 1 and the
figure `SCALING.md:30` carries. **Service bindings do not count as subrequests**;
the D1 *native binding* has its own separate ceiling of 1,000 queries per Worker
invocation. Both facts matter below.

---

## DELTA

Round 1: **54** → Round 2: **57** → Round 3: **63**

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---:|---:|---:|---:|---|
| 1 | Data partitioning & sharding | 12 | 64 | 64 | 64 | untouched |
| 2 | Query shape & indexing | 13 | 2 | 27 | **35** | **+8** — four of the five live re-pull doors (`?id=`) now read one indexed row instead of a whole collection. The fifth, `members`, does not — finding B |
| 3 | Endpoint contract stability | 7 | 59 | 59 | 59 | untouched |
| 4 | Growth triggers & headroom | 8 | 68 | 68 | 68 | **two movements that cancel.** The alarm threshold is now 80% and matches every document (gain). The **operations database is still outside the alarm's filter** and now carries six new writers (loss) — finding A |
| 5 | Client data volume & lazy loading | 9 | 47 | 47 | **62** | **+15** — list virtualisation is real, automatic and reaches every recipe collection. The cap I applied in rounds 1–2 was wrong: it was measuring a pinned old version |
| 6 | Client cache freshness & bounds | 9 | 92 | 92 | 92 | untouched |
| 7 | Surge self-protection | 6 | 64 | **39** | **64** | **+25 — the criterion that fell in round 2 is fully restored.** Blocker 5 closed by `decodeKey`. Verified, not assumed |
| 8 | Sequential, atomic & contended ops | 11 | 88 | 88 | 88 | untouched |
| 9 | Write fan-out & realtime | 7 | 30 | 30 | 30 | **Blocker 3 STANDS**, verbatim — finding C |
| 10 | Bulk paths, migrations & lifecycle | 5 | 6 | 6 | **34** | **+28** — Blocker 2 closed: the sweep loops to a short batch under a hard bound and a bound that is HIT writes a real row |
| 11 | Elastic response time | 5 | 84 | 84 | 84 | untouched |
| 12 | File & object storage | 8 | 45 | 70 | 70 | untouched |

**No criterion went down.** That is the direct answer to this round's second
question for this review: **no other agent's repair broke a scaling criterion,
and the one that broke last round has been restored to its exact prior value.**

Arithmetic of the move:

```
(+8  × 13)  queries       104
(+15 ×  9)  clientvolume  135
(+25 ×  6)  surge         150
(+28 ×  5)  lifecycle     140
                          ---
                          529 ÷ 100 = +5.29    57.49 → 62.78 → 63
```

---

## Arithmetic

| # | criterion | key | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | Data partitioning & sharding | `partitioning` | 64 | 12 | 768 |
| 2 | Query shape & indexing | `queries` | 35 | 13 | 455 |
| 3 | Endpoint contract stability | `contract` | 59 | 7 | 413 |
| 4 | Growth triggers & headroom | `headroom` | 68 | 8 | 544 |
| 5 | Client data volume & lazy loading | `clientvolume` | 62 | 9 | 558 |
| 6 | Client cache freshness & bounds | `clientcache` | 92 | 9 | 828 |
| 7 | Surge self-protection | `surge` | 64 | 6 | 384 |
| 8 | Sequential, atomic & contended ops | `atomic` | 88 | 11 | 968 |
| 9 | Write fan-out & realtime | `fanout` | 30 | 7 | 210 |
| 10 | Bulk paths, migrations & lifecycle | `lifecycle` | 34 | 5 | 170 |
| 11 | Elastic response time | `elastic` | 84 | 5 | 420 |
| 12 | File & object storage | `storage` | 70 | 8 | 560 |
| | **weights** | | | **100** | **6278** |

`768+455 = 1223; +413 = 1636; +544 = 2180; +558 = 2738; +828 = 3566; +384 = 3950;`
`+968 = 4918; +210 = 5128; +170 = 5298; +420 = 5718; +560 = 6278.`
**6278 / 100 = 62.78 → SCORE 63.**

### Criterion 2 · `queries` 27 → 35 (weight 13)

Five doors answered a "row X changed" ping by reading the whole collection and
filtering in JavaScript. Four now read one row:

| door | file:line | now |
|---|---|---|
| roles | `workers/tenancy/src/routes/roles.ts:41` | `const one = id ? await oneRole(env, cfg, guard, id) : null` |
| invites | `workers/tenancy/src/routes/invites.ts:29` | `oneInvite(env, cfg, guard, id)` |
| dropdown values | `workers/tenancy/src/routes/selectable.ts:34` | `oneSelectable(cfg, guard, id)` |
| learning | `workers/content/src/routes/learning.ts:40` | `oneLearning(cfg, guard, id)` |
| help | `workers/content/src/routes/help.ts:58-66` | already correct — `getTicket(cfg, guard, id)` |
| **members** | **`workers/tenancy/src/routes/members.ts:15-16`** | **`listMembers(...)` then `.filter((m) => m.userId === id)`** |

+8 rather than +10: four of five, and the fifth is the worst one to have left
(finding B). No new index was added, so every index defect from round 1 stands.

### Criterion 4 · `headroom` 68 → 68 (weight 8) — two movements that cancel

**Gain.** `ALERT_THRESHOLD_BYTES` is now 80% of D1's 10 GB cap
(`workers/tenancy/src/lib/sharding.ts:37-46`), which is the number
`ARCHITECTURE.md`, `BASE-MANUAL.md` and `CONVENTIONS.md` always stated. The alarm
no longer fires at one number while its own message quotes another.

**Loss, exactly cancelling it.** Finding A: the operations database is still
outside the filter that decides what gets sized.

### Criterion 5 · `clientvolume` 47 → 62 (weight 9) — I was measuring the wrong tree

Rounds 1 and 2 scored "no virtualisation; a 2,000-row collection puts 2,000 nodes
in the DOM" and capped the criterion at 75 on the grounds that virtualisation
lived in a library this repo may not edit. **Both halves were wrong**, and the
reason is worth recording: I read `node_modules/@swift-struck/ui`, which is
**still `0.4.0`** and contains no virtualisation, no `emptyAction` and no
`ConnectionStatus`. The tree the web app actually resolves is
`web/node_modules/@swift-struck/ui`, which is **`0.16.0`** and has all three.

What 0.16.0 actually provides, read at
`web/node_modules/@swift-struck/ui/registry/primitives/use-virtual-rows/use-virtual-rows.tsx`:

- `VIRTUALIZE_THRESHOLD = 100` — below it nothing changes at all;
- pitch and column count are **measured from the DOM**, not configured, so a
  grid whose column count changes at a breakpoint needs no prop;
- it finds whichever ancestor already scrolls — **no host edit required**;
- consumed by `collections/list`, `collections/data-table` and
  `collections/card-grid`.

And the host gets it on every recipe collection, because
`collections/screen-renderer/screen-renderer.tsx` imports and renders all three
(`:56`, `:64`, `:69`; rendered at `:447`, `:571`, `:596`, `:624`) and
`web/components/deep-link-screen.tsx:26` is the only screen host.

62 rather than higher, for two reasons a commit here cannot fix:
`collections/activity-feed` and `collections/ticket-thread` — the two feeds that
grow fastest — contain no `useVirtualRows`; and virtualisation bounds the **DOM**,
not the **fetch or the array**. `web/lib/store.ts:40` still holds
`MAX_ROWS_PER_ENTRY = 2000` per key, so a power user paging all afternoon still
holds 2,000 rows of JSON in memory and still transferred them.

### Criterion 7 · `surge` 39 → 64 (weight 6) — the round-2 regression is closed

Blocker 5 was: the gateway's new central catch turned an unauthenticated,
deliberately un-rate-limited path into one database write per request, because
`GET /media/%` reaches `decodeURIComponent`, which throws a `URIError`.

`workers/gateway/src/index.ts:64-70` now has:

```ts
function decodeKey(raw: string): string | null {
  try { return decodeURIComponent(raw) } catch { return null }
}
```

applied at **both** media routes (`:276`, `:284`), each returning
`fail(400, "invalid_path", …)` — a 4xx, recorded nowhere, which is what
`ERROR-HANDLING.md` says of 4xx. I re-read the whole `route()` chain above the
authentication point for another parse that can throw on attacker input: the only
other candidate is `JSON.parse` at `:236`, and it is inside the error-beacon
route, below `rateLimit(request, env)` at `:181`. **The amplification path is
closed and I found no second one.** 64 restores the round-1 value exactly, not
approximately — the mechanism, not merely the symptom, is gone.

### Criterion 10 · `lifecycle` 6 → 34 (weight 5) — Blocker 2 closed

`workers/tenancy/src/lib/sharding.ts:377-411`. The sweep now loops:

```ts
for (let pass = 1; ; pass++) {
  const gone = await run(`DELETE FROM ${rule.table} WHERE rowid IN (
     SELECT rowid FROM ${rule.table} WHERE ${rule.column} < ? LIMIT ${SWEEP_BATCH})`, [cutoff])
  removed += gone
  if (gone < SWEEP_BATCH) break        // ran out of rows — clean
  if (pass >= maxPasses) { shortfall = true; break }   // ran out of budget — reported
}
```

and a shortfall reaches the one error store rather than a console line
(`:481-486`): `await recordWorkerError(opsDatabase(env), "tenancy", "cron/retention", new Error(detail))`,
**one row per run** however many rules fell short.

34 rather than higher: the import path is still neither resumable nor
progress-visible; `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`) is
still a single unbatched `DELETE FROM sessions WHERE expires_at < ?`; and
`TEAM_SWEEP_MAX_PASSES = 1` means a per-team rule that cannot keep up never
will — stated honestly at the line, and today moot because `TEAM_RETENTION`'s one
rule is `KEEP_FOREVER`.

---

## The subrequest arithmetic in `sweep()`'s comments — audited line by line

The brief asked me to verify it. **Three of the four claims are right; two
sentences compare against the wrong ceiling, and both err on the safe side.**

| claim, `sharding.ts:341-357` | verdict |
|---|---|
| "A Worker invocation may make 10,000 subrequests and 1,000 D1 queries" | **CORRECT.** Confirmed against the live limits page today: Workers Paid = 10,000/request; D1 = 1,000 queries per Worker invocation |
| "five rules switched on today" | **CORRECT.** `CORE_RETENTION` has 4 rules of which `account_activity` is `KEEP_FOREVER` → 3 active; `OPS_RETENTION` has 2, both with real windows (90 d, 400 d) → 2 active. 3 + 2 = 5 |
| "the loop adds at most 5 × (20 − 1) = 95 statements a night" | **CORRECT** arithmetically and structurally: `SWEEP_MAX_PASSES = 20`, one statement already existed per rule, so the *added* statements are 19 per rule |
| "That is under 1% of the subrequest ceiling" | **ARITHMETICALLY TRUE, CATEGORICALLY WRONG — and conservative.** 95/10,000 = 0.95%. But the core and ops sweeps run over the **native binding** (`native(env.DB)`, `native(opsDb)` at `:438-446`), and the live docs are explicit that bindings are not `fetch()` subrequests. Those 95 statements consume **zero** subrequests. The sentence over-states the cost |
| "about a tenth of the D1-query one" | **CORRECT, and it is the ceiling that actually binds.** 95 added + 5 base + 1 session delete = 101 native D1 queries against 1,000 per invocation ≈ 10% |
| "it moves the team ceiling by ~32 teams out of 3,333" | **CONSISTENT BUT MISATTRIBUTED — and conservative.** 95 ÷ 3 subrequests-per-team ≈ 31.7, so the number follows from the model. But the team walk is the only part that spends subrequests (`d1Query` over the REST door, `:454`), and `TEAM_SWEEP_MAX_PASSES = 1` means the loop adds none. The true cost to the team ceiling is **0 teams, not 32** |

**Net: the comment's conclusion is right and its two errors both make the change
look more expensive than it is.** That is the right direction for an error to
point, and I would still fix the wording, because a future reader budgeting the
same invocation will double-count. The one-line correction is to say that the
core and ops sweeps spend D1-binding queries (≈10% of 1,000) and no subrequests,
and that the team ceiling is untouched because `TEAM_SWEEP_MAX_PASSES` is 1.

---

## Findings

### A · BLOCKER — the operations database is still not sized by the size alarm, and six new writers were pointed at it this week

`workers/tenancy/src/lib/sharding.ts:56` · `:73` · `workers/tenancy/wrangler.jsonc:15,44`

```ts
const CORE_DB_NAMES = /-core(-staging)?$/
…
const watched = all.filter((db) => db.name.startsWith("team-") || CORE_DB_NAMES.test(db.name))
```

The operations database is named **`brimba-ops`** (staging: `brimba-ops-staging`).
It does not start with `team-` and it does not match `/-core(-staging)?$/`. It is
therefore **never sized and can never raise a `db_alerts` row**.

It holds `error_logs` and `agent_usage_log` — described in
`shared/workers/ops-db.ts:10-13` as "the two fastest-growing tables in the
system". This week alone it gained six writers: the gateway's central catch
(via auth's `/internal/log-error`), realtime's central catch, and the 5xx
`GuardError` branch in each of tenancy, content, data-ops and mcp. Plus the
retention shortfall row.

The compounding detail: the fallback in `opsDatabase` is `env.OPS ?? env.DB`. A
fork, a `wrangler dev`, or a deploy that missed the binding writes all of that
into the **core** database instead — which *is* watched, so the failure mode is
at least visible there. The configured, correct deployment is the blind one.

**Why it matters.** This is the same class of fault as blocker 2, one level up: a
guard that reports success while looking at the wrong subject. It was flagged in
round 2 as a component of criterion 4 and has now had a week of new load pointed
at it.

**Fix.** One character class: `const CORE_DB_NAMES = /-(core|ops)(-staging)?$/`,
plus a test that asserts the regex matches every `database_name` in every
`wrangler.jsonc` that is not a `team-` database. Derive the subject from the
configs on disk, or the next rename repeats this.

### B · MAJOR — one live re-pull door still reads the whole collection, and it is the one on the largest table

`workers/tenancy/src/routes/members.ts:10-17`

```ts
const members = await listMembers(env, cfg, guard)
const id = new URL(request.url).searchParams.get("id")
return json({ members: id ? members.filter((m) => m.userId === id) : members })
```

`oneMember` is **imported at the top of this very file** (`:6`) and used twice
below it (`:30`, `:45`). This is a one-line change that was made in four other
files and missed here.

It matters more than the four that were fixed. `team_members` is the table the
yardstick in `SCALING.md` sizes at **250,000 people per tenant**, and this door is
what `web/lib/store.ts:patchRow` calls on every `members` ping
(`web/lib/live-resources.ts:175`, `fetchOne: (id) => tenancy.member(id)`). So one
role change in a large team makes every connected session read the whole member
list — capped, but capped at `LIST_HARD_CAP`, not at one.

**Fix.** `const one = id ? await oneMember(env, cfg, guard, id) : null` and return
`{ members: one ? [one] : [] }` — the identical shape the other four now use.
Keep the empty array for "no longer belongs", which is what `patchRow`'s
null-drop path relies on.

### C · BLOCKER — one write still costs one read per connected session. CONFIRMED, unchanged, and the brief is right that it stands

`web/components/app-shell.tsx:118-152` · `web/lib/store.ts:233-261`

Verified line by line against the current tree, not against my own round-2 report:

```ts
const teamLink = useRealtime(teamId, (event) => {
  if (!teamId) return
  invalidate(`activity:team:${teamId}`)      // ← EVERY ping. Before any filtering.
  …
  void patchRow(r.key(teamId), r.idField, id, () => r.fetchOne(id))
  for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)
```

Three costs per ping, per session:

1. `invalidate('activity:team:<teamId>')` fires **unconditionally**, before the
   resource is even looked up. `invalidate` calls `notify(key)`, and
   `useCached`'s `sync` (`store.ts:345-355`) falls through to `void load()` on a
   cache miss. Any session with the team feed mounted refetches it.
2. `patchRow` issues one single-row read per session holding that collection.
3. `r.deps?.(teamId, id)` invalidates further keys — for help, two of them, one
   a `COUNT(*)`.

At the `SCALING.md` yardstick (25,000 concurrent sessions in one tenant) a single
edit is up to 25,000 reads. The in-flight de-duplication added this round
(`store.ts:82-102`) does **not** relieve this: it collapses callers asking the
same key in the same tick, and these are one caller per browser.

**The one thing that changed, and it is in the right direction.** `invalidate`
now also drops the in-flight entry (`store.ts:162`), so the refetch a ping causes
can no longer be overwritten by a response that predates it. That is a
correctness fix, not a volume one.

**Fix, in two in-rule parts.** (i) Move the activity invalidate inside the
resource branch and gate it on `event.resource` actually feeding the team feed —
today a `selectable` rename refreshes the whole team's activity. (ii) Coalesce:
a trailing 250 ms window per key in `patchRow`/`invalidate` collapses a burst of
pings from one bulk action into one read. Neither touches R1 (the publish still
happens) or R15 (the listener still exists).

### D · MAJOR — the retention shortfall alarm writes into the table whose overflow it is reporting

`workers/tenancy/src/lib/sharding.ts:481-486`

The design is right in every respect but one: the destination. A bound is hit
because a table in the operations database is growing faster than the sweep. The
two tables the sweep governs there are `error_logs` and `agent_usage_log`. If the
one that is overflowing is `error_logs`, the alarm's own `INSERT` is competing
with the condition it reports — and on a database at its 10 GB cap, that write
fails, and `logError`'s catch is empty (`shared/workers/error-log.ts`), so the
alarm is lost silently.

Not a blocker: it is one row per run, and the console line at `:483` survives
independently. But an alarm should not depend on the resource it is alarming
about.

**Fix.** Write the shortfall to `db_alerts` in the **core** database — the table
that already exists for exactly this ("this database needs attention"), is
already watched by the size alarm, and already has a resolve workflow
(`resolved_at`). Keep the `error_logs` row too if wanted; do not make it the only
copy.

### E · MINOR — the two workspaces resolve the same dependency to two different commits

`package-lock.json:3399` → `…swift-struck-ui.git#675aff8950664856b7975d772b389eeb070712d8`
`web/package-lock.json:2642` → `…swift-struck-ui.git#364eea796a3f19320850648dfb24a48e89b0cfa6`

Both `package.json` files pin `#v0.16.0`. The two lockfiles resolved that tag to
**different commits**, and the installed trees confirm it: the root has `0.4.0`,
`web/` has `0.16.0`. Not a scaling defect on its own, but it is why rounds 1 and 2
of this review reported a virtualisation gap that had been closed since 0.10.0 —
a reviewer reading the root tree measures a different application than the one
that ships. Reported here because the campaign asked what makes this codebase lie
to reviewers, and this is a new instance of that class.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **A.** Add `ops` to the size-alarm filter + derive the subject from the wrangler configs | `workers/tenancy/src/lib/sharding.ts` (1 line), `workers/tenancy/test/*` (a new test) | ADDS ~15 lines of test; REMOVES a blind spot over the fastest-growing database | **lean_mean** — a new test file is more code, and lean scores less code better. **spend_review** — the nightly `d1ListDatabases` walk already returns every database, so sizing one more costs zero extra calls. Otherwise none |
| **B.** Point the `members` `?id=` door at `oneMember` | `workers/tenancy/src/routes/members.ts` (2 lines) | REMOVES a full member-list read from every `members` live patch | **realtime_review** — this IS their re-pull path; the response shape must stay `{ members: [...] }` and must still return `[]` for a member who no longer belongs, or `patchRow`'s drop path breaks. **round_trip_review** — strictly helps (their finding G). **interfacelessness_review** — confirm no MCP tool reads `GET /api/tenancy/members?id=` expecting the whole list |
| **C.i** Gate the team-activity invalidate on the resource | `web/components/app-shell.tsx` (~4 lines) | REMOVES one refetch per session per ping for resources that do not feed the team feed | **realtime_review** — a resource wrongly excluded goes stale; the gate must be derived from the same registry that decides what writes activity, not a second hand-kept list. **activity_log_review** — if a module writes activity and is not in the gate, its rows stop appearing live |
| **C.ii** Coalesce pings with a trailing window in `patchRow` / `invalidate` | `web/lib/store.ts` (~20 lines) | ADDS a timer per key; REMOVES the read-per-ping amplification during bulk actions | **realtime_review** — adds up to 250 ms of latency to a live update, which is their whole subject; agree the window with them first. **speed_review** — helps under burst, adds a fixed delay otherwise. **lean_mean** — more machinery in the one file everything depends on |
| **D.** Send the retention shortfall to `db_alerts` in core | `workers/tenancy/src/lib/sharding.ts` (~8 lines) | ADDS one core write per shortfall run; REMOVES the alarm's dependence on the overflowing database | **error_log_review** — they credited the `error_logs` row as the fix for a silent cron; keep that row and *add* this one, or their criterion 6 falls. **activity_log_review** — `db_alerts` is operational, not a record, so no activity row is owed |
| **E.** Reconcile the two lockfiles | `package-lock.json`, `web/package-lock.json` | REMOVES a divergence between what a reviewer reads and what ships | **base_fork_review** and **mac_fell_in_the_ocean_review** — both score reproducibility; strictly helps. Requires `npm install`, which this campaign forbids — hand it to the serialized repair pass |
| **Wording fix** on `sweep()`'s subrequest comment | `workers/tenancy/src/lib/sharding.ts` (comment only) | ADDS nothing; REMOVES a double-count a future reader would inherit | none — a comment change, and it makes the stated cost *higher-fidelity*, not lower |

---

## CEILING

**Is 95 reachable by changing code in this repository? Yes — narrowly, and only
because of a change made this round that was not a commit in this repo.**

Rounds 1 and 2 said no, with a stated maximum of 93. **That verdict is
withdrawn.** It rested on capping client data volume at 75 because virtualisation
lived in `@swift-struck/ui` and `CLAUDE.md` forbids editing the library from
here. Virtualisation shipped in the library at 0.10.0 and this repo is now on
0.16.0. The cap was never real; I was reading a pinned old tree (finding E).

The revised best case:

```
partitioning 100×12 + queries 88×13 + contract 100×7  + headroom 100×8
+ clientvolume 90×9 + clientcache 100×9 + surge 100×6 + atomic 100×11
+ fanout 88×7      + lifecycle 100×5   + elastic 100×5 + storage 74×8
= 1200 + 1144 + 700 + 800 + 810 + 900 + 600 + 1100 + 616 + 500 + 500 + 592
= 9462 ÷ 100 = 94.62 → 95
```

**95 is met by rounding, not by margin.** Every in-repo criterion has to be
perfect for it. The three surviving caps, and what each is:

- **File & object storage, weight 8, capped at 74.** Presigned direct-to-storage
  needs the R2 API token the owner declined on 2026-08-12. An owner decision,
  reversible by them, not by a commit.
- **Query shape, weight 13, tops out at 88.** R16 requires an exact server
  `COUNT(*)` on every collection. The only fix that removes the O(n) cost is a
  maintained counter, which puts R16's exactness at risk. A Law, deliberately.
- **Write fan-out, weight 7, tops out at 88.** Coalescing a bulk door's per-row
  pings into one collection ping contradicts CACHING rule 3 and R1. The
  client-side half (finding C) is in-rule and recovers most of the loss.
- **Client data volume, weight 9, now capped at 90 rather than 75.** The residual
  is `activity-feed` and `ticket-thread`, which 0.16.0 does not virtualise. That
  is a library release, not a commit here — the same class of cap as before, just
  much smaller. Surfacing it to the library, per `CLAUDE.md`, is the in-rule move.

**Blockers A, B, C and D do not move the ceiling** — every one of them is fixable
by a commit in this repository, and together they are worth roughly 25 points of
the 32 currently missing.
