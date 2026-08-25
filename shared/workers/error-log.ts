// The ONE server-side error-RECORDING seam (ERROR-HANDLING.md). Every worker's
// central catch calls `logError` right after its console.error, so an unexpected
// crash lands in the core `error_logs` table (90-day-ish owned history + the
// resolve workflow) as well as Cloudflare's short-lived console logs. The gateway
// forwards client beacons into the same table via auth's /internal/log-error.
//
// Contract: RECORDING AN ERROR MUST NEVER THROW and never change the response —
// everything is capped and wrapped. Clean GuardError refusals (4xx) are never
// logged; this table is for the unexpected only.

import { ulid } from "./id"
import { REQUEST_ID_HEADER, traceError } from "./trace"

/** The slice of a D1 binding this seam uses — structural, so shared/ compiles in
 * every workspace (the web tsconfig has no Workers types). The real `env.DB`
 * satisfies it. Exported so a caller can carry a handle to it (the data door
 * does — see `recordOutbound`) without naming a Workers type. */
export type CoreDb = {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } }
}

export type ErrorReport = {
  source: string
  place: string
  message: string
  stack?: string
  teamId?: string
  userId?: string
  url?: string
  /** The id minted at the gateway (shared/workers/trace.ts). Every worker that
   * touched the same request records the same value, so one failed click can be
   * pulled back together from seven separate crashes. Optional: a worker reached
   * outside a traced request, or an older gateway mid-rollout, has none. */
  requestId?: string
}

export async function logError(db: CoreDb, r: ErrorReport): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO error_logs (id, at, source, place, message, stack, team_id, user_id, url, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ulid(),
        new Date().toISOString(),
        String(r.source).slice(0, 40),
        String(r.place).slice(0, 200),
        String(r.message).slice(0, 500),
        r.stack ? String(r.stack).slice(0, 2000) : null,
        r.teamId ?? null,
        r.userId ?? null,
        r.url ? String(r.url).slice(0, 300) : null,
        r.requestId ? String(r.requestId).slice(0, 64) : null
      )
      .run()
  } catch {
    /* recording must never break the request */
  }
}

/** The central-catch one-liner: console (for live tails) + the table (for history).
 * `e` is whatever was thrown; `place` is "<METHOD> <pathname>".
 *
 * `request` is the incoming Request, read only for its trace id — passing the
 * request rather than the id keeps every call site a one-liner and means a worker
 * cannot forget to thread the id through.
 *
 * `who` is the OPTIONAL attribution. `error_logs` has carried `team_id` and
 * `user_id` since the table was created and this seam filled in neither, so every
 * row a worker recorded landed anonymous: you could see that something crashed
 * and never which tenant it crashed for. That is the difference between "one
 * customer's import is broken" and "the app is broken", and only one of them is
 * actionable. Optional and trailing so every existing call site keeps working —
 * a caller that has a guard in hand passes it, one that crashed before gating
 * has nothing to pass. The store is admin-gated, so an id here is not exposure. */
export async function recordWorkerError(
  db: CoreDb,
  source: string,
  place: string,
  e: unknown,
  request?: { headers: { get(name: string): string | null } },
  who?: { teamId?: string; userId?: string }
): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e))
  const requestId = request?.headers.get(REQUEST_ID_HEADER) ?? undefined
  // One structured line beside the row: the table is the owned history, the line
  // is what a live tail can filter by `req` while an incident is happening.
  traceError({ req: requestId, worker: source, place, event: "worker_error", detail: err })
  await logError(db, {
    source,
    place,
    message: err.message,
    stack: err.stack,
    requestId,
    teamId: who?.teamId,
    userId: who?.userId,
  })
}

/* --------------------------- outbound integrations -------------------------- */

// A CALL TO SOMETHING OUTSIDE THIS APP THAT FAILS MUST LEAVE A ROW — and must
// not become the second casualty of the outage it is reporting.
//
// Both halves matter. Until now an external call that failed recorded nothing:
// the D1 REST door retried twice, threw, and the only evidence was whatever the
// caller's central catch happened to make of it. So "the cloud key was rotated
// last Tuesday" and "D1 was slow for ninety seconds" looked identical from the
// error store, and neither was countable.
//
// The second half is why this is throttled rather than simply logged. The data
// door is on EVERY team-database read. A D1 incident would otherwise write one
// row per failed query — thousands a minute, each one saying what the first
// already said. The first failure of a kind carries the information; the rest
// repeat it. So: ONE row per (integration, kind) per minute, and the ones held
// back are COUNTED and said out loud on the next row that gets through, because
// a silently dropped count is how "it happened once" hides "it happened forty
// thousand times".
//
// WHY THE CALLER SUPPLIES THE CHANNEL AND NOT A DATABASE HANDLE. The two workers
// that most need this record errors in two different ways, both correctly: the
// core-bound workers write to the operations database through a NATIVE binding,
// and the gateway — which deliberately binds no database at all, because giving
// the busiest, only-public worker a D1 handle to write one row per crash is a
// bigger change than the fault warrants — posts to auth's `/internal/log-error`
// door. Taking a `CoreDb` here would have forced the gateway to acquire a
// binding to satisfy a log line, so this seam owns the THROTTLE and the caller
// owns the CHANNEL.

/** Why an outbound call failed — three kinds, because they need three different
 * people. A `credential` fault is a rotated or mis-scoped key and needs someone
 * to re-issue it; a `timeout` is a dependency that is slow; `upstream` is a
 * dependency that is broken. Folding them together loses the only part of the
 * message that decides what to do next. */
export type OutboundKind = "credential" | "timeout" | "upstream"

/** How a caller records — a native D1 write in a database-bound worker, a
 * service-door POST in the gateway. `place` arrives pre-composed as
 * "<integration> <endpoint>" and the error's message already names the kind and
 * anything the throttle swallowed, so a recorder only has to store what it is
 * handed. */
export type OutboundRecorder = (place: string, e: unknown) => void | Promise<void>

/** The recorder for a worker that HAS a database handle — the common case, so
 * the message/stack extraction is not re-derived at every wiring site. The
 * gateway supplies its own closure over `/internal/log-error` instead. */
export function dbRecorder(db: CoreDb, source: string): OutboundRecorder {
  return (place, e) => {
    const err = e instanceof Error ? e : new Error(String(e))
    return logError(db, { source, place, message: err.message, stack: err.stack })
  }
}

/** The throttle window. A minute is long enough that a storm collapses to one
 * row and short enough that a fault which is still happening keeps saying so. */
const OUTBOUND_WINDOW_MS = 60_000

/** Module scope, so it is per-isolate: a Worker isolate handles many requests,
 * which is exactly the span a storm arrives in. Keyed by (integration, kind) —
 * a small, bounded set, so this map cannot grow the way an endpoint-keyed one
 * would under a path a caller can vary. */
const outboundSeen = new Map<string, { at: number; dropped: number }>()

/**
 * Record a failed call to something outside this app. Never throws, never
 * changes the caller's behaviour — the caller still throws its own error.
 *
 * `record` is optional on purpose: not every place that makes an outbound call
 * has a way to record one, and a missing channel must mean "not recorded", never
 * a crash inside the error path.
 */
export async function recordOutbound(
  record: OutboundRecorder | undefined,
  integration: string,
  endpoint: string,
  kind: OutboundKind,
  e: unknown
): Promise<void> {
  if (!record) return
  const key = `${integration}:${kind}`
  const now = Date.now()
  const seen = outboundSeen.get(key)
  if (seen && now - seen.at < OUTBOUND_WINDOW_MS) {
    seen.dropped++
    return
  }
  // The row that gets through carries what the window swallowed, so the count is
  // never lost — only the duplicate rows are.
  const dropped = seen?.dropped ?? 0
  outboundSeen.set(key, { at: now, dropped: 0 })
  const err = e instanceof Error ? e : new Error(String(e))
  const alsoDropped = dropped ? ` (+${dropped} more in the last minute)` : ""
  const carried = new Error(`${kind}: ${err.message}${alsoDropped}`)
  carried.stack = err.stack
  try {
    await record(`${integration} ${endpoint}`, carried)
  } catch {
    /* a caller's channel can be down too — recording must never break the request */
  }
}
