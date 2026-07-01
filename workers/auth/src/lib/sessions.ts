import type { Env } from "../env"
import { randomToken, sha256Hex } from "./crypto"
import { ulid } from "../../../../shared/workers/id"
import type { UserRow } from "./users"

export const SESSION_COOKIE = "brimba_session"
const SESSION_DAYS = 30
/** When less than this many days remain, the session quietly extends itself. */
const SLIDE_THRESHOLD_DAYS = 15
/** last_seen_at is coarse presence, not analytics — only re-stamp it this often
 * (skips a write on the hottest authenticated read path). */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000

const days = (n: number) => n * 24 * 60 * 60 * 1000

function buildCookie(env: Env, value: string, maxAgeSeconds: number): string {
  const secure = env.INSECURE_COOKIE === "1" ? "" : "; Secure"
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === name) return rest.join("=")
  }
  return null
}

/** Log a user in: store a hashed session row, hand the browser the cookie. */
export async function createSession(
  env: Env,
  userId: string
): Promise<{ setCookie: string }> {
  const token = randomToken()
  const now = new Date()
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      ulid(),
      userId,
      await sha256Hex(token),
      now.toISOString(),
      new Date(now.getTime() + days(SESSION_DAYS)).toISOString(),
      now.toISOString()
    )
    .run()
  return { setCookie: buildCookie(env, token, days(SESSION_DAYS) / 1000) }
}

/** Who is making this request? null = nobody (or an expired/deactivated user). */
export async function getSessionUser(
  env: Env,
  req: Request
): Promise<UserRow | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null

  const tokenHash = await sha256Hex(token)
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.*
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<UserRow & { session_id: string; expires_at: string; last_seen_at: string }>()
  if (!row) return null

  const now = new Date()
  if (row.expires_at <= now.toISOString()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(row.session_id)
      .run()
    return null
  }
  if (row.deactivated_at !== null) return null

  // Slide the expiry forward while the session is actively used.
  const slide =
    new Date(row.expires_at).getTime() - now.getTime() <
    days(SLIDE_THRESHOLD_DAYS)
  // last_seen_at needs no sub-minute precision — skip the write on the hottest
  // read path unless the stamp is stale (or the expiry is being slid anyway).
  const seenStale =
    now.getTime() - new Date(row.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS
  if (slide || seenStale) {
    await env.DB.prepare(
      slide
        ? "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?"
        : "UPDATE sessions SET last_seen_at = ? WHERE id = ?"
    )
      .bind(
        ...(slide
          ? [
              now.toISOString(),
              new Date(now.getTime() + days(SESSION_DAYS)).toISOString(),
              row.session_id,
            ]
          : [now.toISOString(), row.session_id])
      )
      .run()
  }

  return row
}

/** Sign out every OTHER device for this user, keeping the current session
 * (identified by its token hash). Used after a sensitive change (e.g. email
 * change) so a lost/hijacked device can't keep a foothold. Returns the count. */
export async function signOutOtherSessions(
  env: Env,
  userId: string,
  keepTokenHash: string
): Promise<number> {
  if (!keepTokenHash) return 0 // never wipe everything by accident
  const res = await env.DB.prepare(
    "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?"
  )
    .bind(userId, keepTokenHash)
    .run()
  return res.meta.changes ?? 0
}

/** Log out: forget the session row and blank the cookie. */
export async function destroySession(
  env: Env,
  req: Request
): Promise<{ setCookie: string }> {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256Hex(token))
      .run()
  }
  return { setCookie: buildCookie(env, "", 0) }
}
