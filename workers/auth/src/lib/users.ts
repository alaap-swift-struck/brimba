import type { SessionUser } from "../../../../shared/types"
import type { Env } from "../env"
import { ulid } from "../../../../shared/workers/id"
import { logAccountActivity } from "./account-activity"

/** Raw users row as D1 returns it. */
export type UserRow = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  image_url: string | null
  onboarding_completed_at: string | null
  current_team_id: string | null
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
    currentTeamId: row.current_team_id ?? null,
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
    first_name: null,
    last_name: null,
    image_url: null,
    onboarding_completed_at: null,
    current_team_id: null,
    created_at: now,
    updated_at: now,
    deactivated_at: null,
  }
  await env.DB.prepare(
    "INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)"
  )
    .bind(user.id, user.email, now, now)
    .run()
  // THE FIRST EVENT IN A PERSON'S HISTORY, which had none. `account_activity`
  // recorded email changes, name and photo changes, and access tokens — but not
  // the moment the account began, so every person's story started midway through.
  // Best-effort by construction (logAccountActivity never throws to its caller):
  // a logging hiccup must never stop someone signing up.
  // (Activity-log review, 2026-08-25.)
  await logAccountActivity(env, user.id, {
    type: "account_created",
    description: "Account created",
  })
  return { user, isNew: true }
}


