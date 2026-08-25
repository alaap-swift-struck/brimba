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
import { doors } from "./door-source"

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

// THE EXCLUSION SECTION IS CHECKED AGAINST THE CODE — ON BOTH MACHINE SURFACES.
//
// MCP.md carries a section naming the endpoints deliberately NOT exposed as tools.
// Until 2026-08-25 nothing verified it, and it was wrong: it stated that creating an
// invite, revoking an invite and setting role permissions were "deliberately kept
// to the UI", while `create_invite`, `revoke_invite` and `set_role_permissions`
// had been live tools since 8 July. Those rows were written by an MCP-parity
// audit, to close a coverage gap the audit itself had found — a claim and its
// evidence with the same author, and no way for anyone to notice.
//
// The check written that day was narrower than the fault it was closing, in two ways:
//
//   1. It read the TABLE ROWS only. The table is where these claims are FORMATTED,
//      not where they all live — the prose around it makes the same kind of claim in
//      sentences, and whether a claim is true has nothing to do with whether it sits
//      between pipes.
//   2. It compared them to MCP_TOOLS only. But the rows are written as CAPABILITY
//      decisions ("bulk writes", "changing the shape of a tenant", "per-person state
//      … which the act-as-you model makes ambiguous") — reasons that are about the
//      machine acting on someone's behalf, not about one protocol. The in-app
//      assistant is the other machine surface with the same act-as-you model, and it
//      forwards to five of the paths this section calls withheld.
//
// So there are two checks below, one per surface, and the second lets a claim SCOPE
// itself: a row that says "not on MCP" is making a narrower claim, and a narrower
// claim can be true.
describe("MCP.md's exclusion section", () => {
  const doc = readFileSync(join(__dirname, "..", "..", "..", "MCP.md"), "utf8")
  const from = doc.indexOf("### What is deliberately NOT a tool")
  const to = doc.indexOf("\n## ", from + 1)
  const section = from === -1 ? "" : doc.slice(from, to === -1 ? undefined : to)

  /** One claim: `names` is the text that CITES endpoints, `block` the whole thing
   * whose words can scope or date it. A table row cites its endpoints in the first
   * cell — the second is the reason, which may legitimately name a live tool as the
   * alternative ("`plan_import` is the supported machine path"). Prose is both. */
  const claims = section.split(/\n\s*\n/).flatMap((block) =>
    block.startsWith("|")
      ? block
          .split("\n")
          .filter((l) => l.startsWith("| `"))
          .map((row) => ({ names: row.slice(0, row.indexOf("|", 1)), block: row }))
      : [{ names: block, block }]
  )
  const rows = claims.filter((c) => c.block.startsWith("| `"))

  /** The endpoint fragments a claim cites: backticked pieces of a path
   * (`invites/revoke`), never the full route — a tool's `path` is the full route. */
  const cited = (text: string): string[] =>
    [...text.matchAll(/`([a-z0-9/_-]+)`/g)]
      .map((m) => m[1].replace(/\/\*$/, ""))
      .filter((f) => f.length >= 5) // shorter than this can't match meaningfully

  /** Every path a LIVE machine tool forwards to, with its surface named. */
  const live = [
    ...MCP_TOOLS.map((t) => ({ surface: "MCP", tool: t.name, path: t.path })),
    ...TOOL_CATALOG.filter((t) => t.binding !== "SELF").map((t) => ({
      surface: "the assistant",
      tool: t.name,
      path: t.path,
    })),
  ]

  /** Claims contradicted by a live tool on one surface. `scopable` allows a claim to
   * survive by naming the surface it is about (or by being explicitly historical —
   * the paragraph recording that this section was once WRONG has to be able to quote
   * what was wrong without the checker reading the quote as a fresh claim). */
  const contradictions = (surface: string, scopable: boolean): string[] => {
    const lies: string[] = []
    for (const c of claims) {
      if (/\bhistorical\b/i.test(c.block)) continue
      if (scopable && /\bMCP\b/.test(c.block)) continue
      for (const fragment of cited(c.names))
        for (const l of live)
          if (l.surface === surface && (l.path.endsWith(`/${fragment}`) || l.path.endsWith(fragment)))
            lies.push(`\`${fragment}\` is named as not exposed, but ${l.surface} tool "${l.tool}" forwards to ${l.path}`)
    }
    return lies
  }

  it("was found at all", () => {
    expect(from, "the '### What is deliberately NOT a tool' section moved or was renamed — this check has gone blind").toBeGreaterThan(-1)
    expect(section.length, "the exclusion section came back empty — this check has gone blind").toBeGreaterThan(500)
    expect(rows.length, "the exclusion table moved or was renamed — this check has gone blind").toBeGreaterThan(4)
    expect(claims.length, "no prose claims were read out of the section — the scan has gone blind").toBeGreaterThan(rows.length)
  })

  it("names nothing the MCP surface actually exposes", () => {
    expect(
      contradictions("MCP", false),
      "the exclusion section contradicts the MCP tool catalogue"
    ).toEqual([])
  })

  it("names nothing the ASSISTANT exposes, unless it says which surface it means", () => {
    // The fix for a failure here is one of two edits, and which one is a judgement
    // about the product, not about the doc: either say which surface the claim is
    // about ("not on MCP — the assistant has it"), or, if the capability really is
    // meant to be withheld from every machine, take the agent tool away.
    expect(
      contradictions("the assistant", true),
      "the exclusion section reads as a capability decision but the in-app assistant forwards to these paths — split the claim by surface, or withdraw the tool"
    ).toEqual([])
  })
})

// TWO GUARDS THAT STOPPED AT THE MACHINE BOUNDARY.
//
// Both were found by interfacelessness_review and both had the same shape: a
// protection the UI gets by default that no tool could reach, so the machine
// surface was quietly weaker than the human one at the same door.
describe("the machine surface gets the same guards as the UI", () => {
  it("a required boolean REFUSES when omitted, instead of meaning false", () => {
    // `active: i.active === true` reads as a coercion and behaves as a decision:
    // an omitted field is undefined, `undefined === true` is false, and the tool
    // sends "switch this off". The schema says required and `tools/call` does not
    // validate against the schema — so a machine caller that simply forgot the
    // field DEACTIVATED the record, and the door's clean 400 was unreachable
    // because the tool had already invented a value.
    const toggles = MCP_TOOLS.filter((t) => /^set_\w+(_value)?_active$/.test(t.name))
    expect(toggles.length, "no set_*_active tools found — this scan has gone blind").toBeGreaterThan(2)
    for (const t of toggles) {
      expect(() => t.buildBody!({ id: "x", roleId: "x" }), `${t.name} must refuse an omitted "active" rather than defaulting it to false`).toThrow()
      expect(t.buildBody!({ id: "x", roleId: "x", active: false }).active).toBe(false)
      expect(t.buildBody!({ id: "x", roleId: "x", active: true }).active).toBe(true)
    }
  })

  it("every tool on a door that accepts expectedVersion exposes AND forwards it", () => {
    // Some doors carry the lost-update guard and the web client sends it. No tool
    // exposed or forwarded it, so a machine edit ALWAYS won a concurrent race —
    // the assistant silently overwriting a change a person made seconds earlier.
    //
    // DERIVED FROM THE DOORS, not from the tools. This used to enumerate MCP_TOOLS
    // whose name began with `update_`, which asks the wrong question twice over: it
    // can only examine doors that already HAVE a tool (so a new versioned door
    // shipping with no tool is exactly the case it cannot see), and it misses any
    // tool on a versioned door that isn't spelled `update_*` — which is how
    // `update_team`, an agent-only tool on a door that takes the guard, sat outside
    // the check entirely. Same derivation as filter-parity.test.ts: read the door.
    const versioned = [...doors("tenancy"), ...doors("content")].filter((d) =>
      d.body.includes("expectedVersion")
    )
    expect(versioned.length, "no door reads expectedVersion — this scan has gone blind").toBeGreaterThan(3)

    // Every machine tool, on EITHER surface — a guard the assistant can't reach is
    // as unreachable as one the MCP can't.
    const machineTools = [
      ...MCP_TOOLS.map((t) => ({ surface: "MCP", name: t.name, path: t.path, schema: t.inputSchema, buildBody: t.buildBody })),
      ...TOOL_CATALOG.map((t) => ({ surface: "agent", name: t.name, path: t.path, schema: t.schema, buildBody: t.buildBody })),
    ]
    let checked = 0
    for (const d of versioned) {
      // A versioned door with NO machine tool is not a parity gap — there is nothing
      // there to be weaker than the UI. A tool that DOES sit on one must carry the guard.
      for (const t of machineTools.filter((t) => t.path === d.path)) {
        checked++
        const props = (t.schema as { properties?: Record<string, unknown> })?.properties ?? {}
        expect(
          props,
          `${t.surface} tool "${t.name}" sits on ${d.route}, which accepts expectedVersion — it must EXPOSE it, or a machine caller cannot opt into the guard`
        ).toHaveProperty("expectedVersion")
        expect(
          t.buildBody!({ id: "x", roleId: "x", name: "n", title: "t", value: "v", description: "d", expectedVersion: "V" })
            .expectedVersion,
          `${t.surface} tool "${t.name}" must FORWARD expectedVersion — exposing it and dropping it is worse than not offering it`
        ).toBe("V")
      }
    }
    expect(checked, "no tool was found on any versioned door — this scan has gone blind").toBeGreaterThan(3)
  })
})
