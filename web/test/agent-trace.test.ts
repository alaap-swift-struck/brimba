import { describe, expect, it } from "vitest"

import { traceFor } from "@/lib/agent-trace"

const TEAM = "team_abc"

describe("traceFor — write tools land on the RESULT screen, never an input form", () => {
  it("invite_member → the invites list, where the new pending invite appears live", () => {
    expect(traceFor("invite_member", { email: "sam@acme.com", roleId: "r1" }, TEAM)).toEqual({
      path: `/t/${TEAM}/invites`,
      highlight: "main",
    })
  })

  it("revoke_invite → that invite's detail row", () => {
    const t = traceFor("revoke_invite", { inviteId: "inv1" }, TEAM)
    expect(t?.path).toBe(`/t/${TEAM}/invites/inv1`)
  })

  it("set_member_role → the member's detail, where their new role now shows", () => {
    expect(traceFor("set_member_role", { userId: "u1", roleId: "r2" }, TEAM)).toEqual({
      path: `/t/${TEAM}/members/u1`,
      highlight: "main",
    })
  })

  it("remove_member → the member's detail row (no dialog auto-opened)", () => {
    const t = traceFor("remove_member", { userId: "u9" }, TEAM)
    expect(t?.path).toBe(`/t/${TEAM}/members/u9`)
  })

  it("create_role → the roles list, where the new role appears live (NOT a blank form)", () => {
    expect(traceFor("create_role", { title: "Editor" }, TEAM)).toEqual({
      path: `/t/${TEAM}/roles`,
      highlight: "main",
    })
  })

  it("set_role_permissions / update_role / set_role_active / get_role_permissions → the role's detail", () => {
    for (const tool of ["set_role_permissions", "update_role", "set_role_active", "get_role_permissions"]) {
      expect(traceFor(tool, { roleId: "role7" }, TEAM)?.path).toBe(`/t/${TEAM}/roles/role7`)
    }
  })

  it("dropdown writes → the one dropdown-values screen (no per-value URL)", () => {
    for (const tool of ["create_dropdown_value", "update_dropdown_value", "set_dropdown_active"]) {
      expect(traceFor(tool, { id: "d1", type: "Help type", value: "Bug" }, TEAM)?.path).toBe(
        `/t/${TEAM}/dropdowns`
      )
    }
  })

  it("create_learning → learning list; update/active/done → the article detail", () => {
    expect(traceFor("create_learning", { title: "Onboarding" }, TEAM)?.path).toBe(`/t/${TEAM}/learning`)
    for (const tool of ["update_learning", "set_learning_active", "mark_learning_done"]) {
      expect(traceFor(tool, { id: "art3" }, TEAM)?.path).toBe(`/t/${TEAM}/learning/art3`)
    }
  })

  it("raise_help_ticket → help list; reply/update/status → the ticket detail", () => {
    expect(traceFor("raise_help_ticket", { description: "Printer down" }, TEAM)?.path).toBe(
      `/t/${TEAM}/help`
    )
    expect(traceFor("reply_help_ticket", { helpId: "h5", body: "on it" }, TEAM)?.path).toBe(
      `/t/${TEAM}/help/h5`
    )
    for (const tool of ["update_help_ticket", "set_help_status"]) {
      expect(traceFor(tool, { id: "h5", status: "resolved" }, TEAM)?.path).toBe(`/t/${TEAM}/help/h5`)
    }
  })

  it("set_help_status specifically maps to the ticket detail", () => {
    expect(traceFor("set_help_status", { id: "h5", status: "in_progress" }, TEAM)).toEqual({
      path: `/t/${TEAM}/help/h5`,
      highlight: "main",
    })
  })

  it("update_team → the team overview (bare /t/<team>), where the new name now shows", () => {
    expect(traceFor("update_team", { name: "Acme" }, TEAM)).toEqual({
      path: `/t/${TEAM}`,
      highlight: "main",
    })
  })
})

describe("traceFor — reads have no trace", () => {
  it("returns null for every list_* / read tool and unknowns", () => {
    for (const tool of ["list_members", "list_roles", "list_learning", "list_help_tickets", "who_knows"]) {
      expect(traceFor(tool, {}, TEAM)).toBeNull()
    }
  })
})
