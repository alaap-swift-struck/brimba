// The AI co-pilot must be mounted ONCE at the root layout, not inside the per-route
// AppShell — otherwise every navigation (including the assistant's own screen-trace)
// remounts the shell and tears the panel + its live run down (the reported bug: the
// panel closed on navigation and the step pills collapsed mid-run). These source-scans
// lock the panel above the routed screens so it survives navigation.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const read = (p: string) => readFileSync(join(WEB, p), "utf8")

describe("the AI co-pilot survives navigation (mounted at the root, not per-route)", () => {
  it("the root layout mounts the persistent AgentHost", () => {
    const layout = read("app/layout.tsx")
    expect(layout, "root layout must render <AgentHost /> above the routed screens").toContain("<AgentHost")
    expect(layout).toContain('from "@/components/agent-host"')
  })

  it("AppShell no longer owns the panel (it would remount per route)", () => {
    const shell = read("components/app-shell.tsx")
    expect(shell, "AppShell must NOT mount AgentPanel — it lives at the root now").not.toContain("<AgentPanel")
    expect(shell, "AppShell must NOT own the screen-trace engine — it moved to the stable root host").not.toContain("useScreenTraceEngine")
  })

  it("AgentHost holds the panel + the trace engine, gated by agent:create + a team", () => {
    const host = read("components/agent-host.tsx")
    expect(host).toContain("<AgentPanel")
    expect(host).toContain("useScreenTraceEngine")
    // Only a signed-in person with a team + the agent right gets the co-pilot.
    expect(host).toContain("active.ctx")
    expect(host).toContain('can("agent", "create")')
  })

  it("the open state is a module-level store (survives remounts), not per-shell useState", () => {
    const store = read("lib/agent-open.ts")
    expect(store).toContain("useSyncExternalStore")
    expect(store).toContain("export function setAgentOpen")
  })
})
