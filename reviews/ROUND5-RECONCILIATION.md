# Round 5 — the reconciliation

Sixteen reviews were measured read-only, in parallel, by agents that would not
perform the repairs. Every gap they returned carried a **fix impact map**: for
each proposed change, which OTHER review it could damage, and how. This document
settles those collisions **once**, before any file was edited, so that no repair
quietly undoes another. A conflict settled here is not re-argued later in the
round.

---

## 1 · Six scores were wrong before a line of code changed

The most uncomfortable finding of round 5 is that a third of the campaign's
closing scores were arithmetic, not engineering. Each correction below is
justified by the **rubric's own published text**, never by preference — and each
will be re-derived in the re-measure by an agent that did not make the
correction. A correction that cannot survive that is not a correction.

| Review | Round 4 said | True at HEAD | Why |
|---|---|---|---|
| security_sentry | 83 | **88** | Round 4 substituted its own formula (`Σnum ÷ Σden`) for the skill's published weighted mean, and counted the penalty as 12 where 2 MEDIUM + 3 LOW is 9. Both deviations pushed one way |
| ocean | 94 | **95** | Criterion 1 was asserted at 80; measured from its own rows it is 85 — every branch pushed, nothing uncommitted but one file this round created |
| base_fork | 83 | **85** | The round-3 HIGH closed when the fork skill was rewritten. Separately, criterion 5 is scored 67 where the rubric says *"unmeasured, not zero… rather than inventing a number"* |
| dead_end | 70 | **75** | Three findings had already been fixed and never re-measured |
| round_trip | 62 | **66** | Its own CRITICAL and one HIGH landed after the measurement |
| story | 68 | **72** | Ran criterion 1 as a running delta off round 3 instead of the rubric's `100 − Σ penalties`, which the rubric says restarts each run |
| interfacelessness | 88 | **89** | A deleted tool stopped being advertised; a bulk door gained a tool |
| speed | 55 | **56** | An index defect it carried forward had already been fixed |

**This is a lesson, not a footnote.** Fifteen blind checks were found in rounds
1–4 — checks that sat green while guarding nothing. Round 5 found the same
disease in the *scoring*: a number that looks measured, is quoted downstream, and
was never re-derived. The rule that follows is the same one: **a score is not
admissible until someone has recomputed it from the rubric's own arithmetic.**

---

## 2 · The ceilings that turned out not to exist

Round 4 closed with a table headed "ceilings that are not code". Five of eight
did not survive contact with the source.

| Claimed cap | Verdict | What was actually true |
|---|---|---|
| speed 84 — `ctx.waitUntil` declined | **FALSE** | It was declined because Law R1's check supposedly could not see a wrapped publish. The check is `/publish(Change\|UserChange\|SignOut)\s*\(/` — it matches the wrapped form and always did. The refusal protected nothing |
| round_trip 78 — the gateway→auth hop is the spine | **FALSE** | The gateway does not call auth on the normal path; the domain worker does, over a **service binding** — same-colo RPC, not a network hop. The expensive hop is the D1 REST door |
| lean_mean 90 while `reviews/` is tracked | **REMOVABLE** | A pushed git tag keeps all 63 reports on GitHub for ever while taking them out of the working tree |
| security 92 — `/media/*` outside the surge ceiling by design | **FALSE** | `grep -c surge ARCHITECTURE.md` is 0. The "design" is a source comment, and the same file describes 500 req/s of anonymous media traffic as a live hazard |
| story 88 from words alone | **TRUE, but cheap** | Three criteria need commits. They are checks in one test file, not a redesign |
| scaling 90 — a ping carries no row data | **HOLDS** | Load-bearing. It is what stops a client without rights learning row data through the live channel |
| ocean 96 — one author | **HOLDS** | Truck factor. Real, permanent, worth 2 |
| first_run 95 — needs a real signup | **SPENT** | The owner performed one; it is already inside the 77 |

Two of eight were real. The rest were decisions recorded as physics — which is
its own lesson about how a ceiling gets written down.

---

## 3 · The collisions, and how each was settled

These are the cases where two reviews wanted opposite things. Each was decided
before any repair began, and the decision is binding for the round.

### Settled: do it, with the named guard

| Collision | Settled |
|---|---|
| **scaling** wants the `COUNT(*)` skipped on paged reads; **activity_log** and **interfacelessness** need Law R16's count to appear exactly once | Skip the count only when a cursor is present, and only after proving the client's sidecar keeps the page-1 figure. **If the client cannot be proven to tolerate it, the change does not ship** — a silently blanked tab badge is a worse defect than a full scan |
| **error_log** wants outbound integration failures recorded; **spend** and **scaling** note the recorder is reached over the same door that is failing | Record, but rate-limit to one row per integration per kind per minute, with a dropped-count surfaced on the next successful write. The rate limit is not optional — without it a D1 outage writes one row per failed query into a database that is failing |
| **first_run** wants every empty state to offer a way out; **first_run itself** is damaged if the buttons do nothing | Land the action dispatcher's default branch FIRST and verify it dispatches; only then declare `emptyAction` on the recipes. Order is the whole safety |
| **scaling** wants a per-team storage history; **scaling and spend** note it becomes the growth it measures | Ship the 90-day retention rule in the same commit as the table. Not the next commit |
| **spend** wants an account-wide spend ceiling; **speed**, **round_trip** and **scaling** would all pay for a hot-path `SUM` | Put it on the cron that already runs nightly. Zero cost to all three |
| **speed** wants `ctx.waitUntil` on 45 publishes; the check cannot tell a deferred publish from a forgotten one | Tighten the check to require `await` **or** `ctx.waitUntil(` before applying the change, so the optimisation cannot degrade into fire-and-forget |
| **round_trip** wants list projections trimmed; **EDGE-CASES.md** explicitly forbids blind trimming | Enumerate every consumer first. The doc moves with the code in the same commit, or the change does not ship |
| **round_trip** wants a cache freshness window; **realtime** owns freshness via live pings | Seconds, not minutes, with the reasoning written beside the constant |
| **error_log** wants `/health` to report its bindings; **security** notes `/health` is unauthenticated | Booleans only. Never a value, never the name of a missing secret |
| **lean_mean** wants `reviews/` untracked; **ocean** wants everything recoverable | A pushed tag satisfies both completely. `git checkout <tag>` restores all 63 reports |

### Settled: do NOT do it

| Proposal | Why it was refused |
|---|---|
| A gateway session cache to remove the auth hop | Buys round_trip ~3 points and costs a 30-second sign-out, forced-sign-out and deactivation lag. Security is worth more than three points |
| A membership check before serving `/media/*` | The only fix in the round that is a genuine trade — it adds a real auth hop to every image, debiting speed, round_trip and spend at once. The owner has not taken that trade |
| A core-database adapter over 132 `.prepare(` sites | The architecture review that would gain from it does not recommend it. A layer over 26 working files, against a prime directive that says too much code is a defect |
| Widening the first-run signpost past `alone` | Would make every established team fetch a learning total on `/home` to help teams that no longer need help |
| Splitting the bulk activity row into one row per record | A 500-ticket bulk resolve would write 500 rows into the fastest-growing team table |
| Sealing the vault via the macOS Keychain | The login keychain is on the laptop this review assumes is at the bottom of the ocean. It would produce a file nobody alive can open |

---

## 4 · The sequencing rule that mattered most

`web/test/rules.test.ts` was 1,203 lines and 29 checks, and **four separate
reviews each wanted to add a check to it**. Splitting it after they landed would
have meant splitting a bigger file and rewriting their work; splitting it first
makes each addition cheap.

So the split went first, alone, before any check was written. Everything else was
partitioned by **file**, not by review — eleven repair agents, each owning a set
of paths no other agent could touch, so two fixes could never meet in the same
diff. Where an item genuinely spanned two territories, the second half was
reported rather than edited, and wired afterwards.

That is the whole answer to *"how do you stop one review undoing another"*:
measure before touching, make every gap declare its blast radius, settle the
collisions centrally and in writing, partition by file, and re-measure with
people who did not do the work.
