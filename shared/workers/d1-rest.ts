// THE data-access door to per-team databases (locked rule: one door).
// Team databases are created at runtime, so workers can't have them as
// pre-wired bindings — instead we talk to Cloudflare's D1 REST API with a
// scoped token. Every module worker that touches team data goes through this
// ONE file — which is also exactly where sharding routing will plug in.

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

async function cf<T>(
  cfg: D1Rest,
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${API}/accounts/${cfg.accountId}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as CfResponse<T>
  if (!res.ok || !data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText
    throw new Error(`Cloudflare D1 API failed: ${msg}`)
  }
  return data.result
}

/** Create a brand-new D1 database; returns its database id. */
export async function d1CreateDatabase(
  cfg: D1Rest,
  name: string
): Promise<string> {
  const result = await cf<{ uuid: string }>(cfg, "/d1/database", { name })
  return result.uuid
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

/** Run a multi-statement script (schema/seeds — no params allowed). */
export async function d1ExecScript(
  cfg: D1Rest,
  databaseId: string,
  script: string
): Promise<void> {
  await cf(cfg, `/d1/database/${databaseId}/query`, { sql: script })
}

/** Escape a value for inlining into a seed script ('' doubling). Only used
 * by seed/schema scripts where the REST API forbids params. */
export function sqlString(value: string | null): string {
  if (value === null) return "NULL"
  return `'${value.replaceAll("'", "''")}'`
}
