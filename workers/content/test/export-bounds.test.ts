// AN EXPORT THAT LEAVES DATA BEHIND MUST SAY SO.
//
// Every export read carries a hard cap (R14, EXPORT_HARD_CAP) and that is
// right: an unbounded one builds the whole table as a string inside a 128 MB
// isolate. But the cap was SILENT. A team with 250,000 rows asked for their
// data, received a perfectly well-formed CSV containing the first 10,000, and
// had nothing anywhere to tell them the other 240,000 were missing.
//
// That is worse than an error. An error gets noticed. This gets migrated.
//
// The notice goes in the FILENAME because an export is a browser download: a
// response header reaches no human, and a warning row inside the CSV would
// corrupt the round-trip back through the importer that the format promises.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { boundExport, csvResponse, toCsv } from "../../../shared/workers/csv"
import { EXPORT_HARD_CAP } from "../../../shared/workers/limits"

const root = join(__dirname, "..", "..", "..")
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))
const never = () => Promise.reject(new Error("the exact count must not be paid for unnecessarily"))

describe("boundExport", () => {
  it("passes an export that fits straight through", async () => {
    const out = await boundExport(rows(50), 100, never)
    expect(out.rows).toHaveLength(50)
    expect(out.truncated, "nothing was left behind, so there is nothing to say").toBeUndefined()
  })

  it("does NOT count the table when the export fits", async () => {
    // The +1 row is the whole trick: it answers "was there more?" for free, so
    // the ordinary export never pays for a COUNT(*) over the whole table.
    await expect(boundExport(rows(100), 100, never)).resolves.toBeDefined()
  })

  it("treats exactly-at-the-cap as complete, not truncated", async () => {
    const out = await boundExport(rows(100), 100, never)
    expect(out.truncated).toBeUndefined()
  })

  it("reports the exact total the moment one extra row appears", async () => {
    const out = await boundExport(rows(101), 100, async () => 250_000)
    expect(out.rows, "never write more than the cap").toHaveLength(100)
    expect(out.truncated).toEqual({ returned: 100, total: 250_000 })
  })
})

describe("the download itself", () => {
  const nameOf = (res: Response) =>
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1]

  it("keeps the plain name when nothing was dropped", () => {
    const res = csvResponse("learning.csv", toCsv(["a"], [["1"]]))
    expect(nameOf(res)).toBe("learning.csv")
    expect(res.headers.get("X-Export-Truncated")).toBeNull()
  })

  it("puts the shortfall in the FILENAME, where a person cannot miss it", () => {
    const res = csvResponse("learning.csv", "x", { returned: 10_000, total: 250_000 })
    expect(nameOf(res)).toBe("learning-first-10000-of-250000.csv")
  })

  it("tells a machine caller too", () => {
    const res = csvResponse("learning.csv", "x", { returned: 10_000, total: 250_000 })
    expect(res.headers.get("X-Export-Truncated")).toBe("250000")
  })

  it("does not put the notice INSIDE the file", () => {
    // The CSV format promises a round-trip back through the importer. A warning
    // row would be read as a record to import.
    const csv = toCsv(["title"], [["one"], ["two"]])
    const res = csvResponse("learning.csv", csv, { returned: 2, total: 9 })
    expect(res.body).toBeTruthy()
    expect(csv).not.toMatch(/truncated|of 9|incomplete/i)
  })
})

describe("the export doors use it", () => {
  // member-roles is deliberately absent: it is bounded by how many ROLES a team
  // has, which is tens. Listing the ones that matter beats a discovery rule that
  // would quietly stop matching.
  const DOORS = [
    ["content", "learning.ts", "getLearningExport", "learning.csv"],
    ["tenancy", "selectable.ts", "getSelectableExport", "dropdown-values.csv"],
  ] as const

  for (const [worker, file, fn, filename] of DOORS) {
    it(`${fn} refuses to truncate silently`, () => {
      const src = readFileSync(join(root, "workers", worker, "src", "routes", file), "utf8")
      const body = src.slice(src.indexOf(`export async function ${fn}`))
      const door = body.slice(0, body.indexOf("csvResponse(") + 200)
      expect(
        /boundExport\(/.test(door),
        `${fn} must measure what it left behind`
      ).toBe(true)
      expect(
        new RegExp(`csvResponse\\("${filename.replace(".", "\\.")}", csv, truncated\\)`).test(door),
        `${fn} must PASS the shortfall to the response — measuring it and dropping it is the same silence`
      ).toBe(true)
    })
  }

  it("asks the database for one row MORE than the cap", () => {
    // Without the +1 the door can never tell a full page from a truncated one,
    // and boundExport would report every maximal export as complete.
    for (const [worker, lib] of [["content", "learning.ts"], ["tenancy", "selectable.ts"]] as const) {
      const src = readFileSync(join(root, "workers", worker, "src", "lib", lib), "utf8")
      expect(
        src.includes("LIMIT ${EXPORT_HARD_CAP + 1}"),
        `${worker}/${lib}'s export read must fetch the extra row`
      ).toBe(true)
    }
  })

  it("keeps the cap itself a real ceiling", () => {
    expect(EXPORT_HARD_CAP).toBeGreaterThan(0)
    expect(EXPORT_HARD_CAP, "an export still must not build an unbounded string").toBeLessThanOrEqual(50_000)
  })
})
