// Read a dropped/picked spreadsheet file to CSV text — shared by the Import
// screen and the assistant's chat attachments, so both speak with one voice.
// CSV/TSV are read directly. XLSX is intentionally NOT parsed in-app: the only
// mature browser parser (SheetJS npm) ships with a HIGH security advisory, and
// this base stays clean + reusable — so we ask for a CSV (one export click in
// Excel/Numbers) rather than pull in a risky dep. Safe direct-XLSX support is
// tracked in UI-GAPS #11 / AGENTIC-IMPORT §9.

/** A friendly error whose message is surfaced verbatim (vs a generic toast). */
export class UserFileError extends Error {}

export async function fileToCsv(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls"))
    throw new UserFileError(
      `Excel files aren't read directly yet. In Excel or Numbers, choose File → Export / Save As → CSV, then drop "${file.name.replace(/\.xl\w+$/i, ".csv")}" here.`
    )
  return file.text()
}
