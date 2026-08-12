// The ONE pair of response helpers every worker uses — same JSON shape,
// same error contract (shared/types.ts ApiError), defined exactly once.

import type { ApiError } from "../types"
import { REQUEST_ID_HEADER } from "./trace"

export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

export const fail = (
  status: number,
  error: string,
  message: string
): Response => json({ error, message } satisfies ApiError, status)

/** R14 — the ONE paged response. A growing collection's door answers through
 * this and only this, so it cannot half-implement the contract: the rows under
 * their own key, the EXACT server total, hasMore, and the opaque nextCursor the
 * client hands straight back. `extra` carries a door's own additions (help's
 * mineTotal). Drop the seam and the client silently loses page two, so the
 * bounded-lists check asserts every growing door still goes through it. */
export const pagedJson = (
  rowsKey: string,
  page: { rows: unknown[]; total: number; hasMore: boolean; nextCursor: string | null },
  extra: Record<string, unknown> = {}
): Response =>
  json({ [rowsKey]: page.rows, total: page.total, hasMore: page.hasMore, nextCursor: page.nextCursor, ...extra })

/** Forward a request to a gated door over a service binding, carrying the caller's
 * session cookie so the door re-checks permissions + validates AS them. Returns the
 * raw Response — the caller shapes it (the agent → {ok,status,data}; MCP → {ok,text}).
 * This is the ONE cookie-forward seam both act-as-user executors share. */
export async function forwardToDoor(
  fetcher: { fetch(url: string, init?: RequestInit): Promise<Response> },
  opts: {
    path: string
    method: string
    cookie: string
    query?: string
    body?: unknown
    /** The caller's `Idempotency-Key`, when they sent one. A MACHINE caller is
     * the likeliest retrier there is — an agent loop or an integration with
     * automatic retries will re-send a failed POST without a person deciding
     * to — so the key has to survive the hop to the door, or the machine
     * surface is the one place the protection does not reach. */
    idempotencyKey?: string | null
    /** The trace id from the caller's own request (shared/workers/trace.ts). An
     * agent turn or one MCP tools/call fans out to SEVERAL doors; without this,
     * each door's logs are an island and "which of the five steps failed?" cannot
     * be answered from the record. Deliberately NO timeout here: a door on this
     * path does real work of unbounded duration (an import batch), and a bound
     * that cuts a working import off is worse than no bound. */
    requestId?: string | null
  }
): Promise<Response> {
  const init: RequestInit = { method: opts.method, headers: { Cookie: opts.cookie } }
  const headers = init.headers as Record<string, string>
  if (opts.requestId) headers[REQUEST_ID_HEADER] = opts.requestId
  if (opts.method === "POST") {
    headers["Content-Type"] = "application/json"
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey
    init.body = JSON.stringify(opts.body ?? {})
  }
  return fetcher.fetch(`https://internal${opts.path}${opts.query ?? ""}`, init)
}
