// Member routes: list the team's people, change a member's role, remove a
// member. All guard rules (>=1 admin, not-self) live in lib/members.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { changeMemberRole, listMembers, removeMember } from "../lib/members"
import { requireRight } from "../lib/permissions"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getMembers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "read")
  const members = await listMembers(env, cfg, guard)
  // ?id=<userId> → just that member (for row-level live patching); same filter
  // as the list, so a no-longer-active member yields [] and the client drops it.
  const id = new URL(request.url).searchParams.get("id")
  return json({ members: id ? members.filter((m) => m.userId === id) : members })
}

export async function postMemberRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string
    roleId?: string
  }
  if (!body.userId || !body.roleId)
    return fail(400, "invalid_input", "userId and roleId are required.")
  await changeMemberRole(env, cfg, guard, actor, body.userId, body.roleId)
  // Carry the affected userId so other clients can refresh that member's
  // activity feed (activity:user:<id>) in addition to the member + role lists.
  await publishChange(env.REALTIME, guard.teamId, "members", body.userId)
  return json({ members: await listMembers(env, cfg, guard) })
}

export async function postMemberRemove(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "delete")
  const body = (await request.json().catch(() => ({}))) as { userId?: string }
  if (!body.userId) return fail(400, "invalid_input", "userId is required.")
  await removeMember(env, cfg, guard, actor, body.userId)
  await publishChange(env.REALTIME, guard.teamId, "members", body.userId)
  return json({ members: await listMembers(env, cfg, guard) })
}
