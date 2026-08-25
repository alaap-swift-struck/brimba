# If the mac fell in the ocean — Brimba · 2026-08-25 · ROUND 2
SCORE: 25/100 gated · **85/100 uncapped** · **60/100 on the round-1-comparable basis**

Three numbers, because one would mislead. All of them are printed with their arithmetic
below and none of them is tuned.

- **85** is the honest weighted total.
- **25** is what the rubric's gate produces from what I measured at **13:56:57 today**,
  because criterion 1 fell to 35 and the rubric caps any total at 25 when criterion 1 is
  below 40.
- **60** is the number comparable to round 1, computed by scoring criterion 1's
  "no uncommitted modifications" row exactly as round 1 scored it — awarding it despite
  campaign-generated working-tree churn. On that basis criterion 1 is 45, the same band,
  the same cap.

**Nothing on the remote has changed since round 1.** `origin/main` is still `081595d`;
GitHub reports `pushed_at: 2026-08-18T08:38:36Z`, seven days ago. Every criterion that
scores *what is stored* is therefore unchanged by construction, and I say so per row rather
than pretending to have re-measured a moving target. What moved is entirely on this laptop,
and all of it moved in the wrong direction.

**The parent's question — "local is one commit ahead of origin, is that still true?" —
answered precisely:** `main` is still exactly 1 commit ahead (`8751e30`, unchanged). But the
**checked-out** branch is now `review-campaign`, which is **8 commits ahead of
`origin/main` and does not exist on the remote at all** (`git ls-remote --heads origin
review-campaign` returns zero refs). So: the old gap is unchanged, and a new, eight-times
larger one opened beside it.

---

## DELTA

Round 1: 60/100 gated (87 uncapped) → Round 2: **25/100 gated (85 uncapped)**; on the
round-1-comparable basis, **60 gated (86 uncapped)**.

| # | Criterion | R1 | R2 | Why it moved |
|---|---|---:|---:|---|
| 1 | A remote copy exists and is current | 45 | **35** | **DOWN 10.** Same three rows fail as in round 1, but a fourth now fails too: 4 source and test files carry uncommitted modifications (round 1: 0). On round 1's own treatment of campaign churn this row would be awarded and the criterion would read 45 — unchanged in score, ~8× worse in exposure. Full finding below. |
| 2 | The stored tree is complete | 100 | **100** | Unchanged. Remote tree identical. Re-proven by the drill: a bare clone installs and checks green with no credentials. |
| 3 | Clone to running, reproducibly | 85 | **85** | Unchanged. Re-proven: clone 1s + install 7s + check 17s = **25 seconds** to verified. Still no container definition (0/10) and the runtime pin is still contradicted (10/15). |
| 4 | A stranger can prove it works | 95 | **95** | Unchanged. Re-measured on the clone: **589 tests, 8 suites, exit 0**; `tsc --noEmit -p` runs against all **8** projects. README still claims 518 — stale by 71. |
| 5 | The README is a real front door | 100 | **100** | Unchanged. Remote README byte-identical except the R1–R25 law-range line, which is a local-only commit. |
| 6 | Architecture and decisions are written down | 100 | **97** | **DOWN 3 — and this is a correction to my own round-1 measurement, not damage from anyone's repair.** `SECRETS.md`'s vault decision record states a security property that is false in the code it describes (finding 2). The rubric is explicit that a wrong decision record is worse than a missing one. |
| 7 | Operating it: deploy, environments, rollback | 91 | **91** | Unchanged. `OPERATIONS.md` untouched on the remote. The backup row is still 5/10 because the secrets half of restore is documented and does not exist. |
| 8 | The code explains itself | 98 | **98** | Unchanged on the remote. (Locally the probe now reads 23% density over 279 files vs 22%/276 — that is the unpushed repair work, which a stranger does not get.) |
| 9 | The history tells the story | 97 | **97** | Unchanged on the remote. Locally, the 8 new commits have a median subject length far above the threshold and 0% low-effort, so the local figure would be no worse. Still zero tags on the remote. |
| 10 | Bus factor and ownership | 60 | **60** | Unchanged. Truck factor still **1**, over 408 files, one author owning all 408 (Avelino DOA, arXiv:1604.06766). All 60 non-truck-factor points still earned. |
| 11 | The legal right to reuse it | 100 | **100** | Unchanged. `LICENSE` present; GitHub reports `NOASSERTION` because the licence is an explicit proprietary grant, not an SPDX id — which the rubric scores identically to MIT. |
| 12 | The non-code inventory | 95 | **95** | Unchanged. `INVENTORY.md` untouched; `swift-struck-ui` still absent from its service table. |

**Two criteria went down. Neither was caused by another reviewer's repair.**

- Criterion 1 went down because the campaign itself has produced eight commits and four
  working-tree edits of real repair work, none of which has been pushed. The repairs are
  good; their storage is not.
- Criterion 6 went down because round 1 scored the vault decision record on its structure
  and did not check whether its stated security property was true. `security_sentry`'s
  round 1 checked, and it is not. I have re-verified that independently below and I am
  correcting my own number rather than defending it.

**Nothing any other reviewer fixed lowered anything here.** The six repair commits are, for
this review, a strict improvement in content and a strict worsening in storage — and only
the second one is scored, because only the second one is what this review measures.

---

## The drill — the falsifiable part

Announced and run: I cloned the **remote** into the session scratch directory and followed
only what the README says, in the order it says it. No local knowledge, no credentials, no
SSH agent, no git config.

| # | Step | Command | Result |
|---|---|---|---|
| 0 | reachability | `curl api.github.com/repos/alaap-swift-struck/brimba` | **200**, `private: false`, `default_branch: main`, `pushed_at: 2026-08-18T08:38:36Z` |
| 1 | clone | `GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 git clone https://github.com/alaap-swift-struck/brimba.git` | **1s**, exit 0, HEAD `081595d`, **384 files** |
| 2 | install | `npm install` with `SSH_AUTH_SOCK` unset, `IdentityFile=/dev/null`, `BatchMode=yes` | **7s**, exit 0, 303 packages |
| 3 | verify | `npm run check` | **17s**, exit 0 |

**Time to verified: 25 seconds, from nothing, by a stranger with no account and no
credentials.** That is the single best fact in this report and it has not regressed.

**I confirmed the compiler actually ran** rather than hitting the empty-input trap the
README itself warns about: `check` is `npx tsc --noEmit -p` against **all eight** projects
in sequence, then `npm test` across all eight workspaces. The log contains zero lines of
compiler help text. Counted from the log: **589 tests across 8 suites**, all passing.

The lockfile still resolves the UI library over `git+ssh`
(`git+ssh://git@github.com/alaap-swift-struck/swift-struck-ui.git`), and it is still **not**
a blocker — npm falls back to HTTPS for a public repo, proven again with no SSH agent
available.

Node 24.16.0 / npm 11.13.0 against `.nvmrc` = `24`: satisfied.

The scratch clone was deleted. **Nothing in this repository was written except this file and
`reviews/base-fork-r2.md`.**

---

## Arithmetic

`total = Σ(criterion × weight) / 100`. Weights sum to 100.

| # | Criterion | Score | Weight | Points |
|---|---|---:|---:|---:|
| 1 | A remote copy exists and is current | **35** | 14 | 490 |
| 2 | The stored tree is complete | 100 | 9 | 900 |
| 3 | Clone to running, reproducibly | 85 | 11 | 935 |
| 4 | A stranger can prove it works | 95 | 8 | 760 |
| 5 | The README is a real front door | 100 | 8 | 800 |
| 6 | Architecture and decisions are written down | **97** | 12 | 1164 |
| 7 | Operating it: deploy, environments, rollback | 91 | 9 | 819 |
| 8 | The code explains itself | 98 | 8 | 784 |
| 9 | The history tells the story | 97 | 5 | 485 |
| 10 | Bus factor and ownership | 60 | 5 | 300 |
| 11 | The legal right to reuse it | 100 | 5 | 500 |
| 12 | The non-code inventory | 95 | 6 | 570 |
| | | | **100** | **8507** |

**Uncapped total = 8507 / 100 = 85.07 → 85.**
**Gate: criterion 1 = 35, below 40 → total capped at 25.**

**Round-1-comparable basis** (criterion 1's uncommitted-modifications row awarded as round 1
awarded the untracked row, treating campaign churn as not-project-state): criterion 1 = 45,
total = `8507 + 10×14 = 8647 / 100 =` **86 uncapped**, gate band 40–69 → capped at **60**.

### 1 · A remote copy exists and is current — 35/100 (weight 14) · measured 13:56:57

| pts | check | earned | evidence |
|---:|---|---:|---|
| 25 | remote configured and reachable | **25** | `origin` = `github.com/alaap-swift-struck/brimba`; `git ls-remote` succeeds anonymously; the API answers 200 unauthenticated |
| 25 | current `HEAD` exists on the remote | **0** | HEAD = `3d8a16d`. `git ls-remote --heads origin` returns exactly three refs: `main` = `081595d`, `fix/fork-findings-7`, `perf/scale-94`. **`review-campaign` is not among them.** |
| 15 | zero unpushed commits on the checked-out branch | **0** | `git rev-list --count origin/main..HEAD` = **8** |
| 10 | zero unpushed commits on every local branch | **0** | `main`: 1 (`8751e30`, unchanged from round 1). `review-campaign`: 8. The other 8 local branches: 0 each, verified with `--not --remotes` — all merged, correctly not penalised |
| 10 | no uncommitted modifications in the working tree | **0** | **4 modified files**: `shared/test/gating-seam.ts`, `workers/data-ops/test/error-seam.test.ts`, `workers/gateway/src/index.ts`, `workers/mcp/test/gating-seam.test.ts`. Round 1 measured 0. |
| 10 | no untracked files that look essential | **10** | 7 untracked paths, all `reviews/*-r2.md` — this campaign's own reports, not project source. Scored as round 1 scored the same class. |
| 5 | more than one remote, or a documented second copy | **0** | one remote. `INVENTORY.md` names this as single point of failure #1, honestly. |

**What is at risk tonight, measured rather than characterised.** `git diff --shortstat
origin/main..HEAD`:

```
65 files changed, 10928 insertions(+), 568 deletions(-)
```

Excluding this campaign's own report files, that is **44 files, 1,337 insertions, 568
deletions of real source, test and documentation change** — plus four more files edited and
not yet committed. Round 1's equivalent figure was a four-line deletion in two vendored
documents, and I said then, correctly, that nothing irreplaceable was at risk.

**That sentence is no longer true.** What is now laptop-only includes: the R10 gating-seam
suite for auth (ten state-changing doors that had no check), the privilege-amplification
fix, `shared/test/source.ts` and the eight rule checks rebuilt on it, the fail-closed
orphan sweep, the five `one*` readers, the `postScreen` gate correction, and — in the
uncommitted working tree at this moment — a bounds fix on the gateway's `/media/*` decoder
with a thirty-line comment explaining a denial-of-service path it closes. None of it is
stored anywhere but here.

**Why the gate firing is not an artefact even though the trigger is transient.** The rubric
caps at 25 when criterion 1 is below 40 because at that point the documentation quality
stops mattering — it describes something that may not survive. That is precisely the
situation for the last eight commits. The cap is loud, the cap is temporary, and **one
command removes it.**

### 6 · Architecture and decisions are written down — 97/100 (weight 12)

25 (system shape) + 20 (data model) + **17**/20 (decision records) + 15 (per-module) + 10
(topology diagram) + 10 (docs in-repo, versioned) = **97**.

Everything round 1 credited is still true and still excellent — `ARCHITECTURE.md`'s twenty
locked decisions state what was rejected and what it cost, which is a Nygard ADR in
everything but filename. The 3-point deduction is confined to one record: `SECRETS.md`'s
vault section, which is a decision record in exactly the right shape (chose an encrypted
committed vault, rejected plaintext and rejected a private repo, gave reasons) whose
**central stated reason is false in the code it describes**. Finding 2.

The deduction is small deliberately: the decision itself is defensible and the crypto is
correct. What is wrong is one sentence of the justification and one unstated threat-model
assumption — and the rubric's warning is that the next person believes a decision record.

---

## Findings

### CRITICAL · 1 · Eight commits and four working-tree edits of repair work exist only on this laptop

**Plain English:** the repairs this campaign produced are, right now, stored nowhere. The
codebase survives — 250 of 258 commits are on GitHub — but a week of security and
correctness work does not.

- `git rev-list --count origin/main..HEAD` = **8**
- `git ls-remote --heads origin review-campaign` = **0 refs**. The working branch has never
  been pushed.
- `git status --porcelain` = **4 modified source/test files**, uncommitted, at 13:56:57.
- GitHub's own record: `pushed_at: 2026-08-18`. Nothing has been stored for seven days.

**Why it matters more than round 1's version of this finding.** Round 1's unpushed commit
deleted two vendored documents and changed one word. This one carries the auth R10 gating
suite, the privilege-amplification fix, the `stripComments` correction that made eight Law
checks able to see the code they read, and a gateway bounds fix. Every one of those is
security-relevant and none is reconstructible from memory.

**The fix, and it is one line the owner runs:**

```
git push -u origin review-campaign
git push origin main
```

Worth **+700 weighted points** — criterion 1 goes 35 → 95, the gate lifts entirely, and the
total goes from 25 to **93**. Nothing else in this report comes close to that return.

*(Committing the four modified files first is the owner's call — they are mid-repair. The
branch push is not blocked on them.)*

### CRITICAL · 2 · `secrets.vault` still does not exist, and the document that promises it also states a security property the code does not have

This is the owner's to do, it was not addressed, and round 2 adds a second, independent
defect in the same document. I re-verified both from the code.

**2a — the vault does not exist.** Re-verified four ways:

1. `ls secrets.vault` → No such file or directory
2. `git log --all --diff-filter=A -- secrets.vault` → **empty. Never committed, on any
   branch, ever.**
3. `git ls-tree -r --name-only origin/main | grep -i vault` → only `scripts/vault.mjs`
4. The project's own tool, `node scripts/vault.mjs check`, prints:
   *"NO VAULT. These secrets exist ONLY on this laptop, and Cloudflare will not read a
   secret back to you."* and **exits 1**.

Four documents still say it exists: `SECRETS.md:36` ("One encrypted file, `secrets.vault`,
committed to the repo like anything else"), `SECRETS.md:78` (total-loss runbook step 3:
"`npm run vault:open` — type the passphrase. Every `.dev.vars` comes back"),
`OPERATIONS.md:341`, and `CHANGELOG.md` (2026-08-11, "so the credentials survive the
laptop"). A stranger following the documented recovery runs `npm run vault:open` and gets
`no secrets.vault in this repo`.

**2b — NEW, and `security_sentry` found it first. I re-verified it independently and it is
correct.** `SECRETS.md:42-46` says, in bold:

> **The passphrase never leaves the process.** No command-line argument (visible to every
> process on the machine via `ps`), no environment variable, no temp file — `node:crypto`
> does the work in-process.

`scripts/vault.mjs:20-24` repeats it in the file header. The code at
`scripts/vault.mjs:82-91` does this:

```js
function askPassphrase(confirm) {
  const read = (prompt) =>
    execFileSync("/bin/sh", ["-c", `printf '%s' "${prompt}" >&2; stty -echo; read v; stty echo; printf '\\n' >&2; printf '%s' "$v"`], {
      stdio: ["inherit", "pipe", "inherit"],
    }).toString()
```

The passphrase is typed into a **child `/bin/sh` process**, held in a **shell variable
`$v`**, and returned to Node **over an OS pipe**. It crosses a process boundary twice. The
claim is false on its headline.

Three of the four sub-claims *are* true and should be said so: the passphrase is not in an
argument list (the argv carries the prompt and the script, never the secret), not in an
environment variable, and not in a temp file. What is wrong is the conclusion drawn from
them — and the file header's stated *reason* for choosing `node:crypto` over shelling out to
openssl, which is that the passphrase would then cross a process boundary. It crosses one
anyway.

**Practical severity is moderate, not catastrophic**, and I will not inflate it: reading
another process's memory or an anonymous pipe requires local access that already implies
compromise. The finding is that **the one document a successor uses to decide whether to
trust this scheme states a property it does not have.**

**2c — the public-repo threat model, which is the part that actually decides the
passphrase.** `security_sentry`'s round 1 is right and the arithmetic supports it. I
confirmed the repository is public (`api.github.com` → `private: false`, and my drill
cloned it with no credentials at all). So the moment `secrets.vault` is committed and
pushed, the ciphertext is world-readable, permanently, and mirrorable. The attack is
offline, unlimited, and **retroactive** — rotating the secrets later does not un-leak what
was in the vault when it was published.

The document argues the opposite way. `SECRETS.md:32-34` and `vault.mjs:28-30` both say the
600,000 PBKDF2-SHA512 iterations are *"what makes a passphrase a human can actually remember
survive an offline attack."* Against a public artefact, the arithmetic says that depends
entirely on what "memorable" means:

- PBKDF2-HMAC-SHA512 at 600,000 iterations costs an attacker roughly **3×10³ guesses per
  second per high-end GPU** (published hashcat throughput for this algorithm is on the order
  of 2×10⁹ iteration-operations/second; 2×10⁹ ÷ 6×10⁵ ≈ 3,300). An eight-GPU rig is
  ~2.6×10⁴/s; a year of it is ~8×10¹¹ guesses ≈ **2^40**.
- A five- or six-word Diceware phrase (64–77 bits) is unconditionally safe against that.
- A **three-word** Diceware phrase is 38.8 bits — inside 2^40, i.e. **breakable in about a
  year on one rig**.
- A human-chosen memorable sentence, attacked with wordlists and rules rather than treated
  as uniform, is routinely well under 40 bits.

The document does not draw that line, and "a passphrase a human can actually remember" spans
both sides of it. *(These are published-benchmark figures, not something I measured — no
cracking was performed and none should be inferred.)*

**What the owner must do — precisely, and in this order.** I will not ask for, see, generate,
or handle a passphrase at any point; every step below is the owner's alone.

1. **Decide the passphrase in a password manager, not in your head.** For a vault that will
   be published in a public repository, generate it — the password manager's own generator,
   at **128 bits or more** (a 20+ character random string, or 10+ Diceware words). Do not
   choose a memorable one. Memorable is the right advice for a private artefact and the
   wrong advice for a public one, and the document currently gives the wrong one.
2. **Alternatively, and worth considering first:** do not publish it. Keep `secrets.vault`
   out of the public repository and store it in the password manager itself, or in a private
   second remote. That removes the offline-attack surface entirely and costs one row of
   criterion 1's "second copy" points rather than a permanent published ciphertext. This is
   an owner decision, not a reviewer's — both are defensible, but they demand different
   passphrases.
3. If publishing: `npm run vault:save` → enter the generated passphrase →
   `git add secrets.vault && git commit && git push`.
4. `npm run vault:check` — it must print "present, committed to git" and exit 0. It exits 1
   today; I verified the exit code directly.
5. **Correct the two false claims** before or with the same commit: strike "The passphrase
   never leaves the process" from `SECRETS.md:42` and the matching paragraph at
   `vault.mjs:20-24` (say what is true — no argv, no env, no temp file — and drop the
   process-boundary conclusion), and replace "a passphrase a human can actually remember"
   with the generated-passphrase requirement in both places.
6. **Wire `npm run vault:check` into the ship gate** (`OPERATIONS.md` § Verify before
   shipping, and/or `package.json`). It already exits non-zero, so it is one line and the
   vault can never silently go missing again.

**This is a repeat of a repeat.** The 12 August review said the same thing. Round 1 said it.
It is round 2 and the file still does not exist.

### HIGH · 3 · STANDS — the UI library is missing from the service inventory

`INVENTORY.md` lists 8 third-party services. `@swift-struck/ui` resolves from
`github.com/alaap-swift-struck/swift-struck-ui`, pinned in `package-lock.json` to commit
`675aff89`. `grep -c "swift-struck-ui\|swift-struck/ui"` → `INVENTORY.md: 0`,
`SECRETS.md: 0`. If that repository were deleted or made private, `npm install` stops
working and the inventory a successor reads never mentions it. Unchanged since round 1.

### MEDIUM · 4 · STANDS — `SECRETS.md`'s recovery table omits `RESEND_API_KEY`

The § What is in there table lists six secrets. `RESEND_API_KEY` — without which nobody can
sign in, because sign-in is an emailed code — and `EMAIL_FROM` are not among them.
Criterion 7's 15-point secrets-inventory row is 11/15 for exactly this. Unchanged.

### MEDIUM · 5 · STANDS — the runtime version is pinned twice and contradicted twice

Criterion 3's 15-point row is 10/15 for this. Unchanged since round 1.

### LOW · 6 · STANDS — the documented "green" is stale by 71 tests

README says "518 tests today". The drill measured **589** on the remote HEAD, across 8
suites. A hand-maintained count with nothing checking it — the same class of drift the
base-fork review found in `BOOTSTRAP.md`, where two counts have since been fixed by deriving
them from disk. The same technique applies here.

### LOW · 7 · STANDS — no second copy, and no tags

One remote. `INVENTORY.md` names this honestly as single point of failure #1. Zero tags on
the remote, so `CHANGELOG.md` entries have no commit to point at.

### INFORMATIONAL · 8 · What did not regress, and it is most of the report

Every one of criteria 2, 3, 4, 5, 7, 8, 10, 11 and 12 is unchanged, and eight of those nine
score 91 or above. The drill still completes in 25 seconds. The documentation set is 41
in-repo markdown files with real decision records, a rollback procedure with named triggers,
a restore drill that was actually performed and found a bug in its own instructions, and a
`CONTRIBUTING.md` that teaches a newcomer the seven-question ritual. **This project's
documentation is genuinely in the top percentile of what this review sees.** Its problem is
not what it wrote down. Its problem is where the last week of work is stored.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1 · `git push -u origin review-campaign` and `git push origin main`** | none — no file changes | STORES 8 commits and 65 files' worth of change | **none — it changes no code at all.** This is the single highest-value action in this report: +700 weighted points, gate lifted, 25 → 93. The only consideration is that it publishes the campaign's review reports to a public repository; if that is unwanted, push the source commits and keep `reviews/` local or in a private branch. |
| **2a · Seal the vault** (`npm run vault:save`, commit, push) | `secrets.vault` (new, ~2 KB ciphertext) | ADDS one encrypted blob | **security_sentry_review** — direct tension, and it is now a *quantified* one. Publishing the ciphertext makes the passphrase the single point of compromise for `CF_D1_TOKEN`, which can delete every D1 on the account, and the exposure is permanent and retroactive. That review should be asked to sign off on the passphrase policy (fix 2b) before this lands, not after. **base_fork_review** — a fork inherits the base's vault; the fork sweep must delete `secrets.vault`, and that step does not exist in `new-app` today. Add it in the same change. |
| **2b · Require a generated 128-bit-plus passphrase, and correct the two false claims** | `SECRETS.md` (~6 lines), `scripts/vault.mjs` (header comment) | REMOVES a false security claim and a wrong recommendation | **story_checks_out_review** — improves it: two documents currently state a property the code does not have, which is exactly what that review scores. **none negative.** This fix should land *before* 2a, not after. |
| **2c · Wire `vault:check` into the ship gate** | `package.json` (one script), `OPERATIONS.md` § Verify | ADDS one non-zero-exit check per ship | **speed_review** — under a second; negligible. **lean_mean_review** — one line. Nothing else. |
| 3 · Add `swift-struck-ui` to `INVENTORY.md` | `INVENTORY.md` (1 table row) | ADDS one service row | none — inventory accuracy only. |
| 4 · Complete the `SECRETS.md` table | `SECRETS.md` (3 rows) | ADDS `RESEND_API_KEY`, `EMAIL_FROM`, `CF_ACCOUNT_ID` and their recovery paths | none — names only, never values. |
| 5 · Resolve the runtime-pin contradiction | `.nvmrc` / `engines` / the two contradicting docs | REMOVES an ambiguity | none — strictly removes a drift surface. |
| 6 · Derive the test count instead of hand-writing it | `README.md`, plus a check in `web/test/rules.test.ts` | REMOVES a hand-maintained number; ADDS ~4 check lines | **lean_mean_review** — four more lines in an existing check. **base_fork_review** — positively: it is the same derive-from-disk pattern that fixed `BOOTSTRAP.md`'s migration counts, so doing it here makes the pattern consistent rather than one-off. |
| 7 · Add a second remote or a documented mirror | none in-repo (a git remote), plus one `INVENTORY.md` line | ADDS a second stored copy | **security_sentry_review** — a second host is a second place the vault ciphertext and the whole tree live. If 2a lands, choose the mirror's visibility deliberately. This is Tier 3 in this skill: recommended, never done for the owner. |
| 8 · Add a devcontainer | `.devcontainer/devcontainer.json` (new) | ADDS ~30 lines | **lean_mean_review** — 30 new lines for 10 points of criterion 3. Low priority; the 25-second drill already proves reproducibility without it. |

---

## CEILING

**95 is reachable by changing code and running two commands, and the arithmetic is short.**

| step | criterion moved | new total |
|---|---|---:|
| today | — | **25** gated (85 uncapped) |
| `git push` (fix 1) | 1: 35 → 95 (+700 pts) | **93**, gate lifted |
| seal the vault + correct the claims (fixes 2a–2c) | 7: 91 → 100 (+81), 6: 97 → 100 (+36) | **94** |
| `INVENTORY.md` + `SECRETS.md` rows (fixes 3, 4) | 12: 95 → 100 (+30) | **95** |

`(9347 + 81 + 36 + 30) / 100 = 94.94 → 95`. Everything past that — the devcontainer, the
runtime pin, the derived test count, tags — is available and takes the total to **98**.

**One criterion is capped by something no commit can fix.** Criterion 10 scores 60 and
cannot exceed it: 40 of its 100 points require a truck factor of 2 or more, and the truck
factor is **1** — one author owning all 408 files by the Avelino Degree-of-Authorship
calculation. That is not a failure of the person; it is the normal state of a solo project
and precisely the risk this review exists to price. All 60 available points are already
earned: `CODEOWNERS` is real, the maintainer is named and reachable in four documents, and
`CONTRIBUTING.md` genuinely teaches a first change. **The mitigation for a truck factor of 1
is documentation, and this project has already built it.**

That cap costs 2 points of the total, so the true maximum is **98**, not 100. Nothing else
here is limited by a platform constraint or a locked decision in `ARCHITECTURE.md`.

**The honest summary of the ceiling: this project is two commands away from 93 and a
short afternoon away from 95.** Neither of those is a code change.

---

## Verdict

**If this laptop went into the ocean tonight, a stranger would recover a project they could
clone, install and verify green in twenty-five seconds, with forty-one documents that
genuinely explain why it is shaped the way it is — and they would lose the last week
entirely: eight commits and four uncommitted files containing the auth gating suite, the
privilege-amplification fix, the correction that made eight Law checks able to see the code
they read, and a gateway bounds fix, none of which is stored anywhere else.**

**And they still could not sign in to anything**, because the encrypted vault that four
documents promise has never been created — for the third review running — and the document
that argues it is safe to publish states one security property the code does not have and
recommends a class of passphrase that a public repository does not make safe.
