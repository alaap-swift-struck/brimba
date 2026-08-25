# Lean Mean review — Brimba · 2026-08-25 · ROUND 3
SCORE: 92/100 (Grade A)   (round 1: 89 · round 2: 91)

## DELTA

| Criterion | Wt | R1 | R2 | R3 | Why it moved |
|---|---|---|---|---|---|
| Size & Scope | 0.12 | 91 | 90 | **88 ▼▼** | **Files over 400 lines: 17 → 21.** `rules.test.ts` **crossed the line round 2 drew**: 1,069 → **1,151**, past 1,100, after being the #1 split target for three consecutive reviews and now four. Offset — genuinely — by a whole subsystem retired (~300 net lines and 2 files out). Net source still **+1,255**. Full finding at **F-DOWN-1**. |
| Robustness | 0.22 | 87 | 93 | **94 ▲** | **Law-scan families on the correct reader: 2/8 → 8/8.** R1's own seam is the last one home (`shared/test/publish-seam.ts`), so no law in this repo is now checked by a reader with a known bug. R26 shipped with its check. Held back by one new gap and one denominator I am correcting: the highest-impact security control in the repo has **no door-level test** (proven by sabotage), and R10 coverage is honestly **5/7 workers**, not 5/5. |
| Documentation | 0.16 | 89 | 92 | **91 ▼** | Four more facts moved from prose into machine checks (`route-census-current`, `vault-claims-match-reality`, `ops-migrations-dir`, `fork-sweep-complete`) — the best thing that can happen to this score, and it happened four times. **Outweighed by one thing:** `ROUTE-CENSUS.md` is a *generated, committed, machine-checked* document that is **false** — it misses 9 of 103 doors and mis-states how many are ungated. A wrong document that carries the authority of "checked" is worse than no document. **F-DOWN-2.** |
| Understandability | 0.20 | 91 | 91 | **93 ▲** | `stripComments` 3 → **1**. Round 2's sharpest complaint — "the old broken text sitting beside the new correct one, under the same name" — is gone; 11 files now import one reader. The three publish-seam suites are down to 19/23/45 lines of pure declaration. A whole subsystem's worth of concepts deleted. Held back by `rules.test.ts` and by `sharding.ts` (482 → 583) now holding two unrelated jobs. |
| Leanness | 0.15 | 88 | 90 | **93 ▲▲** | **Test duplication 1.39 % → 0.01 %** — 94 duplicate 8-line windows down to **1**. The single best measurement in this campaign, and it is round 2's F2 delivered in full. Product-src duplication flat at 1.00 %. `AgentView` (58 dead lines) removed with the subsystem. New weight: a **second lockfile** and +8,024 tracked lines of regenerable review output. |
| Scalability & Structure | 0.15 | 91 | 92 | **92 =** | `shared/test/` is now a properly adopted three-module layer (`source` → `gating-seam` + `publish-seam`), and `scripts/fork.mjs` makes the fork sweep one derived command. Cancelled by two structural regressions: `sharding.ts` absorbed retention, and realtime + gateway are still outside every seam — now *papered over* by a census that reports them as absent rather than as uncovered. |

**Two criteria went DOWN, and a repair caused each.**
- **Size & Scope 90 → 88** — caused by the six-agent parallel pass. Not one repair; the aggregate.
  Every individual addition is defensible; the sum put four more files over 400 and pushed the
  file that has been item #1 for four reviews past the line.
- **Documentation 92 → 91** — caused by **`ROUTE-CENSUS.md`**, which is `security_sentry`'s own
  round-2 recommendation, built. It is the right idea; the implementation is blind on two of seven
  workers, so the repo now ships a checked document that under-reports its own attack surface.
  (`security_sentry` round 3 files the same object as its M1, from the other side.)

---

## Method

Every number below was produced twice by the same script
(`…/scratchpad/a3-lean.mjs`), once against `HEAD = 256d21b` and once against **`fe7d683`**, the
round-2 baseline, extracted with `git ls-tree` + `git show`. The *delta* is therefore trustworthy
independently of whether my normalisation matches round 2's.

**The tree moved under me, and I am saying so rather than hiding it.** `git status` during this
review showed four uncommitted files (`package.json`, `package-lock.json`, `web/next-env.d.ts`,
`web/test/fork.test.ts`) — a concurrent session removing `@swift-struck/ui` from the ROOT
`package.json` and adding a fork test that explains why. **Everything below is measured against the
commit**, not the moving tree. If that change lands, Leanness gains a small amount (one duplicate
dependency declaration removed) and Size gains 28 more test lines.

Unlike rounds 1 and 2, I **did** run tests this round — in a copy of the repo at
`…/scratchpad/a3-sandbox`, never in the repository. Baselines: `web` rules **29/29**, tenancy
**119/119**. (`web/test/fork.test.ts` fails in the sandbox only: it shells out to `git ls-files` and
the copy is not a git repo.) So "suite passes" moves from *unmeasured* to *partially measured*.

---

## Baseline counts — R2 vs R3, same script both times

| Measure | R2 (`fe7d683`) | R3 (`256d21b`) | Δ |
|---|---|---|---|
| Tracked source (.ts/.tsx/.mjs/.sql/.css) | 39,530 / 299 files | **40,811 / 297 files** | **+1,281 / −2** |
| — test code | 9,489 / 76 | **9,955 / 77** | +466 / +1 |
| — non-test source | 30,041 | **30,856** | **+815** |
| Test : non-test ratio | 31.6 % | **32.3 %** | +0.7 pt |
| `it()` blocks | 586 | **598** | +12 |
| Repair-pass diff, source only | — | **+2,066 / −811 = +1,255** | 60 files |
| **Files > 400 lines** | 17 / 299 | **21 / 297** | **+4** |
| **`web/test/rules.test.ts`** | 1,069 lines, 27 checks | **1,151 lines, 29 checks** | **+82 / +2** |
| `workers/tenancy/src/lib/sharding.ts` | 482 | **583** | +101 |
| Dup 8-line windows, product src | 211 / 21,482 = 0.98 % | 217 / 21,788 = **1.00 %** | +0.02 pt |
| **Dup 8-line windows, tests** | 94 / 6,744 = 1.39 % | **1 / 6,975 = 0.01 %** | **−1.38 pt** |
| 3 publish-seam suites | 268 lines, **3** private readers | **87 lines + 1 shared 107-line module** | −74 / 3 readers → 1 |
| `stripComments` implementations | 3 | **1** | −2 |
| Law-scan families using the *correct* reader | 2 / 8 | **8 / 8** | **+6** |
| Files importing `shared/test/source.ts` | 6 | **11** | +5 |
| Dead-everywhere symbols (hand-verified) | 8 (~192 lines) | **7 (~134 lines)** | −1 (`AgentView`) |
| Cross-worker dup: `send()` in two `notify.ts` | present (21 lines) | **present (21 lines)** | = |
| Enforced laws with a named check | 25 / 25 | **26 / 26** | +1 (R26) |
| TODO / FIXME in code | 0 | **0** | = (the one hit is a sabotage description inside a test comment) |
| Comment ratio | 19.7 % | **20.7 %** | +1.0 pt |
| Runtime deps in workers | 0 in 7/7 | **0 in 7/7** | = |
| Linter / formatter config | none | **none** | = |
| Tracked regenerable review artifacts | 31 files / 11,288 lines | **39 files / 19,312 lines** | +8 / +8,024 |
| Lockfiles tracked | 1 | **2** (`package-lock.json`, `web/package-lock.json` +5,689) | +1 |
| Root `.md` : non-test source | — | 10,499 / 30,856 = **0.34** | — |

---

## Arithmetic

Rubric weights (`~/.claude/skills/lean_mean_review/reference/rubric.md`), unmodified:
`overall = 0.12·size + 0.22·robustness + 0.16·docs + 0.20·understandability + 0.15·leanness + 0.15·scalability`

### 1 · Size & Scope — **88** (weight 0.12) · was 90 · **▼ 2**

The round's headline question was whether six agents working in parallel would bloat the tree. They
did, and less than I expected — but the damage landed exactly where round 2 said it would.

- **Net source +1,255** (+2,066 / −811 across 60 files) for: prompt caching, bounded retention, 5xx
  recording in four workers, account-creation logging, permission-column narrowing, a connection
  dot, a first-run block, a mention cap, two MCP guards, single-row re-pull doors, the
  privilege-assignment guard, `scripts/fork.mjs` + law R26, and `scripts/route-census.mjs` +
  `ROUTE-CENSUS.md`. Fourteen distinct capabilities for 815 non-test lines is dense.
- **The ~300 lines that came out are real and I am crediting them fully.** Commit `a6d571e`
  deleted 346 product lines across 19 files and removed **two whole files**
  (`workers/tenancy/src/lib/screens-config.ts` −65, `workers/tenancy/test/screens-config.test.ts`
  −76) plus `web/components/agent-view.tsx` (−58). Tracked source *files* went **down** (299 → 297)
  for the first time in this campaign. Retiring a subsystem that had no caller is the highest-value
  thing a lean review can be handed, and it happened without being asked twice.
- **The deduction is entirely the long-file trend, and it doubled.** Files over 400 lines:
  16 → 17 → **21**. The four new crossers are `web/test/store.test.ts` (551),
  `workers/data-ops/src/lib/model.ts` (490), `workers/tenancy/test/retention.test.ts` (423) and
  `web/lib/screens.ts` (413); `sharding.ts` gained 101 lines and `roles.ts` 50.
- Deduction −12 (was −10). 0 TODO · 0 runtime deps in 7/7 workers · 0 vendored code · 0 abandoned
  directories — all held.

### 2 · Robustness — **94** (weight 0.22) · was 93 · **▲ 1**

| Control | R1 | R2 | R3 |
|---|---|---|---|
| Tests exist and are CI-gated (`npm run check` = tsc ×8 + 8 workspaces) | ✔ 1/1 | ✔ 1/1 | ✔ 1/1 |
| Type-checked across all 8 TS projects | ✔ 1/1 | ✔ 1/1 | ✔ 1/1 |
| Boundary-validation seam with its own lock test | ✔ 1/1 | ✔ 1/1 | ✔ 1/1 |
| Every enforced law has a *named* check | ✔ 25/25 | ✔ 25/25 | ✔ **26/26** |
| **Law source-scan families using the correct reader** | ✘ 0/8 | ✘ 2/8 | ✔ **8/8** |
| ONE canonical source reader, itself under test | ✘ 0/1 | ✔ 1/1 | ✔ 1/1 |
| Right-gated workers with exactly one R10 implementation | ✘ 0/3 | ✔ 3/3 | ✔ 3/3 |
| Root error boundary actually rendered | ✘ 0/1 | ✔ 1/1 | ✔ 1/1 |
| Workers with state-changing doors covered by an R10 seam | ✘ 4/5 | ✔ 5/5 | ✘ **5/7** ← denominator corrected |
| Laws whose check is machine-verified **to exist** | ✘ 0/25 | ✘ 0/25 | ✘ **0/26** |
| **Security invariants with a door-level test** | — | — | ✘ **NEW gap** |
| Linter / formatter | ✘ 0/1 | ✘ 0/1 | ✘ 0/1 |
| Suite actually passes | unmeasured | unmeasured | **partially measured** (2 of 8 workspaces run green in a sandbox) |

**The win, and it is the one round 2 asked for.** `shared/test/publish-seam.ts` (107 lines) replaced
three private `indexFunctions` readers, each carrying *both* faults this repo spent a day removing —
slicing to the next EXPORTED function and never stripping comments. R1, the base's *first* law, was
the last one still checked by that reader. It is now on `shared/test/source.ts` like every other.
**8/8.** No law in this repository is now enforced by a reader with a known bug.

**Two things pull it back, and I am correcting my own predecessor on one of them.**

1. **R10 coverage is 5 of 7 workers, not 5 of 5.** Round 2 used "workers with state-changing doors"
   as the denominator and then listed five. Realtime (`POST /publish`) and gateway
   (`POST /api/log/client`) each have one, and neither has a gating-seam suite. The correct
   denominator is 7. This is a correction, not a regression.
2. **NEW — the repo's highest-impact security control has no door-level test.** I deleted
   `await assertCanAssignRole(...)` from **both** `createInvite` and `changeMemberRole` in a
   sandbox and the tenancy suite stayed at **119/119**. Three tests exercise the helper in
   isolation; nothing asserts either door calls it. See `security_sentry` round 3, M2.

Deduction −6.

### 3 · Documentation — **91** (weight 0.16) · was 92 · **▼ 1**

**Four more facts moved from prose into a check** — `route-census-current`,
`vault-claims-match-reality` (no document may say the vault exists while it does not),
`ops-migrations-dir` (every `OPS` binding declares `migrations_dir`), and `fork-sweep-complete`
(R26). Round 2 called this the best thing that can happen to this score. It happened four times, and
the score still fell. Here is why.

**`ROUTE-CENSUS.md` is generated, committed, machine-checked — and wrong.** Its headline reads
*"94 routes · 58 state-changing · 1 with no gate detected."* Counted off the source the surface is
**103 routes · 60 state-changing · 2 with no gate**. `scripts/route-census.mjs` recognises only a
`ROUTES` table and auth's `switch`; realtime and gateway dispatch with `if (pathname === …)`, so
`census()` reads their `index.ts`, matches nothing, and adds **zero rows, silently**. Nine doors are
missing, and the one it hides — `realtime POST /publish` — is the only door in the base with no
caller check of any kind. The file's own comment names *"realtime's publish door and the gateway
beacon"* as the doors the old sweep missed.

For a documentation score this is the worst shape a document can take: it is authoritative
(generated + checked), it is the artefact the next reviewer is told to inherit, and it under-reports
the thing it exists to report. `web/test/rules.test.ts:860` guards it with
`expect(rows.length).toBeGreaterThan(60)` against a real 94 — a floor 34 below the truth, in the same
week `workers/auth/test/gating-seam.test.ts:82` was given an *equality* for exactly this reason.

Deduction −9:
- **Law *wording* is still unchecked.** Each law's text lives in three places (RULES.md table ·
  CLAUDE.md bullet · `registry.ts` blurb); only the ID set and the numeric range are compared.
- `RECORD_DETAIL_EXCEPTIONS` (`shared/rules/registry.ts:302`) is still empty, still read by nobody,
  and still described as a live escape hatch in **three** docs (BASE-MANUAL.md:391,
  UI-CONVENTIONS.md:246, UI-GAPS.md:18). Round 1's F6, round 2's, unaddressed.
- Tracked regenerable output 31 → **39 files / 19,312 lines**, while `.gitignore:26` still excludes
  `architecture-blueprint.html` for being "regenerable, not source". Counted −1 only: `reviews/` is
  transient by LEDGER.md's plan, but the 11 root report files are not, and have been tracked for weeks.

### 4 · Understandability — **93** (weight 0.20) · was 91 · **▲ 2**

**Round 2's sharpest complaint is fully answered.** `git grep "function stripComments"` returns
**exactly one** hit (`shared/test/source.ts:74`). The situation round 2 called *"worse than one wrong
copy"* — a header explaining that the local implementation is a bug, sitting directly above the local
implementation — no longer exists anywhere in the repo. Eleven files import the one reader.

**The publish-seam suites are now the best-shaped thing in the test tree.**
`workers/content/test/publish-seam.test.ts` is **19 lines**: a comment saying where the scan lives, an
import, and a declaration naming this worker's one reviewed housekeeping exception with its reason.
A reader learns the seam once and then reads three declarations. That is the model the other seams
should copy.

**A whole subsystem's worth of concepts is gone** — table, migration, gate, validator, permission
row, renderer, client merge, tool and trace. Fewer things to hold in your head is an
Understandability gain that no refactor buys.

**Two losses, both unaddressed:**
- `web/test/rules.test.ts` is **1,151 lines holding 29 unrelated law scanners** at a mean of 40
  lines each. It has now been the #1 item for four consecutive reviews and has grown at every one:
  978 → 1,069 → 1,151.
- `workers/tenancy/src/lib/sharding.ts` went 482 → **583** because the retention sweep was added to
  it. Retention and shard-splitting are both "the data got too big", but they are different jobs
  with different triggers, and the file is named for one of them. A reader looking for the nightly
  prune has no reason to open a file called `sharding`.

### 5 · Leanness & Optimization — **93** (weight 0.15) · was 90 · **▲ 3**

**The headline: test duplication went 1.39 % → 0.01 %.** Ninety-four duplicate 8-line windows across
the test tree became **one**, in 6,975 lines. Round 2 identified the cause precisely (three
publish-seam suites, ~92 redundant copies) and priced the fix at −130 lines. It was done, and the
measurement confirms the diagnosis was exact: remove that cluster and the test tree's duplication is
essentially zero.

| | R1 | R2 | R3 |
|---|---|---|---|
| product-src duplicate 8-line windows | 208 / 21,026 = 0.99 % | 211 / 21,482 = 0.98 % | **217 / 21,788 = 1.00 %** |
| test duplicate 8-line windows | 97 / 6,436 = 1.51 % | 94 / 6,744 = 1.39 % | **1 / 6,975 = 0.01 %** |
| multi-file copy clusters | 3 | 2 | **1** |

Product-source duplication is **flat at 1.00 %** across +306 measured lines — six new duplicate
windows on a pass that added fourteen capabilities. That is the second round running in which
substantial additions moved duplication by essentially nothing.

Remaining debt, counted, none of it in product logic:

| Item | Lines removable | Change since R2 |
|---|---|---|
| `send()` duplicated verbatim across tenancy/content `notify.ts` | **−21** | unchanged (no `shared/workers/send-email.ts` exists) |
| Dialog open/close + `clearDraft` wrapper in 7 form dialogs | −50 | unchanged |
| Dead code, 7 symbols verified unreferenced in any `.ts/.tsx/.mjs` | −134 | was 8 / −192 (`AgentView` removed) |
| — of which **ruled to stay**: `queryModule` chain (69, scaling wins) | (69) | reconciled, brief re-confirms |
| — genuinely actionable dead code | **−65** | unchanged |
| **Total, no capability lost** | **≈ −136 lines** | was ≈ −274 |
| Plus committed regenerable reports | −1,700 root doc lines | unchanged |

**New weight this round, and it is not test bulk:**
- **A second lockfile.** `web/package-lock.json` (5,689 tracked lines) joined the root one in commit
  `a6d571e`. Two lockfiles in an npm-workspaces repo is a divergence waiting to happen — and it has
  already happened: the concurrent working-tree change I found removes `@swift-struck/ui` from the
  root `package.json` because the root pinned no version while `web/package.json` pinned 0.16.0.
  `base_fork_review` is filing the same object from its own side.
- `reviews/` grew +8,024 tracked lines.

Deduction −7. Six of the seven dead symbols survive, and `MUTATING_WORKERS` — a constant whose own
comment says *"track it here"* — still has zero consumers (round 1's F5, round 2's F5).

### 6 · Scalability & Structure — **92** (weight 0.15) · was 92 · **= flat**

Two real gains and two real losses, and they cancel. I am reporting both rather than netting them.

**Gains.** `shared/test/` is now a properly adopted three-module layer — `source.ts` (the reader) →
`gating-seam.ts` (R10) + `publish-seam.ts` (R1) — with 11 consumers and no competing implementation.
That is the correct shape for a rule engine and it took two rounds to get there. `scripts/fork.mjs`
+ R26 turns the fork procedure from prose in an external skill into one derived command whose check
reads three independent sources.

**Losses.**
- `sharding.ts` absorbed retention (+101 lines): two unrelated growth concerns behind one filename.
- **Realtime and gateway are still outside every seam** — no R10 suite, no publish-seam, and now not
  in the census either. The structural asymmetry did not get worse; what got worse is that it is now
  *papered over*. Before this round, "realtime has no coverage" was visible as an absence. Now
  `ROUTE-CENSUS.md` lists five workers and reads as complete.

Deduction −8: platform coupling is total and deliberate (a locked ARCHITECTURE.md decision, a cap not
a defect), and the shard-split valve stays half-wired by the same locked choice.

### Total

```
0.12×88 + 0.22×94 + 0.16×91 + 0.20×93 + 0.15×93 + 0.15×92
= 10.56 + 20.68 + 14.56 + 18.60 + 13.95 + 13.80
= 92.15  →  92   (Grade A)
```

---

## Findings

### F-DOWN-1 · HIGH — `rules.test.ts` crossed the line. Four reviews, four times #1, three times bigger.

**Plain English.** One test file now holds twenty-nine unrelated rule checks in eleven hundred lines.
Every review for a month has said to split it. Every review it has grown instead.

**Where.** `web/test/rules.test.ts` — 1,151 lines, 29 `it()` blocks.

| | 18 Aug | R1 | R2 | **R3** |
|---|---|---|---|---|
| Lines | ~900 | 978 | 1,069 | **1,151** |
| Checks | — | 24 | 27 | **29** |
| Headroom to 1,100 | — | ~122 lines | ~32 lines | **−51 — over** |

Round 2 wrote: *"the next check of any normal size crosses it."* Two checks of normal size were
added (`route-census-current` ~30 lines, `vault-claims-match-reality`) and it crossed by 51.

**Why it matters technically.** A vitest file is the unit of parallelism and the unit of blame. One
red check in this file gives a 1,151-line haystack. It is also the single worst file in the repo for
an LLM agent to work in — the audience this rubric explicitly names — because the whole file must be
in context to add one check safely, and each addition makes the next one costlier. And the file is
now the *only* place the split has not happened: the gating seam, the publish seam and the source
reader have all been extracted to `shared/test/`.

**Fix.** Split by law family, following the precedent this repo already set twice:
`web/test/rules/ui.test.ts` (R2/R3/R4/R8/R16/R22), `web/test/rules/data.test.ts`
(R13/R14/R15/R21/R23), `web/test/rules/docs.test.ts` (registry-integrity, law ranges, runbook
counts, census, vault claims), `web/test/rules/nav.test.ts` (R20). Four files of ~290 lines,
zero behaviour change, and the shared helpers are already extracted so the split is close to pure
movement. **This is the single highest-value refactor in the repo and it costs no other review a
point** — see the impact map.

### F-DOWN-2 · HIGH — the route census is a checked document that under-reports the surface it exists to report

**Plain English.** The new file that says "here is every door this app has" is missing nine of them,
including the only one that lets anyone in without checking who they are — and the test that guards
it cannot tell.

**Where.** `scripts/route-census.mjs:95-101` · `ROUTE-CENSUS.md:11` · `web/test/rules.test.ts:848-876`.

| worker | real doors | in the census |
|---|---|---|
| auth / mcp | 13 / 5 | 13 / 5 ✔ |
| tenancy / content / data-ops | 35 / 20 / 24 | 34 / 19 / 23 (each missing its inline `GET /health`) |
| **realtime** | **3** | **0** |
| **gateway** | **3** | **0** |
| **total** | **103** | **94** |

Proven by sabotage in a sandbox: an ungated `POST /danger` planted in realtime, and again in gateway,
left `web/test/rules.test.ts` at **29 passed (29)** both times.

**Why it matters to *this* review.** Documentation is scored on *one source of truth per topic* and
on whether a doc's claim is checkable. This document is checked and false, which is the one
combination that actively destroys value: it retires the suspicion that would have found the gap.
It is also the third instance in two weeks of the same construction bug — a scanner that cannot see
what it scans for — after `stripComments` and the auth census.

**Fix.** Three small changes, detailed in `security_sentry` round 3 M1: a third dispatch parser; **an
unparseable worker must FAIL, not be skipped**; and `toBe(103)` instead of `> 60`. The cheapest
version parses dispatch **once** in `shared/test/source.ts` and lets both the census and the R10
suites read it — which *removes* lines rather than adding them, and is the fourth instance of the
duplication `source.ts` was created to end.

### F1 (round 2) — CLOSED ✔
`stripComments` is down to one implementation. Eleven files import `shared/test/source.ts`. Verified
by `git grep "function stripComments"` → one hit.

### F2 (round 2) — CLOSED ✔, and over-delivered
Three publish-seam suites → `shared/test/publish-seam.ts` (107 lines) + three declarations totalling
87. Round 2 priced it at −130 lines; the measured effect is −74 lines **and** the test tree's
duplication collapsing from 1.39 % to 0.01 %.

### F3 · MEDIUM — nothing verifies that a law's check file still exists
`shared/rules/registry.ts` names a check per law; deleting a seam suite outright still leaves the
build green, because the meta-check matches on names, not on files. **0 of 26.** Unchanged from
round 2, and it now rides free inside the F2 scanner that was built.

### F4 · MEDIUM — 134 lines nothing can reach; one symbol removed in a week
Re-verified one by one with `git grep -w` over `.ts/.tsx/.mjs`, excluding `reviews/` (a review that
cites a dead symbol makes it look alive — round 2's measurement trap, avoided).

| Symbol | Location | Status |
|---|---|---|
| `AgentView` | `web/components/agent-view.tsx` | **REMOVED ✔** (−58, with the subsystem) |
| `queryModule` → `resolveModuleDatabases` | `workers/tenancy/src/lib/sharding.ts` | still dead (~69) — **ruled to stay**, the ROUND3 brief re-confirms it |
| `cheapText` | `workers/data-ops/src/lib/model.ts` | still dead (~12) |
| `openAgent` | `web/lib/agent-open.ts` | still dead (3) |
| `MUTATING_WORKERS` | `shared/rules/registry.ts:293` | still dead (1) — see F5 |
| `RECORD_DETAIL_EXCEPTIONS` | `shared/rules/registry.ts:302` | still dead (1) — documented live in 3 docs |
| `ImportSession`, `GlossaryKey`, `ConceptKey` | `shared/types.ts`, `shared/glossary.ts`, `web/lib/pages.ts` | still dead types (~10) |

Honouring the reconciliation, **~65 lines are genuinely actionable.**

### F5 · MEDIUM — `MUTATING_WORKERS` is still a constant whose comment says "track it here" and nothing reads
`shared/rules/registry.ts:293` — `["tenancy","content","data-ops"]`, **0 consumers**, third review
running. The fix now rides completely free: `shared/test/publish-seam.ts` exists and could assert
that every name in `MUTATING_WORKERS` has a `publish-seam.test.ts` on disk — 8 lines that turn a dead
constant into the guarantee its own comment claims, and close F3 for R1 at the same time.

### F6 · MEDIUM — one cross-worker copy, unchanged
`workers/tenancy/src/lib/notify.ts:24` and `workers/content/src/lib/notify.ts:55` still contain a
byte-identical 21-line `async function send(...)`, differing only in the trace label. No
`shared/workers/send-email.ts` exists. **Fix:** one shared seam taking the worker name as a
parameter, −21 lines.

### F7 · LOW — NEW · two lockfiles, already diverged
`web/package-lock.json` (5,689 lines) joined `package-lock.json` in `a6d571e`. In an npm-workspaces
repo this is one dependency graph described twice. It has already produced a real fault: the
concurrent working-tree change removes `@swift-struck/ui` from the root `package.json` because the
root pinned no version while `web/` pinned 0.16.0, so a fresh fork installed a *different* library
than the base is built against. **Fix:** one lockfile at the root, which is what workspaces are for
— and coordinate with `base_fork_review`, which is filing the same object.

### F8 · LOW — NEW · `sharding.ts` now holds two unrelated jobs
482 → 583 lines because the nightly retention sweep was added to the shard-splitting file. Both are
"the data got too big", but they have different triggers, different owners and different failure
modes, and the filename names only one. **Fix:** `workers/tenancy/src/lib/retention.ts` — a pure move
of ~150 lines, and `retention.test.ts` (423 lines) already exists to point at it.

---

## The copy-paste budget, recomputed

```
product-src duplicate ratio        = 217 / 21,788 = 1.00 %
a 5 % ceiling is the usual "fine"  = 0.05 × 21,788        ≈ 1,089 duplicate lines allowed
headroom                           = (0.05 − 0.0100) × 21,788   ≈ 872 lines of pure copy-paste
```

Two rounds of substantial addition have moved product duplication by 0.02 points. **Duplication is
not this repo's problem and has never been.** Its problems are file *size* (F-DOWN-1, F8), and
checks that cannot see what they scan for (F-DOWN-2, F3). Do not spend effort on DRY here.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F-DOWN-1** split `rules.test.ts` into 4 files by law family | `web/test/rules.test.ts` → `web/test/rules/{ui,data,docs,nav}.test.ts` | REMOVES 0 lines, MOVES 1,151 into 4 files of ~290 | **none — it is pure movement with zero behaviour change.** Two cautions: the `describe` names appear in no other file, and `shared/rules/registry.ts`'s check names are matched by name not by path, so the meta-check is unaffected. `story_checks_out` — RULES.md's "the check lives in `web/test/rules.test.ts`" appears in the registry blurb for ~23 laws and in RULES.md's table; those paths must move in the same commit or 23 dangling references appear. **That is the whole cost, and it is a find-and-replace.** |
| **F-DOWN-2a** third dispatch parser + inline-health parser in the census | `scripts/route-census.mjs` (+~20), `ROUTE-CENSUS.md` (+9 rows) | ADDS ~20 lines | **lean_mean (me)** — +20 lines in a 150-line script. **Do the cheaper version instead:** move dispatch parsing into `shared/test/source.ts` and have the census AND the R10 suites read it — that version REMOVES lines and closes the duplication for good. **story_checks_out** — the census headline changes from "1 with no gate" to "2", and RULES.md's R10 paragraph plus BASE-MANUAL's route table reference numbers that move. |
| **F-DOWN-2b** unparseable worker ⇒ FAILURE; `toBe(103)` not `> 60` | `web/test/rules.test.ts` (~7 lines) | ADDS ~7 lines | **base_fork_review** — *real, small*: a fork that removes a module now fails the build until the number is updated. `scripts/fork.mjs` must regenerate the census, or R26's "leaves `npm run check` green" promise breaks. Check that line before shipping. |
| **F3 + F5** `publish-seam.ts` asserts every `MUTATING_WORKERS` name has a suite on disk | `shared/test/publish-seam.ts` (+8) | ADDS 8 lines, REMOVES a dead constant's deadness | **none — it converts a dead constant into the guarantee its own comment claims.** It goes red only if a seam suite is deleted, which is the point. |
| **F4** delete 65 lines of actionable dead code (`cheapText`, `openAgent`, 3 dead types) | 5 files | **REMOVES ~65 lines** | **base_fork_review** — *check first*: `cheapText` is a model-tier helper a fork with a different model provider might want. Confirm with the owner before deleting that one; the other four are unambiguous. |
| **F6** `shared/workers/send-email.ts` taking the worker name | new shared file, 2 `notify.ts` | **REMOVES 21 lines**, ADDS one seam | **architecture_review** — *positive*, one outbound-mail owner instead of two. **error_log_review** — the trace label must stay per-worker or two workers' mail failures become indistinguishable in the log; pass it as the parameter, do not hard-code it. |
| **F7** one lockfile at the root | delete `web/package-lock.json`, pin `@swift-struck/ui` in root `package.json` | **REMOVES 5,689 tracked lines** | **base_fork_review** — *strongly positive*, it is the exact fault it is filing. **mac_fell_in_the_ocean_review** — *positive*: one graph to reproduce. **Do not do this half-way** — a root pin with a stale `web/` pin is worse than today. |
| **F8** move retention out of `sharding.ts` | new `workers/tenancy/src/lib/retention.ts`, `sharding.ts` −150 | MOVES ~150 lines; files > 400 drops 21 → 20 | **scaling_review** — *neutral-to-positive*: SCALING.md discusses both valves in one section and would want one sentence updated. **none else** — pure movement. |
| **(from security M2)** two door-level tests for `assertCanAssignRole` | `workers/tenancy/test/roles.test.ts` (+~40) | ADDS ~40 test lines | **lean_mean (me)** — *this one genuinely costs me*: +40 lines of test on a tree already at 32.3 % test:source. **Pay it.** A 40-line lock on the highest-impact security control in the repo is the best value per line in this report, and Robustness gains more than Size loses. |

---

## CEILING

**Is 95 reachable by changing code? Yes — but only just, and only by doing the two things that have
now been the top item for four reviews.** The arithmetic:

| Criterion | Now | After F-DOWN-1 + F8 + F4 + F6 + F7 | Cap |
|---|---|---|---|
| Size & Scope | 88 | **93** — files > 400 drops 21 → 19, the 1,151-line file becomes four ~290s, −86 dead/duplicate lines, −5,689 lockfile lines | ~95: the repo is 40k lines doing genuinely large work; there is no 100 here |
| Robustness | 94 | **97** — F3/F5 close, the assignment guard gets its lock | **97 is the true maximum.** A linter/formatter would take it higher and there is none; adding one is a real change the owner has not asked for |
| Documentation | 91 | **95** — the census becomes true; law *wording* checked; the phantom removed from 3 docs | ~96 |
| Understandability | 93 | **96** — the split and the `sharding`/`retention` separation are the only two things holding it | ~96 |
| Leanness | 93 | **96** — −136 actionable lines, −5,689 lockfile, the last copy cluster gone | ~97: product duplication is already 1.00 % and cannot usefully go lower |
| Scalability | 92 | **93** — realtime + gateway inside the seams | **93 is capped by a locked decision.** Total Cloudflare coupling is ARCHITECTURE.md's, deliberately; no commit may raise it |

```
0.12×93 + 0.22×97 + 0.16×95 + 0.20×96 + 0.15×96 + 0.15×93
= 11.16 + 21.34 + 15.20 + 19.20 + 14.40 + 13.95 = 95.25  →  95
```

**95 is reachable and 96 is not.** Two criteria are capped by things a commit cannot fix:
Scalability at 93 by the locked platform decision in ARCHITECTURE.md, and Robustness at 97 by the
absence of a linter nobody has asked for. Even scoring both at their ceilings, the blend lands at
**95.3**. There is no arrangement of these six numbers that reaches 96 without relitigating a locked
decision.

**And the honest note on the round's own question.** Six agents added 1,255 net source lines in
parallel and this score went **up** — because the same pass also retired a subsystem, collapsed the
test tree's duplication to zero, and got the last law onto the correct reader. Parallel work did not
bloat this repo. What it did was push four more files past 400 lines and ship one checked document
that is false, and both of those are the *same* failure the last three reviews named: things that
should have been split were added to instead.
