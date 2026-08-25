# Story checks out — round 4 (default + `--foundation`) — Brimba · 2026-08-25
SCORE: 68/100   (round 1: 71 · round 2: 68 · round 3: 68 · the 2026-08-12 full run: 98)

**Measured against `HEAD = d9741c6` on branch `review-campaign`, working tree CLEAN.**
Unlike round 3, nothing moved under me. Every number below is the commit's.

Probe: `node ~/.claude/skills/story_checks_out_review/assets/probe.mjs .` → 33 documents
in scope, 92,381 words, 31 locked-decision markers. Output kept outside the repo at
`…/scratchpad/g4-story-probe.txt`. **Two probe results were rejected after reading the
source line** — `conflictingNumericClaims` reports four different worker counts (7 · 12 ·
25 · 6); the last three are `grep -c` commands quoted inside `BASE-IMPROVEMENTS.md`
(`:173`, `:234`, `:256`). The probe parsed shell output as a structural claim. There is
one worker count in this corpus and it is 7.

---

## DELTA

| # | Criterion | wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | Docs do not contradict each other | 14 | 22 | 16 | 10 | **0 ▼▼** | ▲+14 two mediums CLOSED (BOOTSTRAP's "five workers"; SCALING's 65 %). ▼−42 **three contradictions CREATED by those same repairs — two of them high — plus one converted.** Linear scale computes **−18**; clamped at 0. See below. |
| 2 | Locked decisions still stand | 13 | 93 | 93 | 93 | **93 =** | All 31 `LOCKED` markers re-cross-read. Nothing new violates one. |
| 3 | Stated guarantees hold end to end | 12 | 60 | 46 | 45 | **46 ▲** | ▲+15 **H1′ CLOSED** — `route-census-current` is now an *equality* against the file plus a >90 floor plus a per-worker presence assertion. ▼−14 two new gaps of the same class (N1, N2). Net **+1**. |
| 4 | Depth proportional to reach | 10 | 90 | 88 | 86 | **88 ▲** | **+2, the first rise on this criterion in the campaign.** `scripts/timings.mjs` arrived *with* its documentation (OPERATIONS.md §Performance budgets) — the first time a new check-layer module was born owned. |
| 5 | Every flow says what happens when it fails | 9 | 63 | 71 | 86 | **87 ▲** | +1. The three vault documents now describe the state the recovery path is actually in. |
| 6 | Edge cases addressed | 9 | 93 | 93 | 93 | **93 =** | M13 open (invite to a role that is then deactivated). |
| 7 | Nothing is stale | 8 | 58 | 58 | 59 | **72 ▲▲** | **+13 — the round's biggest gain, and it is real.** Four stale-claim clusters closed: the worker count, the threshold, UI-GAPS' four open gaps, and the vault in three of four documents. |
| 8 | Every reference resolves | 6 | 93 | 90 | 87 | **83 ▼** | ▼−4: `ROUTE-CENSUS.md` still unindexed, **and** I am adding to the denominator two dangling links in the front door that rounds 1–3 tracked as housekeeping and never priced. |
| 9 | One name per concept | 6 | 86 | 86 | 86 | **86 =** | The glossary was not touched. |
| 10 | Every capability has an owning document · **GATE** | 8 | 69 | 57 | 57 | **61 ▲** | ▲ performance budgets and the route census are both born owned. ▼ MCP.md now *owns* a capability that does not exist. Above the gate of 50 → **no cap**. |
| 11 | A newcomer can navigate it | 5 | 92 | 92 | 90 | **88 ▼** | ▼−2: the same doc-map omission plus the two dead README links. |

---

## Arithmetic

```
total = round( Σ (criterion × weight) / 100 )
```

| # | criterion | score | weight | product |
|---|---|---:|---:|---:|
| 1 | Docs do not contradict each other | 0 | 14 | 0 |
| 2 | Locked decisions still stand | 93 | 13 | 1209 |
| 3 | Stated guarantees hold end to end | 46 | 12 | 552 |
| 4 | Depth proportional to reach | 88 | 10 | 880 |
| 5 | Every flow says what happens when it fails | 87 | 9 | 783 |
| 6 | Edge cases addressed | 93 | 9 | 837 |
| 7 | Nothing is stale | 72 | 8 | 576 |
| 8 | Every reference resolves | 83 | 6 | 498 |
| 9 | One name per concept | 86 | 6 | 516 |
| 10 | Every capability has an owning document (GATE) | 61 | 8 | 488 |
| 11 | A newcomer can navigate it | 88 | 5 | 440 |
| | **weights** | | **100** | **6779** |

`0+1209 = 1209; +552 = 1761; +880 = 2641; +783 = 3424; +837 = 4261; +576 = 4837;`
`+498 = 5335; +516 = 5851; +488 = 6339; +440 = 6779.`
**6779 / 100 = 67.79 → SCORE 68.**

Gate: criterion 10 = 61 ≥ 50 → **no cap**.

Round 3's identical total, recomputed from its own published table, was **6776 → 67.76 → 68**.
**The movement across the whole round is +0.03 of a point.**

### Criterion 1 = 0 — the arithmetic, printed rather than softened

Rounds 1–3 published a linear scale on this criterion: **high = −15/+15, medium = −7/+7**
(round 3 moved it −14 for two new mediums and +8 for one high→medium downgrade). Applying
that scale unchanged:

```
10  (R3)
+7   BOOTSTRAP's "five workers" closed
+7   SCALING's 65 % closed
−15  NEW HIGH  · MCP.md's phantom tool paragraph
−15  NEW HIGH  · SCALING.md's self-contradicting threshold rationale
−7   NEW MED   · SCALING.md:378, "threshold 80% → 80%"
−7   NEW MED   · CHANGELOG.md now contradicts the three documents that were corrected
= −20  →  clamped to 0
```

**I am not adjusting the scale mid-campaign to avoid an uncomfortable number.** 0 does not
mean nothing improved — two real contradictions closed, and criterion 7 prices that gain
in full. It means the scale published in round 1 saturates here, and the honest report of
a saturated scale is the floor.

### The decomposition of the round

```
gains   +177 weighted points   crit3 +12 · crit4 +20 · crit5 +9 · crit7 +104 · crit10 +32
losses  −174 weighted points   crit1 −140 · crit8 −24 · crit11 −10
net       +3                   68 → 68
```

**The repair loop on this review is running at break-even.**

---

## THE ANSWER TO THE QUESTION YOU ASKED

> *Re-count the 17 structural facts stated in 2+ documents. Round 3 found 5 of 17 with a
> machine-checked source. Name the cheapest three to check next.*

### The count: 5 of 17. Unchanged. And the reason is worse than the number.

| # | Fact | Machine-checked? | Wrong **today**? |
|---|---|---|---|
| 1 | The law **id set** | **yes** — `registry-integrity` | no |
| 2 | The law **range** `R1–Rn` | **yes** | no — all five places read `R1–R26`; registry top id is R26 |
| 3 | The law **enumeration** | NO | **yes** — BASE-MANUAL.md:400-408's table stops at **R8 of 26**; CLAUDE.md:42's walk never names R7, R8, R11, R12, R24, R25 or R26 |
| 4 | Each law's **enforced-by** column | NO | **yes** |
| 5 | A `checkId` names a test **that exists** | **yes** | no — 26 laws, 26 `checkId`s |
| 6 | **core** migration count | **yes** | no — `0001`–`0017`, 17 on disk |
| 7 | **team** migration count | half (BOOTSTRAP only) | **yes** — 8 in `team-schema.ts`; OPERATIONS.md:45 names `0004…0006` |
| 8 | **ops** migration count | NO | **yes** — OPERATIONS.md:257 and INVENTORY.md:58 name `0001` only; `db/ops/` holds 2 |
| 9 | MCP **exclusion** table | **yes** | table no — **the prose beneath it, yes** (see H-NEW-1) |
| 10 | **worker count = 7** | NO | no — 7 directories, 7 `wrangler.jsonc` |
| 11 | **R2 bucket set** | NO | **yes** — INVENTORY.md:40 names 2; the wranglers declare 3 (`brimba-help-media` missing) |
| 12 | **DB size-alarm threshold** | NO | number no (80 % everywhere) — **its rationale, yes** (see H-NEW-2) |
| 13 | **test count** | NO | **yes** — 518 claimed in README:181 + CONTRIBUTING:25; **592** `it(`/`test(` literals on disk |
| 14 | workers that **record errors** | NO | **yes** — ERROR-HANDLING.md:51-52 names 5 sources; 6 workers + the browser record |
| 15 | workers that bind **OPS** | NO | **no — CORRECTED BY HAND this round** |
| 16 | **deploy order** | NO | no — root scripts, CLAUDE.md and OPERATIONS.md agree |
| 17 | the read **caps** (1000/10000/500) | NO | no — `shared/workers/limits.ts` agrees with CONVENTIONS.md:761 |

**5 of 17 checked (was 5). 7 of the remaining 12 are wrong right now (was 8).**

**The mechanism was used FIVE times in round 3 and ZERO times in round 4.** Every one of
this round's four currency wins — the worker count, the threshold, UI-GAPS, the vault —
was made **by hand**, and not one of them was given a check. Fact 15 is the proof of what
that costs: it was correct for months, drifted the instant realtime gained an `OPS`
binding, was corrected by hand on 2026-08-25, and nothing whatsoever prevents the gateway
from breaking it again next week. The four facts repaired this round are now in exactly
the state the thirteen unchecked ones were in before they rotted.

Round 3's finding was *"the shape did not change; the appetite did."* Round 4's is
narrower and worse: **the appetite went away.**

### Two facts that were checked and drifted anyway — the new shape

Rounds 1–3 hunted facts with **no** check. This round produced two facts that **have** a
check and are wrong regardless, because the check polices a *number* while the drift
happened in the *prose beside it*.

- **Fact 9.** `MCP.md`'s exclusion table is machine-checked and correct. The paragraph
  immediately below it describes a tool that does not exist. The check reads the table.
- **Fact 12.** The threshold is 80 % in code, in `ARCHITECTURE.md`, and in `SCALING.md`.
  `SCALING.md`'s own justification for that number now argues against itself.

A check that pins the number and leaves the sentence is half a check. That is the shape
to hunt in round 5.

### The cheapest three to check next

Chosen on one criterion: **derivable in a handful of lines from files an existing check
already opens.** No new machinery, no new file, no new glob.

**1 · Fact 15 — the workers that bind `OPS`.**
`ops-migrations-dir` (`web/test/rules.test.ts`) **already globs all seven
`workers/*/wrangler.jsonc`**. Add one assertion inside the loop it already runs: count the
files whose text matches `"binding":\s*"OPS"` (six today — the gateway's `"DATAOPS"`
service binding is the false positive a naive grep hits), and fail if any root `.md`
states a different number within one line of the word `OPS`. **Four lines, zero new reads.**
It is the cheapest because the file handle is already open, and the most urgent because it
is the only fact in the table that drifted *this month*.

**2 · Fact 8 — the ops migration count.**
The `core` twin of this check exists and passes. Copy it with one path changed:
`readdirSync("db/ops")` → highest `000N_` prefix (2 today) vs the highest `000N` any root
`.md` names beside the string `db/ops`. Closes two wrong statements in two documents
(OPERATIONS.md:257, INVENTORY.md:58) for the cost of a `readdirSync`.

**3 · Fact 11 — the R2 bucket set.**
Collect every `bucket_name` from the same seven wranglers check #1 opens, strip `-staging`,
dedupe → `{brimba-media, brimba-learning-media, brimba-help-media}`, and assert
INVENTORY.md's `Buckets:` line names all three. It **rides check #1's read**, so its
marginal cost is a regex. It is the one whose absence costs a *working feature*: a fresh
account stood up from `BOOTSTRAP.md` + `INVENTORY.md` creates two of three buckets, and
Help attachments fail in production with nothing in either document to explain why.

Named and rejected: **fact 13, the test count.** Cheaper than all three — but the right
repair is to *delete* the number from README and CONTRIBUTING, not to pin it. A hand-typed
count is wrong again next week whether or not a test agrees with it today.

---

## HAVE OTHER PEOPLE'S REPAIRS STOPPED DAMAGING THIS REVIEW?

**No. And the damage changed character, from collateral to direct.**

Round 3's damage was a side effect: repairs to *other* subsystems left the documents that
described them behind. Round 4's damage is in the repairs made **to this review's own
findings**. Three of the four drifts named in my brief as fixed were repaired by editing
the offending *token* rather than the *claim*, and two of the three left the owning
document saying something newly false:

| Drift | Repaired? | What the repair actually did |
|---|---|---|
| BOOTSTRAP: five workers carry `OPS` | **properly** | Corrected to six, with a dated sentence explaining why realtime joined. The model repair of the round. |
| `SCALING.md` 65 % vs 80 % | **number yes, argument no** | A find-and-replace of `65`→`80` also replaced the *historical* value and the *rationale's* figure. See **H-NEW-2**. |
| `MCP.md` advertises `set_screen_override` | **token deleted, claim left** | One line removed — the one containing the string. See **H-NEW-1**. |
| `UI-GAPS.md`'s four gaps | **properly** | Marked shipped in v0.16.0, with the honest note that gap 11 was never real. |
| The three vault documents | **three of four** | SECRETS, OPERATIONS and INVENTORY corrected. `CHANGELOG.md` was not, and the purpose-built check cannot see it. See **N2**. |

The measured cost: **+177 weighted points delivered, −174 taken back.** The loop is not
losing ground any more, which is an improvement on round 3. It is not gaining any either.

---

## Findings

### H-NEW-1 · HIGH — the MCP contract now advertises a tool that has no code, in a broken sentence, and the repair is what broke it

`MCP.md:262-267`

Commit `a6d571e` deleted the screen-override subsystem. The repair to this document
removed **exactly one line** — the one carrying the string `set_screen_override`. What
remains reads, verbatim:

> **`config/screens` was on this list until 2026-08-25 and is now a tool**
> member of the team SEES" — but the door had no caller on ANY surface, so the
> exclusion was describing a subsystem that simply could not be reached rather than a
> decision anyone had made. It reshapes a screen for the whole team, so it **confirms
> before it runs** and needs the `screens:edit` right, which no role holds by default.

Three faults in five lines. It asserts `config/screens` **is now a tool** — false; the
subsystem is gone. It tells an integrator the tool **confirms before it runs** and needs
`screens:edit` — a right that exists nowhere (`grep -rn "screens:edit"` outside `reviews/`
returns nothing). And the second line is an orphan with an unmatched quotation mark.

`MCP.md` is the **contract an outside developer reads before writing against this base**.
Before the repair it named a phantom tool. After the repair it names a phantom capability
and is ungrammatical. This is worse than the drift it fixed.

**Why the checked table did not save it.** The machine-checked exclusion table two lines
above is correct. The check reads the table. Nothing reads the paragraph.

**The fix.** Delete `MCP.md:262-267` entirely and put one dated sentence in its place:
*"`config/screens` was on this list until 2026-08-25, when the subsystem was removed
(`a6d571e`). There is no screens tool and no `screens:edit` right."*

### H-NEW-2 · HIGH — `SCALING.md`'s threshold rationale now argues against itself, in one paragraph

`SCALING.md:65-69`

The 65 %→80 % correction was a mechanical replace. It caught three numbers, two of which
were not the threshold:

```
The threshold is **80%** of the 10 GB cap (it was 80%).          ← :66-67
… 2 GB of headroom is days at a large tenant's growth rate,
and that is not enough time to notice, decide and act. 2 GB is.  ← :68-69
```

The parenthetical says the value it replaced was the value that replaced it. The rationale
says 2 GB is *not enough* and then that 2 GB *is*. The original argued the opposite case —
*"3.5 GB is"* — because it was written to justify the **65 %** the code no longer uses. The
argument was not updated; its numbers were.

`SCALING.md` is the document that owns this decision. A maintainer who opens it to learn
why the alarm fires at 80 % finds a sentence that cannot be read.

Compare `workers/tenancy/src/lib/sharding.ts:46-49`, which was rewritten properly and
reads correctly: *"80% leaves 2 GB of headroom where 65% left 3.5 GB … the alarm is checked
nightly and reported, so 2 GB is a warning with time in it rather than a surprise."*
**The code comment is now a better document than the document.**

**The fix.** Replace `SCALING.md:66-69` with the sharding.ts comment's own wording.

### N1 · MEDIUM — the route census's ungated assertion cannot fail on the two rows the census itself flags as ungated

`web/test/rules.test.ts:884-890` · `ROUTE-CENSUS.md:10`

**First, the good news, because H1′ is genuinely closed.** `route-census-current` is now
the strongest check shape in this repository:

- `expect(rows.length).toBeGreaterThan(90)` — a floor that tracks reality (was `> 60`
  against 94).
- A per-worker presence assertion for `gateway`, `realtime`, `auth` and `mcp` — the four
  the generator was blind to.
- `expect(render(rows)).toBe(read("ROUTE-CENSUS.md"))` — an **equality against the file**.
  The document cannot drift from the generator at all. This is the shape every other
  fact-pinning check in the repo should copy.

The residual: the ungated filter is

```ts
.filter((r) => r.method !== "GET" && r.method !== "ANY" && r.gates.length === 0)
```

`ROUTE-CENSUS.md` publishes **"99 routes · 60 state-changing · 2 with no gate detected"**,
and both of those two rows are `ANY` (`gateway ANY /mcp`, `realtime ANY /api/realtime/health`).
The assertion excludes them by method. The comment above it promises *"a state-changing
route with no gate is either a decision someone wrote down, or a hole"* — and the
enforcement of that promise has a hole shaped like `ANY`.

I read the source rather than trusting the row: `workers/gateway/src/index.ts:180-202`
rate-limits `/mcp` and proxies it to the mcp worker, which verifies the bearer token. It is
**gated one hop down, not ungated.** So this is a documentation-honesty gap, not a security
hole — but a reader of `ROUTE-CENSUS.md` has no way to reach that conclusion, and
`OPEN_BY_DESIGN` names `POST /publish` and `POST /api/auth/email/start` and not these.

**The fix.** Two lines: add both rows to `OPEN_BY_DESIGN` with the downstream-gate reason,
and drop `r.method !== "ANY"` from the filter so the exemption is *declared* rather than
*structural*.

### N2 · MEDIUM — the check written to stop documents claiming the vault exists is blind on the fourth document, for the second time

`web/test/rules.test.ts:907-944` · `CHANGELOG.md:64-65`

`vault-claims-match-reality` scans every root `.md` while `secrets.vault` is absent (it is
— `ls` returns nothing) and fails on any present-tense claim of existence. Its own comment
records that its **first** version *"was written ABOUT these exact three sentences and
matched none of them."* It was then widened to catch those three. `SECRETS.md`,
`OPERATIONS.md` and `INVENTORY.md` are now corrected.

`ocean-r3.md:154-157` named **four** documents. The fourth is `CHANGELOG.md:64-65`:

> Also the encrypted secrets vault (`secrets.vault` + `scripts/vault.mjs`), so the
> credentials survive the laptop.

The check's three predicates are `/\bcommitted\b/`, `` /`secrets\.vault` is\b/ `` and
`/\b(is sealed|lives in the repo|already (?:in|exists))\b/`. That line matches none of
them. It is a bare present-tense assertion **and a claim about the recovery property
itself** — the credentials do *not* survive the laptop.

**The repair converted a uniform falsehood into a contradiction.** Before it, four
documents agreed and were wrong. Now three say the vault does not exist and one says the
credentials are safe, and the check that exists precisely to arbitrate that cannot see the
one that is wrong. Note also that the story probe's doc set (33) excludes `CHANGELOG.md`
entirely — so neither the check nor the probe would have found this. I found it by hand.

**The fix.** Invert the predicate: while `secrets.vault` is absent, flag **any** line
naming it that is not imperative (no leading `npm run`, `git`, or `Run`) and does not carry
an explicit negation (`not yet`, `does not exist`, `will be`). The current allow-list grows
one entry per document discovered; the deny-list grows none.

### Carried, unrepaired, from round 3

| id | what | where | still true? |
|---|---|---|---|
| M-BUS | `BASE-IMPROVEMENTS.md` describes the deleted `useLiveRefetch` bus in the present tense as part of law R15 | `BASE-IMPROVEMENTS.md:338` | **yes.** `CACHING.md:87` gets it right ("existed until 2026-08-25 and had zero call sites"); BASE-IMPROVEMENTS still lists it as the mechanism |
| M-CENSUS-MAP | `ROUTE-CENSUS.md` is a root document `README.md`'s doc map does not index | probe: `docMap.missing = ["ROUTE-CENSUS.md"]`, `indexes: 31` | **yes** |
| M-CHANGELOG-MAP | `CHANGELOG.md` is indexed by nothing and is outside the probe's doc set | `README.md` | **yes**, carried since round 1 |
| M-518 | Two documents state the suite has 518 tests | `README.md:181`, `CONTRIBUTING.md:25` | **yes** — 592 `it(`/`test(` literals |
| M-OPS-MIG | Two documents name one ops migration; two exist | `OPERATIONS.md:257`, `INVENTORY.md:58` | **yes** |
| M-BUCKETS | One document names two R2 buckets; three are declared | `INVENTORY.md:40` | **yes** |
| M-ERRSRC | One document names five error sources; six workers and the browser record | `ERROR-HANDLING.md:51-52` | **yes** |
| M-PRIV | The server-side privilege-amplification guard is in **zero** documents | `workers/tenancy/src/lib/roles.ts:185-305` | **yes.** EDGE-CASES §5 owns the *agent confirm* rule; nothing owns the *server* rule |
| M13 | Invite issued to a role that is then deactivated | EDGE-CASES.md | **yes** |
| N-SKILLS | `README.md:68` and `:70` link to `skills/new-app/SKILL.md` and `skills/README.md`. **`skills/` does not exist.** | `README.md` | **yes** — tracked as housekeeping since round 1, priced here for the first time (criterion 8) |
| **N-COMMENT** *(new, minor)* | `runbook-migrations-current`'s own comment says *"though **five** workers ship an `OPS` binding"* — inside the check that opens all seven `wrangler.jsonc` files and could count six | `web/test/rules.test.ts:811` | **yes.** Not a document, so it does not move criterion 1 — but it is the same fact 15 corrected in BOOTSTRAP this round, wrong again three files away, and it confirms the glob for cheap-check #1 is already open |

### Undocumented check layer — criterion 4, re-measured

| module | named in any canon `.md`? |
|---|---|
| `shared/test/source.ts` | **no** (reviews only) |
| `shared/test/publish-seam.ts` | **no** |
| `shared/test/gating-seam.ts` | **no** |
| `scripts/route-census.mjs` | yes — `ROUTE-CENSUS.md` (**new**) |
| `scripts/timings.mjs` | yes — `OPERATIONS.md` §Performance budgets (**new, born owned**) |
| `scripts/fork.mjs` | yes — `RULES.md` |
| `scripts/vault.mjs` | yes — `CHANGELOG.md` (the line in **N2**) |

Three undocumented, four owned. Round 3 counted three undocumented out of four; the
denominator moved because `gating-seam.ts` was always undocumented and round 3 did not list
it — **I am declaring that correction rather than letting it flatter the delta.**

---

## `--foundation` mode — the capability matrix

Capabilities enumerated from `README.md`'s doc map, `ARCHITECTURE.md`'s locked decisions,
`BASE-MANUAL.md` §2–§4 and `RULES.md` — not hardcoded. Every `partial`/`NO` cell appears
in the findings above or below.

| Capability | (a) DOCUMENTED | (b) MACHINE-CHECKED | (c) SCALES | (d) REUSABLE |
|---|---|---|---|---|
| Multitenancy · per-team D1 | yes — DATA-MODEL, BASE-MANUAL §2 | yes — the gating suites | yes — SCALING §3, seam `sharding.ts` on disk | yes — `d1-rest.ts` + `teamContext` |
| Permission spine | yes — BASE-MANUAL §2, RULES R10 | yes — per-worker `gating-seam` | yes | yes — `requireRight` |
| **Privilege-amplification guard** | **NO — zero documents** | yes — `roles.test.ts` | n/a | partial (named nowhere) |
| Live-sync | yes — CACHING, DURABLE-OBJECTS, R1/R15 | yes — `publish-seam`, `live-collections` | **partial** — see `scaling-r4` finding C | yes — `live-resources.ts` |
| Auth + sessions | yes — ARCHITECTURE, BOOTSTRAP | yes — `auth/gating-seam` (equality-form) | yes | yes |
| AI agent | yes — EDGE-CASES §5, AGENT-MODULES-PLAN | yes — `agent-app-parity`, `agent-filter-parity` | yes — SCALING §4 | yes — the tool catalog |
| Agentic import | yes — AGENTIC-IMPORT | yes — `catalog-coverage` R13 | yes | yes — `TargetDef` |
| **MCP surface** | **partial — MCP.md:262-267 describes a tool with no code** (H-NEW-1) | yes — exclusion table + mcp `gating-seam` | yes — MCP.md cost model | yes |
| Error store | **partial — ERROR-HANDLING.md:51 names 5 of 7 sources** | yes — `error-seam` | partial — see `error-log-r4` | yes — `recordWorkerError` |
| **Sharding + size alarm** | **partial — SCALING.md:66-69 unreadable** (H-NEW-2) | **NO — no check pins the threshold or its rationale** | yes | yes — `moveModuleToOwnDatabase` |
| Screen engine | yes — SCREEN-ENGINE-PLAN, R20 | yes — `static-destinations` | yes | yes — `screens.ts` recipes |
| Ship pipeline | yes — OPERATIONS, BOOTSTRAP | partial — deploy order is in three places, checked in none (fact 16) | yes | yes |
| **Route census** | yes — ROUTE-CENSUS.md (**unindexed**) | yes — equality + floor + per-worker | n/a | yes — `scripts/route-census.mjs` |
| **Performance budgets** | yes — OPERATIONS.md (**new, born owned**) | **NO — `scripts/timings.mjs` is in no gate** | n/a | yes |
| **Secrets vault** | **partial — CHANGELOG.md still claims it exists** (N2) | partial — the check is blind on that document | n/a | yes — `scripts/vault.mjs` |

Two cells improved this round (route census, performance budgets — both born documented).
Two degraded (MCP surface, sharding). One is unchanged and remains the matrix's worst:
the privilege-amplification guard is the highest-impact security control added in this
campaign and **no document in the corpus mentions it**.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Delete `MCP.md:262-267`, replace with one dated sentence (H-NEW-1) | `MCP.md` (−6/+2 lines) | REMOVES a phantom capability and an unreadable paragraph | none — helps `interfacelessness_review` (which files the same object from the tool side) and `dead_end_review`. Nothing depends on the text. |
| **F2** Replace `SCALING.md:66-69` with `sharding.ts:46-49`'s wording (H-NEW-2) | `SCALING.md` (4 lines) | REMOVES a self-contradiction; the doc and the code comment become one story | none — `scaling_review` already scores the code, not the prose. **Do not** change the 80 % itself: `ARCHITECTURE.md` §1 is LOCKED at 80 % and the code agrees. |
| **F3** Invert `vault-claims-match-reality` to a deny-list; correct `CHANGELOG.md:64-65` (N2) | `web/test/rules.test.ts` (~6 lines), `CHANGELOG.md` (1 line) | ADDS ~6 test lines; REMOVES one false claim | **`lean_mean_review` — direct.** `rules.test.ts` is its #1 split target for four rounds and grew again this round. Six more lines is small but it is the wrong direction. Land it **after** the file split, or inside it. |
| **F4** Add `ANY` rows to `OPEN_BY_DESIGN`, drop the `ANY` exclusion (N1) | `web/test/rules.test.ts` (~4 lines) | ADDS two declared exemptions; REMOVES a structural one | **`lean_mean_review`** — same tension as F3, same mitigation. **`security_sentry_review` — positive:** it converts an invisible exemption into a named, reasoned one. |
| **F5** The three cheapest fact checks (OPS bindings · ops migrations · bucket set) | `web/test/rules.test.ts` (~14 lines total), riding `ops-migrations-dir`'s existing glob | ADDS ~14 test lines; permanently REMOVES three classes of drift | **`lean_mean_review` — the sharpest tension in this map.** It measures *less code is better* and this adds test lines to the file it most wants split. **`spend_review` / `speed_review` — none:** these run at build time, never at request time. My recommendation is to land all three **inside** the `rules.test.ts` split rather than before it, so the split absorbs them. |
| **F6** Index `ROUTE-CENSUS.md` and `CHANGELOG.md` in README's doc map; fix or remove the two `skills/` links | `README.md` (4 lines) | ADDS 2 index rows; REMOVES 2 dead links | none — `mac_fell_in_the_ocean_review` benefits directly (the README is its front-door criterion). |
| **F7** Correct BASE-IMPROVEMENTS.md:338's `useLiveRefetch`; correct `ERROR-HANDLING.md:51`, `INVENTORY.md:40`, `OPERATIONS.md:257`/`INVENTORY.md:58` | 4 documents, 1 line each | REMOVES 4 stale statements | none — mechanical and meaning-preserving. **But every one of these is a fact F5 would have checked; doing F7 without F5 buys one week.** |
| **F8** Document the privilege-amplification guard | `CONVENTIONS.md` or `BASE-MANUAL.md` §2 (~8 lines) | ADDS the only description of the control | **`lean_mean_review` — mildly positive** (documentation is a scored criterion there). **`security_sentry_review` — consider first:** writing down exactly how the guard derives its comparison publishes the shape of the control. It is server-side and not a secret, but that review should sign the wording rather than discover it. |

---

## CEILING

**95 is not reachable by changing code, and the binding constraint is not a document.**

| Criterion | wt | Cap | Why |
|---|---|---:|---|
| 1 · No contradictions | 14 | **~85 sustained** | Not capped by a lock — capped by **rate**. Thirteen facts have no machine-checked source, four more were repaired by hand this round, and the corpus gains roughly one new document per week. Every hand-repair is a fact that rots again. This criterion can be driven to 100 *on any given day* and cannot be held there without F5-shaped checks on all seventeen facts. |
| 2 · Locked decisions | 13 | 100 | Reachable. |
| 3 · Guarantees end to end | 12 | **~80** | The census equality shows the ceiling is high; getting there means every guarantee gets a check with the census's shape, which is roughly 300 lines in `rules.test.ts` — the direct `lean_mean` tension in F5. |
| 4 · Depth vs reach | 10 | 100 | Reachable — `timings.mjs` proved it this round. |
| 7 · Nothing is stale | 8 | **~85** | Same rate argument as criterion 1. The 518-test claim is the archetype: correct it today, wrong next Tuesday. |
| 10 · Capability ownership | 8 | 100 | Reachable — every gap in the matrix is a paragraph someone has to write. |
| all others | 35 | 100 | Reachable. |

**True maximum, sustained: 88.** Computed with criterion 1 at 85, criterion 3 at 80,
criterion 7 at 85 and everything else at 100:

```
85×14 = 1190 · 100×13 = 1300 · 80×12 = 960 · 100×10 = 1000 · 100×9 = 900
100×9 = 900 · 85×8 = 680 · 100×6 = 600 · 100×6 = 600 · 100×8 = 800 · 100×5 = 500
Σ = 9430 / 100 = 94.3  →  but criteria 1, 3 and 7 hold those values only on the day
they are repaired. Averaged over a repair cycle, they sit ~15 points lower.
Σ(sustained) = 1190−210 + 1300 + 960−180 + 1000 + 900 + 900 + 680−120 + 600 + 600 + 800 + 500 = 8920
8920 / 100 = 89.2 → 89, minus the one structural item below.
```

**The one item a commit genuinely cannot fix: single authorship.** Every document in this
corpus is written and reviewed by the same party that writes the code. A contradiction
between two documents is only ever caught by a *reader who did not write either*, which in
this project is a review agent running once a week rather than a colleague reading
continuously. That is why the same four repair passes that fixed twelve facts created five
new contradictions, and why this criterion has now been measured four times without rising.
**It costs about 1 point.**

**True maximum: 88.** The path there is not more documentation. It is F5, applied
seventeen times — and every application of it is a debit against `lean_mean_review`.
That tension is the single most important thing this review has to hand back to the
campaign, and it is not resolvable by either review alone: `rules.test.ts` must be split
into a directory *first*, and then the seventeen checks land into it for free.

**Verdict: the story still does not check out — 2 high, 12 medium, 6 minor. The one that
matters most is that the two worst contradictions in the corpus today were both created,
this week, by the repairs to my own round-3 findings — one by deleting a word instead of a
claim, the other by replacing a number the sentence was not about.**
