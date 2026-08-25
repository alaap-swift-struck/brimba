# Story checks out (default + `--foundation`) — Brimba · 2026-08-25
SCORE: 71/100   (previous: 98, measured 2026-08-12)

**Verdict: the story does not check out. Thirty-one holes — 8 high, 13 medium,
10 minor — and the one that matters most is that `BASE-MANUAL.md`, the document
README tells a newcomer to start with, says the base has 8 machine-checked laws
when it has 25, and offers an already-enforced law as future work.**

Nothing here is a new architectural fault. Every finding is the same fault:
thirteen days and three feature rounds (R11/trace, R24, R25) landed in the code
and in `RULES.md`, and the rest of the corpus did not move. The previous run
(98, 2026-08-12) closed exactly this class of hole and its own report said so —
"all four were opened by the scaling work of the last three days". The corpus
re-opens it every time work ships, because **only one document is machine-checked
against the code, and it is not one of the four that got it wrong.**

---

## Docs in scope (33)

Discovered by the probe from the repo root plus the sibling library rules file.
All 33 were read.

`AGENT-MODULES-PLAN` · `AGENTIC-IMPORT` · `AGENTS` · `ARCHITECTURE` ·
`BASE-IMPROVEMENTS` · `BASE-MANUAL` · `BOOTSTRAP` · `BUILD-A-MODULE` · `CACHING` ·
`CLAUDE` · `CONCURRENCY` · `CONTRIBUTING` · `CONVENTIONS` · `DATA-MODEL` ·
`DURABLE-OBJECTS` · `EDGE-CASES` · `ERROR-HANDLING` · `INVENTORY` · `MCP` ·
`OPERATIONS` · `PLATFORMS` · `README` · `ROADMAP` · `RULES` · `SCALING` ·
`SCREEN-ENGINE-PLAN` · `SEARCH` · `SECRETS` · `SWIFT-STRUCK-WAY` ·
`UI-CONVENTIONS` · `UI-GAPS` · `mcp-quickstart` · `../swift-struck-ui/UI-RULES.md`

`CHANGELOG.md` and `LICENSE` are excluded by the probe as generated/boilerplate;
`CHANGELOG.md` was read anyway and is cited below. Total 89,431 words.

**Probe hits I rejected after reading the source** (recorded so the next run does
not re-raise them):

| Probe candidate | Why it is not a finding |
|---|---|
| `conflictingNumericClaims: workers = 12 / 25 / 6` in BASE-IMPROVEMENTS | The probe parsed `grep -A 12`, `-A 25`, `-A 6` out of shell snippets at BASE-IMPROVEMENTS.md:171, :232, :255. Worker count is **7** in all 20 places it appears. |
| `danglingPathRefs`: `web/components/note-detail.tsx`, `lib/notes.ts`, `routes/notes.ts` (BUILD-A-MODULE) | Illustrative paths in the "build a Notes module" worked example (BUILD-A-MODULE.md:33, :170). Correctly hypothetical. |
| `danglingPathRefs`: `UI-RULES.md` (ARCHITECTURE.md:407) | Resolves — it is the sibling library's file and is named as such. (It has a *different* problem: F15 below.) |
| `depthVsUsage`: 25 concepts "explained nowhere / thin" | All 25 now have a canonical home in `BASE-MANUAL.md` §2.5 + `ARCHITECTURE.md` §2a + `DATA-MODEL.md`. The probe scores by mentions-per-section and cannot see a one-row table entry. Verified by reading §2.5 in full. |

---

## Arithmetic

`DEFECT = clamp(0,100, 100 − Σ penalties)` where critical 30 · high 15 · medium 7 · minor 3.
`COVERAGE = sum of points earned.` `total = Σ(criterion × weight) ÷ 100.`

| # | Criterion | Method | Penalties / points counted | Score | Weight | Product |
|---|---|---|---|---|---|---|
| 1 | Docs do not contradict each other | defect | 3 high (45: H0, H5, H6) + 3 medium (21: M3, M9, M11) + 4 minor (12: m3, m4, m7, m8) = 78 | **22** | 14 | 308 |
| 2 | Locked decisions still stand | defect | 1 medium (7); no lock silently violated | **93** | 13 | 1209 |
| 3 | Stated guarantees hold end to end | defect | 2 high (30) + 1 medium (7) + 1 minor (3) = 40 | **60** | 12 | 720 |
| 4 | Depth proportional to reach | coverage | 37 + 20 + 15 + 10 + 8 | **90** | 10 | 900 |
| 5 | Every flow says what happens when it fails | defect | 2 high (30) + 1 medium (7) = 37 | **63** | 9 | 567 |
| 6 | Edge cases addressed, not assumed away | defect | 1 medium (7) | **93** | 9 | 837 |
| 7 | Nothing is stale | defect | 1 high (15) + 3 medium (21) + 2 minor (6) = 42 | **58** | 8 | 464 |
| 8 | Every reference resolves | defect | 1 medium (7) | **93** | 6 | 558 |
| 9 | One name per concept | coverage | 36 + 18 + 20 + 12 | **86** | 6 | 516 |
| 10 | Every capability has an owning document | coverage | 40 + 12 + 6 + 11 | **69** | 8 | 552 |
| 11 | A newcomer can navigate it | coverage | 26 + 25 + 20 + 15 + 6 | **92** | 5 | 460 |

```
308 + 1209 + 720 + 900 + 567 + 837 + 464 + 558 + 516 + 552 + 460 = 7091
7091 ÷ 100 = 70.91 → 71
```

**Criterion 10 is 69, above the gate of 50, so no cap applies.** Uncapped = capped = 71.

Every penalty above maps to exactly one finding id below, and no finding is
counted under two criteria. Where a finding has a secondary criterion (H0 is also
currency; M2 is also coverage) it is penalised once, under the criterion named in
its heading.

### Coverage-criterion numerators, shown

**Criterion 4 (depth), 90/100**
- 40-pt row → **37**. Load-bearing concepts counted: 27 (the probe's 25 + `activity.verb` + `logAccountEvent`). Explained nowhere: 2. `40 × 25/27 = 37`.
- 25-pt row → **20**. No concept in 5+ docs is thin; docked 5 because `BASE-MANUAL.md` §2.5 — the canonical seam index written by the *last* review to close this exact hole — has gone stale by five seams in thirteen days (`callService`/`trace.ts`, `logActivity`, `logAccountEvent`, `bulk-doors.ts`, `retention.ts`).
- 15-pt row → **15**. The ten most-referenced concepts all have one obvious home (§2.5).
- 10-pt row → **10**. `shared/glossary.ts`, 22 terms, R6-checked.
- 10-pt row → **8**. Docked 2: `BASE-MANUAL` §4 introduces the Laws before a reader can learn 17 of them; `CLAUDE.md` never mentions R24/R25 at all.

**Criterion 9 (terminology), 86/100**
- 40-pt row → **36**. Probe counts for the tenant unit: `team` 794 / `workspace` 19 / `tenant` 43 / `account` 80. I opened every `workspace` hit: **17 of 19 mean an npm workspace** (`web`, `workers/*`) — a different concept used consistently. `account` means a person's own account. Separating senses, `team` is ~97% dominant. Docked 4 for the two genuine slips: `MCP.md:103` and `mcp-quickstart.md:51` say "Connect to my Brimba **workspace**" in user-facing copy where the glossary term is **Team**.
- 25-pt row → **18**. The glossary states team ≈ workspace; `DATA-MODEL` states `activity` vs `account_activity` and auth-owns-who / tenancy-owns-where. **No document states the `tenant` vs `team` register** (43 mentions across 14 docs).
- 20-pt row → **20**. `TEAM_MODULES`, `team_members`, `teams` — code and UI match.
- 15-pt row → **12**. The glossary has no entry for either concept R25 introduced: which door a change came through (`origin`), and **Access token**, which now has a Settings card and an identity-log event.

**Criterion 10 (capability ownership), 69/100** — the `--foundation` matrix below is the evidence.
- 50-pt row → **40**. 15 capabilities: 1 with **no** owner (request tracing), 4 **partial**. `50 × (15 − 1 − 4×0.5)/15 = 40`.
- 20-pt row → **12**. One capability owned by documents that disagree: the database-size alarm threshold (F3).
- 15-pt row → **6**. Four owning docs are not current: `BASE-MANUAL` §4, `CHANGELOG`, `BASE-IMPROVEMENTS`, `ERROR-HANDLING`.
- 15-pt row → **11**. auth (ARCHITECTURE §2b), tenancy, errors, realtime all have homes. Tracing does not.

**Criterion 11 (navigability), 92/100**
- 30 → **26**: README's map indexes 31 of 32 in-repo docs; it never mentions `CHANGELOG.md`.
- 25 → **25**: README "Start here" + `CLAUDE.md` + `AGENTS.md` pointer.
- 20 → **20**: all 30 root docs open with what they cover — verified line 3 of each.
- 15 → **15**: README:47–55 states an explicit reading order.
- 10 → **6**: five docs exceed 5,000 words (BASE-IMPROVEMENTS 7,057 · BASE-MANUAL 6,879 · CONVENTIONS 6,009 · EDGE-CASES 5,351 · BUILD-A-MODULE 5,179). All are heavily headed; **none has a table of contents.**

---

## `--foundation` matrix

Fifteen capabilities, enumerated from `README.md`'s doc map, `ARCHITECTURE.md`'s
worker table, `BASE-MANUAL.md` §1, `RULES.md` and `OPERATIONS.md` — not from a
hardcoded list. Every `partial` and `NO` cell reappears in Findings.

| Capability | (a) Documented | (b) Machine-checked | (c) Scales | (d) Reusable seam |
|---|---|---|---|---|
| Multitenancy / per-team DBs | yes (ARCHITECTURE §1, DATA-MODEL, BASE-MANUAL §1) | **partial** — no Law states tenant isolation; it rides `guard.databaseId` discipline | yes (SCALING §3, §5.2) | yes (`team-schema.ts`, BASE-MANUAL §5) |
| Permission spine | yes (ARCHITECTURE §3, BASE-MANUAL §2) | **partial** — R10 `gating-seam` covers tenancy/content/data-ops/mcp; auth, realtime, gateway uncovered and unnamed (H1) | yes (tall sheet = rows) | yes (`shared/workers/gating.ts`) |
| Live sync | yes (CACHING, ARCHITECTURE §2a, DURABLE-OBJECTS) | **partial** — R1 `publish-seam` real; its stated exception list is at a section that does not contain it (M1); R15's derived half has no tripwire | yes (ARCHITECTURE §1b, 32 shards) | yes (`publishChange`, `TEAM_RESOURCES`) |
| Auth & sessions | yes (ARCHITECTURE §2b is exemplary) | **NO** — no `gating-seam` suite for auth; 10 non-GET routes incl. `/internal/*` and the impersonation door | yes (ARCHITECTURE §2b names the SPOF + the no-cache decision) | yes (`whoAmI`) |
| The AI agent | yes (ARCHITECTURE §2, EDGE-CASES §4–§8) | yes — `agent-parity.test.ts` compares derived sets against live code | yes (step cap, credit quota, EDGE-CASES §7) | yes (`selectModel()`, tool catalog) |
| Agentic import | yes (AGENTIC-IMPORT, current) | yes — `catalog-coverage.test.ts` | yes (SCALING §8 names resumability as open) | yes (`TargetDef`, `targets.ts`) |
| Exports | yes (AGENTIC-IMPORT, ARCHITECTURE actions) | yes — `export-bounds.test.ts` + R14 | yes (`EXPORT_HARD_CAP`, truncation is declared) | yes (`exportPath`) |
| MCP surface | **partial** — MCP.md owns none of R25's machine-surface capabilities (M8) | yes — `catalog` + `gating-seam` + `filter-parity` suites | yes (MCP.md cost model) | yes (`tool-catalog.ts`) |
| Error store | **partial** — ERROR-HANDLING stale three ways (m4, m5, F3-date) | **partial** — `error-seam.test.ts` lists 4 workers; mcp records but is not in the list | yes (SCALING §4 retention) | yes (`recordWorkerError`, `opsDatabase`) |
| **Request tracing (R11 internal)** | **NO — no document owns it.** One law row, one ARCHITECTURE sentence, and `db/ops/0002` in no runbook (H4) | yes — `workers/gateway/test/trace.test.ts` is behavioural and strong | not addressed anywhere | **partial** — `callService` is absent from BASE-MANUAL §2.5 |
| Activity / audit (R25) | **partial** — `verb` in zero docs (M4); `shared/workers/account-activity.ts` in zero docs (M5) | **partial** — `activity-birth-to-death` never scans `shared/`, so the seam that owns the rule is outside its append-only scan; two of its three parts assert comment prose | yes (`retention.ts`, OPERATIONS §Retention) | yes (`logActivity`, `ACTIVITY_GATE_MAP`) |
| Bulk writes (R24) | yes (RULES, BUILD-A-MODULE §Bulk is good) | **partial** — the declaration half has a tripwire and bites; the **ordering** half is inert (m6) | not addressed in SCALING | yes (`shared/workers/bulk-doors.ts`) |
| Sharding & scaling | yes (SCALING.md, published arithmetic) | n/a — growth triggers are cron, not law | yes | yes (`sharding.ts`) |
| Screen engine | yes (SCREEN-ENGINE-PLAN, UI-CONVENTIONS) | yes — R2/R3/R4/R7/R8/R16/R20/R22; several have hand-listed subjects, honestly designed | yes | yes (`screens.ts`, `pages.ts`) |
| Ship pipeline | **partial** — two migrations in no runbook (H3, H4); BOOTSTRAP never creates the ops DB (M2) | yes — CI + `smoke-staging.mjs` gate the deploy | yes | yes (`npm run deploy:*`) |

Column (b) verification was done adversarially against the test sources — the two
claims that carry weight below (`cron-records` slicing to EOF, `ORDERED_TWINS`
being empty) I re-read myself at `web/test/rules.test.ts:300-313` and
`shared/workers/bulk-doors.ts:60-114` rather than taking them on report.

---

## Findings

### HIGH

**H0 · consistency + currency — five documents state five different law counts, and the worst one is the newcomer's starting document.**
`BASE-MANUAL.md:387` ("the human-readable law-book (**R1–R8**)"), its table at
`:397-407` listing only R1–R8, and `:425-426`: *"A natural next Law, once the tool
catalogue stabilises, is `R9 (ai): every agent tool maps to a gated route`."*
R9 has been `enforced` since 2026-08-04 and means something else entirely
("the agent knows what the app can do"). The corpus also carries
`README.md:78` (R1–R19), `PLATFORMS.md:91` and `:95` (R1–R10),
`CLAUDE.md:42` ("Walk R1–R23"), against `RULES.md` and
`shared/rules/registry.ts` (R1–R25).
*The story doesn't check out because:* README sends every new developer and every
agent to BASE-MANUAL "to understand the system", and BASE-MANUAL tells them 17 of
the 25 rules binding their code do not exist. *Risk:* a fork owner does not know
that R24 turns their build red until every `edit`/`delete` door is declared in
`bulk-doors.ts`, and `CLAUDE.md`'s seven-question planning ritual — the antidote
this base built for exactly this failure — walks a reader past R24 and R25 without
naming them. **Fix: F1.**

**H1 · invariants — R10 says "No ungated door ships" and the mechanism covers four of seven workers, with no exemption recorded anywhere.**
`gating-seam` suites exist for tenancy, content, data-ops and mcp. **auth, realtime
and gateway have none.** `workers/auth/src/index.ts` carries ten non-GET routes,
including `POST /internal/send-email`, `/internal/log-error`, `/internal/mcp-session`
and `POST /api/auth/admin/test-login` — the door whose holder can sign in as any
account. `shared/rules/registry.ts` has `CATALOG_EXEMPT`, `DEAF_EXEMPT`,
`ACTIVITY_TABLE_EXEMPT`, `CREATE_RETURNS_EXEMPT`, `MUTATION_RETURNS_EXEMPT` and
`CREATE_OPENS_RECORD_EXEMPT` — and **no gating exemption at all**.
*Contrast:* R1 names its uncovered publishes explicitly ("auth's two user-channel
publishes and mcp's caller-private token rows are the reviewed, untested
exceptions"). R10 does not. *The story doesn't check out because:* the base's
central security claim is stated as an absolute in three documents
(`RULES.md:28`, `CLAUDE.md:33`, `SWIFT-STRUCK-WAY.md:49`) with a third of the
surface silently outside it. Those auth routes **are** gated in code — the defect
is the documented control claiming a coverage it does not have. **Fix: F6.**

**H2 · invariants — two documents state that every source-scan strips comments and carries a tripwire; two shipped checks do neither.**
`CONVENTIONS.md:739-754` (earned by sabotage: *"prose thirty lines below stands in
for a deleted gate"* … *"give every scan a tripwire: assert it matched something"*)
and `README.md:79` state it as a property the base already has.
- `fetch-timeout` (R11 external half, `web/test/rules.test.ts:213-251`) reads raw
  source, matches inside a 600-character forward window, and **has no tripwire** —
  `offenders` is compared to `[]` with nothing asserting a single `await fetch(`
  was found.
- `cron-records` (R12, `web/test/rules.test.ts:300-313`) does
  `src.slice(m.index)` — **to end of file**, on un-stripped source, with
  `if (!m) continue` and no tripwire. Its own comment says so: *"The scheduled
  handler runs to the end of the file."*

Both are `enforced` in `RULES.md`. This is the precise failure class the base
already caught once (`R17`'s check, "proven blind on 2026-08-18"). *Risk:* R12 is
the law that keeps unattended work from vanishing, and its check would be
satisfied by the word `recordWorkerError` appearing anywhere below the handler —
including in a comment. **Fix: F7.**

**H3 · failure path — team migration `0008_activity_origin` appears in no runbook, and the failure it causes is silent.**
`OPERATIONS.md:45` enumerates team migrations `0004_modules … 0006_import_batches`;
`OPERATIONS.md:211-212` says team `0007_scale_indexes` is "unchanged from the first
pass". **Nothing anywhere names `0008`.** `shared/workers/activity.ts:206-216`
writes `INSERT INTO activity (…, origin, before_after, verb)` inside a `try` whose
`catch` swallows. On any existing team database that has not had `0008` rolled,
every activity write fails and is discarded — the record saves, its history does
not. *The story doesn't check out because:* `OPERATIONS.md:45` spells out exactly
this consequence for core `0014` — *"WITHOUT it every usage write fails its
best-effort insert, so the log silently stops filling"* — and did not repeat the
sentence for the migration that carries LAW R25. **Fix: F4.**

**H4 · failure path — `db/ops/0002_error_request_id.sql` appears in no runbook, and it takes the error store down with it.**
`OPERATIONS.md:255-258` ("Standing one up from scratch") runs only
`db/ops/0001_operations.sql`; `INVENTORY.md:58` lists the operations schema as
`db/ops/0001_operations.sql`; `BOOTSTRAP.md` does not mention the operations
database at all. `shared/workers/error-log.ts:40-56` writes
`INSERT INTO error_logs (…, request_id)` inside `catch {}`. A fresh operations
database built from any of the three runbooks has no `request_id` column, so
**every error row fails to insert and nothing reports it** — the one table that
would tell you something is wrong is the one that goes quiet. R11's stated payoff
("carries the request id so seven workers' logs line up") never lands durably.
**Fix: F4.**

**H5 · consistency — the database-size alarm fires at 65% and four documents, including the LOCKED master, say 80%.**
Code: `workers/tenancy/src/lib/sharding.ts:36` — *"65% of D1's 10 GB per-database cap."*
Docs saying 80%: `ARCHITECTURE.md:27` (§1, **LOCKED**) and `:176`,
`OPERATIONS.md:44`, `BASE-MANUAL.md:528` and `:582`, `CONVENTIONS.md:174`.
Doc saying 65%: `SCALING.md:66-67` — *"The threshold is **65%** … (it was 80%)"* —
with the reasoning, and `SCALING.md:378` recording the change.
The tie-breaker does not settle this: `ARCHITECTURE.md` is the master and it is
the stale one, so per the rubric the contradiction **is** the finding.
*Risk (operational, not cosmetic):* an operator seeing a `db_alerts` row believes
the database is at 8 GB when it is at 6.5 GB. Worse, the alarm's own message
(`sharding.ts:94`) still reads `">=80% of cap"`, so the alert a human reads at 3am
contradicts the threshold that produced it. **Fix: F3 — Tier 3, the owner's call:
ARCHITECTURE §1 is LOCKED.**

**H6 · consistency — BASE-MANUAL's R8 row states the exact anti-pattern R16 exists to forbid.**
`BASE-MANUAL.md:407`: *"R8 | Every team collection tab **derives its count from its
loaded rows**"*. `RULES.md:26` (R8): *"The NUMBER the badge shows is owned by R16;
where the two disagree, R16 prevails."* `RULES.md:34` (R16): an exact server
`COUNT(*)`, *"Earned by: a 24,011-product catalogue advertising '1000' (a capped
list's length)"*. Deriving a badge from loaded rows **is** that bug.
*Risk:* a reader implementing R8 as BASE-MANUAL states it ships the defect R16 was
written to make unshippable. **Fix: F2.**

**H7 · currency — `CHANGELOG.md` and `BASE-IMPROVEMENTS.md` both stop at 2026-08-12, missing all three feature rounds since.**
`CHANGELOG.md:15` newest entry: "2026-08-12 — the operations database, and three
audits"; `CHANGELOG.md:3`: *"215 substantive commits between 2026-06-12 and
2026-08-12, one author."* `BASE-IMPROVEMENTS.md:473` newest section:
"Scaling round 3 — 2026-08-12". Missing from both: the R11/trace round
(architecture 74 → 96, `shared/workers/trace.ts`, ARCHITECTURE §2b, `db/ops/0002`),
**R24** (bulk twins), and **R25** (activity origin, team migration `0008`).
*The story doesn't check out because:* `README.md:57` sends a fork owner to
BASE-IMPROVEMENTS for *"what BREAKS for a fork already on the base"*, and R24 is
precisely that — a fork's build stays red until every `edit`/`delete` door is
declared. `CHANGELOG.md:6-8` makes the same promise. **Fix: F10.**

### MEDIUM

**M1 · invariants + references — three documents send the reader to "CACHING rule 5" for LAW R1's reviewed exceptions; rule 5 is about something else and names none of them.**
`CLAUDE.md:14`, `RULES.md:19` and `ARCHITECTURE.md:243` all end with *"the reviewed
exceptions — CACHING rule 5"*. `CACHING.md:96` is *"### 5 · Identity scope — your
changes follow YOU everywhere."* The nearest real list is rule 4 (`CACHING.md:87-95`)
and it names a **different** set — *"login_codes / sessions / db_alerts / the
nightly size cron"* — not auth's user-channel publishes or mcp's token rows.
*Risk:* the only justification for the two holes in the base's live-sync law does
not exist at the address three documents give for it. **Fix: F8.**

**M2 · currency — `BOOTSTRAP.md` never creates the operations database.**
BOOTSTRAP is *"the day-zero, command-by-command runbook"* and README:66 calls it
*"the concrete answer to 'could I recreate the base?'"*. §2 (`:72-116`) creates the
core database; §3 creates six R2 buckets; there is no ops-database step, no
`OPS` binding step, and no `db/ops/*` mention. `INVENTORY.md:37` lists
`brimba-ops` as a database that exists, so the two documents disagree about what a
rebuild needs. *Mitigated:* `opsDatabase(env)` returns `env.OPS ?? env.DB`, so
nothing breaks — a fresh fork simply runs the pre-2026-08-18 architecture that
`ARCHITECTURE.md` §1a describes as current. **Fix: F5.**

**M3 · consistency — `DATA-MODEL.md` contradicts itself inside two sections.**
The `agent_usage_log` section opens (`:157`) *"MOVED to the OPERATIONS database
2026-08-18"* and closes (`:187-188`) *"Lives in the global core DB beside the quota
tables it explains."* The `error_logs` section opens (`:201`) with the same move
note and closes (`:209`) *"Lives in the global core DB — system health is
cross-team."* This is a partial regression of the exact fix the 2026-08-12 review
recorded as closed. **Fix: F9.**

**M4 · coverage — `activity.verb` is in no document.**
`workers/tenancy/src/team-schema.ts:346` adds it with a stated purpose — *"the
closed set a query groups by … 'show me every creation last week'"* — plus
`idx_activity_verb`. `DATA-MODEL.md` owns "every table (global core + per-team)"
and does not list it; `RULES.md:43` (R25) enumerates the row as WHO/WHAT/WHEN/
`origin`/`before_after` and omits it. **Fix: F9.**

**M5 · currency + coverage — the identity-log seam moved and no document followed.**
`shared/workers/account-activity.ts` exists (lifted out of auth on 2026-08-18 so
mcp can write to it) and is named in **zero** documents. `DATA-MODEL.md:97-105`
still credits `workers/auth/src/lib/account-activity.ts` and enumerates the event
types as `name_changed`/`photo_changed`/`email_changed` — while
`DATA-MODEL.md:227` (its own newer section) says the same table holds *"name,
photo, email, **access tokens**"*. One table, two column-level descriptions, in one
file. **Fix: F9.**

**M6 · depth — `BASE-MANUAL.md` §2.5 "The seams, by name" has gone stale by five seams in thirteen days.**
§2.5 (`:243-300`) was written by the previous review to close the
referenced-everywhere-defined-nowhere hole and it does that job well. It now omits
`callService` / `shared/workers/trace.ts` (the one way a worker calls a worker),
`logActivity` / `shared/workers/activity.ts` (the single stated home of R25),
`logAccountEvent`, `shared/workers/bulk-doors.ts` (R24) and
`shared/workers/retention.ts`. **Fix: F11.**

**M7 · failure path — `migrate-teams` has no documented failure path.**
`BOOTSTRAP.md:216` and `BUILD-A-MODULE.md:111` describe it as a "robot" that
"diffs each team's `_migrations` … and applies the gap", and stop. The handler
(`workers/tenancy/src/routes/admin.ts:23-48`) is a serial, uncapped loop over every
ready team with no cursor and no per-team error handling: a throw on team N returns
a 500 and the operator learns nothing about which teams completed. It **is** safe
to re-run — the diff makes it idempotent — and **no document says so**.
*The story doesn't check out because:* this is a schema write across every tenant
database, run by hand at the riskiest moment of a deploy, and it is the one flow
in the corpus described only in its happy path. **Fix: F12.**

**M8 · coverage — MCP.md owns neither of R25's machine-surface capabilities.**
`MCP.md:225-226` still says a write *"stamps an audit block (who + when)"*. It does
not mention `origin: "mcp"` — the column R25 added so *"did the assistant change
this?"* is a query — and §5 "Security posture" does not mention that creating or
revoking a personal access token now lands in the person's identity log, which was
R25's headline fix (*"the most access-granting object in the app, and its history
was empty"*). **Fix: F16.**

**M9 · consistency — `INVENTORY.md`'s bucket list is short one bucket.**
`INVENTORY.md:40`: *"Buckets: `brimba-media`, `brimba-learning-media`, and their
`-staging` twins."* `workers/content/wrangler.jsonc:29` binds
`HELP_MEDIA → brimba-help-media`, and `BOOTSTRAP.md:126-127` and `OPERATIONS.md`
both create it. INVENTORY is the document whose stated job is *"everything that is
NOT in this repository"* — a rebuild driven from it alone deploys content against a
bucket that does not exist. **Fix: F13.**

**M10 · currency — the `/media/*` exception is "awaiting owner confirmation" in the master and "decided" everywhere else.**
`ARCHITECTURE.md:301`: *"The reviewed exception (**FLAGGED 2026-07-02, owner to
confirm**)"*. `BASE-IMPROVEMENTS.md:84-96` files it under *"Reasoned exceptions
(decided, documented, NOT open findings)"*, and `OPERATIONS.md` records it as *"a
reasoned exception"*. Same item, pending in one document and closed in two.
**Fix: F13.**

**M11 · consistency — `ROADMAP.md`'s live "Remaining" list contradicts an enforced Law.**
`ROADMAP.md:192-194`, under *"Remaining (for the next session)"*: *"Role detail
Overview/Activity — … small wiring job."* `RULES.md:20` (R2, `enforced`) and
`ARCHITECTURE.md:353` (**LOCKED 2026-06-17**) both state that every record-detail
screen already has them. ROADMAP's own banner calls Remaining *"its still-open
tail"*, so it reads as live work. Tie-breaker: ARCHITECTURE is master, ROADMAP has
drifted. **Fix: F13.**

**M12 · locked decision — a LOCKED rule names a canonical home that does not contain it.**
`ARCHITECTURE.md:402-407` (§6, **LOCKED 2026-06-18**) states the mobile-stacking
rule (`flex-col` by default, `sm:flex-row` at `sm:`, `w-full` when stacked) and
then says *"Canon lives in the library `UI-RULES.md`."* The library file
(`../swift-struck-ui/UI-RULES.md`) has three rules — no emojis, contentless pages
are immovable (with the horizontal-scroll and pinch-zoom twins), the background is
alive — and **none of them is the stacking rule**. `UI-CONVENTIONS.md` does not
carry it either. So the only statement of a locked rule is the one that disclaims
being canonical. **Fix: F15 — Tier 3: the library is a separate repo and
`CLAUDE.md` forbids editing it from here.**

**M13 · edge case — "invite someone to a role that is then deactivated" is addressed nowhere.**
`SCREEN-ENGINE-PLAN.md:128` and `DATA-MODEL.md` establish that roles are
deactivate-only and *"holders keep the role + rights"*. Nothing in the corpus says
what happens to a **pending invite** naming a role that is switched off between
send and accept: does the invite still resolve, does the joiner land with a
deactivated role's rights, or is it refused? The base's own edge-case discipline is
otherwise excellent (last admin, sole admin, empty team, retried request, stale
save, first row with a NULL `updated_at`, teamless user, cold-start deploy cycle) —
this one is the gap. **Fix: F14.**

### MINOR

**m1 · references — `README.md` tells the reader to copy a directory that was deleted.**
`README.md:68` links `skills/new-app/SKILL.md`, `:70` links `skills/README.md`, and
`:68-69` instructs `cp -R skills/new-app ~/.claude/skills/new-app`. Commit
`8751e30` ("remove vendored Claude skills; skills live in ~/.claude/skills")
deleted both. This is the only pointer to the one-command bootstrap, and the
command as written fails — hence medium, not minor, under criterion 8.
*(Counted once, in criterion 8.)* **Fix: F13.**

**m2 · currency — "518 tests" is wrong in two documents.**
`README.md:181` (*"518 tests today, in about 13 seconds"*) and
`CONTRIBUTING.md:25` (*"# 518 tests, ~13s"*). There are **568** literal
`it(`/`test(` cases across 69 `*.test.ts` files today (≈633 at runtime, because
five sites generate cases in loops), and commit `5c37db4` already claimed 572.
Both documents use the number as the "green looks like" signature. **Fix: F13.**

**m3 · consistency — the operations-database move is dated two different weeks.**
2026-08-12: `CHANGELOG.md:15`, `BASE-IMPROVEMENTS.md:473`, `ERROR-HANDLING.md:39`.
2026-08-18: `ARCHITECTURE.md:35`, `OPERATIONS.md:244`, `DATA-MODEL.md:157`, `:201`,
`:375`. **Fix: F13.**

**m4 · consistency — `ERROR-HANDLING.md` contradicts itself thirteen lines apart.**
`:32` — workers record via `recordWorkerError(env.DB, …)`. `:45` — workers reach
the store *"through `opsDatabase(env)`"*. `env.DB` is now the fallback, not the
path. **Fix: F9.**

**m5 · currency — `ERROR-HANDLING.md`'s row shape is two changes behind.**
`:51-55` "Captured per row" omits `request_id` (`db/ops/0002`), and its `source`
list — *"auth / tenancy / content / data-ops / web"* — omits **mcp**, which does
record (`workers/mcp/src/index.ts`). `workers/data-ops/test/error-seam.test.ts:11`
lists the same four and so does not cover mcp either. **Fix: F9.**

**m6 · invariants — R24 reads as a live guarantee; one of its two machine-checked clauses is inert today.**
`RULES.md:42`: *"**Machine-checked:** every `edit`/`delete`-gated door is declared,
**and an `in-order` twin must not hand its rows to `Promise.all`**."* All three
declared twins in `shared/workers/bulk-doors.ts:60-75` are `ordering: "together"`,
so `ORDERED_TWINS` (`:112-114`) is empty and the loop at
`web/test/rules.test.ts:500-506` never executes. The check is *correctly written*
and would bite the moment an in-order twin lands — and `bulk-doors.ts:25-38` is
honest about the split, as is RULES.md's own *"Not machine-checked, said openly"*
paragraph. The narrow over-claim is that the ordering clause is presented as
active. **Fix: F18.**

**m7 · consistency — `SCALING.md:61` is headed "The three relief valves" and lists four.**
The fourth (channel shards) was added 2026-08-11 with its own subsection.
**Fix: F13.**

**m8 · consistency — `RULES.md:28` (R10) omits the mcp `gating-seam` suite** that
`CLAUDE.md:33` and `README.md:78` both credit and that exists at
`workers/mcp/test/gating-seam.test.ts`. The law-book undercounts its own
enforcement. *(Penalised here under criterion 1; closed by F6's edit.)*

**m9 · navigability — `CHANGELOG.md` is not indexed by README's document map**
(0 mentions), although `CHANGELOG.md:86-88` points back at README as the index.
**Fix: F13.**

**m10 · terminology — user-facing copy calls a team a "workspace"** at
`MCP.md:103` and `mcp-quickstart.md:51` (*"Connect to my Brimba workspace over
MCP"*), against the glossary's **Team**. **Fix: F13.**

### Clean results, recorded as results

- **No locked decision is silently violated.** All 31 `LOCKED` markers were opened
  and cross-read. The public-surface lock, the tenancy lock, the caching lock, the
  concurrency lock, the Durable-Object code-vs-runtime lock, the invite/onboarding
  lock and the member-notification lock are all upheld across the corpus. The one
  deduction (M12) is a lock pointing at empty canon, not a lock being broken.
- **Worker count is 7 in all 20 places it appears.** No drift.
- **Criterion 6 is otherwise strong.** Last admin, sole admin, empty team,
  concurrent demotion, retried request, stale save, a fresh row's NULL
  `updated_at`, a deliberate `0` in config, teamless user, user in two teams, the
  10,000th member, the cold-start deploy cycle and a stale browser tab are each
  addressed with the failure named first.
- **`ARCHITECTURE.md` §2b (the single point of failure) and `SCALING.md` §7-§8 are
  the best writing in the corpus** — a named SPOF with what the user sees, and a
  scorecard with its arithmetic printed and its open items priced.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **F1** Derive the law list from the registry; extend `registry-integrity` to scan all five doc files | `CLAUDE.md`, `README.md`, `BASE-MANUAL.md`, `PLATFORMS.md`, `web/test/rules.test.ts` | ADDS ~15 lines of check + 4 corrected law lists; REMOVES 4 hand-maintained ranges | **lean_mean** — more test code in an already-24-case file. **speed/spend** — none (a file read at test time). This is the only fix that stops the finding recurring. |
| **F2** Rewrite BASE-MANUAL §4's R8 row to R16's exact-count rule | `BASE-MANUAL.md` | REMOVES a wrong sentence | none — one line of prose, no code path |
| **F3** Correct 80% → 65% in the four docs; fix the alarm message string | `ARCHITECTURE.md` (**LOCKED — Tier 3**), `OPERATIONS.md`, `BASE-MANUAL.md`, `CONVENTIONS.md`, `workers/tenancy/src/lib/sharding.ts:94` | REMOVES a stale number from 6 places; the code change is one string | **scaling_review** — its §3 already assumes 65%, so this aligns rather than conflicts. **Owner-gated:** ARCHITECTURE §1 is LOCKED; I recommend, I do not move it. |
| **F4** Add team `0008_activity_origin` and `db/ops/0002` to the migration lists, each with its silent-failure consequence | `OPERATIONS.md`, `BOOTSTRAP.md`, `INVENTORY.md` | ADDS ~8 lines to three runbooks | none — this is the fix that keeps the audit trail and the error store alive on the next fork |
| **F5** Add an operations-database step to BOOTSTRAP §2 | `BOOTSTRAP.md` | ADDS ~10 lines (create, migrate, bind `OPS` in 5 workers) | **first_run_review** — a longer day-zero runbook is more to get through. Mitigated by keeping it a clearly-optional block, since the `env.OPS ?? env.DB` fallback is real. |
| **F6** Name auth/realtime/gateway as R10 exceptions **as data** in `shared/rules/registry.ts` + RULES.md — or add an auth `gating-seam` suite | `shared/rules/registry.ts`, `RULES.md`, optionally `workers/auth/test/gating-seam.test.ts` | ADDS an exemption map (~10 lines) or a ~40-line suite | **lean_mean** — a fifth near-identical suite, right after the base collapsed four into one shared scanner. **security_sentry** — the *documentation* option leaves the coverage gap real; the *suite* option closes it. Recommend the suite for auth, exemption data for realtime/gateway. |
| **F7** Give `fetch-timeout` and `cron-records` `stripComments` + a tripwire; bound `cron-records` to the declaration | `web/test/rules.test.ts` | ADDS ~8 lines; REMOVES an EOF slice | **lean_mean** — marginally more test code. **speed/spend** — none. Without it, R11 and R12 are claims, not laws. |
| **F8** Move R1's exception list into CACHING as its own numbered sub-rule; repoint the three citations | `CACHING.md`, `CLAUDE.md`, `RULES.md`, `ARCHITECTURE.md` | ADDS ~5 lines; fixes 3 pointers | none — prose only |
| **F9** Fix DATA-MODEL's two trailing self-contradictions; add `verb`; add `shared/workers/account-activity.ts` and the token event type; fix ERROR-HANDLING's `env.DB`, `request_id` and `source` list | `DATA-MODEL.md`, `ERROR-HANDLING.md` | REMOVES 2 wrong sentences; ADDS ~12 lines | none — prose only |
| **F10** Bring CHANGELOG and BASE-IMPROVEMENTS forward to 2026-08-25 (R11/trace, R24, R25) with the fork-breaking notes | `CHANGELOG.md`, `BASE-IMPROVEMENTS.md` | ADDS ~40 lines | **base_fork_review** — helps it directly; a fork owner currently cannot learn that R24 will red their build. None negative. |
| **F11** Add five rows to BASE-MANUAL §2.5 | `BASE-MANUAL.md` | ADDS 5 table rows | none — the table already exists; this is its maintenance |
| **F12** Document the `migrate-teams` failure path (re-runnable, uncapped, how to find laggards) | `OPERATIONS.md`, `BOOTSTRAP.md`, `BUILD-A-MODULE.md` | ADDS ~8 lines | **scaling_review** — writing it down exposes that the loop is unbounded, which R14 forbids everywhere else. If that prompts a code fix (cap + cursor), that ADDS code (**lean_mean** −) and a second call (**speed** −) to buy a bounded operator action. Recommend documenting first, deciding second. |
| **F13** Housekeeping: README's `skills/` links + `cp` instruction, 518→568 in two docs, index CHANGELOG, the 2026-08-12/18 dates, "three valves"→four, `/media` FLAGGED→decided, ROADMAP Remaining #1, the two "workspace" slips | `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `BASE-IMPROVEMENTS.md`, `ERROR-HANDLING.md`, `SCALING.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `INVENTORY.md`, `MCP.md`, `mcp-quickstart.md` | REMOVES ~12 stale statements | none — every item is mechanical and meaning-preserving. `ARCHITECTURE.md`'s `/media` line is inside a LOCKED section, so that one item is **owner-gated**. |
| **F14** Write the deactivated-role-invite behaviour into EDGE-CASES | `EDGE-CASES.md` | ADDS ~10 lines | none, **if** the behaviour is only described. If the owner decides it must change, that is a code fix touching invite accept (**security_sentry** +, **lean_mean** −). Describe first. |
| **F15** Put the mobile-stacking rule into the library's `UI-RULES.md`, or repoint ARCHITECTURE §6 at itself | `../swift-struck-ui/UI-RULES.md` (**Tier 3 — different repo**) or `ARCHITECTURE.md` (**LOCKED**) | ADDS one library rule, or REMOVES a false pointer | none — but **both targets are out of bounds from here**: CLAUDE.md forbids editing the library from this repo, and the ARCHITECTURE section is LOCKED. Surface to the owner. |
| **F16** Give MCP.md a paragraph on `origin: "mcp"` and token events in the identity log | `MCP.md` | ADDS ~6 lines | none. Helps **activity_log_review** and **interfacelessness_review** by making the machine surface's provenance findable. |
| **F17** Give request tracing an owning section (ERROR-HANDLING, or ARCHITECTURE §2c) | `ERROR-HANDLING.md` or `ARCHITECTURE.md` (**LOCKED if §2**) | ADDS ~15 lines | none for docs. Prefer ERROR-HANDLING to avoid touching a locked section. Helps **architecture_review**, which owns request-traceability. |
| **F18** Say plainly in RULES.md R24 that the ordering clause binds from the first `in-order` twin | `RULES.md` | ADDS one clause | none — and it follows the base's own precedent at `web/test/rules.test.ts:256` (*"a check that overclaims is worse than none"*) |

---

## CEILING

**95 is reachable by changing code — but not by changing documents alone, and not
durably without F1.**

Every finding except three is a document edit. Fixing F1–F14, F16, F17 and F18 as
written recovers, per criterion:
1 → 97 · 2 → 93 (F15 gated) · 3 → 97 · 4 → 95 · 5 → 100 · 6 → 100 · 7 → 97 ·
8 → 100 · 9 → 95 · 10 → 88 · 11 → 96.

```
1358 + 1209 + 1164 + 950 + 900 + 900 + 776 + 600 + 570 + 704 + 480 = 9611
9611 ÷ 100 = 96
```

Three items are capped by something a commit in this repository cannot fix:

1. **F3 and the `/media` half of F13 touch LOCKED sections of `ARCHITECTURE.md`.**
   The 65%/80% contradiction cannot be closed by me: `ARCHITECTURE.md` §1 is
   LOCKED, and the newer, reasoned decision lives in `SCALING.md`. The owner has to
   move the number. Until then criterion 1 carries a 15-point high and cannot
   exceed 85.
2. **F15 lives in a different repository.** `CLAUDE.md` states the library is lego
   and must never be edited from here. The locked mobile-stacking rule therefore
   has no canonical home this repo can give it. Criterion 2 is capped at 93 from
   inside this repository.
3. **Doc currency has no machine check, and that is the real ceiling.**
   `registry-integrity` (`web/test/rules.test.ts:125-131`) is the corpus's only
   doc-versus-code check and it reads **exactly one file** — `RULES.md`. That is
   why `RULES.md` is the one law list that is right and the other four are wrong by
   2, 6, 15 and 17 laws. Every high finding here is a document that drifted within
   thirteen days of a feature landing. Without F1's mechanism, this score decays to
   the mid-70s again within one or two feature rounds regardless of how thoroughly
   it is repaired today — which is exactly what the 98 of 2026-08-12 demonstrates.

**True maximum with F3 and F15 owner-gated: 94** (criterion 1 held at 85 →
`1190 + 1209 + 1164 + 950 + 900 + 900 + 776 + 600 + 570 + 704 + 480 = 9443`).
With the owner moving the locked threshold and the library absorbing the stacking
rule: **96–97**.

---

*One sentence: the story has 31 holes, and the one that matters most is that the
document a newcomer is told to start with says this base has 8 machine-checked
laws when it has 25 — because only one of the five documents that count the laws
is checked against the code that defines them.*
