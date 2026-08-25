# Lean Mean review — Brimba · 2026-08-25 · ROUND 4
SCORE: 93/100 (Grade A)   (round 1: 89 · round 2: 91 · round 3: 92)

## Method, and three things that must be said before any number

**Measured at `HEAD = d9741c6`, pinned via a `git clone` into
`…/scratchpad/g4-sandbox`.** The repository was never written to.

**1 · The tree moved twice while I measured and is still moving.**
`d9741c6` → `520b0cb` → `fb61e02`. The first move touched only `reviews/LEDGER.md`
(+21) and `reviews/LESSONS.md` (+77) — zero source. The second added **+27 product
lines** (`workers/data-ops/src/lib/tools.ts` +26, `web/lib/agent-trace.ts` +1). Scoring
`fb61e02` instead would move non-test source 30,942 → 30,969 (+0.09 %) and change no
criterion. Everything below is the commit.

**2 · Round 3's published absolutes do not reproduce — they run ~1 line high per file.**
`rules.test.ts` 1,151 published vs **1,150** re-measured; `sharding.ts` 583 vs **582**;
`it()` 598 vs **597**. So both HEADs were re-measured with the same script and the
**deltas** are the trustworthy figures, not round-3-minus-mine. Internal check:
40,486 + 359 = 40,845, and `git diff --numstat 256d21b d9741c6` = +393 / −34 = **+359**. ✓

**3 · Round 3 could only partially measure the suite. This round it is fully measured,
and I chased a false negative rather than reporting it.** The first `tsc` run showed one
error per worker — `Cannot find type definition file for '@cloudflare/workers-types'`, a
sandbox artefact from not copying `workers/*/node_modules`. After copying, **all 8
projects exit 0**. Proof `tsc` is not a silent no-op: `tsc -p web --listFiles` enumerates
**125** non-`node_modules` files. And `web/test/fork.test.ts` — which round 3 could not
run — **passes**, because the sandbox is a real `git clone` rather than a `cp -R`, so its
`git ls-files` shell-out works.

---

## DELTA

| Criterion | Wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---|---|---|---|---|
| Size & Scope | 0.12 | 91 | 90 | 88 | **89 ▲** | **Files over 400 held FLAT at 21.** The six-agent bloat round 3 penalised did not continue — source grew +359 lines (+0.9 %) across 11 files. But nothing came back either, and **`rules.test.ts` grew +41 to 1,191 while gaining ZERO checks.** +1, not more. |
| Robustness | 0.22 | 87 | 93 | 94 | **96 ▲** | **`npm run check` moves from *partially* to *fully* measured: 646 tests, 71 files, 0 failures, `tsc` 8/8 exit 0.** Plus the census now parses all seven workers with a byte-exact document-vs-generator equality. Held back by two NEW blind spots — one in the census, one the 5xx repair created. |
| Documentation | 0.16 | 89 | 92 | 91 | **93 ▲** | **F-DOWN-2 substantially repaired.** The generated, committed, machine-checked document that was false is now true about all seven workers. It is still false about two doors, and **three files in this repo state three different state-changing counts.** |
| Understandability | 0.20 | 91 | 91 | 93 | **93 =** | `stripComments` still 1, 11 importers, comment ratio 22.3 %. Cancelled: `sharding.ts` 582 → 590, still two jobs; and 29 checks in **one** `describe` in a 1,191-line file. |
| Leanness | 0.15 | 88 | 90 | 93 | **91 ▼** | Duplication **flat on both axes** — round 3's win holds in full. Outweighed by `reviews/` growing **+7,161 tracked lines, twenty times the source growth**, to 26,473 lines — **0.86× the entire non-test source of the product.** |
| Scalability & Structure | 0.15 | 91 | 92 | 92 | **93 ▲** | The census is now one derived command covering all seven workers, so realtime and gateway are no longer *invisible* — though they are still outside `publish-seam` and `gating-seam`. |

**One criterion went DOWN, and for the first time this campaign it is not a repair that
caused it — it is the campaign's own output.** `reviews/` is now 55 files and 26,473
lines of regenerable text tracked in git.

---

## Arithmetic

Rubric weights (`~/.claude/skills/lean_mean_review/reference/rubric.md`), unmodified:
`overall = 0.12·size + 0.22·robustness + 0.16·docs + 0.20·understandability + 0.15·leanness + 0.15·scalability`

```
0.12 × 89 = 10.68
0.22 × 96 = 21.12
0.16 × 93 = 14.88
0.20 × 93 = 18.60
0.15 × 91 = 13.65
0.15 × 93 = 13.95
```
`10.68 + 21.12 = 31.80; +14.88 = 46.68; +18.60 = 65.28; +13.65 = 78.93; +13.95 = 92.88`
**92.88 → SCORE 93 (Grade A).** Round 3 recomputed from its own table: `10.56 + 20.68 +
14.56 + 18.60 + 13.95 + 13.80 = 92.15 → 92`. **Movement: +0.73.**

---

## Baseline counts — R3 vs R4, same script both times

| Measure | R3 (`256d21b`, re-measured) | **R4 (`d9741c6`)** | Δ |
|---|---|---|---|
| Tracked source (.ts/.tsx/.mjs/.sql/.css) | 40,486 / 297 files | **40,845 / 298** | **+359 / +1** |
| — test code | 9,712 / 76 | **9,903 / 76** | +191 / 0 |
| — non-test source | 30,774 / 221 | **30,942 / 222** | **+168 / +1** |
| Test : non-test ratio | 31.6 % | **32.0 %** | +0.4 pt |
| **Files > 400 lines** | 21 / 297 | **21 / 298** | **= FLAT** |
| **`web/test/rules.test.ts`** | 1,150 lines, **29** checks | **1,191 lines, 29 checks** | **+41 / +0** |
| `workers/tenancy/src/lib/sharding.ts` | 582 | **590** | +8 |
| `it()` blocks (static) | 597 | **601** | +4 |
| **Tests actually executed** | *partially measured* | **646 passed / 0 failed / 71 files** | **now fully measured** |
| **`tsc --noEmit`, 8 projects** | *unmeasured* | **exit 0, 0 errors** | **now fully measured** |
| Dup 8-line windows, product src | 287 / 22,815 = 1.26 % | 287 / 22,858 = **1.26 %** | **flat** |
| Dup 8-line windows, tests | 0 / 6,841 = 0.00 % | 0 / 7,010 = **0.00 %** | **flat** |
| `stripComments` definitions | 1 | **1** | = |
| Files importing `shared/test/source.ts` | 11 | **11** | = |
| Comment ratio, non-test | 22.1 % | **22.3 %** | +0.2 pt |
| TODO / FIXME in code | 0 | **0** | = |
| Runtime deps in workers | 0 in 7/7 | **0 in 7/7** | = |
| Linter / formatter config | none | **none tracked anywhere** | = |
| Lockfiles tracked | 2 | **2** | = |
| **Tracked `reviews/` artifacts** | 39 files / 19,312 | **55 files / 26,473** | **+16 / +7,161** |
| Root `.md` | 41 / 10,499 | **41 / 10,548** | +49 |
| Root `.md` : non-test source | 0.34 | **0.34** | = |
| **`reviews/` : non-test source** | 0.63 | **0.86** | **+0.23** |

**A duplication caveat, flagged rather than hidden.** My absolutes (1.26 % / 0.00 %)
differ from round 3's (1.00 % / 0.01 %) because round 3's normaliser also stripped
comments and mine does not. **The delta — flat on both axes — is what is trustworthy**,
and it means round 3's headline test-duplication win (1.39 % → 0.01 %) is fully held.

**The 21 files over 400**, sorted: `rules.test.ts` 1191 · `agent.ts` 669 · `sharding.ts`
590 · `api.ts` 561 · `deep-link-screen.tsx` 554 · `store.test.ts` 550 · `import.ts` 543 ·
`teams.ts` 527 · `import-screen.tsx` 523 · `types.ts` 514 · `learning.ts` 504 · `help.ts`
494 · `model.ts` 489 · `roles.ts` 461 · `tool-catalog.ts` 446 · `import-plan.ts` 428 ·
`team-schema.ts` 425 · `use-agent-chat.tsx` 425 · `retention.test.ts` 422 ·
`build-blueprint.mjs` 417 · `screens.ts` 412.

---

## THE ANSWER TO THE QUESTION YOU ASKED

> *`rules.test.ts` has grown further this round. Say plainly where it stands, whether the
> split is still free, and what the honest ceiling is now.*

### Where it stands

**1,191 lines. 29 `it()` blocks. 27 distinct check-id prefixes. ONE `describe`.**

```
R2  1,069   27 checks
R3  1,150   29 checks   (+81 / +2)
R4  1,191   29 checks   (+41 / +0)
```

**It grew and bought nothing.** All 41 lines went into hardening the *existing*
`route-census-current` check — the floor raised from `> 60` to `> 90`, per-worker presence
assertions for four workers, a minimum-length assertion on each exemption reason, and a
`workers_dev` assertion. Every one of those is a good change. **Not one of them is a new
law.** For the first time in the series, the file that has been item #1 for **five
consecutive reviews** grew purely in weight.

A counting note, because the brief warns about probes: `grep -c '\bit('` returns **30**.
One hit is inside a comment at `:1166`. The real figure is 29, and vitest settles it —
`Tests 29 passed (29)`.

### Is the split still free?

**Mechanically, yes — and I verified the property that makes it so rather than assuming
it.** The `describe` block at `:50` holds **no shared state**. Every `const` in the file
is declared *inside* an `it`. The only file-scope bindings are three path constants
(`HERE`, `WEB`, `ROOT`) and the import block. There is no `beforeEach`, no fixture, no
ordering dependency. Twenty-nine independent checks sharing one set of imports.

**Financially, it stopped being free somewhere around round 2.** Each extracted file needs
its own preamble. Costed honestly, for the natural six-way thematic split
(`web/test/rules/{ui,worker,doc-facts,live,count,meta}.test.ts`):

```
  6 files × ~5 lines of import + describe preamble      +30
  1 shared web/test/rules/_paths.ts exporting ROOT       +5
  minus the monolith's own preamble, absorbed           −10
  ------------------------------------------------------------
  net                                                   +25 lines
  and the largest resulting file lands near 250, well under 400
```

**+25 lines to take 1,191 lines off the worst file in the repository, with every part
under the 400-line threshold.** That is still an outstanding trade. A 29-way split would
cost ~120 lines and is the wrong shape.

**But the window is closing, and I can name the rate.** The split costs one preamble per
*file*, not per check — so it does not get much more expensive as checks accumulate. What
does get worse is the cost of *not* doing it: every fact-pinning check this campaign
recommends lands in this one file. Counting only the four already written up today:

| source | proposed addition | lines |
|---|---|---|
| `story-r4` F5 | three cheapest fact checks (OPS bindings · ops migrations · bucket set) | +14 |
| `story-r4` F3 | invert the vault check to a deny-list | +6 |
| `story-r4` F4 | declare the two `ANY` census exemptions | +4 |
| `error-log-r4` F5 | (in `error-seam.test.ts`, not here) | — |
| | **total landing in `rules.test.ts`** | **+24** |

**1,215 by the end of the next repair pass, on today's recommendations alone.** My
recommendation to the campaign is explicit: **do the split FIRST, and land those checks
into it.** Landing them before the split makes the split fractionally harder and this
criterion fractionally worse for no benefit. This is the single most important
sequencing decision the repair session has to make, and it costs nothing to get right.

### The honest ceiling — for this file and for the score

**For the file: ~250 lines per part, six parts, achievable this week.** Nothing structural
prevents it. It is the cheapest large win available in this review and it has been
deferred five times.

**For Size & Scope: the honest cap is ~94, not 100.** Even after the split, 20 files
remain over 400, and the four worst are *product* files whose size is load-bearing:
`agent.ts` 669 (the act-as-user executor), `api.ts` 561, `deep-link-screen.tsx` 554 (round
3 already split it once), `import.ts` 543. Driving those under 400 means inventing
indirection to satisfy a line count, which is the exact defect this rubric exists to
punish. **A file being long is not automatically a defect; a file doing two jobs is** —
and by that test the only genuine offenders are `rules.test.ts` (29 unrelated checks) and
`sharding.ts` (sizing + retention, 590 lines).

---

## Findings

### F-UP-1 · The route census is fixed at the WORKER level and still wrong at the DOOR level

The brief says the blindness "is fixed." **At the worker level that is exactly true and it
is the round's best repair.** All seven workers now parse:

| worker | R3 | **R4** | my independent count |
|---|---:|---:|---:|
| tenancy | 34 | 34 | 34 ✓ |
| data-ops | 23 | 23 | 23 ✓ |
| content | 19 | 19 | 19 ✓ |
| auth | 13 | 13 | 13 ✓ |
| mcp | 5 | 5 | 5 ✓ |
| realtime | **absent** | **3** | 3 ✓ |
| gateway | **absent** | **2** | **4** ✗ |
| **total** | **94 (5 workers)** | **99 (7)** | **101** |

Plus an **exact document-vs-generator equality** — `expect(render(rows)).toBe(read(
"ROUTE-CENSUS.md"))` — verified byte-for-byte at 9,535 bytes. The document can no longer
drift from the generator at all. That is the strongest check shape in this repository.

**The residual is a provable regex bug, not a judgement call.** `scripts/route-census.mjs`
matches the if-chain shape with

```js
/(?:url\.)?pathname (?:===|\.startsWith\()\s*"([^"]+)"…/
```

There is a **literal space** between `pathname` and the alternation. Real code writes
`pathname.startsWith("/media/")` with no space, so the `\.startsWith\(` branch is **dead
code that can never fire**:

```
.test('pathname.startsWith("/api/auth/")')  →  false
.test('pathname .startsWith("/x")')         →  true
```

The gateway has **11** `pathname.startsWith(` literals; the census sees **0**. Six are
proxy prefixes and are fairly excluded (their targets are counted downstream). **Two are
the gateway's own doors:**

```
workers/gateway/src/index.ts:275  if (pathname.startsWith("/media/learning/") && request.method === "GET")
workers/gateway/src/index.ts:283  if (pathname.startsWith("/media/")          && request.method === "GET")
```

Both serve R2 by a **caller-supplied key with no authentication** — a path-shape check,
then `serveObject(env.MEDIA, key, request)`. They are the most exposed unauthenticated
doors in the base, they are the standing `/media` predictable-key LOW carried since
2026-07-02, and they are **absent from the document whose stated purpose is "a reviewer
should inherit the surface, not rediscover it."**

**The fix is one character:** change the space to `\s*`.

**Two further weaknesses, both real, both smaller:**
- The tripwire is a **floor** (`> 90`) against 99 — **9 doors of silent slack.** The exact
  equality beside it covers the document, but a *simultaneous* change to generator and
  document that loses up to 9 doors passes both. `workers/auth/test/gating-seam.test.ts:82`
  uses `toBe(allCases.length)` for precisely this reason.
- `census()` wraps each `index.ts` read in `try { … } catch { continue }` — **a whole
  worker can vanish with no error.** That is exactly how realtime and gateway went
  missing, and the mechanism that hid them is still there.

### F-DOWN-1 · Three files in this repository state three different state-changing route counts

| file | claim | status |
|---|---|---|
| `ROUTE-CENSUS.md:10` | **60** state-changing | **correct** — generated, 60 POST rows |
| `scripts/route-census.mjs:4` | **61** | stale prose, in the generator's own header |
| `web/test/rules.test.ts:850` | **58** | stale prose, in the check's own comment |

One generated number flanked by two hand-typed ones that disagree with it and with each
other. This is the anti-pattern the census was built to end, reproduced inside the census.
Both stale numbers are comments, so nothing turns red.

### F-DOWN-2 · `reviews/` now tracks 26,473 lines — 0.86× the entire product source

| | R3 | **R4** |
|---|---:|---:|
| `reviews/` files | 39 | **55** |
| `reviews/` lines | 19,312 | **26,473** |
| non-test product source | 30,774 | **30,942** |
| ratio | 0.63 | **0.86** |

The repository grew by **7,520 lines** this round. **359 of them (4.8 %) are product.**
Every review report is regenerable from the skill plus the commit, none is imported by
anything, and `git clone` now carries a review corpus approaching the size of the base it
reviews. `mac_fell_in_the_ocean_review` benefits from them being in the remote; this
review's rubric counts them as tracked weight, and by the next round they will exceed the
source.

This is not a criticism of the campaign — it is the observation that its output has a
carrying cost nobody has priced. **Options, cheapest first:** an `.gitignore` on
`reviews/*-r[0-9].md` keeping only `LEDGER.md`/`LESSONS.md`; or an orphan `reviews` branch;
or accept it deliberately and record the decision so the next round stops re-finding it.

### F-DOWN-3 · A repair created a new blind spot in a check — third round running

Established in `error-log-r4` and repeated here because it is a *check-quality* finding
and check quality is this review's Robustness criterion. The fix for round 3's 5xx blind
spot put a **second** `recordWorkerError` inside the **same** catch body that CHECK A
inspects. CHECK A asks whether a recorder appears anywhere in the joined catch bodies —
so **deleting the generic catch's recorder now leaves the suite GREEN on content,
data-ops, mcp and tenancy.** The generic catch is the one that records real bugs. Proven
by sabotage, per-worker, in the scratchpad.

Round 2 found a check that could not fail. Round 3 found eleven. Round 4 finds one
*created by round 3's repair to round 2's finding.* **The rate is falling and the shape
is identical**, which is why Robustness gains only +2 for a round in which the entire
suite became fully measured.

### F-FLAT-1 · Still no linter and no formatter, anywhere

Zero eslint, prettier or biome configuration tracked in any workspace, for the fourth
round. The house style is real, consistent and entirely maintained by hand. It is the
largest single unclaimed Understandability win in the repo and the cheapest: one config
file plus one `npm run` entry. It has not been raised as a finding by anyone with the
authority to add a dependency, which may be why it keeps surviving — `CLAUDE.md`'s
anti-dependency directive plausibly reads as forbidding it, and a devDependency that
enforces leanness is not the kind of dependency that directive is about. **Worth an
explicit owner decision rather than a fifth round of silence.**

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Split `rules.test.ts` six ways into `web/test/rules/` | `web/test/rules.test.ts` (−1,191), 6 new files (~+1,216), 1 new `_paths.ts` (+5) | **+25 lines net; REMOVES the largest file in the repo and takes 1 of 21 off the over-400 list, with every part under 250** | **none — and this is the rare fix that is a credit everywhere.** `story_checks_out_review` and `error_log_review` both have checks queued for this file and both explicitly ask for the split first. **Sequencing is the only risk:** doing it after the +24 lines land is strictly worse than before. |
| **F2** One character in the census regex: `pathname ` → `pathname\s*` | `scripts/route-census.mjs` (1 char), `ROUTE-CENSUS.md` (regenerated, +2 rows) | ADDS the two `/media/*` doors to the published surface | **`security_sentry_review` — positive and important.** It surfaces two unauthenticated R2 doors into the document that review reads first. **`first_run_review` / `dead_end_review` — none.** No runtime code changes. |
| **F3** Census tripwire `> 90` → `toBe(rows.length)` pinned; remove the silent `catch { continue }` | `web/test/rules.test.ts` (~3), `scripts/route-census.mjs` (~2) | REMOVES 9 doors of slack and a silent-skip path | **`lean_mean` (this review) — the file grows 3 more lines**, which is why it should ride F1. Nothing else. |
| **F4** Correct the two stale counts (61, 58) to match the generated 60 | `scripts/route-census.mjs`, `web/test/rules.test.ts` (1 line each) | REMOVES two contradictions | none — comments only. **But a hand-typed number is wrong again next week; prefer deleting both rather than correcting them.** |
| **F5** Assert TWO recorders where a 5xx branch exists | `workers/data-ops/test/error-seam.test.ts` (+4) | ADDS 4 lines; REMOVES a blind spot | **`error_log_review` — this is its F4**, same object from the other side. Trivial debit here. |
| **F6** Stop tracking regenerable review reports (`.gitignore` or an orphan branch) | `.gitignore` (+1 line) | **REMOVES ~26,000 tracked lines** | **`mac_fell_in_the_ocean_review` — direct conflict.** Its whole thesis is *what survives if the laptop dies*, and these reports are the campaign's institutional memory. **My recommendation: keep `LEDGER.md` + `LESSONS.md` tracked (the durable distillation) and ignore the per-round reports.** That review should sign the line, not me. |
| **F7** Add a linter + formatter config | root (+1 config, +1 script), 1 devDependency | ADDS one devDependency; makes an invisible convention machine-checked | **`base_fork_review` — small positive** (a fork inherits the style automatically). **`CLAUDE.md`'s anti-dependency directive — owner-gated**, and it should be a stated decision either way. |
| **F8** Split `sharding.ts` (590) into sizing and retention | `workers/tenancy/src/lib/sharding.ts` → 2 files | REMOVES a two-job file; net ~+8 lines | **`architecture_review` — mildly positive** (one owner per concern). **`scaling_review` — none:** both halves keep the same exports. |

---

## CEILING

**95 is reachable — barely — and only by decisions that are not all this review's to make.**

| Criterion | Wt | Cap | Why |
|---|---:|---:|---|
| Size & Scope | 0.12 | **~94** | 20 files stay over 400 after the split and four of them are load-bearing product files (`agent.ts` 669, `api.ts` 561, `deep-link-screen.tsx` 554, `import.ts` 543). Driving those under 400 means inventing indirection to satisfy a line count — the exact defect this rubric punishes. **Not a lock; a judgement, and the judgement should be to stop.** |
| Robustness | 0.22 | **~97** | Reachable. Suite fully measured, 26 laws with 26 checks, 0 worker dependencies. The last points are the checks that can still be fooled, and each is a few lines. |
| Documentation | 0.16 | **~96** | Reachable after F2/F3/F4. The residual is that the census counts `POST /mcp` as **one** row where **24** machine-callable tool operations live behind `tools/call` — a real limitation of "route" as the unit, which no commit to the generator fixes. |
| Understandability | 0.20 | **~95** | Reachable. F1 + F8 + F7 are the whole path. F7 needs an owner decision. |
| Leanness | 0.15 | **~90 while `reviews/` is tracked** | **This is the binding cap, and it is not a code problem.** 26,473 lines of regenerable review output at 0.86× the product source is a leanness defect this review is contractually obliged to count and has no authority to remove — `mac_fell_in_the_ocean_review` wants it in the remote. **Owner decision. With F6, the cap is ~96.** |
| Scalability & Structure | 0.15 | **~94** | realtime and gateway sit outside `publish-seam` and `gating-seam` for structural reasons (realtime holds no team-DB mutations; the gateway is a proxy). The census now makes them *visible*, which is the reachable half. |

**Computed maximum, as things stand:**
```
0.12×94 = 11.28 · 0.22×97 = 21.34 · 0.16×96 = 15.36
0.20×95 = 19.00 · 0.15×90 = 13.50 · 0.15×94 = 14.10
Σ = 11.28+21.34 = 32.62; +15.36 = 47.98; +19.00 = 66.98; +13.50 = 80.48; +14.10 = 94.58
→ 95 (rounds up from 94.58)
```

**So 95 is reachable — by 0.42 of a point, and only if F6 is refused.** Take the Leanness
cap at 90 rather than 96 and the maximum is 94.58, which rounds to 95 by the thinnest
margin in this campaign. **If the owner decides to keep every review report tracked and
the corpus keeps growing at 7,000 lines a round, Leanness falls below 90 within two rounds
and 95 becomes unreachable.** The single thing standing between this codebase and a 95 is
not its code. It is what the audit of its code is doing to it.

**The one item no commit can fix: single authorship.** Every one of the 646 tests, 26 laws
and 92,000 documentation words was written by one party. That does not cap any criterion
here directly — this rubric grades artefacts, not process — but it is why four consecutive
rounds have each found a check that could not fail, and why the honest reading of a 93 is
*"very good, and verified by the same mind that built it."*

**Verdict: 93/A. The best round of the four — the suite is now fully measured for the
first time, the census reaches all seven workers, and the file-count bloat stopped. The
worst file in the repository grew 41 lines and bought nothing with them, and the campaign
that is auditing this codebase is now the largest single thing growing inside it.**

---

## POSTSCRIPT — the prediction above was tested within the hour, and it held

Everything above is measured at **`d9741c6`**. While I was writing it, the main session
shipped `d9a9895` and `45c350b`. Re-measured at `45c350b`:

| | at `d9741c6` | **at `45c350b`** |
|---|---:|---:|
| `web/test/rules.test.ts` | 1,191 lines, 29 checks | **1,203 lines, 29 checks** |
| files over 400 | 21 | **21** |

**+12 more lines. Still 29 checks.** The additions are good ones — the vault check was
inverted to a deny-list that fails safe, which is `story_checks_out_review`'s F3 and a
genuine robustness gain. **They are also exactly the growth F1 predicts and exactly the
kind this criterion cannot reward**, because the file gained weight and no check.

```
R2  1,069  ·  R3  1,150  ·  R4  1,191  ·  same day, one repair pass later  1,203
```

**+134 lines and +2 checks across four rounds.** The file grows whether or not anyone
adds a law, because it is where every fact-pinning check in this campaign lands. My
sequencing recommendation is now not a preference but a measurement: **split it before the
next repair pass, or the next pass adds another twelve lines to a file that has been item
#1 for five reviews and will be for a sixth.**

Nothing else in this report moves. Score unchanged at **93**.
