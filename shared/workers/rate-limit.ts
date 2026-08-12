// SURGE PROTECTION — the ceiling on how fast one caller may knock.
//
// Everything here was already bounded in SIZE: a list has a hard cap, an import
// has a row ceiling, an upload has a byte cap, the agent has a credit quota. But
// nothing was bounded in RATE. A script — or an honest integration with a retry
// loop and no backoff — could issue requests as fast as the network allowed, and
// every one of them would be served. The agent quota is the closest thing the
// base had to a limit, and it only covers the AI: a role WITHOUT the agent right
// could hammer the ordinary read doors all day and meet nothing at all.
//
// Two ceilings, because they answer different questions:
//
//   PER PERSON — one runaway client must not be able to spend a whole tenant's
//   capacity. Keyed to the signed-in user, or to the caller's IP before they
//   are (a sign-in door has no user yet, and is exactly what gets guessed at).
//
//   PER TENANT — one busy tenant must not be able to spend everyone else's. That
//   ceiling is NOT here: a team-scoped request carries no team in its URL (it is
//   resolved from the session), so the public door cannot key on one without a
//   session lookup of its own on every request. It lives in `teamContext`
//   (shared/workers/gating.ts), the first point the team is actually known.
//
// Cloudflare's own rate limiter does the counting: it is per-colocation rather
// than globally exact, which is the right trade here. This is a surge ceiling,
// not a billing meter — being approximately right immediately beats being
// exactly right after a round-trip to shared state on every single request.

/** The binding, when the environment provides one. Optional on purpose: a
 * fork, a local `wrangler dev`, or a test has no limiter, and the app must run
 * there exactly as it does in production minus the ceiling. */
export type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> }

export type RateLimitEnv = {
  /** Per signed-in user (or per IP before sign-in). */
  USER_LIMITER?: RateLimiter
  /** The tighter ceiling for the EXPENSIVE doors — see HEAVY_PATHS. */
  HEAVY_LIMITER?: RateLimiter
}

/**
 * The doors where one request costs far more than one request.
 *
 * A single ceiling treats a cheap `GET /members` and an AI turn as the same
 * event, which is the wrong shape: 600 list reads a minute is ordinary use,
 * 600 agent turns is a bill. These paths each fan out into model calls,
 * multi-table writes or a full-table read, so they get a ceiling of their own
 * ON TOP of the per-caller one — a caller must pass both.
 *
 * The agent already has a credit quota, and this is not a substitute for it:
 * the quota bounds SPEND over a day, this bounds RATE over a minute. A retry
 * loop can exhaust a day's quota in seconds without something like this.
 */
export const HEAVY_PATHS = [
  "/api/data-ops/agent",
  "/api/data-ops/import",
  "/api/content/learning/upload",
]

/** Is this one of the expensive doors? */
export function isHeavyPath(pathname: string): boolean {
  return HEAVY_PATHS.some((p) => pathname.startsWith(p)) || pathname.endsWith("/export")
}

/** The signed-in user's session, or the caller's address. Never both, and never
 * a value the caller can choose: a header-supplied id would let anyone reset
 * their own counter by changing it. */
export function callerKey(request: Request): string {
  const cookie = request.headers.get("Cookie") ?? ""
  const session = /(?:^|;\s*)brimba_session=([^;]+)/.exec(cookie)?.[1]
  if (session) return `s:${session.slice(0, 64)}`
  // CF-Connecting-IP is set by Cloudflare's own edge and cannot be spoofed by
  // the client (an X-Forwarded-For header can be, which is why it is not used).
  return `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`
}

/** The 429 body. Says what happened and what to do, in the app's own voice —
 * a rate limit a person meets by accident should not read like a security
 * incident. */
export function tooManyRequests(): Response {
  return new Response(
    JSON.stringify({
      error: "too_many_requests",
      message: "That's a lot of requests at once. Give it a few seconds and try again.",
    }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "10" } }
  )
}

/**
 * Ask both ceilings. Returns a 429 to send, or null to carry on.
 *
 * FAILS OPEN, DELIBERATELY. If the limiter binding is missing or its call
 * throws, the request proceeds. A rate limiter exists to keep the app up under
 * load; one that takes the app DOWN when its own dependency wobbles has
 * inverted its purpose. The cost of failing open is a surge that gets through —
 * the cost of failing closed is an outage caused by the safety feature.
 */
export async function rateLimit(request: Request, env: RateLimitEnv): Promise<Response | null> {
  try {
    if (env.USER_LIMITER) {
      const { success } = await env.USER_LIMITER.limit({ key: callerKey(request) })
      if (!success) return tooManyRequests()
    }
    // The expensive doors carry a second, tighter ceiling. A caller must pass
    // BOTH: the ordinary one bounds how often they knock at all, this bounds how
    // often they knock somewhere costly.
    if (env.HEAVY_LIMITER && isHeavyPath(new URL(request.url).pathname)) {
      const { success } = await env.HEAVY_LIMITER.limit({ key: `h:${callerKey(request)}` })
      if (!success) return tooManyRequests()
    }
  } catch (e) {
    console.error("rate limiter unavailable; allowing the request:", e)
  }
  return null
}
