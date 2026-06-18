// Maintenance routes (x-admin-key only): the team-schema migration robot, the
// on-demand DB size check, and the module mover. The sharding machinery lives
// in lib/sharding; these just guard + drive it.

import { fail, json } from "../../../../shared/workers/http"
import { d1Query } from "../../../../shared/workers/d1-rest"
import { checkDatabaseSizes, moveModuleToOwnDatabase } from "../lib/sharding"
import { applyMigration, d1Config } from "../lib/teams"
import { adminGuard } from "../context"
import { TEAM_MIGRATIONS } from "../team-schema"
import type { Env } from "../env"

/**
 * The migration robot (locked: per-team databases need a once-built rollout
 * machine). Applies any not-yet-applied team-schema migration to every ready
 * team database. Protected by the ADMIN_KEY secret.
 */
export async function migrateTeams(request: Request, env: Env): Promise<Response> {
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
export async function dbSizes(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  const result = await checkDatabaseSizes(env, d1Config(env))
  const open = await env.DB.prepare(
    "SELECT database_name, size_bytes, created_at FROM db_alerts WHERE resolved_at IS NULL"
  ).all()
  return json({ ...result, openAlerts: open.results ?? [] })
}

/** The mover: POST { teamId, module, tables: [...] } with x-admin-key. */
export async function moveModule(request: Request, env: Env): Promise<Response> {
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
