// R17, the part a source-scan cannot see.
//
// The scan in `web/test/rules/activity.test.ts` proves the current-status predicate is
// PRESENT in every deactivate/reactivate UPDATE — it reads the SQL string and
// looks for `AND deactivated_at IS [NOT] NULL`. That is worth having, and it is
// only half the law. The other half is what the code DOES when the predicate
// matched nothing:
//
//     R17: zero rows moved  ⇒  no activity row, and no change ping.
//
// A source scan cannot see that. It would stay green through a handler that
// carries a perfect predicate, ignores the returned row count, and writes a
// history entry anyway — which is exactly the bug R17 was written for: a
// double-clicked Deactivate writing two "deactivated" rows 2.0 seconds apart into
// one record's history. History should say what happened, not how many times a
// button was pressed.
//
// So this RUNS the transition twice and asserts the second one is silent. The
// pattern is `workers/tenancy/test/activity-scope.test.ts`: mock the data door,
// call the real function, assert what actually came out.

import { beforeEach, describe, expect, it, vi } from "vitest"

/** Every statement the function issued, in order. */
const queries: string[] = []
/** The state the fake database is in: is the row currently deactivated? */
let rowDeactivated = false

vi.mock("../../../shared/workers/d1-rest", async () => {
  const actual = await vi.importActual<typeof import("../../../shared/workers/d1-rest")>(
    "../../../shared/workers/d1-rest"
  )
  return {
    ...actual,
    // The activity row goes through d1ExecScript, not d1Query — so a mock that
    // only captured d1Query would see zero history writes in EVERY case and this
    // whole suite would pass while asserting nothing.
    d1ExecScript: vi.fn(async (_cfg: unknown, _db: string, sql: string) => {
      queries.push(sql)
      return []
    }),
    d1Query: vi.fn(async (_cfg: unknown, _db: string, sql: string) => {
      queries.push(sql)
      // The read that fetches the item before the transition.
      if (/^\s*SELECT/i.test(sql)) return [{ id: "L1", content_title: "Fire safety", deactivated_at: null }]
      // THE POINT OF THE TEST: honour the predicate exactly as the database would.
      // `RETURNING id` gives back a row only when one actually moved.
      if (/^\s*UPDATE learning SET deactivated_at = NULL/i.test(sql)) {
        const moved = rowDeactivated // reactivating only moves a deactivated row
        rowDeactivated = false
        return moved ? [{ id: "L1" }] : []
      }
      if (/^\s*UPDATE learning SET deactivated_at = \?/i.test(sql)) {
        const moved = !rowDeactivated // deactivating only moves a live row
        rowDeactivated = true
        return moved ? [{ id: "L1" }] : []
      }
      return []
    }),
  }
})

const { setLearningActive } = await import("../src/lib/learning")

const cfg = {} as never
const guard = { databaseId: "db", teamId: "t", userId: "u" } as never
const actor = { id: "u", email: "a@b.c", name: "Ada" } as never

/** Did this run write a row into the record's history? */
const activityWrites = () => queries.filter((q) => /INSERT INTO activity/i.test(q))

beforeEach(() => {
  queries.length = 0
  rowDeactivated = false
})

describe("a repeated transition is silent (R17)", () => {
  it("the FIRST deactivate moves the row, and says so", async () => {
    const changed = await setLearningActive(cfg, guard, actor, "L1", false)
    expect(changed, "the first deactivate really changes something").toBe(true)
    expect(activityWrites(), "and it belongs in the record's history").toHaveLength(1)
  })

  it("the SECOND deactivate writes NO history and reports no change", async () => {
    await setLearningActive(cfg, guard, actor, "L1", false)
    queries.length = 0

    const changed = await setLearningActive(cfg, guard, actor, "L1", false)

    expect(changed, "nothing moved, so the caller must be told nothing moved").toBe(false)
    expect(
      activityWrites(),
      "a double-clicked Deactivate wrote two identical history rows seconds apart — that is the bug R17 exists for"
    ).toEqual([])
  })

  it("the caller's false is what suppresses the ping, so the route must honour it", async () => {
    // The route publishes only when this returns true. Proving the return value
    // is the honest way to cover the ping without reaching into the route: a
    // `false` that a route ignored would be a route bug, and the publish-seam
    // suite is where that lives.
    await setLearningActive(cfg, guard, actor, "L1", false)
    expect(await setLearningActive(cfg, guard, actor, "L1", false)).toBe(false)
  })

  it("reactivating a live item is equally silent", async () => {
    // The mirror case. It is easy to guard one direction and forget the other,
    // and a spurious "activated" row is exactly as wrong as a spurious
    // "deactivated" one.
    const changed = await setLearningActive(cfg, guard, actor, "L1", true)
    expect(changed, "it was never deactivated, so there is nothing to reactivate").toBe(false)
    expect(activityWrites()).toEqual([])
  })

  it("a REAL reactivate after a real deactivate does write history", async () => {
    // The guard must not be so eager that it silences genuine changes — that
    // would be a worse failure than the duplicate it prevents, because it loses
    // history rather than repeating it.
    await setLearningActive(cfg, guard, actor, "L1", false)
    queries.length = 0
    const changed = await setLearningActive(cfg, guard, actor, "L1", true)
    expect(changed).toBe(true)
    expect(activityWrites(), "a genuine state change must always be recorded").toHaveLength(1)
  })

  it("the predicate really is on the UPDATE, not merely somewhere in the function", async () => {
    await setLearningActive(cfg, guard, actor, "L1", false)
    const update = queries.find((q) => /^\s*UPDATE learning/i.test(q))
    expect(update).toBeDefined()
    expect(update, "without the predicate the UPDATE always matches and always looks changed").toMatch(
      /WHERE id = \? AND deactivated_at IS NULL/
    )
    expect(update, "and without RETURNING there is no row count to act on").toMatch(/RETURNING id/)
  })
})
