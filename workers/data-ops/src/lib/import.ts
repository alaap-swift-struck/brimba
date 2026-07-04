// The import engine. A session moves through three stages against a catalog target:
//   1. file      — parse the uploaded CSV, auto-suggest a column mapping, build a
//                  preview (file_validated + extraction_complete).
//   2. mapping    — adjust the mapping, regenerate the preview.
//   3. confirm    — write each mapped row through the target's GATED create endpoint
//                   (act-as-user — the caller's cookie is forwarded), so every row
//                   respects the caller's permissions + the module's validation.
// Insert-only by design (add new rows; updating existing records is a later feature).
// Sessions live in the TEAM database (data_import_sessions); the catalog lives in
// the global core DB (importable_databases). Bulk write = ONE list-ping per table.

import { logActivity } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { GuardError, type Actor, type MemberGuard } from "../../../../shared/workers/gating"
import type { Env } from "../env"
import type { ImportColumn, ImportPreview } from "../../../../shared/types"
import { parseCsv } from "./csv"
import { autoMap, TARGETS, type TargetDef } from "./targets"

/** Hard cap on rows per import — keeps a single confirm bounded (each row is one
 * gated write). Larger files are rejected with a clear message. */
const MAX_IMPORT_ROWS = 1000
/** How many mapped rows the preview returns (the full set is still written). */
const PREVIEW_CAP = 50

export type CatalogTarget = {
  id: string
  tableKey: string
  displayName: string
  description: string | null
  requiredColumns: ImportColumn[]
}

export type ImportSessionSummary = {
  id: string
  tableKey: string
  tableName: string | null
  status: string
  fileValidated: boolean
  extractionComplete: boolean
  importComplete: boolean
  createdAt: string
}

type SessionRow = {
  id: string
  table_id: string
  table_name: string | null
  overall_status: string
  column_mapping_json: string | null
  extraction_response: string | null
  preview_json: string | null
  file_validated: number
  extraction_complete: number
  import_complete: number
  created_at: string
}

const SESSION_COLS =
  "id, table_id, table_name, overall_status, column_mapping_json, extraction_response, preview_json, file_validated, extraction_complete, import_complete, created_at"

function toSummary(r: SessionRow, tableKey: string): ImportSessionSummary {
  return {
    id: r.id,
    tableKey,
    tableName: r.table_name,
    status: r.overall_status,
    fileValidated: r.file_validated === 1,
    extractionComplete: r.extraction_complete === 1,
    importComplete: r.import_complete === 1,
    createdAt: r.created_at,
  }
}

/* ------------------------------ the catalog (core DB) ------------------------------ */

/** The active, code-supported import targets (catalog rows whose table_key has a
 * TargetDef and is active). Read from the global core DB. */
export async function getActiveCatalog(env: Env): Promise<CatalogTarget[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, table_key, display_name, description, required_columns_json FROM importable_databases WHERE is_active = 1"
  ).all<{
    id: string
    table_key: string
    display_name: string
    description: string | null
    required_columns_json: string | null
  }>()
  return (results ?? [])
    .filter((r) => TARGETS[r.table_key])
    .map((r) => ({
      id: r.id,
      tableKey: r.table_key,
      displayName: r.display_name,
      description: r.description,
      requiredColumns: TARGETS[r.table_key].columns,
    }))
}

async function catalogById(env: Env, id: string): Promise<CatalogTarget | null> {
  const row = await env.DB.prepare(
    "SELECT id, table_key, display_name, description FROM importable_databases WHERE id = ? AND is_active = 1"
  )
    .bind(id)
    .first<{ id: string; table_key: string; display_name: string; description: string | null }>()
  if (!row || !TARGETS[row.table_key]) return null
  return {
    id: row.id,
    tableKey: row.table_key,
    displayName: row.display_name,
    description: row.description,
    requiredColumns: TARGETS[row.table_key].columns,
  }
}

async function catalogByKey(env: Env, tableKey: string): Promise<CatalogTarget | null> {
  const row = await env.DB.prepare(
    "SELECT id, table_key, display_name, description FROM importable_databases WHERE table_key = ? AND is_active = 1"
  )
    .bind(tableKey)
    .first<{ id: string; table_key: string; display_name: string; description: string | null }>()
  if (!row || !TARGETS[row.table_key]) return null
  return {
    id: row.id,
    tableKey: row.table_key,
    displayName: row.display_name,
    description: row.description,
    requiredColumns: TARGETS[row.table_key].columns,
  }
}

/** Owner-only: upsert the default catalog rows (member roles + learning). Idempotent
 * — re-running refreshes display name / description / schema, never duplicates. */
export async function seedDefaultCatalog(
  env: Env,
  actor: Actor,
  defaults: { tableKey: string; displayName: string; description: string; columns: ImportColumn[] }[]
): Promise<number> {
  const now = new Date().toISOString()
  for (const d of defaults) {
    const cols = JSON.stringify(d.columns)
    await env.DB.prepare(
      `INSERT INTO importable_databases (id, table_key, display_name, description, required_columns_json, is_active, created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(table_key) DO UPDATE SET
         display_name = excluded.display_name,
         description = excluded.description,
         required_columns_json = excluded.required_columns_json,
         is_active = 1,
         updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?`
    )
      .bind(
        ulid(), d.tableKey, d.displayName, d.description, cols, now, actor.id, actor.email, actor.name,
        now, actor.id, actor.email, actor.name
      )
      .run()
  }
  return defaults.length
}

/* ------------------------------ sessions (team DB) ------------------------------ */

async function loadSession(cfg: D1Rest, guard: MemberGuard, id: string): Promise<SessionRow> {
  // Creator-scoped (like agent threads): a session belongs to the member who started
  // it — another member can't resume, read, or confirm it even with the same create
  // right. The 404 covers both "missing" and "not yours" without leaking existence.
  const rows = await d1Query<SessionRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SESSION_COLS} FROM data_import_sessions WHERE id = ? AND creator_id = ?`,
    [id, guard.userId]
  )
  if (!rows[0]) throw new GuardError(404, "session_not_found", "That import session doesn't exist.")
  return rows[0]
}

/** Resolve the catalog target + its code TargetDef for a session (or throw). */
export async function targetForSession(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{ row: SessionRow; catalog: CatalogTarget; target: TargetDef }> {
  const row = await loadSession(cfg, guard, id)
  const catalog = await catalogById(env, row.table_id)
  if (!catalog) throw new GuardError(409, "target_unavailable", "That import target is no longer available.")
  return { row, catalog, target: TARGETS[catalog.tableKey] }
}

/** Resolve a target by table_key for starting a session (or throw). */
export async function startSession(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  tableKey: string
): Promise<{ summary: ImportSessionSummary; catalog: CatalogTarget }> {
  const catalog = await catalogByKey(env, tableKey)
  if (!catalog) throw new GuardError(400, "invalid_target", "That isn't an importable target.")
  const target = TARGETS[catalog.tableKey]
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO data_import_sessions (id, table_id, table_name, required_columns_json, overall_status, file_validated, extraction_complete, import_initiated, import_complete, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(catalog.id)}, ${sqlString(catalog.displayName)}, ${sqlString(JSON.stringify(target.columns))}, 'started', 0, 0, 0, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  const row = await loadSession(cfg, guard, id)
  return { summary: toSummary(row, catalog.tableKey), catalog }
}

/* ------------------------------ parse → map → preview ------------------------------ */

function buildPreview(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
  columns: ImportColumn[]
): ImportPreview {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i
  })
  const issues: string[] = []
  for (const col of columns) {
    if (col.required && !mapping[col.key]) issues.push(`Required column "${col.label}" isn't mapped to a file column.`)
  }
  const mapped = rows.map((r) => {
    const o: Record<string, string> = {}
    for (const col of columns) {
      const src = mapping[col.key]
      o[col.key] = src != null && idx[src] != null ? (r[idx[src]] ?? "").trim() : ""
    }
    return o
  })
  let missing = 0
  for (const m of mapped) {
    if (columns.some((c) => c.required && !m[c.key])) missing++
  }
  if (missing) issues.push(`${missing} row(s) are missing a required value and will be skipped.`)
  return {
    columns,
    rows: mapped.slice(0, PREVIEW_CAP),
    totalCount: mapped.length,
    issues,
  }
}

async function storePreview(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  mapping: Record<string, string>,
  preview: ImportPreview,
  extra: string
): Promise<void> {
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_sessions SET column_mapping_json = ${sqlString(JSON.stringify(mapping))}, preview_json = ${sqlString(JSON.stringify(preview))}, ${extra} overall_status = 'previewed', updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
  )
}

/** Stage 1+2 folded: parse the CSV, auto-map columns, build + store the preview. */
export async function applyFile(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  fileName: string,
  csvText: string
): Promise<{ summary: ImportSessionSummary; preview: ImportPreview }> {
  const { target } = await targetForSession(env, cfg, guard, id)
  const parsed = parseCsv(csvText)
  if (!parsed.headers.length)
    throw new GuardError(400, "empty_file", "That file has no readable columns. Export it as CSV and try again.")
  if (parsed.rows.length > MAX_IMPORT_ROWS)
    throw new GuardError(400, "too_many_rows", `Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.`)
  const mapping = autoMap(parsed.headers, target.columns)
  const preview = buildPreview(parsed.headers, parsed.rows, mapping, target.columns)
  await storePreview(
    cfg,
    guard,
    id,
    mapping,
    preview,
    `extraction_response = ${sqlString(JSON.stringify(parsed))}, uploaded_file_url = ${sqlString(fileName || null)}, file_validated = 1, extraction_complete = 1,`
  )
  const row = await loadSession(cfg, guard, id)
  return { summary: toSummary(row, target.tableKey), preview }
}

/** Stage 2: re-map an already-uploaded file and regenerate the preview. */
export async function applyMapping(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  mapping: Record<string, string>
): Promise<{ summary: ImportSessionSummary; preview: ImportPreview }> {
  const { row, target } = await targetForSession(env, cfg, guard, id)
  if (!row.extraction_response)
    throw new GuardError(409, "no_file", "Upload a file before changing the mapping.")
  const parsed = JSON.parse(row.extraction_response) as { headers: string[]; rows: string[][] }
  // Only keep mappings that point at real headers + known columns (untrusted input).
  const clean: Record<string, string> = {}
  for (const col of target.columns) {
    const src = mapping[col.key]
    if (typeof src === "string" && parsed.headers.includes(src)) clean[col.key] = src
  }
  const preview = buildPreview(parsed.headers, parsed.rows, clean, target.columns)
  await storePreview(cfg, guard, id, clean, preview, "")
  const updated = await loadSession(cfg, guard, id)
  return { summary: toSummary(updated, target.tableKey), preview }
}

export async function getSessionView(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{ summary: ImportSessionSummary; preview: ImportPreview | null; columns: ImportColumn[] }> {
  const { row, target } = await targetForSession(env, cfg, guard, id)
  const preview = row.preview_json ? (JSON.parse(row.preview_json) as ImportPreview) : null
  return { summary: toSummary(row, target.tableKey), preview, columns: target.columns }
}

/* ------------------------------ stage 3: confirm + write ------------------------------ */

export type ImportResult = { created: number; skipped: number; failed: number; errors: string[] }

/** Write one mapped row through the target's gated create endpoint, AS the caller
 * (the original request's cookie is forwarded — the create endpoint re-checks the
 * caller's permission + validates the row). Shared with the batch engine. */
export async function writeRow(
  env: Env,
  request: Request,
  target: TargetDef,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const fetcher = target.endpoint.binding === "CONTENT" ? env.CONTENT : env.TENANCY
  const res = await fetcher.fetch(`https://internal${target.endpoint.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: request.headers.get("Cookie") ?? "" },
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true }
  let error = `Couldn't add a row (HTTP ${res.status}).`
  try {
    const j = (await res.json()) as { message?: string }
    if (j?.message) error = j.message
  } catch {
    /* keep the default */
  }
  return { ok: false, error }
}

/** Stage 3: write every mapped row (insert-only), skipping rows missing a required
 * value. Marks the session complete and returns a tally. The caller publishes ONE
 * list-ping for the affected table afterwards (bulk = one ping, not per row). */
export async function confirmImport(
  env: Env,
  request: Request,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string
): Promise<{ result: ImportResult; summary: ImportSessionSummary; tableKey: string }> {
  const { row, target } = await targetForSession(env, cfg, guard, id)
  if (row.import_complete === 1)
    throw new GuardError(409, "already_imported", "This import has already been run.")
  if (!row.extraction_response)
    throw new GuardError(409, "no_file", "Upload a file before importing.")

  const parsed = JSON.parse(row.extraction_response) as { headers: string[]; rows: string[][] }
  if (parsed.rows.length > MAX_IMPORT_ROWS)
    throw new GuardError(400, "too_many_rows", `Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.`)
  const mapping = (row.column_mapping_json ? JSON.parse(row.column_mapping_json) : {}) as Record<string, string>
  for (const col of target.columns) {
    if (col.required && !mapping[col.key])
      throw new GuardError(400, "unmapped_required", `Map the required "${col.label}" column before importing.`)
  }

  const idx: Record<string, number> = {}
  parsed.headers.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i
  })
  const result: ImportResult = { created: 0, skipped: 0, failed: 0, errors: [] }
  for (const r of parsed.rows) {
    const mappedRow: Record<string, string> = {}
    for (const col of target.columns) {
      const src = mapping[col.key]
      mappedRow[col.key] = src != null && idx[src] != null ? (r[idx[src]] ?? "").trim() : ""
    }
    if (target.columns.some((c) => c.required && !mappedRow[c.key])) {
      result.skipped++
      continue
    }
    const out = await writeRow(env, request, target, target.buildBody(mappedRow))
    if (out.ok) result.created++
    else {
      result.failed++
      if (out.error && result.errors.length < 5) result.errors.push(out.error)
    }
  }

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE data_import_sessions SET import_initiated = 1, import_complete = 1, import_response_code = 200, import_response = ${sqlString(JSON.stringify(result))}, completed_at = ${sqlString(now)}, overall_status = 'complete', updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Data imported",
    description: `${actor.name} imported ${result.created} ${target.displayName.toLowerCase()} row(s)`,
    relatedTable: target.tableKey,
    relatedRowId: id,
  })

  const updated = await loadSession(cfg, guard, id)
  return { result, summary: toSummary(updated, target.tableKey), tableKey: target.tableKey }
}
