// THE MOVER MUST NOT MAKE DATA DISAPPEAR.
//
// `sharding.ts` documents three relief valves for a team database approaching
// D1's 10 GB cap: alarm, mover, split. The mover copies a module's tables into a
// dedicated database, records the new home in `team_module_databases`, and then
// DELETES the originals. Until the scaling review of 2026-08-11, nothing read
// that routing table — every module lib asked `guard.databaseId`, the team's
// MAIN database — so pulling the lever copied the data, deleted the originals,
// and left the module blank. The data was safe; the app simply could not see it.
//
// That made the documented remedy for the biggest scaling ceiling a destructive
// operation, reachable from an admin endpoint, at the exact moment you would
// most want to use it. These tests hold the three pieces that fixed it together.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..", "..")
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8")

describe("a moved module's reads follow it", () => {
  const gating = read("shared", "workers", "gating.ts")
  const route = read("shared", "workers", "route.ts")
  const sharding = read("workers", "tenancy", "src", "lib", "sharding.ts")

  it("the gated opening resolves the module's OWN database", () => {
    expect(route, "gated() must ask where this module's data lives").toContain("moduleDatabase(env, ctx.guard, module)")
    expect(
      route,
      "…and hand it to the module as guard.databaseId, so no module lib has to know any of this"
    ).toMatch(/guard:\s*\{\s*\.\.\.ctx\.guard,\s*databaseId\s*\}/)
  })

  it("the permission read still uses the TEAM's database, not the module's", () => {
    // role_permissions never moves. Resolving the module database BEFORE the
    // gate would look for the permission sheet in the wrong place and lock
    // everyone out of the module it just relocated.
    const gateAt = route.indexOf("requireRight(ctx.cfg, ctx.guard")
    const resolveAt = route.indexOf("moduleDatabase(env, ctx.guard")
    expect(gateAt, "requireRight must appear").toBeGreaterThan(-1)
    expect(resolveAt, "moduleDatabase must appear").toBeGreaterThan(-1)
    expect(gateAt, "the gate must run BEFORE the database is swapped").toBeLessThan(resolveAt)
  })

  it("costs an unmoved team nothing — no lookup unless something was moved", () => {
    const body = gating.slice(gating.indexOf("export async function moduleDatabase"))
    expect(
      body.slice(0, 400),
      "the counter check must come first, before any query"
    ).toMatch(/if \(!guard\.movedModules\) return guard\.databaseId/)
  })

  it("the mover flips the counter BEFORE it deletes the originals", () => {
    const flip = sharding.indexOf("moved_modules = moved_modules + 1")
    const del = sharding.indexOf("`DELETE FROM ${table};`")
    expect(flip, "the mover must maintain the counter the request path reads").toBeGreaterThan(-1)
    expect(del, "the mover deletes the source rows").toBeGreaterThan(-1)
    expect(
      flip,
      "routing must be live before the originals go — the other order is the window where the module reads empty"
    ).toBeLessThan(del)
  })

  it("the routing column exists in the core schema", () => {
    expect(
      read("db", "core", "0015_scale_indexes.sql"),
      "teams.moved_modules is what makes the fast path free"
    ).toContain("ALTER TABLE teams ADD COLUMN moved_modules")
  })
})
