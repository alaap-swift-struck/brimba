// THE WAY OUT OF AN EMPTY SCREEN (R…, first-run): a list recipe's `emptyAction`
// must reach a form, not a shrug.
//
// The failure this locks is specific and was shipped-shaped: the engine renders
// `emptyAction` as a real, gated button, but the host's ONE `onAction` switch
// knew four ids and had no default branch — so a create id declared in a recipe
// painted a button that did nothing, on the one screen a brand-new team is
// guaranteed to meet. Reading the recipe would have shown a button; reading the
// host would have shown a switch. Only following the whole path shows the gap.
//
// So this test follows the whole path, in the order it runs:
//   1. a REAL click on the empty state's button → the id the host receives
//   2. `createPanelFor(id)` → the url the host pushes
//   3. that url actually opens a dialog in `deep-link-screen.tsx` (source scan —
//      the dialogs are JSX in the host, so this is where they can be seen)
//   4. no create right → no button at all
//
// Step 3 is the one that catches the trap generically: `members.create` would
// have passed steps 1 and 2 and still opened nothing, because the host has no
// add-panel for the members module. Inviting is how someone joins a team, so
// the Members list's way out is `invites.create` — and this check is what says
// so, for every recipe, forever.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cleanup, render, screen } from "@testing-library/react"
import type { ScreenRecipe, ScreenRights } from "@swift-struck/ui/lib/recipe"
import { ScreenRenderer } from "@swift-struck/ui/registry/collections/screen-renderer/screen-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BASE_RECIPES, createPanelFor, rolesListRecipe } from "@/lib/screens"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const read = (p: string) => readFileSync(join(WEB, p), "utf8")

// This workspace runs vitest WITHOUT globals, so testing-library's automatic
// cleanup never registers — without this the previous test's button is still in
// the document and a "the button is hidden" assertion passes on a stale node.
afterEach(cleanup)

/** Every module right on, so nothing is hidden for the wrong reason. */
const ALL_RIGHTS: ScreenRights = new Proxy(
  {},
  { get: () => ({ read: true, create: true, edit: true, delete: true }) }
) as ScreenRights

/** Render a list recipe with NO rows — the empty state — and hand back the spy. */
function renderEmpty(recipe: ScreenRecipe, rights: ScreenRights = ALL_RIGHTS) {
  const onAction = vi.fn()
  render(
    <ScreenRenderer recipe={recipe} data={{ rows: [] }} rights={rights} onAction={onAction} />
  )
  return onAction
}

describe("the host dispatches a create action (the half that must exist FIRST)", () => {
  // A recipe shaped exactly like the real ones, so this proves the seam itself
  // rather than any one screen's wiring.
  const recipe: ScreenRecipe = {
    ...rolesListRecipe,
    actions: [
      {
        id: "roles.create",
        label: "New role",
        action: "roles.create",
        gate: { module: "member_roles", right: "create" },
      },
    ],
    emptyAction: "roles.create",
  }

  it("clicking the empty state's button hands the host the create id", () => {
    const onAction = renderEmpty(recipe)
    screen.getByRole("button", { name: "New role" }).click()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0][0]).toBe("roles.create")
  })

  it("the id the host receives resolves to an add panel", () => {
    expect(createPanelFor("roles.create")).toEqual({ panel: "add", module: "roles" })
    expect(createPanelFor("learning.create")).toEqual({ panel: "add", module: "learning" })
    // Not a create → nothing opens (rather than a blank panel).
    expect(createPanelFor("members.remove")).toBeNull()
    expect(createPanelFor("team.edit")).toBeNull()
    expect(createPanelFor("nonsense")).toBeNull()
  })

  it("the host's switch has a default branch that pushes that panel", () => {
    const src = read("components/deep-link-screen.tsx")
    expect(src, "onAction must resolve unknown ids through createPanelFor").toContain(
      "createPanelFor(actionId)"
    )
    expect(src, "…and push it as the section's add panel").toContain("go(sectionPath, panel)")
  })

  it("hides the button entirely when the viewer cannot create", () => {
    const onAction = renderEmpty(recipe, {
      member_roles: { read: true, create: false, edit: false, delete: false },
    })
    expect(screen.queryByRole("button", { name: "New role" })).toBeNull()
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe("every declared emptyAction reaches a real form", () => {
  const host = read("components/deep-link-screen.tsx")

  const listRecipes = Object.entries(BASE_RECIPES).filter(([, r]) => r.type === "list")

  it("names one of the recipe's OWN actions, gated on create", () => {
    for (const [key, recipe] of listRecipes) {
      if (!recipe.emptyAction) continue
      const action = recipe.actions.find((a) => a.id === recipe.emptyAction)
      expect(action, `${key}: emptyAction "${recipe.emptyAction}" is not one of its actions`).toBeTruthy()
      expect(action?.gate?.right, `${key}: the way out must be gated on create`).toBe("create")
      expect(action?.gate?.module, `${key}: the gate must name a permission module`).toBeTruthy()
    }
  })

  it("opens a dialog the host actually renders (no button into nothing)", () => {
    for (const [key, recipe] of listRecipes) {
      if (!recipe.emptyAction) continue
      const panel = createPanelFor(recipe.emptyAction)
      expect(panel, `${key}: emptyAction "${recipe.emptyAction}" is not a create id`).toBeTruthy()
      // The host opens each add dialog on exactly this condition.
      const opensOn = `query.panel === "add" && query.module === "${panel?.module}"`
      expect(host, `${key}: nothing in the host opens on ${opensOn}`).toContain(opensOn)
    }
  })

  it("renders a working button for a viewer who may create", () => {
    for (const [key, recipe] of listRecipes) {
      if (!recipe.emptyAction) continue
      const label = recipe.actions.find((a) => a.id === recipe.emptyAction)?.label as string
      const onAction = renderEmpty(recipe)
      screen.getByRole("button", { name: label }).click()
      expect(onAction, `${key}: the empty state's "${label}" button did nothing`).toHaveBeenCalledWith(
        recipe.emptyAction,
        expect.anything()
      )
      cleanup()
    }
  })
})
