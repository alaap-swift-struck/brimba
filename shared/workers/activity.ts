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
