# First-run review — Brimba · 2026-08-25
SCORE: 62/100   (previous: never run)

**This review is STATIC.** I did not sign up a fresh account. Running `npm run dev`
would have written `.next/` into the repository and creating an account on staging
would have written to a live environment — both are barred by the campaign brief's
read-only rule. Every finding below is read off the source. **A live walk with a
fresh account would beat this entire report**, and the fact that nobody has done one
is itself finding #4.

**The landing screen, in one sentence:** a brand-new customer lands on `/home` and
sees their team's initial in a circle, the auto-generated team name ("Chris's team"),
an "Admin" badge, the words "1 member", and two rows — "Team · Members, roles and
invites" and "Settings · Your account and teams" — and nothing anywhere on the screen
tells them what to do, mentions Learning or Help, or points at importing their data.

**Everyone testing already has data.** That sentence is why this skill exists, and it
is visible in this codebase as a single line: the only end-to-end test that signs up a
fresh account is written to **skip itself** the moment it discovers the account is
fresh (`web/e2e/team-flows.spec.ts:86`).

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

`6225 / 100 = 62.25 → 62`. **Gate:** criterion 1 = 94 ≥ 40, so no cap applied.
Capped and uncapped are the same figure.

### The two percentages, both of them

The rubric's central distinction, measured two ways:

| | screens that HANDLE zero rows | screens whose empty state NAMES AN ACTION |
|---|---|---|
| probe (mechanical, 16 files) | 10/16 = **63%** | 2/16 = **13%** |
| verified by hand (21 surfaces) | 20/21 = **95%** | 3/21 = **14%** |

The probe **undercounts guarded** and I corrected it: the five recipe-driven lists are
guarded inside the UI library (`node_modules/@swift-struck/ui/registry/collections/collection-frame/collection-frame.tsx:241`),
which a source scan of `web/` cannot see. The probe's 16-file count also misses
`learning-progress.tsx` entirely, because its `.map()` calls are assigned to consts
rather than written inline in JSX — and that file is the one real defect.

The number that matters — **helpful** — lands at 13–14% either way. Two independent
methods agreeing at one in seven is the finding.

### Criterion 1 · seeding — weight 16 · defect · 94

Verified, by reading code rather than the doc that claims it:

- `bootstrap` (`workers/tenancy/src/routes/team.ts:32-53`) runs at the end of onboarding:
  it accepts any pending invites, and only if there are none does it create
  `"{First}'s team"`. No human involved.
- `buildTeamSeed` (`workers/tenancy/src/team-schema.ts:393-425`) seeds, inside team
  creation: the **Admin** and **Viewer** roles, a `role_permissions` row for every
  module in `TEAM_MODULES` for both roles, and every `DEFAULT_SELECTABLE` dropdown value.
- Law R13 genuinely holds. `reconcileCatalog` (`workers/data-ops/src/lib/import.ts:87-97`)
  is `INSERT … ON CONFLICT(table_key) DO NOTHING`, and `getActiveCatalog` (line 102-104)
  calls it **before** every read, filtering `is_active` in memory rather than in SQL. I
  followed the path the browser actually takes — `web/components/import-screen.tsx:61`
  → `/api/data-ops/import/targets` → `workers/data-ops/src/routes/import.ts:44` →
  `getActiveCatalog` — and it reconciles first. A fresh environment's picker is not empty.
- `seeding.scripts: []` — there is no seed script in `scripts/` at all.

Penalties (2 × minor = 6):

- **minor 3** — `BOOTSTRAP.md:190` says the picker "heals on first open, so you do NOT
  need to seed it"; `BOOTSTRAP.md:242` still says "After a reset, re-seed the import
  catalog (§6)". A day-zero operator reads a contradiction about the one step R13 exists
  to abolish. (Overlaps `story_checks_out_review`.)
- **minor 3** — a fresh deployment cannot sign up its first customer until
  `RESEND_API_KEY` exists: `sendLoginCode` returns false and the door refuses with 503
  "Email sending isn't set up yet." (`workers/auth/src/index.ts:182-185`). Not a seed and
  not a silent hang — an honest refusal — but it is still a human step before customer one.

`100 − 3 − 3 = 94`.

### Criterion 2 · says what to do next — weight 15 · coverage · 22

| points | earned | why |
|---|---|---|
| 45 scaled from helpfulPct | **6** | 3/21 = 14.3% · `45 × 0.143 = 6.4` |
| 25 · action is a pressable control, not a sentence | **15** | see below |
| 20 · the landing screen is among the helpful ones | **0** | `/home` names no action at all |
| 10 · wording says what they get, not what is missing | **1** | 2/21 = 9.5% · `10 × 0.095 = 0.95` |

The three helpful empty states, in the whole app:

1. `web/components/selectable-screen.tsx:198` — "No options yet. **Add your first above.**"
   (and it correctly distinguishes no-data from no-search-match)
2. `web/components/agent-panel.tsx:157` — "Try *invite a teammate as an Editor*" / "or *what changed this week?*"
3. `web/components/import-screen.tsx:171-212` — "Drop your spreadsheets here, or click to
   choose" plus "New to this? Download a sample:" with a per-target CSV

The 15/25 on the second row is real partial credit and should not be read as a pass:
on every recipe list the create button **is** on screen when the list is empty
(`SectionWithCreate`, `web/components/deep-link/screen-bits.tsx:63-100` — "New article",
"Raise ticket", "Invite", "New role", plus "Import CSV"), and `access-tokens.tsx:128-135`
carries a standing explainer above a "New token" button. The person can press something.
The empty state simply never points at it — it sits in a dashed box in the centre of
the screen while the button sits in the far top-right corner.

The 2/21 on wording: 19 of 21 surfaces are phrased as an absence — "No members yet.",
"No roles yet.", "No invites yet.", "No learning yet.", "No tickets yet.", "No tokens
yet.", "No conversations yet.", "No pending invitations.", "No account activity yet.",
"No activity yet." (×4), "No content yet."

### Criterion 3 · blanks or crashes on zero rows — weight 13 · defect · 82

`riskyOnEmpty: []` from the probe, and I did not take a zero result as a fact — I ran my
own sweep for `[0]` dereferences and for `find()`/`filter()` results used without a
check across `web/components`, `web/lib`, `web/app`. Every hit is optional-chained or
structurally safe (`invite-dialog.tsx:62` is `(roles.find(…) ?? roles[0])?.id ?? ""`;
`learning-detail.tsx:47` indexes a `String.split` result, which always has an element).
There is no crash path on an empty account.

Penalties (15 + 3 = 18):

- **high 15** — `web/components/learning-progress.tsx:48-56` hands `items` straight to
  the library `ProgressDashboard` with **no zero-row branch anywhere in the file**. On a
  brand-new team there are zero learning articles, so the "Team progress" tab — a named
  destination any Admin can reach at `/learning?tab=progress`
  (`web/components/deep-link/module-content.tsx:277-286`) — renders a table with the
  headers "Member" and "Done", one row for the customer themselves, and no explanation
  of what it is or how to fill it. Nothing errors. It is the whole content of that tab.
  *Judgement stated openly so it can be recomputed: I scored this **high** on the rubric's
  "renders blank with no error and no explanation". Scored **medium (7)** instead,
  criterion 3 becomes 90 and the total becomes 63.*
- **minor 3** — `web/components/screens/home-screen.tsx:22` `if (!ctx) return null` is a
  bare null return, but `web/components/deep-link-screen.tsx:313` renders `ShellLoading`
  whenever `!active.ctx`, so it is unreachable. A guarded case that only looks risky.

### Criterion 4 · first useful outcome inside five minutes — weight 12 · coverage · 40

Outcome used: the standing one — **the customer has imported their first real records
and can see their own data.** Not re-asked.

| points | earned | why |
|---|---|---|
| 40 · named and reachable without help | **20** | reachable, never named |
| 30 · step count counted and small | **10** | **12 steps** |
| 20 · nothing waits on email / approval / support | **0** | step 3 waits on an email |
| 10 · same path on every device claimed | **10** | yes |

**The step count is 12:**

1. Open the app → `/` redirects to `/home` (`web/app/page.tsx`) → not signed in → `/login`
2. Type email, press "Email me a code"
3. **Leave the app, open your inbox, read a 6-digit code**
4. Type the code (auto-verifies at 6 characters, `auth-card.tsx:99-105`)
5. `/home` → not onboarded → `/onboarding` (`web/lib/use-active-team.ts:77`)
6. Type first name, type last name, press "Continue" — the team is created here
7. Land on `/home` — team card, two links
8. **Guess:** click "Learning" in the sidebar (nothing on Home says import lives there)
9. Click "Import CSV" in the top-right (`module-content.tsx:237`)
10. Drop a CSV, or click the zone to choose one
11. Press "Analyze & plan"
12. Review the plan, press "Run import" (`import-screen.tsx:352`)

Twelve steps, one mail round-trip, and one unguided guess at step 8. The 20/40: Import
is declared `placement: "contextual"` (`web/lib/pages.ts:73`), so it exists only as a
button on the Learning, Member-roles and Dropdown-values screens. It is genuinely
reachable — but it is named nowhere a new customer looks first.

The 0/20 is the rubric applied literally: the emailed 6-digit code is the only sign-in
mechanism. I have scored it 0 and carried it to the CEILING, because a commit cannot
remove it without reopening a locked decision.

The 10/10: the bottom nav caps at five (`bottomNavItems`), action rows wrap rather than
clip (`screen-bits.tsx:76-79`), and the import drop zone is a `<label>` wrapping a file
input, so a phone tap opens the native picker. Same twelve steps on both.

### Criterion 5 · no dead end from sign-up to first screen — weight 11 · coverage · 95

| points | earned | why |
|---|---|---|
| 35 · every step has a forward action, incl. errors | **30** | one weak branch |
| 25 · abandon halfway and resume, not restart | **25** | full |
| 20 · verification / invitation / team-creation each move on | **20** | full |
| 20 · nothing 404s, loops, or lands blank | **20** | full |

This is the strongest part of the product and deserves saying so. Error branches walked:

- email send fails → inline field error, the button stays live (`auth-card.tsx:48`)
- **no email key** → 503 "Email sending isn't set up yet." — the comment on
  `workers/auth/src/index.ts:184` reads "refuse rather than stranding the user"
- wrong code → "That didn't work. Try again.", the code clears, and **Change email** and
  **Resend code** are both on screen (`auth-card.tsx:117-135`)
- 5 wrong tries → 429 "Too many wrong tries. Request a new code." with Resend still there
- **past the hourly cap → the live code is rotated rather than the request refused**
  (`workers/auth/src/lib/login-codes.ts:61-67`): "a person who owns the inbox can always get in"
- resume: `/onboarding` re-reads `auth.me()` and **pre-fills** the name fields
  (`web/app/onboarding/page.tsx:59-61`); a teamless-but-onboarded user is bounced back
  there (`use-active-team.ts:64`) and pressing Continue re-runs bootstrap — a resumable
  re-entry, not a loop
- invitation: `bootstrap` auto-accepts pending invites before creating a personal team
  (`team.ts:42`), **and** there is a standing `/invitations` inbox for any signed-in user

The 5 deducted: if team creation fails, the toast carries the server's message — which
for a missing D1 key is the specific "…team creation is paused."
(`workers/tenancy/src/index.ts:168`) — but the only forward action is pressing the same
button again, and there is no support route, because Help requires a team.

### Criterion 6 · says something at all — weight 10 · coverage · 72

| points | earned | why |
|---|---|---|
| 60 scaled from guardedPct | **57** | 20/21 = 95.2% · `60 × 0.952 = 57.1` |
| 25 · no empty table with headers and nothing else | **0** | the Team progress grid is exactly that |
| 15 · loading and empty look different | **15** | full |

The 15/15 is earned everywhere I looked: `<Skeleton variant="list" lines={4} />` while
`data === undefined`, the dashed box only once data is `[]` — `module-content.tsx`
(every module branch), `access-tokens.tsx:139`, `import-screen.tsx:151`. Nobody waits
for data that will never come.

### Criterion 7 · everything required has a default — weight 9 · coverage · 100

| points | earned | why |
|---|---|---|
| 40 · required records need nothing obscure | **40** | first name, last name |
| 30 · settings have sensible defaults | **30** | all of them |
| 30 · nothing blocks on a value only an admin knows | **30** | none |

The customer types exactly two things. The team name is generated
(`` `${user.firstName ?? "My"}'s team` ``), the photo is optional, roles, permissions
and dropdown values are all seeded. Defaults confirmed: the agent falls back to Workers
AI `llama-4-scout` when no `ANTHROPIC_API_KEY` is set
(`workers/data-ops/src/lib/model.ts:375-377`), credits default to `FREE_DAILY = 25`
(`credits.ts:16`), `MAX_TEAMS_PER_USER` falls back to a code default.

The probe's 40 `requiredNoDefault` columns are a false alarm and I checked each name:
`email`, `code_hash`, `expires_at`, `token_hash`, `size_bytes`, `threshold_bytes`, and
the `at`/`source`/`place`/`message` of the error log. Every one is machine-written. Not
a single one is a value a customer types.

### Criterion 8 · the cold path is tested — weight 6 · coverage · 0

| points | earned | why |
|---|---|---|
| 50 · a test signs up fresh and asserts on the empty screens | **0** | it skips instead |
| 30 · covers the landing screen, not only the API | **0** | nothing asserts on `/home` |
| 20 · runs in CI | **0** | deliberately not installed |

`web/e2e/team-flows.spec.ts` generates a genuinely fresh email (`freshEmail()`, line 18)
and then, at line 86:

```
test.skip(
  page.url().includes("/onboarding"),
  "Fresh account has no team; seed a teamful test account (or complete onboarding + create a team) to exercise this flow."
)
```

The only test that reaches a brand-new account is written to stop there. `e2e/README.md`
states it plainly: "**not** part of `npm run check` and Playwright is intentionally
**not installed**."

The probe's `firstRunTests` list is a false positive and I opened them to confirm: it
matched any test file containing the word "empty" anywhere, which caught
`rules.test.ts`, `store.test.ts`, `format-count.test.ts` and others. The closest thing
to a cold-path assertion in the entire suite is `format-count.test.ts:12`
(`formatCount(0) === ""`), a formatter unit test. **Nothing asserts on an empty screen.**

### Criterion 9 · sample data offered and removable — weight 4 · coverage · 45

| points | earned | why |
|---|---|---|
| 50 · example data can be loaded | **35** | sample FILES, not loaded data |
| 50 · removable in one action, obviously not real | **10** | traceable, not removable |

`GET /api/data-ops/import/sample?tableKey=` (`workers/data-ops/src/routes/import.ts:47-57`)
returns a per-target sample CSV, surfaced as "New to this? Download a sample:" on the
import screen. That teaches the shape and can then be imported for real — most of the
value of demo data, without the pollution. But there is no load-demo-data feature, and a
sample CSV once imported is indistinguishable from real data: it can be seen in "Past
imports" (`import-screen.tsx:433-463`) but there is no undo-this-batch, so it must be
deactivated row by row. No document says demo data was decided against, so I could not
score it as a deliberate absence.

### Criterion 10 · someone has walked it with a fresh account — weight 4 · coverage · 0

| points | earned | why |
|---|---|---|
| 60 · a real cold walk happened, date known | **0** | no evidence |
| 40 · what it found was fixed | **0** | n/a |

I searched every markdown file for "fresh account", "brand-new account", "empty
account", "cold walk", "first run"; the only hits are about a fresh **Cloudflare
account** during deployment (`ARCHITECTURE.md:292`, `OPERATIONS.md:43` — the 10143
cold-start cycle), never about a fresh **customer** account. No commit in 30 mentions
one. Eight prior reviews sit in this repository — activity-log, architecture, lean-mean,
interface-lessness, ocean, security, story, scaling — and none of them is this one. And
this review is static, so it does not earn the point either.

---

## Findings

### 1 · HIGH — the landing screen tells a brand-new customer nothing
`web/components/screens/home-screen.tsx:24-27`

The `LINKS` array is two hardcoded entries, Team and Settings. A person who has just
finished signing up sees their team name, "1 member", and those two rows. There is no
welcome, no next step, no mention of Learning or Help (which are in the sidebar), no
mention of importing (which is the first useful outcome), and no mention of the
assistant (which is a floating icon-only button, `agent-host.tsx:42`). Nothing in the
app anywhere says "get started" — I grepped for it.

**Why it matters:** this is the screen the customer sees for the first time and, if it
says nothing, often the last. Criterion 2's landing-screen item is 20 of its 100 points
and it scores zero.

**The fix:** a first-run block on `HomeScreen` — shown while the team has no imported
records — pointing at the one thing that makes the product useful. The *wording is the
owner's* (Tier 3, copy is never mine). The destination is safe under Law R20: the
gateway serves `/t/*` from the deep-link shell (`workers/gateway/src/index.ts:225-227`),
so `/t/<teamId>/import/learning` resolves in a fresh tab as well as in-app.

### 2 · HIGH — 19 of 21 empty states are phrased as an absence, and the library gives them nowhere to put a button
`web/lib/screens.ts:128, 193, 210, 272, 293` and eight other sites

"No members yet." · "No roles yet." · "No invites yet." · "No learning yet." · "No
tickets yet." · "No tokens yet." · "No conversations yet." · "No pending invitations." ·
"No account activity yet." · "No activity yet." (×4) · "No content yet."

Each one is guarded, polite and worthless. On a fresh Admin account the two screens a
customer actually meets empty are **Learning** and **Help**, and both give a dashed box
with four words in it.

**The structural half, which is the real finding:** the library's collection frame
renders `{config.emptyText}` and nothing else
(`node_modules/@swift-struck/ui/registry/collections/collection-frame/collection-frame.tsx:241-247`),
and `emptyText` is typed `string` in `lib/config.ts:226`. **There is no action slot.** A
recipe physically cannot put a button in its empty state. CLAUDE.md is explicit — "Do
not edit the library from here… if a primitive needs changing, surface it; don't fork it
into the host" — so **the in-rule fix is a UI-GAPS entry requesting an `emptyAction`
(ReactNode) on `CollectionConfig`, plus richer `emptyText` copy in the owner's voice.**
Any host-side workaround forks the library and breaks the convention. I am naming this
rather than proposing it silently, per the campaign brief. It is not currently in
`UI-GAPS.md` (I checked; the nearest entries are #7 search/filters and #8 role detail,
both shipped).

### 3 · HIGH — the "Team progress" tab renders a bare table on every new team
`web/components/learning-progress.tsx:48-56`

`items` comes from the team's learning articles, which on day one is `[]`. It goes
straight into `ProgressDashboard`, which unconditionally renders a `<Table>` with a
header row (`node_modules/@swift-struck/ui/registry/collections/progress-dashboard/progress-dashboard.tsx:50-63`).
The file has no zero-row branch. Any Admin clicking "Team progress" on their first day
gets a two-column grid — Member, Done — with one meaningless row and no explanation.

**Why it matters:** it is the only unguarded collection surface in the app (20/21 are
guarded), and it costs criterion 6 its entire 25-point "no empty table with headers"
item. The probe missed it because its `.map()` calls are assigned to consts rather than
written inline in JSX.

**The fix:** a zero-row branch in `learning-progress.tsx` — if `items.length === 0`,
render a sentence instead of the grid. Local, reversible, no new capability. The
sentence itself is the owner's copy.

### 4 · HIGH — the only cold-account test is written to skip the cold account
`web/e2e/team-flows.spec.ts:86-89`

Quoted in full under criterion 8. The test creates a fresh email, signs in, sees
`/onboarding`, and stops — with a message telling the reader to seed a teamful account
instead. So the one automated path that could have found findings 1, 2 and 3 is
configured to walk around them. Playwright is deliberately not installed and the spec
does not run in CI.

**Why it matters:** this is the mechanism by which "everyone testing already has data"
became structural rather than accidental. It is written down, in the repository, as the
intended behaviour.

**The fix:** extend the spec past the skip — complete onboarding, then assert on what
`/home`, `/learning` and `/help` actually say with nothing in them. Tier 2 (real new
test, shown before written).

### 5 · MEDIUM — importing, the first useful outcome, is named nowhere a new customer looks
`web/lib/pages.ts:73`

`{ key: "import", … placement: "contextual" }` — deliberate, and defensible for an
established team. But it means the single action that turns an empty product into a
useful one appears only as a top-right button on three screens the customer has no
particular reason to open. Between the landing screen and that button there is one pure
guess (step 8 of 12).

**The fix is genuinely constrained and I want to be honest about the cost:** changing
`placement` from `"contextual"` to `"sidebar"` would trip **Law R20**, which requires
three things in three workspaces — a page source at `web/app/import/[[...rest]]/page.tsx`,
an entry in `MODULE_SHELLS` (`workers/gateway/src/index.ts:50`, today `["learning","help"]`),
and an entry in `TOP_LEVEL_MODULES` — and Import has no read right of its own (it is
gated per-target), so a sidebar entry would need a synthetic gate. **The cheap in-rule
fix is finding #1's landing-screen prompt instead**, which needs no registry change at all.

### 6 · MEDIUM — a failed team creation leaves the customer pressing the same button
`web/app/onboarding/page.tsx:87-92`, `workers/tenancy/src/index.ts:167-169`

The message is honest and specific ("…team creation is paused." for a missing cloud
key). But the only forward action is Continue again, and there is no way to ask for
help, because Help lives inside a team the customer does not have. A customer on a
misconfigured environment loops on a toast.

**The fix:** a contact route on the onboarding failure branch. The address and the
wording are the owner's (Tier 3).

### 7 · LOW — `BOOTSTRAP.md` contradicts itself about the one step R13 abolished
`BOOTSTRAP.md:190` vs `BOOTSTRAP.md:242`

Line 190: the picker "heals on first open, so you do NOT need to seed it." Line 242:
"After a reset, re-seed the import catalog (§6)." Both about the same catalogue. Law R13
made line 190 true; line 242 was not updated. Overlaps `story_checks_out_review`.

### 8 · LOW — error and not-found screens have no way forward
`web/components/deep-link/screen-bits.tsx:11-25`

"You don't have access to this, or it doesn't exist." · "That screen doesn't exist." ·
"Couldn't load {what}." Three bare sentences with no Home link and no retry. Not on the
sign-up path, so it costs criterion 5 nothing — but a new customer who mistypes a URL is
stranded on a paragraph.

### What is genuinely good, and should not be lost in a repair

- **The sign-up path is excellent** (95/100). Every error branch moves forward, the
  hourly cap rotates the code rather than refusing it, the missing-email-key case refuses
  loudly instead of stranding, onboarding pre-fills on resume, and invitations are
  auto-accepted at bootstrap.
- **Zero crash paths on an empty account**, verified independently of the probe.
- **Defaults are perfect** (100/100). The customer types two words.
- **The import screen is the best first-run screen in the product** — a clear drop zone,
  per-target sample CSVs, "Past imports" hidden rather than shown empty, an honest
  no-rights explanation, and a deterministic planner that works with no AI key at all
  (`import-agent.ts:139-155`).
- **Law R13 is real.** I followed the browser's actual path to the catalogue and it
  reconciles before every read. A fresh environment's picker is not empty.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **A ·** First-run prompt on the landing screen (finding 1) | `web/components/screens/home-screen.tsx` | ADDS a conditional block + one cached read to know whether the team has any records yet | **round_trip_review** — the landing screen is the most-loaded screen in the app and this adds a read to it unless it reuses `totals` already fetched by the shell. **lean_mean** — new UI on a file that is currently 70 lines. **spend_review** — negligible, one extra D1 COUNT per Home load if not reused. Reuse the existing count seam and the round-trip cost goes to zero. |
| **B ·** UI-GAPS entry requesting an `emptyAction` slot on `CollectionConfig` (finding 2) | `UI-GAPS.md` only | ADDS one table row. Changes no code in this repo. | **none** — a documentation row in the file whose purpose is exactly this. The library change itself lands in `swift-struck-ui`, outside this campaign's blast radius. |
| **C ·** Richer empty-state copy for the 19 absence-phrased states (finding 2) | `web/lib/screens.ts`, `selectable-screen.tsx`, `access-tokens.tsx`, `agent-history-dialog.tsx`, `invitations.tsx`, `settings-screen.tsx`, `role-detail.tsx`, `learning-detail.tsx`, `help-detail.tsx` | ADDS words to existing string literals. Adds no branches, no components, no reads. | **story_checks_out / glossary (Law R6)** — every new word must already be a glossary term or it breaks `glossary-wellformed`. **lean_mean** — neutral, string length only. **Copy is Tier 3: the owner writes it, not me.** |
| **D ·** Zero-row branch on the Team progress grid (finding 3) | `web/components/learning-progress.tsx` | ADDS one `if (items.length === 0)` branch and one sentence; REMOVES the bare table | **lean_mean** — three lines, negligible. **realtime_review** — none, the progress read is already a non-live cached read by design. Genuinely the cheapest high-severity fix in this report. |
| **E ·** Extend the e2e past the cold-account skip (finding 4) | `web/e2e/team-flows.spec.ts`, `web/e2e/README.md` | ADDS onboarding completion + assertions on `/home`, `/learning`, `/help` when empty; REMOVES the `test.skip` | **lean_mean** — more test code, and lean_mean scores less code better. **speed_review / CI** — if it is also put in CI it needs Playwright installed and browser binaries downloaded, which the repo deliberately avoids today; that is a real minutes-per-run cost. **mac_fell_in_the_ocean** — helps it (a stranger gains a runnable proof the cold path works). Net: raises robustness, lowers leanness. |
| **F ·** Contact route on the onboarding failure branch (finding 6) | `web/app/onboarding/page.tsx` | ADDS a line of copy and a `mailto:` or link | **base_fork_review** — a hardcoded support address in the base is exactly the client-specific leak that review hunts. It must come from `shared/brand.ts`, not a literal. **security_sentry** — none. |
| **G ·** Reconcile `BOOTSTRAP.md:242` with `:190` (finding 7) | `BOOTSTRAP.md` | REMOVES a stale instruction | **none — a docs-only edit that removes a contradiction; story_checks_out benefits and no code review sees it.** |
| **H ·** Forward action on NoAccess / NotFound / LoadError (finding 8) | `web/components/deep-link/screen-bits.tsx` | ADDS a Home link and a retry to three components | **lean_mean** — small. **dead_end_review** — helps it directly (fewer terminal screens). **round_trip_review** — a retry button invites re-requests on a failing door; it should be a manual retry, never automatic, or it turns one failure into a loop. |
| **I ·** Surface Import in the sidebar (finding 5) — **NOT recommended** | `web/lib/pages.ts`, `web/app/import/[[...rest]]/page.tsx` (new), `workers/gateway/src/index.ts`, `web/components/deep-link/route.ts` | ADDS a page source, a `MODULE_SHELLS` entry, a `TOP_LEVEL_MODULES` entry and a synthetic read gate | **architecture_review** — three registries in three workspaces move for one nav entry. **dead_end_review** — Import has no read right of its own, so a synthetic gate is a permission that enforces nothing, which is precisely what that review flags. **lean_mean** — a new page source for a screen that already exists. Listed for completeness; **fix A achieves the same outcome for a fraction of the blast radius.** |

**Law conflicts, named rather than proposed silently:** fix **C** is bounded by Law R6
(glossary), fix **I** is bounded by Law R20 (static destinations) and would likely
create a `dead_end_review` finding, and the natural fix for finding 2 — putting a button
inside the empty state — **cannot be done in this repository at all** without violating
CLAUDE.md's library-is-lego rule, which is why fix B is a UI-GAPS row and not a code change.

---

## CEILING

**No — 95 is not reachable by changing code alone. The true code-only maximum is ~93.**

Two criteria are capped by something a commit cannot fix:

- **Criterion 4 is permanently capped at 80/100** by a locked decision. Its 20-point item
  is "nothing in that path waits on an email", and the emailed 6-digit code is the only
  sign-in mechanism in the product (`auth-card.tsx` → `sendLoginCode`). Removing the wait
  means adding a second auth factor — a password, a social provider, a magic link that
  arrives in-app — which reopens the own-auth decision in ARCHITECTURE.md. Cost to the
  total: 2.4 points, permanently, unless the owner unlocks it.
- **Criterion 10 (weight 4) cannot be earned by a commit at all.** It asks whether a
  human has walked a fresh account and knows the date. Code cannot supply that. It is,
  however, the cheapest 4 points in this report — one session, one fresh sign-up, one
  dated line in a doc.

Arithmetic for the ceiling, everything else driven to its realistic maximum
(C1 97 · C2 100 · C3 100 · C4 **80, capped** · C5 100 · C6 100 · C7 100 · C8 100 · C9 85 · C10 **0, uncommittable**):

`(97×16)+(100×15)+(100×13)+(80×12)+(100×11)+(100×10)+(100×9)+(100×6)+(85×4)+(0×4)`
`= 1552+1500+1300+960+1100+1000+900+600+340+0 = 9252 → 92.5 → **93**`

With one person walking a fresh account and recording the date (C10 → 100):
`9252 + 400 = 9652 → 96.5 → **97**`.

So: **95 becomes reachable the moment somebody actually signs up.** Not by a commit — by
a session. Which is, precisely, the point of this review.

C9's 85 rather than 100 assumes the "remove sample data in one action" item stays partly
unearned: an undo-this-import-batch capability would collide with "deactivate, never
delete" and would need to satisfy R23 and R24, so it is reachable but genuinely expensive.
C1's 97 rather than 100 keeps the `RESEND_API_KEY` minor, on the view that a fresh
deployment always needs one human step before its first customer.
