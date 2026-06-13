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
  MEDIA: R2Bucket
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith("/api/auth/")) return env.AUTH.fetch(request)
    if (pathname.startsWith("/api/tenancy/")) return env.TENANCY.fetch(request)
    // Live channels (WebSocket upgrade + health) → the realtime switchboard.
    if (pathname.startsWith("/api/realtime")) return env.REALTIME.fetch(request)

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

    // Static screens/assets. Next.js content-hashes everything under
    // /_next/static/ (the filename changes when the file changes), so those are
    // safe to cache FOREVER — tell the browser never to re-check them. Without
    // this the default is `max-age=0, must-revalidate`, which re-validates every
    // file on every load (the repeat-visit slowness). HTML stays revalidated.
    const res = await env.ASSETS.fetch(request)
    if (pathname.startsWith("/_next/static/")) {
      const cached = new Response(res.body, res)
      cached.headers.set("Cache-Control", "public, max-age=31536000, immutable")
      return cached
    }
    return res
  },
} satisfies ExportedHandler<Env>
