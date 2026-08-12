// Dropdown-values routes ("Selectable data"): list the team's values, add one,
// rename one, deactivate/reactivate one. Gated by the `selectable_data` module
// (read to view, create/edit/delete to manage). Each mutation broadcasts a live
// change ping (the publish-seam test enforces this).

import { fail, json } from "../../../../shared/workers/http"
import { boundExport, csvResponse, toCsv } from "../../../../shared/workers/csv"
import { EXPORT_HARD_CAP } from "../../../../shared/workers/limits"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { gated, gatedBody } from "../../../../shared/workers/route"
import {
  createSelectable,
  listSelectable,
  oneSelectable,
  setSelectableActive,
  updateSelectable,
  listSelectableForExport,
  countSelectable,
} from "../lib/selectable"
import type { Env } from "../env"

export async function getSelectable(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "selectable_data", "read")
  const values = await listSelectable(cfg, guard)
  const id = new URL(request.url).searchParams.get("id") // ?id= → one value (row-level live re-pull)
  return json({ values: id ? values.filter((v) => v.id === id) : values, total: await countSelectable(cfg, guard) })
}

/** GET /api/tenancy/selectable/export — the team's dropdown values as a full-field
 * CSV (EXPORT NEEDS READ; team-bound). Columns lead with the import format
 * (type, value) so the file round-trips through the CSV importer. */
export async function getSelectableExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "selectable_data", "read")
  const all = await listSelectableForExport(cfg, guard)
  const { rows, truncated } = await boundExport(all, EXPORT_HARD_CAP, () => countSelectable(cfg, guard))
  const csv = toCsv(
    ["type", "value", "active", "created_at", "created_by"],
    rows.map((r) => [r.type, r.value, r.deactivated_at == null, r.created_at, r.creator_name])
  )
  return csvResponse("dropdown-values.csv", csv, truncated)
}

export async function postCreateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ type?: string; value?: string }>(request, env, "selectable_data", "create")
  const type = requireText(body.type, "Group", TEXT_LIMITS.short)
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  const id = await createSelectable(cfg, guard, actor, type, value)
  // Row-level: carry the new value's id so open lists can patch just that row.
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", id, "add")
  // R21: the CREATED ROW, not the collection.
  return json({ created: await oneSelectable(cfg, guard, id), total: await countSelectable(cfg, guard) })
}

export async function postUpdateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; value?: string; expectedVersion?: string }>(request, env, "selectable_data", "edit")
  if (!body.id) return fail(400, "invalid_input", "id and value are required.")
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  await updateSelectable(cfg, guard, actor, body.id, value, body.expectedVersion)
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id)
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneSelectable(cfg, guard, body.id) })
}

export async function postSetSelectableActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; active?: boolean }>(request, env, "selectable_data", "delete")
  if (!body.id || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  // R17: no-op repeat → no ping, no duplicate history (see setSelectableActive).
  const changed = await setSelectableActive(cfg, guard, actor, body.id, body.active)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id)
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneSelectable(cfg, guard, body.id) })
}
