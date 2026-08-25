import type { ScreenRecipe } from "@swift-struck/ui/lib/recipe"
import { describe, expect, it } from "vitest"

import { BASE_RECIPES, resolveRecipe, withoutActions } from "@/lib/screens"

describe("resolveRecipe", () => {
  // The per-team OVERRIDE map is gone (owner decision, 2026-08-25): the whole
  // subsystem — table, migration, gate, validator, permission row, renderer and
  // merge — had no caller on any surface, so every team's map was permanently
  // empty and this function's second argument was always undefined. What remains
  // is the lookup, and the two cases that ever mattered.
  it("returns the base recipe for a known key", () => {
    expect(resolveRecipe("members.detail")).toBe(BASE_RECIPES["members.detail"])
  })

  it("returns null for a key with no base", () => {
    expect(resolveRecipe("nope.nothere")).toBeNull()
  })
})

describe("withoutActions", () => {
  it("drops the named action ids and returns a NEW object", () => {
    const base = BASE_RECIPES["members.detail"] as ScreenRecipe
    const beforeIds = base.actions.map((a) => a.id)
    expect(beforeIds).toContain("members.changeRole")

    const next = withoutActions(base, ["members.changeRole"])
    expect(next).not.toBe(base) // fresh copy
    expect(next.actions.map((a) => a.id)).not.toContain("members.changeRole")
    expect(next.actions.map((a) => a.id)).toContain("members.remove")
  })

  it("leaves the base recipe's actions array unmutated", () => {
    const base = BASE_RECIPES["members.detail"] as ScreenRecipe
    const originalLength = base.actions.length
    withoutActions(base, ["members.changeRole", "members.remove"])
    expect(base.actions.length).toBe(originalLength)
    expect(base.actions.map((a) => a.id)).toContain("members.changeRole")
  })
})
