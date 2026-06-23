// A small, dependency-free CSV parser (RFC-4180-ish): handles quoted fields,
// embedded commas/newlines, "" escaped quotes, CRLF, and a leading BOM. Used by the
// import to read an uploaded spreadsheet exported as CSV. (Excel/.xlsx parsing is
// left to the AI extraction step in Phase 3 — this worker takes CSV text today.)

export type ParsedCsv = { headers: string[]; rows: string[][] }

export function parseCsv(input: string): ParsedCsv {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM

  const all: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  let i = 0
  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    all.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ",") {
      endField()
      i++
      continue
    }
    if (c === "\r") {
      i++
      continue
    }
    if (c === "\n") {
      endRow()
      i++
      continue
    }
    field += c
    i++
  }
  // flush the trailing field/row when the file doesn't end in a newline
  if (field.length > 0 || row.length > 0) endRow()

  // drop fully-blank rows (e.g. trailing empty lines)
  const nonEmpty = all.filter((r) => r.some((cell) => cell.trim() !== ""))
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim())
  return { headers, rows: nonEmpty }
}
