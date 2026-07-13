// Invites module — invite people to a team by email. The invite lives in the
// GLOBAL core DB (invite_index) so onboarding can route a new signup straight
// into the team (acceptPendingInvites reads it). The branded invite email is
// sent THROUGH the auth worker (it owns the Resend key). All guards live here.

import { brand } from "../../../../shared/brand"
import { logActivity, type Actor } from "../../../../shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "../../../../shared/workers/d1-rest"
import { brandedEmail } from "../../../../shared/workers/email-template"
import { ulid } from "../../../../shared/workers/id"
import type { Invite, InviteAudit } from "../../../../shared/types"
import type { Env } from "../env"
import { GuardError, type MemberGuard } from "./permissions"
import { notifyInviteRevoked } from "./notify"

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

/** The per-team invite_logs audit for one invite (M4), resolved from the GLOBAL
 * invite id (invite_index.id) → its team-local invite_row_id → the audit row.
 * null if there's no audit row (e.g. an invite created before invite_logs, or a
 * mismatched id). Powers the inviter snapshot + acceptance on the invite detail. */
export async function getInviteAudit(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  inviteId: string
): Promise<InviteAudit | null> {
  const idx = await env.DB.prepare(
    "SELECT invite_row_id FROM invite_index WHERE id = ? AND team_id = ?"
  )
    .bind(inviteId, guard.teamId)
    .first<{ invite_row_id: string }>()
  if (!idx?.invite_row_id) return null

  const rows = await d1Query<{
    inviter_full_name: string | null
    inviter_email: string | null
    inviter_image: string | null
    invitee_user_row_id: string | null
    invite_accepted: number
    invite_acceptance_timestamp: string | null
    shelf_life_in_hours: number
  }>(
    cfg,
    guard.databaseId,
    `SELECT inviter_full_name, inviter_email, inviter_image, invitee_user_row_id,
            invite_accepted, invite_acceptance_timestamp, shelf_life_in_hours
     FROM invite_logs WHERE id = ?`,
    [idx.invite_row_id]
  )
  const r = rows[0]
  if (!r) return null
  return {
    inviterName: r.inviter_full_name,
    inviterEmail: r.inviter_email,
    inviterImageUrl: r.inviter_image,
    inviteeHasAccount: r.invitee_user_row_id != null,
    accepted: r.invite_accepted === 1,
    acceptedAt: r.invite_acceptance_timestamp,
    shelfLifeHours: r.shelf_life_in_hours,
  }
}

/** Create a pending invite + send the branded email. Guards: valid email, NOT
 * yourself, role exists, not already a member, no existing pending invite. Returns
 * the new invite id (so the caller can publish a row-level live update for just that
 * row) AND whether the branded email actually went out — the email is best-effort
 * (the invite_index row is the routing truth: a missed email is still acceptable
 * in-app), so callers report `emailSent` HONESTLY rather than assuming it sent. */
export async function createInvite(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  email: string,
  roleId: string,
  request: Request
): Promise<{ inviteId: string; emailSent: boolean }> {
  const to = email.trim().toLowerCase()
  if (!EMAIL_RE.test(to))
    throw new GuardError(400, "invalid_email", "That doesn't look like an email address.")

  // You can't invite yourself — you're already on the team. (Blocked transitively by the
  // already-member check below too, but caught here first for a clear, self-specific message.)
  if (to === actor.email.trim().toLowerCase())
    throw new GuardError(409, "self_invite", "You can't invite yourself — you're already on the team.")

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
  const inviteId = ulid()
  const inviteRowId = ulid() // the per-team invite_logs row id (invite_index.invite_row_id)
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400000).toISOString()
  try {
    await env.DB.prepare(
      `INSERT INTO invite_index (id, email, team_id, invite_row_id, role_id, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(inviteId, to, guard.teamId, inviteRowId, roleId, expiresAt, now.toISOString())
      .run()
  } catch (e) {
    // The partial unique index (db/core/0006) backstops a simultaneous second
    // invite that slipped past the pending-check above — report it kindly.
    if (String((e as Error)?.message ?? "").includes("UNIQUE"))
      throw new GuardError(409, "already_invited", "They already have a pending invite.")
    throw e
  }

  // Per-team invite_logs audit (M4): the full record + a FROZEN inviter snapshot
  // (name/photo as they were at invite time) and whether the invitee already has
  // an account. Best-effort — the global invite_index above is the routing truth,
  // so a team-DB hiccup must never fail the invite itself.
  try {
    const inviter = await env.DB.prepare("SELECT image_url FROM users WHERE id = ?")
      .bind(actor.id)
      .first<{ image_url: string | null }>()
    const invitee = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(to)
      .first<{ id: string }>()
    await d1ExecScript(
      cfg,
      guard.databaseId,
      `INSERT INTO invite_logs (id, inviter_user_row_id, inviter_email, inviter_full_name, inviter_image, invitee_user_row_id, invitee_email, proposed_member_role_id, created_on, shelf_life_in_hours, invite_accepted)
       VALUES (${sqlString(inviteRowId)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)}, ${sqlString(inviter?.image_url ?? null)}, ${sqlString(invitee?.id ?? null)}, ${sqlString(to)}, ${sqlString(roleId)}, ${sqlString(now.toISOString())}, ${INVITE_TTL_DAYS * 24}, 0);`
    )
  } catch (e) {
    console.error("invite_logs insert failed (audit only):", e)
  }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Invite sent",
    description: `${actor.name || "Someone"} invited ${to} as ${roles[0].title}`,
    relatedTable: "invite_logs",
    relatedRowId: inviteRowId,
  })

  const teamRow = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(guard.teamId)
    .first<{ name: string }>()
  const teamName = teamRow?.name ?? "a team"

  // The public web origin for the link — the configured value MUST win, so an
  // agent-sent invite (which hits tenancy over a service binding with a
  // placeholder host) can never bake in a dead "https://internal" link. Fall
  // back to the request origin only when PUBLIC_APP_URL is unset (human path).
  const base = env.PUBLIC_APP_URL || new URL(request.url).origin

  // Branded invite email, sent through the auth worker (best-effort).
  const { html, text } = brandedEmail({
    heading: `You're invited to ${teamName}`,
    intro: `${actor.name || "Someone"} invited you to join ${teamName} on ${brand.name} as ${roles[0].title}. Sign in with this email address to accept.`,
    ctaLabel: `Join ${teamName}`,
    // Deep-link to the in-app Invitations inbox: an already-signed-in user lands
    // right on Accept; a new user is sent to sign in, then onboarding auto-joins.
    ctaUrl: `${base}/invitations`,
    footnote: "This invite expires in 7 days. If you weren't expecting it, you can ignore this email.",
  })
  // Send the branded email and CAPTURE whether it actually went out. Best-effort: a
  // mail failure must NOT fail the invite (the invite_index row already routes the
  // acceptance, and the invitee can accept from their in-app Invitations inbox), but we
  // report the real outcome so the caller (and the agent) never claim an email was sent
  // when it wasn't.
  let emailSent = false
  try {
    const res = await env.AUTH.fetch("https://auth/internal/send-email", {
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
    })
    emailSent = res.ok
    if (!res.ok) console.error("invite email failed:", res.status)
  } catch (e) {
    console.error("invite email failed:", e)
  }

  return { inviteId, emailSent }
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
    "SELECT email, invite_row_id FROM invite_index WHERE id = ? AND team_id = ?"
  )
    .bind(inviteId, guard.teamId)
    .first<{ email: string; invite_row_id: string }>()

  const res = await env.DB.prepare(
    "UPDATE invite_index SET status = 'revoked' WHERE id = ? AND team_id = ? AND status = 'pending'"
  )
    .bind(inviteId, guard.teamId)
    .run()

  if (res.meta?.changes) {
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Invite revoked",
      description: `${actor.name} revoked the invite${row?.email ? ` for ${row.email}` : ""}`,
      relatedTable: "invite_logs",
      relatedRowId: row?.invite_row_id,
    })
    // Tell the invitee their pending invite was withdrawn (best-effort).
    await notifyInviteRevoked(env, guard.teamId, row?.email ?? "", actor.name)
  }
}
