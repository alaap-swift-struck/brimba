// Publish a "something changed" ping to a live channel — the call any worker
// makes after a successful write so every open screen refreshes ONLY the row
// that changed. Best-effort: a live-layer hiccup must never break the write it
// describes (callers don't await-throw). Reusable by every Brimba-based app.
//
// TWO channel scopes (the realtime worker fans each `event` to everyone on the
// named channel):
//   • team:<teamId>  — team-scoped data (members, roles, invites, …). Every
//     member of that team is connected.
//   • user:<userId>  — identity-scoped data for ONE person across their devices
//     (account activity, profile, email, their team-membership list) AND
//     session events (a forced sign-out). Every signed-in device is connected,
//     even before the user joins a team.
//
// The payload NEVER carries row data (`{resource,id}` only) — the client pulls
// that one row through the permission-checked endpoint, so nothing can leak.

import type { Fetcher } from "@cloudflare/workers-types"

/** One change ping. `op` is advisory; the client re-pulls the row and decides
 * whether it still belongs in the collection (keep-or-drop), so "edit" vs
 * "remove" need not be exact. A `session` event (no id) is the sign-out signal. */
export type ChangeEvent = {
  /** The module/collection tag, e.g. "members", "member_roles", "invites",
   * "account_activity", "teams". For a session event: "session". */
  resource: string
  /** The affected row id (omitted for collection-wide or session events). */
  id?: string
  /** add | edit | remove | session — advisory; the client verifies by re-pull. */
  op?: "add" | "edit" | "remove" | "session"
}

async function publish(realtime: Fetcher, channel: string, event: ChangeEvent): Promise<void> {
  try {
    await realtime.fetch("https://realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, event }),
    })
  } catch (e) {
    console.error("realtime publish failed:", e)
  }
}

/** Tell a TEAM's channel that one row in `resource` changed. */
export async function publishChange(
  realtime: Fetcher,
  teamId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"]
): Promise<void> {
  await publish(realtime, `team:${teamId}`, { resource, id, op })
}

/** Tell ONE user's channel (all their devices) that one identity row changed. */
export async function publishUserChange(
  realtime: Fetcher,
  userId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"]
): Promise<void> {
  await publish(realtime, `user:${userId}`, { resource, id, op })
}

/** Force-sign-out one user's OTHER devices (e.g. after an email change). Carries
 * no id — the client re-checks auth and, if its session is dead, redirects to
 * login. The acting device keeps its (still-valid) session. */
export async function publishSignOut(realtime: Fetcher, userId: string): Promise<void> {
  await publish(realtime, `user:${userId}`, { resource: "session", op: "session" })
}
