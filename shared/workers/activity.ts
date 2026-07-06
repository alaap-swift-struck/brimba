// Activity log (locked rule #10: log everything — edits, activations,
// deactivations, joins, invites, import stages). One reusable writer every
// module calls; rows live in each team's own `activity` table and point at the
// changed row by a generic (related_table, related_row_id) pair.

import { d1ExecScript, sqlString, type D1Rest } from "./d1-rest"
import { ulid } from "./id"

export type Actor = { id: string; email: string; name: string }

export type ActivityEntry = {
  /** short machine-ish type, e.g. "Member role changed" */
  type: string
  /** human sentence shown in the feed */
  description: string
  /** which table the activity is about (e.g. "team_members") */
  relatedTable?: string
  /** the row id it's about */
  relatedRowId?: string
}

export type FieldDiff = {
  label: string
  from?: string | null
  to?: string | null
  /** long/rich fields (an article body) log "<label> updated" without the values */
  hideValues?: boolean
}

/** Name exactly WHAT changed in an edit, old → new — so the activity feed answers
 * "which fields, from what, to what" instead of just "X edited Y". Unchanged
 * fields are dropped; values are clipped so the feed stays readable. Returns ""
 * when nothing differs (callers keep their plain sentence then). */
export function describeChanges(fields: FieldDiff[]): string {
  const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v)
  const parts: string[] = []
  for (const f of fields) {
    const from = (f.from ?? "").trim()
    const to = (f.to ?? "").trim()
    if (from === to) continue
    if (f.hideValues) parts.push(`${f.label} updated`)
    else if (!from) parts.push(`${f.label} set to "${clip(to)}"`)
    else if (!to) parts.push(`${f.label} cleared (was "${clip(from)}")`)
    else parts.push(`${f.label}: "${clip(from)}" → "${clip(to)}"`)
  }
  return parts.join("; ")
}

/** Write one activity row into a team's own database. Best-effort by contract:
 * it swallows + logs its own failures so a logging hiccup can NEVER break the
 * action it describes — callers just `await logActivity(...)`, no `.catch` needed. */
export async function logActivity(
  cfg: D1Rest,
  databaseId: string,
  actor: Actor,
  entry: ActivityEntry
): Promise<void> {
  try {
    const now = new Date().toISOString()
    await d1ExecScript(
      cfg,
      databaseId,
      `INSERT INTO activity
         (id, type, description, related_table, related_row_id,
          created_at, creator_id, creator_email, creator_name)
       VALUES (
          ${sqlString(ulid())}, ${sqlString(entry.type)}, ${sqlString(entry.description)},
          ${sqlString(entry.relatedTable ?? null)}, ${sqlString(entry.relatedRowId ?? null)},
          ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)}
       );`
    )
  } catch (e) {
    console.error("activity log failed:", e)
  }
}
