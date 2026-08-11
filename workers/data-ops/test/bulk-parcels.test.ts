// THE DOOR'S OWN CEILING WINS. The importer used to pack every bulk call to the
// pipeline's global ceiling, which is right for most doors and wrong for any door
// that caps LOWER — and a bulk door refuses an oversized parcel WHOLE. A 400-row
// import against a door that caps at 200 therefore failed 400 rows, and the report
// read like 400 bad rows instead of one bad parcel.
//
// Two things are locked here: the arithmetic (the MINIMUM of the two ceilings) and
// the honesty of the failure (a refused parcel is ONE problem covering N rows).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { BULK_MAX_ROWS } from "../../../shared/workers/limits"
import { packParcels, parcelSize } from "../src/lib/import-plan"

const SRC = join(__dirname, "..", "src")
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8")

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe("parcelSize — the minimum of the two ceilings", () => {
  it("uses the TARGET's ceiling when it is lower (the fault: a 200-row door)", () => {
    expect(parcelSize({ bulk: { path: "/x", maxRows: 200 } })).toBe(200)
  })

  it("uses the GLOBAL ceiling when the target declares none", () => {
    expect(parcelSize({ bulk: { path: "/x" } })).toBe(BULK_MAX_ROWS)
    expect(parcelSize({})).toBe(BULK_MAX_ROWS)
  })

  it("never lets a target declare its way ABOVE the global ceiling", () => {
    expect(
      parcelSize({ bulk: { path: "/x", maxRows: BULK_MAX_ROWS * 10 } }),
      "the global cap is about what one request should carry, not what a door will tolerate"
    ).toBe(BULK_MAX_ROWS)
  })

  it("falls back rather than producing empty parcels for ever on a nonsense value", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(parcelSize({ bulk: { path: "/x", maxRows: bad } })).toBe(BULK_MAX_ROWS)
  })
})

describe("packParcels", () => {
  it("splits at the DOOR's ceiling — the 400-row import that used to fail whole", () => {
    const parcels = packParcels(rows(400), { bulk: { path: "/x", maxRows: 200 } })
    expect(parcels.map((p) => p.length), "two parcels the door will accept, not one it won't").toEqual([200, 200])
    expect(parcels.flat().length, "every row still travels exactly once").toBe(400)
  })

  it("leaves a short remainder as its own parcel", () => {
    expect(packParcels(rows(450), { bulk: { path: "/x", maxRows: 200 } }).map((p) => p.length)).toEqual([200, 200, 50])
  })

  it("is a no-op on an empty set (no empty parcel is ever sent)", () => {
    expect(packParcels([], { bulk: { path: "/x", maxRows: 200 } })).toEqual([])
  })
})

describe("a refused PARCEL is reported as one problem, not N bad rows", () => {
  const batch = read("lib", "import-batch.ts")
  const importer = read("lib", "import.ts")

  it("the batch engine pushes ONE parcel-scoped rejection carrying its row count", () => {
    const at = batch.indexOf("if (def.bulk)")
    expect(at, "the bulk path must exist in the batch engine").toBeGreaterThan(-1)
    const body = batch.slice(at, at + 1200)
    expect(body, "the parcel must be sized by the shared arithmetic, never inline").toContain("packParcels(")
    expect(body, 'a refused parcel is scope:"parcel"').toContain('scope: "parcel"')
    expect(body, "…and says how many rows it covers, so the UI can count rows AND problems").toContain(
      "rows: parcel.length"
    )
    // The failing shape: one rejection PER ROW of the parcel.
    expect(
      /for \(const .* of parcel\)[\s\S]{0,200}rejections\.push/.test(body),
      "a refused parcel must NOT be reported once per row — that reads as N bad rows"
    ).toBe(false)
  })

  it("the parcel writer's message says the whole batch was refused", () => {
    const at = importer.indexOf("export async function writeParcel")
    expect(at).toBeGreaterThan(-1)
    const body = importer.slice(at, at + 1400)
    expect(body, "the message must name the batch, not blame a row").toMatch(/whole batch/i)
  })
})
