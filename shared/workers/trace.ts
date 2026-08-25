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
// A SIBLING PAIR, not a layering mistake: error-log.ts takes `traceError` from
// here and this file takes the outbound recorder from there. Both are function
// declarations called at request time, never at module-evaluation time, so the
// cycle resolves cleanly in every bundler the base uses. The alternative was a
// third module holding one throttle, which is more file than the fault is worth.
import { recordOutbound, type OutboundRecorder } from "./error-log"

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
 *
 * `opts.record` is OPTIONAL and is where the 503 gets RECORDED. Without it a
 * downstream outage is invisible the moment the log buffer rolls: the person got
 * a 503, the console line died within the day, and the one store with history and
 * a resolve workflow never heard about it.
 *
 * A CALLBACK, NOT A DATABASE HANDLE. The only caller of this function is the
 * gateway, and the gateway binds no database on purpose (it is the busiest and
 * only public worker; it records through auth's `/internal/log-error` door
 * instead). A `CoreDb` parameter here would have had no caller able to supply it
 * — a seam with a plausible shape and nothing on the other end. So this file
 * stays ignorant of HOW anyone records and the caller passes its own channel.
 */
export async function proxyService(
  binding: { fetch(request: Request): Promise<Response> },
  request: Request,
  opts: { req?: string; worker: string; place: string; record?: OutboundRecorder }
): Promise<Response> {
  try {
    return await binding.fetch(request)
  } catch (e) {
    traceError({ req: opts.req, worker: opts.worker, place: opts.place, event: "downstream_unreachable", detail: e })
    // THROTTLED, through the same one-row-per-minute guard the data door uses. A
    // worker that is down fails every request that reaches it, so an unthrottled
    // row per 503 would make the error store the second casualty of the outage —
    // and the ten-thousandth row says nothing the first one did not. The ones held
    // back are counted and reported on the next row that gets through.
    await recordOutbound(opts.record, opts.worker, opts.place, "upstream", e)
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
 * than the rest of the function.
 *
 * `ctx` is OPTIONAL and exists for the SLOW line only. A warning that names the
 * route and the milliseconds cannot be reproduced: the same route is instant for
 * one customer and slow for another, and it is almost always the number of ROWS
 * that explains which. Optional and trailing because the busiest caller — the
 * gateway — is a proxy that never resolves a team, so requiring it would force
 * every call site to invent a value it does not have. */
export async function timed(
  req: string,
  worker: string,
  place: string,
  run: () => Promise<Response>,
  ctx?: {
    /** the tenant this request was for, when the caller has a guard in hand */
    team?: string
    /** how many rows the work touched — the usual explanation for the duration */
    rows?: number
  }
): Promise<Response> {
  const started = Date.now()
  const res = await run()
  const ms = Date.now() - started
  // 101 is an upgrade, not a payload — rebuilding it drops the socket.
  if (res.status === 101) return res
  const out = new Response(res.body, res)
  out.headers.append("Server-Timing", `${worker};dur=${ms}`)
  out.headers.set(REQUEST_ID_HEADER, req)
  // NOT through traceError: that stamps level "error", and a slow-but-successful
  // request is not an error. Left as it was, every alerting rule error_log builds
  // would fire on ordinary large imports, and the first thing anyone does with a
  // noisy alert is stop reading it. (speed round 3, 2026-08-25.)
  if (ms >= SLOW_MS)
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "slow",
        req,
        worker,
        place,
        ms,
        // A TEAM ID IN A SHARED LOG STORE IS TENANT METADATA — a deliberate,
        // named trade. It tells anyone who can read the logs which customer was
        // affected, and it is the only thing that makes a slow request
        // reproducible ("this route is slow" is not a bug report; "this route is
        // slow for that team, at that row count" is). Omitted entirely when the
        // caller has none, so the line never gains an empty key.
        ...(ctx?.team ? { team: ctx.team } : {}),
        ...(ctx?.rows === undefined ? {} : { rows: ctx.rows }),
      })
    )
  return out
}

/** The line above which a request is worth a log entry on its own. Not an alarm —
 * a budget, so "slow" is a number someone chose rather than a feeling. */
export const SLOW_MS = 1_000

/**
 * WHERE A SLOW REQUEST SPENT ITS TIME — the number `timed()` cannot give you.
 *
 * `timed` says a request took 900ms. It cannot say whether that was one hop or
 * five, nor which. A gated team read is made of hops of three very different
 * costs: a service binding to auth (same-colo RPC), a native `env.DB` read
 * (in-colo D1 binding), and a call through the D1 REST door — a real HTTPS
 * request to api.cloudflare.com. Until this existed, the three were
 * indistinguishable from outside, so "the app is slow" could be argued about but
 * not attributed.
 *
 * ONE LINE PER HOP, above a budget. Below `HOP_SLOW_MS` a hop is doing what it is
 * supposed to and a line about it would be noise on every request in the system —
 * the data door alone is on every team read. Above it, the line names the hop and
 * its cost beside the request id, so the seven workers one click touches can be
 * reassembled in the order they actually ran.
 *
 * NOT `traceError`: a slow hop that succeeded is not an error, and stamping it
 * as one is how alerting rules get switched off (same reasoning as `timed`).
 */
/**
 * 150ms, and the number is argued rather than felt. Every hop in this system does
 * work measured in fractions of a millisecond — a D1 statement's own
 * `sql_duration_ms` is 0.1–0.3ms whichever database it runs against — so anything
 * above about a tenth of a second is transport, not computation. 150 is low
 * enough to catch a cross-region round trip (measured 2026-08-25: 245ms
 * Amsterdam→Osaka, 207ms Singapore→Amsterdam) and high enough that a co-located
 * deployment says nothing at all. A line that disappears when the fault is fixed
 * is the right kind of line; a threshold set above the fault (250 would have
 * hidden both numbers above) is how a measurement gets built and still misses.
 */
export const HOP_SLOW_MS = 150

export function traceHop(fields: {
  req?: string
  /** which seam made the call — "d1-rest", "gating", … */
  worker: string
  /** WHAT was called, never WITH WHAT. A verb and a table ("SELECT role_permissions"),
   * never SQL text and never a bound value: this reaches a log line. */
  op: string
  ms: number
  /** how many attempts the hop actually took, when it retried */
  tries?: number
  /** WHICH call of this request this was, and what the seam has cost SO FAR.
   * The pair is the diagnosis a single duration cannot give: `nth:4 soFarMs:830`
   * says a request made four round trips and they are the request, where one
   * 830ms line would have read as a slow query. Only the data door fills these
   * in — it is the only seam a request calls repeatedly. */
  nth?: number
  soFarMs?: number
}): void {
  if (fields.ms < HOP_SLOW_MS) return
  console.warn(JSON.stringify({ level: "warn", event: "hop", ...fields }))
}
