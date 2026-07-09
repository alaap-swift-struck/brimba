// Role routes: the caller's own rights (page guard), the team's roles, create /
// rename a role, and read / save a role's permission matrix. Locked rules
// (Admin is locked, auto-flip-read) live in lib/roles.

import { fail, json } from "../../../../shared/workers/http"
import { csvResponse, toCsv } from "../../../../shared/workers/csv"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { listRoles } from "../lib/members"
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
  const roles = await listRoles(env, cfg, guard)
  const id = new URL(request.url).searchParams.get("id") // ?id= → one role
  return json({ roles: id ? roles.filter((r) => r.id === id) : roles })
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

export async function postRolePerms(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    value?: PermissionValue
  }
  if (!body.roleId || !body.value)
    return fail(400, "invalid_input", "roleId and value are required.")
  await setRolePermissions(cfg, guard, actor, body.roleId, body.value)
  await publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId)
  return json({ ok: true })
}

export async function postCreateRole(request: Request, env: Env): Promise<Response> {
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
  await publishChange(env.REALTIME, guard.teamId, "member_roles", roleId, "add")
  return json({ roles: await listRoles(env, cfg, guard) })
}

export async function postUpdateRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    title?: string
    description?: string
  }
  if (!body.roleId) return fail(400, "invalid_input", "roleId and title are required.")
  const title = requireText(body.title, "Name", TEXT_LIMITS.short)
  await updateRole(cfg, guard, actor, body.roleId, title, (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? ""))
  await publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId)
  return json({ roles: await listRoles(env, cfg, guard) })
}

/** Deactivate / reactivate a role — never deleted (holders keep access). Gated
 * by member_roles:delete (deactivate is our "delete" in the deactivate-only model). */
export async function postSetRoleActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "delete")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    active?: boolean
  }
  if (!body.roleId || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "roleId and active are required.")
  await setRoleActive(cfg, guard, actor, body.roleId, body.active)
  await publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId)
  return json({ roles: await listRoles(env, cfg, guard) })
}
