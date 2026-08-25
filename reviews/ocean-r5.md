# mac_fell_in_the_ocean — round 5 — Brimba · 2026-08-25

SCORE: **92/100**, ungated
(R1 60 gated / 87 uncapped · R2 25 gated / 85 uncapped · R3 90 · R4 94 · **R5 92**)

> **Measured at `f30f954` (branch `review-round5`), 2026-08-25 19:00–19:15 UTC**, and against a
> real anonymous clone of the remote. I wrote none of these repairs. The repository was not
> modified — this file is the only thing I wrote.

**The drill ran partially, and I declare it as such.** I cloned the public remote anonymously
and ran the README's install step; I did **not** run step three, `npm run check`, because this
run was instructed not to. Everything criterion 4 scores below is read off the CI config, the
package scripts and the README, not off a green run I performed. Round 4 did run it and got
exit 0 at `8a7e906`; I confirmed independently that the dependency the round-3 CRITICAL was
about now resolves correctly from a fresh clone.

---

## Arithmetic

Every criterion is the **sum of the rows earned from its point table**. The rubric says
`criterion = sum of points earned (0–100, never extrapolated)`, so a row is earned or it is
not — part-marks inside a row are an opinion nobody else can recompute. I judge each row on
substance and say which way, every time.

**This differs from round 4, which reported five criteria at values its own point tables
cannot produce.** Criterion 1 has rows 25/25/15/10/10/10/5 — 80 is not a subset sum of those.
Criterion 3 has rows 25/20/15/15/15/10 — 98 is not reachable. Nor is 95 on criterion 4
(30/25/20/15/10), 97 on criterion 8 (25/25/20/15/15), or 93 on criterion 9 (30/25/20/15/10).
Those five numbers were asserted, not derived. All are re-derived below.

| # | Criterion | w | R3 | R4 | **R5** | ×w | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | A remote copy exists and is current | 14 | 80 | 80 | **85** | 1190 | **last measurement wrong.** 85 is the row sum; 80 is not reachable. Nothing about the repo changed |
| 2 | The stored tree is complete | 9 | 100 | 100 | **100** | 900 | unchanged |
| 3 | Clone to running, reproducibly | 11 | 78 | 98 | **75** | 825 | **rubric misapplied** (no container exists, so 98 was never reachable) **and code changed** (the gate now needs the network) |
| 4 | A stranger can prove it works | 8 | 75 | 95 | **100** | 800 | **last measurement wrong.** All five rows are earned |
| 5 | The README is a real front door | 8 | 100 | 100 | **100** | 800 | unchanged — I followed it and only it |
| 6 | Architecture and decisions written down | 12 | 100 | 100 | **100** | 1200 | unchanged |
| 7 | Operating it: deploy, environments, rollback | 9 | 100 | 100 | **90** | 810 | **last measurement wrong.** The restore commands need a tool that is not in the repo — a defect an earlier ocean round found and nobody re-docked |
| 8 | The code explains itself | 8 | 97 | 97 | **100** | 800 | **last measurement wrong.** All five rows are earned |
| 9 | The history tells the story | 5 | 93 | 93 | **100** | 500 | **last measurement wrong.** See the conditional-row note |
| 10 | Bus factor and ownership | 5 | 60 | 60 | **60** | 300 | unchanged — single author. Not fixable by a commit |
| 11 | The legal right to reuse it | 5 | 100 | 100 | **100** | 500 | unchanged |
| 12 | The non-code inventory | 6 | 100 | 100 | **100** | 600 | unchanged |
| | | **100** | | | | **9225** | **9225 ÷ 100 = 92.25 → 92** |

**Gate:** criterion 1 = 85, above 70. No cap. Uncapped and reported figures are the same.

**Reconciliation against round 4, weighted, so the −2 is recomputable:**

```
crit 1  +5 × 14 =  +70      crit 7  −10 × 9 =  −90
crit 3 −23 × 11 = −253      crit 8   +3 × 8 =  +24
crit 4  +5 ×  8 =  +40      crit 9   +7 × 5 =  +35
                                        Σ = −174
9399 − 174 = 9225 ✔
```

**Four of the six movements are corrections to round 4's arithmetic and describe no change in
the repository. Only criterion 3 carries real news.**

---

## Per-criterion working

### 1 · A remote copy exists and is current — 85/100

| pts | row | earned | evidence |
|---:|---|---|---|
| 25 | a remote is configured and reachable | **yes** | `origin` → `https://github.com/alaap-swift-struck/brimba.git`; `git ls-remote` succeeds; an **anonymous** clone succeeded in 1.6 s |
| 25 | the current HEAD exists on the remote | **yes** | `origin/review-round5` == `HEAD` == `f30f954` |
| 15 | zero unpushed commits on the checked-out branch | **yes** | 0 |
| 10 | zero unpushed commits on every local branch | **yes** | `git rev-list --count <b> --not --remotes` = 0 for all twelve, including the seven local-only ones |
| 10 | no uncommitted modifications | **yes, with disclosure below** | 0 at the probe instant |
| 10 | no untracked files that look essential | **yes, with disclosure below** | 0 at the probe instant |
| 5 | more than one remote, or a documented second copy | **no** | one remote. No mirror, no archive, nothing in INVENTORY.md |

**The disclosure, because the tree moved under me.** At 19:00 UTC the working tree was clean
(0 modified, 0 untracked). By 19:15 UTC it held `M timings.json` and three untracked files:
`reviews/dead-end-r5.md`, `reviews/realtime-r5.md`, `reviews/speed-r5.md`. Those are **this
review round's own output**, written by sibling sessions measuring the same commit at the same
moment, plus one appended run of `scripts/timings.mjs`. I scored the two rows as earned
because the dirt is the review, not the repository — but the alternative is one subtraction
away and you should have it: **docking both rows gives criterion 1 = 65 and a total of
89.45 → 89.**

**A finding no row prices, and it is the biggest thing in this criterion.** `main` is
`892d28b`; HEAD is `f30f954`, **17 commits and 179 changed files ahead of it** (+14,557 −2,845),
all pushed. A stranger who runs `git clone` lands on `main` and gets a repository that does not
contain round 5's repair pass at all. Everything is stored; the *default* is stale. Merging or
repointing the default branch costs nothing and is the difference between "recoverable" and
"recoverable if you know which branch to ask for".

### 2 · The stored tree is complete — 100/100

All six rows earned. `.gitignore` carries `.env*`, which the probe flags — and the classic
failure it flags for does not apply: `.dev.vars.example` is tracked at the root (plus
`workers/auth/.dev.vars.example`), names every secret with a paragraph explaining what breaks
without it, and holds no values. Migrations are committed (`db/core/0001–0019`,
`db/ops/0001–0002`, team schema in `workers/tenancy/src/team-schema.ts`). Seed state is
documented at `INVENTORY.md:59-66`, closing "There is no fixture data to restore." The only
committed binaries are four small icons, and they are **regenerable from `shared/brand.ts` by a
committed script** — which is the row-10 answer done properly rather than merely satisfied.

### 3 · Clone to running, reproducibly — 75/100 *(round 4: 98)*

| pts | row | earned | evidence |
|---:|---|---|---|
| 25 | a documented, ordered setup path from clone to running | **yes** | `README.md:181-185` |
| 20 | a lockfile is committed | **yes** | `package-lock.json` + `web/package-lock.json` |
| 15 | the language/runtime version is pinned in-repo | **yes** | `.nvmrc` = `24`, `engines: { node: ">=24.0.0", npm: ">=11.0.0" }` |
| 15 | **every external prerequisite is named with a version** | **no** | see below |
| 15 | setup is one or two commands, not a prose narrative | **yes** | `npm install && npm run check` |
| 10 | a container or devcontainer definition exists | **no** | none in the repo (`git ls-files` finds no Dockerfile, compose file or devcontainer) |

**The 10-point container row has never been earnable, so round 4's 98 could not have been a row
sum.** Its stated reason for the missing 2 was an unmeasured SSH concern — see the M1 note
below, which I have now measured and closed.

**The 15-point prerequisite row is the real news, and it is new since round 4.**
`README.md:178-179` says:

> **Prerequisites:** Node 24+ (see `.nvmrc`) and npm 11+. **Nothing else** — the workers run on
> Cloudflare, and `npm run check` needs no account and no secrets.

That is now false in a way that matters to this criterion's plain-English question — *"and does
it still work in two years?"* `web/test/fork.test.ts:214` resolves the UI library's tag at test
time:

```ts
const wanted = execFileSync("git", ["ls-remote",
  "https://github.com/alaap-swift-struck/swift-struck-ui.git", `refs/tags/${tag}^{}`], …)
```

It is the **only** network call in the entire test suite, and it sits outside an assertion, so
when it fails the suite errors rather than reporting. I confirmed the failure by pointing git
at an unreachable proxy:

```
fatal: unable to access 'https://github.com/alaap-swift-struck/swift-struck-ui.git/':
       Failed to connect to 127.0.0.1 port 1
```

So the gate requires: the network, `git` on `PATH`, and that specific third-party repository
remaining reachable, public, and carrying tag `v0.16.0`. None of the three is named anywhere,
and the README states the opposite. It is a correct fix to a real problem (the check it
replaced accepted any 40-hex SHA and passed the round-3 CRITICAL verbatim) that quietly bought
a permanent external dependency for a repository whose whole premise is surviving without its
author.

**The fix that keeps the strength and drops the socket:** pin the expected SHA as a literal
beside the tag and assert lockfile equality against it. Same assertion, no network, and a
deliberate SHA bump becomes a visible one-line diff.

### 4 · A stranger can prove it works — 100/100 *(round 4: 95)*

All five rows earned: tests run by a documented command (`npm run check`); CI committed at
`.github/workflows/ci.yml` and genuinely running them (`- run: npm ci` / `- run: npm run check`,
which is eight `tsc` projects `&& npm test` across eight workspaces); one verify command
covering typecheck plus tests; **what green looks like is documented** —
`README.md:189` "Green looks like eight suites passing and no TypeScript output — the full
suite, ~13 s"; fixtures committed.

`README.md:193-196` deserves naming: it documents the trap that `npx tsc --noEmit` alone "finds
no inputs, prints the compiler's help text, and **exits 0 having checked nothing**". A document
that warns a successor off a false green is doing this criterion's actual job.

**Two defects that cost no row but undermine the proof:**
- `ci.yml:15` pins `node-version: 22`, against `engines >= 24`, `.nvmrc` 24, `README.md:178`
  "Node 24+" and `BOOTSTRAP.md:26` "An older Node fails the `npm install`". The gate is being
  proven green on a runtime the project declares unsupported.
- `ci.yml:5` fires on `push: branches: [main]` and `pull_request`. The seventeen commits on
  `review-round5` — the entire round-5 repair pass — have therefore never been CI-checked.

### 5 · The README is a real front door — 100/100

All eight rows earned. 2,271 words against a ~4,000 penalty threshold, and it is emphatically
not the only document, so no penalty. `README.md:3` names what it is and who it is for;
`:178` prerequisites; `:182` install; `:184` run; `:183` test; `:38` deploy pointer; `:32-40`
plus `:45-172` the documentation map; `:42` the licence.

One blemish worth a sentence and no points: the opening carries three inline `UPDATED
2026-06-2x:` edit markers, which read as changelog leaking into the front door.

### 6 · Architecture and decisions are written down — 100/100

All six rows earned. The 20-point decision-record row is the hardest in this rubric and is
earned on content, in the locked-decision-in-topic-doc shape the rubric explicitly accepts.
Two verbatim examples, both naming the rejected alternative *and* what rejecting it costs:

> `ARCHITECTURE.md:318` — "**What is deliberately NOT built:** a short-lived cache of 'this
> session is valid'… It is not built because it buys resilience with revocation: a session you
> revoked — a departing employee, a stolen laptop — would keep working for the length of the
> cache."

> `DATA-MODEL.md:459`, under *"Considered and DECLINED — do not re-propose without new
> evidence"* — "`member_roles(is_default)` | The query is real… but this is a PER-TEAM table,
> so the write cost multiplies by every tenant."

The 10-point diagram row is earned but thin: one ASCII topology at `ARCHITECTURE.md:298-306`
plus described topologies in tables, no mermaid anywhere, and the rich interactive map is
gitignored **and** needs a skill from `~/.claude/skills/` (`OPERATIONS.md:213,226`) — so it does
not survive the premise of this review at all.

### 7 · Operating it: deploy, environments, rollback — 90/100 *(round 4: 100)*

| pts | row | earned | evidence |
|---:|---|---|---|
| 25 | deploy procedure documented and repeatable | **yes** | `OPERATIONS.md:11-12` → real npm scripts → seven `wrangler deploy` calls in binding order + smoke. The cold-start `code 10143` cycle and its break-once workaround are documented at `:43` |
| 20 | every environment named, with URL and purpose | **yes** | staging and production URLs at `:8-9`, per-worker names at `:28-36`, local dev at `:229-232`, ops DBs per env at `:288-291`. Purpose is not stated as such — a one-line env table would fix a real readability gap — but a stranger is in no doubt which is live |
| 20 | rollback documented and has a named trigger | **yes** | `:339` "**The trigger.** Roll back when any of these is true after a deploy, without waiting to find the cause:" then four concrete conditions; reverse order at `:363`; what does **not** roll back at `:368-379` |
| 15 | required secrets inventoried by name | **yes** | `BOOTSTRAP.md:170-177`, `.dev.vars.example`, `SECRETS.md:86-93`. Names only |
| 10 | what to check when it breaks | **yes** | three health endpoints, the error read door `GET /api/data-ops/admin/errors?status=open`, `Server-Timing` per request. Gap: `wrangler tail` appears in no document and no dashboard is named |
| 10 | **backup and restore for any stateful component** | **no** | see below |

**The row that costs 10 points.** The only two database-restore commands in the runbook are:

```bash
cf-exec npx wrangler d1 time-travel info <database-name>
cf-exec npx wrangler d1 time-travel restore <database-name> --bookmark=<bookmark>
```

`grep -r cf-exec` over every tracked file returns exactly one hit: `OPERATIONS.md` itself. The
binary lives at `~/.local/bin/cf-exec` — on the laptop this review assumes is gone. The rubric
is explicit that this zeroes the row: *"A step that requires a tool the stranger may not have is
not a documented step… Award the row only where a plain command, a script in the repo, or a
click path a person can follow exists."*

This is not a new defect. An earlier ocean round found it (`reviews/ocean.md:412-422`, with the
fix already written out: *"drop the prefix, or commit `scripts/cf-exec` and say what it sets"*).
It was never fixed and rounds 3 and 4 both scored this criterion 100 anyway. **The fix is
deleting eleven characters twice** — every other command in the file is already written as plain
`npx wrangler`.

The surrounding content is otherwise the strongest operations writing in the repository:
`:394` names the exact Time Travel window with the date it was checked ("30 days on the Workers
Paid plan (7 on Free — checked against Cloudflare's docs 2026-08-18)"), `:414-435` records a
restore drill that was actually performed, and `:437` admits R2 is unversioned rather than
pretending otherwise.

### 8 · The code explains itself — 100/100 *(round 4: 97)*

Comment density 28% (band is 10–30%); 71% of files open with a purpose line ("most"); a
five-file random sample — `shared/workers/validate.ts`, `shared/workers/paging.ts`,
`shared/test/source.ts`, `workers/data-ops/src/lib/import-plan.ts`,
`workers/mcp/src/lib/tokens.ts` — every one of which explains *why* and names the failure that
earned the rule rather than restating the code; public interfaces documented at the boundary;
CONVENTIONS.md + UI-CONVENTIONS.md exist and naming follows them. All five rows earned.

`shared/test/source.ts:1-23` is the best example in the repo: it opens by listing the four ways
its own predecessors read source *wrongly*, and derives the module's existence from them.

### 9 · The history tells the story — 100/100 *(round 4: 93)*

Median subject length **77** characters (threshold 25); **0%** low-effort messages (threshold
<10%); a real, maintained `CHANGELOG.md` that explicitly declines to hand-maintain a commit
count and hands post-2026-08-12 history to `BASE-IMPROVEMENTS.md`; **88%** Conventional
Commits across 292 analysed. 301 commits, 96 of the last 100 carrying a substantive body.

**The conditional row, stated openly.** Row four is "commits reference issues or pull requests
**where those exist**". There is no issue tracker and there are no pull requests; the condition
is false, so the row cannot be a deduction and I award it. The equivalent traceability is real —
`BASE-IMPROVEMENTS.md` records the campaign finding by finding and commit bodies name the review
and the fault. **If you prefer to withhold it: criterion 9 = 85 and the total is 91.5 → 92** —
the reported score does not change.

No git tags exist. The row is an OR and the changelog satisfies it, but a tag is also the
cheapest way to make `reviews/` recoverable while taking it out of the working tree — a fix
`lean_mean` wants and `ROUND5-RECONCILIATION.md:78` has already settled as satisfying both.

### 10 · Bus factor and ownership — 60/100

Truck factor **1** (Avelino Degree-of-Authorship, 498 files, one author) → 0 of 40.
`.github/CODEOWNERS` → 25. Named reachable maintainer (`README.md:43`) → 20. `CONTRIBUTING.md:22-29`
walks a newcomer's first change with real commands → 15.

A truck factor of 1 is the normal state of a solo project and is stated here as a fact.
`CODEOWNERS:5-8` does something rare and right: it names its own bus-factor risk and routes the
reader to the three documents that mitigate it. **This criterion withholds 200 weighted points —
2.0 score points — permanently, and no commit can move it.**

### 11 · The legal right to reuse it — 100/100

`LICENSE` exists; terms unambiguous ("PROPRIETARY AND CONFIDENTIAL", with an explicit grant to
Swift Struck and anyone authorised in writing); copyright stated ("© 2026 Swift Struck");
third-party obligations acknowledged in the closing paragraph. Open and closed score
identically under this rubric and this is as clear as MIT.

### 12 · The non-code inventory — 100/100

All six rows earned from `INVENTORY.md` (691 words, and better for being short): eight services
each with a "Without it" column; account ownership at `:25-27`; an **honest negative** on
domains at `:48` ("no custom domain or DNS record is required to rebuild") with the future
obligation named; the four data sources at `:59-66`; the nightly cron `10 3 * * *` with its four
jobs, the rate-limit namespaces and the MCP tokens at `:70-74`; the contact at `:6`.

---

## The drill

Anonymous clone of the public remote into the scratchpad, then the README's steps, in order.

| # | Step | R4 result | **R5 result** |
|---|---|---|---|
| 1 | `git clone https://github.com/alaap-swift-struck/brimba.git` | OK 2.1 s | **OK — 1.6 s**, anonymous, lands on `main` @ `892d28b` (**17 commits behind the reviewed HEAD**) |
| 1b | `git checkout review-round5` | — | **OK** — `f30f954` |
| 2 | `npm install` | OK 8 s | **OK — exit 0, 303 packages, 7.8 s** |
| 3 | `npm run check` | OK exit 0 | **NOT RUN — instructed.** Criterion 4 is scored off CI, the scripts and the README, and says so |

**Round 4's M1 is now MEASURED, and it is not a problem.** M1 was that `package-lock.json`
resolves the UI library over `git+ssh://git@github.com/…`, which a credential-free stranger may
not be able to use, and round 4 could not isolate it from the machine's own git credentials. I
isolated it: a second clone, then `npm install` under `env -i` with an empty `HOME`, no global
git config, and `GIT_SSH_COMMAND` forced to `IdentityFile=/dev/null -o BatchMode=yes`.

```
added 303 packages in 13s        exit 0
node_modules/@swift-struck/ui/package.json → 0.16.0
registry/primitives/connection-status/connection-status.tsx  present
```

npm falls back to HTTPS for a public GitHub spec. A credential-free stranger installs
successfully. **M1 is closed as a non-issue, measured rather than assumed.** The round-3
CRITICAL — lockfile resolving v0.4.0 against a v0.16.0 manifest, so a fresh clone did not
compile — remains genuinely fixed: lockfile, manifest and on-disk package all read v0.16.0.

---

## The secrets vault: worth exactly zero points, and here is the table

`secrets.vault` does not exist. I checked the file (absent), the git history, and the three
documents — all of which say so plainly and correctly:

- `SECRETS.md:21` — "**One encrypted file — `secrets.vault` — which does not exist yet.**"
- `OPERATIONS.md:391` — "`secrets.vault`, encrypted, **not yet created**"
- `INVENTORY.md:79` — "**It has not been run yet.**"

I also found `npm run vault:save` **running right now**, started at 15:20 local and still parked
at its passphrase prompt three and a half hours later. Somebody began sealing it and walked
away.

**Round 4 called sealing it "the one thing still owed by the owner". On this rubric it is worth
0.0 points, and that is checkable row by row:**

| where a reader might expect it to count | what the row actually says | earned already? |
|---|---|---|
| crit 1, row 5 (5 pts) | "more than one remote, or a documented second copy (mirror, backup, archive)" | **No — and the vault does not earn it.** A file committed to the *same single remote* is neither a second remote nor a second copy of the repository |
| crit 2, row 25 | ".env.example (or equivalent) lists every required variable **by name**" | already earned by `.dev.vars.example` |
| crit 7, row 15 | "required secrets are inventoried **by name** (never by value)" | already earned |
| crit 12, all six rows | services, accounts, domains, data, cron, contacts | already earned |

And the skill's hard rule, verbatim: *"**Never print a secret**, and never treat a missing
secret as a finding — the finding is a missing *inventory* of which secrets exist, never their
values."* This rubric measures whether a successor **knows what secrets exist**. It does not
measure whether they can **read them**. Sealing the vault moves this score by zero.

**The macOS Keychain alternative is worse than neutral — it is disqualified by the premise.**
`ROUND5-RECONCILIATION.md:115` already settled it: *"The login keychain is on the laptop this
review assumes is at the bottom of the ocean. It would produce a file nobody alive can open."*
That is correct and it is not a close call: this review scores **what is stored remotely**, and
a login keychain is by construction stored on the machine. iCloud Keychain would survive the
laptop but not the author — it is an account a successor has no path into — so it fails the same
premise one step later.

**What the vault IS worth, off-rubric, stated so nobody inflates it.** `SECRETS.md:12-15`: with
the secrets gone there is "no way to redeploy `auth`, `tenancy`, `content`, `gateway` or `mcp`
with an `INTERNAL_KEY` matching the one already live". The code survives, the app keeps serving,
and the loss is the ability to *deploy* until someone rotates a fresh `INTERNAL_KEY` across five
workers in one coordinated pass — recoverable, disruptive, and a genuinely bad afternoon. It is
worth doing for that reason and for no scoring reason. **Anyone quoting it as points is quoting
zero.**

---

## Findings

### H1 · HIGH — the gate now requires the network, and a third party's repository, for ever
`web/test/fork.test.ts:214` · `README.md:179` · **costs criterion 3's 15-point row (−1.65)**

Detailed under criterion 3. The check itself is right — it is the third attempt at a fault that
twice looked finished, and it finally has "no shape left to satisfy without being correct". The
cost is that `npm run check` now dies without a socket, the README says it needs nothing, and
the URL is the author's account, which the fork sweep does not rename. **Fix:** pin the expected
SHA as a literal beside the tag and assert lockfile equality; then correct `README.md:178-179`
either way, because a prerequisite list that says "nothing else" must be true.

### H2 · HIGH — `cf-exec` is still in the disaster-recovery runbook, three rounds after it was found
`OPERATIONS.md:402-403` · **costs criterion 7's 10-point row (−0.9)**

Detailed under criterion 7. The two commands a successor runs to restore a database begin with a
binary that exists only on the author's laptop. Found in an earlier ocean round with the fix
already written; not fixed; scored 100 twice since. **Fix: delete the prefix.**

### M1 · MEDIUM — `main` is 17 commits behind the reviewed HEAD, and `git clone` lands there
`main` @ `892d28b` vs `review-round5` @ `f30f954` · 179 files, +14,557 −2,845

Everything is pushed, so nothing is *lost* and no row is docked. But the stranger this review is
about types `git clone` and gets a repository without round 5 in it, with nothing telling them
another branch is newer. Merge it, or repoint the default branch.

### M2 · MEDIUM — CI runs the gate on a Node the project declares unsupported
`.github/workflows/ci.yml:15` (`node-version: 22`) vs `package.json:31` (`>=24.0.0`), `.nvmrc`
(24), `README.md:178`, `BOOTSTRAP.md:26` ("An older Node fails the `npm install`"). Four sources
agree and CI disagrees with all of them. Also `ci.yml:5` never fires on the branch under review.

### L1 · LOW — the vault-honesty check is on its third attempt and still has two escapes
`web/test/rules/doc-facts.test.ts:110-160` · **costs nothing; the documents are correct**

Round 4 found this check unable to fail and named two escapes. It was rewritten — inverted, so a
line naming the vault must carry a not-yet marker — and **only one of the two escapes was
closed.** Re-run out of tree against the real files plus sabotage:

| # | sabotage | result |
|---|---|---|
| as-is | the repository's own root `.md` files | `[]` — clean, and 7 real lines are examined, so not vacuous |
| V1 (round 4's) | "The encrypted vault **is committed** to the repo like anything else." | **PASSES — still escapes** |
| V2 (round 4's) | "`secrets.vault` **holds** every credential." | **caught** ✔ |
| V3 (new) | "Every credential is in `secrets.vault`, so **once** you clone you have them all." | **PASSES — new escape** |

V1 escapes on the line-level `if (!/secrets\.vault/.test(line)) continue` guard — the half round
4 named *first* and explicitly ("a sentence that says 'the vault' in prose without the filename
is skipped entirely, which is how a human writes it") and which was left untouched. V3 is
created by the inversion itself: the disclaimer vocabulary includes `once`, `until` and
`will be`, which are ordinary words in ordinary claim sentences. **Fix:** widen the subject to
any line matching `/\bvault\b/` near the filename or in a paragraph that names it, and narrow the
disclaimer list to markers that cannot appear in a claim (`does not exist`, `not yet`,
`has not been`, `vault:save`).

### L2 · LOW — `SECRETS.md` says the vault does not exist twice, in five lines
`SECRETS.md:21-26`. The second sentence is a partial duplicate of the first and reads as a
botched edit. Correct, and it looks careless in the one document whose whole job is to be
trusted at 2am.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **H1** pin the expected SHA as a literal; assert lockfile equality; correct the README prerequisite line | `web/test/fork.test.ts` (~4 lines), `README.md` (1 line) | REMOVES the only network call in the test suite; ADDS a literal that must be bumped deliberately | **`base_fork_review`** — R26 is that review's spine, and this makes a fork's gate independent of the base author's GitHub, which it currently is not. Strict improvement. **`lean_mean_review`** — a hardcoded SHA beside a tag looks like duplication; write the reason beside it or it will be "tidied" away |
| **H2** delete the `cf-exec` prefix | `OPERATIONS.md` (2 lines) | REMOVES an undefined command from the recovery runbook | **none.** Every other command in the file is already plain `npx wrangler` |
| **M1** merge `review-round5` into `main`, or repoint the default branch | git only | ADDS nothing to the tree | **none in code.** Do it *after* the round's re-measures land, or every open report's HEAD reference goes stale mid-round |
| **M2** set `ci.yml` to Node 24 | `.github/workflows/ci.yml` (1 line) | REMOVES a version disagreement between five sources | **`story_checks_out_review`** improves. Watch for a first-run red: nothing has ever proven the suite green on 24 *in CI*, only locally |
| **L1** widen the vault check's subject, narrow its disclaimer list | `web/test/rules/doc-facts.test.ts` (~6 lines) | REMOVES two escapes | **`story_checks_out_review`** — a wider check flags prose it currently ignores, so SECRETS/OPERATIONS/INVENTORY may each need a clause. That is the check working, but it is churn in that review's subject matter |
| **Add a second remote or a documented mirror** | git config + `INVENTORY.md` | ADDS the only thing standing between one GitHub outage and no copy | **OWNER-ONLY.** Worth **+0.7 points** (criterion 1, 5 of 100 at weight 14). Real insurance, small score |
| **Seal the vault** (`npm run vault:save`) | `secrets.vault` (new) + three wording changes | ADDS the artefact between a lost laptop and lost credentials | **OWNER-ONLY. Worth 0.0 points on this rubric** — see the table above. Do it for the redeploy story, not for the score. **`security_sentry_review`** would need to re-verify that no key material leaks into the committed ciphertext's surroundings |

---

## CEILING

**95 is reachable, comfortably, and the true maximum is 97.** Criterion 10 is the only wall.

| criterion | now | max | blocked by |
|---|---:|---:|---|
| 10 · Bus factor | 60 | **60** | **Single author. Not fixable by a commit.** A second contributor is a hiring decision |
| 3 · Clone to running | 75 | 100 | H1 (+15) and a devcontainer (+10) |
| 7 · Operating it | 90 | 100 | H2 (+10) — eleven characters |
| 1 · Remote current | 85 | 90 | a second remote (+5), owner-only |
| everything else | 100 | 100 | — |

```
14×90 + 9×100 + 11×100 + 8×100 + 8×100 + 12×100 + 9×100 + 8×100 + 5×100 + 5×60 + 5×100 + 6×100
= 1260 + 900 + 1100 + 800 + 800 + 1200 + 900 + 800 + 500 + 300 + 500 + 600
= 9660 → 96.6 → 97
```

**The cheapest route past 95 is two edits and neither is code:**

| rank | change | points | effort |
|---|---|---:|---|
| 1 | H1 — SHA literal + one README sentence | **+1.65** | ten minutes |
| 2 | H2 — delete `cf-exec` twice | **+0.90** | one minute |
| 3 | a devcontainer | +1.10 | an afternoon |
| 4 | a second remote (owner) | +0.70 | five minutes, and worth more than the points |

92.25 + 1.65 + 0.90 = **94.8 → 95**, for eleven minutes of editing. Add the devcontainer and it
is 95.9 → 96. **Criterion 10 alone withholds 2.0 points permanently while the project has one
author** — which is why 97, not 100, is the honest maximum.

---

## Things no rubric asked about

1. **The gate has never been proven on the runtime the project requires.** CI runs Node 22;
   every other source says 24. Whichever is right, one of them is untrue today, and the one a
   stranger will trust is the CI badge.
2. **`shared/test/source.ts` is the most valuable document in the repository and is not a
   document.** It opens by enumerating four ways this codebase's own checks read source
   incorrectly, and derives its existence from them. A successor who reads only that file
   understands the project's engineering culture better than from any of the 43 markdown files.
3. **The tree is being written by five concurrent sessions.** Between 19:00 and 19:15 UTC one
   file was modified and three appeared, all of them this round's own review output. It is
   worth knowing that a "clean working tree" measurement in this repository has a shelf life of
   minutes, and any future score that leans on it should timestamp itself as this one does.
4. **The icon set is now genuinely derived from `shared/brand.ts`.** I regenerated all six files
   in a scratch tree and they are byte-identical to what is committed — which means the four
   committed binaries in criterion 2's row 5 are reproducible from source, not merely small.
   That is a stronger position than the row asks for and worth saying once.

---

**The verdict, in one sentence:** if this laptop went into the ocean tonight a stranger would
recover a complete, honest, unusually well-explained repository and have it installed in under
ten seconds — they would land on a default branch seventeen commits stale, they would find that
the one command proving the project works needs a socket the README says it does not, and when
they came to restore a database at 2am the runbook would hand them a command that does not
exist on their machine.
