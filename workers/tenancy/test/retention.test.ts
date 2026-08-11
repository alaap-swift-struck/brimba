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

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  CORE_RETENTION,
  KEEP_FOREVER,
  TEAM_RETENTION,
  cutoffFor,
} from "../../../shared/workers/retention"

const ALL = [...CORE_RETENTION, ...TEAM_RETENTION]

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
    const errors = CORE_RETENTION.find((r) => r.table === "error_logs")!
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
    const core = [
      "0001_core_auth", "0007_account_activity", "0011_agent_usage_log",
      "0012_error_logs", "0015_scale_indexes",
    ]
      .map((f) => readFileSync(join(__dirname, "..", "..", "..", "db", "core", `${f}.sql`), "utf8"))
      .join("\n")
    for (const r of CORE_RETENTION) {
      expect(
        new RegExp(`CREATE INDEX[^;]*ON ${r.table} \\(${r.column}`).test(core),
        `${r.table}.${r.column} has no leading index — the retention sweep would scan the whole table`
      ).toBe(true)
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
