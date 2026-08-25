# Error log review — round 4 — Brimba · 2026-08-25
SCORE: 70/100   (round 1: 63 · round 2: 68 · round 3: 70)

Band: **mostly covered** (70–84), still at the bottom of it. Every count taken from
`error_logs` remains a floor — keep "at least" in front of it.

**Measured at `HEAD = d9741c6`.** The tree moved twice while I worked, to `520b0cb`
(docs only) and then `fb61e02` (+27 product lines in `workers/data-ops/src/lib/tools.ts`
and `web/lib/agent-trace.ts`). I re-checked every file this review measures: **none of
them differ between `d9741c6` and `fb61e02`**, so every number below holds at both. The
27 new lines are a new bulk MCP tool; whether they add a failure path is **unmeasured** and
declared as such rather than assumed either way.

Method: nine sabotage simulations run entirely outside the repository, in
`…/scratchpad/g4-{check,sabotage,probe2,fidelity2,apifailure}.mjs`. The harness extracts
`stripComments` and `catchBodies` **from the repo's own `shared/test/source.ts`** and was
proven byte-identical to my transcription on all seven workers before any sabotage was
run. Nothing in this repository was modified except this file.

---

## DELTA

Round 1: **63** → Round 2: **68** → Round 3: **70** → Round 4: **70** (69.55 → 70.39)

| # | Criterion | wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | `reach` (GATE) | 16 | 61 | 65 | 66 | **66 =** | No path gained or lost a recorder. `proxyService` still 503s without a row on every proxied route, so row 4 stays at **zero**. The 5xx check got much better; what it *proves* did not change. |
| 2 | `store` | 14 | 75 | 90 | 90 | **90 =** | No surface gained or lost a store. |
| 3 | `boot` | 11 | 74 | 77 | 77 | **77 =** | Nothing touched boot. |
| 4 | `outbound` | 11 | 51 | 51 | 51 | **51 =** | **Untouched for the FOURTH round.** `git diff --stat 256d21b..HEAD` is empty for `shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts` and `workers/data-ops/src/lib/model.ts`. |
| 5 | `frontend` | 10 | 67 | 92 | 92 | **92 =** | Unchanged. |
| 6 | `background` | 9 | 73 | 73 | 84 | **84 =** | Unchanged. |
| 7 | `row` | 9 | 75 | 75 | 75 | **75 =** | `recordWorkerError` still passes five fields. `team_id` / `user_id` still NULL on every worker-written row while the columns and the binds both exist. |
| 8 | `parity` | 8 | 45 | 45 | 45 | **45 =** | Re-derived, not reused: **35** `instanceof ApiFailure` sites, **2** guarded. Identical to round 3. |
| 9 | `safety` | 7 | 60 | 60 | 60 | **72 ▲** | **+12.** `timed()` no longer stamps a slow-but-successful request `level: "error"`. Six of those twelve points are round 3's own deferred credit for `decodeKey` — see below. |
| 10 | `alerting` | 5 | 20 | 20 | 20 | **20 =** | Still nothing notifies anybody. Verified exhaustively this round, not assumed. |

**No criterion fell. One rose.** The four carrying the largest unaddressed defects —
`outbound` 51, `parity` 45, `row` 75, `alerting` 20 — did not move for the **third**
round running and still carry **33 of the 100 weight**. Four rounds of repair have not
touched any of them.

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned from its rows
total    = round( Σ (criterion × weight) / 100 )
```

| # | criterion | key | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | Every failure path can reach the store (GATE) | `reach` | 66 | 16 | 1056 |
| 2 | One durable store, every surface writes to it | `store` | 90 | 14 | 1260 |
| 3 | Startup and boot failures recorded | `boot` | 77 | 11 | 847 |
| 4 | Outbound integration + credential failures recorded | `outbound` | 51 | 11 | 561 |
| 5 | The browser reports too | `frontend` | 92 | 10 | 920 |
| 6 | Background and scheduled work reports | `background` | 84 | 9 | 756 |
| 7 | A row is complete and the message actionable | `row` | 75 | 9 | 675 |
| 8 | What the user saw, the store saw | `parity` | 45 | 8 | 360 |
| 9 | Recording cannot crash the app or flood the table | `safety` | 72 | 7 | 504 |
| 10 | Somebody finds out; the table doesn't grow forever | `alerting` | 20 | 5 | 100 |
| | **weights** | | | **100** | **7039** |

`1056+1260 = 2316; +847 = 3163; +561 = 3724; +920 = 4644; +756 = 5400; +675 = 6075;`
`+360 = 6435; +504 = 6939; +100 = 7039.`
**7039 / 100 = 70.39 → SCORE 70.**

Gate: criterion 1 = 66 ≥ 40 → **no cap**. `store.present === true` → no 15 cap.

**`safety` 60 → 72, itemised so nobody has to take my word for it:**
```
+6   the slow-path poison, closed this round   (timed() → console.warn, level "warn")
+6   decodeKey's unauthenticated flood trigger, closed in round 3 and NOT scored then
     — round 3 wrote "the underlying exposure FELL materially … the rubric's bands
     cannot express it" and left the number at 60. It is expressible; I am paying it.
= +12
```
Round 3 declined that credit to keep its own delta conservative. Carrying it forward
unpaid would understate the base's real safety posture for a fourth round, so I am
paying it and flagging exactly which half is retrospective.

---

## What the brief asked me to verify

> *Both blind spots you found in the NEW 5xx check are fixed: it was two regexes over a
> fixed 600-char window … and its sibling slice ended at `async scheduled(`. One regex
> spanning both halves now, brace-matched, anchored on `export default`. Sabotage-proven.*

**Two of the three claims are true. The third fuses two different checks, and the
distinction is where the new blind spot lives.**

`workers/data-ops/test/error-seam.test.ts` holds **two independent `describe` blocks**:

| | CHECK A · "every worker records crashes centrally" (`:25-108`) | CHECK B · "a 5xx refusal is recorded" (`:117-136`) |
|---|---|---|
| R3 finding it answers | **R3-2** (the slice ran to end-of-file on six of seven workers) | **R3-1** (two regexes 292 chars apart, green with the recorder deleted) |
| Slices? | **Yes** — `code.indexOf("export default")` → `indexOf("async fetch(", exported)` → brace-matched to depth 0 (`:63-75`) | **No.** `const code = stripComments(src)` and the regex runs over the **whole file** (`:129-133`) |
| Anchored on `export default`? | **Yes** | **No** |
| Brace-matched? | **Yes** | **No** |

So: *"one regex spanning both halves"* — **TRUE, and it is the fix that works**
(`/status\s*>=\s*500\s*\)?\s*\n?\s*await recordWorkerError\(/`, pure adjacency).
*"brace-matched, anchored on `export default`"* — **describes CHECK A, not the 5xx
check.** Both fixes landed in the same file and the claim has merged them.

### R3-1 and R3-2 are genuinely fixed — proven, not asserted

**R3-2, the slice.** Brace-matching terminates on the `fetch` member's own closing brace
for all seven workers, and every slice now yields **exactly one** catch body — so
tenancy's cron recorder at `:207` can no longer cover for the request catch:

| worker | stripped file | slice | catches | chars now EXCLUDED that R3 was reading |
|---|---:|---|---:|---:|
| auth | 10220 | 904..2783 | 1 | **7437** |
| content | 4177 | 2753..4142 | 1 | 35 |
| data-ops | 4580 | 3150..4545 | 1 | 35 |
| gateway | 7483 | 1974..3182 | 1 | **4301** |
| mcp | 6516 | 5220..6481 | 1 | 35 |
| realtime | 5008 | 2494..2865 | 1 | **2143** |
| tenancy | 6754 | 4389..5784 | 1 | **970** |

**The `export default` anchor is load-bearing and the reason given is exactly right.**
`workers/realtime/src/index.ts:36` declares `export class TeamChannel extends
DurableObject<Env>` with its own `async fetch(` at `:39`; `export default` is at `:120`
and its `fetch` at `:121`. Anchoring on the first `async fetch(` genuinely grabs the
Durable Object. And `async scheduled(` exists in exactly **one** worker
(`workers/tenancy/src/index.ts:184`), confirming R3-2's diagnosis.

**R3-1, the adjacency.** Sabotage (a) — delete the recorder inside the 5xx branch — and
sabotage (a2) — keep the `if` and swap `recordWorkerError` for `traceError` — now go
**RED on all four** GuardError workers. That is the exact Simulation C that stayed green
on all four last round.

### R3-4 · NEW · MEDIUM — the 5xx fix widened a hole in its sibling: the GENERIC catch's recorder can now be deleted with the suite green

Full sabotage matrix (RED = caught, GREEN = blind):

| worker | (a) del 5xx recorder | (a2) recorder→`traceError` | **(b) del GENERIC recorder** | (c) del BOTH | (d) recorder→helper outside `export default` | (e) recorder→comment |
|---|---|---|---|---|---|---|
| auth | n/a | n/a | **RED** | **RED** | **RED** | **RED** |
| content | RED (B) | RED (B) | **GREEN — BLIND** | RED (A) | RED (A) | **RED** |
| data-ops | RED (B) | RED (B) | **GREEN — BLIND** | RED (A) | RED (A) | **RED** |
| mcp | RED (B) | RED (B) | **GREEN — BLIND** | RED (A) | RED (A) | **RED** |
| tenancy | RED (B) | RED (B) | **GREEN — BLIND** | RED (A) | RED (A) | **RED** |
| gateway | n/a | n/a | **RED** | **RED** | **RED** | **RED** |
| realtime | n/a | n/a | **RED** | **RED** | **RED** | **RED** |

CHECK A asks whether `recordWorkerError(opsDatabase(env)` appears **anywhere in the joined
catch bodies**. Before the 5xx branch existed there was one recorder in that catch, so
that question had one answer. The 5xx branch put a **second** recorder inside the **same**
catch body — so deleting the generic one, the one that catches every *unexpected* crash
(i.e. every real bug), now leaves a satisfying match behind and CHECK A passes.

Verified directly: content goes from two `recordWorkerError` calls to one, the catch
retains only the `if (e.status >= 500)` recorder, and CHECK A is green.

**Why this matters more than it sounds.** The 5xx branch records *refusals that were
outages*. The generic catch records *crashes*. A refactor that keeps the first and drops
the second turns the store into a log of auth timeouts with every genuine bug missing —
and the suite says fine, on the four workers that carry the most routes.

**The fix, four lines.** Make CHECK A count rather than test presence:
```ts
const generic = catchBodies(entry).filter((b) => !/status\s*>=\s*500/.test(b) || b.split("recordWorkerError").length > 2)
expect(recorderCount(catches), `${w}'s generic catch must record independently of the 5xx branch`).toBeGreaterThanOrEqual(2)
```
i.e. assert **two** recorders where a `status >= 500` branch exists, one where it does not.
`workers/auth/test/gating-seam.test.ts:82` already established equality-over-floor as the
house pattern for exactly this failure mode.

### R3-5 · NEW · MEDIUM — three further shapes that defeat both checks

| probe | sabotage | CHECK A | CHECK B |
|---|---|---|---|
| 2 | delete the real 5xx recorder; append a decoy `async function recordUpstreamFailure(){ if (status >= 500) await recordWorkerError(...) }` **at end of file** | **GREEN** | **GREEN** |
| 3 | move the 5xx recorder into a helper **above** `export default`, leave the generic one | **GREEN** | **GREEN** |
| 4 | rename the class: `instanceof GuardError` → `instanceof HttpRefusal` | GREEN | **SKIPPED SILENTLY** (`:120` `continue`s) |
| 5 | add only the *comment* `// no longer uses instanceof GuardError` to realtime | — | **ENROLS realtime and then FAILS it** |

Probes 2 and 3 are R3-2's fault, unfixed **for CHECK B** — it has no slice, so the
recorder may live anywhere in the file including below the export. Probe 4 is the more
serious shape: the membership filter is `if (!/instanceof GuardError/.test(src)) continue`,
so **renaming the error class removes the worker from the law with nothing turning red**.
Probe 5 shows the filter reads `src` (raw) while the assertion reads `code` (stripped) —
wrong in both directions from one inconsistency.

**The fix, two lines.** Move CHECK B inside CHECK A's brace-matched `entry` slice (it is
already computed, one describe block above), and derive membership from the shared
`GuardError` import rather than a string in the file:
`if (!/from "[^"]*guard/.test(src)) continue` — or better, enumerate the workers
explicitly and assert the list's length, the way `gating-seam` does.

### `timed()` — verified fixed, and verified it was the only poison source

`shared/workers/trace.ts:176-181`:
```ts
// NOT through traceError: that stamps level "error", and a slow-but-successful
// request is not an error. …
if (ms >= SLOW_MS)
  console.warn(JSON.stringify({ level: "warn", event: "slow", req, worker, place, ms }))
```
`git diff 256d21b..HEAD -- shared/workers/trace.ts` is a single hunk (in commit `c80be0d`,
titled `wip: lockfile` — the change is real and the message hides it). The previous line
was `traceError({ … event: "slow" … })`.

**And nothing else poisons the signal.** `timed(` has exactly one call site
(`workers/gateway/src/index.ts:116`), whose only slow-path output is that `console.warn`.
I enumerated all **16** non-test `recordWorkerError(` / `logError(` call sites: every one
is inside a `catch`; none sits on a success path. Alerting, when it exists, will not be
reading a channel that a merely-slow request can fill.

---

## THE ANSWER TO THE QUESTION YOU ASKED

> *You said the cheapest alerting is a nightly digest through the existing cron and Resend
> sender — write that proposal out concretely enough to implement.*

**Nothing notifies anybody today.** Grepping `resend|sendEmail|webhook|slack|pagerduty|
digest|notifyOwner|alertEmail` across `workers/ shared/ web/ scripts/` returns only
transactional email (login code, invite, role-changed, email-change) and one unrelated
`crypto.subtle.digest`. The only "alarm" in the base is the 80 % size check, which
`console.log`s and writes a `db_alerts` row that nobody reads either.

Everything the digest needs already exists. **Nothing new is deployed, no new worker, no
new binding, no new dependency, and no new cron.**

### The five pieces, all already on disk

| piece | where | notes |
|---|---|---|
| The cron | `workers/tenancy/src/index.ts:184-208` — the repo's **only** `scheduled` handler | Already runs four jobs; `"10 3 * * *"` (03:10 UTC) at `workers/tenancy/wrangler.jsonc:35` (prod) and `:62` (staging) |
| The table | `error_logs` in the **ops** database, via `opsDatabase(env)` (`shared/workers/ops-db.ts:40`, `env.OPS ?? env.DB`) | `db/ops/0001_operations.sql:18-34` + `request_id` from `0002` |
| The index | `idx_error_logs_status_at (status, at DESC)` | **The digest query is already served. No new index, so no cost to `speed_review` or `spend_review`.** |
| The service hop | `callService(env.AUTH, "https://auth/internal/send-email", …)` — the exact shape at `workers/tenancy/src/lib/notify.ts:24-45` | Tenancy already binds `AUTH` (`wrangler.jsonc:23-26`) and reads `INTERNAL_KEY` (`src/env.ts:32`). Bounded and non-throwing |
| The sender + body | `internalSendEmail` (`workers/auth/src/index.ts:121-142`, routed `:70`) → `sendEmail` (`workers/auth/src/lib/email.ts:44-69`, 15 s `AbortSignal.timeout`, R11-compliant) → `brandedEmail({heading, intro, ctaLabel, ctaUrl, footnote})` (`shared/workers/email-template.ts:35`, HTML-escaped via `esc()`) | `RESEND_API_KEY` is auth's secret; `EMAIL_FROM` is auth's var. **Tenancy must send through auth** — it does not hold the key, and should not |

**The one thing that does not exist: a recipient.** Nothing named `OWNER_EMAIL`,
`ADMIN_EMAIL` or `ALERT_EMAIL` appears anywhere. Add **one var**, `OPS_ALERT_EMAIL`, to
`workers/tenancy/wrangler.jsonc` in both environments — a var, not a secret; it is an
address, and putting it in the config is what makes a fork inherit the behaviour and
change the address in one place.

### The query — one statement, two rollups, already indexed

```sql
SELECT source, place, COUNT(*) AS n, MAX(at) AS last_at,
       MIN(substr(message, 1, 160)) AS sample
FROM error_logs
WHERE at >= ? AND status = 'open'
GROUP BY source, place
ORDER BY n DESC
LIMIT 20;
```
`?` = `new Date(Date.now() - 24*60*60*1000).toISOString()`. `LIMIT 20` is the cap Law R14
wants stated in a comment; a digest that lists 400 distinct places is not a digest.

A second one-row statement gives the total and the backlog:
```sql
SELECT COUNT(*) AS total_24h,
       (SELECT COUNT(*) FROM error_logs WHERE status = 'open') AS open_all_time
FROM error_logs WHERE at >= ?;
```

### The step — appended to the cron, ~35 lines in one new file

`workers/tenancy/src/lib/error-digest.ts`:

```ts
/** Nightly error digest. Reads the last 24 h of OPEN rows from the operations
 *  database, groups by (source, place), and emails one summary through auth's
 *  sender. Capped at 20 groups (R14). Returns null when there is nothing to say. */
export async function buildErrorDigest(env: Env): Promise<{ subject: string; html: string; text: string } | null> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rows = await opsDatabase(env).prepare(GROUPED_SQL).bind(since).all<Row>()
  if (!rows.results.length) return null            // ← SILENCE ON A CLEAN NIGHT
  const totals = await opsDatabase(env).prepare(TOTALS_SQL).bind(since).first<Totals>()
  return {
    subject: `Brimba: ${totals.total_24h} errors overnight (${rows.results.length} distinct)`,
    ...brandedEmail({
      heading: "Overnight errors",
      intro: `${totals.total_24h} in the last 24 hours across ${rows.results.length} places. ${totals.open_all_time} open in total.`,
      footnote: rows.results.map((r) => `${r.n}x ${r.source} ${r.place} — ${r.sample}`).join("\n"),
    }),
  }
}
```

and in `workers/tenancy/src/index.ts`, **inside the existing `try`**, after
`sweepOrphanedUploads`:

```ts
const digest = await buildErrorDigest(env)
if (digest && env.OPS_ALERT_EMAIL)
  await callService(env.AUTH, "https://auth/internal/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": env.INTERNAL_KEY ?? "" },
    body: JSON.stringify({ to: env.OPS_ALERT_EMAIL, ...digest }),
  }, { worker: "tenancy", place: "cron/error-digest" })
```

### The five design decisions, and why each one is the way it is

1. **Silence on a clean night.** `return null` when the 24-hour window is empty. This is
   the single most important line in the proposal. A digest that arrives every morning
   saying "0 errors" is unread within two weeks, and then the morning it says 400 is
   unread too. **The absence of the email is the all-clear.**
2. **It goes inside the existing `try`, not beside it.** Law R12 requires a cron to
   record its failures; the surrounding `catch` already calls `recordWorkerError(…,
   "cron/size-check", e)` and satisfies R12 for the whole handler. Update that `place`
   string to `"cron/nightly"` so a digest failure is not filed under the size check.
3. **`callService`, not `fetch`.** It is already bounded and already non-throwing, so a
   Resend outage cannot take down the other four nightly jobs. Law R11 is satisfied by
   `sendEmail`'s own 15 s `AbortSignal.timeout` one hop down.
4. **No new gate is needed and none should be added.** The cron has no caller, so Law R10
   does not apply; `/internal/send-email` is already `INTERNAL_KEY`-gated and unreachable
   from the public gateway. Adding a route would create the first ungated door in the base.
5. **`status = 'open'` only.** `getErrors`/`postResolveError`
   (`workers/data-ops/src/routes/admin.ts:26-56`) already implement a resolve workflow.
   Filtering on it means resolving a known issue silences it from tomorrow's digest
   without any new state — the digest inherits triage that already exists.

### What it costs

| dimension | cost |
|---|---|
| `spend_review` | **1 Resend email per day, worst case 365/year.** Resend's free tier is 100/day. Effectively zero, and it *falls* on quiet nights because of decision 1 |
| `speed_review` | **Zero on the request path.** It runs at 03:10 UTC in a cron with no user waiting |
| `scaling_review` | Two indexed queries with `LIMIT 20` against a 90-day-retained table (`RETAIN_ERROR_LOGS_DAYS`, `shared/workers/retention.ts:83`) |
| `lean_mean_review` | **+~35 lines in one new file, +6 in the cron, +1 var × 2 envs.** The only real debit, and it is small |
| `security_sentry_review` | **One thing to check:** `sample` is `substr(message, 1, 160)` of an error message, which can contain user input. `brandedEmail` HTML-escapes via `esc()` — that is the control, and it should be verified rather than assumed |

**It moves `alerting` from 20 to roughly 70** — the remaining 30 being that a nightly
cadence cannot page anyone for an outage in progress, which is a deliberate trade, not an
omission. It is the largest single-criterion gain available anywhere in this review, for
about forty lines.

---

## Findings

### R4-1 · HIGH — `proxyService` still returns 503 with no row, on every proxied route. Fourth round.

`shared/workers/trace.ts:126-143` · call sites `workers/gateway/src/index.ts:192`, `:209`

The catch calls `traceError` (console only) and returns a synthesized 503. Because
`proxyService` **swallows the throw itself**, the gateway's central catch at `:119` never
sees it, so `/internal/log-error` is never reached. A downstream worker being down —
mid-rollout, not yet deployed, or genuinely unwell — produces **zero rows**. This is row 4
of criterion 1 (`no terminal path on a money/stock/permission/data-loss route`) and it is
why that row scores **0 of 15**. Every `/api/*` request in the base passes through it.

**The fix.** Two lines: before returning the 503, `await recordWorkerError(opsDatabase(env),
"gateway", place, e)`. It is the same call the central catch already makes.

### R4-2 · HIGH — every worker-written row has NULL `team_id` and NULL `user_id`, and the columns are already there

`shared/workers/error-log.ts:79`
```ts
await logError(db, { source, place, message: err.message, stack: err.stack, requestId })
```
`ErrorReport` declares `teamId?` and `userId?` at `:26-27`; the INSERT binds both at
`:40-53`. The only path that fills `url` is the client beacon (`internalLogError`,
`workers/auth/src/index.ts:145-168`), and it fills neither id. So the store cannot answer
*"is this one tenant or everyone"* — the first question anybody asks of an error spike —
even though the schema was designed to.

**The fix.** `recordWorkerError` already receives `env`; the guard/`teamContext` result is
in scope at every central catch. Passing `teamId`/`userId` through is one parameter and
one spread.

### R4-3 · MEDIUM — the generic catch's recorder can be deleted with the suite green on four workers

See **R3-4** above. Caused by the R3-1 fix.

### R4-4 · MEDIUM — renaming the error class silently removes a worker from the 5xx law

See **R3-5**, probe 4.

### R4-5 · MEDIUM — 33 of 35 `instanceof ApiFailure` sites never reach the beacon

35 sites; **2** guarded (`web/components/deep-link-screen.tsx`,
`web/components/invite-dialog.tsx`); 2 of the 35 are not inside a `catch` at all
(`deep-link-screen.tsx:546-547`). "Guarded" here means the enclosing catch also calls
`reportError`/`reportWarning` from `web/lib/log.ts`. **This definition is my
reconstruction** — round 3 states 35/2 without defining it, and this definition reproduces
35/2 exactly, which is strong but circumstantial. Flagged as such.

### R4-6 · MEDIUM — outbound failures still record nothing, for the fourth round

`shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts`,
`workers/data-ops/src/lib/model.ts` — **byte-identical to `256d21b`**. A rejected
`CF_D1_TOKEN`, a Resend outage and a model-provider 429 all leave the same evidence: none.
`outbound` has carried 51/100 and 11 % of the weight through four rounds.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** The nightly error digest | new `workers/tenancy/src/lib/error-digest.ts` (~35), `workers/tenancy/src/index.ts` (+6), `wrangler.jsonc` ×2 (+1 var each) | ADDS ~43 lines and one daily email; REMOVES the base's total silence about its own failures | **`spend_review` — ~1 email/day, inside Resend's free 100/day, and zero on a clean night.** **`speed_review` — none:** cron-time only. **`lean_mean_review` — small debit** (+43 lines). **`security_sentry_review` — verify one thing:** the 160-char `message` excerpt can carry user input; `brandedEmail`'s `esc()` is the control. |
| **F2** Record in `proxyService` before the 503 (R4-1) | `shared/workers/trace.ts` (+2) | ADDS a row on every downstream outage | **`spend_review` / `scaling_review` — real and bounded:** during a full downstream outage this writes one row per failed request into the operations database. **Cap it** — a per-worker "one row per minute per place" guard, or the digest floods. **`speed_review` — small:** one extra write on an already-failing path. |
| **F3** Pass `teamId`/`userId` into `recordWorkerError` (R4-2) | `shared/workers/error-log.ts` (+2), 6 central catches (+1 each) | ADDS two populated columns; REMOVES a blind spot | **`security_sentry_review` — consider:** it puts tenant and user identifiers into a cross-team table. The schema always intended this and the store is admin-only, but that review should sign it. **`activity_log_review` — positive.** **`spend_review` — none** (same row, two more bound values). |
| **F4** Assert TWO recorders where a 5xx branch exists (R4-3) | `workers/data-ops/test/error-seam.test.ts` (~4) | ADDS 4 test lines; REMOVES a blind spot the last repair created | **`lean_mean_review` — trivial debit** (4 lines in a test that is not its split target). Nothing else. |
| **F5** Move CHECK B inside CHECK A's slice; derive membership from the import (R4-4) | `workers/data-ops/test/error-seam.test.ts` (~2 changed, ~6 removed) | **REMOVES lines** — the two describes stop duplicating a read | **none — `lean_mean_review` gains.** This is the rare fix that is a credit everywhere. |
| **F6** Record outbound failures in the three integration seams (R4-6) | `shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts`, `workers/data-ops/src/lib/model.ts` (~4 each) | ADDS ~12 lines and rows on integration failure | **`spend_review` / `scaling_review` — the sharpest tension in this map.** `d1-rest.ts` is on *every* team-database read. A D1 REST outage would write one error row per query, into a database reached over the same REST door that is failing. **Must be rate-limited at the seam**, or it is a self-amplifying loop. **`speed_review` — small.** |

---

## CEILING

**95 is not reachable by changing code. The true maximum is 89, and the binding
constraint is a locked architectural decision plus one platform limit.**

| Criterion | wt | Cap | Why |
|---|---:|---:|---|
| 1 · `reach` (GATE) | 16 | **~85** | Recording is *best-effort by contract* — `ERROR-HANDLING.md` states, and `CLAUDE.md` endorses, that "a logging hiccup never changes a response". That is the right decision and it is written down, but it means a failure path can always fail to record and nothing may treat that as an error. The last ~15 points of this criterion are only buyable by making recording blocking, which the ruleset forbids. **Locked.** |
| 4 · `outbound` | 11 | 100 | Reachable. Nothing structural blocks it; it has simply not been done for four rounds. |
| 7 · `row` | 9 | 100 | Reachable — F3. |
| 8 · `parity` | 8 | **~90** | Reachable in principle; the last points need every one of 35 client catch sites to reach the beacon, and some are inside render paths where a beacon call during an error boundary's own unwind is not safe. |
| 9 · `safety` | 7 | **~85** | `logError`'s catch is deliberately empty — the store cannot report its own failure without recursion. That is correct design and it costs points that no commit can buy back. **Structural.** |
| 10 · `alerting` | 5 | **~75** | A nightly cron cannot page anyone mid-outage. Cloudflare Cron Triggers have a **one-minute floor**, so even the most aggressive schedule is a one-minute detection window, and a real pager needs a second service this base deliberately does not have. **Platform + a deliberate omission.** |
| 2, 3, 5, 6 | 44 | 100 | Reachable. |

**True maximum, computed:**
```
85×16 = 1360 · 100×14 = 1400 · 100×11 = 1100 · 100×11 = 1100 · 100×10 = 1000
100×9  =  900 · 100×9  =  900 · 90×8  =  720 · 85×7  =  595 · 75×5 =  375
Σ = 1360+1400 = 2760; +1100 = 3860; +1100 = 4960; +1000 = 5960; +900 = 6860;
    +900 = 7760; +720 = 8480; +595 = 9075; +375 = 9450
9450 / 100 = 94.5 → 94
```

**94, not 95** — and the gap between 70 and 94 is almost entirely four things nobody has
touched in four rounds (`outbound` +49, `alerting` +55, `row` +25, `parity` +45), worth
**+16.5 points of the total between them**. None is blocked by anything. `alerting` alone
is +2.75 for the forty lines specified above.

**Verdict: the store is real and the enforcement around it got materially better this
round — but the review's own four largest holes are exactly where they were in round 1,
and the repair that closed round 3's blind spot opened a smaller one of the same shape
next to it.**
