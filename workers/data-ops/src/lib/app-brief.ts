// The agent's CAPABILITY BRIEF — what the APP around it can do, GENERATED from
// the app's own import/export catalog (targets.ts), never hand-written. This is
// the agent-app parity seam (Law R9): the UI and the agent read the same truth,
// so the agent can never deny a capability the UI shows (or invent one it
// doesn't). agent-parity.test.ts machine-checks that every target, sample and
// export named in the catalog appears here, and that the brief rides in the
// agent's system prompt.

import { TARGETS } from "./targets"

export function capabilityBrief(): string {
  const lines: string[] = []
  lines.push(
    "THE APP AROUND YOU — generated from the app's own catalog, so it is always current. When a user asks about getting data in or out, point them at these; NEVER say a capability listed here doesn't exist:"
  )
  lines.push(
    "Bulk CSV IMPORT — the Import screen (Settings → your team → an Import CSV button sits on each importable tab, and the screen accepts several files at once). The assistant reads the files, maps the columns, orders tables that depend on each other, previews any rows that will be skipped (with reasons and a downloadable fix list), then writes every row through the same doors the screens use — imported rows carry the same audit trail and activity as hand-typed ones. Every import place offers a downloadable SAMPLE file showing what a good file looks like. Excel (.xlsx) files can be dropped straight in too (first sheet is read); only old .xls needs a Save-As first. Importable tables:"
  )
  for (const t of Object.values(TARGETS)) {
    const required = t.columns
      .filter((c) => c.required)
      .map((c) => c.label)
      .join(", ")
    const refs = (t.references ?? [])
      .map((r) => `${r.column} → ${TARGETS[r.target]?.displayName ?? r.target}`)
      .join(", ")
    lines.push(
      `- ${t.displayName}: ${t.description} Required column(s): ${required}.` +
        (refs ? ` References ${refs}, so those import first (dependency order).` : "") +
        (t.exportPath
          ? ` Full CSV EXPORT available too (the Export CSV button — needs only the read right).`
          : "") +
        ` Importing needs the create right on ${t.displayName}.`
    )
  }
  lines.push(
    "For a whole spreadsheet, the user can either open the Import screen OR attach the CSV file(s) right here in this chat — you'll receive the planned import and can run it for them after the app's confirm panel. Your one-at-a-time tools are for single records, not files."
  )
  return lines.join("\n")
}
