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
import { recordWorkerError } from "../../../shared/workers/error-log"
import { opsDatabase } from "../../../shared/workers/ops-db"
import { MAX_SHARDS, shardChannel, shardFor } from "../../../shared/workers/realtime"
import { callService, REQUEST_ID_HEADER } from "../../../shared/workers/trace"

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

// HOW MANY SHARDS a team's channel is split into, memoised per isolate.
//
// This is read on EVERY publish, and a publish happens on every write in the
// app — so a database round-trip here would tax the whole product to serve the
// handful of tenants big enough to be split. The count changes at most once a
// night (the tenancy cron recomputes it), so a short memo is exact in practice
// and cheap always. A cold isolate pays one read; the next 60 seconds are free.
const shardMemo = new Map<string, { n: number; until: number }>()
const SHARD_MEMO_MS = 60_000

async function shardsFor(env: Env, teamId: string): Promise<number> {
  const now = Date.now()
  const hit = shardMemo.get(teamId)
  if (hit && hit.until > now) return hit.n
  let n = 1
  try {
    const row = await env.DB.prepare("SELECT shard_count FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ shard_count: number }>()
    // Clamp: a nonsense stored value must not silently disable the live layer
    // (n < 1 would fan to nothing) or fan out unboundedly.
    n = Math.min(Math.max(Number(row?.shard_count) || 1, 1), MAX_SHARDS)
  } catch (e) {
    // A read hiccup falls back to ONE shard — the bare channel name, which is
    // where an unsharded team's sockets are. Degrading to "the live layer still
    // works for most people" beats degrading to "nobody gets anything".
    console.error("shard count lookup failed; using 1:", e)
  }
  shardMemo.set(teamId, { n, until: now + SHARD_MEMO_MS })
  return n
}

/** Ask the auth worker (one session system, one master) who this is.
 *
 * Bounded and guarded like the shared gating seam's twin. The difference is what
 * a no-answer means HERE: this is a WebSocket connect, not an API call, so there
 * is no 503 to return usefully — the socket is simply refused and the client's
 * existing reconnect loop tries again. Already-open sockets are untouched, so an
 * auth wobble costs new connections, not live ones. */
async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  const res = await callService(
    env.AUTH,
    "https://auth/api/auth/me",
    { headers: { Cookie: request.headers.get("Cookie") ?? "" } },
    { req: request.headers.get(REQUEST_ID_HEADER) ?? undefined, worker: "realtime", place: "whoAmI" }
  )
  if (!res || !res.ok) return null
  return ((await res.json()) as { user: SessionUser }).user
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // THE CENTRAL CATCH. realtime has held a `DB` binding since it was written
    // and recorded nothing into it — a crash in the switchboard surfaced as a
    // bare platform 500 and left no row, so an outage in the live layer was
    // invisible afterwards. `error-seam.test.ts` did not see this because its
    // worker list was hardcoded to four names. (Reviews of 2026-08-25.)
    try {
      return await route(request, env)
    } catch (e) {
      await recordWorkerError(opsDatabase(env), "realtime", `${request.method} ${new URL(request.url).pathname}`, e, request)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env): Promise<Response> {
  {
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

      const body = JSON.stringify(event)
      // A TEAM channel may be split across several objects; a user channel never
      // is (one person's devices are a handful). The caller says `team:<id>` and
      // knows nothing about shards — this is the ONE place that expands it.
      const teamId = channel.startsWith("team:") ? channel.slice("team:".length) : null
      const shards = teamId ? await shardsFor(env, teamId) : 1
      // In parallel: the fan-out is the thing being optimised, so doing it
      // serially would hand back the latency the split just bought. Bounded by
      // MAX_SHARDS, and each send is already best-effort inside broadcast().
      await Promise.all(
        Array.from({ length: shards }, (_, i) =>
          env.CHANNELS.getByName(shardChannel(channel, i)).broadcast(body)
        )
      )
      return json({ ok: true })
    }

    if (url.pathname === "/api/realtime/health") return json({ ok: true })

    // Public: a browser joins a live channel (WebSocket only). Two scopes:
    //   ?user=<id>  — your OWN identity channel (account events + sign-out),
    //                 open for every signed-in user, even before joining a team.
    //   ?team=<id>  — a team's channel, gated by active membership of THAT team.
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade") !== "websocket")
        return fail(426, "upgrade_required", "This endpoint is WebSocket-only.")

      // Signed-in gate first (same session system as the API — one master).
      const user = await whoAmI(request, env)
      if (!user) return fail(401, "signed_out", "Not signed in.")

      const userId = url.searchParams.get("user")
      if (userId) {
        // Identity channel: you may only join your OWN.
        if (userId !== user.id)
          return fail(403, "forbidden", "That isn't your channel.")
        return env.CHANNELS.getByName(`user:${userId}`).fetch(request)
      }

      const teamId = url.searchParams.get("team")
      if (teamId) {
        // Team channel: must be an active member of THIS team.
        if (!(await isActiveMember(env.DB, user.id, teamId)))
          return fail(403, "not_member", "You're not a member of this team.")
        // Which shard is decided HERE, from the session's user id — the client
        // asks for a team and gets one, exactly as before. All of a person's
        // devices land together, and a reconnect returns to the same object.
        const shard = shardFor(user.id, await shardsFor(env, teamId))
        return env.CHANNELS.getByName(shardChannel(`team:${teamId}`, shard)).fetch(request)
      }

      return fail(400, "invalid_input", "team or user is required.")
    }

    return fail(404, "not_found", "No such realtime action.")
  }
}
