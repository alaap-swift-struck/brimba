// R16 — EVERY COLLECTION SHOWS ITS COUNT EXACTLY ONCE, machine-checked
// (see RULES.md + shared/rules/registry.ts). Read source straight off disk.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { TEAM_SECTIONS } from "@/lib/pages"

import { WEB, componentFiles, read } from "./_paths"

describe("RULES — the counted collections", () => {
  // R16 — every screen showing a collection shows its count exactly once: the
  // NUMBER through the one formatCount seam (never rows.length), the PLACE a
  // counted tab or a CollectionHeading, the ARBITRATION a context (a counted tab
  // wins; the heading stands down).
  it("counted-collections: server totals through ONE seam, one place, arbitrated", () => {
    // (i) THE NUMBER — no component builds a count badge from a loaded list's length.
    const lengthBadges = componentFiles().filter((f) => /badge:[^,\n]*\.length/.test(read(f)))
    expect(
      lengthBadges,
      `a capped list's length is a ceiling, not a total (R16) — badge from the server total via formatCount: ${lengthBadges.join(", ")}`
    ).toEqual([])
    // …and the badge builders route through the seam.
    expect(read(join(WEB, "components", "team-section-nav.tsx"))).toContain("formatCount")
    const moduleContent = read(join(WEB, "components", "deep-link", "module-content.tsx"))
    expect(moduleContent).toContain("formatCount")

    // (ii) THE PLACE — every registry section with a count key whose placement
    // isn't "tab" renders a CollectionHeading (derived, never hand-listed).
    for (const s of TEAM_SECTIONS) {
      if (!s.countCacheKey || s.placement === "tab") continue
      const rendered = componentFiles().some((f) =>
        read(f).includes(`<CollectionHeading sectionKey="${s.key}"`)
      )
      expect(rendered, `sidebar collection "${s.key}" must render a CollectionHeading (R16 ii)`).toBe(true)
    }

    // (iii) THE ARBITRATION — the context exists; the heading consults it ABOVE
    // its early return and returns null when marked; the tab host marks badged
    // panels only; a file with both a counted tab and a heading imports the seam.
    const counted = read(join(WEB, "components", "counted-tabs.tsx"))
    expect(counted).toContain("createContext")
    expect(counted).toContain("CountedAbove")
    const heading = read(join(WEB, "components", "collection-heading.tsx"))
    const hookAt = heading.indexOf("useCountStandsDown()")
    const returnAt = heading.indexOf("return null")
    expect(hookAt, "the heading must consult the arbitration hook").toBeGreaterThan(-1)
    expect(returnAt, "the heading must stand down (return null) when marked").toBeGreaterThan(hookAt)
    const host = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(host, "the tab host marks badged panels via CountedTabs").toContain("<CountedTabs badged=")
    for (const f of componentFiles()) {
      const src = read(f)
      if (/badge: (formatCount|[a-z]+Badge)/.test(src) && /<CollectionHeading/.test(src))
        expect(
          /CountedAbove|CountedTabs/.test(src),
          `${f} shows a counted tab AND a heading — it must import the arbitration seam (R16 iii)`
        ).toBe(true)
    }
  })
})
