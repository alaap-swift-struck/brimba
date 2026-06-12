// Brimba GATEWAY — the one front door. Serves the app's screens (static
// assets) and passes every /api request to the right worker behind it.
// Same address for screens and brains = login cookies just work everywhere.
// This is also where the MCP front desk will live (one catalog of actions).

type Env = {
  ASSETS: Fetcher
  AUTH: Fetcher
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith("/api/auth/")) return env.AUTH.fetch(request)

    if (pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "No such API." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
