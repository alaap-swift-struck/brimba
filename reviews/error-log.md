# Error log review — Brimba · 2026-08-25
SCORE: 63/100   (previous: never run)

Band: **leaky** (50–69). Every count taken from this store is a floor — write
"at least" in front of it. Scored from source only; no live access to
`error_logs`, so anything needing rows is marked **unmeasured**.

Method: `~/.claude/skills/error_log_review/assets/probe.mjs` (read-only, run
against the repo root) plus manual reads of every candidate it produced. Probe
output kept at
`/private/tmp/.../scratchpad/errorlog-98382/elr-probe.json` (outside the repo).

**Probe hygiene note (campaign brief, failure mode 4).** The first probe run was
written to the shared scratchpad as `probe.json` and was **overwritten by a
concurrent reviewer's first-run probe** before I read it — the file I first
parsed had `emptyStates`/`onboarding` keys, not error keys. Re-run under a
unique path. Two probe fields were also **wrong and are corrected below**:
`frontend.errorBoundary: true` / `errorBoundaryRecords: true` (the component
exists and records, but is mounted **nowhere**), and two `terminalPaths` entries
that in fact record.

---

## Arithmetic

```
DEFECT   criterion = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criterion = sum of points earned from its rows
total    = round( Σ (criterion × weight) / 100 )
```

| # | criterion | key | score | weight | product |
|---|---|---|---:|---:|---:|
| 1 | Every failure path can reach the store (GATE) | `reach` | 61 | 16 | 976 |
| 2 | One durable store, every surface writes to it | `store` | 75 | 14 | 1050 |
| 3 | Startup and boot failures recorded | `boot` | 74 | 11 | 814 |
| 4 | Outbound integration + credential failures recorded | `outbound` | 51 | 11 | 561 |
| 5 | The browser reports too | `frontend` | 67 | 10 | 670 |
| 6 | Background and scheduled work reports | `background` | 73 | 9 | 657 |
| 7 | A row is complete and the message actionable | `row` | 75 | 9 | 675 |
| 8 | What the user saw, the store saw | `parity` | 45 | 8 | 360 |
| 9 | Recording cannot crash the app or flood the table | `safety` | 60 | 7 | 420 |
| 10 | Somebody finds out; the table doesn't grow forever | `alerting` | 20 | 5 | 100 |
|   | **weights** | | | **100** | **6283** |

**6283 / 100 = 62.83 → SCORE 63.**

Gate check: criterion 1 = 61 ≥ 40 → **no cap**. `store.present === true` → no 15 cap.

### 1 · `reach` — 61/100 (weight 16, GATE)

| row | pts | earned | working |
|---|---:|---:|---|
| non-terminal share × 45 | 45 | **37** | 149/182 = 81.9% → 0.819 × 45 = 36.9 |
| non-throwing failure paths record or propagate | 20 | **8** | 3/8 propagate → 0.375 × 20 = 7.5 |
| last-resort handler at every entry point, and it records | 20 | **16** | 7/9 entry points → 0.778 × 20 = 15.6 |
| no terminal path on a money/stock/permission/data-loss route | 15 | **0** | rubric says subtract to zero — two permission-path terminals found |

**Denominator 182.** Probe found 175 real failure points (scripts excluded), 28
terminal. I opened all 28: **2 were false positives** (`workers/data-ops/src/routes/agent.ts:61`
records via `recordWorkerError`; `workers/tenancy/src/index.ts:193` is the cron
catch, which records at :197) → 26 confirmed terminal. Reading the code found
**7 terminal paths a catch-scan structurally cannot see**: `publish()` discarding
its Response (1), 5xx `GuardError`s excluded from the store (3), the gateway's
entire uncaught surface (1), `traceError`-only outcomes in `callService` /
`proxyService` (2). So 33 terminal of 182.

**Non-throwing paths, 3 of 8 propagate.** Propagate: `whoAmI`'s null-vs-503
distinction (`shared/workers/gating.ts:89`), `callService`'s null contract,
`writeRow`/`writeParcel` returning `{ok:false,error}`. Terminate:
`shared/workers/realtime.ts:104` (publish response discarded),
`workers/data-ops/src/lib/import-batch.ts:166` (`if (!res.ok) return map`),
`shared/workers/rate-limit.ts:111` (fails open, console only),
`workers/auth/src/lib/email.ts:48` (`return false` on a missing key, callers
ignore it), `workers/realtime/src/index.ts:90` (shard lookup falls back to 1).

**Entry points, 7 of 9.** Record: auth, tenancy, content, data-ops, mcp, the
tenancy cron, the browser globals. **Do not exist at all**: `workers/gateway`,
`workers/realtime` — neither has a try/catch in its `fetch`.

**Row 4 = 0.** Permission-path terminals: `shared/workers/gating.ts:97` (the
503 `auth_unreachable` thrown by the permission seam is a `GuardError`, and every
worker's catch returns before recording) and `shared/workers/rate-limit.ts:111`
(the only rate ceiling in the base fails **open** on console alone). A third,
client-side: `web/components/deep-link-screen.tsx:140` renders a permission-shaped
"no access" from a fully discarded error.

### 2 · `store` — 75/100 (weight 14)

| row | pts | earned | working |
|---|---:|---:|---|
| one durable queryable store for the whole app | 40 | **40** | `error_logs`, D1, `db/ops/0001` + core fallback via `opsDatabase()` |
| no surface >15 pts below the best-covered surface | 25 | **0** | frontend 90% · backend 81% · mcp 60% · gateway 0% · realtime 0% |
| the browser's errors land in the same store as the server's | 20 | **20** | beacon → gateway → auth `/internal/log-error` → same table |
| a documented way to list open/resolved and to resolve one | 15 | **15** | `GET/POST /api/data-ops/admin/errors[/resolve]`, in ERROR-HANDLING.md |

Cloudflare observability is **enabled on all 7** workers but is a window, not a
store (it would cap row 1 at 15 on its own); the D1 table is what earns 40.

### 3 · `boot` — 74/100 (weight 11)

| row | pts | earned | working |
|---|---:|---:|---|
| module-init failures caught, not just crashed | 35 | **35** | on Workers a module-scope throw fails the deploy — the rubric's legitimate answer |
| a failed migration recorded or fails loudly | 25 | **20** | `wrangler d1 execute` fails loudly to the operator; a missed migration surfaces as a recorded 500. No in-app schema-version check → −5 |
| missing binding / env var / secret detected and reported | 20 | **7** | 2 of 6 → 0.333 × 20 = 6.7 |
| a deploy that boots broken is detectable without a user | 20 | **12** | staging: automated smoke gates the deploy (1.0). production: `deploy:production` runs **no** smoke; OPERATIONS.md documents a manual "four worker healths" of seven (≈0.2). (1.0 + 0.2)/2 × 20 = 12 |

**Secrets, 2 of 6.** Detected **and** recorded: `CF_D1_TOKEN` (`cloud_key_missing`
is a plain `Error`, so `recordWorkerError` runs before the 503 branch —
`workers/data-ops/src/index.ts:124-127`), `ANTHROPIC_API_KEY` (a 401 throws
`model_error:` and is recorded at `agent/model-call`). Not detected:
`INTERNAL_KEY` (`env.INTERNAL_KEY ?? ""` in five places → every internal call
403s silently, forever), `RESEND_API_KEY` (`sendEmail` returns `false`, notify
callers ignore it), `ADMIN_KEY` (clean 503, never recorded), `OPS` (falls back by
design — correct).

### 4 · `outbound` — 51/100 (weight 11)

Three real integrations: Cloudflare D1 REST, Resend, Anthropic.

| row | pts | earned | working |
|---|---:|---:|---|
| non-2xx recorded, not just checked | 35 | **23** | 2 of 3 → 0.667 × 35 = 23.3. D1 REST and Anthropic throw into a recording catch; Resend throws but every notify caller swallows to console |
| timeouts/network recorded distinctly from a bad response | 25 | **10** | distinguishable only by message text; `callService` timeouts are console-only, never stored → 0.4 × 25 |
| 401/403 recorded as a credential problem | 20 | **4** | 0 of 3 classified. 2 of 3 carry the status inside the message text → 0.2 × 20 |
| the record names the integration and the endpoint | 20 | **14** | D1 5xx names both; D1 4xx names neither; Anthropic names integration + `place`; Resend names integration but the row never exists on the notify path → 0.7 × 20 |

### 5 · `frontend` — 67/100 (weight 10)

| row | pts | earned | working |
|---|---:|---:|---|
| `window.onerror` wired | 30 | **30** | `web/lib/log.ts:61` |
| `unhandledrejection` wired | 25 | **25** | `web/lib/log.ts:64` |
| a component error boundary exists **and records** | 25 | **0** | `<ErrorBoundary>` is rendered **nowhere** — see finding 2 |
| a working transport from the browser to the store | 20 | **12** | works, but drops anonymous sessions and drops `extra` (incl. `componentStack`) → 0.6 × 20 |

### 6 · `background` — 73/100 (weight 9)

No queues anywhere (`wrangler.jsonc` × 7: `queues: []`, `deadLetters: []`), one
cron (`10 3 * * *`, tenancy). Rows 1 and 2 (55 pts) describe a failure class this
base does not have; scoring them 0 would be dishonest, so the criterion is
**renormalised over the 45 applicable points**.

| row | pts | earned | working |
|---|---:|---:|---|
| queue consumer records before dead-letter | — | **n/a** | no queues exist |
| dead-letter read or depth alarmed | — | **n/a** | no queues exist |
| scheduled job records its failure; a stopped job is noticed | 25 | **13** | records ✓ (R12, machine-checked). Nothing watches for a cron that stops firing — no heartbeat, no "last ran at" → 0.5 |
| un-awaited work awaited / `waitUntil`-ed / records on rejection | 20 | **20** | `streamRun`'s `void (async…)()` has a recording catch; probe `fireAndForget` = 0 |

33 / 45 × 100 = 73.

### 7 · `row` — 75/100 (weight 9)

| row | pts | earned | working |
|---|---:|---:|---|
| message · stack · place · time · tenant · actor · request id | 40 | **26** | 4.5 of 7 fields → 0.643 × 40 = 25.7 |
| the message names what failed | 30 | **30** | real `err.message` throughout — "Cloudflare D1 API failed: …", "model_error: Claude returned 401" |
| distinguishes environment | 15 | **15** | no column, but `brimba-ops` vs `brimba-ops-staging` are separate databases — rows never mix |
| carries enough to reproduce | 15 | **4** | `place` is a route not a record; no params, no body, no `extra`; `url` on web rows only → 0.27 × 15 |

**Fields, 4.5 of 7.** Present: `message`, `stack`, `place`, `at`. **Always NULL:**
`team_id`, `user_id` — no caller of `logError` ever sets them (see finding 5).
`request_id`: half — populated by `recordWorkerError` for 5 workers, **NULL for
every `web` row**, and **not returned by the only read door** (see finding 4).

### 8 · `parity` — 45/100 (weight 8) — DEFECT

| penalty | applied | evidence |
|---|---:|---|
| critical 30 — an error surfaced in the UI has no recording path at all | **−30** | `proxyService`'s 503 (`workers/gateway/src/index.ts:123`) is rendered to the user and only ever console-logged; anything the gateway itself throws has no path to the store at all |
| high 15 — an error state rendered from a caught error that is not recorded | **−15** | **29 of 31** `instanceof ApiFailure ? … : "<generic>"` handlers never report; only `deep-link-screen.tsx:547` and `invite-dialog.tsx:81` do |
| medium 7 — generic failure shown where the cause was known and dropped | **−7** | same 29 sites choose the generic string with `err` in hand; plus `agent-usage-dialog.tsx:60`, `agent-history-dialog.tsx:48`, `deep-link-screen.tsx:140`, `app-shell.tsx:187` discard the error object entirely |
| minor 3 — user-facing and recorded message cannot be correlated | **−3** | the user sees "Something went wrong on our side."; no request id is returned to the client on the 500 path (only `proxyService`'s 503 sets the `x-request-id` response header) and no screen shows one |

### 9 · `safety` — 60/100 (weight 7) — DEFECT

| penalty | applied | evidence |
|---|---:|---|
| critical 30 — the recorder can throw | **0** | `logError` wraps everything; `traceError` is pure console. Correct. |
| high 15 — no dedupe or rate limit | **−15** | `shared/workers/error-log.ts:36` has no dedupe, no sampling, no ceiling. One 500-ing route writes one row per request into a 10 GB-capped D1; retention is a *nightly* sweep, so a bad hour is unbounded. The gateway limiters are optional (`USER_LIMITER?`) and absent in a fork that hasn't enabled them. |
| high 15 — writes synchronously on the path with no timeout | **−15** | `await recordWorkerError(...)` blocks the response in all 5 central catches; the D1 write has no timeout and no `ctx.waitUntil`. Mitigated (it is the failure path, not the happy path) but under a broad outage every request takes it. |
| medium 7 — personal data or secrets in the error row | **−7** | `d1ExecScript` sends scripts with `sqlString(email/name/ticket text)` inlined; `cf()` puts D1's verbatim error message into the thrown `Error`, and D1 SQL errors commonly echo the failing statement → into a **cross-team** `error_logs.message`. **Confirmation is unmeasured** (needs a live failing row). |
| minor 3 — a failed recording is itself silent | **−3** | `logError`'s catch is empty — not even a console line — and there is no counter. A store that has stopped accepting writes looks exactly like a quiet week. |

### 10 · `alerting` — 20/100 (weight 5)

| row | pts | earned | working |
|---|---:|---:|---|
| a new error signature notifies a person or channel | 40 | **0** | nothing notifies anyone. The `db_alerts` "alarm" is a D1 row + a `console.error` (`workers/tenancy/src/lib/sharding.ts:93`) — no email, no channel |
| a spike notifies | 25 | **0** | nothing |
| a stated retention window, and something enforces it | 20 | **20** | 90 days in `OPS_RETENTION`, swept nightly, with `idx_error_logs_at` for the sweep |
| somebody has looked in the last month | 15 | **0** | **unmeasured** — needs the live table / access logs. Rubric: score 0 until answered |

---

## The should-be-recorded split

The judgement this review exists for. Both lists in full.

### Correctly silent (17) — probe candidates I opened and cleared

| path | why it is right |
|---|---|
| `web/lib/store.ts:179`, `:216` | cache patch/reconcile failure → `invalidate(key)`, a real recovery |
| `web/lib/api.ts:110`, `:156` | `.catch(()=>null)` parsing the error body, then **throws** `ApiFailure` |
| `web/lib/use-agent-chat.tsx:102`, `:109`, `:261` | quota/thread-resume refresh — cosmetic, answers the caller with `false` |
| `workers/data-ops/src/routes/agent.ts:61` | **records** — probe false positive |
| `workers/data-ops/src/routes/agent.ts:70` | `writer.close().catch(()=>{})` in a `finally` |
| `workers/tenancy/src/index.ts:193` | the cron catch — **records** at :197. Probe false positive |
| `shared/workers/concurrency.ts:128`, `workers/data-ops/src/lib/import.ts:505` | best-effort claim release, then **rethrow** |
| `workers/data-ops/src/lib/model.ts:161`, `:194` | `.text().catch(()=>"")` then **throws** a named `model_error` |
| `workers/gateway/src/index.ts:152` | beacon body read; a `console.error` follows |
| `workers/mcp/src/index.ts:54`, `workers/mcp/src/lib/bridge.ts:49` | parse guards, then a clean JSON-RPC error / `GuardError` |
| `workers/tenancy/src/lib/invites.ts:279` | invite email — `emailSent` is returned **honestly** to the caller and to the agent |

### Should be recorded (13)

| path | what happens today |
|---|---|
| `workers/gateway/src/index.ts` (whole `fetch`) | the only public door has no catch and no D1/OPS binding — nothing it throws can ever reach the store |
| `shared/workers/gating.ts:97` + `workers/mcp/src/lib/bridge.ts:43`,`:50` | 5xx `GuardError`s (auth unreachable / bridge failed) are excluded from the store by every worker's `if (e instanceof GuardError)` |
| `shared/workers/trace.ts:104`, `:134` | every "service unreachable" / "downstream unreachable" in the base ends at `console.error` |
| `shared/workers/realtime.ts:104` | `publish()` discards its Response — a `/publish` 5xx is neither checked nor recorded; every screen silently goes stale |
| `shared/workers/rate-limit.ts:111` | the only rate ceiling in the base fails **open**, console-only |
| `workers/data-ops/src/lib/import-batch.ts:166` | `if (!res.ok) return map` — a failed FK lookup is indistinguishable from "no existing rows"; the import proceeds with unresolvable references |
| `workers/tenancy/src/lib/sharding.ts:443` | the nightly orphan sweep skips a team forever on a read error; the cron's outer catch never sees it |
| `workers/realtime/src/index.ts:90` | shard lookup failure → falls back to 1 shard; a large team's members stop receiving live updates |
| `workers/tenancy/src/lib/invites.ts:215`, `workers/tenancy/src/lib/teams.ts:96` | audit rows (`invite_logs`) silently lost |
| `workers/tenancy/src/lib/notify.ts:63`,`:83`,`:103` + `workers/content/src/lib/notify.ts:125` | notification emails are best-effort **by written policy** (ERROR-HANDLING.md rule 2) — the *individual* failure is correctly silent, but an expired/revoked `RESEND_API_KEY` or a missing `INTERNAL_KEY` stops **all** of them for ever with zero trace |
| `web/components/deep-link-screen.tsx:140` | any failure renders a permission-shaped "no access" from a discarded error |
| `web/components/app-shell.tsx:187` | a failed `auth.me()` on a session event signs a still-valid user out — the client twin of the exact failure R11 fixed on the server |
| 29 UI handlers (list in criterion 8) | the non-`ApiFailure` cause is dropped while a generic string is shown |

---

## Findings

### 1 · CRITICAL — the only public door cannot record anything
`workers/gateway/src/index.ts:76-254` · no `try/catch`, and `type Env` (line 56)
has **no `DB` and no `OPS` binding**.

Every request in the system enters here. If `rateLimit` throws, if
`serveObject`'s R2 `get` throws, or — reachable by anyone, unauthenticated —
`decodeURIComponent(pathname.slice("/media/".length))` throws a `URIError` on
`/media/%zz` (line 214), the request becomes a bare platform 500 with no body and
**nothing lands in `error_logs`**. `workers/realtime/src/index.ts` is the same
shape (it *does* have `env.DB`, so it could record; it doesn't).

`workers/data-ops/test/error-seam.test.ts:11` hardcodes
`WORKERS = ["auth","tenancy","content","data-ops"]` — it would catch a
regression in those four (verified: the assertion matches a real string in
source), but it does not cover `mcp` (which does record), and it is not derived
from the worker set, so gateway and realtime are invisible to it and a new
worker would be too.

**Fix.** Wrap `gateway.fetch` and `realtime.fetch` in a central catch. Give the
gateway the `OPS` binding it lacks (one line in `wrangler.jsonc`, both envs) and
call `recordWorkerError(opsDatabase(env), "gateway", …, request)`; realtime can
use its existing `env.DB` through `opsDatabase`. Then derive
`error-seam.test.ts`'s `WORKERS` from `readdirSync(workers/)` the way
`cron-records` already does, so the list cannot go stale.

### 2 · CRITICAL — the documented React error boundary is mounted nowhere
`web/app/layout.tsx:9` imports `ErrorBoundary`; **`<ErrorBoundary` appears in no
file in `web/`.**

ERROR-HANDLING.md §"The white screen — containment + prevention (C1)" states it
is "MOUNTED in the root layout (`web/app/layout.tsx`) around the routed screens
AND the co-pilot host". `web/test/hooks-order.test.ts:7` repeats the claim.
Git history: it wrapped the team panels from 2026-06-17 (`2ee119c`) and was
**removed on 2026-06-19 in `b77d325`** (the M3 screen-engine migration);
`git log -S"<ErrorBoundary" -- web/app/layout.tsx` is empty — it was never in the
layout. The import is the fossil of an intent never completed. TypeScript does
not flag it (`noUnusedLocals` is not set on the web project), so `npm run check`
stays green.

Consequence: a render throw blanks the tree instead of showing the readable
"Something broke + Try again" card, and `componentStack` — the one field that
makes a render crash diagnosable — is never captured. React 19's default
`onUncaughtError` calls `reportError()`, which does fire `window.onerror`, so the
*message and stack* probably still reach the store. Two caveats:
`installGlobalErrorReporting()` runs in `<ErrorReporter/>`'s `useEffect`, so a
throw during the **initial** render of `{children}` unmounts the tree before the
listener is ever installed — a crash on first paint is invisible.

**Fix.** Render `<ErrorBoundary>` around `{children}` and `<AgentHost/>` in
`web/app/layout.tsx`, exactly as the doc says. Add a rules-test case asserting it
(the claim has now been false for two months with nothing red).

### 3 · HIGH — an auth outage leaves no durable trace anywhere
`shared/workers/gating.ts:97` (503 `auth_unreachable`),
`workers/mcp/src/lib/bridge.ts:43` (503), `:50` (502 `bridge_failed`).

`GuardError` is excluded from the store by contract — "an expected refusal is not
an error". But three `GuardError`s carry **5xx** statuses, and every worker's
catch is `if (e instanceof GuardError) return fail(...)` **before**
`recordWorkerError`. `whoAmI` is the busiest cross-service call in the base
(every gated request in every worker), so an auth outage 503s the entire
application and writes **zero rows**. The only trace is `callService`'s
`traceError` console line, which ERROR-HANDLING.md itself says Cloudflare keeps
about a week. Same for `proxyService`'s 503 at the gateway.

R11 exists precisely to make "auth said no" and "auth said nothing"
distinguishable. The distinction is honoured in the **response** and lost in the
**store**.

**Fix.** In each central catch, record when `e instanceof GuardError &&
e.status >= 500` before returning `fail()`. Three lines, five files.

### 4 · HIGH — `request_id` is written by five workers and readable by nobody
`workers/data-ops/src/routes/admin.ts:34` — the SELECT lists twelve columns and
**omits `request_id`**. There is also no `?request_id=` filter.

`db/ops/0002_error_request_id.sql` adds the column and an index for one stated
reason: "Fetching every worker's view of one failed request is THE query this
column exists for". That query cannot be run through the only read door.

And the `web` source never populates it: `workers/gateway/src/index.ts:191`
sends `requestId: req` in the beacon body, but `workers/auth/src/index.ts:152-166`
(`internalLogError`) destructures only `{source, place, message, stack, url}` and
calls `logError` without it. So every client-side row has `request_id = NULL`
despite the gateway having minted and forwarded one.

**Fix.** Add `request_id` to the SELECT and an optional `request_id` filter; add
`requestId?: string` to `internalLogError`'s body type and pass it through.

### 5 · HIGH — `team_id` and `user_id` are always NULL
`shared/workers/error-log.ts:36-55` is the **only** `INSERT INTO error_logs` in
the codebase (verified by grep across `.ts`/`.mjs`/`.sql`). `recordWorkerError`
(:67) passes only `source, place, message, stack, requestId`. `internalLogError`
passes only `source, place, message, stack, url`. **No caller anywhere sets
`teamId` or `userId`.**

So two of the twelve documented columns — the two that answer "which tenant" and
"which person" — are permanently empty. ERROR-HANDLING.md lists them as
"Captured per row: … `team_id` / `user_id` … when known", and they are known:
every gated worker has resolved `whoAmI` (with `activeTeamId`) before the handler
runs, and the gateway verified the session before forwarding the beacon.

**Fix.** Thread the resolved actor into the central catch (or read it from a
`WeakMap` keyed on the request set by `whoAmI`) and pass `teamId`/`userId`;
forward the verified user id from the gateway beacon.

### 6 · HIGH — a live-publish failure is completely silent
`shared/workers/realtime.ts:104-115` · `await callService(...)` with the return
value discarded.

`callService` returns `null` only when the dependency did **not answer**; a 500
from the realtime worker comes back as a Response and is dropped on the floor —
no `traceError`, no row. R1 makes every mutation publish; if publishing is
broken, every screen in every team silently stops updating and the only evidence
is users saying "I had to refresh". `publish()` also omits `req`, so even the
timeout trace line has no correlation id.

**Fix.** `const res = await callService(...)`; when `res === null || !res.ok`,
`traceError` at minimum and record it (rate-limited — see finding 9). Pass the
request id through `publishChange`.

### 7 · HIGH — 29 of 31 UI error handlers drop the underlying cause
Pattern: `catch (err) { toast.error(err instanceof ApiFailure ? err.message :
"<generic>") }` at 31 sites. Only `web/components/deep-link-screen.tsx:547` and
`web/components/invite-dialog.tsx:81` pair it with
`if (!(err instanceof ApiFailure)) reportError(...)`.

The guard is the right idea — a server `ApiFailure` was already recorded
server-side. The other 29 take the same branch and record nothing, so a genuine
**client-side** bug (a `SyntaxError` from a truncated JSON body, a throw in
`primeCache`, an upload helper) shows the user "Couldn't save the role." and
leaves no trace. Four more sites discard the error object outright:
`agent-usage-dialog.tsx:60`, `agent-history-dialog.tsx:48`,
`deep-link-screen.tsx:140` (renders "no access" — a *permission* claim — from a
discarded error), `app-shell.tsx:187` (signs a still-valid user out on any
`auth.me()` failure).

**Fix.** The two-line guard already exists in two files; apply it to the other
29 — or better, put it once inside a small `showError(where, err, fallback)`
helper so a new screen gets it for free.

### 8 · MEDIUM — a failed FK lookup reads as "there is nothing there"
`workers/data-ops/src/lib/import-batch.ts:161-166`
```
const res = await fetcher.fetch(`https://internal${def.list.path}`, {...})
if (!res.ok) return map          // an EMPTY map
```
This is the reference-resolution step of the agentic import. A non-2xx returns an
empty map, which is indistinguishable from "this table has no existing rows" — so
the import proceeds and every reference silently fails to resolve. That is the
rubric's archetype ("an expired key comes back as no results") applied to an
internal call.

**Related, and worth a note for `architecture_review`:** this call — and
`writeRow` (`import.ts:382`) and `writeParcel` (`import.ts:416`) — assign the
binding to a local first (`const fetcher = … ? env.CONTENT : env.TENANCY;
fetcher.fetch(...)`). R11's check (`web/test/rules.test.ts:287`) matches
`env\.<BINDING>\.fetch\(`, so a one-line alias makes an unbounded, untraced
service call invisible to the law that forbids it. These three calls carry
neither a timeout nor `x-request-id` nor the origin header.

**Fix (capture half).** Distinguish "no rows" from "could not ask": return
`{ok:false}` and fail the import stage honestly, recording the cause.

### 9 · MEDIUM — the recorder has no ceiling, and its own failure is silent
`shared/workers/error-log.ts:36` · no dedupe, no rate limit, no sampling, and an
empty `catch {}`.

Two consequences. One hot 500-ing route writes one row per request into a table
in a 10 GB-capped D1; retention is a *nightly* sweep, so a bad hour is unbounded,
and the gateway's ceilings are optional bindings (`USER_LIMITER?`) absent in a
fork that hasn't enabled them. And because the catch is completely empty — not
even a console line — a store that has stopped accepting writes (a fork that
never applied `db/ops/0002`, so the `request_id` column named in the INSERT does
not exist) looks **exactly** like a quiet week. That is a single migration away
from a silently blind system.

**Fix.** A per-isolate signature+minute memo (drop duplicates), and one
`console.error("error-log write failed")` line inside the catch so lossiness is
visible in the observability window.

### 10 · MEDIUM — nothing tells anybody
Nothing in the base notifies a human about anything. The `db_alerts` "alarm"
(`workers/tenancy/src/lib/sharding.ts:93`) writes a row and a `console.error`.
The error store is owner-gated behind `x-admin-key` and read only by someone
choosing to look. Whether anyone has looked is **unmeasured**.

ERROR-HANDLING.md is explicit that an in-app owner console "needs a 'platform
owner' identity concept the base deliberately doesn't have yet", so this is a
product decision, not a bug. **Ask the owner where a new error signature should
go** (email via the existing Resend seam is the cheapest channel that already
exists) before building anything.

### 11 · MEDIUM — a cron's inner failures escape R12
`workers/tenancy/src/lib/sharding.ts:443` (`continue` on a read failure, skipping
that team's orphan sweep for ever) and `:457` (`console.warn` when a team exceeds
the scan cap). R12's check (`web/test/rules.test.ts:300`) reads only
`workers/*/src/index.ts` after `async scheduled(`, so anything the cron *calls*
in another file is outside it. Verified the check does work for what it covers:
removing the recorder from tenancy's `scheduled` catch would fail it, because
`src.slice(m.index)` starts after the fetch-catch occurrence.

### 12 · MEDIUM — client rows lose their context at the gateway
`web/lib/log.ts:50` sends `extra` (which for the boundary carries
`componentStack`); `workers/gateway/src/index.ts:185-192` builds the forwarded
body from `{source, place, message, stack, url, requestId}` and drops `extra`
entirely. Also, an **anonymous** beacon is dropped by design (line 165) — correct
anti-spam, but it means every failure on the sign-in, sign-up and invite-accept
screens is console-only. Those are the pages where a first-time user is lost for
good.

### 13 · MEDIUM (unmeasured) — user data may be landing in a cross-team store
`shared/workers/d1-rest.ts:57` puts Cloudflare's verbatim `data.errors[].message`
into the thrown `Error`; `d1ExecScript` sends scripts built with
`sqlString(actor.email)`, member names and ticket text inlined. D1 SQL errors
commonly echo the failing statement. `error_logs` is cross-team by design.
Confirming this needs a live failing row — **unmeasured**. Flagging for
`security_sentry_review`.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Central catch + `OPS` binding on gateway; central catch on realtime; derive `error-seam.test.ts`'s worker list | `workers/gateway/src/index.ts`, `workers/gateway/wrangler.jsonc`, `workers/realtime/src/index.ts`, `workers/data-ops/test/error-seam.test.ts` | ADDS ~20 lines + one D1 binding on the busiest worker | **speed_review + spend_review**: the gateway now holds a D1 binding and does a write on the error path — every failing request gains a D1 round-trip. **scaling_review**: the public door becomes a `error_logs` writer, which is the highest-volume surface. **lean_mean**: +2 catch blocks. Mitigate by pairing with F9 (dedupe). |
| **F2** Render `<ErrorBoundary>` around `{children}` + `<AgentHost/>`; add a rules-test case | `web/app/layout.tsx`, `web/test/rules.test.ts` | ADDS 4 lines of JSX + one test | **lean_mean**: a new rules-test case is more code. Otherwise none — it makes ERROR-HANDLING.md true, which **helps** `story_checks_out_review`. |
| **F3** Record `GuardError` when `status >= 500` before `fail()` | `workers/{auth,tenancy,content,data-ops,mcp}/src/index.ts` | ADDS one condition per central catch | **spend_review**: an auth outage now writes a row per affected request — exactly the burst F9 must bound. **speed_review**: adds a D1 write to a path that is already 503-ing. |
| **F4** Add `request_id` to the errors SELECT + a filter; forward `requestId` in `internalLogError` | `workers/data-ops/src/routes/admin.ts`, `workers/auth/src/index.ts` | ADDS one column + one field | none — a column already written and indexed, now readable. Turns a `dead_end_review` finding (data written, never read) green. |
| **F5** Populate `team_id`/`user_id` on every row | `shared/workers/error-log.ts`, 5 worker `index.ts`, `workers/gateway/src/index.ts`, `workers/auth/src/index.ts` | ADDS actor threading into the central catch | **security_sentry_review**: puts identifiers into a cross-team store — needs a note on who may read it (already owner-gated). **architecture_review**: the central catch now needs the resolved actor, a small coupling between gating and error-log. **lean_mean**: +1 param on a shared seam. |
| **F6** Check `publish()`'s Response; pass the request id | `shared/workers/realtime.ts` | ADDS 3 lines to a seam used by ~53 call sites | **realtime_review**: helps (a broken live layer becomes visible). **speed_review**: none — the call is already awaited. |
| **F7** One `showError(where, err, fallback)` helper; apply at 29+4 sites | `web/lib/log.ts` (new export), 20 components | ADDS one helper, REMOVES 33 hand-written ternaries | **lean_mean**: net *negative* line count — helps. **spend_review**: more client beacons reaching the store (real client bugs only; `isBenignNetworkError` already filters network noise). **round_trip_review**: one extra beacon per genuine client crash. |
| **F8** Distinguish "no rows" from "could not ask" in the import FK lookup; route the three aliased calls through `callService` | `workers/data-ops/src/lib/import-batch.ts`, `workers/data-ops/src/lib/import.ts` | ADDS a failure branch and a bound | **speed_review**: `callService`'s 5 s timeout on an import door that can legitimately take longer — this is why `forwardToDoor` is exempt; use `forwardToDoor` (bounded-by-exemption, trace-carrying) rather than raw `callService`. **architecture_review**: closes an R11 blind spot. |
| **F9** Signature+minute dedupe memo + one console line in `logError`'s catch | `shared/workers/error-log.ts` | ADDS ~8 lines and a per-isolate `Map` | **lean_mean**: +8 lines in a deliberately tiny seam. **error_analyst**: dedupe changes what a "count" means — it must be told, or its clustering double-counts differently before and after. This is a **prerequisite** for F1/F3, not an optional extra. |
| **F10** `ctx.waitUntil(recordWorkerError(...))` instead of `await` | 5 worker `index.ts` | REMOVES the recorder from the response path | **error_log itself**: `waitUntil` work can be cut short if the isolate is killed, so a small share of rows would be lost — trades criterion 9 against criterion 1. **speed_review**: helps (failing requests return sooner). Recommend only if F9 lands first. |
| **F11** Ask the owner where alerts go; wire a new-signature notice through the existing Resend seam | `workers/tenancy/src/lib/sharding.ts` or a new cron step | ADDS an email per new signature | **spend_review**: paid Resend sends on a path that can burst — must ride F9's dedupe. **security_sentry_review**: an email carrying a stack trace leaves the system. Owner decision first. |
| **F12** Cap/redact `message` before insert (strip anything that looks like an inlined SQL literal) | `shared/workers/error-log.ts` | ADDS a redaction step | **error_analyst**: redaction removes the detail root-causing depends on — a real tension, so redact narrowly (quoted literals only), never wholesale. |

---

## CEILING

**95 is reachable in principle, but not by code alone at criterion 10.**

- `alerting` (weight 5) is capped by a decision, not a commit. Rows 1 and 2
  (65 of its 100 points) need a channel and an owner — the rubric says score 0
  until answered — and ERROR-HANDLING.md deliberately defers the owner console
  because "it needs a 'platform owner' identity concept the base deliberately
  doesn't have yet". Row 4 ("somebody has looked") is unmeasurable from source at
  all. Realistic post-decision ceiling for this criterion: **~85** (rows 1–3
  buildable, row 4 permanently unmeasured here).
- `background` (weight 9): rows 1 and 2 describe queues this base has none of.
  Renormalised, so not a cap — but its row 3 half ("a job that stops firing is
  noticed") needs a heartbeat that does not exist; buildable.
- `boot` (weight 11) row 1 is already at maximum for the platform: on Workers a
  module-scope throw fails the deploy, which the rubric accepts as the honest
  answer. No cap.
- Everything else — reach, store, outbound, frontend, row, parity, safety — is
  fully fixable by the twelve changes above.

**Arithmetic of the ceiling.** With `alerting` at 85 and every other criterion at
100: (95 × 100 + 85 × 5)/100 = **99.3**. With `alerting` at its current 20 and
every other criterion at 100: (9500 + 100)/100 = **96.0** — so 95 clears even
without touching alerting, but only if the other nine are *perfect*. A realistic
post-repair figure, with the other nine averaging 92: (95 × 92 + 100)/100 =
**88.4**. Call the honest working ceiling **88–90 without an alerting decision,
~93 with one.**

**Nothing in ARCHITECTURE.md blocks any of the twelve fixes.** The one place a
locked decision presses is F1: the gateway is deliberately thin ("the only public
door"), and giving it a database binding is a real architectural addition, not a
patch. If that is refused, the alternative is for the gateway to beacon its own
crashes through auth's existing `/internal/log-error` — same seam, no new
binding, one extra internal hop on the failure path.

---

## Handoff for `error_analyst`

The skill's contract is to write `error-capture.json` to the project root. **This
campaign is read-only**, so it is reproduced here instead — copy it to
`error-capture.json` when repairs are serialized.

```json
{
  "skill": "error_log_review",
  "version": 1,
  "scoredAt": "2026-08-25",
  "score": 63,
  "capped": false,
  "store": { "present": true, "kind": "table", "name": "error_logs" },
  "criteria": { "reach": 61, "store": 75, "boot": 74, "outbound": 51,
                "frontend": 67, "background": 73, "row": 75, "parity": 45,
                "safety": 60, "alerting": 20 },
  "blindSpots": [
    "gateway worker — no catch, no DB binding: nothing it throws can be recorded",
    "realtime worker — no catch",
    "5xx GuardErrors (auth unreachable) excluded from the store",
    "publish() discards its response — a broken live layer is silent",
    "React render errors — the ErrorBoundary is mounted nowhere",
    "anonymous browser errors (sign-in / sign-up / invite-accept) are dropped",
    "team_id and user_id are NULL on every row",
    "request_id is not readable through the admin door",
    "no alerting of any kind"
  ],
  "verdict": "at least 82% of failure paths can reach the store; treat every count from error_logs as a floor"
}
```

---

## Verdict

**If the auth worker goes down today, every screen in the product 503s, every
signed-in person is told to try again — and `error_logs` stays empty, because a
503 wearing a `GuardError` is never recorded and the front door has no way to
write a row at all.**
