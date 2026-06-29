// Ticket stakeholders — the people kept in the loop on a help ticket. A HYBRID
// model (locked): the raiser + current team admins + everyone @mentioned across
// the thread are DERIVED at read time (always recomputed, never stored, so they
// stay correct as admins change or mentions accumulate); only explicit MANUAL
// adds are stored, in the add-only `help_stakeholders` table. No remove path
// exists anywhere — "nothing on a ticket is ever removed" is enforced by physics.
// Reads the TEAM DB (help, help_threads, help_stakeholders) for the derived/stored
// rows + the GLOBAL core (team_members for admins, users for display names).

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { GuardError, type MemberGuard } from "../../../../shared/workers/gating"
import type { HelpStakeholder } from "../../../../shared/types"
import { getTicket } from "./help"
import type { Env } from "../env"

/** The four origins a stakeholder can have — drives the chip label in the UI. */
export type StakeholderOrigin = "raiser" | "admin" | "mentioned" | "added"

/** Precedence so a person who is several things at once gets the most
 * "meaningful" label: raiser > admin > mentioned > added. */
const ORIGIN_RANK: Record<StakeholderOrigin, number> = {
  raiser: 0,
  admin: 1,
  mentioned: 2,
  added: 3,
}

/** Parse a help_threads.tagged_user_ids JSON cell safely (untrusted → string[]). */
function parseTagged(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/** The team's locked Admin role id (member_roles WHERE is_default = 1, TEAM DB). */
async function adminRoleId(cfg: D1Rest, guard: MemberGuard): Promise<string | null> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM member_roles WHERE is_default = 1 LIMIT 1"
  )
  return rows[0]?.id ?? null
}

/** Every ACTIVE admin's user id (GLOBAL team_members, holders of the admin role). */
async function adminUserIds(env: Env, teamId: string, roleId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT user_id FROM team_members WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, roleId)
    .all<{ user_id: string }>()
  return (results ?? []).map((r) => r.user_id)
}

/** Look up display fields (name, email, image) for a set of user ids — restricted
 * to ACTIVE members of THIS team (join team_members), the same tenant-isolation
 * discipline as notify.ts lookupUsers. Returns a map id → {name,email,imageUrl}. */
async function lookupUsers(
  env: Env,
  teamId: string,
  ids: string[]
): Promise<Map<string, { name: string | null; email: string; imageUrl: string | null }>> {
  const out = new Map<string, { name: string | null; email: string; imageUrl: string | null }>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return out
  const placeholders = unique.map(() => "?").join(", ")
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.image_url
       FROM users u
       JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.deactivated_at IS NULL AND u.id IN (${placeholders})`
  )
    .bind(teamId, ...unique)
    .all<{
      id: string
      email: string
      first_name: string | null
      last_name: string | null
      image_url: string | null
    }>()
  for (const r of results ?? []) {
    out.set(r.id, {
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      email: r.email,
      imageUrl: r.image_url,
    })
  }
  return out
}

/** Is this user id an ACTIVE member of THIS team? (GLOBAL team_members.) */
async function isActiveMember(env: Env, teamId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM team_members WHERE team_id = ? AND user_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, userId)
    .first<{ ok: number }>()
  return !!row
}

/** Resolve the FULL stakeholder set for a ticket: raiser + current team admins +
 * everyone @mentioned across the thread (all DERIVED) ∪ manual adds (STORED). Dedup
 * by user_id; origin precedence keeps the most meaningful label. Returns only those
 * still resolvable to an active member of this team (a deactivated person drops). */
export async function listStakeholders(
  cfg: D1Rest,
  env: Env,
  guard: MemberGuard,
  ticketId: string
): Promise<HelpStakeholder[]> {
  // Best origin wins per user id (lowest rank).
  const origin = new Map<string, StakeholderOrigin>()
  const claim = (userId: string, o: StakeholderOrigin) => {
    if (!userId) return
    const prev = origin.get(userId)
    if (prev === undefined || ORIGIN_RANK[o] < ORIGIN_RANK[prev]) origin.set(userId, o)
  }

  // 1. raiser (from the help row).
  const ticket = await getTicket(cfg, guard, ticketId)
  if (ticket?.raiserId) claim(ticket.raiserId, "raiser")

  // 2. mentioned: every tagged id across the ticket's replies.
  const replyRows = await d1Query<{ tagged_user_ids: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT tagged_user_ids FROM help_threads WHERE help_id = ?",
    [ticketId]
  )
  for (const r of replyRows) for (const id of parseTagged(r.tagged_user_ids)) claim(id, "mentioned")

  // 3. manual adds (stored, add-only).
  const addedRows = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    "SELECT user_id FROM help_stakeholders WHERE help_id = ?",
    [ticketId]
  )
  for (const r of addedRows) claim(r.user_id, "added")

  // 4. current team admins (TEAM DB role id → GLOBAL holders).
  const adminId = await adminRoleId(cfg, guard)
  if (adminId) for (const id of await adminUserIds(env, guard.teamId, adminId)) claim(id, "admin")

  // 5. join all unique ids to the global users table for display (drops anyone no
  //    longer an active member of this team).
  const users = await lookupUsers(env, guard.teamId, [...origin.keys()])
  const out: HelpStakeholder[] = []
  for (const [userId, o] of origin) {
    const u = users.get(userId)
    if (!u) continue
    out.push({ userId, name: u.name, email: u.email, imageUrl: u.imageUrl, origin: o })
  }
  // Stable, readable order: by origin precedence, then name/email.
  out.sort((a, b) => {
    const r = ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin]
    return r !== 0 ? r : (a.name ?? a.email).localeCompare(b.name ?? b.email)
  })
  return out
}

/** Add a manual stakeholder (add-only; idempotent via the UNIQUE constraint). The
 * user must be an ACTIVE member of THIS team (tenant isolation). Logs activity so
 * it surfaces in the generic record feed. Returns the refreshed stakeholder list. */
export async function addStakeholder(
  cfg: D1Rest,
  env: Env,
  guard: MemberGuard,
  actor: Actor,
  ticketId: string,
  userId: string
): Promise<HelpStakeholder[]> {
  // The ticket must exist (reuse getTicket) and the target must be on this team.
  const ticket = await getTicket(cfg, guard, ticketId)
  if (!ticket) throw new GuardError(404, "help_not_found", "That ticket doesn't exist.")
  if (!(await isActiveMember(env, guard.teamId, userId)))
    throw new GuardError(400, "not_member", "That person isn't on this team.")

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT OR IGNORE INTO help_stakeholders (id, help_id, user_id, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ticketId)}, ${sqlString(userId)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Stakeholder added",
    description: `${actor.name} added a stakeholder to the ticket`,
    relatedTable: "help",
    relatedRowId: ticketId,
  })

  return listStakeholders(cfg, env, guard, ticketId)
}
