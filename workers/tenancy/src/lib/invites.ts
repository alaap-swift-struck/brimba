// Invites module — invite people to a team by email. The invite lives in the
// GLOBAL core DB (invite_index) so onboarding can route a new signup straight
// into the team (acceptPendingInvites reads it). The branded invite email is
// sent THROUGH the auth worker (it owns the Resend key). All guards live here.

import { brand } from "../../../../shared/brand"
import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import { brandedEmail } from "../../../../shared/workers/email-template"
import { ulid } from "../../../../shared/workers/id"
import type { Invite } from "../../../../shared/types"
import type { Env } from "../env"
import { GuardError, type MemberGuard } from "./permissions"

const INVITE_TTL_DAYS = 7
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type InviteRow = {
  id: string
  email: string
  role_id: string
  status: string
  expires_at: string
  created_at: string
}

/** Every invite for this team (any status), newest first, with role titles. */
export async function listInvites(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard
): Promise<Invite[]> {
  const rows = await env.DB.prepare(
    "SELECT id, email, role_id, status, expires_at, created_at FROM invite_index WHERE team_id = ? ORDER BY created_at DESC"
  )
    .bind(guard.teamId)
    .all<InviteRow>()

  const roles = await d1Query<{ id: string; title: string }>(
    cfg,
    guard.databaseId,
    "SELECT id, title FROM member_roles"
  )
  const titleById = new Map(roles.map((r) => [r.id, r.title]))
  const now = new Date().toISOString()

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    roleId: r.role_id,
    roleTitle: titleById.get(r.role_id) ?? "Unknown role",
    // A still-"pending" invite past its expiry is shown as expired.
    status:
      r.status === "pending" && r.expires_at < now
        ? "expired"
        : (r.status as Invite["status"]),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }))
}

/** Create a pending invite + send the branded email. Guards: valid email, role
 * exists, not already a member, no existing pending invite. */
export async function createInvite(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  email: string,
  roleId: string,
  appOrigin: string
): Promise<void> {
  const to = email.trim().toLowerCase()
  if (!EMAIL_RE.test(to))
    throw new GuardError(400, "invalid_email", "That doesn't look like an email address.")

  const roles = await d1Query<{ id: string; title: string }>(
    cfg,
    guard.databaseId,
    "SELECT id, title FROM member_roles WHERE id = ? AND deactivated_at IS NULL",
    [roleId]
  )
  if (!roles[0]) throw new GuardError(400, "role_not_found", "That role doesn't exist.")

  const alreadyMember = await env.DB.prepare(
    `SELECT 1 FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND u.email = ? AND tm.deactivated_at IS NULL`
  )
    .bind(guard.teamId, to)
    .first()
  if (alreadyMember) throw new GuardError(409, "already_member", "They're already on this team.")

  const pending = await env.DB.prepare(
    "SELECT 1 FROM invite_index WHERE team_id = ? AND email = ? AND status = 'pending'"
  )
    .bind(guard.teamId, to)
    .first()
  if (pending) throw new GuardError(409, "already_invited", "They already have a pending invite.")

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400000).toISOString()
  try {
    await env.DB.prepare(
      `INSERT INTO invite_index (id, email, team_id, invite_row_id, role_id, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(ulid(), to, guard.teamId, ulid(), roleId, expiresAt, now.toISOString())
      .run()
  } catch (e) {
    // The partial unique index (db/core/0006) backstops a simultaneous second
    // invite that slipped past the pending-check above — report it kindly.
    if (String((e as Error)?.message ?? "").includes("UNIQUE"))
      throw new GuardError(409, "already_invited", "They already have a pending invite.")
    throw e
  }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Invite sent",
    description: `${actor.name || "Someone"} invited ${to} as ${roles[0].title}`,
  })

  const teamRow = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(guard.teamId)
    .first<{ name: string }>()
  const teamName = teamRow?.name ?? "a team"

  // Branded invite email, sent through the auth worker (best-effort).
  const { html, text } = brandedEmail({
    heading: `You're invited to ${teamName}`,
    intro: `${actor.name || "Someone"} invited you to join ${teamName} on ${brand.name} as ${roles[0].title}. Sign in with this email address to accept.`,
    ctaLabel: `Join ${teamName}`,
    // Deep-link to the in-app Invitations inbox: an already-signed-in user lands
    // right on Accept; a new user is sent to sign in, then onboarding auto-joins.
    ctaUrl: `${appOrigin}/invitations`,
    footnote: "This invite expires in 7 days. If you weren't expecting it, you can ignore this email.",
  })
  await env.AUTH.fetch("https://auth/internal/send-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": env.INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({
      to,
      subject: `You're invited to ${teamName} on ${brand.name}`,
      html,
      text,
    }),
  }).catch((e) => console.error("invite email failed:", e))
}

/** Revoke ("redact") a pending invite, and log it (if one was actually revoked). */
export async function revokeInvite(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  inviteId: string
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT email FROM invite_index WHERE id = ? AND team_id = ?"
  )
    .bind(inviteId, guard.teamId)
    .first<{ email: string }>()

  const res = await env.DB.prepare(
    "UPDATE invite_index SET status = 'revoked' WHERE id = ? AND team_id = ? AND status = 'pending'"
  )
    .bind(inviteId, guard.teamId)
    .run()

  if (res.meta?.changes)
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Invite revoked",
      description: `${actor.name} revoked the invite${row?.email ? ` for ${row.email}` : ""}`,
    })
}
