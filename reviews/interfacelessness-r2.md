# Interfacelessness review — Brimba · 2026-08-25 (ROUND 2)
SCORE: 84/100   (round 1: 81/100 · the retired 2026-08-12 run: 98/100)

**Scope:** whole app. **Mode:** `--report-only` — nothing in this repo was edited except this
file. No `npm run check` (it writes vitest cache into `node_modules` while other agents read
the tree); every check I credit was instead re-executed standalone from the scratchpad, and
two of them were **sabotaged on a copy to prove they fail**.

---

## DELTA

Round 1: **81/100** → Round 2: **84/100**

| Criterion | Wt | R1 | R2 | Why it moved |
|---|---|---|---|---|
| 1 · Parity (same codebase) | 0.28 | 94 | **100** | The two hand-rolled forwards I named (`writeRow`, `writeParcel`) went through `forwardToDoor`, and a **third** I had not found (`buildResolvedMap`) went with them. `shared/workers/http.ts:78` is now the **only** `https://internal` fetch in the base — grep-confirmed. |
| 2 · Security equivalence | 0.26 | 84 | **84** | Unchanged. 8/9 controls still hold; the one failure (boundary 400 pre-satisfied by tool-side coercion, resolving destructively on 3 tools) is untouched — `workers/mcp/src/` and `shared/workers/tool-catalog.ts` were **not modified at all** this pass. |
| 3 · Coverage | 0.16 | 67 | **67** | Unchanged, and re-derived from scratch, not carried over: 79 routes, 27 documented exclusions, 35 tools, **17 undocumented absences** — the same 17, itemised below. No route was added or removed. |
| 4 · Robustness equivalence | 0.12 | 70 | **80** | One of the three breaks closed: imports now stamp `origin: "import"` and carry the trace id. The other two (`expectedVersion` unreachable, omitted-boolean → deactivate) stand verbatim. 7/10 → 8/10. |
| 5 · Scale equivalence | 0.10 | 75 | **75** | Unchanged, and **re-verified against security_sentry's correction** — see below. Nothing in the limiter, the caps or the truncation path moved. |
| 6 · Ergonomics | 0.08 | 75 | **81** | My top finding is fixed and, better, **machine-checked** — I proved the check catches the exact regression. Scored a **half, not a full**: the table is now accurate but still not complete, and its new preamble claims an exhaustiveness the check does not test. 6/8 → 6.5/8. |

**No criterion went down.** That is the honest answer to the round's central question, and I
looked for a fall specifically: I walked every file the repair pass touched that a machine
call can reach (`roles.ts`, `members.ts`, `invites.ts`, `help.ts`, `learning.ts`,
`activity.ts`, `bulk.ts`, `import*.ts`, the gateway) and found no new divergence between the
two surfaces. Three things did get **worse in consequence without moving a number**; they are
findings R2-A, R2-B and R2-C below, and I have deliberately not let them re-weight a
denominator, because tightening my own standard mid-campaign would make the delta unreadable.

---

## The two things I was asked to verify

### ✅ 1. MCP.md's exclusion table is corrected AND the check is real

The three false rows are gone (`MCP.md` diff: `invites`/`invites/revoke` and the
`roles/permissions` half of the tenant row deleted; `teams`/`teams/update` correctly kept).
The preamble at `MCP.md:238-249` now records *why* they were false and names the audit that
wrote them.

The check is `workers/mcp/test/catalog.test.ts:112-139`. **I did not take it on trust.** I
re-implemented its exact logic in the scratchpad against the live `MCP.md` and the 35 tool
paths harvested from source, then sabotaged a copy of the doc:

```
tool paths found: 35
AS SHIPPED:                       rows=8   lies=[]
SABOTAGED (3 false rows re-added) rows=10  lies=[
    "invites -> /api/tenancy/invites",
    "invites/revoke -> /api/tenancy/invites/revoke",
    "roles/permissions -> /api/tenancy/roles/permissions"]
SABOTAGED (one row: `help/reply`)  rows=9  lies=["help/reply -> /api/content/help/reply"]
```

**The check is live and it catches the exact regression that produced the 98.** It also
guards itself (`it("was found at all")` asserts `rows.length > 4`, so a renamed heading fails
loudly instead of silently scanning nothing). This is the single most valuable change in the
pass, and it is the one I said in round 1 would matter more than any of my twelve fixes.

Two residual holes, both narrow, both reported below as R2-A and R2-C:
- the check tests one direction only (no row may name an exposed path). It cannot see a route
  that belongs in the table and isn't there — which is the state `selectable/bulk-active` is in.
- the `import/*` row is the one row the check cannot evaluate at all: the fragment strips to
  `import`, which matches no path suffix.

### ✅ 2. Imports use `forwardToDoor` and stamp `origin: "import"`

`workers/data-ops/src/lib/import.ts:389-398` (`writeRow`) and `:428-437` (`writeParcel`) now
call `forwardToDoor(...)` with `origin: "import"` and `requestId: requestIdFrom(request)`. The
pass also caught a third hand-rolled fetch I missed — `buildResolvedMap` at
`workers/data-ops/src/lib/import-batch.ts:163-169`, the foreign-key resolver read.

Traced end to end and confirmed: `forwardToDoor` (`shared/workers/http.ts:72-73`) sets
`ORIGIN_HEADER` → `originFrom()` (`shared/workers/activity.ts:103-106`) validates it against
the closed set → `shared/workers/gating.ts:113` puts it on the actor → `logActivity` writes it.
So `origin: "import"` — a declared R25 value that **nothing in the base produced** in round 1 —
is now produced, and R11's trace id spans one MCP `run_import` through the batch engine into
every per-row create.

**Grep-verified consequence:** `shared/workers/http.ts:78` is now the only
`fetcher.fetch("https://internal…")` in the whole base. Every machine write, from both
surfaces, goes through one seam. That is what moves parity to 100.

---

## The rate-limiter finding, re-verified against security_sentry's correction

security_sentry is **right**, and my round-1 *scoring* already reflected it — but the finding's
headline read more alarmingly than the arithmetic underneath it, so it is worth restating
plainly.

| Ceiling | Reaches `/mcp`? | Evidence |
|---|---|---|
| `USER_LIMITER` (600/min) | **Yes** | `workers/gateway/src/index.ts:151` — `if (pathname.startsWith("/api/") \|\| pathname === "/mcp")`. Present since `f6952d1`, before this campaign. |
| `TEAM_LIMITER` (6000/min) | **Yes** | `shared/workers/gating.ts:200`, inside `teamContext` — which runs in the **target** worker, and tenancy/content/data-ops each declare the binding. |
| `HEAVY_LIMITER` (60/min) | **No** | `isHeavyPath()` (`shared/workers/rate-limit.ts:60-62`) matches `/api/data-ops/agent`, `/api/data-ops/import`, `/api/content/learning/upload` or a path ending `/export`. `/mcp` matches none. The tool then reaches its door over a **service binding**, never re-entering the gateway; `workers/mcp/wrangler.jsonc` declares no ratelimit binding. |
| Per-caller identity | **No** | `callerKey()` (`:67-74`) reads the `brimba_session` cookie, else `ip:`. An MCP request carries `Authorization: Bearer …` and no cookie → every token behind one egress IP shares one bucket. |

**Net, unchanged from round 1's scoring:** a browser user calling the assistant passes 600/min
**and** 60/min. An MCP client calling `agent_chat`, `plan_import`, `run_import` or the three
CSV exports passes 600/min only, shared per IP. Not unbounded — but the ceiling written
specifically for expensive doors does not reach the surface with no human in front of it, and
the seam's own comment is the argument for it: *"A retry loop can exhaust a day's quota in
seconds without something like this."*

Round 1 scored this exactly so — `USER_LIMITER` half (applies, wrong key), `TEAM_LIMITER`
full, `HEAVY_LIMITER` miss. **Scale stays 75.** No adjustment is owed.

---

## Arithmetic

`overall = 0.28·parity + 0.26·security + 0.16·coverage + 0.12·robustness + 0.10·scale + 0.08·ergonomics`

Surfaces re-enumerated from source, not from docs or from round 1:

- **MCP** — `MCP_TOOLS = [...SHARED_TOOLS.map(toMcpTool), ...MCP_ONLY]`
  (`workers/mcp/src/lib/tools.ts:154`) → **35 tools** (24 shared + 11 MCP-only). Harvested
  programmatically; count printed above.
- **Agent** — `workers/data-ops/src/lib/tools.ts` → 24 shared + 7 agent-only = **31 tool routes**.
- **UI/API** — route tables read off disk: tenancy **36**, content **19**, data-ops **23**,
  auth **10**. Identical counts at `8751e30` (pre-repair) and `HEAD` — verified by
  `git show 8751e30:… | grep -c`.

| # | Dimension | Wt | Score | Numerator / denominator |
|---|---|---|---|---|
| 1 | Parity | 0.28 | **100** | 35/35 tools are declarative thin forwards through one seam. Zero `mcpDoX` twins. Zero MCP-only routes — every tool path is also called by `web/lib/api.ts` (incl. all five batch-import doors, `:519-527`). Zero team-DB SQL in `workers/mcp/src` (564 lines; only `mcp_tokens` in the core DB — the reviewed R1 exception). The last three bespoke forwards are gone. |
| 2 | Security equivalence | 0.26 | **84** | 8 of 9 controls verified present on the MCP path (token verified per request · live-membership re-check at mint · fail-closed `INTERNAL_KEY` · team-pinned `/me` · `requireMember` live per call · `requireRight` live per call · zero admin paths in the catalogue · gateway strips the spoofable origin header). **1 fails:** the boundary 400 is pre-satisfied by tool-side coercion. 8/9 = 89, **−5** because that failure resolves in the *destructive* direction on 3 tools. |
| 3 | Coverage | 0.16 | **67** | **35 covered / 52 should-be-covered.** 79 routes (36+19+23+`auth/me`) − 27 documented exclusions = 52. 44 absent − 27 documented = **17 undocumented**. 35 + 17 = 52. ✓ (Full enumeration below — every route classified, not sampled.) |
| 4 | Robustness equivalence | 0.12 | **80** | 8 of 10 guards hold identically (deactivate-not-delete · last-admin / can't-remove-self · no-self-grant · Admin-role lock · R17 idempotent transitions · audit block · `Idempotency-Key` forwarded · **R25 `origin` now correct on imported rows**). **2 break:** optimistic-concurrency guard unreachable · malformed toggle → destructive default. |
| 5 | Scale equivalence | 0.10 | **75** | 6 of 8 (R14 list caps ✔ · help keyset paging exposed+forwarded ✔ · `EXPORT_HARD_CAP` 10 000 ✔ · import row caps ✔ · `TEAM_LIMITER` ✔ · `USER_LIMITER` applies but IP-keyed, **half** · 400 000-char truncation reports `isError:false`, **half** · `HEAVY_LIMITER` never applies, **miss**). |
| 6 | Ergonomics | 0.08 | **81** | 6.5 of 8 (one generated catalogue for both surfaces ✔ · machine-checked against real routes ✔ · external names pinned ✔ · permission hint test-locked ✔ · glossary-native names ✔ · **exclusion table now accurate + machine-checked but still incomplete, half** · cost note missing from `agent_chat`/`agent_confirm`, half · R19's scan covers `SHARED_TOOLS` only, half). |

```
0.28 × 100 = 28.00
0.26 ×  84 = 21.84
0.16 ×  67 = 10.72
0.12 ×  80 =  9.60
0.10 ×  75 =  7.50
0.08 ×  81 =  6.48
             -----
             84.14  →  84
```

### Coverage, fully enumerated (the denominator, not a sample)

Computed by script: every route from the four `ROUTES` tables, crossed against every
`method: "…", path: "…"` pair in both tool files.

**Covered by an MCP tool: 35.** **Absent: 44.**

*Documented exclusions — 27, removed from the denominator (`MCP.md:252-260`):*
`bootstrap`, `switch-team`, `invitations/accept` (3) · `teams`, `teams/update` (2) ·
`config/screens` ×2 (2) · `learning/upload` (1) · `learning/done`, `help/stakeholders` ×2 (3) ·
`learning/bulk-active`, `help/bulk-status`, `help/bulk-status-by-filter` (3) · the six
`import/*` session endpoints (6) · `admin/*` — tenancy 3 + data-ops 4 (7).

*Undocumented absences — 17 (the misses):*

| Route | Agent has it? | Consequence for a machine caller |
|---|---|---|
| `GET /api/tenancy/roles/permissions` | **yes** | can WRITE a permission sheet it cannot READ — and now cannot predict a 403 either (R2-B) |
| `GET /api/content/help/thread` | no | can reply into a conversation it cannot read |
| `POST /api/tenancy/selectable/bulk-active` | no | a live gated door reachable from **no surface at all** (R2-C) |
| `GET /api/tenancy/my-permissions` | no | must discover its own rights by collecting 403s |
| `GET /api/tenancy/activity` | no | cannot read the audit trail — including the `origin` column added for exactly this question |
| `GET /api/data-ops/agent/usage` | no | cannot pre-check the AI quota MCP.md §4 builds its whole cost story on |
| `GET /api/data-ops/import/targets` | no | cannot discover which tables it may import into |
| `GET /api/content/learning/progress` | no | no team-progress read |
| `GET /api/data-ops/import/batch` | no | minor — `plan_import`/`run_import` return the same payload |
| `GET /api/data-ops/agent/usage-log`, `agent/threads`, `agent/thread` | no | cannot resume or audit its own assistant conversations |
| `GET /api/tenancy/active`, `teams`, `team-meta`, `invitations`, `invites/audit` | no | identity plumbing; the one-team pin arguably makes them meaningless |

**Sensitivity, stated not applied (unchanged from round 1):** one sentence in MCP.md covering
the five identity-plumbing reads takes coverage to 40/52 = 77 and the overall to **85.6 → 86**.
I did not apply it, because "a fair reading extends the existing reason to these" is precisely
the ambiguity the documented-exclusion rule exists to kill — and this review has been burned by
exactly that once already.

**Second sensitivity, stated not applied:** three of the 27 documented exclusions
(`admin/seed-targets`, `admin/errors/resolve`, `admin/grant-credits`) are covered by the
*class* reason in row 1 ("owner-only maintenance, gated by `ADMIN_KEY`") but are not *named*
in it. Demanding named rows — which the table's new "Here is every one, named" preamble
invites — gives 24 documented, 55 expected, 35/55 = **64**, and an overall of **83**. I keep
round 1's reading for comparability and file the wording gap as a nit (R2-A).

---

## Findings

Severity-ordered. Findings marked **(stands)** were verified unchanged this round, at the same
line or its current equivalent.

### R2-A · MEDIUM · The exclusion table now claims an exhaustiveness its check does not test

`MCP.md:236-238` — *"Here is every one, named"* … *"**Every row below is machine-checked**
against `MCP_TOOLS`."* Both sentences are individually defensible. Read together they say the
table is complete, and it is not.

`workers/mcp/test/catalog.test.ts:123-138` tests **one direction**: no row may name a path a
live tool forwards to. It cannot see a route that *should* be in the table and isn't. Today
`POST /api/tenancy/selectable/bulk-active` is exactly that (R2-C), and three data-ops
`ADMIN_KEY` routes are class-covered but unnamed.

This is the same shape of fault as the one just repaired, one step milder: a documentation
claim whose evidence does not cover the claim. It is worth naming precisely because the
previous run of this review was fooled by the stronger version of it.

**The fix (docs only, no code):** change the preamble to say what the check actually does —
*"no row below names an endpoint a tool actually reaches; the table's completeness is not
machine-checked"* — or, better, invert the check as well: assert that every non-GET route on
tenancy/content/data-ops is either an `MCP_TOOLS` path **or** matched by a row. That second
form is ~12 lines and would have caught `selectable/bulk-active` on the day R24 shipped it.

---

### R2-B · MEDIUM-HIGH · The new privilege-amplification guard is un-diagnosable from a machine, because the read tool it depends on is the one that isn't exposed

`workers/tenancy/src/lib/roles.ts:209-256` adds a real and correct guard: you may not grant a
right you do not hold. It lives in the **shared** function, so it applies identically to the
UI, the agent and MCP — its own comment says so. As a *guard*, this is parity-clean and a
genuine security win.

But it changes what a machine caller needs in order to call `set_role_permissions` safely, and
that need is precisely the gap I filed in round 1 and which was not addressed:

- **Read the target's current sheet** — `GET /api/tenancy/roles/permissions`
  (`workers/tenancy/src/index.ts:120`, handler `getRolePerms` at `routes/roles.ts:92`). The
  **agent** has this tool (`workers/data-ops/src/lib/tools.ts:86`); the MCP does not.
- **Read its own rights** — `GET /api/tenancy/my-permissions`. Not exposed either.

`setRolePermissions` is still a **full replace** over `TEAM_MODULE_CATALOG`: a module absent
from `value` is normalised to all-false. Revoking is *always* allowed by the new guard, so a
blind full-replace still silently strips whatever the caller forgot — and now it may also 403
partway through the caller's mental model for a reason it could not have computed. The tool's
description (`shared/workers/tool-catalog.ts:207-208`) says neither thing.

Round 1 graded this HIGH on the silent-clearing half alone. The stakes went up; the count did
not move (it is 1 of the 17, as before).

**The fix:** add `get_role_permissions` to `MCP_ONLY` in `workers/mcp/src/lib/tools.ts`,
reusing the agent's wiring verbatim (`catalog.test.ts` will validate the path against tenancy's
own `ROUTES`, and R19 is satisfied by construction — the door parses only `roleId`). Add one
sentence to the `set_role_permissions` summary: *"This replaces the whole sheet — a module you
leave out is turned off — and you may only grant rights your own role holds."*

---

### R2-C · MEDIUM · `POST /api/tenancy/selectable/bulk-active` still exists on no surface, and is still documented nowhere **(stands)**

Re-grepped this round. `postBulkSetSelectableActive` returns exactly four hits: the handler
(`workers/tenancy/src/routes/selectable.ts:82`), the import and the route entry
(`workers/tenancy/src/index.ts:82, 137`), and the R24 declaration
(`shared/workers/bulk-doors.ts:71-75`). **Zero callers** — no `web/` reference, no agent tool,
no MCP tool.

Its two siblings are agent tools *and* are named in the exclusion table (`MCP.md:258`). This
one is in neither. A gated, live, R24-compliant door that only a Law knows about.

**The fix (owner's call — new machine surface either way):** add `bulk_set_dropdown_active` to
`AGENT_ONLY` beside the other two (`confirm: true`, same shape), **or** add
`selectable/bulk-active` to the `MCP.md:258` row. I confirmed the doc route is safe: the
fragment matches no tool path, so the new exclusion check would not false-positive on it.

---

### R2-D · MEDIUM-HIGH · The lost-update guard is still unreachable from either machine surface **(stands)**

Re-verified by repo-wide grep: `expectedVersion` appears in five doors and in `web/lib/api.ts`
+ two detail components. It appears in **zero** tool schemas and **zero** `buildBody`s.

| Door | Handler | UI sends it |
|---|---|---|
| `POST /api/content/learning/update` | `routes/learning.ts:81` | `web/components/learning-detail.tsx:122` |
| `POST /api/content/help/update` | `routes/help.ts:99` | `web/components/help-detail.tsx:156` |
| `POST /api/tenancy/roles/update` | `routes/roles.ts:144` | `web/lib/api.ts:310` |
| `POST /api/tenancy/selectable/update` | `routes/selectable.ts:58` | `web/lib/api.ts:341` |

`buildBody` builds a **fixed key set**, so a client that sends the field anyway has it dropped.
`versionPredicate(undefined)` returns `""` and `assertNotConflicted(n, undefined)` returns
early — the guard is a total no-op on both machine paths. A machine edit therefore always wins
a concurrent-edit race against a human who is being shown "someone else changed this".
CONCURRENCY.md still never mentions the machine surfaces.

**The fix:** add `expectedVersion: S` to those four schemas and
`...(str(i,"expectedVersion") ? { expectedVersion: str(i,"expectedVersion") } : {})` to their
`buildBody`, with the summary line *"pass the record's `updatedAt` from a list/read to refuse
the edit if someone changed it meanwhile."* Opt-in, so no existing client breaks. Breaks no
Law — R19 governs GET filters only.

---

### R2-E · MEDIUM-HIGH · On three toggle tools, a missing required field still means "deactivate" **(stands)**

`shared/workers/tool-catalog.ts:194` (`set_role_active`), `:288`
(`set_dropdown_value_active`), `:324` (`set_learning_active`) all build the body as
`active: i.active === true`. `workers/mcp/src/index.ts:84-95` (`tools/call`) does **no**
validation against `inputSchema` — it looks the tool up and forwards.

So `tools/call {"name":"set_learning_active","arguments":{"id":"X"}}` sends `active: false`.
Each door's clean-400 is genuinely unreachable — I re-read all three and they check
`typeof body.active !== "boolean"`, which a forwarded `false` satisfies:

- `workers/content/src/routes/learning.ts:94-95`
- `workers/tenancy/src/routes/selectable.ts:69-70`
- `workers/tenancy/src/routes/roles.ts:156-162`

Same family, lower blast: `str()` (`tool-catalog.ts:29-32`) coerces any non-string via
`String(v)`, so `{"title":{"a":1}}` creates a record titled `[object Object]` where
`requireText` would have returned *"Title must be text."*

MEDIUM-HIGH rather than HIGH because a schema-compliant client refuses locally
(`required: ["id","active"]`) — but the server must not depend on the client for that, and the
MCP has no confirm panel by design (`MCP.md:130-138`).

**The fix, one place:** in `forwardTool` (`workers/mcp/src/lib/tools.ts:164`), reject a call
whose `inputSchema.required` names a key absent from `input`, with a clean JSON-RPC error —
covering every present and future tool. Narrower alternative: change the three `buildBody`s to
`active: typeof i.active === "boolean" ? i.active : undefined` so the door issues its own 400.

---

### R2-F · MEDIUM · The two checks guarding the MACHINE surface are the only ones not migrated to the corrected source reader

The repair pass created `shared/test/source.ts` because `stripComments` had been reading less
than it believed, and migrated the checks that use it. Six files now import it:
`workers/auth/test/gating-seam.test.ts`, `workers/tenancy/test/retention.test.ts`,
`workers/content/test/activity-seam.test.ts`, `workers/data-ops/test/error-seam.test.ts`,
`web/test/rules.test.ts`, `web/test/source.test.ts`.

**Neither MCP suite is among them**, and both hand-roll the superseded readers:

- `workers/mcp/test/gating-seam.test.ts:18-20` carries a private `stripComments` in **exactly
  the broken order** the pass fixed — block pass first, so an unterminated `/*` inside a line
  comment opens a block that eats real code. This is the check that proves R10 on the external
  surface (every non-GET route opens with `verifyToken`/`requireUser`). I scanned all seven
  worker entry points for the trigger: `gateway` has 6 such lines, `tenancy` 2, `content` 1 —
  and **`workers/mcp/src/index.ts` has 0**. So the check is live *today*, by luck of that file's
  comment style, and one `// … /routes/*` comment away from going partly blind.
- `workers/mcp/test/filter-parity.test.ts:37-38` uses `src.indexOf("\nexport ", at+1)` — the
  slice-past-the-end pattern. Here it fails *safe* (it over-reads, so the test gets stricter,
  not blinder). But `:32` `if (!m) return []` is a **silent vacuous pass** if the ROUTES regex
  ever misses, and `:54` still resolves the worker with a two-way guess
  (`t.binding === "TENANCY" ? "tenancy" : "content"`), so a GET tool on a data-ops door would
  scan the wrong directory and pass on an empty param list.

I re-ran the R19 resolver standalone against the current tree to confirm it has not already
gone blind on the changed `routes/help.ts`:

```
list_members         getMembers    ["id"]
list_roles           getRoles      ["id"]
list_invites         getInvites    ["id"]
list_dropdown_values getSelectable ["id"]
list_learning        getLearning   ["id"]
list_help_tickets    getHelp       ["scope","id","cursor"]
R19 resolver: NON-VACUOUS on all 6
```

**The fix:** import `stripComments`/`declarationBody` from `shared/test/source.ts` in both
suites; replace the `?:` binding guess with an explicit map
(`{TENANCY:"tenancy", CONTENT:"content", DATAOPS:"data-ops"}`) that throws on an unmapped
binding; turn `:32`'s `return []` into a failure; extend the R19 loop to `MCP_TOOLS` and
`TOOL_CATALOG` (skipping `SELF`) with a tripwire asserting each door returned ≥1 param or is
on a pinned zero-param list.

---

### R2-G · LOW · An MCP export can still be silently truncated and report success **(stands)**

`workers/mcp/src/lib/tools.ts:190-191` caps a result at 400 000 chars and appends
`…(truncated)`; `ok` stays `res.ok`, so `workers/mcp/src/index.ts:93` sets `isError: false`.
`EXPORT_HARD_CAP` is 10 000 rows (`shared/workers/limits.ts:12`) and a full-field learning CSV
of 10 000 rows comfortably exceeds 400 KB. The UI download of the same door is not truncated.
A script parsing the CSV gets a short file with a success flag.

**The fix:** set `ok: false` (or add a structured `truncated: true`) when the cap bites — the
door already models this honestly (`csvResponse("learning.csv", csv, truncated)`).

---

### R2-H · LOW · Cost/honesty nits in the generated catalogue **(stand, all three)**

- `agent_chat` (`workers/mcp/src/lib/tools.ts:133-135`) and `agent_confirm` (`:142-144`) carry
  no quota note, while `plan_import` (`:106`) does.
- `initialize` (`workers/mcp/src/index.ts:70`) names *"plan_import, agent_chat"* and omits
  `agent_confirm`, which `MCP.md:191` says costs a turn.
- `MCP.md:121-122`'s read list still omits `list_invites`.

---

### R2-I · LOW · `reply_help_ticket` cannot @mention, and the absence is undocumented (new, minor)

`postHelpReply` now caps mentions through `optionalIdList`
(`workers/content/src/routes/help.ts:191-196`) — a good fix. But the tool's schema is
`{ helpId, body }` only (`shared/workers/tool-catalog.ts:361`), so the mention capability is
UI-only. Not a route-level gap (it doesn't move the count), but it is a body-field asymmetry
with no written reason. One clause in the tool summary settles it.

---

## Confirmed improvements that do NOT move a number (recorded so the next run can tell)

- **`addReply` now writes an activity row** (`workers/content/src/lib/help.ts:464-476`). Real
  and important — `reply_help_ticket` is an agent **and** MCP tool, so an outside tool could
  add content to a customer's ticket untraced. It does not move *equivalence*, because before
  the fix neither surface logged it and after the fix both do.
- **The five `one*` readers read one row instead of the capped list.** `list_members?id=`,
  `list_roles?id=`, `list_invites?id=`, `list_learning?id=`, `list_help_tickets?id=` are MCP
  tool parameters, so a machine caller can now fetch a record past position 1000. Equivalent
  before (both surfaces broken) and equivalent after (both fixed). Counting it as a 9th scale
  item would give 7/9 = 78 and an overall of **84.4**, i.e. still 84.
- **The gateway now records its own crashes centrally** (`workers/gateway/src/index.ts:90-112`)
  — `/mcp` is routed through it, so a crash on the only public door reaching the machine
  surface is no longer a bare platform 500.
- **`learningBody` was already correct.** The `sequence`/`required` overwrite bug was fixed in
  the door; I checked whether the tool path was left behind and it was not —
  `shared/workers/tool-catalog.ts:59-60` emits `undefined`, which `JSON.stringify` drops, so
  the door's new `input.sequence == null ? before.sequence` preserves the value for machines
  too. No new divergence.

---

## Intentional exclusions (documented, not counted against the score) — 27 routes

Verified accurate this round, row by row, against the live route tables: `bootstrap`,
`switch-team`, `invitations/accept` · `teams`, `teams/update` · `config/screens` ×2 ·
`learning/upload` · `learning/done`, `help/stakeholders` ×2 · `learning/bulk-active`,
`help/bulk-status`, `help/bulk-status-by-filter` · the six `import/*` session endpoints · the
seven `ADMIN_KEY` maintenance routes.

**Nothing is rejected as false this round.** In round 1, three rows were. That is the single
biggest change in this review's inputs.

**One wording note:** the `import/*` row is the only one the check cannot evaluate (the
fragment strips to `import`, matching no path suffix) and also the loosest-worded — five
`import/batch*` doors *are* exposed as tools. The parenthetical *"(the six session endpoints)"*
disambiguates it correctly, so it is honest; it just happens to be unguarded. Naming the six
paths explicitly would make it both.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1.** Restate MCP.md's preamble to match what the check tests; optionally add the inverse (completeness) assertion | `MCP.md`, `workers/mcp/test/catalog.test.ts` (~12 lines) | Removes an over-claim; adds a second-direction check | **lean_mean** — +12 test lines (tests count against it). **story_checks_out** — helps directly: this is a doc claim narrower than its evidence, its exact subject. Nothing else. |
| **2.** Add `get_role_permissions` MCP tool + "omission clears / grant-only-what-you-hold" note on `set_role_permissions` | `workers/mcp/src/lib/tools.ts`, `shared/workers/tool-catalog.ts`, `MCP.md` | Adds ~14 lines, 1 read tool | **security_sentry** — new machine-readable surface exposing a permission matrix. It is gated `member_roles:read` so no new right is granted, but a reviewer must confirm that. **lean_mean** — +14 lines. **spend_review** — one more billable endpoint hit per call. |
| **3.** Either add `bulk_set_dropdown_active` (agent) or add `selectable/bulk-active` to the MCP.md row | `workers/data-ops/src/lib/tools.ts` **or** `MCP.md` | ~20 lines **or** 4 words | If the tool: **security_sentry** + **lean_mean** pay for new bulk surface. If the doc: free. **dead_end_review** benefits either way — today the door is unreachable from every surface. |
| **4.** Expose + forward `expectedVersion` on the 4 update tools | `shared/workers/tool-catalog.ts` | +4 schema keys, +4 body spreads (~8 lines) | **lean_mean** — +8 lines for a guard a client may never use. **speed_review** — none (the predicate rides the existing UPDATE). **realtime_review** — none. Genuinely additive elsewhere. |
| **5.** Enforce `inputSchema.required` in `forwardTool` (or narrow: the three `buildBody` toggles) | `workers/mcp/src/lib/tools.ts` (~8 lines) | Adds a required-field check before every forward | **round_trip_review / first_run_review** — a sloppy client that previously "worked" now gets a clean error; that is the point, but it is a behaviour change for existing scripts. **speed_review** — negligible (an in-memory key check). |
| **6.** Per-token rate limit on `/mcp` + the heavy ceiling for heavy tool paths | `workers/mcp/src/index.ts`, `workers/mcp/wrangler.jsonc`, reuse `shared/workers/rate-limit.ts` | ~10 lines + 2 bindings | **speed_review** — one extra limiter call per `tools/call` (Cloudflare-local, sub-ms, fails open). **scaling_review** — helps directly. **spend_review** — helps: caps runaway AI turns; rate-limit namespaces are free. |
| **7.** Migrate both MCP suites to `shared/test/source.ts`; explicit binding map; fail on an unresolved route; widen R19 to all GET tools | `workers/mcp/test/gating-seam.test.ts`, `workers/mcp/test/filter-parity.test.ts` (~20 lines) | Removes 2 duplicated readers; adds coverage + tripwires | **lean_mean** — net roughly neutral (deletes two local helpers, adds an import and a tripwire). **speed_review** — a few ms of CI. **security_sentry** — helps: this is the last un-migrated copy of the reader it found broken. |
| **8.** Add `get_help_thread` MCP tool | `workers/mcp/src/lib/tools.ts` (~9 lines) | 1 read tool | **security_sentry** — a machine can now read ticket conversations, which are attacker-authorable text; `MCP.md:130-138` already warns clients about that class. **spend_review** — one more endpoint. |
| **9.** One MCP.md row covering the five identity-plumbing reads; name the three unnamed `ADMIN_KEY` routes | `MCP.md` | +3 lines | none — documentation rows that close 8 classification gaps cost nothing anywhere. |
| **10.** Make a truncated MCP export report failure | `workers/mcp/src/lib/tools.ts` (~3 lines) | A truncation flag | none — the door already computes `truncated`; this only stops the MCP discarding it. |
| **11.** Quota notes on `agent_chat`/`agent_confirm`; add `agent_confirm` to `initialize`; add `list_invites` to MCP.md §3; note the mention gap on `reply_help_ticket` | `workers/mcp/src/lib/tools.ts`, `workers/mcp/src/index.ts`, `MCP.md`, `shared/workers/tool-catalog.ts` | ~5 lines | none — description text only. |

**Laws checked against every fix.** None breaks R1–R25. Fixes 2 and 8 add GET tools whose doors
parse only the params the tools would expose, so R19 is satisfied by construction and
`catalog.test.ts` validates the paths. Fix 4 adds an optional request-body field — no Law
governs that. Fix 3's tool option needs no `bulk-doors.ts` entry: R24 keys on the
**single-record** door, which is already declared; adding a caller changes nothing there.
Fix 1's inverse assertion is additive to an existing suite.

---

## CEILING

**95 is reachable by changing code.** Walking the arithmetic with all eleven fixes applied:

- Parity **100** — already there; nothing left to consolidate.
- Security **84 → 95** (fix 5 closes the coercion hole). The residual 5 is the honest cost of
  `member_roles:edit` being a self-granting right by design — and the new amplification guard
  narrowed even that. It is identical in the UI, so it is *parity*, not a machine-surface fault,
  and I decline to score it as one.
- Coverage **67 → 92** at most (fixes 2, 3, 8, 9 plus documenting the remaining eight). Reaching
  100 would mean putting `agent/threads`, `usage-log` and `import/batch` on the wire for no
  demonstrated need — coverage the design should not buy.
- Robustness **80 → 100** (fixes 4, 5).
- Scale **75 → 95** (fixes 6, 10).
- Ergonomics **81 → 95** (fixes 1, 7, 11).

`0.28×100 + 0.26×95 + 0.16×92 + 0.12×100 + 0.10×95 + 0.08×95`
`= 28 + 24.70 + 14.72 + 12 + 9.50 + 7.60` = **96.5**.

**The two things a commit cannot fix** (unchanged, and both correctly excluded from the score):

1. **The confirm asymmetry is permanent, and correctly so.** The in-app assistant stops for a
   yes/no panel before every privilege write; the MCP cannot, because the confirming UI belongs
   to the connecting client (`MCP.md:130-138`). A locked consequence of the protocol, not a gap.
2. **Cloudflare's rate limiter is per-colocation**, so even fix 6 gives an approximate ceiling.

**And one thing that is not a ceiling but reads like one.** In round 1 I wrote that the most
valuable available change was not any of my twelve fixes but a *generated companion* to
MCP.md's exclusion table. That is the one thing this pass built, and I have proved it fires.
The remaining lesson is smaller and sits one layer up: **the check tests the direction the last
audit got wrong, and only that direction.** A false row is now impossible; a missing row is
still free. R2-A and R2-C are the same fault viewed from either end, and twelve more lines
close both permanently.
