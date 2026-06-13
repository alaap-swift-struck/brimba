// Permission enforcement (locked rule: EVERY server request validates
// membership + rights — security is never just hiding UI).
//
// This is the seam every module worker starts each request with:
//   const guard = await requireMember(env, cfg, request, teamId)
//   await requireRight(cfg, guard, "learning", "read")
// Module workers get it ready-made the day the first module lands.

import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import type { Env } from "../env"

/** A handler-level rule failure that maps straight to an HTTP response. The
 * worker's central catch turns it into json({error, message}, status). */
export class GuardError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export type Right = "read" | "create" | "edit" | "delete"

export type MemberGuard = {
  userId: string
  teamId: string
  roleId: string
  /** the team's main database id (modules also consult routing overrides) */
  databaseId: string
}

/** Is this user an active member of this team? Throws guard_* if not. */
export async function requireMember(
  env: Env,
  userId: string,
  teamId: string
): Promise<MemberGuard> {
  const row = await env.DB.prepare(
    `SELECT tm.role_id, t.database_id
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first<{ role_id: string; database_id: string }>()
  if (!row) throw new GuardError(403, "not_member", "You're not a member of this team.")
  return { userId, teamId, roleId: row.role_id, databaseId: row.database_id }
}

/** Does the member's role hold this right on this module? (tall sheet read) */
export async function hasRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<boolean> {
  const rows = await d1Query<{
    can_read: number
    can_create: number
    can_edit: number
    can_delete: number
  }>(
    cfg,
    guard.databaseId,
    "SELECT can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ? AND module = ?",
    [guard.roleId, module]
  )
  if (!rows[0]) return false
  return rows[0][`can_${right}`] === 1
}

/** hasRight, but throws a 403 GuardError — the one-liner for handlers. */
export async function requireRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<void> {
  if (!(await hasRight(cfg, guard, module, right)))
    throw new GuardError(403, "forbidden", "You don't have permission to do that.")
}
