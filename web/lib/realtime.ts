"use client"

// The live channel client. A browser opens up to TWO sockets to the realtime
// switchboard, each calling `onEvent` for every "X changed" ping:
//   • the active TEAM's channel  (useRealtime(teamId)) — team data
//   • your OWN user channel       (useUserRealtime(userId)) — identity data +
//     a forced sign-out, open even before you join a team
// Reconnects with backoff; closes on unmount or when the id changes. The cookie
// rides the handshake, so the server gates it the same way the API does. Pass a
// null id to stay disconnected. `onReconnect` fires after a DROPPED link is
// re-established (not the first connect) so the host can resync what it missed.
//
// Each hook also RETURNS its connection state, because a live layer that works
// perfectly is invisible: a stale screen and a live one are pixel-identical, so
// the first anyone learns the socket dropped is when they act on an old number.
// The shell renders it (ConnectionStatus) — see app-shell.tsx.

import * as React from "react"

import type { ConnectionState } from "@swift-struck/ui/registry/primitives/connection-status/connection-status"

export type { ConnectionState }
export type RealtimeEvent = { resource: string; id?: string; op?: string }

/** Open one live socket to `path` (e.g. "team=<id>" / "user=<id>"), reconnecting
 * with backoff. `onReconnect` is called only on a RE-connect after a drop.
 * Returns the socket's state: "live" while it is open, "reconnecting" while it
 * is retrying, "offline" when the browser has no network (or no channel was
 * asked for). The offline/reconnecting split is re-read on every retry, so it
 * settles within one backoff step (at most 15s) of the network coming back. */
function useLiveChannel(
  query: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): ConnectionState {
  const handlerRef = React.useRef(onEvent)
  handlerRef.current = onEvent
  const reconnectRef = React.useRef(onReconnect)
  reconnectRef.current = onReconnect
  const [state, setState] = React.useState<ConnectionState>("reconnecting")

  React.useEffect(() => {
    if (!query || typeof window === "undefined") return
    // A new channel (first mount, or a team switch) starts unconnected: never
    // inherit the previous socket's "live".
    setState("reconnecting")

    let socket: WebSocket | null = null
    let retry = 0
    let everConnected = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime?${query}`

    const connect = () => {
      if (closed) return
      socket = new WebSocket(url)
      socket.onopen = () => {
        // A successful OPEN after a prior connection = we just recovered a
        // dropped link → let the host resync the rows it's showing.
        if (everConnected) reconnectRef.current?.()
        everConnected = true
        retry = 0
        setState("live")
      }
      socket.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data as string) as RealtimeEvent)
        } catch {
          // ignore a malformed frame
        }
      }
      socket.onclose = () => {
        if (closed) return
        // "Not trying" is the browser being off the network; otherwise we ARE
        // trying, and the honest word is reconnecting.
        setState(navigator.onLine === false ? "offline" : "reconnecting")
        // Backoff: 1s, 2s, 4s … capped at 15s, until we reconnect.
        const delay = Math.min(15000, 1000 * 2 ** retry)
        retry++
        timer = setTimeout(connect, delay)
      }
      socket.onerror = () => socket?.close()
    }
    connect()

    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      socket?.close()
    }
  }, [query])

  // No channel asked for = not connected and not trying, which is exactly what
  // "offline" means. The shell only shows the indicator for a channel it opened.
  return query ? state : "offline"
}

/** Subscribe to the ACTIVE team's channel (team-scoped data). */
export function useRealtime(
  teamId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): ConnectionState {
  return useLiveChannel(teamId ? `team=${encodeURIComponent(teamId)}` : null, onEvent, onReconnect)
}

/** Subscribe to YOUR OWN identity channel (account events + sign-out), open for
 * every signed-in user, including teamless ones. */
export function useUserRealtime(
  userId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): ConnectionState {
  return useLiveChannel(userId ? `user=${encodeURIComponent(userId)}` : null, onEvent, onReconnect)
}
