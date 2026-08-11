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
  }
}

/** The team sections that have a clean TOP-LEVEL url of their own (R20). One
 * entry per `placement: "sidebar"` section in `web/lib/pages.ts` — the check
 * asserts this list and that registry match exactly, in both directions. */
const MODULE_SHELLS = ["learning", "help"]

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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith("/api/auth/")) return env.AUTH.fetch(request)
    if (pathname.startsWith("/api/tenancy/")) return env.TENANCY.fetch(request)
    // Content modules (Learning, Help) and data-ops (import + the AI agent).
    if (pathname.startsWith("/api/content/")) return env.CONTENT.fetch(request)
    if (pathname.startsWith("/api/data-ops/")) return env.DATAOPS.fetch(request)
    // The MCP front desk: token management (session-gated) + the MCP endpoint
    // itself (bearer-token-gated JSON-RPC) — ARCHITECTURE "gateway / MCP".
    if (pathname.startsWith("/api/mcp/")) return env.MCP.fetch(request)
    if (pathname === "/mcp") return env.MCP.fetch(request)
    // Live channels (WebSocket upgrade + health) → the realtime switchboard.
    if (pathname.startsWith("/api/realtime")) return env.REALTIME.fetch(request)

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
        (await env.AUTH.fetch("https://internal/api/auth/me", { headers: { Cookie: cookie } })
          .then((r) => r.ok)
          .catch(() => false))
      if (signedIn) {
        let b: { where?: string; message?: string; stack?: string; url?: string } = {}
        try {
          b = JSON.parse(raw)
        } catch {
          /* an unparsable beacon stays console-only */
        }
        if (b.message)
          await env.AUTH.fetch("https://internal/internal/log-error", {
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
            }),
          }).catch(() => null) // recording must never break the beacon
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
      const key = decodeURIComponent(pathname.slice("/media/learning/".length))
      const object = await env.LEARNING_MEDIA.get(key)
      if (!object) return new Response("Not found", { status: 404 })
      return new Response(object.body, { headers: mediaHeaders(object) })
    }

    // Uploaded files (profile photos, team logos). URLs carry ?v= for cache
    // busting, so the file itself can be cached hard.
    if (pathname.startsWith("/media/") && request.method === "GET") {
      const key = decodeURIComponent(pathname.slice("/media/".length))
      const object = await env.MEDIA.get(key)
      if (!object) return new Response("Not found", { status: 404 })
      return new Response(object.body, { headers: mediaHeaders(object) })
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
