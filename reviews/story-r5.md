# Story checks out — round 5 — Brimba · 2026-08-26
SCORE: 89/100   (published: R1 71 · R2 68 · R3 68 · R4 **68** · the 2026-08-12 root run 98)

**Measured at `HEAD = f30f954` on branch `review-round5`, working tree clean at
the start of measurement.** *(A concurrent session appended live staging probes
to `timings.json` mid-run; it is generated data and not one of the 34 documents,
so no figure here moves.)*
Probe: `node ~/.claude/skills/story_checks_out_review/assets/probe.mjs .` → **34
documents, 105,839 words, 31 locked-decision markers**, `docMap.missing = []`,
`danglingLinks = []`. Raw output kept outside the repo. I wrote none of the
repairs I am scoring.

---

## FIRST — the round-4 arithmetic question, verified from the rubric text

The brief asks me to check, from the rubric myself, whether round 4 was wrong to
run criterion 1 as a running delta.

**I agree it was wrong, and I can quote the line.** `assets/rubric.md:20-30`:

> **DEFECT-scored** — starts at 100, loses points for each *confirmed* finding.
> Used where the property is "nothing is wrong".
>
> ```
> DEFECT:    criterion = clamp(0, 100, 100 − Σ penalties)
>              critical 30 · high 15 · medium 7 · minor 3
> ```

There is no carry-forward term anywhere in the file. The scale is absolute
(`100 − Σ penalties`), the severities are fixed, and the skill's own "when to
use" section says the review is re-runnable *"and that is the point"* — which
only means anything if each run stands alone. Round 4's line

```
10 (R3) +7 +7 −15 −15 −7 −7 = −20 → clamped to 0
```

starts from the previous round's *score*, not from 100, and awards *credit* for
closures — neither operation exists in the rubric.

**But I do not reproduce 72, and the difference is worth naming.** Applying
`100 − Σ penalties` to round 4's own confirmed criterion-1 list at its own HEAD —
2 HIGH (`MCP.md`'s phantom tool paragraph, `SCALING.md`'s self-contradicting
rationale) + 2 MEDIUM (`SCALING.md:378`, `CHANGELOG.md`) — gives

```
criterion 1 = 100 − (15 + 15 + 7 + 7) = 56
```

and re-totalling round 4's own table with 56 in row 1:

```
56×14 = 784 · 93×13 = 1209 · 46×12 = 552 · 88×10 = 880 · 87×9 = 783 · 93×9 = 837
72×8 = 576 · 83×6 = 498 · 86×6 = 516 · 61×8 = 488 · 88×5 = 440
784+1209 = 1993; +552 = 2545; +880 = 3425; +783 = 4208; +837 = 5045; +576 = 5621;
+498 = 6119; +516 = 6635; +488 = 7123; +440 = 7563   →  75.63  →  76
```

**Round 4, scored the rubric's way at its own HEAD, was 76 — not 68 and not 72.**
Criterion 1 alone was worth **+7.84 of total**, not +4.3. To land on 72 you need
criterion 1 ≈ 31, which requires charging round 4's carried mediums (M-518,
M-OPS-MIG, M-BUCKETS, M-ERRSRC, M-BUS…) against criterion 1 as well — and round 4
filed every one of those under criteria **7 and 8**, where it also priced them.
Counting them twice is the mirror-image of the error being corrected.

So: the reconciliation's diagnosis is right, its direction is right, and its
number is 4 points low. Both figures above are recomputable from numbers printed
here.

---

## DELTA

| # | Criterion | wt | R3 | R4 pub. | R4 *rubric-correct* | **R5** | code changed, or last measurement wrong? |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | Docs do not contradict each other | 14 | 10 | 0 | **56** | **80** | **both.** +56 is arithmetic (above). +24 is real: the law enumeration, the module count, the migration ranges, the bucket set, the error-source count and the threshold rationale all now agree with the code. 4 findings survive. |
| 2 | Locked decisions still stand | 13 | 93 | 93 | **93** | **100** | **last measurement wrong.** A defect criterion below 100 needs a *named confirmed finding*; R1–R4 all published 93 and none of them named the −7. All 31 markers re-cross-read; nothing violates one. A clean result is a real result. |
| 3 | Stated guarantees hold end to end | 12 | 45 | 46 | 46 | **71** | **code changed.** The census assertion no longer excludes `ANY` by method, both `/media` doors are published, `OPEN_BY_DESIGN` carries reasons *and* asserts the config value the reason depends on, and the vault check is a deny-list. Three gaps survive. |
| 4 | Depth proportional to reach | 10 | 86 | 88 | 88 | **96.5** | **mostly last measurement wrong.** All 8 of the probe's `referenced-everywhere-explained-nowhere` verdicts are false on reading — `BASE-MANUAL.md` §2.5 gives every one of them a canonical one-line home. Real part: `COSTS.md` arrived owned. |
| 5 | Every flow says what happens when it fails | 9 | 86 | 87 | 87 | **93** | **code changed**, net of one new finding (the cron's own failure path). |
| 6 | Edge cases addressed | 9 | 93 | 93 | 93 | **93** | **flat by coincidence, not by inaction.** M13 closed (−0 → +7); a different edge opened (−7). |
| 7 | Nothing is stale | 8 | 59 | 72 | 72 | **93** | **code changed.** Every stale-fact cluster rounds 1–4 tracked is closed, and most were closed *by pinning the fact to a check* rather than by hand. One survives. |
| 8 | Every reference resolves | 6 | 87 | 83 | 83 | **100** | **both.** Real: the two `skills/` links are gone and `ROUTE-CENSUS.md` is indexed. Measurement: all 7 `danglingPathRefs` confirm as **non-breaks** on reading; R4 priced two of them without opening them. |
| 9 | One name per concept | 6 | 86 | 86 | 86 | **87** | **flat.** The glossary was not touched this round either. |
| 10 | Every capability has an owning document · **GATE** | 8 | 57 | 61 | 61 | **82** | **both.** Real: MCP owned again, census indexed, `COSTS.md` born owned. Against: **seven** capabilities have no owning document, three of them shipped *this round*. |
| 11 | A newcomer can navigate it | 5 | 90 | 88 | 88 | **100** | **code changed.** `docMap.missing` is empty for the first time in the campaign. |

---

## Arithmetic

```
total = round( Σ (criterion × weight) / Σ weights ),  Σ weights = 100
```

| # | criterion | score | weight | product |
|---|---|---:|---:|---:|
| 1 | Docs do not contradict each other | 80 | 14 | 1120 |
| 2 | Locked decisions still stand | 100 | 13 | 1300 |
| 3 | Stated guarantees hold end to end | 71 | 12 | 852 |
| 4 | Depth proportional to reach | 96.5 | 10 | 965 |
| 5 | Every flow says what happens when it fails | 93 | 9 | 837 |
| 6 | Edge cases addressed | 93 | 9 | 837 |
| 7 | Nothing is stale | 93 | 8 | 744 |
| 8 | Every reference resolves | 100 | 6 | 600 |
| 9 | One name per concept | 87 | 6 | 522 |
| 10 | Every capability has an owning document (GATE) | 82 | 8 | 656 |
| 11 | A newcomer can navigate it | 100 | 5 | 500 |
| | **weights** | | **100** | **8933** |

`1120+1300 = 2420; +852 = 3272; +965 = 4237; +837 = 5074; +837 = 5911;`
`+744 = 6655; +600 = 7255; +522 = 7777; +656 = 8433; +500 = 8933.`
**8933 / 100 = 89.33 → SCORE 89.**

**Gate:** criterion 10 = 82 ≥ 50 → **no cap**. Corpus = 34 documents ≥ 3 → scored.

**Movement:** against the published 68, **+21**. Against round 4 recomputed the
rubric's way (76), **+13**. Of the published +21, **+7.84 is arithmetic** and
**+13.2 is the repair round**.

### Per-criterion defect arithmetic, printed

```
crit 1   100 − 7 − 7 − 3 − 3   = 80    (2 medium, 2 minor)
crit 2   100                    = 100   (no confirmed finding)
crit 3   100 − 15 − 7 − 7       = 71    (1 high, 2 medium)
crit 5   100 − 7                = 93    (1 medium)
crit 6   100 − 7                = 93    (1 medium)
crit 7   100 − 7                = 93    (1 medium)
crit 8   100                    = 100   (0 confirmed of 7 candidates)
```

Coverage criteria are itemised in their sections below.

---

## Confidence, stated rather than implied

**Criterion 1 is a floor of unknown depth.** I swept eleven structural-fact
families by hand (worker count · core/team/ops migration ranges · R2 buckets ·
error sources · law ids and enumeration · module count · read caps · AI daily
allowance · tool count · route census totals · test count) and re-checked all
fourteen of round 4's open doc-vs-code claims. **Thirteen of the fourteen are
fixed.** A contradiction outside those families would not have been found by this
run, and 105,839 words cannot be read exhaustively in one pass. Read 80 as *"no
contradiction survives in the eleven families anyone has ever checked"*, not as
*"there are exactly four"*.

---

## What was verified fixed (the brief's list, checked one by one)

| Claim in the brief | Verdict | Evidence at HEAD |
|---|---|---|
| Migration ranges | **FIXED** | core `0001`–`0019` on disk; `BOOTSTRAP.md:97,131` say `0001…0019`. ops = 2 on disk; `OPERATIONS.md:301` and `INVENTORY.md:62` name both. `OPERATIONS.md:45` de-brittles team migrations by pointing at `team-schema.ts` — *"never hand-count it, read it"*. |
| Bucket count | **FIXED** | 3 distinct `bucket_name`s in the wranglers; `INVENTORY.md:40-44` names all three with matching bindings. |
| Worker count | **FIXED** | 7 `wrangler.jsonc` dirs; 7 stated in 13 places. Every "six" is correctly about the `OPS`-binding subset. |
| Error-source count | **FIXED** | `ERROR-HANDLING.md:80-84` says *"eight of them: all seven workers, plus the browser… Six of the seven call `recordWorkerError` directly. The gateway is the exception on purpose"* — and that is exactly what the source does. |
| The dangling `skills/` path | **FIXED** | `README.md:72` now reads *"The skill lives with the maintainer's tooling (`~/.claude/skills/new-app/SKILL.md`), not in this repository, which is why nothing here links to it."* `danglingLinks = []`. |
| A superseded search layer | **FIXED** | `SEARCH.md:34` heads Layer 2 **"SUPERSEDED — do not use"** and states `serverSide` appears nowhere — verified: **0 occurrences** in `web/`, `workers/`, `shared/`. |
| Two plan docs describing a deleted subsystem as live | **FIXED** | `SCREEN-ENGINE-PLAN.md:3-25` and `AGENT-MODULES-PLAN.md:3-17` both open with dated removal banners naming every deleted artefact; `MCP.md:320` closes the loop. `screens:edit` and `set_screen_override`: **0 occurrences** outside `reviews/`. |
| The `80% → 80%` artefact | **FIXED, and better than asked** | `SCALING.md:66` states the threshold once. `:77-80` keeps a deliberate post-mortem quoting the broken text — *"A find-and-replace on prose is the same class of mistake as a regex scanner on source."* A naive grep hits it; it is not the artefact. |
| Law R15's text matches its check | **CONFIRMED** | `RULES.md:33` names three clauses (deaf publishers · dead listeners · every `listFetch` is a registry entry); `web/test/rules/live.test.ts` has exactly three `it(` blocks, one per clause, each with a blindness tripwire. |
| Law R11's scope is settled | **CONFIRMED** | `RULES.md:29` / `registry.ts:94`: *"Scope (settled 2026-08-25): this law governs… a bare global `fetch` and a **service binding**. A Durable Object RPC stub is out of scope."* Three DO sites named. |
| R20 says three lists | **CONFIRMED** | `RULES.md:38` names all three, and `meta.test.ts:53` asserts all three plus the page-source existence check. |
| R22 names two exemptions | **CONFIRMED** | `RULES.md:40` says *"today two"*; `CREATE_OPENS_RECORD_EXEMPT` holds exactly two, each with a reason; `ui.test.ts:104` forces XOR membership. |
| `rules.test.ts` split | **CONFIRMED, with a correction** | 1,203 lines / **29** checks → 8 files + `_paths.ts` / **1,578** lines / **32** checks. All 29 preserved; three are new (`doc-paths-resolve`, and the two new R15 directions). Largest file `meta.test.ts` **264**. |
| `COSTS.md` new · `ROUTE-CENSUS.md` regenerated | **CONFIRMED** | `COSTS.md` 1,133 words, 9 headings, indexed at `README.md:60`. Census: 60 POST + 41 GET + 10 ANY = **111 rows**; header claims **111 / 68 state-changing**. Gateway now shows **11** doors where round 4 measured 2 of 4. |

---

## Findings

### C1-a · MEDIUM — the canonical table reference is missing two core tables it was told to cover

`DATA-MODEL.md` (no row) · `README.md:126` · `CLAUDE.md:69` · `db/core/0019_nightly_state.sql`

`README.md:126` and `CLAUDE.md:69` both describe `DATA-MODEL.md` as covering
**"every table (global core + per-team)"**, and the document itself says at `:6`
*"This is the canonical data-model reference — keep it accurate."*

`db/core/0019_nightly_state.sql` creates **`cron_runs`** and **`db_sizes`**. Both
are core tables. Both are inside the migration range every runbook names
(`0001`–`0019`). Neither appears anywhere in `DATA-MODEL.md` — or in any other
document: `grep -rl db_sizes *.md` and `grep -rl cron_runs *.md` both return
nothing. `db_alerts`, created earlier by the same subsystem, **is** documented in
five places — so this is a miss, not a policy.

*The story doesn't check out because* two documents promise a complete table list
and the list is two tables short, one round after they shipped.

**Risk:** a fork owner reading `DATA-MODEL.md` to plan a backup, an export or a
core migration misses the nightly job's own state.

**Fix:** two rows in `DATA-MODEL.md` under GLOBAL core, in the existing shape.

### C1-b · MEDIUM — two documents state different module counts for the same named constant

`DATA-MODEL.md:255` · `AGENT-MODULES-PLAN.md:16` · `shared/team-modules.ts:8`

`DATA-MODEL.md:255-257`:

> then **24 boolean columns** = 6 modules × {read,create,edit,delete}. Modules:
> **Teams, Team members, Member roles, Learning, Help, Selectable data** — exactly
> our `TEAM_MODULES`.

`TEAM_MODULES` has **seven** entries: the six above plus `agent`.
`AGENT-MODULES-PLAN.md:16` says so in terms — *"`TEAM_MODULES` is seven modules
today, not eight"*.

The Glide history (24 = 6 × 4) is correct and worth keeping. The words **"exactly
our `TEAM_MODULES`"** are a present-tense claim about a constant, and they are
false.

**Risk:** the permission matrix is the spine. A reader who takes 6 as the module
count builds a role screen that is one row short.

**Fix:** one clause — *"…the six Glide modules, which are six of today's seven
`TEAM_MODULES` (`agent` was added later)."*

### C1-c · MINOR — the route census states "2 with no gate detected" above a table with ten such cells

`ROUTE-CENSUS.md:12` and the table below it

The headline reads **"111 routes · 68 state-changing · 2 with no gate detected."**
The table marks **ten** rows `**none detected**` — two auth, one data-ops, one
mcp, one tenancy (health probes), two gateway `/media` doors, one gateway `/t/`
shell, one realtime health, one realtime `/publish`.

The 2 is correct: `meta.test.ts:162` filters `r.changes && r.gates.length === 0`,
so only state-changing routes count. **Nothing on the page says so.** The
paragraph at `:14-17` explains the `ANY` convention and stops.

**Risk:** low — the facts underneath are right. But this document exists
precisely so *"a reviewer should inherit the surface, not rediscover it"*, and a
reviewer who counts the column gets 10.

**Fix:** four words in the generator — "2 **state-changing** with no gate
detected".

### C1-d · MINOR — the law-book and the registry state R15 with different exceptions

`RULES.md:33` · `shared/rules/registry.ts:122`

`registry.ts:122` spells out an exception the law-book omits: *"the one shape
allowed without one is a second server SCOPE of a resource that has a publisher,
and that is DERIVED, not written down"*. `RULES.md:33` states the dead-listener
clause with no exception at all.

The registry is the machine-readable pin for the law-book, and `registry-integrity`
asserts the **id sets** match — not the text. So the two halves of one law can
say different things and nothing goes red. This is the shape round 4 named as
*"a check that pins the number and leaves the sentence."*

**Fix:** one clause in `RULES.md:33`, copied from the registry.

### C3-a · HIGH — the guarantee "the check must be able to fail" is satisfied, for one law, by a comment

`README.md:85-86` · `web/test/rules/meta.test.ts:232-256` · `workers/data-ops/test/agent-parity.test.ts:1`

`README.md:85-86` states the strongest guarantee in the corpus:

> Adding a Law requires the rule, the registry entry, and a check — all three.
> **And the check must be able to fail.**

The mechanism is `meta.test.ts:232` — *"every enforced law has a check that
EXISTS"* — which builds a haystack of `` `${filename}\n${fileContents}` `` and
asks `haystack.includes(checkId)`. The check deliberately accepts *"an `it(...)`
title, a suite name, or the file's own name"* (`:239-240`).

For **R9 `agent-app-parity`** the string exists in exactly one place in the whole
test tree: a **line-1 comment**.

```
workers/data-ops/test/agent-parity.test.ts:1
// Law R9 — agent-app parity (`agent-app-parity`)…
```

The file is named `agent-parity.test.ts` (no `app`) and the `describe` at `:16`
reads `"agent-app parity (Law R9)…"` — a **space**, not a hyphen. So:

- delete R9's seven real assertions → the law still reports as checked;
- delete that one comment line → R9 goes red.

**The mechanism upholding the guarantee can be satisfied by prose about the
guarantee.** This is the eighteenth-and-a-half instance of the disease this
campaign has been hunting, and it lives in the keystone check.

*(R1 `publish-seam` resolves the same way, via file names — `meta.test.ts:248`
whitelists them explicitly, which is a declared exception rather than an
accident.)*

**Fix:** require the id to appear in a `describe`/`it` **title**, with the two
file-name exceptions named as data. Then rename R9's suite to carry the hyphen.

### C3-b · MEDIUM — "every source-scan strips comments before matching" has three live counter-examples

`README.md:86` · `shared/test/source.ts:104-153`

The comment-stripper was rebuilt this round after a regex literal containing a
quote made whole files leak their comments into what checks read as code. The fix
is real and load-bearing: with the regex-literal branch, **0 of 299 files leak**;
without it, **13 do**. Three input shapes still defeat it:

1. **A JSX self-closing tag whose last attribute is an expression.** `}` opens a
   regex per `OPENS_REGEX:104`, so `<Foo bar={1} />` puts the scanner into regex
   mode and the rest of the line is copied verbatim — including a trailing
   `// LIMIT 100 is not needed`. That is exactly the failure R14's bounded-lists
   check exists to prevent: a comment satisfying the bound whose absence it
   describes.
2. **The same shape swallows a JSX block comment** — `<Foo bar={x} /> {/* publishChange is deliberately skipped */}` survives as code, so an R1 scan reads a call that isn't one.
3. **An apostrophe in JSX text** opens a string that runs to the next apostrophe anywhere, preserving whatever lies between.

All three are **dormant on today's tree** — the house style uses `&apos;` and the
shapes do not occur. That is luck, not a mechanism, and the fault fixed this
round was dormant too until it wasn't.

**Fix:** the reader already has its own suite (`web/test/source.test.ts`). Three
fixture inputs, three assertions.

### C3-c · MEDIUM — the gating guarantee names a mechanism two workers do not have

`CLAUDE.md:33` · `workers/{gateway,realtime}/test/`

`CLAUDE.md:33` promises: *"No ungated door can ship, on either surface"*, enforced
by *"a per-worker `gating-seam` suite (beside `publish-seam`)"*.

Five workers have one (auth, tenancy, content, data-ops, mcp). **The gateway and
realtime have none** — and between them they carry 14 of the census's 111 doors,
including the two unauthenticated `/media` doors and the `POST /publish` fan-out.

The guarantee **does** hold: `route-census-current` (`meta.test.ts:115`) filters
every state-changing row with no gate against a reasoned `OPEN_BY_DESIGN` map,
and even asserts the `workers_dev:false` value the reasoning depends on. That is
a better check than a gating-seam suite would be. **The sentence naming the
mechanism does not mention it.**

*The story doesn't check out because* a maintainer adding a gateway route looks
for `workers/gateway/test/gating-seam.test.ts`, does not find it, and has no way
from the documents to learn what is covering them instead.

**Fix:** one clause in `CLAUDE.md:33` and the matching line in `RULES.md` R10 —
*"…and, for the gateway and realtime, by `route-census-current`, which fails on
any state-changing door not in `OPEN_BY_DESIGN`."*

### C5 · MEDIUM — the nightly job's own failure path exists in code and in no document

`db/core/0019_nightly_state.sql` · `workers/tenancy/src/lib/error-digest.ts` · `CONVENTIONS.md:192`

The cron gained a heartbeat this round, with a carefully reasoned failure model
written **inside the migration**:

> `cron_runs` is a heartbeat: one row, upserted, written LAST so that its
> timestamp means "the whole pass completed"… the nightly digest reads it before
> rewriting it and raises an error row when it is more than 26 hours stale. A
> MISSING heartbeat deliberately does not alarm.

No document contains any of this. The only doc sentence about cron failure is
`CONVENTIONS.md:192` — *"never let a cron failure escape"* — which is Law R12,
about recording, not about detecting a cron that stopped firing.

**Risk:** the quietest failure a scheduled system has is now instrumented and no
operator has been told. `OPERATIONS.md` is the 2am document and does not mention
it.

**Fix:** a short §Nightly job subsection in `OPERATIONS.md`, lifting the
migration's own wording — including the "missing heartbeat does not alarm" rule,
which is counter-intuitive enough that an operator will otherwise file it as a bug.

### C6 · MEDIUM — the deactivated parent with live children is in no document

`EDGE-CASES.md` (absent) · `workers/tenancy/test/selectable-reactivatable.test.ts`

The rubric's recurring edge list includes *"a deleted parent with live children"*.
In a deactivate-never-delete base the equivalent is: a dropdown value or a
learning category is deactivated while rows still reference it.

Round 4's `M13` (an invite outliving its role) is **closed** — `EDGE-CASES.md:489`
now owns it, and the doc's claim matches `invites.ts:179` exactly. The sibling
case is not owned anywhere. Fifteen sections in `EDGE-CASES.md` and none covers
it; `grep -rn -i "still referenced\|value still in use\|in use by" *.md` returns
one line, and it is about hard delete in `SCALING.md:430`.

The family is not hypothetical. `selectable-reactivatable.test.ts:1-6` records a
shipped bug of exactly this shape — a deactivated value vanished from its own list
with no way back, *"and left the MCP unable to reactivate it, since the id was no
longer listable."* **The rule now exists only inside that test's header comment.**

**Risk:** a ticket carrying a retired type; an edit form that silently drops the
value; an MCP caller that cannot restore it. Wrong behaviour, not corruption.

**Fix:** one `EDGE-CASES.md` section stating the rule once — retired parents stay
readable on existing rows, stay listed (flagged inactive) so they can be
reactivated, and are refused for *new* rows.

### C7 · MEDIUM — the fork's ops-database adoption instruction is one migration short

`BASE-IMPROVEMENTS.md:485`

> To adopt it, follow OPERATIONS.md — create the D1, apply
> `db/ops/0001_operations.sql`, add the `OPS` binding, run `scripts/move-to-ops.mjs`.

`db/ops/` holds two files. `OPERATIONS.md:301` and `INVENTORY.md:62` were both
corrected this round and now name both; this summary of them was not.

`README.md:57` describes this document as *"the running record of what each review
found and changed, **including what BREAKS for a fork already on the base**"* — so
it is written to be acted on, and the section it sits in is the fork-adoption
instruction for the operations database.

**Risk:** a fork applies `0001` only; `error_logs` has no `request_id` column, and
the tracing added in `0002` silently does nothing.

**Fix:** `0001…0002` — or better, `every file in db/ops/ in order`, matching the
wording `OPERATIONS.md` and `INVENTORY.md` already adopted, which cannot rot.

---

## Criterion 4 — depth vs reach, itemised

The probe flagged **25** concepts referenced in 5+ documents: 8
`referenced-everywhere-explained-nowhere`, 17 `thin-for-its-reach`. **The
confirmation rule changes almost all of it.**

I opened every one of the 8. **All 8 are false.** `BASE-MANUAL.md` §2.5 *"The
seams, by name"* / *"The tables you will meet"* (`:250-300`) gives each a
one-sentence canonical definition, and most have a second home:

| probe verdict | actually explained at |
|---|---|
| `publishUserChange` nowhere | `BASE-MANUAL.md:256`, `ARCHITECTURE.md:275`, `DURABLE-OBJECTS.md:252`, `CONVENTIONS.md:606` |
| `publishSignOut` nowhere | `BASE-MANUAL.md:257`, `DURABLE-OBJECTS.md:253`, `CONVENTIONS.md:608` |
| `applyUpdated` nowhere | `BASE-MANUAL.md:259`, `CACHING.md:383`, `RULES.md` R23 |
| `role_permissions` nowhere | `DATA-MODEL.md:253` (own heading), `BASE-MANUAL.md:283` |
| `sessions.team_pin` nowhere | `BASE-MANUAL.md:290`, `DATA-MODEL.md:224` |
| `record-detail-tabs` nowhere | `RULES.md` R2, `BASE-MANUAL.md:410`, `UI-CONVENTIONS.md:216`, `BUILD-A-MODULE.md:561` |
| `glossary-wellformed` nowhere | `RULES.md` R6, `BASE-MANUAL.md:414`, `UI-CONVENTIONS.md:219` |
| `story_checks_out` nowhere | **downgraded to thin, not rejected** — named as a ship gate in 7 documents with a threshold and no description of what it checks |

The probe scores by mentions-in-the-best-section; a crisp one-line definition
scores 1 and reads as "nowhere". That is the artefact rounds 1–4 priced.

| points | check | earned | working |
|---:|---|---:|---|
| 40 | no concept `explained-nowhere` | **40** | 0 of 25 confirmed |
| 25 | no 5+-doc concept `thin-for-its-reach` | **24** | 1 of 25 confirmed (`story_checks_out`) |
| 15 | top ten each have one canonical home | **13.5** | 9 of 10 (`story_checks_out` has none — it lives in `~/.claude/skills/`) |
| 10 | a glossary or terms section exists | **10** | `shared/glossary.ts` (23 terms, machine-checked by R6) + `BASE-MANUAL.md` §2.5 + `UI-CONVENTIONS.md:347` |
| 10 | explained before first use, or links to it | **9** | README's map and CLAUDE.md link out consistently; `pagedJson` and `story_checks_out` appear in `CLAUDE.md`/`CONVENTIONS.md` ahead of any definition or link |
| | **total** | **96.5** | |

---

## Criterion 9 — one name per concept, itemised

Measured dominance from the probe's own counts:

```
tenant unit   team 899 / 1071 = 84.0%      person   user 226 / 523 = 43.2%
data grouping module 369 / 856 = 43.1%     screen   screen 384 / 738 = 52.0%
permission    role 296 / 549 = 53.9%
```

On the raw grouping, 0 of 5 clear 85%. **Four of the five groups are not synonym
sets**, which the confirmation rule requires me to say rather than score:
`account` counts Cloudflare accounts and a person's account; `user` / `member` /
`person` are an identity, a user inside a team, and prose; `module` / `table` /
`collection` are three layers; `screen` / `page` / `route` likewise. Only *tenant
unit* is a genuine synonym set, and it misses by one point.

| points | check | earned | working |
|---:|---|---:|---|
| 40 | one clearly dominant term per group | **32** | 4 of 5 groups are not drift; the one real set is 84.0% |
| 25 | a document states each coexisting distinction deliberately | **20** | glossary fixes Team/Member/Role/Access right; `DATA-MODEL.md` separates `users` from `team_members`; **nothing states team vs tenant vs account** |
| 20 | the dominant term matches code and UI | **20** | `TEAM_MODULES`, `team_members`, `member_roles`, `role_permissions` |
| 15 | a glossary fixes the vocabulary | **15** | `shared/glossary.ts`, R6-enforced |
| | **total** | **87** | |

---

## Criterion 10 — the capability matrix (`--foundation`)

Capabilities enumerated from `README.md`'s map, `ARCHITECTURE.md`'s locks,
`BASE-MANUAL.md` §2–§4 and `RULES.md` — not hardcoded. **25 found, 7 unowned.**

| Capability | (a) DOCUMENTED | (b) MACHINE-CHECKED | (c) SCALES | (d) REUSABLE |
|---|---|---|---|---|
| Multitenancy · per-team D1 | yes — DATA-MODEL, BASE-MANUAL §1 | yes — gating suites | yes — SCALING §3, `sharding.ts` on disk | yes |
| Permission spine | yes — BASE-MANUAL §2, R10 | yes — 5 `gating-seam` suites **+ census for the other 2** (C3-c) | yes | yes — `requireRight` |
| Privilege guard — GRANT half | yes — BASE-IMPROVEMENTS:111 | yes — `roles.test.ts` | n/a | partial |
| **Privilege guard — ASSIGN half** (`assertCanAssignRole`) | **NO — zero root documents** | yes | n/a | partial |
| Live-sync | yes — CACHING, DURABLE-OBJECTS | yes — `publish-seam`, `live-collections` ×3 | yes | yes |
| Auth + sessions | yes | yes — `auth/gating-seam` | yes | yes |
| AI agent | yes — EDGE-CASES §4–§8 | yes — `agent-app-parity` **(C3-a)**, `agent-filter-parity` | yes | yes |
| Agentic import | yes — AGENTIC-IMPORT | yes — `catalog-coverage` | yes | yes |
| Exports | yes — AGENTIC-IMPORT, MCP | yes | yes | yes |
| MCP surface | **yes — repaired** (`MCP.md:320`) | yes | yes | yes |
| Error store | yes — ERROR-HANDLING (**now correct on all 8 sources**) | yes — `error-seam` | yes | yes |
| **Nightly error digest** (the base's only alarm) | **NO** | partial | n/a | yes — `error-digest.ts` |
| **Cron heartbeat + 26h staleness alarm** | **NO** (C5) | no | n/a | yes |
| **Per-tenant storage meter** (`db_sizes`) | **NO** | no | yes — 90-day rule shipped in the same migration | yes |
| Sharding + size alarm | yes — SCALING §3, rationale repaired | no check pins the threshold | yes | yes |
| Retention + orphan sweep | yes — SCALING, OPERATIONS §Retention | yes — `retention.test.ts` | yes | yes — `housekeeping.ts` |
| Screen engine | yes — SCREEN-ENGINE-PLAN (banner-scoped), R20 | yes — `static-destinations` (3 lists) | yes | yes |
| Ship pipeline | yes — OPERATIONS, BOOTSTRAP | partial | yes | yes |
| Route census | **yes — now indexed** at README:59 | yes — equality + floor + per-worker | n/a | yes |
| Performance budgets | yes — OPERATIONS §Performance budgets | **NO — `timings.mjs` is in no gate** | n/a | yes |
| Secrets vault | yes — SECRETS (**check now a deny-list**) | yes | n/a | yes |
| Cost model | **yes — COSTS.md, born owned** | no | n/a | yes |
| **The law reader** (`shared/test/source.ts`) | **NO** — 13 files depend on it | yes — `web/test/source.test.ts` (new) | n/a | yes |
| **`shared/test/gating-seam.ts`** | **NO** (`publish-seam.ts` is in CONVENTIONS) | n/a | n/a | yes |
| **`doc-paths-resolve`** | **NO** — a check with no law and no document | itself | n/a | yes |

| points | check | earned | working |
|---:|---|---:|---|
| 50 | every capability has exactly one owner | **36** | 18 of 25 owned |
| 20 | no capability owned by two disagreeing docs | **20** | none found |
| 15 | the owning doc is current | **11** | `DATA-MODEL.md` is two core tables short (C1-a) |
| 15 | cross-cutting concerns each have a home | **15** | auth, tenancy, errors, realtime all owned |
| | **total** | **82** | ≥ 50 → no cap |

**Three of the seven unowned capabilities shipped this round.** Round 4 celebrated
`timings.mjs` as *"the first time a new check-layer module was born owned."*
`COSTS.md` repeated it. The error digest, the cron heartbeat and the storage meter
did not — and each carries a first-class explanation **inside its own file**, some
of the best writing in the repository, reachable only by someone who already knows
the file exists.

---

## Criterion 11 — navigability, itemised

| points | check | earned | evidence |
|---:|---|---:|---|
| 30 | a document map indexes every doc | **30** | `docMap.missing = []` — first time in the campaign. `ROUTE-CENSUS.md`, `CHANGELOG.md`, `COSTS.md` all now indexed |
| 25 | one obvious entry point | **25** | `README.md` + `AGENTS.md` → `CLAUDE.md` |
| 20 | each doc opens saying what it covers | **20** | all 34, including the 45-word `AGENTS.md` and the generated `ROUTE-CENSUS.md` |
| 15 | reading order stated for the core set | **15** | `README.md:47-55` plus the numbered 0–15 list |
| 10 | no doc over ~5,000 words without internal navigation | **10** | the nine longest carry 14–35 headings each |
| | **total** | **100** | |

---

## RANKED FIX LIST

| # | Fix | Criterion | Worth | Cost |
|---:|---|---|---:|---|
| 1 | Require a law's `checkId` in a `describe`/`it` **title**, with the two file-name exceptions as data; rename R9's suite to carry the hyphen | 3 | **+15 → +1.80 total** | ~6 lines in `meta.test.ts`, 1 word in `agent-parity.test.ts` |
| 2 | Own the three new capabilities: an `OPERATIONS.md` §Nightly job (digest + heartbeat + the "missing does not alarm" rule) and a `SCALING.md` line for `db_sizes` | 10, 5 | **+6 (crit 10) +7 (crit 5) → +1.11** | ~20 lines, lifted from the migration's own comments |
| 3 | Two `DATA-MODEL.md` rows for `cron_runs` and `db_sizes` | 1, 10 | **+7 (crit 1) +4 (crit 10) → +1.30** | 2 rows |
| 4 | Three fixture inputs in `web/test/source.test.ts` for the JSX `/>`, JSX-comment and apostrophe shapes; fix the stripper | 3 | **+7 → +0.84** | ~15 lines |
| 5 | One `EDGE-CASES.md` section: the retired parent with live children | 6 | **+7 → +0.63** | ~15 lines |
| 6 | Name `route-census-current` in `CLAUDE.md:33` and `RULES.md` R10 as what covers gateway + realtime | 3 | **+7 → +0.84** | 1 clause × 2 |
| 7 | Document `assertCanAssignRole` beside the GRANT half | 10 | **+2 → +0.16** | ~8 lines |
| 8 | `DATA-MODEL.md:255` — "six of today's seven `TEAM_MODULES`" | 1 | **+7 → +0.98** | 1 clause |
| 9 | `BASE-IMPROVEMENTS.md:485` — "every file in `db/ops/` in order" | 7 | **+7 → +0.56** | 1 clause |
| 10 | `RULES.md:33` — copy the registry's derived-scope exception | 1 | **+3 → +0.42** | 1 clause |
| 11 | Census generator: "2 **state-changing** with no gate detected" | 1 | **+3 → +0.42** | 4 words |
| 12 | A sentence somewhere stating team vs tenant vs account | 9 | **+5 → +0.30** | 1 sentence |

Items 1–11 together are **+9.06**, landing the total at **98.4 → 98**. Every one
of them is a clause, a row or a fixture. **The story is one afternoon from 98,
and none of that afternoon is a redesign** — which is a different situation from
every previous round, where the ceiling argument was about rate.

---

## FIX IMPACT MAP

| Fix | Files | ADDS / REMOVES | Which other review could this damage? |
|---|---|---|---|
| **1** Title-based law-existence check | `web/test/rules/meta.test.ts` (~6), `workers/data-ops/test/agent-parity.test.ts` (1 word) | REMOVES the last comment-satisfiable law check | **`lean_mean_review` — trivial debit**, ~6 lines in a directory it just spent 194 lines splitting. **Sequencing:** land it *inside* `meta.test.ts`, which is already the largest file at 264 — it stays under 275. **`interfacelessness_review` — positive:** R9 is the agent/app parity law it depends on. |
| **2** `OPERATIONS.md` §Nightly job | `OPERATIONS.md` (~20) | ADDS the operator's view of the alarm | **`error_log_review` — direct positive**, this is its subject. **`mac_fell_in_the_ocean_review` — positive**, the 2am runbook gets the one alarm that exists. **`spend_review` — check first:** the digest sends mail; say what it costs per night or that review will re-find it. |
| **3** Two `DATA-MODEL.md` rows | `DATA-MODEL.md` (2) | REMOVES a completeness contradiction | none. **`scaling_review` — mildly positive** (`db_sizes` is its growth meter and it is currently invisible from the docs). |
| **4** Stripper fixtures | `shared/test/source.ts` (~8), `web/test/source.test.ts` (~15) | REMOVES three latent blind spots | **`lean_mean_review` — small debit**, +23 test lines. **Everything downstream — positive:** 13 files read source through this module, so every law check inherits the fix. **Risk to watch:** a stricter stripper could newly *strip* something a check relies on; run it against all 299 files and diff, as this round's repair did. |
| **5** `EDGE-CASES.md` retired-parent section | `EDGE-CASES.md` (~15) | ADDS a rule that exists only in a test header | **`dead_end_review` — positive**, the reactivation dead-end is its territory. **`first_run_review` — none.** |
| **6** Name the census in the gating guarantee | `CLAUDE.md`, `RULES.md` (1 clause each) | REMOVES a mechanism gap | **`security_sentry_review` — positive**, it reads `CLAUDE.md:33` first and would otherwise conclude two workers are unchecked. |
| **7** Document `assertCanAssignRole` | `CONVENTIONS.md` or `BASE-MANUAL.md` §2 (~8) | ADDS the only description of the control | **`security_sentry_review` — should sign the wording.** Writing down how the guard derives its comparison publishes the shape of a server-side control. Not a secret; still its call, as round 4 said. |
| **8–11** the four one-clause corrections | 4 docs, 1 line each | REMOVES 4 stale/ambiguous statements | none — mechanical. **But:** #9 and #11 are facts a check could pin. `doc-paths-resolve` proved the pattern works; extending it to *counts* is the durable version of #3, #8 and #9 together. |
| **12** The tenant/team/account sentence | `BASE-MANUAL.md` §2.5 (1 sentence) | ADDS the missing deliberate distinction | **`base_fork_review` — positive**, a fork renaming the tenant needs to know which word is the concept. |

---

## CEILING

**98 is reachable and the arithmetic is above.** The four criteria that cannot
reach 100 today:

| Criterion | wt | Cap | Why |
|---|---:|---:|---|
| 4 · Depth vs reach | 10 | **96.5 → ~99** | `story_checks_out` is a skill in `~/.claude/skills/`, named as a ship gate in 7 documents. A sentence saying what it checks costs 0.35. |
| 9 · One name per concept | 6 | **~92** | The probe's grouping conflates four genuine distinctions with drift. Even a perfect corpus cannot clear the 85% row on *tenant unit* without deleting the word "tenant" from the architecture prose, which would be worse writing. **This is a rubric artefact, and the honest cap is the rubric's.** |
| 10 · Capability ownership | 8 | **100** | Reachable — seven paragraphs. |
| 1 · No contradictions | 14 | **~93 sustained** | Round 4's rate argument was right and is now half-answered: `doc-paths-resolve` pins **412 paths across 35 documents** so that class of drift cannot recur. No equivalent exists for *counts*, which is where all four surviving findings live. |

**True maximum today: 98.** Round 4 predicted a sustained ceiling of 88 and named
the path — *"F5, applied seventeen times, and every application is a debit against
`lean_mean_review`… `rules.test.ts` must be split into a directory first."* **That
sequencing was taken, and it worked.** The split cost 194 lines, and the checks
that landed in it afterwards cost 181 more for three new laws-worth of coverage.
The tension round 4 called *"the single most important thing this review has to
hand back to the campaign"* was resolved by doing exactly what it asked, in
exactly the order it asked.

**The one item no commit fixes remains single authorship** — and this round is the
first evidence of what it costs *and* of the workaround. Every one of the four
faults in `shared/test/source.ts`, and the R9 comment-satisfied check, was found
by an agent that did not write the thing it was reading. That is the only reader
this corpus has who did not write it, and it works. It costs about 1 point,
unchanged.

---

## THINGS NO RUBRIC ASKED ABOUT

**1 · Eleven regenerable review artefacts sit at the repository root, four of them
stating scores the campaign has superseded.**

```
lean-mean-report.md      2026-08-18   "Overall 97/100 (Grade A)"     vs reviews/lean-mean-r4.md  93
story-review.md          2026-08-12   the run scored 98              vs reviews/story-r4.md      68
architecture-review.md   2026-08-18   "96/100"
activity-log-review.md   2026-08-18   "94/100"
ocean-review.md          2026-08-12   "518 tests green"              — the last surviving 518 claim
+ security-report.md, interface-lessness-report.md, and four .html twins
```

1,700 tracked lines, unindexed by `README.md`, dated before the campaign began.
**I have not scored these**, because the skill excludes `*-review.md` /
`*-report.md` from the corpus by design and `doc-paths-resolve` reasons them out
in terms — *"Generated reports are OUTPUT, not canon."* That exclusion is about
**paths inside them**. It is not about a reader running `ls *.md` and finding a
lean-mean report claiming 97 sitting beside a README that links neither. **Had
they been in scope, criterion 7 would be 86 and the total 88.** The cheapest fix
is the one `.gitignore` already applies to `/architecture-blueprint.html`.

**2 · `doc-paths-resolve` is real, it is doing work, and its glob branch checks
nothing past the first segment.**

It matched **412 paths across 35 root documents with 0 dangling** — this is not a
decorative check. But `doc-facts.test.ts:52-56`:

```js
const [head] = claimed.split("*")
const dir = join(ROOT, head.slice(0, head.lastIndexOf("/")))
if (!EXEMPT[claimed] && !existsSync(dir)) dangling.push(…)
```

The comment says *"accept the claim if ANY sibling matches"*; the code resolves
only the directory before the first `*` and discards the tail. Proven:
`workers/*/test/there-is-no-such-file.test.ts` resolves to `workers`, which
exists, and **passes**. Every `workers/*/…` claim in the canon is unchecked past
the word `workers`.

Its own header says it exists because *"splitting one test file into eight left
fifteen dangling pointers across the canon while the build stayed green."* Run its
exact logic over the **70 non-root** `.md` files and there are **1,263 backticked
repo paths, 113 of them dangling — over 100 pointing at `web/test/rules.test.ts`**,
the very file whose split it was written for. Those are `reviews/` and
`.session-notes/`, deliberately out of scope. Worth knowing before someone
believes the check covers the repository.

**3 · Two law checks bypass the fix that was made for them.** `workerSources()`
now skips `node_modules` and requires a `src/` directory — that repair is correct
and I verified both halves. But `web/test/rules/worker.test.ts:34-36` and
`web/test/rules/meta.test.ts:190` still enumerate `workers/*` themselves, with
neither guard. `workers/node_modules` does not exist today, so both are green; the
failure mode that turned thirteen checks red this round survives in two of them.
`web/test/rules/_paths.ts` says in its own header that a per-check reader *"is how
a check goes blind."*

**4 · The best documentation written this round is not in a document.**
`db/core/0019_nightly_state.sql` opens with 33 lines explaining why a heartbeat is
written *last*, why a *missing* heartbeat deliberately does not alarm, and why the
storage meter's 90-day rule ships in the same migration that creates the table.
`error-digest.ts` explains why the window is seven days and not twenty-four, and
why *"a digest that mails '0 errors' every night trains the one person who reads
it to delete it unread."* This is better than most of the corpus. It is in two
files a documentation reader will never open, and it is the direct cause of three
of the seven unowned capabilities in criterion 10. **The habit that produces
excellent comments is the same habit that is producing undocumented capabilities.**

---

**Verdict: the story now largely checks out — 1 high, 6 medium, 2 minor, against
2 high / 12 medium / 6 minor last round. 89, up from a published 68 and a
rubric-correct 76. The one that matters most is that the guarantee "a check must
be able to fail" is itself upheld, for Law R9, by a comment saying it is.**
