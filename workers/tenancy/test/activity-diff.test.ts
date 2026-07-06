// The field-diff sentence every edit's activity row carries (the activity
// ruleset: edits name WHICH fields changed, old → new — not just "edited").

import { describe, expect, it } from "vitest"

import { describeChanges } from "../../../shared/workers/activity"

describe("describeChanges: name what changed, old → new", () => {
  it("shows changed values, drops unchanged ones", () => {
    const out = describeChanges([
      { label: "Name", from: "Editor", to: "Senior Editor" },
      { label: "Description", from: "same", to: "same" },
    ])
    expect(out).toBe('Name: "Editor" → "Senior Editor"')
  })

  it("says set / cleared for empty sides", () => {
    expect(describeChanges([{ label: "Category", from: "", to: "Security" }])).toBe(
      'Category set to "Security"'
    )
    expect(describeChanges([{ label: "Link", from: "https://x.com", to: null }])).toBe(
      'Link cleared (was "https://x.com")'
    )
  })

  it("hides long/rich values behind '<label> updated'", () => {
    expect(describeChanges([{ label: "Body", from: "<p>a</p>", to: "<p>b</p>", hideValues: true }])).toBe(
      "Body updated"
    )
  })

  it("clips long values so the feed stays readable", () => {
    const long = "x".repeat(100)
    expect(describeChanges([{ label: "Description", from: "", to: long }])).toContain("…")
  })

  it("returns empty when nothing differs (caller keeps its plain sentence)", () => {
    expect(describeChanges([{ label: "Name", from: "A", to: "A" }])).toBe("")
  })
})
