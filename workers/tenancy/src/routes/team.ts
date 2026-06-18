// Team + session routes: onboarding bootstrap, the active context, the team
// switcher, creating a team, editing it, the Overview metadata + Activity feed.

import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { getActivity } from "../lib/activity-read"
import { requireRight } from "../lib/permissions"
import {
  acceptPendingInvites,
  createTeam,
  d1Config,
  getActiveContext,
  getTeamMeta,
  listMyTeams,
  switchTeam,
  updateTeamDetails,
} from "../lib/teams"
import { teamContext, toActor, whoAmI } from "../context"
import type { Env } from "../env"

/**
 * The locked onboarding flow: active invites? -> join those teams (no personal
 * team). Otherwise -> create "{First name}'s team" with its own database.
 * Idempotent: if the user already belongs somewhere, just report.
 */
export async function bootstrap(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")

  const actor = toActor(user)

  let teams = await listMyTeams(env, user.id)
  if (teams.length === 0) {
    const accepted = await acceptPendingInvites(env, actor)
    if (accepted === 0) {
      await createTeam(env, actor, `${user.firstName ?? "My"}'s team`, user.imageUrl)
    }
    teams = await listMyTeams(env, user.id)
  }

  const current = await env.DB.prepare("SELECT current_team_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ current_team_id: string | null }>()

  return json({ teams, currentTeamId: current?.current_team_id ?? null })
}

export async function myTeams(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ teams: await listMyTeams(env, user.id), currentTeamId: user.currentTeamId })
}

/** The active context: current team + your role + member count + all teams. */
export async function active(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json(await getActiveContext(env, d1Config(env), user.id))
}

/** Switch the active team (one team session at a time, validated). */
export async function switchActiveTeam(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as { teamId?: string }
  if (!body.teamId) return fail(400, "invalid_input", "teamId is required.")

  const ok = await switchTeam(env, user.id, body.teamId)
  if (!ok) return fail(403, "not_member", "You're not a member of that team.")
  return json(await getActiveContext(env, d1Config(env), user.id))
}

/** Create a brand-new team (its own database, you as Admin) and switch to it. */
export async function createNamedTeam(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")

  const body = (await request.json().catch(() => ({}))) as { name?: string }
  const name = (body.name ?? "").trim()
  if (!name) return fail(400, "invalid_input", "A team name is required.")
  if (name.length > 60) return fail(400, "name_too_long", "That team name is too long.")

  await createTeam(env, toActor(user), name, null)
  return json(await getActiveContext(env, d1Config(env), user.id))
}

export async function postUpdateTeam(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "teams", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    logoDataUrl?: string
  }
  if (!body.name?.trim()) return fail(400, "invalid_input", "A team needs a name.")
  await updateTeamDetails(env, guard.teamId, body.name, body.logoDataUrl)
  await publishChange(env.REALTIME, guard.teamId, "team")
  return json({ ok: true })
}

/** The activity feed for the active team, or one record (?scope=team|user|role
 * &id=). Gated by read-right: role scope needs member_roles:read, the rest
 * team_members:read — so a viewer with read access can see the history. */
export async function getActivityFeed(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const url = new URL(request.url)
  const scope = (url.searchParams.get("scope") ?? "team") as "team" | "user" | "role"
  const id = url.searchParams.get("id") ?? undefined
  await requireRight(cfg, guard, scope === "role" ? "member_roles" : "team_members", "read")
  return json({ activity: await getActivity(cfg, guard, scope, id) })
}

/** The active team's Overview metadata (any member may read it). */
export async function getTeamMetaFeed(request: Request, env: Env): Promise<Response> {
  const { guard } = await teamContext(request, env)
  return json(await getTeamMeta(env, guard.teamId))
}
