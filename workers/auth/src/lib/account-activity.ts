// Account-level activity — the user's OWN identity history (name / photo / email
// changes), in the GLOBAL core DB. NOT team-tied: these events belong to the
// person across every team (a teamless user has no team DB to write to anyway).
// The writer is best-effort, modeled on shared/workers/activity.ts: it swallows
// + logs its own failures so a logging hiccup can never break the change it
// describes. The actor is always the user themselves, so there's no Actor arg.

import type { ActivityItem } from "../../../../shared/types"
import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"

export type AccountEvent = { type: string; description: string }

/** Append one account-activity row (best-effort — never throws to the caller). */
export async function logAccountActivity(
  env: Env,
  userId: string,
  event: AccountEvent
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO account_activity (id, user_id, type, description, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(ulid(), userId, event.type, event.description, new Date().toISOString())
      .run()
  } catch (e) {
    console.error("account activity log failed:", e)
  }
}

/** The signed-in person's own account history, newest first (capped at 50). */
export async function listAccountActivity(
  env: Env,
  userId: string
): Promise<ActivityItem[]> {
  const rows = await env.DB.prepare(
    `SELECT id, type, description, created_at FROM account_activity
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  )
    .bind(userId)
    .all<{ id: string; type: string; description: string; created_at: string }>()
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    actorName: null, // always you — the feed doesn't show an actor line
    createdAt: r.created_at,
  }))
}
