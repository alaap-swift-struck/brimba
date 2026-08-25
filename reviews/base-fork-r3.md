# Base fork review — round 3 — Brimba · 2026-08-25
SCORE: **83/100**   (round 1: 77 · round 2: 78)

**Mode: BASE**, same as rounds 1 and 2. The bare probe returns `inferenceFailed: true`
(`identity.clientTokens = []`, `upstream: null`, `mode: "this looks like the base itself"`),
so I re-ran it as `--base brimba --client acrymold` before scoring criteria 1, 2 and 6, per
the skill's hard rule. Same convention as both earlier rounds, restated so the three numbers
compare: **the base's own name in foundation code is not a client leak** — Brimba is not a
client of itself. What the base's identity costs a fork is scored in criteria 3, 4, 7 and 9,
where forkability actually lives.

> **Measured at `812da29`.** The tree moved twice during this run — `a063702` (the R26
> library-pin fix) landed while I was reading, and it is directly on this review's subject,
> so I measured at the new HEAD rather than the old one. Two `npm install` processes were
> also running in this tree (someone else's), which is why I did not run `npm run check`.

**The worst leak, in one sentence:** *the entry point a fork actually runs — the `/new-app`
skill — still teaches the old hand-written rename list, does not mention `scripts/fork.mjs`,
and explicitly instructs the opposite of what the script does with the author's database ids.*

---

## DELTA

| # | Criterion | wt | R1 | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|---|
| 1 | No client name in the foundation | 15 | 97 | 97 | **97** | unchanged. Foundation `acrymold` hits still 1 (a comment at `scripts/reset-all.mjs:10` that should stay) |
| 2 | No client-shaped table/column/module | 14 | 97 | 97 | **97** | unchanged. `clientTables` = 0. The base got *smaller* this round — the `screens` table left with its subsystem — which is a base becoming more like a base |
| 3 | Client differences live in config, not code | 13 | 58 | 58 | **75** | **UP 17.** The 13 identity literals in code are now swept by a command, and the 32 account-scoped ids in `wrangler.jsonc` are BLANKED rather than inherited. Still not "config, not code" — it is "code, rewritten reliably" |
| 4 | A fresh fork stands up unattended | 12 | 47 | 53 | **80** | **UP 27, the round's headline.** The 25-point "the rename sweep is a script" line went 0 → 25, and the path was proven by an actual clone-fork-install-check rehearsal |
| 5 | Base and fork have not silently diverged | 11 | 67 | 67 | **67** | unchanged — `upstream` is null and unmeasurable on a base by definition |
| 6 | Nothing assumes one client's data shape | 10 | 100 | 100 | **100** | unchanged. Tenant/slug equality branching across `shared/` + all seven workers = 0 |
| 7 | Branding lives in one place | 8 | 44 | 44 | **40** | **DOWN 4 — my own miss, not anyone's repair.** Four brand assets and one glyph that no text sweep can reach, which neither earlier round measured |
| 8 | Client-specific rules sit behind a seam | 8 | 90 | 90 | **90** | unchanged. Three hand-maintained worker lists remain |
| 9 | The fork procedure is documented and current | 5 | 67 | 74 | **78** | **UP 4, net of a worse contradiction.** `BASE-MANUAL.md §5` is now accurate and excellent; the out-of-repo skill it points at is stale AND is now described falsely |
| 10 | Someone has actually forked it recently | 4 | 100 | 100 | **100** | unchanged, and the evidence is now same-day rather than historical |

### Did somebody else's repair break my criteria?

**No repair broke a criterion here, and two repairs materially helped.** One criterion fell,
and I caused it: criterion 7's four points are a gap round 1 and round 2 both walked past.
Measured like-for-like — both earlier rounds with today's knowledge — criterion 7 was
already 40, so the fall is a correction, not a regression. It is worth more said than
smoothed.

| repair (whose) | effect here |
|---|---|
| `scripts/fork.mjs` + Law R26 (this review's own ask) | **+27 on criterion 4, +17 on criterion 3, +4 on 9.** The single largest movement any criterion has had across three rounds |
| the R26 library-pin fix (`a063702`) | **the reason criterion 4's 35-point line moved at all.** A real fork rehearsal found the gate going red for a reason the sweep could never have caused |
| screen-override subsystem removed (dead_end) | small help to criterion 2 — one fewer base table, one fewer `CATALOG_EXEMPT` entry to justify to a fork that does not want it |
| `ROUTE-CENSUS.md` | neutral here. It is one more generated doc a fork inherits and must regenerate; `scripts/route-census.mjs` is in the sweep, so it renames cleanly |

---

## Verifying the script — I ran it, and then I checked its work

### The dry run

```
$ node scripts/fork.mjs --dry-run acme --display "Acme"
would sweep 147 files · 682 × "brimba" → "acme" (Brimba → Acme)
would blank 32 account-scoped ids in wrangler.jsonc — BOOTSTRAP.md §2 fills them
next: npm install && npm run check
```

`--dry-run` is genuinely read-only (`scripts/fork.mjs:93` — `if (!dry) writeFileSync(...)`),
which I confirmed by reading before running and by `git status --porcelain` afterwards.

### Does it actually reach everything? — **textually yes, provably**

Three independent cross-checks, none of them the script's own word:

**1 · Every file carrying the name is inside the sweep's reach.**

```
files containing /brimba/i (repo, minus .git/node_modules/.next/out/.wrangler)   146
files the sweep reaches (`fork.mjs --list`)                                       427
of the 146, files NOT in the sweep's list                                          0
```

I generated both lists separately and `comm`'d them. Zero misses.

**2 · The id-blanking count is exactly right.** The script says it would blank 32. Counted
independently across the seven `wrangler.jsonc` files: **24 `database_id` + 8
`CF_ACCOUNT_ID` = 32.** Not one more, not one fewer. That matters more than it looks —
round 2's finding 11 was the mcp worker shipping the author's account id, and this is the
mechanism that stops it travelling.

**3 · The 147th file.** The dry run changes 147 files while only 146 contain the name by
`grep`. The extra is `architecture-blueprint.html`, which `grep -rl` skipped as binary
(it contains a NUL byte) and which the sweep reads as text and rewrites correctly. My probe
was the wrong one, not the script.

**Scale note, for honesty:** 47 of those 146 files are in `reviews/` — this campaign's own
output — so the "682 occurrences" headline is inflated by artefacts a fork would delete. The
shipped surface is 31 files under `workers/`, 14 under `web/`, 5 in `shared/`, 5 in
`scripts/`, 1 in `db/`, `package.json`, and ~30 root documents.

### Would `npm run check` really stay green through a fork? — **today yes, and it did not two hours ago**

This is the question that matters, and it has already been answered empirically by someone
other than me. Commit `a063702` records a real rehearsal — clone into a scratch directory,
`node scripts/fork.mjs acrymold`, install, check — and the gate went **RED**. Not because
the sweep missed anything (135 files, 644 occurrences, zero mentions of the old name left in
`shared/`, `workers/` or `web/lib`), but because:

> the ROOT `package.json` declared `@swift-struck/ui` with **no version pin** while
> `web/package.json` pinned `v0.16.0`, so a fresh install resolved the root to whatever was
> on the default branch — and npm **hoisted that older copy over web's correct one**.

**I saw the second half of that fault independently, before I read the commit.** While
working on another review in this same tree an hour earlier, `web/node_modules/@swift-struck/ui`
was empty mid-install and `node_modules/@swift-struck/ui/package.json` at the root read
**`"version": "0.4.0"`** against `web/package.json`'s `#v0.16.0`. That is the downgrade,
observed live, on the base itself — not a fork.

The fix is verifiable in source: the root dependency is gone (`package.json` now has an
empty `dependencies: {}`), `web/` keeps the pin, and R26's suite gained a test that asserts
the root does not declare it and that every workspace which does pins an exact version.

**So my answer to "would the check stay green" is: yes, and the reason I trust it is that
somebody proved it goes red first.** A fork rehearsal that passes on the first attempt tells
you almost nothing; one that fails for a reason nobody predicted, gets fixed, and is then
locked by a test that I have sabotage-proven, tells you a great deal.

### R26, sabotage-proven out of tree

Re-implemented `web/test/fork.test.ts`'s exact logic in the scratchpad
(`/private/tmp/.../c3-r26-sabotage.mjs`) — nothing in the repo touched:

```
identity: brimba / Brimba
shipped: 437   swept: 429   carrying the name: 148
AS-IS missed:                                          []
SABOTAGE — brand.ts falls out of the sweep's reach  →  ['shared/brand.ts']   CAUGHT
vacuity guards:  slug real ✓   display real ✓   reach has all 3 named files ✓   subject 148 > 20 ✓

AS-IS pin test:                                        []            (root: undeclared, web: #v0.16.0)
SABOTAGE — root re-declares it, unpinned            →  ['root declares it', 'unpinned', 'disagree']   CAUGHT
SABOTAGE — web loses its pin                        →  ['unpinned: web/package.json']                 CAUGHT
```

**Both halves fail when they should.** All four vacuity guards are true, so the green is a
real green and not an empty set. This is the first law in this review's three rounds that I
can say that about.

### What the sweep cannot reach — and nothing says so

Eight shipped files are outside the sweep's reach. R26 does not flag them because it skips
binaries by design (`fork.test.ts:43` — *"a product name inside one is pixels, not a
literal"*), which is the correct rule for a text sweep and the wrong place to stop:

| asset | what a fork inherits |
|---|---|
| `web/public/icons/icon-192.png` | the base's teal "B" tile — the PWA install icon |
| `web/public/icons/icon-512.png` | the same, at splash size |
| `web/public/icons/icon-maskable-512.png` | the Android adaptive icon |
| `web/public/icons/apple-touch-icon.png` | the iOS home-screen icon |
| `web/public/icons/icon.svg` + `icon-maskable.svg` | **swept, and still wrong** — `aria-label="Brimba"` becomes `aria-label="Acme"`, and the `<text>` glyph beneath it stays **`B`** |

So a forked product, installed to a phone, shows the base's icon and a letter that is not
its initial. `shared/brand.ts:12` does say *"Edit ONLY this file (and drop in a logo)"* — but
`BASE-MANUAL.md §5`'s five-step build order does not mention icons, the script's closing
`next:` line does not mention them, and `FORK_SWEEP_EXEMPT` is `{}`.

**The cheapest fix is three lines in the script:** print a closing line naming the assets it
cannot rewrite. **The best fix is smaller than it sounds:** the SVG is a generated monogram
(`scripts/gen-icons.mjs` exists), and `brand.ts` already builds an in-app monogram from
`brand.name` when `logoUrl` is null — so generating the icon set from the first letter of
`brand.name` at fork time closes it permanently and deletes four binaries from the repo.

---

## Arithmetic

```
DEFECT criteria    = clamp(0,100, 100 − Σ penalties)   critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's table
total              = round( Σ (criterion × weight) / 100 )
GATE               = criterion 1 below 40 caps the total — did NOT fire (97)
```

| # | criterion | method | score | weight | weighted |
|---|---|---|---|---|---|
| 1 | No client name in the foundation | defect | 97 | 15 | 1455 |
| 2 | No client-shaped table/column/module | defect | 97 | 14 | 1358 |
| 3 | Client differences live in config, not code | coverage | 75 | 13 | 975 |
| 4 | A fresh fork stands up unattended | coverage | 80 | 12 | 960 |
| 5 | Base and fork have not silently diverged | coverage | 67 | 11 | 737 |
| 6 | Nothing assumes one client's data shape | defect | 100 | 10 | 1000 |
| 7 | Branding lives in one place | coverage | 40 | 8 | 320 |
| 8 | Client-specific rules sit behind a seam | coverage | 90 | 8 | 720 |
| 9 | The fork procedure is documented and current | coverage | 78 | 5 | 390 |
| 10 | Someone has actually forked it recently | coverage | 100 | 4 | 400 |
| | | | | **100** | **8315 → 83.15 → 83** |

### The layer split — never publish the raw total

| layer | hits | scored? |
|---|---|---|
| renamed-by-design (wrangler, package.json, README, docs) | the bulk of the 682 | **no** — this is the sweep working |
| campaign artefacts (`reviews/`, 47 files) | ~200 | **no** — excluded layer |
| surface (web components, screens) | 14 files | lightly |
| **foundation** (`shared/`, `workers/*/src`, `db/`, `scripts/`) | **42 files, 1 client hit** | **yes** |

### Criterion 3 — the sub-lines, so the +17 is recomputable

| points | line | R2 | R3 | why |
|---|---|---|---|---|
| 30 | account-scoped values are not inherited | 5 | **26** | 32 real ids still sit in the base's committed `wrangler.jsonc` — they must, the base is itself a deployed product — but the fork command **blanks all 32**, with a written reason, and `BOOTSTRAP.md §2` fills them. −4 because a clone that skips the command inherits them silently |
| 30 | identity is a value, not a literal | 18 | **21** | 13 identity literals remain in code (`SESSION_COOKIE`, the MCP token prefix, `serverInfo.name`, the localStorage prefixes, the assistant's own name). They are swept reliably — but "swept reliably" is not "read from config", and criterion 3 asks the second question |
| 25 | one config file the fork edits | 20 | **20** | `shared/brand.ts` is genuinely that file, and it says so |
| 15 | no author-only value ships onward | 15 | **8** | Held back this round, not last: `OPERATIONS.md` and `MCP.md` carry `brimba.swift-struck.workers.dev`. The sweep rewrites the **app** half and leaves `swift-struck` — the author's Cloudflare subdomain — so a fork's docs confidently name `acme.swift-struck.workers.dev`, a host it does not own. Round 2 filed this as LOW 12 and I now count it here |
| | | 58 | **75** | |

### Criterion 4 — the sub-lines, so the +27 is recomputable

| points | line | R2 | R3 | why |
|---|---|---|---|---|
| 35 | documented, scripted path clone → running | 21 | **22** | `BASE-MANUAL §5` now reads as a real procedure with the two gotchas named. Still −13: the path is documented in two places that disagree (criterion 9), and the one a user invokes is the stale one |
| 25 | **the rename sweep is a script** | **0** | **25** | `scripts/fork.mjs`, `npm run fork`, derives its subject by scanning, guarded by R26, sabotage-proven above. This line was 0 in both earlier rounds and is the whole of the movement |
| 20 | no step needs a value only the author knows | 17 | **18** | The 32 ids are blanked so the deploy fails **loudly** instead of writing into the base's own databases — the best available answer. +1, not +3, because the icons are still a value only the author has |
| 20 | the fork verifies itself at the end | 15 | **15** | `scripts/smoke-staging.mjs` unchanged, still three identity tripwires. The script's `next: npm install && npm run check` is a prompt, not a verification it performs |
| | | 53 | **80** | |

---

## Findings

### HIGH · 1 · The procedure a fork actually runs is the stale one, and now it is described falsely · **STANDS, worse**
`~/.claude/skills/new-app/SKILL.md` (outside this repo, last modified 18 Aug) ·
`BASE-MANUAL.md:454`

Round 2 filed this as MEDIUM 9 — *"the two fork documents now disagree, and the unchecked one
is the one a fork runs."* It is now worse in two specific ways.

`grep -n "fork.mjs\|npm run fork\|R26"` over the skill returns **nothing**. §2 is still the
hand-written list — the exact artefact R26's own law text condemns — and it still contains
the instruction the script exists to reverse:

> Leave the checked-in `database_id` and `CF_ACCOUNT_ID` values alone for now — step 3
> overwrites them with the new account's real values.

Against `fork.mjs:80-84`:

> shipping them ONWARD is worse than shipping nothing: the fork's rows land in the base's
> own databases. Blank them so the deploy fails loudly.

And `BASE-MANUAL.md:454` now says of that same skill: *"it is a thin wrapper over this
script."* It is not a wrapper over the script; it does not know the script exists.

**Why this is the worst finding in the review even though the score went up 5:** every point
criterion 4 gained assumes someone runs `npm run fork`. A user who says "new app" gets the
skill, and the skill walks the list that turns `npm run check` red — round 2's HIGH 4,
unchanged, now merely relocated.

**The structural part, which no commit in this repository can fix:** the skill lives in
`~/.claude/skills/`. R26 reads the repo. A law inside the repo can never see the procedure
outside it — which is precisely the failure R26 was written about, one level up. The fix is
to make the skill a genuinely thin wrapper (`git clone` → `npm run fork <name>` → the cloud
wiring), so there is one procedure and the repo owns it.

### MEDIUM · 2 · Four brand assets and one glyph no sweep can reach, and nothing names them · **NEW**
`web/public/icons/*.png` (4) · `web/public/icons/icon.svg:9` · `shared/rules/registry.ts:326`

Detailed above. The sweep is textually complete and the app's **face** is not swept. R26
skips binaries correctly; what is missing is anywhere that says so. `FORK_SWEEP_EXEMPT` is
`{}` and its test only validates entries that exist, so an empty map asserts nothing.

**The fix, cheapest first:** (a) `fork.mjs` prints a closing line naming the unsweepable
assets; (b) `BASE-MANUAL §5`'s build order gains "regenerate the icons"; (c) best —
`scripts/gen-icons.mjs` derives the monogram from `brand.name`, run as the last step of
`fork.mjs`, and the four PNGs stop being committed at all.

### MEDIUM · 3 · The swept host keeps the author's Cloudflare subdomain · **STANDS, re-scored**
`OPERATIONS.md`, `MCP.md`, `BOOTSTRAP.md`

`brimba.swift-struck.workers.dev` sweeps to `acme.swift-struck.workers.dev`. The app half is
right, the account half is the author's, and the result is more dangerous than an unswept
literal because it **looks** correct — a fork reads its own name in a URL it does not own.
Round 2 filed this LOW; I have moved it into criterion 3's arithmetic because the script now
touches these strings and produces a plausible wrong answer where it used to leave an
obvious wrong one.

**The fix:** make the subdomain a value. Either `fork.mjs` takes `--account <subdomain>`, or
the docs write `<your-account>.workers.dev` and BOOTSTRAP §2 fills it, exactly as the ids are
handled.

### MEDIUM · 4 · The assistant and the MCP surface are branded past the seam · **STANDS**
`workers/data-ops/src/lib/agent.ts:42` · `workers/mcp/src/index.ts:70` · `web/app/manifest.ts:21`

*"You are Brimba's assistant"*, *"Brimba's machine surface"* and a restated `#0e9e86` are
literals rather than `brand.name` / `brand.accentHex.primary`. **The script makes the
outcome right** — a fork's assistant introduces itself as Acme's — which is why criterion 7
did not fall further. But criterion 7 asks whether branding lives in **one place**, and it
lives in at least six. A fork that changes only `brand.ts` (which that file tells them to do)
gets an assistant still named after the base.

### LOW · 5 · A fork has no route back to the base · **STANDS**
No `upstream` remote; the skill still says to remove the `brimba` origin with nothing added
back. This is what makes criterion 5 unmeasurable, here and on every fork. One
`git remote add upstream` line in the fork procedure makes divergence measurable for ever
after — the cheapest 11-weight point in the rubric, and it is worth nothing on the base
itself.

### LOW · 6 · Three hand-maintained worker lists · **STANDS**
`MUTATING_WORKERS`, `WORKERS_WITH_ROUTES`, `retention.test.ts:253`, plus the topology in
`build-blueprint.mjs`. A fork that adds an eighth worker must find all four.

### INFORMATIONAL · 7 · `package.json` now carries an empty `"dependencies": {}`
Left by `a063702`'s removal. Harmless; cross-ref `lean_mean_review`.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** rewrite `/new-app` §2 as `npm run fork <name>` | `~/.claude/skills/new-app/SKILL.md` (−40 lines, +3) | REMOVES the stale manual list and its contradictory id instruction | **none in this repository** — the file is outside it. That is also the finding: no repo check can hold it true. `story_checks_out_review` cannot see it either |
| **F1b** correct `BASE-MANUAL.md:454`'s "thin wrapper" claim | `BASE-MANUAL.md` (1 line) | REMOVES a false statement about a file this repo cannot verify | none — helps `story_checks_out_review` |
| **F2** `fork.mjs` prints the assets it cannot rewrite | `scripts/fork.mjs` (3 lines) | ADDS one honest line to the output | none — three lines, no behaviour change |
| **F2b** generate the icon set from `brand.name` at fork time | `scripts/gen-icons.mjs`, `scripts/fork.mjs`, −4 PNGs | REMOVES four binaries from the repo and a manual step | **`lean_mean_review`** improves (four fewer committed binaries). **`first_run_review`** — verify the generated maskable icon still passes the PWA install criteria before deleting the handmade ones |
| **F3** make the account subdomain a value (`--account`, or `<your-account>` in docs) | `scripts/fork.mjs`, `OPERATIONS.md`, `MCP.md`, `BOOTSTRAP.md` | REMOVES a plausible-but-wrong URL from every fork's docs | **`mac_fell_in_the_ocean_review`** — a placeholder host is one more thing a rebuilder must fill in; net positive, since today's value is confidently wrong. **`story_checks_out_review`** — check no runbook depends on the literal |
| **F4** read `brand.name` in the agent prompt and the MCP `serverInfo` | `workers/data-ops/src/lib/agent.ts`, `workers/mcp/src/index.ts` | REMOVES two literals; ADDS two imports | **`lean_mean_review`** neutral. **`interfacelessness_review`** — `serverInfo.name` is asserted by `scripts/smoke-staging.mjs`; the sweep renames that assertion today, and a computed name must still match it. Check the smoke test in the same change |
| **F5** add `git remote add upstream` to the fork procedure | the skill + `BASE-MANUAL §5` (1 line) | ADDS a measurable link between fork and base | none — and it is what makes criterion 5 mean anything on a fork |

---

## CEILING

**Round 2 said documentation-only tops out at 92 and the script reaches ~95.4. The script
landed, and the measured result is 83, not 95.4. Round 2's projection was too generous, and
I can say exactly where.**

Round 2 projected criterion 4 → 96 with the script. It measures **80**. The 16-point gap is
in two lines round 2 assumed the script would carry and it does not:

- the 35-point "documented, scripted path" line: projected ~33, measured **22**. A script
  does not make a procedure documented — it makes a procedure *possible*. The document a
  user reaches still teaches the old one (finding 1)
- the 20-point "verifies itself" line: unchanged at 15. `fork.mjs` prints
  `next: npm run check`; it does not run it

**The honest maximum, recomputed criterion by criterion:**

```
1  → 100  (delete one comment)
2  →  97  (the last 3 need a module off-switch — a migration affecting every fork, Tier 3)
3  →  85  (the base is its own first fork: its wrangler.jsonc MUST hold real ids to deploy)
4  →  95  (F1 + the script running the check; a stand-up still needs cloud credentials
           no script can invent)
5  →  67  (UNMEASURABLE ON A BASE — a base has no upstream, by definition)
6  → 100
7  →  95  (F2b + F4)
8  → 100
9  →  90  (the procedure a fork runs lives OUTSIDE this repository; no commit here can
           keep it current, which is finding 1's structural half)
10 → 100
```

```
100×15 + 97×14 + 85×13 + 95×12 + 67×11 + 100×10 + 95×8 + 100×8 + 90×5 + 100×4
= 1500 + 1358 + 1105 + 1140 + 737 + 1000 + 760 + 800 + 450 + 400
= 9250 → 92.5 → 93
```

**95 is NOT reachable, and the true maximum is about 93.** Two caps, neither of which a
commit can lift:

1. **Criterion 5 is unmeasurable in BASE mode by definition.** A base has no upstream to
   diverge from. The rubric's own hard rule says report it unmeasured, not zero; scored at
   its measurable 67 it costs **3.6 points, permanently, in this repository**. It becomes
   measurable on every future fork and never here. *(Round 2 sidestepped this by proposing
   the 60 measurable points be "reported as 100". I have not adopted that: rescaling a
   criterion to make a target reachable is exactly the kind of tuning the campaign brief
   forbids.)*
2. **The fork procedure lives outside the repository.** `~/.claude/skills/new-app/SKILL.md`
   is the entry point a fork runs and no law in this repo can read it. Criterion 9 is capped
   near 90 until the skill becomes a two-line wrapper over `npm run fork` — at which point
   the repo owns the procedure and the cap lifts. That is a **process** fix, not a code one.

**What is genuinely reachable, and what it costs:** F1 + F1b + F2 + F3 take this review from
83 to about **89 for one afternoon**, and almost none of it is code — it is one skill file,
three lines of script output, and a placeholder in three documents. F2b + F4 + F5 take it to
**93**, which is the ceiling.

**The thing worth saying plainly:** three rounds ago this review's answer to "could you lift
the base out tomorrow?" was *"yes, if you are the author, and you follow a list in a skill
that is wrong in eight places."* Today it is *"yes, in one command, and a law fails the build
if that stops being true."* That is the largest real improvement this campaign has produced
in any review I can see — and the reason the number is 83 rather than 95 is not that the
script fell short. It is that the front door still points at the old way in.

---

**The verdict, in one sentence:** the base is a base again — one command renames it, a law
keeps that true, and somebody actually ran it today — but the door a new product walks
through still hands them the old map, and no check inside this repository will ever notice.
