# Speed review — round 3 — Brimba · 2026-08-25
SCORE: 45/100   (round 1: 37 · round 2: 39)

**Measured at `review-campaign` @ `256d21b`**, working tree clean. Line numbers
are that tree's.

**The headline, and it is not the one round 2 predicted.** Round 2 forecast
39 → 63 from the forty lines of instrumentation. **The forty lines were built,
correctly, and the score moved 39 → 45.** The forecast was arithmetically right
about the destination and wrong about which forty lines reach it: `Server-Timing`
is a *precondition* for the points, not the points. Full working below, and the
next forty lines named precisely.

**Nothing in this report is a measurement.** Every duration still says
`unmeasured` and carries the command that would produce it. The app can now
produce them; nobody has taken one. Both environments were last reset to empty
and this review is read-only, so I cannot take one either.

---

## DELTA

Round 1: **37** → Round 2: **39** → Round 3: **45**

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---:|---:|---:|---:|---|
| 1 | measured (GATE) | 15 | 25 | 25 | **40** | **+15.** `Server-Timing` now exists on every response through the public door, and it is readable in any browser's own network panel. The 35-point row — four real numbers with a source — is still **zero**, because nobody has read one off |
| 2 | readshape | 14 | 27 | 27 | 27 | Unchanged, deliberately. Four `?id=` doors stopped reading whole collections, which is a real read-path win — but rounds 1 and 2 scored that under `round_trip_review`'s overfetch, not here. Crediting it now would make the delta measure my attention rather than the code. No new migration, so every index defect stands |
| 3 | bulk | 13 | 20 | 20 | 20 | Unchanged. The retention sweep now loops to completion under a bound — a genuine robustness win that this criterion's rows do not reward, because they ask about *bulk paths* (import/export), where resume is still 2-of-12 and progress is still not user-facing |
| 4 | budget | 12 | 40 | 40 | **60** | **+20.** `SLOW_MS = 1_000` is the first duration threshold in the base that is *enforced at runtime* and whose breach is visible. It is not the owner's budget — it is 10× the read one — so the 30-point "the budget is checked" row gets 10 of 30, not 30 |
| 5 | writeshape | 11 | 68 | 83 | 83 | Unchanged. Two mediums and one minor stand. Three repairs added awaited work (four 5xx recorder branches, the cron shortfall row, one `new Response` per gateway request); none meets a penalty tier and none was scored as one |
| 6 | deleteshape | 10 | 93 | 93 | 93 | Unchanged. `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`) is still `DELETE FROM sessions WHERE expires_at < ?` with no batch — re-read at its current line |
| 7 | worst known | 9 | 0 | 0 | 0 | Unchanged. No document names the slowest operation, none carries a number for it, it is on no list |
| 8 | production | 8 | 70 | 70 | **85** | **+15.** A slow request now emits a structured line carrying the request id, the worker and `METHOD /path`. Round 2's exact complaint — "`traceError` still fires only on error and still has no duration field" — is answered. Still no tenant and no row count |
| 9 | deferral | 5 | 0 | 0 | 0 | Unchanged. `grep -rn waitUntil` across `shared/`, all seven `workers/*/src`, `web/lib`, `web/components`, `web/app` → **0**. Explicitly declined this round, and for a good reason |
| 10 | trend | 3 | 0 | 0 | **10** | **+10.** A regression past 1,000 ms would now leave a queryable line. Nobody is told, and nothing is kept, so 10 of 40 on one row and 0 on the other |

**No criterion fell.** The answer to this round's second question for this
review: **no other agent's repair broke a speed criterion.** Two repairs added
awaited work to a write path and are itemised as findings so the cost is visible;
neither meets a penalty tier and inventing one to balance the delta would be the
count-tuning the campaign brief forbids.

Arithmetic of the move:

```
(+15 × 15)  measured     225
(+20 × 12)  budget       240
(+15 ×  8)  production   120
(+10 ×  3)  trend         30
                         ---
                         615 ÷ 100 = +6.15    38.96 → 45.11 → 45
```

---

## The forty lines, verified

`shared/workers/trace.ts:162-178`, wired at `workers/gateway/src/index.ts:114-118`.

```ts
export async function timed(req, worker, place, run): Promise<Response> {
  const started = Date.now()
  const res = await run()
  const ms = Date.now() - started
  if (res.status === 101) return res                      // ← the important line
  const out = new Response(res.body, res)
  out.headers.append("Server-Timing", `${worker};dur=${ms}`)
  out.headers.set(REQUEST_ID_HEADER, req)
  if (ms >= SLOW_MS) traceError({ req, worker, place, event: "slow", detail: `${ms}ms` })
  return out
}
export const SLOW_MS = 1_000
```

| claim | verdict |
|---|---|
| emits `Server-Timing` | **TRUE**, on every response through the one public door |
| skips status 101 exactly as warned | **TRUE** — `if (res.status === 101) return res` before any `new Response(...)`. Without it, `new Response(res.body, res)` on an upgrade throws and the live layer stops working for everyone. It is there, and the comment at `:158-162` says why |
| the gateway wraps every response | **TRUE** — `workers/gateway/src/index.ts:116`, inside the central `try`, wrapping the whole `route(...)` chain |
| "plus a log line beside the request id" | **TRUE ONLY OVER `SLOW_MS`** — finding S1 |
| streaming survives | **TRUE** — `new Response(res.body, res)` passes the `ReadableStream` through by reference; the agent's streamed chat is unaffected |
| `timed` is used anywhere else | **NO** — one call site, base-wide. `grep -rn "timed(" workers/*/src shared/` → the definition and `gateway/src/index.ts:116`. So the number is one figure for the whole downstream chain, with no per-worker or per-operation breakdown |

**Corroborating the negatives from scratch**, not from my own round-2 report:

| probe | result |
|---|---|
| `grep -rn "waitUntil"` across `shared/`, `workers/*/src`, `web/lib`, `web/components`, `web/app` | **0** |
| `grep -rniE "server-timing\|SLOW_MS" --include='*.md'` outside `reviews/` | **0** — no project document names either |
| `EXPIRED_SESSIONS_SQL` batched? | no — `shared/workers/retention.ts:117`, unchanged |

---

## Did round 2's 39 → 63 hold? No. Here is exactly why, and it is instructive

**It did not hold: 39 → 45.** The forecast assumed instrumentation would move
criterion 1 to near-full and drag criteria 7, 8 and 10 with it. Three of those
four assumptions were wrong, and the reason is one sentence:

> **A `Server-Timing` header is a capability. The rubric scores numbers.**

Walk the four criteria the forecast was banking on:

| criterion | wt | forecast | actual | why |
|---|---:|---|---|---|
| 1 measured | 15 | ~90 | **40** | Its biggest row (35 pts) is *"a real measured number exists for a typical read, write, delete and bulk run — four numbers, each with a source."* A header nobody has read is zero of those. The 20-pt "slowest realistic case" row is likewise zero — there is no measurement for a case to be inside |
| 7 worst | 9 | ~50 | **0** | *"someone can name the slowest operation without looking"* (50) — nobody can. *"it has a number attached"* (30) — no. *"it is on somebody's list"* (20) — no. Instrumentation makes this **answerable**; it does not answer it |
| 8 production | 8 | ~95 | **85** | Earned the duration half. Lost the context half: the slow line carries route + request id, not tenant and not row count |
| 10 trend | 3 | ~60 | **10** | *"the same operation has been timed more than once, and the numbers are kept"* — `Server-Timing` is a response header. Nothing stores it. The slow line lives in Cloudflare's log buffer under the platform's retention, not in a table anyone can diff |

And 56 of the 100 weight — readshape 14, bulk 13, writeshape 11, deleteshape 10,
deferral 5, worst 9 minus... — cannot be moved by any amount of instrumentation
at all. Round 2 forecast a score, not a mechanism. **The forecast was right about
the destination**: 63 is very close to where the *next* forty lines land (below).
It was wrong that these forty lines were the ones that get there.

---

## Arithmetic

```
DEFECT    = clamp(0, 100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  = Σ points earned
total     = round( Σ (criterion × weight) / 100 )
```

| # | criterion | method | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | measured (GATE) | coverage | 40 | 15 | 600 |
| 2 | readshape | defect | 27 | 14 | 378 |
| 3 | bulk | coverage | 20 | 13 | 260 |
| 4 | budget | coverage | 60 | 12 | 720 |
| 5 | writeshape | defect | 83 | 11 | 913 |
| 6 | deleteshape | defect | 93 | 10 | 930 |
| 7 | worst known | coverage | 0 | 9 | 0 |
| 8 | production | coverage | 85 | 8 | 680 |
| 9 | deferral | coverage | 0 | 5 | 0 |
| 10 | trend | coverage | 10 | 3 | 30 |
| | | | | **100** | **Σ 4511** |

`600+378 = 978; +260 = 1238; +720 = 1958; +913 = 2871; +930 = 3801; +0 = 3801;`
`+680 = 4481; +0 = 4481; +30 = 4511.`
**4511 / 100 = 45.11 → 45.**

**THE GATE HAS LIFTED.** Criterion 1 scored **40**. The rubric caps the total at
45 when criterion 1 is *below* 40; 40 is not below 40, so **no cap applies**. The
45 reported here is the real uncapped total, which happens to equal the cap that
no longer binds — a coincidence worth naming, because it would otherwise look
like nothing changed. Round 2: capped 45, actual 39. Round 3: **uncapped, actual
45.**

### 1 · The four operations have real timings — 40/100 · weight 15 · GATE · was 25

| pts | check | earned | evidence |
|---|---|---:|---|
| 35 | four real numbers, each with a source | **0** | none exist. The app can now produce them; nobody has taken one. Both environments were last reset to empty and this review is read-only |
| 25 | emitted by the app, not measured by hand | **25** | `Server-Timing: gateway;dur=N` on every non-101 response through the one public door (`trace.ts:174`, wired `gateway/src/index.ts:116`). Round 2 awarded this row for Cloudflare observability alone — per-invocation wall time with no code. It is now earned twice over, but the row is worth 25 once |
| 20 | includes the slowest realistic case | **0** | no measurement exists for a case to be inside |
| 20 | anyone on the team can get the number today without asking you | **15** | A browser's Network → Timing panel renders `Server-Timing` natively — no tooling, no access to me, no deploy. Deduct 5: **no project document names it.** `grep -rniE "server-timing\|SLOW_MS" --include='*.md'` outside `reviews/` → 0 hits across 40 root markdown files, and `OPERATIONS.md` still has no timing section |

**40.**

#### The four-operation board — round 3

An empty bar and a fast bar must never look alike, so no bars are drawn.

| operation | budget | measured | source | shape verdict |
|---|---|---|---|---|
| read — `GET /api/content/learning` | 100 ms | **unmeasured** *(now obtainable in one browser reload)* | — | 3 sequential HTTPS round trips to `api.cloudflare.com` minimum (`requireRight` → `listLearning` → `countLearning`). Unchanged |
| write — `POST /api/content/learning` | 250 ms | **unmeasured** | — | 5–8 sequential D1-REST round trips + 2–3 service-binding hops, all awaited. Tail unchanged since round 2: `oneLearning` is one indexed row |
| delete — soft-deactivate / retention sweep | 250 ms | **unmeasured** | — | soft-deactivate: 2 REST hops. Sweep: indexed and batched, now **looping up to 20 passes per rule** — the nightly wall time went up by design, and this is a cron, not a user operation |
| bulk — CSV import, 1,000 rows | 1 min | **unmeasured** | — | one HTTP POST per row, sequential (`import-batch.ts`). Unchanged |

**How to fill the `measured` column today**, so nobody has to ask me:

```
curl -s -D - -o /dev/null https://<staging-host>/api/content/learning \
  -H "Cookie: <session>" | grep -i '^server-timing'
```

That is the whole method. It is the reason criterion 1 crossed the gate and the
reason it did not go higher.

### 4 · A budget exists per operation class — 60/100 · weight 12 · was 40

| pts | check | earned | evidence |
|---|---|---:|---|
| 40 | a target exists for read, write, delete and bulk | **40** | the owner's four (100 / 250 / 250 ms / 1 min), unchanged |
| 30 | the budget is checked, not just declared | **10** | `SLOW_MS = 1_000` is checked on **every** gateway response (`trace.ts:176`) — the first runtime duration assertion in the base. 10 of 30, not 30, because **it is not this budget**: one threshold for all four classes, at 10× the read target and 4× the write one. A read taking 900 ms — nine times its budget — passes in silence |
| 20 | the numbers suit the product rather than being copied from an article | **0** | unchanged from rounds 1–2. No document reconciles the four with the REST door's own round-trip cost, and `SLOW_MS`'s comment calls itself "a budget, so 'slow' is a number someone chose" without saying which product fact chose 1,000 |
| 10 | breaching the budget is visible to someone | **10** | a breach emits `{"level":"error","worker":"gateway","place":"GET /path","event":"slow","message":"1234ms"}` into Cloudflare observability, which is on for all 14 worker/environment pairs. Queryable. Nobody is *told* — that is criterion 10's row, not this one |

**60.**

### 8 · Timings come from production, not a laptop — 85/100 · weight 8 · was 70

| pts | check | earned | evidence |
|---|---|---:|---|
| 40 | durations recorded in the running system | **40** | `Server-Timing` on every response + a structured slow line + observability across 14 pairs |
| 30 | they carry enough context to find the slow one — route, tenant, row count | **15** | route **yes** (`place` = `METHOD /pathname`), request id **yes** (correlates across all seven workers), tenant **no**, row count **no**. Half the row |
| 30 | a local measurement is never presented as a production one | **30** | nothing presents any measurement at all, so the failure mode is unavailable. Same reading as rounds 1–2 |

**85.**

### 10 · There is a trend, not one reading — 10/100 · weight 3 · was 0

| pts | check | earned | evidence |
|---|---|---:|---|
| 60 | the same operation timed more than once, numbers kept | **0** | `Server-Timing` is a response header; nothing reads it, nothing stores it. The slow line goes to `console.error` and lives under Cloudflare's log retention, not in a table anyone can diff |
| 40 | a regression would be noticed by someone other than a customer | **10** | a regression past 1,000 ms leaves a queryable line, so it is **findable**. Nothing alerts, and nobody has looked. 10 of 40 |

**10.**

---

## Findings

### S1 · MEDIUM — the comment promises two places; the code writes one for 99.9% of requests

`shared/workers/trace.ts:153-157`

> *"It writes the number in two places on purpose. `Server-Timing` puts it in the
> browser's own network panel … the log line puts it beside the request id, where
> it can be correlated across the seven workers one click can touch."*

The log line only exists over `SLOW_MS`. For every request under one second — in
a healthy system, effectively all of them — the duration exists **only** in a
response header that nothing collects. That is why criterion 10 is 10 and not 60:
correlation across seven workers is available exactly when a request is already
pathological, and never for the p50 that tells you whether last week's change
helped.

Not a bug — the design is defensible and the alternative (a line per request) has
a real cost, which round 2's cross-review note to `spend_review` already flagged.
But the comment states a capability the code does not have, and a future reader
will budget for a per-request line that is not there.

**Fix.** Either amend the comment to say the log line is the slow path only, or —
better, and it is the cheapest route to criterion 10's 60-point row — add
sampling: `if (ms >= SLOW_MS || Math.random() < 0.01)`. One percent of requests
gives a p50 and a trend at one percent of the cost.

### S2 · MEDIUM — a slow-but-successful request is logged at `level: "error"`

`shared/workers/trace.ts:176` → `traceError({ …, event: "slow", … })`
→ `traceError` writes `JSON.stringify({ level: "error", … })` (`:65-71`)

`timed` routes its slow signal through the function whose name and payload both
say *error*. A request that succeeded, returned 200, and merely took 1,100 ms is
recorded as an error-level event.

Two consequences, both real:

1. **It pollutes the signal `error_log_review` depends on.** Their criterion 10
   proposes alerting off error-level lines. A busy afternoon of slow-but-fine
   requests would light that up.
2. **It costs nothing to fix.** `traceError` is one of two functions in a
   ~180-line file; a `traceEvent` with `level: "warn"` sharing the same body is
   four lines.

Verified this does **not** write to `error_logs` — `traceError` is `console.error`
only, never the store. So there is no scaling or spend cost, only a signal one.

### S3 · MEDIUM — the instrumentation is at exactly one call site, so the number cannot be decomposed

`workers/gateway/src/index.ts:116` is the only caller of `timed`.

`Server-Timing: gateway;dur=N` is one figure for the entire downstream chain: the
gateway, the service-binding hop, the target worker, `requireRight`'s call back
to auth, and every D1-REST round trip underneath. When it reads 800 ms, nothing
says which of those spent it.

The `Server-Timing` header format is *designed* for exactly this — it is a
comma-separated list, and browsers render each entry as its own bar. Each worker
appending its own entry costs one `timed` wrapper per worker's `fetch` handler,
and the gateway's `new Response(res.body, res)` **preserves inbound headers**, so
the entries accumulate for free.

**Fix.** Wrap the other six `fetch` handlers. Six lines total, one per worker,
and it turns one opaque number into a per-hop breakdown. Note the 101 guard is
mandatory in realtime's case for the same reason it is in the gateway's.

### S4 · MINOR — three repairs added awaited work before the response, itemised so the cost is visible

None meets a penalty tier; none was scored as one.

| what | where | cost |
|---|---|---|
| the 5xx `GuardError` recorder | tenancy `:169`, content `:125`, data-ops `:133`, mcp `:198` | one awaited unbounded D1 write, on the failure path only. A 503 that already means an outage now also waits on a database write with no timeout |
| the retention shortfall row | `sharding.ts:485` | one awaited write per cron run that fell short. Cron only, never user-facing |
| `new Response(res.body, res)` per gateway response | `trace.ts:173` | header-object copy; the body is passed by reference and not buffered. Immaterial |

The first is worth watching: `await recordWorkerError` has no timeout, and the
condition that triggers it is often *the database being unreachable*. If the ops
database is the thing that is down, this awaits until the platform kills the
request — turning a clean 503 into a hang. It is nine sites now, up from eight.

---

## What the next forty lines would be — precisely

**Take the four numbers. That is it.**

A script, `scripts/timings.mjs`, roughly forty lines, following the pattern
`scripts/smoke-staging.mjs` already establishes (146 lines, signs in, hits
staging, prints a result):

1. sign in against staging exactly as the smoke script does;
2. issue one read (`GET /api/content/learning`), one write
   (`POST /api/content/learning` then deactivate it), one delete
   (the soft-deactivate), and one bulk run (a 1,000-row CSV import);
3. read `Server-Timing` off each response — the header the gateway now sets;
4. print a four-row table with the date and the environment, and **append it to a
   committed file** so the second run is a trend rather than a replacement;
5. add it to `OPERATIONS.md` as one command anyone can run.

What that alone is worth, using the same arithmetic as above:

| criterion | wt | now | after | Δ×wt |
|---|---:|---:|---:|---:|
| 1 measured | 15 | 40 | **95** | +825 |
| 7 worst known | 9 | 0 | **80** | +720 |
| 10 trend | 3 | 10 | **60** | +150 |
| 4 budget | 12 | 60 | **80** | +240 |
| | | | | **+1935 ÷ 100 = +19.35** |

**45 → 64.** Which is the 63 round 2 predicted, one round late, from a completely
different forty lines. Criterion 1 reaches 95 rather than 100 because the
20-point "slowest realistic case" row needs a populated environment and both were
reset. Criterion 7 reaches 80 rather than 100 because the last 20 points are
*"it is on somebody's list"* — a roadmap entry, not a script.

**Order matters, and this is the one that goes first.** Every other fix in this
review is currently unverifiable: nobody can say whether the four `?id=` doors
made anything faster, whether the retention loop lengthened the cron past a
budget, or whether the next change helps. `Server-Timing` made measurement
possible. Forty lines of script make it *habitual*, and every subsequent speed
fix becomes checkable instead of arguable.

**Second forty lines, if there is appetite:** the six remaining `timed` wrappers
(finding S3), which turn the one number into a per-hop breakdown and make the
slowest hop nameable rather than guessable.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **THE NEXT FORTY LINES.** `scripts/timings.mjs` + an appended results file + one `OPERATIONS.md` section | `scripts/timings.mjs` (new, ~40 lines), `docs/timings.md` (new), `OPERATIONS.md` | ADDS a script and a growing results file; REMOVES "nobody knows how long anything takes" | **lean_mean** — a new script and a new doc are more code and more surface, and lean scores less of both. **spend_review** — one bulk import per run against staging draws real AI quota if the import is agent-planned; use a plain CSV target. **mac_fell_in_the_ocean_review** — strictly helps: a runnable verification anyone can perform |
| **S1.** Sample 1% of requests into the log line | `shared/workers/trace.ts` (1 line) | ADDS ~1 log line per 100 requests; REMOVES the p50 blind spot | **spend_review** — Cloudflare logs are billed by volume; 1% of gateway traffic is the whole app's traffic ÷ 100. Agree the rate with them. **error_log_review** — do S2 first or this multiplies the false error-level signal |
| **S2.** Route the slow signal through a `warn`-level `traceEvent` | `shared/workers/trace.ts` (~5 lines) | ADDS one small function; REMOVES non-errors from the error stream | **error_log_review** — strictly helps: their alerting proposal reads error-level lines, and this stops slow-but-fine requests firing it. **lean_mean** — five more lines in a 182-line file |
| **S3.** Wrap the other six `fetch` handlers in `timed` | `workers/{auth,tenancy,realtime,content,data-ops,mcp}/src/index.ts` (1 line each) | ADDS six wrappers; REMOVES the opaque single number | **realtime_review** — realtime's handler serves the WebSocket upgrade; **the 101 guard is not optional there**, and a careless copy switches off the live layer for everyone. **round_trip_review** — helps: their criterion 10 reads the same header. **lean_mean** — six lines |
| **S4.** Bound the nine `recordWorkerError` awaits | `shared/workers/error-log.ts` (~6 lines) | ADDS a timeout; REMOVES the hang-on-a-dead-database path | **error_log_review** — a timeout means a slow database loses the row, which is exactly the coverage they score. Their `callService`-style bound (5 s, returns rather than throws) is the shape to copy, not a hard abort |
| **Comment correction** on `timed`'s "two places" | `shared/workers/trace.ts` (comment only) | ADDS nothing | none — it makes a stated capability match the code |

---

## CEILING

**Is 95 reachable by changing code? No. The true maximum is ≈94, and the binding
constraint is an owner decision made this round.**

```
measured 95×15 + readshape 88×14 + bulk 100×13 + budget 100×12 + writeshape 100×11
+ deleteshape 100×10 + worst 100×9 + production 100×8 + deferral 20×5 + trend 100×3
= 1425 + 1232 + 1300 + 1200 + 1100 + 1000 + 900 + 800 + 100 + 300
= 9357 ÷ 100 = 93.57 → 94
```

**The three caps, and what each one is:**

- **Deferral (weight 5) is capped at 20, and this is the big one.** The rubric's
  50-point row is *"work the caller does not need is deferred rather than
  awaited"* and its 30-point row is *"what is deferred is guaranteed to run, not
  fire-and-forget."* On Cloudflare Workers there is exactly one construct that
  satisfies both — `ctx.waitUntil` — and the owner **declined it this round**, on
  the correct grounds that applying it to `publishChange` would keep R1's check
  green while changing what the code does. A floating promise is not an
  alternative: the runtime kills it when the response returns, which fails the
  30-point row by definition. So 80 of this criterion's 100 points are behind a
  decision, not a commit. Only the 20-point row ("the response returns as soon as
  the user's answer is ready") is reachable.
- **Criterion 1 (weight 15) tops out at 95.** The 20-point "slowest realistic
  case" row needs a populated environment. Both were reset to empty, and
  `scripts/reset-all.mjs` is how this base is kept clean — so the seeded-large
  environment that would satisfy it does not exist and is not on anyone's plan.
  Reachable in principle; not by a commit alone.
- **Readshape (weight 14) tops out at 88.** R16 requires an exact server
  `COUNT(*)` on every collection read. Every list door therefore carries a scan
  whose cost grows with the collection, and the only shape that removes it is a
  maintained counter, which puts R16's exactness at risk. A Law, deliberately.

**Everything else is a commit**, and the largest single item — 19 points — is
forty lines of script that take four numbers.
