# Speed review — round 4 — Brimba · 2026-08-25
SCORE: 55/100   (R1 37 · R2 39 · R3 45 · **R4 55**)

Measured against `main` @ **`8a7e906`**, working tree clean. Read-only.

**Round 3 predicted 45 → 64. The answer is 55.** The prediction was right about which rows
would move and wrong about how many rows a measurement unlocks: reading four numbers pays
criterion 1 and criterion 4, and it cannot pay criteria 2, 3 and 7, which need code and a
migration. Full working below.

**And for the first time in four rounds, this review contains a measurement I took myself.**

## Arithmetic

| # | Criterion | wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | measured (GATE) | 15 | 25 | 25 | 40 | **75** | **+35. The 35-point row is paid.** Four operations carry a real median with a source and a date in `OPERATIONS.md:401-406`, produced by `scripts/timings.mjs`, and **I re-ran it and reproduced the server-side figures independently** (below). The remaining 25 is per-operation coverage: see F1 |
| 2 | readshape | 14 | 27 | 27 | 27 | **27** | Unchanged. No new migration, no new index. Every index defect from R1 stands |
| 3 | bulk | 13 | 20 | 20 | 20 | **20** | Unchanged. Import resume is still 2-of-12 and progress is still not user-facing. **A number about a health endpoint says nothing about a bulk path** |
| 4 | budget | 12 | 40 | 40 | 60 | **80** | **+20. The 30-point "the budget is checked" row is now paid in full.** There are owner-chosen budgets (800/200/200/200 ms) and `timings.mjs` **exits non-zero when one is breached** — an enforced threshold somebody chose, not `SLOW_MS`'s 10×-the-read-budget proxy. The remaining 20 is that only 4 operations have one |
| 5 | writeshape | 11 | 68 | 83 | 83 | **83** | Unchanged |
| 6 | deleteshape | 10 | 93 | 93 | 93 | **93** | Unchanged. `EXPIRED_SESSIONS_SQL` (`shared/workers/retention.ts:117`) is still an unbatched `DELETE` |
| 7 | worst known | 9 | 0 | 0 | 0 | **20** | **+20, partial.** `OPERATIONS.md:412-427` names the worst *screen* (the ticket page) with a number (16 requests) on a list. The worst **operation** is still unnamed and uncounted — no import, no agent turn, no paged list has a duration anywhere. 1 of 3 rows |
| 8 | production | 8 | 70 | 70 | 85 | **85** | Unchanged. `timed()` moving from `error` to `warn` (`shared/workers/trace.ts:180`) is correct and important, but it changes a severity, not a field: still no tenant, still no row count |
| 9 | deferral | 5 | 0 | 0 | 0 | **0** | Unchanged. `grep -rn waitUntil` across `shared/`, all seven `workers/*/src`, `web/{lib,components,app}` → **0**. Explicitly declined, for a good reason |
| 10 | trend | 3 | 0 | 0 | 10 | **20** | **+10.** `OPERATIONS.md` now keeps a *dated* baseline ("staging, 25 Aug") that a re-run compares against — the first half of a trend. Nothing keeps it automatically and nobody is told, so the other rows stay at 0 |

```
15×75  = 1125      wt sum = 15+14+13+12+11+10+9+8+5+3 = 100
14×27  =  378
13×20  =  260      R3 reproduces on the same weights:
12×80  =  960        15×40+14×27+13×20+12×60+11×83+10×93+9×0+8×85+5×0+3×10
11×83  =  913        = 600+378+260+720+913+930+0+680+0+30 = 4511 → 45.11 → 45  ✓
10×93  =  930
 9×20  =  180      R4 total 5486 ÷ 100 = 54.86 → 55
 8×85  =  680
 5×0   =    0      Move: (+35×15)+(+20×12)+(+20×9)+(+10×3)
 3×20  =   60             = 525+240+180+30 = 975 ÷ 100 = +9.75
        -----             45.11 → 54.86
         5486
```

## The measurement, taken independently

I ran `node scripts/timings.mjs` from the fresh clone against staging. It works, and the
numbers are real:

```
  operation           median   best   worst   server   budget   verdict
  cold page load       168ms   161     520       —     800ms   ok
  auth health          160ms    80     271       5     200ms   ok
  realtime health       84ms    79     192       3     200ms   ok
  mcp health           155ms    80     195       4     200ms   ok
  Every operation is inside its budget.
```

Compare with the recorded table:

| Operation | Doc median (staging, 25 Aug) | **My median** | Doc "server's own" | **My server's own** |
|---|---|---|---|---|
| Cold page load | 83 ms | 168 ms | — | — |
| `auth/health` | 117 ms | 160 ms | 4 ms | **5 ms** |
| `realtime/health` | 152 ms | 84 ms | 9 ms | **3 ms** |
| `mcp/health` | 105 ms | 155 ms | 5 ms | **4 ms** |

The round-trip column does not reproduce and **should not** — the script says so itself
("round-trip includes the network from wherever you ran this"). The **server column does
reproduce**: the doc claims workers answer in 4–9 ms, I measured 3–5 ms. Same order,
same story, different continent. R3's headline — "nothing in this report is a
measurement" — is retired. Somebody has read a number, and now two somebodies have.

## Findings

### F1 · HIGH — not one of the four probes touches a database
`scripts/timings.mjs:27-32`

The four probes are `/`, `/api/auth/health`, `/api/realtime/health`, `/api/mcp/health`. Three
are `return json({ ok: true })` and the fourth is a static asset. **The measured "4–9 ms" is
the cost of a worker doing nothing.**

This base's expensive unit is a REST round trip to a per-team D1 over the network — that is
`OPERATIONS.md`'s own argument, three paragraphs above the table. None of the four probes
makes one. So the sentence "the workers answer in 4–9 ms; the rest is network" is true of the
four endpoints measured and **unevidenced for every endpoint anybody waits on**.

Why it matters: this is the number a future reader will quote to close a performance
argument. It is a genuine measurement of a non-representative thing, which is more dangerous
than no measurement, because it retires the suspicion. It is also exactly why criteria 2, 3
and 7 did not move.

**Fix — and this is the next move.** Add three authenticated probes to `PROBES` behind a
token flag: one paged list read (`GET /api/tenancy/members`, budget 400 ms), one record
detail with its activity feed (budget 500 ms), one write (`POST /api/content/help` into a
scratch team, budget 600 ms). Each crosses gateway → worker → auth → D1 REST, which is the
hop shape everything real has. That single change is worth more than the other four probes
together: it pays criterion 1's remaining 25, most of criterion 7's 80, and gives criterion 2
its first evidence that an index matters.

### F2 · MEDIUM — the budget table's own conclusion outruns its data
`OPERATIONS.md:408-410`

> "a slow-feeling app is almost never slow code here — check the hop count first"

Directionally right and consistent with the architecture, but it is stated as a finding when
it is a hypothesis: the evidence is four health checks. **Fix:** either add the probes in F1
so the sentence is earned, or soften it to name its own scope ("on the endpoints measured so
far…"). Cheap; keeps the doc honest between now and F1.

### F3 · LOW — nothing re-runs the timings, so the dated baseline decays
`scripts/timings.mjs` is in no gate. It exits non-zero on breach — which is precisely what a
gate wants — and no gate calls it. **Fix:** add it to the `/ship-staging` flow after the
smoke. Not to `npm run check`: it needs the network, and a check that fails on a flaky
connection is a check people learn to skip.

### F4 · resolved, verified — `timed()` no longer poisons the error log
`shared/workers/trace.ts:176-181`. A slow-but-successful request emits
`{level:"warn", event:"slow", req, worker, place, ms}` via `console.warn`, deliberately not
through `traceError`. R3's concern is closed and the comment explains why, which is the
version of this that survives the next refactor.

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| F1 — three authenticated probes that cross D1 | `scripts/timings.mjs` (+~25 lines), `OPERATIONS.md` (3 table rows) | ADDS representative measurement; REMOVES the health-check-only blind spot | **spend_review** — the probes are real endpoint hits (reads are free per MCP.md, but they are worker invocations and D1 row reads, and a write probe creates rows). **first_run_review** — a write probe needs a scratch team with data, which is state somebody must own and clean up. **security_sentry** — it needs a token in CI; a long-lived probe credential is a new secret to hold (use a short-TTL test-login, not a stored PAT) |
| F2 — scope the "almost never slow code" sentence | `OPERATIONS.md` (1 sentence) | REMOVES an over-claim | **none — it narrows a claim to its evidence.** Mildly *helps* story_checks_out |
| F3 — run `timings.mjs` in the ship-staging gate | the ship-staging skill/flow | ADDS ~20 s to a deploy; REMOVES baseline decay | **none for a review.** Cost is operator patience, and a flaky network makes a deploy fail for a non-deploy reason — which is why it belongs in ship-staging and *not* in `npm run check` |
| Add an index for criterion 2 (deferred, not proposed yet) | a new team migration + `DATA-MODEL.md` | ADDS read speed | **scaling_review + spend_review** — an index is storage per team database, and this base has one D1 per team, so the cost multiplies by tenant count. **Do not add one before F1**, or there is no number to prove it helped |

## CEILING

**95 is not reachable by changing code. The true maximum is ≈ 84, and the cap is criterion 9.**

| Criterion | wt | Now | Max | Why capped |
|---|---:|---:|---:|---|
| 9 · deferral | 5 | 0 | **0** | **Locked decision.** `waitUntil` is declined deliberately: on Workers, work deferred past the response still bills, and the base's error-recording path must complete before the response so a failure cannot be lost. Relitigating it is an ARCHITECTURE.md conversation, not a commit. **500 weighted points permanently unavailable** |
| 2 · readshape | 14 | 27 | ~75 | Needs a migration per team database — real work, and gated on F1 to justify it |
| 3 · bulk | 13 | 20 | ~70 | Import resume is a design change (2-of-12 paths resumable); user-facing progress needs the realtime channel |
| 8 · production | 8 | 85 | 95 | Tenant + row count in the slow line — cheap |
| 10 · trend | 3 | 20 | ~60 | Needs somewhere to *keep* timings; this base has no metrics store and adding one is a new dependency, which the anti-bloat mandate resists |

Optimistic ceiling with everything except criterion 9 pushed to its realistic max:
`15×100 + 14×75 + 13×70 + 12×95 + 11×90 + 10×95 + 9×85 + 8×95 + 5×0 + 3×60`
= 1500+1050+910+1140+990+950+765+760+0+180 = **8245 → 82**.

Even granting perfect scores on everything but criterion 9, the arithmetic tops out around
**84**. **95 requires either reversing the `waitUntil` decision or accepting a metrics
dependency** — both owner decisions, neither a commit.

**Next move, in order:** F1 (three real probes) → F2 (one sentence) → F3 (the gate). F1 is
the only one that unlocks other criteria, and it is roughly 25 lines.
