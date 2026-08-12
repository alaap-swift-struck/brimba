// Team + session routes: onboarding bootstrap, the active context, the team
// switcher, creating a team, editing it, the Overview metadata + Activity feed.

import { fail, json, pagedJson } from "../../../../shared/workers/http"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { logActivity } from "../../../../shared/workers/activity"
import { getActivity } from "../lib/activity-read"
import { getMyPermissions } from "../lib/roles"
import { ACTIVITY_GATE_MAP, ACTIVITY_TABLE_EXEMPT } from "../../../../shared/rules/registry"
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
import { MAX_TEAMS_PER_USER, numberVar } from "../../../../shared/workers/limits"
import { gatedBody } from "../../../../shared/workers/route"
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

  const body = (await request.json().catch(() => ({}))) as { name?: unknown }
  // Validate at the boundary: a non-string name would otherwise crash .trim() → 500.
  // requireText type-checks + trims + caps, throwing the clean 400 the catch maps.
  const name = requireText(body.name, "Team name", TEXT_LIMITS.short)

  // CAP the door. Every team provisions a REAL database, so an uncapped create
  // is an unbounded resource-creation door for anyone who can sign up — one
  // account could exhaust the Cloudflare account's database quota. Counted by
  // who CREATED the team (that's what provisions), never by membership, so
  // being invited to many teams costs nobody anything. The owner raises it per
  // deploy with MAX_TEAMS_PER_USER; onboarding's first team is far below it.
  const cap = numberVar(env.MAX_TEAMS_PER_USER, MAX_TEAMS_PER_USER)
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM teams WHERE creator_id = ?")
    .bind(user.id)
    .first<{ n: number }>()
  if ((mine?.n ?? 0) >= cap)
    return fail(
      403,
      "team_limit",
      `You've created ${cap} teams, which is the limit on this account. Ask an admin if you need more.`
    )

  await createTeam(env, toActor(user), name, null)
  return json(await getActiveContext(env, d1Config(env), user.id))
}

export async function postUpdateTeam(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ name?: string; logoDataUrl?: string; expectedVersion?: string }>(
    request, env, "teams", "edit"
  )
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  await updateTeamDetails(env, guard.teamId, name, body.logoDataUrl, body.expectedVersion)
  // Record the edit on the team's Activity feed (was missing — team-edit feedback).
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Team details updated",
    description: `${actor.name} updated the team details`,
    relatedTable: "teams",
    relatedRowId: guard.teamId,
  })
  await publishChange(env.REALTIME, guard.teamId, "team")
  return json({ ok: true })
}

/** The activity feed for the active team, or one record (?scope=team|user|role
 * &id=). Gated by read-right: role scope needs member_roles:read, the rest
 * team_members:read — and the TEAM scope additionally subtracts the caller's
 * denied modules (R18): the feed is the one read that returns every module's
 * rows behind a single gate, and its rows name records and their before/after,
 * so a caller who can't read a module can't read its history either. The
 * table→module map + the pinned exemptions live as DATA in the rules registry. */
export async function getActivityFeed(request: Request, env: Env): Promise<Response> {
  // ONE response shape for every scope (R14): the rows, the TRUE total, hasMore,
  // and the opaque cursor the client hands straight back for the next page. A
  // scope that resolves to nothing answers in the same shape — never a bare [].
  const feed = (p: { rows: unknown[]; total: number; hasMore: boolean; nextCursor: string | null }) =>
    pagedJson("activity", p)
  const emptyFeed = () => pagedJson("activity", { rows: [], total: 0, hasMore: false, nextCursor: null })
  const { cfg, guard } = await teamContext(request, env)
  const url = new URL(request.url)
  // VALIDATED, not cast: an unrecognised scope used to fall past every branch
  // here AND in getActivity, leaving an unfiltered whole-feed read behind.
  const SCOPES = ["team", "user", "role", "invite", "record"] as const
  const raw = url.searchParams.get("scope") ?? "team"
  const scope = (SCOPES as readonly string[]).includes(raw)
    ? (raw as (typeof SCOPES)[number])
    : null
  if (!scope) return fail(400, "invalid_input", "Unknown activity scope.")
  let id = url.searchParams.get("id") ?? undefined
  // The OPAQUE cursor from the previous page (R14) — decoded (and 400-checked)
  // inside getActivity, never parsed here.
  const cursor = url.searchParams.get("cursor")

  // Generic record scope: any module's activity by (table, id), gated by THAT
  // module's read right (resolved from the SAME registry map the team scope
  // subtracts through — an unknown table returns empty, never the whole feed).
  if (scope === "record") {
    const table = url.searchParams.get("table") ?? undefined
    if (!id || !table) return emptyFeed()
    const module = ACTIVITY_GATE_MAP[table]
    if (!module) return emptyFeed()
    await requireRight(cfg, guard, module, "read")
    return feed((await getActivity(cfg, guard, "record", id, table, null, cursor)))
  }

  await requireRight(cfg, guard, scope === "role" ? "member_roles" : "team_members", "read")

  // An id-scope with no id is a request for one record's history that names no
  // record — answer with nothing, never with everyone's.
  if (scope !== "team" && !id) return emptyFeed()

  // R18: the team feed carries the caller's module rights — build the allowed
  // related_table list from their per-module read rights + the pinned exemptions.
  if (scope === "team") {
    const perms = await getMyPermissions(cfg, guard)
    const allowed = [
      ...Object.entries(ACTIVITY_GATE_MAP)
        .filter(([, module]) => perms[module]?.read)
        .map(([table]) => table),
      ...Object.keys(ACTIVITY_TABLE_EXEMPT),
    ]
    return feed((await getActivity(cfg, guard, "team", undefined, undefined, allowed, cursor)))
  }
  // Invite scope: the client passes the GLOBAL invite id; map it to the team-local
  // invite_logs row id the activity rows reference. Bail to an empty feed if it
  // doesn't resolve, so a bad/missing id never falls through to the whole-team feed.
  if (scope === "invite") {
    if (!id) return emptyFeed()
    const idx = await env.DB.prepare(
      "SELECT invite_row_id FROM invite_index WHERE id = ? AND team_id = ?"
    )
      .bind(id, guard.teamId)
      .first<{ invite_row_id: string }>()
    if (!idx?.invite_row_id) return emptyFeed()
    id = idx.invite_row_id
  }
  return feed((await getActivity(cfg, guard, scope, id, undefined, null, cursor)))
}

/** The active team's Overview metadata (any member may read it). */
export async function getTeamMetaFeed(request: Request, env: Env): Promise<Response> {
  const { guard } = await teamContext(request, env)
  return json(await getTeamMeta(env, guard.teamId))
}
