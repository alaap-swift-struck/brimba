# First-run review — round 5 — Brimba · 2026-08-26

SCORE: **85/100** (uncapped 85 — the gate did not fire)
(round 1: 62 · round 2: 62 · round 3: 77)

One question: **can a brand-new customer get from signing up to something useful,
alone?**

**The landing screen, in one sentence:** a brand-new owner lands on `/home` and
sees their team name, an "Admin · 1 member" line, and a **Start here** panel
offering three things to do — write an article, import a spreadsheet, invite the
team — above the standing Team and Settings rows; and if the count behind that
panel never comes back, they now get it anyway a beat later instead of a blank
screen.

> **Measured at `review-round5` @ `959c80a`**, read-only. I wrote none of these
> repairs. **This review is STATIC** — the campaign's read-only rule bars both
> `npm run dev` (writes `.next/`) and creating a staging account, so no walk was
> performed by me. `reviews/COLD-WALK-2026-08-25.md` remains the only live
> evidence, and criterion 10 is scored against it, not against a claim.
> `npm run check` was not run (instructed).

---

## 1 · Arithmetic

```
DEFECT criteria    = clamp(0, 100, 100 − Σ penalties)
                     critical 30 · high 15 · medium 7 · minor 3
COVERAGE criteria  = points earned from the criterion's own table
total              = round( Σ (criterion × weight) / Σ weights )   [Σ weights = 100]
GATE               = criterion 1 below 40 caps the total at 40
```

| # | criterion | method | wt | score | × wt |
|---|---|---|---|---|---|
| 1 | Nothing needs a human to seed it (GATE) | defect | 16 | **94** | 1504 |
| 2 | Every empty screen says what to do next | coverage | 15 | **63.1** | 946.5 |
| 3 | Nothing blanks or crashes on zero rows | defect | 13 | **97** | 1261 |
| 4 | The first useful outcome is inside five minutes | coverage | 12 | **60** | 720 |
| 5 | Sign-up to first screen has no dead end | coverage | 11 | **100** | 1100 |
| 6 | Every empty screen says something at all | coverage | 10 | **100** | 1000 |
| 7 | Everything required has a default | coverage | 9 | **100** | 900 |
| 8 | The cold path is tested | coverage | 6 | **95** | 570 |
| 9 | Sample data is offered and removable | coverage | 4 | **45** | 180 |
| 10 | Someone has walked it with a fresh account | coverage | 4 | **90** | 360 |
| | **Σ** | | **100** | | **8541.5** |

`8541.5 / 100 = 85.415 → 85`. **Gate:** criterion 1 = 94 ≥ 40, no cap. Capped and
uncapped are the same figure.

### Delta, criterion by criterion, with the cause named

| # | criterion | w | R3 | **R5** | Δ | cause |
|---|---|---|---|---|---|---|
| 1 | seeding (GATE) | 16 | 94 | **94** | 0 | flat — both minors re-verified standing |
| 2 | says what to do next | 15 | 48 | **63.1** | **+15.1** | **code changed** — the host's action dispatcher gained a default branch and five list recipes gained an `emptyAction` |
| 3 | blanks or crashes on zero rows | 13 | 94 | **97** | +3 | **code changed** (the first-run block no longer fails closed, and a test drives the timer) and *measurement* (round 3's `if (!ctx) return null` minor is a dead-code observation, not a zero-row defect — see §4) |
| 4 | first useful outcome in five minutes | 12 | 60 | **60** | 0 | flat — the signpost is still conditional on `alone`, and widening it was **refused centrally** in `ROUND5-RECONCILIATION.md` §3 |
| 5 | no dead end from sign-up | 11 | 95 | **100** | +5 | **code changed** — the one page with no way off it now keeps its failure reason and offers two forward actions |
| 6 | says something at all | 10 | 100 | **100** | 0 | flat |
| 7 | everything required has a default | 9 | 100 | **100** | 0 | flat |
| 8 | the cold path is tested | 6 | 0 | **95** | **+95** | **code changed** — `web/test/first-run.test.tsx` and `web/test/empty-action.test.tsx` |
| 9 | sample data | 4 | 45 | **45** | 0 | flat |
| 10 | someone has walked it | 4 | 90 | **90** | 0 | flat — no new walk since 2026-08-25 |

**Total: 77 → 85, +8.** Recompute:
`(+15.1 × 0.15) + (+3 × 0.13) + (+5 × 0.11) + (+95 × 0.06) = 2.265 + 0.39 + 0.55 + 5.70 = +8.905`.
`76.51 + 8.905 = 85.42 → 85`. ✓

**Four criteria moved. Three of the four were bought by commits; the fourth is
half a correction.** Nothing regressed, and no criterion moved because I read the
rubric differently from round 3.

---

## 2 · The two percentages, both of them

| | screens that HANDLE zero rows | screens whose empty state NAMES AN ACTION |
|---|---|---|
| probe (mechanical, 16 files) | 12/16 = **75%** (R3: 67%) | 2/16 = **13%** (R3: 13%) |
| **verified by hand (21 surfaces)** | 21/21 = **100%** (R3: 100%) | **9/21 = 43%** (R3: 19%) |

**The mechanical `helpfulPct` still reads 13 and it is still wrong**, for exactly
the reason round 3 gave: the probe looks for an action word near an empty branch
*inside a component file*, and the five that moved this round live in
`web/lib/screens.ts`, which it does not classify as a screen — and the button they
declare is rendered by the library, in `node_modules`. It also files
`import-screen.tsx` under `guardedButSilent` when it is one of the genuinely
helpful ones. The hand count is the measurement; the mechanical one is printed so
the gap is visible rather than hidden.

### The nine helpful empty states

| # | surface | what it offers |
|---|---|---|
| 1 | Members list (`screens.ts:159-181`) | **"Invite"** button, gated `team_members:create` |
| 2 | Roles list (`:235-254`) | **"New role"**, gated `member_roles:create` |
| 3 | Invites list (`:260-279`) | **"Invite"**, gated `team_members:create` |
| 4 | Learning list (`:330-350`) | **"New article"**, gated `learning:create` |
| 5 | Help list (`:358-380`) | **"Raise ticket"**, gated `help:create` |
| 6 | Dropdowns (`selectable-screen.tsx:211`) | "No options yet. **Add your first above.**" |
| 7 | Import (`import-screen.tsx:174-211`) | "Drop your spreadsheets here" + "New to this? Download a sample:" |
| 8 | Assistant (`agent-panel.tsx:157-161`) | "Try *invite a teammate as an Editor*" |
| 9 | Team progress (`learning-progress.tsx:62`) | "No articles yet. **Add one in Articles** and everyone's progress shows up here." |

### The twelve that still name no action

Team / member / invite detail Activity feeds (`screens.ts:149, 226, 320`) ·
help-detail Activity (`:316`) · role-detail Activity (`:240`) · learning-detail
Activity (`:256`) · account Activity (`settings-screen.tsx:109`) · "No tokens
yet." (`access-tokens.tsx:167`) · "No conversations yet."
(`agent-history-dialog.tsx:95`) · "No usage yet today."
(`agent-usage-dialog.tsx:94`) · "No pending invitations." (`invitations.tsx:72`) ·
"No content yet." (`learning-detail.tsx:266`).

**Seven of those twelve are activity feeds, and an activity feed has no action to
name.** That matters for the ceiling and is computed in §9.

---

## 3 · Criterion 2 — the fix I was asked to verify, traced end to end

I was told the `emptyAction` block blamed on the library for three rounds was
never the library's fault, and that both halves are now done **in that order**.
I verified all three claims.

**The library half is real at the version actually installed.**
`node_modules/@swift-struck/ui/package.json` reads `0.16.0`, matching
`web/package.json`'s `#v0.16.0` pin. `collection-frame.tsx:327-328` renders
`{emptyAction}` under the empty text and only when there is nothing to show;
`screen-renderer.tsx:536-541` resolves `recipe.emptyAction` to one of the recipe's
own actions and wraps it in a gated `ActionButton`. *(Round 3 could not confirm
this — the package directory was being reinstalled underneath it. It is confirmed
now.)*

**The host half was the blocker and it is fixed.**
`web/components/deep-link-screen.tsx:293-323` — the `onAction` switch still knows
its four id-carrying cases and now ends in a `default:` that resolves the id
through `createPanelFor(actionId)` and pushes `go(sectionPath, panel)`. An id with
no panel behind it opens nothing rather than a blank one.

**The order was respected, and it is checked.** `web/test/empty-action.test.tsx`
is the strongest test I read in this repository. It does not assert that
`emptyAction` is declared; it renders each real list recipe with `{ rows: [] }`,
**clicks the button**, asserts the id the host receives, resolves that id through
`createPanelFor`, and then scans the host source for the exact condition
(`query.panel === "add" && query.module === "<module>"`) that opens the dialog.
It also asserts the button is **hidden entirely** for a viewer without the create
right.

**The Members recipe using `invites.create` is correct and now provable.** The
host renders exactly four add panels — `invites`, `roles`, `learning`, `help`
(`deep-link-screen.tsx:492, 502, 511, 522`). There is no members add panel, so
`members.create` would have painted a button that opened nothing. The recipe's own
comment says so, and the test's third assertion is what stops anyone "fixing" it
back.

### Scoring

| points | earned | why |
|---|---|---|
| 45 scaled from `helpfulPct` | **19.29** | 9/21 = 42.86% · `45 × 0.4286 = 19.29` |
| 25 · a pressable control, not a sentence | **20** | **up from 15.** Six of the nine helpful states now offer a real control in place: the five engine lists (a gated `ActionButton` inside the empty state, proven by a click) and the import drop zone. The other three — Dropdowns ("above"), Team progress ("in Articles"), the assistant ("Try…") — still *describe* a control that lives elsewhere. Scored 20 rather than 25 for those three, and rather than 16.7 (6/9 scaled) because the five that moved are precisely the screens a new team meets first |
| 20 · the landing screen is among the helpful ones | **20** | held. `home-screen.tsx:140-151` — three pressable `List` rows firing `softNavigate`, naming an article, an import and an invite |
| 10 · wording says what they get, not what is missing | **3.81** | 8/21 = 38.1% · `10 × 0.381 = 3.81`. The five recipe `emptyText` strings, plus import, the assistant and Team progress. Unchanged: the recipe strings were already warm, and this round gave them a button, not new words |
| | **63.10** | |

---

## 4 · Criterion 3 — the fail-open, and the minor I dropped

`riskyOnEmpty: []` again, and again not taken as fact.

**Round 3's medium is closed, and closed carefully.** `home-screen.tsx:65-71`:

```
const [countLate, setCountLate] = React.useState(false)
React.useEffect(() => {
  if (!alone || learningTotal !== undefined) return
  const t = setTimeout(() => setCountLate(true), 1500)
  return () => clearTimeout(t)
}, [alone, learningTotal])
const firstRun = alone && (learningTotal !== undefined ? learningTotal === 0 : countLate)
```

The failure round 3 named was that `primeCacheIfCold` swallows fetch errors, so a
count that never arrives reads `undefined === 0 → false` and a brand-new owner
gets the blank screen the cold walk criticised, with nothing saying so. It now
waits a beat and then shows the guidance anyway. **The beat is the part that is
easy to get wrong and it is not:** answering instantly would flash "Start here" at
every solo owner who already has articles, and `web/test/first-run.test.tsx:132-161`
asserts **both** halves — still hidden at 1.4 s, shown at 1.5 s — by driving fake
timers rather than assuming the answer is synchronous.

**Round 3's other minor is a measurement correction, not a repair.** It charged
−3 for `home-screen.tsx`'s `if (!ctx) return null` being unreachable. That is a
dead-code observation (`lean_mean_review`'s territory), not "blanks or crashes on
zero rows" — and the line now carries a written reason: it is what narrows `ctx`
from `ActiveContext | null`, so removing it costs more optional chaining than it
saves. I do not carry it.

| penalty | −pts | why |
|---|---|---|
| minor | 3 | `web/components/invite-dialog.tsx:62,137` — the role `Select` has no zero-branch. `(roles.find(r => !r.isDefault) ?? roles[0])?.id ?? ""` is optional-chained so nothing throws, but a team with every role deactivated gets an empty picker with a "Role" placeholder and no explanation. Not a first-run hazard (the seed writes Admin and Viewer), which is exactly the rubric's "a guarded case that only looks risky". It is the one remaining unguarded collection a new owner can open — from the Start here panel's own "Invite your team" row |

`100 − 3 = 97`.

---

## 5 · Criterion 5 — the dead end that is gone

Round 3 scored 95, deducting 5 on the 35-point item because *"a failed team
creation's only forward action is pressing the same button, and there is no
support route because Help requires a team."*

`web/app/onboarding/page.tsx` now:

- keeps the reason **on the screen** (`:46` `const [failure, setFailure] = …`,
  `:97` sets it from the `ApiFailure` message), with the comment naming the fault
  it fixes: *"a toast is gone in four seconds — which left a person on the one page
  in the app with no way off it, holding no reason and no next move"*;
- offers **two** forward actions rather than one — Continue retries with the same
  session, and `startOver()` (`:110-114`) signs out with a **full** load, so no
  in-memory identity survives, and returns them to a clean sign-in.

35/35 + 25/25 + 20/20 + 20/20 = **100**. The onboarding, auth-card and login-code
paths are otherwise byte-identical to round 3's baseline.

---

## 6 · Criterion 8 — the largest unmoved item in three rounds has moved

Round 3 called this *"the single largest addressable item on the review"* — weight
6, scoring 0 for a third round, and the only criterion where a first-run
*regression* would go unnoticed.

| points | earned | why |
|---|---|---|
| 50 · a test asserts on a brand-new account's empty screens | **45** | `web/test/first-run.test.tsx` renders the **real** `HomeScreen` against the **real** `store` and `live-resources` with only `@/lib/api` mocked, and covers all four states in the order a person meets them: alone with nothing → the block is there; a second member joins → it is not, **and no request is spent asking**; the first article lands → it goes live via the `total:` sidecar with no re-render by hand; the count never comes back → it fails open after the beat. `web/test/empty-action.test.tsx` adds the other half — every list recipe rendered with zero rows, its button clicked, its dialog proven to exist. **−5** because neither test *signs up*: `web/e2e/team-flows.spec.ts:86-89` still `test.skip`s itself on a fresh account, so nothing walks login → onboarding → home end to end |
| 30 · covers the landing screen, not only the API | **30** | it is the landing screen, rendered |
| 20 · runs in CI, not only by hand | **20** | `npm run check` → `npm test` → the `brimba-web` workspace; `.github/workflows/ci.yml` runs `npm run check`. **Caveat, not a deduction:** CI triggers on `push: branches: [main]` and `pull_request`, and all of round 5 lives on `review-round5` — so nothing has re-run this suite on a clean machine yet |
| | **95** | |

Two details worth keeping, because they are the difference between a test and a
description of one: `first-run.test.tsx` gives every case a **distinct `teamId`**
(the store's cache is module-level and outlives a test), and both files register
`afterEach(cleanup)` by hand because this workspace runs vitest without globals —
without it, "the block is absent" would have passed on a stale node from the
previous test. Both hazards are named in the files' own comments.

---

## 7 · Criteria 1, 4, 6, 7, 9, 10 — re-verified, all flat

**1 · Nothing needs a human to seed it — 94 · GATE.** `seeding.scripts: []`. A
new tenant is created entirely by `POST /api/tenancy/bootstrap`
(`workers/tenancy/src/routes/team.ts:32`), which creates the team, its database
and its seeded roles with no operator step. Both minors stand and I re-read both:

- `BOOTSTRAP.md:213-221` says the import catalogue "**self-heals** … you do NOT
  need to seed it", and `BOOTSTRAP.md:269` still says "After a reset, **re-seed
  the import catalog (§6)**". Third round, same contradiction (−3).
- A login code arrives only by email in every environment
  (`BOOTSTRAP.md:264-265`, `workers/auth/src/lib/email.ts:48`), so `RESEND_API_KEY`
  gates customer number one (−3).

`100 − 6 = 94`.

**4 · The first useful outcome is inside five minutes — 60.** Outcome: the
standing one (24 Aug 2026) — *the customer has imported their first real records
and can see their own data.* Not re-asked.

| points | earned | why |
|---|---|---|
| 40 · named and reachable without help | **35** | named on the landing screen as a pressable row — "Import a spreadsheet — Bring in rows you already have" → `/t/<id>/import/learning`. **−5** because it is named *conditionally*: `home-screen.tsx:42` requires `memberCount === 1`, so an owner who invites a colleague before importing loses the only signpost, and the second person to join has never seen it |
| 30 · step count counted and small | **15** | **11 steps**, unchanged |
| 20 · nothing waits on email / approval / support | **0** | step 3 still leaves the app for an inbox |
| 10 · the same path on every device | **10** | yes |

**The eleven steps:** `/` → `/login` · type email · **leave the app for your
inbox** · type the code · `/onboarding` · first name · last name + "Create my
profile" · lands on `/home` · tap "Import a spreadsheet" in Start here · drop a
file · "Analyze & plan" · "Run import".

**This criterion did not move and could not have.** Widening the signpost past
`alone` is the obvious −5 fix and it was **refused centrally** before any repair
began (`ROUND5-RECONCILIATION.md` §3: *"Would make every established team fetch a
learning total on `/home` to help teams that no longer need help"*). That is a
settled decision, not an open finding, and I am not re-filing it.

**6 · Every empty screen says something at all — 100.** 60 (21/21 = 100% × 60)
+ 25 (no screen renders an empty table with headers — `learning-progress.tsx:56-64`
was the last one and still has its branch) + 15 (loading and empty look
different: `<Skeleton variant="list" />` while `data === undefined`, the dashed
box only once data is `[]`).

**7 · Everything required has a default — 100.** 40 + 30 + 30. The probe's 40
`requiredNoDefault` columns are machine-written without exception —
`email`, `code_hash`, `expires_at`, `token_hash`, `size_bytes`, `table_key`,
`period`, `credits`, `place`, `message`, `label`, `owner`, `route`, `job`, `at`.
The one that looked like a customer value, `teams.name`
(`db/core/0002_teams.sql:7`), is defaulted by the bootstrap:
`createTeam(env, actor, \`${user.firstName ?? "My"}'s team\`, …)`
(`routes/team.ts:47`). A new customer types a first name and a last name. Nothing
else.

**9 · Sample data is offered and removable — 45.** 35 + 10, unchanged.
`GET /api/data-ops/import/sample?tableKey=` still returns a per-target CSV,
surfaced as "New to this? Download a sample:" (`import-screen.tsx:198-211`).
Still no load-demo-data, and an imported sample is indistinguishable from real
data with no undo-this-batch.

**10 · Someone has walked it with a fresh account — 90.** 60/60 for the walk
(`reviews/COLD-WALK-2026-08-25.md`: dated, first-hand, specific enough to be
falsifiable, and corroborated line by line against source in round 3) + 30/40 for
"what it found was fixed". **The held-back 10 is the same 10, for the same
reason:** the walk's central finding is fixed and *the fix has never been walked*.
See §8.

---

## 8 · What only a real human signup can buy — said plainly

**Criterion 10's last 10 points are not purchasable by a commit.** The item is
"a real cold walk-through has happened and the date is known" (60, earned) and
"what it found was fixed, not just noted" (40, of which 30 is earned). The
remaining 10 is my judgement that a fix which has never been observed by a person
on a fresh account is not fully evidenced — and no amount of code closes it,
because the evidence *is* the session.

Worth being precise about what that buys and what it does not, since
`ROUND5-RECONCILIATION.md` §2 records "first_run 95 — needs a real signup" as
**SPENT**:

- **Spent, correctly.** The walk happened. It moved this criterion 0 → 90 in round
  3, worth 3.6 weighted points, and that gain is already inside today's 85. The
  claim that first_run was capped at 95 *for want of a signup* is dead.
- **Not spent.** The last 0.4 weighted points. A second walk — sign up on staging
  with an unused address, land on `/home`, confirm the Start here panel appears,
  then create one article and confirm it disappears — takes this criterion to 100
  and the total from 85.4 to 85.8, i.e. still 85 after rounding. **It is worth
  doing for the truth, not for the score.**
- **What a walk could still find that no test can.** `first-run.test.tsx` proves
  the block renders under jsdom with a mocked network. It cannot tell you whether
  the 1.5-second beat *feels* like a broken screen on a cold 4G connection, whether
  "Start here" reads as guidance or as an advert, or whether the three rows are
  the three things this owner actually wanted. Every one of those is a first-run
  question and none of them is a criterion.

Everything else on this rubric **is** purchasable by a commit. Criterion 8's
missing 5 is an e2e signup test. Criterion 2's missing 37 is empty-state wording
plus the owner's voice. Criterion 9's missing 55 is a demo-data loader. Criterion
1's missing 6 is two documentation edits and one deployment decision.

---

## 9 · Ranked list of what still costs points

| # | item | criterion | worth | the concrete change |
|---|---|---|---|---|
| 1 | **Five empty states could name an action and do not** | 2 · 45-pt item | **~1.6** | Access tokens, saved conversations, credit usage, pending invitations and an article with no content. Four are dialogs the library `CollectionFrame` does not render, so each needs its own branch. Copy is **Tier 3** — the owner's voice |
| 2 | **Sample data cannot be loaded or removed** | 9 | **2.2** | A "load example data" action and an undo-this-batch. Collides with deactivate-never-delete and needs R21/R23 compliance. Recommend, do not build |
| 3 | **Three helpful states describe a control instead of offering one** | 2 · 25-pt item | **0.75** | Dropdowns ("Add your first above"), Team progress ("Add one in Articles") and the assistant's "Try…" could each become a real button. The dropdowns one is a `<Button>` next to text that already exists two lines up |
| 4 | **No test signs up** | 8 | **0.3** | Replace `team-flows.spec.ts:86`'s `test.skip` with a path that completes onboarding, and install Playwright in CI. The expensive half is the CI browser, not the test |
| 5 | **`BOOTSTRAP.md` contradicts itself about seeding** | 1 · minor | **0.48** | Delete "re-seed the import catalog (§6)" from `:269`, or make §6 say the reset path differs. One line |
| 6 | **`RESEND_API_KEY` gates customer one** | 1 · minor | **0.48** | A deployment fact, not a code one: the key must be set before the first customer, and BOOTSTRAP should say that in §7 rather than in a parenthesis |
| 7 | **The invite dialog's role picker has no zero-branch** | 3 · minor | **0.39** | Three lines: if `roles.length === 0`, say so and point at Roles |
| 8 | **The signpost is conditional on being alone** | 4 | **0.6** | **SETTLED — do not re-file.** Refused in `ROUND5-RECONCILIATION.md` §3 |
| 9 | **The e-mail round trip** | 4 · 20-pt item | **2.4** | Would reopen the own-auth decision in ARCHITECTURE.md. Not a finding |
| 10 | **A second cold walk of the fixed flow** | 10 | **0.4** | A session, not a change. See §8 |

---

## 10 · Fix impact map

| Fix | Files | ADDS / REMOVES | Which other review it could damage |
|---|---|---|---|
| **F1** action-naming empty states in the five dialogs | `access-tokens.tsx`, `agent-history-dialog.tsx`, `agent-usage-dialog.tsx`, `invitations.tsx`, `learning-detail.tsx` | ADDS ~5 branches | **`lean_mean_review`** — five near-identical branches; hoist a shared `EmptyState` or it is five chances to drift. **`dead_end_review`** improves. **`security_sentry_review`** — each button must be gated the way `CollectionFrame` gates `emptyAction`, or a viewer is invited to press something they will be refused |
| **F2** demo data load + remove | new worker route + UI | ADDS a create path and a bulk deactivate | **`security_sentry_review` / `scaling_review` / `lean_mean_review`** all materially. It collides with deactivate-never-delete, needs R21/R23 compliance, and a "remove everything I loaded" door is a mass-delete by any other name. **Recommend, do not build** |
| **F3** turn the three describing states into controls | `selectable-screen.tsx`, `learning-progress.tsx`, `agent-panel.tsx` | ADDS 3 buttons | **`dead_end_review`** improves. **`first_run_review` itself** is damaged if any of the three is ungated — the same ordering trap this round just fixed. `agent-panel`'s "Try…" is a *prompt*, so making it pressable spends the team's AI quota on a tap: **`spend_review`** |
| **F4** an e2e that completes onboarding | `web/e2e/team-flows.spec.ts`, CI | ADDS a browser to CI | **`speed_review` (CI)** — a Playwright install and a browser run on every PR, minutes not seconds. **`security_sentry_review`** — it needs the staging `TEST_LOGIN_KEY` in CI secrets, which is a real key in a new place. This is the only fix on the list with a genuine cost |
| **F5** the `BOOTSTRAP.md` line | `BOOTSTRAP.md` | REMOVES a contradiction | none — helps `story_checks_out_review`; it is their finding as much as mine |
| **F6** `RESEND_API_KEY` in the runbook | `BOOTSTRAP.md` | REMOVES an implicit prerequisite | none |
| **F7** the invite dialog's zero-branch | `invite-dialog.tsx` | ADDS one branch | none — it is three lines and touches no request |
| **F8** a second cold walk | none | ADDS evidence | none — it is the only item here that cannot break anything |

---

## 11 · Things no rubric asked about

**A · The order really was the whole safety, and it is now the thing being
protected.** `ROUND5-RECONCILIATION.md` settled that the dispatcher's default
branch must land *before* the recipes declared `emptyAction`, "or it ships five
inert buttons on first-run screens". What actually shipped is stronger than the
ordering: `empty-action.test.tsx` makes the order **unrepeatable as a mistake** —
a recipe declaring an `emptyAction` the host cannot open now fails CI. A
sequencing rule enforced by a check stops being a sequencing rule.

**B · One line of the fix has no test and is load-bearing.**
`deep-link-screen.tsx:319` pushes `go(sectionPath, panel)` — `sectionPath`, not
`currentPath`, "because the new record belongs to the collection, not to whatever
record is open". `empty-action.test.tsx` asserts the *source contains*
`go(sectionPath, panel)`; nothing exercises it. Change that identifier to
`currentPath` and every test stays green while creating from an empty list inside
a record detail pushes the panel onto the wrong URL.

**C · CI runs Node 22; `package.json` demands `>=24`.** `.github/workflows/ci.yml`
pins `node-version: 22` against `"engines": { "node": ">=24.0.0" }`. Every number
in §6's "runs in CI" claim is true on a runtime the manifest says is unsupported.

**D · CI does not watch this branch.** `ci.yml` triggers on `push: branches:
[main]` and `pull_request`. Round 5 is entirely on `review-round5`, so the
first-run suite has never run anywhere except a laptop.

**E · The signpost's cheapest weakness is not the `alone` condition.**
`home-screen.tsx:90` builds the import row as
`teamId ? \`/t/${teamId}/import/learning\` : "/learning"`. On the one screen where
`teamId` is guaranteed present this is dead defensive code; but if it ever were
null, the person following "Import a spreadsheet" lands on the Learning list with
no import in sight and no error — a silent redirect to the wrong place. The same
shape as `dead_end_review`'s teamless `recordPath` finding, on the first-run path.

**F · A ticket raised by the assistant has an empty "Raised from" row.** The web
form now auto-fills `sourceScreen` from the breadcrumb; neither help tool's schema
carries the field (`shared/workers/tool-catalog.ts:412, 420`). A new customer who
asks the assistant to raise their first ticket gets a ticket that displays a
labelled, empty row — the first thing they will have created in the product.
Cross-ref `dead_end_review` finding 4.

---

## 12 · Ceiling

**95 is reachable, and it needs one thing the rubric does not let a commit buy —
but only 0.4 of a point's worth.** The honest arithmetic:

| criterion | realistic max | what holds it |
|---|---|---|
| 1 · seeding | 97 | the `RESEND_API_KEY` minor is a deployment prerequisite, not a bug; the doc contradiction is free |
| 2 · says what to do next | **81.7 — a real cap** | see below |
| 3 · zero rows | 100 | free |
| 4 · five minutes | **80 — locked** | the 20-point item is "nothing waits on an email", and an emailed 6-digit code is the only sign-in mechanism (ARCHITECTURE.md, own-auth) |
| 5 · no dead end | 100 | already there |
| 6 · says something | 100 | already there |
| 7 · defaults | 100 | already there |
| 8 · cold path tested | 100 | an e2e signup, at the price of a browser in CI |
| 9 · sample data | 85 | the rubric allows a documented deliberate absence; nothing documents it today |
| 10 · walked | **90 — needs a session** | see §8 |

**Criterion 2's cap is new to this round and it is arithmetic.** Its 45-point item
scales from `helpfulPct`, and seven of the 21 collection surfaces are **activity
feeds** — a timeline with nothing on it has no action to offer, only wording. The
reachable numerator is therefore 14, not 21:

```
45 × (14/21) = 30.0   +   25 (all controls in place)   +   20 (landing screen)
+ 10 × (14/21) = 6.67
= 81.7
```

Round 3's ceiling put criterion 2 at 100 and I do not think that is achievable
without counting a sentence as an action.

```
(97×16)+(81.7×15)+(100×13)+(80×12)+(100×11)+(100×10)+(100×9)+(100×6)+(85×4)+(90×4)
= 1552 + 1225.5 + 1300 + 960 + 1100 + 1000 + 900 + 600 + 340 + 360
= 9337.5  →  93.4  →  93
```

**True maximum: about 93**, against round 3's projected 96. The difference is
entirely criterion 2's denominator, and it is 2.7 points that no commit can buy
because an activity feed has nothing to ask of you. Three things hold the last
seven points, and only one of them is code:

1. **The emailed sign-in code — 2.4 points, permanently.** Removing the wait
   reopens a locked decision.
2. **Criterion 2's activity feeds — 2.7 points, permanently**, unless the rubric's
   denominator is read as "collection screens that *have* an action".
3. **The second cold walk — 0.4 points**, and it is a session.

---

## Verdict

**A brand-new customer lands on `/home`, is told what the product is for by a
Start here panel that now appears even when the count behind it fails, and finds a
real, gated, working button waiting on every empty list they open — because the
host learned to dispatch a create before any recipe was allowed to offer one.**
What is left is quieter: five dialogs that still say what is missing instead of
what to do, a sample CSV with no way to load or unload it, and a runbook that in
one paragraph tells a new operator to seed a catalogue that the paragraph above
says seeds itself.
