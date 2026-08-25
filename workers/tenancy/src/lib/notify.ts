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
import { callService } from "../../../../shared/workers/trace"

async function teamName(env: Env, teamId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ name: string }>()
  return row?.name ?? "your team"
}

/**
 * THE one door out of this worker to a mailbox — a pre-built body straight to
 * auth, which owns the Resend key.
 *
 * IT ANSWERS WHETHER THE MAIL ACTUALLY WENT, and that is not decoration. This
 * call used to discard its response entirely, while auth's `/internal/send-email`
 * returns `{ sent: false }` — a clean 200 — whenever `RESEND_API_KEY` is unset.
 * For the notices below that is survivable: the action they describe already
 * happened and is already in activity. For anything whose ABSENCE is meant to
 * carry information (the nightly error digest: no mail = a clean night) it is
 * fatal, because an unconfigured mailer then looks exactly like a healthy
 * system. So the truth comes back, and a caller that needs it can check it.
 *
 * TRUE only when auth answered AND confirmed the send. A `null` from
 * `callService` (auth never answered), a non-2xx, an unparseable body and an
 * explicit `{ sent: false }` are all FALSE — the caller cannot tell them apart
 * because for a caller there is no difference: the mail did not go.
 */
export async function sendMail(
  env: Env,
  to: string,
  subject: string,
  body: { html: string; text: string }
): Promise<boolean> {
  // Bounded and guarded. Email is best-effort by design — every caller already
  // wraps this in a try/catch so a mail failure never fails the write it describes
  // — but "best-effort" without a timeout still means a wedged mail hop holds the
  // user's request open for as long as the platform allows.
  const res = await callService(
    env.AUTH,
    "https://auth/internal/send-email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": env.INTERNAL_KEY ?? "" },
      body: JSON.stringify({ to, subject, html: body.html, text: body.text }),
    },
    { worker: "tenancy", place: "send-email" }
  )
  if (!res || !res.ok) return false
  const answer = (await res.json().catch(() => null)) as { sent?: boolean } | null
  return answer?.sent === true
}

/** Send one BRANDED email — the same template every transactional mail uses, so
 * they all look identical. A thin wrapper over `sendMail`: one door, one place
 * that knows the internal key and the timeout. */
async function send(
  env: Env,
  to: string,
  subject: string,
  content: Pick<BrandedEmail, "heading" | "intro" | "footnote">
): Promise<boolean> {
  return sendMail(env, to, subject, brandedEmail(content))
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
