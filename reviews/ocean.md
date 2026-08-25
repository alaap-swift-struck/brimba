# If the mac fell in the ocean — Brimba · 2026-08-25
SCORE: 60/100   (previous: 95, measured 2026-08-12)

**60 is the GATED score. The uncapped weighted total is 87.** Criterion 1 scored 45,
which falls in the rubric's 40–69 band, and that band caps the total at 60. The cap is
lifted by one command (`git push`), which alone takes the total to **94**.

Read that carefully before reacting: the project did not get worse since 12 August. It
got better — a new Law (R25), an operations database, a proven restore drill. What
happened is that **one commit has sat unpushed** and **the encrypted vault that three
documents promise has never been created**.

---

## The drill — the falsifiable part

I cloned the **remote** (not this folder) into scratch and followed only what the README
says. Twice more with credentials stripped, to test a genuine stranger.

| # | Step | Command | Result |
|---|---|---|---|
| 1 | clone | `git clone https://github.com/alaap-swift-struck/brimba.git` | **1.45s**, 382 files. Ran with `GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0` — no credential helper. The repo is **public**; unauthenticated `api.github.com` returns 200. |
| 2 | install | `npm install` | **9s**, 303 packages, exit 0 |
| 3 | verify | `npm run check` | **18s**, exit 0 — 8 suites, **589 tests**, clean typecheck |

**Time to verified: 28 seconds, from nothing, by a stranger.**

Two harder variants, because the lockfile resolves the UI library over `git+ssh`
(`git+ssh://git@github.com/alaap-swift-struck/swift-struck-ui.git#675aff89…`) and I
expected that to be a wall:

| Variant | Result |
|---|---|
| `npm ci`, no `SSH_AUTH_SOCK`, `IdentityFile=/dev/null`, no git config | exit 0, **7s** |
| same, plus a **cold npm cache** (`--cache <empty dir>`) | exit 0, **76s** — `@swift-struck/ui@0.4.0` fetched over HTTPS |

So the `git+ssh` in the lockfile is **not** a blocker — npm falls back to HTTPS for a
public repo. I nearly filed that as a finding; the cold-cache run refuted it. GitHub
Actions independently corroborates: 109 CI runs, the latest (`081595d`, 2026-08-18)
green.

**I confirmed `tsc` actually ran** rather than hitting the empty-input trap the README
itself warns about: the check log shows eight explicit `npx tsc --noEmit -p <project>`
invocations and contains zero lines of compiler help text.

Scratch clones deleted. Nothing in this repository was modified except this file.

---

## Arithmetic

`total = Σ(criterion × weight) / 100`. Weights sum to 100. Every row below is a point
table from `assets/rubric.md`; every numerator is something I measured.

| # | Criterion | Score | Weight | Points |
|---|---|---:|---:|---:|
| 1 | A remote copy exists and is current | **45** | 14 | 630 |
| 2 | The stored tree is complete | 100 | 9 | 900 |
| 3 | Clone to running, reproducibly | 85 | 11 | 935 |
| 4 | A stranger can prove it works | 95 | 8 | 760 |
| 5 | The README is a real front door | 100 | 8 | 800 |
| 6 | Architecture and decisions are written down | 100 | 12 | 1200 |
| 7 | Operating it: deploy, environments, rollback | 91 | 9 | 819 |
| 8 | The code explains itself | 98 | 8 | 784 |
| 9 | The history tells the story | 97 | 5 | 485 |
| 10 | Bus factor and ownership | 60 | 5 | 300 |
| 11 | The legal right to reuse it | 100 | 5 | 500 |
| 12 | The non-code inventory | 95 | 6 | 570 |
| | | | **100** | **8683** |

**Uncapped total = 8683 / 100 = 87.**
**Gate: criterion 1 = 45, which is in the 40–69 band → total capped at 60.**

### 1 · A remote copy exists and is current — 45/100 (weight 14)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 25 | remote configured and reachable | **25** | `origin` = `github.com/alaap-swift-struck/brimba`; `git ls-remote` succeeds anonymously |
| 25 | current `HEAD` exists on the remote | **0** | local `HEAD` = `8751e30`; `git ls-remote --heads origin` → `main` = `081595d`. Not there. |
| 15 | zero unpushed commits on the checked-out branch | **0** | `git rev-list --left-right --count origin/main...main` → `0 1` |
| 10 | zero unpushed commits on every local branch | **0** | main: 1. The other 9 branches: 0 each (verified `--not --remotes`; all merged, correctly not penalised) |
| 10 | no uncommitted modifications | **10** | `git status --porcelain` → 0 modified |
| 10 | no untracked files that look essential | **10** | one untracked path, `reviews/` — created by this audit campaign, not project source |
| 5 | more than one remote, or a documented second copy | **0** | one remote. `INVENTORY.md` names this as single point of failure #1, honestly. |

**What is in the unpushed commit** — this matters, so here it is exactly:

```
8751e30  remove vendored Claude skills; skills live in ~/.claude/skills
 .gitignore              |   3 +
 OPERATIONS.md           |   2 +-
 skills/README.md        |  37 ---------
 skills/new-app/SKILL.md | 214 ------------------------------------------------
```

**No source code is at risk.** The commit deletes two vendored documents, adds three
`.gitignore` lines, and changes one word in `OPERATIONS.md` (`/reset-all` → `/clean_slate`
— both agent-skill names, so neither helps a stranger either way). If the laptop went
into the ocean right now, what is lost is a *deletion* and four lines. The remote is a
strict superset of the code.

But the row is a fact and the fact is false: the current HEAD is not stored. I am not
awarding a row I measured as failing. The honest statement is: **the remote is 250 of 251
commits current, and none of the missing content is irreplaceable.**

### 2 · The stored tree is complete — 100/100 (weight 9)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 30 | no `.gitignore` rule excludes something the build needs | **30** | drill proved it: a bare clone installs and checks green |
| 25 | an `.env.example` (or equivalent) lists every required variable by name | **25** | see below |
| 15 | migrations / schema committed | **15** | `db/core/0001…0017` (17), `db/ops/0001…0002` (2), per-team schema in `workers/tenancy/src/team-schema.ts` |
| 15 | seed / fixture data committed or documented | **15** | `INVENTORY.md`: catalogue self-heals on read (R13); "There is no fixture data to restore" |
| 10 | assets committed | **10** | 4 png + 2 svg tracked; web builds |
| 5 | no large build artifacts | **5** | probe: zero files >512 KB matching artifact extensions |

**The probe reported `envExample: null` and it was wrong.** Its regex only knows
`.env.example`. This is a Cloudflare Workers project — the convention is `.dev.vars`, and
there are **two** committed example files, both on the remote:

- `.dev.vars.example` (root) — 9 names with a sentence of *why* each
- `workers/auth/.dev.vars.example` — local-dev settings

I cross-checked those against what the code actually reads. I enumerated every
`env.NAME` / `process.env.NAME` occurrence across all `.ts/.tsx/.mjs/.jsonc`, **stripping
block and line comments first** so prose about seams could not be counted as code: 30
distinct names. Twelve are Cloudflare bindings declared in committed `wrangler.jsonc`
(`AUTH`, `REALTIME`, `CONTENT`, `TENANCY`, `OPS`, `MEDIA`, `LEARNING_MEDIA`, `CHANNELS`,
`ASSETS`, `HEAVY_LIMITER`, `USER_LIMITER`, `DB`). Six more are non-secret vars already in
committed `wrangler.jsonc` (`APP_ORIGIN`, `AGENT_MODEL`, `AGENT_EFFORT`,
`AGENT_FREE_DAILY`, `WORKERS_AI_MODEL`, `ENVIRONMENT`, `MAX_TEAMS_PER_USER`,
`CF_ACCOUNT_ID`). Three are build/test-time (`BUILD_STATIC`, `BASE_URL`, `SMOKE_BASE`).

That leaves **10 values a human must supply**: `INTERNAL_KEY`, `CF_D1_TOKEN`,
`CF_ACCOUNT_ID`, `ADMIN_KEY`, `TEST_LOGIN_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`EMAIL_FROM`, `PUBLIC_APP_URL`, `INSECURE_COOKIE`. **All 10 are named** across the two
example files. 10/10 → full 25.

### 3 · Clone to running, reproducibly — 85/100 (weight 11)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 25 | documented, ordered setup path | **25** | README § Develop; `CONTRIBUTING.md`; `BOOTSTRAP.md` §0 |
| 20 | lockfile committed | **20** | `package-lock.json`, lockfileVersion 3, 438 entries; UI dep pinned to commit `675aff89` |
| 15 | runtime version pinned in-repo | **10** | pinned twice (`.nvmrc` = 24, `engines.node` = ">=24.0.0") and **contradicted twice** (see F4) |
| 15 | every external prerequisite named with a version | **15** | `BOOTSTRAP.md` §0: Cloudflare Workers **Paid** plan, wrangler via npx (pinned `^4.120.0` in devDependencies), Resend account, optional Anthropic key, domain optional |
| 15 | setup is one or two commands | **15** | `npm install` then `npm run check` |
| 10 | container / devcontainer definition | **0** | none in the tree |

### 4 · A stranger can prove it works — 95/100 (weight 8)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 30 | tests exist, runnable by a documented command | **30** | `npm run check` / `npm test`; 589 tests observed |
| 25 | CI committed and runs those tests | **25** | `.github/workflows/ci.yml`; 109 runs; latest green on remote HEAD |
| 20 | one verify command covering typecheck + tests | **20** | `npm run check` = 8 × `tsc -p` + `npm test` |
| 15 | the expected passing state is documented | **10** | "eight suites … 518 tests … about 13 seconds" — suites ✓, timing ✓, **count stale: 589 measured** (F5) |
| 10 | test data / fixtures included | **10** | suite needs no external state; ran green on a clean clone with no secrets |

### 5 · The README is a real front door — 100/100 (weight 8)

20 (what it is / who for) + 15 (prerequisites: Node 24+, npm 11+) + 15 (install) + 15
(`npm run dev`) + 10 (test) + 10 (deploy — pointer row: the doc map routes "deploy, roll
back, or fix it at 2am" to `OPERATIONS.md`) + 10 (documentation map — 21 numbered
entries) + 5 (licence linked) = **100**. 2,096 words with 41 sibling documents, so the
"README as the place documentation hides" penalty does not apply.

### 6 · Architecture and decisions are written down — 100/100 (weight 12)

25 (system shape: `ARCHITECTURE.md` + `BASE-MANUAL.md`) + 20 (data model:
`DATA-MODEL.md`, 26 KB, every table) + **20 (decision records)** + 15 (per-module:
`OPERATIONS.md` § The pieces, one row per worker) + 10 (ASCII topology diagram,
`ARCHITECTURE.md` §2b) + 10 (docs in-repo, versioned: 41 markdown files) = **100**.

The 20 decision points are the hardest in the rubric and are fully earned. These are not
"Decisions" headings over a feature list — they state what was rejected and what it cost.
`ARCHITECTURE.md` §1a: *"What did NOT move, deliberately… `agent_credits` — the BALANCE
the quota gate reads on the request path — stays in the core database."* §2b: *"What is
deliberately NOT built: a short-lived cache of 'this session is valid'… It is not built
because it buys resilience with revocation… This is a trade that can be revisited; it
must not be made by accident."* That is a Nygard ADR in everything but filename.

### 7 · Operating it — 91/100 (weight 9)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 25 | deploy procedure documented and repeatable | **25** | `npm run deploy:staging` / `:production` — **plain npm scripts, no agent required**; realtime-first order explained; the cold-start `code 10143` cycle documented |
| 20 | every environment named, with URL and purpose | **20** | both URLs; per-worker staging/production names in a table |
| 20 | rollback documented with a named trigger | **20** | four explicit triggers; `wrangler deployments list` / `wrangler rollback`; reverse order; "what does NOT roll back" |
| 15 | required secrets inventoried by name | **11** | `SECRETS.md` table + `BOOTSTRAP.md` §4 + two example files — but the `SECRETS.md` table **omits `RESEND_API_KEY`** (F3) |
| 10 | what to check when it breaks | **10** | three health endpoints — I verified all seven exist in `workers/*/src/index.ts` — plus the `error_logs` query and the smoke |
| 10 | backup and restore for stateful components | **5** | D1 Time Travel documented **and proven** by a dated drill; R2 honestly marked unversioned; **the secrets half is documented but false** (F1) |

The restore drill is the best thing in this document set: an actual run on a throwaway
database, dated 2026-08-18, which found that the previously-documented command carried an
invalid `--remote` flag. That is a runbook that has been tested rather than written.

### 8 · The code explains itself — 98/100 (weight 8)

| pts | check | earned | measurement |
|---:|---|---:|---|
| 25 | comment density in the 10–30% band | **25** | **22%** — 7,603 comment lines / 34,612 non-blank lines across 276 code files |
| 25 | most files open with a purpose line | **25** | **98%** — 192 of 195 non-test `.ts/.tsx` files carry a comment before the first real statement |
| 20 | non-obvious logic carries a *why* comment | **18** | **66%** — 129 of 195 files contain at least one reason-giving comment line (proxy: comment lines only, whole-word match on because/otherwise/deliberately/rather-than/this-bit-us/FIXED…) |
| 15 | public interfaces documented at the boundary | **15** | each worker's `index.ts` opens with an annotated route table (`// GET /api/auth/health -> is this worker alive?`) |
| 15 | naming consistent + a convention document | **15** | `CONVENTIONS.md` (41 KB), `UI-CONVENTIONS.md` (32 KB), `shared/glossary.ts` as the enforced vocabulary (Law R6) |

**The probe's `filesWithHeaderDocPct: 67` is wrong and I did not score it.** It only
inspects line 1 and the first five lines, so any file that opens with `import` and puts
its header comment on line 3 scores zero — `web/components/brand-mark.tsx` is exactly
that. Re-measured properly across all 195 files: 98%.

Read sample (`shared/workers/trace.ts`, `web/lib/use-active-team.ts`,
`web/components/brand-mark.tsx`, `shared/workers/activity.ts`): every one names the
failure that earned the rule, not what the line does. `trace.ts` opens with a 30-line
account of why `res.ok` could not distinguish "auth says no" from "auth did not answer".
That is documentation a successor can act on.

### 9 · The history tells the story — 97/100 (weight 5)

30 (median subject length **78** chars, > 25) + 25 (**0%** low-effort of 242 analysed) +
**17**/20 (a real, well-written `CHANGELOG.md` — but zero tags on the remote, and it is 2
commits stale) + 15 (issue/PR references — 0 PRs and 0 issues exist, so the row is
vacuous, not failed) + 10 (**88%** Conventional Commits) = **97**.

251 commits over 32 distinct days, 2026-06-12 → 2026-08-24. (The probe's `firstCommit`
field says 2026-08-24; that is a probe bug — `git log --reverse -n 1` applies the limit
before the reverse. I took the real range from the full log.)

### 10 · Bus factor and ownership — 60/100 (weight 5)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 40 | truck factor ≥ 3 (25 at 2, 0 at 1) | **0** | **truck factor 1** — Avelino Degree-of-Authorship (arXiv:1604.06766) over 385 files; one author owns all 385; 0 files orphaned at start |
| 25 | CODEOWNERS or documented owner per area | **25** | `.github/CODEOWNERS`, real content, names the risk in its own comments |
| 20 | a named, reachable maintainer contact | **20** | Swift Struck — alaap@swiftstruck.com, in README, CODEOWNERS, CONTRIBUTING and INVENTORY |
| 15 | CONTRIBUTING explains a first change | **15** | genuinely specific — the seven-question ritual, the Laws that bite newcomers, and the sabotage discipline with two real historical failures |

**This criterion is already at its single-author maximum.** All 60 available points are
earned. See CEILING.

### 11 · The legal right to reuse it — 100/100 (weight 5)

50 (LICENSE exists) + 20 (unambiguous — an explicit proprietary grant, which the rubric
scores identically to MIT) + 15 (© 2026 Swift Struck) + 15 (third-party obligations
acknowledged in their own paragraph) = **100**.

### 12 · The non-code inventory — 95/100 (weight 6)

| pts | check | earned | evidence |
|---:|---|---:|---|
| 25 | every third-party service listed | **20** | 8 services in a table with a "without it" column — but **`swift-struck-ui` is missing** (F2) |
| 20 | which account owns each resource | **20** | one Cloudflare account, id in each `wrangler.jsonc`; GitHub repo named |
| 20 | domains and DNS | **20** | explicitly none required; `workers.dev` subdomains named; a note on what to record if one is ever attached |
| 15 | what data must exist, and where from | **15** | table of core/ops/per-team schemas + the self-healing catalogue |
| 10 | scheduled jobs, webhooks, invisible parts | **10** | nightly cron `10 3 * * *`, rate-limit namespace ids, MCP personal access tokens |
| 10 | who to contact | **10** | named at the top |

---

## Findings

### F1 · CRITICAL — `secrets.vault` does not exist. Three documents say it does.

**Plain English:** the encrypted vault that is supposed to be how the credentials survive
this laptop has never been created. The script shipped; the file never did.

- `SECRETS.md:36` — *"One encrypted file, `secrets.vault`, **committed to the repo** like anything else."*
- `SECRETS.md:96` — total-loss runbook step 3: *"`npm run vault:open` — type the passphrase. Every `.dev.vars` comes back."*
- `OPERATIONS.md:341` — *"**Secrets** — `secrets.vault`, committed and encrypted. `npm run vault:open` restores every `.dev.vars` after a fresh clone."*
- `CHANGELOG.md` (2026-08-11) — *"Also the encrypted secrets vault (`secrets.vault` + `scripts/vault.mjs`), **so the credentials survive the laptop**."*

**The evidence, four independent ways:**

1. `ls secrets.vault` → No such file or directory
2. `git ls-files | grep -i vault` → only `scripts/vault.mjs`
3. `git ls-tree -r --name-only origin/main | grep -i vault` → only `scripts/vault.mjs`; the drill clone has no `secrets.vault` either
4. `git log --all --diff-filter=A -- secrets.vault` → **empty. Never committed, on any branch, ever.**

And the project's own tool agrees. `node scripts/vault.mjs check` (read-only, prints key
names only, never a value, no passphrase) exits **1** and prints:

> `NO VAULT. These secrets exist ONLY on this laptop, and Cloudflare will not read a secret back to you.`

**Would the written procedure work for a stranger? No.** The runbook is well-written,
the cryptography is sound (AES-256-GCM, PBKDF2-SHA512 at 600,000 iterations, fresh salt
and IV per save, passphrase never crossing a process boundary — I read `scripts/vault.mjs`
in full), and the threat reasoning is correct. It fails at step 3 because the artefact it
decrypts was never produced. A stranger runs `npm run vault:open` and gets
`no secrets.vault in this repo`.

**What they would actually have to do** is SECRETS.md §"If the passphrase is ALSO lost" —
regenerate by hand. That path is real and mostly good, and it is honest that this is "an
afternoon, not a catastrophe". But it is incomplete (F3).

**This is also a repeat.** The 12 August review said, verbatim: *"The vault is still
unsealed. `secrets.vault` does not exist yet, so the credentials remain on one machine —
the one thing in this review that is genuinely not backed up."* Thirteen days on, unchanged.

**Why it matters most:** `INTERNAL_KEY` is a shared secret that must match across five
live workers, and Cloudflare secrets are **write-only** — you cannot read one back off the
platform. Lose the laptop and you cannot redeploy `auth`, `tenancy`, `content`, `gateway`
or `mcp` with a key matching the one already running. They start refusing each other.

**The fix (the owner runs this — it needs the passphrase, which I must never see):**

```bash
npm run vault:save
git add secrets.vault && git commit -m "chore: seal the secrets vault" && git push
npm run vault:check   # must print "present, committed to git" and exit 0
```

Then correct the tense: those four documents describe a future state as a present one.
`vault:check` is already wired to catch this — it exits 1 today. Add it to the ship gate
and this can never silently regress again.

### F2 · HIGH — the build depends on a second GitHub repository that the survival inventory does not name.

`package.json:` `"@swift-struck/ui": "github:alaap-swift-struck/swift-struck-ui"`.
`INVENTORY.md` — the document whose stated job is *"everything that is NOT in this
repository"* — lists GitHub once, as *"the only remote copy of this repository"*. It does
not mention that a **second, separately-hosted repository, owned by the same single
person,** is required for `npm install` to succeed, for CI to go green, and for any deploy
to build.

`grep -c "swift-struck-ui\|swift-struck/ui"` → `INVENTORY.md: 0`, `SECRETS.md: 0`.

Today it is public and the lockfile pins commit `675aff89`, so the drill passed. But if
that repo is deleted, made private, or force-pushed past the pinned commit, every install
in the world breaks and nothing in the survival documentation tells a successor where to
look. It is a fourth single point of failure alongside the three `INVENTORY.md` already
names honestly.

**Fix:** add a row to `INVENTORY.md` § Third-party services (*"`swift-struck-ui` (GitHub,
same owner) — the UI component library; without it nothing installs or builds"*) and a
fourth entry under § Single points of failure. Consider vendoring a tarball copy of the
pinned commit as a documented fallback.

### F3 · MEDIUM — SECRETS.md's recovery table omits the one secret whose loss stops sign-in.

`SECRETS.md` § What is in there lists six secrets. `RESEND_API_KEY` and `EMAIL_FROM` are
not among them, and the § "If the passphrase is ALSO lost" regeneration list — steps 1, 2,
3 — does not mention Resend either. `CF_ACCOUNT_ID` is also absent.

`INVENTORY.md` says of Resend: *"nobody can sign in"*. So the document that exists to get
a stranger back in control skips the credential whose absence locks everyone out. The root
`.dev.vars.example` and `BOOTSTRAP.md` §4 both have it, so the knowledge is in the repo —
it is missing from the one page a person reads in a crisis.

Related, same document: it lists `APP_ORIGIN / PUBLIC_APP_URL` as one row, but the code
reads them in different workers for different purposes and `APP_ORIGIN` is now a committed
`wrangler.jsonc` var, not a secret at all.

**Fix:** add `RESEND_API_KEY` / `EMAIL_FROM` / `CF_ACCOUNT_ID` to the table, and add step 4
to the regeneration list: *"`RESEND_API_KEY` — issue a new one from the Resend dashboard
and set it on auth in both environments. Until it is set, no login code is delivered."*

### F4 · MEDIUM — four places state three different Node versions.

| Source | Says |
|---|---|
| `.nvmrc` | `24` |
| `package.json` `engines.node` | `>=24.0.0` |
| `README.md` § Prerequisites | Node 24+ |
| `BOOTSTRAP.md:26` § 0 · Prerequisites | **Node 20+** |
| `.github/workflows/ci.yml:12` | **`node-version: 22`** |

The one document written for the person standing this up from nothing says 20; CI —
the only automated check of the claim — runs 22 and passes, which means the declared
`engines` floor of 24 is not actually exercised anywhere. A stranger following
`BOOTSTRAP.md` installs Node 20 and then meets an `engines` warning nothing prepared them
for.

**Fix:** make `BOOTSTRAP.md` say Node 24 and `ci.yml` use `node-version-file: .nvmrc`
(one line, and it can never drift again).

### F5 · LOW — the documented green state is stale by 71 tests.

`README.md` and `CONTRIBUTING.md` both say *"518 tests, ~13s"*. The drill measured **589
tests** across 8 suites. The suite count and the timing are right; the number is 13 days
old. It reads as growth rather than breakage, but it is the exact number a stranger
compares their first run against.

**Fix:** update to 589, or better, drop the brittle figure and keep *"eight suites, all
green, no compiler output"* — which is the part that will not rot.

### F6 · LOW — `workers/auth/.dev.vars.example` contradicts the canon on a security-relevant point.

That file says the test-login door is *"gated by `ADMIN_KEY`"* and does not mention
`TEST_LOGIN_KEY` at all. The code disagrees:

```
workers/auth/src/index.ts:204
  if (!env.TEST_LOGIN_KEY || request.headers.get("x-admin-key") !== env.TEST_LOGIN_KEY)
```

`SECRETS.md`, `OPERATIONS.md`, `BOOTSTRAP.md` and the root `.dev.vars.example` all state
the opposite of that example file, and state *why*: the door has its own key
"deliberately a different name from `ADMIN_KEY` so the maintenance-key rollout can never
arm it". The stale example is the only place in the repo saying the sign-in-as-anyone door
rides on the maintenance key. It fails closed, so nothing is exploitable — but this is the
kind of contradiction that makes a stranger set up the wrong thing.

**Fix:** replace `ADMIN_KEY=set-on-staging-only-never-production` with
`TEST_LOGIN_KEY=` plus the one-line warning, and correct the comment above it.

### F7 · LOW — the data-recovery commands begin with a word that exists nowhere.

`OPERATIONS.md:352-353`:

```bash
cf-exec npx wrangler d1 time-travel info <database-name>
cf-exec npx wrangler d1 time-travel restore <database-name> --bookmark=<bookmark>
```

`grep -rl "cf-exec"` over the whole repo returns exactly one file: `OPERATIONS.md` itself.
It is an author-local wrapper. These two lines are the ones a stranger types during a
data-loss incident, and as written they produce `command not found`. The surrounding
section is otherwise the strongest operational writing in the repo — it was *proven* by a
real drill — which makes this the one step in it a stranger cannot execute.

**Fix:** drop the prefix, or commit `scripts/cf-exec` and say what it sets.

### F8 · LOW — 9,763 words of decision notes are gitignored and exist only on this laptop.

`.gitignore:24` ignores `.session-notes/`. It holds two files —
`brimba-base-hardening.md` (2,364 words) and `brimba-base-v8.md` (7,399 words) — with
sections titled *"CONVENTIONS ESTABLISHED (these must survive — each was earned by a real
defect)"*, *"REASONED EXCEPTIONS (decided, documented — NOT open findings)"*, *"Key
decisions this session (and why)"* and *"OPEN QUESTIONS / BACKLOG"*.

**I checked whether this is a real loss rather than assuming it.** The load-bearing
exceptions have been promoted into committed documents — the `/media/*` capability-URL
exception appears in `OPERATIONS.md:111`, `BASE-IMPROVEMENTS.md:90` and
`BASE-MANUAL.md:482`; the "neighbouring right" identity-read exception appears in all
three as well. So the discipline of promoting decisions is working.

What did **not** get promoted: the two engineering-debt items in §5 — that `bounded-lists`
and `idempotent-transitions` still assert on source text rather than behaviour, and that
the three `gating-seam` suites are near-identical triplets. The first of those is exactly
the failure mode the campaign brief warns about, and the note records it as known.

The ignore rule has a stated reason (a fork should not inherit the previous product's
notes), so this is a deliberate trade, not an oversight. But the file that says its own
contents "must survive" is the one file guaranteed not to.

**Fix:** promote those two items into `BASE-IMPROVEMENTS.md` § the honest backlog, where
they belong anyway. Do not commit `.session-notes/` — the fork reason is sound.

### F9 · LOW — pushing the unpushed commit will break two README links.

`README.md` links to `skills/new-app/SKILL.md` and `skills/README.md`. Both resolve on the
remote today (I verified in the clone). Commit `8751e30` deletes both. The moment it is
pushed — which is the fix for the gate — the README's "one-command version" paragraph
points at two files that no longer exist.

**Fix:** in the same push, replace that paragraph with a line saying the `new-app` skill
now lives in `~/.claude/skills/` and is not vendored.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **Push `8751e30`** (lifts the gate; 60 → 94) | none in the tree — `git push` only | remote gains the deletion of `skills/` + 3 `.gitignore` lines | **story_checks_out** — it breaks two live README links to `skills/new-app/SKILL.md` and `skills/README.md`. Fix F9 in the same push or that review inherits two dangling references. |
| **F1 · Seal the vault** (`npm run vault:save`, commit, push) | `secrets.vault` (new, ~2 KB ciphertext); tense fixes in `SECRETS.md`, `OPERATIONS.md`, `CHANGELOG.md` | adds one encrypted blob + honest wording | **security_sentry** — puts an encrypted credential bundle in a **public** repo, so the passphrase becomes the single point of compromise for `CF_D1_TOKEN` (which can delete every D1 on the account). SECRETS.md argues this trade well, but that review should be told to assess it deliberately rather than discover it. **base_fork_review** — a fork inherits the base's vault; the fork sweep must delete `secrets.vault`, and that step does not exist today. |
| **F1b · Add `npm run vault:check` to the ship gate** | `package.json` (one script), `OPERATIONS.md` § Verify before shipping | adds one non-zero-exit check to every ship | **speed_review** — adds well under a second to the gate; negligible. No other review affected. |
| **F2 · Name `swift-struck-ui` in INVENTORY.md** | `INVENTORY.md` (2 rows) | adds a service row + a fourth single point of failure | none — pure documentation of an existing dependency; it changes no code and adds no surface. |
| **F2b · Vendor a tarball of the pinned UI commit** *(optional)* | `package.json`, a vendored `.tgz`, `.gitignore` | removes the second-repo dependency at install time; adds a ~1 MB binary to the tree | **lean_mean** — a committed tarball is exactly the "binary artifact" that review penalises, and criterion 2 of this rubric penalises artifacts over 512 KB too. **base_fork_review** — a fork would carry a stale vendored library. I recommend F2 alone and NOT this. |
| **F3 · Complete the SECRETS.md table + regeneration list** | `SECRETS.md` (3 rows + 1 step) | adds `RESEND_API_KEY`, `EMAIL_FROM`, `CF_ACCOUNT_ID` and their recovery | none — names only, never values; the rubric's rule that a secret inventory lists names is satisfied more completely, and no other review reads this file for anything it would lose. |
| **F4 · Resolve the Node drift** | `BOOTSTRAP.md:26`, `.github/workflows/ci.yml:12` → `node-version-file: .nvmrc` | removes two contradictory version claims | **speed_review / spend_review** — CI moves from Node 22 to Node 24, so the first runs may be marginally slower while the setup-node cache warms, and previously-hidden Node 24 deprecation warnings may surface. That is the point: the declared floor becomes the tested floor. |
| **F5 · Update or de-brittle the test count** | `README.md`, `CONTRIBUTING.md` (one phrase each) | replaces `518` with `589`, or drops the number | **story_checks_out** — mildly helps it (one less stale claim). Keeping a hard number guarantees it rots again; dropping it loses a useful sanity signal. Prefer "eight suites, all green" **plus** the number, and re-check it at each ship. |
| **F6 · Correct `workers/auth/.dev.vars.example`** | `workers/auth/.dev.vars.example` (2 lines) | removes a false statement that the sign-in-as-anyone door rides on `ADMIN_KEY`; adds `TEST_LOGIN_KEY` | **security_sentry** — helps it; this removes a misconfiguration invitation. No review is hurt. |
| **F7 · Drop the `cf-exec` prefix** | `OPERATIONS.md:352-353` | removes an undefined command from the recovery runbook | none — the commands are identical without it; `npx wrangler` is already how every other command in the file is written. |
| **F8 · Promote the two orphan backlog items** | `BASE-IMPROVEMENTS.md` (2 bullets) | records that `bounded-lists` and `idempotent-transitions` assert on text, not behaviour | **lean_mean** — it publishes a known duplication figure (the three near-identical `gating-seam` triplets, ~150 lines) that review will then count against the codebase. It should. Writing it down is what makes it fixable; hiding it in an ignored file is what let it sit. |
| **F9 · Fix the two README skills links** | `README.md` (one paragraph) | removes two links that break on push | none — required companion to the push; strictly reduces dangling references. |
| **Second git remote** *(Tier 3 — recommend only, owner runs it)* | none | a mirror of everything on a second host | none — no file in the repository changes. A GitLab or Codeberg mirror is free, so **spend_review** is unaffected. One command: `git remote add mirror <url> && git push mirror --all` |
| **Tags for the changelog milestones** *(Tier 3)* | none | makes the CHANGELOG entries checkoutable | none — annotated tags change no file and cost nothing. `git tag -a v2026.08.25 -m "…" && git push origin --tags` |
| **A devcontainer** *(optional, +1.1 total)* | `.devcontainer/devcontainer.json` (new) | removes "works on my machine" entirely | **lean_mean** — one more config file to keep in step with `.nvmrc` and CI, i.e. a fourth place Node's version is written, which is the problem F4 exists to fix. **base_fork_review** — another file the fork sweep must rename. Given the drill already proved a cold, credential-less clone works in 76 seconds, I rate this **not worth it**. |

---

## CEILING

**Is 95 reachable by changing code? Yes — and it is close.**

The gate is the whole story of today's number. Criterion 1 scored 45 because one commit
is unpushed; that alone caps a genuine 87 at 60.

| Action | Criterion 1 | Uncapped total | Gated total |
|---|---:|---:|---:|
| today | 45 | 87 | **60** |
| `git push` | 95 | **94** | 94 (no cap) |
| + a second remote | 100 | **95** | 95 |
| + F1, F3, F4, F5, F2, F6 | 100 | **~97** | ~97 |

**What a commit cannot fix — and its exact price.**

Criterion 10 row 1 awards 40 points for a truck factor of 3 or more, 25 for 2, and 0 for
1. With one human it is permanently 0. Weight 5, so it costs
`40 × 5 / 100 = **2.0 points**` of the final total, forever.

**The true maximum for this project with one author is 98.** Every other criterion can
reach 100. So the answer to the question as asked: **no, a single author does not cap this
below 95.** It caps it at 98, and 95 has two full points of headroom above it.

Three things are worth saying plainly about that:

1. **Criterion 10 is already maxed out for a solo project.** All 60 attainable points are
   earned — CODEOWNERS, a named reachable maintainer, and a CONTRIBUTING that genuinely
   teaches a first change. There is nothing to fix here and no commit can improve it. Any
   recommendation to "raise the bus factor" would be a recommendation to hire someone,
   which is not a code change and I am not making it.
2. **The mitigation the rubric expects from a solo project is documentation, and this
   project has already done it** — better than most funded teams. `BOOTSTRAP.md` stands
   the whole platform up from an empty Cloudflare account command by command;
   `INVENTORY.md` names every account, cron and single point of failure; `OPERATIONS.md`
   documents a rollback with named triggers and a restore drill that was actually run.
   Criteria 5, 6 and 11 are at 100 and criterion 8 at 98 precisely because the author has
   been buying down the truck factor with prose.
3. **The real cap today is not the bus factor — it is two commands.** `git push`, and
   `npm run vault:save`. The first is worth 34 points of gated score. The second is worth
   0.45 points and is the difference between a stranger having the keys and not.

No locked decision in `ARCHITECTURE.md` and no platform limit constrains any score here.

---

## The verdict, in one sentence

If this laptop went into the ocean tonight, a stranger with no credentials could clone the
public repository, have all 589 tests green in 28 seconds, understand why every major
decision was made and what was deliberately rejected, deploy all seven workers, roll one
back, restore a database from a drill that has actually been run, and know which accounts
to ask for — and the only things they could not recover are the **secrets**, because the
vault the documentation promises has never been created, and **one commit** that deletes
two vendored files.
