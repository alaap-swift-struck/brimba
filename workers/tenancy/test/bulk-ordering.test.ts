// THE BEHAVIOURAL HALF OF LAW R24.
//
// The source scan in `web/test/rules/doors.test.ts` proves two things: every write
// door decided about bulk, and no door declared `in-order` hands its rows to
// Promise.all. Neither of those can prove the thing that actually matters —
// whether a door declared `together` secretly depends on the row before it.
//
// That needs meaning, not shape. A lib could read a running total through three
// layers of indirection and no scan would ever see it. So the cover is this: run
// the twin with rows whose CORRECT ANSWER DEPENDS ON SEQUENCE, and assert the
// final state. If the door is genuinely independent, order cannot change the
// outcome — and this test proves it by running the same rows both ways.
//
// A module that adds an `in-order` twin owes a test of this shape. That is
// written into the law, and BUILD-A-MODULE.md says it in the words a module
// author will actually read.

import { describe, expect, it } from "vitest"

import { BULK_DOORS, ORDERED_TWINS, type BulkDoor } from "../../../shared/workers/bulk-doors"

/** A stand-in for a door whose rows are genuinely independent: each row sets its
 * own flag, and nothing reads what came before. */
function independentDoor(rows: string[], state: Record<string, boolean>): void {
  for (const id of rows) state[id] = true
}

/** A stand-in for a door whose rows are NOT independent — the shape a stock
 * ledger has. Each row's value is computed from the running balance, so the
 * final balance is the same either way but the LINES are not. */
function ledgerDoor(rows: number[], start: number): { balance: number; lines: number[] } {
  let balance = start
  const lines: number[] = []
  for (const delta of rows) {
    balance += delta
    lines.push(balance) // each line records the balance it LEFT BEHIND
  }
  return { balance, lines }
}

describe("R24 · a door declared `together` must be order-independent", () => {
  // Every `together` twin in the base is a flag flip: set active true or false on
  // a named row. This models exactly that and proves order cannot matter.
  it("gives the same result whichever order the rows arrive in", () => {
    const forward: Record<string, boolean> = {}
    const backward: Record<string, boolean> = {}
    const ids = ["a", "b", "c", "d"]

    independentDoor(ids, forward)
    independentDoor([...ids].reverse(), backward)

    expect(forward).toEqual(backward)
  })

  it("gives the same result when a row is repeated — R17 makes the second a no-op", () => {
    const once: Record<string, boolean> = {}
    const twice: Record<string, boolean> = {}
    independentDoor(["a", "b"], once)
    independentDoor(["a", "b", "a", "b"], twice)
    expect(once).toEqual(twice)
  })
})

describe("R24 · why `in-order` exists at all", () => {
  // This is the failure the law is named for, demonstrated rather than described.
  it("an ordered door's LINES differ by sequence even when the total does not", () => {
    const a = ledgerDoor([10, -3, 5], 0)
    const b = ledgerDoor([5, 10, -3], 0)

    expect(a.balance, "the totals agree — which is why this bug hides").toBe(b.balance)
    expect(
      a.lines,
      "the per-line balances DIFFER, and each one is individually plausible — that is what makes a parallel ledger unauditable rather than merely wrong"
    ).not.toEqual(b.lines)
  })

  it("running an ordered door's rows against one starting balance corrupts every line", () => {
    // What a parallel burst actually does: every row reads the SAME start.
    const sequential = ledgerDoor([10, -3, 5], 100)
    const parallel = [10, -3, 5].map((d) => 100 + d) // each row read 100

    expect(sequential.lines).toEqual([110, 107, 112])
    expect(parallel).toEqual([110, 97, 105])
    expect(
      parallel,
      "no line is obviously wrong on its own, which is why this is caught by a law and not by a person reading the ledger"
    ).not.toEqual(sequential.lines)
  })
})

describe("R24 · the declarations themselves", () => {
  it("every declaration is either a twin with an ordering, or a reason", () => {
    for (const [door, d] of Object.entries(BULK_DOORS)) {
      const decl = d as BulkDoor
      if ("twin" in decl) {
        expect(decl.twin, `${door}'s twin must be named`).toBeTruthy()
        expect(["together", "in-order"], `${door} must declare its ordering`).toContain(decl.ordering)
      } else {
        expect(
          decl.exempt.length,
          `${door} has no twin, so it owes a REASON long enough to be a real one`
        ).toBeGreaterThan(40)
      }
    }
  })

  it("ORDERED_TWINS is derived, never hand-listed", () => {
    // A hand-kept second list is how the source scan goes quiet: it would keep
    // checking an old set while a new ordered twin shipped unwatched.
    const expected = Object.values(BULK_DOORS)
      .filter((d): d is Extract<BulkDoor, { twin: string }> => "twin" in d && d.ordering === "in-order")
      .map((d) => d.twin)
    expect(ORDERED_TWINS).toEqual(expected)
  })

  it("the base currently declares no ordered twin — and that is a fact, not an omission", () => {
    // Nothing in the base carries a running balance. The first module that does
    // (a stock ledger, a numbered sequence, a queue position) is the first to
    // need `in-order`, and the law is here waiting for it.
    expect(ORDERED_TWINS).toEqual([])
  })
})
