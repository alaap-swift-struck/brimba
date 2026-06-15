import { brand } from "../../../../shared/brand"
import { brandedEmail } from "../../../../shared/workers/email-template"
import type { Env } from "../env"

// Same rule as the old Glide email transformer: trim, then lowercase.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Deliberately simple: something@something.tld — the real proof is the code.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * Send any branded email via Resend (the auth worker owns the key, so other
 * workers send THROUGH it — see the /internal/send-email route). Returns false
 * when no RESEND_API_KEY is configured yet.
 */
export async function sendEmail(
  env: Env,
  msg: { to: string; subject: string; html: string; text: string }
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false

  // The sender name comes from the ONE brand file; EMAIL_FROM holds just the
  // address (infra). So a name change in shared/brand.ts shows up in emails too.
  const from = env.EMAIL_FROM.includes("<")
    ? env.EMAIL_FROM
    : `${brand.name} <${env.EMAIL_FROM}>`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  })
  if (!res.ok) {
    throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`)
  }
  return true
}

/**
 * Send the 6-digit login code (branded). Returns false when no RESEND_API_KEY
 * is configured yet (callers then fall back to DEV_ECHO_CODES or an error).
 */
export async function sendLoginCode(
  env: Env,
  to: string,
  code: string
): Promise<boolean> {
  const { html, text } = brandedEmail({
    heading: "Your login code",
    intro: `Use this code to sign in to ${brand.name}. It expires in 10 minutes.`,
    code,
    footnote: "If you didn't request this, you can safely ignore this email.",
  })
  return sendEmail(env, {
    to,
    subject: `${code} is your ${brand.name} login code`,
    html,
    text,
  })
}
