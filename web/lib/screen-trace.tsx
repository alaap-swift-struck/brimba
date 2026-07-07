"use client"

// The SCREEN-TRACE ENGINE — how the assistant drives real screens while it works.
// The panel emits one trace per step; THIS engine (mounted once in AppShell, so it
// exists on EVERY page) decides how to get the user's screen there:
//
//   • Already inside /t for that team → hand the target to the deep-link host
//     (a second, host-scoped event): it moves with its own soft go() — the same
//     History-API push a click makes, query-param dialogs and all.
//   • Anywhere else (Home / Learning / Help / Settings, or another team's /t) →
//     STASH the highlight and router.push the full URL. Next's client router
//     transitions into /t without a reload (Home's own team links prove it);
//     the deep-link host consumes the stash when it resolves the route and rings
//     the traced control.
//
// Traces for a DIFFERENT team are dropped by the host's own team check — the
// agent only ever acts in the current team (SYSTEM rule), so that's a safety
// net, not a path.
//
// The tool → screen MAP lives in agent-trace.ts (pure, DOM-free — the parity
// test in workers/data-ops imports it to prove every write tool has a screen).

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import type { TraceTarget } from "@/lib/agent-trace"

const TRACE_EVENT = "brimba:agent-trace" // panel → engine
const HOST_EVENT = "brimba:agent-trace-host" // engine → the mounted deep-link host

/** Fired from the panel per traced step. `teamId` is the team the tool ran in. */
export type TraceNav = { teamId: string; target: TraceTarget }

/** Ask the engine to move the user's screen to a traced target. Safe no-op when
 * nothing is mounted (SSR, tests). */
export function emitTrace(nav: TraceNav): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<TraceNav>(TRACE_EVENT, { detail: nav }))
}

/** The deep-link host's subscription (host-scoped event — only the engine emits it). */
export function onHostTrace(handler: (nav: TraceNav) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<TraceNav>).detail)
  window.addEventListener(HOST_EVENT, listener)
  return () => window.removeEventListener(HOST_EVENT, listener)
}

/* ------------------------- cross-page highlight stash ------------------------- */

// When the engine router.pushes into /t, the host mounts AFTER the navigation —
// so the highlight rides this one-slot stash instead of the URL (a ?ring= param
// would linger in history). Taken exactly once, and it expires fast: a stale
// ring from an abandoned navigation must never fire minutes later.
let stash: { nav: TraceNav; at: number } | null = null
const STASH_TTL_MS = 15_000

export function stashTrace(nav: TraceNav): void {
  stash = { nav, at: Date.now() }
}

/** The pending trace for this team, if one was stashed moments ago. */
export function takeTrace(teamId: string): TraceTarget | null {
  if (!stash || stash.nav.teamId !== teamId || Date.now() - stash.at > STASH_TTL_MS) return null
  const t = stash.nav.target
  stash = null
  return t
}

/* --------------------------------- the engine --------------------------------- */

const toUrl = (t: TraceTarget) => {
  const q = t.query ? `?${new URLSearchParams(t.query).toString()}` : ""
  return `${t.path}${q}`
}

/** Mounted ONCE in AppShell. `activeTeamId` = the signed-in person's current team. */
export function useScreenTraceEngine(activeTeamId: string | null | undefined): void {
  const router = useRouter()
  const pathname = usePathname()
  const pathRef = React.useRef(pathname)
  pathRef.current = pathname

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (e: Event) => {
      const nav = (e as CustomEvent<TraceNav>).detail
      // Only trace the team the person is actually working in.
      if (!activeTeamId || nav.teamId !== activeTeamId) return
      if (!nav.target.path.startsWith("/t/")) return
      const onHost = (pathRef.current ?? "").startsWith(`/t/${nav.teamId}`)
      if (onHost) {
        // The host is mounted and showing this team — let it move softly.
        window.dispatchEvent(new CustomEvent<TraceNav>(HOST_EVENT, { detail: nav }))
      } else {
        // Anywhere else: stash the ring, then client-navigate into /t.
        stashTrace(nav)
        router.push(toUrl(nav.target))
      }
    }
    window.addEventListener(TRACE_EVENT, listener)
    return () => window.removeEventListener(TRACE_EVENT, listener)
  }, [activeTeamId, router])
}
