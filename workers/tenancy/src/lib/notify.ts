// Member notifications — when something happens TO a member that they did NOT
// trigger (their role changes, they're removed, their invite is revoked), tell
// them. Required communication: the change affects them but they didn't make it,
// so they wouldn't otherwise know. Sent through the SAME branded template +
// auth-worker sender as login/invite emails, so every email looks identical.
//
// Best-effort by design: a failed notification must NEVER fail the action that
// triggered it, so each helper swallows its own errors (the action already
// happened and is logged in activity).

import { brand } from "../../../../shared/brand"
import { brandedEmail, type BrandedEmail } from "../../../../shared/workers/email-template"
import type { Env } from "../env"

async function teamName(env: Env, teamId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ name: string }>()
  return row?.name ?? "your team"
}

/** Send one branded email through the auth worker (it owns the Resend key). */
async function send(
  env: Env,
  to: string,
  subject: string,
  content: Pick<BrandedEmail, "heading" | "intro" | "footnote">
): Promise<void> {
  const { html, text } = brandedEmail(content)
  await env.AUTH.fetch("https://auth/internal/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": env.INTERNAL_KEY ?? "" },
    body: JSON.stringify({ to, subject, html, text }),
  })
}

/** A member's role was changed by someone else. */
export async function notifyRoleChanged(
  env: Env,
  teamId: string,
  to: string,
  actorName: string,
  roleTitle: string
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    await send(env, to, `Your role in ${name} changed`, {
      heading: `Your role in ${name} changed`,
      intro: `${actorName || "An admin"} changed your role in ${name} on ${brand.name} to ${roleTitle}.`,
      footnote: "If you weren't expecting this, reach out to a team admin.",
    })
  } catch (e) {
    console.error("role-change notice failed:", e)
  }
}

/** A member was removed from the team by someone else. */
export async function notifyRemoved(
  env: Env,
  teamId: string,
  to: string,
  actorName: string
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    await send(env, to, `You were removed from ${name}`, {
      heading: `You were removed from ${name}`,
      intro: `${actorName || "An admin"} removed you from ${name} on ${brand.name}. You no longer have access to it.`,
      footnote: "If you think this was a mistake, a team admin can invite you back.",
    })
  } catch (e) {
    console.error("removal notice failed:", e)
  }
}

/** A pending invite was revoked before the person joined. */
export async function notifyInviteRevoked(
  env: Env,
  teamId: string,
  to: string,
  actorName: string
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    await send(env, to, `Your invite to ${name} was withdrawn`, {
      heading: `Your invite to ${name} was withdrawn`,
      intro: `Your invitation to join ${name} on ${brand.name} was withdrawn. No action is needed.`,
      footnote: "If you think this was a mistake, ask a team admin to invite you again.",
    })
  } catch (e) {
    console.error("revoke notice failed:", e)
  }
}
