# Spend review — Brimba · 2026-08-25 · ROUND 2
SCORE: 79/100   (previous: 76/100)

Read-only. Nothing in this repository was changed except this file. No live billing
access: every figure below is a **rate** applied to **units counted from the code**,
never a reading from an invoice. Volumes are the owner's standing estimate, labelled as
such everywhere they appear. Anything needing the live account is marked **unmeasured**.

**Zero surfaces on the $1.00 placeholder.** Every price was re-read at run time today.

---

## DELTA

Round 1: 76/100 → Round 2: **79/100**

| # | Criterion | R1 | R2 | Why it moved |
|---|---|---:|---:|---|
| 1 | Work is proportional to the trigger | 68 | **76** | **UP 8.** The ticket-mention fan-out drops HIGH → MEDIUM (−15 → −7): `optionalIdList` now caps the list at 512, and `security_sentry` was right that the harm ceiling was lower than I framed it. The other three penalties stand unchanged. |
| 2 | Nothing bills in an uncapped loop | 78 | **86** | **UP 8.** Same cause: the `Promise.all` email fan-out now has a number in the code. HIGH → MEDIUM (−15 → −7) — 512 is still far larger than any real case. The unbounded per-team R2 loop still costs −7. |
| 3 | Every paid call is inventoried | 86 | **86** | Unchanged. `INVENTORY.md` untouched; Workers Logs still absent (`grep -c -i "workers logs\|observability" INVENTORY.md` = **0**); the nightly R2 `ListObjects` still unlisted. |
| 4 | Cost per user action is computed | 92 | **92** | Unchanged. Three actions still costed here rather than in the project; the per-tenant *actual* still needs `agent_usage_log`, still unmeasured. |
| 5 | Something watches the meter | 77 | **77** | Unchanged. `credits.ts` and `agent.ts` are not in the repair diff. Still no account-wide ceiling — re-verified: every quota read is `WHERE team_id = ?`, there is no `SUM(used)` anywhere. |
| 6 | Scheduled work is priced | 67 | **67** | Unchanged score, **worse underlying fact** — the cron's per-team cost went up (finding 3) while still being stated nowhere. |
| 7 | Storage and egress are priced | 63 | **66** | **UP 3.** Half of round 1's finding 3 is genuinely fixed: the orphan sweep's reference set is now keyset-paged and fail-closed, so referenced attachments above a cap can no longer be deleted. The R2 `list`-limit half stands. |
| 8 | Retries and failures are priced | 75 | **75** | Unchanged. Re-verified: still zero retry sites, and the new `forwardToDoor` seam documents "Deliberately NO timeout here" and adds no retry. |
| 9 | Each surface has a sourced price | 100 | **100** | Unchanged, and re-earned: I re-fetched the Anthropic pricing page live today rather than carrying round 1's numbers forward. 8 of 8 surfaces sourced and dated. |
| 10 | The numbers are written down and dated | 30 | **30** | Unchanged. Still no `COSTS.md`; the only dollar figure in any project document is the `$5/mo` plan price at `INVENTORY.md:14`. Round 2 supplies a sharp new argument for why this costs money — see finding 6. |

**No criterion went down.** Two went up, both from the same repair, and one of those repairs
was prompted by this review's own finding being **partly wrong** — which is worth saying
plainly rather than burying.

**What the other reviewers' repairs cost this one: essentially nothing, and I checked
rather than assumed.**

- The import repair (`import.ts`, `import-batch.ts`) swaps a hand-rolled `fetcher.fetch`
  for `forwardToDoor`. Read line by line: **one service-binding call becomes one
  service-binding call**, plus two headers. Service-binding calls are not billed as extra
  Workers requests. **Zero spend impact.**
- `addReply` now writes an activity row (activity-log review). That is **one extra D1 row
  write per help reply**, at $1.00 per million rows written: **$0.000001 per reply**.
  Real, named, and four orders of magnitude below anything that matters.
- The orphan-sweep repair genuinely **raises** the cron's cost — see finding 3. It is the
  one place where a correctness fix bought safety with money, and it was the right trade.

---

## Prices — re-read live today, not carried forward

Read at run time on **2026-08-25**. Every figure carries its source.

| Surface | Included | Rate beyond | Source |
|---|---|---|---|
| Claude Sonnet 5 input | — | **$2.00 / MTok** | platform.claude.com/docs/en/about-claude/pricing, fetched 2026-08-25 |
| Claude Sonnet 5 output | — | **$10.00 / MTok** | same |
| Sonnet 5 5-minute cache write | — | **$2.50 / MTok** (1.25× base) | same |
| Sonnet 5 cache read (hit) | — | **$0.20 / MTok** (0.1× base) | same |
| Sonnet 5 tool-use system prompt, `tool_choice: auto` | — | **354 tokens** | same, tool-use pricing table |
| Tokenizer | — | Sonnet 5 uses the newer tokenizer: **~30% more tokens for the same text** | same, tokenizer note |
| Token ≈ chars | — | **1 token ≈ 4 characters** | same, FAQ |
| Workers AI (llama-4-scout) | 10,000 Neurons/day | $0.011 / 1,000 Neurons | developers.cloudflare.com/workers-ai/platform/pricing (round 1, 2026-08-25) |
| Resend | 3,000/mo (100/day) free | Pro $20/mo → 50,000; overage $0.46–0.90 / 1,000 | resend.com/pricing (round 1, 2026-08-25) |
| Workers requests | 10,000,000/mo | $0.30 / 1M | `~/.claude/skills/cloudflare_usage/references/pricing.md` (dated 2026-07) |
| D1 rows written | 50,000,000 | **$1.00 / 1M** | same |
| R2 Class A (incl. `ListObjects`) | 1,000,000 | **$4.50 / 1M** | developers.cloudflare.com/r2/pricing (round 1, 2026-08-25) |
| R2 egress | unlimited | **$0.00** | same |
| Durable Object requests | 1,000,000 | $0.15 / 1M | cloudflare_usage pricing.md |
| Workers Logs (`observability: enabled`) | 20,000,000 events/mo | **$0.60 / 1M** | developers.cloudflare.com/workers/observability/logs/workers-logs (round 1) |

### A price disagreement I had to adjudicate, and it matters

Round 1 recorded that the Sonnet 5 `$2/$10` introductory rate had become standard and the
scheduled 1 September 2026 rise to `$3/$15` would not happen. The bundled `claude-api`
skill reference — cached **2026-06-24** — says the opposite: *"$3.00 ($2.00 intro through
2026-08-31)"*.

Today is **2026-08-25**. If the cached reference were right, every Anthropic figure in this
report would rise **50%** in six days.

I fetched the live page rather than pick a side. `platform.claude.com/docs/en/about-claude/pricing`,
read 2026-08-25, carries an explicit note: the $2/$10 pricing *"announced at launch as
introductory pricing through August 31, 2026, is now the standard price. The previously
scheduled increase to $3/$15 … on September 1, 2026 will not occur."*

**Round 1 was right and the cached reference is stale.** Recorded here because it is a
perfect demonstration of criterion 10's 20-point row: this project has no file that tracks
a vendor price change, and a 50% swing in its largest bill line was, for six days, a
question only a live fetch could answer.

---

## The two figures the campaign asked me to confirm

Both re-derived from scratch, not carried forward. The prefix was **re-measured** rather
than reused: I bundled the real `SYSTEM` array and `TOOL_CATALOG` with the repository's own
esbuild and printed the runtime string lengths.

| Thing | Round 1 | Round 2 (re-measured) |
|---|---|---|
| `SYSTEM` prompt chars | 7,915 | **7,915** |
| Tool count | 31 | **31** |
| Tool wire JSON chars | 10,132 | **10,100** |
| Fixed prefix chars | 18,047 | **18,015** |
| **Fixed input tokens per model turn** | **6,220** | **6,209** |

`18,015 ÷ 4 × 1.30 + 354 = 6,209`. A 0.2% difference, from a slightly different wire-JSON
serialisation. **The round-1 measurement is confirmed.**

None of the inputs moved: `git diff 081595d..HEAD` does not touch `agent.ts`, `model.ts`,
`credits.ts`, `tools.ts`, `app-brief.ts` or `shared/workers/tool-catalog.ts`. `MAX_STEPS`
is still 12, `MAX_HISTORY` still 24, `fence()` still slices at 2,000 chars,
`AGENT_MODEL` is still `claude-sonnet-5` in **both** production and staging, and
`grep -rn "cache_control"` across every `.ts` still returns **0**.

### 1 · Prompt caching — the ~$274/month saving · CONFIRMED at $273.20

Per-step context growth, derived from the code rather than assumed: `fence()` caps a tool
result at 2,000 chars, plus the 17-char `"OK. Result data: "` prefix, plus ~300 chars of
assistant `tool_use` block (**this 300 is the one estimate in the arithmetic**) =
2,317 chars ⇒ 579 tokens × 1.30 ≈ **750 tokens per completed step**.

```
20,000 replies/mo × 2.5 turns = 50,000 model turns
  (20,000 is the owner's standing estimate of 24 Aug 2026 — an estimate, not a
   measurement; 2.5 turns is an assumption. The real distribution lives in
   `agent_usage_log`, which this review cannot reach. UNMEASURED.)

today, no caching — the fixed prefix alone:
  50,000 × 6,209 = 310,450,000 tok × $2.00 / 1,000,000        = $620.90 /mo

with caching — one write per reply, the rest reads:
  writes  20,000 × 6,209 = 124,180,000 tok × $2.50 / 1,000,000 = $310.45
  reads   30,000 × 6,209 = 186,270,000 tok × $0.20 / 1,000,000 =  $37.25
                                                                 --------
                                                                 $347.70 /mo

saving = $620.90 − $347.70                                     = $273.20 /mo
```

Round 1 said **$273.68**. Round 2 says **$273.20**. **Confirmed to within 48 cents (0.2%),
and the gap is entirely the 11-token prefix remeasure.**

As a share of Anthropic input spend, with the per-step growth included:
`20,000 × (6,209 + 6,959 + 0.5 × 7,709) = 340,450,000 tok × $2/1e6 = $680.90/mo` total
input ⇒ the saving is **40%** of all Anthropic input spend, or **44%** of the fixed-prefix
component. (Round 1 said 35%; the difference is the turn model used, not the saving.)

**Still conservative**: it assumes zero cross-reply cache hits. Replies inside one
conversation fall inside the 5-minute window, so the real saving is larger.
**Still not verified live** — this review has no key and made no API call.

### 2 · `AGENT_FREE_DAILY = 50` — the free entitlement · CONFIRMED at $24.20

`AGENT_FREE_DAILY: "50"` at `workers/data-ops/wrangler.jsonc:37` (production) and `:67`
(staging). The code default is 25. One credit = one model turn.

```
one metered turn, mid-conversation (a 3-turn mean):
  input   6,209 (fixed prefix) + 750 (one accumulated step) = 6,959 tok
          6,959 × $2.00 / 1,000,000                          = $0.0139180
  output    200 tok × $10.00 / 1,000,000                     = $0.0020000
                                                               -----------
  per metered turn                                             $0.0159180

50 credits/day × 30.4 days = 1,520 turns/team/month
  1,520 × $0.0159180                                         = $24.20 /team/mo
```

Round 1 said **$24.84**. Round 2 says **$24.20** — a **−2.6% correction**, and I owe an
explanation for it rather than a shrug: round 1 derived 750 tokens of per-step growth and
then used **950** in its shape arithmetic. The 750 is the one the code supports. The
headline is unchanged: **every team is handed roughly $24 a month of Anthropic inference,
free, for ever.**

**And there is still no account-wide ceiling.** Re-verified by reading `credits.ts`
end to end: `getQuota` reads `agent_usage WHERE team_id = ?` and `agent_credits WHERE
team_id = ?`; `consumeAiUnit` claims the slot with `ON CONFLICT … WHERE agent_usage.used <
cap`, again per team. There is no `SUM`, no global counter, no owner-level cap anywhere in
the codebase.

```
at 1,000 signups/month (owner's standing estimate), if one team in ten uses its
full allowance:   100 × $24.20                                = $2,420 /month
```

against a **$5/month** Cloudflare plan. And a turn whose actions were all refused is
refunded to zero by `refundIfNothingDone` — the user pays nothing, the account pays in full.

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned
total    = round( Σ (criterion × weight) / 100 )
```

| # | Criterion | Method | Score | Weight | × |
|---|---|---|---|---|---|
| 1 | Work proportional to the trigger | defect | **76** | 15 | 1140 |
| 2 | Nothing bills in an uncapped loop | defect | **86** | 14 | 1204 |
| 3 | Every paid call is inventoried | coverage | **86** | 13 | 1118 |
| 4 | Cost per user action is computed | coverage | **92** | 13 | 1196 |
| 5 | Something watches the meter | coverage | **77** | 12 | 924 |
| 6 | Scheduled work is priced | coverage | **67** | 9 | 603 |
| 7 | Storage and egress are priced | coverage | **66** | 8 | 528 |
| 8 | Retries and failures are priced | coverage | **75** | 6 | 450 |
| 9 | Each surface has a sourced price | coverage | **100** | 6 | 600 |
| 10 | The numbers are written down and dated | coverage | **30** | 4 | 120 |
| | | | | **100** | **7883** |

**7883 / 100 = 78.83 → SCORE 79.**
Gate: criterion 1 = 76, well above 40, so **no cap applied**. Uncapped = capped = **79**.

### Criterion 1 — proportionality (76) · 100 − (7 + 7 + 7 + 3)

The probe still reports **zero** amplifiers, and the rubric still says a zero is not a pass
on a codebase with scheduled work, so I re-opened the nightly chain by hand.

| hit | R1 | R2 | why |
|---|---|---|---|
| `notifyReplyAndMentions`, `notify.ts:106` | HIGH −15 | **MEDIUM −7** | capped in code at 512, bounded in practice at ~100 by a platform limit (finding 1) |
| `sweepOrphanedUploads` team loop, `sharding.ts:426` | MEDIUM −7 | **MEDIUM −7** | unchanged shape, higher per-team cost (finding 3) |
| per-row publish on the bulk door, `help.ts:172` | MEDIUM −7 | **MEDIUM −7** | unchanged |
| unmetered failure wrap-up, `agent.ts:130` | MINOR −3 | **MINOR −3** | unchanged |

### Criterion 2 — uncapped billed loops (86) · 100 − (7 + 7)

Billed loops that now carry a **number in the code**: **10 of 11** (was 9 of 11). The one
that gained a cap is the mention fan-out. The one still without: the per-team R2
`list`/`delete` inside `SELECT … FROM teams` with no `LIMIT` and no cursor.

Existing caps re-verified: bulk ids **512** (`BULK_IDS_LIMIT`, computed as
`(8192 − 512) / 15 = 512` from `AGENT_MAX_TOKENS`, not hand-picked), import parcels ≤2,000,
agent steps 12, replayed history 24, tool results 2,000 chars, realtime fan-out 32,
retention 5,000/night, module mover 250/batch, uploads 25 MB / 2.5 MB. This remains a
well-capped codebase.

### Criterion 7 — storage and egress (66) · 10 + 25 + **16** + 15

The third row moves 13 → **16**. Round 1 docked 7 points for a two-part defect in
`sweepOrphanedUploads`. The sharper half — a `LIMIT 10000` on the reference read, so a team
with more than 10,000 learning rows could have **genuinely-referenced files classified as
orphans and deleted** — is now properly fixed: the read is keyset-paged
(`ORDER BY id LIMIT 1000` with an `id >` cursor) and **fail-closed** (`catch { continue }`,
and a `throw` past `ORPHAN_SCAN_CAP` rather than a silent truncation). That is a real data
-loss path closed. The R2 `list`-limit half stands (finding 4), so 4 of the 7 points come
back, not all 7.

---

## Findings

### 1 · MEDIUM (was HIGH) — the ticket-mention fan-out: capped, correctly re-scoped, and one window still open

`workers/content/src/routes/help.ts:196` · `workers/content/src/lib/notify.ts:28-46,95-125`

**The fix landed.** `const tagged = optionalIdList(body.taggedUserIds).filter((x) => x !==
actor.id)` — `optionalIdList` (`shared/workers/bulk.ts:50`) returns `[]` for
absent/null/empty and otherwise delegates to `requireIdList`, which caps at
`BULK_IDS_LIMIT` = **512** and throws a clean 400 past it. That is exactly the shape round 1
recommended, including the empty-array trap it warned about.

**`security_sentry` corrected me and it was right on the substance.** I re-verified the
mechanism from the code rather than accepting the correction:

- `lookupUsers` (`notify.ts:38-45`) joins `team_members` with
  `tm.deactivated_at IS NULL`, and the `Promise.all` at `:105` sends only where
  `u?.email` resolved. **Mail can only reach an active member of that team**, once each. It
  was never an arbitrary-recipient blast, and my round-1 body said so — but my headline
  ("can email every member of the team") pushed harder than the mechanism supports.
- **And my worst-case number was arithmetically impossible.** D1 caps a query at **100
  bound parameters**; `lookupUsers` builds one placeholder per unique id. So 101+ tagged ids
  makes the lookup *throw*, the outer `try/catch` at `notify.ts:95` swallows it, and **zero**
  emails are sent. My round-1 example — "on a 200-member team, one reply is 200 emails" —
  cannot happen. The real ceiling is **~100 emails plus the raiser**.

**What is still open, and the fix did not close it.** `security_sentry`'s recommendation had
two halves; only the first was applied. Between **101 and 512** tagged ids, the request is
now accepted by the cap, then killed by the parameter limit inside the swallowing catch —
so **every notification on that reply is silently dropped, including the raiser's
"someone replied to you" email.** Verified: `grep` for chunking across both `lookupUsers`
implementations (`notify.ts:36`, `stakeholders.ts:73`) returns **nothing**; neither chunks.

**Cost, re-stated honestly.** ≤100 Resend emails from one reply by any `help:read` holder,
on a door correctly outside `HEAVY_PATHS` (it is cheap) but covered only by the 600/min
per-caller ceiling. At the Resend Pro overage of $0.46–0.90 per 1,000, 100 emails is
**$0.046–$0.090** per reply — real, bounded, and no longer a HIGH.

**Fix.** Chunk the `IN` list at 90 in both `lookupUsers` implementations. That closes the
suppression window and makes the 512 cap mean what it says.

### 2 · MEDIUM — the nightly sweep still walks every team, unconditionally

`workers/tenancy/src/lib/sharding.ts:426`

```sql
SELECT id, database_id FROM teams WHERE db_status = 'ready' AND database_id IS NOT NULL
```

No `LIMIT`, no cursor — unchanged from round 1. For **every** team, whether or not it has
ever uploaded a file, the cron does at least one D1-REST query and one R2 `ListObjects`
(Class A). The per-team work is capped; the team count is not.

R2 Class A at T × 30.4/month crosses the free 1M allowance at **≈33,000 teams**
(`1,000,000 ÷ 30.4 = 32,895`). And each night's run costs subrequests against a
**10,000-per-invocation** ceiling — so the thing meant to bound R2 storage stops running
while storage keeps growing. **Tier 3**: sweeping only teams whose uploads changed since
the last pass alters a trigger from full to incremental and needs a `last_swept_at` column.

### 3 · MEDIUM · NEW — the correctness fix made the cron more expensive per team, and nothing prices it

The repair to round 1's finding 3 replaced one `SELECT … LIMIT 10000` with a keyset-paged
loop at `ORPHAN_PAGE = 1_000`. That was the right call — it closed a data-loss path — and it
has a bill attached that nobody has written down.

```
per team, per night:
  before:  1 D1-REST query                    + 1 R2 LIST
  after:   ceil(L / 1000) D1-REST queries     + 1 R2 LIST
           where L = that team's learning rows with a /media/learning/ link

subrequests per invocation, at T teams averaging L attachments:
  before:  2T
  after:   T × (1 + ceil(L/1000)) + T

the 10,000-subrequest ceiling is reached at:
  L ≤ 1,000  →  T ≈ 3,333   (was ≈ 5,000)
  L = 3,000  →  T ≈ 2,000
```

**Why it matters.** The invocation ceiling is now reached at roughly **two-thirds** the team
count it was before, and sooner still for content-heavy tenants — and criterion 6's 40-point
row is still 15/40 because the cron's per-run cost is stated nowhere in the repository. A
job whose cost model just changed and is written down nowhere is the exact condition this
review exists to flag.

**Fix.** State the cron's per-run cost in a `COSTS.md` with this arithmetic, and pair it
with finding 2 — incremental sweeping fixes both the team-count and the per-team growth in
one change.

### 4 · MEDIUM — the sweep still asks R2 for 10,000 objects and R2 gives it 1,000

`workers/tenancy/src/lib/sharding.ts:470`, with `ORPHAN_SCAN_CAP = 10_000` at `:409`

```js
const listed = await env.LEARNING_MEDIA.list({ prefix: `${team.id}/`, limit: ORPHAN_SCAN_CAP })
```

R2's `list` has a documented maximum `limit` of **1,000**. There is still **no cursor loop**
on the R2 side — the only nod to pagination is a `console.warn` on `listed.truncated` at
`:475`, whose text now reads *"the rest wait for tomorrow"*. **They do not.** Without a
cursor, tomorrow's run lists the same first ≤1,000 keys in the same key order. Orphans
beyond a wall of referenced keys are never reached, ever.

The reference-set side of this function is now exemplary — paged, cursored, fail-closed,
with a written explanation. The object side has none of it, and the comment added in the
same commit asserts a drain that the code does not implement.

**Fix.** Give the R2 side the cursor loop the D1 side just got (`list({ cursor })` until
`!truncated`), or correct the comment to say what actually happens.

### 5 · MINOR — the failure path still bills with the meter switched off

`workers/data-ops/src/lib/agent.ts:130` (definition), `:527` (call), `:368` (refund).
Unchanged — `agent.ts` is not in the repair diff. A failing turn makes an unmetered 13th
Claude call to explain the refusal, and `refundIfNothingDone` returns the credits the other
twelve consumed. A user whose role refuses the actions they keep asking for pays **0
credits** and costs the account up to **$0.335** per attempt. The fairness decision is right
and well argued; the accounting gap is that `agent_usage_log` records 0 and nothing anywhere
records that 13 model calls happened.

### 6 · MINOR — nothing tracks a vendor price change, and this round proved what that costs

Criterion 10's 20-point row is still 0. There is no `COSTS.md`, and the only dollar figure
in any project document is `$5/mo` at `INVENTORY.md:14` — a plan price, not a per-action
cost.

Round 2 supplies the concrete argument round 1 could only assert. Two references disagreed
about Sonnet 5's rate today: one said $2/$10 standard, the other said $2/$10 expires in six
days and reverts to $3/$15. **The difference is 50% of this project's largest bill line**,
and nothing in the repository could have told an operator which was current. (The live page
settles it: $2/$10 is standard, the increase will not occur.)

**Fix.** A dated `COSTS.md` carrying the three costed actions, the entitlement figure, the
cron's per-run cost, and a "prices last checked" line per vendor. It is the cheapest fix in
this report and it is what makes the next run cost twenty minutes instead of two hours.

### 7 · The single largest saving available: prompt caching is still not switched on

`workers/data-ops/src/lib/model.ts:115` (`buildBody`). `grep -rn "cache_control"` across
every `.ts` in the repository returns **0**. The same 6,209-token prefix — system prompt
plus 31 tool schemas — is sent at full input price on every one of up to 13 calls per reply.

**$273.20/month** at the standing volume estimate, arithmetic above, and the estimate is
conservative because it assumes no cross-reply cache hits.

Note the warning already in the code at `model.ts:130`: `temperature`, `top_p` and
`budget_tokens` each return a 400 on the Sonnet-5 family. `cache_control` is a different,
supported field — the live pricing page documents both automatic top-level caching and
explicit per-block breakpoints for this model — but that comment is exactly the reason to
verify with one live call before shipping.

### 8 · Workers Logs is still a billing surface nothing in the repository names

`observability: { enabled: true }` in **14** worker configurations (7 workers × 2
environments). 20M events/month included, then $0.60/M, and an invocation log is emitted
per worker in the chain. At these volumes it is deep inside the allowance. It belongs in
`INVENTORY.md` all the same: it is the one surface that bills with no binding, no secret
and no mention.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1 · Enable prompt caching** (`cache_control` on the system block and the tools array) | `workers/data-ops/src/lib/model.ts`; a unit test on `buildBody` | ADDS ~2 lines + 1 test. REMOVES **≈$273/month**, 40% of Anthropic input spend | **speed_review — helps** (cache reads are faster). **lean_mean_review** — negligible. **story_checks_out_review** — the comment block at `model.ts:120-135` explains which fields are safe on this model family and would contradict itself unless updated in the same commit. Needs one live verification call this review could not make. |
| **2 · Chunk the `IN` list at 90 in both `lookupUsers`** | `workers/content/src/lib/notify.ts`, `workers/content/src/lib/stakeholders.ts` | ADDS ~8 lines; REMOVES the 101–512 silent-suppression window | **spend — slightly negative and worth naming**: chunking turns one refused query into up to 6 executed ones, so a 512-mention reply becomes 6 D1 queries and up to ~500 emails instead of 0. That is *correct* behaviour and a real cost increase. Consider lowering the mention cap below `BULK_IDS_LIMIT` at the same time — 512 @mentions on one reply is not a real case. **error_log_review — helps** (a swallowed throw disappears). |
| 3 · Cursor loop on the R2 side of the sweep | `workers/tenancy/src/lib/sharding.ts` | ADDS ~6 lines; REMOVES an untrue comment | **spend — negative, deliberately**: a full cursor walk raises R2 Class A operations from 1 per team-night to `ceil(objects/1000)`, moving the 33,000-team free-tier crossing closer. **scaling_review** — same tension from the other side. Pair it with fix 4 so the sweep runs on fewer teams, not more objects. |
| 4 · Sweep only teams whose uploads changed (`last_swept_at`) | `workers/tenancy/src/lib/sharding.ts`, one team-schema migration | REMOVES per-team work for unchanged tenants; ADDS a column + a migration | **base_fork_review** — a new team-schema migration means every existing fork must run `migrate-teams`; their §5 documents the procedure but it is a real fork cost. **architecture_review** — the sweep gains a dependency on write timestamps it did not have. Tier 3: it changes a trigger from full to incremental and is the owner's call. |
| 5 · Lower the mention cap below `BULK_IDS_LIMIT` | `shared/workers/bulk.ts` or `help.ts` | REPLACES 512 with a real number (e.g. 25) | **interfacelessness_review** — if the agent/MCP reply tool declares `BULK_IDS_LIMIT`, a different cap on this door must be declared too or R19's filter/limit parity drifts. Ask the owner for the number; a guessed cap is either useless or an outage. |
| 6 · A dated `COSTS.md` | new `COSTS.md`; a line in `README.md`'s doc map | ADDS ~60 lines of prose and arithmetic | **lean_mean_review** — one more document in a set of 41. **story_checks_out_review — helps**: it gives the `$5/mo` in `INVENTORY.md` and `MCP.md` §4's qualitative model one owner instead of two half-owners. |
| 7 · Add Workers Logs + the nightly `ListObjects` to `INVENTORY.md` | `INVENTORY.md` (2 rows) | ADDS 2 inventory rows | **mac_fell_in_the_ocean_review — helps**: their criterion 12 scores the same table and is missing a different entry (`swift-struck-ui`). Fix all three in one edit. |
| 8 · Meter the failure wrap-up (record it, still refund it) | `workers/data-ops/src/lib/agent.ts`, `credits.ts` | ADDS a `kind` on the usage-log row | **activity_log_review — helps**. **spend — one extra D1 write per failed turn**, at $1/1M: $0.000001. Keep the refund; record the calls. |
| 9 · An account-wide AI ceiling | `workers/data-ops/src/lib/credits.ts`, one core migration | ADDS a global counter and a check before the per-team check | **speed_review** — one more read on the agent's hot path before every turn; it can ride the same `UPDATE` the per-team cap does, so the cost is one statement, not one round-trip. **first_run_review** — a global cap that trips turns the agent off for *everyone*, including a brand-new team's first five minutes. Needs a headroom alarm before the cap, not just the cap. Tier 2. |

---

## CEILING

**95 is not reachable, and the reason is structural rather than fixable by a commit.**

Best case with every fix in the table landed:

| # | criterion | today | best reachable | why capped |
|---|---|---:|---:|---|
| 1 | proportionality | 76 | **93** | the per-row publish on the bulk door (−7) is **locked by CACHING rule 3** — collapsing it to one collection ping would make every client refetch the list, which the base's own locked decision forbids. That −7 cannot be repaired without the owner reopening a locked decision. |
| 2 | uncapped loops | 86 | 100 | fixes 4 and 5 |
| 3 | inventory | 86 | 100 | fix 7 |
| 4 | per-action cost | 92 | **92** | the missing 8 points are the per-tenant **actual**, which needs `agent_usage_log` from the live account. **Unmeasurable from the repository, by any commit.** |
| 5 | meter | 77 | 100 | fixes 6 and 9 |
| 6 | scheduled work | 67 | 100 | fixes 3, 4 and 6 |
| 7 | storage/egress | 66 | 95 | a per-tenant storage estimate needs live `file_size` readings |
| 8 | retries/failures | 75 | 100 | fix 8 |
| 9 | sourced prices | 100 | 100 | already there |
| 10 | recorded and dated | 30 | 100 | fix 6 |

`(93×15 + 100×14 + 100×13 + 92×13 + 100×12 + 100×9 + 95×8 + 100×6 + 100×6 + 100×4) / 100`
`= (1395 + 1400 + 1300 + 1196 + 1200 + 900 + 760 + 600 + 600 + 400) / 100 = 9751/100 =` **98**.

So the ceiling is **98**, and 95 *is* comfortably reachable — but **two of the criteria
cannot be maxed by code**:

- **Criterion 4 is capped at 92 by data access, not by effort.** Twenty of its points ask
  for a per-tenant monthly figure; 12 are earned by the entitlement *ceiling*, which is
  exact. The remaining 8 need the actual distribution of turns per reply, which lives in
  `agent_usage_log` in the live database. No commit produces it — only a query against
  production does. Everything downstream of it (the $278–$6,718/month range in round 1)
  stays a **range** until someone runs that query.
- **Criterion 1 is capped at 93 by a locked decision in CACHING.md.** The two bulk doors
  disagree by a factor of 512 on how many pings one action emits, and the *cheaper* one is
  the one bending the law. That is a real tension between this review and the caching
  ruleset, and it belongs to the owner, not to a patch.

Nothing here is capped by a platform limit or by single authorship. **The cheapest route to
95 is fixes 1, 6 and 7** — prompt caching, a dated `COSTS.md`, and two inventory rows —
which between them are worth roughly 13 points and about $273 a month.

---

## Verdict

**The most expensive single action is still one agent reply at 12 steps: $0.335**, of which
92% is Anthropic input tokens and **48% is the same 6,209-token prefix paid thirteen times
over because prompt caching is still not switched on**. Price source:
platform.claude.com/docs/en/about-claude/pricing, fetched 2026-08-25 — where I also
confirmed, against a stale cached reference that said otherwise, that the $2/$10 Sonnet 5
rate is standard and the 1 September increase will not happen.

**The repair pass helped this review and cost it almost nothing.** Two criteria rose, none
fell, and the one place a correctness fix bought safety with money — the paged, fail-closed
orphan sweep — was the right trade, made for the right reason, and is now the cron's
largest unpriced cost.

**The one thing I got wrong in round 1, said plainly:** I scored the ticket-mention fan-out
a HIGH on a worst case of "200 emails on a 200-member team". D1's 100-bound-parameter limit
makes that impossible — past 100 ids the lookup throws and **nobody** is emailed. The defect
was real, the cap was the right fix, and my severity was one band too high.
