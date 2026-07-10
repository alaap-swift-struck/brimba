// The MCP tool catalog can't quietly rot: every forwarded path must exist in the
// TARGET worker's own route table (tenancy/content/data-ops export ROUTES; auth's
// switchboard source is read off disk, rules-test style). Plus the token
// primitives + the JSON-RPC tool listing shape.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROUTES as TENANCY_ROUTES } from "../../tenancy/src/index"
import { ROUTES as CONTENT_ROUTES } from "../../content/src/index"
import { ROUTES as DATAOPS_ROUTES } from "../../data-ops/src/index"
import { TARGETS } from "../../data-ops/src/lib/targets"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"
import { SHARED_TOOLS, TOOL_GATES } from "../../../shared/workers/tool-catalog"
import { getMcpTool, MCP_TOOLS } from "../src/lib/tools"
import { newTokenSecret, sha256Hex } from "../src/lib/tokens"

const ROUTE_TABLES: Record<string, Set<string>> = {
  TENANCY: new Set(Object.keys(TENANCY_ROUTES)),
  CONTENT: new Set(Object.keys(CONTENT_ROUTES)),
  DATAOPS: new Set(Object.keys(DATAOPS_ROUTES)),
}
const authSource = readFileSync(join(__dirname, "../../auth/src/index.ts"), "utf8")

describe("MCP catalog ↔ the real doors (no drift)", () => {
  it("every forwarded path exists on its target worker", () => {
    for (const t of MCP_TOOLS) {
      if (t.binding === "AUTH") {
        expect(authSource, `auth must serve ${t.path}`).toContain(`${t.method} ${t.path}`)
        continue
      }
      const table = ROUTE_TABLES[t.binding]
      expect(table.has(`${t.method} ${t.path}`), `${t.binding} must serve ${t.method} ${t.path}`).toBe(
        true
      )
    }
  })

  it("every export the import catalog declares is an MCP tool (machine parity)", () => {
    for (const target of Object.values(TARGETS)) {
      if (!target.exportPath) continue
      const tool = MCP_TOOLS.find((t) => t.path === target.exportPath)
      expect(tool, `an MCP export tool must forward to ${target.exportPath}`).toBeDefined()
    }
  })

  it("tools/list shape: every tool has a name, description, and an object schema", () => {
    for (const t of MCP_TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(10)
      expect((t.inputSchema as { type?: string }).type).toBe("object")
    }
  })

  // The AGENT-only door paths (bulk / team-update / role-perms read) aren't in MCP_TOOLS,
  // so check them here too — every non-SELF agent tool must forward to a real door route.
  it("every AGENT tool path exists on its target worker (agent-side drift guard)", () => {
    const tables: Record<string, Set<string>> = {
      TENANCY: ROUTE_TABLES.TENANCY,
      CONTENT: ROUTE_TABLES.CONTENT,
    }
    for (const t of TOOL_CATALOG) {
      if (t.binding === "SELF") continue // run_import_batch executes in-process, no route
      expect(tables[t.binding]?.has(`${t.method} ${t.path}`), `${t.binding} must serve ${t.method} ${t.path} (agent tool "${t.name}")`).toBe(true)
    }
  })
})

// The unification's external + internal contracts (a green build must keep these).
describe("the shared tool catalog — contracts that must not silently drift", () => {
  it("preserves the 3 external MCP tool names via mcpName (renaming would break scripts)", () => {
    for (const n of ["create_invite", "create_help_ticket", "set_dropdown_value_active"])
      expect(getMcpTool(n), `MCP must still expose "${n}"`).toBeDefined()
    // …and the agent's canonical names for those endpoints are NOT the MCP names.
    for (const n of ["invite_member", "raise_help_ticket", "set_dropdown_active"])
      expect(getMcpTool(n), `"${n}" is the agent name, must NOT be an MCP tool name`).toBeUndefined()
  })

  it("restores the developer permission hint on every gated MCP write description", () => {
    for (const s of SHARED_TOOLS) {
      const gate = TOOL_GATES[s.name]
      if (!gate) continue
      const t = getMcpTool(s.mcpName ?? s.name)!
      expect(t.description, `${t.name} description must name its required right`).toContain(`Needs ${gate}.`)
    }
  })
})

describe("personal access tokens", () => {
  it("secrets are prefixed + 64 hex chars of entropy, and hash deterministically", async () => {
    const s1 = newTokenSecret()
    const s2 = newTokenSecret()
    expect(s1).toMatch(/^brimba_mcp_[0-9a-f]{64}$/)
    expect(s1).not.toBe(s2)
    expect(await sha256Hex(s1)).toBe(await sha256Hex(s1))
    expect(await sha256Hex(s1)).not.toBe(await sha256Hex(s2))
  })
})
