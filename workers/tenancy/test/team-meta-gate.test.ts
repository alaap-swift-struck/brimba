// THE TEAM OVERVIEW'S GATE, AND THE SEED THAT MAKES IT SURVIVABLE.
//
// `GET /api/tenancy/team-meta` opened with a bare `teamContext`, which proves
// MEMBERSHIP and nothing else — so `teams:read` was enforced only by the screen
// recipe that hides the Overview in the browser. Any member could read the
// team's metadata by calling the door directly, including one whose role had
// teams:read switched off, and including the assistant and MCP, which reach the
// same doors. Every sibling read in this worker opens with a right.
//
// The second test is the other half, and it is the half that makes the first one
// safe to ship: a gate is only correct if the SEEDED roles can pass it. If
// `teams` ever leaves the module list, or the Admin seed stops granting it, a
// brand-new owner would sign up and find their own team Overview 403ing on day
// one — trading a security hole for a first-run failure. That is a worse bug, so
// it gets its own lock rather than a note in a commit message.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { buildTeamSeed } from "../src/team-schema"

const routes = readFileSync(join(__dirname, "..", "src", "routes", "team.ts"), "utf8")

/** The body of `export async function <fn>` up to the next top-level export. */
function fnBody(src: string, fn: string): string {
  const start = src.indexOf(`export async function ${fn}`)
  if (start === -1) return ""
  const next = src.indexOf("\nexport ", start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe("the team Overview read is gated on the server, not just in the browser", () => {
  it("getTeamMetaFeed opens with the teams:read gate", () => {
    const body = fnBody(routes, "getTeamMetaFeed")
    // Fail loudly rather than vacuously: a handler that got renamed must break
    // this test, not quietly satisfy it with an empty string.
    expect(body, "getTeamMetaFeed must exist in routes/team.ts").toBeTruthy()

    expect(
      /gated\(\s*request,\s*env,\s*"teams",\s*"read"\s*\)/.test(body),
      "the team metadata door must gate on teams:read"
    ).toBe(true)
    expect(
      /await teamContext\(/.test(body),
      "membership alone is not the gate — teamContext must not be the opening"
    ).toBe(false)
  })
})

describe("the seed grants the rights the gates ask for", () => {
  /** The four permission bits the seed writes for one (role, module) pair. */
  function seeded(script: string, roleId: string, module: string): number[] | null {
    const m = new RegExp(
      `VALUES \\('[^']+', '${roleId}', '${module}', (\\d), (\\d), (\\d), (\\d)\\)`
    ).exec(script)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null
  }

  const { script, adminRoleId, viewerRoleId } = buildTeamSeed(
    { id: "U1", email: "owner@x.com", name: "Owner" },
    "2026-08-25T00:00:00.000Z"
  )

  it("gives a brand-new team's Admin role teams:read, so the owner can open their own Overview", () => {
    const bits = seeded(script, adminRoleId, "teams")
    expect(bits, "the seed must write a `teams` row for the Admin role").not.toBeNull()
    expect(bits?.[0], "Admin must hold teams:read on day one").toBe(1)
  })

  it("gives the seeded Viewer role teams:read too (read-only everywhere)", () => {
    const bits = seeded(script, viewerRoleId, "teams")
    expect(bits, "the seed must write a `teams` row for the Viewer role").not.toBeNull()
    expect(bits?.[0], "Viewer must be able to read the team").toBe(1)
  })
})
