// Help notifications — when someone replies to a ticket or @mentions a member,
// tell the people who'd want to know: the ticket's raiser (someone answered them)
// and anyone mentioned. Required communication: it happened to them but they
// didn't trigger it. Sent through the SAME branded template + auth-worker sender
// as every other Brimba email, so they all look identical.
//
// Best-effort by design: a failed notification must NEVER fail the reply that
// triggered it — the reply already saved and published. Every path swallows its
// own errors. Mentions are notify-only: all tickets are team-visible anyway, so a
// mention grants no access (locked decision), it just pings.

import { brand } from "../../../../shared/brand"
import { brandedEmail, type BrandedEmail } from "../../../../shared/workers/email-template"
import type { Env } from "../env"

async function teamName(env: Env, teamId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ name: string }>()
  return row?.name ?? "your team"
}

/** Look up email + display name for a set of user ids from the global users table
 * (the one place identity lives). Returns a map id → {email, name}. */
async function lookupUsers(
  env: Env,
  ids: string[]
): Promise<Map<string, { email: string; name: string }>> {
  const out = new Map<string, { email: string; name: string }>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return out
  const placeholders = unique.map(() => "?").join(", ")
  const { results } = await env.DB.prepare(
    `SELECT id, email, first_name, last_name FROM users WHERE id IN (${placeholders})`
  )
    .bind(...unique)
    .all<{ id: string; email: string; first_name: string | null; last_name: string | null }>()
  for (const r of results ?? []) {
    out.set(r.id, {
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
    })
  }
  return out
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

/** A short, safe preview of the reply text for the email body. */
function snippet(body: string): string {
  const clean = body.trim().replace(/\s+/g, " ")
  return clean.length > 160 ? clean.slice(0, 157) + "..." : clean
}

/** After a reply lands: email the ticket's raiser (someone answered them) and each
 * mentioned member (they were tagged). The reply's author is never emailed, and a
 * person is emailed at most once (a mention wins over the raiser notice). */
export async function notifyReplyAndMentions(
  env: Env,
  teamId: string,
  ticket: { id: string; raiserId: string },
  author: { id: string; name: string },
  body: string,
  taggedUserIds: string[]
): Promise<void> {
  try {
    const mentioned = new Set(taggedUserIds.filter((id) => id && id !== author.id))
    const recipients = new Set<string>(mentioned)
    if (ticket.raiserId && ticket.raiserId !== author.id) recipients.add(ticket.raiserId)
    if (!recipients.size) return

    const name = await teamName(env, teamId)
    const users = await lookupUsers(env, [...recipients])
    const who = author.name || "Someone"
    const preview = snippet(body)

    await Promise.all(
      [...recipients].map(async (id) => {
        const u = users.get(id)
        if (!u?.email) return
        const isMention = mentioned.has(id)
        const subject = isMention
          ? `${who} mentioned you on a ${name} ticket`
          : `New reply on your ${name} support ticket`
        const heading = isMention ? "You were mentioned" : "New reply on your ticket"
        const intro = isMention
          ? `${who} mentioned you in a support ticket reply on ${name} (${brand.name}): "${preview}"`
          : `${who} replied to your support ticket on ${name} (${brand.name}): "${preview}"`
        await send(env, u.email, subject, {
          heading,
          intro,
          footnote: "Open the ticket in Help to read the full conversation and reply.",
        }).catch((e) => console.error("help reply notice failed:", e))
      })
    )
  } catch (e) {
    console.error("help notify failed:", e)
  }
}
