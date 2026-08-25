// RETENTION SWEEPS THE EXHAUST AND NEVER THE RECORDS.
//
// The distinction this file protects: a LOG has nothing pointing at it (a used
// login code, an expired session, a two-year-old worker error), while a RECORD
// is referenced by five other things — which is why the base is
// deactivate-never-delete and why no sweep may ever name one.
//
// And the AUDIT tables sit between the two: log-shaped, history in purpose.
// Deleting a customer's audit trail is the product owner's call, so both ship
// KEEP_FOREVER and stay that way until someone deliberately sets a window.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { namedBody, serverSources, stripComments } from "../../../shared/test/source"

import {
  CORE_RETENTION,
  KEEP_FOREVER,
  OPS_RETENTION,
  TEAM_RETENTION,
  cutoffFor,
} from "../../../shared/workers/retention"
import { OPS_TABLES } from "../../../shared/workers/ops-db"

const ALL = [...CORE_RETENTION, ...OPS_RETENTION, ...TEAM_RETENTION]

/** Tables the base may never sweep: every one of them is referenced by another
 * row somewhere, so removing one leaves a dangling reference behind. */
const RECORDS = [
  "users", "teams", "team_members", "member_roles", "role_permissions",
  "invite_index", "invite_logs", "learning", "learning_progress", "help",
  "help_threads", "selectable_data", "agent_threads", "agent_credits",
  "mcp_tokens", "importable_databases", "team_module_databases",
]

describe("retention rules", () => {
  it("never names a RECORD table — those are deactivated, never deleted", () => {
    const offenders = ALL.filter((r) => RECORDS.includes(r.table)).map((r) => r.table)
    expect(
      offenders,
      `a retention rule targets a record table, which other rows reference: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("keeps the AUDIT tables for ever until an owner chooses otherwise", () => {
    for (const table of ["account_activity", "activity"]) {
      const rule = ALL.find((r) => r.table === table)
      expect(rule, `${table} must have a rule so the window is discoverable`).toBeDefined()
      expect(
        rule!.days,
        `${table} is audit history — it must ship KEEP_FOREVER, not a default someone inherits on upgrade`
      ).toBe(KEEP_FOREVER)
    }
  })

  it("sweeps the pure exhaust, and says how long it keeps it", () => {
    for (const table of ["login_codes", "error_logs", "agent_usage_log"]) {
      const rule = ALL.find((r) => r.table === table)!
      expect(rule.days, `${table} must actually be swept`).toBeGreaterThan(0)
    }
    const errors = OPS_RETENTION.find((r) => r.table === "error_logs")!
    expect(errors.days, "ERROR-HANDLING.md has always called this a 90-day log").toBe(90)
  })

  it("every rule explains itself and can be overridden per environment", () => {
    for (const r of ALL) {
      expect(r.why.length, `${r.table} must say WHY its window is what it is`).toBeGreaterThan(30)
      expect(r.envVar, `${r.table} must be overridable without a deploy`).toMatch(/^RETAIN_[A-Z_]+_DAYS$/)
      expect(r.column, `${r.table} must sweep by a dated column`).toBeTruthy()
    }
  })

  it("every swept column is INDEXED — or the sweep scans the table it is pruning", () => {
    // The job that exists to stop a table growing must not be the thing that
    // reads all of it. Each rule's column needs a leading index.
    // Read EVERY core migration, not a list of the ones that happened to matter
    // when this was written. A hand-list is how the check went quiet the first
    // time: adding `idempotency_keys` in 0017 left its index in a file the test
    // did not open, so a swept table looked unindexed. Derive it, and a new
    // migration is covered the moment it lands.
    const dir = join(__dirname, "..", "..", "..", "db", "core")
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"))
    expect(files.length, "no core migrations found — the check would pass vacuously").toBeGreaterThan(10)
    const core = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n")
    for (const r of CORE_RETENTION) {
      expect(
        new RegExp(`CREATE INDEX[^;]*ON ${r.table} \\(${r.column}`).test(core),
        `${r.table}.${r.column} has no leading index — the retention sweep would scan the whole table`
      ).toBe(true)
    }

    // The OPS rules sweep a DIFFERENT database, so their indexes live in a
    // different schema. Checking them against the core migrations would pass
    // vacuously today (the tables were there until the move) and start lying
    // the moment the old copies are dropped.
    const opsSchema = readFileSync(
      join(__dirname, "..", "..", "..", "db", "ops", "0001_operations.sql"),
      "utf8"
    )
    for (const r of OPS_RETENTION) {
      expect(
        new RegExp(`CREATE INDEX[^;]*ON ${r.table} \\(${r.column}`).test(opsSchema),
        `${r.table}.${r.column} has no index in the OPERATIONS schema — the sweep would scan the table it is pruning`
      ).toBe(true)
    }
  })

  it("sweeps the moved tables in the database they actually MOVED to", () => {
    // The failure this prevents is silent and total: leave the rules in
    // CORE_RETENTION and the nightly job prunes an empty table in the old
    // database, reports success, and lets the real one grow for ever.
    for (const table of OPS_TABLES) {
      expect(
        OPS_RETENTION.some((r) => r.table === table),
        `${table} moved to the operations database — its retention rule must move with it`
      ).toBe(true)
      expect(
        CORE_RETENTION.some((r) => r.table === table),
        `${table} must NOT still be swept against the core database — that sweep would hit nothing`
      ).toBe(false)
    }
  })
})

describe("cutoffFor", () => {
  const now = new Date("2026-08-11T00:00:00.000Z")

  it("returns null for KEEP_FOREVER, so the sweep is skipped entirely", () => {
    expect(cutoffFor(CORE_RETENTION[0], KEEP_FOREVER, now)).toBeNull()
    expect(cutoffFor(CORE_RETENTION[0], -1, now), "a nonsense window keeps, never deletes").toBeNull()
  })

  it("counts back the right number of days", () => {
    expect(cutoffFor(CORE_RETENTION[0], 1, now)).toBe("2026-08-10T00:00:00.000Z")
    expect(cutoffFor(CORE_RETENTION[0], 90, now)).toBe("2026-05-13T00:00:00.000Z")
  })
})

// THE SWEEP MUST BE ABLE TO CATCH UP, AND MUST SAY WHEN IT CANNOT.
//
// A retention rule is a promise that a table stops growing. Until 2026-08-25 the
// sweep issued ONE `DELETE … LIMIT 5000` per rule per night and no more, which
// is not a policy but a speed limit — and it sat below the speed the tables
// grow at. `idempotency_keys` takes a row per protected mutation, `login_codes`
// one per sign-in request, `error_logs` one per crash on a path an anonymous
// caller can reach; all three live in shared databases capped at 10 GB that no
// mover can relieve. Each grew without bound *while having a retention rule*.
//
// So two things are locked here, and the second is the one that rots quietly:
//
//   1. the delete LOOPS until a short batch says the table is clean, under a
//      hard per-run bound so a cron cannot run away; and
//   2. a run that stops on that BOUND rather than on a short batch is REPORTED
//      to the durable error store — because "swept" and "swept as much as I was
//      allowed to" are the same word from outside, and the difference between
//      them is the whole early warning that a shared database is filling.
//
// A partial sweep that reports like a complete one is exactly how the ceiling
// this replaces stayed invisible.
describe("the retention sweep", () => {
  // `housekeeping.ts`, not `sharding.ts`: the retention and orphan sweeps were
  // split out of it once it reached 862 lines doing two unrelated jobs. Sharding
  // decides WHERE data lives; this decides what may be thrown away.
  const src = stripComments(
    readFileSync(join(__dirname, "..", "src", "lib", "housekeeping.ts"), "utf8")
  )
  // ONE declaration each, comments removed — so a comment promising a loop
  // cannot satisfy the check that the loop is there.
  const fn = namedBody(src, "async function sweep(")
  const run = namedBody(src, "export async function runRetention")

  it("reads the two functions it is about", () => {
    // The blindness guard. Rename either and this suite fails loudly instead of
    // asserting nothing at all against an empty string.
    expect(fn, "sweep() not found in housekeeping.ts").toContain("DELETE FROM")
    expect(run, "runRetention() not found in housekeeping.ts").toContain("sweep(")
  })

  it("LOOPS the delete until a short batch, instead of one statement a night", () => {
    const beforeDelete = fn.slice(0, fn.indexOf("DELETE FROM"))
    expect(
      (beforeDelete.match(/\b(?:for|while)\s*\(/g) ?? []).length,
      "the DELETE must sit inside a loop of its own, not only the per-rule loop — one 5,000-row statement a night is slower than the tables grow"
    ).toBeGreaterThanOrEqual(2)
    expect(
      fn,
      "the loop must end on a SHORT batch — fewer rows back than asked for is the only honest 'this table is clean'"
    ).toMatch(/<\s*SWEEP_BATCH/)
    expect(
      fn,
      "the run callback must answer HOW MANY rows went, or a loop cannot tell a clean table from a full one"
    ).toMatch(/Promise<number>/)
  })

  it("bounds the loop, so a cron cannot run away", () => {
    const passes = Number(/SWEEP_MAX_PASSES = ([\d_]+)/.exec(src)?.[1].replaceAll("_", ""))
    expect(passes, "there must be a hard per-rule bound on the number of passes").toBeGreaterThan(1)
    expect(
      passes,
      "the bound shares a 10,000-subrequest, 1,000-D1-query invocation with the size check and the orphan sweep — it cannot be large"
    ).toBeLessThanOrEqual(100)
    expect(fn, "the bound must actually stop the loop").toMatch(/pass >= maxPasses/)
  })

  it("REPORTS a bound that was hit — to the error store, not the console", () => {
    // The signal, and the only reason the bound is safe to have. A rule that
    // stopped because its budget ran out is retention losing the race; a rule
    // that stopped because the table was clean is a quiet night. They must not
    // look the same, and the difference must outlive a log buffer nobody tails
    // at 3am (LAW R12 — unattended work records its failures).
    expect(
      fn,
      "sweep() must distinguish stopping on the bound from running out of rows"
    ).toMatch(/shortfall = true/)
    expect(
      run,
      "runRetention() must carry that distinction out of the sweep"
    ).toMatch(/shortfall/)
    expect(
      run,
      "a shortfall must reach the durable error store — console.error alone dies with the log buffer"
    ).toMatch(/recordWorkerError\(/)
    expect(
      run.indexOf("shortfalls.length"),
      "the error row must be written BECAUSE a bound was hit, not unconditionally"
    ).toBeLessThan(run.indexOf("recordWorkerError("))
  })

  it("does NOT make the O(teams) part of the cron more expensive", () => {
    // The core and ops sweeps are fixed cost — one database each, so the loop
    // adds a constant number of statements a night however many tenants exist.
    // The TEAM pass is not: it runs once per team inside the same invocation,
    // beside an orphan sweep already measured to breach 10,000 subrequests at
    // roughly 3,333 teams. So the team pass keeps its single statement per rule
    // and says so, rather than quietly multiplying the cron's cost by twenty.
    const teamPasses = Number(/TEAM_SWEEP_MAX_PASSES = ([\d_]+)/.exec(src)?.[1].replaceAll("_", ""))
    expect(
      teamPasses,
      "one statement per rule per team, as before — raising this lowers the team ceiling in direct proportion and needs the cron's cursor first"
    ).toBe(1)
    expect(
      run,
      "the per-team sweep must be given the per-team bound, not the fixed-cost one"
    ).toMatch(/TEAM_RETENTION,\s*vars,\s*TEAM_SWEEP_MAX_PASSES/)
    expect(
      run,
      "the core and ops sweeps are fixed cost and get the looping bound"
    ).toMatch(/CORE_RETENTION,\s*vars,\s*SWEEP_MAX_PASSES/)
  })
})

// ORPHANED UPLOADS — the last thing here that grew with nothing watching it.
//
// Logs are swept, lists are capped, uploads are size-limited. Object storage was
// none of those: pick a file, change your mind, pick another, and the first one
// stays in the bucket for ever. Nothing links to it, nothing lists it, and no
// screen would ever show it to you. It is charged for anyway.
//
// The two things that make a sweep like this safe rather than terrifying:
// a GRACE PERIOD (someone who picks a file and then spends an hour writing the
// article has an object no row points at YET), and a reference read that FAILS
// CLOSED (an empty reference set must never be read as "delete everything").
describe("the orphaned-upload sweep", () => {
  const src = readFileSync(join(__dirname, "..", "src", "lib", "housekeeping.ts"), "utf8")
  // ONE declaration, not the rest of the file. `slice(indexOf(...))` read every
  // function BELOW this one too, so an assertion could be satisfied by unrelated
  // code further down and this suite would never know. (See shared/test/source.ts.)
  const fn = namedBody(src, "export async function sweepOrphanedUploads")

  it("keeps anything recent, however unreferenced", () => {
    const days = Number(/ORPHAN_GRACE_DAYS = (\d+)/.exec(src)?.[1])
    expect(days, "a grace measured in minutes would delete someone's attachment as they typed").toBeGreaterThanOrEqual(1)
    expect(fn).toMatch(/object\.uploaded\.getTime\(\) > cutoff/)
  })

  it("keeps anything a record points at", () => {
    expect(fn).toMatch(/referenced\.has\(object\.key\)/)
  })

  it("counts a DEACTIVATED record's attachment as referenced", () => {
    // The base is deactivate-not-delete, so a retired article still owns its
    // file. Filtering the reference read to active rows would delete the
    // attachments of everything anyone had ever retired.
    const read = fn.slice(fn.indexOf("SELECT content_link"), fn.indexOf("referenced = new Set"))
    expect(
      /deactivated_at/.test(read),
      "the reference read must NOT filter by deactivated_at — a retired article still owns its file"
    ).toBe(false)
  })

  it("FAILS CLOSED when it cannot read the references", () => {
    // The single most dangerous failure here: if the reference read throws and
    // the sweep carries on with an empty set, every object that team owns is an
    // orphan and every one of them is deleted.
    const guard = fn.slice(fn.indexOf("} catch"), fn.indexOf("const listed"))
    expect(
      /continue/.test(guard),
      "a failed reference read must SKIP the team — carrying on with an empty set deletes everything it can see"
    ).toBe(true)
  })

  it("bounds what it walks in one night", () => {
    expect(src).toMatch(/ORPHAN_SCAN_CAP = [\d_]+/)
    expect(fn).toMatch(/limit: ORPHAN_SCAN_CAP/)
    expect(fn).toMatch(/listed\.truncated/)
  })

  it("reads the reference set WHOLE, or deletes nothing", () => {
    // The fault this exists to prevent, live in the base until 2026-08-25:
    //
    //     SELECT content_link FROM learning WHERE … LIMIT 10000     <- no ORDER BY
    //     …
    //     for (const object of listed.objects)                      <- KEY order
    //
    // A capped reference read is not a smaller sweep. The delete loop walks
    // objects in key order while the reference read returns rows in whatever
    // order the database chose, so above the cap the two sets simply DISAGREE —
    // and every referenced object missing from the truncated set is deleted once
    // the grace period passes. Someone's attachment, gone, with a green suite.
    //
    // So: the read must page (keyset, so pages cannot overlap or gap), and
    // hitting its bound must reach the SAME fail-closed path as a read that threw.
    const read = fn.slice(fn.indexOf("let referenced"), fn.indexOf("const listed"))
    expect(read, "the reference read must be ORDERed, or its pages cannot be trusted to tile").toMatch(/ORDER BY id/)
    expect(read, "the reference read must page by key, not take one capped bite").toMatch(/id > \$\{sqlValue\(after\)\}/)
    expect(
      /throw new Error/.test(read),
      "exceeding the bound must THROW into the fail-closed catch — carrying on with a partial set deletes real files"
    ).toBe(true)
    // And the catch it throws into must still skip the team.
    const guard = fn.slice(fn.indexOf("} catch"), fn.indexOf("const listed"))
    expect(/continue/.test(guard)).toBe(true)
  })

  it("runs on the nightly pass", () => {
    const cron = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    // The sweep now takes a resume cursor as a third argument, so this matches
    // the CALL and not its exact arity — the assertion is "it runs nightly",
    // and pinning the argument list made an unrelated signature change look
    // like the sweep had been removed from the cron.
    expect(scheduled).toMatch(/await sweepOrphanedUploads\(env, d1Config\(env\)/)
  })

  it("walks ONE PAGE of teams a night, and remembers where it stopped", () => {
    // The read had no LIMIT: every ready team, each costing a paged database
    // read and an R2 listing, inside one invocation with a 10,000-subrequest
    // ceiling — measured to die partway through at roughly 3,333 teams, with
    // the teams at the end of the list silently never swept. A cursor makes the
    // nightly cost constant and turns "never" into "on a rota".
    expect(src, "the team read must be bounded").toMatch(/ORPHAN_TEAMS_PER_NIGHT = [\d_]+/)
    expect(fn, "the team read must resume from the cursor, in id order").toMatch(/id > \?/)
    expect(fn).toMatch(/ORDER BY id LIMIT \$\{ORPHAN_TEAMS_PER_NIGHT\}/)
    // A short page means the rota finished, so the cursor must CLEAR — otherwise
    // the sweep parks on the last team id and never visits anyone again.
    expect(
      fn,
      "a short page must reset the cursor, or the rota runs once and stops for ever"
    ).toMatch(/length < ORPHAN_TEAMS_PER_NIGHT \? ""/)

    // And the cursor must be saved BEFORE anything that can throw after it —
    // a step that fails every night would otherwise pin the rota to page one.
    const cron = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    expect(scheduled).toMatch(/noteSweepCursor\(env, orphans\.nextCursor\)/)
    expect(
      scheduled.indexOf("noteSweepCursor"),
      "the cursor must be persisted before the digest, not after it"
    ).toBeLessThan(scheduled.indexOf("buildErrorDigest"))
  })

  it("records what a team still stores in OBJECT STORAGE, under an `r2:` name", () => {
    // `db_sizes` carries two meters — this one and the D1 file sizes written by
    // `checkDatabaseSizes`. They are only telling apart by the name they file
    // under, so the prefix is load-bearing, not decoration.
    expect(fn, "the meter must record what a team still stores").toMatch(/INSERT INTO db_sizes/)
    expect(fn, "object-storage rows must be distinguishable from D1 rows").toMatch(
      /`r2:learning-media\/\$\{team\.id\}`/
    )
  })
})

// THE GROWTH METER — `db_sizes`, and the two things that were wrong with it.
//
// It shipped with a table, two indexes, a migration promising "one row per
// database per night", and a retention rule. What it did not have was a writer
// for the thing it is named after: the ONLY `INSERT INTO db_sizes` filed R2 media
// bytes, while the nightly sizing pass held `file_size` for every D1 database in
// the account and discarded it below the alarm threshold. An alarm answers "is it
// full"; only a history answers "when will it be".
//
// And it had TWO retention windows — a hardcoded 90-day `DELETE` at the tail of
// the orphan sweep, and the `CORE_RETENTION` rule that superseded it. Both ran
// nightly, the shorter silently won, and `RETAIN_DB_SIZES_DAYS` was a knob that
// did nothing above 90 while looking like it worked.
// (Architecture + scaling reviews, round 5.)
describe("the growth meter", () => {
  const sharding = stripComments(
    readFileSync(join(__dirname, "..", "src", "lib", "sharding.ts"), "utf8")
  )
  const sizing = namedBody(sharding, "export async function checkDatabaseSizes")

  it("writes a D1 file size for EVERY watched database, not only the alarming ones", () => {
    expect(sizing, "the nightly sizing pass must record what it measured").toMatch(
      /INSERT INTO db_sizes/
    )
    // Unconditional: the row must be written from the full `watched` list, not
    // from inside the alarm loop that `continue`s below the threshold — which is
    // precisely how the measurement was thrown away for months.
    expect(
      sizing,
      "the meter must read the whole watched list, or it only records databases that are already full"
    ).toMatch(/watched\.map\(/)
    const insertAt = sizing.indexOf("INSERT INTO db_sizes")
    const skipAt = sizing.indexOf("< ALERT_THRESHOLD_BYTES")
    expect(
      insertAt,
      "the meter must run BEFORE the threshold skip, or it inherits the alarm's filter"
    ).toBeLessThan(skipAt)
    // And it must file under the database's own name, so an `r2:` row from the
    // orphan sweep can never be read as a D1 size.
    expect(sizing).toMatch(/db\.uuid, db\.name/)
  })

  it("has EXACTLY ONE retention window, and CORE_RETENTION owns it", () => {
    const rule = CORE_RETENTION.find((r) => r.table === "db_sizes")
    expect(rule, "the meter must have a window, or it becomes the growth it measures").toBeTruthy()
    expect(
      rule?.envVar,
      "the window must be overridable per environment like every other one"
    ).toBe("RETAIN_DB_SIZES_DAYS")

    // NO SECOND PRUNE ANYWHERE. A hand-rolled `DELETE FROM db_sizes` in a worker
    // is a second window that silently beats the configurable one whenever it is
    // shorter — which is the whole finding.
    const offenders = serverSources()
      .filter(([, s]) => /DELETE\s+FROM\s+db_sizes/i.test(stripComments(s)))
      .map(([p]) => p)
    expect(
      offenders,
      `a worker prunes db_sizes itself — CORE_RETENTION owns that window: ${offenders.join(", ")}`
    ).toEqual([])
  })
})

// THE OPERATIONS DATABASE — the exhaust lives away from the records.
//
// Every team has its own database. A few tables do not: identity, membership,
// sessions. Those live in ONE shared database carrying the SUM of every tenant,
// against D1's 10 GB cap — and sitting in there were the two fastest-growing
// tables in the system, neither of which is a record.
//
// What makes this safe rather than frightening is the FALLBACK: a worker with no
// OPS binding writes to the core database exactly as before. A partition that
// breaks the app when its extra database is absent is a worse problem than the
// one it solves.
describe("the operations database", () => {
  const seam = readFileSync(join(__dirname, "..", "..", "..", "shared", "workers", "ops-db.ts"), "utf8")

  it("falls back to the core database when there is no OPS binding", () => {
    expect(seam).toMatch(/return env\.OPS \?\? env\.DB/)
  })

  it("routes EVERY write of the moved tables through the seam", () => {
    // A single `env.DB.prepare("INSERT INTO error_logs …")` left behind would
    // split the table across two databases — half the history in each, and no
    // error anywhere to say so.
    const roots = ["auth", "content", "data-ops", "mcp", "tenancy"]
    const offenders: string[] = []
    for (const w of roots) {
      const dir = join(__dirname, "..", "..", w, "src")
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name.endsWith(".ts")) {
            const src = readFileSync(p, "utf8")
            for (const table of OPS_TABLES) {
              // env.DB reaching one of the moved tables, in the same statement
              if (new RegExp(`env\\.DB\\.prepare\\([^)]{0,400}${table}`, "s").test(src))
                offenders.push(`${w}: ${e.name} still sends ${table} to env.DB`)
            }
          }
        }
      }
      walk(dir)
    }
    expect(offenders, offenders.join("; ")).toEqual([])
  })

  it("has a schema of its own, with the tables it is supposed to hold", () => {
    const schema = readFileSync(
      join(__dirname, "..", "..", "..", "db", "ops", "0001_operations.sql"),
      "utf8"
    )
    for (const table of OPS_TABLES) {
      expect(schema, `${table} must exist in the operations schema`).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`
      )
    }
  })

  it("does NOT move the credit balance", () => {
    // agent_credits is what the quota gate reads on the request path, and it
    // belongs with the team record. Only the spend HISTORY moves. Moving the
    // balance would put a request-path read behind a second database for no gain.
    expect(OPS_TABLES).not.toContain("agent_credits")
    const schema = readFileSync(
      join(__dirname, "..", "..", "..", "db", "ops", "0001_operations.sql"),
      "utf8"
    )
    expect(schema).not.toMatch(/CREATE TABLE[^;]*agent_credits/)
  })

  it("verifies before it deletes, and cannot be told not to", () => {
    const mover = readFileSync(join(__dirname, "..", "..", "..", "scripts", "move-to-ops.mjs"), "utf8")
    const verify = mover.indexOf("if (after < before)")
    const del = mover.indexOf("DELETE FROM ${table}")
    expect(verify, "the mover must compare both sides").toBeGreaterThan(-1)
    expect(del, "the mover must be able to clear the source").toBeGreaterThan(-1)
    expect(verify, "the count check must come BEFORE the delete, or it is decoration").toBeLessThan(del)
    expect(
      /--skip-verify|--force/.test(mover),
      "there must be no flag to skip verification — the one time you would want it is the one time you must not"
    ).toBe(false)
  })
})
