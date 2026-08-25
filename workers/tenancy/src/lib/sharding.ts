// WHERE A TENANT'S DATA LIVES, and what to do when one place has too much of it.
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
//  4. CHANNELS — the request-side valve: raise a team's live-channel shard count
//              once it has outgrown a single Durable Object.
//
// FORGETTING is a different job and lives in `housekeeping.ts` — the retention
// sweep over the log tables and the orphan sweep over object storage. The two
// files share the nightly cron and nothing else; this one was 862 lines because
// they used to share a file too.
//
// What DOES belong here alongside the valves is the nightly job's own state
// (its heartbeat and the per-team cursor) and the account-wide spend alarm:
// both are "is this account healthy", which is the same question the size
// alarms ask, one meter down.

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
 * "partition or prune", not "run the mover".
 *
 * `-ops` JOINED IT on 2026-08-25. The operations database was outside this filter
 * and therefore unwatched, while SIX new writers were pointed at it in a single
 * week — the gateway's central catch, realtime's, the 5xx GuardError branch in
 * four workers, and the retention shortfall row. It is also the one database an
 * ANONYMOUS caller can add rows to, through an error path, and the one the module
 * mover cannot relieve. Watching every database except the one filling fastest is
 * the shape of an alarm that reports all clear. (Scaling review, round 3.) */
const CORE_DB_NAMES = /-(core|ops)(-staging)?$/
const COPY_BATCH = 250

/* --------------------------- the nightly job's own state ------------------- */

/** The one job this file's cron drives. A column rather than a table per job, so
 * a second scheduled job is a row and not a migration. */
const NIGHTLY_JOB = "tenancy-nightly"

/** Two small tables the nightly job keeps for itself, created on first run.
 *
 * WHY HERE AND NOT IN A MIGRATION. They belong in `db/core` and a migration for
 * them is reported alongside this change — but these are the job's OWN
 * bookkeeping, not app records, and an ops job that crashes every night until
 * someone remembers to run a migration is worse than an ops job that makes its
 * own scratchpad. `IF NOT EXISTS` makes this a no-op every night after the
 * first, it runs once per invocation on a cron rather than on any request path,
 * and once the migration lands this simply stops being the thing that created
 * them. (The same self-healing shape as the import catalogue under R13.)
 *
 * BOTH LIVE IN THE CORE DATABASE, beside `db_alerts` — the sizing and alarm
 * state they belong with. They deliberately do NOT join `OPS_TABLES`: that list
 * is pinned to the operations schema and to `OPS_RETENTION`, so a table added to
 * it must be added in two files this change does not own. */
export async function ensureNightlyTables(env: Env): Promise<void> {
  // Where the nightly job got to: its heartbeat, and how far the per-team walk
  // has cursored. One row, upserted — it is state, not history, so it cannot grow.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS cron_runs (
       job TEXT PRIMARY KEY,
       last_run_at TEXT,
       cursor TEXT
     )`
  ).run()
  // The per-team storage meter (below). HISTORY, so it is the one thing here
  // that grows — and it is pruned in the same pass that writes it.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS db_sizes (
       database_id TEXT NOT NULL,
       name TEXT NOT NULL,
       size_bytes INTEGER NOT NULL,
       at TEXT NOT NULL
     )`
  ).run()
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_db_sizes_at ON db_sizes (at)").run()
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_db_sizes_name_at ON db_sizes (name, at)"
  ).run()
  // `agent_usage`'s primary key is (team_id, period), which cannot serve the
  // account-wide roll-up below — that predicate names only `period`, so without
  // this the nightly SUM scans every team's every day. Additive and idempotent.
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_agent_usage_period ON agent_usage (period)"
  ).run()
}

/** When the nightly job last finished, or null if it never has. Read by the
 * digest, which is the only thing that can act on the answer. */
export async function lastCronRunAt(env: Env): Promise<string | null> {
  const row = await env.DB.prepare("SELECT last_run_at FROM cron_runs WHERE job = ?")
    .bind(NIGHTLY_JOB)
    .first<{ last_run_at: string | null }>()
  return row?.last_run_at ?? null
}

/** Where the per-team walk stopped last night. Empty (or never written) starts
 * the rota from the top, which is also exactly what a fresh install wants. */
export async function sweepCursor(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT cursor FROM cron_runs WHERE job = ?")
    .bind(NIGHTLY_JOB)
    .first<{ cursor: string | null }>()
  return row?.cursor ?? ""
}

/** THE HEARTBEAT. A cron that stops firing is otherwise completely invisible:
 * it raises no error, and its silence is indistinguishable from a quiet night.
 * Written last, so it means "the whole pass completed", not "the pass started". */
export async function noteCronHeartbeat(env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cron_runs (job, last_run_at) VALUES (?, ?)
     ON CONFLICT(job) DO UPDATE SET last_run_at = excluded.last_run_at`
  )
    .bind(NIGHTLY_JOB, new Date().toISOString())
    .run()
}

/** Where the per-team walk stopped tonight, so tomorrow starts there.
 *
 * SAVED IMMEDIATELY AFTER THE WALK, not at the end of the whole pass. If this
 * rode along with the heartbeat, anything that threw between the two would leave
 * the cursor unmoved — and a job that fails at the same step every night would
 * re-sweep the same first page for ever while every team behind it went
 * permanently unswept. A starved sweep that looks busy is worse than a loud one. */
export async function noteSweepCursor(env: Env, cursor: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cron_runs (job, cursor) VALUES (?, ?)
     ON CONFLICT(job) DO UPDATE SET cursor = excluded.cursor`
  )
    .bind(NIGHTLY_JOB, cursor)
    .run()
}

/* ------------------------ the account-wide spend alarm --------------------- */

/** Account-wide AI units per day past which somebody should look.
 *
 * THE GAP THIS CLOSES. Every AI quota read in the base is scoped
 * `WHERE team_id = ?`, so each team is capped and the ACCOUNT is not: a hundred
 * teams each politely inside a 50-unit free entitlement is five thousand units a
 * day that nothing anywhere is counting. Per-tenant limits do not add up to a
 * budget, and the first notice of that is the invoice.
 *
 * The number is a smoke alarm, not a cap — it stops nothing, it just makes the
 * account-wide total something a person finds out about. Roughly a hundred teams
 * at the production free allowance; raise it per environment with
 * ACCOUNT_AI_DAILY_ALARM as the tenant count grows. */
export const ACCOUNT_AI_DAILY_ALARM = 5_000

/** The synthetic `db_alerts.database_id` this alarm files under. Real ones are
 * UUIDs, so the prefix cannot collide with a database — and reusing `db_alerts`
 * means this shows up in the existing admin alarm list with no new plumbing. */
const ACCOUNT_SPEND_ALERT_ID = "account:ai-spend"

/**
 * Nightly: is the WHOLE ACCOUNT's AI spend past the line today?
 *
 * On the cron deliberately, and never on a request path: a per-request
 * `SUM(used)` over every team would put a growing aggregate in front of every
 * agent turn, which buys a number nobody reads at a cost everybody pays.
 *
 * Writes a `db_alerts` row rather than an activity row on purpose — this is an
 * account-wide fact with no team behind it, so it has no `relatedTable` that
 * could resolve through `ACTIVITY_GATE_MAP` (LAW R18) and no team whose feed it
 * would belong in. It is an operator's alarm, not a customer's history.
 */
export async function checkAccountAiSpend(
  env: Env
): Promise<{ used: number; cap: number; alarmed: boolean }> {
  const period = new Date().toISOString().slice(0, 10) // the daily metering window
  const cap = numberVar(env.ACCOUNT_AI_DAILY_ALARM, ACCOUNT_AI_DAILY_ALARM)
  // An aggregate, so it returns ONE row however many tenants exist — no cap is
  // needed or meaningful (R14 is about rows returned, and this returns one).
  const row = await env.DB.prepare("SELECT SUM(used) AS used FROM agent_usage WHERE period = ?")
    .bind(period)
    .first<{ used: number | null }>()
  const used = row?.used ?? 0
  if (used < cap) return { used, cap, alarmed: false }

  // Same dedupe as the size alarm: one OPEN row per condition, so a month over
  // budget is one alarm to resolve rather than thirty to wade through.
  const open = await env.DB.prepare(
    "SELECT id FROM db_alerts WHERE database_id = ? AND resolved_at IS NULL"
  )
    .bind(ACCOUNT_SPEND_ALERT_ID)
    .first<{ id: string }>()
  if (open) return { used, cap, alarmed: false }

  await env.DB.prepare(
    `INSERT INTO db_alerts (id, database_id, database_name, size_bytes, threshold_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(ulid(), ACCOUNT_SPEND_ALERT_ID, `account AI spend ${period}`, used, cap, new Date().toISOString())
    .run()

  const detail = `ACCOUNT AI SPEND ALARM: ${used} AI unit(s) used across every team on ${period}, past the ${cap}/day line. Every quota in the base is per-team, so nothing else would have noticed.`
  console.error(detail)
  // Into the store the nightly digest reads, so this reaches a person tonight
  // rather than waiting for someone to open the alarm list. Once per episode,
  // for the same reason the row above is deduped.
  await recordWorkerError(opsDatabase(env), "tenancy", "cron/ai-spend", new Error(detail))
  return { used, cap, alarmed: true }
}

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
    const detail = `D1 SIZE ALARM: ${db.name} is at ${db.file_size} bytes (>=${Math.round((ALERT_THRESHOLD_BYTES / (10 * 1024 ** 3)) * 100)}% of cap). Run the module mover.`
    console.error(detail)
    // AND INTO THE ONE STORE THAT HAS A READER. The `db_alerts` row above is the
    // durable alarm state, but nothing mails it and no screen shows it — this is
    // the same "recorded, never delivered" gap the nightly digest was built to
    // close, so the alarm is routed into the store the digest actually reads.
    // Written only on the transition to open (the dedupe check above returned
    // nothing), so a database sitting at 80% for a month writes ONE row, not
    // thirty: the alarm must not become the next unbounded writer.
    await recordWorkerError(opsDatabase(env), "tenancy", "cron/db-size-alarm", new Error(detail))
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

