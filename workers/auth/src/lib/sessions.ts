import type { Env } from "../env"
import { randomToken, sha256Hex } from "./crypto"
import { ulid } from "../../../../shared/workers/id"
import type { UserRow } from "./users"

export const SESSION_COOKIE = "brimba_session"
const SESSION_DAYS = 30
/** When less than this many days remain, the session quietly extends itself. */
const SLIDE_THRESHOLD_DAYS = 15

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
    `SELECT s.id AS session_id, s.expires_at, u.*
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<UserRow & { session_id: string; expires_at: string }>()
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

  return row
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
