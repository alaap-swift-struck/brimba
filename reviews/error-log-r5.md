# Error log review — round 5 — Brimba · 2026-08-26

SCORE: **78/100**   (round 1: 63 · round 2: 68 · round 3: 70 · round 4: 70)

Band: **mostly covered** (70–84). Counts taken from `error_logs` are still a
floor — keep "at least" in front of them — but the floor rose eight points and
for the first time a person is told when something breaks.

**Measured at `HEAD = f30f954`** on branch `review-round5`. Working tree clean at
the start of the run. I wrote none of these repairs and have taken no previous
report's word for anything: every number below is re-derived from the rubric's
own tables, and every check I relied on was sabotage-tested outside the
repository (`…/scratchpad/sab2.mjs`, which transcribes `stripComments`,
`catchBodies` and `declarationBody` verbatim from `shared/test/source.ts` and
proves baseline-green before sabotaging). Nothing in this repository was modified
except this file.

---

## Arithmetic

```
DEFECT    criterion = clamp(0, 100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its rows
total     = round( Σ (criterion × weight) / Σ weights )
```

| # | criterion | key | method | score | weight | product |
|---|---|---|---|---:|---:|---:|
| 1 | Every failure path can reach the store (GATE) | `reach` | coverage | 80 | 16 | 1280 |
| 2 | One durable store, every surface writes to it | `store` | coverage | 95 | 14 | 1330 |
| 3 | Startup and boot failures are recorded | `boot` | coverage | 81 | 11 | 891 |
| 4 | Outbound integration + credential failures recorded | `outbound` | coverage | 64 | 11 | 704 |
| 5 | The browser reports too | `frontend` | coverage | 92 | 10 | 920 |
| 6 | Background and scheduled work reports | `background` | coverage | 89 | 9 | 801 |
| 7 | A row is complete and the message actionable | `row` | coverage | 75 | 9 | 675 |
| 8 | What the user saw, the store saw | `parity` | defect | 30 | 8 | 240 |
| 9 | Recording cannot crash the app or flood the table | `safety` | defect | 76 | 7 | 532 |
| 10 | Somebody finds out; the table doesn't grow forever | `alerting` | coverage | 85 | 5 | 425 |
| | **weights** | | | | **100** | **7798** |

```
1280+1330 = 2610; +891 = 3501; +704 = 4205; +920 = 5125; +801 = 5926;
+675 = 6601; +240 = 6841; +532 = 7373; +425 = 7798
7798 / 100 = 77.98 → SCORE 78
```

**Gate:** criterion 1 = 80 ≥ 40 → no cap. `store.present === true` → no 15 cap.

**One number is contestable and I am giving both.** Criterion 8 carries a
`critical −30` that rounds 2, 3 and 4 all applied for the same fact (33 of 35
client `ApiFailure` sites render an error and record nothing). Read strictly, the
rubric's critical row is *"an error surfaced in the UI has **no recording path at
all**"* — and a path does exist (`reportError`, `web/lib/log.ts`), it is simply
not called on those routes, which is the `high −15` row. **Under that reading
criterion 8 is 45 and the total is `7918 / 100 = 79.18 → 79.** I keep 30 for
continuity with three prior rounds and flag the disagreement rather than
silently re-baselining it.

### Every criterion's row arithmetic

```
C1 reach (16, GATE)                                              R4    R5
  terminalPct scaled to 45 ................... /45     (66)      —     42
  non-throwing paths record or propagate ..... /20                —    11
  last-resort handler at every entry, records  /20                —    18
  no terminal path on money/permission/data .. /15                0     9
                                                                 66    80

C2 store (14)
  one durable queryable store ................ /40                —    40
  no surface >15 below the best .............. /25                —    20
  browser errors land in the same store ...... /20                —    20
  documented list + resolve .................. /15                —    15
                                                                 90    95

C3 boot (11)
  module-init failures caught somewhere ...... /35                —    35
  a failed migration is loud ................. /25                —    25
  missing binding/secret detected at boot .... /20                —    11   (4 of 7 workers)
  a deploy that boots broken is detectable ... /20                —    10
                                                                 77    81

C4 outbound (11)
  non-2xx recorded ........................... /35                —    25
  timeouts/network recorded distinctly ....... /25                —    17
  401/403 recorded as a CREDENTIAL problem ... /20                —     8
  the record names integration + endpoint .... /20                —    14
                                                                 51    64

C5 frontend (10)
  window.onerror ............................. /30                —    30
  unhandledrejection ......................... /25                —    25
  an error boundary that RECORDS ............. /25                —    25
  a working transport to the store ........... /20                —    12
                                                                 92    92

C6 background (9)
  queue consumer records before dead-letter .. /30   (no queues)   —    30
  dead-letter read or alarmed ................ /25   (no queues)   —    25
  a job records its failure AND a stopped job
    is noticed ............................... /25                —    18
  un-awaited work is held or records ......... /20                —    16
                                                                 84    89

C7 row (9)
  the 7 fields ............................... /40                —    26
  the message names WHAT failed .............. /30                —    30
  distinguishes environment .................. /15                —    13
  carries enough to reproduce ................ /15                —     6
                                                                 75    75

C8 parity (8) — DEFECT, restarts at 100 each run
  −30 critical  33/35 ApiFailure sites render and record nothing  (contested, see above)
  −15 high      a generic failure shown, the known cause dropped
  − 7 medium    user-facing and recorded message not correlatable
  − 3 minor
  −15 high  NEW the invite door reports emailSent:true on mail that did not go
                                                                 45    30

C9 safety (7) — DEFECT
  − 7 medium    dedupe/rate limit now covers the INTEGRATION writers, not the
                central catch (was high −15 before recordOutbound existed)
  − 7 medium    the recorder awaits an unbounded D1 write on a failing request
                (platform-bounded only)
  − 7 medium    no redaction — and the digest now MAILS a 160-char excerpt
  − 3 minor     a failed recording is silent and there is no counter
                                                                 72    76

C10 alerting (5)
  a NEW signature notifies a person .......... /40                —    35
  a SPIKE notifies ........................... /25                —    25
  a stated retention window, enforced ........ /20                —    20
  somebody has looked in the last month ...... /15                —     5
                                                                 20    85
```

---

## DELTA — 70 → 78, and what caused each move

| # | criterion | wt | R4 | **R5** | Δ | cause |
|---|---|---:|---:|---:|---:|---|
| 1 | `reach` (GATE) | 16 | 66 | **80** | +14 | **Code changed** (+9 of it) — `proxyService`'s 503 now records, which was the whole of round 4's zero on row 4. **The last measurement was wrong** (+5 of it) — the probe never discovered `recordWorkerError` as a recorder, so 18 of its 29 "terminal" paths are false positives. |
| 2 | `store` | 14 | 90 | **95** | +5 | Code changed. The browser beacon's `request_id` now survives auth's door; the store gained four new write reasons. |
| 3 | `boot` | 11 | 77 | **81** | +4 | Code changed — `/health` now reports binding booleans on 4 of 7 workers. Held back because tenancy, realtime and the gateway report nothing, and the smoke reads none of the booleans. |
| 4 | `outbound` | 11 | 51 | **64** | +13 | **Code changed.** Untouched for four rounds; `recordOutbound` + `OutboundKind` + `failOutbound` landed. Still 64 because two of three integrations are uncovered. |
| 5 | `frontend` | 10 | 92 | **92 =** | 0 | Nothing touched it. Re-derived, not reused. |
| 6 | `background` | 9 | 84 | **89** | +5 | Code changed — the `cron_runs` heartbeat. Held back: the check that reads the heartbeat runs *inside* the cron, so it detects a **missed night**, never a **stopped cron**. |
| 7 | `row` | 9 | 75 | **75 =** | 0 | **Code changed and the score did not.** `recordWorkerError` gained a `who` parameter with a nine-line comment about why anonymous rows are useless — and **zero of the 19 call sites pass it.** `team_id` and `user_id` are still NULL on every worker-written row. |
| 8 | `parity` | 8 | 45 | **30** | −15 | **The last measurement was wrong**, in a way no previous round looked for. See F1. |
| 9 | `safety` | 7 | 72 | **76** | +4 | Code changed — the one-row-per-minute throttle. Partly offset by the digest mailing unredacted message excerpts. |
| 10 | `alerting` | 5 | 20 | **85** | +65 | **Code changed.** The nightly digest exists and is better than round 4 specified: a 7-day window answering *new*, *worse* and *how many* from one `GROUP BY`, silence on a clean night, and — the part round 4 did not ask for — it records when its own mailer refuses. |

**Two criteria did not move and both should have.** `row` is a seam widened and
never wired. `frontend` has been 92 since round 2 for one reason (the beacon path
is gated on a verified session, so an error on the login screen is console-only)
and nobody has touched it.

---

## What the brief asked me to verify

### 1 · The nightly digest — TRUE on every claim, and stronger than round 4 specified

`workers/tenancy/src/lib/error-digest.ts` · called from
`workers/tenancy/src/index.ts:252-274`.

| claim | verdict |
|---|---|
| 7-day window | **TRUE.** `since7d` in the `WHERE`, `since24` inside two `SUM(CASE …)` arms. |
| NEW + SPIKE from ONE query | **TRUE.** `MIN(at) AS first_seen` gives *new*; `SUM(CASE WHEN at < ?1 …) / 6.0 AS avg_prior` gives *worse*. One statement, no second query, no stored state. |
| silence on a clean night | **TRUE.** `if (active.length === 0) return null`, and the caller sends nothing on null. Also filtered to `n24 > 0`, so a signature that fired four days ago is not re-mailed for a week. |
| it records when its own mailer fails | **TRUE, and this is the best line in the feature.** `sendMail` returns `answer?.sent === true`, so a `null` from `callService`, a non-2xx, an unparseable body and an explicit `{ sent: false }` are all false; `index.ts:262` records `cron/nightly-digest` when it is. A second branch records when `OPS_ALERT_EMAIL` is unset at all. |

The spike test needs **both** a ratio and a floor (`n24 > 3 * avg_prior && n24 >= 5`),
which is the difference between an alarm and a pager that gets muted. `OPS_ALERT_EMAIL`
is set in **both** environments (`workers/tenancy/wrangler.jsonc:37` and `:70`), so
this is live, not latent.

**One thing is wrong, and it is the thing that decides whether the mail gets
read** — see F2.

### 2 · The cron heartbeat — TRUE, with one limit nobody has written down

`db/core/0019_nightly_state.sql` creates `cron_runs`; `noteCronHeartbeat` writes
it **last** in the `scheduled` handler (`index.ts:279`), so its timestamp means
"the whole pass completed". `buildErrorDigest` reads it **before** it is
rewritten and records `cron/heartbeat` past 26 hours. A *missing* heartbeat
deliberately does not alarm — "I have never run" is not evidence of a missed run,
and a fresh environment should not open with a false alarm. All correct, and
`workers/tenancy/test/error-digest.test.ts` covers all four cases including the
first-ever run.

**The limit:** the heartbeat is read by the digest, which runs inside the cron.
So it detects **a night that was missed between two nights that ran**. If the
cron stops firing and never fires again, nothing ever reads the heartbeat and
nobody is ever told. The file's own comment — *"A cron that stops firing is
invisible… The heartbeat is what separates the two"* — claims more than the
mechanism delivers. Costs 7 of criterion 6's 25 on that row.

### 3 · Outbound failures recorded and throttled — TRUE, for one integration of three

`shared/workers/error-log.ts:101-201`. The throttle is real, keyed on
`(integration, kind)`, module-scope so it is per-isolate, and the swallowed count
rides out on the next row that gets through (`(+N more in the last minute)`).
The reasoning for making it non-optional is correct and load-bearing: the data
door is on every team read and the error store is reached the same way.

Wired at:

| integration | recorded | timeout vs upstream | 401/403 as `credential` | names endpoint |
|---|---|---|---|---|
| `cloudflare-d1` (`shared/workers/d1-rest.ts`, every team-DB read/write) | **yes** | **yes** | **yes** (`res.status === 401 \|\| 403`) | **yes** |
| service bindings (`callService`, `proxyService`) | **yes** | **yes** (`noAnswerKind`) | n/a | worker + place |
| `api.resend.com` (`workers/auth/src/lib/email.ts`) | **no** | no | **no** | no |
| `api.anthropic.com` (`workers/data-ops/src/lib/model.ts`) | as a generic worker error | no | **no** | loosely |

`d1ConfigFrom` (`shared/workers/gating.ts:90`) sets `recordFailure` on **every**
config it builds, and it is the only builder, so the D1 door has no unwired
path. That is the right half to have done first — it is the highest-volume
integration in the base.

### 4 · The 503 recorder and the callback-not-a-handle decision — TRUE, and right

`shared/workers/trace.ts:167-190` · `workers/gateway/src/index.ts:236-239`.
`proxyService` takes `opts.record`; the gateway supplies a closure over
`sendErrorRow`, which posts to auth's `/internal/log-error`. Both the gateway's
central catch and the downstream recorder go through that one function, which is
why the seam test had to widen (below).

**The callback is the correct shape and the reason given is the real one.** A
`CoreDb` parameter would have had exactly one caller and that caller has no
database. I would keep this decision. It also carries the request id, which the
`dbRecorder` path does not (F4).

### 5 · `publish()` reads the answer — TRUE. Wired at 5 of **43**, not 42.

`shared/workers/realtime.ts:131-164`. It now branches three ways: `null` is
already recorded by `callService` on the way past (recording it twice would
double every outage), `res.ok` returns, and a refusal composes
`realtime /publish answered <status>` — because 400 is a bug here and 5xx is a
bug there, which is the whole diagnosis.

**Counted at HEAD:** 43 real call sites of `publishChange` / `publishUserChange` /
`publishSignOut` (47 grep hits minus 4 that are prose in comments and in
`shared/rules/registry.ts`). 41 are handed to `ctx.waitUntil`, 2 are awaited, 0
are bare. **5 pass a recorder** — `workers/tenancy/src/lib/teams.ts:172`, `:297`,
`:301`, `:304` and `workers/tenancy/src/routes/team.ts:139`.

**What partial wiring is worth — my judgement.** The seam's own comment argues
that because the fault is systemic and the throttle writes one row a minute
anyway, partial wiring only costs *how quickly* it is noticed. **That is wrong,
and the specific five make it wrong.** The five wired sites are create-team,
accept-invite (three pings) and edit-team. On an established team none of those
fires for weeks. So a wedged live layer is not noticed *late* — on a steady-state
account it is not noticed **at all**, until somebody happens to create a team.
And a wedged live layer is the one fault class that generates no bug report,
because a stale screen looks exactly like a quiet one.

The correct read is that the seam is **done** and the wiring is **12%**, and the
12% is the part that decides whether the feature exists in practice. It is worth
roughly the difference between criterion 6's 16/20 and 20/20 on its fourth row,
plus 2 of criterion 2's — call it **+0.5 of the total for one token at 38 call
sites**. That is the cheapest point on this page.

Nothing would notice if the five regressed: `workers/realtime/test/publish-answer.test.ts`
tests the **seam**, not the wiring. There is no check that any caller passes a recorder.

### 6 · `/health` binding booleans — TRUE, and it earned its keep on day one

Commit `959c80a` is the evidence: the endpoint answered `internalKey: false` on a
healthy staging deployment, and the investigation found that **nothing in
data-ops reads `INTERNAL_KEY`** — it was declared in `env.ts`, an operator was
told to set it in a wrangler comment, and no code presented or verified it. The
secret was removed from the type, the health report and the setup instructions.
That is a real defect found by a real observation, and it is the strongest single
argument in this round for the endpoint existing: a bare `ok: true` had called
that deployment perfectly healthy for months.

The privacy constraint from the reconciliation held: **booleans only, never a
value, never the name of a missing secret.** Verified on all four.

**But it is 4 of 7, and the missing three are the wrong three** — see F3.

### 7 · Auth's `/internal/log-error` dropping `requestId` — TRUE, now fixed

`workers/auth/src/index.ts:163-186`. The field is declared, read and passed to
`logError`. The gateway has always sent it (`sendErrorRow`), and the browser
beacon path sends it too. So `request_id` was NULL on every gateway crash and
every browser-reported error — the one column that lets you follow a click across
seven workers, absent from exactly the rows where following it matters most. It
is filled now.

---

## The should-be-recorded split

The probe reported **29 terminal paths of 184**. I opened all 29. **Eighteen are
false positives** — the probe's discovered recorders are `["logError",
"reportError"]` and it **never discovered `recordWorkerError`**, which is the
seam every worker actually calls.

**Probe false positives (record, rethrow, or answer):**
`workers/data-ops/src/routes/agent.ts:61` (records at `:66`) ·
`workers/tenancy/src/index.ts:280` (records at `:290`) ·
`workers/data-ops/src/lib/model.ts:266`, `:302` (extract a detail, then throw with the status) ·
`web/lib/api.ts:110`, `:156` (throw `ApiFailure`) ·
`workers/mcp/src/index.ts:55`, `workers/mcp/src/lib/bridge.ts:49` (answer with an RPC error / null token) ·
`shared/workers/concurrency.ts:128`, `workers/data-ops/src/lib/import.ts:523` (best-effort cleanup, then `throw e`) ·
`workers/gateway/src/index.ts:267` · `workers/data-ops/src/routes/agent.ts:70` ·
`web/lib/use-agent-chat.tsx:102`, `:109`, `:261` · `web/lib/store.ts:365`, `:403`
(console, then `invalidate(key)` — self-heals) · `workers/data-ops/src/lib/import-batch.ts:171`.

**Correctly silent:** the `.catch(() => "")` reads of an error body, the
best-effort idempotency-key cleanup, the agent-quota refresh, the writer close in
a `finally`, the dead-socket `catch` inside `TeamChannel.broadcast`.

**Should be recorded — the report (11 sites, 12 with `gating.ts:248`):**

| where | what happens today if this fails |
|---|---|
| `shared/workers/rate-limit.ts:145` | The surge ceiling **fails open** and says so only to the console. It is the only thing in the base bounding RATE, and `/media/*` is the one anonymous unauthenticated door. A limiter that has quietly stopped working is indistinguishable from a quiet day. |
| `shared/workers/gating.ts:248` | Same shape for the per-team ceiling. |
| `workers/realtime/src/index.ts:92` | A shard-count read fails → falls back to **1 shard** → every socket on shards 1..n stops receiving pings. Silently, for `SHARD_MEMO_MS`, for the biggest teams only. |
| `workers/tenancy/src/lib/invites.ts:239` | An `invite_logs` audit insert is lost. |
| `workers/tenancy/src/lib/teams.ts:96` | An invite-accept audit record is lost. |
| `workers/tenancy/src/lib/invites.ts:302-304` | An invite email did not go out. Console only — **and the door reports it as sent** (F1). |
| `workers/tenancy/src/lib/notify.ts:94`, `:114`, `:134` | A person is not told their role changed, that they were removed, or that their invite was withdrawn. |
| `workers/content/src/lib/notify.ts:125-126` | A ticket raiser is not told somebody answered them; a mentioned member is not told. |
| `workers/tenancy/src/lib/housekeeping.ts:350` | The orphan sweep skips a team whose references it cannot read — safe direction, but that team's object storage is then **never** swept and nothing says so. |

**Corrected terminalPct: 172 / 184 = 93.5%** (probe: 155/184 = 84%). Row 1 of
criterion 1 therefore earns `45 × 0.935 = 42` where the raw probe figure would
have given 38. Both printed, as the rubric requires.

---

## Findings, ranked

### F1 · CRITICAL — the invite door reports `emailSent: true` on mail that never left

`workers/tenancy/src/lib/invites.ts:301` — `emailSent = res?.ok === true`

Auth's `/internal/send-email` returns **HTTP 200 with `{ sent: false }`** when
`RESEND_API_KEY` is unset (`workers/auth/src/lib/email.ts:44`,
`workers/auth/src/index.ts:157`). `res.ok` is true. So `emailSent` is **true**
for a mail that was never sent — and the comment three lines above it reads:

> *"`emailSent` feeds the honest wording the caller and the agent use ("invite
> created, email couldn't be sent"), so folding an unreachable mail hop into
> "sent" would be the exact dishonesty this flag was added to prevent."*

The flag exists to prevent exactly this and does not prevent it. The user is told
the invite was emailed, the agent says so out loud, the store sees nothing, and
**the truth was on the wire and was discarded**.

This is the same bug the digest was hardened against this round — `sendMail`
in `workers/tenancy/src/lib/notify.ts:41-64` was rewritten to return
`answer?.sent === true` precisely because *"an unconfigured mailer and a healthy
system look identical from the outside"*. The rewrite fixed the digest and left
the same shape on **five** other paths:

| path | what it does with the truth |
|---|---|
| `invites.ts:301` invite email | reads `res.ok` — **reports `true` on an unsent mail** |
| `notify.ts:87-96` role changed | `send()` returns the boolean; the caller discards it |
| `notify.ts:107-116` removed | discards it |
| `notify.ts:127-136` invite revoked | discards it |
| `content/src/lib/notify.ts:55-75` help reply / mention | never returns it — `send()` is `Promise<void>` |

**The change.** In `invites.ts`, replace `emailSent = res?.ok === true` with a
read of the body, exactly as `sendMail` does — better, delete the duplicate
`callService` block and call `sendMail`, which already knows the internal key and
the shape. In `notify.ts`, have the three `notify*` helpers record when `send()`
returns false. In `content/src/lib/notify.ts`, return the boolean and do the
same. **Then extend `error-digest.test.ts`'s "READS the send response" assertion
to every module that sends mail**, derived from the call sites rather than
hand-listed — the check that exists today pins one file.

### F2 · HIGH — staging and production mail the same mailbox with an indistinguishable subject

`workers/tenancy/wrangler.jsonc:70` says staging's digest goes to the same
address on purpose, *"the subject line carries the environment through the app
name"*. It does not. The subject is built from `brand.name`
(`error-digest.ts:137`), and `shared/brand.ts:17` is `name: "Brimba"` — one
static string, identical in both environments. Both send:

```
Brimba: 3 new and 1 spiking (47 errors overnight)
```

Staging is reset regularly, is where deliberate failure testing happens, and now
mails an alarm to the production alarm mailbox that cannot be told apart from a
production alarm. **The whole design rests on "the mail arriving IS the signal"**,
and this is how that signal gets trained away inside a month.

**The change.** Add `ENVIRONMENT` (or reuse the existing per-env `PUBLIC_APP_URL`
host) to the digest subject: `Brimba [staging]: …`. Three lines and one var, and
it also fixes the wrangler comment, which is currently false.

### F3 · HIGH — three of the four blind spots round 4 found in the error-seam checks are still open, proven by sabotage

`workers/data-ops/test/error-seam.test.ts`. Baseline green on all seven workers
before every sabotage:

| sabotage | CHECK A | CHECK B | round 4's id |
|---|---|---|---|
| delete the **generic** catch recorder, keep the 5xx one | **GREEN — blind** | green | R4-3 / R3-4 |
| rename `GuardError` → `HttpRefusal` | green | **SKIPPED SILENTLY** | R4-4 |
| delete the real 5xx recorder, append a decoy `function` after `export default` | green | **GREEN — blind** | R3-5 probe 2 |
| swap the 5xx recorder for `traceError` | green | **RED** | (works) |
| comment out the gateway's `sendErrorRow` call | **RED** | — | (works, new) |

Three of five sabotages pass. The generic catch is the one that records every
*unexpected* crash — every real bug — and on content, data-ops, mcp and tenancy
its recorder can be deleted with the suite green, because the 5xx branch put a
second `recordWorkerError` inside the same catch and CHECK A only asks whether
one is present. And a rename removes a worker from the 5xx law with **nothing**
turning red, because membership is `if (!/instanceof GuardError/.test(src)) continue`.

Round 4 gave the fix in four lines. It was not applied.

**The change.** (a) Make CHECK A **count**: assert two recorders where a
`status >= 500` branch exists and one where it does not — `gating-seam.test.ts:82`
already established equality-over-floor as the house pattern. (b) Move CHECK B
inside CHECK A's brace-matched `entry` slice, which is computed one describe
block above. (c) Derive CHECK B's membership from the shared import
(`/from "[^"]*guard/`) or enumerate the workers and assert the list's length.

### F4 · HIGH — the rows this round added are the least complete rows in the table

`shared/workers/error-log.ts:148-153` — `dbRecorder` calls `logError` with
`{ source, place, message, stack }` and **nothing else**. No `requestId`, no
`teamId`, no `userId`.

Every row written by the new machinery — the D1 REST door, `callService`
no-answers, `publish()` refusals — lands with `request_id` NULL. The gateway's
503 rows are the exception, because `sendErrorRow` threads `requestId` through
its own closure.

And `publish()` itself never carries the id: `shared/workers/realtime.ts:141`
passes `{ worker, place, record }` with no `req`. **That is the hop that fires on
every mutation in the base** — the single most-executed cross-service call — and
it is the one that breaks the trace chain. So a publish failure produces a row
that cannot be tied to the write that caused it.

Alongside it: `recordWorkerError` gained a `who` parameter this round, with a
nine-line comment explaining that anonymous rows cannot answer *"is this one
tenant or everyone"*. **Zero of the 19 call sites pass it.** `team_id` and
`user_id` are NULL on every worker-written row, exactly as in round 4.

**The change.** `dbRecorder(db, source, requestId?)` — one optional argument,
threaded from `d1ConfigFrom(env, request)` (which already takes the request) and
from `publishRecorder(env)`. Then pass `who` at the six central catches, where
the guard result is already in scope. Two of the criteria that have not moved in
five rounds are unlocked by this one change.

### F5 · MEDIUM — the digest's own guard passes with the digest deleted

`workers/tenancy/test/error-digest.test.ts:328-380`. The "delivery contract"
block reads **raw source** (`readFileSync`, no `stripComments`) and slices with
`cron.slice(cron.indexOf("async scheduled"))` — read-to-end-of-file. It does not
import `shared/test/source` at all (`grep -c` returns 0), which is the module
written the same day whose header names both faults by name.

Proven, both directions, outside the repository:

- Replace the entire `if (digest) { … sendMail … }` block with
  `// TODO: restore await sendMail(env, to, digest.subject, digest) under cron/nightly-digest when OPS_ALERT_EMAIL is set`
  → **all five delivery tests stay green.** The one check guarding the only
  alerting path in the base is satisfied by a comment.
- Add a comment reading `(was "cron/size-check" before the digest landed)`
  → the `place` test goes **RED** with the code correct.

The 21 behavioural tests above it are excellent and run against real SQLite.
It is only the five source-scans that are blind.

**The change.** Import `stripComments` and `declarationBody` from
`shared/test/source` and read the `scheduled` member's brace-matched body, the
way `error-seam.test.ts` reads `fetch`.

### F6 · MEDIUM — Resend is the one integration with no recording at all, and the archetype the rubric names

`workers/auth/src/lib/email.ts:44-70`. `if (!env.RESEND_API_KEY) return false` —
an unconfigured or rotated key reads as a clean boolean, not an error. A non-2xx
throws, and every caller in the base turns that into a `console.error`. So a
Resend outage, a rotated key and a suspended account all leave the same evidence:
none, past the log buffer.

This is criterion 4's third row verbatim — *"an expired key that reads as an
empty result set is invisible to users, invisible to the error log, and produces
a support ticket three weeks later saying 'the sync stopped'"*. It costs 12 of
criterion 4's 20 on that row.

**The change.** Four lines inside `sendEmail`: `recordOutbound(record, "resend",
"/emails", res.status === 401 || res.status === 403 ? "credential" : "upstream", err)`,
and the same on the unset-key path with `kind: "credential"`. Auth binds `OPS`,
so `dbRecorder(opsDatabase(env), "resend")` is the channel — the identical shape
`d1ConfigFrom` already uses. The throttle makes it safe.

### F7 · MEDIUM — the two rate ceilings fail open with console-only evidence

`shared/workers/rate-limit.ts:145-148` and `shared/workers/gating.ts:248`. Both
catch, log to the console, and return `null` (allow). Failing open is the right
default — a broken limiter must not take the app down — but the surge ceiling is
the **only** thing in the base bounding request RATE, and since 2026-08-25 it
also covers the anonymous, unauthenticated `/media/*` door. A limiter binding
that is absent, misconfigured or erroring leaves the base's one abuse control
silently off.

**The change.** One `recordOutbound(record, "rate-limiter", place, "upstream", e)`
in each catch. It is on a path that has already decided to allow the request, so
it changes no behaviour, and the throttle means one row a minute even under an
attack.

### F8 · MEDIUM — a shard-count read failure silently strands the largest teams' sockets

`workers/realtime/src/index.ts:92-97`. A failed `shard_count` read falls back to
1, which the comment defends well — *"degrading to 'the live layer still works
for most people' beats degrading to 'nobody gets anything'"*. Correct, and it
should still leave a row: a team that has been split to 3 shards and is being
published to 1 has two-thirds of its sockets receiving nothing, for the length of
`SHARD_MEMO_MS`, with no error anywhere.

**The change.** One `recordWorkerError(opsDatabase(env), "realtime", "shard-count", e)`.
The worker already binds `OPS` and already imports both.

### F9 · LOW — two audit-trail insert failures are console-only

`workers/tenancy/src/lib/invites.ts:239-241` and
`workers/tenancy/src/lib/teams.ts:96-98`, both labelled "(audit only)". The label
is the argument for recording them, not against: a lost audit row is the one
failure whose consequence is that you cannot later prove what happened.
Cross-referenced to `activity_log_review`, which owns whether the row should
exist; this review owns whether its absence is knowable.

### F10 · LOW — the beacon is gated on a verified session, so the login screen cannot report

`workers/gateway/src/index.ts:266-282`. Correct security posture (a cookie header
is attacker-controlled and this door writes into the global database), but it
means a crash on `/login` or `/onboarding` — the two screens where a stuck user
has no other way to tell anybody — is console-only. It has been the missing 8
points of criterion 5 since round 2 and nobody has looked at it. A signed-out
beacon behind a strict rate ceiling and a hard body cap, written with
`source: "web-anon"`, would close it; that is a `security_sentry_review`
conversation before it is a change.

---

## FIX IMPACT MAP

| Fix | Files | Adds / removes | Which OTHER review this could damage |
|---|---|---|---|
| **F1** honest `emailSent` + record the four discarded booleans | `workers/tenancy/src/lib/invites.ts` (−18 dup, +2), `workers/tenancy/src/lib/notify.ts` (+6), `workers/content/src/lib/notify.ts` (+5), `workers/tenancy/test/error-digest.test.ts` (+8) | REMOVES a duplicate `callService` block; ADDS ~20 lines | **`lean_mean` — a credit** (deleting the duplicate mail door). **`interfacelessness` — check:** the agent's invite wording is derived from `emailSent`, so its narration changes from "sent" to "couldn't be sent" in the unconfigured case — that is the fix, but its tool-response assertions may pin the old text. **`story_checks_out` — positive:** the code stops contradicting its own comment. **`spend`/`speed` — none.** |
| **F2** environment in the digest subject | `workers/tenancy/src/lib/error-digest.ts` (+2), `wrangler.jsonc` ×2 (+1 var each) | ADDS one var per env | **`base_fork` — check:** a new var is one more thing a fork must set; give it a code default (`"local"`) so an unset var is not a new bootstrap step. **`security` — none** (an environment name is not a secret). **none else.** |
| **F3** count recorders; slice + derive CHECK B | `workers/data-ops/test/error-seam.test.ts` (~6 changed, ~6 removed) | REMOVES lines net | **`lean_mean` — a credit.** Nothing else. This is the rare fix that debits nobody. |
| **F4** thread `requestId` through `dbRecorder`; pass `who` at the central catches | `shared/workers/error-log.ts` (+3), `shared/workers/gating.ts` (+1), `shared/workers/realtime.ts` (+2), 6 worker `index.ts` (+1 each) | ADDS ~12 lines; fills three columns | **`security_sentry` — must sign this off:** it puts tenant and user identifiers into a cross-team table. The schema always intended it and the store is admin-gated, but that is their call, not mine. **`architecture` — positive:** closes the propagation gap on the base's most-executed hop (its criterion 4). **`spend`/`scaling` — none:** same row, three more bound values. |
| **F5** read the digest's source through `shared/test/source` | `workers/tenancy/test/error-digest.test.ts` (~8 changed) | No behaviour change | **`lean_mean` — neutral.** **`story_checks_out` — positive:** a law with a blind check is a documented guarantee with nothing behind it. **none else.** |
| **F6** record Resend failures | `workers/auth/src/lib/email.ts` (+6), `workers/auth/src/index.ts` (+1) | ADDS ~7 lines and rows on mail failure | **`spend`/`scaling` — bounded by design:** the throttle caps it at one row per kind per minute, and email volume is orders of magnitude below the D1 door's. **`speed` — none** (already on a failing path). **`security` — check one thing:** do not put the recipient address in the row; `place` should be `"resend /emails"`, never `"resend <email>"`. |
| **F7** record a fail-open rate limiter | `shared/workers/rate-limit.ts` (+2), `shared/workers/gating.ts` (+2) | ADDS 4 lines | **`scaling` — the sharpest tension here, and it is already resolved:** a limiter outage during a surge is exactly when you least want writes, which is why this must go through `recordOutbound` and not `logError` directly. **`security` — positive:** their own finding is that this control's failure is invisible. |
| **F8** record a shard-count fallback | `workers/realtime/src/index.ts` (+1) | ADDS 1 line | **`realtime_review` — positive**, it is their blind spot too. **none else.** |
| **(F5+F3 together)** | — | — | **Sequencing:** do F3 and F5 **before** F1, F6, F7, F8. Every one of those adds a recorder, and adding recorders under checks that cannot fail is how the last four rounds each shipped a repair and a new blind spot in the same commit. |

---

## CEILING — 95 is reachable, and round 4's 94 was arithmetic

| criterion | wt | cap | why |
|---|---:|---:|---|
| 1 `reach` | 16 | **85** | Recording is best-effort **by contract** — ERROR-HANDLING.md states, and CLAUDE.md endorses, that a logging hiccup never changes a response. The last ~15 points are only buyable by making recording blocking, which the ruleset forbids. **Locked.** |
| 8 `parity` | 8 | **90** | Some of the 35 client sites are inside render paths where a beacon during an error boundary's own unwind is not safe. |
| 9 `safety` | 7 | **85** | `logError`'s catch is deliberately empty — the store cannot report its own failure without recursion. Correct design; no commit buys it back. |
| 10 `alerting` | 5 | **85 by code** | Rows 1–3 (85) are all reachable and **all three are already earned**. Row 4 — "somebody has actually looked in the last month" — is a habit, not a commit. |
| 2, 3, 4, 5, 6, 7 | 64 | 100 | Reachable. |

```
85×16 = 1360 · 100×14 = 1400 · 100×11 = 1100 · 100×11 = 1100 · 100×10 = 1000
100×9 =  900 · 100×9  =  900 ·  90×8  =  720 ·  85×7  =  595 ·  85×5 =  425
Σ = 1360+1400 = 2760; +1100 = 3860; +1100 = 4960; +1000 = 5960; +900 = 6860;
    +900 = 7760; +720 = 8480; +595 = 9075; +425 = 9500
9500 / 100 = 95.0 → 95
```

**95, not 94.** Round 4 capped `alerting` at 75 on the grounds that *"a nightly
cron cannot page anyone mid-outage"*. That is true and it is **not a row in this
rubric** — criterion 10 scores whether a new signature notifies, whether a spike
notifies, whether retention is stated and enforced, and whether anyone looks.
Latency is not scored. Round 4 invented a ceiling from a real engineering limit
and lost half a point to it. The honest maximum is exactly 95.

**The gap from 78 to 95 is 17 points, and 11 of them are in the two criteria this
review has now complained about for five rounds:** `outbound` (+36 → +4.0) and
`row` (+25 → +2.3), plus `parity` (+60 → +4.8). None is blocked by anything
structural. F1, F4 and F6 together are worth about **+8** for roughly forty
lines.

---

## What no rubric asked about

1. **A repair pass fixed the dangerous instance of a bug and left five siblings.**
   `sendMail` was rewritten to read the send response *because* "an unconfigured
   mailer and a healthy system look identical", and the same discarded-boolean
   shape survives on the invite path (where it actively reports a false success),
   three notice paths and the help notifier. The class-sweep discipline the
   reconciliation praises itself for — *"a defect of this class is rarely alone…
   every update door in every worker was swept as soon as this one was
   confirmed"* — was applied to update doors and not to this one.

2. **`db_sizes` is now pruned twice a night by two disagreeing rules.**
   `workers/tenancy/src/lib/housekeeping.ts:393-395` runs a hardcoded
   `DELETE FROM db_sizes WHERE at < ?` at `DB_SIZES_RETAIN_DAYS = 90`, and its
   own TODO says *"when the rule lands there, DELETE the statement below rather
   than leaving both."* The rule landed —
   `shared/workers/retention.ts:95-100` carries `db_sizes`, 90 days, overridable
   via `RETAIN_DB_SIZES_DAYS`. Both now run in the same pass. Setting
   `RETAIN_DB_SIZES_DAYS=365` to keep a year of trend does nothing: the
   un-overridable second sweep deletes past 90 anyway, silently, and only the
   first one reports a shortfall. Filed in full in `architecture-r5.md`.

3. **`workers/realtime/src/index.ts` counts publish sites in prose, twice, and
   both counts are wrong.** Commit `f30f954` was *specifically* about removing
   rotted counts from this file and fixed two of the three — leaving *"FIVE of
   those **42**"* two lines below one it corrected, plus *"a signature 42 call
   sites share"* in `routes/team.ts:137` and *"36 of the 42"* in
   `publish-answer.test.ts:16`. Measured at HEAD: **43** sites, **41** on
   `ctx.waitUntil`, **2** awaited. Not a defect — an illustration that a
   hand-maintained tally in a comment is wrong within hours, which is the lesson
   the same commit message draws and then does not finish applying.

4. **The gateway's whole recording channel can be dead with nothing saying so.**
   Every browser beacon, every gateway crash and every downstream 503 is written
   through auth's `/internal/log-error`, which **fails closed** on a missing or
   mismatched `INTERNAL_KEY` (correctly). `callService` swallows the 403. The
   gateway is also the **one worker with no `/health` endpoint at all**. So the
   surface that carries the whole public internet has a recording path whose
   misconfiguration is undetectable from inside or outside. One boolean on a
   gateway health route — `internalKey: !!env.INTERNAL_KEY` — closes it, and it
   is the same three lines the other four workers already carry.

---

**The one-sentence verdict:** if your live layer wedges tonight, thirty-eight of
forty-three publish sites will notice nothing, the five that would are all in the
team-creation path that an established account never touches, and the first
person to find out will be a customer saying their screen stopped updating.
