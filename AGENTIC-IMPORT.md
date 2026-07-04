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

1. **Upload** — one or many files into a **batch**. XLSX is converted to CSV
   **client-side** (the wizard) before upload; the worker only ever sees CSV text.
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
products:  { naturalKey: "sku", columns: [{key:"sku",required:true},{key:"name",required:true}], … }
locations: { naturalKey: "code", … }
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

## 8 · Degrade gracefully (no key = still works)

When `ANTHROPIC_API_KEY` is unset, the analyze step falls back to the deterministic
planner: fuzzy `autoMap` per file + target detection by matching a file's headers
to each target's required columns + the declared `references`/order. Less clever at
messy real-world headers, but the base still imports — the model makes it *better*,
it isn't a hard dependency (mirrors the chat agent's Workers-AI fallback).

---

## 9 · Build phases

1. **v1 (this milestone):** batch table + endpoints, the agent analyze/plan step
   (metered, JSON out over the model seam, deterministic fallback), ordered
   execution with **both** reference modes, the `dropdowns → learning` base demo,
   the upgraded wizard (multi-file → plan review → run → report), tests
   (planner + resolver + the seam), docs. **← delivered together, per the owner.**
2. **Next:** update-on-import (match-and-update existing rows by natural key),
   scheduled/recurring imports, and the MCP `import` tool so an external system can
   push a batch programmatically (rides the same plan/confirm contract).
