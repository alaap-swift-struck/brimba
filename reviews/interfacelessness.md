# Interfacelessness review — Brimba · 2026-08-25
SCORE: 81/100   (previous: 98/100, measured 2026-08-12)

**Scope:** whole app. **Mode:** `--report-only` — nothing in this repo was edited, and no
auto-fix or "safe consolidation" was applied.

**Verdict in one sentence.** The machine surface still forwards to the same gated doors the
screens use — that core claim survives every probe — but the previous 98 was earned partly by
a hand-written exclusion table that names three capabilities as *withheld from machines* which
have been MCP tools since 2026-07-08, and three code-level divergences (the heavy-request
ceiling, the lost-update guard, and a missing boolean that means "deactivate") were scored 100
last time without being looked for.

---

## What was verified, and how

Both surfaces were enumerated from source, not from docs:

- **MCP surface** — `workers/mcp/src/lib/tools.ts:154` `MCP_TOOLS = [...SHARED_TOOLS.map(toMcpTool), ...MCP_ONLY]`
  → **35 tools** (24 projected from `shared/workers/tool-catalog.ts`, 11 MCP-only).
- **Agent surface** — `workers/data-ops/src/lib/tools.ts:212` → 24 shared + 6 agent-only = 30 tools.
- **UI/API surface** — the four `ROUTES` tables read off disk: tenancy 36, content 19,
  data-ops 23, plus auth's switchboard.

Every rule check I credit below was confirmed non-vacuous before crediting it:

| Check | Confirmed live by |
|---|---|
| `catalog.test.ts` "every forwarded path exists" | route tables are **imported objects**, not sliced text; the one string check (`authSource.toContain("GET /api/auth/me")`) matches `workers/auth/src/index.ts:57`. |
| `filter-parity.test.ts` (R19) | I re-ran its `doorParams()` resolver standalone against the repo. All 6 GET tools resolve to a real handler and return a **non-empty** param list (`members→[id]`, `roles→[id]`, `invites→[id]`, `selectable→[id]`, `learning→[id]`, `help→[scope,id,cursor]`). Not a vacuous pass. |
| `gating-seam.test.ts` (mcp, R10) | `fnBody()` slices terminate correctly for all four handlers (next `\nasync function ` / the `/* switchboard */` comment). It would catch a deleted `verifyToken`. |

`npm run check` was **not** run — it writes vitest cache into `node_modules` and 15 other agents
are reading this tree. The mcp suites are wired into it (`package.json` → `check` → `test` →
`--workspace=brimba-mcp`), so they do gate the build.

---

## Arithmetic

`overall = 0.28·parity + 0.26·security + 0.16·coverage + 0.12·robustness + 0.10·scale + 0.08·ergonomics`

| # | Dimension | Weight | Score | Numerator / denominator |
|---|---|---|---|---|
| 1 | Parity (same codebase) | 0.28 | **94** | 24/24 write capabilities are verified thin forwards through the one seam (`forwardToDoor`), zero `mcpDoX` twins, zero MCP-only routes, zero team-DB SQL in `workers/mcp` (all 563 lines read). **−6**: two write paths reached from MCP re-implement the forward seam by hand (`writeRow`, `writeParcel`). |
| 2 | Security equivalence | 0.26 | **84** | 8 of 9 controls verified present on the MCP path (token per-request · live-membership re-check at mint · fail-closed INTERNAL_KEY · team-pinned `/me` · `requireMember` live per call · `requireRight` live per call · zero admin paths in the catalogue · gateway strips the spoofable origin header). **1 fails**: the boundary 400 is pre-satisfied by tool-side coercion. 8/9 = 89, **−5** because that failure resolves in the *destructive* direction on 3 tools. |
| 3 | Coverage | 0.16 | **67** | **35 covered / 52 should-be-covered.** 79 routes total (tenancy 36 + content 19 + data-ops 23 + `auth/me`), minus **27** genuinely-documented exclusions = 52 expected. 35 have a tool; **17 are undocumented absences**. (Two independent framings — route-level and module×verb — both give 35/52.) |
| 4 | Robustness equivalence | 0.12 | **70** | 7 of 10 guards hold identically (deactivate-not-delete · last-admin / can't-remove-self · no-self-grant · Admin-role lock · R17 idempotent transitions · audit block · `Idempotency-Key` forwarded). **3 break**: optimistic-concurrency guard unreachable · malformed toggle → destructive default · R25 `origin` lost on every imported row. |
| 5 | Scale equivalence | 0.10 | **75** | 6 of 8 (R14 list caps ✔ · help keyset paging exposed+forwarded ✔ · `EXPORT_HARD_CAP` ✔ · import row caps ✔ · `TEAM_LIMITER` applies ✔ · `USER_LIMITER` applies but keyed to **IP**, half · 400 k-char truncation reports `isError:false`, half · `HEAVY_LIMITER` **never applies** to anything reached through `/mcp`, miss). |
| 6 | Ergonomics | 0.08 | **75** | 6 of 8 (one generated catalogue for both surfaces ✔ · machine-checked against real routes ✔ · external names pinned ✔ · permission hint test-locked ✔ · glossary-native names ✔ · cost note missing from `agent_chat`/`agent_confirm` descriptions, half · R19's scan covers `SHARED_TOOLS` only, half · **MCP.md's exclusion table is wrong in 3 rows and incomplete in 1**, miss). |

```
0.28×94 = 26.32
0.26×84 = 21.84
0.16×67 = 10.72
0.12×70 =  8.40
0.10×75 =  7.50
0.08×75 =  6.00
          ------
          80.78  →  81
```

**Coverage sensitivity, stated not applied:** 5 of the 17 undocumented absences are pure
identity plumbing (`GET active`, `GET teams`, `GET team-meta`, `GET invitations`,
`GET invites/audit`) that one sentence in MCP.md would legitimately close. Doing so gives
40/52 = 77 and an overall of **83**. I did not apply it, because "a fair reading extends the
existing reason to these" is exactly the ambiguity the documented-exclusion rule exists to kill.

---

## Findings

### HIGH · The security posture doc says the machine surface cannot grant rights or invite people. It can, and has been able to since 2026-07-08.

`MCP.md:242` — "`invites` (create), `invites/revoke` … Deliberately kept to the UI."
`MCP.md:243` — "`teams` (create), `teams/update`, `roles/permissions` … A machine caller may
USE rights; it may not GRANT them."

All three are live MCP tools:
- `shared/workers/tool-catalog.ts:240` `invite_member` / `mcpName: "create_invite"` → `POST /api/tenancy/invites`
- `shared/workers/tool-catalog.ts:256` `revoke_invite` → `POST /api/tenancy/invites/revoke`
- `shared/workers/tool-catalog.ts:204` `set_role_permissions` → `POST /api/tenancy/roles/permissions`

They reach MCP because `MCP_TOOLS` projects **every** `SHARED_TOOLS` entry with no filter
(`workers/mcp/src/lib/tools.ts:154`). This is not inference: `workers/mcp/test/catalog.test.ts:73`
asserts `getMcpTool("create_invite")` **is defined**, and `ARCHITECTURE.md:99` correctly lists
invites among the MCP writes. `MCP.md` §3 also lists them as available — so MCP.md contradicts
itself two sections apart, and the section a reader consults to decide *how dangerous is a
leaked token* is the wrong one.

**Provenance matters here.** `git log -S` puts the tools at `83d0497` (2026-07-08) and the
exclusion table at `9c16021` (2026-08-12) — the commit message is
*"docs: the security and MCP-parity audits — 99/100 and 98/100"*. The table was written **by the
previous run of this review**, to close its own coverage finding, and was wrong the day it
shipped. The previous report's closing line — "a machine caller may use rights but not grant
them, cannot switch teams, and cannot invite people" — is two-thirds false.

**Why it matters:** an owner deciding whether to hand a contractor a token reads §5. It tells
them the token cannot invite people or edit a permission sheet. Both are one `tools/call` away
for anyone whose role holds `team_members:create` / `member_roles:edit`.

**The fix:** delete the two wrong rows from `MCP.md:242-243`, keep `teams`/`teams/update` (those
are correct), and move the real constraint — already written correctly at `MCP.md:255-262`,
"`member_roles:edit` is a powerful right … give a machine token that right only when the
integration genuinely manages roles" — up beside the tool list where it will be read. No code
change; the exposure itself is a deliberate, defensible design (same door, same gate, same audit).

---

### HIGH · A machine caller can write a role's permission sheet but has no tool to read it — and an omitted module is silently cleared.

- Exposed: `set_role_permissions` → `POST /api/tenancy/roles/permissions` (`tool-catalog.ts:204`).
- Not exposed: `GET /api/tenancy/roles/permissions` (`workers/tenancy/src/routes/roles.ts:92`,
  `getRolePerms`, gated `member_roles:read`). The **agent** has it
  (`workers/data-ops/src/lib/tools.ts:86` `get_role_permissions`); the MCP does not, and the
  absence is documented nowhere.

`setRolePermissions` (`workers/tenancy/src/lib/roles.ts:209-217`) iterates
**`TEAM_MODULE_CATALOG`** and upserts every module, normalising anything absent from `value` to
all-false. It is a full replace. So a script that wants to add `learning:read` to a role must
send the entire matrix — and cannot fetch the current one first. Every module it forgets is
revoked, silently, with a single activity row saying "updated permissions".

The tool's own description (`tool-catalog.ts:207-208`) explains the shape of `value` but never
says that omission means removal.

**The fix (report-only, needs the owner's call because it adds machine surface):** add
`get_role_permissions` to `MCP_ONLY` in `workers/mcp/src/lib/tools.ts` — `GET
/api/tenancy/roles/permissions`, `buildQuery: (i) => ?roleId=…` — reusing the agent's existing
wiring verbatim. `catalog.test.ts` will validate the path against tenancy's own `ROUTES`. Also
add one sentence to the `set_role_permissions` summary: *"This replaces the whole sheet — a
module you leave out is turned off."*

---

### HIGH · Expensive doors have a 10× wider rate ceiling when reached from a machine than from a browser.

`workers/gateway/src/index.ts:112-114` is the only call site of `rateLimit` in the base
(grep-confirmed). It runs against the **public** pathname:

- `callerKey()` (`shared/workers/rate-limit.ts:67-74`) keys on the `brimba_session` **cookie**,
  falling back to `ip:`. A `POST /mcp` request carries `Authorization: Bearer …` and **no
  cookie** — so every MCP caller is bucketed by egress IP, not by token.
- `isHeavyPath()` (`rate-limit.ts:60-62`) matches `/api/data-ops/agent`, `/api/data-ops/import`,
  `/api/content/learning/upload`, or a path ending `/export`. **`/mcp` matches none of them.**
- The tool call then reaches its door over a **service binding**
  (`workers/mcp/src/lib/tools.ts:179` → `forwardToDoor(env[tool.binding], …)`), which never
  re-enters the gateway. `workers/mcp/wrangler.jsonc` declares no rate-limit binding at all.

Net: a browser user calling the assistant passes `USER_LIMITER` 600/min **and** `HEAVY_LIMITER`
60/min. An MCP client calling `agent_chat`, `plan_import`, `run_import` or the CSV exports
passes only 600/min, shared per IP. `TEAM_LIMITER` (6000/min, inside `teamContext`) still bites,
so this is not unbounded — but the specific ceiling that exists for expensive doors does not
reach the surface it was written for. The seam's own comment says so:
*"A retry loop can exhaust a day's quota in seconds without something like this."*

`MCP.md:255` admits "No per-token rate limit yet" for the **non-AI** tools and implies the AI
ones are bounded by the quota. The heavy ceiling being bypassed is not mentioned.

**The fix:** in `workers/mcp/src/index.ts`, after `verifyToken` and before `forwardTool`, call
the shared limiter with a key derived from `token.id` — `env.HEAVY_LIMITER?.limit({ key: h:mcp:${token.id} })`
for tools whose `path` satisfies `isHeavyPath(tool.path)`, and `USER_LIMITER` keyed on
`token.id` for the rest. This reuses `shared/workers/rate-limit.ts` (no new seam), makes the
ceiling per-token instead of per-IP, and closes MCP.md's own "honest limit" #1 at the same time.
Requires adding the two ratelimit bindings to `workers/mcp/wrangler.jsonc`.

---

### MEDIUM-HIGH · The lost-update guard is unreachable from either machine surface.

Four edit doors accept `expectedVersion` and refuse a stale write with a clean 409
(`shared/workers/concurrency.ts:165-193`):

| Door | Handler | UI sends it |
|---|---|---|
| `POST /api/content/learning/update` | `routes/learning.ts:81` | `web/components/learning-detail.tsx:122` |
| `POST /api/content/help/update` | `routes/help.ts:98` | `web/components/help-detail.tsx:138` |
| `POST /api/tenancy/roles/update` | `routes/roles.ts:144` | `web/lib/api.ts:310` |
| `POST /api/tenancy/selectable/update` | `routes/selectable.ts:58` | `web/lib/api.ts:341` |

The matching tools — `update_learning` (`tool-catalog.ts:309`), `update_help_ticket` (`:343`),
`update_role` (`:180`), `update_dropdown_value` (`:275`) — neither expose `expectedVersion` in
their schema nor forward it in `buildBody`. `buildBody` builds a **fixed key set**, so a client
that sends the field anyway has it dropped.

`versionPredicate(undefined)` returns `""` and `assertNotConflicted(n, undefined)` returns
early, so the guard is a total no-op. A machine edit therefore **always wins** a concurrent-edit
race against a human who is being told "someone else changed this". CONCURRENCY.md never
mentions the machine surfaces.

**The fix:** add `expectedVersion: S` to those four schemas and
`...(str(i,"expectedVersion") ? { expectedVersion: str(i,"expectedVersion") } : {})` to their
`buildBody`, with the summary line *"pass the record's `updatedAt` from a list/read to refuse
the edit if someone changed it meanwhile."* Opt-in, so no existing client breaks. Breaks no Law
(R19 governs GET filters only).

---

### MEDIUM-HIGH · On three toggle tools, a missing required field means "deactivate".

`tool-catalog.ts:194`, `:288`, `:324` all build the body as `active: i.active === true`.
`workers/mcp/src/index.ts:84-95` (`tools/call`) does **no** validation against `inputSchema` —
it looks the tool up and forwards.

So `tools/call {"name":"set_learning_active","arguments":{"id":"X"}}` — `active` omitted —
sends `active: false`. The door
(`workers/content/src/routes/learning.ts:96-97`) checks `typeof body.active !== "boolean"`,
sees a boolean, and deactivates. Same for `set_role_active`
(`workers/tenancy/src/routes/roles.ts:163`) and `set_dropdown_value_active`
(`workers/tenancy/src/routes/selectable.ts:69`). The door's clean-400 is unreachable, and the
default resolves destructively.

Same family, lower blast: `str()` (`tool-catalog.ts:31-34`) coerces any non-string to
`String(v)`, so `{"title":{"a":1}}` creates a record titled `[object Object]` where
`requireText` (`shared/workers/validate.ts:26`) would have returned *"Title must be text."*

Graded MEDIUM-HIGH rather than HIGH because a schema-compliant MCP client refuses the call
locally (`required: ["id","active"]`) — but the server must not depend on the client for that.
The agent surface has the same coercion, mitigated by its confirm panel; the MCP has no panel
by design (`MCP.md:130-138`).

**The fix, one place:** in `forwardTool` (`workers/mcp/src/lib/tools.ts:164`), reject a call
whose `inputSchema.required` names a key absent from `input`, with a clean JSON-RPC error —
that covers every present and future tool. Alternatively, narrower: change the three
`buildBody`s to `active: typeof i.active === "boolean" ? i.active : undefined` so the door
issues its own 400.

---

### MEDIUM · Every imported row records as if a person typed it in the browser — including an import run by an MCP token.

R25 defines six origins (`shared/workers/activity.ts:82`) and says the trail must carry *which
door the change came through*. `ORIGIN_HEADER` is set in exactly one place
(`shared/workers/http.ts:72`), and its only two callers pass `"mcp"`
(`workers/mcp/src/lib/tools.ts:185`) and `"agent"` (`workers/data-ops/src/lib/tools.ts:294`).

But the import writer does not use that seam. `writeRow`
(`workers/data-ops/src/lib/import.ts:376-386`) and `writeParcel` (`:406-419`) call
`fetcher.fetch(...)` directly with only `Cookie` and `Content-Type`. So:

- `originFrom()` (`activity.ts:94-97`) finds no header and defaults to `"ui"`.
- **`origin: "import"` is a declared value that nothing in the codebase ever produces** —
  grep-confirmed. Same for `"api"` and `"job"`.
- The incoming `x-brimba-origin: mcp` on `POST /api/data-ops/import/batch/confirm` is not
  propagated either, so `run_import` over MCP stamps every created row `"ui"`.
- `REQUEST_ID_HEADER` is dropped too, so R11's trace id does not reach the per-row writes.

MCP.md's promise — "the change gets the same audit trail … as if a person had done it in the
UI" — is literally true here and is the wrong outcome: the audit cannot distinguish an outside
tool's bulk write from a person's typing.

**The fix:** replace the two hand-rolled fetches with `forwardToDoor(fetcher, { path, method:
"POST", cookie, body, origin: "import", requestId: request.headers.get(REQUEST_ID_HEADER) })`.
This is a pure consolidation onto the existing seam — it removes ~14 lines, sets the origin the
type already declares, and restores the trace id.

---

### MEDIUM · `POST /api/tenancy/selectable/bulk-active` exists on no surface at all, and its absence is documented nowhere.

R24 added the twin on 2026-08-12 (`9d1de92`), declared at `shared/workers/bulk-doors.ts:71-75`
and routed at `workers/tenancy/src/index.ts:137`. A repo-wide grep for
`postBulkSetSelectableActive` returns **four** hits: the handler, the import, the route entry,
and the bulk-doors declaration. No web caller (`web/` has zero references to any `bulk-` path),
no agent tool, no MCP tool.

Its two siblings are agent tools *and* are named in MCP.md's exclusion table (`MCP.md:246`).
This one is in neither. So the base ships a gated, live, R24-compliant bulk door that nothing
can call and nothing explains.

**The fix (owner's call — it is new machine surface either way):** either add
`bulk_set_dropdown_active` to `AGENT_ONLY` beside the other two (confirm:true, same shape), or
add `selectable/bulk-active` to the `MCP.md:246` row so the absence is a decision. Doing
neither leaves a door that only a Law knows about.

---

### MEDIUM · A machine can reply into a support-ticket conversation it cannot read.

`reply_help_ticket` → `POST /api/content/help/reply` is exposed (`tool-catalog.ts` help block).
`GET /api/content/help/thread` (`workers/content/src/routes/help.ts:73`, gated `help:read`,
returns the replies plus an exact total) is not, and the absence is undocumented.
`list_help_tickets` returns the ticket, not its thread.

**The fix:** add a `get_help_thread` MCP tool forwarding to `GET /api/content/help/thread` with
`{ id }` — the door already parses only `id`, so R19 is satisfied by construction and
`catalog.test.ts` validates the path.

---

### LOW-MEDIUM · Fourteen more undocumented absences (the rest of the 17)

Beyond the four called out above, these have no tool and no written reason. Listed so the next
run can tell an oversight from a decision:

| Route | Consequence for a machine caller | Weight |
|---|---|---|
| `GET /api/tenancy/my-permissions` | cannot ask "what may I do?" — must discover rights by collecting 403s | material |
| `GET /api/tenancy/activity` | cannot read the audit trail, including the R25 `origin` column added for exactly this question | material |
| `GET /api/data-ops/agent/usage` | cannot pre-check the AI quota MCP.md §4 makes the whole cost story | material |
| `GET /api/data-ops/import/targets` | cannot discover which tables it may import into | material |
| `GET /api/content/learning/progress` | no team-progress read | minor |
| `GET /api/data-ops/import/batch` | minor — `plan_import` / `run_import` return the same payload | minor |
| `GET /api/data-ops/agent/usage-log`, `GET agent/threads`, `GET agent/thread` | cannot resume or audit its own assistant conversations | minor |
| `GET /api/tenancy/active`, `GET teams`, `GET team-meta`, `GET invitations`, `GET invites/audit` | identity plumbing; the pinned-token model arguably makes them meaningless | trivial |

**The fix for the trivial five:** one row in `MCP.md` §5 — *"the team-pointer and cross-team
reads (`active`, `teams`, `team-meta`, `invitations`, `invites/audit`): a token is pinned to ONE
team, so a machine caller has nothing to choose between."* That alone moves coverage 67 → 77.

---

### LOW · An MCP export can be silently truncated and still report success.

`workers/mcp/src/lib/tools.ts:161` caps a tool result at 400 000 characters and appends
`…(truncated)`; `isError` stays `false` because it is `!res.ok` (`:191`). `EXPORT_HARD_CAP` is
10 000 rows (`shared/workers/limits.ts:12`), and a full-field learning CSV of 10 000 rows
comfortably exceeds 400 KB. The UI download of the same door is not truncated. A script parsing
the CSV gets a short file with a success flag.

**The fix:** set `ok: false` (or add a structured `truncated: true`) when the cap bites — the
door itself already models this honestly (`csvResponse("learning.csv", csv, truncated)` in
`workers/content/src/routes/learning.ts:66`).

---

### LOW · R19's parity check covers `SHARED_TOOLS` only, and its worker resolver is a two-way guess.

`workers/mcp/test/filter-parity.test.ts:51` iterates `SHARED_TOOLS`. The 11 MCP-only tools and
the 6 agent-only tools are never checked. Today nothing is broken — I traced all of them by
hand: the three exports and `list_imports` parse zero params, `whoami` parses zero, and the
agent's `get_role_permissions` correctly exposes and forwards `roleId`.

The latent hole is line 54: `t.binding === "TENANCY" ? "tenancy" : "content"`. A GET tool on a
**data-ops** door would resolve against `workers/content/src/routes`, find nothing, and
`doorParams` would return `[]` — a **vacuous pass**, exactly the blind-check pattern the
campaign brief warns about. `SharedTool.binding` is typed `"TENANCY" | "CONTENT"` today, which
is the only thing preventing it.

**The fix:** map the binding explicitly (`{TENANCY:"tenancy", CONTENT:"content", DATAOPS:"data-ops"}`),
throw on an unmapped binding, extend the loop to `MCP_TOOLS` and `TOOL_CATALOG` (skipping
`SELF`), and add a tripwire asserting each checked door returned at least one param **or** is on
a pinned zero-param list.

---

### LOW · Two cost/honesty nits in the generated catalogue

- `agent_chat` and `agent_confirm` descriptions (`workers/mcp/src/lib/tools.ts:135`, `:144`)
  carry no quota note, while `plan_import` (`:106`) does. The `initialize` instructions
  (`workers/mcp/src/index.ts:70`) name "plan_import, agent_chat" and omit `agent_confirm`, which
  MCP.md §4 says does cost a turn.
- `MCP.md:122`'s read list omits `list_invites`, which has been a tool since the catalogue
  unification.

---

## Intentional exclusions (documented, not counted against the score) — 27 routes

Verified accurate: `bootstrap`, `switch-team`, `invitations/accept` (identity-sensitive, and the
pin makes them incoherent) · `teams`, `teams/update` (tenant shape) · `config/screens` ×2 ·
`learning/upload` (binary body) · `learning/done`, `help/stakeholders` ×2 (per-person state) ·
`learning/bulk-active`, `help/bulk-status`, `help/bulk-status-by-filter` (confirm-panel-gated;
the reasoning at `MCP.md:248-253` is the best-argued exclusion in the doc) · the six
`import/*` session endpoints · the four ADMIN_KEY-gated maintenance routes in tenancy and the
four in data-ops · auth's sign-in and profile doors.

**Rejected as documented:** the three rows at `MCP.md:242-243` covering `invites` and
`roles/permissions` — they describe tools that exist.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **1.** Delete the two wrong rows in MCP.md §5; move the `member_roles:edit` caveat up | `MCP.md` | Removes 2 false claims; adds ~3 lines | **story_checks_out** — mildly helps it (removes a live contradiction between MCP.md §3 and §5, and between MCP.md and ARCHITECTURE.md:99). Nothing else. |
| **2.** Add `get_role_permissions` MCP tool + "omission clears" warning on `set_role_permissions` | `workers/mcp/src/lib/tools.ts`, `shared/workers/tool-catalog.ts`, `MCP.md` | Adds ~14 lines, 1 read tool | **security_sentry** — new machine-readable surface exposing a permission matrix (gated `member_roles:read`, so no new right, but a reviewer must confirm it). **lean_mean** — +14 lines. **spend_review** — one more billable endpoint hit per call. |
| **3.** Per-token rate limit on `/mcp`, heavy ceiling for heavy tool paths | `workers/mcp/src/index.ts`, `workers/mcp/wrangler.jsonc`, reuse `shared/workers/rate-limit.ts` | Adds ~10 lines + 2 bindings | **speed_review** — one extra limiter call per tools/call (Cloudflare-local, sub-ms, and it fails open). **scaling_review** — helps it directly (closes a documented ceiling gap). **spend_review** — rate-limit namespaces are free; net saving, since it caps runaway AI turns. |
| **4.** Expose + forward `expectedVersion` on the 4 update tools | `shared/workers/tool-catalog.ts` | Adds 4 schema keys + 4 body spreads (~8 lines) | **lean_mean** — +8 lines for a guard the client may never use. **speed_review** — none (the predicate rides the existing UPDATE). **realtime_review** — none. Genuinely additive elsewhere. |
| **5.** Enforce `inputSchema.required` in `forwardTool` (or narrow: three `buildBody` toggles) | `workers/mcp/src/lib/tools.ts` (~8 lines) | Adds a required-field check before every forward | **round_trip_review / first_run_review** — a sloppy client that previously "worked" now gets a 400; that is the point, but it is a behaviour change for existing scripts. **speed_review** — negligible (an in-memory key check). |
| **6.** Route `writeRow`/`writeParcel` through `forwardToDoor` | `workers/data-ops/src/lib/import.ts` | **Removes** ~14 lines of duplicated fetch; adds `origin:"import"` + trace id | **activity_log_review** — helps it (a declared origin finally gets produced). **architecture_review** — helps (one fewer bypass of a shared seam). **lean_mean** — helps (net line reduction). **error_log_review** — helps (imports rejoin the trace). No downside found. |
| **7.** Either add `bulk_set_dropdown_active` (agent) or document `selectable/bulk-active` | `workers/data-ops/src/lib/tools.ts` **or** `MCP.md` | Adds ~20 lines **or** 4 words | If the tool: **security_sentry** + **lean_mean** pay for new bulk surface. If the doc: free. **dead_end_review** benefits either way — today the door is unreachable. |
| **8.** Add `get_help_thread` MCP tool | `workers/mcp/src/lib/tools.ts` | Adds ~9 lines, 1 read tool | **security_sentry** — a machine can now read ticket conversations, which are attacker-authorable text; MCP.md:130-138 already warns clients about exactly this class. **spend_review** — one more endpoint. |
| **9.** One MCP.md row covering the five identity-plumbing reads | `MCP.md` | Adds 2 lines | none — a documentation row that closes 5 gaps costs nothing anywhere. |
| **10.** Make a truncated MCP export report failure | `workers/mcp/src/lib/tools.ts` (~3 lines) | Adds a truncation flag | none — the door already computes `truncated`; this only stops the MCP discarding it. |
| **11.** Widen R19's scan to all GET tools + explicit binding map + tripwire | `workers/mcp/test/filter-parity.test.ts` (~15 lines) | Adds test coverage | **lean_mean** — +15 test lines (tests count against it). **speed_review** — a few ms of CI. Everything else benefits: it closes a vacuous-pass path. |
| **12.** Quota notes on `agent_chat`/`agent_confirm`; add `agent_confirm` to `initialize`; add `list_invites` to MCP.md §3 | `workers/mcp/src/lib/tools.ts`, `workers/mcp/src/index.ts`, `MCP.md` | ~4 lines | none — description text only. |

**Laws checked against every fix above.** None breaks R1–R25. Fix 2 and 8 add GET tools whose
doors parse only the params the tools would expose, so R19 is satisfied by construction and
`catalog.test.ts` validates the paths. Fix 6 changes no response shape, so R21/R23 are untouched.
Fix 4 adds an optional field to a request body — no rule governs that. Fix 7's tool option would
need an entry in `bulk-doors.ts`? No — R24 keys on the **single-record** door, which is already
declared; adding a caller changes nothing there.

---

## CEILING

**Yes, 95 is reachable by changing code — but not by this repo alone, and not without a decision
the owner has to make.**

Walking the arithmetic with all twelve fixes applied:

- Parity 94 → **100** (fix 6 removes the last two bespoke forwards).
- Security 84 → **95** (fix 5 closes the coercion hole; the residual 5 is the honest cost of
  `member_roles:edit` being a self-granting right by design — same in the UI, so it is *parity*,
  not a machine-surface fault, and I decline to score it as one).
- Coverage 67 → **92** at most. Fixes 2, 7, 8, 9 plus documenting the remaining eight absences
  gets 48–52 of 52. Reaching 100 would mean putting `agent/threads`, `usage-log` and
  `import/batch` on the wire for no demonstrated need — coverage the design should not buy.
- Robustness 70 → **100** (fixes 4, 5, 6).
- Scale 75 → **95** (fixes 3, 10; the residual is the per-colocation approximation of
  Cloudflare's limiter, which no commit can remove).
- Ergonomics 75 → **95** (fixes 1, 11, 12; the residual is that MCP.md's exclusion table is
  hand-maintained by nature — a generated table would need a `NOT_A_TOOL` registry, which is
  more machinery than the problem deserves).

`0.28×100 + 0.26×95 + 0.16×92 + 0.12×100 + 0.10×95 + 0.08×95 = 28 + 24.7 + 14.72 + 12 + 9.5 + 7.6` = **96.5**.

**The two things a commit cannot fix.**

1. **The confirm asymmetry is permanent and correctly so.** The in-app assistant stops for a
   yes/no panel before every privilege write; the MCP cannot, because the confirming UI belongs
   to the connecting client (`MCP.md:130-138`). That is a locked design consequence of the
   protocol, not a gap, and it is already excluded from the score.
2. **Cloudflare's rate limiter is per-colocation**, so even fix 3 gives an approximate ceiling.

**One thing that is not a ceiling but reads like one:** this review's own history. The previous
98 was recorded, and the exclusion table that produced it became canon. The single most valuable
change available here is not any of the twelve fixes — it is that `MCP.md` §5's table should
carry a **generated** companion (a test asserting no row in the table names a live
`MCP_TOOLS` entry). Twelve lines in `catalog.test.ts` would have caught this finding in
July and would stop the same class of drift forever. It costs `lean_mean` twelve lines and
buys back the credibility of every future run of this review.
