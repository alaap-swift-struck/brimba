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
}

export async function logError(db: CoreDb, r: ErrorReport): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO error_logs (id, at, source, place, message, stack, team_id, user_id, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        r.url ? String(r.url).slice(0, 300) : null
      )
      .run()
  } catch {
    /* recording must never break the request */
  }
}

/** The central-catch one-liner: console (for live tails) + the table (for history).
 * `e` is whatever was thrown; `place` is "<METHOD> <pathname>". */
export async function recordWorkerError(
  db: CoreDb,
  source: string,
  place: string,
  e: unknown
): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e))
  await logError(db, { source, place, message: err.message, stack: err.stack })
}
