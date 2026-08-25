# Lean Mean review — Brimba · 2026-08-26 · ROUND 5
SCORE: 94/100 (Grade A)   (round 1: 89 · 2: 91 · 3: 92 · 4: 93)
**Without `reviews/` in the working tree: 95.** Both computed below.

## Method, and the one thing I could not measure

**Measured at `HEAD = f30f954` on branch `review-round5`, working tree clean at
the start of measurement.** *(It did not stay clean: a concurrent session ran
`scripts/timings.mjs` mid-measurement and appended 72 lines of live staging
probes to `timings.json`. That file is generated data, not source, and is
excluded from every count below — every source figure is read from git objects at
a named commit, not from the working tree, so nothing here moves.)*
Round 4 was measured at `d9741c6`; every delta below is `d9741c6 → f30f954`,
**re-measured with the same script at both revisions**, so the deltas are
trustworthy even where an absolute differs from a published one. My script
reproduces round 4's published headline figures exactly at `d9741c6`
(40,845 lines / 298 files, 21 files over 400, `reviews/` 55 files / 26,473 lines,
root `.md` 41 / 10,548), which is the check that the comparison is like-for-like.

Scanner: `python3 ~/.claude/skills/lean_mean_review/scripts/scan.py .` →
362 code files · 48,964 LOC · 109 doc files · 33,104 doc LOC · 105 test files ·
26.3% comment ratio · 5.4% duplicate-line heuristic. *(Two scanner quirks worth
knowing: it reports `web/e2e/README.md` as "the" README — the root one exists and
is excellent; and its 7 TODO hits are mostly prose about TODOs. My own count is
below.)*

**I was instructed not to run `npm run check`, so unlike round 4 the suite is
NOT executed in this measurement.** Round 4's headline robustness evidence was
*"646 tests, 71 files, 0 failures, `tsc` 8/8 exit 0"*. I have the static
equivalent and not the dynamic one. Everything I claim about tests below is
counted off disk. **If the suite is red at HEAD, the Robustness number is void**
— say so rather than let it stand.

---

## DELTA

| Criterion | Wt | R2 | R3 | R4 | **R5** | code changed, or last measurement wrong? |
|---|---|---|---|---|---|---|
| Size & Scope | 0.12 | 90 | 88 | 89 | **90 ▲** | **code changed, both ways.** The 1,203-line, 29-check monolith that was item #1 for **five consecutive reviews** is gone; the largest file in the repository fell **1,191 → 675 (−43%)**. Against it: files over 400 went **21 → 24**, and tracked source grew **+9,286 lines (+22.7%)** — the largest single-round growth of the campaign. +1, not more. |
| Robustness | 0.22 | 93 | 94 | 96 | **95 ▼** | **the last measurement was wrong, and the artefact improved.** Round 4 scored 96 on a check layer since proven partly blind — a regex fault in `shared/test/source.ts` made files leak comments into what **13 dependent files' checks read as code**. Corrected, round 4 was ~93. At HEAD the layer is genuinely better (+178 tests, the reader fixed *and* locked by its own suite, +3 laws-worth of checks, three data-loss doors caught) — a real **+2 on a corrected baseline**, published as −1. Three named check defects survive; the suite is unexecuted. |
| Documentation | 0.16 | 92 | 91 | 93 | **95 ▲** | **code changed.** `docMap.missing` is empty for the first time; `danglingLinks` is 0; a new check (`doc-paths-resolve`) machine-verifies **412 backticked repo paths across 35 root documents**; the census now sees all 111 doors including the gateway's 11. 13 of 14 open doc-vs-code claims closed. |
| Understandability | 0.20 | 91 | 93 | 93 | **95 ▲** | **code changed.** Both fixes this review named last round landed: the rules split (F1) and `sharding.ts` → sharding + housekeeping (F8). Held back by a fifth round with **no linter and no formatter**, and by comment inflation (below). |
| Leanness | 0.15 | 90 | 93 | 91 | **92 ▲** | **code changed.** Product duplication **0.66% → 0.56%** while product gained 3,068 significant lines; test duplication held at **0.00%** while tests gained 4,302. `reviews/` grew again (+3,058) but the ratio to source **fell** 0.86 → 0.85. Zero runtime dependencies in 7/7 workers, fifth round running. |
| Scalability & Structure | 0.15 | 92 | 92 | 93 | **94 ▲** | **code changed.** One owner per concern in tenancy's nightly work; the law layer became a directory with a shared reader instead of a queue; the census reaches every worker with a working regex. |

---

## Arithmetic

Rubric weights (`~/.claude/skills/lean_mean_review/reference/rubric.md`), unmodified:
`overall = 0.12·size + 0.22·robustness + 0.16·docs + 0.20·understandability + 0.15·leanness + 0.15·scalability`

```
0.12 × 90 = 10.80
0.22 × 95 = 20.90
0.16 × 95 = 15.20
0.20 × 95 = 19.00
0.15 × 92 = 13.80
0.15 × 94 = 14.10
```
`10.80 + 20.90 = 31.70; +15.20 = 46.90; +19.00 = 65.90; +13.80 = 79.70; +14.10 = 93.80`
**93.80 → SCORE 94 (Grade A).**

Round 4 recomputed from its own published table: `10.68 + 21.12 + 14.88 + 18.60 + 13.65 + 13.95 = 92.88 → 93`. **Movement: +0.92.**

### The `reviews/` question, answered as a number

Round 4 called `reviews/` *"the binding cap"* and put Leanness at ~90 while
tracked, ~96 without. The brief asks what the score would be if the 66 files /
29,531 lines were archived to a pushed tag and removed from the tree.

Removing them changes exactly two inputs: tracked regenerable text falls from
**32,337 lines to 2,806** (the root artefacts, below), and the doc corpus falls
from **109 files / 41,225 lines to 43 / 11,694**. Duplication, dependencies and
structure do not move at all.

```
Leanness      92 → 96   (the single largest debit disappears; duplication already excellent)
Size & Scope  90 → 91   (the repo stops carrying an audit corpus 0.85x its own source)

0.12 × 91 = 10.92 · 0.22 × 95 = 20.90 · 0.16 × 95 = 15.20
0.20 × 95 = 19.00 · 0.15 × 96 = 14.40 · 0.15 × 94 = 14.10
10.92 + 20.90 = 31.82; +15.20 = 47.02; +19.00 = 66.02; +14.40 = 80.42; +14.10 = 94.52
→ 95
```

**94 with `reviews/` tracked · 95 without. The archive decision is worth exactly
one point — and only 0.52 of a point of that is the rounding.** That is a
materially smaller number than round 4 implied, and the reason is measurable:
`reviews/` grew 11.6% this round while the source it reviews grew 22.7%, so the
ratio improved on its own. **If the tag is the plan, take it for tidiness, not for
the score.** Leanness is no longer the binding criterion; Size & Scope is.

---

## Baseline counts — R4 vs R5, same script both times

| Measure | R4 (`d9741c6`) | **R5 (`f30f954`)** | Δ |
|---|---|---|---|
| Tracked source (.ts/.tsx/.mjs/.sql/.css) | 40,845 / 298 files | **50,131 / 331** | **+9,286 / +33** |
| — test code | 10,041 / 77 | **15,571 / 105** | **+5,530 / +28** |
| — non-test source | 30,804 / 221 | **34,560 / 226** | **+3,756 / +5** |
| Test : non-test ratio | 32.6% | **45.1%** | **+12.5 pt** |
| **Largest file in the repo** | **1,191** (`rules.test.ts`) | **675** (`agent.ts`) | **−516 / −43%** |
| **Files > 400 lines** | 21 / 298 | **24 / 331** | **+3** |
| `it(` / `test(` declarations (strict, line-anchored) | 594 | **772** | **+178 (+30%)** |
| — of which playwright e2e, outside `npm test` | 2 | **4** | +2 |
| **Tests actually executed** | 646 pass / 0 fail | **not measured this round** | — |
| `tsc --noEmit`, 8 projects | exit 0 | **not measured this round** | — |
| Dup 8-line windows, product src | 162 / 24,605 = 0.66% | 154 / 27,673 = **0.56%** | **−0.10 pt** |
| Dup 8-line windows, tests | 0 / 7,516 = 0.00% | 0 / 11,818 = **0.00%** | **flat, on +4,302 lines** |
| Comment ratio, non-test | 23.7% | **27.9%** | **+4.2 pt** |
| Comment ratio, tests | 21.6% | **25.5%** | +3.9 pt |
| `stripComments` definitions | 1 | **1** | = |
| Files importing `shared/test/source.ts` | 11 | **13** | +2 |
| TODO / FIXME in tracked source (real) | 0 | **1** | +1 |
| Runtime deps in workers | 0 in 7/7 | **0 in 7/7** | = |
| Root devDependencies | 1 (`wrangler`) | **1** | = |
| Linter / formatter config, anywhere | **none** | **none** | = (5th round) |
| CI | `.github/workflows/ci.yml`, `npm run check` | **same** | = |
| **Tracked `reviews/` artefacts** | 55 / 26,473 | **66 / 29,531** | +11 / +3,058 |
| **Regenerable artefacts at repo ROOT** | *(unpriced)* | **12 / 2,806** | newly counted |
| Root `.md` | 41 / 10,548 | **42 / 11,642** | +1 / +1,094 |
| `reviews/` : non-test source | 0.86 | **0.85** | **−0.01** |
| `reviews/` : ALL tracked source | 0.65 | **0.59** | **−0.06** |

**Duplication caveat, declared not hidden.** My absolutes (0.66% / 0.00%) differ
from round 4's (1.26% / 0.00%) because my normaliser drops lines under 4
characters and round 4's did not. **The delta — product down, tests flat at zero
on 57% more test code — is what is trustworthy**, and it means round 3's
test-duplication win has now survived two rounds and a 57% expansion.

### The 24 files over 400, sorted

`agent.ts` 675 · `store.test.ts` 672 · `help.ts` 594 · `deep-link-screen.tsx` 573 ·
`api.ts` 566 · `teams.ts` 556 · `types.ts` 555 · `learning.ts` 549 · `import.ts` 543 ·
`import-screen.tsx` 523 · `roles.ts` 512 · `model.ts` 512 · `sharding.ts` 508 ·
**`store.ts` 491** · `tool-catalog.ts` 483 · **`app-shell.tsx` 473** ·
`team-schema.ts` 468 · `retention.test.ts` 467 · `screens.ts` 453 ·
`import-plan.ts` 428 · `use-agent-chat.tsx` 425 · **`roles.test.ts` 418** ·
`build-blueprint.mjs` 417 · **`registry.ts` 405**

Four new entrants (bold). One departure worth more than all four: `rules.test.ts`.
`sharding.ts` fell 590 → 508.

---

## THE ANSWER TO THE STANDING QUESTION — did the split land, and what did it cost?

Round 4 recommended splitting `web/test/rules.test.ts` **before** the four queued
checks landed, estimated the cost at **+25 lines**, and predicted the largest part
would land **"near 250"**. All three can now be checked.

```
before the split   5818c73^   web/test/rules.test.ts        1,203 lines · 29 checks · 1 file
at the split       5818c73    web/test/rules/*              1,397 lines · 29 checks · 9 files
at HEAD            f30f954    web/test/rules/*              1,578 lines · 32 checks · 9 files
```

| | predicted | actual |
|---|---:|---:|
| split cost, lines | **+25** | **+194** |
| largest resulting file | ~250 | **264** (`meta.test.ts`) |
| checks preserved | 29 | **29, all of them** |

**The split happened, first, alone, before any check was written — exactly as
recommended — and it cost eight times the estimate.** The extra 169 lines are not
waste: each file carries a header naming which laws it holds and why they belong
together, and `_paths.ts` re-exports the source readers so *"the source readers
all come from ONE module… a per-check reader is how a check goes blind."* Round
4's estimate priced imports and forgot that this repository writes a paragraph at
the top of every file. **The estimate was wrong; the recommendation was right.**

The 181 lines added *after* the split bought **three new checks** —
`doc-paths-resolve` and the two new R15 directions. Compare the trend it broke:

```
R2  1,069 · 27 checks     R3  1,150 · 29     R4  1,191 · 29     R4+repairs  1,203 · 29
R5  1,578 · 32 checks across 9 files, largest 264
```

**+134 lines and +2 checks across four rounds; +375 lines and +3 checks in one.**
The queue cleared.

---

## Findings

### F1 · HIGH — a law's check "exists" because a comment mentions it

`web/test/rules/meta.test.ts:232-256` · `workers/data-ops/test/agent-parity.test.ts:1`

The keystone check asserts every enforced law has a check that exists. It builds a
haystack of `` `${filename}\n${fileContents}` `` and asks `haystack.includes(checkId)`.
For **R9 `agent-app-parity`** the string appears in exactly one place in the whole
test tree — **a line-1 comment**. The file is `agent-parity.test.ts` (no `app`);
the `describe` reads `"agent-app parity (Law R9)"` — a space, not a hyphen.

- Delete R9's seven real assertions → the law still reports as checked.
- Delete that one comment → R9 goes red.

`README.md:86` promises *"the check must be able to fail"*. Here the thing proving
a check exists is satisfied by a sentence saying it does. **Fix: require the id in
a `describe`/`it` title, with the two file-name exceptions (`gating-seam.ts`,
`publish-seam.ts`) named as data — they are already whitelisted at `:248`, so the
shape exists. ~6 lines.**

### F2 · MEDIUM — the reader fix that 13 files depend on is bypassed by two of them

`shared/test/source.ts:266-272` vs `web/test/rules/worker.test.ts:34-36` and `web/test/rules/meta.test.ts:190`

One of this round's best repairs: `workerSources()` now filters
`e.name !== "node_modules"` **and** requires a `src/` directory, because treating
every directory under `workers/` as a worker let vitest's own cache turn thirteen
checks red. Verified correct, double-guarded.

Two checks in the same directory still enumerate `workers/*` themselves, with
neither guard — `fetch-timeout` (R11) and the census's per-worker presence
assertion. `workers/node_modules` does not exist today, so both are green. The
exact failure mode that produced the repair survives in the two places that did
not take it. `_paths.ts` says in its own header why that matters.

**Fix: two call sites, one import each.**

### F3 · MEDIUM — the comment stripper has three live counter-examples

`shared/test/source.ts:104-153`

The regex-literal branch is real and load-bearing: with it, **0 of 299 files leak
whole-line comments into what checks read as code**; without it, **13 do**. Three
shapes still defeat it, all dormant on today's tree:

1. `<Foo bar={1} />` — `}` opens regex mode, so `/>` starts a "regex" that copies
   the rest of the line verbatim, trailing `// LIMIT 100 is not needed` included.
   That is precisely the R14 failure mode: a comment satisfying the bound whose
   absence it describes.
2. The same shape preserves a `{/* … */}` JSX comment as code — an R1 scan would
   read `publishChange` in a comment as a call.
3. An apostrophe in JSX text opens a string that runs to the next apostrophe
   anywhere in the file.

Only the house `&apos;` convention keeps these dormant. **Fix: three fixtures in
`web/test/source.test.ts` (which already exists — that suite is this round's
other good repair) plus the stripper change. Diff the output over all 299 files
before and after, as this round's repair did.**

### F4 · MEDIUM — `doc-paths-resolve`'s glob branch checks nothing past the first segment

`web/test/rules/doc-facts.test.ts:52-56`

The new check is genuinely doing work — **412 backticked repo paths across 35 root
documents, 0 dangling**, with three named exemptions each carrying a written
reason. That is the right shape and the right amount of ceremony.

The glob branch is not:

```js
const [head] = claimed.split("*")
const dir = join(ROOT, head.slice(0, head.lastIndexOf("/")))
if (!EXEMPT[claimed] && !existsSync(dir)) dangling.push(…)
```

The comment says *"accept the claim if ANY sibling matches"*; the code resolves
only the directory before the first `*` and discards everything after it. Proven:
`workers/*/test/there-is-no-such-file.test.ts` → `workers` exists → **passes**.
**Every `workers/*/…` claim in the canon is unchecked past the word `workers`.**

**Fix: glob the tail with `readdirSync` and require one real match. ~5 lines.**
Sabotage-prove it with the string above — that is the whole test.

### F5 · MEDIUM — twelve regenerable artefacts at the repository root, unindexed and stale

```
lean-mean-report.md  70 + .html 215   2026-08-18   claims "Overall 97/100"
architecture-review.md 257 + .html 256   2026-08-18   claims "96/100"
activity-log-review.md 318 + .html 159   2026-08-18   claims "94/100"
interface-lessness-report.md 38 + .html 195   2026-08-12
story-review.md 53 · security-report.md 58 · ocean-review.md 81   2026-08-12
timings.json  1,106                      2026-08-26   generated machine output
                                         ------
                                         2,806 tracked lines
```

Every one is regenerable, none is imported by anything, none is linked from
`README.md`, and four of them state review scores the campaign has since
superseded — a reader running `ls *.md` finds a lean-mean report claiming **97**
next to `reviews/lean-mean-r4.md` claiming **93**. `timings.json` is 1,106 lines of
generated JSON sitting at the repository root rather than under a directory.

The repository already has the pattern: `.gitignore` carries
`/architecture-blueprint.html` with the comment *"Generated by the
architecture_blueprint skill — regenerable, not source."* `doc-paths-resolve`
independently reasons the same class out of its own scope as *"OUTPUT, not
canon."* **Two mechanisms in this repo already classify these files correctly and
neither of them un-tracks them.**

**Fix: one `.gitignore` line, `/*-review.md`, `/*-report.md`, `/*-report.html`,
`/*-review.html`. Move `timings.json` under `scripts/` or ignore it.**
This is a cheaper and less contested win than the `reviews/` archive.

### F6 · MEDIUM — 62% of this round's new non-test lines are comments

Non-test comment ratio **23.7% → 27.9%**. In absolutes: significant non-test lines
+3,477, of which comment lines **+2,159**.

This is not a straightforward defect — this repository's comments are its best
documentation, and `db/core/0019_nightly_state.sql`'s 33-line header and
`error-digest.ts`'s *"a digest that mails '0 errors' every night trains the one
person who reads it to delete it unread"* are better writing than most of the root
docs. But the rubric asks whether it is lean, and two things follow from the
measurement:

1. Nearly two thirds of new "code" is prose a reader must scroll past. Four of the
   24 files over 400 are over 400 substantially because of it.
2. **It is displacing the documents.** Three capabilities shipped this round with a
   first-class explanation inside their own file and no owning root document
   (`story-r5` criterion 10). The habit producing the excellent comments is the
   same habit producing the undocumented capabilities.

**Fix: nothing mechanical. The judgement is that a "why" paragraph over 20 lines
long is usually a document that has not been written yet.**

### F7 · FLAT, fifth round — still no linter and no formatter

Zero eslint / prettier / biome / oxlint / editorconfig tracked in any workspace.
The house style is real, exceptionally consistent, and maintained entirely by
hand. It remains the largest unclaimed Understandability win and the cheapest: one
config, one `npm run` entry, one devDependency.

Round 4 said this needs an owner decision because `CLAUDE.md`'s anti-dependency
directive plausibly reads as forbidding it. **It has now survived five reviews
without one.** A devDependency that mechanically enforces leanness is not the kind
of dependency that directive is about, and the decision costs less than the
re-finding.

### F8 · MINOR — the e2e suite is not in the gate

`web/e2e/live-sync.spec.ts` (318 lines) and `team-flows.spec.ts` exist, with
`web/playwright.config.ts` and a `test:e2e` script. `npm run check` runs
`npm test`, which runs `vitest run` in web — **playwright is never invoked**. 4
e2e declarations sit outside every gate including CI.

Also: `.github/workflows/ci.yml` triggers on `push: branches: [main]` and
`pull_request`. This branch is neither, and has no PR — **so CI has not run on any
commit in this round.**

### F9 · MINOR — one TODO, honestly placed

`workers/tenancy/src/lib/housekeeping.ts:385` — `TODO(retention): this window
belongs in CORE_RETENTION`, cross-referenced from `:266` and from
`retention.test.ts:376`. Round 4 measured 0. This one is documented in three
places and names the file it belongs in; it is the good kind. Recording it so the
count stays honest.

---

## FIX IMPACT MAP

| Fix | Files it touches | ADDS / REMOVES | Which other review could this damage? |
|---|---|---|---|
| **F1** Title-based law-existence check | `meta.test.ts` (~6), `agent-parity.test.ts` (1 word) | REMOVES the last comment-satisfiable law check | **`lean_mean` (this review) — trivial debit**, and `meta.test.ts` is already the largest part at 264; +6 keeps it under 275. **`interfacelessness_review` — direct positive**, R9 is its parity law. **`story_checks_out` — positive**, it is that review's only HIGH. |
| **F2** Route two checks through `workerSources()` | `worker.test.ts`, `meta.test.ts` (2 call sites) | REMOVES a known failure mode from 2 of 13 readers | **none.** Strictly a debit-free fix — it deletes code rather than adding it. |
| **F3** Stripper fixtures + fix | `shared/test/source.ts` (~8), `web/test/source.test.ts` (~15) | REMOVES three latent blind spots | **`lean_mean` — small debit** (+23 test lines). **Everything reading source — positive**, all 13 dependants inherit it. **Real risk:** a stricter stripper may newly strip something a check relies on. Diff all 299 files before and after; the round-5 repair set that precedent and it is the right one. |
| **F4** Glob the tail in `doc-paths-resolve` | `doc-facts.test.ts` (~5) | REMOVES a hole that passes any fabricated `workers/*/…` path | **`story_checks_out` — positive**, it is that review's criterion-8 mechanism. **`mac_fell_in_the_ocean_review` — positive**, a rebuild follows documented paths. **Watch:** the fix may turn up real dangling `workers/*` claims; budget the follow-up in the same change. |
| **F5** `.gitignore` the root report artefacts + `timings.json` | `.gitignore` (+4 lines) | **REMOVES 2,806 tracked lines** and four stale score claims | **`mac_fell_in_the_ocean_review` — check, but almost certainly fine.** Its thesis is what survives if the laptop dies; these twelve are *stale duplicates* of `reviews/`, which stays. **`story_checks_out` — positive**, it names them as an unscored finding worth 2 points. **`error_log_review` / `speed_review` — check `timings.json`:** if either reads it as a committed baseline, move it rather than ignore it. |
| **F6** Cap "why" comments; promote the long ones to documents | `error-digest.ts`, `0019_nightly_state.sql`, `housekeeping.ts` headers → `OPERATIONS.md` / `SCALING.md` | MOVES ~60 lines from code to docs | **`story_checks_out` — direct positive**, three of its seven unowned capabilities are exactly these. **This review — neutral**, doc lines and code lines both count. **Do not delete the comments; excerpt them.** |
| **F7** Add a linter + formatter | root (+1 config, +1 script, +1 devDependency) | ADDS one devDependency; makes an invisible convention machine-checked | **`base_fork_review` — positive**, a fork inherits the style. **`CLAUDE.md`'s anti-dependency directive — owner-gated.** Should be a written decision either way; five rounds of silence is the worst outcome. |
| **F8** Put playwright in the gate; widen the CI trigger | `package.json` (1 line), `.github/workflows/ci.yml` (1 line) | ADDS e2e to the gate; makes CI run on review branches | **`speed_review` / `spend_review` — small debit**, e2e is slow and CI minutes cost money. **`realtime_review` — direct positive**, `live-sync.spec.ts` is its only end-to-end evidence and it currently never runs. Consider a separate CI job rather than the pre-commit gate. |
| **F9** Land the retention TODO | `housekeeping.ts`, `shared/workers/retention.ts` | REMOVES the one TODO | **`scaling_review` — check first**, it owns the retention windows and should sign which one this belongs to. |

---

## CEILING

**96 is reachable; 100 is not, and the binding criterion changed.**

| Criterion | Wt | Cap | Why |
|---|---:|---:|---|
| Size & Scope | 0.12 | **~93** | **This is now the binding cap, and `reviews/` is not why.** 24 files are over 400 and the four largest are load-bearing product files — `agent.ts` 675 (the act-as-user executor), `help.ts` 594, `deep-link-screen.tsx` 573 (already split once), `api.ts` 566. Driving those under 400 means inventing indirection to satisfy a line count, which is the defect this rubric exists to punish. **The honest test is not length but whether a file does two jobs** — and by that test the only current offender is `store.ts` at 491. |
| Robustness | 0.22 | **~98** | Reachable. F1–F3 are 30 lines between them. The residual is that this round proved a four-round-old reader fault; a check layer verified only by its author has a demonstrated error rate, and 98 rather than 100 is what that costs. |
| Documentation | 0.16 | **~97** | Reachable after F5 and F6. The residual is structural: the census counts `POST /mcp` as **one** row where 24 machine-callable tool operations live behind `tools/call`. No commit to the generator fixes "route" as the unit. |
| Understandability | 0.20 | **~97** | Reachable. F7 is the whole path and it needs an owner decision. |
| Leanness | 0.15 | **~96 without `reviews/`, ~93 with** | **No longer the binding cap.** Duplication is 0.56% / 0.00% and zero worker dependencies is close to the rubric's ideal. The gap between tracked and archived is 3 points on this criterion and **1 point on the total.** |
| Scalability & Structure | 0.15 | **~96** | realtime and gateway remain outside `publish-seam` and `gating-seam` for structural reasons, covered by the census instead. The residual is that tenancy is quietly becoming the platform-operations worker — sharding, retention, orphan sweep, error digest, cron heartbeat — while its name says teams. That is an `architecture_review` question, not this one's. |

**Computed maximum, `reviews/` archived:**
```
0.12×93 = 11.16 · 0.22×98 = 21.56 · 0.16×97 = 15.52
0.20×97 = 19.40 · 0.15×96 = 14.40 · 0.15×96 = 14.40
11.16+21.56 = 32.72; +15.52 = 48.24; +19.40 = 67.64; +14.40 = 82.04; +14.40 = 96.44
→ 96
```

**96, and the path is nine items none of which is a redesign.** Round 4's ceiling
argument — *"the single thing standing between this codebase and a 95 is not its
code, it is what the audit of its code is doing to it"* — **did not survive
measurement.** `reviews/` grew 11.6% while the source grew 22.7%; the ratio fell;
the criterion it was supposed to cap is now the second-healthiest of the six. The
thing actually standing between this codebase and a 96 is 24 files over 400 lines,
three named check defects worth 30 lines of repair, and a linter nobody has been
allowed to add.

**The one item no commit fixes: single authorship.** Every one of the 772 tests,
26 laws and 105,839 documentation words was written by one party. Round 5 is the
first round with direct evidence of both the cost and the cure: four faults in the
module thirteen files read source through, and a law-existence check satisfied by
a comment, all found by readers who did not write what they were reading. **The
honest reading of a 94 is "very good, and now verified by someone other than its
author — which is exactly how the last four faults were found."**

---

**Verdict: 94/A. The best round of the five and the first with no criterion going
backwards for a real reason. The file that was item #1 for five consecutive
reviews is gone, split first and alone exactly as recommended, at eight times the
predicted cost and worth every line. The suite grew 30% and its duplication stayed
at zero. The campaign's own output is no longer the binding constraint — 24 files
over 400 lines is, and three of the checks guarding all of it can still be fooled
by a comment.**
