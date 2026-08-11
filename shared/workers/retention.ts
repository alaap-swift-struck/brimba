// RETENTION — what the app is allowed to forget, and what it must not.
//
// Nothing in this base has ever deleted anything. That is correct for RECORDS
// and wrong for LOGS, and the difference is the whole design here.
//
// A RECORD is interrelated. A member row is referenced by role assignments, by
// invite audit rows, by every activity line that names them. Deleting one
// breaks five other things, which is exactly why the base is deactivate-never-
// delete (ARCHITECTURE §4) and why nothing in this file touches one.
//
// A LOG is not. Nothing has a foreign key to a used-up login code, a session
// that expired last March, or a worker error from two years ago. They are
// append-only exhaust, they are the fastest-growing tables in the system, and
// keeping them for ever is how a database that carries every tenant reaches
// D1's 10 GB cap without a single customer noticing they were growing.
//
// So: sweep the exhaust, never the records.
//
// THE AUDIT TRAIL SITS BETWEEN THE TWO and is therefore OFF by default. A team's
// `activity` feed and a user's `account_activity` are logs by shape but history
// by purpose — "who changed this price, and when" is often the reason a customer
// bought the product. Both have a window here and both are set to KEEP FOR EVER
// until an owner deliberately chooses otherwise, per environment. Deleting
// someone's audit history is a decision for the person who owns the product, not
// a default that arrives with an upgrade.

/** Keep for ever. */
export const KEEP_FOREVER = 0

/**
 * One sweepable table: where it lives, the column that dates a row, and how many
 * days of it to keep. `envVar` lets an owner override the window per environment
 * without a deploy; `KEEP_FOREVER` disables the sweep entirely.
 */
export type RetentionRule = {
  table: string
  /** the column a sweep compares against — must be indexed, or the sweep scans */
  column: string
  days: number
  envVar: string
  why: string
}

/** The GLOBAL core database — the one shared by every tenant, so the one where
 * unbounded growth is everybody's problem at once. */
export const CORE_RETENTION: RetentionRule[] = [
  {
    table: "login_codes",
    column: "created_at",
    days: 1,
    envVar: "RETAIN_LOGIN_CODES_DAYS",
    why: "A six-digit code lives for minutes. The row outlives it only to feed the per-hour send throttle, which looks back one hour.",
  },
  {
    table: "email_change_codes",
    column: "created_at",
    days: 1,
    envVar: "RETAIN_EMAIL_CODES_DAYS",
    why: "Same shape as a login code, same reason.",
  },
  {
    table: "error_logs",
    column: "at",
    days: 90,
    envVar: "RETAIN_ERROR_LOGS_DAYS",
    why: "ERROR-HANDLING.md has always described this as a 90-day log. Nothing enforced it, so it was a forever log wearing a 90-day label — this makes the documented promise true.",
  },
  {
    table: "agent_usage_log",
    column: "created_at",
    days: 400,
    envVar: "RETAIN_AGENT_USAGE_DAYS",
    why: "Long enough to answer 'what did we spend last year' with a margin, and it is per-turn exhaust that grows fastest of anything here.",
  },
  {
    table: "idempotency_keys",
    column: "created_at",
    days: 2,
    envVar: "RETAIN_IDEMPOTENCY_DAYS",
    why: "A retry window, not a history. A client retrying a two-day-old request is not retrying, it is submitting again — and every mutation a client protects writes a row here, so this is the fastest-growing table the base has.",
  },
  {
    table: "account_activity",
    column: "created_at",
    days: KEEP_FOREVER,
    envVar: "RETAIN_ACCOUNT_ACTIVITY_DAYS",
    why: "AUDIT, not exhaust — a person's own security history (sign-ins, email changes). Off until an owner chooses a window.",
  },
]

/** A per-TEAM database. Swept per team, on the same nightly pass that sizes them. */
export const TEAM_RETENTION: RetentionRule[] = [
  {
    table: "activity",
    column: "created_at",
    days: KEEP_FOREVER,
    envVar: "RETAIN_TEAM_ACTIVITY_DAYS",
    why: "AUDIT, not exhaust — the record history the whole product is trusted for. It is also the fastest-growing table in any team database, so this is the switch to reach for when one fills up. Off until an owner chooses a window.",
  },
]

/** The cutoff timestamp for a rule, or null when it keeps for ever. */
export function cutoffFor(rule: RetentionRule, days: number, now = new Date()): string | null {
  if (days <= 0) return null
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

/** Dead sessions are their own case: they are swept by EXPIRY, not by age, and
 * an expired session is unusable by definition — there is no window to choose. */
export const EXPIRED_SESSIONS_SQL = "DELETE FROM sessions WHERE expires_at < ?"
