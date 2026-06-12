import type { SessionUser } from "../../../../shared/types"
import type { Env } from "../env"
import { ulid } from "./id"

/** Raw users row as D1 returns it. */
export type UserRow = {
  id: string
  email: string
  google_sub: string | null
  first_name: string | null
  last_name: string | null
  image_url: string | null
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
  deactivated_at: string | null
}

export function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    imageUrl: row.image_url,
    onboardingComplete: row.onboarding_completed_at !== null,
  }
}

export async function findUserByEmail(
  env: Env,
  email: string
): Promise<UserRow | null> {
  return await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>()
}

/** Email-code sign-in: the verified email IS the identity. */
export async function findOrCreateUserByEmail(
  env: Env,
  email: string
): Promise<{ user: UserRow; isNew: boolean }> {
  const existing = await findUserByEmail(env, email)
  if (existing) return { user: existing, isNew: false }

  const now = new Date().toISOString()
  const user: UserRow = {
    id: ulid(),
    email,
    google_sub: null,
    first_name: null,
    last_name: null,
    image_url: null,
    onboarding_completed_at: null,
    created_at: now,
    updated_at: now,
    deactivated_at: null,
  }
  await env.DB.prepare(
    "INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)"
  )
    .bind(user.id, user.email, now, now)
    .run()
  return { user, isNew: true }
}

/**
 * Google sign-in: match by Google's permanent id first, then by email (links
 * the Google account to an existing email-only user), else create. Names and
 * photo from Google only PRE-FILL empty fields — never overwrite user edits.
 */
export async function findOrCreateUserFromGoogle(
  env: Env,
  google: {
    sub: string
    email: string
    firstName: string | null
    lastName: string | null
    imageUrl: string | null
  }
): Promise<{ user: UserRow; isNew: boolean }> {
  const now = new Date().toISOString()

  const bySub = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?")
    .bind(google.sub)
    .first<UserRow>()
  if (bySub) return { user: bySub, isNew: false }

  const byEmail = await findUserByEmail(env, google.email)
  if (byEmail) {
    await env.DB.prepare(
      `UPDATE users SET
         google_sub = ?,
         first_name = COALESCE(first_name, ?),
         last_name  = COALESCE(last_name, ?),
         image_url  = COALESCE(image_url, ?),
         updated_at = ?
       WHERE id = ?`
    )
      .bind(
        google.sub,
        google.firstName,
        google.lastName,
        google.imageUrl,
        now,
        byEmail.id
      )
      .run()
    const updated = await findUserByEmail(env, google.email)
    return { user: updated as UserRow, isNew: false }
  }

  const user: UserRow = {
    id: ulid(),
    email: google.email,
    google_sub: google.sub,
    first_name: google.firstName,
    last_name: google.lastName,
    image_url: google.imageUrl,
    onboarding_completed_at: null,
    created_at: now,
    updated_at: now,
    deactivated_at: null,
  }
  await env.DB.prepare(
    `INSERT INTO users
       (id, email, google_sub, first_name, last_name, image_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      user.id,
      user.email,
      user.google_sub,
      user.first_name,
      user.last_name,
      user.image_url,
      now,
      now
    )
    .run()
  return { user, isNew: true }
}
