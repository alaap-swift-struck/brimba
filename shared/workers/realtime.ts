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

import { dbRecorder, recordOutbound, type CoreDb, type OutboundRecorder } from "./error-log"
import { opsDatabase } from "./ops-db"
import { callService, traceError, traceHop } from "./trace"

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

/** The name this seam records under. One string, so every row about a ping that
 * never landed groups together rather than under whichever worker happened to be
 * writing at the time — and so the `recordOutbound` throttle keys on the live
 * layer as a whole, which is what is actually broken when any of this fails. */
const PUBLISH_INTEGRATION = "realtime-publish"

/** The ONE place a change ping leaves a worker — which is why guarding it here
 * covers every publish call site in the base at once, and why bounding it here
 * matters: without a timeout a wedged live layer would hold open every write that
 * had just succeeded, turning a cosmetic outage into a total one. `callService`
 * swallows the failure (best-effort, as the contract above promises) and records
 * a structured line carrying the request id.
 *
 * IT READS THE ANSWER. It used to discard `callService`'s return value entirely —
 * neither `res.ok` nor `null` — which made the two ways this can fail invisible in
 * two different ways. A 500 from the realtime worker is an ANSWER, so it never
 * reached `callService`'s catch and produced no line at all; a no-answer produced
 * one console line, and Cloudflare keeps those about a week. A publish failure had
 * therefore never reached `error_logs` — not once, in the store that exists to
 * hold exactly this.
 *
 * That was survivable while every caller awaited the ping: the write in front of
 * it was still on the wire and a human was still watching. It is not now. 36 of
 * the 42 publish sites hand this to `ctx.waitUntil`, so it settles after the
 * response has gone, and nobody is watching at all. A wedged live layer shows up
 * as screens that quietly stop updating — the one fault class that generates no
 * bug report, because a stale screen looks exactly like a quiet one.
 *
 * `record` is the OPTIONAL durable channel, the same shape and the same throttle
 * the D1 REST door (`recordFailure`) and `proxyService` (`opts.record`) already
 * take. Absent, this behaves exactly as it did. */
async function publish(
  realtime: Fetcher,
  channel: string,
  event: ChangeEvent,
  record?: OutboundRecorder
): Promise<void> {
  // TIMED, because every mutation waits on it (LAW R1) and nothing knew what it
  // cost. A Durable Object is a single addressed instance, so this hop's price is
  // where that object lives — a fact no amount of reading the code reveals.
  const started = Date.now()
  const res = await callService(
    realtime,
    "https://realtime/publish",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, event }),
    },
    { worker: PUBLISH_INTEGRATION, place: channel, record }
  )
  traceHop({ worker: PUBLISH_INTEGRATION, op: `publish:${event.resource}`, ms: Date.now() - started })
  // NULL means the live layer did not answer, and `callService` has already
  // logged AND recorded that on the way past — recording it twice would double
  // every outage in the store.
  if (!res || res.ok) return
  // A refusal, on the other hand, belongs to this caller. The realtime worker
  // answered — with a 400 (this seam sent something /publish could not parse) or
  // a 5xx (it broke while fanning out) — and either way the ping did not land and
  // nothing else in the system was going to say so. The status is in the message
  // because it is the whole diagnosis: 400 is a bug here, 5xx is a bug there.
  const err = new Error(`realtime /publish answered ${res.status}`)
  traceError({ worker: PUBLISH_INTEGRATION, place: channel, event: "publish_refused", detail: err })
  await recordOutbound(record, PUBLISH_INTEGRATION, channel, "upstream", err)
}

/**
 * THE DURABLE CHANNEL, threaded but not yet universal — stated here so nobody has
 * to discover it by grepping.
 *
 * `record` is the last parameter of all three helpers: a worker that has a
 * database handle passes `dbRecorder(opsDatabase(env), "realtime-publish")` and a
 * ping that never landed leaves a row; a worker that passes nothing behaves
 * exactly as it always has. It is trailing and optional for the same reason
 * `recordOutbound`, `logActivity`'s `record` and `d1-rest`'s `recordFailure` are:
 * this is the base's most-copied call, and a required argument here would have to
 * be invented at every call site, several of which have no database of their own.
 *
 * FIVE of those 42 pass one today — the tenancy team lifecycle. The rest are one
 * token away and are listed in the round-5 report; they were left because they sit
 * in files outside this repair's territory, not because they should not have it.
 * The throttle means partial wiring still surfaces a wedged live layer (the fault
 * is systemic, and one row a minute is all it would write anyway); what partial
 * wiring costs is how QUICKLY it is noticed.
 */

/** The durable channel, built the one way it should be built: `opsDatabase(env)`
 * rather than a named binding (the table moved out of the core database and falls
 * back to it when a fork has no `OPS`), and the integration name from the constant
 * above rather than a string retyped at every wiring site. A publisher that has a
 * database handle passes `publishRecorder(env)`; one that does not passes nothing.
 * Exactly the shape `d1ConfigFrom` uses to build the data door's `recordFailure`. */
export function publishRecorder(env: { DB: CoreDb; OPS?: CoreDb }): OutboundRecorder {
  return dbRecorder(opsDatabase(env), PUBLISH_INTEGRATION)
}

/** Tell a TEAM's channel that one row in `resource` changed. */
export async function publishChange(
  realtime: Fetcher,
  teamId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"],
  record?: OutboundRecorder
): Promise<void> {
  await publish(realtime, `team:${teamId}`, { resource, id, op }, record)
}

/** Tell ONE user's channel (all their devices) that one identity row changed. */
export async function publishUserChange(
  realtime: Fetcher,
  userId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"],
  record?: OutboundRecorder
): Promise<void> {
  await publish(realtime, `user:${userId}`, { resource, id, op }, record)
}

/** Force-sign-out one user's OTHER devices (e.g. after an email change). Carries
 * no id — the client re-checks auth and, if its session is dead, redirects to
 * login. The acting device keeps its (still-valid) session. */
export async function publishSignOut(
  realtime: Fetcher,
  userId: string,
  record?: OutboundRecorder
): Promise<void> {
  await publish(realtime, `user:${userId}`, { resource: "session", op: "session" }, record)
}
