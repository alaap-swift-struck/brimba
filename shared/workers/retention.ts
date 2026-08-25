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
  /**
   * How the column is read. `age` (the default) counts the window back from now:
   * "older than 90 days". `expiry` means the row carries its OWN deadline, so the
   * cutoff is now — plus whatever grace `days` allows. The distinction is small
   * and load-bearing: on an EXPIRY rule zero does not mean KEEP_FOREVER, it means
   * "the moment it expires", because an expired row is already unusable and there
   * is no window anyone could sensibly choose.
   */
  by?: "age" | "expiry"
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
  {
    table: "sessions",
    column: "expires_at",
    by: "expiry",
    // NOT KEEP_FOREVER. An expiry rule has no window to switch off, so zero here
    // reads as "no grace" — remove the row the moment the session it describes
    // stops working, which is exactly what the sweep did before it became a rule.
    days: 0,
    envVar: "RETAIN_EXPIRED_SESSIONS_DAYS",
    why: "A dead session is exhaust: nothing references it and nobody can use it. It is here so it goes through the SAME bounded, multi-pass, shortfall-reporting sweep as every other log — it used to be one unbounded DELETE, which on a busy night is the statement most likely to hit D1's 30-second limit and remove nothing at all. The window is a GRACE, not a retention period: raise it only to keep a few days of expired rows while investigating why someone was signed out.",
  },
  {
    table: "db_sizes",
    column: "at",
    days: 90,
    envVar: "RETAIN_DB_SIZES_DAYS",
    why: "The growth METER, not the growth. One row per database per night is how 'is this tenant getting bigger, and how fast' stops being a guess — but a per-night row per database is itself a table that grows with tenant count forever, so a size history with no window becomes the thing it was built to warn about. Ninety days is two full quarters of trend, which is enough to see a slope.",
  },
]

/** The OPERATIONS database — the two pure-exhaust tables that used to sit in the
 * shared core database and crowd out the records. They moved (SCALING.md §5.2);
 * their retention rules move with them, or the sweep would quietly prune an
 * empty table in the old database while the real one grew unchecked. */
export const OPS_RETENTION: RetentionRule[] = [
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
  // An EXPIRY rule always sweeps: the row states its own deadline, so `days` is a
  // grace period on top of it and zero is a real answer rather than "off". Age
  // rules keep the original meaning — zero or nonsense keeps, never deletes.
  if (rule.by === "expiry") return new Date(now.getTime() - Math.max(days, 0) * 86_400_000).toISOString()
  if (days <= 0) return null
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

/** Dead sessions are their own case: they are swept by EXPIRY, not by age, and
 * an expired session is unusable by definition — there is no window to choose.
 *
 * SUPERSEDED by the `sessions` rule in CORE_RETENTION above, which puts this
 * through the same bounded, multi-pass, shortfall-REPORTING sweep as every other
 * log. It survives only until its one caller (tenancy's `runRetention`) drops the
 * standalone statement, and it is bounded here so that in the meantime it cannot
 * be the unbounded DELETE it was: an unbounded delete on a table nobody has ever
 * pruned matches everything at once, sits against D1's 30-second statement limit,
 * and on timing out removes NOTHING — a sweep that gets slower the more it has to
 * do and stops working exactly when it is needed. The bound matches SWEEP_BATCH
 * in tenancy's sharding lib; a batch that comes back FULL means there is more to
 * take, which is what the multi-pass loop is for.
 *
 * ONE bind parameter, deliberately: the caller binds a single timestamp, so the
 * predicate lives entirely inside the subquery rather than being repeated
 * outside it. A second `?` here would throw at runtime on a statement nothing
 * exercises until 3am. */
export const EXPIRED_SESSIONS_SQL =
  "DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? LIMIT 5000)"
