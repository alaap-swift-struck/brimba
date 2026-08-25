// THE data-access door to per-team databases (locked rule: one door).
// Team databases are created at runtime, so workers can't have them as
// pre-wired bindings — instead we talk to Cloudflare's D1 REST API with a
// scoped token. Every module worker that touches team data goes through this
// ONE file — which is also where sharding routing plugs in (see
// workers/tenancy/src/lib/sharding.ts for the routing + mover machinery).

import { recordOutbound, type OutboundKind, type OutboundRecorder } from "./error-log"
import { traceHop } from "./trace"

export type D1Rest = {
  accountId: string
  apiToken: string
  /**
   * OPTIONAL: how to record a failed call to Cloudflare (see `recordOutbound`,
   * which owns the one-row-per-minute throttle in front of it).
   *
   * A CHANNEL, NOT A DATABASE HANDLE — for two reasons. It keeps this file
   * ignorant of how any particular worker records, and it keeps the recording OFF
   * the door that is failing: a core-bound worker passes `dbRecorder(opsDatabase(env), …)`,
   * which writes to the operations/core database over a NATIVE binding, not back
   * through this REST API. Recording a REST-door outage through the REST door
   * would be the self-amplifying loop the throttle exists to bound.
   *
   * Optional so a config can still be built without one: absent → the typed throw
   * below still names the integration, the endpoint and the kind, so whoever
   * catches it can record it instead.
   */
  recordFailure?: OutboundRecorder
  /**
   * OPTIONAL per-request tally of what this door cost.
   *
   * THE MEASUREMENT THE BASE DID NOT HAVE. `timed()` reports that a request took
   * 900ms; it cannot say that 770ms of that was four HTTPS round trips to
   * api.cloudflare.com, because from outside the worker a REST round trip and an
   * in-colo binding read look identical. The tally rides on the config because the
   * config is ALREADY built once per request (`d1ConfigFrom`) and ALREADY threaded
   * to every query — so it is a correct per-request accumulator with no globals,
   * which a module-level one could not be (a Worker isolate serves many requests
   * at once and would interleave them).
   */
  trace?: D1Trace
}

/** ONE call through the door, and what it cost. `op` is a verb and a table —
 * never SQL text and never a bound value, because these reach a log line. */
export type D1Span = { op: string; ms: number; tries: number }

/** The per-request tally. `req` is the trace id, so the spans line up with the
 * `timed()` line and with every other worker's view of the same click. */
export type D1Trace = { req?: string; spans: D1Span[] }

/** The total this door cost a request, and how many trips it took. The pair is
 * the whole diagnosis: 4 × 190ms is a round-trip problem, 1 × 760ms is a query
 * problem, and they are indistinguishable from a single number. */
export function d1Cost(cfg: D1Rest): { calls: number; ms: number } {
  const spans = cfg.trace?.spans ?? []
  return { calls: spans.length, ms: spans.reduce((n, s) => n + s.ms, 0) }
}

/** A short, log-SAFE name for a statement: its verb and the table it names. The
 * SQL itself is never logged — a WHERE clause carries values, and values are the
 * customer's data. */
function sqlLabel(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim()
  const verb = (s.match(/^[A-Za-z]+/)?.[0] ?? "SQL").toUpperCase()
  const table = s.match(/\b(?:FROM|INTO|UPDATE)\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ?? ""
  return table ? `${verb} ${table}` : verb
}

/** The name this door records under. One string, so every row about Cloudflare's
 * D1 API groups together rather than under whichever worker happened to call. */
const INTEGRATION = "cloudflare-d1"

/**
 * What a failed call to the D1 REST door throws.
 *
 * It carries the three facts a recorder needs — which integration, which
 * endpoint, what KIND of failure — so a caller does not have to re-derive them by
 * pattern-matching an error message. A rotated token and a Cloudflare outage
 * produce the same `Error` today and need entirely different people.
 */
export class OutboundError extends Error {
  constructor(
    message: string,
    public integration: string,
    public endpoint: string,
    public kind: OutboundKind
  ) {
    super(message)
    this.name = "OutboundError"
  }
}

/** Record the failure, then throw it. One exit for both ways this door gives up
 * (a 4xx that will never come good, and a retry loop that ran out), so neither
 * can be the one that forgets. Recording is best-effort and never throws. */
async function failOutbound(
  cfg: D1Rest,
  path: string,
  message: string,
  kind: OutboundKind
): Promise<never> {
  const err = new OutboundError(message, INTEGRATION, path, kind)
  await recordOutbound(cfg.recordFailure, INTEGRATION, path, kind, err)
  throw err
}

type CfResponse<T> = {
  success: boolean
  errors: { code: number; message: string }[]
  result: T
}

const API = "https://api.cloudflare.com/client/v4"
const RETRIES = 2 // total attempts = 1 + RETRIES, only on 5xx/network blips

async function cf<T>(
  cfg: D1Rest,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST",
  /** verb + table, for the span and the log line. Never the SQL. */
  op = "REST",
): Promise<T> {
  // EVERY EXIT IS TIMED, including the ones that throw — a door that gave up
  // after three attempts and 45 seconds is the single most useful duration this
  // file could report, and a `finally` is the only way it cannot be forgotten
  // when someone adds a fourth exit.
  const started = Date.now()
  let tries = 0
  try {
    return await cfAttempts<T>(cfg, path, body, method, () => tries++)
  } finally {
    const ms = Date.now() - started
    cfg.trace?.spans.push({ op, ms, tries })
    // The running tally rides on the line, so ONE log entry answers "how many
    // trips did this request make through this door, and what have they cost?" —
    // the question a per-call duration on its own cannot answer.
    const so_far = cfg.trace && d1Cost(cfg)
    traceHop({ req: cfg.trace?.req, worker: "d1-rest", op, ms, tries, nth: so_far?.calls, soFarMs: so_far?.ms })
  }
}

async function cfAttempts<T>(
  cfg: D1Rest,
  path: string,
  body: unknown,
  method: "GET" | "POST" | "DELETE",
  countAttempt: () => void
): Promise<T> {
  let lastError: Error = new Error("unreachable")
  let lastKind: OutboundKind = "upstream"
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    countAttempt()
    // JITTERED backoff, not a flat one. A D1 blip does not fail one worker, it
    // fails every worker holding a request at that instant — and a fixed
    // `250 * attempt` wakes all of them at the same millisecond, so the
    // recovering service is hit by the whole herd at once and blips again. The
    // spread (half to one-and-a-half of the slot) is what breaks the lock-step;
    // the average wait is unchanged.
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt * (0.5 + Math.random())))
    let res: Response
    try {
      res = await fetch(`${API}/accounts/${cfg.accountId}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // LAW R11: bound the socket. A hung D1 REST call would otherwise never return
        // and stall the worker; a timeout throws → the retry loop above handles it.
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      // Network hiccup — worth retrying.
      lastError = e instanceof Error ? e : new Error(String(e))
      // A blown `AbortSignal.timeout` arrives as an AbortError (TimeoutError on
      // some runtimes): a dependency that is SLOW, which is a different thing to
      // watch than a dependency that is broken.
      lastKind = lastError.name === "AbortError" || lastError.name === "TimeoutError" ? "timeout" : "upstream"
      continue
    }
    if (res.status >= 500) {
      lastError = new Error(`Cloudflare D1 API ${res.status} on ${path}`)
      lastKind = "upstream"
      continue
    }
    const data = (await res.json()) as CfResponse<T>
    if (!res.ok || !data.success) {
      // 4xx = our request is wrong — retrying won't help, fail loudly. 401/403 is
      // the one worth naming separately: it is almost always a rotated or
      // mis-scoped CF_D1_TOKEN, which no amount of waiting fixes and which needs
      // a person, not an alert.
      const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText
      const kind: OutboundKind = res.status === 401 || res.status === 403 ? "credential" : "upstream"
      await failOutbound(cfg, path, `Cloudflare D1 API failed: ${msg}`, kind)
    }
    return data.result
  }
  // Never resolves — `failOutbound` records and then throws. Returned rather
  // than awaited so TypeScript sees this branch produce a value of type `never`.
  return failOutbound(cfg, path, lastError.message, lastKind)
}

/** Create a brand-new D1 database; returns its database id. */
export async function d1CreateDatabase(
  cfg: D1Rest,
  name: string
): Promise<string> {
  const result = await cf<{ uuid: string }>(cfg, "/d1/database", { name })
  return result.uuid
}

/** Delete a database — used to clean up after a failed team creation. */
export async function d1DeleteDatabase(
  cfg: D1Rest,
  databaseId: string
): Promise<void> {
  await cf(cfg, `/d1/database/${databaseId}`, undefined, "DELETE")
}

/** Every database in the account (id, name, size) — feeds the 80% alarms. */
export async function d1ListDatabases(
  cfg: D1Rest
): Promise<{ uuid: string; name: string; file_size: number | null }[]> {
  const all: { uuid: string; name: string; file_size: number | null }[] = []
  for (let page = 1; ; page++) {
    const batch = await cf<
      { uuid: string; name: string; file_size: number | null }[]
    >(cfg, `/d1/database?page=${page}&per_page=100`)
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

/** Run ONE parameterized statement; returns its rows. */
export async function d1Query<Row = Record<string, unknown>>(
  cfg: D1Rest,
  databaseId: string,
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  const result = await cf<{ results: Row[] }[]>(
    cfg,
    `/d1/database/${databaseId}/query`,
    { sql, params },
    "POST",
    sqlLabel(sql)
  )
  return result[0]?.results ?? []
}

/**
 * Merged reads (the "splitter" read path): run the same query against several
 * databases — e.g. a module split across shards — and return all rows as one
 * list. Pair with resolveModuleDatabases() in the tenancy sharding lib.
 */
export async function d1QueryAcross<Row = Record<string, unknown>>(
  cfg: D1Rest,
  databaseIds: string[],
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  // allSettled, not all: gather every shard's outcome so a failure names WHICH shard(s)
  // failed (Promise.all throws the first raw error and hides the rest). It still fails
  // LOUD on any error — a sharded read that silently dropped a shard's rows would be
  // wrong (a count/aggregate would under-report). If a future query can tolerate a
  // degraded shard, that's a deliberate per-query opt-in, not the default here.
  const settled = await Promise.allSettled(
    databaseIds.map((id) => d1Query<Row>(cfg, id, sql, params))
  )
  const failed = databaseIds.filter((_, i) => settled[i].status === "rejected")
  if (failed.length)
    throw new Error(`d1QueryAcross: ${failed.length}/${databaseIds.length} shard(s) failed (${failed.join(", ")})`)
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))
}

/** Run a multi-statement script (schema/seeds — no params allowed). */
export async function d1ExecScript(
  cfg: D1Rest,
  databaseId: string,
  script: string
): Promise<void> {
  await cf(cfg, `/d1/database/${databaseId}/query`, { sql: script }, "POST", sqlLabel(script))
}

/**
 * Run SEVERAL statements in ONE call and get EVERY result set back — the reading
 * sibling of `d1ExecScript`, which sends N statements and then throws all N
 * answers away.
 *
 * WHY THIS EXISTS. Every statement in this app runs in 0.1–0.3ms; the entire cost
 * of a request is the distance to the door. Raising a support ticket was an
 * insert, an activity row, a read-back and a count as FOUR separate HTTPS calls
 * to api.cloudflare.com — about 427ms of a 1.2s operation spent on latency alone.
 * All four now travel together — the activity row joined once
 * `shared/workers/activity.ts` exported the statement builder rather than only
 * the writer, so there is still exactly one INSERT INTO activity in the base.
 * The create went from 1457ms to 894ms, measured against staging from the same
 * colo; the reading afterwards was taken against a freshly reset database, so
 * treat that pair as the honest like-for-like one.
 *
 * PARAMS ARE NOT AVAILABLE HERE, AND THAT IS THE WHOLE RISK. The REST `/query`
 * endpoint accepts multiple statements OR a `params` array, never both — sending
 * both is a hard 400 (`code 7400`). So every value in these statements is INLINE,
 * and `sqlString` is the ONLY way a value may reach one. This is a door any member
 * can reach; one unescaped interpolation is an injection hole. The signature helps
 * as far as a signature can — there is no `params` argument to be tempted by — but
 * the discipline is the caller's, and a caller that builds SQL any other way is
 * the bug.
 *
 * The result is one row-array per statement, in the order given. An INSERT
 * contributes an empty array, so the positions still line up and a caller can read
 * its SELECTs by index. `Rows` is a tuple describing them, exactly as `d1Query`'s
 * `Row` describes its own — an assertion about the shape asked for, not a check.
 */
export async function d1Batch<Rows extends unknown[][]>(
  cfg: D1Rest,
  databaseId: string,
  statements: string[]
): Promise<Rows> {
  const sql = statements.join("\n")
  const result = await cf<{ results: unknown[] }[]>(
    cfg,
    `/d1/database/${databaseId}/query`,
    { sql },
    "POST",
    // The label names the FIRST statement and how many rode with it — the number
    // is the point of the span, since one slow trip carrying four statements and
    // four slow trips are the same total and completely different diagnoses.
    `${sqlLabel(statements[0] ?? "")} +${Math.max(statements.length - 1, 0)}`
  )
  return statements.map((_, i) => result[i]?.results ?? []) as Rows
}

/** Escape a value for inlining into a seed/copy script ('' doubling). Only
 * used where the REST API forbids params (multi-statement scripts). Coerces any
 * non-string runtime value to its string form FIRST (defence-in-depth: route bodies
 * are `as`-cast, so a field typed `string` can arrive as a number/object/array —
 * String() it so the one SQL door never throws a 500, and the escaping still holds). */
export function sqlString(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  return `'${String(value).replaceAll("'", "''")}'`
}

/** Inline any copied cell value into a script (numbers, NULLs, strings). */
export function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL"
  if (typeof value === "number") return String(value)
  return sqlString(value)
}
