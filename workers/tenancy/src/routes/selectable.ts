// Dropdown-values routes ("Selectable data"): list the team's values, add one,
// rename one, deactivate/reactivate one. Gated by the `selectable_data` module
// (read to view, create/edit/delete to manage). Each mutation broadcasts a live
// change ping (the publish-seam test enforces this).

import { fail, json } from "../../../../shared/workers/http"
import { csvResponse, toCsv } from "../../../../shared/workers/csv"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { requireRight } from "../lib/permissions"
import {
  createSelectable,
  listSelectable,
  setSelectableActive,
  updateSelectable,
  listSelectableForExport,
} from "../lib/selectable"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getSelectable(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "read")
  return json({ values: await listSelectable(cfg, guard) })
}

/** GET /api/tenancy/selectable/export — the team's dropdown values as a full-field
 * CSV (EXPORT NEEDS READ; team-bound). Columns lead with the import format
 * (type, value) so the file round-trips through the CSV importer. */
export async function getSelectableExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "read")
  const rows = await listSelectableForExport(cfg, guard)
  const csv = toCsv(
    ["type", "value", "active", "created_at", "created_by"],
    rows.map((r) => [r.type, r.value, r.deactivated_at == null, r.created_at, r.creator_name])
  )
  return csvResponse("dropdown-values.csv", csv)
}

export async function postCreateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "create")
  const body = (await request.json().catch(() => ({}))) as { type?: string; value?: string }
  const type = requireText(body.type, "Group", TEXT_LIMITS.short)
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  const id = await createSelectable(cfg, guard, actor, type, value)
  // Row-level: carry the new value's id so open lists can patch just that row.
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", id, "add")
  return json({ values: await listSelectable(cfg, guard) })
}

export async function postUpdateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "edit")
  const body = (await request.json().catch(() => ({}))) as { id?: string; value?: string }
  if (!body.id) return fail(400, "invalid_input", "id and value are required.")
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  await updateSelectable(cfg, guard, actor, body.id, value)
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id)
  return json({ values: await listSelectable(cfg, guard) })
}

export async function postSetSelectableActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "delete")
  const body = (await request.json().catch(() => ({}))) as { id?: string; active?: boolean }
  if (!body.id || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  await setSelectableActive(cfg, guard, actor, body.id, body.active)
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id)
  return json({ values: await listSelectable(cfg, guard) })
}
