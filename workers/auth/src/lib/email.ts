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
 * Pure shape-check for a requested NEW email (no database). Returns an error
 * code + plain-English message, or null if acceptable. DB-level uniqueness
 * ("is someone else already using it?") is checked separately by the caller.
 */
export function validateNewEmail(
  current: string,
  nextRaw: string
): { error: string; message: string } | null {
  const next = normalizeEmail(nextRaw)
  if (!isValidEmail(next))
    return { error: "invalid_email", message: "Enter a valid email address." }
  if (next === normalizeEmail(current))
    return { error: "same_email", message: "That's already your email address." }
  return null
}

/** Hide most of an address for security notices: "alaap@x.com" -> "a****@x.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return email
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`
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
    signal: AbortSignal.timeout(15_000), // LAW R11: a hung email send must not stall the worker
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

/**
 * Send the 6-digit code to confirm a NEW email address (branded). Returns false
 * when no RESEND_API_KEY is configured yet (callers fall back to DEV_ECHO_CODES).
 */
export async function sendEmailChangeCode(
  env: Env,
  to: string,
  code: string
): Promise<boolean> {
  const { html, text } = brandedEmail({
    heading: "Confirm your new email",
    intro: `Use this code to confirm this address as your new ${brand.name} email. It expires in 10 minutes.`,
    code,
    footnote: "If you didn't request this change, you can safely ignore this email.",
  })
  return sendEmail(env, {
    to,
    subject: `${code} is your ${brand.name} email-change code`,
    html,
    text,
  })
}

/**
 * Tell the OLD address that the account's email was changed — the security
 * heads-up that warns the real owner if someone else made the change.
 * Best-effort (the change itself has already happened by the time this sends).
 */
export async function sendEmailChangedNotice(
  env: Env,
  oldEmail: string,
  newEmail: string
): Promise<boolean> {
  const { html, text } = brandedEmail({
    heading: "Your email was changed",
    intro: `The email address for your ${brand.name} account was just changed to ${maskEmail(newEmail)}. Sign in with the new address from now on.`,
    footnote:
      "If you didn't make this change, contact us right away — someone else may have access to your account.",
  })
  return sendEmail(env, {
    to: oldEmail,
    subject: `Your ${brand.name} email address was changed`,
    html,
    text,
  })
}
