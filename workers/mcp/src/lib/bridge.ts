// The token → session BRIDGE. A verified token is exchanged (via auth's
// INTERNAL_KEY-gated /internal/mcp-session) for a short-lived session PINNED to
// the token's team — so every tool call flows through the SAME gated doors a
// browser uses: live membership + role re-checked per request, input validated
// at the boundary, activity + audit written identically. Minted cookies are
// cached per isolate (~10 min) to avoid a session INSERT per call; the token
// itself is re-verified on EVERY request, so revocation bites immediately.

import { GuardError } from "../../../../shared/workers/gating"
import type { Env } from "../env"
import type { McpTokenRow } from "./tokens"

const SESSION_COOKIE = "brimba_session" // auth's cookie name (sessions.ts)
const CACHE_MS = 10 * 60 * 1000 // well inside the 60-min pinned-session TTL

const cache = new Map<string, { cookie: string; expires: number }>()

/** The Cookie header for acting AS this token's owner IN the token's team. */
export async function sessionCookieFor(env: Env, token: McpTokenRow): Promise<string> {
  const hit = cache.get(token.id)
  if (hit && hit.expires > Date.now()) return hit.cookie

  const res = await env.AUTH.fetch("https://internal/internal/mcp-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": env.INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({ userId: token.user_id, teamId: token.team_id }),
  })
  if (!res.ok) {
    // auth's clean reason (e.g. no longer an active member) passes straight out.
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new GuardError(
      res.status === 403 ? 403 : 502,
      "bridge_failed",
      body?.message ?? "Couldn't act for this token right now."
    )
  }
  const { token: session } = (await res.json()) as { token: string }
  const cookie = `${SESSION_COOKIE}=${session}`
  cache.set(token.id, { cookie, expires: Date.now() + CACHE_MS })
  return cookie
}

/** Forget a token's cached session (used right after a revoke). */
export function dropCachedSession(tokenId: string): void {
  cache.delete(tokenId)
}
