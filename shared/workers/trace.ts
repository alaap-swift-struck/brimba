// FOLLOWING ONE REQUEST ACROSS SEVEN WORKERS — and surviving the one that dies.
//
// A single click can touch the gateway, data-ops, tenancy, auth and realtime. Until
// this seam existed each of those wrote its own console line with nothing tying them
// together, so "the import failed for one customer at 14:02" meant reading five
// unrelated logs and guessing which lines belonged to each other. A request id fixes
// that: minted once at the public door, carried on every internal hop, printed on
// every line and stamped on every recorded error.
//
// The second job is the one the architecture review actually failed on. A worker
// calling another worker used to do this:
//
//     const res = await env.AUTH.fetch("https://auth/api/auth/me", …)
//     if (!res.ok) return null
//
// which cannot tell "auth says this person is not signed in" from "auth did not
// answer at all". Both became a 401, so an auth outage logged every user out
// instead of saying the truth — and a slow auth held the request open with no
// bound, because a service binding has no default timeout.
//
// So every cross-service call goes through `callService`, which:
//   • bounds the wait (a hung dependency fails fast instead of hanging a request)
//   • never throws (the caller decides what a missing dependency means)
//   • returns NULL for "did not answer", distinct from a Response that says no
//   • carries the request id, so both sides' logs line up
//
// ONE DELIBERATE EXCLUSION: the gateway's proxy fetches. Those forward a whole
// user-facing response, including the agent's streamed chat, and a timeout there
// would cut a long answer off mid-sentence. They get the guard (a dead worker
// returns a clean 503) and no timeout. A bound that breaks a working feature is
// not a bound, it is a bug — see `proxyService`.

import { ulid } from "./id"

/** The header the id travels on. `x-request-id` is the de-facto standard, so an
 * inbound one from a load balancer or a client is honoured rather than replaced. */
export const REQUEST_ID_HEADER = "x-request-id"

/** How long a worker waits for another worker before giving up. Generous for an
 * internal hop that should take single-digit milliseconds, short enough that a
 * hung dependency cannot pin a request open until the platform kills it. */
export const SERVICE_TIMEOUT_MS = 5_000

/** The id for this request: whatever came in, or a fresh one. Trimmed and capped
 * because it is attacker-supplied at the public door and ends up in log lines. */
export function requestIdFrom(request: { headers: { get(name: string): string | null } }): string {
  const inbound = request.headers.get(REQUEST_ID_HEADER)?.trim()
  if (inbound && /^[A-Za-z0-9._-]{8,64}$/.test(inbound)) return inbound
  return ulid()
}

/** Merge the request id into an outbound call's headers. */
export function withTrace(headers: Record<string, string>, id?: string): Record<string, string> {
  return id ? { ...headers, [REQUEST_ID_HEADER]: id } : headers
}

/** One structured log line. JSON so Cloudflare's observability can filter by
 * `req` and show every worker's view of the same request together — the whole
 * point of minting the id. Plain `console.error("thing failed:", e)` cannot be
 * filtered by anything. */
export function traceError(fields: {
  req?: string
  worker: string
  place: string
  event: string
  detail?: unknown
}): void {
  const { detail, ...rest } = fields
  const message = detail instanceof Error ? detail.message : detail === undefined ? undefined : String(detail)
  console.error(JSON.stringify({ level: "error", ...rest, message: message?.slice(0, 500) }))
}

/** The minimum of a service binding this seam needs — structural, so `shared/`
 * still compiles in the web workspace, which has no Workers types. */
type ServiceBinding = { fetch(url: string, init?: RequestInit): Promise<Response> }

/**
 * Call another worker. Bounded, guarded, correlated.
 *
 * Returns the Response when the dependency answered — INCLUDING a 4xx/5xx, which
 * is an answer and belongs to the caller to interpret. Returns **null** only when
 * it did not answer at all: timed out, or the binding threw.
 *
 * That distinction is the whole point. `null` must never be folded into the same
 * branch as "the dependency said no", because the two mean opposite things to the
 * person waiting: "you are not allowed" versus "we are broken, try again".
 */
export async function callService(
  binding: ServiceBinding,
  url: string,
  init: RequestInit,
  opts: { req?: string; worker: string; place: string; timeoutMs?: number }
): Promise<Response | null> {
  const headers = withTrace((init.headers as Record<string, string>) ?? {}, opts.req)
  try {
    return await binding.fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? SERVICE_TIMEOUT_MS),
    })
  } catch (e) {
    // A timeout arrives here as an AbortError; a dead worker as a TypeError. The
    // caller only needs "no answer", but the log keeps which one it was.
    traceError({
      req: opts.req,
      worker: opts.worker,
      place: opts.place,
      event: "service_unreachable",
      detail: e,
    })
    return null
  }
}

/**
 * The gateway's variant: forward a whole Request to a worker and hand its response
 * straight back, with NO timeout.
 *
 * The timeout is deliberately absent. This path carries the agent's streamed chat
 * and any other long response, and an abort signal would truncate a legitimate
 * answer mid-sentence — a bound that breaks a working feature is worse than no
 * bound. What it does add is the guard: a worker that is down or not deployed used
 * to surface as an unhandled rejection and a bare platform 500 with no body, which
 * is indistinguishable from a bug in the app.
 */
export async function proxyService(
  binding: { fetch(request: Request): Promise<Response> },
  request: Request,
  opts: { req?: string; worker: string; place: string }
): Promise<Response> {
  try {
    return await binding.fetch(request)
  } catch (e) {
    traceError({ req: opts.req, worker: opts.worker, place: opts.place, event: "downstream_unreachable", detail: e })
    return new Response(
      JSON.stringify({
        error: "service_unavailable",
        message: "That part of the app isn't responding right now. Try again in a moment.",
      }),
      { status: 503, headers: { "Content-Type": "application/json", [REQUEST_ID_HEADER]: opts.req ?? "" } }
    )
  }
}

/** Server-Timing on a response, so a duration EXISTS.
 *
 * Before this, nothing in the base was instrumented: zero `Server-Timing`, zero
 * `performance.now`, zero logged durations across 222 files. The one grep hit for
 * "duration" was the word *latency* in a comment. So every performance question
 * — is this slow, did that change help, what does a cold start cost — was
 * answerable only by argument, and a review could report shape and nothing else.
 *
 * It writes the number in two places on purpose. `Server-Timing` puts it in the
 * browser's own network panel, where anyone on the team can read it without
 * tooling; the log line puts it beside the request id, where it can be correlated
 * across the seven workers one click can touch.
 *
 * SKIPS 101. A WebSocket upgrade travels through the same handler, and
 * `new Response(res.body, res)` on a 101 THROWS — a careless version of this
 * wrapper switches off the live layer for everyone. The one detail worth more
 * than the rest of the function. */
export async function timed(
  req: string,
  worker: string,
  place: string,
  run: () => Promise<Response>
): Promise<Response> {
  const started = Date.now()
  const res = await run()
  const ms = Date.now() - started
  // 101 is an upgrade, not a payload — rebuilding it drops the socket.
  if (res.status === 101) return res
  const out = new Response(res.body, res)
  out.headers.append("Server-Timing", `${worker};dur=${ms}`)
  out.headers.set(REQUEST_ID_HEADER, req)
  if (ms >= SLOW_MS) traceError({ req, worker, place, event: "slow", detail: `${ms}ms` })
  return out
}

/** The line above which a request is worth a log entry on its own. Not an alarm —
 * a budget, so "slow" is a number someone chose rather than a feeling. */
export const SLOW_MS = 1_000
