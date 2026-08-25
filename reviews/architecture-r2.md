# Architecture review — round 2 — Brimba · 2026-08-25
SCORE: 89/100   (round 1: 87/100 · the pass before that: 96/100, measured 2026-08-18)

## DELTA
Round 1: 87/100 → Round 2: **89/100**

| # | Criterion | wt | R1 | R2 | Why it moved |
|---|---|---|---|---|---|
| 1 | Dependencies point one way | 16 | 100 | **100** | Unchanged. Re-measured from scratch: 196 production files, 0 cycles, 0 layer violations, 0 cross-worker production imports. The repairs added only test files and one test-only shared module. |
| 2 | Blast radius is contained · **GATE** | 18 | 76 | **77** | +4 in the "bounded" row (16 → 20): the three raw aliased `fetcher.fetch(…)` calls on the import path now go through `forwardToDoor`, so 18/18 service-binding hops are bounded-or-reasoned (was 14/17). **−3 in "graceful degradation"** (15 → 12): the new gateway central catch turned an anonymous, un-rate-limited `GET /media/%` into one durable database write per request (**R2-F0**). Net +1. The locked 0/15 row is still 0. |
| 3 | Every fact has one owner | 16 | 87 | **87** | Unchanged. Same 4 multi-writer tables, same two open penalties (F6 retention executor −7, F9 `error_logs` owner −3, no-check −3). `addReply` writing an activity row did **not** create a second writer — `activity` still has exactly one (`shared/workers/activity.ts`). |
| 4 | A request can be followed | 12 | 77 | **86** | +9. Durable recording went 5/7 workers → **7/7** (gateway and realtime both gained a central catch): 11 → 15. Trace-id propagation went 9/17 → **13/18** hops: 13 → 18. The "logs are structured" row did **not** move (still 25 plain `console.error` vs 6 `traceError`). |
| 5 | Environments match | 10 | 97 | **97** | Unchanged. Re-measured across 69 keys per environment (bindings, vars, ratelimits, crons, assets sub-keys, observability, DO migrations): 0 missing in staging, 0 extra. Secrets remain **unmeasured**. |
| 6 | Live data can be recovered | 12 | 100 | **100** | Unchanged. `OPERATIONS.md` backup/restore section untouched; the 2026-08-18 drill still recorded; R2's non-versioning still written down. |
| 7 | The next module is cheap | 10 | 84 | **84** | Unchanged. No new registry was added by the repairs. The last two *feature* commits are still `081595d` (45 files) and `9d1de92` (17 files). |
| 8 | Platform is a choice, not a cage | 6 | 73 | **73** | Score unchanged, direction slightly wrong: core/ops `.prepare(` call sites went **130 → 133** across the same 26 files, and `PLATFORMS.md` was edited without correcting its "the ONLY place SQL runs" overclaim (finding R2-F5). |

**No criterion fell, but one row inside criterion 2 did**, and five sub-measures fell with it.
Each is a finding below:
**R2-F0** (HIGH, the row that fell — the gateway's new central catch made a malformed public
URL a durable write, unauthenticated and outside the surge ceiling),
R2-F1 (the unguarded `forwardToDoor` seam went from 2 call sites to 5),
R2-F2 (the public door's crash recording now depends on the SPOF),
R2-F3 (realtime's new error rows land in the core database, not the operations one),
R2-F5 (platform coupling grew 130 → 133).

Every one of those five was **caused by a repair**, which is precisely what this round exists
to find. None of them argues the repairs were wrong; four of the five are cheap to close.

---

## Arithmetic

```
#  criterion                          method    score  weight  product
1  Dependencies point one way         defect      100    16     1600
2  Blast radius is contained   GATE   coverage     77    18     1386
3  Every fact has one owner           defect       87    16     1392
4  A request can be followed          coverage     86    12     1032
5  Environments match                 defect       97    10      970
6  Live data can be recovered         coverage    100    12     1200
7  The next module is cheap           coverage     84    10      840
8  Platform is a choice, not a cage   coverage     73     6      438
                                                        100     8858

                                        total = 8858 / 100 = 88.58 → 89
```

Gate: criterion 2 must clear 40 or the total caps at 65. It scores **77**. **No cap applied.**

### CAMPAIGN INTEGRITY — the working tree is not clean, and it is not mine

`git status` during this run showed the shared tree being **written to live** by other
round-2 agents, despite the read-only rule, and the set kept growing while I checked it. By
the time I finished it included `CLAUDE.md`, `RULES.md`, `shared/rules/registry.ts`,
`workers/gateway/src/index.ts`, `web/components/app-shell.tsx`, `web/test/rules.test.ts`,
four `*-seam.test.ts` files, a new `shared/test/publish-seam.ts` — and **two deleted source
files**, `web/lib/live-bus.ts` and `web/lib/use-live-refetch.ts` (the latter is named by name
in R15's text in `RULES.md`). That is a structural change, not a patch.

**I checked whether it invalidated anything I measured. It did not:**

- `web/test/rules.test.ts` — the edits are at lines ~887 and ~992 (the **R15** and **R25**
  checks). The **R11** `service-calls-bounded` check at `:209-261`, which I was asked to
  verify, is untouched.
- `RULES.md` and `shared/rules/registry.ts` — **R11's wording is untouched**, so R2-F1's
  quotation of `RULES.md:29` and `registry.ts:93` still holds.
- `workers/gateway/src/index.ts` — the edit adds a `decodeKey` boundary at `:44` and rewrites
  the two `/media/*` handlers. The **central catch** I was asked to verify is untouched; it
  has only shifted down by 25 lines.
- `error-seam.test.ts` and the two `gating-seam` files — all strengthened further, which makes
  the credit I gave them more deserved, not less.

**Every score and line number in this report is measured against commit `fe7d683`**, not the
working tree. Gateway line numbers I cite are ~25 lower than the dirty tree's.

Two things follow. First, someone should decide whether these edits are wanted before they
are committed — they were not serialized and were not reviewed. Second, and more usefully:
the `/media/*` edit exists because two other reviews independently found the same fault I am
filing as **R2-F0**, in the same re-measure. Three reviews converging on one line is the
strongest signal this campaign has produced.

### The one place I could have flattered the number, and did not hide it

Round 1 built its denominator from **service-binding hops only** — 17 of them — and
excluded the three Durable Object RPC hops (`env.CHANNELS.…`), reporting them instead as
part of finding F1. I have kept that denominator so this round's delta is measured with
last round's yardstick. Round 2's equivalent is **18** hops.

On the stricter, complete basis — 21 hops, counting the three DO RPCs at
`workers/realtime/src/index.ts:161, :186, :198` — criterion 2 is **74** and criterion 4
is **83**, and the total is **88**, not 89. The difference is 0.9 of a point. I report 89
on round 1's basis and 88 on the complete one; take the lower if you prefer, nothing in
the findings changes either way. The gap itself is finding **R2-F4**.

### What I verified by hand rather than by probe

The skill's probe still reports the same five wrong things it did in round 1, for the same
reasons (it counts test-file regexes as SQL writers, cannot see `db/**/*.sql`, and reports
a meaningless 37% "guarded" ratio built from every textual `env.REALTIME`). All eight
criteria below were re-measured with purpose-built scripts, test files excluded, comments
stripped. Numbers marked *(probe)* are the probe's; everything else is mine.

---

## The three specific verifications asked for

### 1 · R11's check reads `serverSources()` and catches an aliased binding — **CONFIRMED, and proven able to fail**

`shared/test/source.ts:210` defines `serverSources()` as `workerSources()` plus a walk of
`shared/workers/`. `web/test/rules.test.ts:228` calls it. The check also carries a tripwire
(`:253-256`) asserting its own subject list contains `shared/workers/` — the thing that
would have caught the original blindness.

I could not sabotage the repo (read-only), so I replicated `stripComments` + `serverSources`
+ the whole offender scan in a standalone script and ran it against the real tree and against
seven synthetic files:

```
subject list:      90 files (round 1: 64, workers/*/src only)
sees shared/workers: true
offenders on the real repo: []            ← the three F2 sites are gone

sabotage                                        result
  env.CONTENT.fetch( in a worker                CAUGHT
  const fetcher = t.x ? env.CONTENT : env.TENANCY … fetcher.fetch(   CAUGHT   ← the exact F2 shape
  env.AUTH.fetch( in shared/workers/            CAUGHT   ← impossible before
  the same alias split across two lines         CAUGHT
  a file whose first line ends "icons/*"        CAUGHT   ← the stripComments bug
  const { CONTENT } = env … CONTENT.fetch(      MISSED
  const f = pick(env) … f.fetch(                MISSED
```

Five of seven evasions closed, including all three that mattered. The two misses are
finding **R2-F6** and neither shape exists in the tree today (`grep -nE "\}\s*=\s*env\b|=\s*env\["`
over `workers/*/src` and `shared/workers` returns nothing).

### 2 · The three import-path violations go through `forwardToDoor` — **CONFIRMED**

`workers/data-ops/src/lib/import.ts:389` (`writeRow`), `:428` (`writeParcel`) and
`workers/data-ops/src/lib/import-batch.ts:163` (`buildResolvedMap`) now call
`forwardToDoor(…)`, each passing `requestId: requestIdFrom(request)` and `origin: "import"`.
Every direct `.fetch(` on a service binding left in production server code is now in exactly
two files: `shared/workers/trace.ts` (the seam) and `shared/workers/http.ts` (the one reviewed
exemption). The `env.ASSETS.fetch` sites in the gateway are excluded by a written decision in
the check itself.

The three problems F2 named are resolved in two and a half:
- **untraceable** → fixed, all three carry the id;
- **unbounded** → still unbounded, but now under the one exemption that reasons about it in
  writing, which is what F2 asked for;
- **dishonest failure** → *partly*. `confirmImport` (`import.ts:453`) wraps its `writeRow`
  loop in a try that releases the session claim and rethrows. `confirmBatch`
  (`import-batch.ts:185-305`) still has **no try at all** around `:257`, `:272`, `:282`, so a
  mid-batch outage still leaves the batch permanently `'running'`. Carried forward as R2-F7.

### 3 · The gateway and realtime have central catches that record — **CONFIRMED, with a caveat each**

All **7 of 7** workers now record crashes centrally (round 1: 5 of 7).

- `workers/gateway/src/index.ts:88-112` — a real central catch around `route(…)`, minting the
  request id first, calling `traceError` and then posting to auth's `/internal/log-error`. It
  deliberately takes no D1 binding, and the reason is written above it.
- `workers/realtime/src/index.ts:120-133` — `recordWorkerError(opsDatabase(env), …)`.

The check behind them (`workers/data-ops/test/error-seam.test.ts`) is now **derived from
disk** and reads only `catchBodies(src)`, not the whole file — it was a hardcoded four-name
list, which is exactly why it never saw these two. It carries its own tripwire
(`expect(WORKERS).toContain("gateway")`). This is a genuinely good repair.

The caveats are R2-F2 (the gateway's route depends on auth) and R2-F3 (realtime's rows land
in the wrong database).

---

## 1 · Dependencies point one way — 100/100 · weight 16 · defect

Rebuilt independently over **196 production `.ts`/`.tsx` files** (76 test files excluded,
`import type` dropped, `@shared/*` and `@/*` aliases resolved):

```
file-level cycles                 0
component-level cycles            0
layer violations (upward imports) 0
cross-worker production imports   0
production component edges        worker:* -> shared only (7 edges, 214 imports)
shared/ imports                   shared/ and node: builtins only
```

The new module `shared/test/source.ts` is imported by six test files and by
`shared/test/gating-seam.ts`. **No production file imports it** — I checked, because a
module doing `readdirSync` from `node:fs` reaching a deployed worker bundle would be a real
finding. It does not.

**Penalties: none. A clean result is a real result.**

Unchanged from round 1 and still worth knowing rather than fixing: `auth` and `realtime`
bind each other. Documented as asymmetric in `ARCHITECTURE.md` §2b; its one sharp edge
(cold-start error 10143) is in `OPERATIONS.md:43`.

## 2 · Blast radius is contained — 77/100 · weight 18 · coverage · THE GATE

**The worst case, named:** if `brimba-auth` is down, **6 of the 7 workers** stop serving
gated requests. The person sees *"We couldn't check your sign-in just now. Nothing was
changed — try again in a moment."*, their work stays on screen, open sockets keep running,
static pages and `/media/*` keep serving. Documented and deliberate (`ARCHITECTURE.md` §2b).
**New this round:** during that outage the gateway also stops *recording* its own crashes,
and each one costs an extra 5 s (R2-F2).

Every place a request leaves a worker over a binding, re-enumerated:

| path | sites (R1→R2) | bounded | guarded | carries trace id |
|---|---|---|---|---|
| `callService` (`shared/workers/trace.ts:88`) | 10 → **11** | yes, 5 s | yes, returns `null` | **6 of 11** |
| `proxyService` (`trace.ts:126`) | 2 → **2** | no — written reason | yes, clean 503 | 2 of 2 |
| `forwardToDoor` (`shared/workers/http.ts:41`) | 2 → **5** | no — written reason | **no guard in the file** | **5 of 5** |
| raw aliased `fetcher.fetch(…)` | 3 → **0** | — | — | — |
| *(not counted — see basis note)* `env.CHANNELS` DO RPC | 3 → 3 | no, no reason | worker central catch | 0 of 3 |

```
30/30  guarded — 18/18 sites terminate in a guard rather than an unhandled rejection.
                 Round 1's method, kept. Sub-count moved the WRONG way: 12/17 (71%) in
                 a purpose-built guard → 13/18 (72%) — flat — but the 5 that reach only
                 a worker central catch are now ALL on the seam R11's prose calls
                 "guarded" and which contains zero try/catch in 79 lines (R2-F1).
20/20  bounded — 11/18 bounded + 7/18 unbounded WITH a written reviewed reason = 18/18.
                 Round 1: 14/17 → 16. This is the whole of the +4.
12/20  graceful degradation — real and plural on the request path (rate limiter fails
                 open, shard lookup falls back to 1, notify failures are swallowed),
                 MINUS 5 for the nightly cron chain (F5) and MINUS 3, new this round,
                 for R2-F0: a malformed public URL now degrades UPWARDS, from a bare
                 platform error into an unauthenticated, un-rate-limited durable write.
                 Round 1 scored this row 15.
15/15  the highest fan-in component is documented as the SPOF, with its consequence —
                 ARCHITECTURE.md §2b, unchanged.
 0/15  no fallback for the component every other one depends on  ← LOCKED owner decision
                                                                  = 77
```

**The 0/15 is a locked decision, not an oversight.** A short-lived session-validity cache
would earn these 15 points and let a brief auth wobble pass unnoticed. It would also let a
revoked session — a departing employee, a stolen laptop — keep working for the length of
that cache. `ARCHITECTURE.md` §2b records the owner's 2026-08-18 decision to keep revocation
instant. **I am not proposing it be changed.** It is named because it is the single largest
permanent cost in this review (see CEILING).

## 3 · Every fact has one owner — 87/100 · weight 16 · defect

Rebuilt from scratch, test files excluded, comments stripped, matched only against tables
the schema actually declares. **35 tables declared, 33 written, 4 with more than one
production writer** — identical to round 1:

| table | writers | verdict |
|---|---|---|
| `users` | auth ×3, tenancy ×5 | **clean** — disjoint columns, owner per column in `DATA-MODEL.md:63-73` |
| `selectable_data` | tenancy ×5, content ×1 | **clean** — owner + the one append stated in `DATA-MODEL.md:274-280` |
| `error_logs` | shared ×1 (append), data-ops ×1 (resolve) | **−3 minor** — disjoint, both doors documented, no owner named |
| `sessions` | auth ×7, **the retention sweep ×1 (DELETE)** | **−7 medium** — see below |
| all others (29) | one component each | clean |

**−7 · The retention sweep still deletes from seven tables it does not own.**
`shared/workers/retention.ts:45-96` declares rules for `login_codes`, `email_change_codes`,
`idempotency_keys`, `account_activity` (auth's), `error_logs`, `agent_usage_log`; `:117`
declares `EXPIRED_SESSIONS_SQL`. All seven are executed by **tenancy**, at
`workers/tenancy/src/lib/sharding.ts:330-360`, because tenancy owns the only cron. The
*policy* has one owner and every rule carries a written reason, which is genuinely good. The
*executor* is undocumented. Note the interpolated table name (`DELETE FROM ${rule.table}`) is
invisible to any regex — I found six of the seven by reading, not scanning. Unchanged.

**−3 · The ownership model rests on prose, not a check.** Nothing turns red if a future
module adds a second writer to `users.email`. Unchanged, still not worth a check today.

`100 − 3 − 7 − 3 = 87`.

**Checked because a repair could have broken it, and did not:** `addReply` now writes an
activity row (round-2 brief), which would have made `activity` a two-writer table. It did
not — the write goes through `shared/workers/activity.ts`, still the single writer. Good.

## 4 · A request can be followed end to end — 86/100 · weight 12 · coverage

```
30/30  a request id is generated at the edge — workers/gateway/src/index.ts:88,
       requestIdFrom() BEFORE the try, so a crash in routing still has one.
       Behaviourally tested in workers/gateway/test/trace.test.ts.
18/25  propagated across every internal hop — 13 of 18 outbound sites carry it
       (R1: 9 of 17). 25 × 13/18 = 18.06 → 18.
       Still missing: shared/workers/realtime.ts:105 (the publish seam, ~53 writes),
       workers/content/src/lib/notify.ts:66, workers/tenancy/src/lib/notify.ts:35,
       workers/tenancy/src/lib/invites.ts:274, workers/mcp/src/lib/bridge.ts:24.
       All five gained by the import repair; none of these five moved.
13/20  logs are structured — 6 traceError() call sites vs 25 plain console.error(str, e).
       By category: worker crashes YES (and now the public door too), service-unreachable
       YES, best-effort side paths NO. 2 of 3 → 13.3 → 13.  UNCHANGED.
15/15  errors recorded durably — 7 of 7 workers (R1: 5 of 7).
10/10  platform observability enabled — 7 of 7 workers, in BOTH environments (probe)
                                                                        = 86
```

The +9 is real and it is the best-value repair in this round: the two workers that could not
record are the *public door* and the *live layer*, and the check that said they were covered
was a hardcoded four-name list. Both the code and the check were fixed, and the check now
derives its subject list from disk and reads only catch bodies.

## 5 · Environments match — 97/100 · weight 10 · defect

Re-measured myself. The probe compares only bindings, services, DO names and `vars` keys;
mine adds `ratelimits`, `triggers.crons`, `assets` sub-keys (binding, `run_worker_first`,
`not_found_handling`), `observability` and DO `migrations` tags. Top-level is production;
`env.staging` is staging.

```
worker      prod keys   staging keys   missing in staging   extra in staging
auth              8           8                0                  0
content           9           9                0                  0
data-ops         14          14                0                  0
gateway          14          14                0                  0
mcp               8           8                0                  0
realtime          5           5                0                  0
tenancy          11          11                0                  0
              ------      ------
TOTAL            69          69                0                  0
```

**69 of 69 keys identical.** Named environments do not inherit bindings in wrangler, so every
one of these is repeated deliberately, and every one matches. Values differ only where they
must: `APP_ORIGIN`, `PUBLIC_APP_URL`, `ENVIRONMENT` and the `-staging` resource names.

**−3 (minor, clustered):** the expected value differences, per the rubric's own minor row.

**UNMEASURED — secrets.** Seven secret names across six workers × two environments
(`RESEND_API_KEY`, `CF_D1_TOKEN`, `ADMIN_KEY`, `TEST_LOGIN_KEY`, `INTERNAL_KEY`,
`ANTHROPIC_API_KEY`, plus `CF_ACCOUNT_ID` as a var) exist only in Cloudflare, which I cannot
reach. **Nothing in the repo asserts they match** — and `TEST_LOGIN_KEY` must exist on
staging and must NOT exist on production. Unchanged from round 1; cross-reference
`security_sentry_review`.

## 6 · Live data can be recovered — 100/100 · weight 12 · coverage

```
30/30  a documented way to back up each stateful store — D1 Time Travel, automatic, for
       the core DB, the operations DB (OPERATIONS.md:244-251) and every per-team DB
25/25  a documented restore path + when it was last tested — the drill of 2026-08-18,
       six numbered steps, on a throwaway database (OPERATIONS.md:364-386)
20/20  point-in-time recovery available, window stated — 30 days paid / 7 free
15/15  per-tenant restore without restoring everyone — explicit, and structurally true
10/10  what is NOT backed up is written down — R2 is not versioned (OPERATIONS.md:387)
                                                                        = 100
```

Untouched by this round's repairs. **Honest caveat, unchanged:** the drill's *execution* is a
claim in a document. What I can verify — that the runbook exists, names exact commands and
states a date — is verified. The commands I did not run.

## 7 · The next module is cheap — 84/100 · weight 10 · coverage

```
30/30  a documented, followed path — BUILD-A-MODULE.md, every line naming its law and
       the check that enforces it. Followed because `npm run check` goes red otherwise.
20/25  plugs into a registry rather than editing many files — it does BOTH. 13 registries
       a new module lands in. 25 × 0.8 = 20.
12/20  touches a small, predictable set of files — the last two FEATURE commits touched
       45 files (081595d, R25) and 17 files (9d1de92, R24). Predictable yes, small no.
12/15  a template, generator or worked example — a worked module walked end to end in
       prose plus Learning as the live reference. No generator, no scaffold command.
10/10  the seam is named concretely — every checklist line is file + symbol
                                                                        = 84
```

I re-checked whether the six repair commits added a registry a new module would have to land
in. **They did not** — `git diff 8751e30..HEAD` over `registry.ts`, `live-resources.ts`,
`team-schema.ts`, `pages.ts`, `screens.ts` and the gateway's `MODULE_SHELLS` adds no new
exported registry. The repair commits touched 26, 15, 9, 8, 4 and 3 files.

## 8 · The platform is a choice, not a cage — 73/100 · weight 6 · coverage

```
18/35  platform-specific APIs concentrated — HALF. Per-team SQL runs in exactly one file
       (shared/workers/d1-rest.ts). Core + ops SQL does not: 133 `.prepare(` call sites
       across 26 files, straight onto Cloudflare's D1Database binding shape, no adapter.
       (Round 1: 130 across the same 26 files.) 35 × 0.5 = 17.5 → 18.
15/25  an adapter/port layer exists — d1-rest.ts is a genuine port for per-team data;
       opsDatabase() is a ROUTER returning the raw binding. Real mitigation: error-log.ts
       and trace.ts use STRUCTURAL types so shared/ compiles with no Workers types.
       25 × 0.6 = 15.
20/20  the cost of moving is written down — PLATFORMS.md maps 5 pillars across 10
       providers with an effort rating and names the seam file per pillar.
20/20  business rules testable without the platform runtime — vitest under node/jsdom,
       not workerd; trace.test.ts drives fake bindings with no platform present.
                                                                        = 73
```

Low weight on purpose. Cloudflare is the right choice here. The finding remains only that
the *written* cost of moving is understated — and this round `PLATFORMS.md` was edited
(`R1–R10` → `R1–R25`, twice) **without** correcting the two claims that are wrong: that
`d1-rest.ts` is "the ONLY place SQL runs" (`:26`) and that a port means "you rewrite ~4
files, not the product" (`:95`). See R2-F5.

---

## Findings

Round 1's F1, F2 and F4 are **closed**. F3, F5, F6, F7, F8, F9, F10 and F11 are **open and
unchanged**, and are restated compactly at the end. New this round: R2-F1 through R2-F6.

### R2-F0 · HIGH — the central catch I was asked to verify turned a malformed public URL into an unauthenticated, unlimited durable write

This is the round-2 finding: a correct repair, verified as present and working, that created
a worse problem than the one it solved. All line numbers are commit `fe7d683`.

The chain, every link confirmed by reading:

1. `workers/gateway/src/index.ts:151` — the surge ceiling covers `/api/*` and `/mcp` **only**.
   `/media/*` is deliberately outside it, with a written reason (static objects come from
   cache). Correct as written.
2. `:253-254` — `serveObject(env.MEDIA, decodeURIComponent(pathname.slice("/media/".length)), request)`.
   `decodeURIComponent("%")` throws a `URIError`. No boundary check.
3. `:88-112` — the new central catch, added this round, catches it and **writes one
   `error_logs` row per request** through auth's `/internal/log-error`.

Before this round, `GET /media/%` produced a bare platform 1101 page and nothing else — which
is exactly the fault round 1 filed as F4, and exactly the example the repair's own comment at
`:80` cites as its motivation. The repair added the *recording* and left the *boundary*
alone. So the fix for "this crash leaves no trace" became "this crash, which any anonymous
caller can trigger as fast as they can send requests, leaves an unbounded number of traces".

**Why it matters, concretely.** No sign-in, no rate limit, one row per call, into
`brimba-ops` — a database whose retention rule is by **age** (90 days), so a flood cannot be
drained, and which the nightly size alarm does not watch. On any deployment where a worker
lacks the `OPS` binding, `opsDatabase()`'s documented fallback puts those rows in
`brimba-core` instead — the shared 10 GB database that holds `users` and `sessions`, so
filling it stops sign-in for **every tenant**.

**It is also a law problem, not only a code problem.** `ERROR-HANDLING.md` says a 4xx is the
caller's mistake and is not recorded. A malformed URL is a 4xx. Nothing checks that the
central-catch seam only records 5xx-shaped faults, so the same mistake is available to the
next handler that forgets a boundary.

**The fix** (already drafted in the uncommitted working tree by another review, and it is the
right shape): a `decodeKey()` helper returning `null` on `URIError`, and both `/media/*`
handlers answering `fail(400, "invalid_path", …)`. ~15 lines, no new concepts, and it moves
the failure back to where `ERROR-HANDLING.md` says it belongs. **Additionally, and not yet
drafted:** the central catch should skip recording when the thrown error is a `GuardError`-
shaped 4xx, so the class of fault is closed rather than this one instance.

Cross-reference: `security_sentry_review` (unauthenticated resource exhaustion),
`scaling_review` (unbounded growth in the shared store), `error_log_review` (4xx polluting
the error store). All three appear to have found it; I score it here because "a public
request degrades upward into a durable write" is graceful degradation running backwards,
which is criterion 2's third row.

### R2-F1 · HIGH — fixing the import path tripled the load on the one seam that is documented as guarded and is not

`shared/workers/http.ts` — **79 lines, zero `try`, zero `catch`.** `RULES.md:29` (R11) and
`shared/rules/registry.ts:93` both state that *"the gateway proxy and `forwardToDoor` are
**guarded** but deliberately NOT bounded"*. The proxy is guarded. `forwardToDoor` is not.

Round 1 filed this as F3 with two call sites. The F2 repair routed three more through it, so
it now backs **five** paths: every agent tool call (`workers/data-ops/src/lib/tools.ts:289`),
every MCP tool call (`workers/mcp/src/lib/tools.ts:179`), and all three import writes
(`import.ts:389`, `import.ts:428`, `import-batch.ts:163`).

**This is not an argument against the repair** — the repair was right, and it bought bounding
reasons and trace ids that did not exist before. It is an argument that F3 is now three times
more load-bearing than when it was first filed and is still the oldest open architectural
finding in this review.

**Why it matters concretely:** a dead downstream worker surfaces to an MCP client as a
JSON-RPC 500 rather than the retryable 503-with-a-reason that
`workers/mcp/src/lib/bridge.ts:36-40` is careful to produce for the same condition one
function earlier. On the import path it surfaces as a generic 500 for a whole batch.

**The fix:** wrap the single `fetcher.fetch(…)` at `http.ts:78` in a `try/catch` returning
the 503 `Response` shape `proxyService` already produces (`trace.ts:133-141`), minus the
timeout. ~10 lines in one shared file. The alternative — correcting R11's sentence in
`RULES.md` and `registry.ts` to say "guarded by the caller's central catch" — is honest but
lowers the guarantee. Prefer the code.

### R2-F2 · MEDIUM — the public door's crash recording now depends on the component whose outage is the worst case

`workers/gateway/src/index.ts:94-110`. The new central catch records by calling
`callService(env.AUTH, "https://internal/internal/log-error", …)`. The gateway deliberately
binds no database, and the reason written above the catch is sound.

But the consequence is not written anywhere:

1. **During an auth outage, gateway crashes are not recorded at all.** `callService` returns
   `null` on no-answer and the gateway ignores the return value. The row is silently lost,
   and `ARCHITECTURE.md` §2b names an auth outage as the base's worst case — the exact moment
   the error log matters most.
2. **Every gateway crash costs an extra 5 s during that outage** —
   `SERVICE_TIMEOUT_MS = 5_000` (`trace.ts:42`) is awaited before the 500 is returned. Cross-reference `speed_review`.
3. **If the gateway's `INTERNAL_KEY` is unset or drifts**, auth's door refuses (`workers/auth/src/index.ts:125`, fail-closed) and the gateway ignores the 403. The gateway is the only one of seven workers whose recording can fail silently as a whole. The key *is* documented as required (`BOOTSTRAP.md:174`, `OPERATIONS.md:51`), so this is a drift risk, not a today risk.

The `viaDoor` branch of `workers/data-ops/test/error-seam.test.ts:60` asserts the *shape*
(`/internal/log-error` appears in a catch body) — it cannot and does not assert the row
landed. Cross-reference `error_log_review`.

**The fix (small):** do not `await` the record on the failure path — hand it to
`ctx.waitUntil` — and log the null. **The fix (right):** two lines in `ERROR-HANDLING.md`
saying the gateway's error path depends on auth and what that means during an auth outage,
so it is a stated trade rather than a discovered one.

### R2-F3 · MEDIUM — realtime now writes error rows into the database the operations split exists to relieve

`workers/realtime/src/index.ts:130` calls `recordWorkerError(opsDatabase(env), …)`.
`workers/realtime/wrangler.jsonc` declares `DB` and **no `OPS`** — realtime is the only
worker of the seven with a database binding and no ops binding:

```
auth      DB OPS MEDIA REALTIME
tenancy   DB OPS AUTH REALTIME MEDIA LEARNING_MEDIA
content   DB OPS AUTH REALTIME HELP_MEDIA LEARNING_MEDIA
data-ops  DB OPS AUTH CONTENT TENANCY REALTIME AI
mcp       DB OPS AUTH TENANCY CONTENT DATAOPS
realtime  DB     AUTH                       ← no OPS
gateway   (no DB — records through auth's door)
```

`opsDatabase()` returns `env.OPS ?? env.DB`, so realtime's rows land in `brimba-core` —
the shared 10 GB database that `shared/workers/ops-db.ts:1-29` explains at length must NOT
carry `error_logs`, because it is one of the two fastest-growing tables in the system and the
core database carries the sum of every tenant. Before this round realtime recorded nothing,
so the fallback never fired. Now it does.

The fallback is deliberate and correct as a *fork-safety* mechanism. It is the wrong outcome
for the base's own realtime worker. Cross-reference `scaling_review`.

**The fix:** add the `OPS` d1_databases entry to `workers/realtime/wrangler.jsonc` in both
the top-level (production) and `env.staging` blocks, copying the ids already in the other
five. Two config blocks, no code. Criterion 5 stays clean because both environments gain it.

### R2-F4 · MEDIUM — three Durable Object RPC hops are outside R11 entirely, and the decision round 1 asked for was not made

`workers/realtime/src/index.ts:161` (`env.CHANNELS.getByName(shardChannel(…)).broadcast(body)`
inside a `Promise.all`), `:186` and `:198` (`…getByName(…).fetch(request)`).

None is bounded. None carries the trace id. None is in R11's `BINDINGS` list
(`web/test/rules.test.ts:222` — `["AUTH","TENANCY","CONTENT","DATAOPS","MCP","REALTIME"]`),
so the law does not reach them.

Round 1's F1 asked for **a written decision** — either add `CHANNELS` to the list or exempt
it with a reason. The check's comment block was rewritten this round and now explains at
length why `ASSETS` is absent. It says **nothing about `CHANNELS`.** So the one part of F1
that was a judgement call rather than a mechanical fix is the part that did not land.

`DURABLE-OBJECTS.md:106, :261, :325` documents the calls; nothing decides whether the law
covers them.

**Cost, stated exactly:** counting these three hops moves criterion 2 from 80 to 77 and
criterion 4 from 86 to 83 — **0.9 of a point on the total**. The finding is not the 0.9. The
finding is that a law with a machine check has a category of call it silently does not cover,
and the base's own convention is that such a gap is a written exemption, not a silence.

**The fix:** add `CHANNELS` to `BINDINGS` with an exemption entry keyed
`workers/realtime/src/index.ts` giving the reason (a WebSocket upgrade cannot carry an abort
signal; the fan-out is already bounded by `MAX_SHARDS` and each send is best-effort inside
`broadcast()`), or add the bound. Either is fine. Silence is not.

### R2-F5 · LOW — `PLATFORMS.md` was refreshed without correcting the two claims that are wrong

`git diff 8751e30..HEAD -- PLATFORMS.md` changes exactly two lines, both `R1–R10` → `R1–R25`.
Untouched:

- `PLATFORMS.md:26` — "`shared/workers/d1-rest.ts` … **the ONLY place SQL runs**". True for
  per-team data. The core and operations databases are reached at **133 `.prepare(` call
  sites across 26 files** with no adapter.
- `PLATFORMS.md:95` — "you rewrite **~4 files**, not the product."

A document that has just been updated reads as current. This one now looks freshly checked
while still understating a port by two orders of magnitude in file count. Cross-reference
`story_checks_out_review` for the contradiction; the coupling itself is scored in criterion 8.

**The fix:** one clause on `:26` — "the only place *per-team* SQL runs; the core and
operations databases are reached directly through the D1 binding at ~133 call sites" — and a
matching correction on `:95`.

### R2-F6 · LOW — two evasions remain in R11's alias detection

Proven by replicating the check and running it against synthetic files (method above).
`web/test/rules.test.ts:243` matches `(?:const|let)\s+(\w+)…= …env.X…`, so:

- `const { CONTENT } = env` followed by `CONTENT.fetch(` — **missed** (the name capture is
  `\w+`, which cannot match a destructuring pattern).
- `const f = pick(env)` where `pick` returns a binding, then `f.fetch(` — **missed** (the
  binding never appears on the right-hand side).

Neither shape exists in the tree today. `env[tool.binding]` at
`workers/mcp/src/lib/tools.ts:179` is close, but it is passed *as an argument* to the seam,
which is correct and allowed. The risk is future drift, not present breakage.

**The fix:** extend the alias capture to `(\w+|\{[^}]*\})` and, for the destructured form,
test each name inside the braces against `BINDINGS`. About six lines. The helper-return case
is not worth chasing — it needs real dataflow analysis, and a comment saying so is a better
answer than a regex that pretends.

### Carried forward from round 1, unchanged

| id | severity | what | where |
|---|---|---|---|
| **F5** | MEDIUM | one `try` covers four independent nightly jobs; if the first throws the other three silently never run, and the catch records `place: "cron/size-check"` whichever died. `runRetention` is what keeps the shared core database under D1's 10 GB cap; `sweepOrphanedUploads` is the only thing bounding R2 growth. | `workers/tenancy/src/index.ts:174-198` |
| **F6** | MEDIUM | the retention sweep deletes from seven tables no document says it may. Not a bug — a gap in the *stated* ownership model, hiding a coupling: a column rename in auth breaks a sweep in tenancy. | `shared/workers/retention.ts:45-117`, `workers/tenancy/src/lib/sharding.ts:330-360` |
| **F7** | MEDIUM | 25 of 31 server log lines cannot be filtered by request id. `traceError`'s own comment says why this matters. The 25 are the best-effort side channels — exactly the set you reach for when one customer reports one thing that did not happen. | 14 files across `shared/workers` + 5 workers |
| **F8** | LOW | 5 of 18 outbound hops carry no request id: `shared/workers/realtime.ts:105` (the publish seam), `content/lib/notify.ts:66`, `tenancy/lib/notify.ts:35`, `tenancy/lib/invites.ts:274`, `mcp/lib/bridge.ts:24`. | as listed |
| **F9** | LOW | `error_logs` has two writers and no named owner. One sentence in `DATA-MODEL.md`. | `shared/workers/error-log.ts:35`, `workers/data-ops/src/routes/admin.ts:46` |
| **F10** | LOW | superseded by R2-F5 (same claim, now also stale-looking-fresh). | `PLATFORMS.md:26` |
| **F11** | UNMEASURED | secret parity between staging and production. Nothing in the repo asserts it; `TEST_LOGIN_KEY` must be present on staging and absent on production. | Cloudflare only |
| **R2-F7** | MEDIUM | `confirmBatch` still has no try/catch around `:257`, `:272`, `:282`, so a mid-batch downstream outage leaves the batch permanently `'running'`. (Was part of round 1's F2; the sibling `confirmImport` was fixed, this one was not.) | `workers/data-ops/src/lib/import-batch.ts:185-305` |

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **R2-F0a** `decodeKey()` boundary + 400 on both `/media/*` handlers | `workers/gateway/src/index.ts` | ADDS ~15 lines, REMOVES an unauthenticated write amplification | **`speed_review`: none** — a `try` around a decode that already ran. **`first_run_review`/`dead_end_review`: mild** — a broken image URL now returns a JSON 400 where a browser wanted an image; the 404-page handling for genuine misses is unaffected. **`error_log_review`: helps** (stops 4xx polluting the store). |
| **R2-F0b** make the central catch skip 4xx-shaped throws | `workers/gateway/src/index.ts` and the five `recordWorkerError` catches | ADDS a severity test in each central catch | **`error_log_review`: watch** — done carelessly this suppresses real 500s. Do it by *type* (`e instanceof GuardError`), never by string matching. **`lean_mean_review`** — better as one predicate in `shared/workers/error-log.ts` than six copies. |
| **R2-F1** guard `forwardToDoor` with a 503 fallback | `shared/workers/http.ts` | ADDS ~10 lines in one shared file | **`speed_review`: none** — a `try` around an already-awaited call costs nothing. **`interfacelessness_review`: helps** — an MCP client gets a retryable 503 instead of a 500, matching what `bridge.ts` already does. **`lean_mean_review`:** +10 lines in a 79-line file, the cheapest possible price for closing the oldest open finding. |
| **R2-F2a** `ctx.waitUntil` the gateway's error POST | `workers/gateway/src/index.ts` | moves one await off the response path | **`error_log_review`: mild cost** — a `waitUntil` write can be cut short if the isolate is evicted, trading certainty for latency. **`speed_review`: helps** (removes up to 5 s from a crash response during an auth outage). Judge: take R2-F2b first; this one only if crash latency is measured and matters. |
| **R2-F2b** document the gateway→auth error-path dependency | `ERROR-HANDLING.md` (2 lines) | ADDS a stated trade, no code | **none — a doc statement that turns a discovered surprise into a decision; `story_checks_out_review` scores it up.** |
| **R2-F3** give realtime an `OPS` binding | `workers/realtime/wrangler.jsonc` (both env blocks) | ADDS 1 binding × 2 envs, no code | **`scaling_review`: helps** — moves the live layer's error rows out of the 10 GB shared core database. **`base_fork_review`: watch** — the ids are account-specific, so `BOOTSTRAP.md`'s ops section must gain realtime to its "five workers that carry an OPS binding" list, or a fork inherits a stale id. **`spend_review`: neutral** — same rows, different database. |
| **R2-F4** decide `CHANNELS` in R11 (list it or exempt it in writing) | `web/test/rules.test.ts` | ADDS 1 binding name + ~6 lines of exemption reason, or 1 bound | **`lean_mean_review`** — more test code in what is already the largest file in `web/test`. **`realtime_review`: watch hard** — if the decision is "add a bound" rather than "exempt", a timeout on `getByName(…).fetch(request)` would break the WebSocket upgrade. The exemption is almost certainly the right answer; the point is to *write it*. |
| **R2-F5** correct `PLATFORMS.md`'s two claims | `PLATFORMS.md` (2 lines) | REMOVES an overclaim, adds an honest count | **none — it makes a port estimate accurate, which only helps whoever does one.** |
| **R2-F6** widen the alias capture to destructuring | `web/test/rules.test.ts` | ADDS ~6 lines | **`lean_mean_review`** — marginal. **`speed_review`** — negligible; the scan already reads 90 files. |
| **R2-F7** wrap `confirmBatch`'s door calls | `workers/data-ops/src/lib/import-batch.ts` | ADDS a try that marks the batch failed and rethrows | **none — it mirrors what `confirmImport` already does 90 lines away, so it is copying an existing pattern, not inventing one.** `lean_mean_review` prefers a shared helper if both are touched. |
| **F5** four `try`s instead of one in the nightly cron | `workers/tenancy/src/index.ts` | ADDS ~12 lines | **`lean_mean_review`** — mild; four near-identical blocks invite a `runJob(name, fn)` wrapper that keeps it DRY at ~6 lines. Otherwise neutral. **`error_log_review`: helps** — the durable row stops misattributing the failure. |
| **F6** document the retention executor | `DATA-MODEL.md` (one paragraph) | ADDS a paragraph, no code | **none.** Do NOT take the "route through auth" variant: it adds a cross-service hop, which raises coupling *in this review* and costs `speed_review`. |
| **F7** 25 `console.error` → `traceError` | 14 files across `shared/workers` + 5 workers | ADDS `req` threading; roughly line-neutral | **`spend_review` and `speed_review`** — `traceError` does a `JSON.stringify` per line where `console.error` did not, and these fire on best-effort paths that can be hot. Bounded: `detail` is sliced to 500 chars. **`error_log_review`: helps substantially.** |
| **F8** thread `req` into the 5 remaining `callService` sites | `shared/workers/realtime.ts` + 4 files | 4 sites are one-line; the publish seam is a signature change across ~53 call sites | **`lean_mean_review`** — 53 call-site edits for a log field is a poor trade. Recommend the 4 cheap sites and NOT the publish seam. |
| **F9** name `error_logs`' owner | `DATA-MODEL.md` (one row) | one table row | none — a doc line. |
| **F11** a secret-presence probe in the smoke script | `scripts/smoke-staging.mjs` | ADDS a name-only presence probe (never values) | **`security_sentry_review`** — must probe *presence*, never echo a value, and must assert `TEST_LOGIN_KEY` is ABSENT on production. Get that backwards and you have built a secret-enumeration endpoint. Tier 2 — drafted and reviewed, never applied unattended. |

**Four tensions worth stating plainly:**

- **Adding error recording without adding an input boundary made a public endpoint an
  attack surface.** This is the campaign's own thesis proved on itself: `error_log_review`
  and `activity_log_review` both push toward "record more", and every place that lands
  without a matching boundary check converts an anonymous request into a durable write.
  The rule to carry forward is: **a new recording site needs a boundary audit of every path
  that can reach it**, not just proof that the recording works.
- **The F2 repair was a net win that made F3 worse.** Routing three raw calls through
  `forwardToDoor` bought bounding-with-a-reason and trace ids for the import path, and it
  simultaneously tripled the number of paths riding a seam with no guard. This is the exact
  interaction the campaign is looking for: a correct fix that raises one criterion and
  concentrates risk somewhere else. Take R2-F1 next and the interaction resolves entirely.
- **Two repairs added platform coupling without anyone deciding to.** `.prepare(` went
  130 → 133 (`workers/tenancy/src/lib/invites.ts` +1, `members.ts` +2), from the privilege-
  amplification security fix. Criterion 8's ratio did not move, but the direction is wrong and
  nothing in the base notices. There is no check counting these.
- **Criterion 7 pulls against every law.** Making the next module cheaper means fewer
  registries, which means fewer machine-checked laws. Do not "fix" criterion 7 by deleting a
  law. It scores 84 for a good reason and should keep scoring 84.

---

## CEILING

**Round 1 said the ceiling was 94 and that 95 required spending points against `lean_mean`.
That is still exactly true, and this round did not change it.**

Fixing every code-fixable finding in this report (R2-F0 to R2-F7, F5, F6, F7, F8, F9) gets
criteria 3 and 4 to 100 and criterion 2 to its own ceiling of 85 (30 guarded + 20 bounded +
20 degradation once R2-F0 and F5 are closed + 15 SPOF + 0 locked), and leaves 7 and 8 where
they are:

```
1: 100×16=1600   2: 85×18=1530   3: 100×16=1600   4: 100×12=1200
5:  97×10= 970   6:100×12=1200   7:  84×10= 840   8:  73× 6= 438
                                                   total 9378 → 93.78 → 94
```

**94 is the practical ceiling of this review's findings, unchanged from round 1.**

### Exactly which criterion would have to move to reach 95

95 needs 9450 weighted points. From 9378 that is **72 points short**, and only two criteria
have that much headroom left:

- **Criterion 8 (`coupling`) is the cheapest route, and it is the one that costs `lean_mean`.**
  It must reach **85** (from 73) — `(85−73) × 6 = 72` → 9450 → 94.5 → **95**. In practice that
  means row 1 ("platform-specific APIs are concentrated", 18/35) and row 2 ("an adapter, port
  or driver layer exists", 15/25) both moving, which means **putting 133 `.prepare(` call
  sites across 26 files behind a core-database adapter**. That is a new abstraction layer over
  code that works, buying nothing unless a port is actually planned. `CLAUDE.md`'s first prime
  directive is "stay lean… too much code is a defect here", and `lean_mean_review` scores
  exactly that. **This is the point that has to be spent, and I do not recommend spending it.**
- **Criterion 7 (`evolvability`) cannot get there alone.** A scaffold generator takes row 4
  from 12/15 to 15/15 → criterion 7 = 87 → total 9408 → **94**. Still short. The remaining
  headroom is row 3 ("touches a small, predictable set of files", 12/20), and the only way to
  move that is to reduce the number of registries a module must land in — which means deleting
  machine-checked laws. That is a worse trade than the adapter.

### What a commit cannot fix

- **Criterion 2 is permanently capped at 85** by a locked decision. `ARCHITECTURE.md` §2b
  (2026-08-18, owner) rules out a session-validity cache so revocation stays instant. That
  forfeits the rubric's 15-point "no single non-public component depended on by every other
  without a fallback" row for ever — **2.7 points of the total**. Instant revocation is worth
  more than 2.7 points. Naming it is the requirement; relitigating it is not. (If it were ever
  reversed, criterion 2 → 100 and the total → 96.)
- **Criterion 5 is capped at 97** by the rubric's own minor row: staging and production *must*
  differ in `APP_ORIGIN`, `PUBLIC_APP_URL`, `ENVIRONMENT` and resource names.
- **Criterion 7 is capped near 90** by the 25 laws, arithmetically.

**Verdict on the specific question asked: yes, 94 is still the ceiling, and 95 still costs
`lean_mean` points. The criterion that would have to move is criterion 8 — specifically its
first two rows, requiring a core-database adapter over 133 call sites in 26 files.**

---

**The most urgent finding is R2-F0** (fifteen lines, and the fix is already drafted in the
working tree). **The single worst *structural* risk, in one sentence:** the seam that five paths now depend on
— every agent tool call, every MCP tool call and all three import writes — is called
"guarded" by the law, by the registry and by the check's own exemption text, and contains no
`try` in seventy-nine lines, so the repair that correctly pulled the import path out of the
dark tripled the traffic over the one place the base still believes something it has not
built.
