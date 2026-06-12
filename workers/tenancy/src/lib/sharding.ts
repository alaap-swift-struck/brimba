// The sharding machinery (locked decision: built up front).
//
// Relief valves, in order of reach:
//  1. ALARM  — nightly cron sizes every team database; ≥80% of D1's 10GB cap
//              writes a db_alerts row + screams into the worker logs.
//  2. MOVER  — relocates one module's tables out of a team's database into a
//              dedicated database, recorded in team_module_databases.
//  3. SPLIT  — reads for a (team, module) can span several databases via
//              resolveModuleDatabases() + d1QueryAcross() (the merged-read
//              path modules will use).

import {
  d1CreateDatabase,
  d1ExecScript,
  d1ListDatabases,
  d1Query,
  d1QueryAcross,
  sqlValue,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"

/** 80% of D1's 10GB per-database cap. */
export const ALERT_THRESHOLD_BYTES = 8 * 1024 * 1024 * 1024
const COPY_BATCH = 250

/** Nightly: size every team database, alarm on anything ≥ the threshold. */
export async function checkDatabaseSizes(
  env: Env,
  cfg: D1Rest
): Promise<{ checked: number; alerted: string[] }> {
  const all = await d1ListDatabases(cfg)
  const teamDbs = all.filter((db) => db.name.startsWith("team-"))
  const alerted: string[] = []

  for (const db of teamDbs) {
    if ((db.file_size ?? 0) < ALERT_THRESHOLD_BYTES) continue

    const open = await env.DB.prepare(
      "SELECT id FROM db_alerts WHERE database_id = ? AND resolved_at IS NULL"
    )
      .bind(db.uuid)
      .first<{ id: string }>()
    if (open) continue // already alarmed, don't spam

    await env.DB.prepare(
      `INSERT INTO db_alerts (id, database_id, database_name, size_bytes, threshold_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        ulid(),
        db.uuid,
        db.name,
        db.file_size ?? 0,
        ALERT_THRESHOLD_BYTES,
        new Date().toISOString()
      )
      .run()
    console.error(
      `D1 SIZE ALARM: ${db.name} is at ${db.file_size} bytes (>=80% of cap). Run the module mover.`
    )
    alerted.push(db.name)
  }
  return { checked: teamDbs.length, alerted }
}

/**
 * Where does (team, module) live? The team's main database plus any dedicated
 * database the mover created. Modules read with d1QueryAcross over this list.
 */
export async function resolveModuleDatabases(
  env: Env,
  teamId: string,
  module: string
): Promise<string[]> {
  const team = await env.DB.prepare(
    "SELECT database_id FROM teams WHERE id = ? AND db_status = 'ready'"
  )
    .bind(teamId)
    .first<{ database_id: string }>()
  if (!team) throw new Error(`team_not_ready: ${teamId}`)

  const override = await env.DB.prepare(
    "SELECT database_id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(teamId, module)
    .first<{ database_id: string }>()

  // Override FIRST (it's where new writes go), main DB second (older rows
  // pre-move live there until fully relocated — merged reads see both).
  return override
    ? [override.database_id, team.database_id]
    : [team.database_id]
}

/** Merged read across everywhere a (team, module) lives. */
export async function queryModule<Row = Record<string, unknown>>(
  env: Env,
  cfg: D1Rest,
  teamId: string,
  module: string,
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  const dbs = await resolveModuleDatabases(env, teamId, module)
  return d1QueryAcross<Row>(cfg, dbs, sql, params)
}

/**
 * THE MOVER: relocate a module's tables from a team's main database into a
 * brand-new dedicated database. Copies schema + indexes + rows (batched),
 * verifies counts, flips routing, then empties the old tables. Any open size
 * alarm for the source database is marked resolved.
 */
export async function moveModuleToOwnDatabase(
  env: Env,
  cfg: D1Rest,
  teamId: string,
  module: string,
  tables: string[]
): Promise<{ databaseId: string; movedRows: number }> {
  const team = await env.DB.prepare(
    "SELECT database_id FROM teams WHERE id = ? AND db_status = 'ready'"
  )
    .bind(teamId)
    .first<{ database_id: string }>()
  if (!team) throw new Error(`team_not_ready: ${teamId}`)

  const existing = await env.DB.prepare(
    "SELECT id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(teamId, module)
    .first<{ id: string }>()
  if (existing) throw new Error(`module_already_moved: ${module}`)

  const newDbId = await d1CreateDatabase(
    cfg,
    `team-${teamId.toLowerCase()}-${module.replaceAll("_", "-")}`
  )

  let movedRows = 0
  for (const table of tables) {
    // 1 · Recreate the table + its indexes exactly as they exist today.
    const ddl = await d1Query<{ sql: string }>(
      cfg,
      team.database_id,
      "SELECT sql FROM sqlite_master WHERE name = ? AND type = 'table'",
      [table]
    )
    if (!ddl[0]) throw new Error(`table_not_found: ${table}`)
    await d1ExecScript(cfg, newDbId, ddl[0].sql)

    const indexes = await d1Query<{ sql: string }>(
      cfg,
      team.database_id,
      "SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = 'index' AND sql IS NOT NULL",
      [table]
    )
    for (const idx of indexes) await d1ExecScript(cfg, newDbId, idx.sql)

    // 2 · Copy rows in batches (values inlined — the script API has no params;
    //     team tables hold text/numbers only, no blobs).
    for (let offset = 0; ; offset += COPY_BATCH) {
      const rows = await d1Query<Record<string, string | number | null>>(
        cfg,
        team.database_id,
        `SELECT * FROM ${table} LIMIT ${COPY_BATCH} OFFSET ${offset}`
      )
      if (rows.length === 0) break
      const cols = Object.keys(rows[0])
      const values = rows
        .map((r) => `(${cols.map((c) => sqlValue(r[c])).join(", ")})`)
        .join(",\n")
      await d1ExecScript(
        cfg,
        newDbId,
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${values};`
      )
      movedRows += rows.length
      if (rows.length < COPY_BATCH) break
    }

    // 3 · Verify before touching the source.
    const [src] = await d1Query<{ n: number }>(cfg, team.database_id, `SELECT COUNT(*) AS n FROM ${table}`)
    const [dst] = await d1Query<{ n: number }>(cfg, newDbId, `SELECT COUNT(*) AS n FROM ${table}`)
    if (src.n !== dst.n)
      throw new Error(`copy_mismatch: ${table} src=${src.n} dst=${dst.n}`)
  }

  // 4 · Flip routing, then empty the moved tables in the old home.
  await env.DB.prepare(
    `INSERT INTO team_module_databases (id, team_id, module, database_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(ulid(), teamId, module, newDbId, new Date().toISOString())
    .run()
  for (const table of tables) {
    await d1ExecScript(cfg, team.database_id, `DELETE FROM ${table};`)
  }

  await env.DB.prepare(
    "UPDATE db_alerts SET resolved_at = ? WHERE database_id = ? AND resolved_at IS NULL"
  )
    .bind(new Date().toISOString(), team.database_id)
    .run()

  return { databaseId: newDbId, movedRows }
}
