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
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { declarationBody, stripComments } from "../../../shared/test/source"
import { TEAM_MODULE_CATALOG } from "../src/team-schema"
import { assertCanAssignRole } from "../src/lib/roles"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "ADMIN", databaseId: "db" , movedModules: 0}
const actor = { id: "ME", email: "me@x.com", name: "Me" }

/** Make d1Query answer the role lookup with the given row (or none = missing). */
/** `callerHolds` is the caller's OWN permission sheet. It defaults to a full one
 * because a caller with nothing cannot legitimately grant anything: since
 * 2026-08-25 `setRolePermissions` refuses to grant a right the actor does not
 * hold, so a fixture with an empty sheet is a caller who may do nothing at all. */
function roleLookup(
  role: { id: string; title: string; is_default: number } | null,
  callerHolds: "all" | "none" = "all"
) {
  const full = TEAM_MODULE_CATALOG.map((m) => ({
    module: m.key,
    can_read: 1,
    can_create: 1,
    can_edit: 1,
    can_delete: 1,
  }))
  d1Query.mockImplementation(async (_c, _db, sql: string, params?: unknown[]) => {
    if (sql.includes("FROM member_roles")) return role ? [role] : []
    if (sql.includes("FROM role_permissions"))
      // The caller's own sheet, versus the TARGET role's current sheet (empty —
      // a fresh role holds nothing, which is what makes a grant a grant).
      return params?.[0] === guard.roleId && callerHolds === "all" ? full : []
    return []
  })
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

  it("refuses to grant a right the caller does not hold (no privilege amplification)", async () => {
    // The escalation this closes: member_roles:edit could not tick every box on
    // your OWN role, but nothing stopped you creating a role, granting IT
    // everything, and inviting a plus-address of yourself into it. Three calls to
    // full tenant admin, and reachable through the assistant and MCP too.
    roleLookup({ id: "R", title: "Editor", is_default: 0 }, "none")
    await expect(
      setRolePermissions(cfg, guard, actor, "R", {
        team_members: { read: true, create: true, edit: true, delete: true },
      })
    ).rejects.toMatchObject({ code: "privilege_amplification" })
    expect(d1ExecScript, "nothing may be written when the grant is refused").not.toHaveBeenCalled()
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

describe("assertCanAssignRole — the other half of no-amplification", () => {
  // Closing setRolePermissions alone did NOT close the escalation, because it
  // never needed that door. The Admin role always exists and is always active,
  // and listMembers hands out every roleId — so `team_members:create` alone was
  // "invite a plus-address of yourself as Admin and accept", and
  // `team_members:edit` alone was "promote an accomplice". Both reachable through
  // the assistant and through MCP. (security_sentry round 2, 2026-08-25.)
  it("refuses a role holding a right the caller does not hold", async () => {
    d1Query.mockImplementation(async (_c, _db, sql: string, params?: unknown[]) => {
      if (!sql.includes("FROM role_permissions")) return []
      // The caller holds nothing; the target role holds everything.
      return params?.[0] === guard.roleId
        ? []
        : [{ module: "team_members", can_read: 1, can_create: 1, can_edit: 1, can_delete: 1 }]
    })
    await expect(assertCanAssignRole(cfg, guard, "STRONGER")).rejects.toMatchObject({
      code: "privilege_amplification",
    })
  })

  it("allows a role that cannot exceed the caller", async () => {
    d1Query.mockImplementation(async (_c, _db, sql: string, params?: unknown[]) => {
      if (!sql.includes("FROM role_permissions")) return []
      return params?.[0] === guard.roleId
        ? [{ module: "team_members", can_read: 1, can_create: 1, can_edit: 1, can_delete: 1 }]
        : [{ module: "team_members", can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }]
    })
    await expect(assertCanAssignRole(cfg, guard, "VIEWER")).resolves.toBeUndefined()
  })

  it("never blocks assigning the caller's OWN role — it cannot exceed itself", async () => {
    d1Query.mockImplementation(async () => [])
    await expect(assertCanAssignRole(cfg, guard, guard.roleId)).resolves.toBeUndefined()
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

  /** Lookup finds the role; the UPDATE (R17: RETURNING id) reports one moved row. */
  function roleAndUpdate(role: { id: string; title: string; is_default: number }) {
    d1Query.mockImplementation(async (_c, _db, sql: string) =>
      sql.startsWith("UPDATE") ? [{ id: role.id }] : sql.includes("FROM member_roles") ? [role] : []
    )
  }

  it("deactivates a non-default role — the UPDATE carries the R17 status predicate", async () => {
    roleAndUpdate({ id: "R", title: "Editor", is_default: 0 })
    expect(await setRoleActive(cfg, guard, actor, "R", false)).toBe(true)
    const sql = d1Query.mock.calls[1][2] as string // 0 = lookup, 1 = the UPDATE
    expect(sql).toContain("UPDATE member_roles SET deactivated_at = ?")
    expect(sql).toContain("AND deactivated_at IS NULL") // idempotent: a repeat moves 0 rows
    expect(sql).toContain("RETURNING id")
    expect(sql).not.toContain("DELETE")
  })

  it("reactivates a role (clears deactivated_at, predicate inverted)", async () => {
    roleAndUpdate({ id: "R", title: "Editor", is_default: 0 })
    expect(await setRoleActive(cfg, guard, actor, "R", true)).toBe(true)
    const sql = d1Query.mock.calls[1][2] as string
    expect(sql).toContain("deactivated_at = NULL")
    expect(sql).toContain("AND deactivated_at IS NOT NULL")
  })

  it("a repeat that moves ZERO rows returns false and writes NO activity row (R17)", async () => {
    // Lookup finds the role, but the predicated UPDATE matches nothing (already
    // deactivated) — the double-click case that used to write duplicate history.
    d1Query.mockImplementation(async (_c, _db, sql: string) =>
      sql.startsWith("UPDATE") ? [] : [{ id: "R", title: "Editor", is_default: 0 }]
    )
    const { logActivity } = await import("../../../shared/workers/activity")
    vi.mocked(logActivity).mockClear()
    expect(await setRoleActive(cfg, guard, actor, "R", false)).toBe(false)
    expect(logActivity).not.toHaveBeenCalled()
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

// THE GUARD MUST BE CALLED, NOT MERELY EXIST.
//
// Three tests above cover `assertCanAssignRole` in isolation and it survives every
// attack. But security_sentry round 3 attacked it fourteen ways, could not defeat
// it, and then found the real hole: **deleting the call from BOTH doors left this
// worker at 119/119.** A guard nothing invokes is a guard nobody has.
//
// The door list is DERIVED, not written down: any handler that writes a role
// assignment must call it. So a NEW door that assigns a role — a bulk invite, an
// import path, whatever comes next — fails this the day it is written, rather than
// the day someone audits it.
describe("every door that assigns a role calls the guard", () => {
  const LIB = join(__dirname, "..", "src", "lib")
  const sources = readdirSync(LIB)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, stripComments(readFileSync(join(LIB, f), "utf8"))] as const)

  it("found the library at all", () => {
    expect(sources.length, "no tenancy lib sources found — this scan has gone blind").toBeGreaterThan(3)
  })

  for (const [file, src] of sources) {
    // A door assigns a role if it writes `role_id` or hands one to an invite.
    for (const m of src.matchAll(/export async function (\w+)/g)) {
      const body = declarationBody(src, m.index!)
      // WRITES only. The first version matched `role_id)` and `role_id =`, which
      // appear in every SELECT and WHERE in these files, so it demanded the guard
      // from `listMembers` and `getRolePermissions`. A predicate that over-matches
      // is not the safe direction: it makes the check noisy, and a noisy check
      // gets loosened rather than fixed.
      const assigns =
        /INSERT INTO team_members\b/i.test(body) ||
        /INSERT INTO invite_index\b/i.test(body) ||
        // Up to WHERE only — `[^;]*` reached into the WHERE clause, so
        // `removeMember`'s `... WHERE ... role_id = ?` read as an assignment. A
        // filter is not a write.
        /UPDATE team_members SET(?:(?!WHERE)[\s\S])*?\brole_id\s*=/i.test(body)
      if (!assigns) continue
      // The doors where a role is assigned but the ASSIGNER is not choosing it.
      // Each is a reviewed exception with its reason, on the same bargain every
      // other exemption in this base makes: you may not dodge the rule by quietly
      // listing a function — you have to say why, here, in writing.
      const NOT_A_CHOICE: Record<string, string> = {
        createTeam:
          "creates a team and makes its creator the admin of it. There is no escalation in becoming admin of a team you just made, and no prior role exists to compare against.",
        acceptInvite:
          "the INVITEE accepts. The role was chosen and validated when the invite was CREATED — which does go through the guard — and the acceptor cannot change it.",
        acceptPendingInvites:
          "same as acceptInvite, for invites that were waiting when the account was created. The acceptor is not choosing a role.",
      }
      if (NOT_A_CHOICE[m[1]]) {
        it(`${file} → ${m[1]} is a reviewed exception`, () => {
          expect(NOT_A_CHOICE[m[1]].length, "an exception needs a real reason").toBeGreaterThan(40)
        })
        continue
      }
      it(`${file} → ${m[1]}`, () => {
        expect(
          /assertCanAssignRole\s*\(/.test(body),
          `${m[1]} writes a role assignment without calling assertCanAssignRole — that is the escalation: create a role, grant it everything, put someone (or a plus-address of yourself) into it`
        ).toBe(true)
      })
    }
  }
})
