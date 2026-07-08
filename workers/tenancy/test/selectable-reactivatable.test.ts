// Regression guard for the "deactivate is a dead end" bug: the dropdown-values LIST
// must RETURN deactivated values (each flagged `active`) so a retired value can be
// seen and reactivated — never filter itself to active-only. Roles + learning already
// do this; selectable regressed to `WHERE deactivated_at IS NULL` once, which made a
// deactivated value vanish with no way back (and left the MCP unable to reactivate it,
// since the id was no longer listable). Reads the lib source off disk.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const src = readFileSync(join(__dirname, "..", "src", "lib", "selectable.ts"), "utf8")

/** The body of `export async function <fn>` up to the next top-level export. */
function fnBody(fn: string): string {
  const start = src.indexOf(`export async function ${fn}`)
  if (start === -1) return ""
  const next = src.indexOf("\nexport ", start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe("dropdown values stay reactivatable (not a dead end)", () => {
  it("listSelectable surfaces deactivated values, never filters itself to active-only", () => {
    const body = fnBody("listSelectable")
    expect(body, "listSelectable must exist").toBeTruthy()
    // It surfaces the active state (so the manager can grey + reactivate)...
    expect(body).toContain("deactivated_at")
    // ...and must NOT hide deactivated rows behind an active-only filter.
    expect(
      /WHERE\s+deactivated_at\s+IS\s+NULL/i.test(body),
      "listSelectable must return deactivated values so they can be reactivated"
    ).toBe(false)
  })

  it("toValue maps the active flag (so form pickers can filter active)", () => {
    expect(src).toContain("active: r.deactivated_at == null")
  })
})
