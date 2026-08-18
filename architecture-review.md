# Architecture Review — Brimba
**2026-08-18 · 96/100 · was 74 before this pass · 570 tests green**

> The other reviews ask whether the system is good **under a condition** — under load
> (`scaling_review` 94), under attack (`security_sentry` 99), under handover
> (`mac_fell_in_the_ocean` 95), as described (`story_checks_out` 98), as written
> (`lean_mean` 97). This one asks the robustness question none of them do:
> **does the shape hold when something goes wrong or changes?**

**The worst case, named:** if `brimba-auth` is down, **6 of the 7 workers stop serving
gated requests** — every screen that needs a signed-in user, reads and writes alike. The
person sees *"We couldn't check your sign-in just now. Nothing was changed — try again in
a moment."* and their work stays on screen. Static pages, `/media/*` and already-open
live sockets keep working.

Before this pass they saw a **bare 500**, or worse, were **silently signed out** — because
`whoAmI` could not tell "auth says you are not signed in" from "auth said nothing".

---

## The scorecard

```
#  criterion                        method     before  after   weight  product
1  Dependencies point one way       defect       100    100      16     1600
2  Blast radius is contained  GATE  coverage      46     81      18     1458
3  Every fact has one owner         defect        90     97      16     1552
4  A request can be followed        coverage      25     98      12     1176
5  Environments match               defect       100    100      10     1000
6  Live data can be recovered       coverage      55    100      12     1200
7  The next module is cheap         coverage     100    100      10     1000
8  Platform is a choice, not a cage coverage     100    100       6      600
                                                                100     9586

                                        total = 9586 / 100 = 96
```

Gate: criterion 2 must clear 40 or the total caps at 65. It scores **81**. **No cap applied.**

---

## What the probe got wrong (read before counting)

The mechanical scan produced **eight** candidates. Five were false, and one of the false
ones was mine. This is the single most important habit in this review.

| probe said | truth | how it was settled |
|---|---|---|
| 33% of cross-service calls guarded | **100%** | 53 of the 69 hits were `publishChange(env.REALTIME, …)` funnelling through **one** `try/catch` in `shared/workers/realtime.ts:96`. Cluster before counting. |
| `realtime` writes `teams` | never does | `grep "UPDATE teams\|INSERT INTO teams" workers/realtime/` → zero hits |
| `web` writes `help` | never does | zero write statements in `web/`; it calls the endpoint |
| `activity` has two writers | one writer | `shared/workers/activity.ts:63` is the only `INSERT INTO activity`. The second "writer" was **a regex inside a test file I wrote an hour earlier.** |
| `propagatedHeaders: false` (after the fix) | it does propagate | the probe greps for the literal `x-request-id` within 80 characters of `headers`; the code uses a named constant `REQUEST_ID_HEADER`. Proven instead by `workers/gateway/test/trace.test.ts` — "carries the request id to the other side". |

Two things worth keeping: a mechanical scan mistakes **one seam used 53 times** for 53
separate risks, and it **cannot tell a test fixture from production code** — including a
fixture written minutes before.

---

## 1 · Dependencies point one way — 100/16 · defect

**0 import cycles. 0 layer violations.** Nothing imports upward; no worker reaches into
another worker's internals. All cross-worker traffic goes over service bindings, which is
what they are for. A clean result is a real result.

One thing to know rather than fix: `auth` and `realtime` bind **each other**. It is a
genuine cycle but an asymmetric one — auth's direction is best-effort and swallowed, so
realtime being down costs live updates, never writes. Its one sharp edge is a cold-start
deploy on a fresh account, already documented in OPERATIONS.md (error `10143`).

## 2 · Blast radius is contained — 81/18 · coverage · THE GATE

```
30/30  every cross-service call is guarded
16/20  short internal hops bounded; 9 pass-through paths deliberately are not
20/20  non-critical dependencies degrade rather than fail the request
15/15  the highest fan-in component is documented as the SPOF, with its consequence
 0/15  no fallback for the component every other one depends on   ← owner's decision
```

**What changed.** Every call that leaves a worker now goes through one seam,
`shared/workers/trace.ts`, which bounds it, never throws, and returns **null** for "did
not answer" as something different from a Response that says no. That last distinction is
the whole point: a refusal is a 401, a silence is a 503.

**The 16/20, honestly.** Ten short internal hops are bounded at 5s. Nine pass-through
paths are not, and the reason is written down in the code: the gateway proxy carries the
agent's **streamed** reply and `forwardToDoor` carries an **import batch**. A timeout
there would truncate a working answer mid-sentence. A bound that breaks a working feature
is not a bound, it is a bug. But the exposure is real — a slow data-ops can still hold a
gateway request open — so this scores 16, not 20.

**The 0/15 is a decision, not an oversight.** A short cache of "this session is valid"
would let a brief auth wobble pass unnoticed and would earn these points. It also means a
session you revoked — a departing employee, a stolen laptop — keeps working for the length
of that cache. Revocation is instant today and the owner chose (2026-08-18) to keep it
that way. Recorded in ARCHITECTURE §2b so the trade is visible, not accidental.

## 3 · Every fact has one owner — 97/16 · defect

Two of the five candidates were real, and neither had a stated owner. Both do now
(DATA-MODEL.md):

| table | owner | the other writer |
|---|---|---|
| `users` | **auth** — identity: the INSERT, `email`, names, `image_url`, onboarding | **tenancy** writes `current_team_id` only, a pointer to a team rather than a fact about the person |
| `selectable_data` | **tenancy** — every deliberate write, and the management screens | **content** appends one auto-created `Learning category` when an author types a new one |

The `users` split is **disjoint columns**, so no field has two authors and no write can be
lost. The rule for what comes next is written down: *auth owns who you are, tenancy owns
where you are.*

**−3 (minor):** that separation rests on a documented rule, not a machine check. Nothing
fails if a future module adds a second writer to an existing column. Worth a check the day
a third writer appears; not worth one today.

## 4 · A request can be followed end to end — 98/12 · coverage

```
30/30  a request id is minted at the edge (the gateway, honouring an inbound one)
23/25  propagated across every internal hop — one documented exception
20/20  logs are structured JSON, filterable by that id
15/15  errors land durably, and now carry the id (ops migration 0002)
10/10  platform observability enabled on 7 of 7 workers
```

Before this pass: **25/100**. Seven workers could handle one click and write seven log
lines with nothing in common. "The import failed for one customer at 14:02" meant reading
five logs and guessing which lines belonged together.

**A correction to this criterion, made after the score was published.** When 98 was first
computed, propagation was **broken whenever a client supplied its own `x-request-id`** —
`new Headers([...headers, [name, value]])` combines same-named headers rather than
replacing them, producing `"theirs, ours"`, which fails the shape check downstream. The
ship gate caught it before deploy and it is fixed (`.set()`, plus two regression tests).
So 98 was mildly optimistic at the moment it was published, and is now honestly earned. The
score does not move — the defect was in one branch of one hop — but a number published
before its subject worked is worth saying out loud rather than quietly correcting.

**The −2:** the WebSocket upgrade at [index.ts:125](workers/gateway/src/index.ts:125) does
not carry the id, because re-constructing a `Request` drops the upgrade and the socket
never opens. It is one long-lived connection rather than a hop in a chain, so there is
nothing to correlate it with — but it is an exception, and it is counted as one.

## 5 · Environments match — 100/10 · defect

**Zero parity diffs.** Every binding, variable and service matches between production and
staging across all seven workers. Staging genuinely proves something. Clean result.

## 6 · Live data can be recovered — 100/12 · coverage

Capped at **55** before this pass, because the rubric caps any recovery story where
nothing records an actual restore test — and nothing did.

**So one was run, end to end, on 2026-08-18.** A throwaway database
(`brimba-restore-drill`), two rows written, a bookmark taken, `DELETE FROM invoices`
confirming zero rows, then a restore. **Both rows came back with identical values.** The
drill database was deleted afterwards. No real data was touched.

**The drill found two faults in the runbook — which is the entire reason for running one:**

1. The documented command was `wrangler d1 time-travel info <db> --remote`. **`--remote` is
   not a valid flag for that subcommand**; the command simply fails. The runbook would have
   been wrong in the one moment it mattered.
2. Only `restore --timestamp` was documented. The **bookmark** form is the precise one, and
   it is what `info` actually hands you.

Also now stated: the window is **30 days** on Workers Paid, 7 on Free (checked against
Cloudflare's live docs, 2026-08-18), bookmarks are automatic, restoring is free — and
anything older than 30 days is **not recoverable by any means**, which nothing said before.

## 7 · The next module is cheap — 100/10 · coverage

A documented path (BUILD-A-MODULE.md), capability that plugs into registries rather than
edits (`shared/rules/registry.ts`, `tool-catalog.ts`, import `TargetDef`s,
`live-resources.ts`, `BULK_DOORS`), a worked example, and every seam named as a file plus a
function.

Checked against real commits rather than the claim: the most recent module-shaped addition
(the bulk twin for dropdown values) touched **three** source files. The same commit touched
17 in total, but the other 14 were the machinery of a new **law** — which is a different
and deliberately more expensive act.

## 8 · The platform is a choice, not a cage — 100/6 · coverage

Cloudflare-specific API use is concentrated in 14 of 269 files. PLATFORMS.md names five
pillars and the one seam file to swap for each; `d1-rest.ts` is the only place SQL runs and
`realtime.ts` the only broadcast seam. The cost of moving is written down per provider
(Turnkey / Moderate / Heavy). Business rules test in plain Node with no platform runtime.

Deep integration here is a deliberate strategy and its price is known. Informational, as
the rubric intends.

---

## What was built, and what locks it

| change | file | what it fixes |
|---|---|---|
| the trace seam | `shared/workers/trace.ts` *(new)* | one bounded, guarded, correlated way to call another worker |
| request id on error rows | `db/ops/0002_error_request_id.sql` *(new)* | an error row you can trace back to the request that caused it |
| the SPOF, named | `ARCHITECTURE.md` §2b | the failure nobody had written down |
| ownership stated | `DATA-MODEL.md` | who owns `users` and `selectable_data`, and the rule for what comes next |
| restore drill + two corrected commands | `OPERATIONS.md` | a runbook that now works when you need it |
| **R11 rewritten** | `RULES.md`, `shared/rules/registry.ts` | the law claimed service bindings were "Cloudflare-bounded and exempt". They are not. |

**R11 is the finding worth reading twice.** The law itself was wrong. The platform bounds
the *worker*; nothing bounded the *call*. Two checks now enforce the corrected version,
because the two halves fail differently:

- `service-calls-bounded` (source scan) — no worker calls a binding directly.
  **Sabotage-proven:** a direct `env.AUTH.fetch` was reintroduced; the check went red and
  named the file. Restored from a copy, never `git checkout`.
- `workers/gateway/test/trace.test.ts` (17 behavioural tests) — the half a scan cannot see:
  that a no-answer is not treated as a refusal.

---

## Findings still open

| # | severity | finding | tier |
|---|---|---|---|
| 1 | medium | **`auth` has no fallback.** Six workers depend on it; an outage is total. A cached session verification would fix it and would delay revocation. Owner declined 2026-08-18, recorded in ARCHITECTURE §2b. | 3 — decision |
| 2 | low | **Nine pass-through paths are unbounded** (gateway proxy ×7, `forwardToDoor` ×2). Deliberate — they carry streamed and long-running responses — but a slow downstream can still hold a request open. A deadline-aware bound that resets on bytes received would close it. | 3 — design |
| 3 | low | **`users` has two writers, separated by documentation not machinery.** Disjoint columns today; nothing fails if a future module adds a second writer to an existing column. | 2 — a check, when a third writer appears |
| 4 | low | **The WebSocket hop carries no request id.** Reconstructing the Request would break the upgrade. | won't fix — reasoned |

Nothing here blocks a ship.

---

## Cross-references, not duplicated scores

| concern | belongs to | score |
|---|---|---|
| sharding, query shape, fan-out, cold starts | `scaling_review` | 94 |
| tenant isolation, auth, injection, the agent's attack surface | `security_sentry` | 99 |
| DRY, bloat, file size | `lean_mean` | 97 |
| whether the docs agree with each other | `story_checks_out` | 98 |
| whether a stranger could rebuild it | `mac_fell_in_the_ocean` | 95 |
| whether the machine surface matches the UI | `interface_lessness_meter` | 98 |

---

## Seeing it rather than reading it

`architecture-blueprint.html` renders this same structure — read live from the repo, not
hand-maintained — as an interactive map: one public door, six specialists, a private
database per team, and a ten-step plain-English walkthrough. Three views: how it works,
where data lives, where the code lives. Every box and chip opens a detail card.

## The verdict

**The single worst structural risk: `brimba-auth` is a hard dependency for six of seven
workers with no fallback, so its outage is a total outage — a trade the owner has now made
knowingly rather than discovered at 3am.**
