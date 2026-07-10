"use client"

// The assistant panel's OPEN state. Two jobs:
//  1. Hoisted to a module-level store so it survives SOFT navigation — the panel is
//     mounted once at the root layout (agent-host.tsx), not per-route.
//  2. Mirrored to sessionStorage so it also survives a FULL PAGE RELOAD. The base is a
//     static export: crossing from a top-level route INTO the /t shell is a hard reload
//     (EDGE-CASES §1), which wipes all in-memory React state. Without this mirror the
//     panel vanished on that reload (the "panel reset" the owner hit); with it, the root
//     host reopens on load and useAgentChat resumes the saved thread, so the conversation
//     survives the reload even though the live stream was cut. sessionStorage (not local)
//     = same-tab only, and it clears when the person explicitly closes the panel.

import { useSyncExternalStore } from "react"

const KEY = "brimba:agent:open"

function readPersisted(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

function persist(next: boolean): void {
  try {
    if (next) sessionStorage.setItem(KEY, "1")
    else sessionStorage.removeItem(KEY)
  } catch {
    /* private mode / storage blocked — the module var still carries it this session */
  }
}

let open = readPersisted()
const subscribers = new Set<() => void>()

/** Open (or close) the assistant from anywhere — the launcher, a close, Esc. Persisted
 * so a reload (e.g. crossing into /t) reopens it instead of dropping the conversation. */
export function setAgentOpen(next: boolean): void {
  if (open === next) return
  open = next
  persist(next)
  for (const fn of subscribers) fn()
}

/** Open the assistant — the launcher button's click. */
export function openAgent(): void {
  setAgentOpen(true)
}

/** Subscribe to the open state (the root-mounted host). SSR snapshot is always false —
 * the panel is client-only, so the server never renders it open (client hydration then
 * reflects the persisted value). */
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
