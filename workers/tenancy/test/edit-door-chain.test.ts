// THE DOOR IS THE WHOLE CHAIN, NOT THE LAST FUNCTION IN IT.
//
// Same bug class as workers/content/test/omitted-fields.test.ts — a door that
// cannot tell "the caller omitted this field" from "the caller cleared this
// field" — but tenancy's two instances hid somewhere a lib-level test cannot
// look: the flattening happened BEFORE the lib was called.
//
//   update_role's buildBody sent `description: str(i, "description") || ""`;
//   routes/roles.ts then sent `optionalText(body.description) ?? ""`;
//   lib/roles.ts wrote `description.trim() || null` → NULL.
//
// Three layers, each of which looks defensible alone, together turning "rename
// this role" into "rename this role and delete its description". A guard added
// at any ONE of them is inert, so these tests drive the REAL route handlers and
// read the SQL the door would really send — the only vantage point from which
// all three layers are visible at once.
//
// The dropdown door is the mirror image: lib/selectable.ts learned to MOVE a
// value between groups, but nothing above it forwarded a `type`, so the
// capability existed and was unreachable from every surface.
//
// BOTH DIRECTIONS ARE LOCKED. A test that only proves "omitted is preserved"
// invites the next reader to simplify `=== undefined` into `== null`, which
// still passes it while quietly removing the ability to clear a field at all.
import { beforeEach, describe, expect, it, vi } from "vitest"

// Hoisted: vitest lifts `vi.mock` above the file, so the fixtures its factories
// close over have to be lifted with it.
const H = vi.hoisted(() => ({
  sql: [] as string[],
  activity: [] as { description: string; changes?: { label: string }[] }[],
  ROLE: {
    id: "R7",
    title: "Manager",
    description: "Runs the weekly rota",
    is_default: 0,
  },
  VALUE: { id: "V1", type: "File type", value: "Image file", is_default: 0, deactivated_at: null },
}))

// Only the D1 door's network calls are faked. `sqlString`, every rule in both
// libs, and the real activity diff helpers stay real — so what is asserted below
// is the statement the door would actually send.
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  d1Query: async (_cfg: unknown, _db: string, sql: string) => {
    H.sql.push(sql)
    if (sql.startsWith("UPDATE")) return [{ id: "X" }] // the write landed
    if (/COUNT\(\*\)/.test(sql)) return [{ n: 3 }]
    if (/FROM member_roles WHERE id/.test(sql)) return [H.ROLE]
    if (/FROM selectable_data WHERE id/.test(sql)) return [H.VALUE]
    if (/FROM selectable_data WHERE type/.test(sql)) return [] // destination is free
    return []
  },
  d1ExecScript: async (_cfg: unknown, _db: string, sql: string) => {
    H.sql.push(sql)
  },
}))

// The activity WRITE is captured; `describeChanges` / `changedFields` stay real,
// because whether the history tells the truth about what moved is one of the
// things being tested.
vi.mock("../../../shared/workers/activity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  logActivity: async (_cfg: unknown, _db: string, _actor: unknown, entry: never) => {
    H.activity.push(entry)
  },
}))

vi.mock("../../../shared/workers/realtime", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publishChange: async () => {},
}))

// Who is calling is not what these tests are about — the gate is proven by the
// per-worker gating-seam suite. Everything downstream of it is real.
vi.mock("../../../shared/workers/gating", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/gating")>()
  return {
    ...actual,
    teamContext: async () => ({ user: { id: "U1" }, actor: ACTOR, cfg: CFG, guard: GUARD }),
    requireRight: async () => {},
    moduleDatabase: async () => GUARD.databaseId,
  }
})

import { postUpdateRole } from "../src/routes/roles"
import { postUpdateSelectable } from "../src/routes/selectable"
import { SHARED_TOOLS } from "../../../shared/workers/tool-catalog"

const CFG = { accountId: "a", apiToken: "t" } as never
const GUARD = { userId: "U1", teamId: "T1", roleId: "R1", databaseId: "db1", movedModules: 0 }
const ACTOR = { id: "U1", email: "ada@example.com", name: "Ada Green" }

// oneRole counts holders through the core DB binding; nothing here asserts on it.
const ENV = {
  REALTIME: {},
  DB: { prepare: () => ({ bind: () => ({ first: async () => ({ n: 0 }) }) }) },
} as never

/** The route `ctx`. Doors now hand their change ping to `ctx.waitUntil` instead
 * of awaiting it (LAW R1 accepts both), so a door cannot be driven without one.
 * A no-op stand-in is enough here: `publishChange` is mocked to a resolved no-op
 * above, and what this file asserts on is the SQL the door sends. */
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as never

/** A request exactly as the wire carries it — JSON.stringify DROPS an undefined
 * value, which is what makes "omitted" and "explicitly null" different here. */
const post = (body: unknown) =>
  new Request("https://example.com/door", { method: "POST", body: JSON.stringify(body) })

/** Run a door, then hand back the UPDATE it would really have sent. */
async function updateSql(table: string, run: () => Promise<unknown>): Promise<string> {
  H.sql.length = 0
  H.activity.length = 0
  await run()
  const sql = H.sql.find((s) => s.startsWith(`UPDATE ${table} SET`))
  expect(sql, `the door sent no UPDATE ${table}`).toBeTruthy()
  return sql as string
}

const tool = (name: string) => SHARED_TOOLS.find((t) => t.name === name)!

beforeEach(() => {
  H.sql.length = 0
  H.activity.length = 0
})

describe("the role edit door tells an omitted description from a cleared one", () => {
  it("a rename that never mentions the description keeps it", async () => {
    // The shape the assistant actually produces: `update_role` requires only
    // roleId + title, so "rename that role" is one call carrying two fields.
    const sql = await updateSql("member_roles", () =>
      postUpdateRole(post({ roleId: "R7", title: "Team manager" }), ENV, CTX)
    )

    expect(sql).toContain("title = 'Team manager'") // the one field it meant to change
    expect(
      sql.includes("description = 'Runs the weekly rota'"),
      "a rename erased the role's description — and the confirm card said only 'Rename X to Y'"
    ).toBe(true)
  })

  it("a description the person actually CLEARED still clears", async () => {
    // The web form's payload for an emptied box: present, and empty.
    const blanked = await updateSql("member_roles", () =>
      postUpdateRole(post({ roleId: "R7", title: "Manager", description: "" }), ENV, CTX)
    )
    expect(blanked).toContain("description = NULL")

    // And the explicit null the update-door rule names.
    const nulled = await updateSql("member_roles", () =>
      postUpdateRole(post({ roleId: "R7", title: "Manager", description: null }), ENV, CTX)
    )
    expect(nulled).toContain("description = NULL")
  })

  it("still writes a description the caller DID send", async () => {
    const sql = await updateSql("member_roles", () =>
      postUpdateRole(post({ roleId: "R7", title: "Manager", description: "Runs the rota" }), ENV, CTX)
    )
    expect(sql).toContain("description = 'Runs the rota'")
  })

  it("the history does not claim the description changed on a rename", async () => {
    // A diff computed from the INCOMING value rather than the value actually
    // written reports a preserved field as cleared: the record's own history
    // describing a change that never happened.
    await updateSql("member_roles", () =>
      postUpdateRole(post({ roleId: "R7", title: "Team manager" }), ENV, CTX)
    )
    const entry = H.activity.at(-1)
    expect(entry, "the edit must write an activity row").toBeTruthy()
    expect(
      (entry?.changes ?? []).some((c) => c.label === "Description"),
      "the history claims the description changed on a rename that never sent one"
    ).toBe(false)
    expect(entry?.description ?? "").not.toMatch(/Description cleared/)
  })
})

describe("the dropdown edit door can move a value between groups", () => {
  it("forwards an explicit type, so the value really moves", async () => {
    const sql = await updateSql("selectable_data", () =>
      postUpdateSelectable(post({ id: "V1", value: "Image file", type: "Help type" }), ENV, CTX)
    )
    expect(
      sql.includes("type = 'Help type'"),
      "the door parsed no type, so the lib's move stayed unreachable from every surface"
    ).toBe(true)
  })

  it("leaves an omitted type out of the SET, so an inline rename never moves anything", async () => {
    const sql = await updateSql("selectable_data", () =>
      postUpdateSelectable(post({ id: "V1", value: "Picture file" }), ENV, CTX)
    )
    expect(sql).toContain("value = 'Picture file'")
    expect(/\btype\s*=/.test(sql), "an omitted type must not be written").toBe(false)
  })

  it("refuses a blank type at the boundary rather than silently not moving", async () => {
    // A group is REQUIRED when it is sent — there is no such thing as clearing
    // one. Present-and-empty is a caller mistake, and a clean 400 says so.
    await expect(
      postUpdateSelectable(post({ id: "V1", value: "Image file", type: "   " }), ENV, CTX)
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("the machine surface can express both halves of each door", () => {
  it("update_role OMITS a description the caller never mentioned", () => {
    // `|| ""` here is the flattening that made a door-side guard inert: the door
    // would see a present, empty field and correctly clear it.
    expect(
      tool("update_role").buildBody!({ roleId: "R7", title: "Team manager" }).description,
      "an unmentioned description must not reach the door as an empty string"
    ).toBeUndefined()
  })

  it("update_role still forwards a description the caller DID send", () => {
    expect(
      tool("update_role").buildBody!({ roleId: "R7", title: "Manager", description: "Runs the rota" })
        .description
    ).toBe("Runs the rota")
  })

  it("update_dropdown_value exposes AND forwards the group its door parses (R19)", () => {
    const t = tool("update_dropdown_value")
    const props = Object.keys((t.schema as { properties: Record<string, unknown> }).properties)
    expect(props, "a door field no tool exposes is a capability the UI has and machines don't").toContain("type")
    expect(t.buildBody!({ id: "V1", value: "Image file", type: "Help type" }).type).toBe("Help type")
  })

  it("update_dropdown_value omits the group when the caller only renames", () => {
    expect(
      tool("update_dropdown_value").buildBody!({ id: "V1", value: "Picture file" }).type,
      "an unmentioned group must not reach the door at all"
    ).toBeUndefined()
  })
})
