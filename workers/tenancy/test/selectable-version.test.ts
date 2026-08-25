// THE GUARD NOBODY COULD CALL — dropdown values and optimistic concurrency.
//
// `updateSelectable` has carried `versionPredicate(expectedVersion)` since the
// lost-update work: the `updated_at` the editor was shown rides the UPDATE, so a
// save that would land on a row somebody else already moved is refused with a
// 409 instead of silently winning. The protection was real, and it was
// unreachable — because NO PROJECTION SELECTED A TIMESTAMP. The list read
// `id, type, value, is_default, deactivated_at`, the single-row read the same,
// so `SelectableValue` had no version field, so no caller could derive one, so
// every rename arrived with `expectedVersion` undefined and the predicate came
// back EMPTY. Two people renaming the same value silently lost one edit, on a
// door that already implemented the protection.
//
// That is why these tests derive the version THE WAY A CALLER HAS TO — from the
// row the door handed back (`updatedAt ?? createdAt`, the same fallback
// `versionPredicate` uses, so a never-edited row still has one) — rather than
// passing a literal timestamp. A test that hands the door a hand-written version
// proves the predicate compiles; it does not prove anyone can reach it. Before
// the fix, `versionOf` returned null here and the stale-write case CLOBBERED.
//
// Both directions, deliberately: refused when stale, accepted when current. A
// test that only checked the refusal would still pass if someone made the
// predicate unconditional, and one that only checked the success would pass if
// they deleted the argument.
//
// Runs the REAL SQL — the real team schema (`TEAM_MIGRATIONS`) in Node's
// built-in SQLite, which is what D1 is — so `COALESCE(updated_at, created_at)`
// is evaluated by a database rather than described by a mock.
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { d1Query, d1ExecScript } = vi.hoisted(() => ({ d1Query: vi.fn(), d1ExecScript: vi.fn() }))
// Only the NETWORK half of the data door is swapped; `sqlString` stays real, so
// the SQL these tests execute is the SQL the worker would have sent.
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  d1Query,
  d1ExecScript,
}))
vi.mock("../../../shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import type { SelectableValue } from "../../../shared/types"
import {
  createSelectable,
  listSelectable,
  oneSelectable,
  setSelectableActive,
  updateSelectable,
} from "../src/lib/selectable"
import { TEAM_MIGRATIONS } from "../src/team-schema"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "T", roleId: "ADMIN", databaseId: "db", movedModules: 0 }
const actor = { id: "ME", email: "me@x.com", name: "Me" }
const other = { id: "YOU", email: "you@x.com", name: "You" }

let db: DatabaseSync

beforeEach(() => {
  // The REAL team schema, every migration applied — not a hand-rolled table that
  // could drift from the columns production actually has.
  db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)

  d1Query.mockReset()
  d1ExecScript.mockReset()
  d1Query.mockImplementation(
    async (_c: unknown, _db: unknown, sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as []))
  )
  d1ExecScript.mockImplementation(async (_c: unknown, _db: unknown, script: string) => {
    db.exec(script)
  })
})

/** The ONLY version a caller can send: the one derived from the row it was
 * shown. Exactly what `help-detail.tsx` / `learning-detail.tsx` do, and exactly
 * what `versionPredicate`'s COALESCE expects. */
function versionOf(row: SelectableValue | null): string | null {
  return row?.updatedAt ?? row?.createdAt ?? null
}

const storedValue = (id: string) =>
  (db.prepare("SELECT value FROM selectable_data WHERE id = ?").get(id) as { value: string }).value

describe("a dropdown-value rename can reach the lost-update guard", () => {
  it("REFUSES a rename carrying the version the editor was shown after someone else saved first", async () => {
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")

    // Two people open the same value. Both are holding THIS row.
    const mine = await oneSelectable(cfg, guard, id)
    const yours = await oneSelectable(cfg, guard, id)

    // The version has to exist at all — this is the field whose absence made the
    // guard unreachable, and asserting it here is what makes the failure legible
    // instead of "the write mysteriously succeeded".
    expect(versionOf(mine), "the row a caller is shown must carry a version").not.toBeNull()

    // You save first. Your version is current, so your write lands.
    await updateSelectable(cfg, guard, other, id, "Photo", versionOf(yours))
    expect(storedValue(id)).toBe("Photo")

    // I save second, still holding the version I was shown before your save.
    // THIS is the lost update: without a version the predicate is empty and my
    // stale write wins, wiping your edit with no error to either of us.
    await expect(
      updateSelectable(cfg, guard, actor, id, "Screenshot", versionOf(mine))
    ).rejects.toMatchObject({ status: 409, code: "changed_elsewhere" })

    expect(storedValue(id), "the refused write must not have landed").toBe("Photo")
  })

  it("ACCEPTS a rename carrying the CURRENT version", async () => {
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    const shown = await oneSelectable(cfg, guard, id)

    expect(versionOf(shown)).not.toBeNull()
    await updateSelectable(cfg, guard, actor, id, "Picture file", versionOf(shown))
    expect(storedValue(id)).toBe("Picture file")
  })

  it("guards the FIRST edit of a value nobody has edited yet (COALESCE to created_at)", async () => {
    // A newly created row has a NULL `updated_at`. If the version fell back to
    // nothing, the one moment two people are most likely to be looking at the
    // same new value would be the one edit the guard could not protect.
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    const fresh = await oneSelectable(cfg, guard, id)

    expect(fresh?.updatedAt, "a never-edited row has no updated_at").toBeNull()
    expect(versionOf(fresh), "…so its version is its created_at").toBe(fresh?.createdAt)

    await expect(
      updateSelectable(cfg, guard, actor, id, "Nope", "2020-01-01T00:00:00.000Z")
    ).rejects.toMatchObject({ code: "changed_elsewhere" })
    expect(storedValue(id)).toBe("Image file")

    await updateSelectable(cfg, guard, actor, id, "Picture file", versionOf(fresh))
    expect(storedValue(id)).toBe("Picture file")
  })
})

describe("every door that hands a dropdown value back hands back a usable version", () => {
  // R21/R23: if a mutation's own response carried no version, the very next edit
  // by the person who just made the change would be unguarded again — the fault
  // would simply move one step later.
  it("the CREATE response (R21) carries a version the next edit can use", async () => {
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    const created = await oneSelectable(cfg, guard, id) // exactly what the route returns

    expect(versionOf(created)).not.toBeNull()
    await updateSelectable(cfg, guard, actor, id, "Picture file", versionOf(created))
    expect(storedValue(id)).toBe("Picture file")
  })

  it("the UPDATE response (R23) carries the NEW version, and the old one is now stale", async () => {
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    const before = await oneSelectable(cfg, guard, id)

    await updateSelectable(cfg, guard, actor, id, "Picture file", versionOf(before))
    const after = await oneSelectable(cfg, guard, id) // exactly what the route returns

    expect(after?.updatedAt, "an edited row reports its updated_at").not.toBeNull()
    expect(versionOf(after)).not.toBe(versionOf(before))

    // A second save with the returned version works…
    await updateSelectable(cfg, guard, actor, id, "Photo", versionOf(after))
    expect(storedValue(id)).toBe("Photo")
    // …and the version from before that save no longer does.
    await expect(
      updateSelectable(cfg, guard, actor, id, "Stale", versionOf(before))
    ).rejects.toMatchObject({ code: "changed_elsewhere" })
  })

  it("the STATUS response (R23) carries a version too", async () => {
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    await setSelectableActive(cfg, guard, actor, id, false)
    const updated = await oneSelectable(cfg, guard, id) // exactly what the route returns

    expect(updated?.active).toBe(false)
    expect(versionOf(updated)).not.toBeNull()
  })

  it("the LIST carries the same version the single-row read does", async () => {
    // The manager screen renames from the LIST, so a version present only on the
    // detail read would leave the one screen that does the renaming unable to
    // send it — which is the exact shape of the original fault.
    const id = await createSelectable(cfg, guard, actor, "File type", "Image file")
    const listed = (await listSelectable(cfg, guard)).find((v) => v.id === id) ?? null
    const one = await oneSelectable(cfg, guard, id)

    expect(versionOf(listed)).not.toBeNull()
    expect(versionOf(listed)).toBe(versionOf(one))

    await updateSelectable(cfg, guard, actor, id, "Picture file", versionOf(listed))
    expect(storedValue(id)).toBe("Picture file")
  })
})
