# Scaling review, round 4 — Brimba · 2026-08-25
SCORE: 66/100   (round 1: 54 · round 2: 57 · round 3: 63)

Mode: **ANALYSE only**. Nothing in this repository was changed except this file.

**Measured at `HEAD = d9741c6`.** The tree then moved to `520b0cb` (docs only) and
`fb61e02` (+27 product lines in `workers/data-ops/src/lib/tools.ts` and
`web/lib/agent-trace.ts`). Neither touches a file this review scores. Every number is the
commit's.

---

## DELTA

Round 1: **54** → Round 2: **57** → Round 3: **63** → Round 4: **66**

| # | Criterion | wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | Data partitioning & sharding | 12 | 64 | 64 | 64 | **64 =** | untouched |
| 2 | Query shape & indexing | 13 | 2 | 27 | 35 | **45 ▲** | **+10 — finding B CLOSED.** `members`, the fifth and worst of the five live re-pull doors, now reads ONE row. All five are done. No new index, so every round-1 index defect stands |
| 3 | Endpoint contract stability | 7 | 59 | 59 | 59 | **59 =** | untouched |
| 4 | Growth triggers & headroom | 8 | 68 | 68 | 68 | **78 ▲** | **+10 — finding A CLOSED, verified against the real database names.** Round 3's gain (the 80 % threshold) no longer has a loss cancelling it |
| 5 | Client data volume & lazy loading | 9 | 47 | 47 | 62 | **62 =** | untouched |
| 6 | Client cache freshness & bounds | 9 | 92 | 92 | 92 | **92 =** | untouched |
| 7 | Surge self-protection | 6 | 64 | 39 | 64 | **64 =** | untouched |
| 8 | Sequential, atomic & contended ops | 11 | 88 | 88 | 88 | **88 =** | untouched |
| 9 | Write fan-out & realtime | 7 | 30 | 30 | 30 | **42 ▲** | **+12 — blocker 3 is ONE-THIRD closed.** The most expensive of its three costs is bounded; the other two are byte-identical. And the mechanism is not what it says it is — **finding C** |
| 10 | Bulk paths, migrations & lifecycle | 5 | 6 | 6 | 34 | **34 =** | untouched |
| 11 | Elastic response time | 5 | 84 | 84 | 84 | **84 =** | untouched |
| 12 | File & object storage | 8 | 45 | 70 | 70 | **70 =** | untouched |

**No criterion went down, for the second round running.** No other agent's repair broke a
scaling criterion.

Arithmetic of the move:

```
(+10 × 13)  queries    130
(+10 ×  8)  headroom    80
(+12 ×  7)  fanout      84
                       ---
                       294 ÷ 100 = +2.94    62.78 → 65.72 → 66
```

---

## Arithmetic

| # | criterion | key | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | Data partitioning & sharding | `partitioning` | 64 | 12 | 768 |
| 2 | Query shape & indexing | `queries` | 45 | 13 | 585 |
| 3 | Endpoint contract stability | `contract` | 59 | 7 | 413 |
| 4 | Growth triggers & headroom | `headroom` | 78 | 8 | 624 |
| 5 | Client data volume & lazy loading | `clientvolume` | 62 | 9 | 558 |
| 6 | Client cache freshness & bounds | `clientcache` | 92 | 9 | 828 |
| 7 | Surge self-protection | `surge` | 64 | 6 | 384 |
| 8 | Sequential, atomic & contended ops | `atomic` | 88 | 11 | 968 |
| 9 | Write fan-out & realtime | `fanout` | 42 | 7 | 294 |
| 10 | Bulk paths, migrations & lifecycle | `lifecycle` | 34 | 5 | 170 |
| 11 | Elastic response time | `elastic` | 84 | 5 | 420 |
| 12 | File & object storage | `storage` | 70 | 8 | 560 |
| | **weights** | | | **100** | **6572** |

`768+585 = 1353; +413 = 1766; +624 = 2390; +558 = 2948; +828 = 3776; +384 = 4160;`
`+968 = 5128; +294 = 5422; +170 = 5592; +420 = 6012; +560 = 6572.`
**6572 / 100 = 65.72 → SCORE 66.**

---

## Criterion 4 · `headroom` 68 → 78 — finding A is closed, and I checked it against the names

`workers/tenancy/src/lib/sharding.ts:64`

```ts
const CORE_DB_NAMES = /-(core|ops)(-staging)?$/
```

Tested against every database name this project actually creates, rather than against the
intent:

| name | matches? | source |
|---|---|---|
| `brimba-ops` | **yes** (`-ops$`) | `workers/*/wrangler.jsonc`, six workers |
| `brimba-ops-staging` | **yes** (`-ops-staging$`) | same, `--env staging` |
| `brimba-core` | yes | `env.DB` |
| `brimba-core-staging` | yes | same |
| `team-<ulid>` | n/a — caught by the separate `startsWith("team-")` at `:81` | |
| `brimba-media` *(not a database)* | no — correctly excluded | |

**And it is fork-safe**, which matters because the whole point of this base is being
forked: the pattern is a *suffix*, not a project name, so `acrymold-ops` is watched the
day that fork is created. A literal `"brimba-ops"` would have been a silent regression for
every fork, and it was not written that way.

The alarm's message now derives its percentage from the same constant it fires on
(`:108`, `Math.round(ALERT_THRESHOLD_BYTES / (10 * 1024 ** 3) * 100)`), so the round-1
defect where the alarm fired at one number and quoted another cannot return.

**What still stands at 78 rather than higher:**
- **No growth *rate* is recorded.** `db_alerts` holds a point-in-time `size_bytes` with no
  history, so *"when will we hit this"* remains unanswerable. Round 1's M22, four rounds
  open. 2 GB of headroom is only a warning if you know how fast you are consuming it.
- **The retention shortfall alarm still writes into the table whose overflow it reports**
  (`sharding.ts`, round 3's finding D). Unchanged. On a database at its cap that write
  fails and `logError`'s catch is empty, so the alarm is lost silently. The fix — write it
  to `db_alerts` in the core database, which now exists for exactly this — is two lines.

---

## Criterion 2 · `queries` 35 → 45 — all five live re-pull doors are done

`workers/tenancy/src/routes/members.ts:9-24` was the last one, and it was the worst one to
have left: it is the live re-pull path, called **once per watching client per ping**,
against the largest table in the base.

```diff
-  const members = await listMembers(env, cfg, guard)
-  return json({ members: id ? members.filter((m) => m.userId === id) : members })
+  if (id) {
+    const one = await oneMember(env, cfg, guard, id)
+    return json({ members: one ? [one] : [] })
+  }
+  return json({ members: await listMembers(env, cfg, guard) })
```

`oneMember` applies the same active filter, so a no-longer-active member still yields
nothing and the client still drops the row — the behaviour the old comment was protecting
is preserved, and the commit says so.

**+10, not more, and here is what it does not buy.** No index was added this round. Every
index defect from round 1 stands: `help`'s `COALESCE(updated_at, created_at)` sort has no
expression index, `activity` has no `(created_at DESC, id DESC)` composite, and the thread
reads have no composites. Those are worth more than the door shapes were, and nobody has
touched them in four rounds.

---

## Finding C · Blocker 3 is **one-third closed**, and the mechanism is a debounce wearing a coalescer's name

`web/components/app-shell.tsx:40-51`, `:135-152`

### First, the part that is right

The activity-feed invalidation was the most expensive of the three costs round 3 named,
and it is now bounded. At round 3's own yardstick — 25,000 concurrent sessions in one
tenant, a 512-id bulk action:

```
BEFORE   512 pings × 25,000 sessions = 12,800,000 activity refreshes,
         each a keyset page PLUS an exact COUNT(*) over the fastest-growing table
AFTER            1     × 25,000 sessions =     25,000
                                         ------------
                                         a 512× reduction on that cost
```

**And the append-only reasoning is sound.** The team activity feed is insert-only, so
collapsing a burst loses no content — the single refresh at the end shows every row the
individual refreshes would have. Round 3's fix (ii) asked for exactly this and it was
built.

### Second, the two costs that did not move

Round 3 named **three** costs per ping per session. Only the first was addressed. I
verified the other two are byte-identical to `256d21b`:

| cost | status | what it still is |
|---|---|---|
| 1 · `invalidate("activity:team:…")` | **bounded** | now ≤ 1/second instead of 1/ping |
| 2 · `patchRow(r.key, r.idField, id, () => r.fetchOne(id))` | **unchanged** | one single-row read **per session** on every ping |
| 3 · `r.deps?.(teamId, id)` | **unchanged** | for `help`, **four** keys per ping — `activity:record:help:<id>`, `help-stakeholders:<id>`, `help-mine:<team>`, `help-thread:<id>` — one of them a team-wide collection with a total |

So one help-ticket edit still invalidates a team-wide key on every connected session, and
still issues a single-row read per session. **12.8 million reads become 12.8 million
reads plus 25,000, not 25,000.** The criterion moves +12 of the 70 it is missing, which is
roughly the share of the cost that was removed.

Round 3's fix (i) — *gate the activity invalidate on `event.resource` actually feeding the
team feed, so a `selectable` rename does not refresh the whole team's activity* — was not
built. A dropdown rename still queues a full activity refresh; it is merely coalesced now.

### Third — and this is the finding — it is a **debounce**, not a coalesce

```ts
let activityTimer: ReturnType<typeof setTimeout> | null = null
const ACTIVITY_COALESCE_MS = 1_000
function queueActivityRefresh(teamId: string): void {
  if (activityTimer) clearTimeout(activityTimer)          // ← resets the deadline
  activityTimer = setTimeout(() => {
    activityTimer = null
    invalidate(`activity:team:${teamId}`)
  }, ACTIVITY_COALESCE_MS)
}
```

`clearTimeout` on every call pushes the deadline forward by a full second **every time a
ping arrives**. That is a textbook trailing-edge debounce. A coalescer schedules once and
lets later calls fall into the pending window:

```ts
if (activityTimer) return                                  // ← the one-line difference
activityTimer = setTimeout(…, ACTIVITY_COALESCE_MS)
```

The distinction is not pedantic; it changes the staleness bound from **finite to
unbounded**:

| shape | refresh fires | worst-case staleness |
|---|---|---|
| coalesce (schedule-once) | 1 s after the **first** ping of a window | **1 second, always** |
| debounce (reset-on-each) — *what is built* | 1 s after the **last** ping | **unbounded** while pings keep arriving < 1 s apart |

**The comment directly above the call names the correct design and the code is the other
one:** *"Coalescing rather than debouncing: the feed is APPEND-ONLY, so collapsing a burst
loses nothing."* The append-only half is true. The timer half is not what is written.

**Why this is a scaling finding and not a nitpick.** Both this review and
`realtime_review` modelled a **burst** — finite, then quiet — and in a burst the two
shapes are indistinguishable. The regime this review exists to model is a **stream**: at
the `SCALING.md` yardstick of 250,000 people in one tenant, mutations arriving more often
than once per second is the *normal* condition, not the edge case. In that regime the
activity feed **never refreshes at all** until the tenant goes quiet — which is overnight.
The screen does not go wrong; it silently stops being live exactly when there is most to
see.

### Does it break the live coverage `realtime_review` warned about?

**Not in the way that review checked, and yes in the way it did not.** I read
`reviews/realtime-r3.md:483-500` rather than paraphrasing it. Its three verifications all
hold and I re-confirmed each:

- **Row-level patches untouched** — `patchRow`, `TEAM_RESOURCES`, the deps fan-out and
  `reconcile` are byte-identical. Its criteria 1, 2, 4, 5 and 6 really are unaffected. ✓
- **Criterion 3 (recover-what-you-missed) unaffected** — the reconnect handler at
  `app-shell.tsx:186-195` calls `invalidate(\`activity:team:${teamId}\`)` **directly**,
  bypassing the queue. Catch-up after a drop is still immediate. ✓ This is a genuinely
  well-made distinction and it was made deliberately.
- **No content is lost, only intermediate renders** — true, *whenever the timer fires*. ✓

What it did not check is **whether the timer fires**. Its report states *"a 1,000 ms
coalesce, not a debounce. The distinction matters and the claim holds"* — the distinction
does matter, and the claim was taken from the comment rather than from the four lines
above it. Under a sustained stream, `realtime_review`'s own criteria 1 and 2 (*does a
change that matters reach the screen showing it*) fail for the team activity feed, and its
criterion 8 (*the UI is honest about being connected*) fails too: the connection dot stays
green while the feed is arbitrarily old.

**This is the same class of error the campaign brief warns about, made by a reviewer
rather than by a probe: the code was read for its intent instead of its behaviour.** I am
recording it against my own round-3 fix recommendation as much as against that review —
fix (ii) said "coalesce" and the implementer wrote what the word usually gets implemented
as.

**The fix is one line**, and it is strictly better on every axis: `if (activityTimer)
return` instead of `clearTimeout(activityTimer)`. It bounds staleness at 1 second, it
allocates fewer timers, it preserves every property `realtime_review` verified, and it is
what both the comment and the constant name (`ACTIVITY_COALESCE_MS`) already claim.

Two smaller observations for whoever owns that file, neither scored:
- `activityTimer` is module-level and captures `teamId` in the pending closure. Switching
  teams inside the window cancels the *old* team's refresh, leaving `activity:team:<old>`
  stale in cache for the switch back. Harmless today because the cache entry is re-read on
  mount; worth a `clearTimeout` on `teamId` change.
- The timer is never cleared on unmount. `realtime_review` already noted this and
  correctly called it harmless — `invalidate` on an unsubscribed key is a no-op.

---

## Findings carried, unchanged

| id | finding | file | round opened |
|---|---|---|---|
| **INDEXES** | No expression index on `help`'s `COALESCE(updated_at, created_at)` sort; no `activity (created_at DESC, id DESC)` composite; no composites for the thread reads | `db/core/0015_scale_indexes.sql` and the team schema | 1 |
| **MOVER** | `moveModuleToOwnDatabase` relocates tables and **orphans the reads** — nothing routes queries to the new database afterwards | `sharding.ts` | 1 |
| **RATE** | No growth rate recorded; `db_alerts` is point-in-time | `sharding.ts` | 1 |
| **D** | The retention shortfall alarm writes into the table whose overflow it reports; `logError`'s catch is empty, so on a full database the alarm is lost silently | `sharding.ts` | 3 |
| **E** | The two workspaces resolve `#v0.16.0` to two different commits (`package-lock.json` → `675aff8…`, `web/package-lock.json` → `364eea7…`); the root tree holds `0.4.0` and `web/` holds `0.16.0` | both lockfiles | 3 |
| **LIFECYCLE** | `migrate-teams` walks every team database **serially** in one request; at 10,000 teams this exceeds any single Worker invocation | `workers/tenancy/src/routes/admin.ts` | 1 |

Finding **E** is the reason rounds 1 and 2 of this review reported a virtualisation gap
that had been closed since v0.10.0, and it is still open. **A reviewer reading the root
tree measures a different application than the one that ships.** It costs one command.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **C1** `if (activityTimer) return` instead of `clearTimeout` (finding C) | `web/components/app-shell.tsx` (1 line) | REMOVES unbounded staleness; **REMOVES** timer allocations | **none — it is a credit everywhere.** `realtime_review` gains a bounded liveness guarantee it currently believes it has. `speed_review`: unchanged (still ≤1 refresh/second). `spend_review`: strictly fewer refreshes than a debounce in the burst case and strictly more in the stream case — **and the stream case is where the feed is currently broken, so this is buying correctness with reads it should always have spent.** |
| **C2** Coalesce `patchRow` and the `deps` fan-out on a trailing 250 ms window per key (blocker 3, costs 2 and 3) | `web/lib/store.ts` (~15 lines) | REMOVES the remaining two-thirds of the per-session read amplification | **`realtime_review` — DIRECT AND REAL, unlike C1.** Row-level patching is its criteria 1/2/5, and a 250 ms window is the difference between "instant" and "a quarter second". It must sign this. **`speed_review`: +250 ms on every live row update.** My recommendation: window `deps` only, leave `patchRow` immediate — the deps fan-out is where the team-wide keys are and where the cost lives. |
| **C3** Gate the activity queue on `event.resource` feeding the team feed (round 3's fix (i), unbuilt) | `web/components/app-shell.tsx` (~3 lines) | REMOVES refreshes caused by resources the feed does not show | **`activity_log_review` — check the derivation.** If the gate is a hand-written list it will drift out of sync with what the feed shows. Derive it from `ACTIVITY_GATE_MAP`, which already exists for R18. |
| **A1** Write the retention shortfall to `db_alerts` in the core database (finding D) | `sharding.ts` (~4 lines) | REMOVES an alarm that dies with the condition it reports | **`error_log_review` — mild positive** (one fewer write into an overflowing `error_logs`). None else. |
| **A2** Record a nightly `db_sizes` row per database so a *rate* exists | new table + `sharding.ts` (~10 lines) | ADDS one row per database per night (≈ 4 + one per team) | **`spend_review` / `scaling_review` (self) — small and bounded:** at 10,000 teams that is 10,004 rows a night into the core database, ≈ 3.6 M a year. **Needs its own retention rule** — 90 days, matching `RETAIN_ERROR_LOGS_DAYS` — or it becomes the growth it exists to measure. |
| **I1** The three missing indexes | team schema + `db/core` migration | ADDS three indexes | **`spend_review` / `scaling_review` (self) — the classic trade.** Three indexes on the two fastest-growing tables cost write throughput and storage on **every** team database. The `activity` composite is the one worth paying for; the `help` expression index should be measured against real data first, and this base now has `scripts/timings.mjs` to do that with. |
| **E1** Delete `web/package-lock.json` (or the root's) and reinstall once | one lockfile | REMOVES a second resolution of the same tag | **`base_fork_review` / `mac_fell_in_the_ocean_review` — positive:** a fresh clone currently installs two different libraries. **`lean_mean_review` — positive** (one fewer tracked lockfile). Nothing is hurt. |

---

## CEILING

**Round 3 revised this review's ceiling to 95 when the virtualisation cap turned out never
to have been real. That revision was too generous, and I am correcting it: the true
maximum is 90.** The binding constraint was never virtualisation — that was a measurement
artefact. It is three things a commit cannot move.

| # | criterion | wt | cap | Why |
|---|---|---:|---:|---|
| 1 | `partitioning` | 12 | **85** | Per-team D1 is a strong story and it is LOCKED, correctly. But the **shared core database carries every tenant at once and nothing can move a module out of it** — `sharding.ts:52-55` says so in as many words. Two of the three relief valves (mover, split) do not apply to it. Its only valves are prune and partition, and partitioning identity is a redesign, not a fix. |
| 2 | `queries` | 13 | 95 | Reachable. Three indexes. |
| 3 | `contract` | 7 | 90 | Reachable. |
| 4 | `headroom` | 8 | 95 | Reachable — A2. |
| 5 | `clientvolume` | 9 | 95 | Reachable. Virtualisation is real and automatic since v0.10.0. |
| 6 | `clientcache` | 9 | 95 | Reachable. |
| 7 | `surge` | 6 | 90 | Reachable. |
| 8 | `atomic` | 11 | 95 | Reachable. The Durable-Object-as-lock model is available where it is needed. |
| 9 | **`fanout`** | 7 | **78** | **LOCKED.** `ARCHITECTURE.md` and `CACHING.md` fix that a ping carries `{resource, id, op}` and **never row data**, so a ping cannot leak a field the viewer may not see. That is the right decision — and it means every connected client MUST issue a read to learn what changed. One write therefore costs one read per interested session **by design**. C1+C2+C3 bound and batch those reads; they cannot remove them without either putting data in the ping (breaks the locked privacy property) or accepting stale screens (breaks R15). The send side is fine — channel sharding is real and wired (`db/core/0016_channel_shards.sql`, `realtime/src/index.ts:77-96`, `recomputeShardCounts` raising it nightly, monotonically). **The read side is the locked cost.** |
| 10 | **`lifecycle`** | 5 | **75** | **PLATFORM.** `migrate-teams` walks every team database serially inside one Worker invocation. At 10,000 teams this exceeds any wall-clock or subrequest budget Cloudflare offers, and the honest fix is a queue or a Workflow — a second service this base deliberately does not have. Bulk import and retention are fixable; the migration robot is not, inside the current shape. |
| 11 | **`elastic`** | 5 | **90** | **PLATFORM.** How fast Cloudflare adds capacity is not this codebase's variable. |
| 12 | `storage` | 8 | 90 | Reachable. R2 has no versioning, which is a platform fact, but the orphan sweep's seven-day grace bounds the exposure. |

**Computed maximum:**
```
85×12 = 1020 · 95×13 = 1235 · 90×7 =  630 · 95×8 =  760
95×9  =  855 · 95×9  =  855 · 90×6 =  540 · 95×11 = 1045
78×7  =  546 · 75×5  =  375 · 90×5 =  450 · 90×8  =  720

1020+1235 = 2255; +630 = 2885; +760 = 3645; +855 = 4500; +855 = 5355;
+540 = 5895; +1045 = 6940; +546 = 7486; +375 = 7861; +450 = 8311; +720 = 9031
9031 / 100 = 90.31 → 90
```

**95 is NOT reachable by changing code. The true maximum is 90**, and the three criteria
that cap it — `fanout` (a locked privacy decision), `lifecycle` (a platform wall-clock
limit) and `partitioning` (a shared core database with no mover) — cost **9.7 points**
between them, of which `fanout` alone is 1.5.

**The distance from 66 to 90 is 24 points and none of it is blocked.** The largest single
lever is `queries` at +50×0.13 = **+6.5**, and it is three indexes nobody has written in
four rounds. The second is `lifecycle` at +41×0.05 = **+2.1**. The one-line fix C1 is
worth about **+0.3** and is the highest ratio of correctness-to-effort anywhere in this
review.

**Verdict: the two blockers this round was asked about are one closed and one one-third
closed — and the third that was closed by hand was closed correctly, fork-safe, and
verified against the real database names. The thing worth carrying out of this round is
not a score: it is that a repair whose comment names the right design, reviewed by a
second agent who read the comment, shipped the wrong one — and it takes one line to fix.**

---

## POSTSCRIPT — re-checked at `45c350b`

The tree moved twice more while I wrote this up (`d9a9895`, `45c350b`). I re-checked every
line this review scores:

- **Finding C stands verbatim.** `web/components/app-shell.tsx:47` is still
  `if (activityTimer) clearTimeout(activityTimer)`. The one-line fix is unapplied.
- `45c350b` adds `dedupe()` to `web/lib/store.ts` (+14) — a `round_trip_review` fix for
  `useActiveTeam` mounting twice. It de-duplicates *cold-load* reads by callers outside
  the cache; it does **not** touch `patchRow` or the `deps` fan-out, so costs 2 and 3 of
  blocker 3 are unchanged and criterion 9 does not move.
- `SCALING.md`'s prose was corrected by `d9a9895` (`story_checks_out_review`'s finding);
  this review scores the code, so no criterion moves. **`SCALING.md:388` still reads
  "threshold 80% → 80%"** — cosmetic here, priced by `story_checks_out_review`.

**Score unchanged at 66. Ceiling unchanged at 90.**
