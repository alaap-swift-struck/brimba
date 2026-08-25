// Maintenance routes (x-admin-key only): the team-schema migration robot, the
// on-demand DB size check, and the module mover. The sharding machinery lives
// in lib/sharding; these just guard + drive it.

import { fail, json } from "../../../../shared/workers/http"
import { d1Query } from "../../../../shared/workers/d1-rest"
import { TEXT_LIMITS, optionalText, requireText } from "../../../../shared/workers/validate"
import { checkDatabaseSizes, moveModuleToOwnDatabase } from "../lib/sharding"
import { applyMigration, d1Config } from "../lib/teams"
import { adminGuard } from "../context"
import { TEAM_MIGRATIONS } from "../team-schema"
import type { Env } from "../env"

/** How many team databases ONE call migrates.
 *
 * Every team in the page costs at least one REST round-trip to read its applied
 * versions, plus one per missing migration, plus a core UPDATE — against a
 * Worker invocation's fixed subrequest and wall-clock ceilings. The old handler
 * walked EVERY ready team in a single call, so the rollout machine was
 * guaranteed to start failing as the tenant count grew, and to fail PARTWAY:
 * some databases migrated, some not, and a non-200 that says nothing about
 * where it stopped. 50 keeps one call comfortably inside the ceiling with room
 * for a team that is many migrations behind. */
const MIGRATE_PAGE = 50

/**
 * The migration robot (locked: per-team databases need a once-built rollout
 * machine). Applies any not-yet-applied team-schema migration to a PAGE of ready
 * team databases. Protected by the ADMIN_KEY secret.
 *
 * RESUMABLE, in the same shape the nightly sweep uses: pass `?after=<teamId>` to
 * continue, and the answer says whether there is more to do. Call it in a loop
 * until `done` — see OPERATIONS.md / BOOTSTRAP.md.
 *
 *   POST /api/tenancy/admin/migrate-teams            -> { done, nextAfter, … }
 *   POST /api/tenancy/admin/migrate-teams?after=<id> -> the next page
 */
export async function migrateTeams(request: Request, env: Env): Promise<Response> {
  const denied = adminGuard(request, env)
  if (denied) return denied

  // Validated at the boundary even behind the admin key (R: never trust a
  // request). It is a bound parameter, so this is a length cap and a type check
  // rather than an injection guard — but an unbounded string still has no
  // business reaching a query.
  const after = optionalText(
    new URL(request.url).searchParams.get("after"),
    "after",
    TEXT_LIMITS.short
  ) ?? ""

  const cfg = d1Config(env)
  // Keyset, in id order, so pages tile exactly once with no overlap and no gap
  // even while teams are being created underneath the loop.
  const teams = await env.DB.prepare(
    `SELECT id, database_id, schema_version FROM teams
      WHERE db_status = 'ready' AND deactivated_at IS NULL AND id > ?
      ORDER BY id LIMIT ${MIGRATE_PAGE}`
  )
    .bind(after)
    .all<{ id: string; database_id: string; schema_version: string }>()
  const page = teams.results ?? []

  const latest = TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version
  let migrated = 0
  for (const team of page) {
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

  // A SHORT page is the only honest "that was all of them" — the same rule the
  // retention sweep and the orphan sweep stop on. `nextAfter` is null when done
  // so a caller cannot accidentally loop for ever on a cursor that never clears.
  const done = page.length < MIGRATE_PAGE
  return json({
    ok: true,
    done,
    nextAfter: done ? null : page[page.length - 1].id,
    teamsChecked: page.length,
    teamsMigrated: migrated,
  })
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
  // The team id through the boundary seam. `tables` must be a real ARRAY, not just
  // something with a truthy `.length`: a bare string passed that test and then threw
  // on `.some(...)` — a 500 on bad input, which is exactly what the seam exists to
  // stop. (Security round 5.)
  const teamId = requireText(body.teamId, "teamId", TEXT_LIMITS.short)
  if (!body.module || !Array.isArray(body.tables) || !body.tables.length)
    return fail(400, "invalid_input", "teamId, module and tables are required.")
  // Table/module names are interpolated into DDL/DML downstream (the script API
  // has no identifier params) — so they must be STRICT SQL identifiers here at
  // the boundary. Kills injection even for an admin-key holder (defense-in-depth).
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
  if (!IDENT.test(body.module) || body.tables.some((t) => typeof t !== "string" || !IDENT.test(t)))
    return fail(400, "invalid_input", "module and tables must be plain SQL identifiers (letters, digits, underscores).")

  const result = await moveModuleToOwnDatabase(
    env,
    d1Config(env),
    teamId,
    body.module,
    body.tables
  )
  return json({ ok: true, ...result })
}
