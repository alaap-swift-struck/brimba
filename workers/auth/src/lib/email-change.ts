// Email-change flow — change the address you sign in with. A 6-digit code goes
// to the NEW email (proving you control it); on verify we switch users.email,
// write an audit row (email_change_logs), sign out the user's OTHER devices, and
// warn the OLD email. All in the GLOBAL core DB — identity lives there, never in
// a team's database. The code lives in its own table so it can't be replayed as
// a login (see db/core/0005_email_change.sql).

import type { SessionUser } from "../../../../shared/types"
import { ulid } from "../../../../shared/workers/id"
import { publishSignOut } from "../../../../shared/workers/realtime"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { randomCode, sha256Hex } from "./crypto"
import {
  normalizeEmail,
  sendEmailChangeCode,
  sendEmailChangedNotice,
  validateNewEmail,
} from "./email"
import { signOutOtherSessions } from "./sessions"
import { findUserByEmail, toSessionUser, type UserRow } from "./users"
import { CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR } from "./constants"

/** A handled failure — the route turns this into the HTTP error response. */
export type ChangeFail = { error: string; message: string; status: number }

/** Step 1: validate the new address + send it a 6-digit confirmation code.
 * The code goes ONLY to the new inbox — never into the response (same law as
 * login: a code appears nowhere but the user's inbox, in any environment). */
export async function startEmailChange(
  env: Env,
  user: UserRow,
  newEmailRaw: string
): Promise<Record<string, never> | ChangeFail> {
  const shape = validateNewEmail(user.email, newEmailRaw)
  if (shape) return { ...shape, status: 400 }
  const newEmail = normalizeEmail(newEmailRaw)

  // Throttle FIRST, and count every ATTEMPT — not just issued codes. The
  // "already in use" answer below is a yes/no oracle on any address in the
  // platform, so an unthrottled probe would enumerate the whole user base at
  // full request rate (the login door is deliberately non-enumerable; this
  // door must not undo that).
  // Throttle: at most 5 change-codes per user per hour.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM email_change_codes WHERE user_id = ? AND created_at > ?"
  )
    .bind(user.id, hourAgo)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR)
    return {
      error: "too_many_codes",
      message: "Too many codes requested. Try again in an hour.",
      status: 429,
    }

  const code = randomCode()
  const now = new Date()
  await env.DB.prepare(
    `INSERT INTO email_change_codes (id, user_id, new_email, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      ulid(),
      user.id,
      newEmail,
      await sha256Hex(`${code}:${newEmail}`),
      new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
      now.toISOString()
    )
    .run()

  const sent = await sendEmailChangeCode(env, newEmail, code)
  if (sent) return {}
  return {
    error: "email_not_configured",
    message: "Email sending isn't set up yet.",
    status: 503,
  }
}

/** Step 2: check the code, switch the email, log it, sign out others, warn old. */
export async function verifyEmailChange(
  env: Env,
  user: UserRow,
  newEmailRaw: string,
  code: string,
  currentTokenHash: string,
  /** The route's `ctx`. The forced sign-out ping below is best-effort and reaches
   * only the person's OTHER devices, so nothing in this answer depends on it. */
  ctx: ExecutionContext
): Promise<{ user: SessionUser } | ChangeFail> {
  const newEmail = normalizeEmail(newEmailRaw)
  if (!/^\d{6}$/.test(code))
    return { error: "invalid_input", message: "Enter the 6-digit code.", status: 400 }

  // Re-check uniqueness at the last moment (someone may have grabbed it during
  // the 10-minute window); the UNIQUE constraint is the final backstop.
  const existing = await findUserByEmail(env, newEmail)
  if (existing && existing.id !== user.id)
    return { error: "email_taken", message: "That email is already in use.", status: 409 }

  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts, expires_at FROM email_change_codes
     WHERE user_id = ? AND new_email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(user.id, newEmail)
    .first<{ id: string; code_hash: string; attempts: number; expires_at: string }>()

  const nowIso = new Date().toISOString()
  if (!row || row.expires_at <= nowIso)
    return { error: "code_expired", message: "That code expired. Request a new one.", status: 400 }

  // ATOMIC attempt cap (same pattern as login): consume a slot in the statement
  // that checks the limit, so concurrent guesses can't each read a stale count.
  const slot = await env.DB.prepare(
    "UPDATE email_change_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed_at IS NULL"
  )
    .bind(row.id, MAX_CODE_ATTEMPTS)
    .run()
  if ((slot.meta.changes ?? 0) === 0)
    return { error: "too_many_attempts", message: "Too many wrong tries. Request a new code.", status: 429 }
  if (row.code_hash !== (await sha256Hex(`${code}:${newEmail}`)))
    return { error: "wrong_code", message: "That code isn't right. Check and try again.", status: 400 }

  const oldEmail = user.email
  // One transaction: consume the code, switch the email, write the audit row.
  await env.DB.batch([
    env.DB.prepare("UPDATE email_change_codes SET consumed_at = ? WHERE id = ?").bind(nowIso, row.id),
    env.DB.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").bind(newEmail, nowIso, user.id),
    env.DB.prepare(
      `INSERT INTO email_change_logs (id, user_id, old_email, new_email, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(ulid(), user.id, oldEmail, newEmail, nowIso),
  ])

  // Chosen behavior: drop other devices, then warn the old address (best-effort).
  await signOutOtherSessions(env, user.id, currentTokenHash)
  // Live: push the OTHER devices to login instantly (the acting device keeps its
  // still-valid session). Best-effort.
  ctx.waitUntil(publishSignOut(env.REALTIME, user.id))
  await sendEmailChangedNotice(env, oldEmail, newEmail).catch((e) =>
    console.error("email-change notice failed:", e)
  )

  // Record it in the person's own account history (best-effort; the security
  // record with both addresses already went into email_change_logs above).
  await logAccountActivity(env, user.id, {
    type: "email_changed",
    description: `Changed your sign-in email to ${newEmail}`,
  })

  return { user: toSessionUser({ ...user, email: newEmail }) }
}
