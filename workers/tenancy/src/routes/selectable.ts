// Dropdown-values routes ("Selectable data"): list the team's values, add one,
// rename one, deactivate/reactivate one. Gated by the `selectable_data` module
// (read to view, create/edit/delete to manage). Each mutation broadcasts a live
// change ping (the publish-seam test enforces this).

import { fail, json } from "../../../../shared/workers/http"
import { boundExport, csvResponse, toCsv } from "../../../../shared/workers/csv"
import { EXPORT_HARD_CAP } from "../../../../shared/workers/limits"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { requireIdList } from "../../../../shared/workers/bulk"
import { gated, gatedBody } from "../../../../shared/workers/route"
import {
  createSelectable,
  listSelectable,
  oneSelectable,
  setSelectableActive,
  updateSelectable,
  listSelectableForExport,
  bulkSetSelectableActive,
  countSelectable,
} from "../lib/selectable"
import type { Env } from "../env"

export async function getSelectable(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "selectable_data", "read")
  // ?id= is a LOOKUP, not a filtered page. It reads ONE row through the same
  // single-row reader a mutation returns, rather than loading the whole capped
  // collection and calling .find() on it — which is the fault R23 was written to
  // remove, surviving on the OTHER path. This door is the LIVE RE-PULL: it is
  // called once per watching client per ping, so it was the more expensive of the
  // two. (Round-trip review, round 2, 2026-08-25.)
  const id = new URL(request.url).searchParams.get("id")
  const one = id ? await oneSelectable(cfg, guard, id) : null
  return json({
    values: id ? (one ? [one] : []) : await listSelectable(cfg, guard),
    total: await countSelectable(cfg, guard),
  })
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

export async function postCreateSelectable(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ type?: string; value?: string }>(request, env, "selectable_data", "create")
  const type = requireText(body.type, "Group", TEXT_LIMITS.short)
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  const id = await createSelectable(cfg, guard, actor, type, value)
  // Row-level: carry the new value's id so open lists can patch just that row.
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "selectable_data", id, "add"))
  // R21: the CREATED ROW, not the collection.
  return json({ created: await oneSelectable(cfg, guard, id), total: await countSelectable(cfg, guard) })
}

export async function postUpdateSelectable(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; value?: string; type?: string; expectedVersion?: string }>(request, env, "selectable_data", "edit")
  if (!body.id) return fail(400, "invalid_input", "id and value are required.")
  const value = requireText(body.value, "Option", TEXT_LIMITS.short)
  // The destination group. ABSENT leaves the value where it is (the Dropdown-values
  // screen renames inline and posts no type at all); SENT moves it. There is no
  // third case — a group can't be cleared — so a present-but-blank one is a caller
  // mistake and `requireText` answers it with the clean 400, rather than passing a
  // blank through as "don't move" and leaving the caller believing it moved.
  const type = body.type === undefined ? undefined : requireText(body.type, "Group", TEXT_LIMITS.short)
  // `type` is LAST: it was added after `expectedVersion` on purpose, so the
  // positional callers that predate it keep passing the version where they always did.
  await updateSelectable(cfg, guard, actor, body.id, value, body.expectedVersion, type)
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id))
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneSelectable(cfg, guard, body.id) })
}

export async function postSetSelectableActive(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; active?: boolean }>(request, env, "selectable_data", "delete")
  if (!body.id || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  // R17: no-op repeat → no ping, no duplicate history (see setSelectableActive).
  const changed = await setSelectableActive(cfg, guard, actor, body.id, body.active)
  if (changed) ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "selectable_data", body.id))
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneSelectable(cfg, guard, body.id) })
}

/** LAW R24 — the bulk twin. Gated ONCE by the SAME right the single door uses,
 * validates its id list at the boundary, and publishes ONE row-level ping per
 * CHANGED row (never a list refetch). Declared `together`: no row here depends
 * on what another row left behind. */
export async function postBulkSetSelectableActive(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ ids?: unknown; active?: unknown }>(request, env, "selectable_data", "delete")
  const ids = requireIdList(body.ids)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "active must be true or false.")
  const { changed, skipped } = await bulkSetSelectableActive(cfg, guard, actor, ids, body.active)
  for (const id of changed) ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "selectable_data", id))
  return json({ updated: changed.length, skipped })
}
