// Read a dropped/picked spreadsheet file to CSV text — shared by the Import
// screen and the assistant's chat attachments, so both speak with one voice.
// CSV/TSV are read directly. .xlsx is read by OUR minimal zero-dependency
// parser (xlsx-to-csv.ts — first sheet; no SheetJS, whose npm build carries a
// HIGH advisory). Legacy .xls (the pre-2007 binary format) stays unsupported —
// one Save-As in Excel/Numbers converts it.

import { xlsxToCsv } from "@/lib/xlsx-to-csv"

/** A friendly error whose message is surfaced verbatim (vs a generic toast). */
export class UserFileError extends Error {}

export async function fileToCsv(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".xls"))
    throw new UserFileError(
      `Old-format Excel files (.xls) aren't readable. In Excel or Numbers, choose File → Save As → .xlsx or CSV, then drop "${file.name.replace(/\.xls$/i, ".xlsx")}" here.`
    )
  if (lower.endsWith(".xlsx")) {
    try {
      return await xlsxToCsv(await file.arrayBuffer())
    } catch {
      throw new UserFileError(
        `Couldn't read "${file.name}" as an Excel file. Export it as CSV and drop that instead.`
      )
    }
  }
  return file.text()
}
