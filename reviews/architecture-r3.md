# Architecture review — round 3 — Brimba · 2026-08-25
SCORE: 89/100   (round 1: 87 · round 2: 89 · the 2026-08-18 pass: 96)

**All three of round 2's findings are genuinely fixed. The score did not move, because the
same pass that fixed them made the ownership problem worse.**

## DELTA

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---|---|---|---|---|
| 1 | Dependencies point one way | 16 | 100 | 100 | **100 =** | Re-measured from scratch: **0 cycles, 0 layer violations, 0 cross-worker production imports** over 277 code files. The removal of the screen-override subsystem deleted edges and added none. |
| 2 | Blast radius is contained · **GATE** | 18 | 76 | 77 | **80 ▲** | **+3 in "graceful degradation" (12 → 15): R2-F0 is closed.** `decodeKey()` turns a malformed `/media/%zz` into a clean 400 instead of one durable database write per anonymous request. **R2-F1 is closed too:** `forwardToDoor` now has the try/catch the law claimed it had since R11 was written. All **21** service-binding hops now pass through three guarded seams. |
| 3 | Every fact has one owner | 16 | 87 | 87 | **83 ▼** | **The only criterion that fell, and two repairs caused it.** `error_logs` gained a sixth worker-writer (realtime) and three new write *reasons* — 5xx `GuardError`s in four workers, account creation, retention shortfalls — while its retention executor still lives in a seventh component (tenancy) and nothing names an owner. Round 2's F9 moves minor → medium. **Full finding at R3-F1.** |
| 4 | A request can be followed | 12 | 77 | 86 | **90 ▲** | +4. Trace-id propagation went 13/18 → **21/24** hops: `forwardToDoor` now carries the request id through the guard it gained, so every agent tool call, every MCP tool call and all six import writes are followable. Structured logging barely moved (6/31 → **10/43** `traceError` vs plain `console.error`). |
| 5 | Environments match | 10 | 97 | 97 | **97 =** | Re-measured: **0 keys missing in staging, 0 extra**. Realtime's new `OPS` binding was added to **both** the top-level config and `env.staging`, both with `migrations_dir` — the repair did not create a parity hole, which is the usual way this criterion falls. Secrets remain **unmeasured**. |
| 6 | Live data can be recovered | 12 | 100 | 100 | **100 =** | OPERATIONS.md's backup/restore section untouched; the 2026-08-18 drill still recorded; R2's non-versioning still written down. |
| 7 | The next module is cheap | 10 | 84 | 84 | **84 =** | Two opposite moves cancel. **Down:** law R26 is a 26th registry a change must satisfy. **Up:** the screen-override subsystem's removal deleted a whole consideration a new module used to carry (a `screens` permission row, a recipe merge, a tool, a trace). Net zero, and I am reporting both rather than netting them silently. |
| 8 | Platform is a choice, not a cage | 6 | 73 | 73 | **73 =** | Core/ops `.prepare(` call sites **133 → 132** across the same 26 files, measured with one script at both commits. `PLATFORMS.md:26` still calls `shared/workers/d1-rest.ts` *"the ONLY place SQL runs"* while 132 sites run SQL through the native binding — round 2's R2-F5, unaddressed. |

**One criterion fell: criterion 3, by 4 points.** The repairs that caused it are
`error_log_review`'s (a 5xx `GuardError` is now recorded in all four workers; a hit retention
bound now writes a real row) and `activity_log_review`'s (account creation is logged). **Both are
correct repairs and I would keep both.** Neither named an owner for the table it made busier, and
that is the whole finding.

---

## Arithmetic

```
#  criterion                          method    score  weight  product
1  Dependencies point one way         defect      100    16     1600
2  Blast radius is contained   GATE   coverage     80    18     1440
3  Every fact has one owner           defect       83    16     1328
4  A request can be followed          coverage     90    12     1080
5  Environments match                 defect       97    10      970
6  Live data can be recovered         coverage    100    12     1200
7  The next module is cheap           coverage     84    10      840
8  Platform is a choice, not a cage   coverage     73     6      438
                                                        100     8896

                                        total = 8896 / 100 = 88.96 → 89
```

Gate: criterion 2 must clear 40 or the total caps at 65. It scores **80**. **No cap applied.**

### The row-level arithmetic for the two coverage criteria that moved

```
CRITERION 2 (blast radius, 18)                              R2    R3
  every cross-service call guarded ................ /30     30    30
  cross-service calls carry a timeout or a reason . /20     20    20
  one non-critical dependency degrades gracefully . /20     12    15   <- R2-F0 closed
  highest fan-in component documented as a SPOF ... /15     15    15
  no non-public component depended on by all ...... /15      0     0   <- LOCKED, see CEILING
                                                            77    80

CRITERION 4 (traceability, 12)                              R2    R3
  correlation id generated at the edge ............ /30     30    30
  propagated across every internal hop ............ /25     18    22   <- 13/18 -> 21/24 hops
  logs are structured ............................. /20     13    13   <- 6/31 -> 10/43, no band change
  errors recorded somewhere durable ............... /15     15    15
  platform observability on every component ....... /10     10    10
                                                            86    90
```

### What I measured by hand rather than by probe

The skill's probe still reports the same wrong things rounds 1 and 2 recorded, for the same
reasons. Two I confirmed as false this round:

- **`sharedWriteTables` lists `teams` as written by `worker:realtime`.** It is not.
  `grep -iE "insert|update|delete" workers/realtime/src/*.ts` matching `teams` returns **nothing**.
  The probe is matching prose. Four multi-writer tables, not five — same four as round 2.
- **`crossServiceCalls.guardedPct: 37`** is built from every textual `env.REALTIME` occurrence,
  including in `web/test/rules.test.ts`. Meaningless. The real figure, counted from the seams, is
  21/21 service-binding hops guarded.

Everything not marked *(probe)* below is measured by a purpose-built script or read by hand, test
files excluded, comments stripped.

### The working tree, again

`git status` during this run showed four uncommitted files (`package.json`, `package-lock.json`,
`web/next-env.d.ts`, `web/test/fork.test.ts`) — a concurrent session removing `@swift-struck/ui`
from the ROOT `package.json`. None of them is architecture. **Every number here is measured against
commit `256d21b`.**

---

## The three verifications asked for

### 1 · The gateway write amplification — **FIXED, and fixed at the right layer.**

`workers/gateway/src/index.ts:64-70`:

```ts
function decodeKey(raw: string): string | null {
  try { return decodeURIComponent(raw) } catch { return null }
}
```

Both media handlers now call it and return `fail(400, "invalid_path", …)` on `null`
(`:275-281`, `:283-288`). A malformed `%zz` therefore never reaches the central catch, so it never
becomes an `error_logs` row. The amplification path — **anonymous caller × no rate ceiling on
`/media/*` × one durable write per request** — is closed at its source.

Two things make this the right fix rather than an adequate one. It is a **boundary** fix, so it
also covers any future `/media/*` handler; and the comment above it (`:61-63`) names the two
reviews that found it independently, which is the campaign's own evidence being preserved in the
code. The one thing the fix does **not** do is authorise the read — `/media/*` still serves any
key to anyone. That is `security_sentry`'s L3, correctly not this criterion's.

### 2 · `forwardToDoor` — **GUARDED, and the exemption text now matches the code.**

`shared/workers/http.ts:91-103`: a `try` around the binding call, a `traceError` recording
`door_unreachable` with the request id, and `fail(503, "service_unavailable", "That part of the app
isn't answering right now. **Nothing was changed** — try again in a moment.")`.

That last clause is the part that matters architecturally. Five of the six call sites are **write**
paths (three import writes, the agent executor, the MCP executor). A caller that cannot tell "the
door refused" from "the door never answered" must either retry blindly or give up; this answer
tells the agent which it was, which is exactly what the agent's failure-narration contract needs.

**The absent timeout is deliberate and now written down in three places that agree** — the function
comment (`:87-90`), and R11's own exemption in `web/test/rules.test.ts:214-215`, which reads: *"the
act-as-user seam. Deliberately unbounded: the doors it forwards to do real work of unbounded
duration (an import batch), and a bound that cuts a working import off is worse than none. It DOES
carry the trace id."* Round 2's complaint was that the law claimed a guarantee the code did not
provide. The code now provides the guard, and the law's text now states the bound it deliberately
does not provide. **The claim and the code agree in both directions.** That is the fix I wanted and
it is better than the one I asked for.

### 3 · Realtime's error rows — **NOW IN OPS, in both environments.**

`workers/realtime/wrangler.jsonc:23` (production) and `:42` (staging) both declare
`{ "binding": "OPS", "database_name": "brimba-ops[-staging]", …, "migrations_dir": "../../db/ops" }`.
`opsDatabase(env)` returns `env.OPS ?? env.DB` (`shared/workers/ops-db.ts:40-42`), so realtime's
central catch at `index.ts:130` now writes to the operations database, not the core one.

**And the parity trap was avoided.** The obvious way to get this wrong is to add the binding to one
environment: staging then works and production silently falls back to `env.DB` — writing error rows
into the database sign-in lives in, which is the exact fault being fixed, restored in the one
environment that matters. Both blocks carry it, both carry `migrations_dir`, and
`story_checks_out`'s `ops-migrations-dir` check now asserts the second half machine-side. Criterion
5 held at 97 because of this.

---

## Findings

### R3-F1 · MEDIUM — NEW · `error_logs` got three new writers and one more worker this round, and still has no owner

**Plain English.** The table every part of the app now writes its failures into belongs to nobody.
Six of the seven services write to it; a seventh decides when rows are deleted; no document says
which one is in charge.

**Where.** `shared/workers/error-log.ts:67` (`recordWorkerError`, the one write seam) · called from
`workers/{auth,content,data-ops,mcp,realtime,tenancy}/src/index.ts` plus
`workers/data-ops/src/lib/agent.ts` and `workers/tenancy/src/lib/sharding.ts` ·
pruned by `workers/tenancy/src/lib/sharding.ts:395` reading `OPS_RETENTION` from
`shared/workers/retention.ts:81`.

**What changed this round.**

| | R2 | R3 |
|---|---|---|
| workers writing `error_logs` | 5 | **6** (realtime joined) |
| distinct write *reasons* | request dispatcher, cron | **+ 5xx `GuardError` in four workers, + account creation, + retention shortfall** |
| component that prunes it | tenancy | tenancy |
| document naming an owner | none | none |

**Why it matters (technical).** This is not the harmful shape of shared ownership — there is exactly
one write function, so the row *format* cannot drift. The harm is second-order and specific:

1. **The lifecycle owner is not a writer's peer.** Tenancy's nightly sweep deletes rows six other
   components created, using a rule table in `shared/`. If the sweep's bound is hit, it writes an
   `error_logs` row — into the table it is failing to drain — and that row is itself subject to the
   sweep. A component that prunes its own alarm is a closed loop, and nothing owns it.
2. **The volume grew and the ownership did not.** "A 5xx `GuardError` is now recorded in all four
   workers" means an auth outage — the worst case named below — now writes one row per failed
   request across six components simultaneously, which is precisely when the shared table is under
   most pressure and least attended.
3. **No check asserts any of it.** Nothing verifies that `OPS_TABLES` and the set of tables written
   through `recordWorkerError` agree, so a seventh writer, or a table added to one list and not the
   other, ships green.

**Severity.** Medium (−7, up from round 2's minor −3): one authoritative writer is clearly primary
in *format* but nothing says who is primary in *lifecycle*, and the number of participants grew.

**Fix (Tier 3 — an ownership decision, the owner's to make, not mine to apply).**
Name **data-ops** the owner of `error_logs` in ARCHITECTURE.md: it already owns the operations
database's other table (`agent_usage_log`), it already owns the only *read* surface
(`GET /api/data-ops/admin/errors`) and the resolve door, and it is the one component that is not
also on the request path for ordinary traffic. Then move the OPS half of the retention sweep out of
tenancy's `sharding.ts` into data-ops, leaving tenancy the CORE and TEAM rules it does own. Add the
check that `OPS_TABLES` and the `recordWorkerError` call sites agree.

### R3-F2 · MEDIUM — three Durable Object RPC hops are still outside R11 entirely *(round 2's R2-F4, unchanged)*

**Where.** `workers/realtime/src/index.ts:161, 186, 198` · `web/test/rules.test.ts:222` —
`const BINDINGS = ["AUTH", "TENANCY", "CONTENT", "DATAOPS", "MCP", "REALTIME"]`. **`CHANNELS` is not
in the list.**

R11's check is now genuinely strong: it reads `serverSources()` (so it can see `shared/`, which it
could not for its first week), it catches an *aliased* binding, and it carries a tripwire asserting
it can see the shared seams at all. It still cannot see a Durable Object stub, because DO stubs are
not in its binding list.

The practical exposure is small and getting smaller: `broadcast()` swallows per-socket failures
(`index.ts:47-55`), and realtime's central catch records anything the RPC itself throws. But the
*decision* round 1 asked for — are DO RPCs in R11's scope or deliberately out of it? — has now been
deferred through three rounds, and the honest denominator (24 hops, not 21) differs from the
reported one by exactly these three.

**Fix.** Either add `CHANNELS` to `BINDINGS` and give the three sites a named exemption with the
`broadcast()`-is-best-effort reason, or state in RULES.md that R11 governs service bindings and not
Durable Object RPCs, and say why. **Ten minutes either way. The cost of a third deferral is that the
next reviewer re-derives a different hop count, which is the failure `ROUTE-CENSUS.md` was built to
end.**

### R3-F3 · LOW — `PLATFORMS.md` still claims one place runs SQL, and 132 places run SQL *(round 2's R2-F5, unchanged)*

`PLATFORMS.md:26` describes `shared/workers/d1-rest.ts` as *"the ONLY place SQL runs"*. Measured at
both commits with one script: **133 → 132** `.prepare(` call sites across **26** files reach the
core and operations databases through the native D1 binding, entirely outside that seam. The claim
was true of *team* databases when it was written and has never been true of the core one.

This is the criterion-8 finding and the criterion-8 *ceiling* at the same time: the document
describes an adapter layer that does not exist, which is why coupling scores 73 and why the honest
route to 95 is the one I still do not recommend. Cross-referenced to `story_checks_out` — a false
claim in a document is theirs to score; the missing adapter is mine.

### The blast radius — the worst case, named

```
        gateway (public, fan-in 0)
           |  |  |  |  |  |
    +------+  |  |  |  |  +-----------+
    v         v  v  v  v              v
  auth <-- tenancy content data-ops  mcp
   ^  fan-in 6      |       |         |
   |                |       |         |
   +----------------+-------+---------+
   realtime  fan-in 5
```

**If `brimba-auth` is down, 6 of the 7 components stop working, and the user sees a 503 with an
honest message on every screen.** Every gated request in every worker opens with `whoAmI`, which
calls auth over a service binding; `callService` bounds it with `SERVICE_TIMEOUT_MS` and returns
null; the gate then refuses. Nothing hangs, nothing crashes, and — new this round — **every one of
those 503s is now recorded**, so the outage leaves evidence instead of an absence. That is the
single most valuable thing the round-2 repairs bought this criterion.

The remaining exposure is structural and **locked**: there is no session cache, by an owner decision
in ARCHITECTURE.md §2b (2026-08-18) taken so that revocation is instant. Auth being a hard
dependency of all six is the price. It is documented, it is deliberate, and it costs this review a
permanent 15 points on criterion 2 (2.7 of the total).

### Ownership table — every table with more than one writer

| table | writers | authoritative? | recommended owner |
|---|---|---|---|
| `error_logs` | 6 workers via one seam; pruned by tenancy | format: one · lifecycle: unowned | **data-ops** — see R3-F1 |
| `users` | auth (3 writes), tenancy (7) | yes, both | **auth** — tenancy's writes are `current_team_id` and onboarding flags; route them through an auth door, or split the column set and say so |
| `selectable_data` | tenancy (5), content (1) | tenancy primary | **tenancy** — content's one write is a lookup-value create on a help path; say tenancy owns it |
| `activity` | one seam (`shared/workers/activity.ts`) | append-only | no finding — this is the correct shape |

`teams` is **not** a shared-write table; the probe's fifth row is a false positive I confirmed by
reading. `users` and `selectable_data` are unchanged from rounds 1 and 2 and carry the same
penalties.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **R3-F1a** name data-ops the owner of `error_logs` in ARCHITECTURE.md | `ARCHITECTURE.md` (~8 lines) | ADDS a locked decision, REMOVES an ambiguity | **story_checks_out** — *positive*: a capability that no document owns is one of its eleven criteria, and this closes one. **none else** — a decision, not code. |
| **R3-F1b** move the OPS retention rules out of tenancy into data-ops | `workers/tenancy/src/lib/sharding.ts` (−~60), new `workers/data-ops/src/lib/retention-ops.ts`, both `wrangler.jsonc` crons | MOVES ~60 lines; ADDS a cron to data-ops, REMOVES work from tenancy's | **lean_mean** — *positive*: `sharding.ts` is 583 lines holding two unrelated jobs; this is half of the split it is already asking for. **scaling_review** — *check first*: SCALING.md describes one nightly sweep; two crons is a real operational change and the retention section must move with it. **mac_fell_in_the_ocean** — one more cron in the runbook. |
| **R3-F1c** check that `OPS_TABLES` and the `recordWorkerError` call sites agree | `workers/data-ops/test/error-seam.test.ts` (+~15) | ADDS ~15 test lines | **lean_mean** — pure test growth, small. **none else.** |
| **R3-F2** put `CHANNELS` in R11's binding list with a named exemption — **or** rule DO RPCs out of R11 in writing | `web/test/rules.test.ts` (+~6) **or** `RULES.md` (+3 lines) | ADDS ~6 lines, or 3 | **none — it is a decision plus a line.** The exemption route is free; the in-scope route may go red on the three sites, which is the point. Whichever is chosen, `story_checks_out` needs R11's paragraph to match. |
| **R3-F3** correct `PLATFORMS.md:26` | `PLATFORMS.md` (1 row) | REMOVES a false claim | **none — it removes an overclaim.** It does *not* raise criterion 8: describing the coupling accurately and removing it are different jobs. |
| **(the 95 route)** a core-database adapter over 132 `.prepare(` sites | ~26 files, a new `shared/workers/core-db.ts` | ADDS an abstraction layer over working code | **lean_mean — directly and severely.** CLAUDE.md's first prime directive is "too much code is a defect here"; this is a layer that buys nothing unless a port is actually planned. **speed_review** — one indirection on the busiest read path in the base. **I do not recommend it. See CEILING.** |

---

## CEILING

**Round 2 said the ceiling was 94 and that 95 costs `lean_mean` points. The round-3 question was
whether ~300 removed lines change that arithmetic. They do not — and I can say by how much.**

The criterion that caps the total is **8 (coupling)**, and its cost is measured in `.prepare(` call
sites that would have to move behind an adapter. Measured with one script at both commits:

```
fe7d683 (round 2)   133 call sites across 26 files
256d21b (round 3)   132 call sites across 26 files      <- the entire effect of the removal
```

The screen-override subsystem lived on the **team** databases, reached over the REST door
(`d1Query` / `d1ExecScript`), not through the native `.prepare(` binding. Deleting it removed **one**
core-database call site out of 133 and **zero** files from the 26. The adapter that criterion 8
needs is the same size it was last week.

### The ceiling, recomputed

Fixing every code-fixable finding — R3-F1, R3-F2, R3-F3, plus rounds 1 and 2's F5–F9 — gets
criteria 3 and 4 to 100 and criterion 2 to its own locked ceiling of 85:

```
1: 100×16=1600   2: 85×18=1530   3: 100×16=1600   4: 100×12=1200
5:  97×10= 970   6:100×12=1200   7:  84×10= 840   8:  73× 6= 438
                                                   total 9378 → 93.78 → 94
```

**94 is still the practical ceiling, unchanged across all three rounds.**

### Exactly which criterion would have to move to reach 95

95 needs 9450 weighted points — **72 short of 9378**, and only two criteria have that headroom:

- **Criterion 8 must reach 85 from 73.** `(85 − 73) × 6 = 72` → 9450 → **95** exactly. In practice
  that is rows 1 and 2 of its table both moving, which means the adapter over 132 sites in 26
  files. **This is the point that has to be spent, and I still do not recommend spending it** —
  and the impact map says why in `lean_mean`'s own terms.
- **Criterion 7 cannot get there alone.** A module scaffold generator takes its row 4 from 12/15 to
  15/15 → criterion 7 = 87 → total 9408 → **94**. Still short. The rest of its headroom is row 3
  ("touches a small, predictable set of files"), and the only lever there is *deleting
  machine-checked laws* — a worse trade than the adapter, and one this campaign exists to argue
  against.

### What a commit cannot fix

- **Criterion 2 is permanently capped at 85** by ARCHITECTURE.md §2b: no session-validity cache, so
  revocation stays instant. That forfeits the rubric's 15-point "no non-public component depended on
  by every other without a fallback" row for ever — **2.7 points of the total**. Instant revocation
  is worth more than 2.7 points; naming the cap is the requirement, relitigating it is not. (If it
  were ever reversed, criterion 2 → 100 and the total → 96.)
- **Criterion 5 is capped at 97** by the rubric's own minor row: staging and production *must* differ
  in `APP_ORIGIN`, `PUBLIC_APP_URL`, `ENVIRONMENT` and resource names.
- **Criterion 7 is capped near 90** by the 26 laws, arithmetically.

---

**The single worst structural risk, in one sentence:** the table that six of seven components now
write their failures into — and that grew three new write reasons this round precisely so that an
outage leaves evidence — is pruned by a seventh component on a schedule nobody owns, and the sweep
that fails to drain it reports that failure by writing a row into the table it is failing to drain.

**And the round's own answer:** every finding round 2 raised was fixed, correctly, at the right
layer, with the law text corrected to match the code in the one case where they disagreed. The
score stands still at 89 because two other reviews' equally correct repairs quietly enlarged a
problem nobody was assigned. That is not an argument against any of the four repairs. It is the
argument for naming an owner before adding a sixth writer.
