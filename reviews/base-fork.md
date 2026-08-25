# Base fork review — Brimba · 2026-08-25
SCORE: 77/100   (previous: never run)

**Mode: BASE.** The probe reports `identity.mode = "this looks like the base itself"`,
corroborated by `origin = github.com/alaap-swift-struck/brimba`, `package.json name =
"brimba"` and `resourcePrefix = "brimba"` with no `upstream` remote. The bare probe run
returned `inferenceFailed: true` (nothing to search for), so per the skill's hard rule I
re-ran it as `probe.mjs . --base brimba --client acrymold` before scoring criteria 1, 2
and 6. The question asked here is: **has anything client-specific leaked into the
foundation, and could you lift this base out tomorrow and start a different product on
it?**

**Scoring note that decides everything below.** The base's own name compiled into
foundation code is *not* scored as a client leak — Brimba is not a client of itself.
Criterion 1 scores hits for the client token (`acrymold`) only. Everything the base's own
identity costs a fork is scored where forkability actually lives: criteria 3, 4, 7 and 9.
Scoring it twice would have produced a much worse-looking and much less useful number.

---

## Arithmetic

| # | criterion | key | method | score | weight | score × weight |
|---|---|---|---|---|---|---|
| 1 | No client name in the foundation | `leaks` | defect | 97 | 15 | 1455 |
| 2 | No client-shaped table, column or module | `schema` | defect | 97 | 14 | 1358 |
| 3 | Client differences live in config, not code | `config` | coverage | 58 | 13 | 754 |
| 4 | A fresh fork stands up unattended | `standup` | coverage | 47 | 12 | 564 |
| 5 | Base and fork have not silently diverged | `drift` | coverage | 67 | 11 | 737 |
| 6 | Nothing assumes one client's data shape | `assumptions` | defect | 100 | 10 | 1000 |
| 7 | Branding lives in one place | `branding` | coverage | 44 | 8 | 352 |
| 8 | Client-specific rules sit behind a seam | `seam` | coverage | 90 | 8 | 720 |
| 9 | The fork procedure is documented and current | `procedure` | coverage | 67 | 5 | 335 |
| 10 | Someone has actually forked it recently | `proven` | coverage | 100 | 4 | 400 |
| | | | | | **100** | **7675** |

**Total = 7675 / 100 = 76.75 → 77.**
**Gate:** criterion 1 = 97, well above 40, so the cap-at-45 gate does **not** apply.
Capped and uncapped figures are identical: 77.

### The layer split (raw counts are wrong by a factor of two — never publish the total)

Probe hits for the client token `acrymold`, split by layer:

| layer | hits | scored? |
|---|---|---|
| renamed-by-design (`wrangler.jsonc`, `package.json`, README) | 0 | no — the sweep working |
| surface (`web/`, `public/`) | 0 | branding only |
| **foundation** (`shared/`, `db/`, `workers/`, `scripts/`) | **1** | **yes — this is the finding** |
| other (`BASE-IMPROVEMENTS.md`, a history doc) | 1 | no — excluded class |

One foundation hit, and it is a comment. That is a genuinely clean result for criterion 1
and it is stated plainly because this is the only review that will ever confirm it.

---

### Criterion 1 — No client name in the foundation · 97/100 · weight 15 · GATE

Foundation hits for `acrymold`: **1**.

- `scripts/reset-all.mjs:10` — inside a header comment: the reset "never touches databases
  from other projects in the account, e.g. acrymold". Rubric severity **minor** (a client
  name in a comment or an example) → penalty **3**.

Client-token hits in an executing code path: **0**. In a migration: **0**. In
`shared/glossary.ts`: **0** — all 22 glossary terms (`shared/glossary.ts:14-35`) are
generic SaaS concepts (team, member, role, invite, ticket, article, activity), none
carrying a client's terminology.

`100 − 3 = 97`.

### Criterion 2 — No client-shaped table, column or module · 97/100 · weight 14

`clientTables` from the probe: **0**. Tables counted off disk: 19 core (`db/core/*.sql`),
2 ops (`db/ops/*.sql`), 16 team (`workers/tenancy/src/team-schema.ts`). None carries a
client name, a client-only column, or a client-only workflow.

The rubric's question asked out loud on the two candidates:

- `learning`, `learning_progress` — a team-training module. A stock system or a CRM may not
  want it. But it is declared base scope in `CLAUDE.md` and `BASE-MANUAL.md` §5, was not
  built for one client, and is generic in shape. Not a leak.
- `help`, `help_threads`, `help_stakeholders` — a generic in-app help desk. Most products
  want this.

One real defect remains, and it is structural rather than client-shaped: **5 of the 16
team tables are opinionated product modules a fork cannot decline.** All 16 are created
unconditionally by `TEAM_MIGRATIONS` (`workers/tenancy/src/team-schema.ts:121` onward); a
fork that does not want Learning must delete code from `web/lib/pages.ts`,
`web/lib/screens.ts`, `MODULE_SHELLS` in `workers/gateway/src/index.ts`, the import
catalog, `web/lib/live-resources.ts`, the permission set and the team schema — and R13,
R15 and R20 will turn red while it does. Severity **minor** → penalty **3**.

`100 − 3 = 97`.

### Criterion 3 — Client differences live in config, not code · 58/100 · weight 13

| points | check | award | the count behind it |
|---|---|---|---|
| 35 | every client-varying value comes from config/env | **19** | 15 from env ÷ (15 + 13 literal sites) = 0.536 × 35 |
| 25 | no email, domain or account id hardcoded in the foundation | **13** | 8 literal occurrences of the author's real account id; 2 of 3 hardcoded hosts undocumented |
| 20 | one obvious place a fork edits, and it is documented | **12** | `shared/brand.ts` exists and is documented — but its "Edit ONLY this file" claim is false by 13 sites |
| 20 | defaults exist so a fork boots before every value is filled | **14** | 6 graceful degradations found; 2 wrong-default traps |

**Values that DO come from env/config (15):** `APP_ORIGIN`, `EMAIL_FROM`,
`PUBLIC_APP_URL`, `CF_ACCOUNT_ID`, `CF_D1_TOKEN`, `ADMIN_KEY`, `INTERNAL_KEY`,
`RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `AGENT_MODEL`, `AGENT_EFFORT`, `AGENT_FREE_DAILY`,
`WORKERS_AI_MODEL`, `ENVIRONMENT`, `MAX_TEAMS_PER_USER`. (`envVarsUsed` = 32 total.)

**Client-varying values that are LITERALS in code (13 sites):**

1. `workers/auth/src/lib/sessions.ts:6` — `SESSION_COOKIE = "brimba_session"`
2. `shared/workers/rate-limit.ts:69` — `/(?:^|;\s*)brimba_session=([^;]+)/`
3. `workers/gateway/src/index.ts:156` — `cookie.includes("brimba_session=")`
4. `workers/mcp/src/lib/bridge.ts:14` — `const SESSION_COOKIE = "brimba_session"`
5. `workers/mcp/src/lib/tokens.ts:30` — `` `brimba_mcp_${…}` ``
6. `workers/mcp/src/index.ts:68` — `serverInfo: { name: "brimba-mcp" }`
7. `workers/mcp/src/index.ts:70` — `"Brimba's machine surface. …"`
8. `workers/data-ops/src/lib/agent.ts:42` — `"You are Brimba's assistant …"`
9. `shared/workers/activity.ts:87` — `ORIGIN_HEADER = "x-brimba-origin"`
10. `web/lib/use-form-draft.ts:19` — `PREFIX = "brimba:draft:"`
11. `web/lib/screen-trace.tsx:21-22` — `"brimba:agent-trace"`, `"brimba:agent-trace-host"`
12. `web/lib/agent-open.ts:16` — `KEY = "brimba:agent:open"`
13. `web/components/access-tokens.tsx:49,51,60,172` — host, product name, server key, prefix

**The 25-point line, each candidate read rather than counted** (the probe matches shapes,
not meaning — 28 of its 40 "hardcoded" hits were dates and oklch floats):

- `noreply@updates.swiftstruck.com` at `workers/auth/src/env.ts:17` — a **JSDoc example**,
  not a default. `EMAIL_FROM: string` is required. **Refuted, not a finding.**
- `alaap@x.com` (`workers/auth/src/lib/email.ts:32`) and `something@something.tld` (`:10`)
  — JSDoc examples for `maskEmail` / `isValidEmail`. **Refuted.**
- `delivered@resend.dev` ×2 in `scripts/smoke-staging.mjs` — Resend's public test inbox,
  deliberate and commented. **Refuted.**
- `https://api.cloudflare.com`, `https://api.resend.com`, `https://x.invalid` — vendor
  endpoints and a sentinel. **Refuted.**
- `CF_ACCOUNT_ID = "af3f1bf82aa34512f4f6630091358439"` — the author's real Cloudflare
  account id, checked into **4** workers × 2 blocks = **8 occurrences**
  (`workers/tenancy/wrangler.jsonc:29,58`, `content:31,57`, `data-ops:34,64`,
  `mcp:31,53`). **Confirmed.**
- Three hardcoded base hosts: `scripts/smoke-staging.mjs:8` (documented),
  `web/playwright.config.ts:10` (undocumented), `web/components/access-tokens.tsx:49`
  (undocumented). **Confirmed.**

**The 20-point defaults line.** Verified good: `OPS?` is optional and falls back to the
core DB (`shared/workers/ops-db.ts:41`); `RESEND_API_KEY?` absent → `sendEmail` returns
false; `ANTHROPIC_API_KEY` absent → Workers AI fallback; `CF_D1_TOKEN` absent → a clean
`cloud_key_missing` (`shared/workers/gating.ts:64`); the import catalog self-heals on read
(R13) so no seed step is required; `AGENT_FREE_DAILY` has a code default. Against it:
`CF_ACCOUNT_ID` ships a *wrong* value rather than none, and the `OPS` binding ships
*present* with a foreign database id — which defeats the one fallback designed for exactly
this case.

`19 + 13 + 12 + 14 = 58`.

### Criterion 4 — A fresh fork stands up unattended · 47/100 · weight 12

| points | check | award |
|---|---|---|
| 35 | a documented, scripted path from clone to running | **17** |
| 25 | the rename sweep is a script, not a list of manual edits | **0** |
| 20 | no step requires a value only the original author knows | **15** |
| 20 | the fork verifies itself at the end | **15** |

**35-point line.** Documented: yes — `BOOTSTRAP.md` (10 sections), `BASE-MANUAL.md` §5,
and the out-of-repo `new-app` skill. Scripted: `npm run deploy:staging` genuinely scripts
the realtime-first seven-worker deploy plus the smoke. Not scripted: database creation, id
repointing, bucket creation, secrets, the sweep. And the runbook is stale in three
measured places — see criterion 9, findings 1–3. **17/35.**

**25-point line.** `forkability.scripts` = **0** real fork scripts. `scripts/` contains
`build-blueprint.mjs`, `gen-icons.mjs`, `move-to-ops.mjs`, `reset-all.mjs`,
`smoke-staging.mjs`, `vault.mjs` — nothing that renames anything. The sweep is a 30-line
prose checklist, and its most complete version lives in
`~/.claude/skills/new-app/SKILL.md` — **outside the repo**, which contradicts
`SWIFT-STRUCK-WAY.md`'s own rule ("every skill that DOES something to a project is a thin
wrapper over a script and a doc that already live in the repo and work without Claude").
The repo's own copy (`BASE-MANUAL.md:443-448`) is a strictly weaker subset: it names the
wrangler files and the deploy scripts, and does not even mention `shared/brand.ts`. **0/25.**

**20-point line.** Verified: no hardcoded ULIDs anywhere in `shared/` or the seven
`workers/*/src` trees; `scripts/vault.mjs` is referenced by neither fork document, so the
author's vault is not required. Every author-specific value is explicitly flagged
"overwrite it" — *except* the five `OPS` database ids, which no fork document mentions at
all. **15/20.**

**20-point line.** `scripts/smoke-staging.mjs` is a real end-to-end verifier — login →
onboarding → team factory → MCP `initialize`/`tools/list`/whoami/revoke — wired into
`deploy:staging` and exiting non-zero. Three of its assertions (`:84`, `:115`, `:126`) are
deliberate identity tripwires that catch a half-swept fork. Strong. Docked because it runs
only *after* deploy, and the pre-deploy gate the procedure names is false as written
(finding 3). **15/20.**

`17 + 0 + 15 + 15 = 47`.

### Criterion 5 — Base and fork have not silently diverged · 67/100 · weight 11

**40 of this criterion's 100 points are UNMEASURED, not zero.** `identity.upstream` is
`null`, which in BASE mode is correct — the base has no upstream. Per the skill's hard
rule that line is excluded rather than scored, and the criterion is computed over the 60
measurable points.

| points | check | award |
|---|---|---|
| 40 | an `upstream` remote exists | **UNMEASURED** (base has no upstream) |
| 30 | fork improvements are carried back, or the decision not to is recorded | **30** |
| 30 | the fork can state how far behind the base it is | **10** |

**30/30.** `BASE-IMPROVEMENTS.md:13` and `:329` record two complete port-back rounds —
2026-08-04 (20 defects from Acrymold → Laws R13–R19) and 2026-08-11 (7 findings → R20/R21/
R22), merge commit `efebf4d`, each "landed as its own commit so a fork can cherry-pick".
This is best-in-class and is why criterion 10 scores 100.

**10/30.** There is no fork registry, no documented convention for a fork to keep the base
reachable, and `new-app` step 1 says the *opposite*: "Re-point git: **remove the brimba
`origin`**." A fork created by the documented procedure therefore has no remote pointing
at the base and no way to compute its own drift — which is precisely why the next
`base_fork_review` run on a fork will report this criterion unmeasured too.

`40 / 60 = 66.7 → 67`.

### Criterion 6 — Nothing assumes one client's data shape · 100/100 · weight 10

This is a genuine clean result. What was probed, so the claim can be checked:

- Tenant-id / team-name equality branching across `shared/` and all seven `workers/*/src`
  (regex on `teamId|team_id|tenant|slug|name === "…"`, excluding rights, statuses, HTTP
  verbs, origins and environments): **0 hits**.
- Hardcoded ULIDs (`01` + 24 Crockford chars) in foundation code: **0** (the only match is
  the Crockford alphabet itself, `shared/workers/id.ts:5`).
- Validation tuned to one client's data: `shared/workers/validate.ts` caps are generic
  (`TEXT_LIMITS`); `shared/workers/limits.ts` derives every cap from a platform or model
  budget with the reasoning written out (`BULK_IDS_LIMIT` is computed from
  `AGENT_MAX_TOKENS`, not hand-picked). **0 hits.**
- One-client defaults: `MAX_TEAMS_PER_USER = 5` is env-overridable, so it is config, not a
  code assumption. **0 hits.**

Shared code *does* assume the base's own identity string in four places (the cookie-name
copies), but that is an identity assumption, not a data-shape one, and it is already
counted in criteria 3, 4 and 9. Counting it again here would be double-counting.

`100 − 0 = 100`.

### Criterion 7 — Branding lives in one place · 44/100 · weight 8

| points | check | award |
|---|---|---|
| 40 | name, logo, colours and copy come from one config or theme | **30** |
| 30 | no product name is compiled into a component | **8** |
| 30 | changing the brand is one edit, and someone has confirmed that | **6** |

**30/40.** `shared/brand.ts` is a real, well-built seam: name, description, motto,
`logoUrl`, `accent` (oklch, per mode), `accentHex` (email-safe mirror) and `screen` tones,
consumed by **12** files — `web/app/manifest.ts`, `web/app/layout.tsx`,
`web/components/brand-mark.tsx`, `brand-theme.tsx`, `install-prompt.tsx`,
`temp/auth-card.tsx`, `shared/workers/email-template.ts`, and five workers
(`auth/src/lib/email.ts`, `tenancy/src/index.ts`, `tenancy/src/lib/notify.ts`,
`tenancy/src/lib/invites.ts`, `content/src/lib/notify.ts`, `content/src/index.ts`,
`data-ops/src/index.ts`). Docked because the two highest-visibility identity surfaces —
the assistant and the MCP server — do not read it.

**8/30.** Product name compiled into components: `web/components/access-tokens.tsx` (4
sites of user-visible copy plus a hardcoded base host at `:49`);
`workers/data-ops/src/lib/agent.ts:42`, the assistant's own self-description — arguably the
single most-read string in the app; `workers/mcp/src/index.ts:68,70`.

**6/30.** Measurably false that one edit rebrands: `web/app/manifest.ts:21` duplicates
`#0e9e86`, the literal value of `brand.accentHex.primary` (`shared/brand.ts:43`);
`manifest.ts:20` hardcodes `#0f1112`; `web/app/layout.tsx:47-50` hardcodes `#f5f5f5` /
`#141414`, restating `brand.screen`'s oklch values in a second colour space. Nobody has
confirmed the one-edit claim, and `shared/brand.ts:12` asserts it outright.

`30 + 8 + 6 = 44`.

### Criterion 8 — Client-specific rules sit behind a seam · 90/100 · weight 8

| points | check | award |
|---|---|---|
| 40 | client-specific behaviour is a plugin/module/override, not an `if` in shared code | **36** |
| 30 | the seam is named concretely — file plus function or registry | **30** |
| 30 | adding a second client's rules would not touch the foundation | **24** |

**36/40.** Zero tenant branches (criterion 6). The base is genuinely module-shaped: a
product's behaviour lives in a module, never in a conditional in shared code. Docked
because a module can be added cleanly but not *removed* cleanly (criterion 2).

**30/30.** The seams are named, concrete and machine-checked: `NAV` / `TEAM_SECTIONS` in
`web/lib/pages.ts`, recipes in `web/lib/screens.ts`, `MODULE_SHELLS` in
`workers/gateway/src/index.ts`, `web/lib/live-resources.ts`,
`shared/workers/bulk-doors.ts`, `ACTIVITY_GATE_MAP`, the import `TargetDef`s and the agent
tool catalog — with `BUILD-A-MODULE.md` walking all of them.

**24/30.** Adding a module still touches roughly eight hand-maintained registries across
three workspaces. That is the declared seam, and Laws R13/R15/R20/R21/R22/R24 exist to make
it loud rather than silent — but it is a set of lists, not one registration call.

`36 + 30 + 24 = 90`.

### Criterion 9 — The fork procedure is documented and current · 67/100 · weight 5

| points | check | award |
|---|---|---|
| 40 | a fork or bootstrap document exists | **40** |
| 35 | it matches what the scripts actually do today | **6** |
| 25 | it names what to change and what to leave alone | **21** |

**40/40.** `BOOTSTRAP.md`, `BASE-MANUAL.md` §5, and the `new-app` skill.
`forkability.docs` = 8 matching documents.

**6/35 — eight measured points of drift**, listed as findings 1–8 below.

**21/25.** This part is genuinely excellent and should be said so: `BASE-MANUAL.md`
§5:438-512 names what you keep untouched, what a new product must NOT do, two fork gotchas
(`TEST_LOGIN_KEY` vs `ADMIN_KEY`; catalog self-healing), and — unusually — **two reasoned
security exceptions a fork inherits**, each with the decision criteria for keeping or
fixing it. `BOOTSTRAP.md:78-88`'s "the checked-in ids are the ORIGINAL author's, overwrite
them" callout is exactly the right warning in exactly the right tone. It simply does not
cover the `OPS` bindings.

`40 + 6 + 21 = 67`.

### Criterion 10 — Someone has actually forked it recently · 100/100 · weight 4

| points | check | award |
|---|---|---|
| 60 | a fork has been created and the date is known | **60** |
| 40 | anything that broke was fixed in the base, not only in the fork | **40** |

**60/60.** Acrymold ERP, two dated rounds: `efebf4d` (2026-08-11, "the seven fork findings
(Acrymold ERP)") and `9e58028` (2026-08-11, "the third hand-list, and the fork-facing docs
a new app actually reads"), plus the earlier 2026-08-04 round.

**40/40.** 27 findings across two rounds, **all** landed in the base rather than only in
the fork, **10 of them became machine-checked Laws** (R13–R19, R20–R22), each with a real
check. The base changed afterwards, repeatedly. An unforked base is a claim; this one is a
fact.

`60 + 40 = 100`.

---

## Findings

### HIGH · 1 · The day-zero runbook cannot stand the base up as the code requires — it never creates the operations database

`BOOTSTRAP.md:70-100` creates exactly two databases (`brimba-core-staging`,
`brimba-core`). But **five workers ship an `OPS` binding** —
`workers/auth/wrangler.jsonc:18,43`, `tenancy`, `content`, `data-ops`, `mcp`, each in both
the top-level and `env.staging` blocks — pointing at `brimba-ops` /
`brimba-ops-staging` by the author's real database ids
(`b1389453-fe77-48de-bab1-1dd868e02537`, `b622a822-587e-4a67-b75e-922839616e94`), and
`db/ops/` holds two migrations. The string "OPS" does not appear in `BOOTSTRAP.md` at all,
and `new-app` §3.1 enumerates precisely which ids to repoint ("all SIX core-bound
workers") without mentioning the ops binding.

**Why it matters.** `shared/workers/ops-db.ts:41` is `return env.OPS ?? env.DB` — a
deliberate, well-designed fallback for exactly the fork case, documented in
`workers/auth/src/env.ts:4-7` as "absent in a fork that has not created it". But a fork
following the documented procedure ships the binding **present** with a foreign id, so the
fallback never fires. On a fresh account the deploy hits an unknown database id; on an
account that already hosts the base, the fork's error logs and AI-usage rows land in the
base's own operations database — the same cross-tenant trap the docs warn about for the
mcp core binding, undocumented for this one. *(Which of those two branches actually
occurs is **unmeasured** — verifying it needs a live Cloudflare account this review cannot
reach. Both are bad; the loud one is better.)*

**Fix.** Add the ops database to `BOOTSTRAP.md` §2 — `wrangler d1 create <name>-ops` for
both environments, apply `db/ops/0001` **and** `0002`, and repoint the `OPS` binding in
all five workers — and add the same line to `new-app` §3.1. `OPERATIONS.md:246-262`
already has the correct runbook; it just is not where a fork reads.

### HIGH · 2 · Four copies of the session cookie name, one canonical, three undocumented — renaming the documented one silently breaks the MCP surface

`workers/auth/src/lib/sessions.ts:6` declares `SESSION_COOKIE = "brimba_session"` and is
the only site the fork procedure names. Three more carry the same literal:

- `workers/mcp/src/lib/bridge.ts:14` — `const SESSION_COOKIE = "brimba_session" // auth's
  cookie name (sessions.ts)`. A hand-copied duplicate, with a comment that knows it is one.
  Rename auth's and not this, and **every MCP tool call** mints a cookie auth will not
  accept — the whole external machine surface fails as an auth error.
- `shared/workers/rate-limit.ts:69` — the `callerKey` regex. Unswept, rate limiting for
  signed-in users silently degrades from per-session to per-IP. Nothing tests this.
- `workers/gateway/src/index.ts:156` — the cheap pre-check before the beacon verifies with
  auth. Unswept, **client error reporting silently stops** for every signed-in user.

**Why it matters.** All three failures are silent and none is in the sweep list. The
rate-limit copy is even *protected* by a test (`workers/gateway/test/rate-limit.test.ts:36`
asserts `brimba_session=`), so the leak stays green forever.

**Fix.** Export the cookie name once from `shared/workers/` — it already sits beside
`ORIGIN_HEADER` in `shared/workers/activity.ts` — and have auth, the gateway, the rate
limiter and the mcp bridge import it. That collapses four sweep sites to one and removes
three silent-failure modes.

### HIGH · 3 · The documented sweep, followed exactly, turns `npm run check` red — and the procedure claims it will be green

`new-app` §2 ends: "Then `npm run check` again — green before any deploy." Following the
sweep as written breaks six assertions in two test files the sweep never names:

- `workers/mcp/test/catalog.test.ts:94` — `expect(s1).toMatch(/^brimba_mcp_[0-9a-f]{64}$/)`,
  calling the real `newTokenSecret()` from `workers/mcp/src/lib/tokens.ts:30`, which the
  sweep tells you to rename.
- `web/test/use-form-draft.test.ts:37,54,55,58,59` — five literal `"brimba:draft:"` keys
  against the real `PREFIX` at `web/lib/use-form-draft.ts:19`, which the sweep lists as
  "Optional/cosmetic". It is not optional: doing it goes red, skipping it keeps the prefix.

**Why it matters.** This is the fork's one pre-deploy gate, and it is wrong in the
direction that erodes trust — the operator either concludes the base is broken or learns
to ignore a red check. *(Verified by reading both tests and both sources; not by running
them, since this review is read-only.)*

**Fix.** Either read the prefix from the module under test in both files, or add both test
files to the sweep list. Reading from the module is better — it makes the tests
fork-proof instead of fork-blocking.

### MEDIUM · 4 · The assistant introduces itself by the base's name, and `brand.ts` cannot reach it

`workers/data-ops/src/lib/agent.ts:42`: `"You are Brimba's assistant — a calm, friendly
helper for the user's team…"`. The same worker already imports the brand seam
(`workers/data-ops/src/index.ts:22`) and uses `brand.name` in an error message at `:127`.
`shared/brand.ts:12` tells a forker "Edit ONLY this file (and drop in a logo)" — and this
string, the first thing a user of the fork reads from their own AI assistant, is not
covered. It is absent from the sweep list too.

**Fix.** One line: import `brand` in `agent.ts` and interpolate `${brand.name}'s
assistant` into the module-level `SYSTEM` array, exactly as `GLOSSARY` is already
interpolated at `:60`. Does not disturb R9 (`agent-app-parity`), which asserts the
capability brief, not the greeting.

### MEDIUM · 5 · The MCP surface is branded past the brand seam, in three places

`workers/mcp/src/index.ts:68` (`serverInfo: { name: "brimba-mcp" }`), `:70` (the
`instructions` string that begins "Brimba's machine surface"), and
`workers/mcp/src/lib/tokens.ts:30` (the `brimba_mcp_` token prefix, which every real token
in a fork would carry). The mcp worker does not import `shared/brand.ts` at all. The
sweep names the first and third but not the second.

**Fix.** Import the brand seam in the mcp worker and derive all three from `brand.name`.

### MEDIUM · 6 · There is no script and no check for the fork sweep — 25 Laws, none about whether the base is still a base

`forkability.scripts` = 0. The `scripts/` directory has six scripts, none of which rename
anything. All 25 Laws in `shared/rules/registry.ts` govern how a *module* behaves; none
governs whether product identity is confined to a seam. That is exactly why the sweep list
drifted: it is prose, in a skill, outside the repo, with nothing red when it goes stale.

**Fix (two parts, and the second is the one that lasts).** (a) `scripts/fork.mjs` — a
scripted sweep the `new-app` skill becomes a thin wrapper over, restoring
`SWIFT-STRUCK-WAY.md`'s own rule. (b) A Law R26 with a real check: product identity
resolves through `shared/brand.ts` (plus a reviewed, named exemption list for the wire
constants that must stay stable), so a new hardcoded product name turns the build red.
**Note the tension explicitly:** R26 is additive law + registry + check, which is exactly
what `lean_mean_review` penalises. It is proposed anyway because the alternative — prose
in a file outside the repo — is what produced findings 1 through 8.

### MEDIUM · 7 · Three stale counts in the day-zero runbook

- `BOOTSTRAP.md:96` and `:104` say core migrations are `0001`–`0013`. `db/core/` holds
  **17** (`0014_usage_log_kind`, `0015_scale_indexes`, `0016_channel_shards`,
  `0017_idempotency`). `new-app` §3.2 repeats "currently `0001`–`0013`".
- `BOOTSTRAP.md:111` says `TEAM_MIGRATIONS` is "`0001`…`0006` today".
  `workers/tenancy/src/team-schema.ts` declares **8** (through `0008_activity_origin`).
- `OPERATIONS.md:257` tells a fork to apply `db/ops/0001_operations.sql` only;
  `0002_error_request_id.sql` also exists.

The migration commands themselves are range-free (`wrangler d1 migrations apply` applies
what is on disk), so 1 and 2 mislead rather than break. The third is a literal
`--file` command and **does** leave a column missing.

**Fix.** Replace the counts with "everything in `db/core/`" and "every version in
`TEAM_MIGRATIONS`", and make the ops line a loop over `db/ops/*.sql`. A number that must
be hand-maintained will go stale again.

### LOW · 8 · The sweep list names a file that no longer carries a prefix, and misses two that do

`new-app` §2 lists the `brimba:` storage prefixes as living in `web/lib/use-form-draft.ts`,
**`web/lib/agent-trace.ts`** and `web/lib/use-agent-chat.tsx`. `web/lib/agent-trace.ts`
exists but contains **no** `brimba` string. The two that do are unlisted:
`web/lib/screen-trace.tsx:21-22` (two event names) and `web/lib/agent-open.ts:16`.

**Fix.** Correct the three filenames; better, derive the prefix from one exported constant.

### LOW · 9 · The MCP worker ships the author's Cloudflare account id and never reads it

`workers/mcp/wrangler.jsonc:31,53` set `CF_ACCOUNT_ID = "af3f1bf82aa34512f4f6630091358439"`
and `workers/mcp/src/env.ts:9` declares it — but the mcp worker calls no `d1Query`, no
`d1ExecScript`, no `d1ConfigFrom`, and has no `CF_D1_TOKEN`; it reaches team data only
through the bridge and `forwardTool`. **I initially scored this as a cross-tenant trap and
refuted it:** the var is inert. What remains is the author's real account identifier
shipped into every fork as dead config, and a fourth worker missing from a documented
three-worker instruction (`BOOTSTRAP.md:154`, `new-app` §3.1 both say tenancy + content +
data-ops).

**Fix.** Delete the var and the Env field from mcp, or add mcp to the documented list.
Deleting is better and is `dead_end_review`'s territory too.

### LOW · 10 · Two more base hosts hardcoded outside the sweep

`web/playwright.config.ts:10` and `web/components/access-tokens.tsx:49` both fall back to
`brimba*.swift-struck.workers.dev`. `new-app` §2 has an excellent paragraph about exactly
this trap ("a `brimba-` prefix rename alone MISSES `brimba.` with a dot") and names five
documents — but not these two source files. The access-tokens one is user-visible: the
connect prompt a fork's developer copies says "Connect to my **Brimba** workspace".

**Fix.** Sweep both; make the access-tokens copy read `brand.name`.

### LOW · 11 · A fork has no route back to the base

`new-app` step 1: "Re-point git: **remove the brimba `origin`**." Nothing then adds the
base as `upstream`. `BASE-IMPROVEMENTS.md` deliberately lands each fix as its own
cherry-pickable commit — a genuinely good mechanism with no remote to cherry-pick from.

**Fix.** One line in `new-app` step 4: `git remote add upstream
https://github.com/alaap-swift-struck/brimba`. That single change makes criterion 5
measurable on every future fork instead of unmeasured.

### LOW · 12 · Blueprint generator and dev config carry base identity

`scripts/build-blueprint.mjs:161-163,211,216,226,230,254` keys its descriptions off the
literal strings `brimba-media`, `brimba-learning-media`, `brimba-help-media`,
`brimba-core`, `brimba-ops` — so a fork's generated architecture blueprint loses every
storage and database description and is titled "Brimba". `.claude/launch.json:5` and
`scripts/move-to-ops.mjs` also carry the name. None is in the sweep.

**Fix.** Derive the prefix from `package.json`'s name in `build-blueprint.mjs`; sweep the
other two.

### INFORMATIONAL · 13 · One acrymold mention, and it is fine

`scripts/reset-all.mjs:10` names acrymold as an example of another project in the account.
It is a comment, it explains a real safety property (the reset only touches databases the
`teams` table points at), and no different product would be harmed by it. Scored as the
rubric's minor and named here so nobody "fixes" it into something less clear. Worth noting
it sits slightly against `SWIFT-STRUCK-WAY.md`'s "one cloud account per product" — a
`story_checks_out_review` question, not a leak.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| 1 · Add the ops database to the fork runbook | `BOOTSTRAP.md` §2, `new-app` SKILL.md §3.1 | ADDS ~12 lines of runbook + 5 binding-repoint instructions | `story_checks_out_review` — `OPERATIONS.md:246-262` already documents this; a second copy is a new drift surface unless §2 links to it rather than restating it |
| 2 · One exported `SESSION_COOKIE`, imported by four callers | `shared/workers/activity.ts` (or a new export), `workers/auth/src/lib/sessions.ts`, `shared/workers/rate-limit.ts`, `workers/gateway/src/index.ts`, `workers/mcp/src/lib/bridge.ts` | REMOVES 3 duplicate literals, ADDS 4 imports; net −3 lines | `architecture_review` — adds a shared→gateway/mcp import edge where each worker was previously self-contained on this constant. Small, and it points the correct direction (shared is already imported by all four), but it is real added coupling |
| 3 · Make the two identity tests read their prefix from the module | `workers/mcp/test/catalog.test.ts`, `web/test/use-form-draft.test.ts` | REMOVES 6 hardcoded literals, ADDS 2 imports | `security_sentry_review` — the mcp test currently pins the *exact* token shape (`^brimba_mcp_[0-9a-f]{64}$`). Deriving the prefix must keep asserting the 64-hex entropy, or a real entropy regression could slip through |
| 4 · Agent greeting reads `brand.name` | `workers/data-ops/src/lib/agent.ts` | ADDS 1 import, changes 1 string | none — `SYSTEM` is already a module-level array that interpolates `GLOSSARY`; R9 asserts the capability brief, not the greeting |
| 5 · MCP identity reads `brand.name` | `workers/mcp/src/index.ts`, `workers/mcp/src/lib/tokens.ts` | ADDS 1 import to a worker that has none | `security_sentry_review` — changing the live token prefix would invalidate every issued token; this must apply to *new* forks only, never as a migration on a running base. Recommend the prefix stay `brimba_mcp_` on this repo and only the fork script rewrite it |
| 6a · `scripts/fork.mjs` — script the sweep | new `scripts/fork.mjs`, `new-app` SKILL.md §2 | ADDS ~120 lines of script; REMOVES a 30-line prose list from outside the repo | `lean_mean_review` — direct hit, ~120 new lines. Defensible because it deletes an out-of-repo dependency `SWIFT-STRUCK-WAY.md` forbids, but it *is* more code |
| 6b · Law R26 — identity resolves through one seam | `RULES.md`, `shared/rules/registry.ts`, `web/test/rules.test.ts` | ADDS a law row, a registry entry, a source-scan check and an exemption list | `lean_mean_review` — a 26th law and a 26th check is more code and more ceremony. Also `speed_review` marginally: `npm run check` gains one more full source scan. Weigh against: nothing else stops finding 8 recurring |
| 7 · Replace hand-maintained migration counts with "everything on disk" | `BOOTSTRAP.md:96,104,111`, `OPERATIONS.md:257`, `new-app` §3.2 | REMOVES 4 numbers that must be hand-maintained | none — strictly removes a drift surface |
| 8 · Correct the storage-prefix filenames | `new-app` SKILL.md §2 | Corrects 1 filename, ADDS 2 | none — documentation accuracy only |
| 9 · Delete the dead `CF_ACCOUNT_ID` from mcp | `workers/mcp/wrangler.jsonc`, `workers/mcp/src/env.ts` | REMOVES 2 config lines + 1 type field | `dead_end_review` — this is *their* finding; coordinate so it is fixed once, not twice. Slight risk if mcp later needs the D1 REST door, but it would need `CF_D1_TOKEN` too, so the var alone was never sufficient |
| 10 · Sweep the two remaining hosts; access-tokens copy reads `brand.name` | `web/playwright.config.ts`, `web/components/access-tokens.tsx` | ADDS 1 import; changes 2 literals | none — `access-tokens.tsx` is surface layer and already client-only |
| 11 · `git remote add upstream` in the fork procedure | `new-app` SKILL.md §4, `BASE-MANUAL.md` §5 | ADDS 1 command | none — makes criterion 5 measurable on every future fork at zero code cost |
| 12 · Derive the prefix in `build-blueprint.mjs` | `scripts/build-blueprint.mjs`, `.claude/launch.json`, `scripts/move-to-ops.mjs` | REMOVES ~8 hardcoded keys, ADDS 1 derivation | none — a generator script, not a request path |

**Two tensions worth stating outright rather than burying in the table.** First, fixes 6a
and 6b are the only ones that make this review's findings *stay* fixed, and both cost
`lean_mean_review` real points — roughly 120 script lines plus a law, a registry entry and
a check. Every other fix here is a patch on a surface that has already drifted twice.
Second, fix 2 is a net *reduction* in code that a naive coupling metric will read as a
regression: `architecture_review` will see a new shared-module edge into the gateway and
mcp. It is the right trade — three silent failure modes for one import — but it should be
argued, not slipped through.

---

## CEILING

**95 is reachable by changing code, but not by very much margin, and not on every
criterion.** Recomputing with all twelve fixes applied and nothing else changed:

- Criterion 1 (97) — the remaining 3 points are a comment that *should* stay. Effective
  ceiling **97**.
- Criterion 2 (97) — the remaining 3 points require a module off-switch, which means making
  Learning and Help optional across `TEAM_MIGRATIONS`, the nav registries, `MODULE_SHELLS`,
  the import catalog and the permission set. That is a migration affecting every existing
  fork, which the skill classes as **Tier 3, never do without the owner**. Effective
  ceiling without an owner decision: **97**.
- Criterion 3 (58 → ~90), 4 (47 → ~90), 7 (44 → ~92), 9 (67 → ~95) — all reachable by the
  fixes above. Criterion 4's 25-point sweep-script line and criterion 7's "someone has
  confirmed it" line both require *doing* something, not documenting it.
- **Criterion 5 is the hard cap and no commit fully lifts it.** 40 of its 100 points ask
  whether an `upstream` remote exists — structurally unmeasurable *on the base itself*,
  since a base has no upstream. Fix 11 makes it measurable on future forks but cannot make
  it measurable here. This criterion's true ceiling in BASE mode is the 60 measurable
  points, i.e. **100 of 60 → reported as 100** if fix 11 lands and a fork-drift convention
  is documented, but it can never be *directly verified* from this repository.

With fixes 1–12 landed and criterion 5 scored at its measurable maximum, the arithmetic
gives roughly `(97×15 + 97×14 + 90×13 + 90×12 + 100×11 + 100×10 + 92×8 + 92×8 + 95×5 +
100×4) / 100` ≈ **95.6**. So **95 is reachable**, but only if the sweep is actually
scripted (fix 6a) and a law guards it (fix 6b) — the two most expensive fixes, and the two
a lean-mean review will argue against. Documentation-only fixes top out around **86**.

Nothing here is capped by a locked decision in `ARCHITECTURE.md`, by a platform limit, or
by single authorship. The one owner-gated item is the module off-switch (criterion 2, 3
points), and it is not needed to reach 95.

---

## Verdict

**The base is still a base.** Zero client-shaped tables, zero tenant branching in shared
code, one `acrymold` mention and it is a comment, a real branding seam consumed by twelve
files, a concrete and machine-checked module seam, and — the strongest evidence of all —
two rounds of fork findings ported *back into the base* and turned into ten enforced Laws.
Acrymold has not leaked into Brimba.

**The single worst leak is the base leaking into its own forks, not a client leaking into
the base:** the fork procedure lives as prose in a skill outside the repository, nothing
red guards it, and it has drifted to the point where following it exactly leaves a fork
with no operations database, a broken MCP surface, an assistant that calls itself Brimba,
and a red `npm run check` the procedure promises will be green.
