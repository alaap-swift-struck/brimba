# Spend review, round 5 — Brimba · 2026-08-26

SCORE: **83/100**   (round 1: 76 · round 2: 79 · round 3: 81)

Mode: **AUDIT only**. Nothing in this repository was changed except this file.
Measured at `review-round5` @ `f30f954`, which is HEAD. I wrote none of the
repairs this round scores.

**No live billing access.** Every figure is a **rate** applied to **units counted
from the source**, never a reading from an invoice. Volumes are the owner's
standing estimate of 24 Aug 2026 — 1,000+ signups, 500+ imports, 20,000+ agent
replies a month — labelled as an estimate everywhere they appear.

**Zero surfaces on the $1.00 placeholder.** I re-fetched every vendor page myself
today rather than carrying round 3's table forward, and one thing changed: nothing
did. The Sonnet 5 September increase is still cancelled, on the vendor's own page,
in the same words.

---

## Prices — read at run time, by me, on 2026-08-26

| Line | Included / free | Price after | Source, read |
|---|---|---|---|
| Claude Sonnet 5 · base input | — | **$2.00 / MTok** | platform.claude.com/docs/en/about-claude/pricing, 2026-08-26 |
| Claude Sonnet 5 · 5-minute cache write | — | **$2.50 / MTok** (1.25×) | same |
| Claude Sonnet 5 · cache hit / refresh | — | **$0.20 / MTok** (0.1×) | same |
| Claude Sonnet 5 · output | — | **$10.00 / MTok** | same |
| Sonnet 5 tool-use system prompt, `tool_choice: auto` | — | **354 tokens** | same, tool-use pricing table |
| Tokenizer (Claude 4.7+, incl. Sonnet 5) | — | **~30% more tokens** for the same text | same |
| Workers requests | 10,000,000 / mo | $0.30 / 1M | `cloudflare_usage/references/pricing.md`, 2026-07 |
| Workers CPU time | 30,000,000 CPU-ms | $0.02 / 1M CPU-ms | same |
| D1 rows written | 50,000,000 / mo | **$1.00 / 1M** | same |
| D1 rows read | 25,000,000,000 / mo | ~$0.001 / 1M | same |
| D1 storage | 5 GB | $0.75 / GB-mo | same |
| R2 storage | 10 GB | **$0.015 / GB-mo** | same |
| R2 Class A (incl. `list`, `put`, `delete`) | 1,000,000 / mo | **$4.50 / 1M** | same |
| R2 Class B (reads) | 10,000,000 / mo | $0.36 / 1M | same |
| R2 egress | unlimited | **$0.00** | same |
| Durable Object requests | 1,000,000 / mo | $0.15 / 1M | same |
| Durable Object duration | 400,000 GB-s | $12.50 / 1M GB-s | same |
| Workers Logs | 20,000,000 events / mo | **$0.60 / 1M** | developers.cloudflare.com/workers/observability/logs/workers-logs, 2026-08-26 |
| Resend | 3,000 / mo (100/day) | Pro **$20/mo → 50,000**; $35/mo → 100,000 | resend.com/pricing, 2026-08-26 |
| Cloudflare Workers Paid base | — | **$5.00 / mo** per account | `cloudflare_usage/references/pricing.md`, 2026-07 |

**The September rise is confirmed cancelled, on the page, verbatim:** the $2/$10
introductory pricing *"is now the standard price. The previously scheduled increase
to $3/$15 … on September 1, 2026 will not occur."* Nothing in this report moves
next week.

**Five of these lines bill and appear in no project document.** Workers CPU time,
D1 rows read, DO duration, R2 storage and Workers AI are all live billing surfaces
here; `COSTS.md §2` prices seven lines and none of those five. That is scored,
below, under criterion 3 and criterion 7 — not under criterion 9, which the rubric
scores per **vendor**, and all three billing vendors are priced and dated.

---

## Arithmetic

```
DEFECT    criterion = clamp(0,100, 100 − Σ penalties)
            critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its table
total     = round( Σ (criterion × weight) / Σ weights )
```

| # | criterion | key | method | score | wt | product |
|---|---|---|---|---:|---:|---:|
| 1 | Work is proportional to the trigger | `amplification` | defect · **GATE** | **76** | 15 | 1140 |
| 2 | Nothing bills in an uncapped loop | `uncapped` | defect | **87** | 14 | 1218 |
| 3 | Every paid call is inventoried | `inventory` | coverage | **92** | 13 | 1196 |
| 4 | Cost per user action is computed | `peraction` | coverage | **78** | 13 | 1014 |
| 5 | Something watches the meter | `meter` | coverage | **83** | 12 | 996 |
| 6 | Scheduled work is priced | `scheduled` | coverage | **88** | 9 | 792 |
| 7 | Storage and egress are priced | `storage` | coverage | **64** | 8 | 512 |
| 8 | Retries and failures are priced | `retries` | coverage | **84** | 6 | 504 |
| 9 | Each surface has a sourced price | `prices` | coverage | **100** | 6 | 600 |
| 10 | The numbers are written down and dated | `recorded` | coverage | **88** | 4 | 352 |
| | | | | **100** | **8324** |

```
1140+1218 = 2358; +1196 = 3554; +1014 = 4568; +996 = 5564; +792 = 6356;
+512 = 6868; +504 = 7372; +600 = 7972; +352 = 8324
8324 / 100 = 83.24  ->  SCORE 83
```

**Gate: criterion 1 = 76, well above 40 — no cap. Uncapped = capped = 83.**

---

## DELTA — 81 → 83, and the cause of each move

| # | criterion | wt | R3 | **R5** | Δ | cause |
|---|---|---:|---:|---:|---:|---|
| 1 | `amplification` | 15 | 80 | **76** | −4 | **both, in opposite directions.** The orphan sweep is now cursored, so its penalty drops MEDIUM → MINOR (code changed, +4). Against that, a HIGH nobody had looked for: the unmetered failure wrap-up is not a minor, it is a repeatable free-spend path that the account alarm cannot see (the last measurement was wrong, −12 net) |
| 2 | `uncapped` | 14 | 90 | **87** | −3 | **both.** R3's −7 for the unbounded per-team R2 loop is **closed** — `ORPHAN_TEAMS_PER_NIGHT = 200` is a number in the code. But the *other* O(tenants) walk in the same file did not get the cursor, and two smaller unbounded shapes were not looked for in round 3 |
| 3 | `inventory` | 13 | 86 | **92** | +6 | **the last measurement was wrong, then code changed.** R3 docked the vendor row for Workers Logs and R2 `ListObjects`; the rubric scores that row per **vendor**, and all four are listed. `COSTS.md` then added both lines with their allowances anyway |
| 4 | `peraction` | 13 | 92 | **78** | −14 | **the last measurement was wrong.** R3 scored 92 by checking that three actions were costed. It did not check the rubric's other two rows: whether each figure includes *every* vendor the action touches (it does not), and whether the named worst case is the *actual* worst case (it is not — the true worst is $0.256, not $0.152) |
| 5 | `meter` | 12 | 80 | **83** | +3 | **code changed.** `checkAccountAiSpend` is the first thing in this base that can see the whole account, and it rides the existing cron at zero cost to speed, round_trip and scaling — exactly as `ROUND5-RECONCILIATION.md §3` settled it |
| 6 | `scheduled` | 9 | 70 | **88** | +18 | **code changed.** `COSTS.md §6` is precisely the document R3 said did not exist, and it goes further than asked: it records that the cron is **declared twice**, so every ceiling in it is a per-environment ceiling |
| 7 | `storage` | 8 | 66 | **64** | −2 | **both.** The per-team storage meter is new and real (+), and the bucket listing has no cursor, so a team above 10,000 objects is never swept past its first page, on any night, ever (−) |
| 8 | `retries` | 6 | 75 | **84** | +9 | **code changed.** `COSTS.md §7` now counts the failure path — error rows per 5xx, and the 3× D1 multiplier under a storm compounding inside the nightly loop. That is 25 of the points R3 withheld, minus what it still misses |
| 9 | `prices` | 6 | 100 | **100** | 0 | flat, and re-earned by my own fetch today rather than inherited |
| 10 | `recorded` | 4 | 30 | **88** | +58 | **code changed.** `COSTS.md` exists at the repo root, dated, with an author, and with a "keep this honest" section. The 12 points withheld are one dangling cross-reference |

---

## What I was asked to verify

### 1 · `COSTS.md` exists and is good — VERIFIED, with one dangling pointer

Present at the repository root, 138 lines, read date **2026-08-25**, author named,
with eight sections: the standing volume, a sourced price table with read dates,
cost per user action, what prompt caching bought, the per-team entitlement, the
scheduled-work ceilings, the failure-shaped costs, and a rule for keeping itself
honest. It does the thing three rounds asked for and one thing nobody asked for:
`§6` states that the nightly cron is declared **twice**, so every ceiling in that
section is per-environment. I confirmed that independently —
`workers/tenancy/wrangler.jsonc:41` (production) and `:72` (staging) both carry
`"triggers": { "crons": ["10 3 * * *"] }`, and both deploy as separate workers
against separate databases and buckets.

**The one defect is a pointer that resolves to nothing.** `COSTS.md:39-41`:

> *"**A September cancellation applies to one line item** — it is recorded in
> `INVENTORY.md` beside the surface it belongs to, so that the inventory and this
> document do not drift apart with two copies of the same fact."*

`grep -i "september\|cancel" INVENTORY.md` returns **nothing**. The one vendor
price movement in the period this document covers is recorded in neither file. The
design instinct is right — one fact, one home — and the fact was never written in
the home it was sent to.

### 2 · The account-wide AI spend alarm rides the existing cron — VERIFIED

`workers/tenancy/src/lib/sharding.ts:204-240`, one aggregate, called from exactly
one place: the nightly `scheduled` handler at `workers/tenancy/src/index.ts:242`.

```ts
  const row = await env.DB.prepare("SELECT SUM(used) AS used FROM agent_usage WHERE period = ?")
```

Its own comment says why it is not on a request path: *"a per-request `SUM(used)`
over every team would put a growing aggregate in front of every agent turn, which
buys a number nobody reads at a cost everybody pays."* That is the collision
`ROUND5-RECONCILIATION.md §3` settled — *"Put it on the cron that already runs
nightly. Zero cost to all three"* — and it was built exactly that way. `speed`,
`round_trip` and `scaling` pay nothing.

`0019_nightly_state.sql` adds `idx_agent_usage_period` so the nightly `SUM` seeks
rather than scanning every team's every day, which is the detail that makes it
free rather than merely cheap.

**What it is, priced.** `ACCOUNT_AI_DAILY_ALARM = 5_000` units a day. At
`AGENT_FREE_DAILY = 50` that is a hundred teams on the free entitlement, and at
the entitlement's own cost of $15.89/team/month the line sits at roughly
**$1,589/month of already-committed spend**. Taking the marginal warm turn instead
($0.0047418) gives a floor of **$721/month**. Either way it is a smoke alarm, and
`sharding.ts:181` says so: *"a smoke alarm, not a cap — it stops nothing."*

Three properties worth recording because they bound what it buys:

- **It reports up to ~24 hours late.** It runs at 03:10 UTC on the period derived
  at run time, so a day that blows the budget at 03:11 is not reported until the
  following night.
- **It is deduped to one row per episode** (`sharding.ts:219-224`). A month over
  budget produces one alert. That is right for noise and wrong for escalation: a
  stale open row masks a *worse* subsequent overrun, and the only auto-resolve
  path (`sharding.ts:487-491`) is the size alarm's, keyed on a real database id.
- **It cannot see the spend described in §3 below**, because the refund subtracts
  from the very column it sums.

### 3 · The finding this review exists for — an unmetered, refunded, invisible model call

The probe reports zero amplifiers again. The rubric says a zero on a codebase with
scheduled work is not a pass, so I opened the nightly chain by hand
(`index.ts:210-274` → `ensureNightlyTables` → `checkDatabaseSizes` → `runRetention`
→ `recomputeShardCounts` → `sweepOrphanedUploads` → `checkAccountAiSpend` →
`buildErrorDigest` → `sendMail`) and found nothing new there. The amplifier is on
the request path.

**The mechanism, in three files.**

`workers/data-ops/src/lib/agent.ts:126` — the header comment states it outright:

```ts
/** One extra (UNMETERED — same user turn) model call after a failed step. …
```

`agent.ts:530-537`, on the first failed tool result:

```ts
    if (failed) {
      const note = await failureWrapUp(model, convo, tools)     // <- unmetered
      say(note)
      await appendMessage(...)
      await refundIfNothingDone()                               // <- gives the units back
```

`agent.ts:369-377`:

```ts
  const refundIfNothingDone = async () => {
    if (opts.tally.okWrites === 0 && opts.tally.credits > 0) {
      await refundAiUnits(env, guard.teamId, opts.tally.free, opts.tally.credit)
```

`credits.ts:111-116`:

```ts
      await env.DB.prepare(
        "UPDATE agent_usage SET used = MAX(0, used - ?), updated_at = ? WHERE team_id = ? AND period = ?"
      )
```

**Put together.** A turn whose actions are all refused makes its metered model
calls, then makes **one more, unmetered**, carrying the entire accumulated
conversation plus every tool result at `AGENT_MAX_TOKENS` output — the most
expensive call of the turn — and then hands every credit back. The team is charged
**zero**. And `agent_usage.used`, the single column `checkAccountAiSpend` sums, is
decremented by exactly the amount that was spent.

**Priced, at rates I read today.** A one-step refused turn:

```
step 1   cache write  6,209 x $2.50/1e6  = $0.0155225
         fresh          750 x $2.00/1e6  = $0.0015000
         output         200 x $10.00/1e6 = $0.0020000
wrap-up  cache read   6,209 x $0.20/1e6  = $0.0012418
         convo+results ~1,200 x $2.00/1e6 = $0.0024000
         output        ~300 x $10.00/1e6 = $0.0030000
                                           ----------
                                           $0.0256643 per refused turn
                                           0 credits charged
```

`/api/data-ops/agent` is in `HEAVY_PATHS` and `HEAVY_LIMITER` is
`{ limit: 60, period: 60 }` per caller (`workers/gateway/wrangler.jsonc:12`). So
one signed-in session, of any role:

```
60 turns/min x $0.0256643  =   $1.54 / minute
                           =  $92.39 / hour
                           = $2,217  / day
```

charged to no team, and **subtracted from the meter that would have noticed**.

**Neither half of this is a mistake on its own.** The wrap-up is a genuinely good
repair — `session-2026-07-02` built it because a Viewer's correctly-refused steps
used to show false green dots and a canned note that hid the model's explanation.
Not charging for it is defensible. The refund is also a good repair: a blocked
action should not cost a credit. **The hole is the intersection**, and it is the
kind that only appears when two correct changes meet — which is precisely what
`ROUND5-RECONCILIATION.md §4` set out to prevent between *reviews*, and did not
have a mechanism for between *repairs inside one review*.

**Scored HIGH (−15), not CRITICAL.** It does not reach for the whole dataset —
the work is bounded per turn — so it fails the rubric's `critical` test. But it is
the definition of work disproportionate to the trigger: one refused request buys
up to thirteen model calls and pays for none of them.

**The fix is small and there are three of them, in preference order:**
1. Meter the wrap-up like any other call, and let the refund cover it too — the
   turn then costs one credit rather than zero, which is honest and still cheap.
2. Or, keep it unmetered and **exclude the wrap-up's tokens from the refund** so
   the units it consumed stay in `agent_usage.used` and the account alarm sees
   them.
3. At minimum, record the wrap-up in `agent_usage_log` with zero credits, so the
   spend exists somewhere even if it is not charged.

### 4 · The nightly work is now cursored and priced — VERIFIED

`ORPHAN_TEAMS_PER_NIGHT = 200` (`housekeeping.ts:252`), with the cycle stated in
the code: *"≤200 teams — every team, every night · 3,333 teams — 17 nights ·
10,000 teams — 50 nights"*, and the safety argued adversarially (the reference set
is re-read immediately before that team's objects are listed, so a longer cycle
costs orphan *lifetime*, never a referenced file). The storage meter and its
90-day retention ship in the same change, exactly as the reconciliation required.
`migrate-teams` is keyset-resumable at 50 teams a call.

Priced per night, per environment, at today's rates:

| Job | Units | Cost |
|---|---|---|
| Core + ops retention, worst case | 5 rules × 20 passes × 5,000 = **500,000** row deletes | $0.50/night → **$15.20/mo** |
| …realistic (tables hold 1–2 days of codes) | short batch on pass 1 | ~$0.00 |
| Orphan scan | 200 teams × ≤10 R2 `list` ops = **≤2,000** Class A | $0.009/night → $0.27/mo |
| `db_sizes` meter + prune | 200 inserts + 1 delete | $0.0002/night |
| Size check | 1 REST `list` per 100 databases | rounding error |
| Account spend alarm | 1 aggregate read | rounding error |
| Digest | ≤1 Resend message | free tier |

**Doubled across environments**, so the retention ceiling is **$30.40/month** and
everything else rounds to zero. Every one of those is inside a free allowance
today. The retention ceiling is a ceiling and not a cost — a clean table costs one
query and exits — and a bound that is *hit* writes a real `error_logs` row rather
than passing silently, which is the difference between a limit and a leak.

---

## The criteria, in full

### Criterion 1 — proportionality (76) · `100 − (15 + 3 + 3 + 3)`

| hit | R3 | R5 | why |
|---|---|---|---|
| **`failureWrapUp` unmetered, refunded, invisible to the account alarm** (`agent.ts:126,533,659`) | MINOR −3 | **HIGH −15** | §3 above. R3 saw the unmetered call and not the refund beside it |
| `sweepOrphanedUploads` lists a visited team's whole prefix regardless of change (`housekeeping.ts:355`) | MEDIUM −7 | **MINOR −3** | now cursored to 200 teams a night with the cycle stated, the grace argued and the platform reason written down. That is the rubric's `minor` verbatim: *"full reprocessing that is deliberate, documented and cheap"* — R2 has no change feed |
| `notifyReplyAndMentions` (`notify.ts:106`) | MINOR −3 | **MINOR −3** | unchanged. ≤51 emails, and the work scales with the list the author typed |
| per-row publish on the bulk id door (`help.ts:186`) | MEDIUM −7 | **MINOR −3** | **I disagree with R3's severity.** 512 ids in produces 512 pings out — that is *proportional to the trigger*, which is the whole question this criterion asks. It is also required by Laws R1 + R23, and `ROUND5-RECONCILIATION.md §3` refused splitting the bulk *activity* row in the other direction for the same reason. The filter-based sibling already emits **one** coarse ping (`help.ts:167`) |

### Criterion 2 — uncapped billed loops (87) · `100 − (7 + 3 + 3)`

Billed loops with a **number in the code**: caps re-verified at HEAD — mentions
**50**, bulk ids **512** (derived from `AGENT_MAX_TOKENS`, not hand-picked), agent
steps **12**, replayed history **24**, tool results **2,000 chars**, files per
import batch **8**, rows per import file **1,000**, retention **5,000 × 20
passes**, team retention **1 pass**, orphan teams **200/night**, orphan scan
**10,000**, uploads **25 MB / 2.5 MB**, digest **20 signatures**.

**R3's one open item is closed**: the per-team R2 walk has a cursor.

Three remain:

- **MEDIUM −7 · the *other* O(tenants) walk did not get the cursor.**
  `runRetention` (`housekeeping.ts:169-186`) still does `d1ListDatabases(cfg)` and
  loops every `team-*` database with no cursor and no limit. It is behind
  `if (TEAM_RETENTION.some(days > 0))`, and `TEAM_RETENTION`'s only rule is
  `KEEP_FOREVER`, so it does not run today — but that is one environment variable,
  not a deploy, which is exactly the reasoning R3 used to keep this penalty on the
  R2 loop before that one was fixed. At 10,000 teams it is 100 REST calls to list
  plus one sweep per team database, inside an invocation whose budget is 1,000 D1
  queries.
- **MINOR −3 · `notify.ts:106` has no bound of its own.** The 51-email ceiling
  lives entirely in its single caller (`help.ts:212`). The `Promise.all` iterates
  whatever `recipients` it was handed. One caller today; any second caller
  inherits an unbounded fan-out over a metered vendor.
- **MINOR −3 · the client reconnect has no attempt ceiling.**
  `web/lib/realtime.ts:79-82` backs off 1s→2s→4s capped at 15s *"until we
  reconnect"*. Bounded in rate, unbounded in total: an abandoned tab against a
  down realtime worker bills ~5,760 Worker requests plus DO requests a day, for
  ever. At $0.30/1M + $0.15/1M that is $0.0026/tab/day — trivial per tab, and it
  is a cost with no natural end.

### Criterion 3 — inventory (92) · `35 + 25 + 20 + 12`

- **35 · every vendor that can bill is listed somewhere findable.** Four in
  `INVENTORY.md` (Cloudflare, Anthropic, Resend, GitHub); `COSTS.md §2` prices
  the three that bill. Full marks — the rubric scores this row per **vendor**,
  which is what `billed.vendors` reports, and R3 docked it for missing *line
  items*. Those are scored below and in criteria 6 and 7 instead.
- **25 · each tied to the feature that uses it.** `INVENTORY.md`'s "What it does"
  and "Without it" columns do exactly this; `COSTS.md §6` ties every cron line to
  its job.
- **20 · model choice deliberate.** `selectModel` (`model.ts:496-500`) picks
  Sonnet 5 at `AGENT_EFFORT: low`; `supportsEffort` (`:85-87`) gates effort to the
  models that have it, so no token is spent asking a model for something it cannot
  do; the keyless fallback is a cheap Workers AI model; and the import planner
  falls back to a **deterministic** planner on any model or parse failure
  (`import-agent.ts:156-159`), which costs zero. That last one is the strongest
  cost decision in the codebase and nothing in the docs claims credit for it.
- **12 of 20 · nothing bills from a path nobody knew about.** Two found, neither
  billing today:
  - `cheapText` (`model.ts:504-512`) is a Workers AI door with **zero call sites**
    repo-wide. It bypasses `consumeAiUnit` entirely — so it is not merely dead, it
    is dead *and* unmetered, and the first caller to wire it up spends outside
    every quota in the base.
  - `HELP_MEDIA` (`workers/content/src/env.ts:18`) is a bound R2 bucket with no
    `put`, `get`, `list` or `delete` anywhere. `INVENTORY.md:43-44` tells a
    rebuilder to create it in both environments and warns *"miss the last one and
    Help attachments have nowhere to land."* There are no Help attachments.

### Criterion 4 — cost per user action (78) · `40 + 18 + 12 + 8`

- **40 · three headline actions costed with the arithmetic shown.** `COSTS.md §3`
  has four rows, `§4` shows the caching derivation, `§5` shows the entitlement
  derivation. Full marks.
- **18 of 25 · includes every vendor the action touches.** "One signup" names
  Resend + D1 rows + Workers requests — complete. "One import" names Claude + D1
  rows and **not** the ~1,000 `forwardToDoor` service calls, the DO request per
  publish, or the Workers CPU. "One agent reply" names Anthropic only, and not the
  up-to-3 `resolveNames` service calls per step, the `agent_usage_log` row per
  turn, or the DO request per publish. **In money the omissions are rounding
  errors** — I priced them: about $0.0006 on a 1,000-row import and under $0.00001
  on a reply. What is docked is the *method*, because a method that omits three
  vendors on two of three actions will omit a material one eventually.
- **12 of 20 · a per-tenant monthly estimate for a typical customer.** `§5` gives
  **$15.89/team/month** with a $7.21–$28.91 bracket, which I re-derived
  independently below and matched to the cent. It is the **AI line only** — no D1
  storage, no R2 storage, no Workers requests per tenant. And it still comes from
  the standing estimate rather than from `agent_usage_log`, which remains
  **UNMEASURED**.
- **8 of 15 · the worst-case action is identified and priced.** `§3` names the
  12-step reply at $0.152. **The true worst case is 13 model calls, not 12** —
  `model.ts:236`'s own comment says *"up to 13 model calls per reply"* — because
  `failureWrapUp` adds one more carrying the whole conversation:

```
12 metered steps                                       $0.152183   (as documented)
+ the 13th, unmetered:
    cache read   6,209 x $0.20/1e6      = $0.0012418
    convo+results ~49,500 x $2.00/1e6   = $0.0990000
    output         ~400 x $10.00/1e6    = $0.0040000
                                          ----------
                                          $0.1042418
                                                       ----------
TRUE WORST CASE PER USER TURN                          $0.256425
of which charged to the team, if the run failed:       $0.000000
```

  The project's own cost document understates its worst case by **68%**, and the
  overrun is the half that nobody is billed for.

**The three headline actions, re-derived from the prices I read today:**

| action | arithmetic | price |
|---|---|---|
| **one signup** | 1 Resend message ($20 / 50,000 = $0.0004) + ~6 D1 rows ($1.00/1M) + ~15 Workers requests ($0.30/1M) | **$0.000410** |
| **one import** (1,000 rows) | model plan (~2,600 in × $2/1e6 + ~500 out × $10/1e6 = $0.0102) + ~2,000 D1 rows ($0.0020) + 1,000 Workers requests ($0.0003) + 1,000 DO requests ($0.00015) + ~5,000 CPU-ms ($0.0001) | **$0.013800** |
| **one agent reply** (mean 2.5 turns, cached) | write $0.0155225 + read $0.0018627 + fresh $0.0032600 + output $0.0050000 | **$0.025645** |
| **worst case: a failed 12-step reply** | $0.152183 metered + $0.104242 unmetered | **$0.256425**, charged $0.00 |

### Criterion 5 — something watches the meter (83) · `35 + 15 + 20 + 13`

- **35 · usage checked against a limit BEFORE expensive work starts.**
  `consumeAiUnit` (`credits.ts:61-90`) is a single atomic statement — the cap
  rides the `ON CONFLICT … WHERE agent_usage.used < ?`, so there is no
  read-then-write window — and it runs before the model call on all four metered
  paths (`agent.ts:381`, `agent.ts:579`, `agent.ts:240`, `routes/import.ts:175`).
  Full marks.
- **15 of 25 · an alert fires before the limit rather than at it.** The 80%
  database-size alarm fires before a *storage* limit ✓. The new account-wide alarm
  fires at a line the owner set — but there is no account limit behind it, so it is
  an alert without a limit, it reports up to ~24 h late, it deduplicates to one row
  per episode, and it caps nothing. It is a large improvement on nothing, and it is
  not the 25.
- **20 · a per-tenant cap exists.** `AGENT_FREE_DAILY` then paid credits, atomic,
  so one customer cannot spend the whole account on inference. Full marks.
- **13 of 20 · someone can see current spend without the vendor dashboard.**
  `agent-usage-dialog` shows **credits, not currency**; `readUsageLog` is per team;
  `db_alerts` now carries the account spend row and the admin list renders it
  (`routes/admin.ts:105`); `logCacheUsage` (`model.ts:164-174`) surfaces the single
  largest price lever as a greppable event — the best cost instrument in the base,
  and it is **Claude-only** (`model.ts:427-428`: Workers AI reports no counters at
  all) and nothing thresholds it. No screen anywhere shows an account-wide number
  in money.

### Criterion 6 — scheduled work is priced (88) · `32 + 30 + 26`

- **32 of 40 · every scheduled job's per-run cost is known.** `COSTS.md §6` tables
  all four jobs with per-run ceilings and — better than asked — records the
  double declaration, so every ceiling is correctly per-environment. Missing: the
  digest's Resend line (both environments mail the **same** mailbox,
  `wrangler.jsonc:37` and `:70`, so digest volume doubles against a 3,000/mo free
  tier) and `checkAccountAiSpend`'s aggregate.
- **30 · frequency justified.** Nightly, with the cursor's cycle reasoned against
  the grace period rather than asserted (`housekeeping.ts:236-251`) — including
  the argument for why a longer cycle does *not* need a longer grace, which is the
  kind of reasoning that stops a future change getting it wrong.
- **26 of 30 · a job that finds nothing to do exits cheaply.** Retention breaks on
  a short batch ✓; the team-database listing is skipped entirely when no team rule
  is on ✓; `recomputeShardCounts` has a `HAVING` clause so a quiet night moves zero
  rows and writes nothing ✓; the digest returns `null` on a clean night and sends
  nothing ✓; `checkAccountAiSpend` returns before any write when under cap ✓. The
  exception: `sweepOrphanedUploads` writes a `db_sizes` row per visited team **every
  night whether or not anything changed**, and runs its `DELETE FROM db_sizes` even
  when the page was empty.

### Criterion 7 — storage and egress (64) · `12 + 20 + 12 + 20`

- **12 of 35 · object storage growth per tenant per month estimated.** Still
  estimated nowhere. `COSTS.md` has **no R2 storage row at all** — not the
  $0.015/GB-mo rate, not the 10 GB allowance, not a per-tenant figure. The
  instrument now exists (`db_sizes` takes `r2:learning-media/<team>` bytes nightly)
  and **nothing reads it**: its only non-test references repo-wide are the writer,
  the pruner, the schema and the migration. Points for building the meter; none for
  the estimate it was built to produce.
- **20 of 25 · egress understood.** R2 egress is $0.00 and `/media/*` is served
  `public, max-age=31536000, immutable` with `Accept-Ranges`, which is the right
  answer. It is written in the vendor reference, not in the project — `COSTS.md`
  has no egress line.
- **12 of 20 · orphaned files cleaned up, or the fact that they are not is known.**
  The sweep exists, is cursored, is grace-guarded at 7 days and is fail-closed on
  an incomplete reference set — genuinely well built. But
  `env.LEARNING_MEDIA.list({ prefix, limit: ORPHAN_SCAN_CAP })`
  (`housekeeping.ts:355`) passes **no cursor**, and R2 returns keys in
  lexicographic order, so a team above 10,000 objects gets the *same first 10,000*
  every night for ever. The overflow is announced by a `console.warn` saying *"the
  rest wait for tomorrow"* — and tomorrow lists the same page. At 2.5 MB an object
  that is uncollectable storage above roughly 25 GB per large tenant, at
  $0.015/GB-mo, growing without bound.
- **20 · retention exists on anything that grows forever.** `db_sizes` 90d,
  `error_logs` 90d, `agent_usage_log` 400d, `login_codes`/`email_change_codes` 1d,
  `idempotency_keys` 2d, expired sessions immediately — all through one bounded,
  multi-pass, shortfall-reporting seam. `activity` and `account_activity` are
  `KEEP_FOREVER` by an owner decision, with the arithmetic **and the trigger to
  watch** written down (`SCALING.md §4`: *"imported rows per month, not
  headcount"* — 18 months rather than 35 years). Full marks.

### Criterion 8 — retries and failures (84) · `34 + 30 + 20`

- **34 of 40 · retries bounded by a number in the code.** `RETRIES = 2`
  (`d1-rest.ts:116`), and the backoff **gained jitter** this round:

```ts
if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt * (0.5 + Math.random())))
```

  with a 15-second `AbortSignal.timeout` per attempt. Retries on 5xx and network
  failure only; 4xx records and throws. The 6 withheld are the client reconnect's
  missing attempt ceiling.
- **30 · a failing call cannot retry a billed operation indefinitely.** The model
  call is **never** retried — `agent.ts:414-424` catches and answers — and
  `analyzeBatch` catches and falls through to the deterministic planner. Nothing
  in this system can retry the most expensive call it makes. Full marks, and it is
  a deliberate property rather than an accident.
- **20 of 30 · the cost of the failure path is counted.** `COSTS.md §7` is new and
  is exactly the right idea: it separates costs that scale with *how badly it is
  going* from costs that scale with use, and names both — one error row per 5xx,
  and the 3× D1 multiplier a sustained storm creates, *"inside the nightly
  per-team loop, which is the one place the multiplier compounds."* That is a real
  piece of thinking. What it does not count is the largest failure-path cost in
  the product: the unmetered, refunded wrap-up in §3.

### Criterion 9 — sourced prices (100) · `50 + 30 + 20`

Three billing vendors — Cloudflare, Anthropic, Resend. All three priced, all
three dated, all three with the free-tier boundary stated so the first paid unit
is identifiable. **Zero placeholders.** I fetched Anthropic, Resend and Workers
Logs myself at run time today rather than carrying round 3's table forward, and
the Cloudflare rates come from the skill's own dated reference.

The five unpriced Cloudflare *line items* are scored under criteria 3, 6 and 7,
not here — this criterion is per vendor, and double-charging one fact across two
criteria is how a score stops being comparable between rounds.

### Criterion 10 — written down and dated (88) · `50 + 30 + 8`

- **50 · the per-action costs live in a file, not only in a chat.** `COSTS.md` at
  the repository root, listed in the README doc map. This is the criterion that
  has been filed three times and it is now closed.
- **30 · dated and names who produced it.** *"Read date: 2026-08-25 … Author: the
  base team."* Every price row carries its own read date, so a stale row is
  visible without re-auditing the file.
- **8 of 20 · updated since the last vendor price change.** The one vendor price
  movement in the period — the Sonnet 5 September cancellation — is the one thing
  the document does **not** contain, because it delegated it to `INVENTORY.md`,
  which does not contain it either. The pointer at `COSTS.md:39-41` resolves to
  nothing. Ironic and cheap: it is one line, in either file.

---

## Ranked priority list

| # | change | crit | pts | effort | tier |
|---|---|---|---:|---|---|
| 1 | **Close the wrap-up hole.** Either meter `failureWrapUp` like any other call, or exclude its units from `refundIfNothingDone`, so the spend stays in the column `checkAccountAiSpend` sums. Three lines either way | 1 | **+2.70** | ~3 lines | 2 |
| 2 | **Record the September cancellation** in `INVENTORY.md` beside the Anthropic row, where `COSTS.md:39` already says it is | 10 | **+0.48** | 1 line | 1 |
| 3 | **Add the five missing price rows** to `COSTS.md §2`: Workers CPU time, D1 rows read, DO duration, R2 storage, Workers AI. All five bill; all five have published rates and allowances | 3, 7 | **+0.68** | 5 rows | 1 |
| 4 | **Give the object listing a cursor** so a team above 10,000 objects becomes a rota instead of a permanent uncollectable bill | 7 | **+0.64** | ~10 lines | 1 |
| 5 | **Price the true worst case** in `COSTS.md §3` — 13 model calls at $0.256, and the fact that a *failed* one is charged $0.00 | 4 | **+0.91** | 2 rows | 1 |
| 6 | **Read the meter.** One query over `db_sizes` grouped by `name`, and a per-tenant R2 growth row in `COSTS.md §7`. The data starts accruing tonight; the estimate is a month away | 7 | **+1.84** | ~10 lines + 30 days | 1 |
| 7 | **Delete `cheapText`**, or meter it. A Workers AI door with no callers and no quota check is one import statement away from being a hole | 3 | **+0.52** | −9 lines | 1 |
| 8 | **Cursor `runRetention`'s team walk** the way the orphan sweep's is. `cron_runs` already has the column | 2 | **+0.98** | ~10 lines | 1 |
| 9 | **Fix the `AGENT_FREE_DAILY` doc drift.** `OPERATIONS.md:60` says production runs 25; production runs 50, and `COSTS.md` prices 50. Two project documents disagree about the largest per-tenant cost | 10 | **+0.00** | 1 line | 1 |
| 10 | **Query `agent_usage_log`** for the real step-count distribution, then decide the second cache breakpoint. R3 priced it at ~$39/month on a plausible mix and **negative** on a two-turn-dominated one — it must not ship before the distribution is known | 4 | **+1.56** | 1 read-only query | 2 |
| 11 | **Bound the client reconnect** with an attempt ceiling and a visible retry | 2 | **+0.42** | ~5 lines | 2 |
| 12 | **Give `notify.ts` its own internal bound** rather than relying on its single caller's | 2 | **+0.42** | 2 lines | 2 |
| 13 | **Make the account alarm escalate.** Today a stale open row masks a worse overrun; a second alarm at 2× the line, or auto-resolving the synthetic row nightly, fixes it | 5 | **+1.20** | ~10 lines | 2 |
| 14 | **Turn the alarm into a cap** — refuse a turn when the account is past the line — or write down that it deliberately is not | 5 | **+0.84** | decision | 3 |

Items 2–9 and 5 are **+5.05 points for about forty lines and six document rows**,
and none of them changes what the product does.

---

## FIX IMPACT MAP

| Fix | Files | Adds / removes | Which other review could this damage |
|---|---|---|---|
| **1** close the wrap-up hole | `agent.ts` (or `credits.ts`) | +1 metered unit on a failed turn, or −1 refunded unit | **`first_run_review` / `dead_end_review` — REAL AND THE POINT OF THE TRADE.** `session-2026-07-02` built the refund because *"a blocked action should not cost a credit"*, and metering the wrap-up partly undoes that. **Prefer the second form** — keep the refund for the metered steps, exclude only the wrap-up's own units — so a refused action still costs the user nothing while the account can still see the spend. **`activity_log_review`:** if the wrap-up starts writing to `agent_usage_log`, the row must show 0 credits and a distinct kind, or the usage screen starts lying in the other direction |
| **2** the September row | `INVENTORY.md` | 1 line | **`story_checks_out_review` — POSITIVE:** it closes a dangling cross-reference between two documents, which is one of their scored criteria |
| **3** five price rows | `COSTS.md` | 5 rows | **`story_checks_out_review` — mild:** five more dated facts that can go stale. Each carries its own read date, which is the mitigation the file already uses. **`lean_mean_review`:** neutral, prose |
| **4** cursor the object listing | `housekeeping.ts` | more R2 `list` calls, only for teams that need them | **`scaling_review` — same item, same direction** (their finding 9). A team with 40,000 objects goes from 1 `list` per visit to 4, at $4.50/1M Class A, bounded by the same 200-team rota — so the account-wide rate is unchanged for every team under 10,000 |
| **5** price the true worst case | `COSTS.md` | 2 rows | **none.** It corrects a number downward in the owner's favour and upward in the accountant's |
| **6** read the meter | a query + `COSTS.md` | +1 read path | **`scaling_review` — POSITIVE:** it is the same table their finding 4 wants a D1 slope written into, and a reader is what makes both worth having. **`security_sentry_review`:** a per-tenant storage figure is a cross-tenant fact — it belongs on an owner endpoint, never a team one |
| **7** delete `cheapText` | `model.ts` | −9 lines | **`lean_mean_review` — POSITIVE.** **`story_checks_out_review` — check first:** `OPERATIONS.md:60-61` and `AGENT-MODULES-PLAN.md:86,120` both reference it, so the prose moves in the same commit or it becomes their finding |
| **8** cursor the retention walk | `housekeeping.ts` | +1 cursor use in `cron_runs` | **`scaling_review` — POSITIVE**, same item. **`error_log_review` — POSITIVE:** the shortfall signal can finally keep up with what it reports on |
| **9** the `AGENT_FREE_DAILY` line | `OPERATIONS.md` | 1 line | **none.** Two documents currently disagree; one of them is wrong |
| **10** measure the distribution | none — a read-only query | +0 | **none.** It is a query, not a change, and it must precede any second cache breakpoint. **If the second breakpoint then ships:** `story_checks_out_review` — the 30-line comment at `model.ts:214-241` explains the single-marker design and would contradict itself unless rewritten in the same commit |
| **11** bound the reconnect | `web/lib/realtime.ts` | +1 UI state | **`realtime_review` — DIRECT.** Its criterion 8 is *"the UI is honest about being connected."* A bounded reconnect **must** show a manual retry, or a transient outage becomes a permanent silent disconnection — worse than an infinite loop |
| **12** bound `notify.ts` internally | `notify.ts` | 2 lines | **none.** It duplicates a cap that already holds, which is the point: a second caller inherits it |
| **13** alarm escalation | `sharding.ts` | +1 threshold or a nightly resolve | **`error_log_review` — mild:** more `error_logs` rows during a sustained overrun. Cap it the way the size alarm is capped — one row per transition, not one per night |
| **14** alarm → cap | `credits.ts` | +1 account-wide read on the request path | **`speed_review`, `round_trip_review`, `scaling_review` — ALL THREE, and this is the trade the reconciliation already refused once.** A per-request `SUM(used)` puts a growing aggregate in front of every agent turn. If it ships at all, it must read a value the **cron** wrote, never compute one — a `cron_runs`-style cached figure, refreshed nightly, costing one indexed lookup |

---

## The ceiling — 95 is reachable, but only through item 1

| # | criterion | wt | cap | why |
|---|---|---:|---:|---|
| 1 | `amplification` | 15 | **94** | Two of four penalties are structural: R2 has no change feed, so the orphan sweep must list rather than diff; and the per-row publish is required by Laws R1 + R23. −6 floor |
| 2 | `uncapped` | 14 | 97 | reachable |
| 3 | `inventory` | 13 | 100 | reachable — five rows and one deletion |
| 4 | `peraction` | 13 | **92** | the 20-point per-tenant row needs the real distribution in `agent_usage_log` and a month of `db_sizes` rows. A **measurement**, not a change: a commit can write the query, only running it earns the points |
| 5 | `meter` | 12 | **90** | the 25-point "an alert fires before the limit" row cannot be fully earned while there is no account-wide *limit* to fire before. Item 14 would earn it and three other reviews would charge for it |
| 6 | `scheduled` | 9 | 95 | reachable |
| 7 | `storage` | 8 | **92** | per-tenant object growth depends on what customers upload. The meter makes it measurable rather than unknowable — so this is a 30-day cap, not a permanent one |
| 8 | `retries` | 6 | 95 | reachable |
| 9 | `prices` | 6 | 100 | held |
| 10 | `recorded` | 4 | 100 | reachable — one line |

```
94×15 = 1410 · 97×14 = 1358 · 100×13 = 1300 · 92×13 = 1196 · 90×12 = 1080
95×9  =  855 · 92×8  =  736 ·  95×6  =  570 · 100×6 =  600 · 100×4 =  400

1410+1358 = 2768; +1300 = 4068; +1196 = 5264; +1080 = 6344; +855 = 7199;
+736 = 7935; +570 = 8505; +600 = 9105; +400 = 9505
9505 / 100 = 95.05  ->  95
```

**95 is reachable, and it runs through criterion 1.** Leave the wrap-up hole open
and criterion 1 stays at 76, which costs `(94 − 76) × 15 ÷ 100 = 2.70` and puts
the maximum at **92**:

```
9505 − 270 = 9235  ->  92
```

So: **92 by writing five price rows, one cross-reference, a cursor and a
correction. 95 only by closing the free-spend path — which is three lines and a
decision about whether a refused action should still cost the account something.**

---

## Things no rubric asked about

1. **The refund erases the spend from the alarm's own column.** Fully priced in §3.
   Two correct repairs, landed in the same round, combining into a hole neither had
   alone — and it is invisible to the one instrument this round built to see
   account-wide spend. This is the single most valuable thing in this report and no
   criterion asked for it.

2. **Two project documents disagree about the largest per-tenant cost.**
   `OPERATIONS.md:60` says *"code default 25, staging runs 50"*, which reads as
   production running 25. `workers/data-ops/wrangler.jsonc:42` sets
   `"AGENT_FREE_DAILY": "50"` in **production**, and `COSTS.md §5` correctly prices
   50 at $15.89/team/month. Anyone budgeting from `OPERATIONS.md` is out by a
   factor of two on the base's single largest per-tenant line.

3. **`cheapText` is dead *and* unmetered.** Zero callers, and it calls `env.AI.run`
   without touching `consumeAiUnit`. Dead code is a leanness finding; dead code
   that bypasses the quota is a loaded gun with the safety off.

4. **Both environments mail the nightly digest to the same mailbox.**
   `wrangler.jsonc:37` and `:70` are both `ops@swiftstruck.com`, deliberately per
   the comment. It doubles digest volume against a 3,000/mo free Resend tier and,
   more usefully, it means a staging-only failure and a production failure look
   identical in the inbox on a bad night.

5. **`help.ts:171-177` hardcodes "cap 500"** in a docstring where the code enforces
   `BULK_IDS_LIMIT`, which is **computed** from `AGENT_MAX_TOKENS` and is 512
   today. R3 filed the same class of defect on the neighbouring reply door; that
   one was fixed and this one, twenty lines above it, was not. A hardcoded number
   describing a derived one rots the moment the derivation changes — which is
   exactly how the previous 512 got believed.

6. **`INVENTORY.md:73` names a rate-limit namespace that does not exist.** It
   records "ids 1001/1002/1003"; the gateway declares **1001, 1003, 1004**
   (`workers/gateway/wrangler.jsonc:12`). Not a cost, but it is in the document a
   rebuilder trusts, next to the cron line that also does not mention the doubling.

---

## Verdict

**The most expensive single action in Brimba is a twelve-step agent reply at
$0.152 — Claude Sonnet 5 at $2.00/MTok input, $2.50/MTok cache write, $0.20/MTok
cache read and $10.00/MTok output, read from platform.claude.com on 2026-08-26.
But the most expensive *shape* is a reply that FAILS: it buys up to thirteen model
calls at $0.256, hands every credit back, and subtracts itself from the one
account-wide meter that would have seen it.**

Prompt caching is live, correctly placed on the one breakpoint that covers both
the tools and the system prompt, provably instrumented, and worth **$273.20 a
month** — a figure I reconstructed for the third independent time, from prices I
fetched myself today, and matched to the cent. `COSTS.md` is the document three
rounds asked for and it is better than the ask: it prices the actions, it dates
every rate, it separates failure-shaped costs from traffic-shaped ones, and it
records that the cron runs in both environments so every ceiling in it is doubled.

What it does not yet contain is its own worst case, five billing lines that are
live today, and the one price movement it explicitly delegated to a document that
never received it.
