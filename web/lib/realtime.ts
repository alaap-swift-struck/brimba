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

import * as React from "react"

export type RealtimeEvent = { resource: string; id?: string; op?: string }

/** Open one live socket to `path` (e.g. "team=<id>" / "user=<id>"), reconnecting
 * with backoff. `onReconnect` is called only on a RE-connect after a drop. */
function useLiveChannel(
  query: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): void {
  const handlerRef = React.useRef(onEvent)
  handlerRef.current = onEvent
  const reconnectRef = React.useRef(onReconnect)
  reconnectRef.current = onReconnect

  React.useEffect(() => {
    if (!query || typeof window === "undefined") return

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
}

/** Subscribe to the ACTIVE team's channel (team-scoped data). */
export function useRealtime(
  teamId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): void {
  useLiveChannel(teamId ? `team=${encodeURIComponent(teamId)}` : null, onEvent, onReconnect)
}

/** Subscribe to YOUR OWN identity channel (account events + sign-out), open for
 * every signed-in user, including teamless ones. */
export function useUserRealtime(
  userId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): void {
  useLiveChannel(userId ? `user=${encodeURIComponent(userId)}` : null, onEvent, onReconnect)
}
