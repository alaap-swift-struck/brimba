# First-run review — round 3 — Brimba · 2026-08-25
SCORE: **77/100**   (round 1: 62 · round 2: 62)

Branch `review-campaign` @ `256d21b`. Read-only: nothing edited but this file.
Scratch in `scratchpad/d3-*`.

**This review is STATIC — but for the first time it is not the only evidence.**
`reviews/COLD-WALK-2026-08-25.md` records a real cold signup on staging by the
owner, and criterion 10 finally has something behind it. I did not walk one
myself; the campaign's read-only rule bars both `npm run dev` (writes `.next/`)
and creating a staging account.

---

## DELTA

**No criterion went DOWN.** Five went up. Every rise traces to a repair, and the
two largest ones (criteria 6 and 10) are answers to findings this review filed
twice and saw ignored twice.

| # | Criterion | w | R1 | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|---|
| 1 | Nothing needs a human to seed it (GATE) | 16 | 94 | 94 | **94** | Flat. `git diff bf5d07c..HEAD` is empty for `BOOTSTRAP.md`, `team-schema.ts`, `team.ts` and `import.ts`. Both minors stand: the `BOOTSTRAP.md` contradiction, and `RESEND_API_KEY` (`workers/auth/src/index.ts:184`) still gating customer one. |
| 2 | Every empty screen says what to do next | 15 | 22 | 22 | **48** | **+26.** The landing screen is now among the helpful ones (0→20 on that item), Team progress became a fourth helpful empty state (6→9), and five recipe strings now say what the screen will hold (1→4). The 45-point item is still the floor: 4 of 21. |
| 3 | Nothing blanks or crashes on zero rows | 13 | 82 | 82 | **94** | **+12.** The Team-progress bare grid — a `high` (−15) in both prior rounds — is guarded. One old minor stands, one new one added (below). |
| 4 | First useful outcome inside five minutes | 12 | 40 | 40 | **60** | **+20.** The outcome is now *named* on the landing screen ("Import a spreadsheet — bring in rows you already have"), and the unguided guess at step 8 is gone: 12 steps → **11**. Still one email round-trip, so the 20-point item is still 0. |
| 5 | Sign-up to first screen has no dead end | 11 | 95 | 95 | **95** | Flat. `web/app/onboarding/`, the auth card and the login-code path are byte-identical to `bf5d07c`. |
| 6 | Every empty screen says something at all | 10 | 72 | 72 | **100** | **+28.** 21/21 guarded, and the one screen that rendered an empty table with headers now does not. |
| 7 | Everything required has a default | 9 | 100 | 100 | **100** | Flat. |
| 8 | The cold path is tested | 6 | 0 | 0 | **0** | Flat. `web/e2e/team-flows.spec.ts:86` still `test.skip(...)` on a fresh account. ~207 new lines of `web/test/store.test.ts` landed this round; not one asserts what a screen says with nothing in it. |
| 9 | Sample data is offered and removable | 4 | 45 | 45 | **45** | Flat. `import-screen.tsx:199-201` unchanged; still no load-demo-data, still no undo-this-batch. |
| 10 | Someone has walked it with a fresh account | 4 | 0 | 0 | **90** | **+90.** `reviews/COLD-WALK-2026-08-25.md`. Dated, first-hand, specific — and its central finding was fixed rather than noted. Ten points held back because the fix has not itself been walked. |

**Did another review's repair break mine?** No. I checked the three that touched
files I score — `256d21b` (`web/lib/store.ts`), `ae42924` (`home-screen.tsx`,
`learning-progress.tsx`, `screens.ts`) and `a6d571e` (screen-override removal) —
and every one of them either helped or was neutral. The screen-override removal
took a config panel, not a collection surface, so the 21-surface denominator is
unchanged and the delta is real.

---

## What I was asked to verify

### 1 · The cold walk — REAL, and I corroborated it against the code

`reviews/COLD-WALK-2026-08-25.md`, committed in `12afe78`. It is prose, not
image files — there are no `.png`s in `reviews/` and no image references in the
document, so what is in the repository is the owner's written account of three
screens they captured, not the captures. I therefore checked its claims against
source rather than taking them:

| the walk says | the code says |
|---|---|
| "Welcome to Brimba" | `web/components/temp/auth-card.tsx:71` — `Welcome to {brand.name}` ✓ |
| `Change email` / `Resend code` beneath | same file ✓ |
| "Set up your profile" | `web/app/onboarding/page.tsx` ✓ |
| "Tell us who you are — your team gets created right after." | same file ✓ |
| button reads "Creating your team..." while it works | same file ✓ |
| home shows an "Admin · 1 member" line and exactly two cards | `home-screen.tsx:110-113` (`{ctx.role.title}` badge + `{ctx.memberCount} member`), `LINKS` = Team, Settings ✓ |

Every detail checks out, including one I nearly mis-scored: my first grep for the
literal string `"Welcome to Brimba"` returned **zero**, because the app composes
it from `brand.name`. A zero result is a hypothesis — the campaign brief's own
warning, met in the first ten minutes of this run.

**Scoring it 90, not 100.** 60/60 for the walk itself: it happened, the date is
known, it is first-hand and its findings are specific enough to be falsifiable.
30/40 for "what it found was fixed": the walk's central finding — *"the bottom
two-thirds of the screen is empty… nothing says what to do first"* — is fixed by
the `Start here` block. The 10 held back is not pedantry: **the fix has never
been walked**, and I found one behaviour in it that only a walk would settle (see
finding 2 below).

### 2 · The `Start here` block — REAL, and it costs an established team nothing

`web/components/screens/home-screen.tsx:41-56, 118-131`.

```
const alone = ctx?.memberCount === 1
React.useEffect(() => {
  if (teamId && alone) primeCacheIfCold(`learning:${teamId}`, () => listFetch.learning(teamId))
}, [teamId, alone])
const learningTotal = useCachedValue<number>(alone && teamId ? totalKey("learning", teamId) : null)
const firstRun = alone && learningTotal === 0
```

Traced end to end, because "shows only for a new team" and "costs nothing" are
both claims that could quietly be false:

- **Zero requests for an established team.** `memberCount` is already on the
  session context, and `alone` short-circuits before any fetch. A team of two
  never asks the second question. Confirmed.
- **The count is real and it does arrive.** `listFetch.learning`
  (`live-resources.ts:126-131`) primes `totalKey("learning", teamId)` in the same
  round trip, so the sidecar the block reads is filled by the prewarm it fires.
  I specifically checked the collision case: `useTeamPrewarm` does **not**
  prewarm `learning:` (its own comment says so — "module-scoped, may never be
  visited"), so nothing warms that key with a poorer fetcher first and leaves the
  total blank. This was the most plausible way for the whole block to silently
  never render, and it does not happen.
- **It disappears without a refresh.** `useCachedValue` is a real
  `useSyncExternalStore` subscription (`store.ts:~278`), and `app-shell.tsx:137-141`
  bumps the `total:` sidecar on an `add` ping. Verified in the realtime pass.
- **It is honest about not knowing.** `undefined` (not loaded) is not `0`, so it
  shows nothing rather than flashing a welcome and withdrawing it.
- **All three offers are ones an admin may make**, and the only person who can be
  alone in a team is the one who created it, so nobody is shown an action they
  would be refused. And `/t/<id>/import/learning` resolves —
  `deep-link-screen.tsx:352` accepts `import` as a section.

### 3 · Team progress has a real zero-row state — VERIFIED

`web/components/learning-progress.tsx:56-64`. `items.length === 0` renders a
dashed panel reading *"No articles yet. Add one in Articles and everyone's
progress shows up here."* That closes the criterion-3 `high` and the 25-point
criterion-6 item in one change, and the copy names a way out — which makes it the
fourth helpful empty state in the app.

### 4 · The five `emptyText` strings — VERIFIED, and they move the right item

`web/lib/screens.ts:149, 214, 231, 293, 314`:

```
"No members yet."   -> "Everyone on your team appears here, with the role each one holds."
"No roles yet."     -> "A role decides what a member can see and do. Your team's roles appear here."
"No invites yet."   -> "Invites you send appear here, so you can see who hasn't joined yet."
"No learning yet."  -> "Your team's how-to articles appear here, ready for anyone to read."
"No tickets yet."   -> "Questions and requests your team raises appear here, each with its status."
```

They are role-neutral (true for a viewer as well as an admin) and they say what
the screen will hold. **They do not name an action**, so they move criterion 2's
10-point item and not its 45-point one. That distinction is the whole reason this
rubric splits `guardedPct` from `helpfulPct`, and it should not be blurred: the
app went from careful-and-cold to careful-and-warm, not from cold to actionable.

### 5 · `emptyAction` deliberately not wired — I agree with the decision, and disagree with one of its two reasons

I verified the claim rather than accepting it, in both repositories.

**The library half is exactly as described.** `swift-struck-ui`
`registry/collections/screen-renderer/screen-renderer.tsx:536-541`:
`recipe.actions.find((a) => a.id === recipe.emptyAction)` → an `ActionButton`.
`registry/collections/slots.test.tsx:313-320` is titled "fires the recipe's
action, by id". So `emptyAction` fires `onAction(id)` into the host.

**The host half is exactly as described.** `web/components/deep-link-screen.tsx:292-309`
is a four-case switch — `members.changeRole`, `members.remove`, `invites.revoke`,
`team.edit` — **with no default branch**. None is a create.

So: a `create` action declared in a recipe today renders a button that does
nothing when pressed, on the one screen a brand-new team is guaranteed to meet.
**Not shipping that was right.** An inert control on a first-run screen is
strictly worse than good prose, and the judgement to wait is the correct one.

**But the stated reason "it would build a second, duplicate create path" is not
accurate**, and it matters because it is the reason that makes the wait sound
permanent rather than pending. Routing `onAction("learning.create")` to
`go(sectionPath, { panel: "add", module })` — the call `SectionWithCreate.onCreate`
already makes — is not a duplicate path; it is a second **door onto the same
path**, which is what `onAction` already is for the other four ids. The
`screens.ts` comment says this itself two paragraphs later ("the slot lands the
moment the host gains a case per create… and not before"), so the file contains
both the weak reason and the accurate one.

**One argument actually runs the other way.** `slots.test.tsx:288-303` asserts the
library *hides* the empty-state button from someone without the right. The prose
empty state cannot do that — it is shown to everyone identically. Today's copy
sidesteps the problem by being role-neutral, which is deliberate and works; but
"a sentence telling someone to press a button their role hides" is a hazard the
library slot solves and prose can only avoid.

**Net:** correct call, one wrong reason, and it is the largest single lever left
on this review — criterion 2's 45-point item is 4/21 and nothing else moves it.

---

## Arithmetic

`total = round( Σ (criterion × weight) / 100 )`. Defect criteria:
`clamp(0,100, 100 − Σ penalties)`, critical 30 · high 15 · medium 7 · minor 3.

| # | criterion | weight | score | × weight |
|---|---|---|---|---|
| 1 | Nothing needs a human to seed it (GATE) | 16 | 94 | 1504 |
| 2 | Every empty screen says what to do next | 15 | 48 | 720 |
| 3 | Nothing blanks or crashes on zero rows | 13 | 94 | 1222 |
| 4 | First useful outcome inside five minutes | 12 | 60 | 720 |
| 5 | Sign-up to first screen has no dead end | 11 | 95 | 1045 |
| 6 | Every empty screen says something at all | 10 | 100 | 1000 |
| 7 | Everything required has a default | 9 | 100 | 900 |
| 8 | The cold path is tested | 6 | 0 | 0 |
| 9 | Sample data is offered and removable | 4 | 45 | 180 |
| 10 | Someone has walked it with a fresh account | 4 | 90 | 360 |
| | **Σ** | **100** | | **7651** |

`7651 / 100 = 76.51 → 77`. **Gate:** criterion 1 = 94 ≥ 40, no cap. Capped and
uncapped are the same figure.

### The two percentages, both of them

| | screens that HANDLE zero rows | screens whose empty state NAMES AN ACTION |
|---|---|---|
| probe (mechanical, 15 files) | 10/15 = **67%** (R2: 63%) | 2/15 = **13%** (R2: 13%) |
| verified by hand (21 surfaces) | 21/21 = **100%** (R2: 95%) | 4/21 = **19%** (R2: 14%) |

**The mechanical `helpfulPct` did not move at all**, and that is worth saying
rather than hiding behind the hand count: the probe looks for an action word near
an empty branch *inside a component file*, and five of this round's rewrites live
in `web/lib/screens.ts`, which it does not classify as a screen. It also misses
`learning-progress.tsx` entirely and files `import-screen.tsx` as
"guardedButSilent" when it is one of the four genuinely helpful ones. The hand
count is the measurement; the mechanical one is shown so the gap is visible.

**The four helpful empty states in the whole app:**

1. `web/components/selectable-screen.tsx:198` — "No options yet. **Add your first
   above.**"
2. `web/components/agent-panel.tsx:157-161` — "Try *invite a teammate as an
   Editor*"
3. `web/components/import-screen.tsx:174-211` — "Drop your spreadsheets here"
   plus "New to this? Download a sample:"
4. **`web/components/learning-progress.tsx:60` (new)** — "No articles yet. **Add
   one in Articles** and everyone's progress shows up here."

The 17 that still name no action: the five rewritten recipe strings (now warm but
still passive) · "No tokens yet." (`access-tokens.tsx:142`) · "No conversations
yet." (`agent-history-dialog.tsx:95`) · "No pending invitations."
(`invitations.tsx:72`) · "No account activity yet." (`settings-screen.tsx:109`) ·
"No activity yet." ×4 · and the remainder.

### Criterion 1 · seeding — 94 · defect · GATE

Unchanged and re-verified by diff, not by re-reading: `bootstrap`
(`workers/tenancy/src/routes/team.ts`), `buildTeamSeed`
(`workers/tenancy/src/team-schema.ts`) and `getActiveCatalog`
(`workers/data-ops/src/lib/import.ts`) are all byte-identical to `bf5d07c`, so
R2's verification stands without re-litigation. `seeding.scripts: []`.
Penalties: 2 × minor = 6 (the `BOOTSTRAP.md` contradiction; `RESEND_API_KEY`).
`100 − 6 = 94`.

### Criterion 2 · says what to do next — 48 · coverage

| points | earned | why |
|---|---|---|
| 45 scaled from `helpfulPct` | **9** | 4/21 = 19.0% · `45 × 0.190 = 8.6` |
| 25 · a pressable control, not a sentence | **15** | unchanged: the create button is on screen when the list is empty (`deep-link/screen-bits.tsx:63-100`), but it sits top-right while the empty state sits centre. The library slot that would put it *in* the empty state now exists and is deliberately unwired (§5). |
| 20 · the landing screen is among the helpful ones | **20** | **earned.** `home-screen.tsx:118-131` — three rows, each a pressable `List` item firing `softNavigate`, naming an article, an import and an invite. |
| 10 · wording says what they get, not what is missing | **4** | 8/21 = 38.1% · `10 × 0.381 = 3.8`. The five rewrites + import + agent-panel + learning-progress. |

### Criterion 3 · blanks or crashes on zero rows — 94 · defect

`riskyOnEmpty: []` again, and again not taken as fact. The new code was read:
`home-screen.tsx` guards on `ctx?.memberCount` and `learningTotal === 0`, both
of which are `undefined`-safe; `learning-progress.tsx` now has the branch it
lacked.

| penalty | −pts | why |
|---|---|---|
| ~~high~~ | ~~−15~~ | **cleared** — the Team-progress grid no longer renders bare headers |
| minor | −3 | `home-screen.tsx:56` `if (!ctx) return null` is unreachable — `deep-link-screen.tsx:365` renders `ShellLoading` whenever `!active.ctx`. Carried from R1/R2. |
| minor | −3 | **new.** The first-run block fails *closed to the pre-fix screen*. `primeCacheIfCold` swallows fetch errors by design, so if that one `GET /api/content/learning` fails, `learningTotal` stays `undefined`, `firstRun` is false, and a brand-new owner silently gets the blank `/home` the cold walk criticised — with nothing to indicate anything was meant to be there. Not a crash and not a blank screen, so minor; worth naming because it is a failure mode inside the repair itself. |

`100 − 6 = 94`.

### Criterion 4 · first useful outcome inside five minutes — 60 · coverage

Outcome: the standing one — **the customer has imported their first real records
and can see their own data.** Not re-asked.

| points | earned | why |
|---|---|---|
| 40 · named and reachable without help | **35** | **now named**, on the landing screen, as a pressable row: "Import a spreadsheet — Bring in rows you already have, instead of typing them one by one" → `/t/<id>/import/learning`. −5 because it is named *conditionally*: the block requires `memberCount === 1`, so an owner who invites a colleague before importing loses the signpost, and the second-ever visitor never sees it. |
| 30 · step count counted and small | **15** | **11 steps** (was 12), and the one that was a guess is gone. |
| 20 · nothing waits on email / approval / support | **0** | step 3 still leaves the app for an inbox. |
| 10 · same path on every device claimed | **10** | yes. |

**The eleven steps**, on R2's own enumeration so the comparison is like-for-like:
`/` → `/login`, type email → **leave the app for your inbox** → type the code →
`/onboarding` → first name → last name + "Create my profile" → lands on `/home`
→ **tap "Import a spreadsheet" in Start here** → drop a file → "Analyze & plan"
→ "Run import". R2's step 8 — *"guess: click Learning"* — and step 9 — *"hunt for
Import CSV in the top right"* — collapse into one signposted tap.

### Criterion 5 · no dead end from sign-up to first screen — 95 · coverage

35/35→30 · 25/25 · 20/20 · 20/20. Unchanged and unexamined-for-change beyond a
diff: nothing in `web/app/onboarding/`, `web/components/temp/auth-card.tsx` or
`workers/auth/src/lib/login-codes.ts` has moved since `bf5d07c`. The 5 deducted
remain: a failed team creation's only forward action is pressing the same button,
and there is no support route because Help requires a team.

### Criterion 6 · says something at all — 100 · coverage

60 (21/21 = 100% × 60) + **25** (no screen renders an empty table with headers —
the Team-progress grid was the last one) + 15 (loading and empty look different:
`<Skeleton variant="list" lines={4} />` while `data === undefined`, the dashed
box only once data is `[]`).

### Criterion 7 · everything required has a default — 100 · coverage

40 + 30 + 30. Unchanged. The customer types a first name and a last name. The
probe's 40 `requiredNoDefault` columns are all machine-written (`email`,
`code_hash`, `expires_at`, `token_hash`, `size_bytes`…); not one is a value a
customer types.

### Criterion 8 · the cold path is tested — 0 · coverage

0 + 0 + 0. `web/e2e/team-flows.spec.ts:86-89` verbatim unchanged:

```
test.skip(
  page.url().includes("/onboarding"),
  "Fresh account has no team; seed a teamful test account (or complete onboarding + create a team) to exercise this flow."
)
```

Playwright is still not installed and the spec still does not run in CI. **This
is now the single largest addressable item on the review** — weight 6, scoring 0
for the third round running, and the only criterion where a first-run *regression*
would go unnoticed. The `Start here` block is a conditional render behind a cache
read, with the silent-failure path described above; nothing in the suite asserts
it appears for a solo team with no articles, or disappears when the first one
lands.

### Criterion 9 · sample data offered and removable — 45 · coverage

35 + 10. Unchanged: `GET /api/data-ops/import/sample?tableKey=` still returns a
per-target CSV, surfaced as "New to this? Download a sample:". Still no
load-demo-data, and an imported sample is indistinguishable from real data with
no undo-this-batch.

### Criterion 10 · someone has walked it with a fresh account — 90 · coverage

60 + 30. See §1. The first non-zero this criterion has ever scored here.

---

## Findings

### HIGH — nothing tests the cold path, and the newest first-run code is the most conditional in the app

Criterion 8. `web/e2e/team-flows.spec.ts:86` skips itself on a fresh account.
The `Start here` block renders only when `memberCount === 1` **and** a cache
sidecar equals `0` — two conditions, one of them filled by a fire-and-forget
prewarm. That is precisely the shape that regresses silently.
**Fix (Tier 2):** a test that asserts (a) the block renders for a solo team with
zero articles, (b) it does not render for a team of two, (c) it disappears when
`total:learning:<id>` becomes 1. That is a component test, not an e2e run, so it
does not require installing Playwright.

### HIGH — 17 of 21 empty states still name no action

Criterion 2's 45-point item, 4/21. The library slot that fixes it shipped in
v0.16.0 and is deliberately unwired for a reason that is correct today
(`deep-link-screen.tsx:292-309` has no create case) and removable in a few
lines. **Fix (Tier 2/3):** add a `create` case per module to the host dispatcher
routing to the `go(sectionPath, { panel: "add", module })` that
`SectionWithCreate.onCreate` already calls, then declare `emptyAction` on the
five list recipes. Copy for the buttons is Tier 3 — the owner's voice.

### MEDIUM — the first-run block fails closed, silently, to the screen it replaced

Criterion 3's new minor. `primeCacheIfCold` swallows errors by design, so one
failed `GET /api/content/learning` on the very first load leaves a new owner on
the old blank `/home` with no indication anything is missing.
**Fix (Tier 1):** treat a *failed* total differently from an *unknown* one, or
fall back to `firstRun = alone && learningTotal !== undefined ? learningTotal === 0 : true`
for a solo team — a team of one that cannot count its articles is a new team far
more often than not.

### MEDIUM — the signpost is conditional on being alone

Criterion 4. An owner who invites a colleague before importing loses the only
place the product names what to do, and the second person to join has never seen
it. **Fix (Tier 2/3):** widen the condition to "no articles yet" rather than
"alone and no articles", or keep a dismissible version. Wording is the owner's.

### MEDIUM — `BOOTSTRAP.md` still contradicts itself; `RESEND_API_KEY` still gates customer one

Criterion 1's two minors, third round. Not re-argued — carried forward from
`first-run-r2.md`.

### LOW — sample data cannot be removed in one action

Criterion 9, unchanged. Genuinely expensive (it collides with
"deactivate, never delete" and would have to satisfy R23), so it stays
recommended rather than pressed.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| First-run component test (crit 8) | `web/test/first-run.test.tsx` (new, ~70 lines) | +1 test file | **`lean_mean_review`:** +70 lines against a leanness score, and it is the third test file added to `web/test/` this campaign. **`speed_review` (CI):** negligible — a component test, no browser. Nothing else: it asserts, it does not ship. |
| Host dispatcher gains a create case per module (crit 2) | `web/components/deep-link-screen.tsx` (~15 lines) | +5 switch cases | **`lean_mean_review`:** +15 lines, but it also *removes* the "no default branch" hazard, so a mis-typed action id would stop failing silently. **`architecture_review`:** none — it routes to a call the host already makes, so no new coupling. **`dead_end_review`:** strictly helps. |
| Declare `emptyAction` on five recipes (crit 2) | `web/lib/screens.ts` (5 lines + 5 action defs) | +5 recipe actions | **`security_sentry_review`:** none, and arguably positive — the library gates the button on the recipe's own `right`, so a viewer stops being shown an invitation to act. **Must land AFTER the dispatcher fix**, or it ships five inert buttons on first-run screens. |
| Fail-open the first-run block (crit 3) | `web/components/screens/home-screen.tsx` (~3 lines) | changes a default, adds no request | **`round_trip_review` / `spend_review`:** none — same one prewarm either way. Small risk of showing the welcome to a solo team that *does* have articles when the network is down; that is the better error. |
| Widen the signpost condition (crit 4) | `home-screen.tsx` (1 line) | +1 request for a multi-member team with no articles | **`round_trip_review` / `spend_review`:** this one has a real cost — `alone` is currently what keeps an established team at zero extra requests. Widening it to "no articles yet" makes every team fetch the learning total on `/home`. Mitigated by the fact that `total:learning:` is already primed for anyone who has opened Learning. Price it before doing it. |
| Fix the `BOOTSTRAP.md` contradiction | `BOOTSTRAP.md` (a few lines) | −1 contradiction | **`story_checks_out_review`:** strictly helps — it is their finding as much as mine. |
| Load/remove demo data (crit 9) | new worker route + UI | +a create path and a bulk deactivate | **`security_sentry_review` / `scaling_review` / `lean_mean_review`:** all three, materially. It collides with "deactivate, never delete" and needs R21/R23 compliance. Recommend, do not build. |

---

## CEILING

**Yes, 95 is reachable by changing code — and that is a change from round 2,
which said it was not.** R2's ceiling rested on criterion 2 being capped at 90
because `@swift-struck/ui` had no way to put a control in an empty state.
**v0.16.0 shipped `emptyAction`.** That cap is gone. The library gap R2 called
permanent is now a host decision.

Two caps remain, and neither blocks 95:

- **Criterion 4 is capped at 80** by a locked decision. Its 20-point item is
  "nothing in that path waits on an email", and an emailed 6-digit code is the
  only sign-in mechanism in the product; removing the wait reopens the own-auth
  decision in ARCHITECTURE.md. Cost: 2.4 points, permanently.
- **Criterion 10 cannot be raised past 90 by a commit** — the remaining 10 needs
  a person to walk the *fixed* flow. That is a session, not a change. Cost: 0.4.

Everything else at its realistic maximum
(C1 97 · C2 100 · C3 100 · C4 **80 capped** · C5 100 · C6 100 · C7 100 ·
C8 100 · C9 85 · C10 **90 capped**):

```
(97×16)+(100×15)+(100×13)+(80×12)+(100×11)+(100×10)+(100×9)+(100×6)+(85×4)+(90×4)
= 1552+1500+1300+960+1100+1000+900+600+340+360 = 9612 -> 96
```

**Where today's 77 differs from R2's projected 91**, so the gap is arithmetic and
not opinion — R2 projected the full fix set; part of it landed:

```
criterion 8  still 0 vs 100      -6.0
criterion 2  48 vs 90            -6.3
criterion 4  60 vs 80            -2.4
criterion 9  45 vs 85            -1.6
criterion 3  94 vs 100           -0.8
criterion 5  95 vs 100           -0.6
criterion 1  94 vs 97            -0.5
                                 -----
                                 -18.2   ...  and +4.2 from criterion 10 (0 -> 90)
77 + 18.2 - 4.2 = 91             (R2's code-only projection, reconciled)
```

The single largest remaining item is the one nobody has touched in three rounds:
**a test that opens a screen with nothing in it.**

---

## Verdict

**A brand-new customer lands on `/home` and now sees their team name, an
"Admin · 1 member" line, and a `Start here` panel offering three things to do —
write an article, import a spreadsheet, invite the team — above the two standing
Team and Settings rows. For the first time they are told what the product is
for.** What still does not exist is any test that would notice if that panel
stopped appearing, and seventeen of twenty-one empty states still describe a
screen rather than offering a way to fill it.
