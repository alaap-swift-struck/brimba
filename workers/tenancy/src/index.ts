// Brimba TENANCY worker — teams, memberships, and the team-database factory.
//
//   POST /api/tenancy/bootstrap            -> after onboarding: accept invites
//                                             OR create the personal team
//   GET  /api/tenancy/teams                -> my teams (for switcher + home)
//   POST /api/tenancy/admin/migrate-teams  -> roll new team-schema migrations
//                                             to EVERY team DB (x-admin-key)
//   GET  /api/tenancy/admin/db-sizes       -> size every team DB + open alarms
//   POST /api/tenancy/admin/move-module    -> relocate a heavy module to its
//                                             own database (the mover)
//   GET  /api/tenancy/health
//   cron (nightly)                         -> the 80% size alarms

import type { SessionUser } from "../../../shared/types"
import { fail, json } from "../../../shared/workers/http"
import { d1Query } from "../../../shared/workers/d1-rest"
import type { Env } from "./env"
import {
  acceptPendingInvites,
  applyMigration,
  createTeam,
  d1Config,
  listMyTeams,
} from "./lib/teams"
import {
  checkDatabaseSizes,
  moveModuleToOwnDatabase,
} from "./lib/sharding"
import { TEAM_MIGRATIONS, type Actor } from "./team-schema"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      switch (route) {
        case "POST /api/tenancy/bootstrap":
          return await bootstrap(request, env)
        case "GET /api/tenancy/teams":
          return await myTeams(request, env)
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
      console.error("tenancy worker error:", e)
      const message = e instanceof Error ? e.message : ""
      if (message.startsWith("cloud_key_missing:"))
        return fail(503, "cloud_key_missing", "Brimba's cloud key isn't set up yet — team creation is paused.")
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
