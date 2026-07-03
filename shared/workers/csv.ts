// CSV building for the export endpoints (RFC-4180 shape). One rule: a field is
// quoted whenever it contains a comma, a quote, or a newline, with internal
// quotes doubled — so titles like `Say "hi", then wait` survive a round-trip
// through Excel/Numbers and back through the CSV importer. Rows end CRLF and the
// file opens with a UTF-8 BOM (Excel mis-decodes accents without it).
// Export is READ-gated at the route (the cross-cutting rule: export needs READ,
// import needs CREATE) and always built from the caller's OWN team database.

const needsQuoting = /[",\r\n]/

function field(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ""
  const s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v)
  return needsQuoting.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(
  header: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines = [header.map(field).join(","), ...rows.map((r) => r.map(field).join(","))]
  return "﻿" + lines.join("\r\n") + "\r\n"
}

/** The standard download response: text/csv + an attachment filename. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
