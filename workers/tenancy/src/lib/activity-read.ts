// Read side of the activity log (the write side is shared/workers/activity.ts).
// One feed table per team; the SAME rows are surfaced in three scopes by the
// relation each row carries: the whole team, one user, or one role. See
// the activity ruleset in ARCHITECTURE.md.

import type { ActivityItem } from "../../../../shared/types"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import type { MemberGuard } from "./permissions"

type ActivityRow = {
  id: string
  type: string
  description: string
  created_at: string
  creator_name: string | null
}

const LIMIT = 50

/** The team's activity, newest first — optionally scoped to one record:
 *  • team   → everything that happened in the team
 *  • user   → events about that member (role changes, removal, join)
 *  • role   → events about that role (created, renamed, permissions changed)
 *  • invite → events about that invite (sent, revoked) — `id` is the team-local
 *             invite_logs row id (the caller maps invite_index.id → it first)
 *  • record → GENERIC: any module's record, by (`table`, `id`). user/role/invite
 *             are just fixed-`table` aliases of this; `record` lets a NEW module
 *             (help, learning, products…) surface its activity with zero new code. */
export async function getActivity(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "team" | "user" | "role" | "invite" | "record",
  id?: string,
  table?: string
): Promise<ActivityItem[]> {
  let sql = "SELECT id, type, description, created_at, creator_name FROM activity"
  const params: (string | number)[] = []
  if (scope === "user" && id) {
    sql += " WHERE related_table = 'users' AND related_row_id = ?"
    params.push(id)
  } else if (scope === "role" && id) {
    sql += " WHERE related_table = 'member_roles' AND related_row_id = ?"
    params.push(id)
  } else if (scope === "invite" && id) {
    sql += " WHERE related_table = 'invite_logs' AND related_row_id = ?"
    params.push(id)
  } else if (scope === "record" && id && table) {
    sql += " WHERE related_table = ? AND related_row_id = ?"
    params.push(table, id)
  }
  sql += " ORDER BY created_at DESC LIMIT ?"
  params.push(LIMIT)

  const rows = await d1Query<ActivityRow>(cfg, guard.databaseId, sql, params)
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    actorName: r.creator_name,
    createdAt: r.created_at,
  }))
}
