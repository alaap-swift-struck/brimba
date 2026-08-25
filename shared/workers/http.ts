// The ONE pair of response helpers every worker uses — same JSON shape,
// same error contract (shared/types.ts ApiError), defined exactly once.

import type { ApiError } from "../types"
import { REQUEST_ID_HEADER, traceError } from "./trace"
import { ORIGIN_HEADER } from "./activity"

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
    /** Which door the ORIGINAL caller came through, so the gated door it forwards
     * to records "mcp" or "agent" rather than "ui". Without it, a change made by
     * an outside tool is indistinguishable in the trail from one a person typed —
     * which is the first question asked when something unexpected has happened. */
    origin?: string | null
  }
): Promise<Response> {
  const init: RequestInit = { method: opts.method, headers: { Cookie: opts.cookie } }
  const headers = init.headers as Record<string, string>
  if (opts.requestId) headers[REQUEST_ID_HEADER] = opts.requestId
  if (opts.origin) headers[ORIGIN_HEADER] = opts.origin
  if (opts.method === "POST") {
    headers["Content-Type"] = "application/json"
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey
    init.body = JSON.stringify(opts.body ?? {})
  }
  // GUARDED — which RULES.md has claimed since R11 was written, while this
  // function contained no try/catch at all. A worker that is down, undeployed or
  // mid-rollout makes the binding THROW, and an unhandled rejection here reaches
  // the caller as a bare platform 500 with no body: indistinguishable from a bug
  // in the app, and useless to the agent, which is expected to explain what
  // happened. It went from 2 call sites to 5 on 2026-08-25 (every import write
  // now routes through it), so the claim became three times more load-bearing
  // while still being untrue. (Architecture review, round 2.)
  //
  // Deliberately still NO timeout: the doors on this path do real work of
  // unbounded duration — an import batch — and a bound that cuts a working
  // import off is worse than none. The guard turns a crash into an answer; it
  // does not decide how long an answer may take.
  try {
    return await fetcher.fetch(`https://internal${opts.path}${opts.query ?? ""}`, init)
  } catch (e) {
    traceError({
      req: opts.requestId ?? undefined,
      worker: "forwardToDoor",
      place: `${opts.method} ${opts.path}`,
      event: "door_unreachable",
      detail: String(e),
    })
    return fail(503, "service_unavailable", "That part of the app isn't answering right now. Nothing was changed — try again in a moment.")
  }
}
