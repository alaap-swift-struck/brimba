# Interfacelessness review — round 5 — Brimba · 2026-08-26

SCORE: **94/100** (grade A) — round 3: 88 (recomputed 89 by the reconciliation) ·
round 2: 84 · round 1: 81

**Scope:** whole app. **Mode:** report-only. Nothing in this repository was edited
except this file. `npm run check` was not run (the brief forbids it); every check I
credit was either read line by line or **re-implemented out of tree and sabotaged**
in `/private/tmp/.../scratchpad`, and every count below was recomputed by a script
whose method is printed here so anyone can rerun it.

**Measured at `959c80a`.** `HEAD` advanced to `f30f954` mid-run; I diffed it and it
is documentation, R1's law text and two JSDoc blocks — no route, no tool, no gate
and no check changed. Every score below holds at `f30f954`.

**The verdict in one sentence:** the machine surface now reaches the same doors with
the same guards, the same lost-update protection and the same refusal on a missing
field, and its absences are finally written down and machine-checked — what is left
is that the check reading those absences can only see the ones that are *stated*, so
two real gaps are still invisible to it, and one HTTP header carrying "this export
was cut short" is thrown away between the door and the caller.

---

## DELTA

| # | Dimension | Wt | R1 | R2 | R3 | **R5** | Move | Cause |
|---|---|---|---|---|---|---|---|---|
| 1 | Parity (same codebase) | 0.28 | 94 | 100 | 100 | **100** | — | held; the drift check now derives from the DOORS and covers BOTH catalogues, which is stronger evidence for the same number |
| 2 | Security equivalence | 0.26 | 84 | 84 | 95 | **97** | +2 | **code changed** (+5, the last live coercion fixed) − **3 new** (the fix itself is unguarded) |
| 3 | Coverage | 0.16 | 67 | 67 | 67 | **92** | +25 | **code/docs changed** — and partly **the last measurement was wrong**; see the basis note |
| 4 | Robustness equivalence | 0.12 | 70 | 80 | 92 | **92** | — | **+8 code changed** (R3-B fixed, in the right place) **−8 the last measurement missed** the `opt()` clearing limit |
| 5 | Scale equivalence | 0.10 | 75 | 75 | 75 | **78** | +3 | **+6 code changed** (truncation is visible) **−3 the last measurement did not look** at response headers |
| 6 | Ergonomics | 0.08 | 75 | 81 | 75 | **90** | +15 | **code/docs changed** — the phantom tool is gone and the exclusion section is now the strongest thing in the doc |

```
0.28 × 100 = 28.00
0.26 ×  97 = 25.22
0.16 ×  92 = 14.72
0.12 ×  92 = 11.04
0.10 ×  78 =  7.80
0.08 ×  90 =  7.20
             -----
             93.98  →  94
```

**Grade A** (≥90). **Ship gate: proceed.** No unresolved security-equivalence
finding and no high-severity divergence.

---

## What I was asked to verify — seven claims, checked at HEAD

### 1 · `MCP.md`'s exclusion section is split by surface — **TRUE**

`MCP.md:279-315`. Two sub-tables: `#### Not on MCP — the in-app assistant has it`
(4 rows, citing 7 endpoints) and `#### Not on any machine surface` (17 rows). The
five rows that previously said "not exposed" of a path an assistant tool forwards
to are now inside the first table, and each names MCP explicitly in its reason —
which is what lets the surface-scoped check below pass them.

### 2 · ~24 undocumented absences are now documented — **TRUE; I measure 33**

Measured like-for-like by running **the same script** against `892d28b` (the
round-3 HEAD) and against HEAD:

| | 892d28b | HEAD |
|---|---|---|
| capability routes (census, minus the filter below) | 88 | 88 |
| covered by an MCP tool | 35 | 35 |
| documented exclusions | 17 | **50** |
| **undocumented absences** | **36** | **3** |

Exclusion-table rows in `MCP.md` went 7 → 21 over the same span. So the repair is
real and larger than the brief claims; 33 absences moved from silent to stated
without one line of new surface area.

### 3 · `help/thread` is named as a known gap, not defended — **TRUE**

`MCP.md:299`: *"A known gap, named as one rather than defended… the door is gated
on `help:read`, the same right `list_help_tickets` already needs, so nothing is
being withheld; the tool simply does not exist yet."* Verified against the code:
`GET /api/content/help/thread` is `gated` on `help:read` (ROUTE-CENSUS.md:41), and
`reply_help_ticket` (a WRITE on the same thread) is a live tool. A machine caller
can add a reply to a conversation it cannot read. **I do not remove this row from
the coverage denominator** — see the arithmetic — because a row that calls itself a
gap is not an intentional exclusion, and scoring it as one would make the number
say the opposite of the document.

### 4 · The catalogue test scans prose as well as rows, against both catalogues — **TRUE, and sabotage-proven**

`workers/mcp/test/catalog.test.ts:128-206`. `claims` splits the whole section on
blank lines: a `|`-block yields one claim per row (names = the first cell), and
every other block is one prose claim. `live` is the union of `MCP_TOOLS` and
`TOOL_CATALOG`; `contradictions(surface, scopable)` runs once per surface, and the
assistant pass lets a claim survive by naming MCP.

I re-implemented that logic exactly, in memory, and injected faults
(`scratchpad/sabotage-catalog.mjs` — nothing in the repo touched):

```
GREEN  AS-IS                                                  claims=37 rows=21
RED    S1  a TABLE ROW falsely names `learning/update`        → caught, both surfaces
RED    S2  PROSE falsely names `roles/update`                 → caught, both surfaces
RED    S3  PROSE names `help/bulk-status`, no surface said    → caught by the assistant pass
RED    S4  a half-A row LOSES its "MCP" scoping word          → caught by the assistant pass
GREEN  S5  the `help/thread` ROW IS DELETED                   → NOT caught
RED    S6  the section is renamed                             → caught by the blindness guard
GREEN  S7  all prose stripped before the tables               → NOT caught
```

**S5 is the structural limit and it is the top finding of this round.** The check
proves *no stated claim is false*. It cannot prove *no absence is unstated* — and
that is the direction coverage is actually scored in. S7 shows the prose-blindness
guard (`claims.length > rows.length`) is satisfied by prose anywhere in the section,
not by the prose that carries claims; weaker than it reads, though not itself a
fault.

### 5 · `update_team` was the one edit tool outside the shared catalogue — **TRUE, fixed, and the check now derives from the doors**

Five doors parse `expectedVersion`: `roles/update` (`routes/roles.ts:151`),
`help/update` (`routes/help.ts:106`), `teams/update` (`routes/team.ts:121`),
`selectable/update` (`routes/selectable.ts:67`), `learning/update`
(`routes/learning.ts:96`). All five now carry a machine tool that **exposes and
forwards** it — four on both surfaces from `SHARED_TOOLS`, and `teams/update`
through the agent-only `update_team` (`workers/data-ops/src/lib/tools.ts:110,116`),
which imports the shared `VERSION_FIELD`/`version()` pair rather than re-declaring
it.

Round 3 filed this as R3-C: a check titled *"every edit door that accepts
expectedVersion has a tool that forwards it"* that enumerated **tools**. It now
enumerates **doors** — `[...doors("tenancy"), ...doors("content")].filter(d =>
d.body.includes("expectedVersion"))` (`catalog.test.ts:242`) — over both catalogues,
with two blindness guards (`versioned.length > 3`, `checked > 3`). **4 of 5 → 5 of
5, and the direction of the check is now the direction of the risk.**

### 6 · A boolean coercion made a 400 unreachable and could un-finish an article — **TRUE, fixed**

`mark_learning_done` built `done: i.done === true` in its own file, so an omitted
field meant "not done" and marked a finished article unread, while the same
omission from the web form is a clean 400 at the door. It now goes through the
shared `bool()` (`workers/data-ops/src/lib/tools.ts:228`), which throws
`GuardError(400)` naming the field. Round 3's other instance, `agent_confirm`'s
`approve`, deliberately keeps its coercion with the reasoning written beside it
(`workers/mcp/src/lib/tools.ts:149-156`): an invented `approve` falls to *decline*,
which changes nothing. That is the correct call and it is now stated rather than
inherited.

**What is NOT true is that anything guards it.** See finding R5-B.

### 7 · Truncation is visible to the caller — **TRUE at the MCP's own cap, FALSE at the door's**

`forwardTool` returns `{ ok, text, truncated }` (`workers/mcp/src/lib/tools.ts:185,
207-211`) and `handleMcp` puts `truncated: true` on the JSON-RPC result
(`workers/mcp/src/index.ts:101`). That closes the 400,000-character cap.

It does not close the **10,000-row** one. `boundExport` +
`csvResponse(filename, csv, truncated)` announce a capped export through the
`X-Export-Truncated` header and a renamed file (`shared/workers/csv.ts:53-63`) —
and `forwardTool` reads `await res.text()` and **discards every header**. A machine
caller pulling `export_learning_csv` from a team with more than 10,000 articles
gets the first 10,000 with no signal at all unless the payload also happens to
exceed 400,000 characters. Finding R5-C.

### 8 · The known limit: a machine caller cannot CLEAR an optional field — **TRUE, and it costs 8 points**

`opt()` (`shared/workers/tool-catalog.ts:83`) is `str(input, key) || undefined` —
an empty string and an absent key produce the same body. The doors were repaired
this round to distinguish exactly those two cases
(`workers/content/src/lib/learning.ts:344-388`: `input.category === undefined ?
before.category : sentCategory`, and the same shape on seven columns), and the web
form sends an explicit null for a box a person cleared. So the door can tell them
apart and no machine tool can say either one. "Remove the link from this article"
is a thing a person can do and no machine can. It affects `update_role`
(description), `update_dropdown_value` (type), `update_learning` (five fields),
`update_help_ticket` (two) and `raise_help_ticket` (two). Documented honestly at
`MCP.md:146-149`, which is why it is a robustness deduction and not a security one.

---

## Dimension arithmetic, in full

### 1 · Parity — 100 · weight 0.28

| trace | result |
|---|---|
| MCP write tools that are thin forwards | 35 of 35 — every one goes through `forwardTool` → `forwardToDoor` (`shared/workers/http.ts:92`) |
| agent tools that are thin forwards | 31 of 32 |
| the 32nd | `run_import_batch` (binding `SELF`) — the standing reasoned divergence, re-confirmed: it calls the **same function** (`confirmBatch`) and **re-checks the gate** (`requireRight(cfg, guard, m, "create")` per target, `tools.ts:270`), is agent-only, and the MCP reaches the same capability through `run_import`, a real forward to `/api/data-ops/import/batch/confirm` |
| twin functions (`mcpDoX` beside `doX`) | **zero.** No SQL, no insert, no bespoke validation in either tool file |
| non-`forwardToDoor` internal fetches | 5, none of them a tool forward: gateway plumbing ×3, the session bridge, and `agent.ts:191` `resolveNames` — a bounded read that prettifies ids into names, through the same gated doors with the caller's own cookie |
| the drift check | `catalog.test.ts:28-68` asserts every MCP tool path against the target worker's own exported `ROUTES` (auth's switchboard read off disk), **and** every agent tool path likewise. `:41` asserts every declared `exportPath` is a tool |

One capability, one door, one gate, checked from both catalogues. **100.**

### 2 · Security equivalence — 97 · weight 0.26

| control | evidence |
|---|---|
| token → session → gate, per call | `verifyToken` on **every** `/mcp` request (`index.ts:53`, before the body is parsed); `sessionCookieFor` mints a team-pinned session; the door then runs `teamContext` → `requireMember` (a live core-DB read of `team_members`, `gating.ts:150-155`) → `requireRight`. A demoted or removed member's token is refused at the door within one request |
| the token authenticates, the gate authorises | no tool skips `requireRight`; per-worker `gating-seam` suites read handler source off disk, and `workers/mcp/test/gating-seam.test.ts` asserts every non-GET route on the external surface opens with `verifyToken`/`requireUser`, with `GET /api/mcp/health` named as the one open door |
| revoke bites | `verifyToken` refuses a revoked row before the cached cookie is used; `dropCachedSession` clears the local isolate |
| no maintenance endpoint as a tool | the seven `admin/*` doors and `admin/test-login` are `adminGuard`-gated and are not in either catalogue |
| identity self-actions | remove-self / last-admin guards live in the door, so they fire for every surface |
| boundary validation | identical by construction — the same `requireText`/`optionalText` seam, because it is the same handler |
| tool-side coercions that pre-satisfy a door's 400 | **1 left**, deliberate and safe (`approve` → decline), reasoned in place |

```
100  base
 −3  the guard that closed the last finding has no check of its own (R5-B)
 ---
  97
```

### 3 · Coverage — 92 · weight 0.16

**The basis, stated so it can be rerun.** Denominator = `ROUTE-CENSUS.md`'s 111
generated rows, minus the 23 that are not capabilities: the 11 gateway proxy/static
rows, the 3 realtime transport rows, auth's 3 `/internal/*` doors, the 5 remaining
`/health` probes, and `POST /mcp` itself (it *is* the surface). **88 capability
routes.** Coverage = tools ÷ (routes − documented exclusions), per the rubric's
"documented exclusions are removed from the denominator, never counted as misses."

```
capability routes                                                88
covered by an MCP tool                                           35
documented exclusions (path-cited rows, plus `get_role_permissions`
  cited by TOOL name and `admin/errors/resolve` covered in its
  row's prose)                                                   51
  ... minus `help/thread`, which the document itself calls a gap  −1
documented INTENTIONAL exclusions                                50

should-be-covered = 88 − 50                                      38
coverage          = 35 / 38                            = 92.1 %  →  92
```

**Sensitivity** (so the judgement is visible rather than buried): counting
`help/thread` as an exclusion gives 35/37 = 94.6 → 95; additionally counting the
`tenancy/activity`/`auth/activity` row (which describes itself as *"a decision not
yet taken"*) as open gives 35/40 = 87.5 → 88. I take 92.

**The three routes still uncovered and in the denominator:**

| route | why it is in the denominator |
|---|---|
| `GET /api/content/help/thread` | named as a known gap by the doc itself |
| `GET /api/tenancy/invites/audit` | **undocumented.** One invite's `invite_logs` audit. The MCP can create, revoke and list invites and cannot read one's history |
| `GET /api/data-ops/import/batch` | **undocumented.** Re-read a batch's plan. `plan_import` returns the plan once and **costs an AI unit** (`routes/import.ts:175`), so a machine caller who wants to look at a planned batch again must pay for a second plan |

**The same script on the round-3 commit** (`892d28b`) gives 35 / (88 − 17) =
**49.3 %**. Round 3 reported 67 on a basis I could not reproduce (it used 77 routes
and 25 exclusions where the census then held 108 rows and the exclusion table held
7 rows citing 15 paths). So part of this dimension's +25 is a corrected basis, and
I say so rather than bank it: **on one consistent basis the move is 49 → 92, and
round 3's 67 was over-reported by roughly 18 points.**

### 4 · Robustness equivalence — 92 · weight 0.12

```
100  base
 −8  a machine caller cannot CLEAR an optional field the UI can clear (`opt()`).
     Same door, two different sets of reachable outcomes. Present at round 3;
     round 3 did not look for it
 ---
  92
```

Everything round 3 charged is repaid, and repaid in the right place:

- **R3-B is fixed once, not twice.** The `GuardError` a tool's own `buildBody`
  throws is converted inside `executeTool` (`workers/data-ops/src/lib/tools.ts:
  331-360`), which is the only thing the two agent loops call — so a tool-side 400
  now produces the same red step row, the same persisted outcome and the same
  wrap-up as a door-side 400, and the fix is not two copies waiting to drift. The
  `catch` re-throws anything that is not a `GuardError`, so a genuine fault still
  surfaces.
- `Idempotency-Key` rides through from the MCP client to the door
  (`index.ts:62` → `forwardTool` → `forwardToDoor`), so the machine surface
  inherits the web app's retry protection with nothing to remember per tool.
- Deactivate-not-delete, last-admin, unique-pending-invite, clean-400-not-500: all
  in the door, all shared.

### 5 · Scale equivalence — 78 · weight 0.10

Nine checks; round 3 ran eight of them (its own list) and I add the ninth.

| # | check | verdict |
|---|---|---|
| 1 | R14 list hard caps apply identically | **pass** — same function |
| 2 | help keyset paging exposed + forwarded (`cursor`, `total`, `hasMore`, `nextCursor`) | **pass** |
| 3 | `EXPORT_HARD_CAP` applies to MCP exports | **pass** |
| 4 | import row caps (`BULK_MAX_ROWS`, `BULK_IDS_LIMIT`, `parcelSize`) | **pass** |
| 5 | `TEAM_LIMITER`, the per-tenant ceiling, applies on the MCP path | **pass** — it lives in `teamContext`, which every forwarded call reaches |
| 6 | `USER_LIMITER` applies to `/mcp` | **half** — `callerKey` reads the session cookie or falls back to `CF-Connecting-IP`; an MCP request carries a bearer, not a cookie, so machine callers are bucketed by IP. Documented at `MCP.md:344-349` |
| 7 | the MCP's own 400k truncation is visible | **pass** (was half) |
| 8 | `HEAVY_LIMITER` applies to the machine surface | **miss** — `isHeavyPath` (`shared/workers/rate-limit.ts:57-66`) lists `/api/data-ops/agent`, `/api/data-ops/import`, `/api/content/learning/upload` and anything ending `/export`. `/mcp` matches none, and the mcp→data-ops hop is a **service binding**, so it never re-enters the gateway. `agent_chat`, `plan_import` and the three CSV exports meet the tight ceiling from the UI and no ceiling at all from a token |
| 9 | the DOOR's export-truncation signal reaches the caller | **half** — the cap is applied identically; only the `X-Export-Truncated` header saying so is dropped (R5-C) |

```
(6 full + 0.5 + 0.5) / 9  =  7 / 9  =  77.8 %  →  78
```

### 6 · Ergonomics — 90 · weight 0.08

```
100  base
 −4  the catalogue is DECLARED, not generated. It is single-sourced and
     machine-checked against the real routes, so it cannot drift in the direction
     that lies — but a NEW door still needs a human to write a tool, which is how
     `selectable/bulk-active` shipped gated, published and tested with no caller
     on ANY surface for a fortnight
 −3  `agent_chat` and `agent_confirm` do not say in their DESCRIPTIONS that they
     draw the team's AI quota. `plan_import` does ("Uses one AI request from the
     team's quota"), and MCP.md §4 has the full table — but `tools/list` is what a
     machine reads, and two of the three costed tools are silent there
 −3  `truncated` is a bespoke top-level field on the JSON-RPC result rather than
     `_meta`/`structuredContent`; a strict client may drop unknown keys, and the
     whole point of the flag is that a program can branch on it
 ---
  90
```

Repaid since round 3: `set_screen_override` is gone from `MCP.md` (grep across
`workers/ shared/ web/ *.md` returns nothing outside `reviews/`), replaced by a
paragraph that explains the removal *and* why the `screens` TABLE must stay. Every
gated write description names its required right, asserted by
`catalog.test.ts:81-88`. Tool names are glossary terms (`shared/glossary.ts`:
Ticket, Dropdown values, Learning, Activate/deactivate, Revoke, Done).

---

## Findings, ranked by what they cost

### R5-A · MEDIUM — the exclusion check is one-directional, and two real absences are invisible to it · dimension 3 · **worth ~5 points**
`workers/mcp/test/catalog.test.ts:169-180` · `MCP.md:250-316`

Sabotage S5: delete the `help/thread` row and the suite stays green. The check
walks *stated claims* and asks whether a live tool contradicts them. Nothing walks
*live routes* and asks whether a tool or a claim covers them — which is the
question coverage is scored on, and the question that let
`GET /api/tenancy/invites/audit` and `GET /api/data-ops/import/batch` sit
uncovered and unstated through a round that documented 33 of their siblings.

**The fix, and it is small.** `ROUTE-CENSUS.md` is generated and already compared
to the code door for door. Add a third `it()` that reads it, applies the same
23-row non-capability filter this report prints, subtracts every `MCP_TOOLS` path
and every fragment cited in the exclusion section, and asserts the remainder is
empty. That is the same derivation shape `filter-parity.test.ts:19` and the new
`expectedVersion` check already use — read the door, not the tool. It would fail
today with exactly two names, which is the right way to land it.

### R5-B · LOW-MEDIUM — the guard that closed round 3's last security finding has no check · dimension 2 · **worth 3 points**
`workers/data-ops/src/lib/tools.ts:228` · `workers/mcp/test/catalog.test.ts:221`

The toggle scan is `MCP_TOOLS.filter(t => /^set_\w+(_value)?_active$/.test(t.name))`.
`mark_learning_done` is agent-only (not in `MCP_TOOLS`) and is not named
`set_*_active`, so it matches on neither count. Grep confirms no test anywhere
references it in this context. Delete `bool(` from that line and the build is
green, with the exact defect this round was written to remove.

Three of the four required booleans in the catalogues are guarded by a check; the
fourth — the one that was found last, in a different file, a fortnight late — is
guarded by nothing. That is the same shape as the fault, one level up.

**The fix:** derive the subject list from the schemas rather than the names —
every tool whose `schema.properties[k].type === "boolean"` and whose `required`
includes `k`, across **both** catalogues, must throw when `k` is omitted, with
`agent_confirm` a named exemption carrying its reason.

### R5-C · LOW-MEDIUM — `forwardTool` throws away the response headers, including "this export was cut short" · dimension 5 · **worth ~1 point, but it is a correctness trap**
`workers/mcp/src/lib/tools.ts:196` · `shared/workers/csv.ts:53-63`

`const raw = await res.text()` is the whole of the response the machine surface
keeps. The export doors announce a cap through `X-Export-Truncated: <total>` and by
renaming the file `learning-first-10000-of-24310.csv`; a browser sees both, an MCP
client sees neither. This is precisely the reasoning the round-5 comment beside the
400k flag gives — *"a person reading the same reply in a chat client sees the note;
a script doesn't, and the script is the whole point of this surface"* — applied one
level down and not yet acted on.

**The fix:** have `forwardTool` return `res.headers.get("X-Export-Truncated")` and
fold it into the same `truncated` decision, so one flag means "what you got is not
all of it" regardless of which cap did the cutting.

### R5-D · LOW — the expensive-door ceiling stops at the gateway, and the machine surface goes round it · dimension 5
`shared/workers/rate-limit.ts:57-66,141-144` · `workers/gateway/src/index.ts:218`

`HEAVY_LIMITER` exists, is configured in every environment (asserted by
`workers/gateway/test/rate-limit.test.ts:226,258`), and is charged on
`/api/data-ops/agent*`, `/api/data-ops/import*`, the learning upload and every
`/export`. A token calls all of those through `POST /mcp`, which matches no heavy
path, and the mcp worker then reaches data-ops over a service binding that never
re-enters the gateway. So the *same capability* carries two ceilings from a browser
and one from a script — and the script is the caller with a retry loop.

Round 3 recorded this as "HEAVY_LIMITER never applies", which was wrong: it applies,
just not here. That makes it a **parity** defect now, where before it was an absence.

**The fix:** ask the heavy ceiling inside `handleMcp`, keyed on the *tool* rather
than the path (`heavyTools = new Set(["agent_chat","agent_confirm","plan_import",
"run_import","export_*"])`), or add `/mcp` to `HEAPY_PATHS` and accept that every
tool call is charged as heavy. The first is more accurate and about eight lines.

### R5-E · LOW — one exclusion row cites a tool name where every other cites a path · dimension 6
`MCP.md:291`

`| `get_role_permissions` (the read side of a role's matrix) | …` — the check's
`cited()` extracts backticked *path fragments* and matches them by `endsWith`
against live tool paths. A tool name matches nothing, so this row is unverifiable
by the very check the section advertises. It is the only row of 21 in that shape,
and it happens to name the one route in the whole census that an agent tool serves
and MCP does not — so it is also the row where being unverifiable matters most.

**The fix:** one word — cite `roles/permissions` (the path) and keep the tool name
in the reason.

### R5-F · LOW — two AI-costed tools do not say so where a machine reads · dimension 6
`workers/mcp/src/lib/tools.ts:132-157`

Detailed above. `plan_import`'s description names its cost; `agent_chat` and
`agent_confirm` do not, and a client building a budget from `tools/list` has no way
to know. **The fix:** eleven words in two strings.

### Standing, re-confirmed, not re-charged

- **`run_import_batch`'s `SELF` binding** — same function, gate re-checked,
  agent-only, MCP covers the capability by a real forward. Recorded so the next
  round does not rediscover it.
- **`agent_confirm`'s `approve` coercion** — deliberate, safe direction, reasoned
  in place.
- **No per-token rate limit** — stated at `MCP.md:344-349`. R5-D is a different
  thing: not the absence of a per-token ceiling, but a ceiling that exists and is
  reachable from one surface only.

---

## FIX IMPACT MAP

| Fix | Files | ADDS / REMOVES | Which other review it could damage |
|---|---|---|---|
| **A** a route-derived coverage check (census − tools − cited exclusions = ∅) | `workers/mcp/test/catalog.test.ts` (~20 lines) | ADDS the only check that can see a *missing* row | **`lean_mean_review`** — 20 more lines of test. **`speed_review`** — a few ms on `npm run check`. **`story_checks_out_review`** — positive: `ROUTE-CENSUS.md` gains a second consumer, so a stale census fails louder. Nothing shipped changes |
| **A2** close the two gaps A would name — either two tools or two doc rows | `MCP.md` (2 rows) **or** `shared/workers/tool-catalog.ts` + `workers/mcp/src/lib/tools.ts` | rows: ADDS documentation, coverage → 100 on the rubric's own rule. tools: ADDS surface area | rows: none. **tools:** `security_sentry_review` — new surface area on the external door; `invites/audit` exposes inviter snapshots, so it needs the invite gate re-read. **`spend_review`** — an `import/batch` GET tool would *save* money (it removes the "re-plan to re-read" AI charge) |
| **B** derive the required-boolean check from the schemas, both catalogues | `workers/mcp/test/catalog.test.ts` (~12 lines) | ADDS a check that can fail | **`lean_mean_review`** — more test code. Nothing else |
| **C** carry `X-Export-Truncated` through `forwardTool` | `workers/mcp/src/lib/tools.ts` (~4 lines) | ADDS one header read | **`round_trip_review` / `speed_review`** — neutral, no extra call. **`scaling_review`** — positive: a caller that can see the cap stops re-pulling the whole export |
| **D** charge the heavy ceiling on AI/export/import tool calls inside `handleMcp` | `workers/mcp/src/index.ts` (~8 lines), `shared/workers/rate-limit.ts` (export one helper) | ADDS a limiter call per heavy tool call | **`round_trip_review`** — one extra rate-limiter call on those tools only. **`first_run_review`** — none. **`spend_review`** — positive, materially: it is the only thing bounding an MCP retry loop's AI spend within a day. Watch the fail-open contract: the new ask must live inside `rateLimit`'s try/catch, not beside it, or a wobbling limiter becomes a 500 (the comment at `rate-limit.ts:104-108` says exactly this) |
| **E** cite the path in the `get_role_permissions` row | `MCP.md` (1 cell) | REMOVES an unverifiable claim | none — helps `story_checks_out_review` |
| **F** name the quota cost on `agent_chat` / `agent_confirm` | `workers/mcp/src/lib/tools.ts` (2 strings) | ADDS 11 words | none. **`spend_review`** — positive |
| **G** (owner decision, not a defect) let a machine clear an optional field — e.g. a documented sentinel, or `null` surviving `opt()` | `shared/workers/tool-catalog.ts` (~6 lines) + every edit tool's description | ADDS one concept to the machine contract | **`security_sentry_review`** — a sentinel is a new way to write an empty value through a door; it must go through the same `optionalText` boundary. **`story_checks_out_review`** — `MCP.md:146-149` would have to move with it in the same commit |

---

## CEILING

With A2 (rows), B, C, E, F applied and G decided:

```
parity        100   already there
security      100   B
coverage      100   A2 as documentation — the rubric's own rule; see the caveat
robustness    100   G, if the owner wants it; 92 if not
scale          89   C (half 9 → full) + D (miss 8 → full) = 8/9; #6's IP keying is
                    platform shape, not a tool bug
ergonomics     96   E + F; the −4 for a declared catalogue is architecture
```

```
0.28×100 + 0.26×100 + 0.16×100 + 0.12×100 + 0.10×89 + 0.08×96
= 28 + 26 + 16 + 12 + 8.9 + 7.68 = 98.58 → 99
```

**The true maximum is about 99, and nothing caps this review below it.** No locked
decision, no platform limit, no single-author constraint. That is unusual in this
campaign and worth saying plainly for the second round running: **the machine
surface is built the right way** — one catalogue, one forwarding seam, one gate
re-checked per call, machine-checked against the real routes from both directions.

**The caveat on coverage reaching 100 through documentation.** It is the rubric's
own rule and it is the right rule — an absence with a stated reason is a decision.
But a reader must not read 100 as "a machine can do everything the UI can". It
cannot, and should not: 50 doors would stay shut, on purpose and in writing. The
one row I would *not* close with documentation is `help/thread`, because the doc
already refuses to: a machine that can move a ticket through its lifecycle and add
a reply, and cannot read the conversation, is a real gap and calling it an
exclusion would be the 2026-08-12 mistake in a politer coat.

**Ship gate: proceed.** R5-A is the one I would land before the next round, not
because anything is broken but because it is the only finding here that changes
what the *next* review can see.
