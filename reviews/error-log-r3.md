# Error log review — round 3 — Brimba · 2026-08-25
SCORE: 70/100   (round 1: 63 · round 2: 68)

Band: **mostly covered** (70–84). It crosses out of "leaky" by half a point, so
read it as the bottom of the band, not the middle. Every count taken from
`error_logs` remains a floor — keep "at least" in front of it.

Method: `~/.claude/skills/error_log_review/assets/probe.mjs` re-run against the
repo root at `review-campaign` @ `256d21b`, plus manual reads of every file the
brief named, and **four sabotage simulations** of the error-seam check run
entirely outside the repo at
`…/scratchpad/b3/{b3-source.mjs,b3-seam-sim.mjs,b3-seam-sim2.mjs,b3-seam-sim3.mjs,b3-seam-sim4.mjs}`.
The simulations re-implement `stripComments` and `catchBodies` verbatim from
`shared/test/source.ts` and run the check's own logic against in-memory
sabotaged copies. Nothing in this repository was modified except this file.

---

## DELTA

Round 1: **63** → Round 2: **68** → Round 3: **70**

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---:|---:|---:|---:|---|
| 1 | `reach` (GATE) | 16 | 61 | 65 | **66** | **+1.** Three of the six structural terminal paths closed — the 5xx `GuardError` exclusion and both `bridge.ts` exits. Row 1 moves 37 → 38; row 4 stays at **zero** because `proxyService` still returns a 503 without a row on every permission-gated route |
| 2 | `store` | 14 | 75 | 90 | 90 | Unchanged. No surface gained or lost a store |
| 3 | `boot` | 11 | 74 | 77 | 77 | Unchanged. Nothing touched boot |
| 4 | `outbound` | 11 | 51 | 51 | 51 | **Nothing touched it, for the second round running.** `d1-rest.ts`, `auth/src/lib/email.ts` unchanged; `data-ops/src/lib/model.ts` changed only its request body (prompt caching), not its failure handling. Probe: `outbound.recordsNon2xx = 0`, `recordsAuth = 0`, unchanged |
| 5 | `frontend` | 10 | 67 | 92 | 92 | Unchanged |
| 6 | `background` | 9 | 73 | 73 | **84** | **+11.** The nightly cron's *silent partial* is now recorded: a retention bound that is HIT writes a real row. Round 2 said the exposure had risen while the number held; this is the number catching up |
| 7 | `row` | 9 | 75 | 75 | 75 | Unchanged. `recordWorkerError` (`shared/workers/error-log.ts:67-79`) still passes only `source, place, message, stack, requestId`. `team_id` / `user_id` still NULL on every row |
| 8 | `parity` | 8 | 45 | 45 | 45 | Unchanged, and I re-derived the count rather than reusing it. `instanceof ApiFailure` is now **35** sites (was 33), still **2** guarded — slightly worse, same penalty band |
| 9 | `safety` | 7 | 60 | 60 | 60 | Number unchanged; **the underlying exposure FELL materially** — `decodeKey` closed the unauthenticated flood trigger that was round 2's finding R2-1. The rubric's bands cannot express it. Finding R3-4 |
| 10 | `alerting` | 5 | 20 | 20 | 20 | Unchanged. Still nothing notifies anybody. The 20 points it does hold are now honestly earned rather than aspirational — see below |

**No criterion fell.** One (`safety`) held its number while the real risk got
**better**, which is the exact mirror of round 2, where two held their numbers
while the risk got worse. Both directions are written up, because a rubric that
cannot see an improvement cannot see a regression either.

**The shape of the delta.** Two criteria moved, worth +2. The four carrying the
largest unaddressed defects — `outbound` 51, `parity` 45, `safety` 60,
`alerting` 20 — did not move for the second round running, and they still carry
**31 of the 100 weight**. Three rounds of repair have not touched them.

---

## What the brief asked me to verify

| Claim | Verdict | Evidence |
|---|---|---|
| A 5xx `GuardError` now reaches `recordWorkerError` in all four workers | **TRUE** | tenancy `:167-170`, content `:123-126`, data-ops `:131-134`, mcp `:196-199` — each `if (e instanceof GuardError) { if (e.status >= 500) await recordWorkerError(opsDatabase(env), …); return fail(e.status, e.code, e.message) }` |
| …sabotage-proven | **TRUE for the round-2 findings, FALSE for the new check itself** | Simulation B: neutering the recorder inside the fetch handler turns **all seven** workers red. Simulation C: the new 5xx check stays **GREEN on all four** with the 5xx branch's recorder deleted. Finding R3-1 |
| The check now strips comments | **TRUE** | `error-seam.test.ts:53` — `const code = stripComments(src)`, using the real left-to-right scanner at `shared/test/source.ts:74-122` |
| …and reads only the `fetch` handler's own catch | **TRUE IN INTENT, LOOSE IN FACT** | `:54-56` anchors on `code.indexOf("async fetch(")` and ends at `async scheduled(`. Only **tenancy** has a `scheduled` handler, so for the other six the slice runs to **end of file**. Latent, and I proved it exploitable — finding R3-2 |
| Round 2's two bypasses (raw source; joining every catch body) are closed | **TRUE, both** | Comments are stripped, and the slice is scoped rather than file-wide. Simulation E confirms neutering the central catch fails every worker at today's source |

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
| 9 | Recording cannot crash the app or flood the table | `safety` | 60 | 7 | 420 |
| 10 | Somebody finds out; the table doesn't grow forever | `alerting` | 20 | 5 | 100 |
| | **weights** | | | **100** | **6955** |

`1056+1260 = 2316; +847 = 3163; +561 = 3724; +920 = 4644; +756 = 5400; +675 = 6075;`
`+360 = 6435; +420 = 6855; +100 = 6955.`
**6955 / 100 = 69.55 → SCORE 70.**

Gate: criterion 1 = 66 ≥ 40 → **no cap**. `store.present === true` → no 15 cap.

### 1 · `reach` — 66/100 (weight 16, GATE) — was 65

| row | pts | earned | working |
|---|---:|---:|---|
| non-terminal share × 45 | 45 | **38** | 151/180 = 83.9% → 0.839 × 45 = 37.75 |
| non-throwing failure paths record or propagate | 20 | **8** | 3/8 propagate → 0.375 × 20 = 7.5 |
| last-resort handler at every entry point, and it records | 20 | **20** | 9/9 |
| no terminal path on a money/stock/permission/data-loss route | 15 | **0** | `proxyService` — see below |

**Denominator 180.** The probe found 177 failure points, 28 terminal
(`capture.overall.total = 177`, `terminal = 28`, `pct = 84` — identical to round
2). The same two false positives stand and still record
(`workers/data-ops/src/routes/agent.ts:61`, `workers/tenancy/src/index.ts:193`,
which records at `:197`) → 26 confirmed terminal.

The six terminal paths a catch-scan structurally cannot see are now **three**:

| # | path | round 2 | round 3 |
|---|---|---|---|
| 1 | `shared/workers/realtime.ts:104-114` — `publish()` discards its Response | terminal | **STANDS** |
| 2 | `shared/workers/gating.ts:96-101` — 5xx `GuardError` excluded from the store | terminal | **CLOSED** |
| 3 | `workers/mcp/src/lib/bridge.ts:41-46` — 503 `auth_unreachable` | terminal | **CLOSED** — it is a `GuardError`, 503 ≥ 500, mcp's catch records it |
| 4 | `workers/mcp/src/lib/bridge.ts:49-55` — 502 `bridge_failed` | terminal | **CLOSED** — 502 ≥ 500, same branch |
| 5 | `shared/workers/trace.ts:104-113` — `callService` "service unreachable", `traceError` only | terminal | **STANDS** as a class |
| 6 | `shared/workers/trace.ts:127-142` — `proxyService` "downstream unreachable" | terminal | **STANDS** |

26 + 3 = **29 of 180.** `(180−29)/180 = 0.8389`.

**Row 4 stays at zero, and it is worth saying why the biggest fix of the round
did not move it.** The 5xx `GuardError` closure removed the flagship example — an
auth outage 503ing every screen with no evidence. But `proxyService`
(`shared/workers/trace.ts:127-142`) **catches its own error and RETURNS a 503**:

```ts
try { return await binding.fetch(request) } catch (e) {
  traceError({ …, event: "downstream_unreachable", detail: e })
  return new Response(JSON.stringify({ error: "service_unavailable", … }), { status: 503, … })
}
```

Because it returns rather than throws, the gateway's new central catch never sees
it — and every permission-gated API call in the base flows through this function.
A downstream worker being down still renders "That part of the app isn't
responding right now" to the user and writes **zero rows**. The rubric's row 4
says subtract to zero if any terminal exists on a permission route. One does.

### 6 · `background` — 84/100 (weight 9) — was 73

Still no queues (`platform.queues: []`, `deadLetters: []` across all seven
configs), one cron. Renormalised over the 45 applicable points, exactly as
rounds 1 and 2: scheduled-job row **18**/25 (was 13), un-awaited-work row
**20**/20 → 38/45 → **84**.

The +5 on the scheduled row is `sharding.ts:481-486`: a retention pass that
stopped because its budget ran out — rather than because the table was clean —
now writes a real row through the seam, one per run however many rules fell
short. Round 2's finding R2-4 was that a partial nightly run was indistinguishable
from a complete one; it is now distinguishable and recorded.

Not full credit, and the residual is the harder half: **a cron that stops firing
altogether is still invisible.** Nothing records an absence. There is no
heartbeat row, no "last successful run" timestamp anybody reads, and the
`db_alerts` table that would be the natural home for one is only written on a
size alarm.

### 9 · `safety` — 60/100 (weight 7) — DEFECT — unchanged number, improved substance

| penalty | applied | evidence |
|---|---:|---|
| critical 30 — the recorder can throw | **0** | `logError` still wraps everything. Correct |
| high 15 — no dedupe or rate limit | **−15** | `shared/workers/error-log.ts:36` unchanged: no dedupe, no sampling, no ceiling. **But the unauthenticated trigger is gone** — finding R3-4 |
| high 15 — writes synchronously with no timeout | **−15** | the `await recordWorkerError(...)` calls are still unbounded, and there are now **nine** of them (four new 5xx branches, one new cron shortfall). The gateway's path remains the bounded one (`callService`) |
| medium 7 — personal data or secrets in the error row | **−7** | unchanged; still **unmeasured** without a live failing row |
| minor 3 — a failed recording is itself silent | **−3** | `logError`'s catch is still empty — not even a console line. This is what makes finding R3-5 lossy |

---

## Findings

### R3-1 · HIGH — the NEW check for the 5xx `GuardError` can pass with the 5xx branch recording nothing

`workers/data-ops/test/error-seam.test.ts:97-110`

```ts
const branch = code.slice(code.indexOf("instanceof GuardError"), code.indexOf("instanceof GuardError") + 600)
expect(branch, …).toMatch(/status\s*>=\s*500/)
expect(branch, …).toMatch(/recordWorkerError/)
```

Two **independent** regex matches over one fixed 600-character window. Nothing
ties the `status >= 500` test to the recorder. And in every one of the four
workers, the *generic* catch's `recordWorkerError` sits inside that window:

| worker | offsets of `recordWorkerError` from `instanceof GuardError` (window is 0–600) |
|---|---|
| content | 70, **314** |
| data-ops | 70, **316** |
| mcp | 70, **292** |
| tenancy | 70, **314**, 1605 |

**Simulation C, run today:** replace the 5xx branch's `recordWorkerError` with
`traceError` in each of the four workers, leaving `if (e.status >= 500)` intact.
The check stays **GREEN on all four**, because the second regex is satisfied by
the generic catch two hundred characters below.

This is precisely the failure mode `shared/test/source.ts:8-10` was written to
end — *"`src.slice(src.indexOf(...))` reads to end of file, so every later
function's code counts as this one's"* — reintroduced, with a fixed width instead
of an open one, in the very check written to close the previous instance of it.

**Why it matters.** The behaviour this check exists to lock is the single
highest-value fix of the round. A future refactor that moves the recording out of
the 5xx branch takes the outage-invisibility fault back without turning anything
red.

**Fix.** Bound the window to the branch, not to a character count, and assert one
composite shape rather than two independent ones:

```ts
const branch = balancedBlock(code, code.indexOf("instanceof GuardError"))   // brace-matched, like catchBodies
expect(branch).toMatch(/status\s*>=\s*500[\s\S]{0,120}?recordWorkerError/)
```

Then prove it fails: swap the recorder for `traceError` and confirm red. **A
green test is not a working law** — the repo's own `LESSONS.md` says so.

### R3-2 · MEDIUM — "the `fetch` handler's own catch" is scoped by a terminator only one worker has

`workers/data-ops/test/error-seam.test.ts:54-56`

```ts
const start = code.indexOf("async fetch(")
const after = code.indexOf("async scheduled(", start)
const entry = start === -1 ? "" : code.slice(start, after === -1 ? undefined : after)
```

Two faults, both latent today:

**(a) The end.** Only **tenancy** has an `async scheduled(`. For the other six the
slice runs to end of file, so every helper function below the default export is
inside "the fetch handler's own catch". Measured: auth's slice is 9,316 of
10,220 characters, realtime's 4,283 of 5,008 — roughly 6,500 and 3,600
characters respectively lie *after* the default export closes.

**(b) The start.** `indexOf("async fetch(")` takes the **first** one in the file.
In realtime that is the **Durable Object's** fetch at line 38; the worker's own
entry point is at line 114. The check is reading the wrong handler and is saved
only by fault (a) swallowing the right one.

**Proved exploitable, not merely theorised.** Simulation F: append a plausible
future helper below realtime's default export —

```ts
async function broadcastSafely(env, ch) {
  try { await ch.send() } catch (e) { await recordWorkerError(opsDatabase(env), "realtime", "broadcast", e) }
}
```

— then neuter the real central catch. **The check stays GREEN.** At today's
source it correctly fails (simulation E: all seven red), so this is a trap set,
not a hole open.

**Fix.** Anchor on the default export and brace-match it, then take only the
`fetch` member: find `export default {`, walk to its matching brace, find
`async fetch(` **within that**, and brace-match that. `catchBodies` already
contains the depth-counting walk this needs.

### R3-3 · HIGH — `proxyService` still returns a 503 the store never sees

`shared/workers/trace.ts:127-142` · reached from `workers/gateway/src/index.ts`

Unchanged from rounds 1 and 2, and it is now the **largest single item** in this
review: it holds criterion 1's 15-point row at zero and criterion 8's critical
penalty at −30, which is 2.4 + 2.4 = **4.8 points of the total** on its own.

The gateway's central catch was added in round 2 and is correct. It does not help
here, because `proxyService` never throws. Every downstream outage — auth,
tenancy, content, data-ops, mcp being down or undeployed — reaches the user as a
clean 503 and leaves nothing behind but a console line.

**Fix.** One line, and it must not re-introduce the flood. Record *before*
returning, through the same `/internal/log-error` door the gateway's catch
already uses, and **key it so a sustained outage writes one row per minute per
downstream rather than one per request**. A downstream being down means every
request fails, so an unkeyed recorder here is the amplification pattern blocker 5
was about, wearing a different hat. If the keyed version is too much for one
change, `traceError` + a `db_alerts` row is the cheap correct alternative.

### R3-4 · IMPROVEMENT the rubric cannot score — the flood trigger is gone

`workers/gateway/src/index.ts:64-70`, applied at `:276` and `:284`

Round 2's finding R2-1 was that my own round-1 fix — the gateway's central
catch — had made `safety` materially worse, because `GET /media/%` reached
`decodeURIComponent` unauthenticated, threw a `URIError`, and wrote a row. At
500 requests a second that is 10 GB in under fifteen hours.

`decodeKey` catches the `URIError` and returns `fail(400, "invalid_path", …)`.
A 4xx, recorded nowhere, exactly as `ERROR-HANDLING.md` prescribes. I re-read
the whole `route()` chain above the authentication point for a second
parse-on-attacker-input: the only other is `JSON.parse` at `:236`, inside the
error-beacon route, which sits below `rateLimit(request, env)` at `:181`.

The criterion cannot move, because the rubric's highest band for a floodable
recorder is `high 15` and it was already applied for the missing dedupe — which
is still missing. **Read `safety` = 60 as a much safer 60 than round 2's.**

### R3-5 · MEDIUM — nine unbounded awaited recorder calls, and a failed recording is still silent

`shared/workers/error-log.ts` · nine `await recordWorkerError(...)` sites

The count went from eight to nine this round, and four of the existing sites
gained a second reachable path (the 5xx branch). Every one is `await`ed with no
timeout, on the response path, into a database over a binding. `logError`'s catch
is empty, so a recorder that fails leaves nothing — not even a console line.

The two combine badly with the retention shortfall row: the one deliberate
operational alarm this base has writes into `error_logs`, and if `error_logs` is
the table that is full, that write fails into an empty catch and the alarm is
lost. (Reported as a blocker in `scaling-r3.md` finding D, from the other side.)

**Fix.** One `console.error` in `logError`'s catch — three characters of risk,
and it turns "the store never heard about it" into something a live tail can see.
Separately, route the shortfall alarm to `db_alerts` in the core database.

### R3-6 · MEDIUM — `outbound` has not been touched in three rounds

`shared/workers/d1-rest.ts` · `workers/auth/src/lib/email.ts` · `workers/data-ops/src/lib/model.ts`

Probe, unchanged across all three rounds: `outbound.total = 9`,
`checksOk = 5`, `hasTimeout = 5`, **`recordsNon2xx = 0`**, **`recordsAuth = 0`**.

Nine outbound integrations. Not one records a non-2xx. `sendEmail`
(`workers/auth/src/lib/email.ts:44-70`) returns `false` when `RESEND_API_KEY` is
absent and — the class the rubric names explicitly — an **expired or revoked
Resend key reads to the caller exactly like "email is not configured yet"**.
Nobody would learn that login codes had stopped being delivered until a user
said so. Weight 11, score 51, untouched since 2026-08-11.

---

## The alerting question the brief asked: what is the cheapest option that actually works

Criterion 10 is 20/100 on weight 5. The 20 points it holds are the retention row,
and this round is the first in which they are **honestly** earned: `ERROR-HANDLING.md`
has always described a 90-day log, `RETAIN_ERROR_LOGS_DAYS = 90` has existed for
a while, and until 2026-08-25 the sweep removed 5,000 rows a night against a
table that could grow faster — so the window was declared and not enforced. The
looping sweep makes it true. The remaining 80 points are two rows:

- **40 — a new error signature notifies a person or a channel**
- **25 — a spike in an existing signature notifies**

**The cheapest option is a nightly digest through the sender that already exists,
and it costs one query and one email per environment per day.**

Everything it needs is already built and already paid for:

| piece | where it already is |
|---|---|
| a scheduled handler that runs nightly | `workers/tenancy/src/index.ts` — the only cron in the base |
| an open handle to the operations database on that pass | `opsDatabase(env)`, already used by the retention sweep |
| a working outbound email sender, branded, with a from-address | `workers/auth/src/lib/email.ts:44` `sendEmail` → Resend |
| a service binding from tenancy to auth | already present (`callService(env.AUTH, …)`) |

The whole change is one query and one call:

```sql
SELECT source, place, substr(message, 1, 120) AS sig, COUNT(*) AS n,
       MIN(at) AS first_seen
FROM error_logs WHERE at > ?          -- last 24 h
GROUP BY source, place, sig ORDER BY n DESC LIMIT 20
```

`first_seen` inside the window is what makes a **new signature** visible without a
second query, and `n` is the spike. Send it to a new `OWNER_ALERT_EMAIL` var;
send nothing when the result set is empty, so a quiet day is silent and a mail
arriving means something. That earns the 25-point spike row outright and most of
the 40-point new-signature row (within 24 hours rather than immediately) —
criterion 10 goes 20 → roughly 75, worth **+2.75** on the total.

**The option to NOT build, and why it is worth naming.** The immediate version —
a first-seen check inside `recordWorkerError` that emails on a genuinely new
signature — costs one extra D1 read on the error path and makes the recorder able
to send mail. That is the amplification shape of blocker 5 with a worse
consequence: a caller who can generate novel error signatures generates email.
Criterion 9 (`safety`) would fall further than criterion 10 rises.

**What is genuinely blocked on the owner, not on code.** The rubric says *"Ask
the owner where alerts should go rather than guessing. Score 0 until answered."*
There is no alert destination anywhere in this repository — no `ALERT_EMAIL`, no
webhook, no channel. **One decision (an address) unlocks 55 of the 80 missing
points here.** It is the cheapest point-per-effort item in this review by a wide
margin, and it is not a commit.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **R3-1.** Brace-match the 5xx `GuardError` branch; assert one composite shape; prove it red | `workers/data-ops/test/error-seam.test.ts`, `shared/test/source.ts` (a `balancedBlock` helper) | ADDS ~20 lines of test + one shared helper; REMOVES a check that passes without the behaviour | **lean_mean** — more test code, and lean scores less code better. **story_checks_out** — strictly helps: RULES.md claims this is machine-checked and it half is not. No runtime cost |
| **R3-2.** Anchor the seam scan on the default export, brace-matched | `workers/data-ops/test/error-seam.test.ts` (~10 lines) | REMOVES an over-read of up to 6,500 characters per worker | **lean_mean** — a few more lines. Nothing else: test-only |
| **R3-3.** Record `proxyService`'s 503, keyed to one row per minute per downstream | `shared/workers/trace.ts` (~15 lines), `workers/gateway/src/index.ts` | ADDS a keyed recorder + a small in-isolate map; REMOVES the largest blind spot in the review | **scaling_review** — an UNKEYED version re-opens their blocker 5 exactly; the key is not optional. **speed_review** — one extra awaited call on an already-failing request; negligible. **spend_review** — bounded by the key, so a sustained outage costs 1,440 rows a day, not one per request |
| **R3-4/5.** One `console.error` in `logError`'s catch | `shared/workers/error-log.ts` (1 line) | ADDS one line; REMOVES the only completely silent failure in the recording path | none — a console line on a path that is already failing. It cannot throw and it writes nothing |
| **R3-6.** Record non-2xx and auth failures on the nine outbound integrations | `shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts`, `workers/data-ops/src/lib/model.ts` | ADDS ~8 lines per site; REMOVES the "expired key reads as no results" class | **spend_review** — a failing integration that retries now also writes rows; cap per call site. **speed_review** — an awaited write on an already-failed outbound call. **scaling_review** — more `error_logs` volume into the database their finding A says is unwatched; do their fix first |
| **Alerting.** Nightly digest from the existing cron through the existing sender | `workers/tenancy/src/index.ts`, `shared/workers/retention.ts` or a small new `digest.ts`, one new env var | ADDS one query + one email per environment per day; REMOVES "nobody finds out" | **spend_review** — one Resend send per day per environment, effectively free; the query is one indexed scan of 24 h. **security_sentry_review** — the digest contains error messages, which may carry user data: truncate to 120 chars and never include `stack`. **scaling_review** — the query must carry a `LIMIT` (R14) and does |

---

## CEILING

**Is 95 reachable by changing code? Not while `ctx.waitUntil` stays declined.
The true maximum is ≈94 today, and ≈96 once an alert destination exists.**

Round 2 put the ceiling at 88–90 without an alerting decision. That was
pessimistic, and the correction is worth stating: the 5xx `GuardError` closure
proved criterion 1's structural terminals are not immovable — half of them went
away in one commit.

The realistic best case, criterion by criterion:

```
reach 85×16 + store 100×14 + boot 100×11 + outbound 100×11 + frontend 100×10
+ background 100×9 + row 100×9 + parity 100×8 + safety 93×7 + alerting 35×5
= 1360 + 1400 + 1100 + 1100 + 1000 + 900 + 900 + 800 + 651 + 175
= 9386 ÷ 100 = 93.86 → 94
```

With an alert destination (`alerting` 35 → 85): `+50×5 = +250` → **9636 → 96.**

**The three things a commit in this repository cannot fix:**

- **`reach` (weight 16) tops out at about 85.** Two of the surviving terminal
  paths — `publish()` discarding its Response and `callService` returning null —
  are best-effort **by a locked decision**: `shared/workers/realtime.ts:99-103`
  and `ERROR-HANDLING.md` both say a write must never block on the live layer.
  Recording without blocking is exactly what `ctx.waitUntil` is for, and the
  owner declined it this round *on the correct grounds* that it would keep R1's
  check green while changing what the code does. While that stands, those
  failures either block a successful write or stay unrecorded. There is no third
  option in the Workers runtime.
- **`safety` (weight 7) tops out at 93.** The `medium 7` for personal data in an
  error row cannot be cleared by reading source; it needs a live failing row from
  a running environment. Both environments were last reset to empty, and this
  review is read-only. Permanently **unmeasured** in an unattended run.
- **`alerting` (weight 5) is capped at 35 until the owner names a destination.**
  Not a code question. 55 points behind one address.

**Everything else is a commit.** `outbound` (11), `parity` (8) and `row` (9) —
28 of the 100 weight — are ordinary work that three repair rounds have not
started.
