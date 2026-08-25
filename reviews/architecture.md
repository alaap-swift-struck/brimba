# Architecture review — Brimba · 2026-08-25
SCORE: 87/100   (previous: 96/100, measured 2026-08-18)

**The worst case, named:** if `brimba-auth` is down, **6 of the 7 workers** stop serving
gated requests — every screen needing a signed-in user, reads and writes alike. The person
sees *"We couldn't check your sign-in just now. Nothing was changed — try again in a
moment."*, their work stays on screen, already-open sockets keep running, static pages and
`/media/*` keep serving. That failure is documented, deliberate and honest
(`ARCHITECTURE.md` §2b) — it is the one thing in this review that is already finished.

**Why the score moved 96 → 87.** Nothing regressed. The previous pass measured three things
generously and two things by their documentation. Specifically, it recorded *"30/30 every
cross-service call is guarded — 100%"* after correctly clustering the 53 `publishChange`
call sites behind one seam — and then stopped, without opening `forwardToDoor` (which has
no `try` in its file) or the three data-ops import writes that call a service binding
through a local alias the R11 check cannot see. Criteria 7 and 8 were scored 100/100 from
the quality of `BUILD-A-MODULE.md` and `PLATFORMS.md` rather than by the counts the rubric
asks for. This pass counts.

---

## Arithmetic

```
#  criterion                          method    score  weight  product
1  Dependencies point one way         defect      100    16     1600
2  Blast radius is contained   GATE   coverage     76    18     1368
3  Every fact has one owner           defect       87    16     1392
4  A request can be followed          coverage     77    12      924
5  Environments match                 defect       97    10      970
6  Live data can be recovered         coverage    100    12     1200
7  The next module is cheap           coverage     84    10      840
8  Platform is a choice, not a cage   coverage     73     6      438
                                                        100     8732

                                        total = 8732 / 100 = 87.32 → 87
```

Gate: criterion 2 must clear 40 or the total caps at 65. It scores **76**. **No cap applied.**

### What the probe got wrong this run (read before counting)

| probe said | truth | how it was settled |
|---|---|---|
| 34% of cross-service calls guarded (73 hits, 25 guarded) | the ratio is meaningless | it counts every textual `env.REALTIME` — including 53 that hand the binding to one seam, and two inside `web/test/rules.test.ts` string literals |
| `activity` written by `shared` + `content` | one writer | content's "write" is `/INSERT INTO activity/i` — a **regex in `workers/content/test/idempotent-transitions.test.ts:70`** |
| `help` written by `web` + `content` | one writer | web's "write" is `src.indexOf("UPDATE help SET status")` in `web/test/rules.test.ts:738` |
| `teams` written by `realtime` + `tenancy` | one writer | realtime's "write" is a regex in `workers/realtime/test/shards.test.ts:155` |
| 5 shared-write tables | **4**, and two of them the probe never saw | the probe does not exclude test files from criterion 3 (the rubric says it must). Rebuilt production-only: it MISSED `error_logs` and `sessions` |
| `migrationsDir: false` | 19 migrations exist | the probe's file walk only collects `.ts/.js/.json`; `db/core/*.sql` is invisible to it |
| `envParity: []` | correct, but under-measured | it never compares `ratelimits`, `triggers.crons` or `assets`. Re-measured by hand: still clean |

Two lessons kept: a regex cannot tell a **test fixture** from production code, and it cannot
follow a binding through a **local variable** — which is exactly where this review's biggest
finding was hiding.

---

## 1 · Dependencies point one way — 100/100 · weight 16 · defect

Built independently of the probe, over **196 production `.ts`/`.tsx` files** (tests and
`node_modules` excluded, `import type` dropped):

- **file-level cycles: 0**
- **component-level cycles: 0**
- **layer violations: 0**
- **cross-worker production imports: 0** — every `workers/*/src` import that leaves its own
  worker goes to `shared/`, verified by listing all of them
- `shared/` imports **only** `shared/` — 12 distinct specifiers, all relative and internal

The four cross-worker edges the probe reported are all `testOnly`, and all four were opened:
`workers/mcp/test/catalog.test.ts` (→ data-ops, tenancy, content) and
`workers/data-ops/test/trace-parity.test.ts` (→ `web/lib/agent-trace`). Fixtures travel;
that is normal and correct.

`web -> root` and `web -> lib` are the probe misreading `@/components/…` and `@/lib/…`
(both inside `web/`) as separate components. Not violations, and not counted as such.

**Penalties: none. A clean result is a real result.**

Worth knowing rather than fixing: `auth` and `realtime` bind *each other*. It is a genuine
service cycle, documented in `ARCHITECTURE.md` §2b as asymmetric — auth's direction is
best-effort and swallowed, so realtime being down costs live updates, never writes. Its one
sharp edge (cold-start error 10143 on a fresh account) is in `OPERATIONS.md:43`.

## 2 · Blast radius is contained — 76/100 · weight 18 · coverage · THE GATE

I enumerated every place a request leaves a worker over a binding. **17 sites** (the three
`env.ASSETS.fetch` sites are excluded by a written decision in the R11 check — static asset
serving is not a separately-deployed component):

| path | sites | bounded | guarded | carries trace id |
|---|---|---|---|---|
| `callService` (`shared/workers/trace.ts:88`) | 10 | yes, 5 s | yes, returns `null` | 5 of 10 |
| `proxyService` (`trace.ts:126`) | 2 | **no — written reason** | yes, clean 503 | 2 of 2 |
| `forwardToDoor` (`shared/workers/http.ts:41`) | 2 | **no — written reason** | **no guard in the file** | 2 of 2 |
| raw aliased binding `fetcher.fetch(…)` | 3 | **no — no reason, not exempt** | only the worker's central catch | **0 of 3** |

```
30/30  guarded — 17/17 sites terminate in a guard rather than an unhandled rejection
                 (12 in a purpose-built guard; 5 only in a worker central catch)
16/20  bounded — 10/17 bounded + 4/17 unbounded with a written reviewed reason = 14/17
                 20 × 14/17 = 16.5 → 16.  The 3 unaccounted sites are finding F2.
15/20  graceful degradation — real and plural on the request path, minus 5 for the
                 nightly cron chain (F5), which is its exact opposite
15/15  the highest fan-in component is documented as the SPOF, with its consequence
 0/15  no fallback for the component every other one depends on  ← LOCKED owner decision
                                                                  = 76
```

**The 30/30 is literal, and I want to be honest about what it does not mean.** The rubric's
row asks that a dependency failing "returns an error, not an unhandled rejection". It does —
I traced all five of the non-seam sites to a worker central catch. But those five produce a
generic 500, not R11's honest "the dependency did not answer". The distinction R11 exists to
create does not reach the import path.

**The 0/15 is a locked decision, not an oversight.** A short-lived "this session is valid"
cache would earn these 15 points and let a brief auth wobble pass unnoticed. It also means a
revoked session — a departing employee, a stolen laptop — keeps working for the length of
that cache. `ARCHITECTURE.md` §2b records the owner's 2026-08-18 decision to keep revocation
instant. **This is a locked decision and I am not proposing it be changed.** It is named here
only because it is the single largest permanent cost in this review (see CEILING).

## 3 · Every fact has one owner — 87/100 · weight 16 · defect

Rebuilt from scratch with test files excluded (the rubric requires it; the skill's probe does
not do it). **36 tables declared, 33 written, 4 with more than one production writer:**

| table | writers | verdict |
|---|---|---|
| `users` | auth ×3, tenancy ×5 | **clean** — disjoint columns, owner stated per column in `DATA-MODEL.md:63-73` with the forward rule ("auth owns who you are, tenancy owns where you are") |
| `selectable_data` | tenancy ×5, content ×1 | **clean** — owner + the one append stated in `DATA-MODEL.md:274-280`; I opened `workers/content/src/lib/learning.ts:150-181` and it is an INSERT-after-SELECT of a value the user just named, never an edit |
| `error_logs` | shared ×1 (append), data-ops ×1 (resolve) | **−3 minor** — disjoint columns, both doors described in `ERROR-HANDLING.md:42-64`, but no owner named the way the other two got one |
| `sessions` | auth ×7, **tenancy ×1 (DELETE)** | **−7 medium** — see below |
| all others (29) | one component each | clean |

**−7 · The retention sweep deletes from seven tables it does not own.**
`workers/tenancy/src/lib/sharding.ts:355` runs `DELETE FROM sessions WHERE expires_at < ?`,
and lines 330-338 run `DELETE FROM ${rule.table}` for every rule in
`shared/workers/retention.ts` — `login_codes`, `email_change_codes`, `idempotency_keys`,
`account_activity` (auth's), `error_logs`, `agent_usage_log` (shared/data-ops'). The *policy*
has exactly one owner and every rule carries a written reason, which is genuinely good. The
*executor* is tenancy, for the incidental reason that tenancy is the only worker with a cron,
and no document says so. Note the interpolated table name is invisible to any regex — I found
six of these seven by reading, not by scanning.

**−3 · The whole ownership model rests on prose, not a check.** Nothing turns red if a future
module adds a second writer to `users.email`. Carried forward unchanged from the last pass;
still true, still not worth a check today.

`100 − 3 − 3 − 7 = 87`.

Cross-reference, not scored here: `selectable_data` has only `idx_selectable_order` on
`(type, value)`, not a UNIQUE index (`workers/tenancy/src/team-schema.ts:315`), so the
SELECT-then-INSERT pick-or-create can duplicate a category under concurrency. That is
atomicity → **`scaling_review`**.

## 4 · A request can be followed end to end — 77/100 · weight 12 · coverage

```
30/30  a request id is generated at the edge
       workers/gateway/src/index.ts:84 → requestIdFrom(), before every branch,
       hostile-input hardened, honours a sane inbound id. Behaviourally tested
       in workers/gateway/test/trace.test.ts (237 lines, with dead/hanging fakes).
13/25  propagated across every internal hop — 9 of 17 outbound sites carry it
       25 × 9/17 = 13.2 → 13.  Missing: shared/workers/realtime.ts:105 (the seam
       behind ~53 publishes), content/notify.ts:66, tenancy/notify.ts:35,
       tenancy/invites.ts:255, mcp/bridge.ts:24, and the 3 import writes.
13/20  logs are structured — 6 traceError() sites vs 27 plain console.error(str, e).
       Structured by category: worker crashes YES, service-unreachable YES,
       best-effort side paths NO. 2 of 3 → 20 × 2/3 = 13.3 → 13.
11/15  errors recorded durably — 5 of 7 workers call recordWorkerError.
       gateway and realtime have NO central catch at all. 15 × 5/7 = 10.7 → 11.
10/10  platform observability enabled — 7 of 7 workers, in BOTH environments
                                                                        = 77
```

The store itself is excellent: `error_logs` in the operations database carries `request_id`,
a 90-day retention rule, a resolve workflow, and the gateway forwards verified client beacons
into it. What is missing is reach, not design.

## 5 · Environments match — 97/100 · weight 10 · defect

I re-measured this myself because the skill's probe compares only bindings, services, DO
names and `vars` keys. My scan adds `ratelimits`, `triggers.crons` and `assets`:

```
worker      prod keys   missing in staging   extra in staging
auth             7              0                  0
content          8              0                  0
data-ops        12              0                  0
gateway         11              0                  0
mcp              7              0                  0
realtime         3              0                  0
tenancy         10              0                  0
            ---------
TOTAL           58              0                  0
```

**58 of 58 keys identical.** Named environments do not inherit bindings in wrangler, so every
one of these is repeated deliberately, and every one matches. `compatibility_date`
(`2026-06-01`, all 7) is one of wrangler's inheritable keys, so its top-level-only placement
is correct. Values differ only where they must: `APP_ORIGIN`, `PUBLIC_APP_URL`, `ENVIRONMENT`
and the `-staging` resource names.

**−3 (minor, clustered):** the expected value differences, per the rubric's own minor row.

**UNMEASURED — secrets.** Seven secret names across five workers × two environments
(`RESEND_API_KEY`, `CF_D1_TOKEN`, `ADMIN_KEY`, `TEST_LOGIN_KEY`, `INTERNAL_KEY`,
`ANTHROPIC_API_KEY`, plus `CF_ACCOUNT_ID` as a var) exist only in Cloudflare, which I cannot
reach. **Nothing in the repo asserts they match** — and one of them, `TEST_LOGIN_KEY`, must
exist on staging and must NOT exist on production. `scripts/smoke-staging.mjs` runs against
staging only. This is the one real hole in an otherwise exemplary parity story, and it is a
hole that cannot be closed by reading.

## 6 · Live data can be recovered — 100/100 · weight 12 · coverage

```
30/30  a documented way to back up each stateful store — D1 Time Travel, automatic,
       for the core DB, the ops DB and every per-team DB (OPERATIONS.md:344)
25/25  a documented restore path + when it was last tested — the drill of 2026-08-18,
       six numbered steps, on a throwaway DB (OPERATIONS.md:364-386)
20/20  point-in-time recovery available, window stated — 30 days paid / 7 free,
       checked against Cloudflare's docs on the same date
15/15  per-tenant restore without restoring everyone — explicit, and structurally
       true because each team has its own database
10/10  what is NOT backed up is written down — R2 is not versioned; anything older
       than 30 days is unrecoverable, and OPERATIONS.md says nothing exports it
                                                                        = 100
```

The drill is the reason this scores 100 rather than the rubric's 55 cap for an untested
restore, and it is the rare kind of documentation that produced findings by being executed:
it discovered that the previously-documented `time-travel info --remote` is not a valid flag,
and that only the imprecise `--timestamp` form had been written down.

**Honest caveat:** the drill's *execution* is a claim in a document; I cannot reproduce it
without cloud access. What I can verify — that the runbook exists, names exact commands, and
states a date — is verified. The commands themselves I did not run.

## 7 · The next module is cheap — 84/100 · weight 10 · coverage

```
30/30  a documented, followed path — BUILD-A-MODULE.md, six layers, every line
       naming its law and the check that enforces it. Followed because
       `npm run check` goes red otherwise.
20/25  plugs into a registry rather than editing many files — it does BOTH.
       Counted 13 registries a new module lands in: RULES_REGISTRY,
       RECORD_DETAIL_COMPONENTS, FORM_DIALOGS, ACTIVITY_GATE_MAP,
       TAB_COUNT_EXCEPTIONS, CREATE_OPENS_RECORD_EXEMPT (registry.ts);
       TEAM_MODULES + MODULE_LABELS (team-schema.ts); NAV/TEAM_SECTIONS +
       CONCEPT_ICON (pages.ts); BASE_RECIPES + MODULE_PERMISSION (screens.ts);
       TEAM_RESOURCES (live-resources.ts); MODULE_SHELLS (gateway index.ts);
       TOP_LEVEL_MODULES (deep-link/route.ts); BULK_DOORS (bulk-doors.ts);
       a cap in limits.ts; an import TargetDef.  25 × 0.8 = 20.
12/20  touches a small, predictable set of files — counted from the checklist at
       BUILD-A-MODULE.md:546-596: ~18-20 existing files edited + 4-5 new, across
       4 workspaces. The two most recent feature commits touched 45 files
       (081595d, R25) and 17 files (9d1de92, R24). Predictable: yes, every file
       named. Small: no.  20 × 0.6 = 12.
12/15  a template, generator or worked example — a worked module walked end to
       end in prose, plus Learning as the live reference. No code generator, no
       scaffold command.  15 × 0.8 = 12.
10/10  the seam is named concretely — every checklist line is file + symbol
                                                                        = 84
```

This is not a criticism of the path; it is the direct, visible price of 25 machine-checked
laws. Each law buys a real guarantee and costs one registry line per module. Scoring it 100
would hide that price.

## 8 · The platform is a choice, not a cage — 73/100 · weight 6 · coverage

```
18/35  platform-specific APIs concentrated — HALF. Per-team SQL runs in exactly
       one file (shared/workers/d1-rest.ts). Core + ops SQL does not: 130
       `.prepare(` call sites across 26 files, straight onto Cloudflare's
       D1Database binding shape, with no adapter. 35 × 0.5 = 17.5 → 18.
15/25  an adapter/port layer exists — d1-rest.ts is a genuine port for per-team
       data; opsDatabase() (ops-db.ts:41) is a ROUTER that returns the raw
       binding, not an adapter. Real mitigation: error-log.ts and trace.ts use
       STRUCTURAL types (`type CoreDb = { prepare(...) }`) so shared/ compiles
       with no Workers types at all — a deliberate decoupling technique.
       25 × 0.6 = 15.
20/20  the cost of moving is written down — PLATFORMS.md maps 5 pillars across
       10 providers with an effort rating each, and names the seam file per
       pillar. This is better than most products ever write down.
20/20  business rules testable without the platform runtime — vitest under
       node/jsdom, not workerd (web/vitest.config.ts). trace.test.ts drives
       `answers`/`dead`/`hangs` fake bindings with no platform present.
                                                                        = 73
```

Low weight on purpose. Cloudflare is the right choice here and `PLATFORMS.md` says so
plainly. The finding is only that **the written cost of moving is understated**, because
`PLATFORMS.md:26` says `d1-rest.ts` is "the ONLY place SQL runs" and 130 call sites in 26
files say otherwise.

---

## Findings

### F1 · CRITICAL (to the law, not to production) — R11's check is blind in two directions, and one of its exemptions can never fire

**Plain English:** the law that says "every call leaving a worker is bounded and guarded" is
enforced by a scan that reads the wrong set of files and can be walked past with a local
variable. It has been green since the day it was written, and it is green now, over code
that violates it.

- `web/test/rules.test.ts:265-291` — the `service-calls-bounded` check calls
  `workerSources()` (`:32-44`), which walks **`workers/*/src` only**. I ran the same walk:
  **64 files, zero of them under `shared/`.** Its own reviewed exemption is keyed
  `"shared/workers/http.ts"` — a path that **can never appear** in what it scans. The
  exemption is decoration; `shared/workers/` — home of `gating.ts`, `realtime.ts`, `http.ts`,
  `account-activity.ts` — is unscanned.
- The same check tests `new RegExp('env\\.CONTENT\\.fetch\\(')`. `workers/data-ops/src/lib/import.ts:381`
  writes `const fetcher = target.endpoint.binding === "CONTENT" ? env.CONTENT : env.TENANCY`
  and calls `fetcher.fetch(...)` on the next line. The regex cannot see it.
- Its `BINDINGS` list is `["AUTH","TENANCY","CONTENT","DATAOPS","MCP","REALTIME"]`. The
  Durable Object binding `CHANNELS` is not in it, and `workers/realtime/src/index.ts:141`
  fans out `env.CHANNELS.getByName(...).broadcast(body)` inside a `Promise.all` with no
  guard and no bound at that site. (The *caller* is protected by `callService`'s 5 s, so the
  exposure is confined to the realtime worker itself — but the law does not cover DO RPC at
  all, and that is worth deciding rather than discovering.)

**Why it matters:** this is the exact failure the campaign brief names — a check that has
been green forever while not looking at the thing it claims to check. It is how F2 shipped.

**The fix:** widen `workerSources()` to include `shared/**/*.ts` (which makes the existing
`shared/workers/http.ts` exemption meaningful); add a second pattern that flags
`<identifier>.fetch(` where that identifier was assigned from `env.<BINDING>` in the same
function; state a decision about `CHANNELS` in the check's comment (either add it to
`BINDINGS` or exempt it with a reason). Then sabotage-test all three: break each, watch it go
red naming the right file, restore **from a copy, never `git checkout`** (`CONTRIBUTING.md:59`).

### F2 · HIGH — three service-binding calls are unbounded, uncorrelated and outside the law

`workers/data-ops/src/lib/import.ts:381-382` (`writeRow`)
`workers/data-ops/src/lib/import.ts:415-416` (`writeParcel`)
`workers/data-ops/src/lib/import-batch.ts:161-162` (`buildResolvedMap`)

All three alias a service binding into `fetcher` and call `fetcher.fetch(...)` directly. None
has an `AbortSignal`. None sends `x-request-id`. None is in R11's exemption list, and R11
names exactly two exceptions — neither is these.

**Why it matters, concretely.** These are the *import* write path — the longest-running,
highest-row-count, most-likely-to-be-retried operation the product has.

1. **Unbounded:** a wedged `content` or `tenancy` worker holds a customer's import request
   open with no ceiling of its own.
2. **Untraceable:** an import fans out one request into thousands of door calls, and not one
   of them carries the id the gateway minted. "Which of the 4,000 rows failed, and what did
   the door say?" cannot be answered from `error_logs` — which is precisely the question
   `shared/workers/trace.ts`'s header comment says the seam exists to answer.
3. **Dishonest failure:** a dead binding throws, `confirmImport`'s catch
   (`import.ts:496-506`) releases the session claim and rethrows, and the caller gets a
   generic 500. `confirmBatch` has no catch at all around lines 252/267/277, so a mid-batch
   outage leaves the batch permanently `'running'`.

**The fix:** route all three through `forwardToDoor` (they already forward a cookie and a
path — it is nearly a drop-in), passing `requestId: request.headers.get(REQUEST_ID_HEADER)`.
That fixes the trace id and puts them under the one exemption that already reasons about
unbounded import duration. Leave them unbounded, deliberately and in writing.

### F3 · HIGH — `forwardToDoor` is documented as "guarded" and is not

`shared/workers/http.ts` contains **zero** `try` or `catch` in all 79 lines. `RULES.md:29`
(R11) states: *"the gateway proxy and `forwardToDoor` are **guarded** but deliberately NOT
bounded"*. `shared/rules/registry.ts:93` repeats it. The check's own exemption text
(`rules.test.ts:271`) is more careful — it claims only "Deliberately unbounded… It DOES carry
the trace id" — so the law's prose overclaims what its check believes.

Its two call sites — `workers/data-ops/src/lib/tools.ts:289` (every agent tool call) and
`workers/mcp/src/lib/tools.ts:179` (every MCP tool call) — do not wrap it either. A dead
downstream worker surfaces to an MCP client as a JSON-RPC 500 rather than the 503-with-a-
reason that `workers/mcp/src/lib/bridge.ts:36-40` is careful to produce for the same
condition one function earlier.

**The fix:** either wrap the `fetcher.fetch` in `forwardToDoor` in a `try/catch` that returns
a 503 `Response` (matching `proxyService`'s shape, minus the timeout), or correct R11's
sentence in `RULES.md` and `registry.ts` to say "guarded by the caller's central catch". The
first is better; the second is honest. Doing neither leaves a law that describes code that
does not exist.

### F4 · HIGH — the public door has no central catch and records nothing

`workers/gateway/src/index.ts:74-254` — the `fetch` handler has no handler-level
`try/catch` (the only `try` in the file is the beacon's `JSON.parse` at `:167`), no D1
binding (`wrangler.jsonc` declares none), and never calls `recordWorkerError`. It is one of
**two of seven** workers with no central catch; `workers/realtime/src/index.ts:119-187` is
the other (and realtime *could* record — `opsDatabase(env)` falls back to `env.DB`, which it
has).

**Reachable today, no auth required:** `GET /media/%`. That path is `run_worker_first`
(`gateway/wrangler.jsonc:22`), skips the rate limiter (which covers `/api/*` and `/mcp`
only), and reaches `decodeURIComponent(pathname.slice("/media/".length))` at `:214` as a bare
argument. `decodeURIComponent("%")` throws `URIError`. The visitor gets Cloudflare's 1101
error page with no body; nothing lands in `error_logs`; the request id minted eleven lines
earlier correlates nothing.

**The fix:** wrap the gateway handler body in the same shape the other five use, returning
`fail(500, …)` with the request id in the response header. Give the gateway an `OPS` binding
so it can call `recordWorkerError` (its staging and production ops DBs already exist). Do the
same for realtime using its existing `DB`.

### F5 · MEDIUM — one `try` covers four independent nightly jobs, and the error names the wrong one

`workers/tenancy/src/index.ts:175-198`. The scheduled handler runs, sequentially and inside a
single `try`: `checkDatabaseSizes` → `runRetention` → `recomputeShardCounts` →
`sweepOrphanedUploads`. If the first throws, the other three silently do not run — every
night, for ever, until someone reads the log. And the catch records
`place: "cron/size-check"` regardless of which job actually died, so the durable record
actively misattributes the failure.

The stakes are not cosmetic: `runRetention` is the thing keeping the **shared** core database
under D1's 10 GB cap (`shared/workers/ops-db.ts:1-20` explains why that database is
everybody's problem at once), and `sweepOrphanedUploads` is the only thing bounding R2 growth.

**The fix:** four separate `try/catch` blocks, each recording with its own `place`, each
letting the next job run. Four lines of structure, no new concepts.

### F6 · MEDIUM — the retention sweep deletes from seven tables no document says it may

`shared/workers/retention.ts:45-96` declares rules for `login_codes`, `email_change_codes`,
`idempotency_keys`, `account_activity` (auth's), `error_logs`, `agent_usage_log`; `:117`
declares the `sessions` sweep. All seven are executed by **tenancy** at
`workers/tenancy/src/lib/sharding.ts:330-360`. `DATA-MODEL.md` names an owner for `users` and
`selectable_data` but says nothing about who may delete from these.

This is not a bug today — every one is an aged-or-expired-exhaust DELETE against a policy file
with a written reason per rule, and none can contradict the owning worker. It is a gap in the
*stated* model that the base otherwise holds itself to, and it hides a coupling: a column
rename in auth breaks a sweep in tenancy.

**The fix (Tier 3 — this is a design decision, not a repair).** The cheap answer is one
paragraph in `DATA-MODEL.md`: *"lifecycle deletes are owned by `shared/workers/retention.ts`
and executed by tenancy's cron, because tenancy holds the only cron; the owning worker owns
every other write."* The thorough answer — auth exposing an internal sweep door that tenancy
calls — buys correctness at the cost of a new cross-service hop, and I do not recommend it.

### F7 · MEDIUM — 27 of 33 server log lines cannot be filtered by request id

`traceError` (`shared/workers/trace.ts:64`) exists precisely for this, and its own comment
says *"Plain `console.error("thing failed:", e)` cannot be filtered by anything."* There are
**6** `traceError` call sites and **27** plain `console.error` sites in production worker and
shared source. The structured ones cover the two highest-value paths (every worker crash via
`recordWorkerError`, every service-unreachable via `callService`). The 27 are the best-effort
side channels — `tenancy/lib/notify.ts:64,84,104`, `invites.ts:216,278,280`,
`content/lib/notify.ts:122,126`, `gating.ts:212`, `rate-limit.ts:112`,
`concurrency.ts:142`, `sharding.ts:93,444`, `teams.ts:97,172` — which is exactly the set you
reach for when one customer reports one thing that did not happen.

**The fix:** mechanical substitution of `traceError({ req, worker, place, event, detail })`
for `console.error(str, e)` at those 27 sites. Several already have the request in scope; the
ones that do not need it threaded one level.

### F8 · LOW — 8 of 17 outbound hops carry no request id

`shared/workers/realtime.ts:105` (the publish seam — one site, but every write in the base
passes through it), `workers/content/src/lib/notify.ts:66`,
`workers/tenancy/src/lib/notify.ts:35`, `workers/tenancy/src/lib/invites.ts:255`,
`workers/mcp/src/lib/bridge.ts:24`, plus F2's three. Each is a one-line fix: thread `req`
into the `opts` object `callService` already takes. The publish seam needs the request passed
down through `publishChange`, which is a signature change across ~53 call sites — worth
weighing against F7, which buys more for less.

### F9 · LOW — `error_logs` has two writers and no named owner

`shared/workers/error-log.ts:38` appends; `workers/data-ops/src/routes/admin.ts:50` updates
`status`/`resolved_at`/`resolution_note`. Disjoint columns, both doors described in
`ERROR-HANDLING.md`, but the base named an owner for `users` and `selectable_data` and did
not for this one. One sentence in `DATA-MODEL.md` closes it.

### F10 · LOW — `PLATFORMS.md` understates the cost of a port

`PLATFORMS.md:26` — "`shared/workers/d1-rest.ts` … the ONLY place SQL runs". True for
per-team data. The core and operations databases are reached at **130 `.prepare(` call sites
across 26 files** via Cloudflare's `D1Database` binding API, with no adapter. A port would
rewrite all 130, not one seam. Cross-reference: **`story_checks_out_review`** for the doc
contradiction; the coupling itself is scored above.

### F11 · UNMEASURED — secret parity

Seven secret/var names across five workers × two environments, verifiable only in Cloudflare,
which this review cannot reach. Nothing in the repo asserts them. `TEST_LOGIN_KEY` in
particular must be present on staging and absent on production — a difference that is correct
and that nothing checks. Cross-reference: **`security_sentry_review`**.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** widen `workerSources()` to `shared/`, add an aliased-binding pattern, decide on `CHANNELS` | `web/test/rules.test.ts` | ADDS ~20 lines of scan + 1 exemption comment | **`lean_mean_review`** — more test code, and rules.test.ts is already the largest single file in `web/test`. Also **`speed_review`** marginally: the scan reads ~30 more files on every `npm run check`. Worth it: this check is the only thing standing between R11 and F2 recurring. |
| **F2** route the 3 import writes through `forwardToDoor` with `requestId` | `workers/data-ops/src/lib/import.ts`, `import-batch.ts` | REMOVES 3 hand-rolled fetch blocks, ADDS 3 seam calls (net **fewer** lines) | **none — it deletes duplicated request-building and reuses an existing seam, which `lean_mean_review` rewards.** Watch: `forwardToDoor` sends `Content-Type` and a JSON body on POST exactly as the current code does, so the door contract is unchanged. |
| **F3a** guard `forwardToDoor` with a 503 fallback | `shared/workers/http.ts` | ADDS ~10 lines in one shared file | **`speed_review`: none** (a `try` around an already-awaited call costs nothing). **`interfacelessness_review`: helps** — an MCP client gets a retryable 503 instead of a 500. |
| **F3b** *(alternative)* correct R11's wording | `RULES.md`, `shared/rules/registry.ts` | REMOVES a false claim, adds no code | **`story_checks_out_review`: helps.** But it lowers the guarantee rather than raising it — prefer F3a and keep the wording. |
| **F4** central catch + `OPS` binding on gateway and realtime | `workers/gateway/src/index.ts`, `workers/gateway/wrangler.jsonc`, `workers/realtime/src/index.ts` | ADDS ~12 lines × 2 and 1 binding × 2 envs × 1 worker | **`spend_review`** — the gateway gains a D1 binding it did not have, so a crash now costs a write. Bounded by how often the gateway crashes (should be ~never). **`scaling_review`** — `error_logs` is in the ops DB with a 90-day sweep, so growth is already governed. **`activity_log_review`: helps.** |
| **F5** four `try`s instead of one in the nightly cron | `workers/tenancy/src/index.ts` | ADDS ~12 lines | **`lean_mean_review`** — mild, four near-identical blocks invite a helper; a small `runJob(name, fn)` wrapper keeps it DRY and costs 6 lines. Otherwise neutral. |
| **F6** document the retention executor | `DATA-MODEL.md` | ADDS one paragraph, no code | **none — a doc paragraph that resolves a real ambiguity; `story_checks_out_review` scores it up.** Do NOT take the "route through auth" variant: it adds a cross-service hop, which raises coupling in this review and costs `speed_review`. |
| **F7** 27 `console.error` → `traceError` | 14 files across `shared/workers` + 5 workers | ADDS the `req` parameter threading; roughly line-neutral | **`spend_review` and `speed_review`** — `traceError` does a `JSON.stringify` per line where `console.error` did not, and these fire on best-effort paths that can be hot (every failed notify). Bounded: `detail` is already sliced to 500 chars. **`error_log_review`: helps substantially.** |
| **F8** thread `req` into the 5 remaining `callService` sites | `shared/workers/realtime.ts`, `content/lib/notify.ts`, `tenancy/lib/notify.ts`, `tenancy/lib/invites.ts`, `mcp/lib/bridge.ts` | ADDS a parameter to `publishChange`'s ~53 call sites if done fully | **`lean_mean_review`** — 53 call-site edits for a log field is a poor trade. Recommend the 4 cheap sites and NOT the publish seam, unless F7 lands first and makes the id worth having everywhere. |
| **F9** name `error_logs`' owner | `DATA-MODEL.md` | one table row | none — a doc line. |
| **F10** correct the "ONLY place SQL runs" claim | `PLATFORMS.md` | REMOVES an overclaim, adds an honest count | **none — it makes a port estimate more accurate, which only helps whoever does one.** |
| **F11** a secret-parity checklist in the smoke script | `scripts/smoke-staging.mjs` | ADDS a name-only presence probe (never values) | **`security_sentry_review`** — must probe *presence*, never echo a value, and must assert `TEST_LOGIN_KEY` is ABSENT on production. Get that backwards and you have built a secret-enumeration endpoint. Treat as Tier 2, drafted and reviewed. |

**Two tensions worth stating plainly:**

- **F1 + F7 both add code to raise robustness.** `lean_mean_review` scores less code higher.
  I judge F1 clearly worth it (the check is the load-bearing part of a law) and F7 worth it
  in the 14 files where a customer-visible action failed silently; the rest can stay.
- **Criterion 7 pulls the other way from every law.** Making the next module cheaper means
  fewer registries, which means fewer machine-checked laws. Do not "fix" criterion 7 by
  deleting a law. It scores 84 for a good reason.

---

## CEILING

**95 is reachable, but only just, and not by fixing the findings above alone.**

Fixing **every** code-fixable finding in this report (F1–F5, F7–F10) gets criteria 3 and 4 to
100, criterion 2 to its own ceiling, and leaves 7 and 8 untouched:

```
1: 100×16=1600   2: 85×18=1530   3: 100×16=1600   4: 100×12=1200
5:  97×10= 970   6:100×12=1200   7:  84×10= 840   8:  73× 6= 438
                                                   total 9378 → 94
```

**94 is the practical ceiling of this review's findings.** Reaching 95 requires taking points
out of criterion 7 or 8, and both cost something another review is measuring:

- **Criterion 2 is permanently capped at 85** by a locked decision.
  `ARCHITECTURE.md` §2b (2026-08-18, owner) rules out a session-validity cache so that
  revocation stays instant. That forfeits the rubric's 15-point "no single non-public
  component depended on by every other without a fallback" row for ever. **This is locked and
  I am not proposing it be changed** — it costs 2.7 points of the total, and instant
  revocation is worth more than 2.7 points. Naming it is the requirement; relitigating it is
  not.
- **Criterion 5 is capped at 97** by the rubric's own minor row: staging and production
  *must* differ in `APP_ORIGIN`, `PUBLIC_APP_URL`, `ENVIRONMENT` and resource names. A commit
  cannot remove a difference that has to exist.
- **Criterion 7 is capped near 90** by the 25 laws. Row 3 asks that adding a module touch a
  small set of files; 25 laws each demanding one registry line make that arithmetically
  impossible. A scaffold generator would move it to ~90; going higher means deleting laws.
- **Criterion 8's 18/35 is a Tier-3 architecture change**, not a repair: putting 130
  core-database call sites behind an adapter is a real abstraction layer that `lean_mean_review`
  would score against and that buys nothing unless a port is actually planned. My
  recommendation is to fix **F10** (make the written cost honest) and leave the coupling
  alone. That leaves criterion 8 at 73 by choice.

**The single worst structural risk, in one sentence:** the law that is supposed to guarantee
every call leaving a worker is bounded and guarded is enforced by a check that does not read
`shared/`, cannot follow a binding through a local variable, and has therefore been green for
a week over three unbounded, untraceable calls on the import path — so the base's strongest
safety mechanism, machine-checked law, is currently the thing hiding the fault.
