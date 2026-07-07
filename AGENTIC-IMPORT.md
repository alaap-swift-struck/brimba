# AGENTIC-IMPORT.md — agent-driven, multi-table data import (LOCKED 2026-07-04)

The vision, in one line: **a user dumps their old system's exports (CSV/XLSX) and
Brimba ingests them** — the agent normalizes the data, maps their columns onto our
fields, orders interdependent tables, resolves foreign keys, rejects what it
honestly can't, and writes every row **through the same gated door a person uses**
so the audit trail is identical. No weeks of manual re-entry.

This is a **base capability**: every app built on Brimba (an ERP with
products → locations → inventory, a portal with clients → matters → documents)
inherits it by declaring its targets. This doc is the locked contract.

> Read alongside: BUILD-A-MODULE.md (how a module declares an import target),
> CACHING.md (bulk = one list-ping), CONCURRENCY.md (insert-only, natural-key
> dedupe), EDGE-CASES.md (act-as-user round-trips), DATA-MODEL.md
> (`data_import_batches`, `data_import_sessions`).

---

## 1 · The non-negotiables (why agentic, not "dump into a table")

- **Audit parity.** Every imported row is written through the module's **gated
  create endpoint, act-as-user** (the caller's cookie is forwarded). So it gets
  the *same* activity log, audit block (creator id/email/name + timestamp), live
  ping, and validation as if the person typed it in the UI. A raw `INSERT` would
  skip all of that — which is exactly why we don't do it. This property already
  holds in the single-table importer and is preserved here.
- **Never exceed the caller's rights.** Import into a target needs `create` on
  that target's module (import has no permission key of its own). The agent is the
  invoker — it can't import what the invoker couldn't create by hand.
- **Team-bound both directions.** Import writes only into the caller's own team
  database (`teamContext` → their `databaseId`); export reads only from it.
- **Honest rejections.** A required field that can't be normalized or a reference
  that can't resolve → the row is **rejected with a reason**, never silently
  dropped or half-written. The user gets a per-row report.
- **One confirm, not per row.** The user reviews **one plan** and confirms once;
  execution runs the whole ordered graph. (Bounded model spend — see §6.)
- **Insert-only.** Import adds rows; it never updates or deletes existing records
  (that's a separate, later feature). Re-running a completed batch is refused.

---

## 2 · The shape of an import (the flow)

```
upload N files ─▶ AGENT ANALYZES ─▶ PLAN (review) ─▶ one confirm ─▶ ORDERED RUN ─▶ per-row REPORT
   (CSV/XLSX)     (map+normalize+       (you see it        (metered)   (parents first,   (created/
                   detect refs+order)    before it runs)                FK-resolved)      skipped/failed
                                                                                          + reasons)
```

1. **Upload** — one or many files into a **batch**. `.xlsx` is converted to CSV
   **client-side** by Brimba's own zero-dependency reader (`web/lib/xlsx-to-csv.ts`:
   hand-parsed ZIP + browser-native `DecompressionStream` + DOMParser — SheetJS was
   never bundled, its npm build carries a HIGH advisory); first sheet only, no
   formulas evaluated, date cells arrive as Excel serial numbers. The worker only
   ever sees CSV text. Legacy `.xls` asks for a Save-As.
2. **Analyze (agentic, metered).** The agent reads each file's headers + a small
   sample of rows and, against the catalog, produces a **plan**: which target each
   file feeds, the column **mapping** (their header → our field), deterministic
   **normalization rules** per column (trim, title-case, parse-date-to-ISO,
   yes/no→boolean, …), the **references** between targets, the **dependency order**
   (parents before children), and a **prediction** of which rows will be rejected
   and why. Bounded to a few model calls (§6), never one per row.
3. **Review the plan.** The user sees the whole plan — order, mappings,
   normalizations, reference resolutions, and the predicted rejections — and can
   nudge a mapping before running. This is the single point of confirmation.
4. **Run (ordered).** Execute targets in dependency order. For each row: apply the
   normalization rules (deterministic — no per-row model call), resolve any
   references (§4), and if a required value is present and valid, write it through
   the gated create endpoint. Capture each new row's natural-key → new-id so a
   downstream child can resolve to it. A row missing a required value or an
   unresolvable required reference is **rejected with its reason**.
5. **Report.** `{ created, skipped, failed, rejections: [{file, row, reason}] }`
   per target, downloadable as a CSV of the rejected rows so the user can fix and
   re-run just those.

---

### 2.5 · The plan tells the truth (one scan backs plan AND run)

The plan is not a hope — it is a **prediction the run is bound to**. One pure pass,
`scanRows` (import-plan.ts), maps + normalizes every row and decides rejections
(missing required value; an exact duplicate of an earlier row in the same file —
same required values — is skipped, importing the first). `planStep` runs that scan
at plan time and stores the predicted rejections (row + reason, capped at 200 —
the count stays exact); `confirmBatch` runs the SAME scan at execution. Same
checks, same wording — the review screen can never promise something the run
won't do. The review shows per-step reasons, a bottom big-number strip (will
import / will be skipped / columns not in your files) and a **downloadable
fix-list before anything runs**. Database-level conflicts (e.g. a dropdown value
that already exists in the team) still surface at run time as honest per-row
failures from the gated endpoint itself.

## 3 · The catalog + declaring a target (how an app plugs in)

An importable target is one entry in `TARGETS` (`workers/data-ops/src/lib/targets.ts`)
plus an active catalog row (`importable_databases`, seeded). A target declares:

```ts
type TargetDef = {
  tableKey: string
  module: string                               // create-right gated on
  displayName: string
  description: string
  columns: ImportColumn[]                       // our fields (key, label, required)
  endpoint: { binding: "CONTENT" | "TENANCY"; path: string }   // the gated create door
  buildBody: (row, refs) => Record<string, unknown>            // shape one row (refs = resolved ids)
  references?: ReferenceDef[]                    // NEW — cross-target foreign keys
  naturalKey?: string                           // NEW — the column that identifies a row for FK resolution
  list?: { path; key; idField; nameField }      // NEW — ONLY on a target referenced by mode:"id":
                                                //   how to read its rows back (naturalKey→newId) after import
}

type ReferenceDef = {
  column: string          // OUR column that holds the reference (a natural key in the file)
  target: string          // the tableKey it points at
  by: string              // the parent's naturalKey the value matches (e.g. product "name")
  mode: "id" | "value"    // "id": inject the parent's NEW id into buildBody;
                          // "value": keep the string, ordering just guarantees the parent exists
  onMissing: "reject" | "blank" | "create"      // required-unresolved → reject; optional → blank; auto-create
}
```

**The base ships one worked dependency: Dropdown values → Learning.** A learning
article's `category` references a **Selectable data** value of type
"Learning category". Import a dropdowns file + a learning file together and the
agent orders **dropdowns first**, imports them, then imports the articles whose
`category` now matches the values that exist (mode `"value"`, `onMissing: "create"`
— learning's endpoint auto-creates a missing category, so nothing is lost either
way; the ordering makes the values canonical rather than accidental). This proves
multi-file batching, dependency ordering, and reference resolution **inside the
base**, with no emails fired and no destructive surface.

**The canonical `id`-mode example (for your next app): products → inventory.**

```ts
// A mode:"id" PARENT must declare `list` so the engine can read its new rows back
// (naturalKey→newId) — omit it and every child row rejects ("no product matches …").
products:  { naturalKey: "sku",  list: { path:"/api/…/products",  key:"products",  idField:"id", nameField:"sku"  }, columns: [{key:"sku",required:true},{key:"name",required:true}], … }
locations: { naturalKey: "code", list: { path:"/api/…/locations", key:"locations", idField:"id", nameField:"code" }, … }
inventory: {
  columns: [{key:"product",required:true},{key:"location",required:true},{key:"qty",required:true}],
  references: [
    { column:"product",  target:"products",  by:"sku",  mode:"id", onMissing:"reject" },
    { column:"location", target:"locations", by:"code", mode:"id", onMissing:"reject" },
  ],
  buildBody: (row, refs) => ({ productId: refs.product, locationId: refs.location, qty: Number(row.qty) }),
}
```

The agent orders `products, locations, inventory`; imports products (capturing
`sku → new productId`) and locations (`code → new locationId`); then for each
inventory row resolves its `product`/`location` natural keys to the new ids and
injects them via `refs`. An inventory row whose product SKU wasn't in the products
file is **rejected** ("no product matches SKU X"), never written half-formed.

---

**Extra field — `exportPath`.** A target that also has a full-field CSV export door
declares it (`exportPath: "/api/tenancy/roles/export"`). Export = the READ right;
import = CREATE. The agent's capability brief (Law R9) is generated from this same
catalog, so declaring it here is what makes the assistant KNOW the table can be
exported.

**The worked matrix case — member roles.** The roles export flattens the permission
matrix to one `<module>.<right>` yes/no column each (built from
`shared/team-modules.ts`, the ONE module list). The member_roles import target
declares the same 32 optional columns, so an exported roles file imports straight
back (**export ↔ import round-trip**) — and a hand-made file can carry permissions
too (the sample shows the pattern). A row WITH matrix cells creates the role AND
sets its matrix (the create door then demands create **and** edit — the same gate
the Roles screen's matrix editor goes through); a row without stays a plain create
with permissions off.

## 4 · Reference resolution (the hard part, made deterministic)

Model calls happen only in **analysis** (planning). Execution is deterministic:

- After importing target `T` (parents first), build `resolved[T]: Map<naturalKey, newId>`
  from the rows T actually created (the create endpoint returns the new id).
- For a child row with a `ReferenceDef { column, target, by, mode }`:
  - look up `resolved[target].get(normalize(row[column]))`.
  - **`mode:"id"`** → put the found id into the `refs` object passed to `buildBody`.
    Not found + required (`onMissing:"reject"`) → reject the row with the reason.
  - **`mode:"value"`** → leave the string; ordering guaranteed the parent exists.
    `onMissing:"create"` → the child's own endpoint creates it (learning/category).
- Natural keys are matched **normalized** (trim + casefold + collapse spaces) so
  "Getting Started" == "getting  started". Same `norm()` the column auto-mapper uses.

Cycles are impossible to run: the planner topologically sorts targets; a cycle (A
refs B refs A) is flagged in the plan as an error, not executed.

---

## 5 · What the agent decides vs what code enforces

| The AGENT proposes (in the plan, reviewable) | CODE enforces (non-negotiable) |
|---|---|
| Which target each file feeds | The target must be in the catalog + have `create` right |
| Column mapping (their header → our field) | Only real headers → known columns are accepted |
| Normalization rules per column | Applied deterministically; a bad rule can't run code |
| The dependency order | Topologically re-checked; cycles refused |
| Which rows it predicts will reject | Actual rejection is decided at write time by the gated endpoint's own validation |

The plan is a **proposal the user confirms**; the server re-derives and re-gates
everything at execution. The agent can't make the import exceed the caller's rights
or skip validation — same safety model as the chat agent.

---

## 6 · Cost, metering, limits

- **Metered on the team's AI credit pool** (same as chat — DATA-MODEL `agent_usage`
  / `agent_credits`). Analysis is a **few** model calls per batch (roughly one per
  file to map/normalize + one to order the graph), **never per row**, so a typical
  import costs ~3–8 credits and shows up in the usage "why" view. Out of credits →
  the analyze step is blocked with the normal message; a plan already made can
  still be run.
- **Row cap** stays (per target) — a single confirm is bounded; oversized files are
  rejected with a clear message. **Files per batch** capped too.
- **No model call touches user data at write time** — execution is deterministic,
  so a huge file doesn't multiply model spend.

---

## 7 · Data model + endpoints (additive)

- **`data_import_batches`** (team DB, migration `0006_import_batches`): `id`,
  `status` (`draft` → `analyzing` → `planned` → `running` → `complete`),
  `plan_json`, `report_json`, the audit block, creator-scoped (like sessions).
  Files + the plan + the report live here as JSON; per-file parse reuses the
  existing session parser.
- **Endpoints** (`/api/data-ops/import/batch*`, gated per-target `create` at write
  time; the batch shell is gated on `import`-capability = holding `create` on at
  least one catalog target):
  - `POST …/batch` — start a batch.
  - `POST …/batch/file` `{batchId, name, csvText}` — add a parsed file.
  - `POST …/batch/plan` `{batchId}` — agent analyzes → stores + returns the plan. **Metered.**
  - `POST …/batch/confirm` `{batchId}` — ordered execution → stores + returns the report.
  - `GET …/batch?id=` — read plan + report (wizard rehydrate).
- The **single-target** importer (`/api/data-ops/import*`) stays for the simple
  case + backward compat; the wizard leads with the batch flow.

---

**Import history.** `GET /api/data-ops/import/batches` — the team's past import runs,
newest first (who, when, files → tables, totals). TEAM-visible summaries (any
signed-in member): the same altitude as the activity feed's "imported N rows" line —
row contents and rejection reasons stay on the creator-scoped batch. Shown as
"Past imports" on the Import screen.

## 8.5 · Import straight from the assistant chat

The user can also **attach CSV files in the assistant panel** (paperclip or drop).
The files go straight into the SAME batch engine — never into the model prompt
(injection-safe by construction): the app creates + plans the batch (metered one AI
unit, exactly like the wizard's plan step), then hands the model a compact
`ATTACHED-IMPORT-PLAN` block (tables, counts, what will be skipped and why, the
batchId). The model presents the plan in a sentence and proposes
`run_import_batch` — a `binding:"SELF"` tool that runs inside data-ops: its handler
re-opens `teamContext` from the same request (act-as-user), re-gates `create` on
every target module, executes in dependency order, and publishes one ping per
changed module. It is `confirm:true` (writing a whole file is high-blast), so the
normal confirm panel shows first, and the batch is creator-scoped — the model can
never run someone else's import. Locked by `agent.test.ts` (a SELF tool must carry
a run handler; the runner must confirm) and by the Law R9 parity test (the brief
tells the agent this capability exists).

## 8 · Degrade gracefully (no key = still works)

When `ANTHROPIC_API_KEY` is unset, the analyze step falls back to the deterministic
planner: fuzzy `autoMap` per file + target detection by matching a file's headers
to each target's required columns + the declared `references`/order. Less clever at
messy real-world headers, but the base still imports — the model makes it *better*,
it isn't a hard dependency (mirrors the chat agent's Workers-AI fallback).

---

## 10 · Every import place shows a sample (enforceable)

**Rule:** wherever a user can import, they can first **download a sample file** that
shows a good file for that table. So no one guesses the format — they see it. This is
automatic: the sample is built from the target's own `columns` (header = the labels,
one example row from the target's optional `sample` map; a REQUIRED column with no
example falls back to `Example <label>`, an optional one stays **empty** — a good file
doesn't have to fill every column), served by
`GET /api/data-ops/import/sample?tableKey=X` and offered in the wizard as a
"Download a sample" link. **Arriving from a specific tab** (Roles → Import,
Dropdown values → Import…) shows ONLY that table's sample — the one the user came to
import; the generic Import screen shows all. Locked by
`workers/data-ops/test/import-plan.test.ts`: every `TARGETS` entry yields a sample,
every required cell carries an example, and **every sample must itself import
cleanly** (a sample that would be rejected is a broken sample). When you add an import
target (BUILD-A-MODULE), give it a nice `sample` row; a missing one still works. The
sample uses the import format (labels + one row) so it round-trips straight back
through the importer.

## 9 · Build phases

1. **v1 (this milestone):** batch table + endpoints, the agent analyze/plan step
   (metered, JSON out over the model seam, deterministic fallback), ordered
   execution with **both** reference modes, the `dropdowns → learning` base demo,
   the upgraded wizard (multi-file → plan review → run → report), tests
   (planner + resolver + the seam), docs. **← delivered together, per the owner.**
2. **Next:** update-on-import (match-and-update existing rows by natural key),
   scheduled/recurring imports, and the MCP `import` tool so an external system can
   push a batch programmatically (rides the same plan/confirm contract).
