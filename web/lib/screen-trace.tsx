"use client"

// The SCREEN-TRACE ENGINE — how the assistant drives real screens while it works.
// The panel emits one trace per step; THIS engine (mounted once at the root, so it
// exists on EVERY page) decides how to get the user's screen there:
//
//   • Already inside /t for that team → hand the target to the deep-link host
//     (a second, host-scoped event): it moves with its own soft go() — the same
//     History-API move a click makes, no reload.
//   • Anywhere else (Home / Settings, or another team's /t) → do NOTHING to the
//     screen (narrate the step in the panel only). Crossing into /t from a
//     top-level route is a HARD RELOAD in this static export (EDGE-CASES §1),
//     which would tear down the running assistant — so we never yank the page.
//
// Traces for a DIFFERENT team are dropped by the host's own team check — the
// agent only ever acts in the current team (SYSTEM rule), so that's a safety
// net, not a path.
//
// The tool → screen MAP lives in agent-trace.ts (pure, DOM-free — the parity
// test in workers/data-ops imports it to prove every write tool has a screen).

import * as React from "react"
import { usePathname } from "next/navigation"

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

/** Mounted ONCE at the root (agent-host.tsx). `activeTeamId` = the current team.
 *
 * When the assistant is ALREADY inside the /t shell for this team, it drives the screen
 * SOFTLY — a History-API move via the deep-link host (no reload). When the person is on
 * a TOP-LEVEL route (Home / Settings), it deliberately does NOT yank them across the
 * static-export boundary into /t: that crossing is a HARD RELOAD (EDGE-CASES §1) that
 * would tear down the running assistant and its live step feed. So the step just narrates
 * in the panel; the person opens the team screen themselves to see the result. (The old
 * off-host `router.push` into /t was exactly that reload — it killed the agent mid-run.) */
export function useScreenTraceEngine(activeTeamId: string | null | undefined): void {
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
      // Soft-drive ONLY when the deep-link host is already showing this team; otherwise
      // leave the screen put (narrate) — crossing into /t from here would hard-reload.
      if ((pathRef.current ?? "").startsWith(`/t/${nav.teamId}`))
        window.dispatchEvent(new CustomEvent<TraceNav>(HOST_EVENT, { detail: nav }))
    }
    window.addEventListener(TRACE_EVENT, listener)
    return () => window.removeEventListener(TRACE_EVENT, listener)
  }, [activeTeamId])
}
