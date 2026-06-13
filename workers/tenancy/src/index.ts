// Brimba TENANCY worker — teams, memberships, and the team-database factory.
//
//   POST /api/tenancy/bootstrap            -> after onboarding: accept invites
//                                             OR create the personal team
//   GET  /api/tenancy/active               -> current team + your role + teams
//   POST /api/tenancy/switch-team          -> change the active team
//   POST /api/tenancy/teams                -> create a new team (named)
//   GET  /api/tenancy/teams                -> my teams (for switcher + home)
//   GET  /api/tenancy/members              -> the team's members (+ identity)
//   POST /api/tenancy/members/role         -> change a member's role
//   POST /api/tenancy/members/remove       -> remove (deactivate) a member
//   GET  /api/tenancy/roles                -> the team's roles (+ member counts)
//   POST /api/tenancy/roles                 -> create a new role
//   GET  /api/tenancy/roles/permissions    -> a role's permission matrix (?roleId)
//   POST /api/tenancy/roles/permissions    -> save a role's permission matrix
//   POST /api/tenancy/admin/migrate-teams  -> roll new team-schema migrations
//                                             to EVERY team DB (x-admin-key)
//   GET  /api/tenancy/admin/db-sizes       -> size every team DB + open alarms
//   POST /api/tenancy/admin/move-module    -> relocate a heavy module to its
//                                             own database (the mover)
//   GET  /api/tenancy/health
//   cron (nightly)                         -> the 80% size alarms

import { brand } from "../../../shared/brand"
import type { SessionUser } from "../../../shared/types"
import { fail, json } from "../../../shared/workers/http"
import { d1Query } from "../../../shared/workers/d1-rest"
import { publishChange } from "../../../shared/workers/realtime"
import type { Env } from "./env"
import {
  acceptPendingInvites,
  applyMigration,
  createTeam,
  d1Config,
  getActiveContext,
  listMyTeams,
  switchTeam,
} from "./lib/teams"
import {
  checkDatabaseSizes,
  moveModuleToOwnDatabase,
} from "./lib/sharding"
import {
  GuardError,
  requireMember,
  requireRight,
  type MemberGuard,
} from "./lib/permissions"
import {
  changeMemberRole,
  listMembers,
  listRoles,
  removeMember,
} from "./lib/members"
import {
  createRole,
  getRolePermissions,
  setRolePermissions,
  type PermissionValue,
} from "./lib/roles"
import type { D1Rest } from "../../../shared/workers/d1-rest"
import { TEAM_MIGRATIONS, type Actor } from "./team-schema"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      switch (route) {
        case "POST /api/tenancy/bootstrap":
          return await bootstrap(request, env)
        case "GET /api/tenancy/active":
          return await active(request, env)
        case "POST /api/tenancy/switch-team":
          return await switchActiveTeam(request, env)
        case "POST /api/tenancy/teams":
          return await createNamedTeam(request, env)
        case "GET /api/tenancy/teams":
          return await myTeams(request, env)
        case "GET /api/tenancy/members":
          return await getMembers(request, env)
        case "POST /api/tenancy/members/role":
          return await postMemberRole(request, env)
        case "POST /api/tenancy/members/remove":
          return await postMemberRemove(request, env)
        case "GET /api/tenancy/roles":
          return await getRoles(request, env)
        case "POST /api/tenancy/roles":
          return await postCreateRole(request, env)
        case "GET /api/tenancy/roles/permissions":
          return await getRolePerms(request, env)
        case "POST /api/tenancy/roles/permissions":
          return await postRolePerms(request, env)
        case "POST /api/tenancy/admin/migrate-teams":
          return await migrateTeams(request, env)
        case "GET /api/tenancy/admin/db-sizes":
          return await dbSizes(request, env)
        case "POST /api/tenancy/admin/move-module":
          return await moveModule(request, env)
        case "GET /api/tenancy/health":
          return json({ ok: true })
        default:
          return fail(404, "not_found", "No such tenancy action.")
      }
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("tenancy worker error:", e)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", `${brand.name}'s cloud key isn't set up yet — team creation is paused.`)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },

  /** Nightly cron: the 80% database-size alarms (locked sharding machinery). */
  async scheduled(_controller, env): Promise<void> {
    try {
      const result = await checkDatabaseSizes(env, d1Config(env))
      console.log(
        `size check: ${result.checked} team DBs, ${result.alerted.length} alarm(s)`
      )
    } catch (e) {
      console.error("nightly size check failed:", e)
    }
  },
} satisfies ExportedHandler<Env>

/** Shared guard for the maintenance endpoints (x-admin-key header). */
function adminGuard(request: Request, env: Env): Response | null {
  if (!env.ADMIN_KEY) return fail(503, "admin_key_missing", "Maintenance key not set.")
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return fail(403, "forbidden", "Bad maintenance key.")
  return null
}

/** Ask the auth worker (one session system, one master) who this request is. */
async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  const res = await env.AUTH.fetch("https://auth/api/auth/me", {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { user: SessionUser }
  return data.user
}

function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
  }
}

/**
 * The standard opening every team-scoped handler shares: who are you, the
 * Cloudflare config, and a validated membership guard for your ACTIVE team.
 * Throws GuardError (mapped to a response centrally) on any failure.
 */
async function teamContext(
  request: Request,
  env: Env
): Promise<{ user: SessionUser; actor: Actor; cfg: D1Rest; guard: MemberGuard }> {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")

  const row = await env.DB.prepare("SELECT current_team_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ current_team_id: string | null }>()
  if (!row?.current_team_id)
    throw new GuardError(409, "no_team", "No active team.")

  const cfg = d1Config(env)
  const guard = await requireMember(env, user.id, row.current_team_id)
  return { user, actor: toActor(user), cfg, guard }
}

async function getMembers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "read")
  return json({ members: await listMembers(env, cfg, guard) })
}

async function getRoles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  return json({ roles: await listRoles(env, cfg, guard) })
}

async function getRolePerms(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const roleId = new URL(request.url).searchParams.get("roleId")
  if (!roleId) return fail(400, "invalid_input", "roleId is required.")
  return json(await getRolePermissions(cfg, guard, roleId))
}

async function postRolePerms(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    value?: PermissionValue
  }
  if (!body.roleId || !body.value)
    return fail(400, "invalid_input", "roleId and value are required.")
  await setRolePermissions(cfg, guard, actor, body.roleId, body.value)
  await publishChange(env.REALTIME, guard.teamId, "member_roles")
  return json({ ok: true })
}

async function postCreateRole(request: Request, env: Env): Promise<Response> {
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

async function postMemberRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string
    roleId?: string
  }
  if (!body.userId || !body.roleId)
    return fail(400, "invalid_input", "userId and roleId are required.")
  await changeMemberRole(env, cfg, guard, actor, body.userId, body.roleId)
  await publishChange(env.REALTIME, guard.teamId, "members")
  return json({ members: await listMembers(env, cfg, guard) })
}

async function postMemberRemove(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "team_members", "delete")
  const body = (await request.json().catch(() => ({}))) as { userId?: string }
  if (!body.userId) return fail(400, "invalid_input", "userId is required.")
  await removeMember(env, cfg, guard, actor, body.userId)
  await publishChange(env.REALTIME, guard.teamId, "members")
  return json({ members: await listMembers(env, cfg, guard) })
}

/**
 * The locked onboarding flow: active invites? -> join those teams (no
 * personal team). Otherwise -> create "{First name}'s team" with its own
 * database. Idempotent: if the user already belongs somewhere, just report.
 */
async function bootstrap(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")

  const actor = toActor(user)

  let teams = await listMyTeams(env, user.id)
  if (teams.length === 0) {
    const accepted = await acceptPendingInvites(env, actor)
    if (accepted === 0) {
      await createTeam(
        env,
        actor,
        `${user.firstName ?? "My"}'s team`,
        user.imageUrl
      )
    }
    teams = await listMyTeams(env, user.id)
  }

  const current = await env.DB.prepare(
    "SELECT current_team_id FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first<{ current_team_id: string | null }>()

  return json({ teams, currentTeamId: current?.current_team_id ?? null })
}

async function myTeams(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ teams: await listMyTeams(env, user.id), currentTeamId: user.currentTeamId })
}

/** The active context: current team + your role + member count + all teams. */
async function active(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json(await getActiveContext(env, d1Config(env), user.id))
}

/** Switch the active team (one team session at a time, validated). */
async function switchActiveTeam(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as { teamId?: string }
  if (!body.teamId) return fail(400, "invalid_input", "teamId is required.")

  const ok = await switchTeam(env, user.id, body.teamId)
  if (!ok) return fail(403, "not_member", "You're not a member of that team.")
  return json(await getActiveContext(env, d1Config(env), user.id))
}

/** Create a brand-new team (its own database, you as Admin) and switch to it. */
async function createNamedTeam(request: Request, env: Env): Promise<Response> {
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

/**
 * The migration robot (locked: per-team databases need a once-built rollout
 * machine). Applies any not-yet-applied team-schema migration to every ready
 * team database. Protected by the ADMIN_KEY secret.
 */
async function migrateTeams(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const cfg = d1Config(env)
  const teams = await env.DB.prepare(
    "SELECT id, database_id, schema_version FROM teams WHERE db_status = 'ready' AND deactivated_at IS NULL"
  ).all<{ id: string; database_id: string; schema_version: string }>()

  const latest = TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version
  let migrated = 0
  for (const team of teams.results ?? []) {
    const applied = await d1Query<{ version: string }>(
      cfg,
      team.database_id,
      "SELECT version FROM _migrations"
    )
    const done = new Set(applied.map((r) => r.version))
    const missing = TEAM_MIGRATIONS.filter((m) => !done.has(m.version))
    if (missing.length === 0) continue

    for (const m of missing) await applyMigration(cfg, team.database_id, m)
    await env.DB.prepare(
      "UPDATE teams SET schema_version = ?, updated_at = ? WHERE id = ?"
    )
      .bind(latest, new Date().toISOString(), team.id)
      .run()
    migrated++
  }
  return json({ ok: true, teamsChecked: teams.results?.length ?? 0, teamsMigrated: migrated })
}

/** On-demand version of the nightly size check (plus the alarm list). */
async function dbSizes(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const result = await checkDatabaseSizes(env, d1Config(env))
  const open = await env.DB.prepare(
    "SELECT database_name, size_bytes, created_at FROM db_alerts WHERE resolved_at IS NULL"
  ).all()
  return json({ ...result, openAlerts: open.results ?? [] })
}

/** The mover: POST { teamId, module, tables: [...] } with x-admin-key. */
async function moveModule(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string
    module?: string
    tables?: string[]
  }
  if (!body.teamId || !body.module || !body.tables?.length)
    return fail(400, "invalid_input", "teamId, module and tables are required.")

  const result = await moveModuleToOwnDatabase(
    env,
    d1Config(env),
    body.teamId,
    body.module,
    body.tables
  )
  return json({ ok: true, ...result })
}
