# Spend review — Brimba · 2026-08-25
SCORE: 76/100   (previous: never run)

Read-only audit. Nothing in this repository was changed except this file.
No live billing access: every Cloudflare and vendor figure below is a **rate**
applied to **counted units from the code**, never a reading from an invoice.
Anything needing the actual bill is marked **unmeasured**.

---

## Prices — every one sourced and dated

Read at run time on **2026-08-25** unless stated. No price is recited from memory,
and **no placeholder is used anywhere in this report** (0 of 8 surfaces on `$1.00/op`).

| Surface | Included | Rate beyond | Source |
|---|---|---|---|
| Claude Sonnet 5 input | — | **$2.00 / MTok** | platform.claude.com/docs/en/about-claude/pricing |
| Claude Sonnet 5 output | — | **$10.00 / MTok** | same |
| Sonnet 5 cache write (5 min) | — | $2.50 / MTok | same |
| Sonnet 5 cache read (hit) | — | $0.20 / MTok | same |
| Sonnet 5 tool-use system overhead | — | 354 tokens (`tool_choice: auto`) | same |
| Workers AI (llama-4-scout) | 10,000 Neurons/day | $0.011 / 1,000 Neurons ⇒ $0.270/M in, $0.850/M out | developers.cloudflare.com/workers-ai/platform/pricing |
| Resend | 3,000/mo (100/day) free | Pro $20/mo → 50,000; overage $0.46–0.90 / 1,000 | resend.com/pricing |
| Workers requests | 10,000,000/mo | $0.30 / 1M | `~/.claude/skills/cloudflare_usage/references/pricing.md` (dated 2026-07) |
| Workers CPU | 30,000,000 CPU-ms | $0.02 / 1M | same |
| D1 rows read | 25,000,000,000 | ~$0.001 / 1M | same |
| D1 rows written | 50,000,000 | **$1.00 / 1M** | same |
| D1 storage | 5 GB | $0.75 / GB-mo | same |
| R2 storage | 10 GB | $0.015 / GB-mo | same |
| R2 Class A (**incl. ListObjects**) | 1,000,000 | **$4.50 / 1M** | developers.cloudflare.com/r2/pricing |
| R2 Class B (GET/HEAD) | 10,000,000 | $0.36 / 1M | same |
| R2 egress | unlimited | **$0.00** | same |
| Durable Object requests | 1,000,000 | $0.15 / 1M | cloudflare_usage pricing.md |
| Durable Object duration | 400,000 GB-s | $12.50 / 1M GB-s | same |
| **Workers Logs** (`observability: enabled`) | 20,000,000 events/mo | **$0.60 / 1M** | developers.cloudflare.com/workers/observability/logs/workers-logs |

Two platform facts that change the arithmetic materially, both sourced today from
developers.cloudflare.com/workers/platform/pricing:

- **Service-binding calls are not billed as extra requests.** One user click that
  crosses gateway → tenancy → auth → realtime is **one** billable Workers request,
  not four. Brimba's seven-worker, gateway-only-public shape therefore costs
  nothing extra on the request axis. This is a genuinely good spend decision.
- **Static assets are not billed, and WebSocket *messages* are not billed** — only
  the initial `Upgrade`. The live layer replaces polling (I found **zero**
  `setInterval`/poll timers in `web/`), so screens stay fresh for one request each.

Subrequest ceiling: **10,000 per invocation** on the Paid plan (same source) — this
matters for the nightly cron, below.

---

## How the token counts were measured

Not estimated from file sizes. I compiled the real source with the repo's own
`esbuild` and printed the runtime string lengths:

| Thing | Measured |
|---|---|
| `SYSTEM` prompt (`workers/data-ops/src/lib/agent.ts:41`) | **7,915 chars** |
| — of which the generated capability brief (R9) | 2,074 chars |
| Tool catalogue: **31 tools**, wire JSON (`name`+`description`+`input_schema`) | **10,132 chars** |
| **Fixed prefix sent on every model turn** | **18,047 chars** |

Converting, using Anthropic's own figures from the page read today:

```
18,047 chars ÷ 4 chars/token          = 4,512 tokens   ("1 token ≈ 4 characters", pricing FAQ)
× 1.30  (Sonnet 5 newer tokenizer,
         "approximately 30% more tokens
          for the same text" — same page) = 5,866 tokens
+ 354   (Sonnet 5 tool-use system prompt) =  6,220 tokens
```

**FIXED INPUT PER MODEL TURN = 6,220 tokens.** Every turn pays for all of it,
because there is **no prompt caching** — `grep -rn "cache_control"` across every
`.ts` in the repo returns nothing, and `buildBody` (`model.ts:115`) sends the
system block and all 31 tool schemas raw on every call.

Per-step context growth, from caps that are actually in the code: a tool result is
fenced at **2,000 chars** (`fence()`, `agent.ts:104`) plus ~300 chars of assistant
text ⇒ 2,300 chars ⇒ 575 tokens × 1.3 ≈ **750 tokens added per completed step**.
The 300-char assistant figure is the one **estimate** in this arithmetic; every
other number is a measured constant or a sourced rate.

---

## The three headline actions, costed

### 1 · One agent reply — the expensive one

`MAX_STEPS = 12` (`agent.ts:27`). One credit is metered per model turn.

**(a) A question, no tools — 1 model turn**
```
input   6,220 tok × $2 /1,000,000 = $0.012440
output    150 tok × $10/1,000,000 = $0.001500
                                    ---------
                                    $0.013940   ≈ $0.0139
```

**(b) A typical action — 2 model turns (call a tool, then answer)**
```
turn 1 input  6,220
turn 2 input  6,220 + 950   =  7,170
total input                   13,390 tok × $2 /1e6 = $0.026780
total output  200 + 150     =    350 tok × $10/1e6 = $0.003500
                                                     ---------
                                                     $0.030280  ≈ $0.0303
```

**(c) Worst case — 12 steps + the unmetered failure wrap-up = 13 model calls**
```
Σ input, steps 1..12 = 12 × 6,220 + 950 × (0+1+…+11 = 66)
                     = 74,640 + 62,700           = 137,340 tok
wrap-up call         =  6,220 + 12 × 950         =  17,620 tok
                                                   -----------
                                     total input   154,960 tok × $2 /1e6 = $0.309920
                                     total output    2,600 tok × $10/1e6 = $0.026000
                                                                           ---------
                                                                           $0.335920
```
**Worst-case action: $0.336 per agent reply.** Cloudflare's share of that run
(1 Workers request, ~12 gated door calls, ~36 D1 row reads, ~14 D1 row writes,
12 DO requests) is **$0.0000009** — four orders of magnitude smaller. 92% of the
price is Anthropic input tokens, and **48% of the whole run ($0.162) is the same
6,220-token prefix paid 13 times over.**

**Monthly, at the owner's standing estimate of 20,000+ agent replies (24 Aug 2026 — an estimate, not a measurement):**

| if every reply were… | monthly Anthropic |
|---|---|
| shape (a), 1 turn | $278 |
| shape (b), 2 turns | $606 |
| shape (c), 12 turns | $6,718 |

**UNMEASURED.** The code cannot tell me the turn-count distribution. `agent_usage_log`
records credits per turn and would answer it exactly — I have no live access to it.
The honest monthly figure is the **range $278 – $6,718**, not a number.

### 2 · One signup (account + first team)

```
1 login-code email (Resend)      1 × $0.0004  = $0.000400   (Pro rate; $0 under the 3,000/mo free tier)
core D1 writes (user, session,
  code, team, membership, 2 upd)  7 rows × $1/1e6 = $0.000007
team-DB create + schema + seed
  (~30 rows via d1ExecScript)    30 rows × $1/1e6 = $0.000030
1 DO request (publishUserChange)  1 × $0.15/1e6   = $0.00000015
~6 Workers requests               6 × $0.30/1e6   = $0.0000018
                                                    ----------
                                                    $0.000439   ≈ $0.00044
```
**At 1,000 signups/month: $0.44 — and $0.00 while Resend's free tier holds.**

D1 *storage* per new team database is **unmeasured** (needs the account: D1 reports
a per-database `file_size`, which `checkDatabaseSizes` already reads at runtime).

**The signup is not the cost. The entitlement it creates is.** See below.

### 3 · One import (a 1,000-row CSV)

```
Claude plan call (import-agent.ts:149)
  prompt: SYSTEM 1,540ch + catalog (3 targets) ~700ch + headers & 3 sample rows ~400ch
        = 2,640 ch ÷ 4 × 1.3                          =   858 tok × $2 /1e6 = $0.001716
  plan JSON out                                       =   400 tok × $10/1e6 = $0.004000
run_import_batch through the agent loop (shape b)                            = $0.030280
1,000 rows + 1,000 activity rows (R25)               = 2,000 rows × $1/1e6   = $0.002000
FK-resolution reads (bounded)                                                 ≈ $0.000001
                                                                                ---------
                                                                                $0.037997  ≈ $0.0380
```
**At 500 imports/month: $19.00.** 94% Anthropic.

### The number the owner most needs: the free entitlement

`AGENT_FREE_DAILY = "50"` (`workers/data-ops/wrangler.jsonc:38`, **both**
production and staging; the code default is 25). One credit = one model turn.

```
average turn at a 3-turn mean conversation:
  input  6,220 + 950 = 7,170 tok × $2 /1e6 = $0.014340
  output           200 tok      × $10/1e6 = $0.002000
                                            ---------
                                per turn    $0.016340
× 50 turns/day × 30.4 days = 1,520 turns  = $24.84 per team per month
```

**Every team is handed $24.84/month of Anthropic inference, free, for ever, with
no account-wide ceiling anywhere in the code.** At 1,000 signups/month, if one team
in ten uses its full allowance: **100 × $24.84 = $2,484/month**, against a $5/month
Cloudflare plan. And a turn whose actions were all refused is **refunded to zero**
(`refundIfNothingDone`, `agent.ts:368`) — the user pays nothing, the account pays in full.

### Cloudflare's share, at these volumes

Essentially nil. Requests, CPU, D1 reads/writes, DO requests and Workers Logs all
sit deep inside the included allowances at 1,000 signups / 500 imports / 20,000
agent replies. **The bill is Anthropic. Cloudflare is the $5.**

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned
total    = round( Σ (criterion × weight) / 100 )
```

| # | Criterion | Method | Score | Weight | × |
|---|---|---|---|---|---|
| 1 | Work proportional to the trigger | defect | **68** | 15 | 1020 |
| 2 | Nothing bills in an uncapped loop | defect | **78** | 14 | 1092 |
| 3 | Every paid call is inventoried | coverage | **86** | 13 | 1118 |
| 4 | Cost per user action is computed | coverage | **92** | 13 | 1196 |
| 5 | Something watches the meter | coverage | **77** | 12 | 924 |
| 6 | Scheduled work is priced | coverage | **67** | 9 | 603 |
| 7 | Storage and egress are priced | coverage | **63** | 8 | 504 |
| 8 | Retries and failures are priced | coverage | **75** | 6 | 450 |
| 9 | Each surface has a sourced price | coverage | **100** | 6 | 600 |
| 10 | The numbers are written down and dated | coverage | **30** | 4 | 120 |
| | | | | **100** | **7627** |

**7627 / 100 = 76.27 → SCORE 76.**
Gate: criterion 1 = 68 ≥ 40, so **no cap applied**. Uncapped figure = capped figure = 76.

### Criterion 1 — proportionality (68) · 100 − (15+7+7+3)

The probe reported **zero** amplifiers. The rubric says a zero is not a pass when
the project has scheduled work, so I opened the biggest one by hand: the whole
nightly chain in `workers/tenancy/src/lib/sharding.ts` (`checkDatabaseSizes`,
`runRetention`, `recomputeShardCounts`, `sweepOrphanedUploads`) plus its caller at
`workers/tenancy/src/index.ts:174`. **The probe's zero was wrong.** Four hits:

- **HIGH (−15)** — `notifyReplyAndMentions`, `workers/content/src/lib/notify.ts:106`
- **MEDIUM (−7)** — `sweepOrphanedUploads`, `workers/tenancy/src/lib/sharding.ts:415`
- **MEDIUM (−7)** — per-row publish on the bulk door, `workers/content/src/routes/help.ts:171`
- **MINOR (−3)** — the unmetered failure wrap-up, `workers/data-ops/src/lib/agent.ts:130 / :527`

All four are written up under Findings.

### Criterion 2 — uncapped billed loops (78) · 100 − (15+7)

**The probe's one hit is a false positive and I am not counting it.** It flagged
`workers/content/src/lib/notify.ts:45` — that line is `for (const r of results ?? [])`
inside `lookupUsers`, which builds a `Map`. The "Resend" the probe matched is the
word inside a **doc comment on line 54**. Exactly the prose-parsed-as-code failure
mode the campaign brief warns about.

Counted by reading instead: the `Promise.all` email fan-out (−15) and the per-team
R2 `list`/`delete` inside an unbounded `SELECT … FROM teams` (−7).

**Loops that DO carry a real cap, credited (numerator 9 of 11 billed loops):**
bulk ids 512 (`requireIdList`/`BULK_IDS_LIMIT`), import parcels ≤2,000 (`parcelSize`),
agent steps 12 (`MAX_STEPS`), replayed history 24 (`MAX_HISTORY`), tool results
2,000 chars (`fence`), realtime fan-out 32 (`MAX_SHARDS`), retention 5,000/night
(`SWEEP_BATCH`), the module mover 250/batch (`COPY_BATCH`), uploads 25 MB / 2.5 MB.
This is a well-capped codebase; the two misses are the exceptions, not the pattern.

### Criterion 3 — inventory (86) · 31 + 25 + 20 + 10

- **31/35** — `INVENTORY.md` lists 8 services. **7 of the 8 real billing surfaces**
  are named; the eighth, **Workers Logs**, is not (35 × 7/8 = 30.6).
- **25/25** — each is tied to its feature by the "What it does" / "Without it" columns.
- **20/20** — model choice is demonstrably deliberate: `cheapText()` (`model.ts:381`)
  uses Workers AI for inline jobs "regardless of the key"; `selectModel()` reaches for
  Claude only when a key exists; `AGENT_EFFORT: "low"` is documented as "the cheap
  setting" in both `model.ts:106` and `OPERATIONS.md:60`.
- **10/20** — two paths bill from somewhere nobody listed: Workers Logs, and the
  nightly R2 `ListObjects` (Class A) that runs once per team per night.

### Criterion 4 — per-action cost (92) · 40 + 25 + 12 + 15

- **40/40** — three headline actions costed with the arithmetic printed above.
- **25/25** — each figure counts every vendor the action touches (Anthropic, Resend,
  D1, R2, DO, Workers), not just the obvious one.
- **12/20** — a per-tenant monthly figure exists, but only as the **entitlement
  ceiling** ($24.84/team/mo, exact). The per-tenant *actual* is **unmeasured**: it
  needs `agent_usage_log`, which needs the live database.
- **15/15** — worst case identified and priced: the 12-step agent run, $0.336.

### Criterion 5 — watching the meter (77) · 35 + 10 + 20 + 12

- **35/35** — the check runs **before** the spend, every time. `consumeAiUnit`
  (`credits.ts:62`) is called before each model turn at `agent.ts:379`, and it is
  race-safe in the right way: the cap rides the `UPDATE`
  (`ON CONFLICT … WHERE agent_usage.used < ?`), so N simultaneous chats cannot each
  read `used < cap` and all proceed. `planImport` refuses with a 429 before planning
  (`agent.ts:241`). This is the strongest part of the whole review.
- **10/25** — alerts fire *at* the limit, not before. Paid credits warn at
  `creditBalance <= 3` (`credits.ts:89`), but the free allowance warns only at
  `remaining === 0`. **Nothing alerts the owner at all** — the probe's `alerts` list
  was empty and I confirmed by reading: the only alarm in the codebase is the D1
  65%-of-10 GB size alarm (`db_alerts`), which watches **bytes, not money**.
- **20/20** — a per-tenant cap exists and one customer cannot spend the account's
  whole AI budget. Plus real surge protection, wired and verified at
  `workers/gateway/src/index.ts:113`: 600 req/min per caller, and a second
  60 req/min ceiling on `HEAVY_PATHS` (`rate-limit.ts:56`) covering the agent,
  imports and uploads.
- **12/20** — spend is visible per team (`GET /api/data-ops/agent/usage`,
  `/usage-log`, the usage dialog, 400-day retention) but **never in money** — credits
  are a proxy unit — and **never account-wide**. There is no owner endpoint that sums
  across teams.

### Criterion 6 — scheduled work (67) · 15 + 30 + 22

One cron, one `scheduled` handler, both in tenancy (`"10 3 * * *"`). Verified there
are no others: no queue consumers, no other `crons` key in any `wrangler.jsonc`.

- **15/40** — no per-run cost is stated anywhere in the repo. It is *derivable in one
  step* because every bound is a named constant, so I derive it here:

```
checkDatabaseSizes   ceil(D/100) CF-API list calls (subrequests, not billed)     $0.00
runRetention         ≤5 statements × ≤5,000 rows = 25,000 rows/night worst case
                     × 30.4 = 760,000 rows/mo × $1/1e6                          $0.76/mo (backlog only)
recomputeShardCounts 1 aggregate, HAVING COUNT(*) > 10,000                       ~$0.00
sweepOrphanedUploads T × (1 D1-REST query + 1 R2 LIST) per night
                     R2 Class A = T × 30.4 /mo   → at T=1,000:  30,400  (free)
                                                 → at T=33,000: 1,003,200 (first paid unit)
                                                                                ---------
whole cron at T = 1,000 teams, steady state                            ≈ $0.00 – $0.76/mo
first paid unit of the cron arrives at ≈ 33,000 teams
```
- **30/30** — the frequency is justified in prose, and so is the **order**: sizing runs
  before retention "so tonight's alarm reflects tonight's real size" (`index.ts:180`).
- **22/30** — three of the four jobs exit cheaply when there is nothing to do, on
  purpose and with the reason written down: `runRetention` skips the entire per-team
  database walk unless a team rule is switched on (`sharding.ts:377`);
  `recomputeShardCounts` reads a handful of rows however many tenants exist;
  `checkDatabaseSizes` tests the threshold before issuing any query. The fourth,
  `sweepOrphanedUploads`, does full per-team work unconditionally.

### Criterion 7 — storage and egress (63) · 10 + 25 + 13 + 15

- **10/35** — no per-tenant object-storage growth estimate exists. Per-file caps do
  (25 MB learning, 2.5 MB images) and they are the input such an estimate needs.
- **25/25** — egress is understood and the design is right: R2 egress is $0.00, and
  `/media/*` is served with `Cache-Control: public, max-age=31536000, immutable`
  (`workers/gateway/src/index.ts:18`), so repeat views are edge-cache hits rather
  than billed Class B operations.
- **13/20** — **I checked my own suspicion here and it was wrong, so I am retracting
  it.** I expected orphaned profile photos and team logos. They cannot exist: both use
  **stable keys** — `users/<id>` (`auth/src/lib/profile.ts:38`) and `teams/<id>`
  (`tenancy/src/lib/teams.ts:199`) — so a replacement overwrites the same object, and
  the `?v=<timestamp>` suffix is there precisely to bust the cache. The sweep exists
  in exactly the one bucket where orphans *are* possible (`LEARNING_MEDIA`, whose keys
  are `<teamId>/<fresh-ulid>`). That is deliberate and correct. The 7 points lost are
  for the R2 `list` limit defect described under Findings.
- **15/20** — `shared/workers/retention.ts` is genuinely good: per-table windows, env
  overrides, batched deletes, a written reason for every rule, and an explicit
  separation of "exhaust" from "records". The deduction is only that the two audit
  tables sit at `KEEP_FOREVER` by default — including `activity`, which that same file
  names as "the fastest-growing table in any team database". That is a defensible
  owner decision, not a bug, but it does mean the default is unbounded growth.

### Criterion 8 — retries and failures (75) · 40 + 30 + 5

- **40/40** — the probe found **zero** retry sites and I confirmed by reading: there is
  no retry loop anywhere in any worker. A failed model call becomes a friendly saved
  message, a failed email is swallowed, a failed publish is swallowed. Nothing can
  retry a billed operation, because nothing retries at all.
- **30/30** — and `withIdempotency` (`tenancy/src/index.ts:159`) makes a *client* retry
  replay a stored outcome instead of redoing the work.
- **5/30** — the failure path is the one place the meter is deliberately switched off.
  `failureWrapUp` is an unmetered 13th Claude call and `refundIfNothingDone` returns
  the credits the other twelve consumed. Honest to the user, invisible on the bill.

### Criterion 9 — sourced prices (100) · 50 + 30 + 20

8 of 8 billing surfaces priced from a real vendor source, each carrying its URL and
the date it was read, each with its free-tier boundary stated so the first paid unit
is identifiable. **Zero surfaces on the $1.00 placeholder.**

### Criterion 10 — written down and dated (30) · 15 + 15 + 0

- **15/50** — before this run there was **no dollar figure in any of the 38 markdown
  files** and no `COSTS.md`. `MCP.md` §4 carries a genuinely useful *qualitative*
  cost model (which tools draw AI quota, which are free endpoint hits) but no price.
- **15/30** — this file is dated and attributed; `MCP.md` §4 is neither.
- **0/20** — nothing tracks vendor price changes. Anthropic's page, read today, says
  the Sonnet 5 $2/$10 introductory rate has become standard and the scheduled
  1 September 2026 rise to $3/$15 **will not happen**. Nothing in this repo would
  have known either way.

---

## Findings

### 1 · HIGH — one help-ticket reply can email every member of the team
`workers/content/src/routes/help.ts:191-194` → `workers/content/src/lib/notify.ts:106`

**What fires it:** any member with `help:read` — the lowest bar in the app — posting
one reply.
**What one firing does today:** `taggedUserIds` arrives from the request body,
is filtered for strings, and is **never length-capped**. `notifyReplyAndMentions`
then does `Promise.all` over the recipient set, one Resend email each, with no
`slice`, no `MAX_`, no cap. The set is intersected with active members of that team
(`lookupUsers` joins `team_members`), so it cannot escape the tenant — but it scales
with **team size**, not with the change. On a 200-member team, one reply is 200
emails. `/api/content/help/reply` is **not** in `HEAVY_PATHS` (`rate-limit.ts:56`),
so it meets only the 600/min general ceiling.
**Why it matters:** Resend's free tier is 3,000/month and 100/day; past that it is
$0.46–0.90 per 1,000 and a Pro plan. It is also a reputational surface — the account's
own sending domain.
**What it should have done:** cap the array at the boundary using the seam that is
**already imported into this very file** at line 13 — `requireIdList`
(`shared/workers/bulk.ts`, cap 512). Read `shared/workers/bulk.ts:25` before
applying it: `requireIdList` **throws on an empty array**, and an empty
`taggedUserIds` is the ordinary case, so a naive swap would 400 every normal reply.
The fix is `body.taggedUserIds ? requireIdList(body.taggedUserIds) : []`, or a new
`optionalIdList` export beside it.

### 2 · MEDIUM — the nightly orphan sweep does per-team work for teams that changed nothing
`workers/tenancy/src/lib/sharding.ts:415-459`

**What fires it:** the cron, `10 3 * * *`.
**What one firing does today:** `SELECT id, database_id FROM teams WHERE db_status='ready'`
(line 425) — **no `LIMIT`, no cursor** — then, for **every** team, one D1-REST query
and one R2 `ListObjects` (Class A), whether or not that team has ever uploaded a
file. The per-team work is capped (`ORPHAN_SCAN_CAP`), the team count is not.
**Why it matters:** R2 Class A at T × 30.4/month crosses the free 1M allowance at
≈33,000 teams, and each night's run costs T subrequests against a 10,000-per-invocation
ceiling — so at ~10,000 teams the sweep starts **failing**, and the thing meant to
bound R2 storage stops running while storage keeps growing.
**What it should have done:** sweep only teams whose uploads or learning rows changed
since the last pass. That is a Tier 3 change (it alters a trigger from full
reprocessing to incremental) and needs a `last_swept_at` column.

### 3 · MEDIUM — the orphan sweep asks R2 for 10,000 objects and R2 gives it 1,000
`workers/tenancy/src/lib/sharding.ts:448`, with `ORPHAN_SCAN_CAP = 10_000` at line 409

`env.LEARNING_MEDIA.list({ prefix: …, limit: ORPHAN_SCAN_CAP })`. R2's `list` has a
**maximum `limit` of 1,000** (developers.cloudflare.com/r2/api/workers/workers-api-reference,
read 2026-08-25). There is **no cursor loop** — I checked; the only reference to
pagination in the file is a `console.warn` on `listed.truncated` at line 456. So
objects past the first 1,000 per team are never examined and never swept, for ever.
The cap is a promise the platform does not keep.

**A second, sharper edge on the same function:** the reference set is read with
`SELECT content_link FROM learning … LIMIT 10000`. A team with more than 10,000
learning rows gets a **truncated** reference set, so genuinely-referenced files can
be classified as orphans and **deleted**. That is data loss, not overspend — flagged
here because I found it, and it belongs to whoever owns correctness.

### 4 · MEDIUM — the two bulk doors publish at costs 512× apart
`workers/content/src/routes/help.ts:152` vs `:171`

`set_help_status_by_filter` issues **one** `publishChange`. `bulk_set_help_status`
issues **one per row** — `for (const id of changed) await publishChange(...)` — so a
512-id batch is 512 sequential service-binding calls and up to 512 Durable Object
requests for one user action.
**Do not "fix" this without reading CACHING.md first.** Collapsing it to one
collection-wide ping would make every connected client refetch the whole list, which
contradicts row-level live-sync (CACHING rule 3) — a **locked decision**. The honest
statement is that the two doors disagree, and that the cheaper one is the one bending
the caching law. Informational.

### 5 · MINOR — the failure path bills with the meter switched off
`workers/data-ops/src/lib/agent.ts:130` (definition), `:527` (call), `:368` (refund)

A failing turn makes a 13th Claude call to explain the refusal — deliberately
unmetered, and commented as such — and then `refundIfNothingDone` hands back the
credits the other twelve consumed. A user whose role refuses the actions they keep
asking for pays **0 credits** and costs the account up to **$0.336 per attempt**. The
fairness decision is right and well argued; the accounting gap is that the row logged
to `agent_usage_log` shows 0 and nothing anywhere records that 13 model calls happened.

### 6 · MINOR — every MCP request writes a row
`workers/mcp/src/lib/tokens.ts:96`

`verifyToken` stamps `UPDATE mcp_tokens SET last_used_at = ?` unconditionally on
**every** MCP request, including pure reads. D1 rows written is the expensive D1
metric ($1.00/M vs ~$0.001/M for reads), and it turns a read-only machine surface
into a writing one on a shared core table. It would take >50M MCP calls/month to
cost real money, so this is small — but it is the wrong shape, and a coarser stamp
(only when `last_used_at` is older than an hour) costs nothing to state.

### 7 · The single largest saving available: prompt caching is not switched on
`workers/data-ops/src/lib/model.ts:115` (`buildBody`)

`grep -rn "cache_control"` across every `.ts` in the repo returns **nothing**. The
same 6,220-token prefix — system prompt plus 31 tool schemas — is sent at full input
price on every one of up to 13 calls per reply.

```
20,000 replies/mo × 2.5 turns = 50,000 model turns

today:  50,000 × 6,220 tok × $2.00/1e6                       = $622.00 /mo
cached: 20,000 writes × 6,220 × $2.50/1e6                    = $311.00
      + 30,000 reads  × 6,220 × $0.20/1e6                    =  $37.32
                                                               --------
                                                               $348.32 /mo
saving                                                       ≈ $273.68 /mo  (≈35% of Anthropic input spend)
```
Conservative: it assumes **no** cross-reply cache hits. Replies inside one
conversation fall within the 5-minute window, so the real saving is larger.
**Not verified live** — this review has no key and no network run against the API.
Note the warning already in `model.ts:130`: `temperature`, `top_p` and `budget_tokens`
each 400 on the Sonnet-5 family. `cache_control` is a different, supported field, but
that comment is the reason to test before shipping.

### 8 · Workers Logs is a billing surface nothing in the repo names
`observability: { enabled: true }` appears in **14** worker configurations
(7 workers × 2 environments). 20M log events/month included, then $0.60/M, and an
invocation log is emitted **per worker in the chain** — so one API call that crosses
gateway → auth → tenancy → realtime produces four, not one. The codebase is unusually
disciplined about explicit logging (only **33** `console.*` call sites across all
seven workers' source, almost all on error paths), so at these volumes this is far
inside the allowance. It belongs in `INVENTORY.md` all the same: it is currently the
one surface that can bill with no binding, no secret and no mention.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1.** Cap `taggedUserIds` through the already-imported `requireIdList` seam | `workers/content/src/routes/help.ts` (1 line); `shared/workers/bulk.ts` (a new `optionalIdList`, ~4 lines); a new boundary test in `workers/content/test/` | ADDS ~5 lines + 1 test. REMOVES an unbounded per-member email fan-out | **lean_mean** — a new export and a test are new code, though it reuses an existing seam so DRY improves on net. **security_sentry** — strictly helps; this is an abuse vector today. **Trap to name loudly:** `requireIdList` throws on an empty array and an empty `taggedUserIds` is the normal case, so the naive one-line swap 400s every ordinary reply |
| **2.** Add a cursor loop to the orphan sweep's R2 `list`, and set `ORPHAN_SCAN_CAP` to a real multiple of 1,000 | `workers/tenancy/src/lib/sharding.ts` | ADDS ~6 lines and **more** R2 Class A ops per night (each 1,000-object page is another billed LIST). REMOVES silently-unswept R2 storage | **spend_review itself** — this fix costs Class A ops to save storage. The trade is overwhelming (one LIST = $0.0000045; it can free megabytes at $0.015/GB-mo) but it must be stated, not hidden. **speed_review** — a longer cron. **scaling_review** — more subrequests per invocation, closer to the 10,000 ceiling |
| **3.** Make the orphan sweep incremental (`last_swept_at`, sweep only changed teams) — **Tier 3** | `workers/tenancy/src/lib/sharding.ts`; a new core migration `db/core/00NN_*.sql` | ADDS a column, a migration, a predicate. REMOVES T× nightly work and pushes the first paid unit far beyond 33,000 teams | **architecture_review** — a new piece of state needs exactly one owner, and this one straddles tenancy and the cron. **lean_mean** — a migration plus branching is real added surface. **story_checks_out** — `INVENTORY.md`'s "Invisible moving parts" row describes today's behaviour and would go stale |
| **4.** Enable prompt caching (`cache_control` on the system block and the tools array) | `workers/data-ops/src/lib/model.ts`; a unit test on `buildBody` | ADDS ~2 lines + 1 test. REMOVES ≈$274/month, ≈35% of Anthropic input spend | **speed_review — helps** (cache reads return faster). **lean_mean** — negligible. **story_checks_out** — the long comment block at `model.ts:120-135` explains exactly which fields are safe on this model family and would contradict itself unless updated in the same commit. Needs a live verification run this review could not perform |
| **5.** Write a dated `COSTS.md` carrying these three per-action figures | new `COSTS.md`; a link in `README.md`'s doc map | ADDS one document. REMOVES nothing | **story_checks_out_review** — a new doc is a new thing that goes stale, and it can contradict `MCP.md` §4's qualitative cost model; that review scores "stale claims" and "cross-doc contradictions" directly. Mitigate by dating it, citing every source, and stating a re-read cadence. **mac_fell_in_the_ocean — helps.** **lean_mean** — neutral to positive |
| **6.** Count the failure path: record the wrap-up call on the existing `agent_usage_log` row (a `wrapUpCalls` field, `credits` still 0) | `workers/data-ops/src/lib/agent.ts`; `workers/data-ops/src/lib/credits.ts` | ADDS a counted field on a row that is already written. REMOVES a blind spot. Deliberately does **not** charge the user | **activity_log_review — helps.** **spend_review itself** — nil: the row is written either way, so no extra D1 write. **lean_mean** — a few lines. Chosen over "log a new row" precisely to avoid adding a write |
| **7.** Add an owner-facing account-wide spend view and a pre-limit alert — **Tier 2** | a new admin route in `workers/data-ops/src/routes/admin.ts`; a core aggregate query; a screen | ADDS a route, a gate, a query and a screen. REMOVES the "find out from the vendor dashboard" failure both founding incidents ended in | **lean_mean — the real cost here.** **security_sentry** — a new admin door is new attack surface and must be `ADMIN_KEY`-gated. **Named explicitly because it looks like a one-file change and is not:** Law **R20** means a new top-level section needs a page source, a `MODULE_SHELLS` entry in the gateway and a `TOP_LEVEL_MODULES` entry — three registries in three workspaces — and Law **R16** means any collection it shows needs an exact count through `formatCount`. Consider an API-only endpoint plus the `cloudflare_usage` skill instead, which costs no laws |
| **8.** Lower `AGENT_FREE_DAILY` from 50 — **Tier 3, a business decision** | `workers/data-ops/wrangler.jsonc` (one var, both envs) | ADDS nothing. REMOVES entitlement cost linearly: 50 → 25 halves $24.84 to $12.42 per team per month | **none — it is one number in one place and the seam is already right** (`numberVar` honours a deliberate 0, and the var is per-environment). It is purely a product call about what the free tier is worth, not a technical change, and no review is affected either way |
| **9.** Add Workers Logs to `INVENTORY.md`'s services table | `INVENTORY.md` (one row) | ADDS one table row. REMOVES the last unlisted billing surface | **none — a one-row addition to an existing table, in the same shape as the eight rows already there** |
| **10.** Coarsen the MCP `last_used_at` stamp (write only when older than an hour) | `workers/mcp/src/lib/tokens.ts` | ADDS a predicate. REMOVES one D1 row written per MCP request | **security_sentry / activity_log_review** — `last_used_at` becomes accurate to the hour rather than the request, which slightly weakens token-abuse forensics. Real tension: precision of the audit trail versus write volume. At current volumes the write cost is negligible, so **this one may honestly not be worth doing** |

---

## CEILING

**Yes — 95 is reachable by changing code. The true maximum is ≈96.**

Best achievable per criterion, and what caps each:

| # | Today | Achievable | What caps it |
|---|---|---|---|
| 1 | 68 | **90** | −7 is locked: the per-row bulk publish (Finding 4) is the *correct* behaviour under CACHING rule 3, a locked decision in `CACHING.md`. −3 is a deliberate product choice (never charge a user for refused work) |
| 2 | 78 | 100 | fully fixable |
| 3 | 86 | 100 | fully fixable (one `INVENTORY.md` row) |
| 4 | 92 | **92** | **capped by something no commit can fix** — the missing 8 points are the per-tenant *actual* monthly figure, which needs live `agent_usage_log` data, not code |
| 5 | 77 | 100 | fixable, but Fix 7 costs three registries under Law R20 |
| 6 | 67 | 100 | fully fixable |
| 7 | 63 | **85** | −15 is an owner decision: `KEEP_FOREVER` on the two audit tables is written into `retention.ts` as a deliberate refusal to delete someone's history by default |
| 8 | 75 | 100 | fixable — the failure path can be *counted* without being *charged* |
| 9 | 100 | 100 | already there |
| 10 | 30 | 100 | fully fixable |

```
90×15 + 100×14 + 100×13 + 92×13 + 100×12 + 100×9 + 85×8 + 100×6 + 100×6 + 100×4
= 1350 + 1400 + 1300 + 1196 + 1200 + 900 + 680 + 600 + 600 + 400 = 9626
9626 / 100 = 96.26  →  96
```

So 95 clears with two points to spare, but only because criterion 9 is already
perfect. Three things a commit genuinely cannot move: **criterion 4's last 8 points**
(needs the live database, not code), **criterion 1's bulk-publish deduction** (locked
by CACHING rule 3 — proposing it as a fix would be proposing to break a law, which is
why it is written up as informational, not as a fix), and **criterion 7's retention
deduction** (the owner's call on audit-history retention, not an engineering defect).

---

## Verdict

**The most expensive single action in Brimba is one 12-step agent reply, at
$0.3359 — 92% of it Anthropic Sonnet 5 input tokens at $2.00/MTok, read from
platform.claude.com/docs/en/about-claude/pricing on 2026-08-25 — and 48% of that
run is the same 6,220-token system-and-tools prefix, measured off the compiled
source, paid thirteen times over because prompt caching is not switched on.**

Cloudflare is not the bill. At the owner's standing volumes every Cloudflare meter
sits deep inside the $5 plan's included allowances, and the seven-worker shape costs
nothing extra because service-binding hops are not billed as requests. The money is
Anthropic, the meter that governs it is well built and gates before the spend rather
than after — and the number it is set to, `AGENT_FREE_DAILY = 50`, quietly hands
every team **$24.84 a month of inference for free, for ever, with no account-wide
ceiling anywhere in the code**.

**Surfaces on placeholder prices: 0 of 8.** Monthly totals for the agent are a range
($278–$6,718), not a figure, because no measured turn-count distribution exists —
marked **unmeasured** rather than guessed.
