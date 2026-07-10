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

  it("the open state is mirrored to sessionStorage so it survives a full page RELOAD", () => {
    // Crossing into the /t shell is a hard reload (static export). Without the mirror the
    // panel vanished on that reload (the "panel reset" bug). It must persist + restore.
    const store = read("lib/agent-open.ts")
    expect(store, "must mirror open state to sessionStorage").toContain("sessionStorage")
    expect(store, "must READ the persisted state at load").toMatch(/getItem\(/)
  })

  it("the session cache is reactive, so the root-mounted launcher appears without a reload", () => {
    // AgentHost mounts BEFORE login; its useActiveTeam instance must pick up the session
    // the moment another instance logs in / creates a team — else the launcher only shows
    // after a manual reload. A pub-sub over the shared cache is what makes that reactive.
    const hook = read("lib/use-active-team.ts")
    expect(hook, "cache writes must notify subscribers").toContain("setSessionCache")
    expect(hook, "instances must subscribe to cache changes").toMatch(/sessionSubs\.(add|delete)/)
  })

  it("the screen-trace never hard-reloads across the /t boundary (no router.push)", () => {
    // The off-host router.push into a deep /t path was a hard reload that killed the
    // running assistant. Off-host now narrates; only the soft HOST_EVENT drives a move.
    const engine = read("lib/screen-trace.tsx")
    // No actual router.push CALL (comments may still name it as the old behavior).
    expect(/router\.push\(/.test(engine), "the trace engine must not router.push (that reload killed the agent)").toBe(false)
    expect(engine, "soft drive is via the host event only").toContain("HOST_EVENT")
  })
})
