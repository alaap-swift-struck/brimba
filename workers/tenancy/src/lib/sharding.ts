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
import { numberVar } from "../../../../shared/workers/limits"
import { shardCount } from "../../../../shared/workers/realtime"
import { opsDatabase } from "../../../../shared/workers/ops-db"
import {
  CORE_RETENTION,
  OPS_RETENTION,
  EXPIRED_SESSIONS_SQL,
  TEAM_RETENTION,
  cutoffFor,
  type RetentionRule,
} from "../../../../shared/workers/retention"
import type { Env } from "../env"

/** 65% of D1's 10 GB per-database cap.
 *
 * It was 80%, which sounds cautious and is not: relieving a full database means
 * creating a database, copying millions of rows through the REST door, verifying
 * counts and flipping routing. 2 GB of headroom is days at the growth rate a
 * large tenant actually has, and you cannot start that work the week you find
 * out. 65% leaves 3.5 GB — long enough to notice, decide and act without it
 * being an incident. (Scaling review, 2026-08-11.) */
export const ALERT_THRESHOLD_BYTES = Math.floor(6.5 * 1024 * 1024 * 1024)

/** The SHARED database (`<project>-core`, `<project>-core-staging`). It carries
 * every tenant at once, so it is watched on the same schedule and the same
 * threshold — but nothing can move a module out of it. Its alarm means
 * "partition or prune", not "run the mover". */
const CORE_DB_NAMES = /-core(-staging)?$/
const COPY_BATCH = 250

/** Nightly: size every database this project owns, alarm on anything ≥ the
 * threshold.
 *
 * INCLUDING THE CORE DATABASE. It used to check only `team-*`, which left the
 * one database that carries EVERY tenant — users, memberships, sessions,
 * invites, the error log, account activity, agent usage — as the only one
 * nobody was watching. Per-team sharding does nothing for it: it holds the SUM
 * of all tenants, so it is the first shared thing to reach D1's 10 GB cap and it
 * has no mover to relieve it. (Scaling review, 2026-08-11.) */
export async function checkDatabaseSizes(
  env: Env,
  cfg: D1Rest
): Promise<{ checked: number; alerted: string[] }> {
  const all = await d1ListDatabases(cfg)
  const watched = all.filter((db) => db.name.startsWith("team-") || CORE_DB_NAMES.test(db.name))
  const alerted: string[] = []

  for (const db of watched) {
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
  return { checked: watched.length, alerted }
}

/**
 * Nightly: raise the live-channel shard count for any team that has outgrown a
 * single channel object. The fourth relief valve, and the only one that acts on
 * REQUESTS rather than on stored bytes.
 *
 * Only teams past the first threshold are even looked at — `shardCount` needs
 * more than one shard only above 10,000 members, so the HAVING clause turns a
 * scan of every membership into a handful of rows however many tenants exist.
 *
 * THE UPDATE ONLY EVER RAISES (`shard_count < ?`). A team that shrinks keeps its
 * shards: over-splitting costs a few extra sends per publish, while under-
 * splitting would strand every socket sitting above the new count. The predicate
 * rides the UPDATE (R17), so a night where nothing grew moves zero rows and
 * writes nothing.
 */
export async function recomputeShardCounts(env: Env): Promise<{ raised: string[] }> {
  const { results } = await env.DB.prepare(
    `SELECT team_id, COUNT(*) AS members FROM team_members
      WHERE deactivated_at IS NULL
      GROUP BY team_id HAVING COUNT(*) > ?`
  )
    .bind(SHARD_THRESHOLD_MEMBERS)
    .all<{ team_id: string; members: number }>()

  const raised: string[] = []
  for (const row of results ?? []) {
    const want = shardCount(row.members)
    const res = await env.DB.prepare(
      "UPDATE teams SET shard_count = ? WHERE id = ? AND shard_count < ?"
    )
      .bind(want, row.team_id, want)
      .run()
    if (res.meta.changes > 0) {
      raised.push(`${row.team_id}→${want}`)
      console.log(`live channel split: team ${row.team_id} now uses ${want} shards`)
    }
  }
  return { raised }
}

/** Below this a team always fits one channel object, so the nightly recompute
 * need not consider it at all. Derived from `shardCount`, not guessed — a test
 * asserts the two agree, so changing the ladder cannot silently strand teams
 * between the threshold and the first split. */
export const SHARD_THRESHOLD_MEMBERS = 10_000

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
  // Flip the counter the REQUEST PATH reads. Until this row lands, every module
  // lib is still asking for the team's main database — which is why the delete
  // below has to come after it, and never before. (Before the scaling review of
  // 2026-08-11 nothing read the routing at all, so this step copied the data,
  // deleted the originals, and left the module blank.)
  await env.DB.prepare(
    "UPDATE teams SET moved_modules = moved_modules + 1 WHERE id = ?"
  )
    .bind(teamId)
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

/* ------------------------------- retention -------------------------------- */

/** Delete what a rule says may be forgotten, in BOUNDED batches.
 *
 * The batch matters. A first sweep of a table nobody has ever pruned could match
 * millions of rows, and one unbounded DELETE would sit inside D1's 30-second
 * statement limit and lose the lot. So each pass removes at most
 * `SWEEP_BATCH` rows and the next night takes the next slice: the table drains
 * over a few nights instead of the sweep failing every night for ever. */
const SWEEP_BATCH = 5000

async function sweep(
  run: (sql: string, params: unknown[]) => Promise<unknown>,
  rules: RetentionRule[],
  env: Record<string, string | undefined>
): Promise<{ table: string; days: number }[]> {
  const swept: { table: string; days: number }[] = []
  for (const rule of rules) {
    const days = numberVar(env[rule.envVar], rule.days)
    const cutoff = cutoffFor(rule, days)
    if (!cutoff) continue // KEEP_FOREVER — the audit tables, until an owner says otherwise
    await run(
      `DELETE FROM ${rule.table} WHERE rowid IN (
         SELECT rowid FROM ${rule.table} WHERE ${rule.column} < ? LIMIT ${SWEEP_BATCH}
       )`,
      [cutoff]
    )
    swept.push({ table: rule.table, days })
  }
  return swept
}

/** Nightly: forget what may be forgotten. Logs only — never a record. See
 * shared/workers/retention.ts for what that distinction means and why the audit
 * tables are off by default. */
export async function runRetention(
  env: Env,
  cfg: D1Rest
): Promise<{ core: number; teams: number }> {
  const vars = env as unknown as Record<string, string | undefined>

  // An expired session cannot be used by anyone, so there is no window to pick.
  await env.DB.prepare(EXPIRED_SESSIONS_SQL).bind(new Date().toISOString()).run()

  const core = await sweep(
    async (sql, params) => env.DB.prepare(sql).bind(...(params as string[])).run(),
    CORE_RETENTION,
    vars
  )

  // The two exhaust tables moved to the operations database, so their sweep has
  // to follow them. Without this the job would prune an empty table in the old
  // database every night, report success, and let the real one grow unchecked —
  // the worst shape a housekeeping bug can take.
  const opsDb = opsDatabase(env)
  const ops = await sweep(
    async (sql, params) => opsDb.prepare(sql).bind(...(params as string[])).run(),
    OPS_RETENTION,
    vars
  )

  let teams = 0
  if (TEAM_RETENTION.some((r) => numberVar(vars[r.envVar], r.days) > 0)) {
    // Only walk the team databases when a team rule is actually switched ON —
    // otherwise this is a nightly listing of every database in the account for
    // no reason at all.
    const all = await d1ListDatabases(cfg)
    for (const db of all.filter((d) => d.name.startsWith("team-"))) {
      await sweep(async (sql, params) => d1Query(cfg, db.uuid, sql, params as string[]), TEAM_RETENTION, vars)
      teams++
    }
  }
  return { core: core.length + ops.length, teams }
}

/** How long an uploaded file may sit unreferenced before it is considered
 * abandoned. This is the whole safety of the sweep: someone who picks a file and
 * then takes an hour writing the article has an object in the bucket that no row
 * points at YET. A grace period measured in days makes that impossible to get
 * wrong; measured in minutes it would delete their attachment while they typed. */
export const ORPHAN_GRACE_DAYS = 7

/** Never walk more than this many objects for one team in one night. A sweep
 * that tries to list an unbounded bucket is the same mistake as an unbounded
 * list endpoint (R14) — it just fails at 3am instead of in front of someone. */
const ORPHAN_SCAN_CAP = 10_000

/**
 * Nightly: delete uploaded files that no record points at.
 *
 * THE GAP THIS CLOSES. Every other kind of growth in this system is now bounded
 * — logs are swept, lists are capped, uploads are size-limited. Object storage
 * was not, and it grows in a way nobody sees: pick a file, change your mind,
 * pick another, and the first one stays in the bucket for ever. Nothing links to
 * it, nothing lists it, and no screen would ever show it to you. It is charged
 * for anyway.
 *
 * The reference set comes from the team's OWN database — an object survives if
 * any learning row's `content_link` names it. Deactivated rows count: the base
 * is deactivate-not-delete, so a retired article still has its attachment, and
 * reactivating it must not find a hole where the file was.
 */
export async function sweepOrphanedUploads(
  env: Env,
  cfg: D1Rest
): Promise<{ scanned: number; deleted: number }> {
  const cutoff = Date.now() - ORPHAN_GRACE_DAYS * 86_400_000
  let scanned = 0
  let deleted = 0

  const teams = await env.DB.prepare(
    "SELECT id, database_id FROM teams WHERE db_status = 'ready' AND database_id IS NOT NULL"
  ).all<{ id: string; database_id: string }>()

  for (const team of teams.results ?? []) {
    // What this team's records actually point at. Read FIRST: if this read
    // fails, the sweep for this team is skipped entirely rather than running
    // with an empty reference set and deleting everything it can see.
    let referenced: Set<string>
    try {
      const rows = await d1Query<{ content_link: string | null }>(
        cfg,
        team.database_id,
        `SELECT content_link FROM learning WHERE content_link LIKE '/media/learning/%' LIMIT ${ORPHAN_SCAN_CAP}`
      )
      referenced = new Set(
        rows
          .map((r) => r.content_link?.split("?")[0].replace("/media/learning/", "") ?? "")
          .filter(Boolean)
      )
    } catch (e) {
      console.error(`orphan sweep: skipping team ${team.id}, could not read its references:`, e)
      continue
    }

    const listed = await env.LEARNING_MEDIA.list({ prefix: `${team.id}/`, limit: ORPHAN_SCAN_CAP })
    for (const object of listed.objects) {
      scanned++
      if (referenced.has(object.key)) continue
      if (object.uploaded.getTime() > cutoff) continue // inside the grace period
      await env.LEARNING_MEDIA.delete(object.key)
      deleted++
    }
    if (listed.truncated)
      console.warn(`orphan sweep: team ${team.id} has more than ${ORPHAN_SCAN_CAP} objects — the rest wait for tomorrow`)
  }
  return { scanned, deleted }
}
