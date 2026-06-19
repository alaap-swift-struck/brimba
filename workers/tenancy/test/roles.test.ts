// Roles & permissions guards — the locked rules, tested in isolation with fakes
// (no live team DB): the team DB (d1Query/d1ExecScript) and the activity log are
// mocked; sqlString stays real so we can assert on the generated SQL. Covers the
// server-side auto-flip-read rule, the locked-Admin guard, unknown roles, and
// role creation seeding.
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

import {
  createRole,
  getRolePermissions,
  normalizeRights,
  setRoleActive,
  setRolePermissions,
} from "../src/lib/roles"
import { GuardError } from "../src/lib/permissions"
import { TEAM_MODULE_CATALOG } from "../src/team-schema"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "ADMIN", databaseId: "db" }
const actor = { id: "ME", email: "me@x.com", name: "Me" }

/** Make d1Query answer the role lookup with the given row (or none = missing). */
function roleLookup(role: { id: string; title: string; is_default: number } | null) {
  d1Query.mockImplementation(async (_c, _db, sql: string) =>
    sql.includes("FROM member_roles") ? (role ? [role] : []) : []
  )
}

beforeEach(() => {
  d1Query.mockReset()
  d1ExecScript.mockReset()
  d1ExecScript.mockResolvedValue(undefined)
})

describe("normalizeRights (auto-flip-read)", () => {
  it("turning on any write forces read on", () => {
    expect(normalizeRights({ create: true }).read).toBe(true)
    expect(normalizeRights({ edit: true }).read).toBe(true)
    expect(normalizeRights({ delete: true }).read).toBe(true)
  })
  it("read alone stays, all-off stays off", () => {
    expect(normalizeRights({ read: true })).toEqual({
      read: true,
      create: false,
      edit: false,
      delete: false,
    })
    expect(normalizeRights({})).toEqual({
      read: false,
      create: false,
      edit: false,
      delete: false,
    })
  })
})

describe("setRolePermissions", () => {
  it("refuses the locked Admin role (is_default)", async () => {
    roleLookup({ id: "ADMIN", title: "Admin", is_default: 1 })
    await expect(
      setRolePermissions(cfg, guard, actor, "ADMIN", {})
    ).rejects.toMatchObject({ code: "locked_role" })
    expect(d1ExecScript).not.toHaveBeenCalled()
  })

  it("throws when the role doesn't exist", async () => {
    roleLookup(null)
    await expect(
      setRolePermissions(cfg, guard, actor, "NOPE", {})
    ).rejects.toBeInstanceOf(GuardError)
  })

  it("re-applies auto-flip-read on the server before writing", async () => {
    roleLookup({ id: "R", title: "Editor", is_default: 0 })
    // create on but read off in the incoming value — server must flip read on.
    await setRolePermissions(cfg, guard, actor, "R", {
      team_members: { read: false, create: true, edit: false, delete: false },
    })
    expect(d1ExecScript).toHaveBeenCalledTimes(1)
    const script = d1ExecScript.mock.calls[0][2] as string
    // the team_members row is written with can_read=1, can_create=1
    expect(script).toContain("'team_members', 1, 1, 0, 0")
    // a module not in the value is written all-off
    expect(script).toContain("'learning', 0, 0, 0, 0")
  })
})

describe("createRole", () => {
  it("rejects an empty name", async () => {
    await expect(createRole(cfg, guard, actor, "   ", "")).rejects.toMatchObject({
      code: "invalid_input",
    })
    expect(d1ExecScript).not.toHaveBeenCalled()
  })

  it("seeds the role + an all-off permission row per module", async () => {
    await createRole(cfg, guard, actor, "Editor", "Can edit things")
    const script = d1ExecScript.mock.calls[0][2] as string
    expect(script).toContain("INSERT INTO member_roles")
    const permRows = script.match(/INSERT INTO role_permissions/g) ?? []
    expect(permRows).toHaveLength(TEAM_MODULE_CATALOG.length)
    expect(script).toContain("0, 0, 0, 0") // every right starts off
  })
})

describe("setRoleActive (deactivate / reactivate)", () => {
  it("refuses to deactivate the locked Admin role", async () => {
    roleLookup({ id: "ADMIN", title: "Admin", is_default: 1 })
    await expect(
      setRoleActive(cfg, guard, actor, "ADMIN", false)
    ).rejects.toMatchObject({ code: "locked_role" })
    expect(d1ExecScript).not.toHaveBeenCalled()
  })

  it("throws when the role doesn't exist", async () => {
    roleLookup(null)
    await expect(
      setRoleActive(cfg, guard, actor, "NOPE", false)
    ).rejects.toMatchObject({ code: "role_not_found" })
  })

  it("deactivates a non-default role (stamps deactivated_at, never deletes)", async () => {
    roleLookup({ id: "R", title: "Editor", is_default: 0 })
    await setRoleActive(cfg, guard, actor, "R", false)
    const script = d1ExecScript.mock.calls[0][2] as string
    expect(script).toContain("UPDATE member_roles SET deactivated_at = '")
    expect(script).not.toContain("DELETE")
  })

  it("reactivates a role (clears deactivated_at)", async () => {
    roleLookup({ id: "R", title: "Editor", is_default: 0 })
    await setRoleActive(cfg, guard, actor, "R", true)
    const script = d1ExecScript.mock.calls[0][2] as string
    expect(script).toContain("deactivated_at = NULL")
  })
})

describe("getRolePermissions", () => {
  it("builds the value from saved rows, all-off for untouched modules; reports the caller's edit right", async () => {
    d1Query.mockImplementation(async (_c, _db, sql: string, params?: string[]) => {
      if (sql.includes("FROM member_roles"))
        return [{ id: "R", title: "Editor", is_default: 0 }]
      // the caller's own member_roles:edit check (role_id + module filter)
      if (params && params[1] === "member_roles")
        return [{ can_read: 1, can_create: 0, can_edit: 1, can_delete: 0 }]
      // the role's saved sheet: only team_members has a row (full rights)
      return [
        {
          module: "team_members",
          can_read: 1,
          can_create: 1,
          can_edit: 1,
          can_delete: 1,
        },
      ]
    })
    const res = await getRolePermissions(cfg, guard, "R")
    expect(res.isDefault).toBe(false)
    expect(res.canEdit).toBe(true)
    expect(res.modules).toHaveLength(TEAM_MODULE_CATALOG.length)
    expect(res.value.team_members).toEqual({
      read: true,
      create: true,
      edit: true,
      delete: true,
    })
    expect(res.value.learning).toEqual({
      read: false,
      create: false,
      edit: false,
      delete: false,
    })
  })

  it("reports canEdit=false when the caller lacks member_roles:edit", async () => {
    d1Query.mockImplementation(async (_c, _db, sql: string, params?: string[]) => {
      if (sql.includes("FROM member_roles"))
        return [{ id: "R", title: "Editor", is_default: 0 }]
      if (params && params[1] === "member_roles")
        return [{ can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }]
      return []
    })
    const res = await getRolePermissions(cfg, guard, "R")
    expect(res.canEdit).toBe(false)
  })
})
