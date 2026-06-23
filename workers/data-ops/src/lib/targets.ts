// The code side of the import catalog: which tables an import may write into, and
// HOW each row is written. The GLOBAL importable_databases table (owner-maintained)
// holds the catalog data the UI/agent see; this map holds the bits that are code —
// the permission module gated on, and the gated create endpoint each row is POSTed
// to (act-as-user). A table is importable ONLY if it appears here AND is active in
// the catalog. Locked for now (owner's call): member roles + learning content only.

export type ImportColumn = { key: string; label: string; required: boolean }

export type TargetDef = {
  tableKey: string
  /** the permission module the caller must hold `create` on (import has no own key). */
  module: string
  displayName: string
  description: string
  columns: ImportColumn[]
  /** the gated create endpoint each mapped row is written through (act-as-user). */
  endpoint: { binding: "CONTENT" | "TENANCY"; path: string }
  /** shape one mapped row (target-column-key → value) into that endpoint's body. */
  buildBody: (row: Record<string, string>) => Record<string, unknown>
}

export const TARGETS: Record<string, TargetDef> = {
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

/** Normalise a header / column name for fuzzy matching ("Role Name" ≈ "role_name"). */
function norm(s: string): string {
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
