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
 * Send the 6-digit code via Resend. Returns false when no RESEND_API_KEY is
 * configured yet (callers then fall back to DEV_ECHO_CODES or an error).
 */
export async function sendLoginCode(
  env: Env,
  to: string,
  code: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false

  // One branded template (moulds to shared/brand.ts) → rich HTML + plaintext.
  const { html, text } = brandedEmail({
    heading: "Your login code",
    intro: `Use this code to sign in to ${brand.name}. It expires in 10 minutes.`,
    code,
    footnote: "If you didn't request this, you can safely ignore this email.",
  })

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // The sender name + all visible copy come from the ONE brand file, so a
      // name change in shared/brand.ts shows up in emails too. EMAIL_FROM holds
      // just the address (infra); we compose the friendly name from the brand.
      from: env.EMAIL_FROM.includes("<")
        ? env.EMAIL_FROM
        : `${brand.name} <${env.EMAIL_FROM}>`,
      to: [to],
      subject: `${code} is your ${brand.name} login code`,
      html,
      text,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`)
  }
  return true
}
