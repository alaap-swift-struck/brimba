// Guards on the agent's safety surface (pure logic — no model/DB/network):
//  • the confirm rule — ONLY the two only-destructive acts (remove a member, revoke an
//    invite) pause for the yes/no panel; every other tool runs straight away,
//  • the catalog is OPT-IN (only listed actions are tools), and
//  • the agent acts AS the user with the user's EXACT rights (the server re-checks each
//    call); it still cannot control device sessions or delete the team. Managing
//    existing members (set a role, remove someone) IS allowed — normal, re-gated CRUD.

import { describe, expect, it } from "vitest"

import { getTool, requiresConfirm, toolSpecs, TOOL_CATALOG } from "../src/lib/tools"

describe("step/confirm summaries resolve ids to human names", () => {
  const names = { "01ROLE": "Sub Admin", "01USER": "Jane Doe" }

  it("names a role by title (not a ULID) when resolved", () => {
    expect(getTool("set_role_active")!.summarize({ roleId: "01ROLE", active: false }, names)).toBe(
      "Deactivate the Sub Admin role"
    )
    expect(getTool("set_role_permissions")!.summarize({ roleId: "01ROLE", value: {} }, names)).toBe(
      "Set access rights for the Sub Admin role"
    )
    expect(getTool("invite_member")!.summarize({ email: "sam@x.com", roleId: "01ROLE" }, names)).toBe(
      "Invite sam@x.com as Sub Admin"
    )
    expect(
      getTool("set_member_role")!.summarize({ userId: "01USER", roleId: "01ROLE" }, names)
    ).toBe("Change Jane Doe to Sub Admin")
  })

  it("falls back to the raw id when a name can't be resolved (never throws)", () => {
    expect(getTool("set_role_active")!.summarize({ roleId: "01ROLE", active: true })).toBe(
      "Activate role 01ROLE"
    )
    expect(getTool("invite_member")!.summarize({ email: "sam@x.com", roleId: "01ROLE" })).toBe(
      "Invite sam@x.com as role 01ROLE"
    )
  })
})

describe("agent tool catalog + confirm rule", () => {
  it("confirms ONLY the two only-destructive acts; every other write runs freely", () => {
    // Only-destructive → confirm panel.
    expect(requiresConfirm(getTool("remove_member")!)).toBe(true)
    expect(requiresConfirm(getTool("revoke_invite")!)).toBe(true)
    // Everything else — including role and member writes — runs straight away.
    expect(requiresConfirm(getTool("invite_member")!)).toBe(false)
    expect(requiresConfirm(getTool("set_member_role")!)).toBe(false)
    expect(requiresConfirm(getTool("create_role")!)).toBe(false)
    expect(requiresConfirm(getTool("set_role_active")!)).toBe(false)
    expect(requiresConfirm(getTool("set_role_permissions")!)).toBe(false)
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

  it("can set + read a role's access rights (parity with the Roles screen)", () => {
    expect(getTool("set_role_permissions")).toBeDefined()
    expect(getTool("get_role_permissions")).toBeDefined()
    expect(getTool("set_role_permissions")!.write).toBe(true)
    expect(getTool("get_role_permissions")!.write).toBe(false)
  })

  it("bulk tools change many records at once — write, confirm (high-blast), via CONTENT", () => {
    // A bulk change hits many rows, so it's always confirmed with a count-bearing summary.
    for (const name of ["bulk_set_learning_active", "bulk_set_help_status"]) {
      const t = getTool(name)
      expect(t, `tool "${name}" must be defined`).toBeDefined()
      expect(t!.write).toBe(true)
      expect(t!.confirm).toBe(true)
      expect(requiresConfirm(t!)).toBe(true)
      expect(t!.binding).toBe("CONTENT")
      expect(t!.path.startsWith("/api/")).toBe(true)
    }
  })

  it("manages members AS the user — set_member_role + remove_member are present", () => {
    // The agent acts AS the user with their EXACT rights (the server re-checks each
    // call), so member management is allowed. Removing a member is only-destructive, so
    // it confirms; re-assigning a role runs straight away.
    expect(getTool("remove_member")).toBeDefined()
    expect(getTool("set_member_role")).toBeDefined()
    expect(requiresConfirm(getTool("remove_member")!)).toBe(true)
    expect(requiresConfirm(getTool("set_member_role")!)).toBe(false)
  })

  it("exposes a spec for every catalogued tool, and nothing else is callable", () => {
    const specs = toolSpecs()
    expect(specs.map((s) => s.name).sort()).toEqual(TOOL_CATALOG.map((t) => t.name).sort())
    // Catastrophic acts stay out of the catalog: deleting the team, signing out devices.
    expect(getTool("delete_team")).toBeUndefined()
    expect(getTool("sign_out")).toBeUndefined()
    expect(getTool("change_my_email")).toBeUndefined()
  })

  it("still cannot control device sessions or delete the team (catastrophic acts blocked)", () => {
    // Device-session control and team deletion are catastrophic, not normal CRUD, so
    // they stay out of the catalog by name and by surface.
    const banned = /delete_team|sign_out/i
    for (const t of TOOL_CATALOG) {
      expect(banned.test(t.name), `tool "${t.name}" must not be a catastrophic act`).toBe(false)
    }
    // No tool may touch the device-sessions surface.
    for (const t of TOOL_CATALOG) {
      expect(/sessions/.test(t.path), `tool "${t.name}" path ${t.path}`).toBe(false)
    }
  })

  it("every write tool declares how it's gated (a module the real door checks)", () => {
    for (const t of TOOL_CATALOG) {
      expect(t.binding === "CONTENT" || t.binding === "TENANCY").toBe(true)
      expect(t.path.startsWith("/api/")).toBe(true)
    }
  })
})
