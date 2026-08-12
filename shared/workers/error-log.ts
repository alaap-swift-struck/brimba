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
 * satisfies it. */
type CoreDb = {
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
 * cannot forget to thread the id through. */
export async function recordWorkerError(
  db: CoreDb,
  source: string,
  place: string,
  e: unknown,
  request?: { headers: { get(name: string): string | null } }
): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e))
  const requestId = request?.headers.get(REQUEST_ID_HEADER) ?? undefined
  // One structured line beside the row: the table is the owned history, the line
  // is what a live tail can filter by `req` while an incident is happening.
  traceError({ req: requestId, worker: source, place, event: "worker_error", detail: err })
  await logError(db, { source, place, message: err.message, stack: err.stack, requestId })
}
