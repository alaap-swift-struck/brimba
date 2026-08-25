# Story checks out — round 2 (default + `--foundation`) — Brimba · 2026-08-25
SCORE: 68/100   (round 1: 71/100 · previous full run: 98, 2026-08-12)

**Measured against `HEAD` = `fe7d683` on branch `review-campaign`.** Other agents'
round-2 repairs began landing in the working tree during this review (`RULES.md`,
`CLAUDE.md`, `shared/rules/registry.ts`, `web/test/rules.test.ts`,
`workers/gateway/src/index.ts` and two deleted `web/lib` files are all dirty as I
write). Every finding below was re-verified against the tree after it moved; none of
my subjects was touched. The one thing that *did* move is recorded, unscored, under
**OBSERVED LIVE** — and it is the single most useful thing in this report.

## DELTA

Round 1: 71/100 → Round 2: **68/100**

| # | Criterion | R1 | R2 | Why it moved |
|---|---|---|---|---|
| 1 | Docs do not contradict each other | 22 | **16** | ▲+8 from the law-range repair (H0 high→medium), ▼−14 from two defects round 1 missed (`M-new-2` ops-count, `M-new-4` BUILD-A-MODULE R13–R22). Net **−6**. |
| 2 | Locked decisions still stand | 93 | 93 | No change. All 31 `LOCKED` markers re-cross-read; nothing this round violates one. |
| 3 | Stated guarantees hold end to end | 60 | **46** | ▲+8 auth gained R10 coverage (H1 high→medium). ▼−15 **caused by security_sentry's repair** (`H8`). ▼−7 from a defect round 1 missed (`M-new-1`). Net **−14**. |
| 4 | Depth proportional to reach | 90 | **88** | ▼−2: `shared/test/source.ts`, the round's most load-bearing new seam, is in zero documents. **Caused by this round's repair.** |
| 5 | Every flow says what happens when it fails | 63 | **71** | ▲+8: BOOTSTRAP now names team `0008` and it is derived from disk (H3 high→medium). H4 stays high — the new ops step **cannot run** (`H4′`). |
| 6 | Edge cases addressed | 93 | 93 | No change (M13 open). |
| 7 | Nothing is stale | 58 | 58 | ▲+7 M2 closed (BOOTSTRAP stands up the ops DB). ▼−7 `M-new-3`. Exact wash. |
| 8 | Every reference resolves | 93 | **90** | ▼−3: `registry-integrity`'s new file loop scans generated review reports at the repo root (`m-new-1`). **Caused by this round's repair.** |
| 9 | One name per concept | 86 | 86 | No change; the glossary was not touched. |
| 10 | Every capability has an owning document · GATE | 69 | **57** | ▼−12: a **second** capability is now owned by two documents that disagree (BOOTSTRAP vs OPERATIONS on the operations database) and OPERATIONS joined the stale-owner list. **Both caused by this round's repair.** |
| 11 | A newcomer can navigate it | 92 | 92 | No change. |

**Four criteria FELL. Three of the four falls were caused by repairs, not by my
probe.** The decomposition, computed below, is:

```
71  →  74   the six repair commits, measured against ROUND 1's finding set
74  →  71   this round's own regressions (H8, M-new-3, the second doc-disagreement)
71  →  68   defects that were there in round 1 and round 1 missed (M-new-1/2/4)
```

**Verdict: the story still does not check out — 36 holes (6 high, 19 medium, 11
minor) — and the one that matters most is that the day-zero runbook's brand-new
"do not skip this" step cannot apply the migrations it names, while the check
written to pin it reports green.**

---

## What the repair round actually closed

Confirmed by reading, not by report:

| Round-1 finding | Status | Evidence |
|---|---|---|
| **H0** five law ranges | **half closed** | All five now read `R1–R25` (`README.md:78`, `CLAUDE.md:42`, `PLATFORMS.md:91`+`:95`, `BASE-MANUAL.md:387`), and `registry-integrity` (`web/test/rules.test.ts:68-74`) scans every root `.md` for `R1–Rn` against the registry's top id. The **content** did not move — see H0′. |
| **M2** BOOTSTRAP never creates the ops DB | **closed** | `BOOTSTRAP.md:104-124`, a headed section with the reason written out. |
| **H3** team `0008` in no runbook | **half closed** | `BOOTSTRAP.md:137` now says `0001`…`0008`, derived from `team-schema.ts`. `OPERATIONS.md:45` still enumerates `0004…0006` and `:211-212` still stops at `0007`. |
| **H4** `db/ops/0002` in no runbook | **half closed, new fault** | BOOTSTRAP names `db/ops/0001…0002` — with a command that cannot apply them (H4′). `OPERATIONS.md:257` still applies `0001` only; `INVENTORY.md:58` still lists `0001` only. |
| **H1** R10 covers 4 of 7 workers | **improved to 5 of 7** | `workers/auth/test/gating-seam.test.ts` now exists — the impersonation door is covered. realtime (`POST /publish`) and gateway still are not, still with no exemption datum. |
| **m5** error-seam misses mcp | **code half closed** | `workers/data-ops/test/error-seam.test.ts` now derives its worker list from `readdirSync(workers/)` with a tripwire and reads `catchBodies`. `ERROR-HANDLING.md:51-55` still lists four sources. |
| **MCP.md** exclusion table | **closed, well** | Three false rows removed; `workers/mcp/test/catalog.test.ts:110-139` derives from `MCP_TOOLS`, and — unusually for this repo — **carries its own tripwire** (`"was found at all"`). This is the best check added this round. |
| **H2** `fetch-timeout` + `cron-records` blind | **NOT closed** | Byte-identical. `web/test/rules.test.ts:157-195` and `:267-280`; no diff hunk touches either. |
| **H5** 65 % vs 80 % | **NOT closed (owner-deferred, as agreed)** | See H5 below — with one detail round 1 did not surface. |
| **H6, H7, M1, M3–M13, m1–m4, m6–m10** | **NOT closed** | `RULES.md`, `ARCHITECTURE.md`, `OPERATIONS.md`, `DATA-MODEL.md`, `ERROR-HANDLING.md`, `CHANGELOG.md`, `BASE-IMPROVEMENTS.md`, `INVENTORY.md`, `CACHING.md`, `SCALING.md`, `ROADMAP.md`, `EDGE-CASES.md`, `CONTRIBUTING.md` are all **unchanged since `8751e30`** (`git diff --stat`). |

---

## THE ANSWER TO THE QUESTION YOU ASKED

> *Round 1's insight was that `registry-integrity` reading exactly ONE file is why
> `RULES.md` was the one list that stayed right. Look for the SAME shape elsewhere.*

**The shape is everywhere, and it is now measurable.** Exactly **three documents in
the 33-document corpus are read by any test**:

```
$ grep -rhoE 'join\([^)]*"[A-Za-z-]+\.md"\)' --include="*.test.ts" . | sort | uniq -c
   1 join(ROOT, "BOOTSTRAP.md")
   1 join(ROOT, "RULES.md")
   1 join(__dirname, "..", "..", "..", "MCP.md")
```

Plus `registry-integrity`'s new loop, which reads every root `.md` — for exactly
one regex, `R1–Rn`. Here is the full inventory of structural facts this corpus
states in more than one place, and which of them a commit can break silently:

| Fact | Stated in | Machine-checked? | Drifted **today**? |
|---|---|---|---|
| The law **id set** | RULES.md table | **yes** — `registry-integrity` assertion 1 | no |
| The law **range** `R1–Rn` | README, CLAUDE, PLATFORMS ×2, BASE-MANUAL | **yes** — assertion 2 (new) | no |
| The law **enumeration** (a table, a list, a walk-through) | BASE-MANUAL §4 table, README:78, CLAUDE:42, BUILD-A-MODULE:639 | **NO** | **yes — 4 places** |
| Each law's **enforced-by** column | RULES.md, `rules.test.ts` comments | **NO** | **yes** — R10 names 3 suites; 5 exist |
| A `checkId` names a test **that exists** | `shared/rules/registry.ts` | **NO** — a hand-written `Set` | latent |
| **core** migration count | BOOTSTRAP ×2 | **yes** (one of the two occurrences) | no |
| **team** migration count | BOOTSTRAP, OPERATIONS | **yes** (BOOTSTRAP only) | **yes** — OPERATIONS |
| **ops** migration count | BOOTSTRAP, OPERATIONS, INVENTORY | **NO** — the check asserts only `db/ops` is non-empty | **yes — all three disagree** |
| MCP **exclusion** table | MCP.md | **yes** (new) | no |
| **worker count = 7** | ~20 places | **NO** | no |
| **R2 bucket set** | INVENTORY, BOOTSTRAP, OPERATIONS | **NO** | **yes** — INVENTORY has 2 of 3 |
| **DB size-alarm threshold** | 6 doc places + 2 code comments | **NO** | **yes — 65 vs 80** |
| **test count** | README:181, CONTRIBUTING:25 | **NO** | **yes — 518 vs 583** |
| workers that **record errors** | ERROR-HANDLING:51-55 | test half yes (derived, new); **doc half NO** | **yes** — 4 of 7 named |
| workers that bind **OPS** | BOOTSTRAP ("five"), OPERATIONS (names 5) | **NO** | no |
| **deploy order** | CLAUDE, OPERATIONS, root scripts | **NO** | no |
| the read **caps** (1000/10000/500) | CONVENTIONS:761 | **NO** | no |

**4 of 17 have a machine-checked source. 7 of the remaining 13 are wrong right
now.** That is the general finding, and it is bigger than any individual hole
below: the repair pass proved the mechanism works (five ranges reconciled and they
stayed reconciled), and then used it on one fact pattern out of seventeen.

Two instances deserve naming because they are the *same shape inside the very
checks written this round*:

1. **`runbook-migrations-current` derives two of three counts.** `web/test/rules.test.ts:815-829`
   computes `core` from `readdirSync("db/core")` and `team` from `team-schema.ts`
   and pins each to an exact string in BOOTSTRAP. For **ops** it asserts
   `expect(doc).toMatch(/ops/i)` — a substring with 25 incidental matches in that
   file — and `expect(ops).toBeGreaterThan(0)`, which is a fact about the disk, not
   about the document. A third ops migration lands and BOOTSTRAP, OPERATIONS and
   INVENTORY all go stale with the build green. It is the one count that just
   caused a high finding, and it is the one left unpinned.
2. **`every enforced law has a known check` compares a list to a list.**
   `web/test/rules.test.ts:1031-1067`: `known` is a literal `Set` of 25 strings, and
   the assertion is that each registry `checkId` is a member of it. **Nothing
   asserts a test of that name exists.** The keystone claim of the whole safety net
   — *"you cannot add a Law without its check"* (`BASE-MANUAL.md:418-421`,
   `CLAUDE.md:39`) — is verified against a hand-written list, which is precisely the
   anti-pattern `shared/test/source.ts`'s own header condemns: *"a file list
   hardcoded in the test… does not fail when it is wrong; it passes, and says
   everything is covered."* Its comment is already stale by two suites.

---

## Docs in scope (33) — unchanged from round 1

`AGENT-MODULES-PLAN` · `AGENTIC-IMPORT` · `AGENTS` · `ARCHITECTURE` ·
`BASE-IMPROVEMENTS` · `BASE-MANUAL` · `BOOTSTRAP` · `BUILD-A-MODULE` · `CACHING` ·
`CLAUDE` · `CONCURRENCY` · `CONTRIBUTING` · `CONVENTIONS` · `DATA-MODEL` ·
`DURABLE-OBJECTS` · `EDGE-CASES` · `ERROR-HANDLING` · `INVENTORY` · `MCP` ·
`OPERATIONS` · `PLATFORMS` · `README` · `ROADMAP` · `RULES` · `SCALING` ·
`SCREEN-ENGINE-PLAN` · `SEARCH` · `SECRETS` · `SWIFT-STRUCK-WAY` ·
`UI-CONVENTIONS` · `UI-GAPS` · `mcp-quickstart` · `../swift-struck-ui/UI-RULES.md`

89,692 words (was 89,431). `CHANGELOG.md` excluded by the probe, read anyway and
cited. Seven `*-review.md` / `*-report.md` files also sit at the repo root; the
probe excludes them — `registry-integrity`'s new loop does not (see `m-new-1`).

**Probe hits rejected after reading the source** (same four as round 1; recorded so
the next run does not re-raise them): the `workers = 12 / 25 / 6` conflict is
`grep -A n` flags in BASE-IMPROVEMENTS shell snippets; the three `note-detail.tsx` /
`lib/notes.ts` / `routes/notes.ts` paths are the illustrative Notes example;
`UI-RULES.md` resolves to the sibling library; the 25 "explained nowhere" concepts
have a home in `BASE-MANUAL` §2.5.

---

## Arithmetic

`DEFECT = clamp(0,100, 100 − Σ penalties)`, critical 30 · high 15 · medium 7 · minor 3.
`COVERAGE = sum of points earned.` `total = Σ(criterion × weight) ÷ 100.`

| # | Criterion | Method | Penalties / points counted | Score | Weight | Product |
|---|---|---|---|---|---|---|
| 1 | Docs do not contradict each other | defect | 2 high (30: H5, H6) + 6 medium (42: H0′, M3, M9, M11, M-new-2, M-new-4) + 4 minor (12: m3, m4, m7, m8) = 84 | **16** | 14 | 224 |
| 2 | Locked decisions still stand | defect | 1 medium (7: M12) | **93** | 13 | 1209 |
| 3 | Stated guarantees hold end to end | defect | 2 high (30: H2, H8) + 3 medium (21: H1′, M-new-1, M1) + 1 minor (3: m6) = 54 | **46** | 12 | 552 |
| 4 | Depth proportional to reach | coverage | 36 + 19 + 15 + 10 + 8 | **88** | 10 | 880 |
| 5 | Every flow says what happens when it fails | defect | 1 high (15: H4′) + 2 medium (14: H3′, M7) = 29 | **71** | 9 | 639 |
| 6 | Edge cases addressed | defect | 1 medium (7: M13) | **93** | 9 | 837 |
| 7 | Nothing is stale | defect | 1 high (15: H7) + 3 medium (21: M5, M10, M-new-3) + 2 minor (6: m2, m5) = 42 | **58** | 8 | 464 |
| 8 | Every reference resolves | defect | 1 medium (7: m1) + 1 minor (3: m-new-1) = 10 | **90** | 6 | 540 |
| 9 | One name per concept | coverage | 36 + 18 + 20 + 12 | **86** | 6 | 516 |
| 10 | Every capability has an owning document | coverage | 38 + 4 + 4 + 11 | **57** | 8 | 456 |
| 11 | A newcomer can navigate it | coverage | 26 + 25 + 20 + 15 + 6 | **92** | 5 | 460 |

```
224 + 1209 + 552 + 880 + 639 + 837 + 464 + 540 + 516 + 456 + 460 = 6777
6777 ÷ 100 = 67.77 → 68
```

**Criterion 10 is 57, above the gate of 50, so no cap applies.** Uncapped = capped = 68.

Every penalty maps to exactly one finding id; no finding is counted twice. Where a
finding spans two criteria it is penalised under the one named in its heading. Two
findings (M6, and the six-seam §2.5 gap it names) are scored inside criterion 4's
coverage table rather than as defect penalties, exactly as in round 1.

**36 findings, 6 high · 19 medium · 11 minor.** Round 1: 31 findings, 8 high ·
13 medium · 10 minor.

### The three-step decomposition, shown

Same rubric, same weights, three snapshots.

**(a) Repairs only** — round 1's finding set, re-severitied against the repaired corpus:
crit 1 → 30 (H0 15→7) · 3 → 68 (H1 15→7) · 5 → 71 (H3 15→7) · 7 → 65 (M2 closed) ·
all others at their round-1 value.
```
420 + 1209 + 816 + 900 + 639 + 837 + 520 + 558 + 516 + 552 + 460 = 7427 → 74
```

**(b) Plus this round's own regressions** — H8 (crit 3 −15), M-new-3 (crit 7 −7),
`shared/test/source.ts` undocumented (crit 4 −2), m-new-1 (crit 8 −3), the second
doc-disagreement + OPERATIONS joining the stale-owner list (crit 10 69 → 57):
```
420 + 1209 + 636 + 880 + 639 + 837 + 464 + 540 + 516 + 456 + 460 = 7057 → 71
```

**(c) Plus defects round 1 missed** — M-new-2 + M-new-4 (crit 1 −14), M-new-1 (crit 3 −7):
```
224 + 1209 + 552 + 880 + 639 + 837 + 464 + 540 + 516 + 456 + 460 = 6777 → 68
```

**Read it honestly: the repair pass earned +3. This round's own regressions gave
back −3. My own better probe found −3 that were there all along.**

### Coverage-criterion numerators, shown

**Criterion 4 (depth), 88/100**
- 40-pt row → **36**. Load-bearing concepts: 28 (round 1's 27 + `shared/test/source.ts`).
  Explained nowhere: 3 (`activity.verb`, `logAccountEvent`, `shared/test/source.ts`).
  `40 × 25/28 = 35.7 → 36`.
- 25-pt row → **19**. `BASE-MANUAL` §2.5 now omits **six** seams, not five: the round-1
  five (`callService`/`trace.ts`, `logActivity`, `logAccountEvent`, `bulk-doors.ts`,
  `retention.ts`) plus `shared/test/source.ts`.
- 15-pt row → **15**. The ten most-referenced concepts still have one obvious home.
- 10-pt row → **10**. `shared/glossary.ts`, R6-checked, untouched.
- 10-pt row → **8**. Unchanged: `BASE-MANUAL` §4 introduces the Laws and then tables 8 of
  25; `CLAUDE.md:42` now says R1–R25 and still never names R24 or R25 in the walk.

**Criterion 9 (terminology), 86/100** — arithmetic identical to round 1; the glossary,
`MCP.md:103` and `mcp-quickstart.md:51` are all unchanged.

**Criterion 10 (capability ownership), 57/100** — the `--foundation` matrix is the evidence.
Per-instance costs held identical to round 1 so the delta measures the corpus, not my method.
- 50-pt row → **38**. 15 capabilities: 1 with **no** owner (request tracing), **5** partial
  (was 4 — the permission spine's column (a) became partial when the
  privilege-amplification rule landed with no document, H8).
  `50 × (15 − 1 − 5×0.5)/15 = 38.3 → 38`.
- 20-pt row → **4**. Round 1 deducted 8 for one capability owned by disagreeing documents
  (the size threshold). There are now **two**: the operations database is BOOTSTRAP's
  `wrangler d1 migrations apply` over `0001…0002` versus OPERATIONS' `wrangler d1 execute
  --file` over `0001` versus INVENTORY's `0001`. `20 − 8 − 8 = 4`.
  *(Sensitivity: if the per-instance cost were proportional instead — `20 × 13/15 = 17` —
  criterion 10 reads 70 and the total reads 69. Round 1's constant is kept.)*
- 15-pt row → **4**. Round 1 deducted 2.25 per stale owning doc for four; there are now
  **five** (BASE-MANUAL §4, CHANGELOG, BASE-IMPROVEMENTS, ERROR-HANDLING, **OPERATIONS** —
  which fell behind BOOTSTRAP this round on both the ops DB and team `0008`).
  `15 − 5×2.25 = 3.75 → 4`.
- 15-pt row → **11**. auth, tenancy, errors, realtime have homes. Tracing still does not.

**Criterion 11 (navigability), 92/100** — arithmetic identical to round 1. README's map
still indexes 31 of 32 in-repo docs and never mentions `CHANGELOG.md`; the same five docs
exceed 5,000 words with no table of contents (BOOTSTRAP grew ~31 lines and stays under).

---

## `--foundation` matrix

Fifteen capabilities, enumerated from `README.md`'s doc map, `ARCHITECTURE.md`'s worker
table, `BASE-MANUAL.md` §1, `RULES.md` and `OPERATIONS.md`. **Changes from round 1 in bold.**

| Capability | (a) Documented | (b) Machine-checked | (c) Scales | (d) Reusable seam |
|---|---|---|---|---|
| Multitenancy / per-team DBs | yes | partial — no Law states tenant isolation | yes | yes (`team-schema.ts`) |
| Permission spine | **partial — the no-privilege-amplification rule is in ZERO docs, and `BASE-IMPROVEMENTS.md:110` still presents its insufficient predecessor as the closure (H8)** | **partial — R10 now covers 5 of 7 workers (auth gained a suite); realtime + gateway uncovered and unnamed (H1′)** | yes | yes (`shared/workers/gating.ts`) |
| Live sync | yes | partial — R1's stated exception list is at an address that does not contain it (M1) | yes | yes (`publishChange`) |
| Auth & sessions | yes (ARCHITECTURE §2b) | **yes — `workers/auth/test/gating-seam.test.ts` now exists; the impersonation door is covered** | yes | yes (`whoAmI`) |
| The AI agent | yes | yes (`agent-parity.test.ts`) | yes | yes (`selectModel()`) |
| Agentic import | yes | yes (`catalog-coverage.test.ts`) | yes | yes (`TargetDef`) |
| Exports | yes | yes (`export-bounds.test.ts`) | yes | yes (`exportPath`) |
| MCP surface | partial — MCP.md still owns neither of R25's machine-surface capabilities (M8) | **yes — and the exclusion table is now derived from `MCP_TOOLS` with a tripwire** | yes | yes (`tool-catalog.ts`) |
| Error store | partial — ERROR-HANDLING stale three ways (m4, m5, m3) | **partial — the worker list is now DERIVED with a tripwire; the DOC still names four of seven** | yes | yes (`recordWorkerError`) |
| **Request tracing (R11 internal)** | **NO — still no document owns it** | yes (`trace.test.ts`) | not addressed | partial (`callService` absent from §2.5) |
| Activity / audit (R25) | partial — `verb` still in zero docs (M4); `shared/workers/account-activity.ts` still in zero docs (M5) | partial | yes | yes (`logActivity`) |
| Bulk writes (R24) | yes | partial — the ordering clause is still inert; all three twins are `together` (m6) | not addressed in SCALING | yes (`bulk-doors.ts`) |
| Sharding & scaling | yes | n/a | yes | yes (`sharding.ts`) |
| Screen engine | yes | yes | yes | yes (`screens.ts`) |
| Ship pipeline | **partial — BOOTSTRAP repaired and pinned; its ops command cannot run (H4′), and OPERATIONS + INVENTORY did not follow (H3′, H4′)** | **partial — `runbook-migrations-current` derives core + team, but not ops, and cannot see whether a command resolves** | yes | yes (`npm run deploy:*`) |
| **The check layer itself** *(new row — the round created it)* | **NO — `shared/test/source.ts` is in zero documents (M-new-3)** | **partial — `every enforced law has a known check` compares a hand-written list to a hand-written list (M-new-1)** | n/a | **yes (`shared/test/source.ts`) — named nowhere** |

Column (b) was verified adversarially against the test sources. The three claims that
carry weight below — `cron-records` still slicing to EOF, the `known` Set being literal,
and the OPS `d1_databases` entries carrying no `migrations_dir` — I read myself at
`web/test/rules.test.ts:267-280`, `:1031-1067` and `workers/auth/wrangler.jsonc:18,43`.

---

## Findings

### HIGH

**H4′ · failure path — the new "do not skip this" ops-database step in BOOTSTRAP cannot apply the migrations it names, and the check written to pin it cannot tell.**
`BOOTSTRAP.md:104-116` instructs:
```
cd workers/auth
npx wrangler d1 migrations apply brimba-ops-staging --env staging --remote
```
`wrangler d1 migrations apply` reads `migrations_dir` from the `d1_databases` entry for
that database. In `workers/auth/wrangler.jsonc` the **DB** entry carries
`"migrations_dir": "../../db/core"` (`:23`, `:48`); **both OPS entries carry none**
(`:18`, `:43`) — nor does any other worker's (`grep -rn '"OPS"' workers/*/wrangler.jsonc`
returns ten entries, zero with a `migrations_dir`). Absent the field, wrangler resolves
its default, `workers/auth/migrations` — **which does not exist** (`ls: No such file or
directory`). The command cannot reach `db/ops/0001…0002`.
Meanwhile `OPERATIONS.md:257` gives a mechanism that *does* resolve —
`npx wrangler d1 execute <project>-ops --remote --file ../../db/ops/0001_operations.sql` —
and applies **only `0001`**. `INVENTORY.md:58` lists only `0001`.
*The story doesn't check out because:* after the repair there is still **no runbook path
that produces an operations database with the `request_id` column**, which was the whole
of H4. `shared/workers/error-log.ts:40-56` writes `INSERT INTO error_logs (…, request_id)`
inside `catch {}`, so the environment looks perfectly healthy and records nothing.
*And the check reports green:* `web/test/rules.test.ts:826-829` asserts
`expect(doc).toMatch(/ops/i)` — 25 incidental matches in that file — and
`expect(ops).toBeGreaterThan(0)`, a fact about the disk. Neither can see a command that
does not resolve. *Verified from configuration on disk, not from a live wrangler run —
I have no cloud credentials and the campaign is read-only.* **Fix: F19.**

**H2 · invariants — `fetch-timeout` and `cron-records` are byte-identical to round 1, and the claim above them got stronger.** *(unchanged severity)*
`web/test/rules.test.ts:157-195` (`fetch-timeout`) still reads raw source via `read(file)`,
matches inside a 600-character forward window, and has **no tripwire** — `offenders` is
compared to `[]` with nothing asserting a single `await fetch(` was found.
`web/test/rules.test.ts:267-280` (`cron-records`) still does `src.slice(m.index)` — **to
end of file** — on un-stripped source, with `if (!m) continue` and no tripwire.
`git diff 8751e30..HEAD -- web/test/rules.test.ts` touches neither.
What changed is the claim: `README.md:79` and `CONVENTIONS.md:739-754` already stated
comment-stripping and a tripwire as properties the base *has*, and `shared/test/source.ts:20-23`
now adds the strongest version yet — *"a check must derive its own subject list from the
code, and must be proven to FAIL before it counts."* Two `enforced` laws do neither.
*Risk unchanged:* R12 is the law that keeps unattended work from vanishing, and its check
is satisfied by the word `recordWorkerError` appearing anywhere below the handler,
including in a comment. **Fix: F7.**

**H8 · invariants — a new security invariant of the permission spine is in zero documents, and the document that covers the area still presents its insufficient predecessor as the fix.**
*(NEW · caused by `security_sentry`'s repair, commit `3cd3e14`)*
`workers/tenancy/src/lib/roles.ts:209-256` adds a 403 `privilege_amplification`: **you may
not grant a right you do not hold yourself.** Its own comment sets out the three-call
bypass it closes (create a role → grant it everything → invite a plus-address as that role
→ accept) and notes it is reachable through the agent and through MCP as well.
`grep -rn "privilege" *.md` returns **nothing**. `ARCHITECTURE.md` §3 (LOCKED) owns the
tenancy and security rules and does not state it; `BASE-MANUAL.md` §2 owns the permission
spine and does not state it. `BASE-IMPROVEMENTS.md:110` records the **older, narrower**
guard as the closure of that finding — *"`setRolePermissions` refuses a self-grant"* —
which the new comment says *"on its own, only blocked the direct route."*
*The story doesn't check out because:* a fork owner reading the corpus learns a rule that
is now wrong, and does not learn the rule that actually governs. A reviewer reading
BASE-IMPROVEMENTS sees a closed finding whose stated mechanism was insufficient — the
exact pattern MCP.md's new paragraph was written to condemn ("*a claim and its evidence
with the same author*"). *Risk:* the next fork's role editor re-implements the weaker
guard, because that is the one that is written down. **Fix: F20.**

**H5 · consistency — the 65 % / 80 % contradiction is unchanged, and the code disagrees with itself in two places, not one.** *(deliberately deferred — owner's call)*
Code: `workers/tenancy/src/lib/sharding.ts:36` — *"65% of D1's 10 GB per-database cap"*,
with the reasoning. Same file, `:4` — *"nightly cron sizes every team database; ≥80% of
D1's 10GB cap"*. Same file, `:94` — the alarm text a human reads:
`` `D1 SIZE ALARM: … (>=80% of cap). Run the module mover.` ``
Docs saying 80 %: `ARCHITECTURE.md:27` (§1, **LOCKED**) and `:176`, `OPERATIONS.md:44`,
`BASE-MANUAL.md:528` and `:582`, `CONVENTIONS.md:174`. Doc saying 65 %: `SCALING.md:66-67`
and `:378`.
Round 1 reported six doc locations. **The detail round 1 missed: the alarm message the
operator reads at 3 a.m. is itself one of the wrong ones**, so this is not only a doc
contradiction — the running system tells an operator a threshold it is not using. The
tie-breaker does not settle it (ARCHITECTURE is master and is the stale one), so the
contradiction is the finding. *The owner's decision is narrower than it looks:*

| Option | What moves | What it costs |
|---|---|---|
| **A — 65 % is right** | five docs + `sharding.ts:4` + `sharding.ts:94`'s string | one LOCKED line in ARCHITECTURE §1 must be moved by the owner |
| **B — 80 % is right** | `sharding.ts:36` back to 80, and `SCALING.md` §3 + `:378` | contradicts `scaling_review`, which prices §3 at 65 % |

**Fix: F3 — Tier 3, unchanged.**

**H7 · currency — `CHANGELOG.md` and `BASE-IMPROVEMENTS.md` still stop at 2026-08-12, and now miss the repair round as well.** *(unchanged severity, deepened)*
`CHANGELOG.md:15` newest entry is still *"2026-08-12 — the operations database, and three
audits"*; `CHANGELOG.md:3` still says *"215 substantive commits between 2026-06-12 and
2026-08-12."* `BASE-IMPROVEMENTS.md:473` still ends at *"Scaling round 3 — 2026-08-12."*
Neither file is in `git diff --stat 8751e30..HEAD`.
Missing now: the R11/trace round, **R24**, **R25**, *and* the six commits of 2026-08-25 —
`shared/test/source.ts` and the `stripComments` defect behind it, auth's first R10
coverage, the privilege-amplification fix, the orphan-sweep fix, the five `one*` readers.
*The story doesn't check out because:* `README.md:57` sends a fork owner to
BASE-IMPROVEMENTS for *"what BREAKS for a fork already on the base"*, and both R24 and the
new gating requirements are exactly that. **Fix: F10.**

**H6 · consistency — `BASE-MANUAL.md:407`'s R8 row still states the exact anti-pattern R16 exists to forbid.** *(unchanged)*
*"R8 | Every team collection tab **derives its count from its loaded rows**"* against
`RULES.md:26` (R8: *"The NUMBER the badge shows is owned by R16"*) and `RULES.md:34` (R16:
an exact server `COUNT(*)`, earned by *"a 24,011-product catalogue advertising '1000'"*).
The repair pass edited the line 20 lines above this one and left it. **Fix: F2.**

### MEDIUM

**H0′ · consistency — the five ranges are reconciled and pinned; the law CONTENT in four of those documents did not move, and one document now contradicts itself.** *(was HIGH)*
The mechanism works and is the round's best structural win. What it does not see:
- `BASE-MANUAL.md:387` now says *"the human-readable law-book (**R1–R25**)"* and
  `:397-407`, headed **"The laws today:"**, still tables exactly **R1–R8**. The repair made
  the document internally inconsistent 10 lines apart.
- `BASE-MANUAL.md:425-426` still reads: *"A natural next Law, once the tool catalogue
  stabilises, is `R9 (ai): every agent tool maps to a gated route`."* R9 has been
  `enforced` since 2026-08-04 and means something else entirely.
- `README.md:78` says `R1–R25` and its own parenthetical still enumerates only to
  *"R19 agent/MCP filter parity"* — R20–R25 are absent from the list that follows the range.
- `CLAUDE.md:42` says *"Walk R1–R25"* and the walk itself still ends at R23. R24 and R25
  are named nowhere in `CLAUDE.md`.
*Why the check cannot see it:* `web/test/rules.test.ts:71` matches `/R1\s*[–-]\s*R(\d+)/g`
only. A table, a parenthetical and a walk-through are invisible to it. **Fix: F1b.**

**H3′ · failure path — team migration `0008_activity_origin` is in BOOTSTRAP and still in no other runbook.** *(was HIGH)*
`BOOTSTRAP.md:137` now says team `0001`…`0008`, derived. `OPERATIONS.md:45` still
enumerates *"`0004_modules` … `0006_import_batches`"*, and `OPERATIONS.md:211-212` still
says *"team migration `0007_scale_indexes` is unchanged from the first pass"* — the deploy
runbook an operator actually opens during a release. `shared/workers/activity.ts:206-216`
writes `INSERT INTO activity (…, origin, before_after, verb)` inside a swallowing `catch`.
On an existing team database without `0008`, every activity write is discarded silently.
**Fix: F4.**

**H1′ · invariants — R10 now covers 5 of 7 workers, and `RULES.md`'s own enforced-by column is wrong by two suites.** *(was HIGH)*
`workers/auth/test/gating-seam.test.ts` exists — the impersonation door
(`POST /api/auth/admin/test-login`) and the three `/internal/*` doors are covered for the
first time. **Remaining:** `workers/realtime/src/index.ts:142` (`POST /publish`) and the
gateway have no suite, and `shared/rules/registry.ts` still carries no gating exemption at
all, while it carries six other exemption maps.
**And the law-book undercounts itself:** `RULES.md:28` names *"per-worker tests: tenancy,
content, data-ops"*. Five `gating-seam.test.ts` files exist (auth, content, data-ops, mcp,
tenancy). `registry-integrity` checks the law **id** column and nothing else, so the
enforced-by column is free to drift — and did, in the same commit that added the suite.
The identical three-worker enumeration also sits at `RULES.md:19` (R1, `publish-seam`),
where it happens to be right — three `publish-seam.test.ts` files exist. One string, two
laws, one of them now false, and nothing can tell them apart. **Fix: F6.**

**M-new-1 · invariants — the keystone check compares a hand-written list to a hand-written list.** *(NEW · pre-existing, round 1 missed it)*
`web/test/rules.test.ts:1031-1067`. `known` is a literal `Set` of 25 check-id strings;
the assertion is `expect(known.has(r.checkId))` for each `enforced` law. **Nothing asserts
a test of that name exists on disk.** A law can name `checkId: "x"`, someone adds `"x"` to
the Set, and the build is green with no check behind the law.
`BASE-MANUAL.md:418-421` and `CLAUDE.md:39` both state the opposite as the base's
foundational property. The Set's own comment — *"the 3 per-worker gating-seam suites + the
mcp identity-gate suite"* — is already stale by two. This is the anti-pattern
`shared/test/source.ts:14-19` was written to end. **Fix: F21.**

**M-new-2 · consistency — the ops migration count is stated three ways, and it is the one migration count the new check does not derive.** *(NEW · pre-existing)*
BOOTSTRAP `0001…0002` · `OPERATIONS.md:257` `0001` only · `INVENTORY.md:58` `0001` only.
`runbook-migrations-current` derives core from `db/core` and team from `team-schema.ts`
and pins each to an exact string; for ops it asserts only `/ops/i` and `ops > 0`.
Additionally BOOTSTRAP states the core count **twice** — `:96` as plain `(0001…0017)` and
`:129` as `` `0001`–`0017` `` — and only the backticked one is pinned, so the two can
diverge inside one file with the build green.
*The pattern already exists three feet away:* `scripts/build-blueprint.mjs:47` computes
`OPS_MIGRATIONS = sqlCount("ops")` from disk, so the generated architecture blueprint
self-heals on the very count the three runbooks get wrong. **Fix: F19.**

**M-new-3 · currency — `shared/test/source.ts` is in zero documents.** *(NEW · caused by this round's repair)*
The round's most load-bearing new seam: one correct source reader (`stripComments`,
`declarationBody`, `namedBody`, `catchBodies`, `serverSources`, `workerSources`,
`stringLiterals`, `componentFiles`) that eight Law checks now read through, created because
`stripComments` was itself broken in a way that made every Law check read less than it
believed. `grep -rn "shared/test/source" *.md` returns **0**.
`CONVENTIONS.md:739-754` — the section that owns "writing a check that can fail" — still
describes comment-stripping, call-matching and tripwires as things each check does for
itself, with no mention that there is now one module and it must be imported.
`BASE-MANUAL.md` §2.5, the seam index, does not list it. **Fix: F22.**

**M-new-4 · consistency — `BUILD-A-MODULE.md`'s hardening checklist stops three laws short.** *(NEW · pre-existing)*
`BUILD-A-MODULE.md:639`: *"## The hardening checklist (R13–R22 — a new module must satisfy
these) — Beyond the golden path, a module that ships without these turns the build red."*
R23 (a mutation door returns the affected row), R24 (a bulk twin declared) and R25
(activity origin) each bind a new module and each turn the build red. This is the
end-to-end checklist `CLAUDE.md` and `README.md` send a module author to.
The new range check matches `R1–Rn` only, so a **scoped** range is invisible to it.
**Fix: F1b.**

**M1 · invariants + references — three documents still send the reader to "CACHING rule 5" for R1's reviewed exceptions.** *(unchanged)*
`CLAUDE.md:14`, `RULES.md:19`, `ARCHITECTURE.md:243`. `CACHING.md:96` is
*"### 5 · Identity scope — your changes follow YOU everywhere."* The nearest real list is
rule 4 and it names a different set. **Fix: F8.**

**M3 · consistency — `DATA-MODEL.md` still contradicts itself inside two sections.** *(unchanged)*
`:157` *"MOVED to the OPERATIONS database 2026-08-18"* against `:187-188` *"Lives in the
global core DB beside the quota tables it explains."* Same pattern at `:201` / `:209`.
**Fix: F9.**

**M4 · coverage — `activity.verb` is still in no document.** *(unchanged)*
`grep -c verb DATA-MODEL.md` → **0**. `RULES.md:43` (R25) still enumerates the row as
WHO / WHAT / WHEN / `origin` / `before_after` and omits it, while
`workers/tenancy/src/team-schema.ts:346` adds it with `idx_activity_verb`. The repair round
**wrote three more verbs** (`roles.ts:367` among them), so the column is now more load-bearing
than when round 1 filed this. **Fix: F9.**

**M5 · currency + coverage — `shared/workers/account-activity.ts` is still in zero documents.** *(unchanged)*
`DATA-MODEL.md:104` still credits `workers/auth/src/lib/account-activity.ts`. **Fix: F9.**

**M6 · depth — `BASE-MANUAL.md` §2.5 is now stale by six seams.** *(deepened)*
The round-1 five plus `shared/test/source.ts`. **Fix: F11.**

**M7 · failure path — `migrate-teams` still has no documented failure path.** *(unchanged)*
`BOOTSTRAP.md:216` / `BUILD-A-MODULE.md:111` describe the robot and stop.
`workers/tenancy/src/routes/admin.ts:23-48` is a serial uncapped loop with no cursor and no
per-team error handling; it **is** safe to re-run and no document says so. **Fix: F12.**

**M8 · coverage — `MCP.md` still owns neither of R25's machine-surface capabilities.** *(unchanged)*
`MCP.md:225-226` still says a write *"stamps an audit block (who + when)"*, with no mention
of `origin: "mcp"`; §5 still does not mention that creating or revoking a personal access
token lands in the person's identity log. The repair touched only the exclusion table.
**Fix: F16.**

**M9 · consistency — `INVENTORY.md:40` still lists two buckets; three exist.** *(unchanged)*
`brimba-help-media` is bound at `workers/content/wrangler.jsonc` and created by both
BOOTSTRAP and OPERATIONS. **Fix: F13.**

**M10 · currency — `/media/*` is still "FLAGGED 2026-07-02, owner to confirm" in the LOCKED master and "decided" in two other documents.** *(unchanged)* `ARCHITECTURE.md:301`. **Fix: F13.**

**M11 · consistency — `ROADMAP.md:192-194`'s live "Remaining" list still contradicts enforced Law R2.** *(unchanged)* **Fix: F13.**

**M12 · locked decision — `ARCHITECTURE.md:402-407` (LOCKED 2026-06-18) still names a canonical home that does not contain the rule.** *(unchanged)* The library `UI-RULES.md` has three rules and the mobile-stacking rule is not one. **Fix: F15 — Tier 3, different repo.**

**M13 · edge case — "invite someone to a role that is then deactivated" is still addressed nowhere.** *(unchanged)* **Fix: F14.**

### MINOR

**m1 · references — `README.md:68-70` still tells the reader to `cp -R skills/new-app ~/.claude/skills/new-app` from a directory commit `8751e30` deleted.** *(unchanged; the only pointer to the one-command bootstrap)* **Fix: F13.**

**m2 · currency — "518 tests" is now wrong by 65, not 50.** *(deepened)*
`README.md:181` and `CONTRIBUTING.md:25`. Counting line-initial `it(` / `test(` across 71
`*.test.ts` files gives **583** today (round 1's same method gave 568; five sites generate
further cases in loops, so runtime is higher still). The repair round added test cases and
neither document moved — the same shape as every other finding here. **Fix: F13.**

**m3 · consistency — the operations-database move is still dated 2026-08-12 in three docs and 2026-08-18 in five.** *(unchanged)* **Fix: F13.**

**m4 · consistency — `ERROR-HANDLING.md:32` (`recordWorkerError(env.DB, …)`) still contradicts `:45` (`opsDatabase(env)`) thirteen lines apart.** *(unchanged)* **Fix: F9.**

**m5 · currency — `ERROR-HANDLING.md:51-55` still omits `request_id` and still lists four sources.** *(doc half unchanged; the TEST half is fixed)*
`workers/data-ops/test/error-seam.test.ts` now derives its worker list from disk with a
tripwire and asserts recording happens **inside a catch**, and it names the gateway's
`/internal/log-error` route as a second sanctioned path. **None of that is in any
document**, so the doc is now behind the code in a second way. **Fix: F9.**

**m6 · invariants — R24's ordering clause is still inert.** *(unchanged)*
All three doors in `shared/workers/bulk-doors.ts:60-75` are `ordering: "together"`, so
`ORDERED_TWINS` (`:112-114`) is empty and the loop never executes. **Fix: F18.**

**m7 · consistency — `SCALING.md:61` is still headed "The three relief valves" and lists four.** *(unchanged)* **Fix: F13.**

**m8 · consistency — `RULES.md:28` (R10) still omits the mcp suite, and now omits auth's too.** *(deepened — see H1′.)* **Fix: F6.**

**m9 · navigability — `CHANGELOG.md` is still not indexed by README's document map.** *(unchanged)* **Fix: F13.**

**m10 · terminology — user-facing copy still calls a team a "workspace" at `MCP.md:103` and `mcp-quickstart.md:51`.** *(unchanged; the repair edited MCP.md 130 lines below it)* **Fix: F13.**

**m-new-1 · references — `registry-integrity`'s new loop scans generated review reports.** *(NEW · caused by this round's repair)*
`web/test/rules.test.ts:70` iterates `readdirSync(ROOT).filter(f => f.endsWith(".md"))`.
Seven `*-review.md` / `*-report.md` files sit at the repo root (`story-review.md`,
`security-report.md`, `architecture-review.md`, `lean-mean-report.md`,
`activity-log-review.md`, `interface-lessness-report.md`, `ocean-review.md`), and the
`story_checks_out_review` skill writes `story-review.md` **to the root** by default. A
report that quotes a historical range — *"README said R1–R19"*, which round 1's report
does — turns `npm run check` red on a document nobody may edit. Green today; a scoping
predicate (`db/`, `*.md` minus reports, or an explicit doc list) removes the trap.
**Fix: F1c.**

### OBSERVED LIVE, NOT SCORED — a cross-review regression happening in the working tree as I write

**This is not in the scored total.** Round 2's subject is `HEAD`
(`fe7d683`), where every reference below resolves. But `git status` changed under
me mid-review, and what it shows is this review's thesis reproducing itself inside
the campaign, in real time — so it is recorded here for the serializing session.

**`realtime_review`'s round-2 repair deletes two seams and four documents still
point at them.**

```
 D web/lib/live-bus.ts            (present at HEAD, deleted in the working tree)
 D web/lib/use-live-refetch.ts    (present at HEAD, deleted in the working tree)
?? web/lib/use-screen-data.ts     (its replacement)
```

`RULES.md` R15, `shared/rules/registry.ts` R15 and `CLAUDE.md`'s R15 bullet **were
all updated** in the same working tree — correctly, and with a good reason written
out. Still pointing at the deleted files:

| Location | What it says | Cost if it lands as-is |
|---|---|---|
| `BASE-MANUAL.md:257` | a §2.5 seam-index row: `` `useLiveRefetch` \| `web/lib/use-live-refetch.ts` `` | the canonical seam index names a file that is gone — the exact fault M6 already files against §2.5 |
| `CACHING.md:84-85` | *"…into a bus (`web/lib/live-bus.ts`) and each paged screen re-pulls its current page via `useLiveRefetch`"* | the only prose description of how live refresh works describes a mechanism that no longer exists |
| `BUILD-A-MODULE.md:656` | instructs a module author to use `useLiveRefetch` | a new module built from the golden path imports a deleted hook |
| `BASE-IMPROVEMENTS.md:337` | historical record of the R15 bug | fine — it is dated history, not instruction |

**Why this matters more than its three points.** The agent doing the repair updated
the law-book, the registry and `CLAUDE.md` — the three places a machine or a
checklist would point at — and three other documents drifted in the same edit. That
is round 1's finding stated as a mechanism rather than an observation: **a document
gets updated when something checks it or when a convention names it, and otherwise
it does not.** `RULES.md` is checked. `CACHING.md`, `BASE-MANUAL.md` §2.5 and
`BUILD-A-MODULE.md` are not, and all three are wrong within minutes of the change.

*Projected cost if committed unchanged:* criterion 8 → 76 (two further mediums, one
minor), total **67**. *Recommended:* the serializing session closes these three
references in the same commit. **Fix: F23.**

*(Also observed in the same working tree, and independently confirming the same
thesis from another reviewer's seat — a new comment in `web/test/rules.test.ts`:
"it survived the pass that moved eight other checks onto the shared reader, which is
its own lesson: fixing the readers does not fix the SCOPES." Four other checks were
edited concurrently; none of them is a subject of any finding above, which I
re-verified after the tree moved.)*

### Clean results, recorded as results

- **No locked decision is silently violated.** All 31 `LOCKED` markers re-cross-read
  against the six repair commits. `ARCHITECTURE.md` §3 (tenancy & security) says nothing
  about who may grant which right, so H8's new rule **completes** the lock rather than
  contradicting it. The one deduction (M12) is still a lock pointing at empty canon.
- **The MCP exclusion-table check is the best thing added this round.** It derives from
  `MCP_TOOLS`, matches path fragments rather than words, and — alone among the checks
  added — **carries its own tripwire** (`it("was found at all")`). It is the template the
  other new checks should have followed.
- **`error-seam.test.ts` is the second best.** A hardcoded four-worker list replaced by
  `readdirSync` with a tripwire, plus `catchBodies` so a grep of the whole file can no
  longer answer for a catch that records nothing. Proven by sabotage, and it says so.
- **Worker count is still 7 in all 20 places it appears.** No drift.
- **Criterion 6 remains strong.** Last admin, sole admin, empty team, concurrent
  demotion, retried request, stale save, NULL `updated_at`, deliberate `0` in config,
  teamless user, user in two teams, the 10,000th member, the cold-start deploy cycle and
  a stale browser tab are each addressed with the failure named first.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F19** Give the OPS `d1_databases` entries `"migrations_dir": "../../db/ops"` in all five workers (10 entries), OR change BOOTSTRAP to `d1 execute --file` for both ops migrations; then reconcile OPERATIONS + INVENTORY to `0001…0002`; extend `runbook-migrations-current` to derive the OPS count from `db/ops` and pin it, and to pin BOTH core statements in BOOTSTRAP | `workers/{auth,tenancy,content,data-ops,mcp}/wrangler.jsonc`, `BOOTSTRAP.md`, `OPERATIONS.md`, `INVENTORY.md`, `web/test/rules.test.ts` | ADDS one field ×10 + ~6 lines of check; REMOVES a command that cannot run and two stale counts | **base_fork_review / mac_fell_in_the_ocean** — helps both directly; a fork currently gets a silent, error-blind environment. **lean_mean** — ~6 more lines in an already-long test file. **architecture** — adding `migrations_dir` to a binding whose worker never migrates it is arguably config the worker does not own; the `d1 execute` variant avoids that and costs one doc edit instead. Prefer the `d1 execute` variant if architecture objects. |
| **F20** Write the no-privilege-amplification rule into `ARCHITECTURE.md` §3 (LOCKED — owner) or `BASE-MANUAL.md` §2, and correct `BASE-IMPROVEMENTS.md:110` to say the self-grant guard was necessary and not sufficient | `BASE-MANUAL.md`, `BASE-IMPROVEMENTS.md`, optionally `ARCHITECTURE.md` (**LOCKED**) | ADDS ~8 lines; REMOVES a superseded claim | **security_sentry** — positive: writing the rule down is what stops the next fork reimplementing the weaker one. None negative. Prefer BASE-MANUAL §2 so no locked section is touched. |
| **F21** Derive `known` from the tests on disk: parse this file's own `it("<id>:` names + glob `workers/*/test/*-seam.test.ts`, with a tripwire | `web/test/rules.test.ts` | ADDS ~10 lines; REMOVES a 25-line literal Set | **lean_mean** — more test code. **speed/spend** — none (a directory read at test time). Without it, "a law cannot exist without its check" is a claim about a list. |
| **F22** Name `shared/test/source.ts` in `CONVENTIONS.md` §"writing a check that can fail" and add it to `BASE-MANUAL.md` §2.5 | `CONVENTIONS.md`, `BASE-MANUAL.md` | ADDS ~10 lines | none — prose only, and it is the seam every future check must import |
| **F1b** Rewrite `BASE-MANUAL.md` §4's table to all 25 laws (or make it point at RULES.md instead of restating it), delete the "natural next Law R9" paragraph, extend `README.md:78`'s parenthetical to R25, extend `CLAUDE.md:42`'s walk with R24+R25, and correct `BUILD-A-MODULE.md:639` to R13–R25 | `BASE-MANUAL.md`, `README.md`, `CLAUDE.md`, `BUILD-A-MODULE.md` | REMOVES a 17-law gap and a false "future work" claim | **lean_mean** — a 25-row table in BASE-MANUAL duplicates RULES.md; **pointing** rather than restating is the leaner fix and removes the drift permanently. Recommend pointing. |
| **F1c** Scope `registry-integrity`'s file loop away from generated reports | `web/test/rules.test.ts` | ADDS one filter predicate | none — it removes a trap, adds nothing |
| **F7** Give `fetch-timeout` and `cron-records` `stripComments` + a tripwire; bound `cron-records` to the handler declaration via `declarationBody` | `web/test/rules.test.ts` | ADDS ~8 lines; REMOVES an EOF slice | **lean_mean** — marginally more test code. Without it R11 and R12 are claims, not laws. `shared/test/source.ts` already exports everything needed. |
| **F3** Resolve 65 % vs 80 % — **Tier 3, owner** | `ARCHITECTURE.md` (**LOCKED**), `OPERATIONS.md`, `BASE-MANUAL.md`, `CONVENTIONS.md`, `workers/tenancy/src/lib/sharding.ts:4` and `:94` | REMOVES a stale number from 6 doc places and 2 code places | **scaling_review** — option A aligns with its §3; option B contradicts it. The alarm-string half (`sharding.ts:94`) is unambiguous either way and can go first. |
| **F4** Add team `0008` to `OPERATIONS.md` §45 and §211 with its silent-failure consequence | `OPERATIONS.md` | ADDS ~4 lines | none — it keeps the audit trail alive on the next release |
| **F6** Name realtime + gateway as R10 exceptions **as data** in `shared/rules/registry.ts`, and correct `RULES.md:28`'s enforced-by column to all five suites | `shared/rules/registry.ts`, `RULES.md` | ADDS an exemption map (~8 lines); REMOVES a false coverage claim | **lean_mean** — a sixth exemption map. **security_sentry** — documenting the gap does not close it; a realtime suite would. Recommend the exemption data now, a realtime suite when `/publish` gains a second route. |
| **F23** In the same commit that lands `realtime_review`'s R15 repair, repoint `BASE-MANUAL.md:257`, `CACHING.md:84-85` and `BUILD-A-MODULE.md:656` from `use-live-refetch.ts` / `live-bus.ts` to `use-screen-data.ts` | `BASE-MANUAL.md`, `CACHING.md`, `BUILD-A-MODULE.md` | REMOVES three references to deleted files | **realtime_review** — none; it is that review's own repair, finished. This row exists only because the doc half was not in its diff. |
| **F2, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18** | as round 1 — unchanged in scope and in cross-review impact | — | see `reviews/story.md` FIX IMPACT MAP; none of these fixes' impacts changed |

**The one fix that stops all of this recurring is not on this list as a doc edit.**
It is the generalisation of what the repair round already proved: extend the
`RULES.md` / `BOOTSTRAP.md` / `MCP.md` pattern to the other thirteen multi-doc facts
in the table above, starting with the seven that are wrong today. Every one is a
`toContain` against a value derived from disk, in the file that already does it.

---

## CEILING

**95 is reachable by changing code — and the repair round proved the mechanism. It
is not reachable by changing documents alone, and it will not hold.**

Fixing F19, F20, F21, F22, F1b, F1c, F7, F4, F6 and the unchanged round-1 set
recovers, per criterion:
1 → 97 · 2 → 93 (F15 gated) · 3 → 97 · 4 → 95 · 5 → 100 · 6 → 100 · 7 → 97 ·
8 → 100 · 9 → 95 · 10 → 90 · 11 → 96.

```
1358 + 1209 + 1164 + 950 + 900 + 900 + 776 + 600 + 570 + 720 + 480 = 9627
9627 ÷ 100 = 96
```

Three items are capped by something a commit in this repository cannot fix:

1. **F3 and the `/media` half of F13 touch LOCKED sections of `ARCHITECTURE.md`.**
   Round 1 said this and it is still true; the round-2 brief confirms it was left
   deliberately. Until the owner moves the number, criterion 1 carries a 15-point
   high and cannot exceed 85. **This is now the single largest capped item, worth
   ~2.1 points of the total on its own.**
2. **F15 lives in a different repository.** `CLAUDE.md` states the library is lego
   and must never be edited from here. Criterion 2 is capped at 93 from inside this
   repo.
3. **Doc currency is checked for 4 facts out of 17, and that is still the real
   ceiling — but the ceiling moved.** Round 1's version of this paragraph said one
   document was checked and that was why one document was right. Three are now
   checked, and all three are right. **The mechanism is proven; it is the coverage
   that is missing.** Of the thirteen unchecked multi-doc facts, seven are wrong
   today — and the two that went wrong *this week* (the ops count, the enforced-by
   column) went wrong inside the very commits that were fixing the others. Without
   extending the pattern, this score decays again within one or two feature rounds
   no matter how thoroughly today's list is repaired.

**True maximum with F3 and F15 owner-gated: 94.6, which rounds to 95**
(criterion 1 held at 85 →
`1190 + 1209 + 1164 + 950 + 900 + 900 + 776 + 600 + 570 + 720 + 480 = 9459`;
`9459 ÷ 100 = 94.59`). So 95 is technically reachable without the owner touching
either locked item — but with **0.4 points of margin**, i.e. one medium finding
anywhere in the corpus puts it back under. Treating 95 as safely held requires the
owner to move the 65 %/80 % threshold. With that moved and the library absorbing
the stacking rule: **96–97**.

---

*One sentence: the story has 30 holes, three criteria fell — two of them because
other repairs landed in code with no document following — and the one that matters
most is that the day-zero runbook's brand-new "do not skip this" step cannot apply
the migrations it names, because the check written to pin it asserts that the word
"ops" appears in the file rather than that the command resolves.*
