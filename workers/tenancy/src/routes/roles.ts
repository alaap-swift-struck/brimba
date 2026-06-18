// Role routes: the caller's own rights (page guard), the team's roles, create /
// rename a role, and read / save a role's permission matrix. Locked rules
// (Admin is locked, auto-flip-read) live in lib/roles.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { listRoles } from "../lib/members"
import { requireRight } from "../lib/permissions"
import {
  createRole,
  getMyPermissions,
  getRolePermissions,
  setRolePermissions,
  updateRole,
  type PermissionValue,
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
  return json({ roles: await listRoles(env, cfg, guard) })
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
  }
  if (!body.title?.trim()) return fail(400, "invalid_input", "A role needs a name.")
  await createRole(cfg, guard, actor, body.title, body.description ?? "")
  await publishChange(env.REALTIME, guard.teamId, "member_roles")
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
  if (!body.roleId || !body.title?.trim())
    return fail(400, "invalid_input", "roleId and title are required.")
  await updateRole(cfg, guard, actor, body.roleId, body.title, body.description ?? "")
  await publishChange(env.REALTIME, guard.teamId, "member_roles", body.roleId)
  return json({ roles: await listRoles(env, cfg, guard) })
}
