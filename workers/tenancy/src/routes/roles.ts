// Role routes: the caller's own rights (page guard), the team's roles, create /
// rename a role, and read / save a role's permission matrix. Locked rules
// (Admin is locked, auto-flip-read) live in lib/roles.

import { fail, json } from "../../../../shared/workers/http"
import { csvResponse, toCsv } from "../../../../shared/workers/csv"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { listRoles, oneRole, countRoles } from "../lib/members"
import { TEAM_MODULE_CATALOG } from "../team-schema"
import { requireRight } from "../lib/permissions"
import {
  createRole,
  getMyPermissions,
  getRolePermissions,
  setRoleActive,
  setRolePermissions,
  updateRole,
  type PermissionValue,
  buildPermissionValue,
  listAllRolePermissions,
  listRoleAudit,
} from "../lib/roles"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getMyPerms(request: Request, env: Env): Promise<Response> {
  // Your OWN rights for the active team — no requireRight (it's about you).
  const { cfg, guard } = await teamContext(request, env)
  return json({ permissions: await getMyPermissions(cfg, guard) })
}

export async function getRoles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  // ?id= is a LOOKUP, not a filtered page — one row through the single-row reader,
  // rather than loading the whole capped collection and calling .find(). This door
  // is the LIVE RE-PULL, called once per watching client per ping, so it was the
  // more expensive of the two paths R23 was meant to fix.
  const id = new URL(request.url).searchParams.get("id")
  const one = id ? await oneRole(env, cfg, guard, id) : null
  // R16: every list response carries the exact server total — badges never use rows.length.
  return json({
    roles: id ? (one ? [one] : []) : await listRoles(env, cfg, guard),
    total: await countRoles(cfg, guard),
  })
}

/** GET /api/tenancy/roles/export — the team's roles as a CSV download carrying
 * EVERY captured field (the owner's export rule): the role row, the FULL
 * permission matrix flattened to one `<module>.<right>` yes/no column each
 * (spreadsheet-filterable), and the whole audit block. The cross-cutting rule:
 * EXPORT NEEDS READ (import needs create). Team-bound by construction
 * (teamContext → the caller's own team database). Leading columns still match
 * the import format (title, description) so the file round-trips. */
export async function getRolesExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const [roles, audit, permsByRole] = await Promise.all([
    listRoles(env, cfg, guard),
    listRoleAudit(cfg, guard),
    listAllRolePermissions(cfg, guard),
  ])
  const auditBy = new Map(audit.map((a) => [a.id, a]))
  const RIGHTS = ["read", "create", "edit", "delete"] as const
  const header = [
    "title",
    "description",
    "active",
    "members",
    ...TEAM_MODULE_CATALOG.flatMap((m) => RIGHTS.map((rt) => `${m.key}.${rt}`)),
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "deactivated_at",
    "deactivated_by",
  ]
  const rows = roles.map((r) => {
    const a = auditBy.get(r.id)
    const value = permsByRole.get(r.id) ?? buildPermissionValue([])
    return [
      r.title,
      r.description,
      r.active,
      r.memberCount,
      ...TEAM_MODULE_CATALOG.flatMap((m) => RIGHTS.map((rt) => value[m.key]?.[rt] ?? false)),
      a?.created_at,
      a?.creator_name,
      a?.updated_at,
      a?.editor_name,
      a?.deactivated_at,
      a?.deactivator_name,
    ]
  })
  return csvResponse("member-roles.csv", toCsv(header, rows))
}

export async function getRolePerms(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const roleId = new URL(request.url).searchParams.get("roleId")
  if (!roleId) return fail(400, "invalid_input", "roleId is required.")
  return json(await getRolePermissions(cfg, guard, roleId))
}

export async function postRolePerms(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    value?: PermissionValue
  }
  if (!body.roleId || !body.value)
    return fail(400, "invalid_input", "roleId and value are required.")
  await setRolePermissions(cfg, guard, actor, body.roleId, body.value)
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId))
  return json({ ok: true })
}

export async function postCreateRole(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "create")
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    description?: string
    permissions?: PermissionValue
  }
  const title = requireText(body.title, "Name", TEXT_LIMITS.short)
  // Creating WITH a permission matrix (the import round-trip / a matrix-carrying
  // CSV) is create + edit in one move, so it demands BOTH rights — the same gate
  // setting a matrix on the Roles screen goes through. A plain create is unchanged.
  const withMatrix = typeof body.permissions === "object" && body.permissions !== null
  if (withMatrix) await requireRight(cfg, guard, "member_roles", "edit")
  const roleId = await createRole(cfg, guard, actor, title, (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? ""))
  if (withMatrix) await setRolePermissions(cfg, guard, actor, roleId, body.permissions as PermissionValue)
  // Row-level: carry the new role's id so open role lists patch just that row.
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "member_roles", roleId, "add"))
  // R21: the CREATED ROW, not the collection — the caller patches this one row in
  // (CACHING rule 3) and now knows the new id without a follow-up search.
  return json({ created: await oneRole(env, cfg, guard, roleId), total: await countRoles(cfg, guard) })
}

export async function postUpdateRole(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    title?: string
    description?: string
    expectedVersion?: string
  }
  if (!body.roleId) return fail(400, "invalid_input", "roleId and title are required.")
  const title = requireText(body.title, "Name", TEXT_LIMITS.short)
  // AN OMITTED FIELD IS NOT AN EMPTY ONE. `?? ""` flattened the two callers into
  // one: a machine renaming the role (no description key at all) looked exactly
  // like a person who emptied the box, and the lib wrote NULL over the stored
  // text. The split is made HERE, on the raw body, because `optionalText` maps
  // both null and "" to undefined — so it can validate the value but can no
  // longer say whether one was sent. `=== undefined` is the whole distinction;
  // `== null` cannot express it. (Correctness review, round 5.)
  const description =
    body.description === undefined
      ? undefined // absent → the lib keeps what is stored
      : optionalText(body.description, "Description", TEXT_LIMITS.long) ?? null // present → written, blank clears
  await updateRole(cfg, guard, actor, body.roleId, title, description, body.expectedVersion)
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId))
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneRole(env, cfg, guard, body.roleId) })
}

/** Deactivate / reactivate a role — never deleted (holders keep access). Gated
 * by member_roles:delete (deactivate is our "delete" in the deactivate-only model). */
export async function postSetRoleActive(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "delete")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    active?: boolean
  }
  if (!body.roleId || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "roleId and active are required.")
  // R17: a repeat (double click / retry) moves zero rows — then nothing is
  // published and no duplicate history exists; the response is still the list.
  const changed = await setRoleActive(cfg, guard, actor, body.roleId, body.active)
  if (changed) ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId))
  // R23: the affected ROW, and no count — an edit cannot move a total. See RULES.md.
  return json({ updated: await oneRole(env, cfg, guard, body.roleId) })
}
