"use client"

// The app-wide AI co-pilot, mounted ONCE at the root layout so it rides ABOVE every
// screen and SURVIVES navigation. The assistant's screen-trace moves the page beneath
// it, and switching screens never tears the panel (or its live chat + step pills) down
// — the bug this fixes was mounting the panel inside the per-route AppShell, so every
// navigation (including the agent's own trace) closed it and dropped the run.
//
// It owns the floating launcher, the panel, and the screen-trace engine. It reads the
// ACTIVE team (the module-cached session — safe to read from anywhere) and renders
// nothing until you're signed in with a team, so login / onboarding have no co-pilot.

import { Sparkles } from "lucide-react"

import { AgentPanel } from "@/components/agent-panel"
import { useActiveTeam } from "@/lib/use-active-team"
import { usePermissions } from "@/lib/perms"
import { useAgentOpen, setAgentOpen } from "@/lib/agent-open"
import { useScreenTraceEngine } from "@/lib/screen-trace"

export function AgentHost() {
  const active = useActiveTeam()
  const teamId = active.ctx?.team?.id ?? null
  const { can } = usePermissions(teamId)
  const open = useAgentOpen()
  // The assistant's steps drive the REAL screen from wherever the host lives — stable
  // here (root), so a multi-step run keeps tracing even as the screen changes. Runs
  // before the early returns (hooks are unconditional); it no-ops with a null team.
  useScreenTraceEngine(teamId)

  // No team context yet (signed out, or on login / onboarding) → no co-pilot.
  if (!active.ctx) return null
  // Gated by agent:create, exactly as the old in-shell launcher was; the server
  // re-checks every action AS the signed-in user regardless.
  if (!can("agent", "create")) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAgentOpen(true)}
        aria-label="Open the assistant"
        className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-20 z-30 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors md:bottom-6"
      >
        <Sparkles className="size-5" />
      </button>
      <AgentPanel teamId={teamId} open={open} onOpenChange={setAgentOpen} />
    </>
  )
}
