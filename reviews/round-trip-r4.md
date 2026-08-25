# Round trip review — round 4 — Brimba · 2026-08-25
SCORE: **62/100**, ungated   (R1 45 / uncapped 48 · R2 45 / 50 · R3 45 / 56 · **R4 62**)

Measured against `main` @ **`8a7e906`**, working tree clean. Read-only.

**The gate is off for the first time in four rounds.** Criterion 1 reaches 45 ≥ 40 because
the hop budget is written down, exactly as R3 predicted, and the reported number stops
lying about three rounds of real work.

**But the recorded hop counts are wrong, and they are wrong in the direction that matters.**
I re-counted independently rather than trusting them, and both numbers are **2 low** — by
one consistent cause, which is this review's own standing CRITICAL.

## Arithmetic

| # | Criterion | wt | R1 | R2 | R3 | **R4** | Why it moved |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | hops (GATE) | 15 | 25 | 25 | 25 | **45** | **+20. The 20-point "a hop budget is written down" row is paid.** `OPERATIONS.md:412-427` gives a per-screen table *and a rule that bounds a screen*: "a screen that needs more requests than it has distinct questions is asking something twice." That is a ceiling, expressed relatively, and the ticket page already fails it. The 35-point band row is still 0 (16 is in the 13+ band) and ≤3 services is still 0. **45 ≥ 40 → the cap lifts** |
| 2 | duplicates | 13 | 33 | 33 | 56 | **56** | Unchanged. F2 stands **verbatim** — re-verified line by line, see below |
| 3 | overfetch | 13 | 48 | 63 | 63 | **75** | **+12. Finding G finally closes.** `members` was the fifth and last `?id=` door reading a whole collection; `oneMember` (`workers/tenancy/src/lib/members.ts:195-213`) now reads one row (`… AND tm.user_id = ? LIMIT 1`) plus one role lookup (`WHERE id = ? LIMIT 1`). G was one atomic `medium 7` covering the set, which is why 4-of-5 bought nothing at R3 and 5-of-5 buys the lot. Findings D and E stand |
| 4 | reuse | 12 | 55 | 55 | 60 | **60** | Unchanged. Revalidate-on-mount untouched, so the 15-point "reference data once per session" row is still 0 |
| 5 | nplusone | 12 | 51 | 51 | 51 | **51** | Unchanged. `confirmImport` still writes one HTTP POST per row, sequentially; `forwardToDoor` still carries no timeout |
| 6 | parallel | 11 | 79 | 79 | 79 | **79** | Unchanged. All three waterfalls stand at their current lines |
| 7 | writeback | 9 | 100 | 100 | 100 | **100** | Unchanged — and `oneMember` *strengthened* it: both mutation doors now return the affected row (`routes/members.ts:38,53`), which is R23 and a writeback win in the same line |
| 8 | payload | 6 | 30 | 30 | 30 | **30** | Unchanged |
| 9 | firstpaint | 5 | 30 | 30 | 30 | **30** | Unchanged. Still three serial round trips: `auth/me` → `tenancy/active` → `my-permissions` |
| 10 | measured | 4 | 0 | 0 | 65 | **100** | **+35.** The "checked more than once" row is paid: `OPERATIONS.md:425` keeps *two dated counts* per screen (16→8 and 24→16, both 25 August), so a regression is comparable against a kept baseline rather than a memory |

```
15×45  =  675      wt sum = 15+13+13+12+12+11+9+6+5+4 = 100
13×56  =  728
13×75  =  975      R3 uncapped reproduces on the same weights:
12×60  =  720        15×25+13×56+13×63+12×60+12×51+11×79+9×100+6×30+5×30+4×65
12×51  =  612        = 375+728+819+720+612+869+900+180+150+260 = 5613 → 56.13  ✓
11×79  =  869
 9×100 =  900      R4 total 6209 ÷ 100 = 62.09 → 62
 6×30  =  180
 5×30  =  150      GATE: criterion 1 = 45 ≥ 40 → no cap. Reported = uncapped = 62.
 4×100 =  400
        -----      Move: (+20×15)+(+12×13)+(+35×4) = 300+156+140 = 596 ÷ 100 = +5.96
         6209             56.13 → 62.09
```

R3 forecast 59 from the budget row alone. 62 — the extra 3 is G closing and the trend row,
neither of which R3 forecast.

## The independent re-count — both recorded numbers are 2 low

Counted from source the same way rounds 1–3 counted: `web/app/layout.tsx` → `AgentHost` +
`DeepLinkScreen` → `AppShell` → `useTeamPrewarm` / `usePermissions` / `useScreenData` →
the leaf screen. **Static count, not a browser trace** — I cannot run the app (read-only, and
the static export needs the deployed workers), so this is the same method the doc used, which
is what makes the disagreement meaningful.

### `/home`, cold, fresh tab

| # | Request | Distinct question |
|---|---|---|
| 1 | `GET /api/auth/me` — `useActiveTeam.load()` via **`agent-host.tsx:22`** | who am I |
| 2 | `GET /api/auth/me` — `useActiveTeam.load()` via **`deep-link-screen.tsx:71`** | **duplicate of 1** |
| 3 | `GET /api/tenancy/active` — same instance as 1 | which team |
| 4 | `GET /api/tenancy/active` — same instance as 2 | **duplicate of 3** |
| 5 | `GET /api/tenancy/roles` — prewarm `member_roles` | roles |
| 6 | `GET /api/tenancy/invites` — prewarm | invites |
| 7 | `GET /api/tenancy/selectable` — prewarm | dropdowns |
| 8 | `GET /api/tenancy/my-permissions` — prewarm, joined by `usePermissions` | my rights |
| 9 | `WS /api/realtime` — team channel (`app-shell.tsx:134`) | team events |
| 10 | `WS /api/realtime` — user channel (`app-shell.tsx:203`) | my events |

**10 requests, 8 distinct answers.** `OPERATIONS.md:423` records **8 for 8**.

### `/t/<team>/help/<id>`, cold, fresh tab

Same duplicated pair (1–4 above), then prewarm ×4, then `useScreenData`'s `members:`,
`help:`, `help-mine:` and `activity:help:<id>`, then `help-detail.tsx`'s `helpOne`,
`help-thread:` and `help-stakeholders:`, then the two sockets. `formSelectableQ` shares the
`selectable:<team>` key with the prewarm and is de-duplicated by `sharedFetch`.

**≈18 requests, 11–13 distinct answers.** `OPERATIONS.md:424` records **16 for 11**.

### Why they are both exactly 2 low

One cause, and it is F2. `useActiveTeam` does **not** go through `useCached`/`sharedFetch` —
it keeps a module-level `let sessionCache` (`web/lib/use-active-team.ts:31`) that is only
populated *after* `load()` resolves, and `void load()` at line 102 runs **unconditionally**,
even on a cache hit. Two components call it on every screen —

```
web/components/agent-host.tsx:22        const active = useActiveTeam()
web/components/deep-link-screen.tsx:71  const active = useActiveTeam()
```

— both mount in the same commit, both find `sessionCache` null, both fire. The in-flight
de-duplication built at R3 is real and correct and **cannot reach this hook**, because the
hook never enters the store. So `auth/me` and `tenancy/active` are each requested twice on
every cold load of every screen.

**Why this matters more than two requests.** The budget's own rule is *requests ≤ distinct
answers*. By the recorded numbers, `/home` is 8/8 and **passes**. By the real numbers it is
10/8 and **fails** — and it fails on precisely the duplication the rule exists to detect. A
budget that certifies its worst-behaved property as compliant is worse than no budget,
because it retires the suspicion. The budget itself is good and I scored it in full; the
numbers in it need correcting.

## Findings

### F2 · CRITICAL (carried, verbatim, re-verified) — the session is loaded twice on every cold start, serially
`web/lib/use-active-team.ts:31,76-106` · `agent-host.tsx:22` · `deep-link-screen.tsx:71`

Four wasted requests per cold load (2× `me`, 2× `active`), and because they are the *first
two waves*, they are also criterion 9's first paint. **Fix:** route the session through
`useCached("session")` so `sharedFetch` claims the key synchronously, or hoist
`useActiveTeam` into a context provider mounted once in `layout.tsx` and have both consumers
read it. The provider is the leaner fix and removes the hook's bespoke cache entirely.

### F5 · HIGH (new) — the recorded hop counts understate both screens by 2
`OPERATIONS.md:420-425`

As counted above. **Fix:** correct to `/home` 10/8 and the ticket page 18/11 — or, better,
land F2 first and record 8/8 and 16/11 as *achieved* rather than as measured-with-the-bug.
Note the "roughly double on 25 August" baselines are presumably 2 low by the same cause, so
the improvement is real either way; only the absolute figures move.

### F6 · MEDIUM (new) — the budget is recorded in `OPERATIONS.md`, which is not where a screen gets built
`OPERATIONS.md:412` · `CLAUDE.md` planning ritual

R3 recommended `EDGE-CASES.md` §3 or an eighth planning question; it landed in the operations
runbook. That is a fine home for the *numbers*, but the ritual in `CLAUDE.md` — the thing an
agent actually reads before building a screen — does not mention hops. **Fix:** one line in
the ritual's question 2 ("a collection → …") pointing at the budget. No new document.

### D, E, and the nplusone set · carried, unchanged
`confirmImport`'s row-per-POST, `forwardToDoor`'s missing timeout, the activity feed's
unrendered `origin`/`verb`, and revalidate-on-mount all stand at their R3 lines and
descriptions. Nothing this round touched them.

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| F2 — hoist `useActiveTeam` into a provider in `layout.tsx` | `web/lib/use-active-team.ts` (−the module-level cache), `web/app/layout.tsx` (+1 provider), `agent-host.tsx`, `deep-link-screen.tsx`, `web/app/{roles,members}/page.tsx` | REMOVES 4 requests per cold load and a bespoke cache; ADDS one provider | **architecture_review** — a root provider is a new global coupling point, and layout.tsx is already the most-loaded file in the web app. **realtime_review** — the user/team channels key off `ctx`; a provider changes when `ctx` first becomes non-null, so the socket connect timing shifts and its reconnect path needs re-testing. **lean_mean** benefits (net less code) |
| F5 — correct the two recorded hop counts | `OPERATIONS.md` (2 table cells) | REMOVES an understatement | **none — it makes a written number match the code.** Do it *after* F2 if F2 is imminent, or the cells change twice |
| F6 — point the planning ritual at the hop budget | `CLAUDE.md` (1 line) | ADDS a pointer | **lean_mean**, trivially (CLAUDE.md is already long). **story_checks_out** benefits — it closes a capability no document currently owns at build time |
| Batch `confirmImport` (nplusone, deferred) | `workers/data-ops` import path | REMOVES one HTTP POST per row | **security_sentry** — the per-row POST is what keeps every written row inside the *gated* door, which is the base's permission spine (R10). A batch endpoint must re-gate per row or it becomes a privilege hole. **This is why it has stayed open for four rounds and it should stay open until designed, not patched** |
| Add a timeout to `forwardToDoor` | `shared/workers/*` | ADDS a timeout (R11) | **speed_review** — a timeout can turn a slow success into a failure; needs a number, and F1 in speed-r4 is what would produce one. Sequence speed's probes first |

## CEILING

**95 is not reachable. The true maximum is ≈ 78, and criterion 1 is the wall.**

Criterion 1 carries 15 weight and has four rows: median 1–2 hops (25, earned), a written
budget (20, now earned), ≤5 hops on the worst screen (35), ≤3 services per action (20).

- **≤3 services (20 pts) is capped by a locked decision.** Every gated request crosses
  gateway → worker → auth (`whoAmI`) → D1 REST. That is four services by architecture, and
  ARCHITECTURE.md locks both the single-public-door gateway and the per-team-D1-over-REST
  model. **Not fixable by a commit.** Criterion 1 tops out at 80.
- **≤5 hops (35 pts) is reachable but expensive.** F2 saves 2 and closing the help-detail
  overlap (D/H) saves ~3 → the ticket page reaches ~13, which is *still* the 13+ band worth 0.
  Getting under 9 needs the screen to stop fetching the list it is a detail of — a
  `useScreenData` redesign, not a fix.

Optimistic ceiling with F2 landed, the detail overlap closed, and every other criterion
pushed hard:
`15×80 + 13×85 + 13×85 + 12×80 + 12×70 + 11×90 + 9×100 + 6×60 + 5×80 + 4×100`
= 1200+1105+1105+960+840+990+900+360+400+400 = **8260 → 83**.

And that assumes criterion 5 improves, which the security constraint above argues against.
Holding criterion 5 at 51 and criterion 8 at 30 (both realistic) gives **≈78**.

**95 would require relitigating the gateway/auth hop in ARCHITECTURE.md.** I am not proposing
that — it is the base's permission spine and the reason the agent and MCP surfaces can never
exceed a user's rights. The honest maximum for this review, on this architecture, is high
seventies, and **62 is real progress toward it**.
