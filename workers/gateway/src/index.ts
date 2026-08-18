// Brimba GATEWAY — the one front door. Serves the app's screens (static
// assets), uploaded media from R2, and passes every /api request to the right
// worker behind it. Same address for screens and brains = login cookies just
// work everywhere. This is also where the MCP front desk will live.

import { fail } from "../../../shared/workers/http"

// Headers for an R2 media object served on the app origin. These responses are
// worker-built, so web/public/_headers does NOT apply to them — the security
// headers must live here. `sandbox` + `default-src 'none'` neuters any script even
// if a script-capable file slipped past the upload allowlist (defense-in-depth
// behind parseUploadDataUrl's INLINE_SAFE_UPLOAD check); nosniff stops MIME sniffing.
function mediaHeaders(object: R2ObjectBody): HeadersInit {
  return {
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=31536000, immutable",
    // Say that ranges work. Without it a browser will not seek in a video and
    // will not resume a broken download — it starts the whole object again.
    "Accept-Ranges": "bytes",
  }
}

/** Serve one R2 object, honouring a Range request.
 *
 * A learning attachment can be 25 MB. Without ranges, every seek in a video and
 * every resumed download refetches the whole object from the start — the client
 * waits, and the bytes are paid for again. R2 does the ranged read itself, so
 * this costs nothing extra and simply stops the worker pretending the capability
 * isn't there. (Scaling review, 2026-08-11.) */
async function serveObject(bucket: R2Bucket, key: string, request: Request): Promise<Response> {
  const range = request.headers.get("Range")
  const object = await bucket.get(key, range ? { range: request.headers } : undefined)
  if (!object) return new Response("Not found", { status: 404 })
  const headers = new Headers(mediaHeaders(object))
  if (object.range && "offset" in object.range && range) {
    const offset = object.range.offset ?? 0
    const length = object.range.length ?? object.size - offset
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set("Content-Length", String(length))
    return new Response(object.body, { status: 206, headers })
  }
  return new Response(object.body, { headers })
}

/** The team sections that have a clean TOP-LEVEL url of their own (R20). One
 * entry per `placement: "sidebar"` section in `web/lib/pages.ts` — the check
 * asserts this list and that registry match exactly, in both directions. */
const MODULE_SHELLS = ["learning", "help"]

import { rateLimit, type RateLimiter } from "../../../shared/workers/rate-limit"
import { proxyService, requestIdFrom, REQUEST_ID_HEADER, callService } from "../../../shared/workers/trace"
import { ORIGIN_HEADER } from "../../../shared/workers/activity"

type Env = {
  ASSETS: Fetcher
  AUTH: Fetcher
  TENANCY: Fetcher
  REALTIME: Fetcher
  CONTENT: Fetcher
  DATAOPS: Fetcher
  MCP: Fetcher
  MEDIA: R2Bucket
  LEARNING_MEDIA: R2Bucket
  /** shared secret for auth's /internal/* doors (same value as auth/tenancy/content). */
  INTERNAL_KEY?: string
  /** Surge ceilings — per caller and per team. Optional: absent in a fork that
   * has not enabled them, in `wrangler dev`, and in tests. */
  USER_LIMITER?: RateLimiter
  HEAVY_LIMITER?: RateLimiter
  TEAM_LIMITER?: RateLimiter
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    // THE REQUEST ID, minted once at the one public door and carried on every
    // internal hop from here (shared/workers/trace.ts). Seven workers can handle
    // one click; without this their log lines have nothing in common and an
    // incident is read by guessing which lines belong together. An inbound
    // x-request-id is honoured so a client or proxy can supply its own.
    const req = requestIdFrom(request)
    // The forwarded request carries the id. Built once, and NOT used for the
    // WebSocket route below — a re-constructed Request loses the upgrade, so
    // that one path forwards the original object untouched.
    //
    // `.set()`, NOT `new Headers([...headers, [name, value]])`. The array form
    // COMBINES same-named headers rather than replacing them, so a client that
    // sends its own x-request-id produced "theirs, ours" — which fails the
    // downstream shape check, so every worker minted its own id and correlation
    // broke silently, in exactly the case the inbound-id support exists for.
    const tracedHeaders = new Headers(request.headers)
    tracedHeaders.set(REQUEST_ID_HEADER, req)
    // STRIP THE ORIGIN HEADER AT THE PUBLIC DOOR. It records WHICH SURFACE made a
    // change and is trusted by the audit trail, so it must only ever be set by an
    // internal caller. The MCP front desk and the agent's executor set it on
    // worker-to-worker calls through `forwardToDoor`, which never passes through
    // here — so deleting it on the way in costs those paths nothing and stops a
    // browser stamping its own edit as "job" or "agent". Provenance a caller can
    // forge is not provenance.
    tracedHeaders.delete(ORIGIN_HEADER)
    const traced = new Request(request, { headers: tracedHeaders })

    // THE SURGE CEILING, at the one public door. Everything below is bounded in
    // SIZE (list caps, import ceilings, upload caps, the AI quota); this is the
    // only thing that bounds RATE. It sits above the routing table so a new
    // route cannot be added outside it, and it deliberately covers /api/* only:
    // static assets and /media/* are served from cache and are not a load the
    // app has to survive. (Scaling review, 2026-08-11 — see SCALING.md.)
    if (pathname.startsWith("/api/") || pathname === "/mcp") {
      const limited = await rateLimit(request, env)
      if (limited) return limited
    }

    // Every hop below is GUARDED (shared/workers/trace.ts): a worker that is down,
    // not yet deployed, or mid-rollout used to surface as an unhandled rejection
    // and a bare platform 500 with no body — indistinguishable from a bug in the
    // app. It now returns a clean 503 that says which part is unwell. There is
    // deliberately no timeout here: this path carries the agent's streamed reply,
    // and an abort would truncate a legitimate long answer.
    const p = (b: { fetch(r: Request): Promise<Response> }, worker: string) =>
      proxyService(b, traced, { req, worker, place: `${request.method} ${pathname}` })

    if (pathname.startsWith("/api/auth/")) return p(env.AUTH, "auth")
    if (pathname.startsWith("/api/tenancy/")) return p(env.TENANCY, "tenancy")
    // Content modules (Learning, Help) and data-ops (import + the AI agent).
    if (pathname.startsWith("/api/content/")) return p(env.CONTENT, "content")
    if (pathname.startsWith("/api/data-ops/")) return p(env.DATAOPS, "data-ops")
    // The MCP front desk: token management (session-gated) + the MCP endpoint
    // itself (bearer-token-gated JSON-RPC) — ARCHITECTURE "gateway / MCP".
    if (pathname.startsWith("/api/mcp/")) return p(env.MCP, "mcp")
    if (pathname === "/mcp") return p(env.MCP, "mcp")
    // Live channels (WebSocket upgrade + health) → the realtime switchboard.
    // THE ORIGINAL REQUEST, not the traced copy: re-constructing a Request drops
    // the WebSocket upgrade and the socket never opens. Losing the id on this one
    // path is the right trade — it is a single long-lived connection, not a hop in
    // a chain, so there is nothing to correlate it with anyway.
    if (pathname.startsWith("/api/realtime"))
      return proxyService(env.REALTIME, request, { req, worker: "realtime", place: "ws" })

    // Client error beacon → console (Cloudflare observability, live tails) AND
    // the central error_logs table via auth's internal door, so a crash on a
    // user's phone is queryable + resolvable later, not just visible for a week.
    // Only forwarded once the session is VERIFIED with auth — a cookie header is
    // attacker-controlled, so `Cookie: session=x` used to be enough to write a
    // row into the GLOBAL core database from an anonymous request. Recording is
    // best-effort, so a failed lookup simply drops it (the console line stays).
    // The swappable client seam is web/lib/log.ts; the ruleset is ERROR-HANDLING.md.
    if (pathname === "/api/log/client" && request.method === "POST") {
      const raw = await request.text().catch(() => "")
      console.error("client_error", raw.slice(0, 4000))
      const cookie = request.headers.get("Cookie") ?? ""
      const signedIn =
        cookie.includes("brimba_session=") &&
        (
          await callService(
            env.AUTH,
            "https://internal/api/auth/me",
            { headers: { Cookie: cookie } },
            { req, worker: "gateway", place: "beacon/verify" }
          )
        )?.ok === true
      if (signedIn) {
        let b: { where?: string; message?: string; stack?: string; url?: string } = {}
        try {
          b = JSON.parse(raw)
        } catch {
          /* an unparsable beacon stays console-only */
        }
        if (b.message)
          // callService already swallows a failure — recording must never break
          // the beacon — and now bounds it, so a slow auth cannot hold the
          // browser's beacon open.
          await callService(
            env.AUTH,
            "https://internal/internal/log-error",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-key": env.INTERNAL_KEY ?? "",
              },
              body: JSON.stringify({
                source: "web",
                place: b.where ?? "unknown",
                message: b.message,
                stack: b.stack,
                url: b.url,
                requestId: req,
              }),
            },
            { req, worker: "gateway", place: "beacon/record" }
          )
      }
      return new Response(null, { status: 204 })
    }

    if (pathname.startsWith("/api/")) {
      return fail(404, "not_found", "No such API.")
    }

    // Learning attachments (images + short clips uploaded to a how-to article)
    // live in their own per-team bucket. Same serving shape as /media/* below;
    // just a different bucket, matched first since it's a more specific prefix.
    if (pathname.startsWith("/media/learning/") && request.method === "GET") {
      return serveObject(env.LEARNING_MEDIA, decodeURIComponent(pathname.slice("/media/learning/".length)), request)
    }

    // Uploaded files (profile photos, team logos). URLs carry ?v= for cache
    // busting, so the file itself can be cached hard.
    if (pathname.startsWith("/media/") && request.method === "GET") {
      return serveObject(env.MEDIA, decodeURIComponent(pathname.slice("/media/".length)), request)
    }

    // Deep-link tree: /t/<teamId>/<module>/<id>/… is ONE client-resolved screen.
    // Static export emits a single shell (t.html), so serve it for ANY /t/* depth
    // (the browser keeps the real URL; web/app/t/[[...path]] parses it client-side
    // and re-checks permissions — see SCREEN-ENGINE-PLAN §10). Without this, an
    // unknown /t/* path would hit the 404 page.
    if (pathname.startsWith("/t/")) {
      // Fetch the CLEAN path (/t), not /t.html — Static Assets canonicalizes
      // .html → clean URL with a 307, which would otherwise leak to the client.
      const shell = new URL(request.url)
      shell.pathname = "/t"
      return env.ASSETS.fetch(new Request(shell, request))
    }

    // Top-level module pages (/learning, /help) are ALSO client-resolved deep-link
    // shells (their own clean URLs, active team from context). Serve the module's
    // shell for any sub-path (e.g. /learning/<id>); the bare /learning is a real
    // static file served below.
    //
    // LAW R20 — this list is the SECOND thing a sidebar section needs, in a
    // different worker from the first (its `web/app/<segment>/[[...rest]]` page).
    // Both are invisible from inside the app: the client router never leaves the
    // page, so a section with neither still navigates perfectly and only breaks
    // when someone pastes the URL into a fresh tab. Named, so the check that
    // derives it from TEAM_SECTIONS can find it — and says so when it can't.
    for (const mod of MODULE_SHELLS) {
      if (pathname.startsWith(`/${mod}/`)) {
        const shell = new URL(request.url)
        shell.pathname = `/${mod}`
        return env.ASSETS.fetch(new Request(shell, request))
      }
    }

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web/public/_headers — Workers Static
    // Assets serves matching files BEFORE this Worker runs, so per-asset headers
    // must live in _headers, not here.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
