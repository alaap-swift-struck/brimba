// The CSV builder behind the export endpoints. The one thing that must never
// break: quoting — a title like `Say "hi", then wait` or a multi-line body must
// survive Excel and round-trip back through the CSV importer.

import { describe, expect, it } from "vitest"

import { csvResponse, toCsv } from "../../../shared/workers/csv"

describe("toCsv — RFC-4180 quoting", () => {
  it("quotes commas, quotes and newlines; doubles internal quotes", () => {
    const csv = toCsv(
      ["title", "body"],
      [
        ['Say "hi", then wait', "line one\nline two"],
        ["plain", null],
      ]
    )
    expect(csv).toContain("title,body")
    expect(csv).toContain('"Say ""hi"", then wait"') // quotes doubled, field quoted
    expect(csv).toContain('"line one\nline two"') // newline stays INSIDE the quoted field
    expect(csv).toContain("plain,") // null → empty field, unquoted plain text stays bare
  })

  it("opens with a UTF-8 BOM and ends rows CRLF (Excel-safe)", () => {
    const csv = toCsv(["a"], [["x"]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.endsWith("\r\n")).toBe(true)
  })

  it("renders booleans as yes/no (the human-readable active column)", () => {
    expect(toCsv(["active"], [[true], [false]])).toContain("yes\r\nno")
  })

  it("neutralizes formula-injection (a value a spreadsheet would execute)", () => {
    // A user-controlled role description of `=HYPERLINK(...)` must NOT run in Excel —
    // it's prefixed with the text-literal apostrophe (which Excel hides on display).
    const csv = toCsv(["description"], [["=HYPERLINK(\"http://evil\",\"x\")"], ["-2+3"], ["@SUM(A1)"], ["safe"]])
    expect(csv).toContain(`"'=HYPERLINK`) // quoted (has a comma) + leading '
    expect(csv).toContain("'-2+3")
    expect(csv).toContain("'@SUM(A1)")
    expect(csv).toContain("safe") // a normal value is untouched
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m) // never a bare leading =
  })

  it("csvResponse sets the download headers", () => {
    const res = csvResponse("learning.csv", "a\r\n")
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toContain('filename="learning.csv"')
  })
})
