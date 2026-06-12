// Brimba AUTH worker — every login-related action lives here, each as its own
// small handler (these become MCP-catalogued actions via the gateway later).
//
//   POST /api/auth/email/start    { email }        -> sends a 6-digit code
//   POST /api/auth/email/verify   { email, code }  -> logs in (sets cookie)
//   GET  /api/auth/me                              -> who am I?
//   POST /api/auth/logout                          -> forget me
//   GET  /api/auth/health                          -> is this worker alive?

import type { ApiError } from "../../../shared/types"
import type { Env } from "./env"
import { randomCode, sha256Hex } from "./lib/crypto"
import { isValidEmail, normalizeEmail, sendLoginCode } from "./lib/email"
import {
  createSession,
  destroySession,
  getSessionUser,
} from "./lib/sessions"
import { ulid } from "../../../shared/workers/id"
import { updateProfile, type ProfileInput } from "./lib/profile"
import {
  findOrCreateUserByEmail,
  toSessionUser,
} from "./lib/users"

const CODE_TTL_MINUTES = 10
const MAX_CODE_ATTEMPTS = 5
const MAX_CODES_PER_HOUR = 5

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

const fail = (status: number, error: string, message: string) =>
  json({ error, message } satisfies ApiError, status)

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      switch (route) {
        case "POST /api/auth/email/start":
          return await emailStart(request, env)
        case "POST /api/auth/email/verify":
          return await emailVerify(request, env)
        case "GET /api/auth/me":
          return await me(request, env)
        case "POST /api/auth/profile":
          return await profile(request, env)
        case "POST /api/auth/logout":
          return await logout(request, env)
        case "GET /api/auth/health":
          return json({ ok: true })
        default:
          return fail(404, "not_found", "No such auth action.")
      }
    } catch (e) {
      console.error("auth worker error:", e)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>

/** Step 1 of email login: create + send a 6-digit code. */
async function emailStart(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = normalizeEmail(body.email ?? "")
  if (!isValidEmail(email))
    return fail(400, "invalid_email", "Enter a valid email address.")

  // Throttle: at most 5 codes per email per hour.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?"
  )
    .bind(email, hourAgo)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR)
    return fail(429, "too_many_codes", "Too many codes requested. Try again in an hour.")

  const code = randomCode()
  const now = new Date()
  await env.DB.prepare(
    `INSERT INTO login_codes (id, email, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      ulid(),
      email,
      await sha256Hex(`${code}:${email}`),
      new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
      now.toISOString()
    )
    .run()

  const sent = await sendLoginCode(env, email, code)
  if (sent) return json({ ok: true })

  // No Resend key yet: in staging/dev we echo the code (clearly temporary);
  // in production we refuse rather than silently strand the user.
  if (env.DEV_ECHO_CODES === "1") return json({ ok: true, devCode: code })
  return fail(503, "email_not_configured", "Email sending isn't set up yet.")
}

/** Step 2 of email login: check the code, create the session. */
async function emailVerify(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    code?: string
  }
  const email = normalizeEmail(body.email ?? "")
  const code = (body.code ?? "").trim()
  if (!isValidEmail(email) || !/^\d{6}$/.test(code))
    return fail(400, "invalid_input", "Enter your email and the 6-digit code.")

  const row = await env.DB.prepare(
    `SELECT * FROM login_codes
     WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(email)
    .first<{
      id: string
      code_hash: string
      attempts: number
      expires_at: string
    }>()

  const now = new Date().toISOString()
  if (!row || row.expires_at <= now)
    return fail(400, "code_expired", "That code expired. Request a new one.")
  if (row.attempts >= MAX_CODE_ATTEMPTS)
    return fail(429, "too_many_attempts", "Too many wrong tries. Request a new code.")

  if (row.code_hash !== (await sha256Hex(`${code}:${email}`))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run()
    return fail(400, "wrong_code", "That code isn't right. Check and try again.")
  }

  await env.DB.prepare("UPDATE login_codes SET consumed_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run()

  const { user, isNew } = await findOrCreateUserByEmail(env, email)
  if (user.deactivated_at !== null)
    return fail(403, "deactivated", "This account is deactivated.")

  const { setCookie } = await createSession(env, user.id)
  return json({ user: toSessionUser(user), isNew }, 200, { "Set-Cookie": setCookie })
}

/** Who is the cookie attached to this request? */
async function me(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ user: toSessionUser(user) })
}

/** Onboarding / profile edit: names + optional photo (stored in R2). */
async function profile(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const input = (await request.json().catch(() => ({}))) as ProfileInput
  const result = await updateProfile(env, user, input)
  if ("error" in result) return fail(400, result.error, result.message)
  return json(result)
}

async function logout(request: Request, env: Env): Promise<Response> {
  const { setCookie } = await destroySession(env, request)
  return json({ ok: true }, 200, { "Set-Cookie": setCookie })
}
