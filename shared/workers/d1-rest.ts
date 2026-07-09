// THE data-access door to per-team databases (locked rule: one door).
// Team databases are created at runtime, so workers can't have them as
// pre-wired bindings — instead we talk to Cloudflare's D1 REST API with a
// scoped token. Every module worker that touches team data goes through this
// ONE file — which is also where sharding routing plugs in (see
// workers/tenancy/src/lib/sharding.ts for the routing + mover machinery).

export type D1Rest = {
  accountId: string
  apiToken: string
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
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST"
): Promise<T> {
  let lastError: Error = new Error("unreachable")
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt))
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
      continue
    }
    if (res.status >= 500) {
      lastError = new Error(`Cloudflare D1 API ${res.status} on ${path}`)
      continue
    }
    const data = (await res.json()) as CfResponse<T>
    if (!res.ok || !data.success) {
      // 4xx = our request is wrong — retrying won't help, fail loudly.
      const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText
      throw new Error(`Cloudflare D1 API failed: ${msg}`)
    }
    return data.result
  }
  throw lastError
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
    { sql, params }
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
  await cf(cfg, `/d1/database/${databaseId}/query`, { sql: script })
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
