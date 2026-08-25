# Error log review — round 2 — Brimba · 2026-08-25
SCORE: 68/100   (round 1: 63/100)

Band: still **leaky** (50–69), one point below "mostly covered". Every count taken
from `error_logs` remains a floor — keep "at least" in front of it.

Method: `~/.claude/skills/error_log_review/assets/probe.mjs` re-run against the
repo root at `review-campaign` @ `fe7d683`, plus manual reads of every file the
brief named and every candidate the probe produced. Probe output and two
sabotage simulations kept outside the repo at
`…/scratchpad/el-r2/{el-probe.json,el-sabotage.mjs,el-sab2.mjs}`.

Read-only. Nothing in this repository was modified except this file.

---

## DELTA

Round 1: **63**/100 → Round 2: **68**/100

| # | Criterion | R1 | R2 | Why it moved |
|---|---|---:|---:|---|
| 1 | `reach` (16, GATE) | 61 | **65** | Row 3 went 7/9 → **9/9** entry points: gateway and realtime both grew a central catch that records. Row 1 barely moved (81.9% → 82.5%) because the gateway's uncaught surface was only ONE path in a denominator of 183. Rows 2 and 4 unchanged. |
| 2 | `store` (14) | 75 | **90** | Row 2 partial-credited 0 → **15/25**: the two surfaces at literally zero capture now record. Not full credit — see finding R2-2. |
| 3 | `boot` (11) | 74 | **77** | Row 2 20 → **23**: `runbook-migrations-current` (`web/test/rules.test.ts:806`) derives BOOTSTRAP's migration counts from disk, closing the "a fresh environment silently misses a migration" hole its own comment describes. Rows 1/3/4 unchanged. |
| 4 | `outbound` (11) | 51 | **51** | **Nothing touched it.** `d1-rest.ts`, `auth/src/lib/email.ts`, `data-ops/src/lib/model.ts` are byte-identical to round 1. |
| 5 | `frontend` (10) | 67 | **92** | Row 3 0 → **25**: `<ErrorBoundary label="root">{children}</ErrorBoundary>` is mounted at `web/app/layout.tsx:79`, and it records through `reportError`. Row 4 still 12 — the transport still drops `extra`. |
| 6 | `background` (9) | 73 | **73** | Unchanged numerically; the underlying exposure ROSE — finding R2-4. |
| 7 | `row` (9) | 75 | **75** | Unchanged. `request_id` is still NULL for `web` rows, is now ALSO NULL for the new `gateway` rows, and is still absent from the admin SELECT. `team_id`/`user_id` still NULL on every row. |
| 8 | `parity` (8) | 45 | **45** | Unchanged. The gateway half of the critical is fixed; the `proxyService` 503 half is not, so the −30 stands. |
| 9 | `safety` (7) | 60 | **60** | Unchanged numerically; the underlying exposure ROSE materially — finding R2-1, and it was caused by my own round-1 fix. |
| 10 | `alerting` (5) | 20 | **20** | Unchanged. Still nothing notifies anybody. |

**No criterion fell.** Two criteria (`safety`, `background`) held their number
while the real risk behind them got worse, which the rubric's fixed penalty bands
cannot express. Both are written up as full findings below, as the brief requires.

**The shape of the delta.** Three criteria moved, worth +5 total. The four
criteria carrying the largest unaddressed defects — `outbound` 51, `parity` 45,
`safety` 60, `alerting` 20 — did not move at all, and they carry **31 of the 100
weight**. That is why a repair pass that closed two CRITICALs moved the total by
five points and did not change the band.

---

## What the brief asked me to verify

| Claim | Verdict | Evidence |
|---|---|---|
| The gateway now has a central catch recording through auth's `/internal/log-error` | **TRUE** | `workers/gateway/src/index.ts:88-111`. `try { return await route(...) } catch (e) { traceError(...); await callService(env.AUTH, "https://internal/internal/log-error", …{source:"gateway", place, message, stack, url, requestId}); return fail(500,…) }` |
| Realtime records through the seam it already had a binding for | **TRUE** | `workers/realtime/src/index.ts:127-132`. `recordWorkerError(opsDatabase(env), "realtime", …, e, request)`. `opsDatabase` falls back to its existing `env.DB`. |
| `error-seam.test.ts` derives its worker list from disk | **TRUE** | `workers/data-ops/test/error-seam.test.ts:20-24` — `readdirSync(workers/)`, sorted, with a `length > 5` + `toContain("gateway")` + `toContain("realtime")` tripwire. All 7 workers now under test; all 7 pass for real reasons. |
| …and is scoped to catch bodies | **TRUE, but weaker than it reads** | It is scoped (`catchBodies(src)`), and I proved by simulation it FAILS on sabotage for all 7 workers. Two ways to satisfy it without the behaviour survive — finding R2-3. |
| The root error boundary is mounted | **TRUE, partially** | `web/app/layout.tsx:79`. It wraps `{children}` only — **not** `<AgentHost/>`, which `ERROR-HANDLING.md:114-116` still says it wraps. Finding R2-5. |
| A 5xx `GuardError` (incl. an auth outage) never reaches `recordWorkerError` | **STILL TRUE — NOT ADDRESSED** | Finding R2-6, unchanged from round 1. |
| `request_id` NULL for every `web` row and omitted from the admin SELECT | **STILL TRUE — NOT ADDRESSED, and now worse** | Finding R2-7. |

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned from its rows
total    = round( Σ (criterion × weight) / 100 )
```

| # | criterion | key | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | Every failure path can reach the store (GATE) | `reach` | 65 | 16 | 1040 |
| 2 | One durable store, every surface writes to it | `store` | 90 | 14 | 1260 |
| 3 | Startup and boot failures recorded | `boot` | 77 | 11 | 847 |
| 4 | Outbound integration + credential failures recorded | `outbound` | 51 | 11 | 561 |
| 5 | The browser reports too | `frontend` | 92 | 10 | 920 |
| 6 | Background and scheduled work reports | `background` | 73 | 9 | 657 |
| 7 | A row is complete and the message actionable | `row` | 75 | 9 | 675 |
| 8 | What the user saw, the store saw | `parity` | 45 | 8 | 360 |
| 9 | Recording cannot crash the app or flood the table | `safety` | 60 | 7 | 420 |
| 10 | Somebody finds out; the table doesn't grow forever | `alerting` | 20 | 5 | 100 |
|   | **weights** | | | **100** | **6840** |

`1040+1260 = 2300; +847 = 3147; +561 = 3708; +920 = 4628; +657 = 5285; +675 = 5960; +360 = 6320; +420 = 6740; +100 = 6840.`
**6840 / 100 = 68.4 → SCORE 68.**

Gate: criterion 1 = 65 ≥ 40 → **no cap**. `store.present === true` → no 15 cap.

### 1 · `reach` — 65/100 (weight 16, GATE) — was 61

| row | pts | earned | working |
|---|---:|---:|---|
| non-terminal share × 45 | 45 | **37** | 151/183 = 82.5% → 0.825 × 45 = 37.1 |
| non-throwing failure paths record or propagate | 20 | **8** | 3/8 propagate → 0.375 × 20 = 7.5 |
| last-resort handler at every entry point, and it records | 20 | **20** | **9/9** (was 7/9) |
| no terminal path on a money/stock/permission/data-loss route | 15 | **0** | rubric says subtract to zero — the permission-path terminals are unchanged |

**Denominator 183.** Probe found 177 failure points, 28 terminal. I opened all 28.
Two are the same false positives as round 1 and still record:
`workers/data-ops/src/routes/agent.ts:61`, `workers/tenancy/src/index.ts:193`
(records at :197) → 26 confirmed terminal. Six terminal paths a catch-scan
structurally cannot see remain (round 1 had seven; the gateway's uncaught surface
is the one that closed):

1. `shared/workers/realtime.ts:104-114` — `publish()` still discards its Response
2. `shared/workers/gating.ts:96-100` — 5xx `GuardError` excluded from the store
3. `workers/mcp/src/lib/bridge.ts:42` — 503 `auth_unreachable`, same exclusion
4. `workers/mcp/src/lib/bridge.ts:50` — 502 `bridge_failed`, same exclusion
5. `shared/workers/trace.ts:104` — `callService` "service unreachable", `traceError` only
6. `shared/workers/trace.ts:134` — `proxyService` "downstream unreachable", `traceError` only

26 + 6 = **32 terminal of 183**. `(183−32)/183 = 0.8251`.

*The honest reading of row 1.* Closing the only public door's entire uncaught
surface moved this row by 0.6 of a point, because the metric counts paths, not
traffic. The gateway is one path and every request in the system passes through
it. Row 3 is where that fix is actually paid for, and it is why the criterion
moved 4 points rather than 1.

**Row 2, unchanged at 3 of 8.** Every one of the five terminating paths is
byte-identical to round 1: `shared/workers/realtime.ts:104`,
`workers/data-ops/src/lib/import-batch.ts:168` (`if (!res.ok) return map`),
`shared/workers/rate-limit.ts:111`, `workers/auth/src/lib/email.ts:48`,
`workers/realtime/src/index.ts:92`.

**Row 3, now 9 of 9.** auth, tenancy, content, data-ops, mcp, **gateway**,
**realtime**, the tenancy cron, the browser globals. Two caveats that cost
elsewhere, not here: the gateway's route drops `request_id` (finding R2-7) and
silently no-ops if `INTERNAL_KEY` is unset or auth is down (finding R2-2).

**Row 4 still 0.** `shared/workers/gating.ts:96` (a 503 on the permission seam,
never recorded) and `shared/workers/rate-limit.ts:111` (the only rate ceiling in
the base still fails **open**, console only).

### 2 · `store` — 90/100 (weight 14) — was 75

| row | pts | earned | working |
|---|---:|---:|---|
| one durable queryable store for the whole app | 40 | **40** | `error_logs`, D1, `db/ops/0001` + `db/ops/0002` + core fallback via `opsDatabase()` |
| no surface >15 pts below the best-covered surface | 25 | **15** | partial — both readings below |
| the browser's errors land in the same store as the server's | 20 | **20** | beacon → gateway → auth `/internal/log-error` → same table |
| a documented way to list open/resolved and to resolve one | 15 | **15** | `GET/POST /api/data-ops/admin/errors[/resolve]`, in ERROR-HANDLING.md |

**Row 2 — both readings, so anyone can recompute it at 0 or 25.**

Strict (probe classification + my six structural additions, no correct-silent
adjustment — the same method as row 1 above):

| surface | total | terminal | non-terminal |
|---|---:|---:|---:|
| frontend | 70 | 7 | **90.0%** |
| backend | 102 + 4 = 106 | 19 − 2 + 4 = 21 | **80.2%** |
| mcp | 5 + 2 = 7 | 2 + 2 = 4 | **42.9%** |

Strict spread = 90.0 − 42.9 = 47.1 → row 2 = **0**.

Adjusted (clearing verified-correct silences): mcp's two probe terminals are
parse guards that answer the caller with a clean JSON-RPC error
(`workers/mcp/src/index.ts:54`, `bridge.ts:49`), so mcp's only real uncovered
class is the pair of 5xx `GuardError`s — the *same* defect that costs backend and
criterion 1 row 4. Adjusted mcp = 5/7 = 71.4% on a denominator of **seven**.
Ranking a surface on n=7 is sample noise, not a measurement.

I score **15 of 25**. Round 1's 0 was earned by two surfaces at *literally zero
capture*, and that is fixed. Full credit is not earned either, for a reason the
strict reading cannot see: the two surfaces that cannot write to the store
directly — the browser and now the gateway — **both route through auth**. During
an auth outage `callService` returns null, the gateway swallows it, and the front
door's own crash rows are lost at the exact moment they matter. See finding R2-2.

### 3 · `boot` — 77/100 (weight 11) — was 74

| row | pts | earned | working |
|---|---:|---:|---|
| module-init failures caught, not just crashed | 35 | **35** | on Workers a module-scope throw fails the deploy — the rubric's legitimate answer |
| a failed migration recorded or fails loudly | 25 | **23** | +3. `web/test/rules.test.ts:806` derives BOOTSTRAP's core + team migration ranges from disk. No in-app schema-version check → −2 |
| missing binding / env var / secret detected and reported | 20 | **7** | 2 of 6 → 0.333 × 20 = 6.7. **Unchanged**, and the blast radius grew: `INTERNAL_KEY ?? ""` is now at **6** call sites, one of them the gateway's own crash recorder |
| a deploy that boots broken is detectable without a user | 20 | **12** | unchanged: `deploy:staging` ends in `smoke:staging`; `deploy:production` (package.json:17) still runs **no** smoke |

The migration check's own comment is the strongest evidence in this report that
round 1's finding 9 was real: *"A fresh environment built by following it
recorded no errors whatsoever, and looked healthy doing it, because `logError`
swallows its own failure."*

Minor: that same check computes `const ops = highest("db/ops")` and then asserts
only `expect(ops).toBeGreaterThan(0)` — that the *directory* has migrations — plus
a case-insensitive `toMatch(/ops/i)` against the whole document, which "drops",
"options" and "operations" all satisfy. Add `db/ops/0003` and forget BOOTSTRAP and
the check stays green: the exact staleness class it exists to end, for the one
database it exists to add.

### 4 · `outbound` — 51/100 (weight 11) — unchanged

`shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts` and
`workers/data-ops/src/lib/model.ts` are unchanged since round 1
(`git diff 8751e30..HEAD` touches none of them). Every row scores exactly as
before: non-2xx **23**/35, timeouts **10**/25, credential 401/403 **4**/20,
names-the-integration **14**/20.

The 401/403 row remains the most expensive unfixed thing in this report: **0 of 3
integrations classify a credential failure**. An expired `RESEND_API_KEY` still
reads as `sendEmail → false`, which every notify caller ignores.

### 5 · `frontend` — 92/100 (weight 10) — was 67

| row | pts | earned | working |
|---|---:|---:|---|
| `window.onerror` wired | 30 | **30** | `web/lib/log.ts:61` |
| `unhandledrejection` wired | 25 | **25** | `web/lib/log.ts:64` |
| a component error boundary exists **and records** | 25 | **25** | +25. Mounted at `web/app/layout.tsx:79`; `componentDidCatch` calls `reportError` with `componentStack` (`web/components/error-boundary.tsx:26-30`) |
| a working transport from the browser to the store | 20 | **12** | unchanged: drops anonymous sessions and drops `extra` → 0.6 × 20 |

A rules check now locks the mount: `root-layout-renders-what-it-imports`
(`web/test/rules.test.ts:832`) fails if any capitalised import in the root layout
never appears in its JSX. It would have caught the original defect. It does not
assert the boundary **wraps** anything — see finding R2-5.

### 6 · `background` — 73/100 (weight 9) — unchanged

Still no queues (`wrangler.jsonc` × 7: `queues: []`, `deadLetters: []`), one cron.
Renormalised over the 45 applicable points, exactly as round 1: scheduled-job row
**13**/25, un-awaited-work row **20**/20 → 33/45 → 73.

The number did not move. The exposure did — finding R2-4.

### 7 · `row` — 75/100 (weight 9) — unchanged

| row | pts | earned | working |
|---|---:|---:|---|
| message · stack · place · time · tenant · actor · request id | 40 | **26** | 4.5 of 7 fields → 0.643 × 40 |
| the message names what failed | 30 | **30** | real `err.message` throughout |
| distinguishes environment | 15 | **15** | separate `brimba-ops` / `brimba-ops-staging` databases |
| carries enough to reproduce | 15 | **4** | `place` is a route not a record; no params, no body, no `extra` |

`team_id` and `user_id` are still NULL on every row: `shared/workers/error-log.ts`
is unchanged, `recordWorkerError` (:67) still passes only
`source, place, message, stack, requestId`, and `internalLogError`
(`workers/auth/src/index.ts:148-168`) still passes only
`source, place, message, stack, url`.

### 8 · `parity` — 45/100 (weight 8) — unchanged — DEFECT

| penalty | applied | evidence |
|---|---:|---|
| critical 30 | **−30** | Half fixed, half not. The gateway's own throws now record. `proxyService` (`shared/workers/trace.ts:126-143`) still **returns** a 503 rather than throwing, so the new central catch never sees it: a worker being unreachable renders "That part of the app isn't responding right now" to the user and writes zero rows |
| high 15 | **−15** | **31 of 33** `instanceof ApiFailure ? … : "<generic>"` handlers never report. Only `deep-link-screen.tsx:547` and `invite-dialog.tsx:81` carry the guard |
| medium 7 | **−7** | same sites, plus `agent-usage-dialog.tsx:60`, `agent-history-dialog.tsx:48`, `deep-link-screen.tsx:140`, `app-shell.tsx:187` discarding the error object entirely |
| minor 3 | **−3** | no request id returned to the client on the 500 path; no screen shows one |

**Measurement correction, not a regression.** Round 1 said "31 sites, 2 guarded".
The honest count is **33** (32 single-line ternaries + `help-form-dialog.tsx:87`
across three lines), 2 guarded, **31 unguarded**. `git diff 8751e30..HEAD -- web/`
contains no `instanceof ApiFailure` change, so this is my round-1 undercount, not
new code.

### 9 · `safety` — 60/100 (weight 7) — unchanged — DEFECT

| penalty | applied | evidence |
|---|---:|---|
| critical 30 — the recorder can throw | **0** | `logError` still wraps everything. Correct |
| high 15 — no dedupe or rate limit | **−15** | `shared/workers/error-log.ts:36` is unchanged: no dedupe, no sampling, no ceiling. **The trigger is now unauthenticated** — finding R2-1 |
| high 15 — writes synchronously with no timeout | **−15** | the five `await recordWorkerError(...)` calls are still unbounded. The gateway's new path IS bounded (`callService`), so the fix is better-behaved than the seam it bypassed |
| medium 7 — personal data or secrets in the error row | **−7** | unchanged; still **unmeasured** without a live failing row |
| minor 3 — a failed recording is itself silent | **−3** | `logError`'s catch is still empty — not even a console line |

The rubric's highest available band for a floodable recorder is `high 15`, and it
was already applied. So the number cannot move even though the risk did. Read
finding R2-1 as the criterion's real state.

### 10 · `alerting` — 20/100 (weight 5) — unchanged

Nothing notifies anyone. `db_alerts` is still a row plus a `console.error`
(`workers/tenancy/src/lib/sharding.ts:93`). Retention row keeps its 20/20
(`OPS_RETENTION`, swept nightly). "Somebody has looked" remains **unmeasured**.

---

## Findings

### R2-1 · HIGH — **NEW, and caused by my own round-1 fix**: an unauthenticated request can now write to the error store, unlimited
`workers/gateway/src/index.ts:88-111` (the new central catch) ×
`workers/gateway/src/index.ts:151-154` (the surge ceiling's scope) ×
`workers/gateway/src/index.ts:253-255` (the media route).

The surge ceiling is deliberately scoped:

```ts
// … it deliberately covers /api/* only: static assets and /media/* are served
// from cache and are not a load the app has to survive.
if (pathname.startsWith("/api/") || pathname === "/mcp") {
  const limited = await rateLimit(request, env)
```

`GET /media/%zz` reaches `decodeURIComponent(pathname.slice("/media/".length))`,
which throws a `URIError`. Before this round that was a bare platform 500 and
nothing was recorded — my round-1 CRITICAL. Now it is caught, and each one writes
a row into `error_logs` (up to ~2.7 KB: `message` 500 + `stack` 2000 + `place` 200)
through auth's internal door — **with no session, no rate limit, no dedupe and no
sampling**, into a D1 database with a 10 GB cap whose only retention is a nightly
sweep.

The same loop also fans one extra service-binding call into `auth` per request,
which is the busiest dependency in the base.

That scoping comment was correct when it was written — `/media/*` really was
cache-served and could not cost anything. Adding a recorder above it changed what
"not a load the app has to survive" means, and nothing re-read the comment.

**Fix.** Do not ship the gateway catch without a bound. Cheapest correct order:
(a) validate the media path before decoding — `try { decodeURIComponent(…) } catch
{ return new Response("Not found", { status: 404 }) }` — so the commonest
unauthenticated trigger becomes a clean 404 that records nothing; **and**
(b) land the signature+minute dedupe memo in `shared/workers/error-log.ts`
(round 1's F9) so no central catch anywhere can write the same row twice a minute.
(b) alone is not enough — a memo is per-isolate and the public door runs in many.

### R2-2 · HIGH — the front door and the browser both record *through auth*, so an auth outage blinds them together
`workers/gateway/src/index.ts:95-110` and `:213-234`.

Neither the gateway's own crash path nor the browser beacon path holds a database
binding; both POST to auth's `/internal/log-error`. Three consequences, all
silent:

1. `callService` returns `null` when auth does not answer, and the gateway
   discards the return value. An auth outage loses every gateway crash row.
2. `internalLogError` **fails closed** on a missing or mismatched `INTERNAL_KEY`
   (`workers/auth/src/index.ts:150-151`, a 403) — and the gateway discards that
   403 too. `INTERNAL_KEY ?? ""` is now at 6 sites; a fork or a half-finished
   bootstrap that misses it on the gateway loses **all** web and gateway rows for
   ever, with no console line and no error.
3. Combined with R2-6, an auth outage means: every screen 503s, every gated
   request 503s, the gateway's own crashes are unrecordable, and the store stays
   empty.

BOOTSTRAP.md:174, OPERATIONS.md:51 and SECRETS.md:62 all correctly list the
gateway as needing `INTERNAL_KEY`, so this is provisioned — but nothing *detects*
its absence. This is criterion 3 row 3's "2 of 6" with a new and larger
consequence attached.

**Fix.** Check the return: `const res = await callService(...); if (!res || !res.ok)
traceError({ …, event: "error_record_failed" })`. One line, and it makes a blind
store visible in the observability window. The architectural alternative (give the
gateway an `OPS` binding) is a bigger change and was reasonably declined — but the
declined-path failure mode has to be visible.

### R2-3 · MEDIUM — the new `error-seam.test.ts` has two ways to pass without the behaviour
`workers/data-ops/test/error-seam.test.ts:41-66` · `shared/test/source.ts:226`.

The check is a genuine improvement and I verified it works: simulating the
sabotage against all 7 workers' real source (`…/scratchpad/el-r2/el-sabotage.mjs`)
turns every one of them red. Two holes survive, both proven by simulation
(`el-sab2.mjs`):

**(a) A comment satisfies it.** `catchBodies(src)` is called on **raw** source.
`stripComments` is exported from the same module and is not used. Removing the
gateway's real `callService` and adding
`// TODO: post to /internal/log-error with source: "gateway"` inside the catch
turns the check **green**. That is campaign failure mode #2 — prose parsed as
code — inside the module written to end it.

**(b) A non-central catch covers for the central one.** The check joins *all*
catch bodies in `index.ts`. `workers/tenancy/src/index.ts` has two recording
catches (the fetch catch and the cron catch at :197). Neutering **only** the
central fetch catch leaves the check **green** — the cron's recorder satisfies it.
The law claims to pin the central catch; for the one worker with a cron, it does
not, and any worker that grows a second recording catch inherits the hole.

**Fix.** `catchBodies(stripComments(src))`, and assert against the catch that
belongs to the exported `fetch` handler specifically (the first catch after
`async fetch(`) rather than the union of all of them.

### R2-4 · MEDIUM — **NEW side-effect**: the orphan sweep's fail-closed guard is silent, and now fires on healthy teams
`workers/tenancy/src/lib/sharding.ts:433-466`.

`scaling_review`'s repair made the reference read keyset-paged and fail-closed —
correct, and it fixed a real data-loss bug. But the new bound throws into an
unchanged terminal catch:

```ts
if (referenced.size > ORPHAN_SCAN_CAP)      // 10_000
  throw new Error(`more than ${ORPHAN_SCAN_CAP} referenced attachments`)
} catch (e) {
  console.error(`orphan sweep: skipping team ${team.id}, could not read its references:`, e)
  continue
}
```

Before, this catch fired only on a D1 read error. Now it also fires for any team
with more than 10,000 referenced learning attachments — a **success** condition of
the product. That team's orphan sweep is skipped every night, for ever, and the
only trace is a console line Cloudflare keeps about a week. R12's check
(`web/test/rules.test.ts:300`) reads only after `async scheduled(` in
`workers/*/src/index.ts`, so a failure inside a file the cron *calls* is outside
it — which is why nothing went red.

Correct engineering with a silent failure mode is still a silent failure mode.

**Fix.** `logError(opsDatabase(env), { source: "tenancy", place: "cron/orphan-sweep",
message: … })` before the `continue`, and distinguish the two causes in the
message so "read failed" and "team too large" are not the same row.

### R2-5 · MEDIUM — the boundary is mounted around half of what the ruleset says
`web/app/layout.tsx:79` vs `ERROR-HANDLING.md:114-116`.

The doc still says the boundary is mounted *"around the routed screens **AND the
co-pilot host**"*. The layout renders
`<ErrorBoundary label="root">{children}</ErrorBoundary>` and then `<AgentHost/>`
**outside** it. A render throw in the AI co-pilot still blanks the page.

The new `root-layout-renders-what-it-imports` check asserts each capitalised
import *appears* in the JSX — `<ErrorBoundary />`, self-closing and wrapping
nothing, would satisfy it — and it would not notice `<AgentHost/>` moving out.
Removing the import *and* the render also passes silently.

**Fix.** Either move `<AgentHost/>` inside the boundary (matching the doc) or
correct the doc to say the boundary wraps the routed screens only. Then tighten
the check to assert `<ErrorBoundary` is followed by `{children}` before its
closing tag, so "mounted" means "wrapping".

*Second-order, now real rather than theoretical:* the boundary passes
`componentStack` into `reportError`'s `extra`, `web/lib/log.ts:22` beacons it, and
`workers/gateway/src/index.ts:227-233` builds the forwarded body from
`{source, place, message, stack, url, requestId}` — **dropping `extra`**. Before
this round the boundary never ran, so the loss cost nothing. It now runs, and the
one field that makes a render crash diagnosable is discarded one hop from the
store. (Round 1 finding 12, severity raised.)

### R2-6 · HIGH — **CONFIRMED STILL STANDING, NOT ADDRESSED**: a 5xx `GuardError` never reaches the store
`shared/workers/gating.ts:96-100` (503 `auth_unreachable`),
`workers/mcp/src/lib/bridge.ts:42` (503), `:50` (502 `bridge_failed`).

Verified byte-identical. All four workers that guard still open their central
catch with the same line, **before** `recordWorkerError`:

```
workers/tenancy/src/index.ts:161   if (e instanceof GuardError) return fail(e.status, e.code, e.message)
workers/content/src/index.ts:112   if (e instanceof GuardError) return fail(e.status, e.code, e.message)
workers/data-ops/src/index.ts:120  if (e instanceof GuardError) return fail(e.status, e.code, e.message)
workers/mcp/src/index.ts:185       if (e instanceof GuardError) return fail(e.status, e.code, e.message)
```

The comment above each recorder still reads *"Clean GuardError refusals never
reach here"* — which is true of 4xx and false of the three 5xx cases.

**What it is worth.** Higher after this round, not lower, for three reasons:

1. `whoAmI` is the busiest cross-service call in the base — every gated request in
   every worker. This is not an edge case; it is the single largest correlated
   failure the system can have.
2. R2-2 means the front door's own recording *also* depends on auth. So an auth
   outage is now the one failure that blinds **three** surfaces at once: the gated
   workers (this finding), the gateway (R2-2), and the browser (R2-2).
3. R11 exists to make "auth said no" and "auth said nothing" distinguishable. The
   distinction is honoured in the response and still lost in the store, so the
   only durable evidence of an auth outage is its **absence** — a quiet hour that
   looks exactly like a healthy one.

Cost to the score: it is the largest single item behind criterion 1 row 4 (0 of
15), it is 2 of the 6 structural terminals, and it holds criterion 2 row 2 down.
Roughly **4 points of the total** sit on three lines of code.

**Fix (unchanged from round 1, still three lines in five files).**
```ts
if (e instanceof GuardError) {
  if (e.status >= 500) await recordWorkerError(opsDatabase(env), "<worker>", place, e, request)
  return fail(e.status, e.code, e.message)
}
```

### R2-7 · HIGH — **CONFIRMED STILL STANDING**: `request_id` is unreadable, and a new source now writes it NULL
`workers/data-ops/src/routes/admin.ts:33-35` · `workers/auth/src/index.ts:152-166`.

Both halves of round 1's finding 4 are unchanged, and this round added a third.

**Still omitted from the only read door.** The SELECT lists twelve columns:
```sql
SELECT id, at, source, place, message, stack, team_id, user_id, url, status, resolved_at, resolution_note
FROM error_logs …
```
No `request_id`, and no `?request_id=` filter. `db/ops/0002_error_request_id.sql`
adds the column *and an index*, for one stated reason: *"Fetching every worker's
view of one failed request is THE query this column exists for."* That query still
cannot be run through the only door, and the index is paid for and unused.

**Still NULL for every `web` row.** `internalLogError` still destructures
`{source, place, message, stack, url}` and calls `logError` without `requestId` —
while `workers/gateway/src/index.ts:232` sends `requestId: req` in the beacon
body. The gateway mints it, forwards it, and auth throws it away.

**New this round:** the gateway's own crash rows go through the *same* door, so
`source = "gateway"` rows are **also** written with `request_id = NULL`. The one
worker that mints the id is now the one worker whose rows cannot carry it. A
gateway crash and the downstream worker rows for the same click cannot be joined —
which is precisely the correlation the fix was supposed to restore.

**Fix.** Two lines. Add `requestId?: string` to `internalLogError`'s body type and
pass it into `logError`; add `request_id` to the SELECT and an optional filter.

### R2-8 · MEDIUM — **CONFIRMED STILL STANDING**: a failed FK lookup still reads as "there is nothing there"
`workers/data-ops/src/lib/import-batch.ts:163-169`.

The R11/architecture half is fixed — the call now goes through `forwardToDoor`, so
it is traced and carries `origin: "import"`. The **capture** half is untouched:

```ts
const res = await forwardToDoor(…)
if (!res.ok) return map        // still an EMPTY map
```

A non-2xx is still indistinguishable from "this table has no existing rows", so an
agentic import proceeds with every reference silently unresolvable. This is the
rubric's archetype — an expired key reading as no results — applied to an internal
call, and it is now *better instrumented on the way out* and *equally silent on
the way back*.

### R2-9 · MEDIUM — unchanged: the recorder still has no ceiling and its own failure is silent
`shared/workers/error-log.ts:36-58`. No dedupe, no rate limit, no sampling, and a
completely empty `catch {}` — not even a console line. Round 1's finding 9, made
materially more urgent by R2-1 and R2-2. `db/ops/0002` not applied in a fork
still means every INSERT fails on an unknown column and the store looks like a
quiet week.

### R2-10 · MEDIUM — unchanged: nothing tells anybody
Still a product decision, not a bug. ERROR-HANDLING.md defers the owner console
because it needs a platform-owner identity the base deliberately lacks. **Ask the
owner where a new error signature should go** before building anything.

---

## The should-be-recorded split — what moved

Round 1: 17 correctly silent, 13 should-be-recorded. Round 2: **17 correctly
silent (unchanged), 11 should-be-recorded.**

**Closed (2):**

| path | what changed |
|---|---|
| `workers/gateway/src/index.ts` (whole `fetch`) | central catch records via auth's internal door |
| `workers/realtime/src/index.ts` (whole `fetch`) | central catch records via `recordWorkerError(opsDatabase(env), …)` |

**Still open (11), every one verified this round:**
`shared/workers/gating.ts:96` + `workers/mcp/src/lib/bridge.ts:42`,`:50` ·
`shared/workers/trace.ts:104`,`:134` · `shared/workers/realtime.ts:104` ·
`shared/workers/rate-limit.ts:111` · `workers/data-ops/src/lib/import-batch.ts:168` ·
`workers/tenancy/src/lib/sharding.ts:443` (*trigger widened this round*) ·
`workers/realtime/src/index.ts:92` · `workers/tenancy/src/lib/invites.ts:215`,
`workers/tenancy/src/lib/teams.ts:96` · the notify family
(`tenancy/src/lib/notify.ts:63`,`:83`,`:103`, `content/src/lib/notify.ts:125`) ·
`web/components/deep-link-screen.tsx:140` · `web/components/app-shell.tsx:187` ·
31 UI handlers.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **G1** Catch the `URIError` at the two media routes and 404 it, before it reaches the central catch | `workers/gateway/src/index.ts` | ADDS a 4-line try/catch, REMOVES the unauthenticated write amplification | **none — it makes an invalid path a 404 instead of a 500, which is also the correct HTTP answer.** Helps `spend_review` (no D1 write per probe) and `security_sentry_review` (closes an unauthenticated resource sink). Costs `lean_mean` 4 lines |
| **G2** Signature+minute dedupe memo + one `console.error` in `logError`'s catch | `shared/workers/error-log.ts` | ADDS ~8 lines and a per-isolate `Map` | **error_analyst**: dedupe changes what a "count" means — it must be told, or its clustering double-counts differently before and after. **lean_mean**: +8 lines in a deliberately tiny seam. This is now a **prerequisite** for the gateway catch, not an optional extra — do not ship one without the other |
| **G3** Check `callService`'s return in the gateway's recorder; `traceError` on failure | `workers/gateway/src/index.ts` | ADDS 2 lines | none — it uses a seam already imported on the same line, on a path that has already failed |
| **G4** `catchBodies(stripComments(src))` + scope to the `fetch` handler's own catch | `workers/data-ops/test/error-seam.test.ts` (and optionally `shared/test/source.ts`) | ADDS ~4 lines of test | **lean_mean**: more test code. **story_checks_out**: helps — the law's claim becomes true. If `stripComments` is applied inside `catchBodies` instead, check the other consumers first (`web/test/source.test.ts` asserts current behaviour) |
| **G5** Record 5xx `GuardError` before `fail()` | `workers/{tenancy,content,data-ops,mcp}/src/index.ts` | ADDS one condition per central catch | **spend_review**: an auth outage now writes a row per affected request — the exact burst G2 must bound, so G2 first. **speed_review**: a D1 write on a path already 503-ing. **realtime_review / architecture_review**: helps — R11's distinction finally survives into the store |
| **G6** `requestId` through `internalLogError`; `request_id` in the admin SELECT + filter | `workers/auth/src/index.ts`, `workers/data-ops/src/routes/admin.ts` | ADDS one field + one column | **none — the column is already written and already indexed; this is the read it was created for.** Turns a `dead_end_review` finding (data written, never read) green |
| **G7** Move `<AgentHost/>` inside the boundary (or correct the doc); tighten the check to assert wrapping | `web/app/layout.tsx`, `web/test/rules.test.ts`, possibly `ERROR-HANDLING.md` | ADDS 1 line of JSX + 1 assertion | **realtime_review**: an `AgentHost` render throw now shows a card instead of blanking — the live agent panel keeps its socket. **lean_mean**: +1 assertion |
| **G8** Forward `extra` through the gateway beacon so `componentStack` reaches the store | `workers/gateway/src/index.ts`, `workers/auth/src/index.ts`, `shared/workers/error-log.ts` (an `extra` column or fold into `stack`) | ADDS one field end-to-end, or one column | **scaling_review + spend_review**: `componentStack` is large; cap it (500 chars) or it doubles the average row. **security_sentry_review**: a component stack can name route params — cap and review before shipping |
| **G9** Record the orphan sweep's skip, distinguishing "read failed" from "team too large" | `workers/tenancy/src/lib/sharding.ts` | ADDS 3 lines to a cron | **spend_review**: one row per skipped team per night — bounded by team count, negligible. **scaling_review**: helps — the >10k case becomes a visible signal to raise `ORPHAN_SCAN_CAP` rather than a silent stall |
| **G10** Distinguish "no rows" from "could not ask" in the import FK lookup | `workers/data-ops/src/lib/import-batch.ts` | ADDS a failure branch | **interfacelessness_review**: an import that used to "succeed" with unresolved references now fails honestly — a behaviour change a machine caller will see. Correct, but it is a contract change, not a patch |
| **G11** One `showError(where, err, fallback)` helper; apply at the 31 unguarded + 4 discarding sites | `web/lib/log.ts` (new export), ~22 components | ADDS one helper, REMOVES 33 hand-written ternaries | **lean_mean**: net *negative* line count — helps. **spend_review + round_trip_review**: more client beacons (genuine client bugs only; `isBenignNetworkError` already filters network noise). Must ride G2's dedupe |
| **G12** Classify 401/403 from the three integrations as a credential failure | `shared/workers/d1-rest.ts`, `workers/auth/src/lib/email.ts`, `workers/data-ops/src/lib/model.ts` | ADDS a status-aware branch per integration | **lean_mean**: +3 branches. Otherwise none — this is the highest-value untouched item in the report and nothing else in the campaign competes for these lines |
| **G13** Ask the owner where alerts go; wire a new-signature notice through the existing Resend seam | owner decision first | ADDS an email per new signature | **spend_review**: paid Resend sends on a path that can burst — must ride G2. **security_sentry_review**: an email carrying a stack trace leaves the system. Owner decision first |

---

## CEILING

**95 is not reachable in this round's shape. The honest working ceiling is 88–90
without an alerting decision, ~93 with one** — unchanged from round 1, and round 2
did not move it, because none of the three criteria that cap it were touched.

- `alerting` (weight 5) is capped by a **decision, not a commit**. Rows 1 and 2
  (65 of its 100 points) need a channel and an owner; the rubric says score 0
  until answered. ERROR-HANDLING.md deliberately defers the owner console because
  it needs a platform-owner identity the base does not have. Row 4 ("somebody has
  looked") is unmeasurable from source. Realistic post-decision ceiling: **~85**.
- `background` (weight 9): rows 1 and 2 describe queues this base has none of, so
  it is renormalised rather than capped. Its remaining half — "a job that stops
  firing is noticed" — needs a heartbeat that does not exist. Buildable.
- `boot` (weight 11) row 1 is already at the platform maximum: on Workers a
  module-scope throw fails the deploy, which the rubric accepts. Row 4 is capped
  at 12 until `deploy:production` runs a smoke — a one-line `package.json` change
  the owner has to be willing to gate production on.
- `safety` (weight 7) has one row (**medium 7**, secrets in the row) that is
  **permanently unmeasured from source** — it needs a live failing D1 row. That
  costs 7 of 100 on the criterion, or 0.5 of the total, until someone reads
  production data.

**Arithmetic of the ceiling.** `alerting` at 85 and everything else at 100:
`(95 × 100 + 85 × 5)/100 = 99.3`. `alerting` at today's 20 and everything else at
100: `(9500 + 100)/100 = 96.0` — so 95 clears without an alerting decision, but
only if the other nine are *perfect*, which `safety`'s unmeasured row already
forbids. With the other nine averaging 92: `(95 × 92 + 100)/100 = 88.4`.

**Nothing in ARCHITECTURE.md blocks any of the thirteen fixes.** The one locked
decision that pressed in round 1 — the gateway is deliberately thin — was
respected by the repair (it posts to auth's door rather than taking a D1 binding),
and that was the right call. G1/G2/G3 are the cost of having taken it.

**What round 2 actually proved about the ceiling.** The five points gained came
from the two CRITICALs. The remaining 32 points sit almost entirely in four
criteria nobody touched: `outbound` (49 lost), `parity` (55 lost), `alerting`
(80 lost), `safety` (40 lost). Three of those four are cheap — G5, G6, G11, G12
are together fewer than 60 lines. The band will not change until they land.

---

## Handoff for `error_analyst`

The skill's contract is to write `error-capture.json` to the project root. **This
campaign is read-only**, so it is reproduced here — copy it when repairs are
serialized. `error_analyst` must not be run before it exists.

```json
{
  "skill": "error_log_review",
  "version": 1,
  "scoredAt": "2026-08-25",
  "round": 2,
  "score": 68,
  "previousScore": 63,
  "capped": false,
  "store": { "present": true, "kind": "table", "name": "error_logs" },
  "criteria": { "reach": 65, "store": 90, "boot": 77, "outbound": 51,
                "frontend": 92, "background": 73, "row": 75, "parity": 45,
                "safety": 60, "alerting": 20 },
  "closedSinceRound1": [
    "gateway worker — now records via auth's /internal/log-error",
    "realtime worker — now records via recordWorkerError(opsDatabase(env))",
    "React render errors — the ErrorBoundary is mounted at web/app/layout.tsx:79"
  ],
  "blindSpots": [
    "5xx GuardErrors (auth unreachable) still excluded from the store",
    "publish() still discards its response — a broken live layer is silent",
    "gateway and web rows carry request_id = NULL; the admin door cannot SELECT it",
    "team_id and user_id are NULL on every row",
    "anonymous browser errors (sign-in / sign-up / invite-accept) are dropped",
    "componentStack is generated by the newly-mounted boundary and dropped at the gateway",
    "proxyService's 503 is rendered to users and never recorded",
    "an unauthenticated GET /media/%zz now writes an unbounded row per request",
    "the orphan sweep skips a >10,000-attachment team silently, every night",
    "no alerting of any kind"
  ],
  "verdict": "at least 83% of failure paths can reach the store; treat every count from error_logs as a floor, and treat counts from source='gateway' as uncorrelatable"
}
```

---

## Verdict

**The front door can finally record its own crashes — but it records them through
auth, without the request id it just minted, and with nothing stopping an
anonymous `GET /media/%` from writing a row per request. So if the auth worker
goes down today, every screen still 503s, every signed-in person is still told to
try again, and `error_logs` is still empty — because a 503 wearing a `GuardError`
is still never recorded, and the two surfaces that were just taught to write
depend on the very worker that is down.**
