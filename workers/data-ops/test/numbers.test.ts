// READING A NUMBER THE WAY A PERSON WROTE IT — and refusing to guess.
//
// `"1,000"` was refused with "must be a number", which is true of the string and
// useless to the person holding the spreadsheet. `"1,5"` genuinely means two
// different numbers depending on where you live, and no CSV cell carries the
// context that settles it.
//
// So: normalise what is unambiguous, refuse what is not, never guess. A wrong
// guess in a stock ledger is silent, compounding and unauditable; a refusal is
// something a person can act on in five seconds.
//
// And every value stays a STRING. A quantity that round-trips through a
// JavaScript double can arrive as 0.30000000000000004, and an inventory built on
// that is wrong in a way that gets worse with every movement.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  isInteger,
  isNegative,
  isZero,
  normaliseNumber,
} from "../../../shared/workers/numbers"

const ok = (raw: string) => {
  const r = normaliseNumber(raw)
  if (!r.ok) throw new Error(`expected ${JSON.stringify(raw)} to normalise, got: ${r.reason}`)
  return r.value
}
const refused = (raw: unknown) => {
  const r = normaliseNumber(raw)
  return r.ok ? null : r.reason
}

describe("what a person writes, normalised", () => {
  it("accepts the plain cases unchanged", () => {
    expect(ok("1000")).toBe("1000")
    expect(ok("0")).toBe("0")
    expect(ok("-42")).toBe("-42")
    expect(ok("3.5")).toBe("3.5")
    expect(ok("  7  ")).toBe("7")
  })

  it("accepts thousands separators in the ONLY shape that cannot mean anything else", () => {
    // The whole reported bug: a spreadsheet exported 1,000 and the importer
    // refused it.
    expect(ok("1,000")).toBe("1000")
    expect(ok("12,345,678")).toBe("12345678")
    expect(ok("999,999")).toBe("999999")
    expect(ok("1 000")).toBe("1000")
    expect(ok("-1,500")).toBe("-1500")
  })

  it("keeps a decimal beside a grouped thousand", () => {
    expect(ok("1,234.50")).toBe("1234.50")
  })

  it("canonicalises leading zeros so two spellings compare equal as strings", () => {
    expect(ok("007")).toBe("7")
    expect(ok("-007")).toBe("-7")
    expect(ok("0")).toBe("0")
    expect(ok("0.5")).toBe("0.5")
  })
})

describe("what is ambiguous, refused", () => {
  it("REFUSES 1,5 — it means two different numbers and nothing here can tell which", () => {
    const why = refused("1,5")
    expect(why, "must refuse").toBeTruthy()
    expect(why, "and must say what to write instead, or the person is left guessing").toMatch(/1\.5|15/)
  })

  it("refuses every other non-grouping comma", () => {
    for (const bad of ["1,23", "1,2", "12,3456", "1,000,00"]) {
      expect(refused(bad), `${bad} is ambiguous and must be refused`).toBeTruthy()
    }
  })

  it("refuses what is not a number at all", () => {
    for (const bad of ["", "   ", "abc", "1.2.3", "--5", "1,000.5,2", null, undefined, {}, []]) {
      expect(refused(bad), `${JSON.stringify(bad)} must be refused`).toBeTruthy()
    }
  })

  it("refuses scientific notation deliberately", () => {
    // Unambiguous to a machine, opaque to a person checking a stock count — and
    // expanding it would mean going through a float, which is the one thing this
    // whole path exists to avoid.
    expect(refused("1e3")).toBeTruthy()
    expect(refused("1E3")).toBeTruthy()
  })
})

describe("no float, anywhere in this path", () => {
  it("never parses through a JavaScript number", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "..", "shared", "workers", "numbers.ts"),
      "utf8"
    )
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "")
    // WORD-BOUNDED, not a substring. `normaliseNumber(` contains `Number(`, so
    // a plain includes() flags the function this file is about — the same
    // unbounded-match blindness that has bitten checks here before, this time
    // producing a false alarm instead of a false all-clear.
    for (const banned of [/\bparseFloat\s*\(/, /\bparseInt\s*\(/, /\bNumber\s*\(/]) {
      expect(
        banned.test(code),
        `${banned} in the number path means a quantity can arrive as 0.30000000000000004`
      ).toBe(false)
    }
  })

  it("preserves precision a double would destroy", () => {
    // 0.1 + 0.2 famously is not 0.3. These stay strings, so nothing is added.
    expect(ok("0.1")).toBe("0.1")
    expect(ok("0.2")).toBe("0.2")
    expect(ok("9007199254740993")).toBe("9007199254740993") // past Number.MAX_SAFE_INTEGER
    expect(ok("1.100000000000000088817841970012523")).toBe("1.100000000000000088817841970012523")
  })
})

describe("the predicates a plan uses", () => {
  it("recognises zero in every spelling", () => {
    for (const z of ["0", "0.0", "-0", "0.000"]) expect(isZero(z), z).toBe(true)
    for (const n of ["1", "0.1", "-1"]) expect(isZero(n), n).toBe(false)
  })

  it("does not call negative zero negative", () => {
    expect(isNegative("-0")).toBe(false)
    expect(isNegative("-0.0")).toBe(false)
    expect(isNegative("-1")).toBe(true)
    expect(isNegative("1")).toBe(false)
  })

  it("recognises whole numbers written with a decimal part", () => {
    expect(isInteger("5")).toBe(true)
    expect(isInteger("5.0")).toBe(true)
    expect(isInteger("5.5")).toBe(false)
  })
})

// ── the plan predicts what it can, from declarations alone ────────────────────
//
// The fork's report: a plan promised 23 imports and delivered 18. All three
// unpredicted failures were knowable at plan time from the target's OWN
// declarations plus the row in front of you. These prove the plan now sees them,
// through the SAME scan the execution uses — which is what makes it honest by
// construction rather than by a second implementation kept in step by hand.

import { scanRows } from "../src/lib/import-plan"
import type { TargetDef } from "../src/lib/targets"

const MOVEMENTS = {
  tableKey: "stock_movements",
  displayName: "Stock movements",
  columns: [
    { key: "kind", label: "Kind", required: true, values: ["receipt", "issue"] },
    {
      key: "quantity",
      label: "Quantity",
      required: true,
      numeric: {
        integer: true,
        nonZero: true,
        signFrom: { column: "kind", positive: ["receipt"], negative: ["issue"] },
      },
    },
  ],
} as unknown as TargetDef

const scan = (rows: string[][]) =>
  scanRows(MOVEMENTS, { kind: "Kind", quantity: "Qty" }, {}, ["Kind", "Qty"], rows)

describe("the plan predicts the three knowable failures", () => {
  it("accepts a thousands-separated quantity that used to be refused", () => {
    const [row] = scan([["receipt", "1,000"]])
    expect(row.reject, "1,000 is ordinary in a spreadsheet").toBeUndefined()
    expect(row.mapped.quantity, "and it is carried on CANONICALISED").toBe("1000")
  })

  it("predicts an unknown enumerated value", () => {
    const [row] = scan([["transfer", "5"]])
    expect(row.reject).toMatch(/isn't a valid kind/i)
    expect(row.reject, "and says what IS legal").toMatch(/receipt|issue/)
  })

  it("predicts a zero quantity", () => {
    const [row] = scan([["receipt", "0"]])
    expect(row.reject).toMatch(/can't be zero/i)
  })

  it("predicts a sign that contradicts its kind", () => {
    const issue = scan([["issue", "5"]])[0]
    expect(issue.reject, "an issue of +5 contradicts itself").toMatch(/negative/i)
    const receipt = scan([["receipt", "-5"]])[0]
    expect(receipt.reject, "and a receipt of -5 likewise").toMatch(/positive/i)
  })

  it("predicts a fractional quantity where whole numbers are declared", () => {
    expect(scan([["receipt", "2.5"]])[0].reject).toMatch(/whole number/i)
  })

  it("lets a correct row through untouched", () => {
    expect(scan([["receipt", "12"]])[0].reject).toBeUndefined()
    expect(scan([["issue", "-3"]])[0].reject).toBeUndefined()
  })

  it("costs nothing for a target that declares no numeric rule", () => {
    // Every existing base target. Adding the capability must not change them.
    const plain = { tableKey: "t", displayName: "T", columns: [{ key: "a", label: "A", required: true }] } as unknown as TargetDef
    const [row] = scanRows(plain, { a: "A" }, {}, ["A"], [["anything at all"]])
    expect(row.reject).toBeUndefined()
  })
})
