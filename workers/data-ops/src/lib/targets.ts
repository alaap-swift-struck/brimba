// The code side of the import catalog: which tables an import may write into, and
// HOW each row is written. The GLOBAL importable_databases table (owner-maintained)
// holds the catalog data the UI/agent see; this map holds the bits that are code —
// the permission module gated on, and the gated create endpoint each row is POSTed
// to (act-as-user). A table is importable ONLY if it appears here AND is active in
// the catalog. Locked for now (owner's call): member roles + learning content only.

import type { ImportColumn } from "../../../../shared/types"

export type { ImportColumn }

/** A cross-target foreign key: OUR `column` (a natural key in the file) points at
 * another `target`, matched against that parent's `by` natural key. `mode:"id"`
 * injects the parent's NEW id into buildBody's `refs`; `mode:"value"` keeps the
 * string (ordering just guarantees the parent exists first). See AGENTIC-IMPORT §4. */
export type ReferenceDef = {
  column: string
  target: string
  by: string
  mode: "id" | "value"
  onMissing: "reject" | "blank" | "create"
}

export type TargetDef = {
  tableKey: string
  /** the permission module the caller must hold `create` on (import has no own key). */
  module: string
  displayName: string
  description: string
  columns: ImportColumn[]
  /** the gated create endpoint each mapped row is written through (act-as-user). */
  endpoint: { binding: "CONTENT" | "TENANCY"; path: string }
  /** shape one mapped row into that endpoint's body. `refs` carries any resolved
   * parent ids (mode:"id" references) — existing single-key targets ignore it. */
  buildBody: (row: Record<string, string>, refs?: Record<string, string>) => Record<string, unknown>
  /** cross-target foreign keys this target's rows carry (drives import order). */
  references?: ReferenceDef[]
  /** the column that identifies a row so a CHILD can resolve to it by natural key. */
  naturalKey?: string
  /** ONLY needed for a target that is referenced by a `mode:"id"` child: how to read
   * back its rows to build naturalKey→newId after import. Base targets omit it (the
   * base's one dependency is value-mode); an app adds it to be an id-parent. */
  list?: { path: string; key: string; idField: string; nameField: string }
}

export const TARGETS: Record<string, TargetDef> = {
  // Dropdown values ("Selectable data") — the base's PARENT in the worked
  // multi-table demo: import these first, then learning articles reference them.
  selectable_data: {
    tableKey: "selectable_data",
    module: "selectable_data",
    displayName: "Dropdown values",
    description: "Add selectable dropdown values in bulk (e.g. Learning categories, Help types).",
    columns: [
      { key: "type", label: "Group", required: true },
      { key: "value", label: "Value", required: true },
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/selectable" },
    naturalKey: "value",
    buildBody: (r) => ({ type: r.type, value: r.value }),
  },
  member_roles: {
    tableKey: "member_roles",
    module: "member_roles",
    displayName: "Member roles",
    description: "Create team roles in bulk. Permissions stay off until set on the Roles screen.",
    columns: [
      { key: "title", label: "Role name", required: true },
      { key: "description", label: "Description", required: false },
    ],
    endpoint: { binding: "TENANCY", path: "/api/tenancy/roles" },
    naturalKey: "title",
    buildBody: (r) => ({ title: r.title, description: r.description ?? "" }),
  },
  learning: {
    tableKey: "learning",
    module: "learning",
    displayName: "Learning content",
    description: "Create how-to / learning items in bulk.",
    columns: [
      { key: "title", label: "Title", required: true },
      { key: "category", label: "Category", required: false },
      { key: "description", label: "Description", required: false },
      { key: "contentType", label: "Type", required: false },
      { key: "contentLink", label: "Link", required: false },
      { key: "body", label: "Body", required: false },
    ],
    endpoint: { binding: "CONTENT", path: "/api/content/learning" },
    naturalKey: "title",
    // The worked base dependency: a learning article's category is a Dropdown value.
    // mode:"value" (the endpoint auto-creates a missing category), so the reference's
    // job is ORDER — import dropdowns before articles so categories are canonical.
    references: [
      { column: "category", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ],
    buildBody: (r) => ({
      title: r.title,
      category: r.category || undefined,
      description: r.description || undefined,
      contentType: r.contentType || undefined,
      contentLink: r.contentLink || undefined,
      body: r.body || undefined,
    }),
  },
}

/** The default catalog rows the owner-only seed endpoint upserts (kept in sync with
 * TARGETS). New importable tables are added here AND given a TargetDef above. */
export const DEFAULT_CATALOG = Object.values(TARGETS).map((t) => ({
  tableKey: t.tableKey,
  displayName: t.displayName,
  description: t.description,
  columns: t.columns,
}))

/** Normalise a header / column name / natural key for fuzzy matching
 * ("Role Name" ≈ "role_name"; "Getting Started" ≈ "getting  started"). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Best-guess mapping target-column-key → source-header by matching the column key
 * or its label against the file's headers (case/space/punctuation-insensitive). */
export function autoMap(headers: string[], columns: ImportColumn[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of columns) {
    const want = [norm(col.key), norm(col.label)]
    const hit = headers.find((h) => want.includes(norm(h)))
    if (hit) map[col.key] = hit
  }
  return map
}
