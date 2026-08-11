// CONCURRENCY — the two races CONCURRENCY.md's rules do not cover.
//
// That ruleset makes INVARIANTS race-safe (keep ≥1 admin, never-negative
// balance, one pending invite) by riding the check inside the write's WHERE. It
// is correct and it is not enough, because it only protects rules the app knows
// it has. Two races remain, and both are silent:
//
//   THE DOUBLE WRITE. A create is one HTTP request, and an HTTP request can be
//   sent twice — a double-tapped button, a flaky connection retrying, a client
//   that timed out on a response the server actually sent. Nothing here noticed:
//   the second request was simply a second create, and the team got two of
//   whatever it was. No error, no invariant broken, just a duplicate nobody
//   asked for.
//
//   THE LOST UPDATE. Two people open the same record, both edit, both save. The
//   second save overwrites the first with fields it read before the first
//   existed. The first person's change is gone and neither of them is told.
//
// Both fixes follow the ruleset's own principle — the condition rides the write
// — extended from "an invariant the app declared" to "the state the caller
// believed it was acting on".

import { sqlString } from "./d1-rest"
import { GuardError } from "./gating"

// ---------------------------------------------------------------------------
// 1 · IDEMPOTENCY — a retried mutation must not do the work twice.
// ---------------------------------------------------------------------------

/** The header a client sends to make one mutation safe to retry. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key"

/** How much of a response we keep for replay. Every door this protects returns a
 * row or a count, so this is enormous headroom; the cap exists because the
 * record lives in the shared core database and an unbounded blob per mutation is
 * exactly the kind of growth that fills it. */
export const MAX_REPLAY_BYTES = 64 * 1024

/** A key must be client-generated and unguessable — it is what ties a retry to
 * its original. Bounded so a caller cannot write a megabyte into the key column. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{16,128}$/

type CoreDb = { prepare(sql: string): D1PreparedStatement }

/** SHA-256 of the caller's session cookie, hex. The key alone would be enough in
 * practice (it is unguessable), but binding the record to WHO claimed it means a
 * leaked or logged key cannot be used to read back someone else's response. The
 * raw token is never stored — only this digest. */
async function ownerOf(request: Request): Promise<string> {
  const cookie = request.headers.get("Cookie") ?? ""
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookie))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * The whole seam, in one call, wrapped around a mutation.
 *
 * No `Idempotency-Key` header → this is a pass-through and costs NOTHING: the
 * handler runs exactly as it always did, with no extra query. That is deliberate.
 * Making every mutation in the app pay a round-trip to protect the ones a client
 * actually retries would be a tax on the whole product for the benefit of a few
 * doors.
 *
 * With a key, three things can happen:
 *   • FIRST TIME — we claim the key, run the handler, store the outcome.
 *   • RETRY of something FINISHED — we replay the stored response. The handler
 *     never runs, so nothing is written twice.
 *   • RETRY of something STILL RUNNING — 409. This is the case a naive
 *     implementation gets wrong: two retries arriving together must not BOTH
 *     proceed just because neither has finished yet. The claim is an INSERT
 *     against a primary key, so the database picks exactly one winner.
 */
export async function withIdempotency(
  request: Request,
  db: CoreDb,
  route: string,
  run: () => Promise<Response>
): Promise<Response> {
  const key = request.headers.get(IDEMPOTENCY_HEADER)
  if (!key) return run() // the ordinary path — untouched, unmeasured, free

  if (!KEY_SHAPE.test(key))
    throw new GuardError(400, "bad_idempotency_key", "That retry key isn't in a form we accept.")

  const owner = await ownerOf(request)
  const now = new Date().toISOString()

  // THE CLAIM. A primary-key INSERT is the whole mutual exclusion: SQLite
  // serialises writers, so of two simultaneous retries exactly one insert
  // succeeds and the other raises. No lock, no second moving part.
  try {
    await db
      .prepare(
        "INSERT INTO idempotency_keys (key, owner, route, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(key, owner, route, now)
      .run()
  } catch {
    // Lost the claim — someone else has this key. Find out what they did with it.
    const prior = await db
      .prepare("SELECT owner, route, status, body FROM idempotency_keys WHERE key = ?")
      .bind(key)
      .first<{ owner: string; route: string; status: number | null; body: string | null }>()

    // A key that was claimed by someone else, or for a DIFFERENT operation, is
    // not a retry — it is a mistake, and replaying would answer the wrong
    // question. Refuse rather than guess.
    if (!prior || prior.owner !== owner || prior.route !== route)
      throw new GuardError(409, "idempotency_key_reused", "That retry key belongs to a different action.")

    if (prior.status === null)
      throw new GuardError(409, "in_progress", "That's still going through. Give it a moment and check before trying again.")

    return new Response(prior.body ?? JSON.stringify({ replayed: true }), {
      status: prior.status,
      headers: { "Content-Type": "application/json", "Idempotent-Replay": "true" },
    })
  }

  // We hold the claim: do the work exactly once.
  let response: Response
  try {
    response = await run()
  } catch (e) {
    // The work failed, so nothing was completed — release the claim so a retry
    // is a real retry. Holding it would turn one transient failure into a
    // permanent one for that key.
    await db.prepare("DELETE FROM idempotency_keys WHERE key = ?").bind(key).run().catch(() => {})
    throw e
  }

  // Store the outcome for any retry that follows. The response is consumed to
  // read it, so hand the caller a fresh one built from the same bytes.
  const text = await response.clone().text()
  await db
    .prepare("UPDATE idempotency_keys SET status = ?, body = ? WHERE key = ?")
    .bind(response.status, text.length <= MAX_REPLAY_BYTES ? text : null, key)
    .run()
    .catch((e: unknown) => {
      // Recording the outcome failed. The WORK is done and correct — only the
      // replay is lost, so a later retry would redo it. Never swallow it.
      console.error("idempotency outcome not recorded for", route, e)
    })

  return new Response(text, { status: response.status, headers: response.headers })
}

// ---------------------------------------------------------------------------
// 2 · OPTIMISTIC CONCURRENCY — an edit must not silently overwrite one it never saw.
// ---------------------------------------------------------------------------

/**
 * The `AND` clause that makes an UPDATE refuse to clobber a newer version.
 *
 * Every record in this base carries `updated_at` in its audit block, so the
 * version already exists — nothing new to store, no column to add, no number to
 * bump. The client sends back the `updated_at` it was shown; if the row has
 * moved on since, the predicate matches nothing and the write is refused instead
 * of landing on top of a change the editor never saw.
 *
 * Returns an EMPTY string when the caller sends no expectation, so a client that
 * has not adopted this (or an internal caller that legitimately means
 * last-write-wins) behaves exactly as before.
 */
export function versionPredicate(expected: string | undefined | null): string {
  if (!expected) return ""
  return ` AND updated_at = ${sqlString(expected)}`
}

/**
 * Read the outcome of an UPDATE that carried `versionPredicate`.
 *
 * Zero rows moved with an expectation attached means one of two things — the row
 * changed under the editor, or it is gone — and BOTH deserve the same answer:
 * don't retry blindly, look at it again. Saying "someone else changed this"
 * costs nothing if it was actually deleted, whereas silently succeeding when the
 * write did nothing is the failure this exists to prevent.
 */
export function assertNotConflicted(changes: number, expected: string | undefined | null): void {
  if (!expected || changes > 0) return
  throw new GuardError(
    409,
    "changed_elsewhere",
    "Someone else changed this while you had it open. Take a look at the latest version and try again."
  )
}
