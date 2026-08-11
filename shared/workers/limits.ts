// ONE place for the read/write size caps every worker shares (R14: no unbounded
// list endpoint). A cap is a hard ceiling with a comment at the query — beyond
// it, the screen must move to real server paging (LIMIT ? OFFSET ? + a total).
// WHY: one unbounded read stalls a worker at 100k rows; scale is a law, not a
// per-screen choice — the failure that earned it was a 24,000-row catalogue.

/** Hard cap on any collection list read (rows a screen loads in one go). */
export const LIST_HARD_CAP = 1000

/** Hard cap on a CSV export read — larger than a screen load (an export is a
 * deliberate download), still bounded so one request can't stream a whole shard. */
export const EXPORT_HARD_CAP = 10_000

/** Hard cap on a conversation/derived read (a ticket's replies, a chat thread's
 * messages, a per-member progress matrix). */
export const THREAD_HARD_CAP = 500

// ── the agent's reply ceiling, and the bulk cap DERIVED from it ───────────────
// A cap the model is TOLD but cannot physically EMIT is a promise the runtime
// breaks silently, mid-JSON: the tool call truncates, the turn dies, nothing
// changed. So the two numbers come from ONE place and the relationship below is
// asserted by workers/data-ops/test/reply-ceiling.test.ts.

/** The agent's output budget per model turn (both providers). Raised from 4,096
 * after a downstream run proved a full bulk call doesn't fit under it. */
export const AGENT_MAX_TOKENS = 8192

/** What one id costs the model to emit inside a JSON array: a 26-char ULID plus
 * its quotes, comma and space. ~12 in practice; budgeted generously because the
 * failure it prevents is silent. */
export const TOKENS_PER_EMITTED_ID = 15

/** Everything else in that same reply: the tool-call envelope, the argument
 * names, and the sentence the assistant says alongside the call. */
export const AGENT_REPLY_ENVELOPE_TOKENS = 512

/** Max ids in one bulk write — DERIVED, not hand-picked: it is what the model can
 * actually write at AGENT_MAX_TOKENS. The bulk doors and the agent's tool schemas
 * both declare THIS constant, so the number the model is told, the number the door
 * enforces, and the number that physically fits are one number. */
export const BULK_IDS_LIMIT = Math.floor((AGENT_MAX_TOKENS - AGENT_REPLY_ENVELOPE_TOKENS) / TOKENS_PER_EMITTED_ID)

/** The GLOBAL ceiling on rows in ONE bulk import call — how many the pipeline is
 * willing to put in a single request, whatever the door says. It is a CEILING, not
 * a target: a target's own bulk endpoint may cap LOWER, and `parcelSize()` takes
 * the MINIMUM of the two. Taking only this number is how a 400-row import failed
 * 400 rows against a door that caps at 200 — one oversized parcel, refused whole,
 * reported as if every row in it were bad. */
export const BULK_MAX_ROWS = 2000

/** Per-user ceiling on CREATED teams. Every team provisions a REAL database, so
 * an uncapped create door lets one signed-up account exhaust the platform's
 * database quota. Low on purpose — a person runs a handful of teams, not fifty;
 * the owner raises it per environment with MAX_TEAMS_PER_USER. */
export const MAX_TEAMS_PER_USER = 5

/** THE ONE numeric env-var parse. Two bugs of the same family live in the obvious
 * spellings, in opposite directions:
 *   • `Number(env.X) || DEFAULT` turns a deliberate **0** into the default — set
 *     the AI allowance to zero and you silently grant the full daily quota.
 *   • `Number(env.X)` with no empty test turns **unset** into 0 — a team cap that
 *     refuses every account its very first team.
 * Both are invisible until someone deliberately chooses the boundary value, which
 * is exactly when it matters. So: unset, empty or unparseable → the fallback;
 * every real number, INCLUDING zero and negatives, is honoured as written. */
export function numberVar(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
