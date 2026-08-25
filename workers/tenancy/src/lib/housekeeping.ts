// HOUSEKEEPING — forgetting what may be forgotten, and collecting what nothing
// points at any more.
//
// SPLIT OUT OF `sharding.ts`, which had grown to 862 lines doing two jobs that
// share a cron and nothing else. Sharding is about WHERE data lives: sizing
// every database, alarming at 80% of D1's cap, and relocating a heavy module to
// a database of its own. This file is about WHAT MAY BE THROWN AWAY: the
// retention sweep over the log tables, and the orphan sweep over object storage.
// Neither half calls the other. Keeping them together meant every reader of one
// had to scroll past the other, and every change to one risked the other.
//
// THE ONE THING BOTH HALVES SHARE is the nightly invocation they run inside, and
// that is a real constraint rather than a coincidence: a Worker invocation may
// make 10,000 subrequests and 1,000 D1 queries, and this file's two sweeps spend
// most of both. Every bound here — SWEEP_MAX_PASSES, TEAM_SWEEP_MAX_PASSES,
// ORPHAN_TEAMS_PER_NIGHT, ORPHAN_SCAN_CAP — is a slice of that one budget, which
// is why each of them says what it costs the others.

import {
  d1ListDatabases,
  d1Query,
  sqlValue,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { numberVar } from "../../../../shared/workers/limits"
import { opsDatabase } from "../../../../shared/workers/ops-db"
import {
  CORE_RETENTION,
  OPS_RETENTION,
  EXPIRED_SESSIONS_SQL,
  TEAM_RETENTION,
  cutoffFor,
  type RetentionRule,
} from "../../../../shared/workers/retention"
import { recordWorkerError } from "../../../../shared/workers/error-log"
import type { Env } from "../env"

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

/** How many teams the nightly walk visits, and therefore THE WHOLE COST MODEL
 * of this cron.
 *
 * Until this cursor existed the sweep read EVERY ready team and, for each one,
 * paged that team's database and listed its R2 prefix — an O(tenants) walk
 * inside one Worker invocation capped at 10,000 subrequests, in both
 * environments, every night. The measured ceiling was roughly 3,333 teams,
 * beyond which the invocation simply dies partway through and the teams at the
 * end of the list are never swept at all — silently, because the cron's only
 * report is a console line nobody tails.
 *
 * With a cursor the nightly cost is CONSTANT at 200 teams however many tenants
 * exist, and each team is visited on a rota instead of never.
 *
 * THE FULL CYCLE, which is the number that matters for the grace period below:
 *   ≤200 teams    — every team, every night (today's behaviour, unchanged)
 *   3,333 teams   — 17 nights
 *   10,000 teams  — 50 nights
 *
 * WHY THAT IS SAFE, adversarially: a longer cycle does NOT risk deleting a
 * referenced file. Each team's reference set is re-read from that team's own
 * database immediately before that team's objects are listed, so the two sets
 * are always of the same instant — a file referenced at any point before its
 * team's turn is seen as referenced. What a long cycle actually costs is that an
 * ORPHAN lingers up to a cycle longer before it is collected, which is a storage
 * bill and not a data loss. So `ORPHAN_GRACE_DAYS` has to exceed the longest
 * upload-then-reference gap a person can produce (someone picking a file and
 * spending the afternoon writing the article), NOT the cycle length — and 7 days
 * covers that with room. Raising the grace to chase the cycle would make orphans
 * linger longer for no safety gained. It stays at 7. */
const ORPHAN_TEAMS_PER_NIGHT = 200

/** How long the per-team storage meter keeps its history.
 *
 * SHIPPED WITH THE METER, DELIBERATELY. A growth meter with no retention is just
 * a differently-shaped growth problem: it writes a row per team per visit, for
 * ever, into the shared database whose 10 GB cap has no mover to relieve it.
 * The cursor already bounds the write rate to ≤200 rows a night whatever the
 * tenant count (≈73,000 a year, not the ≈3.6M an uncursored walk over 10,000
 * teams would produce), and this bounds the total: ~18,000 rows in the steady
 * state, which is a rounding error against the cap.
 *
 * The canonical home for this window is `CORE_RETENTION` in
 * shared/workers/retention.ts, so an owner can override it per environment like
 * every other window. That file is not this change's to edit — see the TODO at
 * the prune below. Until the rule moves there this prune IS the rule, so the
 * meter has never at any point been unbounded. */
const DB_SIZES_RETAIN_DAYS = 90

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
  cfg: D1Rest,
  /** Where last night stopped. Empty string starts the rota again from the top.
   * NOT named `after`: the reference read below pages with a local of that name,
   * and one of the two is a team id while the other is a learning-row id. */
  resumeAfter = ""
): Promise<{ scanned: number; deleted: number; teams: number; nextCursor: string }> {
  const cutoff = Date.now() - ORPHAN_GRACE_DAYS * 86_400_000
  const at = new Date().toISOString()
  let scanned = 0
  let deleted = 0

  // ONE PAGE OF TEAMS, in id order, resuming where last night stopped. The old
  // read had no LIMIT at all, so the cron's cost grew with the tenant count
  // until the invocation died mid-walk (see ORPHAN_TEAMS_PER_NIGHT).
  const teams = await env.DB.prepare(
    `SELECT id, database_id FROM teams
      WHERE db_status = 'ready' AND database_id IS NOT NULL AND id > ?
      ORDER BY id LIMIT ${ORPHAN_TEAMS_PER_NIGHT}`
  )
    .bind(resumeAfter)
    .all<{ id: string; database_id: string }>()
  const page = teams.results ?? []
  // A SHORT page is the end of the rota, so the cursor resets and tomorrow
  // starts from the top. Without the reset the sweep would run once and then sit
  // for ever at the last team id, never visiting anyone again.
  const nextCursor = page.length < ORPHAN_TEAMS_PER_NIGHT ? "" : page[page.length - 1].id

  for (const team of page) {
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
    // WHAT THIS TEAM STILL COSTS, measured on the one pass that already has
    // every object listed — so the meter is free. Nothing else in the base knows
    // how much storage a tenant uses, so "which customer is the bill" has never
    // been answerable, and a per-team number turns that into an ordered list.
    // Counted as the loop goes, adding only what SURVIVES, so the row records
    // what is actually still in the bucket rather than what was there before.
    let kept = 0
    for (const object of listed.objects) {
      scanned++
      if (referenced.has(object.key) || object.uploaded.getTime() > cutoff) {
        kept += object.size // referenced, or inside the grace period — it stays
        continue
      }
      await env.LEARNING_MEDIA.delete(object.key)
      deleted++
    }
    await env.DB.prepare(
      "INSERT INTO db_sizes (database_id, name, size_bytes, at) VALUES (?, ?, ?, ?)"
    )
      .bind(team.database_id, `r2:learning-media/${team.id}`, kept, at)
      .run()
    if (listed.truncated)
      console.warn(`orphan sweep: team ${team.id} has more than ${ORPHAN_SCAN_CAP} objects — the rest wait for tomorrow`)
  }

  // The meter's own retention, in the same pass that writes it (see
  // DB_SIZES_RETAIN_DAYS). One bounded statement a night against an indexed
  // column, and it can never be the thing that fails the sweep above.
  //
  // TODO(retention): this window belongs in `CORE_RETENTION` in
  // shared/workers/retention.ts as
  //   { table: "db_sizes", column: "at", days: 90,
  //     envVar: "RETAIN_DB_SIZES_DAYS", why: "…" }
  // so an owner can override it per environment like every other window, and so
  // it is swept by the one seam rather than by this special case. That file is
  // owned by another change and is deliberately not edited here — when the rule
  // lands there, DELETE the statement below rather than leaving both.
  await env.DB.prepare("DELETE FROM db_sizes WHERE at < ?")
    .bind(new Date(Date.now() - DB_SIZES_RETAIN_DAYS * 86_400_000).toISOString())
    .run()

  return { scanned, deleted, teams: page.length, nextCursor }
}
