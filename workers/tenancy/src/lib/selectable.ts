// Dropdown values ("Selectable data") module — the per-team dropdown VALUES,
// grouped by TYPE (e.g. "File type" → Image file / Video link…), in the team's
// OWN database. Admins manage them so the Learning-category / Help-type pickers
// stay theirs to shape. Deactivate-only (ARCHITECTURE §4): a removed value is
// retired, never hard-deleted, so old rows that referenced it stay truthful.

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { SelectableValue } from "../../../../shared/types"
import { GuardError, type MemberGuard } from "./permissions"

type Row = { id: string; type: string; value: string; is_default: number }

function toValue(r: Row): SelectableValue {
  return { id: r.id, type: r.type, value: r.value, isDefault: r.is_default === 1 }
}

/** Every ACTIVE dropdown value in the team, ordered by type then value (the UI
 * groups by `type`). Deactivated values drop out, exactly like a retired role. */
export async function listSelectable(cfg: D1Rest, guard: MemberGuard): Promise<SelectableValue[]> {
  const rows = await d1Query<Row>(
    cfg,
    guard.databaseId,
    "SELECT id, type, value, is_default FROM selectable_data WHERE deactivated_at IS NULL ORDER BY type ASC, value ASC",
    []
  )
  return rows.map(toValue)
}

/** Add a value to a type group (pick-or-create the type by name). Rejects empty
 * input and an exact (type,value) that's already active. Returns the new id. */
/** Export-only reader: every value's full row (type, value, active + audit block). */
export type SelectableExportRow = {
  type: string
  value: string
  is_default: number
  deactivated_at: string | null
  created_at: string | null
  creator_name: string | null
}
export async function listSelectableForExport(cfg: D1Rest, guard: MemberGuard): Promise<SelectableExportRow[]> {
  return d1Query<SelectableExportRow>(
    cfg,
    guard.databaseId,
    "SELECT type, value, is_default, deactivated_at, created_at, creator_name FROM selectable_data ORDER BY type ASC, value ASC"
  )
}

export async function createSelectable(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  type: string,
  value: string
): Promise<string> {
  const t = type.trim()
  const v = value.trim()
  if (!t || !v)
    throw new GuardError(400, "invalid_input", "A dropdown value needs a type and a value.")

  const dup = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM selectable_data WHERE type = ? AND value = ? AND deactivated_at IS NULL",
    [t, v]
  )
  if (dup[0]) throw new GuardError(409, "duplicate", `"${v}" is already in ${t}.`)

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, ${sqlString(t)}, ${sqlString(v)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Dropdown value created",
    description: `${actor.name} added "${v}" to ${t}`,
    relatedTable: "selectable_data",
    relatedRowId: id,
  })
  return id
}

/** Rename a value (its type/group stays). Needs a non-empty value. */
export async function updateSelectable(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  value: string
): Promise<void> {
  const v = value.trim()
  if (!v) throw new GuardError(400, "invalid_input", "A dropdown value can't be empty.")

  const rows = await d1Query<Row>(
    cfg,
    guard.databaseId,
    "SELECT id, type, value, is_default FROM selectable_data WHERE id = ? AND deactivated_at IS NULL",
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "not_found", "That dropdown value doesn't exist.")

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE selectable_data SET value = ${sqlString(v)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Dropdown value edited",
    description: `${actor.name} renamed a ${row.type} value: "${row.value}" → "${v}"`,
    relatedTable: "selectable_data",
    relatedRowId: id,
  })
}

/** Deactivate / reactivate a value (deactivate-only model — never hard-deleted). */
export async function setSelectableActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<void> {
  const rows = await d1Query<Row>(
    cfg,
    guard.databaseId,
    "SELECT id, type, value, is_default FROM selectable_data WHERE id = ?",
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "not_found", "That dropdown value doesn't exist.")

  const now = new Date().toISOString()
  const sql = active
    ? `UPDATE selectable_data SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
    : `UPDATE selectable_data SET deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  await d1ExecScript(cfg, guard.databaseId, sql)

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Dropdown value activated" : "Dropdown value deactivated",
    description: `${actor.name} ${active ? "restored" : "removed"} the "${row.value}" ${row.type} value`,
    relatedTable: "selectable_data",
    relatedRowId: id,
  })
}
