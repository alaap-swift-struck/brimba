// UPDATE-DOOR DATA LOSS — the "omitted field overwrites the stored value" class.
//
// Found first in workers/content/src/lib/learning.ts (an edit that omitted the
// body wrote NULL over it), the same shape was swept across every edit door in
// the base. Tenancy's instance was setRolePermissions: it writes one row per
// module in TEAM_MODULE_CATALOG, so a `value` that named ONE module zeroed the
// other six — and `set_role_permissions` is reachable from the assistant and
// from MCP, where a model that answers "grant learning:edit" with a one-key
// object silently strips the role's every other right.
//
// THE RULE these tests lock (the same one the learning fix uses): an ABSENT
// field keeps the stored value; an EXPLICIT one (including a false) writes it.
// `undefined` and `null` are NOT the same thing at a door — that distinction IS
// the fix, so a test that cannot tell them apart cannot guard it.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { d1Query, d1ExecScript } = vi.hoisted(() => ({
  d1Query: vi.fn(),
  d1ExecScript: vi.fn(),
}))
// Mock ONLY the network functions of the data door — sqlString stays real, so
// these tests read the SQL the door would actually send.
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  d1Query,
  d1ExecScript,
}))
vi.mock("../../../shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  describeChanges: vi.fn(() => ""),
  changedFields: vi.fn(() => []),
}))

import { logActivity } from "../../../shared/workers/activity"
import { setRolePermissions } from "../src/lib/roles"
import { updateSelectable } from "../src/lib/selectable"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "MYROLE", databaseId: "db", movedModules: 0 }
const actor = { id: "ME", email: "me@x.com", name: "Me" }

/** One module's four switches as the stored permission sheet returns them. */
const perm = (module: string, read = 1, create = 1, edit = 1, del = 1) => ({
  module,
  can_read: read,
  can_create: create,
  can_edit: edit,
  can_delete: del,
})

/** The four bits the generated script writes for `module`, or null if absent. */
function writtenBits(script: string, module: string): number[] | null {
  const m = new RegExp(`'${module}', (\\d), (\\d), (\\d), (\\d)\\)`).exec(script)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null
}

beforeEach(() => {
  d1Query.mockReset()
  d1ExecScript.mockReset()
  vi.mocked(logActivity).mockClear()
})

describe("setRolePermissions — a module the caller did not name keeps its rights", () => {
  it("does NOT zero a module omitted from `value`", async () => {
    // The role being edited already holds help:read+create. The caller sends a
    // sheet naming ONLY learning — exactly what a model does when asked to
    // "give this role learning access".
    d1Query
      // roleOrThrow
      .mockResolvedValueOnce([{ id: "ROLE", title: "Manager", description: null, is_default: 0 }])
      // the CALLER's own sheet (everything on, so nothing is amplification)
      .mockResolvedValueOnce([
        perm("teams"),
        perm("team_members"),
        perm("member_roles"),
        perm("learning"),
        perm("help"),
        perm("selectable_data"),
        perm("agent"),
      ])
      // the TARGET role's CURRENT stored sheet
      .mockResolvedValueOnce([perm("help", 1, 1, 0, 0), perm("learning", 1, 0, 0, 0)])

    await setRolePermissions(cfg, guard, actor, "ROLE", {
      learning: { read: true, create: true, edit: true, delete: false },
    } as never)

    const script = d1ExecScript.mock.calls[0]?.[2] as string
    expect(script, "the sheet must be written").toBeTruthy()

    // The module the caller NAMED is written as asked.
    expect(writtenBits(script, "learning")).toEqual([1, 1, 1, 0])

    // The module the caller did NOT name keeps what the role already had —
    // this is the assertion the bug fails: it wrote [0, 0, 0, 0].
    expect(
      writtenBits(script, "help"),
      "an omitted module must keep its stored rights, never be zeroed"
    ).toEqual([1, 1, 0, 0])
  })

  it("still CLEARS a module the caller named explicitly with every right false", async () => {
    // The other half of the distinction: omitted keeps, explicit clears. Without
    // this, "keep what I did not send" would quietly become "you can never
    // revoke anything", which is a worse bug than the one being fixed.
    d1Query
      .mockResolvedValueOnce([{ id: "ROLE", title: "Manager", description: null, is_default: 0 }])
      .mockResolvedValueOnce([perm("help"), perm("learning")])
      .mockResolvedValueOnce([perm("help", 1, 1, 1, 1)])

    await setRolePermissions(cfg, guard, actor, "ROLE", {
      help: { read: false, create: false, edit: false, delete: false },
    } as never)

    const script = d1ExecScript.mock.calls[0]?.[2] as string
    expect(writtenBits(script, "help"), "an explicit all-false must revoke").toEqual([0, 0, 0, 0])
  })
})

describe("updateSelectable — a value can move list, and never moves by accident", () => {
  /** The reads the door makes, in order: the row, the destination duplicate
   * check (only when it is actually moving), then the UPDATE's RETURNING. */
  function stubRow(row: { id: string; type: string; value: string }, moving = false) {
    d1Query.mockResolvedValueOnce([{ ...row, is_default: 0 }])
    if (moving) d1Query.mockResolvedValueOnce([]) // nothing already sitting there
    d1Query.mockResolvedValueOnce([{ id: row.id }])
  }

  it("leaves `type` out of the SET when the caller did not send one", async () => {
    // The rename path the Dropdown-values screen uses: it posts { id, value }
    // and no type at all. If `type` rode the SET unconditionally, every inline
    // rename would blank the group the value lives in.
    stubRow({ id: "V1", type: "File type", value: "Image file" })
    await updateSelectable(cfg, guard, actor, "V1", "Picture file")

    const sql = d1Query.mock.calls[1]?.[2] as string
    expect(sql).toContain("UPDATE selectable_data SET")
    expect(sql).toContain("value = 'Picture file'")
    expect(/\btype\s*=/.test(sql), "an omitted type must not be written").toBe(false)
  })

  it("moves the value to another list when a type IS sent", async () => {
    stubRow({ id: "V1", type: "File type", value: "Image file" }, true)
    await updateSelectable(cfg, guard, actor, "V1", "Image file", null, "Help type")

    const sql = d1Query.mock.calls.map((c) => String(c[2])).find((s) => s.includes("UPDATE selectable_data"))
    expect(sql, "the move must reach the UPDATE").toBeTruthy()
    expect(sql).toContain("type = 'Help type'")
  })

  it("says the value MOVED in its activity row, not that it was renamed", async () => {
    // R17 / the activity ruleset: a move is a different event from a rename, and
    // a history that calls it a rename is a history that lies about what happened.
    stubRow({ id: "V1", type: "File type", value: "Image file" }, true)
    await updateSelectable(cfg, guard, actor, "V1", "Image file", null, "Help type")

    const entry = vi.mocked(logActivity).mock.calls.at(-1)?.[3] as { description: string }
    expect(entry?.description ?? "").toMatch(/moved/i)
  })

  it("refuses a move that would duplicate an option already in the destination", async () => {
    // The (type, value) uniqueness createSelectable enforces must not be
    // walkable through the edit door instead.
    d1Query
      .mockResolvedValueOnce([{ id: "V1", type: "File type", value: "Image file", is_default: 0 }])
      .mockResolvedValueOnce([{ id: "OTHER" }]) // already sitting in Help type
    await expect(
      updateSelectable(cfg, guard, actor, "V1", "Image file", null, "Help type")
    ).rejects.toThrow(/already in Help type/)
  })

  it("treats a type equal to the one it already has as no move at all", async () => {
    // R17: re-sending the current group is not a state transition — it must not
    // write a "moved" history row for a value that never went anywhere.
    stubRow({ id: "V1", type: "File type", value: "Screenshot" })
    await updateSelectable(cfg, guard, actor, "V1", "Screenshot", null, "File type")

    const entry = vi.mocked(logActivity).mock.calls.at(-1)?.[3] as { description: string }
    expect(entry?.description ?? "").not.toMatch(/moved/i)
  })
})
