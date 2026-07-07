// The zero-dependency .xlsx reader (UI-GAPS #11): a REAL deflate-zipped fixture
// (Python stdlib zipfile) exercises the ZIP directory walk, DecompressionStream
// inflation, shared strings, inline strings, booleans, numbers, column gaps,
// and CSV quoting.

import { describe, expect, it } from "vitest"

import { xlsxToCsv } from "@/lib/xlsx-to-csv"
import { XLSX_FIXTURE_B64 } from "./fixtures-xlsx-b64"

function fixtureBuf(): ArrayBuffer {
  const bin = atob(XLSX_FIXTURE_B64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

describe("xlsxToCsv: minimal safe Excel reading", () => {
  it("reads the first sheet to CSV — strings, quoting, gaps, numbers, booleans, inline", async () => {
    const csv = await xlsxToCsv(fixtureBuf())
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe("Role name,Description")
    // A shared string containing a comma + quotes must come out CSV-quoted.
    expect(lines[1]).toBe('Editor,"Can create, and ""edit"""')
    // Row 3: B is a GAP (empty), C=42 raw number, D=boolean, E=inline string.
    expect(lines[2]).toBe("Approver,,42,true,inline!")
  })

  it("throws on bytes that are not a zip (the caller shows its friendly message)", async () => {
    await expect(xlsxToCsv(new Uint8Array([1, 2, 3, 4]).buffer)).rejects.toThrow()
  })
})
