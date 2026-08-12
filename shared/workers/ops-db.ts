// THE OPERATIONS DATABASE — where the app's exhaust lives, away from its records.
//
// Every team has its own database. A handful of tables do not: identity, who
// belongs to which team, sessions, the invite routing index. Those live in ONE
// shared database, which therefore carries the SUM of every tenant the product
// will ever have — against D1's 10 GB per-database cap. Per-team sharding does
// nothing for it, and there is no mover that can relieve it.
//
// Sitting in that same shared space were the two fastest-growing tables in the
// system, and neither of them is a record:
//
//   error_logs       — one row every time something goes wrong, anywhere
//   agent_usage_log  — one row every time anyone uses the AI
//
// They are pure exhaust. Nothing joins to them, nothing has a foreign key to
// them, and every read of either is by a single tagged column. So they can live
// somewhere else entirely, and the shared database keeps its 10 GB for the
// things that actually need to be near each other.
//
// Moving them changes nothing about tenancy: per-team databases stay per-team,
// and the AI CREDIT BALANCE (`agent_credits`, which the quota gate reads) is a
// different table and does NOT move. Only the history does.
//
// THE FALLBACK IS THE WHOLE SAFETY OF THIS. A worker without the `OPS` binding
// — a fork that has not created the database, a local `wrangler dev`, a deploy
// that missed a config — keeps writing to the core database exactly as before.
// Nothing errors, nothing is lost, and the only consequence is that the tables
// are back where they started. A partition that breaks the app when its extra
// database is absent would be a worse problem than the one it solves.

/**
 * Where the exhaust tables live for this worker: the operations database if it
 * has one, the core database if not. Call this instead of reaching for `env.DB`
 * whenever the target is `error_logs` or `agent_usage_log`.
 *
 * Generic rather than structurally typed, so the caller gets its OWN
 * `D1Database` back with every method intact — and so this file still compiles
 * in the web workspace, which has no Workers types to name.
 */
export function opsDatabase<D>(env: { DB: D; OPS?: D }): D {
  return env.OPS ?? env.DB
}

/** The tables that live in the operations database. Named here so the mover, the
 * retention sweep and the check that guards all of this read ONE list rather
 * than three copies that can drift apart. */
export const OPS_TABLES = ["error_logs", "agent_usage_log"] as const
