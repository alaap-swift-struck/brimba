# First-run review — round 2 — Brimba · 2026-08-25
SCORE: **62/100**   (round 1: 62/100)

**This review is STATIC again.** No fresh account was signed up: `npm run dev` writes
`.next/` into the repository and creating an account on staging writes to a live
environment, both barred by the campaign brief's read-only rule. **A live walk with a
fresh account would still beat this entire report**, and that nobody has done one is
still finding #4 and still criterion 10's zero.

---

## DELTA

**Round 1: 62/100 → Round 2: 62/100. Not one criterion moved, in either direction.**

That is the honest result and it is worth stating plainly rather than dressing up:
six repair commits landed, `npm run check` is green, and **every file this review
scores is byte-identical to round 1.** `git diff 8751e30..HEAD --stat` returns
*nothing* for `web/components/screens/home-screen.tsx`,
`web/components/learning-progress.tsx`, `web/e2e/`, `web/lib/screens.ts` and
`web/lib/pages.ts`.

| Criterion | R1 | R2 | Why it moved |
|---|---|---|---|
| 1 · Nothing needs a human to seed it (GATE) | 94 | **94** | R13's self-heal re-verified intact after `import.ts` was rewritten (§below). Both minors stand: `BOOTSTRAP.md` still contradicts itself, `RESEND_API_KEY` still gates customer one |
| 2 · Every empty screen says what to do next | 22 | **22** | `home-screen.tsx` untouched; the same 3 of 21 empty states name an action; the library still gives them nowhere to put a button |
| 3 · Nothing blanks or crashes on zero rows | 82 | **82** | `learning-progress.tsx` untouched. The root `ErrorBoundary` is now genuinely mounted, which is real — but it catches throws, and this criterion's defect is a bare table that does not throw |
| 4 · First useful outcome inside five minutes | 40 | **40** | still 12 steps, still one email round-trip, still one unguided guess at step 8. Import is still `placement: "contextual"` |
| 5 · Sign-up to first screen has no dead end | 95 | **95** | number unchanged, **basis corrected**. Round 1 credited a mounted root `ErrorBoundary` that was imported and never rendered. It now renders, with a "Try again" button (`web/components/error-boundary.tsx:43`). My R1 95 was overstated; R2's 95 is true |
| 6 · Every empty screen says something at all | 72 | **72** | 20/21 guarded, and the Team-progress grid still renders bare headers |
| 7 · Everything required has a default | 100 | **100** | `buildTeamSeed` re-read: Admin all-on across all 8 modules, Viewer read-only, every `DEFAULT_SELECTABLE` value. The customer still types two words |
| 8 · The cold path is tested | 0 | **0** | `web/e2e/team-flows.spec.ts:86` is verbatim unchanged. 352 lines of new test code landed this round; none of it asserts on an empty screen |
| 9 · Sample data is offered and removable | 45 | **45** | unchanged |
| 10 · Someone has walked it with a fresh account | 0 | **0** | unchanged. `reviews/LEDGER.md:154` records that round 1 could not walk one; nothing since |

**No criterion went DOWN, and none was harmed by another review's repair.** Two
things improved that this rubric does not measure and one that it nearly does — all
recorded below rather than converted into points I did not earn.

---

## What the repairs did and did not touch

Checked deliberately, because "no movement" is a claim that has to be earned:

- **R13's self-heal survived a rewrite of the file it lives in.** `import.ts` gained
  42 lines this round (`forwardToDoor`, tracing, `origin: "import"`). I re-read
  `getActiveCatalog` (`workers/data-ops/src/lib/import.ts:103-105`): it still calls
  `reconcileCatalog` *before* every read, and `reconcileCatalog` is still
  `INSERT … ON CONFLICT(table_key) DO NOTHING` with the `is_active` filter in memory
  rather than in SQL. **A fresh environment's import picker is still not empty.**
  This is criterion 1's gate and it is the thing most likely to have been broken by
  accident. It was not.
- **The root error boundary is now real** (`web/app/layout.tsx:79`). It was imported
  on 19 June and never rendered — `noUnusedLocals` is off, so the import kept the
  gate green for two months while a render crash showed Next.js's blank
  "client-side exception" page. It now renders the actual message and a **"Try
  again"** button. Round 1 credited this mount; it did not exist. Criterion 5's
  20-block ("nothing in the path lands blank") was therefore overstated in round 1
  and is honest now. The number is unchanged because I already awarded it.
- **The one public door now fails cleanly.** The gateway had no central catch, so a
  throw was a bare platform 500; it now returns
  `"Something went wrong on our side. Try again."` (`workers/gateway/src/index.ts:111`).
  Every sign-up call passes through this worker. It does not move criterion 5's score
  — the deducted 5 points are for the team-creation branch having no forward action,
  and `web/app/onboarding/page.tsx` is untouched — but it is a genuine improvement to
  the sign-up path's worst-case.
- **`BOOTSTRAP.md` gained a mandatory manual step and I have NOT penalised it.** The
  new "The OPERATIONS database — do not skip this" section (lines 104-127) tells a
  day-zero operator to create two D1 databases and paste ids into five workers. That
  step always existed; it was simply undocumented, and five workers shipped the
  original author's database ids. **Scoring it now would penalise the repair that
  revealed it**, which is the exact perverse incentive this campaign has to avoid.
  It also does not block a customer: `logError` swallows its own failure, so sign-up
  works either way. Recorded, not counted. *(If it were counted as another
  human-step-before-customer-one minor, criterion 1 is 91 and the total is still 62.)*
- **`BOOTSTRAP.md`'s self-contradiction is NOT fixed.** Line 215: the catalogue
  "heals on first open, so you do NOT need to seed it." Line 267: "After a reset,
  re-seed the import catalog (§6)." Finding 7 stands.
- **A deep-linked ticket no longer lies** (`web/components/help-detail.tsx:96-103`) —
  it asks the single-row door when the list cache genuinely lacks the ticket, and
  shows a skeleton rather than flashing "That ticket no longer exists". Correct, and
  invisible to a new customer, who has no tickets to deep-link to.

---

## Probe integrity — round 2

Re-run to `de-probe-firstrun.json` (prefixed, per the round-2 brief). **Byte-identical
verdict to round 1**: 16 collection files, `guardedPct: 63`, `helpfulPct: 13`,
`riskyOnEmpty: 0`, `requiredNoDefault: 40`, `firstRunTests: 10`, `seeding.scripts: []`.

Three corrections carried forward, all re-confirmed by opening the files:

- **`guarded` undercounts.** The five recipe-driven lists are guarded inside the UI
  library (`collection-frame.tsx:241`), invisible to a scan of `web/`.
- **The probe misses `learning-progress.tsx` entirely**, because its `.map()` calls
  are assigned to consts rather than written inline in JSX — and that file is the one
  real defect.
- **`firstRunTests: 10` is a false positive.** It matches any test file containing the
  word "empty". I re-listed all ten: `rules.test.ts`, `store.test.ts`,
  `source.test.ts`, `format-count.test.ts`, `screens.test.ts`, `config-vars.test.ts`,
  `xlsx-to-csv.test.ts` and three worker suites. **None asserts on an empty screen.**

**One new probe-integrity finding, and it affects every review in this campaign.**
`onboarding.files` now reads `["reviews/first-run.md", "web/app/onboarding/page.tsx"]`
— the probe is scanning `reviews/`, which means **every probe run in round 2 is
reading the campaign's own round-1 reports as if they were source.** My round-1 report
is now evidence for my round-2 probe. Any agent whose numerator comes from a
file-count or a keyword sweep should exclude `reviews/` explicitly, or it is measuring
the audit rather than the app. (This is the same class of fault as round 1's shared
`probe.json`, one layer up.)

---

## Arithmetic

`total = round( Σ (criterion × weight) / Σ weights )`, weights sum to 100.
Defect criteria: `clamp(0,100, 100 − Σ penalties)`, critical 30 · high 15 · medium 7 · minor 3.

| # | criterion | weight | score | × weight |
|---|---|---|---|---|
| 1 | Nothing needs a human to seed it (GATE) | 16 | 94 | 1504 |
| 2 | Every empty screen says what to do next | 15 | 22 | 330 |
| 3 | Nothing blanks or crashes on zero rows | 13 | 82 | 1066 |
| 4 | First useful outcome inside five minutes | 12 | 40 | 480 |
| 5 | Sign-up to first screen has no dead end | 11 | 95 | 1045 |
| 6 | Every empty screen says something at all | 10 | 72 | 720 |
| 7 | Everything required has a default | 9 | 100 | 900 |
| 8 | The cold path is tested | 6 | 0 | 0 |
| 9 | Sample data is offered and removable | 4 | 45 | 180 |
| 10 | Someone has walked it with a fresh account | 4 | 0 | 0 |
| | **Σ** | **100** | | **6225** |

`6225 / 100 = 62.25 → 62`. **Gate:** criterion 1 = 94 ≥ 40, no cap. Capped and
uncapped are the same figure.

### The two percentages, both of them, re-derived

| | screens that HANDLE zero rows | screens whose empty state NAMES AN ACTION |
|---|---|---|
| probe (mechanical, 16 files) | 10/16 = **63%** | 2/16 = **13%** |
| verified by hand (21 surfaces) | 20/21 = **95%** | 3/21 = **14%** |

**The three helpful empty states in the whole app, all re-opened this round:**

1. `web/components/selectable-screen.tsx:198` — "No options yet. **Add your first
   above.**" (and it correctly distinguishes no-data from no-search-match at :199)
2. `web/components/agent-panel.tsx:157-161` — "Try *invite a teammate as an Editor*"
   / "or *what changed this week?*"
3. `web/components/import-screen.tsx:174-211` — "Drop your spreadsheets here, or
   click to choose" plus "New to this? Download a sample:" with a per-target CSV

The 19 absences, unchanged: "No members yet." (`screens.ts:128`) · "No roles yet."
(:193) · "No invites yet." (:210) · "No learning yet." (:272) · "No tickets yet."
(:293) · "No tokens yet." (`access-tokens.tsx:142`) · "No conversations yet."
(`agent-history-dialog.tsx:95`) · "No pending invitations." (`invitations.tsx:72`) ·
"No account activity yet." (`settings-screen.tsx:109`) · "No activity yet." ×4
(`help-detail.tsx:306`, `role-detail.tsx:241`, `learning-detail.tsx:232`, the team
feed) · plus the remainder.

**One in seven, by two independent methods, for the second round running.**

### Criterion 1 · seeding — weight 16 · defect · 94

Re-verified in code, not from a doc that claims it:

- `bootstrap` (`workers/tenancy/src/routes/team.ts:32-53`) accepts pending invites,
  and only if there are none creates `"{First}'s team"`. No human involved.
- `buildTeamSeed` (`workers/tenancy/src/team-schema.ts:393-425`) seeds the **Admin**
  and **Viewer** roles, a `role_permissions` row for every one of the 8
  `TEAM_MODULES` for both (Admin `1,1,1,1`; Viewer `1,0,0,0`, except `agent`
  `1,1,0,0`), and every `DEFAULT_SELECTABLE` value.
- **Law R13 still genuinely holds** after `import.ts` was rewritten — see above.
- `seeding.scripts: []` — there is still no seed script in `scripts/`.

Penalties (2 × minor = 6): the `BOOTSTRAP.md` 215-vs-267 contradiction, and
`RESEND_API_KEY` (`workers/auth/src/index.ts:182-185` returns 503 "Email sending
isn't set up yet." — an honest refusal, but a human step before customer one).
`100 − 3 − 3 = 94`.

### Criterion 2 · says what to do next — weight 15 · coverage · 22

| points | earned | why |
|---|---|---|
| 45 scaled from helpfulPct | **6** | 3/21 = 14.3% · `45 × 0.143 = 6.4` |
| 25 · action is a pressable control, not a sentence | **15** | the create button ("New article", "Raise ticket", "Invite", "New role", "Import CSV") IS on screen when the list is empty (`web/components/deep-link/screen-bits.tsx:63-100`) — it just sits in the far top-right while the empty state sits in a dashed box in the centre |
| 20 · the landing screen is among the helpful ones | **0** | `/home` names no action at all |
| 10 · wording says what they get, not what is missing | **1** | 2/21 = 9.5% · `10 × 0.095 = 0.95` |

### Criterion 3 · blanks or crashes on zero rows — weight 13 · defect · 82

`riskyOnEmpty: []` again, and again I did not take a zero as a fact. The only two web
files that changed this round are `help-detail.tsx` and `layout.tsx`; the new code in
the former is `ticketsQ.data?.find(…) ?? null` and a guarded `useCached` with a `null`
key — both safe. There is still no crash path on an empty account.

Penalties (15 + 3 = 18): the Team-progress grid (high), and
`web/components/screens/home-screen.tsx:22` `if (!ctx) return null`, unreachable
because `deep-link-screen.tsx:313` renders `ShellLoading` whenever `!active.ctx`
(minor). *Judgement restated so it can be recomputed: scored **medium (7)** instead of
high, criterion 3 becomes 90 and the total becomes 63.*

### Criterion 4 · first useful outcome inside five minutes — weight 12 · coverage · 40

Outcome: the standing one — **the customer has imported their first real records and
can see their own data.** Not re-asked.

| points | earned | why |
|---|---|---|
| 40 · named and reachable without help | **20** | reachable, never named |
| 30 · step count counted and small | **10** | **12 steps** |
| 20 · nothing waits on email / approval / support | **0** | step 3 waits on an email |
| 10 · same path on every device claimed | **10** | yes |

**The step count is still 12**, and step 8 is still a guess: `/` → `/login` → email →
**leave the app for your inbox** → code → `/onboarding` → name → `/home` (team card,
two links) → **guess: click "Learning"** → "Import CSV" top-right → drop a file →
"Analyze & plan" → "Run import".

### Criterion 5 · no dead end from sign-up to first screen — weight 11 · coverage · 95

35/35→30, 25/25, 20/20, 20/20. The strongest part of the product and it deserves
saying again: email send fails → inline error, button stays live; no email key → a
loud 503 whose comment reads "refuse rather than stranding the user"; wrong code →
**Change email** and **Resend code** both on screen; 5 wrong tries → 429 with Resend
still there; **past the hourly cap the live code is ROTATED rather than the request
refused** (`workers/auth/src/lib/login-codes.ts:61-67`); `/onboarding` pre-fills on
resume; `bootstrap` auto-accepts pending invites and there is a standing
`/invitations` inbox.

The 5 deducted: a failed team creation carries the server's honest message
("…team creation is paused.") but the only forward action is pressing the same button,
and there is no support route because Help requires a team.

### Criterion 6 · says something at all — weight 10 · coverage · 72

57 (20/21 = 95.2% × 60) + **0** (the Team-progress grid is exactly an empty table with
headers) + 15 (loading and empty look different everywhere — `<Skeleton variant="list"
lines={4} />` while `data === undefined`, the dashed box only once data is `[]`).

### Criterion 7 · everything required has a default — weight 9 · coverage · 100

40 + 30 + 30. The customer types first name and last name. The team name is generated,
the photo is optional, roles/permissions/dropdown values are all seeded, the agent
falls back to Workers AI `llama-4-scout` with no `ANTHROPIC_API_KEY`, credits default
to `FREE_DAILY`. The probe's 40 `requiredNoDefault` columns are machine-written
(`email`, `code_hash`, `expires_at`, `token_hash`, `size_bytes`, …). Not one is a
value a customer types.

### Criterion 8 · the cold path is tested — weight 6 · coverage · 0

0 + 0 + 0. `web/e2e/team-flows.spec.ts:86-89` is unchanged, verbatim:

```
test.skip(
  page.url().includes("/onboarding"),
  "Fresh account has no team; seed a teamful test account (or complete onboarding + create a team) to exercise this flow."
)
```

`e2e/README.md:46` restates it: the flow "needs a **teamful** test account". Playwright
is still deliberately not installed and the spec still does not run in CI.

**Worth naming for the campaign:** this round added `web/test/source.test.ts` (70 lines),
282 lines to `web/test/rules.test.ts`, `workers/auth/test/gating-seam.test.ts` (88
lines) and more. Roughly 500 lines of new test code, and **not one line asserts what a
screen says with nothing in it.** The closest thing in the whole suite is still
`format-count.test.ts:12` (`formatCount(0) === ""`), a formatter unit test.

### Criterion 9 · sample data offered and removable — weight 4 · coverage · 45

35 + 10. `GET /api/data-ops/import/sample?tableKey=` still returns a per-target sample
CSV, surfaced as "New to this? Download a sample:". Still no load-demo-data feature,
and an imported sample is indistinguishable from real data — visible in "Past imports"
but with no undo-this-batch, so it must be deactivated row by row.

### Criterion 10 · someone has walked it with a fresh account — weight 4 · coverage · 0

0 + 0. Re-searched every markdown file for "fresh account", "brand-new account",
"empty account", "cold walk", "first run". Three hits: `web/e2e/README.md:46` (the
skip), `architecture-review.md:70` and `OPERATIONS.md` (a fresh **Cloudflare** account,
error 10143), and `reviews/LEDGER.md:154` — which records that round 1 was static and
scored this zero. Sixteen reviews now sit in this repository. **None of them is a
person opening the product with nothing in it.**

---

## Findings — all five originals stand, none addressed

### 1 · HIGH — the landing screen tells a brand-new customer nothing · **STANDS**
`web/components/screens/home-screen.tsx:24-27`

Re-read in full. `LINKS` is still two hardcoded entries:

```
{ title: "Team",     desc: "Members, roles and invites", … }
{ title: "Settings", desc: "Your account and teams",     … }
```

A person who has just finished signing up sees a circle with their team's initial, the
auto-generated name, an "Admin" badge, "1 member", and those two rows. No welcome, no
next step, no mention of Learning or Help (both in the sidebar), no mention of
importing (the first useful outcome), no mention of the assistant (a floating
icon-only button). The string "get started" still does not exist anywhere in the app.

**Why it matters:** criterion 2's landing-screen item is 20 of its 100 points and
scores zero, and criterion 4's "named and reachable" is half-earned for the same
reason.

**The fix:** a first-run block on `HomeScreen`, shown while the team has no imported
records, pointing at the one thing that makes the product useful. **The wording is the
owner's** (Tier 3, copy is never mine). The destination is safe under Law R20 — the
gateway serves `/t/*` from the deep-link shell, so `/t/<teamId>/import/learning`
resolves in a fresh tab as well as in-app.

### 2 · HIGH — 19 of 21 empty states are absences, and the library gives them nowhere to put a button · **STANDS**
`web/lib/screens.ts:128, 193, 210, 272, 293` and eight other sites

Unchanged. On a fresh Admin account the two screens a customer actually meets empty
are **Learning** and **Help**, and both give a dashed box with four words in it.

**The structural half, re-verified this round:** the library's collection frame renders
`{config.emptyText}` and nothing else
(`node_modules/@swift-struck/ui/registry/collections/collection-frame/collection-frame.tsx:244`),
and `emptyText` is typed `string` at `lib/config.ts:226` with a default of
`"Nothing here yet."` at :248. **There is no action slot.** A recipe physically cannot
put a button in its empty state. CLAUDE.md is explicit — "Do not edit the library from
here… if a primitive needs changing, surface it" — so **the in-rule fix is a UI-GAPS
entry requesting an `emptyAction` (ReactNode) on `CollectionConfig`, plus richer
`emptyText` copy in the owner's voice.**

**`UI-GAPS.md` was not touched this round.** It is still current and honest — every
shipped entry struck through with a date — and it still has no row for this. Filing
that row is the single cheapest thing in this report, and it has now gone one full
round unfiled. `dead_end_review` needs a UI-GAPS row too (`PermissionMatrix` needs a
per-module rights list). **File both together.**

### 3 · HIGH — the "Team progress" tab renders a bare table on every new team · **STANDS**
`web/components/learning-progress.tsx:40-58` · `node_modules/@swift-struck/ui/.../progress-dashboard/progress-dashboard.tsx:44-63`

`items` comes from the team's active learning articles, which on day one is `[]`. It
goes straight into `ProgressDashboard`, which I re-opened this round: it renders a
`<Table>` **unconditionally**, with a sticky "Member" header, one `<TableHead>` per
item (none), and a "Done" header. The file has no zero-row branch. Any Admin clicking
"Team progress" on their first day gets a two-column grid with one meaningless row.

**One correction to my own round-1 wording, in the interest of not overstating.** I
wrote "no explanation of what it is". That was wrong: lines 51-55 render a heading
("Team progress") and a subtitle ("Who's marked each article done. Only switched-on
articles are shown."). What is missing is the zero-row branch, not the explanation.
The severity is unchanged — criterion 6's 25-point item is specifically "no screen
renders an empty table with headers and nothing else", and this one does.

**The fix:** `if (items.length === 0)` → render a sentence instead of the grid. Three
lines, local, reversible, no new capability. **The sentence is the owner's copy.**
Still the cheapest high-severity fix in the report.

### 4 · HIGH — the only cold-account test is written to skip the cold account · **STANDS**
`web/e2e/team-flows.spec.ts:86-89`

Quoted in full under criterion 8, verbatim unchanged. The test creates a fresh email,
signs in, sees `/onboarding`, and stops — with a message telling the reader to seed a
teamful account instead. **This is the mechanism by which "everyone testing already
has data" became structural rather than accidental.** It is written down, in the
repository, as the intended behaviour, and a round of repairs that added ~500 lines of
tests walked past it.

**The fix:** extend the spec past the skip — complete onboarding, then assert on what
`/home`, `/learning` and `/help` actually say with nothing in them. Tier 2 (a real new
test, shown before written).

### 5 · MEDIUM — importing, the first useful outcome, is named nowhere a new customer looks · **STANDS**
`web/lib/pages.ts:73`

`{ key: "import", … placement: "contextual" }`, unchanged. Import appears only as a
top-right button on Learning, Member-roles and Dropdown-values — three screens the
customer has no particular reason to open. Between the landing screen and that button
there is one pure guess.

**The constrained fix, restated honestly:** changing `placement` to `"sidebar"` trips
**Law R20**, which needs three things in three workspaces — a page source at
`web/app/import/[[...rest]]/page.tsx`, an entry in `MODULE_SHELLS`
(`workers/gateway/src/index.ts:50`, today `["learning","help"]`), and an entry in
`TOP_LEVEL_MODULES` — and Import has no read right of its own, so a sidebar entry
would need a synthetic gate, which is precisely what `dead_end_review` flags. **The
cheap in-rule fix is finding #1's landing-screen prompt**, which needs no registry
change at all.

### 6 · MEDIUM — a failed team creation leaves the customer pressing the same button · **STANDS**
`web/app/onboarding/page.tsx:87-92`, `workers/tenancy/src/index.ts:167-169`

Untouched. The message is honest and specific; the only forward action is Continue
again; there is no way to ask for help, because Help lives inside a team the customer
does not have. **The fix:** a contact route on the onboarding failure branch — from
`shared/brand.ts`, never a literal (see the FIX IMPACT MAP).

### 7 · LOW — `BOOTSTRAP.md` contradicts itself about the one step R13 abolished · **STANDS**
`BOOTSTRAP.md:215` vs `BOOTSTRAP.md:242`→`:267`

Line 215: the picker "heals on first open, so you do **NOT** need to seed it."
Line 267: "After a reset, re-seed the import catalog (§6)." Line 343 hedges a third
way ("catalog self-heals; seed-targets optional"). `BOOTSTRAP.md` gained 31 lines this
round and this was not among them. Overlaps `story_checks_out_review`.

### 8 · LOW — error and not-found screens have no way forward · **STANDS (narrowed)**
`web/components/deep-link/screen-bits.tsx:11-25`

"You don't have access to this, or it doesn't exist." · "That screen doesn't exist." ·
"Couldn't load {what}." Three bare sentences, no Home link, no retry.

**Narrowed this round:** the *root render crash* case is now handled — the mounted
`ErrorBoundary` shows the real message and a **"Try again"** button
(`web/components/error-boundary.tsx:43`). These three components are not error
boundaries and are unchanged. Not on the sign-up path, so it still costs criterion 5
nothing.

### What is genuinely good, and must not be lost in a repair

- **The sign-up path scores 95** and the hourly-cap behaviour — rotating the live code
  rather than refusing the request, so "a person who owns the inbox can always get in"
  — is the best single decision in this product's first five minutes.
- **Zero crash paths on an empty account**, verified independently of the probe twice.
- **Defaults are perfect** (100/100). The customer types two words.
- **The import screen is still the best first-run screen in the product** — clear drop
  zone, per-target sample CSVs, "Past imports" hidden rather than shown empty, an
  honest no-rights explanation, and a deterministic planner that works with no AI key.
- **Law R13 is real, and survived a rewrite of its own file this round.**

---

## Which single fix buys the most

The arithmetic, then the judgement, because they do not quite agree.

| fix | criteria it moves | arithmetic | total |
|---|---|---|---|
| **A · first-run prompt on `/home`** (finding 1) | C2: helpful 3/21→4/21 (+2.2), landing block 0→20, wording +0.5 → 22→44.7 = **+3.3**. C4: "named" 20→40 (+2.4), steps 12→11 removes the guess, 10→15 (+0.6) = **+3.0** | +6.3 | **68** |
| **C · richer copy on the 19 absences** (finding 2) | C2 only: helpful 3/21→21/21 = 6.4→45 (+38.6), wording 1→10 (+9); the 25-block stays 15 (library) → 22→70 = **+7.2** | +7.2 | **69** |
| **D · zero-row branch on Team progress** (finding 3) | C3 82→97 (**+1.95**) · C6 72→97 (**+2.5**) | +4.5 | **66** |
| **E · extend the e2e past the skip** (finding 4) | C8 0→80 (no CI) or 100 (CI) | +4.8 / +6.0 | **67 / 68** |
| **W · one person signs up once** | C10 0→100 | +4.0 | **66** |

**The answer: fix A, the first-run prompt on the landing screen.**

C is worth 0.9 more points on paper and it is the wrong thing to do first, for four
reasons I want on the record:

1. **A is where the customer actually is.** Rewriting 19 empty states helps a person
   who has already navigated somewhere. The landing screen is the screen they are
   standing on, with no idea where to go. Criterion 2's landing item is the only
   20-point block in this rubric that names a single file.
2. **A is the only fix that touches the journey.** It is the sole item in the table
   that moves criterion 4 at all — it removes step 8, the one unguided guess in a
   12-step path.
3. **A is one file, in-repo, 70 lines long, with no library dependency.** C is nine
   files, 19 strings in the owner's voice (Tier 3), and every new word is bounded by
   Law R6 — a synonym that is not in `shared/glossary.ts` turns
   `glossary-wellformed` red.
4. **C's ceiling is capped anyway.** Its 25-block cannot be earned from this
   repository (below), so copy alone tops C2 out at 70 of 100.

**Do A first, then D (three lines, +4.5), then file the two UI-GAPS rows.** A + D + C
together is +18 and takes the score to 80.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **A ·** First-run prompt on the landing screen (finding 1) — **do this one first** | `web/components/screens/home-screen.tsx` | ADDS a conditional block + one cached read to know whether the team has any records yet | **round_trip_review** — `/home` is the most-loaded screen in the app; this adds a read unless it reuses the `totals` the shell already fetches. **spend_review** — one extra D1 COUNT per Home load if not reused; reuse the existing count seam (R16's `formatCount`) and the cost is zero. **lean_mean** — new UI on a 70-line file. **dead_end_review** — improves (one fewer capability with no signpost) |
| **B ·** UI-GAPS entry requesting an `emptyAction` slot on `CollectionConfig` (finding 2) | `UI-GAPS.md` only | ADDS one table row. Changes no code here | **none** — a row in the file whose exact purpose is this. **File it in the same commit as `dead_end_review`'s `PermissionMatrix` row**; both reviews are capped by the same library and both rows have now gone one round unfiled |
| **C ·** Richer empty-state copy for the 19 absences (finding 2) | `web/lib/screens.ts`, `selectable-screen.tsx`, `access-tokens.tsx`, `agent-history-dialog.tsx`, `invitations.tsx`, `settings-screen.tsx`, `role-detail.tsx`, `learning-detail.tsx`, `help-detail.tsx` | ADDS words to existing string literals. No branches, no components, no reads | **story_checks_out / Law R6 (glossary)** — every new word must already be a `shared/glossary.ts` term or `glossary-wellformed` fails. **lean_mean** — neutral, string length only. **Copy is Tier 3: the owner writes it, not me** |
| **D ·** Zero-row branch on the Team progress grid (finding 3) | `web/components/learning-progress.tsx` | ADDS one `if (items.length === 0)` branch and one sentence; REMOVES the bare table | **lean_mean** — three lines, negligible. **realtime_review** — none; the progress read is a non-live cached read by design. Cheapest high-severity fix in the report |
| **E ·** Extend the e2e past the cold-account skip (finding 4) | `web/e2e/team-flows.spec.ts`, `web/e2e/README.md` | ADDS onboarding completion + assertions on `/home`, `/learning`, `/help` when empty; REMOVES the `test.skip` | **lean_mean** — more test code, and that review scores less code better. **speed_review / CI** — putting it in CI needs Playwright installed and browser binaries downloaded, which this repo deliberately avoids; a real minutes-per-run cost. **mac_fell_in_the_ocean** — helps (a stranger gains a runnable proof the cold path works). Net: raises robustness, lowers leanness |
| **F ·** Contact route on the onboarding failure branch (finding 6) | `web/app/onboarding/page.tsx`, `shared/brand.ts` | ADDS a line of copy and a link | **base_fork_review** — a hardcoded support address in the base is exactly the client-specific leak that review hunts. It **must** come from `shared/brand.ts`, never a literal |
| **G ·** Reconcile `BOOTSTRAP.md:267` with `:215` (finding 7) | `BOOTSTRAP.md` | REMOVES a stale instruction | **none** — a docs-only edit removing a contradiction; `story_checks_out` benefits |
| **H ·** Forward action on NoAccess / NotFound / LoadError (finding 8) | `web/components/deep-link/screen-bits.tsx` | ADDS a Home link and a retry to three components | **lean_mean** — small. **dead_end_review** — helps directly (fewer terminal screens). **round_trip_review** — a retry invites re-requests on a failing door; make it a manual retry, never automatic, or one failure becomes a loop. Copy the mounted `ErrorBoundary`'s pattern, which is already correct |
| **W ·** One person signs up with a fresh account and records the date | one dated line in a doc | ADDS the only evidence criterion 10 accepts | **none — it is not a code change at all.** The cheapest 4 points in this report, and the only one no commit can substitute for |
| **I ·** Surface Import in the sidebar (finding 5) — **still NOT recommended** | `web/lib/pages.ts`, `web/app/import/[[...rest]]/page.tsx` (new), `workers/gateway/src/index.ts`, `web/components/deep-link/route.ts` | ADDS a page source, a `MODULE_SHELLS` entry, a `TOP_LEVEL_MODULES` entry and a synthetic read gate | **architecture_review** — three registries in three workspaces move for one nav entry. **dead_end_review** — a synthetic gate is a permission that enforces nothing, which is precisely what that review's criterion 2 flags (it counted **9** such switches this round). **lean_mean** — a new page source for a screen that exists. Listed for completeness; **fix A achieves the same outcome for a fraction of the blast radius** |

**Law conflicts, named rather than proposed silently:** fix **C** is bounded by Law R6
(glossary); fix **I** is bounded by Law R20 (static destinations) and would create a
`dead_end_review` finding; and the natural fix for finding 2 — a button *inside* the
empty state — **cannot be done in this repository at all** without breaking CLAUDE.md's
library-is-lego rule, which is why fix B is a UI-GAPS row and not a code change.

---

## CEILING

**Confirming the round-1 conclusion and correcting the round-1 number: 95 is not
reachable by code alone, and the code-only maximum is 91, not 93.**

Round 1 put the code-only ceiling at ~93 by driving criterion 2 to 100. That was
optimistic and I am correcting it against myself. **Criterion 2's 25-point block
cannot be earned from this repository**, for the same reason as
`dead_end_review`'s criterion 2 and by the same mechanism: the control lives in
`@swift-struck/ui`. `emptyText` is typed `string` (`lib/config.ts:226`) and
`collection-frame.tsx:244` renders it as text and nothing else, so a recipe cannot put
a pressable control in an empty state. The only in-repo alternative is to abandon the
recipe engine for those five screens and hand-compose them — which contradicts
UI-CONVENTIONS' "engine-expressible screens → a recipe". **Criterion 2's realistic
in-repo maximum is `45 + 15 + 20 + 10 = 90`.**

Three caps, then:

- **Criterion 2 tops out at 90 in-repo** (library `emptyAction` slot needed for the
  last 10). Cost: 1.5 points, permanently, until `swift-struck-ui` ships it.
- **Criterion 4 is permanently capped at 80** by a locked decision. Its 20-point item
  is "nothing in that path waits on an email", and the emailed 6-digit code is the
  only sign-in mechanism in the product. Removing the wait means a second auth factor,
  which reopens the own-auth decision in ARCHITECTURE.md. Cost: 2.4 points.
- **Criterion 10 (weight 4) cannot be earned by a commit at all.** It asks whether a
  human has walked a fresh account and knows the date. Code cannot supply that.

Arithmetic, everything else at its realistic maximum
(C1 97 · C2 **90 capped** · C3 100 · C4 **80 capped** · C5 100 · C6 100 · C7 100 ·
C8 100 · C9 85 · C10 **0, uncommittable**):

```
(97×16)+(90×15)+(100×13)+(80×12)+(100×11)+(100×10)+(100×9)+(100×6)+(85×4)+(0×4)
= 1552+1350+1300+960+1100+1000+900+600+340+0 = 9102 → 91.0 → 91
```

With one person walking a fresh account and recording the date (C10 → 100):
`9102 + 400 = 9502 → 95.0 → 95`.
Add the library `emptyAction` slot (C2 → 100): `9502 + 150 = 9652 → 96.5 → 97`.

**So: 95 lands exactly on the line, and only once somebody actually signs up.** Not by
a commit — by a session. The round-1 verdict is confirmed; the number underneath it was
two points generous, and the correction makes the conclusion sharper rather than
weaker: **without a cold walk, the honest ceiling is 91 and 95 is unreachable at any
price.**

C1's 97 rather than 100 keeps the `RESEND_API_KEY` minor, on the view that a fresh
deployment always needs one human step before its first customer. C9's 85 assumes the
"remove sample data in one action" item stays partly unearned — an undo-this-import
capability would collide with "deactivate, never delete" and would have to satisfy R23
and R24, so it is reachable but genuinely expensive.

---

## Verdict

**A brand-new customer still lands on `/home`, sees their team's initial in a circle,
an auto-generated team name, an "Admin" badge, "1 member", and two rows — Team and
Settings — and nothing anywhere on that screen tells them what to do, mentions Learning
or Help, or points at importing their data. Six repair commits landed this round and
not one of them touched that file, or the 19 empty states, or the test that is written
to walk around all of it.**
