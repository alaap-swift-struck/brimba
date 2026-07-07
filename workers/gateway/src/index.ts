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
    // Only forwarded when the browser carries a session cookie — an anonymous
    // drive-by can't fill the table (it still lands in the console line). The
    // swappable client seam is web/lib/log.ts; the ruleset is ERROR-HANDLING.md.
    if (pathname === "/api/log/client" && request.method === "POST") {
      const raw = await request.text().catch(() => "")
      console.error("client_error", raw.slice(0, 4000))
      if (request.headers.get("Cookie")?.includes("session")) {
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
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
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

    // Top-level module pages (/learning, /help) are ALSO client-resolved deep-link
    // shells (their own clean URLs, active team from context). Serve the module's
    // shell for any sub-path (e.g. /learning/<id>); the bare /learning is a real
    // static file served below.
    for (const mod of ["learning", "help"]) {
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
