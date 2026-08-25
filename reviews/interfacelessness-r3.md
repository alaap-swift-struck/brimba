# Interfacelessness review — round 3 — Brimba · 2026-08-25
SCORE: **88/100** (grade B)   (round 1: 81 · round 2: 84 · the retired 2026-08-12 run: 98)

**Scope:** whole app. **Mode:** report-only — nothing in this repository was edited except
this file. No `npm run check` (two `npm install` processes were already running in this tree
during the run; `web/node_modules/@swift-struck/ui` was empty for part of it). Every check I
credit was re-executed or re-derived from repo source in the scratchpad.

**The verdict in one sentence:** a machine caller now gets the same lost-update protection and
the same refusal-on-a-missing-field a person gets, so the machine surface is no longer the
weaker of the two at any door it can reach — what is left is the seventeen doors it cannot
reach at all, one of which nothing on any surface can reach.

---

## DELTA

| # | Dimension | Wt | R1 | R2 | **R3** | Why it moved |
|---|---|---|---|---|---|---|
| 1 | Parity (same codebase) | 0.28 | 94 | 100 | **100** | unchanged — no new tool, no new twin. **But round 2's stated evidence was wrong**, and I correct it below rather than carry it |
| 2 | Security equivalence | 0.26 | 84 | 84 | **95** | **UP 11.** The one failing control — a tool-side coercion pre-satisfying the door's 400, resolving destructively on three tools — is fixed and machine-checked. −5 for two identical coercions the new check's regex cannot see |
| 3 | Coverage | 0.16 | 67 | 67 | **67** | unchanged, re-derived. The subsystem removal took 2 routes AND their 2 exclusion rows, so numerator and denominator both moved and the fraction did not: 35/52 |
| 4 | Robustness equivalence | 0.12 | 70 | 80 | **92** | **UP 12.** Both remaining breaks closed — `expectedVersion` reachable, omitted boolean refused. −8 for a NEW containment inconsistency the fix introduced on the agent path |
| 5 | Scale equivalence | 0.10 | 75 | 75 | **75** | unchanged. Nothing in the limiter, the caps or the truncation path moved |
| 6 | Ergonomics | 0.08 | 75 | 81 | **75** | **DOWN 6 — caused by the screen-override removal.** MCP.md now describes a tool that does not exist, in prose the exclusion-table check is structurally unable to read |

```
0.28 × 100 = 28.00
0.26 ×  95 = 24.70
0.16 ×  67 = 10.72
0.12 ×  92 = 11.04
0.10 ×  75 =  7.50
0.08 ×  75 =  6.00
             -----
             87.96  →  88
```

### The round's central question: did somebody else's repair break my criteria?

**Yes — dimension 6, by 6 points, and the culprit is the screen-override removal.** Finding
R3-A. The removal itself was right and it helped two other reviews; what it left behind is a
paragraph in the developer-facing document telling an outside integrator that a tool called
`set_screen_override` exists. It does not. Round 2's repair added a machine check over that
document — and the check reads only the table's rows, so it watched the table stay honest
while the prose beneath it went stale.

Everything else moved up, and two of the three upward moves are direct repairs of my own
round-2 findings.

---

## What I was asked to verify

### 1 · `expectedVersion` is exposed and forwarded by all four `update_*` tools — **TRUE**

`shared/workers/tool-catalog.ts:48-49` declares the field and the forwarder, and all four
edit tools carry both halves:

| tool | schema | forwards |
|---|---|---|
| `update_role` | `:220` `...VERSION_FIELD` | `:221` `expectedVersion: version(i)` |
| `update_dropdown_value` | `:315` | `:316` |
| `update_learning` | `:350` | `:353` |
| `update_help_ticket` | `:383` | `:384` |

**And I checked the other direction, which is the one that actually matters** — are there
edit doors that accept `expectedVersion` and have no tool forwarding it? Five doors parse it:
`teams/update` (`routes/team.ts:116`), `selectable/update` (`:67`), `roles/update` (`:151`),
`help/update` (`:99`), `learning/update` (`:86`). Four have the tools above. The fifth,
`teams/update`, is a **documented exclusion** in MCP.md ("changing the shape of a tenant"),
so its absence is correct. **The parity is complete: 4 of 4 reachable doors covered.**

**The check that locks it has a hole its own title hides.** `workers/mcp/test/catalog.test.ts:163`
is named *"every edit door that accepts expectedVersion has a tool that forwards it"* and its
body enumerates `MCP_TOOLS.filter(t => /^update_/.test(t.name))` — **tools, not doors**. It
proves every tool named `update_*` forwards the field. It cannot see:

- a new edit door with `expectedVersion` whose tool is named `edit_*`, `rename_*` or `set_*`
- an edit door with `expectedVersion` and **no tool at all**
- `update_help_ticket` being deleted entirely (the blindness guard is `> 1`, and three would
  remain)

This is the same shape as round 2's exclusion-table finding and round 1's: a check whose name
claims a direction it does not test. It is a good check — it would have caught the original
bug — and its title should be narrowed to what it does, or its body widened to what it says.
Finding R3-C.

### 2 · The three `set_*_active` tools REFUSE an omitted boolean — **TRUE**

`shared/workers/tool-catalog.ts:63-69`:

```ts
const bool = (input: Record<string, unknown>, key: string): boolean => {
  const v = input[key]
  if (typeof v !== "boolean")
    throw new GuardError(400, "invalid_input", `"${key}" must be true or false — it was …`)
  return v
}
```

Used by `set_role_active` (`:231`), `set_dropdown_active` (`:325`) and `set_learning_active`
(`:361`). The old `i.active === true` is gone from all three. `catalog.test.ts:148-161` asserts
the throw, asserts `false` still means false, and carries a blindness guard
(`toggles.length > 2`).

**Where the 400 lands, traced on both machine paths:**

- **MCP** — `buildBody` runs inside `forwardTool` (`workers/mcp/src/lib/tools.ts:187`), the
  throw reaches the worker's central catch (`workers/mcp/src/index.ts:196`), which maps a
  `GuardError` to `fail(e.status, e.code, e.message)`. **A clean 400 with the real reason.**
  Exactly the UI's behaviour. Correct.
- **Agent** — `buildBody` runs inside `executeTool` (`workers/data-ops/src/lib/tools.ts:296`),
  which is awaited at `agent.ts:492` and `:604` **with no try/catch around it**. The throw
  escapes the tool-call loop entirely. Finding R3-B.

### 3 · `selectable/bulk-active` — **STILL HAS NO CALLER. Anywhere.**

```
grep -rn "selectable/bulk-active" workers shared web scripts *.md
→ workers/tenancy/src/index.ts:132   its own route registration
→ ROUTE-CENSUS.md:100                a generated inventory row
```

Two hits, neither a caller. Not in `web/lib/api.ts` (five `selectable` calls, none bulk), not
in either tool file, and **still not in MCP.md's exclusion table** — so a reader cannot tell
whether it is deliberately kept off the machine surface or was simply forgotten. Its two
siblings, `learning/bulk-active` and `help/bulk-status`, are *both* in the exclusion table
with a reason ("bulk writes; `plan_import` is the supported machine path"). This one is
neither exposed nor excluded.

It remains one of my 17 undocumented absences and it is `dead_end_review`'s last criterion-1
critical. **The cheapest fix in either review is one row in MCP.md's table**, which costs
nothing and closes it on both.

### 4 · The exclusion-table check, re-tested now that `config/screens` left the table

Round 2's point was that the check tests one direction only — no row may name a path a tool
exposes — and therefore cannot see a **false reason** or a **missing row**. That point is
now demonstrated by a live example rather than argued.

```ts
// workers/mcp/test/catalog.test.ts:113-116
const rows = doc.slice(doc.indexOf("| Not exposed | Why |")).split("\n")
  .filter((l) => l.startsWith("| `"))
```

**It reads table rows and nothing else.** The `config/screens` row was correctly deleted
when the subsystem went. Eight rows remain and all eight are true — I re-harvested the 35
tool paths from source and re-ran the check's exact logic: **zero lies.** The table is clean.

Directly beneath that clean table, invisible to the check, sits `MCP.md:263-270`:

> **`config/screens` was on this list until 2026-08-25 and is now a tool**
> (`set_screen_override`) … it **confirms before it runs** and needs the `screens:edit`
> right, which no role holds by default.

`grep -rn "set_screen_override\|screens:edit"` across `workers/ shared/ web/ *.md` returns
**those two lines and nothing else in the repository.** No tool, no right, no module, no
route. The document written for outside developers advertises a capability that was built and
deleted on the same day, and the check built to stop exactly this kind of drift passed,
because the drift moved one line below the rows it reads.

---

## The correction round 2 owes

Round 2 scored parity 100 and published this evidence: *"`shared/workers/http.ts:78` is now
the **only** `https://internal` fetch in the base — grep-confirmed."* **That is false, and it
was false when it was written** (neither file has changed since):

```
workers/mcp/src/lib/bridge.ts:26          the token→session bridge
workers/data-ops/src/lib/agent.ts:190     resolveNames' read helper
workers/gateway/src/index.ts:124,228,246  the public door's own calls
shared/workers/http.ts:92                 forwardToDoor
```

**The conclusion survives the correction, which is why parity stays at 100.** None of the
five others is a tool forward: three are the gateway's own plumbing, one is the session
bridge, and `agent.ts:190` is a bounded read that prettifies ids into names for step
summaries — it hits the same gated doors with the caller's own cookie through `callService`.
Every *tool* still goes through the one seam. But "the only X in the base" was a stronger
claim than the evidence supported, and a reviewer who repeats it will one day be repeating it
about a real twin.

**One standing, reasoned divergence, re-confirmed and not re-charged:** `run_import_batch`
(`workers/data-ops/src/lib/tools.ts:207`) is the single tool in either catalogue with a
bespoke `run:` instead of a path. It runs in-process rather than through
`/api/data-ops/import/batch/confirm`. It passes two of the three parity tests — it calls the
**same function** (`confirmBatch`) and it **re-checks the gate** (`requireRight(cfg, guard, m, "create")`
per target, `:229`) — and it is agent-only; the MCP surface reaches the same capability
through `run_import`, which is a real forward to the real route. Its own comment documents the
choice. Recorded so the next round does not rediscover it as new.

---

## Findings

### R3-A · MEDIUM — MCP.md advertises a tool that does not exist · **NEW · caused by the removal**
`MCP.md:263-270` · dimension 6

Detailed above. An outside developer — the exact reader this document exists for — will look
for `set_screen_override` in `tools/list` and not find it. The `screens:edit` right it names
does not exist either; the whole module left `TEAM_MODULES`.

**The fix:** delete the paragraph (8 lines). **The better fix, and the one that stops this
recurring:** extend `catalog.test.ts`'s scan from `rows` to the whole `## Not exposed`
section, and assert that any backticked `snake_case` identifier in the prose that *looks like
a tool name* is either a live tool or explicitly marked as historical. Cross-ref
`story_checks_out_review` and `dead_end_review` (which files the same paragraph under a
different criterion).

### R3-B · MEDIUM — the new refusal ends the whole agent turn instead of failing one step · **NEW · caused by the fix I asked for**
`workers/data-ops/src/lib/tools.ts:296` · `workers/data-ops/src/lib/agent.ts:492, 604` ·
`workers/data-ops/src/routes/agent.ts:61-67` · dimension 4

The guard is right and the direction of the fix is right — refusing beats silently
deactivating. But on the agent path the `GuardError` is thrown from inside `buildBody`, which
runs inside `executeTool`, which is awaited in the tool-call loop **with no catch**:

```ts
emit?.({ t: "step_start", tool: tc.name, summary, ids: traceIds(tc.input) })
const result: ToolResult = t ? await executeTool(env, request, t, tc.input) : …   // throws past here
emit?.({ t: "step_end", … })                                                      // never reached
```

Compare the same door refusing the same request for any other reason — a missing
`description`, a denied permission — where `forwardToDoor` returns a non-ok response and
`executeTool` converts it into `{ ok: false, status, error }`, producing a red step row with
the door's own message, after which the turn continues.

So one class of 400 now behaves differently from every other class of 400 on the same
surface. Concretely, when the model omits `active`:

- the step emits `step_start` and never `step_end` — the row is left mid-flight
- `streamRun`'s catch (`routes/agent.ts:62`) writes a terminal `error` event and the turn ends
- the code after the loop — including `log()` and the usage tally — is skipped

**The fix is four lines** and it makes this class identical to every other:

```ts
let result: ToolResult
try { result = t ? await executeTool(env, request, t, tc.input) : {…404…} }
catch (e) { result = e instanceof GuardError
  ? { ok: false, status: e.status, data: null, error: e.message } : (() => { throw e })() }
```

`executeTool` already returns exactly that shape for a door-side 400 — this is making the
tool-side one match. Note this raises the value of the fix rather than questioning it: today
the failure is loud and honest, which is far better than round 2's silent deactivate.

### R3-C · LOW — a check's title claims a direction its body does not test · **NEW**
`workers/mcp/test/catalog.test.ts:163`

Detailed above: *"every edit door that accepts expectedVersion has a tool that forwards it"*
enumerates tools. **The fix:** derive the door set from source — grep `workers/*/src/routes`
for `expectedVersion?: string` in a `gatedBody<…>` type argument, subtract MCP.md's
documented exclusions, and assert every remaining door has a tool whose `path` matches and
whose schema carries the field. That is the shape R19's `filter-parity.test.ts:44` already
uses successfully for query filters, in the same directory.

### R3-D · LOW — two `=== true` boolean coercions survive the fix, on tools the new check cannot see · **NEW**
`workers/data-ops/src/lib/tools.ts:187` (`done: i.done === true`) ·
`workers/mcp/src/lib/tools.ts:149` (`approve: i.approve === true`) · dimension 2

The repair replaced the pattern in the three tools whose omission resolved **destructively**.
Two instances remain, and the check's regex — `/^set_\w+(_value)?_active$/` — matches neither:

| site | omitted field means | direction |
|---|---|---|
| `learning/done` — mark an article read | "mark it unread" | harmless; per-view telemetry |
| `agent_confirm` — approve a pending write | "reject it" | **safe**: a dropped field cancels rather than commits |

Neither is a live bug today; both resolve the safe way. They are named because the *reason*
the original was dangerous — a coercion that pre-satisfies the door's own validation, so the
door's clean 400 becomes unreachable — is still true of both, and the next person to copy the
pattern will not know which of the two lists they are copying from. **The fix:** use `bool()`
for `done` (it is required in its schema), and leave `approve` with a comment saying the
default is deliberate and which way it falls.

### R3-E · MEDIUM — seventeen doors the machine surface cannot reach, unchanged · **STANDS**
dimension 3

35 tools cover 52 machine-appropriate routes. Re-derived this round rather than carried:

```
routes                     79 − 2 (config/screens ×2, removed with the subsystem)   = 77
documented exclusions      27 − 2 (their two table rows went with them)             = 25
should-be-covered          77 − 25                                                  = 52
covered by a tool                                                                     35
undocumented absences      52 − 35                                                  = 17
                           coverage = 35 / 52 = 67.3 %
```

The fraction is byte-identical to round 2 because the removal took a route and its exclusion
away together — the cleanest possible way to delete a capability, and worth saying, because
the usual outcome is a route that leaves and a doc row that stays (which is R3-A).

The 17 are unchanged from round 2's enumeration; the headline members remain
`selectable/bulk-active` (also unreachable from the UI — see above), `invites/audit`,
`team-meta`, `activity`, `learning/upload`, `my-permissions` and the profile/email-change
cluster. Each is a product decision, not a defect, and **the single most valuable action is
not to build seventeen tools — it is to put each absence in MCP.md's table with its reason**,
which converts a coverage gap into a documented exclusion, removes it from my denominator
honestly, and takes coverage to 100 without adding one line of surface area.

### R3-F · LOW — scale equivalence unchanged, and its two halves stand · **STANDS**
dimension 5

Re-checked, nothing moved: R14 list caps forwarded ✓ · help keyset paging exposed and
forwarded ✓ · `EXPORT_HARD_CAP` 10,000 ✓ · import row caps ✓ · `TEAM_LIMITER` ✓ ·
`USER_LIMITER` applies but is IP-keyed (half) · the 400,000-char truncation reports
`isError: false`, so a machine caller cannot tell a truncated answer from a complete one
(half) · `HEAVY_LIMITER` never applies (miss). 6 of 8.

---

## FIX IMPACT MAP

| Fix | Files it touches | What it ADDS / REMOVES | Which other review could this hurt? |
|---|---|---|---|
| **A** delete MCP.md's `set_screen_override` paragraph | `MCP.md` (−8 lines) | REMOVES a phantom capability | none — helps `story_checks_out_review`, `dead_end_review`, `lean_mean_review` |
| **A+** widen `catalog.test.ts` to scan the section's prose, not only its rows | `workers/mcp/test/catalog.test.ts` (~10 lines) | ADDS a check that can catch the next one | **`lean_mean_review`** — ten more lines of test. Nothing else; it changes no shipped code |
| **B** catch `GuardError` around `executeTool` in both agent loops | `workers/data-ops/src/lib/agent.ts` (~8 lines, two sites) | ADDS a catch; REMOVES an orphaned step row and a skipped usage log | **`lean_mean_review`** — eight lines duplicated across two loops unless hoisted into `executeTool` itself, which is the better shape. **`error_log_review`** — mildly positive: the failure becomes a recorded step outcome instead of a stream-level error |
| **C** derive the `expectedVersion` door set from source in the test | `workers/mcp/test/catalog.test.ts` (~15 lines) | ADDS a real bidirectional check | **`lean_mean_review`** — more test code. **`speed_review`** — a few ms on `npm run check` |
| **D** use `bool()` for `learning/done`; comment `approve`'s default | `workers/data-ops/src/lib/tools.ts`, `workers/mcp/src/lib/tools.ts` (2 lines) | REMOVES two latent coercions | **`first_run_review`** — none. Watch one thing: if any client ever calls `learning/done` without the field, it would start 400ing. `web/lib/api.ts` sends it explicitly, so this is safe as written |
| **E** add MCP.md exclusion rows for the 17 undocumented absences (starting with `selectable/bulk-active`) | `MCP.md` (~17 rows) | ADDS documentation; REMOVES 17 from my denominator | **`dead_end_review`** — a row for `selectable/bulk-active` converts its criterion-1 **critical** into a minor, which is the same one-line fix serving two reviews. **`lean_mean_review`** — a longer doc. **`security_sentry_review`** — positive: an explicit "not exposed, because…" list is a stated posture rather than an accident |
| **F** expose the truncation flag (`isError: true` or a `truncated` field) on over-long tool results | `workers/mcp/src/lib/tools.ts` | ADDS one field | **`round_trip_review` / `speed_review`** — neutral, no extra call. **`spend_review`** — neutral. This is the cheapest of the two scale halves |

---

## CEILING

**95 is reachable by changing code — just — and every point of the gap is documentation
rather than engineering.** With A, B, C, D, E and F applied:

```
parity        100   (already there)
security      100   (D closes the last latent coercion)
coverage      100   (E: 17 documented exclusions leave the denominator honestly — the
                     capability count does not change, the accounting becomes truthful)
robustness    100   (B)
scale          88   (F fixes one half; USER_LIMITER's IP keying and HEAVY_LIMITER's
                     never-applying are platform/architecture shape, not a tool bug)
ergonomics     94   (A + A+ ; the cost note on agent_chat/agent_confirm is a comment)
```

```
0.28×100 + 0.26×100 + 0.16×100 + 0.12×100 + 0.10×88 + 0.08×94
= 28 + 26 + 16 + 12 + 8.8 + 7.52 = 98.32 → 98
```

**So the true maximum is about 98, and 95 is comfortably reachable.** No locked decision, no
platform limit and no single-author constraint caps this review. That makes it unusual in this
campaign, and it is worth stating plainly why: **the machine surface is built the right way.**
One catalogue, one forwarding seam, one gate re-checked per call, machine-checked against the
real routes. Everything I am still charging is either a sentence in a document or a
four-line catch.

**The honest caveat on that 98.** Dimension 3 reaching 100 through documentation rather than
tools is the rubric's own rule ("documented exclusions are removed from the denominator,
never counted as misses"), and it is the right rule — an absence with a stated security
reason is a decision, not a gap. But it means a reader should not read 100 as "a machine can
do everything the UI can". It cannot, and should not. Seventeen doors would stay closed;
they would simply be closed **on purpose and in writing**, which is the whole difference this
review measures.

**Ship gate:** no unresolved security-equivalence findings and no high-severity divergences.
**Proceed.** R3-B is the one I would fix before the next agent-heavy release — not because it
is dangerous, but because a step row that spins forever is the kind of thing a user reports
as "the assistant froze", and the cause would take an hour to find.
