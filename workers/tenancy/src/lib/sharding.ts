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
import { logActivity, SYSTEM_ACTOR } from "../../../../shared/workers/activity"
import { recordWorkerError } from "../../../../shared/workers/error-log"

/** 80% of D1's 10 GB per-database cap — the OWNER'S number, 2026-08-25.
 *
 * A code change had moved this to 65% while ARCHITECTURE.md, OPERATIONS.md,
 * BASE-MANUAL.md and CONVENTIONS.md all still said 80%, and the alarm's own
 * message said 80% while firing at 65%. The owner settled it: 80% is correct, so
 * the code moves rather than the four documents.
 *
 * What that costs, recorded so it is a decision and not a drift: relieving a full
 * database means creating one, copying millions of rows through the REST door,
 * verifying counts and flipping routing. 80% leaves 2 GB of headroom where 65%
 * left 3.5 GB — days rather than weeks at a large tenant's growth rate. The
 * mitigation is that the alarm is checked nightly and reported, so 2 GB is a
 * warning with time in it rather than a surprise. */
export const ALERT_THRESHOLD_BYTES = Math.floor(8 * 1024 * 1024 * 1024)

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
      `D1 SIZE ALARM: ${db.name} is at ${db.file_size} bytes (>=${Math.round((ALERT_THRESHOLD_BYTES / (10 * 1024 ** 3)) * 100)}% of cap). Run the module mover.`
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

  // A MOVE IS A CHANGE TO THIS TEAM'S DATA, so it leaves a trace like any other.
  // Background work has no signed-in person behind it; rather than write a blank
  // actor — which reads as "nobody knows who did this" — it signs its own row.
  // (activity_log_review 2026-08-18, criterion 3: the weakest surface was
  // scheduled work, which wrote and logged nothing.)
  await logActivity(cfg, newDbId, SYSTEM_ACTOR, {
    type: "Module relocated",
    verb: "edited",
    description: `The ${module} module was moved to its own database (${movedRows} rows)`,
    relatedTable: "team_module_databases",
    relatedRowId: teamId,
  })

  return { databaseId: newDbId, movedRows }
}

/* ------------------------------- retention -------------------------------- */

/** Delete what a rule says may be forgotten, one BOUNDED batch at a time.
 *
 * The batch matters. A first sweep of a table nobody has ever pruned could match
 * millions of rows, and one unbounded DELETE would sit inside D1's 30-second
 * statement limit and lose the lot. So each STATEMENT removes at most
 * `SWEEP_BATCH` rows. That part was always right and does not change. */
const SWEEP_BATCH = 5000

/** How many of those statements ONE rule may issue in ONE run.
 *
 * WHY THERE IS A LOOP AT ALL. Until 2026-08-25 this file issued exactly one
 * DELETE per rule per night and called it retention. It is not: it is a speed
 * limit, and it sat below the speed the tables grow at. `idempotency_keys` takes
 * a row per protected mutation (every form submit sets the key), `login_codes`
 * one per sign-in request, and `error_logs` one per crash — on a path an
 * anonymous caller can reach. All three live in shared databases capped at 10 GB
 * that every tenant is behind and that NO mover can relieve. A table inserting
 * more than 5,000 rows a day therefore grew without bound *while having a
 * retention rule*, and the old comment here — "the table drains over a few
 * nights" — was true of a one-off backlog and false in steady state.
 * (Scaling review, 2026-08-25, blocker 2.)
 *
 * WHY THE LOOP IS BOUNDED. A cron with an open-ended loop is its own outage. 20
 * passes × 5,000 rows = 100,000 rows per rule per night, twenty times the
 * fastest insert rate the review measured.
 *
 * WHAT THE BOUND COSTS, because this invocation is already near a ceiling. A
 * Worker invocation may make 10,000 subrequests and 1,000 D1 queries, and this
 * one cron shares a single invocation between the size check, retention and the
 * orphan sweep — whose O(teams) walk the review measured at roughly 3,333 teams.
 * The core and ops sweeps are FIXED cost: one database each, five rules switched
 * on today, so the loop adds at most 5 × (20 − 1) = 95 statements a night
 * however many tenants exist. That is under 1% of the subrequest ceiling and
 * about a tenth of the D1-query one, and it moves the team ceiling by ~32 teams
 * out of 3,333. */
const SWEEP_MAX_PASSES = 20

/** The same bound for a PER-TEAM rule, where the cost is NOT fixed: that pass
 * runs once per team inside the same invocation, so every extra pass is another
 * subrequest per team and lowers the ~3,333-team ceiling in direct proportion.
 * ONE, therefore — exactly today's behaviour — until the team walk itself has a
 * cursor and a subrequest budget to spend (scaling review, major 7). A team rule
 * that cannot keep up is not hidden by this: a bound that is hit is REPORTED
 * either way, so this is a stated limit rather than a silent one. Nothing is
 * swept per team today in any case — TEAM_RETENTION's one rule is KEEP_FOREVER. */
const TEAM_SWEEP_MAX_PASSES = 1

/** What one rule's sweep did — and, the part that matters, WHY IT STOPPED.
 *
 * Running out of rows and running out of budget look identical from outside and
 * mean opposite things: the first is a table kept clean, the second is retention
 * losing the race against the table it prunes. A partial sweep that reports like
 * a complete one is how the old ceiling stayed invisible for months. */
type SweepResult = { table: string; days: number; removed: number; shortfall: boolean }

async function sweep(
  /** Runs one statement and answers HOW MANY ROWS IT REMOVED — however its own
   * door reports that. The native binding counts with `meta.changes`; the REST
   * door hands back rows and nothing else, so it appends `RETURNING rowid` and
   * counts what came back. Same guarantee, two dialects (as in teams.ts). */
  run: (sql: string, params: unknown[]) => Promise<number>,
  rules: RetentionRule[],
  env: Record<string, string | undefined>,
  maxPasses: number
): Promise<SweepResult[]> {
  const swept: SweepResult[] = []
  for (const rule of rules) {
    const days = numberVar(env[rule.envVar], rule.days)
    const cutoff = cutoffFor(rule, days)
    if (!cutoff) continue // KEEP_FOREVER — the audit tables, until an owner says otherwise
    let removed = 0
    let shortfall = false
    for (let pass = 1; ; pass++) {
      const gone = await run(
        `DELETE FROM ${rule.table} WHERE rowid IN (
           SELECT rowid FROM ${rule.table} WHERE ${rule.column} < ? LIMIT ${SWEEP_BATCH}
         )`,
        [cutoff]
      )
      removed += gone
      // A SHORT batch is the only honest way to stop: fewer rows came back than
      // were asked for, so there are no more older than the cutoff.
      if (gone < SWEEP_BATCH) break
      // The other way is the bound, and it is the one that has to be heard.
      if (pass >= maxPasses) {
        shortfall = true
        break
      }
    }
    swept.push({ table: rule.table, days, removed, shortfall })
  }
  return swept
}

/** Nightly: forget what may be forgotten. Logs only — never a record. See
 * shared/workers/retention.ts for what that distinction means and why the audit
 * tables are off by default. */
export async function runRetention(
  env: Env,
  cfg: D1Rest
): Promise<{ core: number; teams: number; shortfalls: string[] }> {
  const vars = env as unknown as Record<string, string | undefined>
  const shortfalls: string[] = []
  const note = (scope: string, results: SweepResult[]) => {
    for (const r of results)
      if (r.shortfall) shortfalls.push(`${scope}.${r.table} (${r.removed} removed, more remain)`)
  }

  // A native binding reports its own row count, so it needs no RETURNING.
  const native = (db: D1Database) => async (sql: string, params: unknown[]) => {
    const res = await db.prepare(sql).bind(...(params as string[])).run()
    return res.meta.changes ?? 0
  }

  // An expired session cannot be used by anyone, so there is no window to pick.
  await env.DB.prepare(EXPIRED_SESSIONS_SQL).bind(new Date().toISOString()).run()

  const core = await sweep(native(env.DB), CORE_RETENTION, vars, SWEEP_MAX_PASSES)
  note("core", core)

  // The two exhaust tables moved to the operations database, so their sweep has
  // to follow them. Without this the job would prune an empty table in the old
  // database every night, report success, and let the real one grow unchecked —
  // the worst shape a housekeeping bug can take.
  const opsDb = opsDatabase(env)
  const ops = await sweep(native(opsDb), OPS_RETENTION, vars, SWEEP_MAX_PASSES)
  note("ops", ops)

  let teams = 0
  if (TEAM_RETENTION.some((r) => numberVar(vars[r.envVar], r.days) > 0)) {
    // Only walk the team databases when a team rule is actually switched ON —
    // otherwise this is a nightly listing of every database in the account for
    // no reason at all.
    const all = await d1ListDatabases(cfg)
    for (const db of all.filter((d) => d.name.startsWith("team-"))) {
      // The REST door answers with rows, so it asks for the ones it removed.
      const swept = await sweep(
        async (sql, params) =>
          (await d1Query(cfg, db.uuid, `${sql} RETURNING rowid`, params as string[])).length,
        TEAM_RETENTION,
        vars,
        TEAM_SWEEP_MAX_PASSES
      )
      note(`team ${db.name}`, swept)
      teams++
    }
  }

  // A BOUND THAT WAS HIT IS THE SIGNAL — say it where someone will find it.
  //
  // A rule that stopped because its budget ran out, rather than because the
  // table was clean, means the table is growing faster than the job that prunes
  // it and the shared 10 GB database behind it is filling. That is exactly the
  // condition the loop exists to survive rather than hide, so it cannot be a
  // console line: nothing in this cron's other failure paths outlives the log
  // buffer, and nobody is watching a 3am tail. It goes to the ONE error store,
  // which has history and a resolve workflow (LAW R12, ERROR-HANDLING.md).
  //
  // ONE row per run however many rules fell short: the sweep that could not keep
  // up must not become the next unbounded writer.
  if (shortfalls.length) {
    const detail = `retention stopped on its per-run bound for ${shortfalls.length} rule(s) — those tables are growing faster than the sweep: ${shortfalls.slice(0, 8).join("; ")}`
    console.error(`RETENTION SHORTFALL: ${detail}`)
    await recordWorkerError(opsDatabase(env), "tenancy", "cron/retention", new Error(detail))
  }
  return { core: core.length + ops.length, teams, shortfalls }
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
/** One page of the reference read. Keyset, so the pages cannot overlap or gap. */
const ORPHAN_PAGE = 1_000

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
    // PAGED, and fail-closed if it cannot be completed. The reference set must be
    // WHOLE: the delete loop below walks objects in KEY order while this read
    // returns rows in whatever order the database chooses, so a truncated
    // reference set is not a smaller sweep — it is a set that disagrees with the
    // one being deleted from, and every referenced object missing from it is
    // deleted once the grace period passes. A single `LIMIT` here silently lost
    // real attachments above the cap. (Scaling review, 2026-08-25.)
    let referenced: Set<string>
    try {
      referenced = new Set<string>()
      let after = ""
      for (;;) {
        const rows = await d1Query<{ id: string; content_link: string | null }>(
          cfg,
          team.database_id,
          `SELECT id, content_link FROM learning
             WHERE content_link LIKE '/media/learning/%'${after ? ` AND id > ${sqlValue(after)}` : ""}
             ORDER BY id LIMIT ${ORPHAN_PAGE}`
        )
        for (const r of rows) {
          const key = r.content_link?.split("?")[0].replace("/media/learning/", "") ?? ""
          if (key) referenced.add(key)
        }
        if (rows.length < ORPHAN_PAGE) break
        after = rows[rows.length - 1].id
        // A bound, because an unbounded loop on a cron is its own fault. Hitting
        // it means the set is incomplete, which is exactly the case that must
        // NOT proceed to deletion.
        if (referenced.size > ORPHAN_SCAN_CAP)
          throw new Error(`more than ${ORPHAN_SCAN_CAP} referenced attachments`)
      }
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
