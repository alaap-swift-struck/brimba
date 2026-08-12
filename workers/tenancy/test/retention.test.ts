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
  const src = readFileSync(join(__dirname, "..", "src", "lib", "sharding.ts"), "utf8")
  const fn = src.slice(src.indexOf("export async function sweepOrphanedUploads"))

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

  it("runs on the nightly pass", () => {
    const cron = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
    const scheduled = cron.slice(cron.indexOf("async scheduled"))
    expect(scheduled).toMatch(/await sweepOrphanedUploads\(env, d1Config\(env\)\)/)
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
