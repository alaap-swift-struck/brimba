// Members module — manage who's on a team and what role they hold.
// Membership is GLOBAL (team_members); identity is read FRESH from the global
// users table (one source of truth, locked); role titles come from the team's
// own database. All guard rules (>=1 admin, no self-lockout, remove =
// deactivate) live here.

import type { TeamMember, TeamRole } from "../../../../shared/types"
import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import type { Env } from "../env"
import { GuardError, type MemberGuard } from "./permissions"

type RoleRow = {
  id: string
  title: string
  description: string | null
  is_default: number
}

/** The team's locked Admin role id (is_default = 1). */
async function adminRoleId(cfg: D1Rest, guard: MemberGuard): Promise<string | null> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM member_roles WHERE is_default = 1 LIMIT 1"
  )
  return rows[0]?.id ?? null
}

/** Count active members holding a given role in this team. */
async function countRole(env: Env, teamId: string, roleId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, roleId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/** Everyone on the team: membership + fresh identity + role title. */
export async function listMembers(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard
): Promise<TeamMember[]> {
  const members = await env.DB.prepare(
    `SELECT tm.user_id, tm.role_id, tm.created_at,
            u.email, u.first_name, u.last_name, u.image_url
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.deactivated_at IS NULL
     ORDER BY tm.created_at`
  )
    .bind(guard.teamId)
    .all<{
      user_id: string
      role_id: string
      created_at: string
      email: string
      first_name: string | null
      last_name: string | null
      image_url: string | null
    }>()

  const roles = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, is_default FROM member_roles"
  )
  const roleById = new Map(roles.map((r) => [r.id, r]))

  return (members.results ?? []).map((m) => {
    const role = roleById.get(m.role_id)
    return {
      userId: m.user_id,
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
      imageUrl: m.image_url,
      roleId: m.role_id,
      roleTitle: role?.title ?? "Unknown role",
      isYou: m.user_id === guard.userId,
      isAdmin: role?.is_default === 1,
      joinedAt: m.created_at,
    }
  })
}

/** Every role in the team, with how many members hold each. */
export async function listRoles(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard
): Promise<TeamRole[]> {
  const roles = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, description, is_default FROM member_roles WHERE deactivated_at IS NULL ORDER BY is_default DESC, title"
  )
  const counts = await env.DB.prepare(
    "SELECT role_id, COUNT(*) AS n FROM team_members WHERE team_id = ? AND deactivated_at IS NULL GROUP BY role_id"
  )
    .bind(guard.teamId)
    .all<{ role_id: string; n: number }>()
  const countBy = new Map((counts.results ?? []).map((c) => [c.role_id, c.n]))

  return roles.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    isDefault: r.is_default === 1,
    memberCount: countBy.get(r.id) ?? 0,
  }))
}

/** The membership row for a target user (active only). */
async function membership(env: Env, teamId: string, userId: string) {
  return env.DB.prepare(
    "SELECT id, role_id FROM team_members WHERE team_id = ? AND user_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, userId)
    .first<{ id: string; role_id: string }>()
}

/** Change a member's role. Guards: not yourself, target exists, role exists,
 * and never demote the last admin. */
export async function changeMemberRole(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  targetUserId: string,
  newRoleId: string
): Promise<void> {
  if (targetUserId === guard.userId)
    throw new GuardError(409, "self", "You can't change your own role.")

  const target = await membership(env, guard.teamId, targetUserId)
  if (!target) throw new GuardError(404, "target_not_member", "That person isn't on this team.")

  const roles = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title FROM member_roles WHERE id = ? AND deactivated_at IS NULL",
    [newRoleId]
  )
  if (!roles[0]) throw new GuardError(400, "role_not_found", "That role doesn't exist.")
  if (target.role_id === newRoleId) return // no-op

  const adminId = await adminRoleId(cfg, guard)
  if (target.role_id === adminId && newRoleId !== adminId) {
    if ((await countRole(env, guard.teamId, adminId)) <= 1)
      throw new GuardError(409, "last_admin", "A team must keep at least one admin.")
  }

  // The count above is the friendly/fast path. This UPDATE re-checks the admin
  // floor INSIDE the statement, so two simultaneous demotions can't both slip
  // past the count and zero out the team's admins — D1 serializes the write, so
  // no Durable Object is needed (see CONCURRENCY.md). Allowed when: the new role
  // IS admin, OR the target isn't currently admin, OR more than one admin remains.
  const res = await env.DB.prepare(
    `UPDATE team_members SET role_id = ?, updated_at = ?
     WHERE id = ? AND deactivated_at IS NULL
       AND ( ? = ? OR role_id != ?
             OR (SELECT COUNT(*) FROM team_members
                 WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
  )
    .bind(newRoleId, new Date().toISOString(), target.id, newRoleId, adminId, adminId, guard.teamId, adminId)
    .run()
  if (!res.meta?.changes)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Member role changed",
    description: `${actor.name} changed a member's role to ${roles[0].title}`,
    // Point at the affected USER so it shows on their detail + the team feed.
    relatedTable: "users",
    relatedRowId: targetUserId,
  })
}

/** Remove a member = deactivate the membership (reversible; never hard-delete).
 * Guards: not yourself, target exists, never remove the last admin. */
export async function removeMember(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  targetUserId: string
): Promise<void> {
  if (targetUserId === guard.userId)
    throw new GuardError(409, "self", "You can't remove yourself.")

  const target = await membership(env, guard.teamId, targetUserId)
  if (!target) throw new GuardError(404, "target_not_member", "That person isn't on this team.")

  const adminId = await adminRoleId(cfg, guard)
  if (target.role_id === adminId && (await countRole(env, guard.teamId, adminId)) <= 1)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  // Atomic backstop (same reasoning as changeMemberRole): the WHERE re-checks
  // the admin floor at write time so two simultaneous removals can't both pass
  // the count above and leave the team with zero admins.
  const res = await env.DB.prepare(
    `UPDATE team_members SET deactivated_at = ?
     WHERE id = ? AND deactivated_at IS NULL
       AND ( ? IS NULL OR role_id != ?
             OR (SELECT COUNT(*) FROM team_members
                 WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
  )
    .bind(new Date().toISOString(), target.id, adminId, adminId, guard.teamId, adminId)
    .run()
  if (!res.meta?.changes)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Member removed",
    description: `${actor.name} removed a member from the team`,
    relatedTable: "users",
    relatedRowId: targetUserId,
  })
}
