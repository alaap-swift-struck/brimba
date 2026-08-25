# mac_fell_in_the_ocean review — round 3 — Brimba · 2026-08-25
SCORE: **90/100**, ungated   (round 1: 60 gated / 87 uncapped · round 2: 25 gated / 85 uncapped)

Measured against `main` @ **`812da29`**, and against a real clone of the remote.
Read-only in the repository: nothing was edited but this file. The drill ran
entirely in the session scratchpad and the clone has been deleted.

**The gate is off.** Round 2 capped at 25 because the campaign's own work sat on a
branch with no remote. That is fixed, and it is confirmed by measurement, not by
a claim — see below. The documentation was always this good; the cap was hiding
it.

---

## 1 · Is `review-campaign` pushed and current? — CONFIRMED

```
git rev-parse review-campaign          256d21b9f51d2d367fea8c8fa0fd1aaa1f86ddc7
git rev-parse origin/review-campaign   256d21b9f51d2d367fea8c8fa0fd1aaa1f86ddc7   IDENTICAL
```

And it did not stop there: `review-campaign` was fast-forward merged into `main`,
and `git rev-parse main` = `git rev-parse origin/main` = `812da29`. Unpushed
commits, **every** local branch:

```
deps/next-16 0 · fix/fork-findings-7 0 · harden/agent-catalog 0 · harden/docs-cleanup 0
harden/paging-and-checks 0 · harden/security-doors 0 · harden/web-laws 0
harden/worker-laws 0 · main 0 · perf/scale-94 0 · review-campaign 0
```

Eleven branches, zero unpushed commits anywhere. The strongest possible answer to
this criterion's first four rows, and the reason the review is ungated for the
first time.

---

## 2 · THE DRILL — and it stopped at step three

I cloned the remote into the scratchpad and followed **only** what the README
says, in the order it says it. Nothing from the local copy, nothing from having
just read the code.

| # | step (from README "Prerequisites, install, run and test") | result | time |
|---|---|---|---|
| 1 | `git clone https://github.com/alaap-swift-struck/brimba.git` | **OK** — public, anonymous, 431 files, lands on `main` @ `812da29` | **2.1 s** |
| 2 | `npm install` | **OK** — exit 0, 303 packages, **0 vulnerabilities** | **50.4 s** |
| 3 | `npm run check` | **FAILED — exit 2** | 30.8 s |

```
web/components/app-shell.tsx(14,34): error TS2307: Cannot find module
  '@swift-struck/ui/registry/primitives/connection-status/connection-status'
  or its corresponding type declarations.
web/lib/realtime.ts(20,38): error TS2307: Cannot find module
  '@swift-struck/ui/registry/primitives/connection-status/connection-status'
  or its corresponding type declarations.
```

**A stranger stops here.** The README calls `npm run check` "the gate", tells them
green is "eight suites passing and no TypeScript output", and it is red on a
clean clone of the default branch.

### The root cause, proved rather than guessed

```
package.json          dependencies: {}                                    (correct)
web/package.json      "@swift-struck/ui": "…swift-struck-ui#v0.16.0"      (correct)
package-lock.json:3396
  "resolved": "git+ssh://…/swift-struck-ui.git#675aff8950664856b7975d772b389eeb070712d8"

git ls-remote https://github.com/alaap-swift-struck/swift-struck-ui
  364eea796a3f19320850648dfb24a48e89b0cfa6   refs/tags/v0.16.0^{}
  675aff8950664856b7975d772b389eeb070712d8   refs/tags/v0.4.0^{}     <-- the lockfile
```

The lockfile's single resolved entry for the UI library is the dereferenced
commit of tag **v0.4.0**. Both manifests say v0.16.0. `npm install` obeys the
lockfile, installs **0.4.0**, and 0.4.0 has no `connection-status` primitive —
which is the component `ae42924` added to the shell four hours ago.

### The fix, also proved

```
npm update @swift-struck/ui
  -> package-lock.json:3396 resolves to 364eea79…  (v0.16.0)
  -> node_modules/@swift-struck/ui/package.json    "version": "0.16.0"
npm run check
  -> exit 0
  -> 8 workspace suites · 71 test files · 640 tests · all passing
```

One command, then commit the lockfile. **Time from clone to green, once you know
that: about two minutes. Time from clone to green following the README: never.**

### How it got here, and why the law did not catch it

`a063702` ("fix(R26): a fork installed a DIFFERENT library than the base it was
forked from") diagnosed this fault class correctly and fixed the **manifests** —
it removed the untagged root dependency and pinned `web` to `#v0.16.0`. Its
commit message describes reproducing the downgrade by forking into a scratch
directory. The lockfile edit that came with it touched the *declaration* blocks
at lines 7–20 and 6980, and **left the resolved package entry at line 3396
pointing at v0.4.0** — the exact old copy the fix was written to eliminate.

And `web/test/fork.test.ts`, added in the same commit, reads:

```
for (const f of ["package.json", "web/package.json"]) { … }
```

**Two manifests. Never `package-lock.json`.** The law asserts what the project
*declares*; `npm install` obeys what the lockfile *resolves*. So R26 is green,
`npm run check` passes on a machine whose `node_modules` predates the change, and
a fresh clone does not compile. This is the campaign's signature failure —
a check that measures the declaration rather than the outcome — appearing inside
the check written to end that very fault.

*(Corroborating detail, not speculation: at 20:29 today an `npm install` was
running in the working repository, and immediately afterwards the only installed
copy at the repo root was 0.4.0 with no `connection-status`. The author's own
machine is in the same state as the clone. The staging deploy claimed in
`a063702` must have been built from the `web/node_modules` tree that predated
it.)*

---

## 3 · The vault — still unsealed, and now the documents disagree with the check

`secrets.vault` does not exist. That is the owner's alone — it needs a passphrase
only they may handle, I neither asked for one nor touched one, and this is **not
re-filed as a new finding**.

**The two SECRETS.md corrections are real and well made.** I read them:

- The passphrase claim: *"This document previously said 'the passphrase never
  leaves the process', which was not true… It does, however, cross a process
  boundary **twice**: `askPassphrase` shells out to `/bin/sh` to turn terminal
  echo off while you type, and reads the value back over a pipe."* Correct, and
  it states the residual exposure plainly rather than waving it away.
- The public-repo rule: *"Use a GENERATED passphrase of at least 128 bits… Do not
  compose one you can recall."* Correct, and the reasoning it gives — PBKDF2 is
  the most GPU-friendly of the modern stretching functions and a public repo
  hands the ciphertext to everyone for ever — is the right reasoning, not a
  slogan.

**But `vault-claims-match-reality` is GREEN while three root documents still say
the vault exists.** I ran its own logic against the real files
(`scratchpad`, no repository writes):

```
secrets.vault exists:  false

every line naming secrets.vault in a ROOT .md:
  SECRETS.md    **One encrypted file, `secrets.vault`, committed to the repo like anything else.**
  OPERATIONS.md **Secrets** — `secrets.vault`, committed and encrypted. `npm run vault:open`
  INVENTORY.md  2. **The vault passphrase.** `secrets.vault` is encrypted with a passphrase held by…
  CHANGELOG.md  Also the encrypted secrets vault (`secrets.vault` + `scripts/vault.mjs`), so the…

what the check flags:  []   <-- GREEN
```

The regex is
`/\b(is committed|is sealed|lives in the repo|already (?:in|exists))\b/i`.
SECRETS.md says "**, committed to the repo like anything else**" — "committed",
not "is committed". OPERATIONS.md says "**, committed and encrypted**". Neither
matches. The check was written about these exact sentences and cannot see any of
them.

This is the same defect as §2's, on the same afternoon, in a different check: the
assertion tests a *phrasing* rather than the *claim*. The fix is to invert it —
match `secrets.vault` in a **non-imperative** context (any line that is not a
command, a code fence, or a "run `npm run vault:save`" instruction) and require
each one to carry a hedge, rather than enumerating the four ways somebody might
phrase the lie.

**Two notes for the owner, neither a request for a passphrase.** First,
`npm run vault:save` (pid 49553) has been sitting at its hidden-input prompt
since **15:20** — over five hours. It is waiting for a passphrase nobody typed,
and it will wait for ever. Second, the runbook at SECRETS.md §"After a total
loss" is otherwise exactly right, and step 3 is the one step that cannot work
today.

---

## Arithmetic

`criterion = Σ points earned` · `total = Σ(criterion × weight) / 100`.
Weights sum to 100.

| # | Criterion | w | R1 | R2 | **R3** | ×w |
|---|---|---:|---:|---:|---:|---:|
| 1 | A remote copy exists and is current | 14 | 45 | 35 | **80** | 1120 |
| 2 | The stored tree is complete | 9 | 100 | 100 | **100** | 900 |
| 3 | Clone to running, reproducibly | 11 | 85 | 85 | **78** | 858 |
| 4 | A stranger can prove it works | 8 | 95 | 95 | **75** | 600 |
| 5 | The README is a real front door | 8 | 100 | 100 | **100** | 800 |
| 6 | Architecture and decisions are written down | 12 | 97 | 97 | **100** | 1200 |
| 7 | Operating it: deploy, environments, rollback | 9 | 91 | 91 | **100** | 900 |
| 8 | The code explains itself | 8 | 98 | 98 | **97** | 776 |
| 9 | The history tells the story | 5 | 97 | 97 | **93** | 465 |
| 10 | Bus factor and ownership | 5 | 60 | 60 | **60** | 300 |
| 11 | The legal right to reuse it | 5 | 100 | 100 | **100** | 500 |
| 12 | The non-code inventory | 6 | 95 | 95 | **100** | 600 |
| | | **100** | | | | **9019** |

**9019 / 100 = 90.19 → SCORE 90.**
**Gate: criterion 1 = 80, in the ≥70 band → no cap.** Capped and uncapped are the
same figure for the first time in this campaign.

### Three criteria went DOWN, and two of them have one cause

The campaign's second question, answered directly.

**Criterion 3: 85 → 78 (−7). Cause: `a063702`.** The lockfile row is worth 20
points for "a lockfile is committed (Pinned-Dependencies)". A lockfile is
committed — and it reproducibly produces a tree that does not compile, which is
the opposite of what the row measures. Scored **8/20**. Every other row is
unchanged and full: documented ordered path (25), runtime pinned in `.nvmrc` +
`engines` (15), prerequisites named with versions (15), setup in two commands
(15), no container (0).

**Criterion 4: 95 → 75 (−20). Two causes, and only one is a regression.**

- **−18, `a063702`:** "tests exist and are runnable by a documented command" is
  30 points. The command exists and is well documented; on a fresh clone it exits
  2 before a single test runs. **12/30.**
- **−7, pre-existing and missed by earlier rounds:** `.github/workflows/ci.yml`
  pins `node-version: 22`, while `.nvmrc` says `24` and root `package.json` says
  `"engines": { "node": ">=24.0.0" }`. CI is therefore testing on a runtime the
  project's own manifest forbids. **18/25.** This is not a regression — it is
  something I counted that rounds 1 and 2 did not, and it should be recorded as
  such rather than blamed on anyone's repair.

Rows unchanged: a single documented verify command covering typecheck **and**
tests (20/20, and the README's warning about the `npx tsc --noEmit` trap that
"exits 0 having checked nothing" is the best sentence in the document); expected
passing state documented (15/15); fixtures included (10/10).

**Criterion 9: 97 → 93 (−4). Cause: drift, not a repair.** `CHANGELOG.md`'s
newest entry is **2026-08-12**; `HEAD` is 2026-08-25. Thirteen days and the
entire review campaign — 18 commits, four laws, a prompt cache, a connection dot
and a removed subsystem — are unrecorded. Scored 14/20 on the changelog row.
Everything else holds: median subject length **78** characters, **0%**
low-effort messages, **89%** conventional. There are still **zero tags**, and the
"commits reference issues or pull requests" row is treated as **not applicable**
(the rubric's "where those exist" — this repository has no issues or PRs), which
is how round 2 read it too.

### The criteria that went up

**Criterion 1: 35 → 80 (+45).** Rows: reachable remote 25 ✓ · HEAD on remote
25 ✓ · zero unpushed on the checked-out branch 15 ✓ · zero unpushed on every
branch 10 ✓ · no uncommitted modifications **0** ✗ · no essential untracked files
**5/10** · second remote **0** ✗.

The two part-scores are honest about a live working tree, not a scolding: six
modified files (`ROUTE-CENSUS.md`, `scripts/route-census.mjs`,
`shared/workers/trace.ts`, `workers/data-ops/test/error-seam.test.ts`,
`workers/tenancy/src/lib/sharding.ts`, `workers/tenancy/src/routes/members.ts`)
and six untracked review reports are in-flight campaign work at the moment of
measurement. They would be lost tonight. No **source, config or migration** is
untracked — only analysis — hence 5 of 10 rather than 0. And `comm` against the
clone confirms **zero tracked files exist locally that are missing from the
remote**.

The last 5 points need a second remote. `INVENTORY.md:74` already names this as a
single point of failure — *"One git remote. GitHub is the only copy. A second
remote costs one command"* — which is the right instinct, and naming the absence
is not the same as closing it.

**Criterion 6: 97 → 100 (+3).** All six rows: system shape (ARCHITECTURE.md,
BASE-MANUAL.md) · data model (DATA-MODEL.md) · **decision records** —
ARCHITECTURE.md's "the 20 locked decisions", CONVENTIONS.md's decision trees,
SCREEN-ENGINE-PLAN.md §10, ROADMAP.md's "Decisions (locked this round)", and
RULES.md's *Earned by:* clause on every law, which is the rarest and most useful
form of all: each rule carries the incident that produced it · per-module docs
(MCP.md, DURABLE-OBJECTS.md, AGENTIC-IMPORT.md, CACHING.md, CONCURRENCY.md) ·
diagrams in ARCHITECTURE.md · all in-repo, versioned with the code.

**Criterion 7: 91 → 100 (+9).** Deploy is plain commands, not an agent
instruction — `npm run deploy:staging` / `deploy:production` with the
realtime-first order and the `code 10143` cold-start cycle written out. Both
environments named with URLs. Rollback is a full section
(`npx wrangler deployments list` / `rollback`, reverse the deploy order, **and**
"What does NOT roll back — database migrations do not"). Secrets inventoried by
name in SECRETS.md's table, never by value. Backup and restore documented: D1
Time Travel with the **30-day window** stated and the commands given.

**Criterion 12: 95 → 100 (+5).** INVENTORY.md covers all six rows in 623 words:
third-party services · who owns each resource · databases · domains and DNS ·
what data must exist before the app is usable · invisible moving parts · and a
single-points-of-failure section that names its own gaps.

### The criteria that held

**Criterion 2: 100.** The classic failure does not apply here and I checked
before assuming it: `.gitignore` contains `.env*`, **and** `.dev.vars.example`
(1,843 bytes) and `workers/auth/.dev.vars.example` are both tracked and present
in the clone, and SECRETS.md tables every secret by name. *(The probe reported
`envExample: null` — it looks only for `.env.example`. A false negative, and the
25 points are earned.)*

**Criterion 5: 100.** 2,096 words, all eight rows, and it is not the only
document — 33 root markdown files with a map to them.

**Criterion 8: 97.** Comment density **24%**, inside the 10–30% band.
`filesWithHeaderDocPct` **69%** → 22/25 on the "most files open with a purpose
line" row. Five files sampled at random, and every one opens by explaining *why*
rather than restating the code: `shared/workers/gating.ts` ("THE shared gating
seam every domain worker opens each request with"), `shared/workers/paging.ts`
("A cap is honest but final: at LIST_HARD_CAP the screen simply stops knowing"),
`workers/realtime/src/index.ts`, `workers/mcp/src/index.ts`,
`web/lib/use-form-draft.ts`. CONVENTIONS.md, UI-CONVENTIONS.md and the glossary
carry the naming row.

**Criterion 10: 60.** Truck factor **1** (Avelino Degree-of-Authorship, 440 files,
one author). **This is a fact, not a failing** — it is the normal state of a solo
project and precisely the risk this review prices. The mitigation is scored where
it belongs: `.github/CODEOWNERS` exists and, unusually, *names the risk itself*
("There is currently one maintainer… BOOTSTRAP.md rebuilds the infrastructure,
SECRETS.md recovers the credentials, INVENTORY.md lists every account"). Named
maintainer with an email in three places. CONTRIBUTING.md walks a first change
end to end. 0 + 25 + 20 + 15.

**Criterion 11: 100.** `LICENSE` present; unambiguous ("PROPRIETARY AND
CONFIDENTIAL", with an explicit grant to Swift Struck and its authorised
parties); copyright stated; and line 22 acknowledges third-party dependency
licences.

---

## Findings

### CRITICAL — a fresh clone of `main` does not compile

Measured, not inferred: `git clone` → `npm install` → `npm run check` → **exit 2**,
two `TS2307` errors, at 20:48 today. Cause and fix in §2, both proved.
**Fix (Tier 1, one command):** `npm update @swift-struck/ui`, then commit
`package-lock.json`. Verified green in the scratch clone: 8 suites, 640 tests.

### HIGH — R26's check asserts the manifests and not the lockfile

`web/test/fork.test.ts` reads `package.json` and `web/package.json` only. The
file `npm install` actually obeys is never opened, so the law stays green while
the install it governs produces the wrong library. A fork — the exact scenario
R26 exists for — inherits the fault silently.
**Fix (Tier 1):** add one assertion that `package-lock.json`'s resolved commit
for `@swift-struck/ui` equals the commit the pinned tag points at. The lockfile
already contains both facts; nothing needs fetching.

### HIGH — `vault-claims-match-reality` is green while three documents claim the vault exists

§3. The regex enumerates four phrasings and the three live claims use none of
them. **Fix (Tier 1):** invert the test — flag any non-imperative mention of
`secrets.vault` that carries no hedge, rather than listing the ways to phrase the
claim. Then correct the three sentences in SECRETS.md, OPERATIONS.md and
INVENTORY.md (and the CHANGELOG line) to say the vault is *how* secrets are meant
to be held, not that one exists.

### MEDIUM — CI runs Node 22 against `engines: >=24.0.0`

`.github/workflows/ci.yml` says `node-version: 22`; `.nvmrc` says `24`; root
`package.json` says `>=24.0.0`. The safety net is testing a runtime the project
forbids, and `npm ci` will emit `EBADENGINE` without failing. Pre-existing, not a
regression. **Fix (Tier 1):** `node-version: 24`, or read `.nvmrc` with
`node-version-file`.

### MEDIUM — twelve files of work exist only on this laptop right now

Six modified source/doc files and six untracked reports. Normal for a live
session; still the answer to "what is lost tonight". **Fix:** commit and push
when the campaign lands. No change needed to anything permanent.

### MEDIUM — one remote, and the project knows it

`INVENTORY.md:74` names it. **Fix (Tier 3 — the owner runs it, not me):**

```
git remote add mirror <second-host-url>
git push --mirror mirror
```

### LOW — `CHANGELOG.md` stops thirteen days short of `HEAD`

Newest entry 2026-08-12; the whole review campaign is unrecorded. Also zero git
tags, so there is no other marker of a meaningful version.

### LOW — the README's timing claim is about three times optimistic

*"From a bare `git clone`, install plus check is roughly 25 seconds."* Measured on
this machine: clone 2.1 s + install 50.4 s + check 30.8 s ≈ **83 seconds**. And
the documented green state says "518 tests today"; the real figure is **640**
across the same eight suites. Small, and it matters more than it looks — those
two numbers are exactly what a stranger uses to decide whether what they are
looking at is green.

### LOW — `npm run vault:save` has been waiting for input since 15:20

pid 49553, over five hours at a hidden-input prompt. Harmless, but it will never
finish on its own.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| `npm update @swift-struck/ui` + commit the lockfile | `package-lock.json` (1 resolved SHA) | −a broken build | **none — and it unblocks everyone.** Every review that runs `npm run check` on a clean tree is currently measuring a red gate. `realtime_review`'s criterion 8 in particular is scored on a `ConnectionStatus` import that does not resolve after a fresh install. |
| Assert the lockfile in `fork.test.ts` | `web/test/fork.test.ts` (~8 lines) | +1 assertion | **`lean_mean_review`:** +8 test lines. **`base_fork_review` — helps directly:** it is their law and this is what makes it true. Real tension: the assertion goes red whenever the pin is bumped without `npm install`, which is the intended behaviour and will feel like friction. |
| Invert the `vault-claims` check | `web/test/rules.test.ts` (~10 lines, replacing 8) | +a hedge requirement, −an enumeration of phrasings | **`story_checks_out_review`:** a stricter check will flag legitimate prose about the vault design, so the hedge rule has to be written carefully or it becomes noise they inherit. **`lean_mean_review`:** +2 net lines. |
| Correct the three vault sentences | `SECRETS.md`, `OPERATIONS.md`, `INVENTORY.md`, `CHANGELOG.md` | −4 false claims | **none** — it is `story_checks_out_review`'s finding as much as mine. |
| CI `node-version: 24` | `.github/workflows/ci.yml` (1 line) | CI matches `engines` | **`speed_review` (CI):** negligible. Small risk that something currently passing on 22 fails on 24 — which is the point of finding out. |
| Second remote | none in-repo | +a second copy | **none** — no file changes, no code. Owner-run. |
| Refresh `CHANGELOG.md` | `CHANGELOG.md` | +1 entry | **`story_checks_out_review`:** a changelog entry is a new claim that can contradict another document; it must describe what shipped, not what a review recommended. |
| Correct the README's two numbers | `README.md` (2 numbers) | −2 stale figures | **none.** |

---

## CEILING

**95 is reachable, and three of the four criteria holding it back are one-line
fixes.** Nothing here is capped by a platform limit or by a locked decision in
ARCHITECTURE.md. From today's 90:

```
crit 3   78 -> 98   the lockfile row returns to 20/20 once it resolves to v0.16.0
                    (the last 2 stay: no container/devcontainer definition)
crit 4   75 -> 100  green gate (+18) + CI on node 24 (+7)
crit 9   93 -> 98   refresh the CHANGELOG; tags are optional for a deployed product
crit 1   80 -> 95   push the in-flight work (+15); the last 5 need a second remote
                                                        -> total 96
```

**One criterion is genuinely capped, and it is the one the skill is named after.**
Criterion 10 tops out at **60** while there is one author: the truck-factor row is
40 points and pays 0 at a factor of 1, 25 at 2, 40 at 3. A commit cannot move it;
only a second person committing to this repository can. That costs **2 points**,
permanently, and it is correctly priced rather than lamented — the mitigation is
already bought in criteria 5, 6, 7 and 12, all of which are at or near 100.

So the true ceiling with one author is **96**, and 95 clears comfortably. What
stands between today and that is a lockfile, a CI line, and a changelog.

---

## Verdict

**If this laptop went into the ocean tonight, a competent stranger would recover
every line of code, every one of 33 documents, 273 commits of history, a runbook
that tells them how to deploy and how to roll back, an inventory of every account
and domain, and a licence that tells them what they may do with it. They would
clone it in two seconds, install it in fifty, and then watch the project's own
gate fail on a library version its lockfile pins to a tag nobody meant — and
they would not be able to run the thing until they worked out something no
document mentions. They would lose twelve files of work in progress, and they
would find the secrets vault the documents describe is not there.**
