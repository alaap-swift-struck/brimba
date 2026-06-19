// Screen-config store — a team's per-screen recipe overrides. Mocks the team-DB
// door (d1Query/d1ExecScript) like roles.test; sqlString stays real so we can
// assert the generated upsert. Covers the read map + the write validation.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { d1Query, d1ExecScript } = vi.hoisted(() => ({
  d1Query: vi.fn(),
  d1ExecScript: vi.fn(),
}))
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, d1Query, d1ExecScript }
})
vi.mock("../../../shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { getScreenOverrides, setScreenOverride } from "../src/lib/screens-config"
import { GuardError } from "../src/lib/permissions"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "ADMIN", databaseId: "db" }
const actor = { id: "ME", email: "me@x.com", name: "Me" }

beforeEach(() => {
  d1Query.mockReset()
  d1ExecScript.mockReset()
  d1ExecScript.mockResolvedValue(undefined)
})

describe("getScreenOverrides", () => {
  it("maps rows into { module: recipeJSON }", async () => {
    d1Query.mockResolvedValue([
      { module: "members.detail", recipe: '{"type":"detail"}' },
      { module: "member_roles", recipe: '{"type":"list"}' },
    ])
    const out = await getScreenOverrides(cfg, guard)
    expect(out).toEqual({
      "members.detail": '{"type":"detail"}',
      member_roles: '{"type":"list"}',
    })
  })
})

describe("setScreenOverride", () => {
  it("rejects an empty module", async () => {
    await expect(
      setScreenOverride(cfg, guard, actor, "  ", "{}")
    ).rejects.toMatchObject({ code: "invalid_input" })
    expect(d1ExecScript).not.toHaveBeenCalled()
  })

  it("rejects invalid JSON", async () => {
    await expect(
      setScreenOverride(cfg, guard, actor, "members.detail", "{not json")
    ).rejects.toMatchObject({ code: "invalid_recipe" })
    expect(d1ExecScript).not.toHaveBeenCalled()
  })

  it("upserts a valid recipe override", async () => {
    await setScreenOverride(cfg, guard, actor, "members.detail", '{"type":"detail"}')
    expect(d1ExecScript).toHaveBeenCalledTimes(1)
    const script = d1ExecScript.mock.calls[0][2] as string
    expect(script).toContain("INSERT INTO screens")
    expect(script).toContain("ON CONFLICT(module) DO UPDATE")
    expect(script).toContain("members.detail")
  })

  it("rejects an oversized recipe", async () => {
    const huge = JSON.stringify({ x: "a".repeat(70 * 1024) })
    await expect(
      setScreenOverride(cfg, guard, actor, "members.detail", huge)
    ).rejects.toBeInstanceOf(GuardError)
    expect(d1ExecScript).not.toHaveBeenCalled()
  })
})
