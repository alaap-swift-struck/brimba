// Invite routes: list the team's invites, invite by email + role, revoke a
// pending invite. Guards + the branded email live in lib/invites.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { createInvite, listInvites, revokeInvite } from "../lib/invites"
import { requireRight } from "../lib/permissions"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getInvites(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "read")
  return json({ invites: await listInvites(env, cfg, guard) })
}

export async function postCreateInvite(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "create")
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    roleId?: string
  }
  if (!body.email || !body.roleId)
    return fail(400, "invalid_input", "email and roleId are required.")
  await createInvite(env, cfg, guard, actor, body.email, body.roleId, new URL(request.url).origin)
  await publishChange(env.REALTIME, guard.teamId, "invites")
  return json({ invites: await listInvites(env, cfg, guard) })
}

export async function postRevokeInvite(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "delete")
  const body = (await request.json().catch(() => ({}))) as { inviteId?: string }
  if (!body.inviteId) return fail(400, "invalid_input", "inviteId is required.")
  await revokeInvite(env, cfg, guard, actor, body.inviteId)
  await publishChange(env.REALTIME, guard.teamId, "invites")
  return json({ invites: await listInvites(env, cfg, guard) })
}
