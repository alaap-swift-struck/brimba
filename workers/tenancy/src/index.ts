// Brimba TENANCY worker — teams, memberships, and the team-database factory.
//
//   POST /api/tenancy/bootstrap            -> after onboarding: accept invites
//                                             OR create the personal team
//   GET  /api/tenancy/teams                -> my teams (for switcher + home)
//   POST /api/tenancy/admin/migrate-teams  -> roll new team-schema migrations
//                                             to EVERY team DB (x-admin-key)
//   GET  /api/tenancy/health

import type { ApiError, SessionUser } from "../../../shared/types"
import { d1Query } from "../../../shared/workers/d1-rest"
import type { Env } from "./env"
import {
  acceptPendingInvites,
  applyMigration,
  createTeam,
  d1Config,
  listMyTeams,
} from "./lib/teams"
import { TEAM_MIGRATIONS, type Actor } from "./team-schema"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const fail = (status: number, error: string, message: string) =>
  json({ error, message } satisfies ApiError, status)

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
} satisfies ExportedHandler<Env>

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
  if (!env.ADMIN_KEY) return fail(503, "admin_key_missing", "Maintenance key not set.")
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return fail(403, "forbidden", "Bad maintenance key.")

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
