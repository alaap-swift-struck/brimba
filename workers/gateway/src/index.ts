// Brimba GATEWAY — the one front door. Serves the app's screens (static
// assets), uploaded media from R2, and passes every /api request to the right
// worker behind it. Same address for screens and brains = login cookies just
// work everywhere. This is also where the MCP front desk will live.

import { fail } from "../../../shared/workers/http"

type Env = {
  ASSETS: Fetcher
  AUTH: Fetcher
  TENANCY: Fetcher
  REALTIME: Fetcher
  CONTENT: Fetcher
  DATAOPS: Fetcher
  MEDIA: R2Bucket
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith("/api/auth/")) return env.AUTH.fetch(request)
    if (pathname.startsWith("/api/tenancy/")) return env.TENANCY.fetch(request)
    // Content modules (Learning, Help) and data-ops (import + the AI agent).
    if (pathname.startsWith("/api/content/")) return env.CONTENT.fetch(request)
    if (pathname.startsWith("/api/data-ops/")) return env.DATAOPS.fetch(request)
    // Live channels (WebSocket upgrade + health) → the realtime switchboard.
    if (pathname.startsWith("/api/realtime")) return env.REALTIME.fetch(request)

    // Client error beacon → this Worker's logs (Cloudflare observability). No
    // data store; just structured logging so a crash on staging/prod is visible
    // without the user reporting it. The swappable seam is web/lib/log.ts; the
    // ruleset is ERROR-HANDLING.md. Body is capped to avoid log-spam abuse.
    if (pathname === "/api/log/client" && request.method === "POST") {
      const raw = await request.text().catch(() => "")
      console.error("client_error", raw.slice(0, 4000))
      return new Response(null, { status: 204 })
    }

    if (pathname.startsWith("/api/")) {
      return fail(404, "not_found", "No such API.")
    }

    // Uploaded files (profile photos, team logos). URLs carry ?v= for cache
    // busting, so the file itself can be cached hard.
    if (pathname.startsWith("/media/") && request.method === "GET") {
      const key = decodeURIComponent(pathname.slice("/media/".length))
      const object = await env.MEDIA.get(key)
      if (!object) return new Response("Not found", { status: 404 })
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
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

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web/public/_headers — Workers Static
    // Assets serves matching files BEFORE this Worker runs, so per-asset headers
    // must live in _headers, not here.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
