# Spend review — round 3 — Brimba · 2026-08-25
SCORE: **81/100**   (round 1: 76 · round 2: 79)

Branch `review-campaign` @ `256d21b`. Read-only; nothing edited but this file.
Scratch in `scratchpad/d3-spend-*`.

> **Measured at `review-campaign` @ `256d21b`.** That branch was then
> fast-forward merged into `main`, and `a063702` + `812da29` landed on top.
> Neither touches a billing surface: `a063702` is a lockfile/manifest fix, and
> `812da29` **reduces** spend — it coalesces the activity-feed invalidation that
> fired on every ping, which is a read-volume saving on D1's fastest-growing
> table. Every figure below still stands at `812da29`, and the one that moves
> moves in the owner's favour.

**No live billing access.** Every figure is a **rate** applied to **units counted
from the code**, never a reading from an invoice. Volumes are the owner's
standing estimate of 24 Aug 2026 (1,000+ signups, 500+ imports, 20,000+ agent
replies a month), labelled as such everywhere.
**Zero surfaces on the $1.00 placeholder** — I re-fetched the Anthropic pricing
page myself today rather than carrying round 2's numbers forward.

---

## DELTA

**No criterion went down.** Four went up. Every rise traces to a repair, and the
biggest one — prompt caching — I reconstructed independently from live prices
rather than accepting round 2's arithmetic.

| # | Criterion | w | R1 | R2 | **R3** | Why it moved |
|---|---|---|---:|---:|---:|---|
| 1 | Work is proportional to the trigger | 15 | 68 | 76 | **80** | **+4.** The ticket-mention fan-out drops MEDIUM → MINOR (−7 → −3): `MENTION_LIMIT = 50` means one reply causes at most **51** emails, and the work now scales with the list the author typed rather than with team size. The other three penalties stand. |
| 2 | Nothing bills in an uncapped loop | 14 | 78 | 86 | **90** | **+4.** Same cause. 50 is a small fixed set, not "far larger than any real case". The unbounded per-team R2 loop still costs −7. |
| 3 | Every paid call is inventoried | 13 | 86 | 86 | **86** | Flat. `grep -c -i "workers logs\|observability" INVENTORY.md` = **0**; `listobjects\|class a` = **0**. The new cache logging *adds* to the uninventoried Workers Logs surface. |
| 4 | Cost per user action is computed | 13 | 92 | 92 | **92** | Flat — and this is where caching's cost shows up. The three actions are re-costed below at the NEW prices, but still here in a review file rather than in the project. No `COSTS.md`. |
| 5 | Something watches the meter | 12 | 77 | 77 | **80** | **+3.** `logCacheUsage` is the first thing in this codebase that watches a *price mechanism* rather than a quota — a silently-missing cache surfaces as a `prompt_cache_miss` line instead of a bigger bill. Still no account-wide ceiling. |
| 6 | Scheduled work is priced | 9 | 67 | 67 | **70** | **+3.** Retention now exits on a short batch (a clean table costs one query), the team-database listing is guarded so it does not enumerate the account for nothing, and a bound that is HIT writes a real row. Only +3 because the per-run ceiling rose **20×** and is still stated in no document. |
| 7 | Storage and egress are priced | 8 | 63 | 66 | **66** | Flat. `ORPHAN_SCAN_CAP = 10_000` and `LEARNING_MEDIA.list({ limit: ORPHAN_SCAN_CAP })` are unchanged; round 2's R2-`list` half stands. |
| 8 | Retries and failures are priced | 6 | 75 | 75 | **75** | Flat. Probe: `retries.total = 0`, `unbounded = 0`. Still zero retry sites. |
| 9 | Each surface has a sourced price | 6 | 100 | 100 | **100** | Flat, and re-earned by my own fetch today, not inherited. |
| 10 | The numbers are written down and dated | 4 | 30 | 30 | **30** | Flat. Still no `COSTS.md`. Three rounds of arithmetic now live only in `reviews/`. |

**What other reviewers' repairs cost this one: nothing measurable, and I checked
rather than assumed.**

- **`256d21b` (round_trip's in-flight de-duplication)** removes ~9 of the 24
  requests a ticket page makes. Workers requests are $0.30/1M — so this is real
  but tiny money, and it is a *saving*, not a cost.
- **`28ef8f6` (account-creation logging)** adds one `account_activity` row per
  signup: 1,000/mo × $1.00/1M rows = **$0.001/month**.
- **`12afe78` (5xx `GuardError` recorded in four workers)** adds an `error_logs`
  row per 5xx. That is a *failure-rate*-shaped cost, not a traffic-shaped one, and
  `error_logs` is on a 90-day retention rule, so it cannot grow forever.
- **`a6d571e` (screen-override removal)** removes one network request from every
  screen in the team area. A saving.

---

## Prices — read at run time today, by me

Anthropic figures fetched **2026-08-25** from
`platform.claude.com/docs/en/about-claude/pricing`. Cloudflare figures from
`~/.claude/skills/cloudflare_usage/references/pricing.md` (dated 2026-07).

| Surface | Included | Rate beyond | Source |
|---|---|---|---|
| Claude Sonnet 5 input | — | **$2.00 / MTok** | Anthropic pricing page, 2026-08-25 |
| Claude Sonnet 5 output | — | **$10.00 / MTok** | same |
| Sonnet 5 **5-minute cache write** | — | **$2.50 / MTok** (1.25×) | same |
| Sonnet 5 **cache hit / refresh** | — | **$0.20 / MTok** (0.1×) | same |
| Sonnet 5 tool-use system prompt, `tool_choice: auto` | — | **354 tokens** | same, tool-use pricing table |
| Tokenizer | — | Claude 4.7+ (incl. Sonnet 5): **~30% more tokens** for the same text | same |
| Token ≈ chars | — | **1 token ≈ 4 characters** | same, FAQ |
| Workers requests | 10,000,000/mo | $0.30 / 1M | cloudflare_usage pricing.md, 2026-07 |
| D1 rows written | 50,000,000/mo | **$1.00 / 1M** | same |
| D1 storage | 5 GB | $0.75 / GB-mo | same |
| R2 Class A (incl. `list`) | 1,000,000/mo | **$4.50 / 1M** | same |
| R2 egress | unlimited | **$0.00** | same |
| Durable Object requests | 1,000,000/mo | $0.15 / 1M | same |
| Workers Logs | 20,000,000 events/mo | **$0.60 / 1M** | round 2's fetch, 2026-08-25 |
| Resend | 3,000/mo free | Pro $20/mo → 50,000 | round 2's fetch, 2026-08-25 |

**The 1 September price rise is confirmed cancelled.** The page carries the note
verbatim: the $2/$10 introductory pricing "is now the standard price. The
previously scheduled increase to $3/$15 … on September 1, 2026 will not occur."
Round 2 adjudicated this against a stale cached reference and got it right.
Nothing in this report rises next week.

---

## What I was asked to verify

### 1 · Prompt caching is on — VERIFIED, and the $273.20 saving is REAL

**The marker.** `workers/data-ops/src/lib/model.ts:222`:

```
...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
```

One marker, on the last system block. `grep -rn "cache_control" workers shared` returns
exactly this line plus its comment. Placement is right for the reason the comment
gives — Claude renders `tools` → `system` → `messages` and the cache is a prefix
match, so one breakpoint on system covers **both** the 31 tool schemas and the
system prompt.

**The prefix is genuinely fixed, and I checked the claim rather than reading it.**
`SYSTEM` (`agent.ts:41-70`) is a module-level constant: 16 prose literals + the
22-term `GLOSSARY` + `capabilityBrief()`, all resolved at module load. I grepped
its whole definition for `${` interpolation: **none**. `toolSpecs()` →
`TOOL_CATALOG` + the 7 tools in `tools.ts` = **31 tools**, a static array in fixed
order, never filtered by rights. Nothing per-request, per-team or per-user is in
either half.

**I re-measured the prefix independently** (`scratchpad/d3-spend-prefix2.mjs`):

```
31 tool names                                    506 ch
25 summaries + 7 descriptions                  4,025 ch
input_schemas (obj(...) → emitted JSON Schema)  ~3,000-6,000 ch   <- the one range
JSON punctuation, 31 objects                   ~1,400 ch
SYSTEM prose                                   4,001 ch
glossary, 22 terms rendered                    1,574 ch
capability brief (3 import targets)           ~1,200-2,500 ch
                                              -----------------
                                               ~15,700-20,000 ch
tokens = chars/4 x 1.30                         5,100-6,500
+ tool-use system prompt (Sonnet 5, auto)         354
                                              -----------------
FIXED PREFIX                                    5,450-6,850 tokens
```

Round 2's **6,209** and the commit's measured **18,283 characters** both sit
inside that bracket. I use 6,209 below for continuity, and the bracket is why the
saving is a figure with a tolerance rather than a decimal point.

**The saving, reconstructed from the prices I fetched today — a different route
from round 2's, arriving at the same place:**

```
one agent reply, mean 2.5 model turns, prefix 6,209 tok, ~750 tok added per step

WITHOUT caching
  input   2.5 x 6,209 = 15,523 tok  +  ~1,630 tok of messages
          17,153 x $2.00/1e6                              = $0.034306
  output  2.5 x 200 x $10.00/1e6                          = $0.005000
                                                            ----------
                                                            $0.039306 / reply

WITH caching
  write   1 x 6,209 x $2.50/1e6                           = $0.015523
  read    1.5 x 6,209 x $0.20/1e6                         = $0.001863
  fresh   ~1,630 tok of messages x $2.00/1e6              = $0.003260
  output  2.5 x 200 x $10.00/1e6                          = $0.005000
                                                            ----------
                                                            $0.025646 / reply

saving  $0.039306 - $0.025646 = $0.013660 / reply
        x 20,000 replies/mo   =  $273.20 / month
```

**$273.20, to the cent, by an independent route.** Round 1 said $273.68, round 2
said $273.20, and this reconstruction — which prices the messages as well as the
prefix, so they cancel — lands on the same figure. **Confirmed.**

Monthly Anthropic spend at the standing volume: **$786.12 → $512.92**, a 35% cut
on the whole bill.

**And it is verifiable in production, which matters more than the arithmetic.**
`logCacheUsage` (`model.ts:144-155`) reads the counters off the response and emits
one of three events. Both call paths log — `complete()` at `:251` and `stream()`
at `:285` — and `toUsage` (`:118-125`) reads `cache_creation_input_tokens` and
`cache_read_input_tokens`; the streamed path takes them from `message_start`
(`:326`), which is where Claude reports input usage. So a streamed turn is not
silently unmeasured. This is the part round 2 could not have: the saving is now
falsifiable rather than projected.

### 2 · Is a SECOND breakpoint worth it for the growing conversation? — Yes for long replies, NO for short ones, and the right mechanism is not a second explicit marker

The pricing page names a mechanism neither prior round used:

> **Automatic caching:** Add a single `cache_control` field at the **top level** of
> your request. The system automatically manages cache breakpoints as
> conversations grow. This is the recommended starting point for most use cases.

That is the answer to the question as asked. Hand-placing a second marker means
moving it every turn; automatic caching manages the growing half for you.

**But it is not free, and the arithmetic says it depends entirely on turn
length.** Per token of message content added at turn *k* of an *S*-turn reply,
with `d = S − k` re-reads:

```
without caching   paid (d + 1) times at 1.0x
with caching      paid once at 1.25x, then d times at 0.1x  =  1.25 + 0.1d

caching wins when   1.25 + 0.1d  <  d + 1     i.e.   d > 0.28
```

So content re-read **even once** wins, and content added on the **final** turn —
never re-read — costs a flat **25% more**. Worked through, at 750 tokens per step:

| reply shape | messages cost today | with automatic caching | net |
|---|---|---|---|
| S = 2 (one tool call) | 880 tok | ~983 tok | **−103 tok (loses)** |
| S = 3 | 2,640 tok | ~2,138 tok | +502 tok |
| S = 12 (`MAX_STEPS`) | 51,060 tok | ~14,743 tok | **+36,317 tok (71%)** |

A plausible mix — 60% of replies at 1–2 turns, 30% at 3–5, 10% at 6–12 — gives
`20,000 × (0.6×−100 + 0.3×800 + 0.1×8,000) = 19.6M tok`, about **$39/month**.
That is a **shape estimate on an unmeasured distribution**, and it is one seventh
of what the first breakpoint bought.

**Recommendation: measure before you move.** The real turn distribution is in
`agent_usage_log`, which this review cannot reach — **UNMEASURED**. One query
against it turns $39/month from a guess into a number. If the tail is thin, doing
nothing is correct; if `MAX_STEPS`-length runs are common, automatic caching is
worth more than $39 and is one field, not a per-turn marker dance.

### 3 · The mention window is closed at 50 — VERIFIED

`shared/workers/bulk.ts:68` — `export const MENTION_LIMIT = 50`, and
`workers/content/src/routes/help.ts:196` passes it:
`optionalIdList(body.taggedUserIds, MENTION_LIMIT)`. The fan-out at
`notify.ts:106` is `Promise.all([...recipients].map(...))` where
`recipients = mentioned (≤50) ∪ {raiser}` — **at most 51 emails per reply**, a
number in the code, below D1's 100-bound-parameter ceiling that
`lookupUsers`'s `IN (${placeholders})` would otherwise hit.

**One defect, and it is in the comment, not the code.** `help.ts:194` still reads
*"`optionalIdList` bounds it at BULK_IDS_LIMIT"* — which is **512**, the number
the change was made to stop using. The line below it passes `MENTION_LIMIT`. The
comment now names the wrong constant, which is exactly how the previous 512 got
believed.

The probe's one `unbounded` hit — `notify.ts:45`, "billed call in a loop with NO
visible cap" — is a **false positive**. Line 45 is `for (const r of results ?? [])`,
building a `Map` from a D1 result set. No billed call is in it.

### 4 · `AGENT_FREE_DAILY = 50` — not re-filed, arithmetic kept visible

The owner called this a business decision and it is not re-opened here. But
prompt caching changed what the decision costs, and that belongs on the record:

```
one metered turn, cache WARM (steady state inside a conversation)
  read    6,209 x $0.20/1e6                     = $0.0012418
  fresh     750 x $2.00/1e6                     = $0.0015000
  output    200 x $10.00/1e6                    = $0.0020000
                                                  -----------
                                                  $0.0047418

50 credits/day x 30.4 days = 1,520 turns / team / month
at ~2.5 turns per reply that is 608 replies: 608 cache writes, 912 cache reads

  writes  608 x 6,209 x $2.50/1e6               = $ 9.44
  reads   912 x 6,209 x $0.20/1e6               = $ 1.13
  fresh   1,520 x 750 x $2.00/1e6               = $ 2.28
  output  1,520 x 200 x $10.00/1e6              = $ 3.04
                                                  -------
                                                  $15.89 / team / month
```

**$24.20 → $15.89 per team per month**, a **34% reduction** in the free
entitlement's cost. The honest bracket is **$7.21** (every turn a cache hit — one
sustained conversation) to **$28.91** (every turn a cold write — 50 credits spread
across the day, each reply more than five minutes after the last). The 50-credit
decision now exposes roughly two thirds of what it did last week, and that is the
whole of what caching changed about it.

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned
total    = round( Σ (criterion × weight) / 100 )
```

| # | Criterion | Method | Score | Weight | × |
|---|---|---|---:|---:|---:|
| 1 | Work proportional to the trigger | defect | **80** | 15 | 1200 |
| 2 | Nothing bills in an uncapped loop | defect | **90** | 14 | 1260 |
| 3 | Every paid call is inventoried | coverage | **86** | 13 | 1118 |
| 4 | Cost per user action is computed | coverage | **92** | 13 | 1196 |
| 5 | Something watches the meter | coverage | **80** | 12 | 960 |
| 6 | Scheduled work is priced | coverage | **70** | 9 | 630 |
| 7 | Storage and egress are priced | coverage | **66** | 8 | 528 |
| 8 | Retries and failures are priced | coverage | **75** | 6 | 450 |
| 9 | Each surface has a sourced price | coverage | **100** | 6 | 600 |
| 10 | The numbers are written down and dated | coverage | **30** | 4 | 120 |
| | | | | **100** | **8062** |

**8062 / 100 = 80.62 → SCORE 81.**
Gate: criterion 1 = 80, well above 40 — **no cap**. Uncapped = capped = 81.

### Criterion 1 — proportionality (80) · 100 − (3 + 7 + 7 + 3)

The probe reports **zero** amplifiers again, and the rubric says a zero is not a
pass on a codebase with scheduled work, so I re-opened the nightly chain by hand
(`workers/tenancy/src/index.ts:183-208` → `checkDatabaseSizes` → `runRetention` →
`recomputeShardCounts` → `sweepOrphanedUploads`).

| hit | R2 | R3 | why |
|---|---|---|---|
| `notifyReplyAndMentions`, `notify.ts:106` | MEDIUM −7 | **MINOR −3** | ≤51 emails, and the work now scales with the author's own list |
| `sweepOrphanedUploads` team loop, `sharding.ts:~560` | MEDIUM −7 | MEDIUM −7 | unchanged — every team's bucket prefix is listed every night regardless of whether anything changed |
| per-row publish on the bulk door, `help.ts:172` | MEDIUM −7 | MEDIUM −7 | unchanged |
| unmetered failure wrap-up, `agent.ts:653` | MINOR −3 | MINOR −3 | unchanged — a refused run still buys one un-metered model call |

### Criterion 2 — uncapped billed loops (90) · 100 − (3 + 7)

Billed loops with a **number in the code**: **10 of 11**. The one still without is
the per-team R2 `list`/`delete` inside `SELECT … FROM teams` with no `LIMIT` and
no cursor.

Caps re-verified this round: mentions **50**, bulk ids **512** (`BULK_IDS_LIMIT`,
computed as `(8192 − 512)/15` from `AGENT_MAX_TOKENS`, not hand-picked), agent
steps 12, replayed history 24, tool results 2,000 chars, retention **5,000 rows ×
20 passes**, team sweep **1 pass**, orphan scan 10,000, uploads 25 MB / 2.5 MB.
This remains a well-capped codebase, and the retention bound is a *good* cap — a
deliberate catch-up budget with an alarm when it is hit — so it is not penalised
here. Its unstated cost is criterion 6's problem, below.

**A latent detail worth recording:** the unbounded per-team retention loop
(`sharding.ts:450`) is behind `if (TEAM_RETENTION.some(days > 0))`, and
`TEAM_RETENTION`'s only rule (`activity`) is `KEEP_FOREVER`. So it **does not run
today** — it is one environment variable away from running, and the guard's own
comment says why it exists. The penalty stands because setting that variable is a
config change, not a deploy.

### Criterion 3 — inventory (86) · 35 + 21 + 20 + 10

Three vendors detected (`anthropic`, `workers-ai`, `email`) and all three are in
`INVENTORY.md`. Still absent, third round: **Workers Logs** (`grep -c -i "workers
logs\|observability" INVENTORY.md` = **0**) and the nightly **R2 `ListObjects`**
(`listobjects\|class a` = **0**).

The cache logging makes the first one bigger, not smaller: 50,000 model turns a
month now each emit one `prompt_cache_*` line. At $0.60/1M events against a
20,000,000/mo allowance that is **$0.00/month** and will stay so — but it is a
third path writing to a billing surface no document lists.

### Criterion 4 — cost per user action (92) · 40 + 25 + 12 + 15

Three headline actions, costed at today's prices with caching ON:

| action | arithmetic | price |
|---|---|---|
| **one signup** | 1 Resend message ($20/50,000 on Pro) + ~10 D1 rows ($1/1M) + ~15 Workers requests ($0.30/1M) | **$0.000415** |
| **one import** | Claude plan: (~600 prefix + ~2,000 file preview) × $2/1M + ~500 out × $10/1M = $0.0102; + 2,000 D1 rows × $1/1M = $0.002 | **$0.0122** |
| **one agent reply** (2.5 turns) | write $0.015523 + read $0.001863 + fresh $0.003260 + output $0.005000 | **$0.025646** |
| **worst case: a 12-step reply** | write 6,209 @1.25× $0.015523 + 11 reads $0.013660 + 49,500 fresh tok $0.099000 + 2,400 out tok $0.024000 | **$0.152183** |

**A 12-step agent reply is the most expensive single action in the product, at
$0.152.** Uncached it was $0.272, so caching took 44% off the worst case as well
as the mean.

Per-tenant monthly: a team using its full free entitlement costs **$15.89** in
Anthropic inference (bracket $7.21–$28.91). The 12 points withheld on the third
row are because the *actual* distribution lives in `agent_usage_log` and remains
**UNMEASURED**; the 8 withheld on the first are because these numbers are in this
file rather than the project's.

### Criterion 5 — something watches the meter (80) · 35 + 10 + 20 + 15

- **35** · quota is checked before the model call, not after (`credits.ts`).
- **10 of 25** · nothing alerts before a *spend* limit. The 80% database-size
  alarm fires before a *storage* limit, which is a billed resource, so it earns
  part of this. (The alarm firing at 80% rather than 65% is an honesty fix, not a
  coverage change — its message always said 80.)
- **20** · a per-tenant cap exists (`AGENT_FREE_DAILY`), so one customer cannot
  spend the whole account on inference.
- **15 of 20** · `agent-usage-dialog` shows credits, not currency; and
  `logCacheUsage` now surfaces the single largest price lever where an operator
  can grep for it. Still **no account-wide ceiling**: re-verified that every
  quota read is `WHERE team_id = ?` and there is no `SUM(used)` anywhere.

### Criterion 6 — scheduled work is priced (70) · 12 + 20 + 38

One cron: `10 3 * * *` on `brimba-tenancy`, four jobs behind it.

The retention repair is well built — `SWEEP_BATCH = 5000`, `SWEEP_MAX_PASSES = 20`,
`TEAM_SWEEP_MAX_PASSES = 1`, break on a short batch, one `error_logs` row per run
when a bound is hit. A clean table now costs **one query**, and the team-database
listing is skipped entirely when no team rule is on. That is the third item
earned almost in full.

The first item barely moves, because the ceiling is knowable and unstated:

```
5 sweepable rules (login_codes 1d, email_change_codes 1d, idempotency_keys 2d,
                   error_logs 90d, agent_usage_log 400d;
                   account_activity and activity are KEEP_FOREVER)
worst case  5 x 20 x 5,000 = 500,000 rows deleted per night   (was 5 x 1 x 5,000 = 25,000)
            500,000 x 30.4 = 15,200,000 rows/mo x $1.00/1M    = $15.20 / month
            and 100 D1 statements per night, up from 5
```

**A 20× rise in a billed ceiling, in no document.** It is almost certainly never
reached — these tables hold 1–2 days of codes — and the alarm fires if it is. But
"almost certainly never reached" is the sentence this skill exists to distrust,
and the number belongs in a `COSTS.md` that does not exist.

### Criterion 7 — storage and egress (66) · 10 + 25 + 16 + 15

Unchanged. `ORPHAN_SCAN_CAP = 10_000`; the reference read is keyset-paged and
fail-closed (round 2's data-loss path stays closed); the
`LEARNING_MEDIA.list({ limit: ORPHAN_SCAN_CAP })` half stands, and R2 `list` is a
Class A operation at $4.50/1M. Per-tenant object-storage growth is still
estimated nowhere.

### Criterion 8 — retries and failures (75) · 40 + 30 + 5

Probe: `retries.total = 0`, `unbounded = 0`. Re-verified — still zero retry sites
anywhere, and the `forwardToDoor` seam adds none. Nothing can retry a billed
operation indefinitely because nothing retries at all. The 25 withheld are on the
third item: the cost of the failure path is still uncounted, and `agent.ts:653`'s
`failureWrapUp` is an unmetered model call on exactly that path.

### Criterion 9 — sourced prices (100) · 50 + 30 + 20

8 of 8 surfaces sourced, dated, with the free-tier boundary stated. **Zero
placeholders.** I fetched the Anthropic page myself at run time today rather than
carrying round 2's table forward, and it changed one material fact: the September
rise is confirmed cancelled on the vendor's own page.

### Criterion 10 — written down and dated (30) · 0 + 15 + 15

`ls COSTS.md` → no such file. The only currency figure in any project document is
the `$5/mo` plan price at `INVENTORY.md:14`. Three rounds of arithmetic, a
confirmed $273/month saving and a $15.89/team entitlement now exist only inside
`reviews/`, which is a review archive, not a project reference.

---

## Findings

### HIGH — the numbers still are not written down, and there are now more of them

Criterion 10, third round, 30/100. `COSTS.md` does not exist. What is missing is
no longer three per-action figures — it is the confirmed $273.20/month saving,
the new $15.89/team entitlement, the $0.152 worst-case action, the 20× retention
ceiling, and the sourced price table with the September cancellation on it. **Fix
(Tier 1):** a dated `COSTS.md` naming who produced it. It is the cheapest four
points on this review and the reason the next run is quick.

### MEDIUM — `help.ts:194` names the wrong constant

The comment says `optionalIdList` "bounds it at BULK_IDS_LIMIT" (512); the code
two lines down passes `MENTION_LIMIT` (50). **Fix (Tier 1):** one word.

### MEDIUM — the retention ceiling rose 20× and is stated nowhere

Criterion 6. Up to 500,000 D1 row-deletes per night, up from 25,000, at
$1.00/1M rows written. Bounded, alarmed, almost certainly never reached — and in
no document. **Fix (Tier 1):** one line in `COSTS.md`.

### MEDIUM — Workers Logs and the nightly R2 `list` are still not inventoried

Criterion 3, third round. Both are real billing surfaces with real free-tier
boundaries; neither appears in `INVENTORY.md`. The cache logging adds a third
writer to the first. **Fix (Tier 1):** two rows in `INVENTORY.md`.

### MEDIUM — no account-wide spend ceiling

Criterion 5. Every quota read is per team. Fifty teams each using their 50 free
credits is ~$795/month of inference with nothing in the code able to see the
total. The per-tenant cap prevents one customer running away; it does not prevent
the account doing so. **Fix (Tier 2):** a `SUM(used)` check before the model call.

### LOW — `prompt_cache_miss` cannot distinguish a regression from an expected zero

`logCacheUsage` is the alarm that makes the whole caching repair falsifiable, and
its miss state has a benign second cause. `import-agent.ts:146` shares
`ClaudeModel.buildBody` and calls `.complete(messages, [])` with **no tools**; its
system block is ~1,064 characters of local `SYSTEM` plus `catalogPrompt()` for
three targets — roughly **550-650 tokens**, below Sonnet 5's ~1,024-token
cacheable minimum. So every import plan (500/month) logs `prompt_cache_miss`
correctly and harmlessly, from the same `place` string (`model.claude.complete`)
the agent's non-streaming path uses. Anyone grepping the alarm gets a mixed
signal.

*(I checked the worse version of this and it is not true: `catalogPrompt()` reads
`TARGETS`, a static module constant, not the team's live catalogue — so the import
prefix does not vary per team and there is no per-team cache-entry churn. The
money here is nil either way; the finding is purely about the alarm's clarity.)*
**Fix (Tier 1):** thread the caller into `place`.

### LOW — a second cache breakpoint is unpriced because the turn distribution is unmeasured

See §2. Worth roughly $39/month on a plausible mix and **negative** on a
two-turn-dominated one. **Fix (Tier 2, after measuring):** one query against
`agent_usage_log` for the step-count distribution, then a single top-level
`cache_control` (Anthropic's automatic caching) if the tail justifies it.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| Dated `COSTS.md` | `COSTS.md` (new), `README.md` doc map | +1 document | **`story_checks_out_review`:** a new document is a new thing that can go stale and contradict — it must carry its read-date and be listed in the doc map, or it becomes their finding next round. **`lean_mean_review`:** neutral (prose, not code). |
| Fix the `BULK_IDS_LIMIT` comment | `workers/content/src/routes/help.ts` (1 word) | −1 wrong number | none — it corrects a comment to match the line below it. |
| Two rows in `INVENTORY.md` | `INVENTORY.md` | +2 rows | none — recording a surface that already bills. |
| Thread the caller into `place` | `workers/data-ops/src/lib/model.ts` (~4 lines) | +1 parameter | **`lean_mean_review`:** +4 lines and one more argument through a hot seam. Small, real cost against a leanness score, for an alarm that is otherwise ambiguous. |
| Account-wide spend ceiling | `workers/data-ops/src/lib/credits.ts`, a new `SUM(used)` read | +1 D1 query per agent call | **`speed_review`:** a second query on the critical path before every reply — it is a `SUM` over `agent_usage`, so it needs an index or it gets slower as the table grows. **`scaling_review`:** the same read becomes a contended hot row at volume. **`round_trip_review`:** +1 internal call. This is the one fix here with a genuine cost, and it should be priced against them before it is built. |
| Automatic caching for the growing half | `workers/data-ops/src/lib/model.ts` (1 field) | moves from explicit to automatic breakpoints | **Risk to me:** it can *cost* money on short replies (arithmetic in §2), so it must not ship before the distribution is measured. **`speed_review` — helps:** cache reads are faster. **`story_checks_out_review`:** the 30-line comment at `model.ts:194-221` explains the explicit single-marker design and would contradict itself unless rewritten in the same commit. |
| Measure the turn distribution | none — one read-only query | +0 | none — a query, not a change. Should precede the row above it. |

---

## CEILING

**95 is not reachable by changing code, and the honest maximum is 92.** Two
criteria are capped by things a commit cannot fix, and one by a decision that is
the owner's.

- **Criterion 4 caps at 92** until the app has live usage data. Its 20-point
  "per-tenant monthly estimate for a typical customer" item needs the real
  distribution in `agent_usage_log` — a *measurement*, not a change. A commit can
  write the query; only running it against production data earns the points.
  Cost: 2.6 points until someone runs it.
- **Criterion 7 caps at ~85.** Per-tenant object-storage growth cannot be
  estimated from source — it depends on what customers upload. Cost: 1.2 points.
- **Criterion 1 caps at ~93.** Two of its four penalties are structural rather
  than sloppy: the nightly orphan sweep must list every team's prefix because R2
  has no change feed (a platform limit), and the per-row publish on the bulk door
  is required by LAW R1 + R23 — batching it would break a law. Cost: 1.05 points.

Everything else at its realistic maximum
(C1 **93 capped** · C2 97 · C3 100 · C4 **92 capped** · C5 95 · C6 95 ·
C7 **85 capped** · C8 90 · C9 100 · C10 100):

```
(93×15)+(97×14)+(100×13)+(92×13)+(95×12)+(95×9)+(85×8)+(90×6)+(100×6)+(100×4)
= 1395+1358+1300+1196+1140+855+680+540+600+400 = 9464 -> 95
```

That reaches 95 **only** if criteria 5 and 6 are driven to 95, which needs the
account-wide ceiling — the one fix on the map with a real cost to
`speed_review` and `scaling_review`. Without it, C5 tops out near 80 and C6 near
85, and the ceiling is:

```
9464 − (15×12) − (10×9) = 9464 − 180 − 90 = 9194 -> 92
```

**So: 92 by writing things down, 95 only by accepting a query on the critical
path that two other reviews will charge you for.** The four documentation
findings alone — `COSTS.md`, two `INVENTORY.md` rows, the comment, the retention
line — are worth about **6 points** and cost nothing anywhere else, and they are
the same four findings this review has now filed three times.

---

## Verdict

**The most expensive single action in Brimba is a twelve-step agent reply, at
$0.152 — Claude Sonnet 5 at $2.00/MTok input, $2.50/MTok cache write and
$0.20/MTok cache read, read from platform.claude.com on 2026-08-25.** Prompt
caching is live, correctly placed, provably byte-identical, instrumented so a
silent miss cannot hide, and worth the **$273.20 a month** two prior rounds
predicted — a figure I reconstructed by a different route and matched to the
cent. What is still missing is the file that would let anyone else find that out
without running this review again.
