// Guards on the agent's safety surface (pure logic — no model/DB/network):
//  • the confirm rule (dangerous/role-touching writes confirm; plain edits run free),
//  • the catalog is OPT-IN (only listed actions are tools), and
//  • identity acts are NOT in the catalog (the agent structurally can't change who
//    you are, remove/demote you, or touch members).

import { describe, expect, it } from "vitest"

import { getTool, requiresConfirm, toolSpecs, TOOL_CATALOG } from "../src/lib/tools"

describe("agent tool catalog + confirm rule", () => {
  it("confirms dangerous-table writes, runs plain content writes freely", () => {
    expect(requiresConfirm(getTool("create_role")!)).toBe(true) // member_roles = dangerous
    expect(requiresConfirm(getTool("create_learning")!)).toBe(false)
    expect(requiresConfirm(getTool("update_learning")!)).toBe(false)
    expect(requiresConfirm(getTool("raise_help_ticket")!)).toBe(false)
    expect(requiresConfirm(getTool("reply_help_ticket")!)).toBe(false)
  })

  it("never confirms a read", () => {
    for (const t of TOOL_CATALOG.filter((t) => !t.write)) {
      expect(requiresConfirm(t)).toBe(false)
    }
  })

  it("exposes a spec for every catalogued tool, and nothing else is callable", () => {
    const specs = toolSpecs()
    expect(specs.map((s) => s.name).sort()).toEqual(TOOL_CATALOG.map((t) => t.name).sort())
    expect(getTool("delete_team")).toBeUndefined()
    expect(getTool("remove_member")).toBeUndefined()
    expect(getTool("change_my_email")).toBeUndefined()
  })

  it("contains no identity / member-management actions (those are blocked by omission)", () => {
    const banned = /remove_member|change_role|set_member|delete_team|sign_out|demote/i
    for (const t of TOOL_CATALOG) {
      expect(banned.test(t.name), `tool "${t.name}" must not be an identity/member action`).toBe(false)
    }
    // No WRITE tool may touch the members or sessions surface (identity/member writes
    // are blocked); reads like list_members are fine.
    for (const t of TOOL_CATALOG.filter((t) => t.write)) {
      expect(/members|sessions/.test(t.path), `write tool "${t.name}" path ${t.path}`).toBe(false)
    }
  })

  it("every write tool declares how it's gated (a module the real door checks)", () => {
    for (const t of TOOL_CATALOG) {
      expect(t.binding === "CONTENT" || t.binding === "TENANCY").toBe(true)
      expect(t.path.startsWith("/api/")).toBe(true)
    }
  })
})
