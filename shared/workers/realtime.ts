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
//
// SHARDING (see below): a team channel may be split across several objects. That
// is invisible from here — a publisher still names `team:<id>` and the realtime
// worker expands it. One resolver, in one place, instead of every caller.

// ---------------------------------------------------------------------------
// SHARD ADDRESSING — the shared vocabulary, so the two sides cannot disagree.
//
// One Durable Object per team holds every socket in that team and `broadcast()`
// walks them in a single thread. At 25,000 concurrent sessions in one tenant
// that is 25,000 sends per ping against a soft limit of ~1,000 requests/second
// per object. Splitting the channel into N objects divides the walk by N.
//
// A subscriber lands on a shard picked from their USER ID, so a person's every
// device shares one shard and the split is stable across reconnects. A publisher
// fans to ALL N shards.
// ---------------------------------------------------------------------------

/** The most shards one team's channel may be split into. 32 objects × ~1,000
 * sends/second each is ~32,000 concurrently-served sockets in a single tenant —
 * comfortably past the 250,000-member / 10%-concurrent yardstick. Past this the
 * fan-out itself (N calls per publish) becomes the cost worth optimising, which
 * is a different design (a fan-out tree), not a bigger number here. */
export const MAX_SHARDS = 32

/**
 * How many shards a team of this size needs — one per ~1,000 concurrent
 * sessions, assuming ~10% of members are live at once. Always a power of two so
 * the count reads as a doubling ladder (1, 2, 4 …) rather than an arbitrary
 * number, and always at least 1.
 *
 * MONOTONIC BY CONTRACT — see `shardCount`'s caller: the nightly recompute only
 * ever RAISES a team's stored count. That is what makes sharding safe to change
 * underneath live sockets: a socket that connected when the count was N' sits on
 * a shard index < N', and every later count is ≥ N', so a publisher fanning to
 * the current N always covers it. No connected listener can be stranded. A
 * SHRINK would strand the sockets above the new count, so a shrink is a manual,
 * documented act that takes effect as clients reconnect.
 */
export function shardCount(memberCount: number): number {
  const wanted = Math.ceil(Math.max(memberCount, 1) * 0.1 / 1000)
  let n = 1
  while (n < wanted && n < MAX_SHARDS) n *= 2
  return n
}

/** Which shard a user belongs on. FNV-1a: deterministic, dependency-free, and
 * well-spread over ULIDs (whose leading characters are a timestamp and would
 * clump badly under a naive sum). */
export function shardFor(userId: string, shards: number): number {
  if (shards <= 1) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % shards
}

/** The object name for one shard of a channel. Shard 0 keeps the BARE name, so
 * a team that has never been split addresses exactly the object it always did —
 * no migration, no reconnect, and an unsharded team is bit-for-bit unchanged. */
export function shardChannel(channel: string, shard: number): string {
  return shard === 0 ? channel : `${channel}#${shard}`
}

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
