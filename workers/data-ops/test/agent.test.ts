// Guards on the agent's safety surface (pure logic — no model/DB/network):
//  • the confirm rule — every privilege/identity write (roles, permissions, membership,
//    invites, team details), the two only-destructive acts, and bulk/import writes pause
//    for the yes/no panel; low-blast single content edits run straight away,
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
  it("confirms every privilege/identity write + destructive + bulk; content edits run freely", () => {
    // Any change to who-can-do-what or team identity → confirm panel (defense-in-depth:
    // an agent that mis-picks a tool or is prompt-injected can't silently re-grant a role
    // or rename the team). Plus the two only-destructive acts.
    for (const name of [
      "create_role",
      "update_role",
      "set_role_active",
      "set_role_permissions",
      "invite_member",
      "revoke_invite",
      "set_member_role",
      "remove_member",
      "update_team",
    ]) {
      expect(requiresConfirm(getTool(name)!), `${name} must confirm (privilege/identity)`).toBe(true)
    }
    // Low-blast single content edits run straight away (still re-gated + reversible).
    for (const name of ["create_learning", "update_learning", "raise_help_ticket", "reply_help_ticket"]) {
      expect(requiresConfirm(getTool(name)!), `${name} runs freely`).toBe(false)
    }
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
    // call), so member management is allowed. Both removing a member AND re-assigning a
    // role confirm — they change someone's access, so the app double-checks first.
    expect(getTool("remove_member")).toBeDefined()
    expect(getTool("set_member_role")).toBeDefined()
    expect(requiresConfirm(getTool("remove_member")!)).toBe(true)
    expect(requiresConfirm(getTool("set_member_role")!)).toBe(true)
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
      if (t.binding === "SELF") {
        // A SELF tool runs inside data-ops — its gate is its own handler, which
        // must exist (it re-opens teamContext + requireRight from the request).
        expect(typeof t.run, `SELF tool "${t.name}" must carry a run handler`).toBe("function")
        continue
      }
      expect(t.binding === "CONTENT" || t.binding === "TENANCY").toBe(true)
      expect(t.path.startsWith("/api/")).toBe(true)
    }
  })

  it("the chat-import runner always confirms (writing a whole file is high-blast)", () => {
    const t = TOOL_CATALOG.find((x) => x.name === "run_import_batch")
    expect(t).toBeDefined()
    expect(t?.confirm).toBe(true)
    expect(t?.write).toBe(true)
  })
})
