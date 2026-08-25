// R19 — AGENT/MCP FILTER PARITY. Any tool sitting on a screen's list door must
// EXPOSE and FORWARD every filter that door parses — or the assistant falls back
// to free text and answers a DIFFERENT question (downstream: 3,465 descriptions
// that merely mentioned the words instead of the 134 records carrying the value).
// The required filter set is DERIVED from the door's own parameter parsing
// (searchParams.get calls in its handler) — never hand-listed here.

import { describe, expect, it } from "vitest"

import { SHARED_TOOLS } from "../../../shared/workers/tool-catalog"
import { doors, type Worker } from "./door-source"

/** The params a door's handler parses, derived from ITS OWN source. The walk from a
 * route to the handler serving it lives in door-source.ts — shared with the
 * lost-update check, which asks the same question from the other end. */
function doorParams(worker: Worker, path: string): string[] {
  const door = doors(worker).find((d) => d.route === `GET ${path}`)
  if (!door) return []
  return [...door.body.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((x) => x[1])
}

describe("agent-filter-parity (R19): tools forward every filter their door parses", () => {
  const listTools = SHARED_TOOLS.filter((t) => t.method === "GET")

  it("finds GET tools to check (the scan must not silently go blind)", () => {
    expect(listTools.length).toBeGreaterThanOrEqual(5)
  })

  for (const t of SHARED_TOOLS) {
    if (t.method !== "GET") continue
    it(`${t.name} exposes + forwards every param its door (${t.path}) parses`, () => {
      const params = doorParams(t.binding === "TENANCY" ? "tenancy" : "content", t.path)
      const props = Object.keys(
        (t.schema as { properties?: Record<string, unknown> }).properties ?? {}
      )
      const buildQuery = t.buildQuery?.toString() ?? ""
      for (const p of params) {
        expect(
          props.includes(p),
          `door ${t.path} parses "${p}" but tool ${t.name}'s schema doesn't expose it — the model can't send a filter it can't see`
        ).toBe(true)
        expect(
          buildQuery.includes(p),
          `tool ${t.name} exposes "${p}" but its buildQuery never forwards it — the door would silently ignore the filter`
        ).toBe(true)
      }
    })
  }
})
