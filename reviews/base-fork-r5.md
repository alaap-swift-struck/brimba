# Base fork review — round 5 — Brimba · 2026-08-25

SCORE: **83/100** (round 1: 77 · round 2: 78 · round 3: 83 · **round 5: 83**)

**Mode: BASE.** The bare probe returns `inferenceFailed: true` (`clientTokens: []`,
`upstream: null`, `mode: "this looks like the base itself"`), so per the skill's hard rule I
re-ran it as `--base brimba --client acrymold` before scoring criteria 1, 2 and 6. Same
convention as rounds 1–3, restated so the four numbers compare: **the base's own name in
foundation code is not a client leak** — Brimba is not a client of itself. What the base's
identity costs a fork is priced in criteria 3, 4, 7 and 9, where forkability actually lives.

> **Measured at `f30f954` (branch `review-round5`), 2026-08-25 19:00–19:15 UTC.** I wrote none
> of these repairs. The repository was not modified — this file is the only thing I wrote.
> `npm run check` was not run (instructed); everything below is read off source, off the
> probe, or off commands I ran in a scratch directory.

**The worst leak, in one sentence:** *the app's identity is still eleven string literals in
code rather than one value read from `shared/brand.ts` — the sweep rewrites all of them
reliably, which is why the outcome is right and the criterion is still wrong, and it is the
single change worth 10.5 of the 13 points between here and the ceiling.*

---

## The two arithmetic decisions, settled from the rubric text

### 1 · Criterion 5 is UNMEASURED, and its weight leaves the denominator

`assets/rubric.md`, criterion 5, verbatim:

> **If `identity.upstream` is null, this criterion is unmeasured, not zero.** Say so, and
> score it as unmeasured rather than inventing a number.

`identity.upstream` is null (verified: `git remote` returns one line, `origin`). So the
criterion is unmeasured, and its weight comes out of the denominator — which is what the
rubric's own formula requires, since it reads `total = round( Σ (criterion × weight) / Σ
weights )`, **not** `/ 100`. Σ weights becomes **89**.

**Round 3 scored it 67. That number cannot be produced by the rubric's table.** Criterion 5
has three rows worth 40, 30 and 30. The complete set of reachable scores is therefore
{0, 30, 40, 60, 70, 100} — and 67 is not in it. It was not a lenient reading or a partial
credit; it was a number with no derivation, exactly as the round-5 brief suspected. I have
not adopted it.

The consequence is not cosmetic. It is the difference between a review with a permanent
3.6-point tax it can never pay off and a review that can reach 95:

| | Σ weights | ceiling |
|---|---|---|
| criterion 5 scored 67 (round 3) | 100 | **93** |
| criterion 5 unmeasured (rubric) | 89 | **96** |

### 2 · Coverage rows are scored WHOLE, on substance — not part-marks

The rubric says `COVERAGE: criterion = sum of points earned from its table`. A row is a
universally-quantified claim ("*every* client-varying value comes from config"), so it is
earned or it is not; part-marks inside a row are an opinion that nobody else can recompute,
and the whole point of this round is to stop those. I judge each row on **substance** rather
than on a literal string test, and say which way and why every time.

**This differs from rounds 1–3, which awarded part-marks.** Worse, round 3's criterion 3 was
scored against a four-row table of **30 / 30 / 25 / 15** — a table the rubric does not
contain (the real one is **35 / 25 / 20 / 20**). Both readings are reported below so the
movement can be split into *code changed* and *method changed*.

---

## Arithmetic

```
DEFECT    = clamp(0, 100, 100 − Σ penalties)     critical 30 · high 15 · medium 7 · minor 3
COVERAGE  = sum of the point-table rows EARNED
total     = round( Σ (criterion × weight) / Σ weights )
GATE      = criterion 1 below 40 caps the total at 45 — did NOT fire (100)
```

| # | criterion | method | score | weight | weighted |
|---|---|---|---|---|---|
| 1 | No client name in the foundation | defect | **100** | 15 | 1500 |
| 2 | No client-shaped table/column/module | defect | **97** | 14 | 1358 |
| 3 | Client differences live in config, not code | coverage | **40** | 13 | 520 |
| 4 | A fresh fork stands up unattended | coverage | **100** | 12 | 1200 |
| 5 | Base and fork have not silently diverged | coverage | **UNMEASURED** | ~~11~~ | — |
| 6 | Nothing assumes one client's data shape | defect | **100** | 10 | 1000 |
| 7 | Branding lives in one place | coverage | **40** | 8 | 320 |
| 8 | Client-specific rules sit behind a seam | coverage | **100** | 8 | 800 |
| 9 | The fork procedure is documented and current | coverage | **65** | 5 | 325 |
| 10 | Someone has actually forked it recently | coverage | **100** | 4 | 400 |
| | | | | **89** | **7423** |

**7423 ÷ 89 = 83.40 → 83.**

### The layer split — never publish the raw total

| layer | hits for the client token `acrymold` | scored? |
|---|---|---|
| renamed-by-design (wrangler, package.json, README) | 0 | no |
| surface (`web/`, `public/`) | 0 | no |
| **foundation** (`shared/`, `db/`, `workers/`, `scripts/`) | **0** | **yes** |
| other (`reviews/` — this campaign's own reports) | 6 | no |

Zero foundation client leaks. Round 3's single minor — a comment at `scripts/reset-all.mjs:10`
naming acrymold as an example of another project in the account — **is gone**; the line now
reads "never touches databases belonging to other projects in the same Cloudflare account"
with no client named. That is a real code change and it takes criterion 1 to 100.

### Per-row working, so every number above is recomputable

**Criterion 1 · defect · 100.** Repo-wide `grep -ri acrymold` over `shared workers db scripts
web` returns nothing. No penalty of any severity applies.

**Criterion 2 · defect · 97.** `clientTables` = 0. Every table in the base schema — learning,
learning_progress, help, help_threads, help_stakeholders, member_roles, role_permissions,
invite_logs, selectable_data, activity, agent_threads, agent_messages, data_import_* — is one
a different product wants. One **minor (−3)**: `screens` remains in the team schema after the
screen-override subsystem was deleted on 2026-08-25. `CATALOG_EXEMPT` documents why (migrations
are append-only), and the honest reading is that no other product wants a dead table. Removing
it is Tier 3 — a migration affecting every fork.

**Criterion 3 · coverage · 40.**

| pts | row | earned | why |
|---:|---|---|---|
| 35 | every client-varying value comes from config or environment, not a literal | **no** | Eleven identity literals in code. Foundation: `SESSION_COOKIE = "brimba_session"` (`workers/auth/src/lib/sessions.ts:6`), the same string again at `workers/mcp/src/lib/bridge.ts:14` and `workers/gateway/src/index.ts:271`, the cookie regex at `shared/workers/rate-limit.ts:73`, `ORIGIN_HEADER = "x-brimba-origin"` (`shared/workers/activity.ts:147`), the token prefix `brimba_mcp_` (`workers/mcp/src/lib/tokens.ts:30`), and the MCP `instructions` string `"Brimba's machine surface…"` (`workers/mcp/src/index.ts:75`). Web: `brimba:draft:`, `brimba:agent:open`, `brimba:agent-trace`, `brimba:agent:lastThread:`. The sweep rewrites all of them — but "swept reliably" is not "read from config", and this row asks the second question |
| 25 | no email address, domain or account id is hardcoded in the foundation | **no** | 24 `database_id` + 8 `CF_ACCOUNT_ID` across seven `wrangler.jsonc` files; `*.swift-struck.workers.dev` in eight shipped non-doc files; `delivered@resend.dev` in `scripts/smoke-staging.mjs:11` and `scripts/timings.mjs:58`. The ids are blanked at fork time and the hosts are all registered — mitigation, not absence |
| 20 | there is one obvious place a new fork edits, and it is documented | **yes** | `shared/brand.ts:12` — "Reusing this base for a new app? Edit ONLY this file (and drop in a logo)" — and BASE-MANUAL §5 + BOOTSTRAP §2/§4 name what to fill |
| 20 | defaults exist, so a fork boots before every value is filled in | **yes** | The blanked ids make the *deploy* fail loudly rather than write into the base's own databases, which is the correct failure; `npm install && npm run check` is green with nothing filled in |

Round 3 scored this 75 against a 30/30/25/15 table that is not in the rubric. Against the
rubric's own 35/25/20/20 table the answer is **40**.

**Criterion 4 · coverage · 100.** All four rows earned, and I ran the thing rather than
reading about it (below). Round 3's blocker — the `/new-app` skill teaching a hand-written
list and the opposite instruction about the ids — is **closed**: the skill was rewritten on
2026-08-25 21:12 and now reads `## 2 · The fork sweep — ONE COMMAND` / `npm run fork <name>`,
with the blanking behaviour stated correctly at its lines 113–115.

| pts | row | earned | why |
|---:|---|---|---|
| 35 | a documented, scripted path from clone to running | **yes** | README:66-77 → `npm run fork` → BASE-MANUAL §5 → BOOTSTRAP end-to-end; `/new-app` is now a wrapper over the script rather than a rival to it |
| 25 | the rename sweep is a script, not a list of manual edits | **yes** | `scripts/fork.mjs`, `npm run fork`, derives its subject by scanning, guarded by R26 |
| 20 | no step requires a value only the original author knows | **yes** | Ids blanked; icons generated from `brand.name`; secrets listed by name in `.dev.vars.example` |
| 20 | the fork verifies itself at the end — a smoke test, not a hopeful message | **yes** | `scripts/fork.mjs:141` **runs** `npm run check` and adopts its exit code, printing GREEN or RED. Round 3 measured this as a printed `next:` line; it is now an executed gate |

**Criterion 6 · defect · 100.** `grep -nE "team_?[Ii]d\s*===\s*[\"']|slug\s*===\s*[\"']"` over
`shared/` and all seven workers, tests excluded: zero. No shared function branches on a tenant
id or a client name.

**Criterion 7 · coverage · 40.**

| pts | row | earned | why |
|---:|---|---|---|
| 40 | name, logo, colours and copy come from one config or theme | **yes — newly** | `shared/brand.ts` now feeds login and invite emails, the error digest, three workers' 503 copy, the agent's SYSTEM prompt (`agent.ts:42` — `You are ${brand.name}'s assistant`), the MCP `serverInfo` (`${brandSlug}-mcp`), the manifest's name, description, `background_color` **and** `theme_color` — and, for the first time, the **logo**: `scripts/gen-icons.mjs` derives the monogram from `brand.name` and the gradient from `brand.accentHex.primary`. Before this round the logo was four committed binaries and a hand-drawn `B`, so this row was failing |
| 30 | no product name is compiled into a component | **no** | `workers/mcp/src/index.ts:75` ships `"Brimba's machine surface. …"` as a literal — three lines below a comment reading *"From the ONE brand file (shared/brand.ts), not a second copy of the name"*. Plus four `brimba:` storage/event prefixes in `web/lib/`, and `web/components/access-tokens.tsx:56,65,197` ("Connect to my **Brimba** workspace", the `"brimba":` server key, `brimba_mcp_YOUR_TOKEN`) |
| 30 | changing the brand is one edit, and someone has confirmed that | **no** | `brand.ts` says "Edit ONLY this file". Editing only that file leaves the cookie name, the token prefix, four storage prefixes, the MCP instructions and the access-token snippet on the old name. The one-command path is `npm run fork`, which is a different promise. Nobody has confirmed a brand-only edit |

Round 3 also scored 40 — but by part-marks across different rows. Under the rubric's table the
icon repair is precisely what moved row 1 from failing to earned; the number is coincidentally
unchanged and the underlying position is materially better.

**Criterion 8 · coverage · 100.** The base has no client-specific behaviour to hide, and every
axis of per-product difference is a registry rather than an `if`: `shared/rules/registry.ts`
(`CATALOG_EXEMPT`, `ACTIVITY_GATE_MAP`, `GROWING_COLLECTIONS`, `FORK_SWEEP_EXEMPT`),
`shared/glossary.ts`, `shared/team-modules.ts`, `web/lib/screens.ts` (screens as data),
`workers/data-ops/src/lib/targets.ts`. Row 3 ("adding a second client's rules would not touch
the foundation") is earned on the reading that a *registry line* is the seam, not a breach of
it — row 1 explicitly contemplates the seam being "a plugin, a module or an override", so
reading row 3 to forbid registry edits would make the two rows contradict.
**Alternative reading, printed so you can recompute:** if registry edits count as touching the
foundation, criterion 8 = 70 and the total is 81.

Round 3 scored 90, docking part-marks for three hand-maintained worker lists. That is a real
defect (LOW 4 below) but no row in this criterion prices it.

**Criterion 9 · coverage · 65.**

| pts | row | earned | why |
|---:|---|---|---|
| 40 | a fork or bootstrap document exists | **yes** | BOOTSTRAP.md is a ten-section day-zero runbook; BASE-MANUAL §5; the rewritten `/new-app` |
| 35 | it matches what the scripts actually do today | **no** | Three live mismatches. (a) **Eight `FORK_SWEEP_EXEMPT` reasons — printed to the forker's terminal by `fork.mjs` at the end of every run — say "Repoint to the fork's own account (BOOTSTRAP.md §2)", and BOOTSTRAP §2 has no such step.** Its only host instruction is at line 188-189 and names the `auth` worker alone. (b) `/new-app` SKILL.md:142 says core migrations `0001`–`0013`; nineteen exist and BOOTSTRAP says `0001…0019`. (c) the skill's step 3 never mentions the OPS database that BOOTSTRAP calls "do not skip this" and six workers bind |
| 25 | it names what to change and what to leave alone | **yes** | BOOTSTRAP §2's "CRITICAL — the checked-in ids are the ORIGINAL author's, overwrite them", §4's `CF_ACCOUNT_ID`, and the twelve-item register the script prints |

**Criterion 10 · coverage · 100.** Both rows earned. `reviews/LEDGER.md:856` records a fresh
clone → `node scripts/fork.mjs acrymold` → install → check, exit 0, dated 2026-08-25 (commit
`520b0cb`) — and `a063702` records the *earlier* rehearsal that went RED on the UI-library pin,
with the fix landing **in the base** (the root dependency removed, R26 gaining a manifest and
lockfile assertion). That second row — "anything that broke during it was fixed in the base,
not only in the fork" — is exactly what happened.

---

## I ran the fork rather than reading about it

The claim under test was: a real end-to-end fork was run — clone → `fork.mjs` → install →
gate, exit 0, zero mentions of the old name left. The repository's evidence for it is
`reviews/LEDGER.md:856`, one table row, added by a documentation-only commit, with **no
recorded method for the zero-mentions half**. So I ran my own, at HEAD, in a scratch clone.

```
$ git clone --branch review-round5 https://github.com/alaap-swift-struck/brimba.git
$ node scripts/fork.mjs --dry-run acme --display "Acme"
would sweep 163 files · 839 × "brimba" → "acme" (Brimba → Acme)
would blank 32 account-scoped ids in wrangler.jsonc — BOOTSTRAP.md §2 fills them
would then redraw the icons from the new brand, and run the gate (npm run check)

$ node scripts/fork.mjs acme --display "Acme"
swept 163 files · 839 × "brimba" → "acme" (Brimba → Acme)
blanked 32 account-scoped ids in wrangler.jsonc

$ grep -ril brimba . | grep -v '^./.git/' | wc -l
0
```

**Zero, across the whole tree including `reviews/`.** The 32 blanked ids are visible in the
result (`workers/auth/wrangler.jsonc:18,22,43,47` → `"database_id": ""`). The sweep is
textually complete and I can now say so from having done it, not from a table row.

I also verified the icon generator against the committed assets. Copying the two source SVGs
and `shared/brand.ts` into a scratch tree and running `scripts/gen-icons.mjs` produced all six
files **byte-identical** to what is committed:

```
MATCH icon.svg · icon-maskable.svg · icon-192.png · icon-512.png
      icon-maskable-512.png · apple-touch-icon.png      (sha256, 6/6)
```

That settles the "latent drift" story. The pre-round generator (`git show ffeddd9`) composited
each mark at `LOGO_SAFE_RATIO = 0.76` onto `background: { alpha: 0 }` — a transparent square.
The committed maskable icon and apple-touch icon are opaque teal to the corner
(`px(0,0) = [16,183,155,255]`). So the generator had genuinely drifted from the assets and
would have shipped transparent-margin icons to every fork the moment anyone ran it. That is
fixed, the reason is written into the file at lines 105–113, and the fix is now provably in
sync with what is on disk.

`FORK_SWEEP_EXEMPT` was `{}` and asserted nothing. It now holds **12 entries** — four generated
binaries, eight account-scoped hosts — each with a reason the script prints. The claim of
three new checks is right in substance: `web/test/fork.test.ts` gained the binary scan (:88),
the account-host scan (:107) and the rot-in-reverse scan (:130), plus a joint anti-vacuity
guard (:148). I re-implemented all of them out of tree and confirmed they are **not vacuous**:
4 committed binaries sit outside the sweep's reach and are found, and the host scan finds real
files. Reach 479, shipped 487, files carrying the identity 163, unregistered misses 0.

---

## Findings

### HIGH · 1 · The identity is eleven literals in code, and one of them sits three lines under a comment denying it
`workers/mcp/src/index.ts:75` · `workers/auth/src/lib/sessions.ts:6` ·
`workers/mcp/src/lib/bridge.ts:14` · `workers/gateway/src/index.ts:271` ·
`shared/workers/rate-limit.ts:73` · `shared/workers/activity.ts:147` ·
`workers/mcp/src/lib/tokens.ts:30` · `web/lib/{use-form-draft,agent-open,screen-trace,use-agent-chat}` ·
`web/components/access-tokens.tsx:56,65,197`

This is the review. It costs **criterion 3's 35-point row and criterion 7's two 30-point rows
— 5.1 + 5.4 = 10.5 of the 13 points between 83 and the ceiling**, and it is one seam, not
eleven fixes.

The MCP surface makes the point better than I can. `index.ts:69-70` carries the comment
*"From the ONE brand file (shared/brand.ts), not a second copy of the name"*, `:74` correctly
computes `serverInfo: { name: \`${brandSlug}-mcp\` }` — and `:75` immediately hardcodes
`"Brimba's machine surface."` in the very next field of the very same object.

`brandSlug` already exists in `shared/brand.ts:71` and already documents itself as the derived
form the sweep agrees with. Every literal above is `brandSlug` or `brand.name` with an import.

**The fix.** Read `brandSlug` for the cookie name (one export in `sessions.ts`, imported by
the other three), the origin header, the token prefix and the four web storage prefixes; read
`brand.name` for the MCP instructions and the access-token snippet. Then add the row-3 proof:
change `brand.ts` alone, and check that nothing anywhere still says the old name.

### HIGH · 2 · Eight registered exemptions send the forker to a step that does not exist · **STANDS from round 3, now with a dangling pointer**
`shared/rules/registry.ts:361-368` · `BOOTSTRAP.md` §2 (lines 73-141)

Round 3 filed the account-subdomain leak as MEDIUM 3 and proposed BOOTSTRAP §2 fill the host
the way it fills the ids. That did not happen — but the exemption register *was* written as
though it had. Eight of the twelve entries end "Repoint to the fork's own account
(**BOOTSTRAP.md §2**)", and `scripts/fork.mjs:131` prints all of them at the end of every fork.
BOOTSTRAP §2 contains zero mentions of `workers.dev`, of a subdomain, or of a host.

The nearest thing is `BOOTSTRAP.md:188-189`, which names **only** the `auth` worker's
`APP_ORIGIN`/`EMAIL_FROM`. So an unedited fork ships:

- `scripts/smoke-staging.mjs:8` — a smoke test whose default target is **the author's staging app**
- `web/e2e/live-sync.spec.ts:43-44` — an e2e suite that asserts against **the author's production host**
- `web/components/access-tokens.tsx:54` — a connection snippet handing **the fork's own users** the author's production URL
- `web/playwright.config.ts:10`, `scripts/timings.mjs:29-30`, two `wrangler.jsonc` route blocks

And a further eight `.md` files carry the host unregistered, deliberately: `fork.test.ts:71`
excludes `.md` because "prose naming the host is documentation drift, not a fork hazard". That
carve-out is right for README. It is wrong for **`MCP.md` and `mcp-quickstart.md`**, which are
not prose — they are `curl` commands and MCP client JSON that a fork's own developers copy and
paste, and after a sweep they read `acme.swift-struck.workers.dev`: a host that looks correct,
carries the fork's name, and belongs to somebody else.

**The fix.** Add the host step to BOOTSTRAP §2 (the pointer already exists; only the
destination is missing), and either take a `--host` argument in `fork.mjs` or write
`<your-account>.workers.dev` in the two copy-paste documents.

### MEDIUM · 3 · Fork before install and the icons silently keep the old letter — the exact outcome the repair was written to prevent · **NEW**
`scripts/fork.mjs:123-125` · `scripts/gen-icons.mjs:17` · `BASE-MANUAL.md:483`

`gen-icons.mjs` imports `sharp`, which by its own comment "is not a project dependency — it
arrives with Next as an optional one". `fork.mjs` runs it as its final step and treats failure
as a warning:

```js
const icons = spawnSync("node", [join(ROOT, "scripts/gen-icons.mjs")], …)
if (icons.status !== 0) console.log("! icons NOT redrawn — run `node scripts/gen-icons.mjs` once `npm install` has brought sharp in")
```

Observed, on a fresh clone, running the documented command:

```
swept 163 files · 839 × "brimba" → "acme"
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sharp'    ← raw stack trace, stdio: inherit
…12 register entries…
next: npm install && npm run check                            ← exit 0
```

The fork is left with `aria-label="Acme"` over a drawn glyph of **`B`** — quoted from
`gen-icons.mjs:7-9`, this is *"an icon that CLAIMS to be the new product while showing the old
one's letter, which is worse than not sweeping at all"*. The script's own recovery line is
true but buried under a Node stack trace and above twelve register entries, the exit code is
0, and **nothing later repairs it**: `npm install && npm run check` does not regenerate icons,
and R26 does not assert that the glyph matches `brand.name`.

`/new-app` orders it safely (clone :89 → install :92 → fork :102). `BASE-MANUAL.md:483` orders
it the other way — "`npm run fork <new-name>`, **then** `npm install && npm run check`" — and
is only saved by step 1 sending you through BOOTSTRAP, which installs at line 39.

**The fix, cheapest first.** (a) When `node_modules` is absent, make the closing line read
`next: npm install && node scripts/gen-icons.mjs && npm run check`. (b) Best: two lines in
R26 asserting each generated SVG's `<text>` glyph equals `[...brand.name][0].toUpperCase()` —
which would turn this state red instead of leaving it to a buried warning.

### LOW · 4 · Three hand-maintained worker lists · **STANDS**
`shared/rules/registry.ts:294` (`MUTATING_WORKERS`) ·
`workers/content/test/concurrency.test.ts:27` (`WORKERS_WITH_ROUTES`) ·
`scripts/build-blueprint.mjs` (the topology)

A fork that adds an eighth worker must find all three, and none derives itself from disk —
which is the exact fault class `shared/test/source.ts` was written to end, in the one place it
was not applied. Costs no row in criterion 8, and it is still true.

### LOW · 5 · A fork has no route back to the base · **STANDS, third round running**
`~/.claude/skills/new-app/SKILL.md:96-97`

The skill still says to remove the `brimba` origin and adds nothing back. `git remote add
upstream` appears nowhere outside `reviews/`, where three consecutive rounds have proposed it.
Worth **zero on the base** — criterion 5 is unmeasurable here by definition — and it is what
makes criterion 5 measurable on every fork thereafter, for one line.

### INFORMATIONAL · 6 · `/new-app` still tells the owner to run `gen-icons` by hand
`SKILL.md:212`. Harmless where it sits (after install), and it is the only thing standing
between finding 3 and a fork with the wrong letter on its home screen. Keep it until R26 checks
the glyph.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** move the eleven identity literals behind `brandSlug` / `brand.name` (crit 3 +5.1, crit 7 +5.4) | `workers/auth/src/lib/sessions.ts`, `workers/mcp/src/{index,lib/bridge,lib/tokens}.ts`, `workers/gateway/src/index.ts`, `shared/workers/{activity,rate-limit}.ts`, 4 × `web/lib/*`, `web/components/access-tokens.tsx` | REMOVES 11 literals; ADDS 11 imports | **`interfacelessness_review`** — `serverInfo.name` is asserted by `scripts/smoke-staging.mjs`; the sweep renames that assertion today and a computed name must still match it. Change the smoke test in the same commit. **`security_sentry_review`** — the session cookie name becomes a computed value read by four files; verify the gateway's `cookie.includes(...)` and the rate limiter's regex still agree at build time, not at review time. **`round_trip_review`** neutral. **`lean_mean_review`** improves |
| **F2** add the deploy-host step to BOOTSTRAP §2, and `<your-account>` placeholders in MCP.md + mcp-quickstart.md (crit 9 +2.0) | `BOOTSTRAP.md`, `MCP.md`, `mcp-quickstart.md` | REMOVES a dangling pointer printed at every fork; REMOVES a plausible-but-wrong URL from two copy-paste docs | **`mac_fell_in_the_ocean_review`** — a placeholder is one more thing a rebuilder must fill in, but today's value is confidently wrong, so net positive. **`story_checks_out_review`** — check no runbook depends on the literal host |
| **F3** `next:` line includes `gen-icons`, and R26 asserts the SVG glyph matches `brand.name` | `scripts/fork.mjs` (1 line), `web/test/fork.test.ts` (~4 lines) | ADDS a check that can fail on a state nothing currently detects | **`first_run_review`** — the maskable icon is a PWA install criterion; the new assertion must not fire on a real logo that has legitimately replaced the monogram (the `MARK` sentinel already distinguishes them — reuse it, don't re-derive it). **`lean_mean_review`** neutral |
| **F4** correct `/new-app`'s migration range and add its OPS step (crit 9, part of the 35-row) | `~/.claude/skills/new-app/SKILL.md` | REMOVES two drifts | **none in this repository** — the file is outside it, which is the structural half of finding 2: `doc-facts.test.ts` machine-checks BOOTSTRAP's migration range against disk, which is exactly why BOOTSTRAP is right and the skill is wrong. No check here can reach it |
| **F5** derive `MUTATING_WORKERS` / `WORKERS_WITH_ROUTES` from `shared/test/source.ts` | `shared/rules/registry.ts`, `workers/content/test/concurrency.test.ts` | REMOVES two hand-lists | **every seam suite** — a derived list is wider than a hand-list, so expect newly-in-scope workers to fail checks that were silently skipping them. That is the point, and it is a bigger change than it looks. Land it alone |
| **F6** `git remote add upstream` in the fork procedure | `~/.claude/skills/new-app/SKILL.md`, `BASE-MANUAL.md` §5 | ADDS a measurable link between fork and base | none. **Worth 0 points here and up to 11 weight on every fork** |

---

## CEILING

**95 IS reachable, and the true maximum is 96.** That is entirely a consequence of answering
the criterion-5 question the way the rubric answers it; under round 3's invented 67 the same
repairs top out at 93.

Recomputed criterion by criterion, with the reason each cap is where it is:

```
1  → 100  already there
2  →  97  the last 3 need a dead table out of the base schema — a migration
          affecting every fork. Tier 3, owner's call, not a cleanup
3  →  75  STRUCTURAL CAP. The 25-point row ("no account id hardcoded in the
          foundation") is unreachable while the base is its own first deployed
          product: wrangler.jsonc MUST carry real database ids to deploy at all
4  → 100  already there
5  →   —  UNMEASURED. A base has no upstream, by definition
6  → 100  already there
7  → 100  F1, plus somebody confirming a brand-only edit
8  → 100  already there
9  → 100  F2 + F4. F4 lives outside the repository, so this is a process fix
10 → 100  already there

(100×15 + 97×14 + 75×13 + 100×12 + 100×10 + 100×8 + 100×8 + 100×5 + 100×4) ÷ 89
= (1500 + 1358 + 975 + 1200 + 1000 + 800 + 800 + 500 + 400) ÷ 89
= 8533 ÷ 89 = 95.87 → 96
```

**The path from 83 to 95, ranked by points per hour:**

| rank | change | criteria | points |
|---|---|---|---:|
| 1 | **F1** — eleven literals behind the brand seam | 3 (+35) and 7 (+60) | **+10.5** |
| 2 | **F2** — BOOTSTRAP §2 gains the step its pointers already promise | 9 (+35) | **+2.0** |
| 3 | F4 — the skill's two drifts (outside the repo) | 9, with F2 | included above |
| 4 | Tier 3 — drop `screens` from the base schema | 2 (+3) | +0.5 |

F1 alone takes it to **93.5 → 94**. F1 + F2 takes it to **95.5 → 96**, the ceiling. Neither is
a redesign: F1 is eleven imports and one confirmation, F2 is a paragraph in a runbook.

**Where 95 is NOT blocked:** nothing in this review is capped by a decision the owner has to
make, and nothing needs a migration except the last half-point.

---

## Things no rubric asked about

1. **`npm run check` now requires the network.** `web/test/fork.test.ts:214` resolves the UI
   library's tag with `execFileSync("git", ["ls-remote", "https://github.com/alaap-swift-struck/swift-struck-ui.git", …])`.
   I confirmed the failure mode: point git at an unreachable proxy and the call dies, and
   because it is `execFileSync` outside an assertion the whole suite errors. **A fork's
   pre-deploy gate therefore depends on a third party's GitHub repository staying reachable,
   public, and carrying tag `v0.16.0` — for ever.** It is the only network call in the entire
   test suite. The URL is also the author's, and the sweep does not touch `alaap-swift-struck`
   — so every fork of every fork keeps reaching into the original author's account to decide
   whether its own build is green.
   The fix that keeps the check honest without the dependency: pin the expected SHA as a
   literal beside the tag, and assert equality against the lockfile — same strength, no socket.
   Judged: **worth keeping the assertion, not worth the network.** This is a real regression in
   fork independence introduced by a correct fix to a different problem.

2. **A near-miss in the exemption register's own wording.** `FORK_SWEEP_EXEMPT`'s account-host
   entries are load-bearing prose printed to a human at fork time, and eight of them cite a
   destination that does not exist (finding 2). The rot-in-reverse check at
   `fork.test.ts:130` verifies that each entry still ships and still names a hazard — it
   cannot verify that the entry's *instruction* resolves. A register whose reasons are printed
   is documentation, and documentation this repo elsewhere machine-checks.

3. **`scripts/gen-icons.mjs`'s safe-circle maths is genuinely derived, and it is the best
   comment in the repository.** `GLYPH_MAX = SAFE_CIRCLE / Math.SQRT2` is checked before
   anything is written (`:83`), so the file cannot lie about the claim it makes. Worth copying
   as a pattern: a script that asserts its own invariant before producing output.

4. **The base got smaller again this round** — the screen-override subsystem is gone from the
   code, leaving only an append-only table and a documented exemption. A base becoming a base.

---

**The verdict, in one sentence:** the fork *mechanism* is now genuinely finished — one command,
sabotage-proven, self-verifying, and I ran it and found zero mentions of the old name anywhere
— and what is left is not a mechanism problem at all: eleven strings that should read from
`shared/brand.ts` and do not, and a runbook step that eight printed instructions already
promise exists.
