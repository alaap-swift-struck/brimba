// Brimba REALTIME worker — the live "switchboard".
//
// ONE Durable Object per team (TeamChannel, addressed by name "team:<id>") holds
// that team's open WebSocket connections and fans out tiny "X changed" pings.
// Connections are accepted with the Hibernation API, so an idle team's object is
// evicted from memory while its sockets stay open — idle teams cost ~nothing.
// It stores NO application data; the databases remain the single source of truth.
//
//   GET  /api/realtime?team=<id>   (WebSocket upgrade) -> join a team's channel
//   POST /publish  { channel, event }                  -> broadcast (service-binding only)
//   GET  /api/realtime/health
//
// Reusable as-is by any app built on the Brimba base — it knows nothing about
// what "members" or "member_roles" mean; it just relays opaque resource tags.

import { DurableObject } from "cloudflare:workers"

import type { SessionUser } from "../../../shared/types"
import { fail, json } from "../../../shared/workers/http"
import { isActiveMember } from "../../../shared/workers/membership"

export type Env = {
  /** The per-team live channels (one Durable Object instance per team). */
  CHANNELS: DurableObjectNamespace<TeamChannel>
  /** The auth worker — answers "who is opening this socket?". */
  AUTH: Fetcher
  /** Global core DB — read only to confirm the connector is a team member. */
  DB: D1Database
}

/** One team's live channel: holds its members' sockets, relays change pings. */
export class TeamChannel extends DurableObject<Env> {
  /** A browser joins. Accept the socket via the Hibernation API so the runtime
   *  keeps it (even after this object sleeps) and we don't pay while idle. */
  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Fan a tiny message out to everyone currently connected to this team. */
  broadcast(message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message)
      } catch {
        // Dead socket — the runtime drops it on close; nothing to do here.
      }
    }
  }

  // Clients only listen; inbound messages are ignored. These handlers keep the
  // object hibernation-eligible and tidy up on disconnect.
  async webSocketMessage(): Promise<void> {}
  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // already closing
    }
  }
  async webSocketError(): Promise<void> {}
}

/** Ask the auth worker (one session system, one master) who this is. */
async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  const res = await env.AUTH.fetch("https://auth/api/auth/me", {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
  if (!res.ok) return null
  return ((await res.json()) as { user: SessionUser }).user
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Internal only (reached via service binding, never the public gateway):
    // a worker tells a team's channel something changed.
    if (url.pathname === "/publish" && request.method === "POST") {
      const { channel, event } = (await request.json().catch(() => ({}))) as {
        channel?: string
        event?: unknown
      }
      if (!channel || event === undefined)
        return fail(400, "invalid_input", "channel and event are required.")
      await env.CHANNELS.getByName(channel).broadcast(JSON.stringify(event))
      return json({ ok: true })
    }

    if (url.pathname === "/api/realtime/health") return json({ ok: true })

    // Public: a browser joins its team's live channel (WebSocket only).
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade") !== "websocket")
        return fail(426, "upgrade_required", "This endpoint is WebSocket-only.")
      const teamId = url.searchParams.get("team")
      if (!teamId) return fail(400, "invalid_input", "team is required.")

      // SAME gate as the API: signed in + an active member of THIS team.
      const user = await whoAmI(request, env)
      if (!user) return fail(401, "signed_out", "Not signed in.")
      if (!(await isActiveMember(env.DB, user.id, teamId)))
        return fail(403, "not_member", "You're not a member of this team.")

      return env.CHANNELS.getByName(`team:${teamId}`).fetch(request)
    }

    return fail(404, "not_found", "No such realtime action.")
  },
} satisfies ExportedHandler<Env>
