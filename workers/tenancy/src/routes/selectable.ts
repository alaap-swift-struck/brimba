// Dropdown-values routes ("Selectable data"): list the team's values, add one,
// rename one, deactivate/reactivate one. Gated by the `selectable_data` module
// (read to view, create/edit/delete to manage). Each mutation broadcasts a live
// change ping (the publish-seam test enforces this).

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { requireRight } from "../lib/permissions"
import {
  createSelectable,
  listSelectable,
  setSelectableActive,
  updateSelectable,
} from "../lib/selectable"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getSelectable(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "read")
  return json({ values: await listSelectable(cfg, guard) })
}

export async function postCreateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "create")
  const body = (await request.json().catch(() => ({}))) as { type?: string; value?: string }
  if (!body.type?.trim() || !body.value?.trim())
    return fail(400, "invalid_input", "A dropdown value needs a type and a value.")
  const id = await createSelectable(cfg, guard, actor, body.type, body.value)
  // Row-level: carry the new value's id so open lists can patch just that row.
  await publishChange(env.REALTIME, guard.teamId, "selectable_data", id, "add")
  return json({ values: await listSelectable(cfg, guard) })
}

export async function postUpdateSelectable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "selectable_data", "edit")
  const body = (await request.json().catch(() => ({}))) as { id?: string; value?: string }
  if (!body.id || !body.value?.trim())
    return fail(400, "invalid_input", "id and value are required.")
  await updateSelectable(cfg, guard, actor, body.id, body.value)
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
