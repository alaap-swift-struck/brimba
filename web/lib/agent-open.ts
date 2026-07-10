"use client"

// The assistant panel's OPEN state, hoisted to a module-level store so it SURVIVES
// navigation. The panel itself is mounted once at the root layout (agent-host.tsx),
// not per-route — so the assistant's own screen-trace (which moves the screen mid-run)
// and any manual navigation slide the page UNDERNEATH the panel instead of tearing it
// down. Before this, every route mounted its own AppShell + its own `agentOpen`, so any
// navigation closed the panel and dropped the live chat + the step pills. A tiny
// external store (no context, no provider) is all it takes: the launcher writes it, the
// root host reads it.

import { useSyncExternalStore } from "react"

let open = false
const subscribers = new Set<() => void>()

/** Open (or close) the assistant from anywhere — the launcher, a close, Esc. */
export function setAgentOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const fn of subscribers) fn()
}

/** Open the assistant — the launcher button's click. */
export function openAgent(): void {
  setAgentOpen(true)
}

/** Subscribe to the open state (the root-mounted host). SSR snapshot is always
 * false — the panel is client-only, so the server never renders it open. */
export function useAgentOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    () => open,
    () => false
  )
}
