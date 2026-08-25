# Story checks out — round 3 (default + `--foundation`) — Brimba · 2026-08-25
SCORE: 68/100   (round 1: 71 · round 2: 68 · the 2026-08-12 full run: 98)

**Measured against `HEAD = 256d21b` on branch `review-campaign`.** The tree moved twice
while I read. It first showed a concurrent session editing `package.json` and
`web/test/fork.test.ts`; by the time I finished, that had reverted and
**`ROUTE-CENSUS.md` and `scripts/route-census.mjs` were dirty — H1′ being partly repaired
while I wrote it up.** The uncommitted census now finds realtime and gateway and lists
`POST /publish` correctly as ungated; it still misses 4 of 103 doors, still skips an
unparseable worker silently, its tripwire is still `> 60` against 99, and it now
*over*-reports by counting three `ANY`-method rows (a health check, a WebSocket upgrade)
as state-changing and ungated. **H1′ therefore drops from high to medium in the tree,
which would move criterion 3 from 45 to 53 and the total from 68 to 69.** Every number
below is the commit's. No other document I cite was touched.

## DELTA

| # | Criterion | wt | R1 | R2 | R3 | Why it moved |
|---|---|---|---|---|---|---|
| 1 | Docs do not contradict each other | 14 | 22 | 16 | **10 ▼** | ▲+8 H5 downgraded high→medium (the *code* now matches the master; only `SCALING.md` disagrees). ▼−14 **two new medium contradictions, both created by repairs**: BOOTSTRAP still says *five* workers carry an `OPS` binding when six now do, and `BASE-IMPROVEMENTS.md:338` still describes the deleted `useLiveRefetch` bus in the present tense. Net **−6**. |
| 2 | Locked decisions still stand | 13 | 93 | 93 | **93 =** | All 31 `LOCKED` markers re-cross-read. Nothing new violates one — and the size-alarm repair moved the *code* back into compliance with `ARCHITECTURE.md`'s locked 80 %. Scored under criterion 1, as in round 2, so the delta stays comparable. |
| 3 | Stated guarantees hold end to end | 12 | 60 | 46 | **45 ▼** | ▲+7 **M-new-1 CLOSED** — the keystone check no longer compares a hand-written list to a hand-written list. ▼−8 H1′ upgraded medium→high: R10 still covers 5 of 7 workers, and now `ROUTE-CENSUS.md` reports the surface as if it did not. Net **−1**. |
| 4 | Depth proportional to reach | 10 | 90 | 88 | **86 ▼** | ▼−2: the check layer grew again — `shared/test/publish-seam.ts` and `scripts/route-census.mjs` joined `shared/test/source.ts` — and all three are in **zero** documents. **Caused by this round's repairs**, exactly as round 2's −2 was. |
| 5 | Every flow says what happens when it fails | 9 | 63 | 71 | **86 ▲▲** | **+15: H4′ is CLOSED.** BOOTSTRAP's ops step now says `cd workers/auth` first, and every `OPS` binding declares `migrations_dir` — machine-checked by `ops-migrations-dir`. The day-zero runbook's "do not skip this" step can now actually run. **The round's biggest gain.** |
| 6 | Edge cases addressed | 9 | 93 | 93 | **93 =** | M13 open (invite to a role that is then deactivated). |
| 7 | Nothing is stale | 8 | 58 | 58 | **59 ▲** | ▲+8 H7 halved (`BASE-IMPROVEMENTS.md` caught up to 2026-08-25; `CHANGELOG.md` still stops at 2026-08-12). ▼−7 a new medium I am adding to the denominator and saying so: **the test count is stated as 518 in two documents and is ~641.** Net **+1**. |
| 8 | Every reference resolves | 6 | 93 | 90 | **87 ▼** | ▼−3: `ROUTE-CENSUS.md` is a new root document that `README.md`'s doc map does not index (probe: `docMap.missing`). |
| 9 | One name per concept | 6 | 86 | 86 | **86 =** | The glossary was not touched. |
| 10 | Every capability has an owning document · **GATE** | 8 | 69 | 57 | **57 =** | One owner gained (the operations database now has a runnable owner in BOOTSTRAP), one lost (**the privilege-assignment rule is in zero documents**, and no document says what to do when the census and reality disagree). Exact wash. Above the gate of 50 → **no cap**. |
| 11 | A newcomer can navigate it | 5 | 92 | 92 | **90 ▼** | ▼−2: same doc-map omission. 31 of 32 root documents indexed. |

**Five criteria FELL. Four of the five falls were caused by repairs**, and the fifth
(criterion 7's new medium) is a defect all three rounds have carried and only this one
priced. The decomposition:

```
68  →  76   the repairs, measured against ROUND 2's finding set
            (H4′ closed +15·crit5 · M-new-1 closed +7·crit3 · H7 halved +8·crit7
             · H5 downgraded +8·crit1)
76  →  70   this round's own regressions
            (BOOTSTRAP "five workers" · BASE-IMPROVEMENTS' dead bus · H1′ upgraded
             · the doc-map omission · the check layer still undocumented)
70  →  68   a defect all three rounds carried and only this one priced
            (the 518-test claim)
```

**Verdict: the story still does not check out — 34 holes (4 high, 19 medium, 11 minor).
The one that matters most is that the document written this round to end the
rediscovery of the app's own attack surface reports 94 doors when there are 103, and
the two it cannot see include the only door in the base with no gate at all.**

---

## THE ANSWER TO THE QUESTION YOU ASKED

> *Round 2's insight was that exactly three documents were read by any test, and that
> 4 of 17 structural facts stated in 2+ places had a machine-checked source. Hunt the
> same shape again, and count how many of the 17 are now checked.*

**Documents read by a test: 3 → 4.**

```
$ grep -rhoE '"[A-Za-z0-9-]+\.md"' --include="*.test.ts" .
    RULES.md          ROUTE-CENSUS.md          MCP.md          BOOTSTRAP.md
```

plus `registry-integrity`'s loop over every root `.md` (one regex, `R1–Rn`) and the new
`vault-claims-match-reality` loop (one regex, a claim of existence).

**The 17 facts, re-measured:**

| # | Fact | Stated in | Machine-checked? | Drifted **today**? |
|---|---|---|---|---|
| 1 | The law **id set** | RULES.md table | **yes** — `registry-integrity` | no |
| 2 | The law **range** `R1–Rn` | README, CLAUDE, PLATFORMS ×2, BASE-MANUAL | **yes** | no — all five read `R1–R26` |
| 3 | The law **enumeration** | BASE-MANUAL §4 table, README:78, CLAUDE:42, BUILD-A-MODULE:639 | NO | **yes** — BASE-MANUAL's table stops at **R8** of 26 |
| 4 | Each law's **enforced-by** column | RULES.md, `rules.test.ts` comments | NO | **yes** |
| 5 | A `checkId` names a test **that exists** | `shared/rules/registry.ts` | **yes — NEW ✔** | no |
| 6 | **core** migration count | BOOTSTRAP ×2 | **yes** | no — `0001`–`0017`, 17 on disk |
| 7 | **team** migration count | BOOTSTRAP, OPERATIONS | yes (BOOTSTRAP only) | **yes** — OPERATIONS |
| 8 | **ops** migration count | BOOTSTRAP, OPERATIONS, INVENTORY | NO — the new check pins the *bindings*, not the counts | **yes** — OPERATIONS:257 and INVENTORY:58 still name `0001` only; disk has 2 |
| 9 | MCP **exclusion** table | MCP.md | **yes** | no |
| 10 | **worker count = 7** | ~20 places | NO | no |
| 11 | **R2 bucket set** | INVENTORY, BOOTSTRAP, OPERATIONS | NO | **yes** — INVENTORY:40 has 2 of 3 (`brimba-help-media` missing) |
| 12 | **DB size-alarm threshold** | 6 doc places + 2 code comments | NO | **yes — and it FLIPPED**: code + master + 3 docs now say 80 %, `SCALING.md` ×2 still says 65 % |
| 13 | **test count** | README:182, CONTRIBUTING:25 | NO | **yes — 518 vs ~641** |
| 14 | workers that **record errors** | ERROR-HANDLING:51-52 | test half yes (derived); doc half NO | **yes** — names 5 sources; 8 record |
| 15 | workers that bind **OPS** | BOOTSTRAP ("five"), OPERATIONS | NO | **yes — NEWLY** — six bind it since realtime joined |
| 16 | **deploy order** | CLAUDE, OPERATIONS, root scripts | NO | no |
| 17 | the read **caps** (1000/10000/500) | CONVENTIONS:761 | NO | no |
| — | **the route surface** *(new fact this round)* | ROUTE-CENSUS.md | **yes — but the check is BLIND on 2 of 7 workers** | **yes** — 94 of 103 doors |
| — | **the vault's existence** *(new)* | SECRETS, OPERATIONS, CHANGELOG | **yes — NEW ✔** | no |
| — | every `OPS` binding declares `migrations_dir` *(new)* | — | **yes — NEW ✔** | no |
| — | the fork sweep reaches every identity literal *(new)* | — | **yes — NEW ✔** | no |
| — | the root layout renders what it imports *(new)* | ERROR-HANDLING C1 | **yes — NEW ✔** | no |

**5 of 17 now have a machine-checked source (was 4). 8 of the remaining 12 are wrong
right now (was 7 of 13).**

**The shape did not change; the appetite did.** The mechanism was used **five more
times** this round — and on five *new* facts, not on any of the thirteen it was already
known to be missing from. Two of those five new checks are the strongest in the repo
(`vault-claims-match-reality` polices a claim rather than a count; the derived `checkId`
scan closed round 2's named anti-pattern with its own tripwire). One of them,
`route-census-current`, is the worst kind of check this corpus has ever shipped: it is
generated, committed, checked — and **wrong**.

### Three instances of the same shape inside the checks written this round

1. **`route-census-current` guards a false document with a floor.**
   `web/test/rules.test.ts:860` asserts `rows.length > 60` against a real 94. The
   generator recognises a `ROUTES` table and auth's `switch` and nothing else, so
   realtime and gateway — which dispatch with `if (pathname === …)` — contribute **zero
   rows, silently**. The comment directly above it names *"realtime's publish door and
   the gateway beacon"* as the doors the old sweep missed. They are still missing.
   The same week, `workers/auth/test/gating-seam.test.ts:82` was given an *equality*
   (`toBe(allCases.length)`) precisely because a floor lets an unparsed door through.
   The census did not get it. `security_sentry` round 3 files this as M1 with the
   sabotage that proves it; `lean_mean` round 3 files it as F-DOWN-2.

2. **`ops-migrations-dir` pins the bindings and not the documents.**
   It correctly asserts every `OPS` binding declares `migrations_dir` — which is what
   made H4′ closeable. It does **not** pin the ops migration *count* to any document
   string, which is the fact that is wrong in two places right now (OPERATIONS:257,
   INVENTORY:58) and was wrong in round 2 for the same reason. `core` and `team` are
   pinned to exact strings three lines away. **The one count that has caused a finding
   in both prior rounds is still the one left unpinned.**

3. **`vault-claims-match-reality` is the model, and shows what the other twelve lack.**
   It does not check a number — it checks a *claim*: while `secrets.vault` does not
   exist, no root `.md` may say it does. Twelve of the drifted facts above are the same
   shape (a document asserting a state of the world) and could be policed the same way
   in a few lines each. This is the highest-leverage pattern in the corpus and it has
   exactly one instance.

---

## Docs in scope (33)

`AGENT-MODULES-PLAN` · `AGENTIC-IMPORT` · `AGENTS` · `ARCHITECTURE` ·
`BASE-IMPROVEMENTS` · `BASE-MANUAL` · `BOOTSTRAP` · `BUILD-A-MODULE` · `CACHING` ·
`CLAUDE` · `CONCURRENCY` · `CONTRIBUTING` · `CONVENTIONS` · `DATA-MODEL` ·
`DURABLE-OBJECTS` · `EDGE-CASES` · `ERROR-HANDLING` · `INVENTORY` · `MCP` ·
`OPERATIONS` · `PLATFORMS` · `README` · `ROADMAP` · **`ROUTE-CENSUS` (new)** ·
`RULES` · `SCALING` · `SCREEN-ENGINE-PLAN` · `SEARCH` · `SECRETS` · `SWIFT-STRUCK-WAY` ·
`UI-CONVENTIONS` · `UI-GAPS` · `mcp-quickstart`

`../swift-struck-ui/UI-RULES.md` is referenced by two documents and lives in a sibling
repository; unreadable from here, so `M12` stays unverifiable, as in both prior rounds.

---

## Arithmetic

`DEFECT = clamp(0,100, 100 − Σ penalties)`, critical 30 · high 15 · medium 7 · minor 3.
`COVERAGE = sum of points earned.` `total = Σ(criterion × weight) ÷ 100.`

| # | Criterion | Method | Penalties / points counted | Score | Weight | Product |
|---|---|---|---|---|---|---|
| 1 | Docs do not contradict each other | defect | 1 high (15: H6) + 9 medium (63: H5′, H0′, M3, M9, M11, M-new-2, M-new-4, **N1**, **N2**) + 4 minor (12: m3, m4, m7, m8) = 90 | **10** | 14 | 140 |
| 2 | Locked decisions still stand | defect | 1 medium (7: M12) | **93** | 13 | 1209 |
| 3 | Stated guarantees hold end to end | defect | 3 high (45: H2, H8′, **H1′ upgraded**) + 1 medium (7: M1) + 1 minor (3: m6) = 55 | **45** | 12 | 540 |
| 4 | Depth proportional to reach | coverage | 35 + 18 + 15 + 10 + 8 | **86** | 10 | 860 |
| 5 | Every flow says what happens when it fails | defect | 2 medium (14: H3′, M7) | **86** | 9 | 774 |
| 6 | Edge cases addressed | defect | 1 medium (7: M13) | **93** | 9 | 837 |
| 7 | Nothing is stale | defect | 5 medium (35: H7′, M5, M10, M-new-3, **N3**) + 2 minor (6: m2, m5) = 41 | **59** | 8 | 472 |
| 8 | Every reference resolves | defect | 1 medium (7: m1) + 2 minor (6: m-new-1, **N4**) = 13 | **87** | 6 | 522 |
| 9 | One name per concept | coverage | 36 + 18 + 20 + 12 | **86** | 6 | 516 |
| 10 | Every capability has an owning document | coverage | 38 + 4 + 4 + 11 | **57** | 8 | 456 |
| 11 | A newcomer can navigate it | coverage | 26 + 25 + 20 + 13 + 6 | **90** | 5 | 450 |

```
140 + 1209 + 540 + 860 + 774 + 837 + 472 + 522 + 516 + 456 + 450 = 6776
6776 ÷ 100 = 67.76 → 68
```

**Criterion 10 is 57, above the gate of 50, so no cap applies.** Uncapped = capped = 68.

**34 findings, 4 high · 19 medium · 11 minor.** Round 2: 36 findings, 6 high · 19
medium · 11 minor. Two highs closed, one high downgraded, one medium upgraded to high.

**One denominator change, declared:** `N3` (the 518-test claim) is a defect rounds 1 and
2 both listed in the 17-fact table and neither penalised. I am penalising it. Without
it the score is 68.32 → 68 — the same number either way, so nothing here turns on the
change; I am declaring it because a silent denominator move is how a delta stops meaning
anything.

---

## What the repair round closed — confirmed by reading, not by report

| Round-2 finding | Status | Evidence |
|---|---|---|
| **H4′** the ops migration step cannot run | **CLOSED ✔** | `BOOTSTRAP.md:113-116` now reads `cd workers/auth` before `wrangler d1 migrations apply`, and every one of the six `OPS` bindings declares `migrations_dir: "../../db/ops"` in **both** its production and staging block — pinned by `ops-migrations-dir` (`web/test/rules.test.ts:838-845`). The runbook's own "do not skip this" step is now executable. |
| **M-new-1** the keystone check compares a hand-written list to a hand-written list | **CLOSED ✔, and well** | `web/test/rules.test.ts:1118-1143` now walks `web`, `workers` and `shared` for every `*.test.ts` plus the two shared seam modules, joins them into a haystack, and asserts every enforced law's `checkId` appears in one — with its own tripwire (`tests.length > 20`, *"this scan has gone blind"*). The exact anti-pattern round 2 quoted from `source.ts`'s header is gone. **The single best repair of this round.** |
| the deleted live-refetch seam's dangling references | **3 of 4 closed** | `CACHING.md:87` now states plainly that the bus *"existed until 2026-08-25 and had zero call sites"*. `BASE-MANUAL.md` and `BUILD-A-MODULE.md` are clean. `BASE-IMPROVEMENTS.md:338` was missed — see **N2**. |
| **H8** the privilege rule is in zero documents | **half closed, new overclaim** | `BASE-IMPROVEMENTS.md:111` now documents the amplification rule properly. It documents the **matrix** half only, and claims *"Locked by `roles.test.ts`"* — see **H8′**. |
| **H7** CHANGELOG + BASE-IMPROVEMENTS stop at 2026-08-12 | **half closed** | `BASE-IMPROVEMENTS.md` now runs to 2026-08-25. `CHANGELOG.md:6` still says *"commits between 2026-06-12 and 2026-08-12, one author."* |
| **H5** 65 % vs 80 % | **code fixed, doc not — and the sides swapped** | `ALERT_THRESHOLD_BYTES = 8 GB` = 80 % (`sharding.ts:50`), matching `ARCHITECTURE.md:27`, `OPERATIONS.md:44`, `BASE-MANUAL.md:537` and `:591`. `SCALING.md:66-67` and `:378` still say 65 %. See **H5′**. |
| **H6, H2, M1, M3, M5, M7, M9–M13, m1–m8** | **NOT closed** | The documents holding them (`ARCHITECTURE`, `OPERATIONS`, `DATA-MODEL`, `ERROR-HANDLING`, `INVENTORY`, `SCALING`, `ROADMAP`, `CONTRIBUTING`, `CONVENTIONS`) are all unmodified since round 2. Three re-verified by reading; the rest by mtime plus a targeted grep at the cited line. |

---

## Findings

### HIGH

**H1′ · invariants — R10 covers 5 of 7 workers, and the document written this round to prove otherwise cannot see the other two.** *(upgraded medium → high)*

`ROUTE-CENSUS.md:11` reads **"94 routes · 58 state-changing · 1 with no gate detected."**
Counted from the source, the surface is **103 routes · 60 state-changing · 2 with no
gate.** The nine missing doors are realtime's three, gateway's three, and the three
inline `GET /health` routes. The state-changing door it cannot see —
`realtime POST /publish` — is the only door in the base with no caller verification of
any kind, and neither realtime nor gateway has a gating-seam suite either.

Round 2 scored this as medium because it was a *known* gap: two workers uncovered and
unnamed. It is now high because the corpus has gained a document that answers the
question wrongly. A reader — an owner, the next reviewer, me — closes `ROUTE-CENSUS.md`
believing the base has exactly one open door and that it is the well-argued login door.
**A guarantee with a known gap costs less than a guarantee whose evidence document is
false**, because the second one retires the suspicion that would have found the gap.

**Fix (F1, Tier 3 — the fix is code, not words).** `security_sentry` round 3 M1 carries
it: a third dispatch parser, *an unparseable worker must FAIL rather than be skipped*,
and `toBe(103)` in place of `> 60`. When it lands, `ROUTE-CENSUS.md` regenerates with
two ungated doors and `POST /publish` named — at which point this document also needs
the second one added to `OPEN_BY_DESIGN` with a reason, or closed.

**H8′ · invariants — the privilege rule is now documented, in the half that did not close the escalation, with a lock that does not exist.** *(H8, half closed, new shape)*

`BASE-IMPROVEMENTS.md:111` documents the amplification rule well: *"you may not GRANT a
right you do not hold yourself… Locked by `roles.test.ts`, which asserts nothing is
written when the grant is refused."* Three problems:

1. **It documents `setRolePermissions` — the door the escalation did not need.** The fix
   that actually closed it is `assertCanAssignRole`, called from `createInvite` and
   `changeMemberRole`: *you may not put anyone into a role stronger than your own.* That
   rule is in **zero** documents. `grep -n "amplif" RULES.md` returns nothing.
2. **The lock it claims does not cover the half that matters.** Deleting
   `await assertCanAssignRole(...)` from **both** doors leaves the tenancy suite at
   **119 passed (119)** — verified in a sandbox, reported as `security_sentry` round 3
   M2. The three tests exercise the helper in isolation; nothing asserts a door calls it.
3. **`BASE-IMPROVEMENTS.md` is a changelog, not a law-book.** The base's most important
   authorisation rule after R10 lives in a "what we fixed" table and not in `RULES.md`,
   which is where every other invariant of the permission spine lives and is the only
   document `registry-integrity` polices.

**Fix (F2, Tier 2 — a draft I would show before writing).** One paragraph in `RULES.md`
stating both halves of the rule as one sentence — *you may neither grant a right you do
not hold nor assign a role that holds one* — with the two-door and one-matrix call sites
named, and the sentence in `BASE-IMPROVEMENTS.md:111` corrected to claim only the lock
that exists until M2's tests land.

**H6 · consistency — `BASE-MANUAL.md`'s law table states the exact anti-pattern R16 forbids, and stops at R8 of 26.** *(unchanged)*

`BASE-MANUAL.md:407`: *"R8 | Every team collection tab derives its count from its loaded
rows | `tab-counts-derived`"*. R16 is *"an exact server `COUNT(*)` through the one
`formatCount` seam"* — deriving a count from loaded rows is precisely what R16 exists to
stop, and R14's paging makes "loaded rows" a fraction of the collection. The same table
ends at R8 while `RULES.md` runs to R26, which is fact #3's drift made visible: four
documents enumerate the laws and the enumeration is checked in none of them.
**Fix: F3 — Tier 1 for the truncation, Tier 3 for the R8/R16 conflict (two rules, one
owner's call).**

**H2 · invariants — `fetch-timeout` (R11's external half) and `cron-records` (R12) are still built on the old reader.** *(carried, severity unchanged — see the caveat)*

Round 2 proved both blind. The only change to either this round is that their names left
the hand-written `known` Set when `M-new-1`'s derived scan replaced it. **Caveat I am
stating rather than hiding: I did not re-run round 2's blindness probe against these two
checks this round.** The claim they enforce (`RULES.md` R11 and R12) is unchanged and
their surrounding code is unchanged; I am carrying the severity rather than re-earning it.
Treat this as the least-verified finding in the report. **Fix: F4.**

### MEDIUM — the new ones

**N1 · consistency — BOOTSTRAP says five workers carry an `OPS` binding. Six do.** *(NEW, caused by a repair)*

`BOOTSTRAP.md:108-109`: *"Paste each returned `database_id` into the **five** workers that
carry an `OPS` binding."* Counted: auth, tenancy, content, data-ops, mcp **and realtime**
— six. Realtime joined this round, correctly: `architecture_review` round 2 found its
error rows landing in the **core** database (where sign-in lives) rather than the
operations one, and the repair added the binding to both env blocks.

The consequence is concrete and it is a day-zero one: someone following BOOTSTRAP pastes
five ids, leaves realtime's pointing at the original author's database, and
`shared/workers/ops-db.ts`'s `env.OPS ?? env.DB` fallback is defeated exactly as the
paragraph twelve lines below (`:120-127`) warns — *"the binding arrives present and
pointing somewhere that is not yours"*. The warning is right there and the number above it
is wrong. **Fix: F5 — Tier 1, one word, and this is fact #15: nothing checks it.**

**N2 · consistency — a deleted seam is still described in the present tense.** *(NEW, caused by a repair)*

`BASE-IMPROVEMENTS.md:338` describes R15's mechanism as *"the live registry
(`web/lib/live-resources.ts`) + a ping bus + `useLiveRefetch`"*. `web/lib/use-live-refetch.ts`
and `web/lib/live-bus.ts` were deleted on 2026-08-25, and `CACHING.md:87` now says so
plainly. Three documents were corrected; this one was missed. The dangling reference is
the smaller half — the larger half is that a reader reaches for a hook that does not
exist while `RULES.md`'s R15 (correctly) says paged screens stay live by reading the same
cache keys the shell patches. **Fix: F6 — Tier 1.**

**N3 · currency — two documents say the suite has 518 tests. It has about 641.** *(NEW to the penalty set; carried in the fact table since round 1)*

`README.md:182` (*"518 tests today, in about 13 seconds"*) and `CONTRIBUTING.md:25`
(*"518 tests, ~13s"*). Measured in a sandbox copy: **474 worker tests** across seven
workspaces plus **167** in `web` = **~641**. Round 2 measured 583; the gap has widened
from 65 to 123 in a week. It is the first number a newcomer checks their environment
against, and it is the number that tells them whether their clone is healthy.
*Caveat: measured in a sandbox where `web/test/fork.test.ts` cannot run (`git ls-files`);
the true web figure may be 2 higher.* **Fix: F7 — Tier 1, and fact #13: nothing checks it.**

**N4 · references — the new root document is not in the doc map.** *(NEW, minor)*

`README.md` indexes 31 documents; `ROUTE-CENSUS.md` is not one of them (probe:
`docMap.missing`). It is generated, so a reader who never opens `scripts/route-census.mjs`
has no route into it at all. **Fix: F8 — Tier 1, one line.**

### MEDIUM — carried, re-verified

**H5′ · consistency — the size alarm: the code moved to 80 % and `SCALING.md` did not.** *(downgraded high → medium)*

`ALERT_THRESHOLD_BYTES = Math.floor(8 * 1024 * 1024 * 1024)` (`sharding.ts:50`) is 80 % of
D1's 10 GB cap, matching `ARCHITECTURE.md:27` (a `LOCKED` section), `OPERATIONS.md:44`,
`BASE-MANUAL.md:537` and `:591`, and the code's own comment at `sharding.ts:4`.

`SCALING.md:66-67` still reads: *"The threshold is **65 %** of the 10 GB cap (it was
80 %)… 2 GB of headroom is days at a large tenant's growth rate, and that is not enough
time to notice, decide and act. 3.5 GB is."* `SCALING.md:378` still lists *"threshold
80 % → 65 %"* as a shipped improvement.

**Downgraded because the direction of the error reversed.** In round 2 the *code* was at
65 and the master at 80, so a reader who trusted `ARCHITECTURE.md` would have been wrong
about what the system does — high. Now the code complies with the lock and only a document
disagrees — medium, per the rubric's *"ambiguity between docs that will mislead a reader"*.

**But note what the document is doing, because a Tier 1 normalisation would destroy it.**
`SCALING.md` does not merely state 65 %; it *argues* for it, with the reasoning that 2 GB
of headroom is not enough time to relieve a full database. That argument is now
unanswered: the owner reverted the number and the case against it is still on the page.
**Fix: F9 — Tier 3.** Either `SCALING.md`'s two lines are corrected *and its argument
retired in writing*, or the argument is accepted and `ARCHITECTURE.md`'s lock is the thing
that moves. Guessing which destroys the evidence, so I recommend neither.

**M-new-2 · consistency — the ops migration count is right in one document of three.**
`BOOTSTRAP.md:113` says `db/ops/0001…0002` and the disk has two. `OPERATIONS.md:257` still
applies `0001_operations.sql` only; `INVENTORY.md:58` still lists `0001` only. Unchanged
from round 2, and this is fact #8: the one count in the runbook family that
`runbook-migrations-current` still does not pin. **Fix: F10.**

**M-new-4 / M3 / M9 / M11 / M1 / M5 / M7 / M10 / M-new-3 / M12 / M13 · carried unchanged.**
Every holding document is unmodified since round 2 (`git` mtimes plus a grep at each cited
line). Two worth restating because this round made them heavier:
- **M-new-3** — the check layer is in zero documents, and it grew: `shared/test/source.ts`
  is now joined by `shared/test/publish-seam.ts` (107 lines, the shared R1 scanner) and
  `scripts/route-census.mjs`. **A new contributor cannot discover from any document that
  `shared/test/` is where the law engine lives.** This is criterion 4's whole deduction.
- **M-new-2's sibling, fact #14** — `ERROR-HANDLING.md:51-52` names the `source` column's
  values as *"auth / tenancy / content / data-ops / web"*. Eight sources now record
  (`recordWorkerError` is called from six workers plus the shared seam and the gateway
  beacon). Five of eight named, and the doc half is checked by nothing.

### MINOR — carried
`m1` · `m2` · `m3` · `m4` · `m5` · `m6` · `m7` · `m8` · `m-new-1` · **N4** · plus the two
dangling `README.md` links to `skills/new-app/SKILL.md` and `skills/README.md` (probe),
which point at a global skills directory outside this repository — same class as the
`../swift-struck-ui/UI-RULES.md` references, and I am counting them inside `m1` rather
than as new.

---

## `--foundation` matrix — the rows that moved

| Capability | (a) DOCUMENTED | (b) MACHINE-CHECKED | (c) SCALES | (d) REUSABLE |
|---|---|---|---|---|
| **Permission spine** | **partial — the *assignment* half of no-privilege-amplification is in ZERO docs; `BASE-IMPROVEMENTS.md:111` documents the matrix half and claims a lock the assignment half does not have (H8′)** | **partial — R10 covers 5 of 7 workers, and `ROUTE-CENSUS.md` now reports the surface as if it covered them all (H1′)** | yes | yes (`shared/workers/gating.ts`) |
| **The error store** | **partial — `ERROR-HANDLING.md` names 5 of 8 recording sources; no document names the table's owner** | partial — the seam is derived from disk; the doc half is checked by nothing | yes (`OPS_RETENTION`) | yes (`shared/workers/error-log.ts`) |
| **The check layer** | **NO — `shared/test/source.ts`, `shared/test/publish-seam.ts` and `scripts/route-census.mjs` are in zero documents (M-new-3)** | **yes — NEW ✔ every enforced law's `checkId` must now appear in a real test file** | n/a | yes (`shared/test/source.ts`) — named nowhere |
| **The route surface** *(new row — this round created it)* | yes (`ROUTE-CENSUS.md`) — but **not in the doc map (N4)** | **partial — blind on realtime and gateway; a floor of 60 against a real 94 (H1′)** | n/a | yes (`scripts/route-census.mjs`) |
| **The operations database** | **yes — improved.** BOOTSTRAP now stands it up **and can apply its migrations** | **yes — NEW ✔ `ops-migrations-dir`** | yes | yes |
| **Secrets / the vault** | **yes — improved.** No document may now claim the vault exists while it does not | **yes — NEW ✔ `vault-claims-match-reality`** | n/a | yes (`scripts/vault.mjs`) |
| **The fork procedure** | yes (`BASE-MANUAL` §5, R26 in `RULES.md`) | **yes — NEW ✔ `fork-sweep-complete`** | n/a | **yes — NEW ✔ `scripts/fork.mjs`** |

Every `partial` and `NO` above appears as a finding. Three rows improved outright; two
regressed; one is new and arrives partial.

---

## FIX IMPACT MAP

| Fix | Documents it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** make the census see realtime + gateway; fail on an unparseable worker; `toBe(103)` | `scripts/route-census.mjs`, `web/test/rules.test.ts`, `ROUTE-CENSUS.md` regenerated | ADDS 9 rows and ~26 lines | **lean_mean** — +26 lines, mitigated to a net *reduction* by parsing dispatch once in `shared/test/source.ts`. **base_fork_review** — an equality pins a number a fork must update; `scripts/fork.mjs` must regenerate the census or R26's green-after-fork promise breaks. **security_sentry** — *strongly positive*, it is their M1. |
| **F2** state both halves of the no-amplification rule in `RULES.md`; correct the lock claim | `RULES.md`, `shared/rules/registry.ts`, `BASE-IMPROVEMENTS.md` | ADDS a law paragraph + a registry entry | **lean_mean** — a new law costs a check, and `registry-integrity` forces the `RULES.md` paragraph, so it cannot be added cheaply. **Sequence it after `security_sentry` M2's tests land**, or the law will name a check that does not exist and the new derived `checkId` scan will go red — which is the scan working correctly. |
| **F3** truncated law table + the R8/R16 conflict | `BASE-MANUAL.md` | REMOVES a wrong row | **none for the truncation.** The R8-vs-R16 half is Tier 3: two laws, one owner's call — do not normalise it. |
| **F4** put `fetch-timeout` + `cron-records` on `shared/test/source.ts` | `web/test/rules.test.ts` | net ≈ zero (a substitution) | **lean_mean** — *positive*, two more law families onto the one reader. It may go red on a real R11/R12 violation, which is the point. |
| **F5** "five workers" → "six" | `BOOTSTRAP.md` (one word) | REMOVES a wrong count | **none.** Best done with the check that makes it un-wrongable: derive the number from `readdirSync(workers/)` filtered on an `OPS` binding — 4 lines beside `ops-migrations-dir`, and it closes fact #15 permanently. |
| **F6** remove `useLiveRefetch` from R15's description | `BASE-IMPROVEMENTS.md:338` | REMOVES a dangling reference | **none — it names a file that does not exist.** |
| **F7** 518 → the real number | `README.md`, `CONTRIBUTING.md` | REMOVES two wrong counts | **none, but a hand-typed number is wrong again next week.** Prefer no number at all, or one the check writes. `mac_fell_in_the_ocean_review` — *positive*: it is the number a stranger validates their clone against. |
| **F8** add `ROUTE-CENSUS.md` to the doc map | `README.md` (one line) | ADDS an index entry | none. |
| **F9** the 65 %/80 % conflict | `SCALING.md` **or** `ARCHITECTURE.md` | — | **Tier 3 — do not touch.** `scaling_review` owns the argument (`SCALING.md`'s case for 3.5 GB of headroom is theirs, not mine) and `ARCHITECTURE.md`'s 80 % is a locked decision. Quote both, decide once, and write the losing argument's retirement into the winner. |
| **F10** the ops migration count in OPERATIONS + INVENTORY | `OPERATIONS.md`, `INVENTORY.md` | REMOVES two stale counts | **none — but do it by extending `runbook-migrations-current` to pin the ops count to a string, the way it already pins `core` and `team`.** Editing the two documents without that leaves fact #8 unchecked for a fourth round. |

---

## CEILING

**Is 95 reachable by changing words? No. The true maximum from documents alone is 88.**

Fixing every Tier 1 and Tier 2 finding — N1–N4, H8′, H6's truncation, M-new-2, and the
whole carried medium set — takes criteria 1, 5, 6, 7, 8 and 11 to their practical maxima:

```
1: 100×14=1400   2:  93×13=1209   3:  70×12= 840   4:  95×10= 950
5: 100× 9= 900   6: 100× 9= 900   7: 100× 8= 800   8: 100× 6= 600
9:  86× 6= 516  10:  86× 8= 688  11: 100× 5= 500
                                                   total 9303 → 93
```

That is the number **if every criterion a document can move, moves.** Three cannot:

- **Criterion 3 is capped near 70 by things only a commit can fix.** H1′ needs the census
  to see two workers; H2 needs two rule checks rebuilt; H8′'s lock claim only becomes true
  when `security_sentry` M2's door-level tests exist. **Words cannot close any of the
  three.** Writing them as closed is the failure this criterion exists to catch.
- **Criterion 9 is capped at 86 by a deliberate design choice.** The corpus uses *team*
  (801 mentions) and *tenant* (45) and *account* (84) for the same unit, and *user* (220)
  beside *member* (201). `shared/glossary.ts` is the law (R6) and the variants are largely
  in architectural prose where "tenant" is the correct word of art. Normalising them would
  make the documents worse. **86 is the honest ceiling, not a debt.**
- **Criterion 10 is capped near 86** while two capabilities have partial owners for reasons
  that are code, not prose (the permission spine's assignment half, the route surface).

**And the honest headline on the round's own question.** Every one of round 2's three named
findings was genuinely fixed — the runbook step runs, the dangling seam is gone from three
of four documents, the privilege rule reached a page. The score did not move, because four
of the five criteria that fell were pushed down by *other* repairs: a binding added to
realtime made a count in BOOTSTRAP wrong, a seam deleted in the web app left one document
of four behind, and a census built on this review's own round-2 recommendation now answers
"how many doors are ungated?" with a number that is wrong in the safe-sounding direction.

**That is the pattern, three rounds running, and it is one sentence long: this corpus
states the same fact in several places and checks it in one. Five of seventeen such facts
now have a machine-checked source. Until that number is seventeen, every repair pass will
keep buying a fix and selling a contradiction, and the score will keep standing still.**
