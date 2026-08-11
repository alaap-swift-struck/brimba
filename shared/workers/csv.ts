// CSV building for the export endpoints (RFC-4180 shape). One rule: a field is
// quoted whenever it contains a comma, a quote, or a newline, with internal
// quotes doubled — so titles like `Say "hi", then wait` survive a round-trip
// through Excel/Numbers and back through the CSV importer. Rows end CRLF and the
// file opens with a UTF-8 BOM (Excel mis-decodes accents without it).
// Export is READ-gated at the route (the cross-cutting rule: export needs READ,
// import needs CREATE) and always built from the caller's OWN team database.

const needsQuoting = /[",\r\n]/
// CSV / formula injection: a cell a spreadsheet would evaluate as a formula
// (leads with = + - @, or a tab/CR) is neutralized with a leading apostrophe —
// Excel/Sheets treat `'` as the text-literal marker and HIDE it, so legit values
// (a "-50% off" description) still read right while `=HYPERLINK(...)` can't run.
const formulaLead = /^[=+\-@\t\r]/

function field(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ""
  let s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v)
  if (formulaLead.test(s)) s = `'${s}`
  return needsQuoting.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(
  header: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines = [header.map(field).join(","), ...rows.map((r) => r.map(field).join(","))]
  return "﻿" + lines.join("\r\n") + "\r\n"
}

/**
 * The standard download response: text/csv + an attachment filename.
 *
 * A TRUNCATED EXPORT MUST SAY SO — IN ITS NAME.
 *
 * Every export read carries a hard cap (R14, `EXPORT_HARD_CAP`), which is
 * correct: an unbounded one would build the whole table as a string inside a
 * 128 MB isolate. But the cap was SILENT. A team with 250,000 rows asked for
 * their data, got a perfectly well-formed file containing the first 10,000, and
 * had nothing to tell them the other 240,000 were missing. Someone migrating
 * off the product would lose 96% of it and find out later.
 *
 * The truncation goes in the FILENAME because that is the one piece of this a
 * person cannot miss and cannot fail to receive — an export is a browser
 * download, so a response header reaches no human, and a notice appended inside
 * the CSV would corrupt the round-trip back through the importer. The header is
 * set as well, for a machine caller reading the response rather than saving it.
 */
export function csvResponse(
  filename: string,
  csv: string,
  /** Present ONLY when rows were left out. `total` is the exact server count. */
  truncated?: { returned: number; total: number }
): Response {
  const name = truncated
    ? filename.replace(/\.csv$/, `-first-${truncated.returned}-of-${truncated.total}.csv`)
    : filename
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      ...(truncated ? { "X-Export-Truncated": String(truncated.total) } : {}),
    },
  })
}

/**
 * Did this export hit its ceiling, and if so how much was left behind?
 *
 * The rows come back from a query asking for ONE MORE than the cap — which is
 * how you learn there was more without a second count in the common case. Only
 * when the extra row actually arrives is the exact total worth paying for.
 *
 * Returns the rows to write (never more than the cap) and, when something was
 * dropped, what to tell the caller.
 */
export async function boundExport<T>(
  rows: T[],
  cap: number,
  countAll: () => Promise<number>
): Promise<{ rows: T[]; truncated?: { returned: number; total: number } }> {
  if (rows.length <= cap) return { rows }
  return { rows: rows.slice(0, cap), truncated: { returned: cap, total: await countAll() } }
}
