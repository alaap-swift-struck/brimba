// Invite routes: list the team's invites, invite by email + role, revoke a
// pending invite. Guards + the branded email live in lib/invites.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { createInvite, listInvites, revokeInvite } from "../lib/invites"
import { acceptInvite, listReceivedInvites } from "../lib/teams"
import { requireRight } from "../lib/permissions"
import { teamContext, toActor, whoAmI } from "../context"
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

/**
 * Invitations the signed-in user has RECEIVED (matched by their email). NOT
 * team-scoped — works for any signed-in user, including one who already has a
 * team (the onboarding auto-accept only covers teamless users). This is what
 * makes a missed/failed invite email recoverable in-app.
 */
export async function getReceivedInvitations(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ invitations: await listReceivedInvites(env, user.email) })
}

/** Accept one received invite → join + switch to that team. Validates ownership
 * (email match) + pending + unexpired inside acceptInvite. */
export async function postAcceptInvitation(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")
  const body = (await request.json().catch(() => ({}))) as { inviteId?: string }
  if (!body.inviteId) return fail(400, "invalid_input", "inviteId is required.")
  const joinedTeamId = await acceptInvite(env, toActor(user), body.inviteId)
  if (!joinedTeamId)
    return fail(404, "invite_unavailable", "That invitation is no longer available.")
  return json({
    invitations: await listReceivedInvites(env, user.email),
    joinedTeamId,
  })
}
