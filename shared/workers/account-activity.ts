// THE IDENTITY LOG — a person's own history, across every team.
//
// The companion to `activity.ts`, split by DATABASE BOUNDARY rather than by
// feature (activity_log_review 2026-08-18, criterion 1). The distinction is not
// cosmetic and is worth stating once:
//
//   `activity`         per-team, in that team's own database. What happened to a
//                      RECORD: created, edited, deactivated, reactivated.
//   `account_activity` GLOBAL, in the core database. What happened to a PERSON:
//                      their name, their email, their access credentials. These
//                      events can happen before someone belongs to any team, so
//                      there is no team database to write them to.
//
// A personal access token is a CREDENTIAL, not a team record — it belongs to the
// person, survives them switching teams, and is the thing that grants access. So
// it is logged here, beside the email change, rather than in a team's feed.
//
// Lifted out of `workers/auth` on 2026-08-18 so the mcp worker can write to it
// too. mcp has no `CF_D1_TOKEN` and therefore cannot reach ANY team database —
// which is a deliberate limit on the external surface's blast radius, and the
// reason token events could not simply go in the team feed.
//
// Best-effort, exactly like `logActivity`: it swallows its own failures so a
// logging hiccup can never break the change it describes.

import { ulid } from "./id"
import { publishUserChange } from "./realtime"
import { traceError } from "./trace"

export type AccountEvent = { type: string; description: string }

/** The slice of a worker Env this seam needs — structural, so both auth and mcp
 * satisfy it without either importing the other's Env type. */
type AccountEnv = {
  DB: { prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown> } } }
  /** OPTIONAL on purpose. The mcp worker has no REALTIME binding, and giving the
   * externally-reachable worker one — so a token event could ping a live feed —
   * would widen its blast radius for a cosmetic gain. Without it the row still
   * lands durably, which is the part an audit trail is for; the person's other
   * devices simply learn about it on their next read instead of instantly. */
  REALTIME?: Fetcher
}

/**
 * Append one account-activity row (best-effort — never throws to the caller).
 *
 * Every account-activity write flows through here, so publishing the live event
 * here means email-change, profile, token and any future identity event all
 * update the person's own feed across their devices with no per-call wiring.
 */
export async function logAccountActivity(
  env: AccountEnv,
  userId: string,
  event: AccountEvent
): Promise<void> {
  const id = ulid()
  try {
    await env.DB.prepare(
      `INSERT INTO account_activity (id, user_id, type, description, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, userId, event.type, event.description, new Date().toISOString())
      .run()
  } catch (e) {
    // A durable, filterable gap marker rather than a console line — the same
    // contract `logActivity` follows, for the same reason: a silent hole in an
    // audit trail is worse than a loud one.
    traceError({ worker: "account-activity", place: event.type, event: "activity_log_gap", detail: e })
    return
  }
  if (env.REALTIME) await publishUserChange(env.REALTIME, userId, "account_activity", id, "add")
}
