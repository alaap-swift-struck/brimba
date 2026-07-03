// Brimba AUTH worker — every login-related action lives here, each as its own
// small handler (these become MCP-catalogued actions via the gateway later).
//
//   POST /api/auth/email/start          { email }        -> sends a 6-digit code
//   POST /api/auth/email/verify         { email, code }  -> logs in (sets cookie)
//   POST /api/auth/email/change/start   { email }        -> code to the NEW email
//   POST /api/auth/email/change/verify  { email, code }  -> switch email + log it
//   GET  /api/auth/me                                    -> who am I?
//   GET  /api/auth/activity                              -> my account history (name/photo/email)
//   POST /api/auth/logout                                -> forget me
//   GET  /api/auth/health                                -> is this worker alive?

import { fail, json } from "../../../shared/workers/http"
import { logError, recordWorkerError } from "../../../shared/workers/error-log"
import type { Env } from "./env"
import { randomCode, sha256Hex } from "./lib/crypto"
import { isValidEmail, normalizeEmail, sendEmail, sendLoginCode } from "./lib/email"
import { startEmailChange, verifyEmailChange } from "./lib/email-change"
import {
  createSession,
  destroySession,
  getSessionUser,
  readCookie,
  SESSION_COOKIE,
} from "./lib/sessions"
import { ulid } from "../../../shared/workers/id"
import { listAccountActivity } from "./lib/account-activity"
import { updateProfile, type ProfileInput } from "./lib/profile"
import {
  findOrCreateUserByEmail,
  toSessionUser,
} from "./lib/users"
import { CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS, MAX_CODES_PER_HOUR } from "./lib/constants"

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
        case "POST /api/auth/email/change/start":
          return await emailChangeStart(request, env)
        case "POST /api/auth/email/change/verify":
          return await emailChangeVerify(request, env)
        case "GET /api/auth/me":
          return await me(request, env)
        case "GET /api/auth/activity":
          return await activity(request, env)
        case "POST /api/auth/profile":
          return await profile(request, env)
        case "POST /api/auth/logout":
          return await logout(request, env)
        case "GET /api/auth/health":
          return json({ ok: true })
        // Internal: other workers send branded emails THROUGH auth (it owns the
        // Resend key). NOT under /api/ — the gateway never routes it publicly;
        // only a service binding (env.AUTH.fetch) can reach it.
        case "POST /internal/send-email":
          return await internalSendEmail(request, env)
        // Internal: the gateway forwards CLIENT error beacons here so web errors
        // land in the same central error_logs table the workers write to (auth
        // owns the door because it holds the core DB + the internal-key guard).
        case "POST /internal/log-error":
          return await internalLogError(request, env)
        default:
          return fail(404, "not_found", "No such auth action.")
      }
    } catch (e) {
      console.error("auth worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(env.DB, "auth", `${request.method} ${new URL(request.url).pathname}`, e)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>

/** Internal (service-binding only): send a branded email composed by another
 * worker (e.g. tenancy's invite email). */
async function internalSendEmail(request: Request, env: Env): Promise<Response> {
  // Defense-in-depth: even though this worker has no public URL (workers_dev:
  // false), require the shared secret when one is configured.
  if (env.INTERNAL_KEY && request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
    return fail(403, "forbidden", "Bad internal key.")
  const m = (await request.json().catch(() => ({}))) as {
    to?: string
    subject?: string
    html?: string
    text?: string
  }
  if (!m.to || !m.subject)
    return fail(400, "invalid_input", "to and subject are required.")
  const sent = await sendEmail(env, {
    to: m.to,
    subject: m.subject,
    html: m.html ?? "",
    text: m.text ?? "",
  })
  return json({ sent })
}

/** Internal (service-binding only): record a CLIENT-side error into the central
 * error_logs table. Same defense-in-depth key as send-email; every field is
 * capped inside logError, and a bad body is simply dropped (a log endpoint must
 * never become an error source itself). */
async function internalLogError(request: Request, env: Env): Promise<Response> {
  if (env.INTERNAL_KEY && request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
    return fail(403, "forbidden", "Bad internal key.")
  const b = (await request.json().catch(() => ({}))) as {
    source?: string
    place?: string
    message?: string
    stack?: string
    url?: string
  }
  if (b.message)
    await logError(env.DB, {
      source: b.source || "web",
      place: b.place || "unknown",
      message: b.message,
      stack: b.stack,
      url: b.url,
    })
  return new Response(null, { status: 204 })
}

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
  const echo = env.DEV_ECHO_CODES === "1"

  // Staging (echo on) ALSO returns the code so the smoke test + dev flow work
  // even though a real email goes out too. Production (echo off) only sends —
  // and if no key is configured yet, refuses rather than stranding the user.
  if (sent || echo) return json({ ok: true, ...(echo ? { devCode: code } : {}) })
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

/** Email change, step 1: send a 6-digit code to the NEW email (signed-in only). */
async function emailChangeStart(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const r = await startEmailChange(env, user, body.email ?? "")
  if ("error" in r) return fail(r.status, r.error, r.message)
  return json({ ok: true, ...(r.devCode ? { devCode: r.devCode } : {}) })
}

/** Email change, step 2: verify the code, switch the email, log + secure it. */
async function emailChangeVerify(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    code?: string
  }
  // Keep THIS device signed in when we drop the others.
  const token = readCookie(request, SESSION_COOKIE)
  const currentTokenHash = token ? await sha256Hex(token) : ""
  const r = await verifyEmailChange(
    env,
    user,
    body.email ?? "",
    (body.code ?? "").trim(),
    currentTokenHash
  )
  if ("error" in r) return fail(r.status, r.error, r.message)
  return json({ user: r.user })
}

/** Who is the cookie attached to this request? */
async function me(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ user: toSessionUser(user) })
}

/** The signed-in person's own account history (name / photo / email changes). */
async function activity(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ activity: await listAccountActivity(env, user.id) })
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
