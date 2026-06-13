// Member-management guards — the locked safety rules, tested in isolation with
// fakes (no live 2nd member needed): the team DB (d1Query) and the activity log
// are mocked; the global DB is a small stub that answers the few queries
// members.ts makes. Covers self-lockout, unknown target/role, the >=1-admin
// rule, and the happy paths.
import { beforeEach, describe, expect, it, vi } from "vitest"

// hoisted so the mock factory (which vitest lifts to the top) can see it.
const { d1Query } = vi.hoisted(() => ({ d1Query: vi.fn() }))
vi.mock("../../../shared/workers/d1-rest", () => ({ d1Query }))
vi.mock("../../../shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { changeMemberRole, removeMember } from "../src/lib/members"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "ADMIN", databaseId: "db" }
const actor = { id: "ME", email: "me@x.com", name: "Me" }

/** Minimal global-DB stub: answers the COUNT and membership lookups. */
function fakeEnv({
  target,
  adminCount,
}: {
  target: { id: string; role_id: string } | null
  adminCount: number
}) {
  const runs: { sql: string }[] = []
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              first: async () =>
                sql.includes("COUNT(*)")
                  ? { n: adminCount }
                  : sql.includes("FROM team_members")
                    ? target
                    : null,
              run: async () => {
                runs.push({ sql })
                return {}
              },
            }
          },
        }
      },
    },
  } as never
  return { env, runs }
}

beforeEach(() => {
  d1Query.mockReset()
  // default: the locked admin role is "ADMIN"; any requested role exists.
  d1Query.mockImplementation(
    async (_c: unknown, _db: unknown, sql: string, params?: string[]) => {
      if (sql.includes("is_default = 1")) return [{ id: "ADMIN" }]
      if (sql.includes("WHERE id = ?")) return [{ id: params?.[0], title: "Viewer" }]
      return []
    }
  )
})

describe("changeMemberRole guards", () => {
  it("blocks changing your own role", async () => {
    const { env } = fakeEnv({ target: { id: "m", role_id: "VIEWER" }, adminCount: 2 })
    await expect(
      changeMemberRole(env, cfg, guard, actor, "ME", "VIEWER")
    ).rejects.toMatchObject({ code: "self" })
  })

  it("blocks an unknown target", async () => {
    const { env } = fakeEnv({ target: null, adminCount: 2 })
    await expect(
      changeMemberRole(env, cfg, guard, actor, "OTHER", "VIEWER")
    ).rejects.toMatchObject({ code: "target_not_member" })
  })

  it("blocks an unknown role", async () => {
    d1Query.mockImplementation(async (_c, _db, sql) =>
      sql.includes("is_default = 1") ? [{ id: "ADMIN" }] : []
    )
    const { env } = fakeEnv({ target: { id: "m", role_id: "VIEWER" }, adminCount: 2 })
    await expect(
      changeMemberRole(env, cfg, guard, actor, "OTHER", "NOPE")
    ).rejects.toMatchObject({ code: "role_not_found" })
  })

  it("blocks demoting the last admin", async () => {
    const { env } = fakeEnv({ target: { id: "m", role_id: "ADMIN" }, adminCount: 1 })
    await expect(
      changeMemberRole(env, cfg, guard, actor, "OTHER", "VIEWER")
    ).rejects.toMatchObject({ code: "last_admin" })
  })

  it("allows a normal role change (writes the update)", async () => {
    const { env, runs } = fakeEnv({
      target: { id: "m", role_id: "VIEWER" },
      adminCount: 2,
    })
    await changeMemberRole(env, cfg, guard, actor, "OTHER", "EDITOR")
    expect(runs.some((r) => r.sql.includes("UPDATE team_members SET role_id"))).toBe(
      true
    )
  })
})

describe("removeMember guards", () => {
  it("blocks removing yourself", async () => {
    const { env } = fakeEnv({ target: { id: "m", role_id: "VIEWER" }, adminCount: 2 })
    await expect(
      removeMember(env, cfg, guard, actor, "ME")
    ).rejects.toMatchObject({ code: "self" })
  })

  it("blocks removing the last admin", async () => {
    const { env } = fakeEnv({ target: { id: "m", role_id: "ADMIN" }, adminCount: 1 })
    await expect(
      removeMember(env, cfg, guard, actor, "OTHER")
    ).rejects.toMatchObject({ code: "last_admin" })
  })

  it("removes a normal member (deactivates, never hard-deletes)", async () => {
    const { env, runs } = fakeEnv({
      target: { id: "m", role_id: "VIEWER" },
      adminCount: 2,
    })
    await removeMember(env, cfg, guard, actor, "OTHER")
    expect(runs.some((r) => r.sql.includes("deactivated_at"))).toBe(true)
  })
})
