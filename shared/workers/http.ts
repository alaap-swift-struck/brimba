// The ONE pair of response helpers every worker uses — same JSON shape,
// same error contract (shared/types.ts ApiError), defined exactly once.

import type { ApiError } from "../types"

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

/** Forward a request to a gated door over a service binding, carrying the caller's
 * session cookie so the door re-checks permissions + validates AS them. Returns the
 * raw Response — the caller shapes it (the agent → {ok,status,data}; MCP → {ok,text}).
 * This is the ONE cookie-forward seam both act-as-user executors share. */
export async function forwardToDoor(
  fetcher: { fetch(url: string, init?: RequestInit): Promise<Response> },
  opts: { path: string; method: string; cookie: string; query?: string; body?: unknown }
): Promise<Response> {
  const init: RequestInit = { method: opts.method, headers: { Cookie: opts.cookie } }
  if (opts.method === "POST") {
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
    init.body = JSON.stringify(opts.body ?? {})
  }
  return fetcher.fetch(`https://internal${opts.path}${opts.query ?? ""}`, init)
}
