// Is this user an active member of this team? ONE web-safe helper (typed via an
// explicit workers-types import, so the web build — which compiles shared/ —
// stays happy). Used by the realtime worker to gate WebSocket connections with
// the SAME rule the API uses: security is never just hiding UI.

import type { D1Database } from "@cloudflare/workers-types"

export async function isActiveMember(
  db: D1Database,
  userId: string,
  teamId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM team_members tm
       JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL
       WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
    )
    .bind(teamId, userId)
    .first()
  return row !== null
}
