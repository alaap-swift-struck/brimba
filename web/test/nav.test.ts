// The navigation order is a locked owner decision: Home first, then the team pages
// (Learning, Help), Settings last — the SAME order on the desktop rail and the mobile
// bottom bar (no centre-pinning). These lock the mobile derivation.

import { describe, expect, it } from "vitest"

import { bottomNavItems } from "@/lib/pages"

const composed = [
  { slug: "home" },
  { slug: "learning" },
  { slug: "help" },
  { slug: "settings" },
]

describe("bottomNavItems — Home, Learning, Help, Settings", () => {
  it("keeps the composed order (Home FIRST, not centre-pinned)", () => {
    expect(bottomNavItems(composed).map((i) => i.slug)).toEqual([
      "home",
      "learning",
      "help",
      "settings",
    ])
  })

  it("caps the bar at 5 destinations", () => {
    const many = [...composed, { slug: "a" }, { slug: "b" }]
    expect(bottomNavItems(many)).toHaveLength(5)
  })
})
