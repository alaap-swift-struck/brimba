# Architecture review — round 5 — Brimba · 2026-08-26

SCORE: **90/100**   (round 1: 87 · round 2: 89 · round 3: 89 · the 2026-08-18 pass: 96)

**All three of round 3's findings are closed. Two of them are closed properly —
with a written decision and code that matches it — and one is closed better than
I asked for. The score moves one point, because the same rounds that closed them
opened one new ownership defect and because round 3 overstated trace propagation
on the one hop that matters most.**

**Measured at `HEAD = f30f954`** on branch `review-round5`. Working tree clean.
I wrote none of these repairs. Every probe hit below was opened and read before
it was counted, and where the probe and the source disagree I say which won.

---

## Arithmetic

```
DEFECT    criterion = clamp(0, 100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE  criterion = sum of points earned from its rows
total     = round( Σ (criterion × weight) / Σ weights )
```

```
#  criterion                          method    score  weight  product
1  Dependencies point one way         defect      100    16     1600
2  Blast radius is contained   GATE   coverage     82    18     1476
3  Every fact has one owner           defect       90    16     1440
4  A request can be followed          coverage     88    12     1056
5  Environments match                 defect       97    10      970
6  Live data can be recovered         coverage    100    12     1200
7  The next module is cheap           coverage     84    10      840
8  Platform is a choice, not a cage   coverage     72     6      432
                                                        100     9014

1600+1476 = 3076; +1440 = 4516; +1056 = 5572; +970 = 6542;
+1200 = 7742; +840 = 8582; +432 = 9014
                                    total = 9014 / 100 = 90.14 → 90
```

**Gate:** criterion 2 must clear 40 or the total caps at 65. It scores **82**.
**No cap applied.**

### Row arithmetic for every coverage criterion

```
CRITERION 2 — blast radius (18)                             R3    R5
  every cross-service call guarded .............. /30      30    30
  cross-service calls carry a timeout or a
    written, load-bearing reason ................ /20      20    20
  a non-critical dependency degrades gracefully . /20      15    17
  highest fan-in named as a SPOF, with the
    consequence stated .......................... /15      15    15
  no non-public component depended on by all
    without a fallback .......................... /15       0     0   <- LOCKED
                                                           80    82

CRITERION 4 — traceability (12)                             R3    R5
  correlation id generated at the edge .......... /30      30    30
  propagated across every internal hop .......... /25      22    20   <- 18 of 23, listed below
  logs are structured ........................... /20      13    13
  errors recorded somewhere durable ............. /15      15    15
  platform observability on every component ..... /10      10    10   <- 7/7
                                                           90    88

CRITERION 6 — recoverability (12)
  a documented backup per stateful store ........ /30            30
  a documented restore path + when last tested .. /25            25   <- drill run 2026-08-18
  point-in-time recovery, window stated ......... /20            20   <- D1 Time Travel, 30 days
  per-tenant restore without restoring everyone . /15            15
  what is NOT backed up is written down ......... /10            10   <- R2 not versioned
                                                              100

CRITERION 7 — evolvability (10)                             R3    R5
  a documented, followed path for a new module .. /30      30    30   <- BUILD-A-MODULE.md
  new capability plugs into a registry/catalog .. /25      25    25
  adding one touches a small, predictable set ... /20      12    12   <- 26 laws is the cost
  a template, generator or worked example ....... /15      12    12
  the seam is named concretely .................. /10       5     5
                                                           84    84

CRITERION 8 — platform coupling (6)                         R3    R5
  platform APIs concentrated, not scattered ..... /35      ??    17   <- 147 sites / 28 files
  an adapter/port layer between domain+platform . /25      ??    15
  the cost of moving is written down ............ /20      ??    20   <- R3-F3, now fixed
  business rules testable without the runtime ... /20      ??    20
                                                           73    72
```

**Criterion 8's rows are the one place I disagree with round 3 and cannot
recompute it.** Round 3 reported 73 without publishing its row split, so I have
re-derived all four from the rubric's table at HEAD rather than adjusting its
number. The two figures happen to land one point apart, but they are not
comparable, and I say so rather than presenting continuity that does not exist.

---

## DELTA — 89 → 90, with the cause of each move named

| # | criterion | wt | R3 | **R5** | Δ | code changed, or was the last measurement wrong? |
|---|---|---:|---:|---:|---:|---|
| 1 | Dependencies point one way | 16 | 100 | **100 =** | 0 | Re-measured from scratch: **0 cycles, 0 layer violations, 0 cross-worker production imports** across 309 code files. Every cross-worker edge the probe reports (`mcp→data-ops`, `mcp→tenancy`, `mcp→content`, `data-ops→web`, `web→shared`, `web→scripts`) has `productionCount: 0`. |
| 2 | Blast radius · **GATE** | 18 | 80 | **82** | +2 | **Code changed.** `publish()` now reads `callService`'s answer, so the base's canonical non-critical dependency degrades gracefully **and detectably** rather than gracefully and silently. Held to +2, not +5, because the detection channel is wired at 5 of 43 sites. |
| 3 | Every fact has one owner | 16 | 83 | **90** | +7 | **Code changed, and documentation changed.** `users` and `selectable_data` are closed outright — an owner named in ARCHITECTURE.md §1c **and** code that matches the rule. `error_logs` drops medium → minor. One new medium: `db_sizes` (R5-F1). |
| 4 | A request can be followed | 12 | 90 | **88** | −2 | **The last measurement was wrong.** Round 3 reported 21 of 24 hops carrying the id without publishing the site list. Counted site by site at HEAD: **18 of 23**, and the five that do not include `publish()` — the hop that fires on every mutation in the base. Auth's log-error door learning to read `requestId` (a real repair this round) is already inside the 18. |
| 5 | Environments match | 10 | 97 | **97 =** | 0 | Re-measured: `envParity` is **empty** — 0 bindings, vars or services differ between the top-level config and `env.staging` on all seven workers. The new `OPS_ALERT_EMAIL` var and tenancy's `TEAM_LIMITER` were added to **both** blocks. The parity trap was avoided again. 97 is the rubric's cap (URLs and resource names must differ). Secrets remain **unmeasured** — but see the note below, because that changed a little. |
| 6 | Live data can be recovered | 12 | 100 | **100 =** | 0 | OPERATIONS.md §Backup untouched; the 2026-08-18 drill still recorded with the two things it found; R2's non-versioning still written down with the grace-period bound. |
| 7 | The next module is cheap | 10 | 84 | **84 =** | 0 | The law count is unchanged at 26. `web/test/rules.test.ts` was split into nine files in `web/test/rules/`, which makes *adding a check* cheap — that is a `lean_mean` credit, not an evolvability one; the rubric's rows ask about adding a **module**, and nothing there moved. |
| 8 | Platform is a choice, not a cage | 6 | 73 | **72** | −1 | **Both, in opposite directions.** Round 3's R3-F3 is fixed and fixed well (row 3: full). Against it, the inline SQL scatter grew: **132 → 147** `.prepare(` sites, **26 → 28** files. The document improved and the code coupled further; those roughly cancel. |

---

## The four verifications asked for

### 1 · Ownership in ARCHITECTURE.md — DONE, and two of the three are genuinely closed

`ARCHITECTURE.md:80-127`, §1c *"Three shared tables now have a named owner
(2026-08-25)"*. It opens by defining what owning means — *"it defines the
columns, it is where a change to them is decided, and it is the one that must be
consulted before another component writes… Owning is not exclusivity"* — which is
the part that makes the rest enforceable rather than decorative.

| table | what §1c says | does the code agree? |
|---|---|---|
| **`users`** | auth owns it, **split by COLUMN**: auth writes identity; tenancy writes exactly `current_team_id` (+`updated_at`); anything else routes through an auth door | **YES — verified exhaustively.** `grep "UPDATE users"` returns 7 sites: 2 in auth (`profile.ts:60` identity, `email-change.ts:132` email), 5 in `tenancy/src/lib/teams.ts` (`:158`, `:281`, `:407`, `:446`, `:498`) and **every one of the five is `SET current_team_id = ?, updated_at = ?`**. The rule is not aspirational; it describes the code exactly. **Closed.** |
| **`selectable_data`** | tenancy is primary; content's ONE write is the reviewed exception (`ensureCategory`, pick-or-create of a learning category, insert-only, one type) | **YES.** Content writes once and never edits, deactivates or touches another type. The exception is named, scoped and reasoned. **Closed.** |
| **`error_logs`** | data-ops owns the **shape**: it owns the operations database's other table, the only read surface (`admin/errors`) and the resolve door, and it is off the ordinary request path. Six workers *append* through one function, so the row format cannot drift | **YES for the shape.** |

**The lifecycle is flagged, precisely, as unowned:**

> *"**What is genuinely unowned is the LIFECYCLE.** The nightly retention sweep
> lives in *tenancy* … and deletes rows six other components created — and when
> it cannot keep up it reports its own shortfall by writing a new row into the
> very table it is failing to drain. That is not broken today, and moving the ops
> sweep to data-ops … is a **recommendation, not a decision taken** — it is a
> real operational change (a cron moves between workers) and needs the owner's
> call."*

That is exactly the right register, and it is what round 3's Tier 3 finding asked
for. **The closed loop is still live** — `housekeeping.ts:203` records
`cron/retention` into `error_logs`, which is itself in `OPS_RETENTION` at 90 days
— so the finding does not vanish. It drops from **medium (−7) to minor (−3)**:
one writer is clearly primary and something now says so.

### 2 · Law R11's scope — SETTLED, in writing, in the law itself

`RULES.md` R11, `**Scope (settled 2026-08-25)**`. The law governs a bare global
`fetch` and a **service binding**; a **Durable Object RPC stub is out of scope**,
with four reasons given, not one:

- none of the three leaves the platform for a third party;
- `broadcast(message: string): void` is a typed RPC method, not a fetch, so *the
  very mechanism this law mandates* — an `AbortSignal` — does not exist at that
  call site;
- `broadcast()` already swallows per-socket failures (`workers/realtime/src/index.ts:47-55`),
  so a dead socket can neither fail nor stall a publish;
- bounding a WebSocket upgrade would defeat the socket it is opening.

The check's exemptions are **data**, not silence: `web/test/rules/worker.test.ts:85`
holds an `EXEMPT` map keyed by relative path with a written reason, and
`BINDINGS` at `:94` is the explicit subject list. So the decision and the
mechanism agree. **Round 3's R3-F2 is closed, in ten minutes, exactly as
predicted.**

**One thing in the settlement is itself a hand-maintained count.** R11 now
publishes *"the honest count is 21 service-binding hops, not 24"*. I cannot
reproduce 21 by either obvious rule: **18** if you count syntactic seam call
sites (11 `callService` + 2 `proxyService` + 5 `forwardToDoor`), **23** if you
count logical hops (the gateway's `p()` helper is used six times plus a direct
`proxyService(env.REALTIME, …)`, so 7 gateway hops). Neither is 21. The paragraph
that ends *"three rounds each derived a different number from the same code"*
publishes a fourth number nobody can derive. Filed as R5-F3 — LOW, and the fix is
to state the rule for counting rather than the count.

### 3 · The dead route and the superseded plans — DONE, and unusually well

**`config/screens` is gone from the code.** No worker route, no
`screens-config.ts`, no permission module, no agent or MCP tool, no web client,
and `resolveRecipe` is a plain lookup in `BASE_RECIPES`. Every surviving mention
of the string is in a document that explains it was removed.

Both plan documents carry real superseded headers, and both are better than a
"deprecated" banner because they say *which parts are still true*:

- `SCREEN-ENGINE-PLAN.md:1-25` — *"a design record — partly shipped, partly
  removed. Not a live spec."* It then enumerates what shipped and is still true
  (the recipe schema, the engine, the `/t/<teamId>/<module>/<id>` spine), what was
  removed and why (*"No surface anywhere could write an override, so every team's
  map was permanently empty"*), and — the part most such headers omit — **the
  sections that must now be read as history** (§2's store row, all of §5, §6's
  config tables, §8-A, §8-G, §9's `config.*` actions, §10's store references).
  It even records the residue: `0002_screens` stays in `TEAM_MIGRATIONS` because
  migrations are append-only, so every team still carries an empty table.
- `AGENT-MODULES-PLAN.md:1-18` — *"a design record… Where the truth lives now"*,
  a pointer list to the live docs, an explicit *"where a detail below disagrees
  with those, they win"*, and the one phase-1 detail since undone.

That is the shape a superseded document should have. Delegated to
`story_checks_out_review` for scoring; noted here because a dead route documented
as live is an architecture fact, and it is now correct.

### 4 · The refused core-database adapter — I agree with the refusal, and I would go further

The reconciliation records this as refused on the grounds that *"the architecture
review that would gain from it does not recommend it"* — CLAUDE.md's first prime
directive against a layer over 26 working files. **I am that review, and I confirm
the refusal.** Three reasons, one of which is new this round:

1. **The round already bought the value the adapter was going to deliver.** The
   rubric is explicit that criterion 8's finding *"is only ever 'nobody knows what
   this would cost', never 'you should not have chosen this'"*. PLATFORMS.md now
   answers that question in full — see R3-F3 below. What the adapter would buy is
   the remaining 3–4 points for *having* the layer, not for *knowing the price*.

2. **The subject grew while the adapter was being debated.** 132 → **147**
   `.prepare(` sites, 26 → **28** files, in one round. An adapter merged at the
   start of this round would have needed threading through fifteen new call sites
   before the round ended. A layer that is out of date on the day it ships is the
   worst version of this trade.

3. **PLATFORMS.md's new paragraph is the better artefact.** It refuses to pin a
   number *on purpose* — *"No exact figure is pinned here on purpose: it changed
   twice on the day this paragraph was written. Count it when you need it"* — and
   ships the command. That is the correct response to a fact that rots, and it is
   a lesson the rest of this repository has learned three separate times this
   round (see R5-F3 and the error-log report's off-rubric item 3).

**The consequence for the ceiling is that 95 should stop being treated as owed
here.** Criterion 8's honest cap without the adapter is about 75, which puts the
architecture ceiling at 94. That is a fact about the rubric's weighting against a
deliberate, documented platform commitment — not a defect. **The right move is to
stop paying for the last point, not to buy it.**

---

## Findings

### R5-F1 · MEDIUM — NEW · `db_sizes` is pruned twice a night by two disagreeing rules, and the operator's override is silently inert

**Plain English.** The growth meter has two delete rules running in the same
nightly pass. One is the proper rule an owner can change per environment; the
other is a hardcoded 90 days that was supposed to be removed when the first one
landed. It landed. The second one was not removed. So turning the knob does
nothing above 90 days, and nothing anywhere says so.

**Where.**
- `shared/workers/retention.ts:95-100` — `CORE_RETENTION` carries
  `{ table: "db_sizes", column: "at", days: 90, envVar: "RETAIN_DB_SIZES_DAYS" }`,
  swept by `runRetention` (`housekeeping.ts:157`) through the bounded, multi-pass,
  **shortfall-reporting** `sweep()`.
- `workers/tenancy/src/lib/housekeeping.ts:393-395` — a second, unbounded
  `DELETE FROM db_sizes WHERE at < ?` at a hardcoded
  `DB_SIZES_RETAIN_DAYS = 90` (`:269`), at the tail of `sweepOrphanedUploads`.

**The file says this should not be happening.** `housekeeping.ts:385-392`:

> *"TODO(retention): this window belongs in `CORE_RETENTION` … so it is swept by
> the one seam rather than by this special case. That file is owned by another
> change and is deliberately not edited here — **when the rule lands there, DELETE
> the statement below rather than leaving both.**"*

and `:264-268`:

> *"The canonical home for this window is `CORE_RETENTION` … That file is not this
> change's to edit … **Until the rule moves there this prune IS the rule.**"*

The rule moved. Both prunes remain, and both comments are now false.

**Why it matters.** Three distinct harms, in order of how quickly they bite:

1. **A documented control does not work.** `RETAIN_DB_SIZES_DAYS=365` — the exact
   thing an owner would set to get a year of trend before a capacity decision —
   is overwritten every night by the hardcoded 90. The override is not refused,
   it is silently defeated.
2. **The two rules can only ever agree by coincidence.** They are 124 lines apart
   in the same file, in two different functions, with two different constants and
   two different configurability stories.
3. **One of them is the shape `sweep()` exists to replace.** The second statement
   is a single unbounded `DELETE` against a table that grows with tenant count ×
   nights, with no `LIMIT`, no multi-pass and **no shortfall reporting** — so on a
   large account it is the statement most likely to hit D1's 30-second limit and
   remove nothing at all, silently. `runRetention`'s comment at `:187-199` argues
   that case at length about every *other* table.

**Severity.** Medium (−7): a shared fact with two lifecycle writers where one is
documented as primary and the other was explicitly scheduled for deletion. Not
high, because both writers are inside one component and neither corrupts a row —
the harm is a defeated control and an unbounded statement, not a divergent value.

**Fix (Tier 1 — three lines, and it is a deletion).** Delete
`housekeeping.ts:385-395` and the `DB_SIZES_RETAIN_DAYS` constant at `:269`,
and correct the paragraph at `:264-268`. `CORE_RETENTION` already sweeps it, on
the same pass, through the seam that reports shortfalls. Then add the check the
TODO implies: **no table named in any `*_RETENTION` list may be deleted from
outside `sweep()`** — a source scan over `DELETE FROM <table>` against the three
rule lists. That is the machine-checked version of "one lifecycle owner per
table", and it would have caught this on the commit that created it.

### R5-F2 · MEDIUM — the base's most-executed cross-service hop does not carry the request id, and it now writes rows that cannot be correlated

**Where.** `shared/workers/realtime.ts:141` — `publish()` calls
`callService(realtime, "https://realtime/publish", …, { worker, place, record })`.
No `req`.

`callService` sets the header from `opts.req` (`trace.ts:112`), so a missing
`req` means the realtime worker mints its own id and the chain breaks. `publish()`
is reached from **43 call sites** and runs on **every mutation in the base**
(Law R1) — it is the single most-executed binding hop there is.

This became load-bearing this round rather than merely untidy. `publish()` now
records a ping that never landed, through `recordOutbound` → `dbRecorder` →
`logError` with `{ source, place, message, stack }` and **no `requestId`**
(`error-log.ts:148-153`). So the rows the round added are precisely the rows that
cannot be tied back to the write that caused them.

**The full propagation census at HEAD — 18 of 23 hops:**

| hop | carries the id |
|---|---|
| gateway → auth / tenancy / content / data-ops / mcp ×2 / realtime (7) | **yes** — `proxyService({ req, … })` |
| `gating.ts:113` `whoAmI` | yes |
| `realtime/src/index.ts:110` `whoAmI` | yes |
| `data-ops/src/lib/agent.ts:189` resolve-names | yes |
| `gateway/src/index.ts:147` `sendErrorRow`, `:273` beacon verify, `:291` beacon forward | yes |
| `forwardToDoor` ×5 (mcp tools, agent tools, 2× import, import-batch) | **yes**, all five, plus `origin` |
| **`shared/workers/realtime.ts:141` publish** | **no** |
| `tenancy/src/lib/notify.ts:51` send-email | no |
| `tenancy/src/lib/invites.ts:279` invite email | no |
| `content/src/lib/notify.ts:66` send-email | no |
| `mcp/src/lib/bridge.ts:24` token → session bridge | no |

`25 × (18/23) = 19.6 → 20` on criterion 4's second row.

**Fix (Tier 1).** `publish()` already receives everything it needs from callers
that have a request; add an optional `req` to the three exported helpers and pass
it through, or — cheaper and harder to forget — thread it the way
`recordWorkerError` does, by taking the `Request` and reading the header once
inside the seam. The four email/bridge hops are one argument each.

### R5-F3 · LOW — R11's settlement publishes a hop count nobody can reproduce

`RULES.md` R11: *"So the honest count is 21 service-binding hops, not 24."*
Counted at HEAD: **18** syntactic seam call sites, **23** logical hops. Neither is
21, and the paragraph's own subject is three rounds each deriving a different
number.

Not a structural defect — the *decision* is settled and the check's subject list
is explicit data, which is what round 3 asked for. But a count in prose is the
thing this repository has now corrected in ten places, and commit `f30f954` is
literally titled *"three counts that rotted in the commit that wrote them"*.

**Fix.** Replace the number with the rule that produces it — *"every call through
`callService`, `proxyService` or `forwardToDoor`; `CHANNELS` stubs excluded"* —
and, if a figure is wanted, put it in the check's failure message where it is
computed rather than in the law where it rots.

### R3-F3 · CLOSED — `PLATFORMS.md` no longer claims one place runs SQL

Round 3's LOW is fixed, and fixed better than the correction I asked for. `PLATFORMS.md:24-52`
now says **"Pillar 1 is two doors, not one — a port has to move both"**, describes
`d1-rest.ts` as the only place SQL reaches a **per-team** database and explains
*why* (a team database is named at runtime and reachable only over the REST API),
then states the other half plainly:

> *"The **core** and **operations** databases are different: they are fixed, so
> workers reach them through the native `env.DB` / `OPS` bindings and write SQL
> **inline, at well over a hundred `.prepare(` sites spread across more than two
> dozen files** … not behind any seam at all. No exact figure is pinned here on
> purpose: it changed twice on the day this paragraph was written."*

…ships the counting command, names what lives behind the second door (sessions,
invites, teams, memberships, credits, MCP tokens, the error log), and closes with
the sentence that is the whole finding: *"**Porting `d1-rest.ts` alone moves the
tenant data and leaves identity behind** — and because the inline half has no
seam, a port has to touch every one of those call sites by hand. That asymmetry
is the real cost of pillar 1, and it is the thing to plan for first."*

That is criterion 8's third row in full (20/20). It does not raise rows 1 and 2 —
describing coupling and removing it are different jobs — and it should not.

---

## The blast radius — the worst case, named

```
                       gateway (public, fan-in 0)
                          │
      ┌──────────┬────────┼─────────┬──────────┐
   tenancy    content  data-ops    mcp     realtime
      └──────────┴────────┴─────────┴──────────┘
                          ▼
                   AUTH  (fan-in 6)
```

**If `brimba-auth` is down, 6 of the 7 components stop working, and the user sees
a 503 saying *"We couldn't check your sign-in just now. Nothing was changed — try
again in a moment."* on every screen.** Every gated request in every worker opens
with `whoAmI` (`shared/workers/gating.ts`), which calls auth over a service
binding; `callService` bounds it with `SERVICE_TIMEOUT_MS` and returns null; the
gate refuses. Nothing hangs, nothing crashes, and every one of those 503s leaves
a row.

ARCHITECTURE.md §2b states all of this — the component, what it takes down, what
the person sees, what still works (static pages, `/media/*`, already-open
sockets) and what is deliberately **not** built. Full 15/15 on that row.

**The remaining exposure is structural and LOCKED:** no session-validity cache,
by owner decision (2026-08-12), because a cached session survives revocation. It
forfeits criterion 2's fifth row for ever — **2.7 points of the total**. Instant
revocation is worth more than 2.7 points; naming the cap is the requirement,
relitigating it is not.

**One new observation about that worst case.** The gateway records through auth's
`/internal/log-error` door — so during an auth outage, the recording path for the
gateway's own crashes and for every browser beacon is down too. `callService`
swallows the 403/no-answer, so the outage's most public evidence is the one
evidence that is not collected. It is bounded (the domain workers all record
independently to `OPS`) and it is the correct trade for keeping the gateway
database-free, but it belongs in §2b's "what happens" list, which currently does
not mention it.

---

## Ownership table — every table with more than one writer

| table | writers | authoritative? | owner | status |
|---|---|---|---|---|
| `users` | auth (3 writes), tenancy (5, **all `current_team_id`**) | split by column, and the code matches | **auth**, ARCHITECTURE.md §1c | **closed** |
| `selectable_data` | tenancy (7), content (1, `ensureCategory`) | tenancy primary, exception reviewed | **tenancy**, §1c | **closed** |
| `error_logs` | 6 workers append via one seam; pruned by tenancy | shape owned; lifecycle flagged unowned | **data-ops** (shape), §1c | **minor −3** — the prune-reports-into-itself loop is live and named |
| `db_sizes` | **two DELETE rules in one worker, one pass** | neither defers to the other in code | tenancy | **medium −7 — NEW, R5-F1** |
| `activity` | one seam (`shared/workers/activity.ts`) | append-only | — | no finding, correct shape |

**Two probe rows are false positives, confirmed by reading:** `teams` written by
`worker:realtime` — `grep -iE "(insert\|update\|delete)[^\"]*teams" workers/realtime/src/*.ts`
returns nothing, the probe is matching prose. `help` written by `web` — the same
grep over `web/` returns nothing. Round 3 found the first; the second is new to
this probe run and is the same fault.

**Penalties: −3 (`error_logs`) −7 (`db_sizes`) = −10 → criterion 3 = 90.**

---

## FIX IMPACT MAP

| Fix | Files | Adds / removes | Which OTHER review this could damage |
|---|---|---|---|
| **R5-F1a** delete the duplicate `db_sizes` prune | `workers/tenancy/src/lib/housekeeping.ts` (−12, incl. the constant and two now-false comments) | **REMOVES** 12 lines and one unbounded DELETE | **`lean_mean` — a credit.** **`scaling_review` — a credit**: it removes the one unbounded DELETE from the nightly pass and hands the table to the multi-pass, shortfall-reporting sweep. **`spend_review` — check one thing:** `CORE_RETENTION`'s window is now the only one, so if an owner has been relying on the hardcoded 90 while `RETAIN_DB_SIZES_DAYS` is unset, nothing changes (the default is also 90) — confirm before shipping. **`error_log_review` — positive**: a shortfall on this table becomes reportable. |
| **R5-F1b** a check that no `*_RETENTION` table is deleted outside `sweep()` | `web/test/rules/worker.test.ts` (+~15) | ADDS ~15 test lines | **`lean_mean` — small debit** (test growth, in a file just split for exactly this). **`story_checks_out` — positive**: it makes a stated guarantee machine-checked. **Sequencing:** land the check **after** R5-F1a or it goes red on the defect it exists to prevent, which is fine, but say so. |
| **R5-F2** carry the request id through `publish()` and the four email/bridge hops | `shared/workers/realtime.ts` (+3), `workers/tenancy/src/lib/notify.ts` (+1), `workers/tenancy/src/lib/invites.ts` (+1), `workers/content/src/lib/notify.ts` (+1), `workers/mcp/src/lib/bridge.ts` (+1) | ADDS ~7 lines | **`error_log_review` — directly positive**, it is their F4. **`speed_review` — none:** one header on a call that already builds headers. **`security_sentry` — none:** a request id is opaque and already crosses every other hop. **`realtime_review` — check:** the realtime worker must not start *requiring* the header; it already mints its own when absent. |
| **R5-F3** replace R11's hop count with the counting rule | `RULES.md` (1 sentence) | REMOVES a number | **`story_checks_out` — positive** (a stale claim). **none else.** |
| **(informational)** add the gateway's recording path to §2b's outage list | `ARCHITECTURE.md` (+3 lines) | ADDS 3 lines | **none.** It documents a bounded, deliberate consequence rather than changing anything. |
| **(NOT recommended)** a core-database adapter over 147 `.prepare(` sites | ~28 files, a new `shared/workers/core-db.ts` | ADDS a layer over working code | **`lean_mean` — directly and severely**: CLAUDE.md's first prime directive. **`speed_review`** — one indirection on the busiest read path. **`base_fork_review`** — a fork inherits a layer it has no second platform for. **I do not recommend it. See CEILING.** |

---

## CEILING

**94 without the adapter, 95 with it, and the right answer is 94.**

```
1: 100×16=1600   2:  85×18=1530   3: 100×16=1600   4: 100×12=1200
5:  97×10= 970   6: 100×12=1200   7:  87×10= 870   8:  75× 6= 450
                                                    total 9420 → 94.2 → 94
```

- **Criterion 2 is permanently capped at 85** by ARCHITECTURE.md §2b (no
  session-validity cache, so revocation stays instant). Worth 2.7 points of the
  total, permanently, and worth paying.
- **Criterion 5 is capped at 97** by the rubric's own minor row — staging and
  production *must* differ in URLs and resource names.
- **Criterion 7 is capped near 90** by the 26 laws, arithmetically: every one is
  a thing a new module must satisfy, and the rubric's third row prices that.
- **Criterion 8's honest cap is ~75** without the adapter. Row 3 is already full;
  rows 1 and 2 need the layer, and the layer is the thing the reconciliation
  refused with reasons I have re-derived and agree with.

**Getting to 95 requires exactly one thing** — criterion 8 rising from 72 to 84
(`(84 − 72) × 6 = 72` → 9492 → 94.9 → 95) — and that one thing is the adapter.
**My recommendation is to record 94 as the ceiling and stop treating the missing
point as debt.** A rubric that prices a deliberate, documented, fully-costed
platform commitment at 6 weighted points is doing its job; paying the 6 points
would mean shipping ~28 files of indirection against a prime directive that calls
that a defect, to satisfy an arithmetic target.

---

## What no rubric asked about

1. **`/health`'s binding booleans made a slice of criterion 5 measurable for the
   first time, and stopped three workers short.** Round 3 closed criterion 5 with
   *"secrets remain unmeasured"*. They are now partly measurable at runtime:
   auth, content, data-ops and mcp each report `!!env.<SECRET>` booleans on an
   unauthenticated door, which is how commit `959c80a` found a secret an operator
   had been told to set that no code ever read. **Tenancy, realtime and the
   gateway report nothing.** Tenancy is the wrong one to miss: it holds
   `CF_D1_TOKEN` (without which no team database can be created or queried),
   `ADMIN_KEY`, `INTERNAL_KEY` and `OPS_ALERT_EMAIL`, and it runs the only
   alerting path in the base. The gateway has no health route at all, so the one
   public worker cannot say whether its recording key is set. Three lines each,
   same shape as the four that have it, and `scripts/smoke-staging.mjs:37-45`
   should assert the booleans instead of only `ok === true`.

2. **The rules suite was split by file before any check was written into it, and
   it worked.** `web/test/rules.test.ts` (1,203 lines, 29 checks) is now nine
   files in `web/test/rules/` with a shared `_paths.ts`. Four reviews each wanted
   to add a check; splitting first made each addition cheap instead of making the
   split bigger. That is the sequencing decision from §4 of the reconciliation,
   and it is visible in the tree. It is a `lean_mean` credit rather than an
   architecture one — but it is the mechanism that let this round land ~17,000
   lines across 188 files without the law suite becoming the bottleneck, and it
   is worth naming because the next fork will inherit the pattern, not the file.

3. **The `origin` header is stripped at the public door and set only by internal
   callers, and that is a genuine architectural invariant nobody scored.**
   `workers/gateway/src/index.ts:193` deletes `ORIGIN_HEADER` on every inbound
   request, with the reason written beside it: the audit trail trusts it to say
   *which surface* made a change, and `forwardToDoor` sets it on worker-to-worker
   calls that never pass through the gateway. *"Provenance a caller can forge is
   not provenance."* That is the correct shape for a trusted field crossing a
   trust boundary, it is invisible from any dependency graph, and it is the kind
   of thing that quietly breaks when someone adds a second public entry point.
   It deserves a line in ARCHITECTURE.md and a check.

---

**The single worst structural risk, in one sentence:** the growth meter that
exists to warn an owner before a shared database fills is pruned twice a night by
two rules that disagree about how to be configured, one of which was explicitly
scheduled for deletion the moment the other landed — so the knob an owner would
reach for to keep a year of trend is silently defeated by a hardcoded ninety days
sitting 124 lines away in the same file.

**And the round's own answer:** every finding round 3 raised is closed, two of
them completely — with an owner named, a rule written, and code that matches the
rule when you grep it — and one of them closed better than the correction asked
for. The score moves one point because criterion 4 was overstated last round on
the one hop that carries every mutation in the base, and because a repair pass
left behind a TODO that had already come true. That is not an argument against
any of the repairs. It is the argument for reading the comment a change left
behind before assuming the change is finished.
