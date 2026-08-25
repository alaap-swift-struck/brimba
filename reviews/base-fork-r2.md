# Base fork review — Brimba · 2026-08-25 · ROUND 2
SCORE: 78/100   (previous: 77/100)

**Mode: BASE**, same as round 1. The bare probe still returns `inferenceFailed: true`
(`identity.clientTokens = []`), so per the skill's hard rule I re-ran it as
`probe.mjs . --base brimba --client acrymold` before scoring criteria 1, 2 and 6.
`identity.mode = "this looks like the base itself"`, `packageName = "brimba"`,
`origin = github.com/alaap-swift-struck/brimba`, `upstream = null`.

Same scoring convention as round 1, restated so the two numbers are comparable: **the
base's own name in foundation code is not a client leak** — Brimba is not a client of
itself. Criterion 1 scores `acrymold` hits only. What the base's own identity costs a fork
is scored in criteria 3, 4, 7 and 9, where forkability actually lives.

---

## DELTA

Round 1: 77/100 → Round 2: **78/100**

| Criterion | R1 | R2 | Why it moved |
|---|---|---|---|
| 1 · No client name in the foundation | 97 | **97** | Unchanged. The six repair commits added **zero** new `brimba` or `acrymold` literals to `shared/`, `web/`, `workers/`, `scripts/`, `db/` (measured: `git diff 8751e30..fe7d683` over those trees, grep `-i brimba` on added lines = 0 hits). The one foundation hit is still the comment at `scripts/reset-all.mjs:10`. |
| 2 · No client-shaped table/column/module | 97 | **97** | Unchanged. `clientTables` = 0. No `CREATE TABLE` in the repair diff; `db/core` still 17, `db/ops` still 2, `team-schema.ts` still 16 tables. |
| 3 · Client differences live in config | 58 | **58** | Unchanged. No `wrangler.jsonc` and no `shared/brand.ts` was touched. Still 8 occurrences of the author's real `CF_ACCOUNT_ID`, still 10 `OPS` bindings carrying the author's real database ids, still 13 identity literals in code. |
| 4 · A fresh fork stands up unattended | 47 | **53** | **UP 6.** `BOOTSTRAP.md` now creates the operations database, applies its migrations and tells you to repoint the binding in five workers, under its own "do not skip this" heading. Docked back 1 because the newly-added apply command cannot work as written (finding 1). |
| 5 · Base and fork have not silently diverged | 67 | **67** | Unchanged. `upstream` still null (unmeasured in BASE mode, per the rubric's hard rule). `new-app` still instructs "remove the brimba `origin`" with nothing added back. |
| 6 · Nothing assumes one client's data shape | 100 | **100** | Unchanged. Re-probed: tenant/slug equality branching across `shared/` + all seven `workers/*/src` = **0**; hardcoded ULIDs in foundation = **0** (one match, in a test fixture). |
| 7 · Branding lives in one place | 44 | **44** | Unchanged. `shared/brand.ts` not in the repair diff; `web/app/manifest.ts:21` still restates `#0e9e86`; the assistant and the MCP surface still brand past the seam. |
| 8 · Client-specific rules sit behind a seam | 90 | **90** | Unchanged, with one genuine improvement too small to move a 30-point line: a hand-listed `const WORKERS = ["auth","tenancy","content","data-ops"]` inside a check became `readdirSync(ROOT/workers)`, and the new `shared/test/source.ts` derives its worker and component sets from disk rather than listing them. Three hand-maintained worker lists remain (`MUTATING_WORKERS`, `WORKERS_WITH_ROUTES`, `retention.test.ts:253`) plus the whole topology in `build-blueprint.mjs`. |
| 9 · The fork procedure is documented and current | 67 | **74** | **UP 7.** Of the eight measured drift points, 1.5 closed: the ops-database gap (in `BOOTSTRAP.md` only) and two of the three stale migration counts — and those two are now derived from disk by a real check. The third stale count and all seven other drift points stand, and one new drift point opened. |
| 10 · Someone has actually forked it recently | 100 | **100** | Unchanged. `BASE-IMPROVEMENTS.md` untouched; the two dated port-back rounds still recorded. |

**No criterion went down.** Nothing in the six repair commits (`73a60a4`, `e6676c5`,
`3cd3e14`, `138c3e4`, `5e35efe`, `fe7d683`) damaged a base-fork criterion. That is the
round-2 question, and the answer here is clean: the repairs touched 41 non-review files,
none of them a `wrangler.jsonc`, `shared/brand.ts`, `shared/glossary.ts`, `db/*` or
`team-schema.ts`.

**One probe number moved for a reason that is not a finding.** `leaks.other` went 1 → 3,
because `reviews/base-fork.md` and `reviews/ocean.md` — my own round-1 report and another
reviewer's — now contain the word `acrymold`. That is an artifact of this campaign, in an
excluded layer. Foundation leaks are still **1**.

---

## Arithmetic

| # | criterion | key | method | score | weight | score × weight |
|---|---|---|---|---|---|---|
| 1 | No client name in the foundation | `leaks` | defect | 97 | 15 | 1455 |
| 2 | No client-shaped table, column or module | `schema` | defect | 97 | 14 | 1358 |
| 3 | Client differences live in config, not code | `config` | coverage | 58 | 13 | 754 |
| 4 | A fresh fork stands up unattended | `standup` | coverage | 53 | 12 | 636 |
| 5 | Base and fork have not silently diverged | `drift` | coverage | 67 | 11 | 737 |
| 6 | Nothing assumes one client's data shape | `assumptions` | defect | 100 | 10 | 1000 |
| 7 | Branding lives in one place | `branding` | coverage | 44 | 8 | 352 |
| 8 | Client-specific rules sit behind a seam | `seam` | coverage | 90 | 8 | 720 |
| 9 | The fork procedure is documented and current | `procedure` | coverage | 74 | 5 | 370 |
| 10 | Someone has actually forked it recently | `proven` | coverage | 100 | 4 | 400 |
| | | | | | **100** | **7782** |

**Total = 7782 / 100 = 77.82 → 78.**
**Gate:** criterion 1 = 97, far above 40, so the cap-at-45 gate does not apply. Capped and
uncapped are identical: **78**.

### The layer split — never publish the raw total

| layer | hits for `acrymold` | scored? |
|---|---|---|
| renamed-by-design (`wrangler.jsonc`, `package.json`, README) | 0 | no — the sweep working |
| surface (`web/`, `public/`) | 0 | branding only |
| **foundation** (`shared/`, `db/`, `workers/`, `scripts/`) | **1** | **yes** |
| other (`BASE-IMPROVEMENTS.md`, `reviews/*.md`) | 3 | no — excluded class |

### Criterion 4 — the sub-lines, so the +6 is recomputable

| points | check | R1 | R2 | evidence |
|---|---|---|---|---|
| 35 | documented, scripted path clone → running | 17 | **21** | `BOOTSTRAP.md:104-127` adds "The OPERATIONS database — do not skip this": two `d1 create`, two `migrations apply`, an explicit "paste each returned database_id into the five workers that carry an OPS binding", and a written explanation of why the `env.OPS ?? env.DB` fallback is defeated. +5 for closing round 1's HIGH; −1 because the apply command does not work (finding 1). |
| 25 | the rename sweep is a script | 0 | **0** | `forkability.scripts` still reports no fork script. `scripts/` holds `build-blueprint.mjs`, `gen-icons.mjs`, `move-to-ops.mjs`, `reset-all.mjs`, `smoke-staging.mjs`, `vault.mjs`. None renames anything. |
| 20 | no step needs a value only the author knows | 15 | **17** | The five `OPS` database ids are now named in `BOOTSTRAP.md`. Held back 3 because `new-app` §3.1 — the procedure a fork actually runs — still enumerates only the six core-bound workers and never mentions `OPS`. |
| 20 | the fork verifies itself at the end | 15 | **15** | `scripts/smoke-staging.mjs` unchanged (not in the repair diff). Still a real end-to-end verifier with three identity tripwires at `:84`, `:115`, `:126`. |

`21 + 0 + 17 + 15 = 53`.

### Criterion 9 — the sub-lines

| points | check | R1 | R2 | evidence |
|---|---|---|---|---|
| 40 | a fork/bootstrap document exists | 40 | **40** | `forkability.docs` = 8. |
| 35 | it matches what the scripts do today | 6 | **10** | Round 1 measured eight drift points. Re-measured below: 1.5 closed, 6.5 stand, 1 new. |
| 25 | it names what to change and what to leave alone | 21 | **24** | `BOOTSTRAP.md:119-127` now covers the `OPS` bindings — the one omission round 1 named in this line. Held back 1: `BOOTSTRAP.md:179` still says `CF_ACCOUNT_ID` goes on "tenancy + content + data-ops" while four workers ship it. |

`40 + 10 + 24 = 74`.

**The eight drift points, re-measured one by one:**

| # | round 1 drift point | round 2 |
|---|---|---|
| 1 | ops database absent from the runbook | **half closed** — fixed in `BOOTSTRAP.md`, still absent from `new-app` |
| 2 | 4 copies of `brimba_session`, 1 documented | **stands** — verified 4 code sites below |
| 3 | the sweep turns `npm run check` red | **stands** — 8 assertions in 3 test files |
| 4 | agent greeting not in the sweep | **stands** — `agent.ts:42` unchanged |
| 5 | MCP `instructions` string not in the sweep | **stands** — `mcp/src/index.ts:68,70` unchanged |
| 6 | no sweep script, no law | **stands** — `forkability.scripts` = 0, 25 laws, none about identity |
| 7 | three stale counts | **two closed and guarded**, one stands (`OPERATIONS.md:257`), and `new-app` §3.2 still says `0001`–`0013` |
| 8 | sweep names a prefix file that has none, misses two | **stands** — verified below |
| **new** | the ops apply command cannot work as written | **opened by the round-1 repair** |

---

## Findings

Findings 1 and 2 are new in round 2. Findings 3 onward are round-1 findings re-verified as
still standing; each says what was re-checked so the claim is falsifiable.

### HIGH · 1 · NEW — the runbook step that fixes my HIGH cannot work: the `OPS` binding has no `migrations_dir`

`BOOTSTRAP.md:113-118` now says:

```
# Apply the ops migrations (db/ops/0001…0002) to each env.
cd workers/auth
npx wrangler d1 migrations apply brimba-ops-staging --env staging --remote
```

`migrations_dir` is a **per-binding** property in `wrangler.jsonc`, and only the `DB`
binding declares one. Measured across all five workers that bind `OPS`:

- `migrations_dir` appears **10 times**, every one of them `"../../db/core"`, every one of
  them inside the `DB` entry (`workers/auth/wrangler.jsonc:23,48`, and the same pair in
  `tenancy`, `content`, `data-ops`, `mcp`).
- The `OPS` entries — `workers/auth/wrangler.jsonc:18,43` and the same pair in the other
  four — declare **no** `migrations_dir`. Wrangler's default is `migrations`, relative to
  the wrangler config.
- `find . -type d -name migrations -not -path "*/node_modules/*"` returns **nothing**. No
  such directory exists anywhere in the repository.

So the command resolves `brimba-ops-staging` to a binding with no migrations directory and
a default that does not exist. It will not apply `db/ops/0001_operations.sql` or
`0002_error_request_id.sql`. *(Read from config, not executed — this review is read-only
and has no Cloudflare account. The claim rests on the file contents above and on
wrangler's documented default.)*

**Why it matters.** This is the whole point of round 1's HIGH: an operator who follows the
new step believes the operations database is migrated when it is not. `logError` swallows
its own failure, so the environment looks healthy and records nothing — the exact failure
`BOOTSTRAP.md:121-127` was written to prevent, now reached by a different route.

**Fix.** Either add `"migrations_dir": "../../db/ops"` to the `OPS` binding in `auth`'s
wrangler config (one worker is enough — the runbook already runs from `workers/auth`), or
change the runbook to the mechanism `OPERATIONS.md:257` already uses, which does work:
`npx wrangler d1 execute <project>-ops --remote --file ../../db/ops/<each>.sql` in a loop
over `db/ops/*.sql`. The loop is better: it fixes finding 8 at the same time.

### HIGH · 2 · NEW — the check guarding the ops fix cannot fail

`web/test/rules.test.ts:828`:

```ts
expect(doc, "BOOTSTRAP must stand up the OPERATIONS database — five workers bind it")
  .toMatch(/ops/i)
```

Run against the **pre-fix** `BOOTSTRAP.md` (`git show 8751e30:BOOTSTRAP.md`), `/ops/i`
matches **13 times** — every one of them the substring inside the worker name `data-ops`.
The document the check was written to catch passes it.

**Why it matters.** This is the campaign's stated failure mode: a check that has never been
able to fail, guarding a repair, reading green forever. Delete the ops section from
`BOOTSTRAP.md` tomorrow and `npm run check` stays green. The two migration-count assertions
beside it (`:822`, `:825`) are the opposite and are excellent — they derive the highest
number on disk and require the exact literal in the document, so they genuinely bite. This
one is the odd assertion out in an otherwise well-built check.

A third weakness in the same block: `expect(ops).toBeGreaterThan(0)` at `:829` asserts
about **disk**, not about the document. Add `db/ops/0003` and `BOOTSTRAP.md`'s
"`0001…0002`" goes stale with nothing red.

**Fix.** Assert the mechanism, not the letters: require `BOOTSTRAP.md` to contain both the
ops database name and a `migrations apply`/`execute` line for it — and mirror the core/team
pattern with `` toContain(`\`0001\`…\`${String(ops).padStart(4,"0")}\``) `` so the ops range
is derived from disk too.

### HIGH · 3 · STANDS — four copies of the session cookie name, one documented

Re-verified by grep across the whole tree:

| site | what breaks if only the documented one is renamed |
|---|---|
| `workers/auth/src/lib/sessions.ts:6` — `export const SESSION_COOKIE = "brimba_session"` | the documented one |
| `workers/mcp/src/lib/bridge.ts:14` — `const SESSION_COOKIE = "brimba_session"` | every MCP tool call mints a cookie auth will not accept; the whole external machine surface fails as an auth error |
| `shared/workers/rate-limit.ts:69` — the `callerKey` regex | rate limiting for signed-in users silently degrades from per-session to per-IP |
| `workers/gateway/src/index.ts:196` — `cookie.includes("brimba_session=")` | client error reporting silently stops for every signed-in user |

(The gateway site moved from `:156` to `:196` — the repair commits added code above it, not
to it.) `scripts/smoke-staging.mjs:84` and `workers/gateway/test/rate-limit.test.ts:36,64`
carry the literal too. The rate-limit copy remains *protected* by its own test, so the leak
stays green forever.

**Fix.** Export the cookie name once from `shared/workers/` — it belongs beside
`ORIGIN_HEADER` in `shared/workers/activity.ts` — and have all four import it. Four sweep
sites collapse to one; three silent-failure modes disappear.

### HIGH · 4 · STANDS — the documented sweep, followed exactly, turns `npm run check` red, and the procedure promises green

`new-app` §2 line 140: *"Then `npm run check` again — green before any deploy."* Line 194
repeats it in the verify step. Following the sweep as written breaks **8 assertions across
3 test files** — round 1 counted 6 across 2, so this is worse than reported, not better:

- `web/test/use-form-draft.test.ts:37,54,55,58,59` — five literal `"brimba:draft:"` keys
  against `web/lib/use-form-draft.ts:19`, which the sweep lists as *"Optional/cosmetic"*.
- `workers/mcp/test/catalog.test.ts:94` — `/^brimba_mcp_[0-9a-f]{64}$/` against the real
  `newTokenSecret()` at `workers/mcp/src/lib/tokens.ts:30`, which the sweep does tell you
  to rename.
- `workers/gateway/test/rate-limit.test.ts:36,64` — two literal `brimba_session=` cookies
  against `shared/workers/rate-limit.ts:69`, a site the sweep never names at all.

**Why it matters.** This is the fork's one pre-deploy gate, and it is wrong in the direction
that erodes trust: the operator either concludes the base is broken or learns to ignore a
red check. *(Verified by reading both sides of all eight assertions; not by running them.)*

**Fix.** Have all three tests read their literal from the module under test. That makes the
tests fork-proof instead of fork-blocking, and — for the mcp one — keep asserting the
64-hex entropy separately so a real entropy regression cannot slip through.

### MEDIUM · 5 · STANDS — the assistant introduces itself by the base's name, past the brand seam

`workers/data-ops/src/lib/agent.ts:42` is still `"You are Brimba's assistant — a calm,
friendly helper for the user's team…"`. The same worker already imports `shared/brand.ts`
(`workers/data-ops/src/index.ts`) and uses `brand.name` in an error message.
`shared/brand.ts:12` tells a forker "Edit ONLY this file". Not in the sweep list either.

**Fix.** Import `brand` in `agent.ts` and interpolate `${brand.name}'s assistant` into the
module-level `SYSTEM` array, exactly as `GLOSSARY` already is. Does not disturb R9, which
asserts the capability brief, not the greeting.

### MEDIUM · 6 · STANDS — the MCP surface is branded past the seam in three places

`workers/mcp/src/index.ts:68` (`serverInfo: { name: "brimba-mcp" }`), `:70` (the
`instructions` string), `workers/mcp/src/lib/tokens.ts:30` (the `brimba_mcp_` token
prefix). The mcp worker still imports no brand seam. The sweep names the first and third
but not the second.

**Fix.** Import the brand seam and derive all three from `brand.name` — but only in the
fork script, never as a migration on a running base (see the impact map).

### MEDIUM · 7 · STANDS — no fork script, and no law about whether the base is still a base

`forkability.scripts` = 0. All 25 laws in `shared/rules/registry.ts` govern how a *module*
behaves; none governs whether product identity is confined to a seam. Round 2 supplies the
proof this matters: the repair pass fixed the in-repo document and added a check for it,
while the out-of-repo procedure a fork actually executes drifted **further** in the same
window (finding 9). Two documents now describe the same procedure and disagree, and only
one of them is checked.

**Fix.** (a) `scripts/fork.mjs` — a scripted sweep the `new-app` skill becomes a thin
wrapper over, restoring `SWIFT-STRUCK-WAY.md`'s own rule. (b) A Law R26 with a real check:
product identity resolves through `shared/brand.ts`, with a named exemption list for the
wire constants that must stay stable. **Stated tension:** that is a law, a registry entry, a
check and ~120 script lines, which is exactly what `lean_mean_review` penalises.

### MEDIUM · 8 · STANDS — the ops migration count in `OPERATIONS.md`, the one that actually leaves a column missing

`OPERATIONS.md:257` still reads `npx wrangler d1 execute <project>-ops --remote --file
../../db/ops/0001_operations.sql`. `db/ops/` holds **two** files;
`0002_error_request_id.sql` is never applied by this instruction. Unlike the two counts
that were fixed, this one is a literal `--file` command, so it does not mislead — it leaves
the `request_id` column off the error log.

The two counts that *were* fixed are genuinely well fixed and worth saying so:
`BOOTSTRAP.md:96,129` now say `0001`–`0017` and `:137` says `0001`…`0008`, both matching
disk (17 files in `db/core`, 8 versions in `TEAM_MIGRATIONS`), both derived and asserted by
`web/test/rules.test.ts:816-826`. That is the right pattern; the ops line simply has not
had it applied.

**Fix.** Make it a loop over `db/ops/*.sql`, and extend the check to the ops range.

### MEDIUM · 9 · NEW — the two fork documents now disagree, and the unchecked one is the one a fork runs

`BOOTSTRAP.md` (in-repo, now checked) and `~/.claude/skills/new-app/SKILL.md` (out-of-repo,
unchecked) both describe standing the base up. Measured differences today:

| fact | `BOOTSTRAP.md` | `new-app` SKILL.md |
|---|---|---|
| the operations database | its own section, "do not skip this" | never mentioned; §3.1 lists six core-bound workers only |
| core migrations | `0001`–`0017`, derived from disk by a check | §3.2: "currently `0001`–`0013`" |
| team migrations | `0001`…`0008`, checked | not stated |
| route back to the base | not stated | §1: "remove the brimba `origin`" |

**Why it matters.** `new-app` is the fork procedure that actually executes. The repair pass
improved the document that is *read* and left the one that is *run*. Nothing red guards the
second, which is finding 7 restated as an observation rather than a prediction.

**Fix.** Move the procedure into the repo as `scripts/fork.mjs` + a checked doc, and make
the skill a wrapper. Short of that, at minimum bring `new-app` §3.1/§3.2 into line today.

### LOW · 10 · STANDS — the sweep list names a file with no prefix and misses two that have one

`new-app` §2:120-122 lists the `brimba:` storage prefixes as living in
`web/lib/use-form-draft.ts`, `web/lib/agent-trace.ts` and `web/lib/use-agent-chat.tsx`.
Measured: `web/lib/agent-trace.ts` contains **zero** `brimba` strings. Four files actually
carry the prefix — `use-form-draft.ts:19`, `screen-trace.tsx:21,22`, `agent-open.ts:16`,
`use-agent-chat.tsx:30`. The list names two correctly, one that does not apply, and misses
two.

### LOW · 11 · STANDS — the mcp worker ships the author's Cloudflare account id and never reads it

`workers/mcp/wrangler.jsonc:31,53` still carry
`CF_ACCOUNT_ID = "af3f1bf82aa34512f4f6630091358439"`, and the mcp worker still has no
`CF_D1_TOKEN` and calls no D1 REST door — so the var is inert. `BOOTSTRAP.md:179` still
names three workers for this var while four ship it.

### LOW · 12 · STANDS — two base hosts hardcoded outside the sweep

`web/playwright.config.ts:10` and `web/components/access-tokens.tsx:49` still fall back to
`brimba*.swift-struck.workers.dev`. `access-tokens.tsx:51` still tells a fork's developer to
"Connect to my **Brimba** workspace".

### LOW · 13 · STANDS — a fork has no route back to the base

`new-app` §1:96 still says remove the origin; nothing adds `upstream`.
`BASE-IMPROVEMENTS.md` still lands each fix as a cherry-pickable commit with no remote to
cherry-pick from. This is why criterion 5's 40-point line will read *unmeasured* on every
future fork too.

### INFORMATIONAL · 14 · The one `acrymold` mention is still fine

`scripts/reset-all.mjs:10`, in a header comment, explaining that the reset never touches
databases from other projects in the account. Scored as the rubric's minor and named again
so nobody "fixes" it into something less clear.

### INFORMATIONAL · 15 · What the repair pass did that HELPS forkability

Worth recording, because a review that only counts damage is not measuring:

- `shared/test/source.ts` derives its worker set with `readdirSync(ROOT/workers)` and its
  component set from `web/components` — a fork adding or removing a worker does not have
  to update eight checks.
- A check that previously hand-listed `["auth", "tenancy", "content", "data-ops"]` now
  reads the directory.
- `registry-integrity` (`web/test/rules.test.ts:68-74`) now scans **every** `.md` at the
  repository root for a law range and fails on any that disagrees with the registry.
  Measured: five documents now say `R1–R25` and the registry holds 25 ids. That is the
  right shape for a fact stated in more than one place, and it is fork-safe.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| 1 · Make the ops migrations actually apply | `workers/auth/wrangler.jsonc` (add `migrations_dir` to the `OPS` entry) **or** `BOOTSTRAP.md:113-118` (loop over `db/ops/*.sql` with `d1 execute`) | ADDS 1 config line, or replaces 3 runbook lines | `story_checks_out_review` — picking the `d1 execute` form makes `BOOTSTRAP.md` and `OPERATIONS.md:257` use the same mechanism, which *reduces* drift. Picking the `migrations_dir` form creates two mechanisms for the same job in two documents. Prefer the loop. |
| 2 · Make the ops assertion able to fail | `web/test/rules.test.ts:828-829` | REPLACES a vacuous `/ops/i` with a name + apply-line assertion; ADDS a derived ops-range assertion | `lean_mean_review` — 3 more lines in an existing check. `speed_review` — negligible, the file is already read. Neutral otherwise. |
| 3 · One exported `SESSION_COOKIE`, imported by four callers | `shared/workers/activity.ts`, `workers/auth/src/lib/sessions.ts`, `shared/workers/rate-limit.ts`, `workers/gateway/src/index.ts`, `workers/mcp/src/lib/bridge.ts` | REMOVES 3 duplicate literals, ADDS 4 imports; net −3 lines | `architecture_review` — adds a `shared/` → gateway/mcp import edge where each worker was self-contained on this constant. Small, and it points the direction shared already points, but it is real added coupling and should be argued rather than slipped through. |
| 4 · Three identity tests read their prefix from the module | `web/test/use-form-draft.test.ts`, `workers/mcp/test/catalog.test.ts`, `workers/gateway/test/rate-limit.test.ts` | REMOVES 8 hardcoded literals, ADDS 3 imports | `security_sentry_review` — the mcp test currently pins the exact token shape `^brimba_mcp_[0-9a-f]{64}$`. Deriving the prefix **must** keep a separate assertion on the 64-hex entropy, or an entropy regression slips through a green test. |
| 5 · Agent greeting reads `brand.name` | `workers/data-ops/src/lib/agent.ts` | ADDS 1 import, changes 1 string | none — `SYSTEM` is already a module-level array that interpolates `GLOSSARY`; R9 asserts the capability brief, not the greeting. |
| 6 · MCP identity reads `brand.name` | `workers/mcp/src/index.ts`, `workers/mcp/src/lib/tokens.ts` | ADDS 1 import to a worker that has none | `security_sentry_review` — changing the live token prefix invalidates every issued token. This must apply to **new forks only**, never as a migration on a running base. Keep `brimba_mcp_` on this repo; let the fork script rewrite it. |
| 7a · `scripts/fork.mjs` — script the sweep | new `scripts/fork.mjs`, `new-app` SKILL.md §2 | ADDS ~120 script lines; REMOVES a 30-line prose list from outside the repo | `lean_mean_review` — direct hit, ~120 new lines. Defensible because it deletes an out-of-repo dependency `SWIFT-STRUCK-WAY.md` forbids, but it *is* more code. |
| 7b · Law R26 — identity resolves through one seam | `RULES.md`, `shared/rules/registry.ts`, `web/test/rules.test.ts` | ADDS a law row, a registry entry, a source scan and an exemption list | `lean_mean_review` — a 26th law and check is more ceremony. `speed_review` — `npm run check` gains one more full source scan. Weigh against: nothing else stops findings 5, 6, 10 and 12 recurring. |
| 8 · Ops line becomes a loop; extend the count check | `OPERATIONS.md:257`, `web/test/rules.test.ts` | REMOVES a hand-maintained filename | none — strictly removes a drift surface. |
| 9 · Bring `new-app` §3.1/§3.2 into line | `~/.claude/skills/new-app/SKILL.md` | Corrects 2 stale facts, ADDS the ops step | `story_checks_out_review` — a *third* copy of the same procedure. This is a stopgap; fix 7a is the real answer. |
| 10 · Correct the storage-prefix filenames | `new-app` SKILL.md §2 | Corrects 1 filename, ADDS 2 | none — documentation accuracy only. |
| 11 · Delete the dead `CF_ACCOUNT_ID` from mcp | `workers/mcp/wrangler.jsonc`, `workers/mcp/src/env.ts` | REMOVES 2 config lines + 1 type field | `dead_end_review` — this is *their* finding too; coordinate so it is fixed once, not twice. |
| 12 · Sweep the two remaining hosts; access-tokens copy reads `brand.name` | `web/playwright.config.ts`, `web/components/access-tokens.tsx` | ADDS 1 import; changes 2 literals | none — surface layer, already client-only. |
| 13 · `git remote add upstream` in the fork procedure | `new-app` SKILL.md §4, `BASE-MANUAL.md` §5 | ADDS 1 command | none — makes criterion 5 measurable on every future fork at zero code cost. |

**The tension worth stating outright.** Fixes 7a and 7b are the only ones that make these
findings *stay* fixed, and both cost `lean_mean_review` real points. Round 2 is the
evidence: the round-1 repair pass patched documents, and within one commit window the two
procedure documents disagreed on four facts and a new blind check shipped. Every other fix
in this table is a patch on a surface that has now drifted three times.

---

## CEILING

**95 is reachable by changing code — and round 1's answer to the question the campaign
asked is unchanged: it still needs `scripts/fork.mjs` guarded by a law. Round 2 makes that
case stronger, and the arithmetic says so.**

Documentation-only ceiling, recomputed with every doc fix landed and no script and no law
(criterion 4's 25-point sweep-script line permanently 0, criterion 9 capped by having no
red guard on the procedure):

`(97×15 + 97×14 + 88×13 + 68×12 + 100×11 + 100×10 + 92×8 + 90×8 + 95×5 + 100×4) / 100`
`= (1455 + 1358 + 1144 + 816 + 1100 + 1000 + 736 + 720 + 475 + 400) / 100 = 9204/100 =` **92**.

That is up from round 1's documentation-only ceiling of 86, because `BOOTSTRAP.md`'s
improvements have already banked most of criterion 9. **It is still short of 95, and the
missing 3 points sit almost entirely in criterion 4's 25-point line** — 12% weight × 25
points = 3.0 points of the total, unreachable by any amount of prose.

With `scripts/fork.mjs` landed, criterion 4's 25-point line goes to 25 and its 35-point
line to ~33, taking the criterion to ~96: `+ (96−68)×12 = +336` → `9540/100 =` **95.4**.

So: **the shortest path to 95 is still the script, and it is now the only path.** The law
(R26) is not needed for the arithmetic — it is needed so the number does not decay again,
which is what round 2 measured happening. If only one of the two is built, build the
script; if the owner will only accept one *addition*, the script is the one that moves the
score, and the law is the one that keeps it.

**Structural caps no commit can lift:**

- **Criterion 5's 40-point line is unmeasurable in BASE mode by definition** — a base has no
  upstream. Fix 13 makes it measurable on every future fork; it can never be measurable
  here. The criterion's true ceiling in this repository is its 60 measurable points,
  reported as 100.
- **Criterion 2's last 3 points** need a module off-switch — making Learning and Help
  declinable across `TEAM_MIGRATIONS`, the nav registries, `MODULE_SHELLS`, the import
  catalog and the permission set. That is a migration affecting every existing fork, which
  the skill classes Tier 3 and the owner must decide. Not needed to reach 95.
- **Criterion 1's last 3 points** are a comment that should stay.

Nothing here is capped by a locked decision in `ARCHITECTURE.md`, by a platform limit, or
by single authorship.

---

## Verdict

**The base is still a base, and the repair pass did it no harm** — zero new identity
literals in the foundation, zero new tables, zero tenant branching, no criterion down.

**But the repair pass proved this review's central finding rather than closing it.** The
one HIGH that was addressed was addressed in the document that gets *read* and not the one
that gets *run*; the command it added does not work because the `OPS` binding has no
`migrations_dir`; and the check written to guard it matches the word `data-ops` and would
have passed the very document it was written to catch.

**The single worst leak is unchanged and is the base leaking into its own forks:** the fork
procedure is prose, in a skill, outside the repository, with nothing red when it goes
stale — and in the one week since round 1 it drifted further, while the in-repo copy was
fixed, so the two now disagree about four facts.
