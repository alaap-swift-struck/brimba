import type { ScreenRecipe } from "@swift-struck/ui/lib/recipe"
import { describe, expect, it } from "vitest"

import { BASE_RECIPES, isScreenRecipe, resolveRecipe, withoutActions } from "@/lib/screens"

/** A minimal-but-valid recipe object the structural guard should accept. */
const minimalRecipe = { type: "list", fields: [], actions: [], binding: {} }

describe("isScreenRecipe", () => {
  it("accepts a minimal valid recipe object", () => {
    expect(isScreenRecipe(minimalRecipe)).toBe(true)
  })

  it("accepts the real base recipes", () => {
    expect(isScreenRecipe(BASE_RECIPES["members.detail"])).toBe(true)
  })

  it("rejects null, numbers and an empty object", () => {
    expect(isScreenRecipe(null)).toBe(false)
    expect(isScreenRecipe(42)).toBe(false)
    expect(isScreenRecipe({})).toBe(false)
  })

  it("rejects objects missing actions / fields / binding", () => {
    expect(isScreenRecipe({ type: "list", fields: [], binding: {} })).toBe(false) // no actions
    expect(isScreenRecipe({ type: "list", actions: [], binding: {} })).toBe(false) // no fields
    expect(isScreenRecipe({ type: "list", fields: [], actions: [] })).toBe(false) // no binding
  })
})

describe("resolveRecipe", () => {
  it("returns the base for a known key with no overrides", () => {
    expect(resolveRecipe("members.detail", undefined)).toBe(BASE_RECIPES["members.detail"])
    expect(resolveRecipe("members.detail", {})).toBe(BASE_RECIPES["members.detail"])
  })

  it("returns a valid override over the base", () => {
    const override = { ...minimalRecipe, type: "detail" }
    const resolved = resolveRecipe("members.detail", {
      "members.detail": JSON.stringify(override),
    })
    expect(resolved).not.toBe(BASE_RECIPES["members.detail"])
    expect(resolved?.type).toBe("detail")
  })

  it("falls back to the base for a malformed (non-recipe) override", () => {
    const resolved = resolveRecipe("members.detail", {
      "members.detail": JSON.stringify({ type: "detail" }), // missing arrays + binding
    })
    expect(resolved).toBe(BASE_RECIPES["members.detail"])
  })

  it("falls back to the base for invalid JSON", () => {
    const resolved = resolveRecipe("members.detail", { "members.detail": "{not json" })
    expect(resolved).toBe(BASE_RECIPES["members.detail"])
  })

  it("returns null for an unknown key with no base", () => {
    expect(resolveRecipe("nope.nothere", undefined)).toBeNull()
    expect(resolveRecipe("nope.nothere", {})).toBeNull()
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
