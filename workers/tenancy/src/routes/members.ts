// Member routes: list the team's people, change a member's role, remove a
// member. All guard rules (>=1 admin, not-self) live in lib/members.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange, publishUserChange } from "../../../../shared/workers/realtime"
import { changeMemberRole, listMembers, removeMember } from "../lib/members"
import { gated, gatedBody } from "../../../../shared/workers/route"
import type { Env } from "../env"

export async function getMembers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "team_members", "read")
  const members = await listMembers(env, cfg, guard)
  // ?id=<userId> → just that member (for row-level live patching); same filter
  // as the list, so a no-longer-active member yields [] and the client drops it.
  const id = new URL(request.url).searchParams.get("id")
  return json({ members: id ? members.filter((m) => m.userId === id) : members })
}

export async function postMemberRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ userId?: string; roleId?: string }>(
    request, env, "team_members", "edit"
  )
  if (typeof body.userId !== "string" || typeof body.roleId !== "string")
    return fail(400, "invalid_input", "userId and roleId are required.")
  await changeMemberRole(env, cfg, guard, actor, body.userId, body.roleId)
  // Carry the affected userId so other clients can refresh that member's
  // activity feed (activity:user:<id>) in addition to the member + role lists.
  await publishChange(env.REALTIME, guard.teamId, "members", body.userId, "edit")
  return json({ members: await listMembers(env, cfg, guard) })
}

export async function postMemberRemove(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ userId?: string }>(
    request, env, "team_members", "delete"
  )
  if (typeof body.userId !== "string") return fail(400, "invalid_input", "userId is required.")
  await removeMember(env, cfg, guard, actor, body.userId)
  // Team channel: drop them from everyone else's member list (row-level).
  await publishChange(env.REALTIME, guard.teamId, "members", body.userId, "remove")
  // Cross-team: the REMOVED person rides their own user channel — their other
  // devices update the team switcher and leave this team's screens (decision #8).
  await publishUserChange(env.REALTIME, body.userId, "teams", guard.teamId, "remove")
  return json({ members: await listMembers(env, cfg, guard) })
}
