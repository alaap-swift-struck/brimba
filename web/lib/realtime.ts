"use client"

// The live channel client: opens ONE WebSocket to the active team's switchboard
// (the realtime worker's TeamChannel Durable Object) and calls `onEvent` for
// each "X changed" ping. Reconnects with backoff; closes on unmount or team
// change. The cookie rides along on the handshake, so the server gates it the
// same way the API does. Pass teamId=null to stay disconnected.

import * as React from "react"

export type RealtimeEvent = { resource: string }

export function useRealtime(
  teamId: string | null,
  onEvent: (event: RealtimeEvent) => void
): void {
  // Keep the handler in a ref so re-renders don't churn the socket.
  const handlerRef = React.useRef(onEvent)
  handlerRef.current = onEvent

  React.useEffect(() => {
    if (!teamId || typeof window === "undefined") return

    let socket: WebSocket | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime?team=${encodeURIComponent(teamId)}`

    const connect = () => {
      if (closed) return
      socket = new WebSocket(url)
      socket.onopen = () => {
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
  }, [teamId])
}
