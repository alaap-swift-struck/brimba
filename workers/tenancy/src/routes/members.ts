// Member routes: list the team's people, change a member's role, remove a
// member. All guard rules (>=1 admin, not-self) live in lib/members.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange, publishUserChange } from "../../../../shared/workers/realtime"
import { changeMemberRole, listMembers, oneMember, removeMember } from "../lib/members"
import { gated, gatedBody } from "../../../../shared/workers/route"
import type { Env } from "../env"

export async function getMembers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "team_members", "read")
  // ?id=<userId> → just that member, read as ONE row rather than filtered out of
  // the whole list. This is the live re-pull path — called once per watching
  // client per ping — and it was the last of the five `?id=` doors still loading
  // the entire collection to hand back a single row, against the largest table in
  // the base. `oneMember` applies the same active filter, so a no-longer-active
  // member still yields nothing and the client still drops them, which is the
  // behaviour the old comment was protecting. (Round-trip review, round 3.)
  const id = new URL(request.url).searchParams.get("id")
  if (id) {
    const one = await oneMember(env, cfg, guard, id)
    return json({ members: one ? [one] : [] })
  }
  return json({ members: await listMembers(env, cfg, guard) })
}

export async function postMemberRole(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ userId?: string; roleId?: string }>(
    request, env, "team_members", "edit"
  )
  if (typeof body.userId !== "string" || typeof body.roleId !== "string")
    return fail(400, "invalid_input", "userId and roleId are required.")
  await changeMemberRole(env, cfg, guard, actor, body.userId, body.roleId)
  // Carry the affected userId so other clients can refresh that member's
  // activity feed (activity:user:<id>) in addition to the member + role lists.
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "members", body.userId, "edit"))
  // R23: the affected ROW, never the collection. See RULES.md.
  return json({ updated: await oneMember(env, cfg, guard, body.userId) })
}

export async function postMemberRemove(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ userId?: string }>(
    request, env, "team_members", "delete"
  )
  if (typeof body.userId !== "string") return fail(400, "invalid_input", "userId is required.")
  await removeMember(env, cfg, guard, actor, body.userId)
  // Team channel: drop them from everyone else's member list (row-level).
  ctx.waitUntil(publishChange(env.REALTIME, guard.teamId, "members", body.userId, "remove"))
  // Cross-team: the REMOVED person rides their own user channel — their other
  // devices update the team switcher and leave this team's screens (decision #8).
  ctx.waitUntil(publishUserChange(env.REALTIME, body.userId, "teams", guard.teamId, "remove"))
  // R23: the affected ROW, never the collection. See RULES.md.
  return json({ updated: await oneMember(env, cfg, guard, body.userId) })
}
