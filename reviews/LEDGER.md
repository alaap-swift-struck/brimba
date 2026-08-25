# The 16-review campaign — Brimba

Started 2026-08-25. One directory, deletable in one command when the campaign closes.
Everything durable that comes out of this lands in `RULES.md`, `shared/rules/registry.ts`,
a test, or a doc — never only here.

## The requirement

The owner's words, stated three times: *"make sure that they don't override or fuck around
with each other's stuff"* · *"if one scores above 95, it doesn't really screw around with the
other score"* · *"Everything has to be considered at some point altogether."*

Plus: *"the whole point of doing this activity is so that I don't have to keep tracing back
and running the reviews again."*

**Benchmark: every review at 95 or above, and no fix allowed to lower another review's score.**

## Why the phases are shaped this way

Fix-as-you-go cannot satisfy that requirement. To prove change A does not damage score B you
must know both before you touch either — so all sixteen are measured before a single line
changes, and all sixteen are measured again at the end. The second measurement is not
ceremony; it is the only evidence that the fixes did not fight.

| Phase | What happens | Who | Writes? |
|---|---|---|---|
| 0 · MEASURE | 16 reviews in parallel, each producing a score, arithmetic, findings, and a **fix impact map** naming which other review each fix could hurt | 16 sub-agents | reports only |
| 1 · RECONCILE | Build the conflict map from the 16 impact maps; resolve every clash into one decision; order the repairs | main session, alone | plan only |
| 2 · REPAIR | One repair at a time, `npm run check` green after each, every new check sabotage-proven | main session | yes |
| 3 · RE-MEASURE | All 16 again. **Any score that fell is a finding and gets fixed before the campaign closes** | 16 sub-agents | reports only |
| 4 · SHIP + DISTIL | Ship gate, staging, production. Then distil into new Laws and a day-zero list for the next fork | main session + one fresh-eyes session | yes |

## The proof standard

Carried from the faults this base has actually shipped:

- **Sabotage-prove every new check.** Break the guarded thing, watch the build go red naming
  the right file, restore **from a copy — never `git checkout`**, which silently reverts more
  than the sabotage. A green check is not a working law.
- **Never tune a count to reach 95.** Every score prints its arithmetic and is recomputable
  by hand. An honest 71 beats a flattering 96.
- **A review's own probe is a hypothesis.** Four probes lied in the last week: a rule check
  blind since the day it was written, a regex that read English prose as SQL and invented 14
  tables, a `grep` returning 0 because Tailwind escapes `%` as `\%`, and `tsc` passing against
  an empty `node_modules`. Read the code the probe points at before believing it.

## Baseline before anything changed

`npm run check` green — 186 packages installed, 41 + 145 tests passing. `main` @ `8751e30`,
working tree clean, 0 ahead of origin.

| Review | Score | Measured | Standing |
|---|---|---|---|
| lean_mean | 97 | 18 Aug | current |
| architecture | 96 | 18 Aug | current |
| activity_log | 94 | 18 Aug | current — 1 short |
| security_sentry | 99 | 12 Aug | STALE — predates R24, R25, trace.ts |
| story_checks_out | 98 | 12 Aug | STALE |
| interfacelessness | 98 | 4–12 Aug | STALE |
| ocean | 95 | 12 Aug | STALE |
| scaling | 94 | 12 Aug | STALE — 1 short |
| speed | — | never | unmeasured |
| spend | — | never | unmeasured |
| dead_end | — | never | unmeasured |
| realtime | — | never | unmeasured |
| error_log | — | never | unmeasured |
| first_run | — | never | unmeasured |
| round_trip | — | never | unmeasured |
| base_fork | — | never | unmeasured |

Three of sixteen numbers were current. Half the campaign is measuring things never looked at.

## Known tensions to watch in Phase 1

Named in advance so a fix that trips one is caught by design rather than by luck:

- more code, tests and seams → robustness up, **lean_mean down** (prime directive: too much code is a defect)
- more logging → activity_log up, **spend and speed down**
- more indexes → speed up, **spend and storage down**
- fewer abstractions → lean_mean up, **architecture coupling worse**
- timeouts and retries → robustness up, **speed down**

## Results

Phase 0 complete — all 16 measured. Phase 2 repairs landed. Phase 3 re-measure running.

### Phase 0 results as they land

| Review | Score | In-repo ceiling | Headline |
|---|---|---|---|
| realtime | **80** | 91 (97 needs a library change) | Help ticket conversation is not live; R15's paged check is vacuous |
| base_fork | **77** | ~95.6 (needs a real fork script + a law) | Acrymold never leaked in; the base leaks OUT into its forks |
| first_run | **62** | ~93 code-only; ~97 once someone signs up | Never crashes on empty; almost never tells you what to do |
| lean_mean | **89** (was 97) | 95, with 0.44 slack | The 97 was wrong, not regressed — dead code the last pass said was absent |
| interfacelessness | **81** (was 98) | 96.5 | The previous run closed its own finding by writing a false doc |
| error_log | **63** | 88–90; ~93 with an alerting decision | If auth dies, every screen 503s and `error_logs` stays empty |
| spend | **76** | ~96 | One ticket reply can email the whole team; free tier costs real money |
| speed | **37** | 97 | Nothing is instrumented — no number exists for any operation |
| round_trip | **45** | 89 as locked; 97 if EDGE-CASES §2 is amended | One ticket page = 24 requests for 12 answers |
| dead_end | **50** | 96.3 (needs a library change) | Controls that are shown, and enforce nothing |
| activity_log | **82** (was 94) | 95.05 — zero margin | R25's columns are written and read by nothing |
| ocean | **60** gated (87 uncapped, was 95) | 98 | The vault the docs promise has never existed |
| architecture | **87** (was 96) | **94** — 95 only by spending lean_mean points | R11's own check has been green over live violations |
| scaling | **54** (was 94) | **94** — needs the library or the presigned decision | A nightly job deletes files that records still point at |
| story | **71** (was 98) | 96; **94** from inside this repo | Five documents state five different law ranges |

**realtime — 2026-08-25.** Transport is the strongest subsystem (hibernating DOs, monotonic
sharding, server-gated connect, content-free pings, diff-patch reconnect). Every lost point is
in the **last hop to a screen**:

- CRITICAL — `help-detail.tsx:86` subscribes to `help-thread:<id>`; the `help` deps in
  `live-resources.ts:224` never contain that key. Two people on one ticket see only their own
  replies. The `DEAF_EXEMPT` entry at `registry.ts:259` justifies this with a claim that is
  factually false.
- HIGH — R15's paged-screen check (`rules.test.ts:833`) filters components for `/search?` or
  `usePagedList`. **No component contains either** — all fetching is wrapped in `lib/api.ts` —
  so its offender list is always empty and it cannot fail. `useLiveRefetch` therefore has zero
  call sites and `emitLive` iterates an empty Set on every ping. The law's text names dead code.
- HIGH — 2 of 3 record Activity tabs are not live, and look live to the person who made the
  change because `learning-detail.tsx:131` primes the feed locally after an edit.

Ceiling: **95 is not reachable in this repo alone.** In-repo fixes reach 91; criterion 8
(connection state) is capped by the library-is-lego rule and needs an owner change in
`swift-struck-ui` to reach 97.

**base_fork — 2026-08-25.** Run in BASE mode. The client has NOT leaked in: one hit for the
client token and it is a comment (`scripts/reset-all.mjs:10`), zero client-shaped tables, zero
tenant-id branching across `shared/` and all seven workers, a real branding seam
(`shared/brand.ts`, 12 consumers). Two fork rounds were ported back into the base and ten
became Laws — criterion 10 scores 100.

**The leak runs the other way: the base leaks OUT into its forks.**

- HIGH — `BOOTSTRAP.md` stands up two databases, but five workers ship an `OPS` binding
  (`db/ops/`) carrying the author's real database ids, and the word "OPS" never appears in
  BOOTSTRAP. `shared/workers/ops-db.ts:41`'s `env.OPS ?? env.DB` fallback exists for exactly
  this case and is defeated, because the binding ships *present* pointing somewhere foreign.
- HIGH — four copies of the `brimba_session` cookie name, one documented
  (`rate-limit.ts:69`, `gateway/src/index.ts:156`, `mcp/src/lib/bridge.ts:14` unlisted).
  Sweeping the documented one alone breaks every MCP call, silently.
- HIGH — following the documented sweep exactly turns `npm run check` **red** while the docs
  promise green: 6 assertions in `mcp/test/catalog.test.ts:94` and `web/test/use-form-draft.test.ts`
  pin literals the sweep renames.
- `workers/data-ops/.../agent.ts:42` hardcodes "You are Brimba's assistant" while the same
  worker imports `brand`.

Refuted one candidate: mcp's `CF_ACCOUNT_ID` is dead config, not a cross-tenant trap — mcp
calls no D1 door. (Overlaps `dead_end_review`; fix once.)

Ceiling: 95 reachable at ~95.6, but **only if the sweep becomes a real script guarded by a
law**. Documentation-only fixes top out near 86. Criterion 5 is structurally capped — 40 of
its points ask for an `upstream` remote, which a base by definition cannot have.

**first_run — 2026-08-25.** Static review; the agent could not walk a fresh account without
writing to the repo or a live environment, so criterion 10 scored 0 and says so.

The signature number: **95% of screens survive zero rows; 14% tell you what to do.** The
probe read 63%/13%; the agent corrected "guarded" upward (recipe lists are guarded inside the
UI library, invisible to a scan of `web/`) and "helpful" downward. Two methods agreeing near
13% is the finding.

- `web/components/screens/home-screen.tsx:24` — the landing screen offers a new customer two
  hardcoded links (Team, Settings). No welcome, no mention of Learning, Help, import, or the
  assistant. The string "get started" does not exist anywhere in the app.
- 19 of 21 empty states are absences ("No learning yet."), and **the library gives them nowhere
  to put a button**: `collection-frame.tsx:241` renders `{config.emptyText}` and nothing else,
  typed `string`. A recipe physically cannot put an action in its empty state. In-rule fix is a
  UI-GAPS entry requesting an `emptyAction` slot — not a host-side workaround.
- `web/e2e/team-flows.spec.ts:86` — the only cold-account test creates a fresh email, sees
  `/onboarding`, and stops. "Everyone testing already has data" is written into the repo as
  intended behaviour.
- `learning-progress.tsx:48` hands `items=[]` straight to `ProgressDashboard`, so a new team's
  Team progress tab is a bare header row. Cheapest high-severity fix in the report.

Strong and worth protecting: the sign-up path scores 95 (the hourly code cap **rotates** rather
than refuses; a missing email key refuses loudly instead of stranding), zero crash paths on
empty, and Law R13 verified real by following the browser's actual path to the catalogue.

Ceiling: **code-only max ≈93.** Criterion 4 is permanently capped at 80 by the locked
passwordless-email decision (the path waits on an inbox). Criterion 10 cannot be earned by any
commit — it needs someone to actually sign up once. With that, ≈97.

**lean_mean — 2026-08-25.** 89, down from 97 on 18 August. **Almost none of this is
regression** — it is a re-measure that found things the earlier pass asserted were absent.
The 97 was too generous; it claimed "no dead exports" while `sha256Bytes` had been dead since
12 June.

- R10 is enforced **twice per worker, and the older copy is weaker.** `shared/test/gating-seam.ts`
  (hardened, comment-stripping, boundary-guarded) landed 12 Aug; the weaker checks it was meant
  to replace still sit inside `workers/{tenancy,content,data-ops}/test/publish-seam.test.ts`
  (:88/:96/:90), untouched since 8 July, grepping unstripped source. Two divergent
  implementations of one security law read as double coverage and are actually **split** coverage.
- R1's publish-seam scan slices handler source to end-of-file and greps it **including comments**.
  All 78 exported handlers probed both ways: **0 pass on a comment alone today** — latent, not
  blind. Collapsing the family onto one shared scanner is **−168 lines** and closes it.
- **~200 lines unreachable**, each verified individually with `git grep`: `AgentView` (a 58-line
  component in a file nothing imports), the merged-shard read chain rooted at `queryModule`
  (0 callers), `sha256Bytes`.

### The absorption budget — the number Phase 1 has to respect

Seam-reusing code is **free and raises the score**. Copy-pasted code has a hard budget of
**≈550 lines**, and the publish-seam trio already spends 210 of it. New laws are the expensive
kind: R25 cost **+1,293 LOC in a week**, and `rules.test.ts` is now 978 lines. There is room for
about **three more laws** before Understandability drops a band.

Two conditions on the 95: split `rules.test.ts` **before** anyone adds R26 (a zero-LOC fix, the
previous pass's top item, still undone and now 11% larger), and no fix may land a per-worker
copy of anything. Scalability is capped at **94** by a locked ARCHITECTURE.md decision —
deliberate, total Cloudflare coupling.

**interfacelessness — 2026-08-25.** 81, down from 98 on 12 August. Parity 94 · Security 84 ·
Coverage 67 (35/52) · Robustness 70 · Scale 75 · Ergonomics 75.

**The most serious finding of the campaign so far.** `MCP.md:242-243` states that creating an
invite, revoking an invite and setting role permissions are "deliberately kept to the UI".
All three have been live MCP tools since 8 July (`tool-catalog.ts:204,240,256`), and
`catalog.test.ts:73` literally asserts `create_invite` exists. `git log -S` traces that table
to commit `9c16021` — **written by the previous run of this very review, to close its own
coverage finding, and false on the day it shipped.** Its closing sentence, "a machine caller
may use rights but not grant them… cannot invite people", is two-thirds wrong. The 98 was
manufactured.

- The heavy-request ceiling never reaches the machine surface. `rateLimit` runs only at the
  gateway on the public pathname; `isHeavyPath("/mcp")` is false, and a tool then reaches its
  door over a service binding that bypasses the gateway entirely. `callerKey` keys on the
  session cookie, which `/mcp` does not carry, so buckets fall back to IP. A browser gets
  600/min plus 60/min on chat, imports and exports; MCP gets 600/min per IP.
  `mcp/wrangler.jsonc` has no limiter binding at all.
- Three robustness guards stop at the boundary: `expectedVersion` (four edit doors carry the
  lost-update guard and the web client sends it; no tool forwards it, so a machine edit always
  wins the race); the three `set_*_active` tools compute `active: i.active === true` with no
  schema check, so an **omitted** boolean silently means *deactivate* instead of a clean 400;
  and `writeRow`/`writeParcel` (`import.ts:376,406`) hand-roll the forward instead of using
  `forwardToDoor`, so every imported row records `origin: "ui"` — meaning **`origin: "import"`,
  a declared R25 value, is produced by nothing in the codebase.**
- `POST /api/tenancy/selectable/bulk-active` — the R24 bulk door, added 12 August — has **no
  caller anywhere**: not web, not agent, not MCP, and no written exclusion.

The one free win: fix 6 is net-negative lines and helps activity_log, architecture, error_log
and lean_mean simultaneously. Ceiling 96.5 with all twelve fixes.

**error_log — 2026-08-25.** 63. Band: *leaky* — every count read out of `error_logs` is a
floor of unknown depth.

- **The only public door cannot record anything.** `workers/gateway/src/index.ts` has no
  `try/catch` and its `Env` carries no `DB`/`OPS` binding. A `URIError` from
  `decodeURIComponent` on `/media/%zz` (line 214, **unauthenticated**) is a bare platform 500
  with zero rows. `workers/realtime` has the same shape. `error-seam.test.ts:11` hardcodes
  four workers, so the law cannot see either of them.
- **The React error boundary the docs promise is mounted nowhere.** `<ErrorBoundary` appears
  in **no file** under `web/`; `layout.tsx:9` only imports it. ERROR-HANDLING.md §C1 and
  `hooks-order.test.ts:7` both claim it wraps the root. It was removed in `b77d325`
  (19 June) and `git log -S` shows it was **never** in the layout the doc names.
  `noUnusedLocals` is off, so the unused import keeps `npm run check` green.
- **An auth outage leaves no durable trace.** Three `GuardError`s carry 5xx
  (`gating.ts:97`, `bridge.ts:43/50`), and every central catch returns on
  `instanceof GuardError` *before* `recordWorkerError`. `whoAmI` is the busiest call in the
  base. R11's "said no vs said nothing" distinction survives in the response and is **lost in
  the store**.
- `request_id`, added 18 Aug: written for 5 workers, **NULL for every `web` row** (the gateway
  sends `requestId` at `index.ts:191`; auth's `internalLogError` at `index.ts:152` never
  destructures it), and **omitted from the admin SELECT** (`routes/admin.ts:34`) — so the
  column its own migration calls "THE query this exists for" cannot be read. `team_id` and
  `user_id` are set by no caller anywhere and are always NULL.

Its verdict, verbatim: *if auth goes down today, every screen 503s, every user is told to try
again — and `error_logs` stays empty.*

Ceiling: 95 clears arithmetically at 96.0, but only if the other nine criteria are perfect.
Alerting is capped at 20 by something no commit fixes — it needs a channel and a named owner,
which ERROR-HANDLING.md deliberately defers. Realistic **88–90 without an alerting decision,
~93 with one**.

**spend — 2026-08-25.** 76. Priced against Sonnet 5 at $2/$10 per MTok, read today.

- **One help-ticket reply can email every member of the team.**
  `workers/content/src/routes/help.ts:191` filters `taggedUserIds` for strings but never caps
  the length; `workers/content/src/lib/notify.ts:106` then `Promise.all`s one Resend email per
  recipient with no cap. Any `help:read` holder triggers it, and the door is not in
  `HEAVY_PATHS`. The fix reuses `requireIdList`, already imported at line 13 of the same file —
  **but it throws on an empty array, and empty is the normal case**, so the obvious one-liner
  would 400 every reply. (Also an abuse finding; cross-check against `security_sentry`.)
- **Prompt caching is off, and it is worth ~$274/month.** `grep -rn cache_control` returns
  nothing. Compiled with esbuild: the system prompt is 7,915 chars and 31 tool schemas are
  10,132 — a measured **6,220-token prefix re-paid on all 13 possible calls per reply**, 48% of
  a worst-case run. Worst action priced at **$0.3359 per 12-step agent reply**.
- **`AGENT_FREE_DAILY = 50` hands every team $24.84/month of inference for ever**, with no
  account-wide ceiling. At 1,000 signups a month and 10% uptake that is $2,484/month against a
  $5 plan. Signup itself costs $0.00044; an import $0.038.

Not fixable: the per-row bulk publish (`help.ts:171` — 512 Durable Object requests where the
sibling door uses 1) cannot be collapsed without breaking CACHING rule 3, a locked decision.
Recorded as informational, not as a fix.

Two probe results overturned by reading: the single "uncapped billed loop" is prose in a doc
comment, and orphaned avatars are not a leak — `MEDIA` uses stable keys, so overwrites are
correct by design.

Ceiling ~96, capped by a criterion needing the live `agent_usage_log`, the locked CACHING
deduction, and the owner's `KEEP_FOREVER` retention choice.

**speed — 2026-08-25.** 37, the lowest of the campaign, and the reason is one sentence:
**nothing in this codebase is instrumented.** Zero `Server-Timing`, zero
`performance.now/mark/measure`, zero logged durations across 222 non-test files. No number
exists for any operation, so all four budget rows are marked *unmeasured* with the commands
that would produce real numbers without a code change.

- **A 1,000-row import reads roughly half a million rows in one request.** `confirmImport`
  (`import.ts:435`) writes one row per service-binding request; that door is
  `postCreateLearning`, which ends in `oneLearning()` — a full 1,000-row list read. N imports
  means N full table reads and ~8,000 sequential HTTPS hops to `api.cloudflare.com`, with no
  chunking, no resume and no progress. `targets.ts:70` confirms none of the three base targets
  declares a bulk door, so `writeParcel`/`packParcels` and their tests are dead code.
- **Twelve mutation doors read a whole collection to return one row** — `oneLearning`,
  `oneSelectable`, `oneInvite`, `oneMember`, `oneRole`. Help's `getTicket`/`oneReply` prove a
  `WHERE id = ?` read satisfies R21/R23 equally. **R21/R23 got their letter and not their
  spirit**: the law said stop shipping the collection back, and the implementation obeys by
  reading the collection and shipping one row out of it.
- `teams.creator_id` and `teams.db_status` are unindexed. Every team database got two
  scale-index migrations; the global tables every tenant shares got none.

**The most dangerous tension surfaced anywhere in Phase 0**: a `ctx.waitUntil` fix for the 42
awaited `publishChange` calls would keep R1's `publish-seam` regex **green while changing what
the code does**. That is precisely the failure this campaign exists to catch, and the agent's
own condition is right — it may only land alongside a deliberately-broken control case.

Also a real law-vs-duration conflict: R16's exact `COUNT(*)` is a full scan of the
fastest-growing table on every feed page.

Probe honesty: roughly half its hits were false positives — inline `UNIQUE`/composite-PK
indexes it cannot see, 48 "unbounded writes" that were all English prose, and
`observability: true` on all seven workers missed because the probe never opens `.jsonc`. All
115 hits were opened and read.

Ceiling 97. Cheapest 40 lines — emit a duration on the existing trace seam, write the budget
down, assert one in the smoke — move 47 points of weight off the floor.

**round_trip — 2026-08-25.** 45. Opening `/t/<team>/help/<id>` in a fresh tab costs **24 HTTP
requests to answer 12 distinct questions**, in four serial waves, which the workers turn into
roughly **51 HTTPS round trips to `api.cloudflare.com`** because every per-team query is a REST
hop. `/home` costs 16 requests for 8 answers.

- No in-flight de-duplication in the client (`web/lib/store.ts:281,138`): `useCached` fires on
  every mount and guards only on `cache.has`, still false while a fetch is in flight. Six
  components share `my-perms:<teamId>` and issue six identical GETs. One fix removes 9 of the 24.
- The session loads **twice, serially, on every cold start** (`use-active-team.ts:74-106`) —
  two instances each run `auth.me()` *then* `tenancy.active()`, while `refresh()` in the same
  file already uses `Promise.all`.
- The CSV import writes one HTTP request per row, sequentially, up to 1000
  (`import.ts:479-494`), each costing 4–6 D1 REST hops.

**A real user-facing bug fell out of it:** help became paged under R14, so a deep link to a
ticket past page one renders *"That ticket no longer exists."* The server's single-row door
exists for exactly this case and is unused. The locked `EDGE-CASES §2` / `CACHING §3` decision
("detail reads from the list cache; lists are intentionally fat") is no longer merely a
trade-off — since paging landed it is a correctness fault.

Ceiling: **95 is not reachable by code.** 89 while one-auth-master and `EDGE-CASES §2` stand;
amending §2 raises it to 97. Owner decision.

**dead_end — 2026-08-25.** 50. The theme is controls that are **shown and enforce nothing**.

- `POST /api/tenancy/config/screens` has **zero callers** — no component, no agent tool, no MCP
  tool, no script — while the table, migration, gate, validator, the client wrapper
  `tenancy.setScreenOverride`, the merge in `use-screen-data.ts`, a unit test, an entire
  `screens` permission row and the `AgentView` renderer all exist. The source comment calls it
  "agent-callable"; it is not. Every team's `screens` table is permanently empty.
  (Cross-confirms `lean_mean`'s dead `AgentView`.)
- **10 of 32 permission switches are live toggles that enforce nothing** — `teams.read/create/delete`,
  all four `screens.*`, `help.delete`, `agent.edit/delete`. `postScreen` gates on `teams.edit`
  rather than `screens.edit`. Sharpest of all, `teams.read` is *half* honoured: it hides the
  Overview tab client-side while the server stays any-member, so it looks enforced.
- "Raised from" prints on every support ticket and nothing can fill it — `help.source_screen`
  is rendered with a label, and no surface sends it. Same family, and worse: **a UI edit of a
  learning article silently clears its "Required" badge and sequence**, because the update SQL
  defaults omitted fields instead of leaving them alone. That is data loss on a normal edit.

Ceiling 96.3. A 25-point block needs `PermissionMatrix` to accept a per-module rights list, and
that component lives in `@swift-struck/ui`. `teams.create` is structurally unenforceable —
teamless onboarding must be able to create a first team.

**activity_log — 2026-08-25.** 82, down from 94 on 18 August. **Nothing regressed** — the 94
scored the *intent* of fixes written that same day and never traced their effect.

- **The AI assistant can add content to a support ticket with no trace.**
  `workers/content/src/lib/help.ts:439-464` — `addReply` inserts into `help_threads` and bumps
  `help.updated_at` with zero activity rows, and it is exposed as an agent and MCP tool
  (`tool-catalog.ts:361`). `help_threads` is the only user-editable business table with zero
  logged writes. The previous run missed it because a `logActivity` sits 31 lines earlier in a
  *different function* — a proximity artefact, and the agent's own scan repeated the mistake
  until it opened the file.
- **Half the verb enum is never written, and the test covering it cannot fail.** `deactivated`,
  `activated` and `status` are written by no code path; five log sites send no verb at all — all
  of them the deactivate and status ones. `idx_activity_verb`'s own documented example query
  ("every deactivation this month") returns zero rows for ever. `activity-seam.test.ts:153`
  asserts that a constant contains the strings listed on the line above it.
- **Three of six `origin` values are unreachable and one is falsified.** `SYSTEM_ACTOR` carries
  no origin, so the nightly job's rows read `creator_name="Scheduled job", origin="ui"` — the
  provenance column states something untrue. `api` and `import` are written by nothing. And
  **`getActivity` never selects `origin`, `verb` or `before_after`** — the three columns
  migration 0008 added have no reader anywhere in the codebase.

**The question carried over from 18 August — does `before_after` fill on a live EDIT?**
Code-proven for learning, help and member_roles (12 columns, 12 values, correctly aligned,
escaping sound). Runtime-unproven, and now with a named reason: nothing reads it back, and it
only exists after `migrate-teams` has run. **If migration 0008 is missing on a team's database,
the INSERT fails on unknown columns and `logActivity` swallows it — that team's entire activity
log stops, silently.**

Ceiling: 95 reachable with **zero margin** — best plausible total is 95.05, so every single
finding must land. Criterion 1 is permanently capped at 60 by the locked per-team-D1 decision
(two log tables). Its own recommendation respects the law budget: extend the existing R25 check
rather than adding an R26.

**ocean — 2026-08-25.** 60 gated, 87 uncapped, down from 95. `git push` alone takes it to 94.

**THE FINDING THAT MATTERS MOST TO THE OWNER PERSONALLY.** `secrets.vault` **has never
existed**: `git log --all --diff-filter=A` returns empty, it is absent from `origin/main`, and
absent from the drill clone. Yet `SECRETS.md` (twice), `OPERATIONS.md` and `CHANGELOG.md` all
state that it exists and that "the credentials survive the laptop". The recovery runbook dies
at step 3. The project's own `vault:check` exits 1 saying "NO VAULT". **The 12 August review
flagged this verbatim and 13 days have passed unchanged.** The cryptography and the prose are
excellent; the artefact was never produced.

Against the owner's stated priority — *"if this laptop is thrown in the ocean, it won't matter
because everything's on GitHub"* — the code survives and the credentials do not.

**Bus factor does NOT cap the score.** Measured by Avelino degree-of-authorship over 385 files:
truck factor 1 costs exactly **2.0 points**, and the single-author maximum is **98**. Criterion
10 is already at its solo maximum — CODEOWNERS, a named maintainer, a real CONTRIBUTING. No
headcount fix is proposed, and my earlier guess that authorship might block 95 was wrong.

**The rebuild drill passed.** Anonymous clone 1.45s → `npm install` 9s → `npm run check` 18s,
8 suites, **589 tests** green. Re-run with no SSH key, no git credentials and a cold npm cache:
exit 0 in 76 seconds.

Local is **one commit ahead of `origin/main`** — `8751e30`, which deletes two vendored skill
docs, adds three `.gitignore` lines and changes one word. Harmless, but unpushed.

Also: `swift-struck-ui` — a second repository the build hard-depends on — is absent from
INVENTORY.md; `SECRETS.md` omits `RESEND_API_KEY`, the one whose loss stops sign-in entirely;
four places give three different Node versions (CI runs 22, `engines` says 24); and `cf-exec`,
named in the recovery runbook, exists nowhere.

Three probe results refused: `envExample: null` (wrong — two `.dev.vars.example` files name all
10 human-supplied vars), `filesWithHeaderDocPct: 67` (re-measured at 98% — the probe reads only
line 1), and a bogus first-commit date.

**Both repositories are public.** Sealing an encrypted vault into a public repo is therefore a
deliberate security decision, not a chore — flagged for `security_sentry`, and `base_fork` needs
a sweep step to delete it from a fork.

**architecture — 2026-08-25.** 87, down from 96 on 18 August. Nothing regressed: the 96
declared "100% of cross-service calls guarded" after correctly clustering the 53 `publishChange`
sites, then stopped without opening `forwardToDoor` or the import path, and scored two criteria
from documentation quality instead of the counts the rubric asks for.

- **R11's check has been green over live violations since the day it was written.**
  `web/test/rules.test.ts:265-291` calls `workerSources()`, which walks `workers/*/src` only —
  64 files, **zero under `shared/`**. Its own exemption is keyed `"shared/workers/http.ts"`, a
  path it structurally cannot see. It greps `env.X.fetch(`, which a local alias defeats, and
  `env.CHANNELS` (Durable Object RPC) is not in its binding list at all.
- **Three unbounded, uncorrelated binding calls on the import path** — `import.ts:381,415` and
  `import-batch.ts:161` assign `const fetcher = … env.CONTENT : env.TENANCY` then call
  `fetcher.fetch(...)`: no `AbortSignal`, no `x-request-id`, no exemption. An import fans one
  request into thousands of door calls, none carrying the id the gateway minted.
- **The public door has no central catch and records nothing** — `workers/gateway/src/index.ts`
  has no handler-level try and no D1 binding. `GET /media/%` reaches `decodeURIComponent` at
  `:214` unauthenticated and returns a bare 1101 with no `error_logs` row.
- `RULES.md:29` calls `forwardToDoor` "guarded"; its file contains **zero** try/catch in 79
  lines. The nightly cron runs four independent jobs under one `try` and records
  `place: "cron/size-check"` whichever one actually died.

Clean and verified: **0 cycles across 196 production files**, 58/58 environment-parity keys, and
recovery 100/100 against a real restore drill.

Ceiling: fixing everything reaches **94, not 95**. Criterion 2 is permanently capped at 85 by
the locked no-session-cache decision (ARCHITECTURE §2b) — named, not relitigated. Criterion 7
caps near 90 because each of the 25 laws costs a registry line. **95 requires spending on
criterion 7 or 8, and both trade directly against `lean_mean`.**

**scaling — 2026-08-25.** 54, down from 94. Four blockers, fifteen majors, seven minors.

- **The nightly upload sweep deletes files that records still point at.**
  `workers/tenancy/src/lib/sharding.ts:437–457` — the reference read is `LIMIT 10000` with **no
  `ORDER BY`**, while the deletion loop walks 10,000 objects in *key* order. Above 10,000
  attachments the two sets diverge and referenced files are deleted after the 7-day grace.
  `retention.test.ts` checks the object-listing truncation and the fail-closed path, and never
  the reference read's truncation. A green check asserting the wrong intent.
- **Retention can never remove more than 5,000 rows per table per night** — `sharding.ts:315`
  issues one `DELETE … LIMIT 5000` per rule per run. `idempotency_keys` (one row per form
  submit, platform-wide) and `login_codes` exceed that at a single busy tenant, inside the
  shared 10 GB core database, which has no mover.
- **One write costs one read per connected session.** `app-shell.tsx:119–158` invalidates
  `activity:team:<id>` on *every* ping — a keyset page plus an exact `COUNT(*)` over the biggest
  table — `patchRow` fetches per client and `useLiveRefetch` re-pulls per paged screen, all
  undebounced. 25,000 sessions means ~25,000 reads per write, and a 512-id bulk publishes 512
  pings. `MAX_SHARDS=32` bounded the send side only. Absent from SCALING.md.
- `oneMember`/`oneLearning`/`oneRole`/`oneSelectable`/`oneInvite` implement R21/R23 by reading
  the whole 1,000-row capped list and `.find()`-ing — **and return `null` past row 1,000, which
  `applyUpdated` treats as "removed"**. Edit record 1,001 and it disappears from the screen.

**Two regressions from the previous pass**, both mine: `brimba-ops` is excluded from the size
alarm's filter (`/-core(-staging)?$/`), and **R23's "affected row" moved the full list read from
the wire into the database** rather than removing it.

Ceiling: **95 is not reachable from this repo; true maximum 94.** Client volume caps at 75
(virtualisation lives in `@swift-struck/ui`); storage at 86 (the owner declined the R2 token for
presigned uploads); queries at 88 (R16's exact `COUNT(*)`); fan-out at 88 (R1 and CACHING rule 3
per-row pings). Either the library shipping virtualisation, or reversing the presigned decision,
clears 95.

Platform limits checked live today: 10,000 subrequests per invocation, 1,000 D1 queries per
invocation, **100 bound parameters per query**, 100 KB per statement, and read replication
available through the Sessions API — currently unused.

**story — 2026-08-25.** 71, down from 98 on 12 August. 31 findings: 8 high, 13 medium, 10
minor. Both modes run; the `--foundation` matrix covers 15 capabilities across 4 columns.

Its own summary is the diagnosis: **nothing here is a new architectural fault — it is one fault
repeated.** Three feature rounds (R11/trace, R24, R25) landed in the code and in `RULES.md`
within thirteen days, and the rest of the corpus did not move.

- **`BASE-MANUAL.md` §4 says the base has 8 laws. It has 25.** At `:425-426` it offers `R9` as
  "a natural next Law" — R9 has been enforced since 4 August with a different meaning. Its R8
  row at `:407` ("derives its count from its loaded rows") states the exact anti-pattern R16
  was written to forbid. **Five documents state five different law ranges**: R1–R8, R1–R10,
  R1–R19, R1–R23, R1–R25.
- **Two migrations exist in no runbook, and both fail silently.** Team `0008_activity_origin`:
  `logActivity` swallows its own insert failure, so an unmigrated team database loses its audit
  trail while the app looks healthy — the same fault `activity_log` reached independently.
  `db/ops/0002_error_request_id.sql`: `logError` swallows too, so an ops database built by
  following `OPERATIONS.md:257`, `INVENTORY.md:58` or `BOOTSTRAP.md` records **nothing at all**.
  `OPERATIONS.md:45` spells this exact consequence out for core `0014` and did not repeat it.
- **The size alarm fires at 65%** (`sharding.ts:36`) while four documents including the LOCKED
  master say 80% (`ARCHITECTURE.md:27`, `OPERATIONS.md:44`, `BASE-MANUAL.md:528`/`:582`,
  `CONVENTIONS.md:174`). The alarm's own message string still reads ">=80%". Master versus a
  newer reasoned decision — owner's call, deliberately not moved.

Ceiling: 96 with all doc fixes, **94 from inside this repo** — one LOCKED `ARCHITECTURE`
threshold and one rule whose canon lives in the UI library are both owner-gated.

Its closing observation is the sharpest thing said all day: **`registry-integrity` reads exactly
one file, which is why `RULES.md` is the one law list that is right.** Four other documents
drifted precisely because nothing machine-checks them.

Candidate law for the next base: **a fact stated in more than one document must have exactly one
machine-checked source, and the others must be generated from it.**

## FOUR REAL USER-FACING BUGS, FOUND BY FOUR DIFFERENT REVIEWS

Not score items. Things that are wrong for a person using the app today:

1. **Referenced uploads get deleted** above 10,000 attachments per team (`scaling`).
2. **Editing a learning article silently clears its "Required" badge and sequence**, because the
   update SQL defaults omitted fields instead of leaving them (`dead_end`).
3. **A deep link to a support ticket past page one says "That ticket no longer exists"** — help
   became paged under R14 and detail still reads from the list cache (`round_trip`).
4. **Editing any record past row 1,000 makes it vanish from the screen** — the mutation door
   returns `null` and `applyUpdated` reads that as "removed" (`scaling`).

## CONVERGENCE — three reviews found the same two faults independently

`error_log`, `architecture` and (for the import half) `speed` and `round_trip` each arrived
separately at:

1. **The gateway records nothing.** No central catch, no D1 binding, reachable unauthenticated
   via `decodeURIComponent`.
2. **The import path fans out unbounded, untraced, one row per request.**

Four independent readers, no shared probe, same lines. These two are not candidates — they are
established, and they go to the top of the repair order.

## THE PATTERN BEHIND THREE OF THE FOUR BIGGEST DROPS

| Review | Was | Now | Measured |
|---|---|---|---|
| interfacelessness | 98 | 81 | 12 Aug — hours after the work it graded |
| lean_mean | 97 | 89 | 18 Aug — hours after the work it graded |
| activity_log | 94 | 82 | 18 Aug — hours after the work it graded |

None of these regressed. Each earlier score graded the **intent** of a change written the same
day, by the same session, and never traced the effect. R25's columns are the clearest case: the
migration ran, the writers were added, the score was taken — and nothing reads the columns to
this day.

Candidate law for the next base: **the session that writes a fix may not be the session that
scores it.** A review run against work still warm from the same context measures what the author
meant, and the author already believes it.

## METHOD FAULT — my own, found by dead_end

I gave all 16 agents **one shared scratchpad path**. dead_end's first `probe.json` came back
containing the *realtime* review's output. Any agent that wrote a generically-named scratch file
and read it back may have scored another review's data.

dead_end caught it and re-derived everything with its own scripts. The others were not warned.
**Phase 1 must re-verify any headline number that looks probe-derived rather than hand-derived**,
and every future fan-out gets a per-agent scratch directory. Recorded here rather than quietly
fixed, because a contaminated input that nobody logs is exactly the class of fault this campaign
is about.

## Emerging lesson — the blind-check pattern, FIFTH and SIXTH sightings

`error-seam.test.ts:11` hardcodes the four workers it checks, so the two that most need error
recording — the public gateway and realtime — are invisible to the law that supposedly covers
them. And R11's own check (written 18 Aug) matches `env.X.fetch(`, so `import.ts:382/416` and
`import-batch.ts:162`, which alias the binding to a local first, are **three unbounded,
untraced service calls the law cannot see**.

Six blind or half-blind checks in one week. The shape is always the same: the check enumerates
what to look at, and what it does not enumerate is invisible rather than failing.

Refinement to the candidate law: **a check must derive its own subject list from the code, never
hardcode it** — and must be proven to fail before it counts.

## Emerging lesson — a review must not be allowed to close its own finding

The previous interfacelessness run had a coverage gap. It wrote a doc declaring the gap
intentional, cited its own doc, and scored 98. Nothing in the process could catch that,
because the evidence and the claim had the same author.

Candidate law for the next base: **a documented exclusion must be machine-checked against the
code it excludes.** The agent's own suggestion is the cheapest possible version — roughly
twelve lines asserting that no row in MCP.md's exclusion table names a live `MCP_TOOLS` entry
would have caught this in July.

## Emerging lesson — the blind-check pattern, FOURTH sighting

R1's publish-seam scan slices to end-of-file, exactly like `idempotent-transitions` did.
Latent rather than blind today, but the same construction. Four in one week, all in checks
that guard Laws everyone believed were enforced.

## Emerging blocker — two reviews are capped by the UI library, not by this repo

`realtime` needs a connection-state primitive; `first_run` needs an `emptyAction` slot on the
collection frame. Both live in `swift-struck-ui`, which CLAUDE.md forbids this repo from
editing. Neither review can reach 95 until that library changes. This is an owner decision,
not a code problem — see "Open decisions".

## Emerging theme — the core is strong, the edges are not

Two reviews, same shape. `realtime`: transport is excellent, the last hop **to a screen** is
where every point is lost. `base_fork`: the foundation is clean, the last hop **to a new app**
is where it breaks. Neither fault is in the thing itself; both are in its delivery.

## Emerging lesson — the blind-check pattern, third sighting

`idempotent-transitions` (18 Aug, sliced to end-of-file), the activity probe reading English
prose as SQL (18 Aug), and now R15's paged check filtering on a predicate **no file in the
repo satisfies**. Same shape every time: a check that cannot fail, green since the day it
was written, guarding a law everyone believes is enforced.

Candidate law for the next base: **a rule check is not admissible until it has been proven to
fail.** Sabotage as a requirement of adding a check, not a practice someone remembers.


---

# PHASE 2 — the repairs, and what was deliberately NOT repaired

Six commits on branch `review-campaign`, gate green after each.

| Commit | What |
|---|---|
| `73a60a4` | the checks that could not fail, and the sweep that deleted real files |
| `e6676c5` | the record that vanished, the reply nobody could see, the columns nobody read |
| `3cd3e14` | three calls to tenant admin, and the check that watched a gate leave |
| `138c3e4` | the four law lists nothing checked, and the database no runbook mentions |
| `5e35efe` | auth had ten ungated doors and no check could see them |
| `fe7d683` | a ticket that existed, and R15's check that had never been able to fail |

## The keystone

`shared/test/source.ts` — ONE source reader, tested in `web/test/source.test.ts`.
Ten checks were blind because each hand-rolled its own slicing. **`stripComments`
itself was broken**: it ran the block pass first, so a slash-star inside a LINE
comment opened a comment that was never opened and ate real code to the next
terminator. Fifteen files carry that pattern, three of them worker entry points.
Every Law check in this repo had been reading less than it believed.

It was found only because a NEW check failed on something visibly present — and
the first version of that new check had the SAME fault, its own explanatory
comment satisfying the search. Caught by sabotage, on the afternoon the
comments-are-not-code rule was written down, by the person writing it.

## Sabotage-proven, every one

Each new or changed check was proven by breaking the guarded thing, watching it go
red naming the right file, and restoring **from a copy — never `git checkout`**:

R11's aliased-binding scan · the orphan sweep's paged reference read · the
error-seam's derived worker list AND its catch-body scoping (the first version
stayed green under sabotage — a file-wide grep matched an unrelated handler) ·
the single-row-reader scan · the activity verb scan · the DEAF_EXEMPT key check ·
the root-layout mount check · the law-range check · the runbook migration check ·
the MCP exclusion-table check · auth's R10 suite · the gating-seam slicer.

## Deliberately NOT repaired — the reconciliation

These are the conflicts Phase 1 existed to resolve. Recorded so they are not
re-filed as findings:

- **the 69-line merged-shard read chain stays.** `lean_mean` called it dead code;
  `SCALING.md` names it a relief valve. Scaling wins.
- **`AgentView` stays.** Unreferenced, but its own comment says the panel never
  mounts one until the feature lands. Deleting a planned capability is the owner's
  call, not a cleanup.
- **`ctx.waitUntil` on `publishChange` NOT applied.** It would make a hot path
  faster and keep R1's check green while changing what the code does — precisely
  the failure this campaign exists to find.
- **caching the R16 count NOT applied.** It breaks the law.
- **the secrets vault** — the owner must seal it. It needs a passphrase I must
  never see or handle.


---

# PHASE 3 — the re-measure, and what it caught

All sixteen re-scored by agents that did not write the repairs.

| Review | R1 | R2 | Criteria that FELL |
|---|---|---|---|
| lean_mean | 89 | **91** | 1 — my new checks grew `rules.test.ts` |
| activity_log | 82 | **88** | 1 — its own round-1 over-credit, corrected down |
| architecture | 87 | **89** | 1 — my gateway regression |
| interfacelessness | 81 | **84** | none |
| realtime | 80 | **81** | none |
| base_fork | 77 | **78** | none |
| spend | 76 | **79** | none |
| story | 71 | **68** | 4 — three of them mine |
| security_sentry | 68 | **68** | none (ControlScore rose; the HIGH stayed open) |
| error_log | 63 | **68** | none |
| first_run | 62 | **62** | none — nothing of its was repaired |
| dead_end | 50 | **50** | 1 — my `postScreen` fix left two stale claims |
| round_trip | 45 | **45** | none |
| speed | 37 | **39** | none |
| scaling | 54 | **57** | 1 — my gateway regression |
| ocean | 60 | **25** | the campaign's own work was not on GitHub |

**The re-measure paid for itself three times over.**

1. **Three reviews independently found the same regression I introduced** — the
   gateway central catch turned an unauthenticated malformed URL into an unlimited
   write amplifier, because `/media/*` sits outside the surge ceiling by design.
   scaling scored it a new blocker; architecture traced the one row that fell to
   it; error_log filed it as a new HIGH caused by its own round-1 fix.
2. **security_sentry proved the escalation was still open.** It could not defeat
   the amplification rule I added — it did not need to. `team_members:create`
   alone was "invite a plus-address of yourself as Admin and accept". I had closed
   the wrong door, and only an independent reader looking for the *outcome* rather
   than the *fix* found it.
3. **ocean caught that none of this was on GitHub.** Twelve commits, 103 files,
   20,805 lines, on a branch with no remote, while the owner's stated first
   priority is that the laptop is expendable.

## Blind checks found: eleven. Two of them written during this campaign.

The eleventh was mine, written in the same commit as the fix it guarded:
`expect(doc).toMatch(/ops/i)` matched the PRE-fix document thirteen times through
the worker name `data-ops`. The rule that follows is in `LESSONS.md` and it is the
campaign's single most transferable finding: **a check is not admissible until you
have watched it fail.**

## What remains, and who owns it

**Owner only — I cannot do these:**

- **Seal the secrets vault.** It has never existed while four documents say it
  does. Both repositories are public, so it needs a generated 128-bit-plus
  passphrase, NOT the memorable one `SECRETS.md` argues for — and two false claims
  in that document corrected first (the passphrase does cross a process boundary,
  twice). Then wire `vault:check` into the ship gate; it exits 1 today.
- **The UI library.** Four reviews are capped by `@swift-struck/ui`: realtime
  needs a connection-state primitive, first_run and dead_end need an `emptyAction`
  slot and per-module rights on `PermissionMatrix`, scaling needs virtualisation.
  None can reach 95 until that library changes.
- **The 65% / 80% size alarm.** ARCHITECTURE (locked, master) says 80%; the code
  fires at 65%. The alarm message now derives its own number, so it no longer
  contradicts itself — but master and code still disagree.
- **Sign up once on a fresh account.** first_run cannot exceed 91 without it, and
  reaches 95 with it. No commit can buy that.
- **`AGENT_FREE_DAILY = 50`** hands every team $24.20/month of inference with no
  account-wide ceiling. A business decision, not a bug.

**Next code session, in value order:** the screen-override subsystem (finish or
remove — worth 15 points on dead_end, the largest single move left), prompt
caching (~$273/month), `scripts/fork.mjs` guarded by a law (base_fork 78 → 95.4),
the in-flight request de-dup (round_trip's criterion 1 is the gate), retention
that can remove more than 5,000 rows a night, and the 5xx `GuardError` that still
reaches no error row.


---

# PHASE 4 — the owner's decisions, and the second repair wave

Four decisions, 2026-08-25:

| Decision | What happened |
|---|---|
| Screen-override subsystem | **Removed**, not finished. ~300 net lines gone, plus one network request per team screen and four permission switches that governed nothing |
| Size alarm 65% vs 80% | **80%** — the master document wins; the cost (2 GB headroom instead of 3.5) is recorded in the constant rather than lost |
| `AGENT_FREE_DAILY = 50` | **Stays.** A business call, not a bug. Prompt caching has since cut it from $24.20 to $15.89/team/month |
| The secrets vault | **Owner-only.** I declined to read a passphrase from a file — querying it puts the secret in my context, and the location is not what needs protecting |

## What the second wave repaired

Six agents on disjoint files, then round 3 measured by agents that wrote none of it,
then round 3's own findings repaired. Shipped to staging AND production.

**Prompt caching** ($273.20/month, confirmed to the cent by two independent
routes) · **retention that can finish** (it removed at most 5,000 rows a night
against tables an anonymous caller can fill) · **in-flight de-duplication** (six
components asking the same question six times) · **per-module permission rights**
(28 cells, 22 gated, 5 dead removed, `teams.read` KEPT after it was found to gate a
real screen) · **a connection dot** · **a first-run block on `/home`** · **Law R26 +
`scripts/fork.mjs`** · **`ROUTE-CENSUS.md`** · **`scripts/timings.mjs` and written
budgets** · **the operations database under the size alarm** · **account creation
logged** · **a 5xx GuardError recorded in all four workers**.

## Round 3 found four faults in the repair pass itself

That is what the round is for, and it is the campaign's whole argument:

1. **A fresh clone of `main` did not compile.** Both manifests pinned v0.16.0;
   `package-lock.json` still resolved the SHA of v0.4.0, and `npm install` obeys the
   lockfile. R26's check read the manifests and never opened the lockfile.
2. **The privilege guard was closed and completely unlocked.** Fourteen attacks
   could not defeat it; deleting the call from both doors left tenancy at 119/119.
3. **`vault-claims-match-reality` was written about three sentences and matched
   none of them** — it sat green while three documents claimed the vault existed.
4. **The 5xx recorder check was two regexes over a fixed window**, and the generic
   catch's recorder sat inside that window, so deleting the 5xx one stayed green.

Every one was mine. Every one looked like a passing check.

## Blind checks found across the campaign: fifteen

Four written during the campaign, by the author of the rule against them. The
count is the argument for `LESSONS.md`'s first law: **a check is not admissible
until you have watched it fail.**


---

# PROVEN END TO END, 2026-08-25

Not asserted — run, and the exit codes recorded.

| Claim | How it was proven | Result |
|---|---|---|
| A fresh clone of `main` builds | cloned the remote into a scratch dir, `npm install`, `npm run check` | **exit 0** |
| A FORK of the base builds | fresh clone → `node scripts/fork.mjs acrymold` → install → check | **exit 0**, 152 files swept, 688 occurrences, zero mentions of the old name left |
| The instrumentation is real | `curl -I` staging | `server-timing: gateway;dur=26` + `x-request-id` |
| The write amplification is closed | `GET /media/%zz` on both environments | **400**, not a 500 with a log row |
| Every operation is inside budget | `node scripts/timings.mjs` on staging AND production | workers answer in 3–9 ms; all four inside budget |
| A signed-out visit costs one call | browser, cold load | one request: `GET /api/auth/me` → 401, sign-in shown |
| Staging and production both serve | browser screenshot, both hosts | the sign-in screen renders on both |
| Staging holds no test data | `reset-all.mjs staging` | RESET OK — every table empty, schema intact, team databases gone |
| Production holds nothing | queried `brimba-core` and `brimba-ops` | 0 users, 0 teams, 0 error rows |

**27 commits · 162 files · 646 tests · gate green · everything on GitHub.**


---

# FINAL SCORES — measured by agents that wrote none of the repairs

| Review | R1 | R2 | R3 | **Final** | Move |
|---|---|---|---|---|---|
| ocean | 60 | 25 | 90 | **94** | +34 |
| lean_mean | 89 | 91 | 92 | **93** | +4 |
| activity_log | 82 | 88 | 89 | **89** | +7 |
| architecture | 87 | 89 | 89 | **89** | +2 |
| interfacelessness | 81 | 84 | 88 | **88** | +7 |
| realtime | 80 | 81 | 86 | **86** | +6 |
| security_sentry | 68 | 68 | 79 | **83** | +15 |
| base_fork | 77 | 78 | 83 | **83** | +6 |
| spend | 76 | 79 | 81 | **81** | +5 |
| first_run | 62 | 62 | 77 | **77** | +15 |
| dead_end | 50 | 50 | 70 | **70** | +20 |
| error_log | 63 | 68 | 70 | **70** | +7 |
| story | 71 | 68 | 68 | **68** (72 at HEAD) | −3 |
| scaling | 54 | 57 | 63 | **66** | +12 |
| round_trip | 45 | 45 | 62 | **62** | +17 |
| speed | 37 | 39 | 45 | **55** | +18 |

**Average 67 → 78. Nothing at 95. Nothing above 94.**

That is the honest result and it should not be dressed up. Sixteen reviews found
far more than one campaign could close, and the closing itself kept generating
work: every re-measure found faults in the repairs before it, four of them in
checks written that same day by the person who wrote the rule against them.

## Ceilings that are not code

Named by the reviews themselves, so the next session does not spend effort on them:

| Review | Cap | Why |
|---|---|---|
| ocean | 96 | one author — the Avelino truck-factor row, worth exactly 2 points, permanently |
| scaling | 90 | a ping carries no row data (locked), so every client must read; and the shared core DB the mover cannot relieve |
| speed | 84 | `ctx.waitUntil` declined — it would keep R1's check green while changing behaviour |
| round_trip | 78 | the gateway→auth hop IS the permission spine |
| security | 92 | `/media/*` outside the surge ceiling, by design |
| story | 88 from words | three criteria need commits, not prose |
| lean_mean | 90 while `reviews/` is tracked | 26,473 lines, 0.86× the product source |
| first_run | 95 | reached only because somebody actually signed up |

## The one thing still owed by the owner

**Seal the vault.** `npm run vault:save`, with a GENERATED passphrase from a
password manager — both repositories are public. Four documents now say plainly
that it does not exist yet, and a check keeps them honest.


---

# ROUND 5 — the run at 95

## Six scores were wrong before a line of code changed

The uncomfortable finding first. A third of round 4's closing numbers were
arithmetic, not engineering, and every correction below is justified by the
rubric's own published text — never by preference.

| Review | R4 said | True at HEAD | Why |
|---|---|---|---|
| security_sentry | 83 | **88** | Substituted its own formula for the skill's published weighted mean, and counted a 2-MEDIUM/3-LOW penalty as 12 rather than 9. Both errors pushed the same way |
| ocean | 94 | **95** | Asserted criterion 1 instead of measuring it from its own rows |
| base_fork | 83 | **85** | A round-3 HIGH had closed; and a criterion was scored 67 where the rubric says "unmeasured, not zero… rather than inventing a number" |
| dead_end | 70 | **75** | Three findings already fixed, never re-measured |
| story | 68 | **72** | Ran a DEFECT criterion as a running delta, where the rubric restarts it at 100 each run |
| round_trip | 62 | **66** | Its own CRITICAL and a HIGH landed after the measurement |
| interfacelessness | 88 | **89** | A deleted tool stopped being advertised |
| speed | 55 | **56** | An index defect it carried forward was already fixed |

**Average 78 → 86 before any repair.** The lesson is the same one the campaign
keeps re-learning, applied one level up: *a number that looks measured, is quoted
downstream, and was never re-derived, is a blind check wearing different clothes.*

## Five of the eight "ceilings that are not code" did not survive contact

Two were mine. `speed` was capped at 84 because I declined `ctx.waitUntil` to
protect Law R1's check — a check whose regex had always matched the wrapped form,
so the refusal protected nothing. `round_trip` was capped at 78 on "the
gateway→auth hop IS the permission spine" — the gateway does not call auth on the
normal path at all, and the hop that does happen is a same-colo service binding.

Only `scaling`'s contentless-ping decision (which is what stops a client without
rights learning row data) and `ocean`'s one-author truck factor held.

## What the round actually bought

**Four defects no rubric asked about**, every one found by an agent reading the
surrounding code on the way past a scoring task:

1. **Three update doors destroyed data.** An omitted field was treated as a
   cleared field. Asking the assistant to rename an article wiped its body,
   category, link and type; granting a role one module's rights **zeroed the other
   six**. Two of the three tools were marked not-dangerous, so no confirmation
   ever appeared. A form posts every field, so only a machine caller could reach
   them — which is why nobody had.
2. **The performance evidence was measuring nothing.** Round 4's "2–9 ms,
   everything inside budget" came from health endpoints that do no work. The first
   authenticated probes: 770, 874, 1454 ms server-side. Every SQL statement in
   this app runs in 0.1–0.3 ms; the latency is entirely network distance, because
   the core database is in APAC and the team databases are in WEUR.
3. **Three faults in the module every law check reads source through** — a regex
   literal containing a quote made sixteen files leak their comments into what
   checks read as code; a path helper ate the first character of every path, so
   prefix-based exemptions matched nothing; and vitest's own cache directory
   turned thirteen checks red at once.
4. **A lost-update guard no caller could reach**, and a live listener registered
   and idle for months with a comment explaining that nothing published it.

**One measured latency win:** raising a ticket, 1457 ms → **894 ms** (−39 %),
same colo, measured from an isolated worktree so the number is attributable.

**Three more blind checks found, two written this round, one of them mine:** the
R21 check read for a literal `created:` and went red on a correct refactor; the
error-seam check read for the log call *inside* the catch body and went red when
I hoisted two copies into one helper; and the one deliberately-public door's
exemption asserted that its justification sentence was **longer than 40
characters**, then skipped the route entirely. That is eighteen across the
campaign.

## How the reviews were kept from fighting

Recorded in full in `ROUND5-RECONCILIATION.md`. In short: measure everything
read-only first; make every proposed fix declare which other review it could
damage; settle the collisions centrally and in writing before editing; partition
the repair work by **file**, not by review, so two fixes can never meet in one
diff; and re-measure with agents that wrote none of it.

Two repairs were refused by the agent asked to make them, on evidence, and both
refusals stand: skipping the paged `COUNT(*)` (the agent and MCP surfaces are
promised an exact total and have no sidecar to fall back on) and trimming the fat
list projection (the detail screen reads the list cache and feeds it back through
the update door, so a trimmed list would not render blank — it would destroy the
article).

## FINAL SCORES — round 5, measured by agents that wrote none of the repairs

| Review | R4 | **R5** | Δ | ceiling the re-measure derived |
|---|---|---|---|---|
| realtime | 86 | **95** | +9 | 99 |
| interfacelessness | 88 | **94** | +6 | 99 |
| lean_mean | 93 | **94** | +1 | 96 |
| activity_log | 89 | **92** | +3 | 95 |
| ocean | 94 | **92** | −2 | 97 (truck factor −2, permanent) |
| architecture | 89 | **90** | +1 | **94** |
| story | 68 | **89** | +21 | 98 |
| dead_end | 70 | **85** | +15 | ~95 |
| first_run | 77 | **85** | +8 | **93** |
| base_fork | 83 | **83** | 0 | 96 |
| spend | 81 | **83** | +2 | 95 |
| error_log | 70 | **78** | +8 | 95 |
| round_trip | 62 | **76** | +14 | **85** without an endpoint-contract change |
| security | 83 | **75** | −8 | 98.8 |
| scaling | 66 | **72** | +6 | **92** |
| speed | 55 | **70** | +15 | 97 |

**Average 78.4 → 84.6. One review at 95.**

### The benchmark cannot be met, and here is the arithmetic

Four reviews are capped below 95 by their own rubrics, not by effort:
**scaling 92** (the contentless ping, the refused exact-count, owner-declined
presigned uploads) · **first_run 93** (seven of twenty-one surfaces are activity
feeds, and a timeline has no action to name) · **architecture 94** (95 needs a
database adapter over 147 sites, which the prime directive prices as a defect) ·
**round_trip 85** (95 needs a composite per-screen read — a contract change, not
a fix).

### Two scores went DOWN, and both are the campaign working

**security 83 → 75.** Every point is measurement. Round 4 measured 85 of 206
request fields, 49 of 80 resource-bound paths, 1 of 437 dependencies — and
reported those ratios for the whole surface. Round 5 enumerated 652 of 655 sites
at 99.5% coverage. Security was never 83 or 88; it was about 76 all along.

**ocean 94 → 92.** Four of six moved dimensions are arithmetic corrections
describing no change in the repo. Five of round 4's twelve scores were not
reachable from their own point tables.

**base_fork flat at 83** for the most instructive reason on the board: real
repairs earned +365 and round 3's arithmetic cost −520. Round 3 had scored one
criterion 67 — and that criterion's rows are 40/30/30, so the reachable set is
{0, 30, 40, 60, 70, 100}. **67 was not a lenient reading; it was a number with no
derivation.**

### The disease this round is named after

Round 4 ended with fifteen blind checks found. Round 5 found **eight more, five
of them written during round 5 itself**, and they share one shape: **a check that
guards one direction, or reads a narrower subject than it claims.**

- Law R15 proved every publisher reaches a listener, never that a listener has a
  publisher — a live listener sat idle for months with a comment explaining it.
- The MCP exclusion check proves no stated exclusion is false; delete a row
  entirely and it stays green.
- The "exactly one INSERT INTO activity" check reads two named files, and a
  document paragraph added the same day claims it is machine-checked.
- Law R9's check "exists" only because of a comment on line 1.
- `doc-paths-resolve` — written this round, against this very lesson — validates
  nothing past a glob's first segment, and reads only root documents. Its own
  logic over the rest of the repo finds 113 dangling paths.

### The finding no process caught, and the gap it exposes

Two repairs landed this round, each correct in isolation. `failureWrapUp` (so a
refused action explains itself) is an unmetered thirteenth model call.
`refundIfNothingDone` (so a blocked action costs no credit) subtracts the turn's
units from the column the new account-wide alarm sums. **Together: a failed turn
spends real money, is charged nothing, and erases its own trace from the meter
built to see it** — about $2,217 a day at the existing rate ceiling.

The reconciliation protocol prevents collisions **between reviews**. It has no
mechanism for collisions **between repairs**. That is the single most transferable
lesson of the campaign and it should be built into the next one.
