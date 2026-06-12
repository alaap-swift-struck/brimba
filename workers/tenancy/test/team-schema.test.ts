// Unit tests for the team factory's pure logic: schema + seed building.
import { describe, expect, it } from "vitest"

import { sqlString } from "../../../shared/workers/d1-rest"
import {
  buildTeamSeed,
  DEFAULT_SELECTABLE,
  TEAM_MIGRATIONS,
  TEAM_MODULES,
} from "../src/team-schema"

const ACTOR = { id: "01TEST", email: "chris@x.com", name: "Chris O'Brien" }

describe("buildTeamSeed", () => {
  const seed = buildTeamSeed(ACTOR, "2026-06-12T00:00:00.000Z")

  it("seeds 2 roles + a full tall permission sheet + all dropdown defaults", () => {
    const inserts = seed.script.match(/INSERT INTO/g) ?? []
    // 2 roles + (2 roles × modules) permissions + dropdown defaults
    expect(inserts.length).toBe(2 + 2 * TEAM_MODULES.length + DEFAULT_SELECTABLE.length)
  })

  it("Admin gets every switch, Viewer is read-only", () => {
    const adminRows = seed.script
      .split("\n")
      .filter((l) => l.includes("role_permissions") && l.includes(seed.adminRoleId))
    const viewerRows = seed.script
      .split("\n")
      .filter((l) => l.includes("role_permissions") && l.includes(seed.viewerRoleId))
    expect(adminRows).toHaveLength(TEAM_MODULES.length)
    expect(viewerRows).toHaveLength(TEAM_MODULES.length)
    for (const row of adminRows) expect(row).toContain("1, 1, 1, 1")
    for (const row of viewerRows) expect(row).toContain("1, 0, 0, 0")
  })

  it("escapes quotes in names (O'Brien) so the script can't break", () => {
    expect(seed.script).toContain("Chris O''Brien")
  })
})

describe("sqlString", () => {
  it("doubles single quotes and handles null", () => {
    expect(sqlString("it's")).toBe("'it''s'")
    expect(sqlString(null)).toBe("NULL")
  })
})

describe("team schema", () => {
  it("every migration creates the _migrations stamp table first", () => {
    expect(TEAM_MIGRATIONS[0].sql).toContain("CREATE TABLE _migrations")
  })
  it("covers the locked module list", () => {
    expect([...TEAM_MODULES]).toEqual([
      "teams",
      "team_members",
      "member_roles",
      "learning",
      "help",
      "selectable_data",
    ])
  })
})
