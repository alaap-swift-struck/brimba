"use client"

// The SCREEN-TRACE ENGINE — how the assistant drives real screens while it works.
// The panel emits one trace per step; THIS engine (mounted once at the root) hands the
// target to the deep-link host, which moves the screen with its own soft go() (the same
// History-API move a click makes, NO reload) — from ANY screen. The whole post-auth app
// is one client-resolved shell now (Home / Settings / Invitations / team all resolve in
// the one deep-link host), so crossing into /t no longer reloads — the engine can always
// drive, never just narrate.
//
// Traces for a DIFFERENT team are dropped by the host's own team check — the agent only
// ever acts in the current team (SYSTEM rule), so that's a safety net, not a path.
//
// The tool → screen MAP lives in agent-trace.ts (pure, DOM-free — the parity
// test in workers/data-ops imports it to prove every write tool has a screen).

import * as React from "react"

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

/* --------------------------------- the engine --------------------------------- */

/** Mounted ONCE at the root (agent-host.tsx). `activeTeamId` = the current team. Hands
 * every trace for the current team to the deep-link host, which moves the screen SOFTLY
 * (History API, no reload) from wherever the user is — the whole app is one shell, so a
 * move into /t never reloads. If no host is mounted (a pre-auth screen) the event has no
 * listener and is a harmless no-op. */
export function useScreenTraceEngine(activeTeamId: string | null | undefined): void {
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const listener = (e: Event) => {
      const nav = (e as CustomEvent<TraceNav>).detail
      // Only trace the team the person is actually working in.
      if (!activeTeamId || nav.teamId !== activeTeamId) return
      if (!nav.target.path.startsWith("/t/")) return
      window.dispatchEvent(new CustomEvent<TraceNav>(HOST_EVENT, { detail: nav }))
    }
    window.addEventListener(TRACE_EVENT, listener)
    return () => window.removeEventListener(TRACE_EVENT, listener)
  }, [activeTeamId])
}
