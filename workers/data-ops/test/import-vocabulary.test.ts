// A COLUMN WITH A CLOSED SET OF LEGAL VALUES CAN SAY SO.
//
// The importer normalised CASING but not VOCABULARY. It lowercased "Received" to
// "received" and shipped it; the legal word was "receipt". Two things broke:
//   (a) a human writes the word they say out loud, which is the entire point of
//       an agentic import — and it silently didn't work;
//   (b) the PLAN couldn't predict the rejection, so it promised "423 will import"
//       and 14 did. A plan that over-promises is worse than no plan, because
//       somebody approved a run on the strength of it.
//
// So the resolution lives in `scanRows` — the ONE scan that backs both the plan
// and the run — and these tests hold both halves together.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { ImportColumn } from "../../../shared/types"
import { planStep, resolveValue, scanRows } from "../src/lib/import-plan"
import type { TargetDef } from "../src/lib/targets"

const SRC = join(__dirname, "..", "src")
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8")

const KIND: ImportColumn = {
  key: "kind",
  label: "Movement kind",
  required: true,
  values: ["receipt", "issue", "adjustment"],
  aliases: { "goods in": "receipt", "goods out": "issue" },
}

/** A fixture target — the base has no vocabulary column of its own today, so the
 * seam is exercised against a target shaped the way a fork's would be. */
const MOVEMENTS: TargetDef = {
  tableKey: "stock_movements",
  module: "stock",
  displayName: "Stock movements",
  description: "fixture",
  columns: [{ key: "sku", label: "SKU", required: true }, KIND],
  endpoint: { binding: "CONTENT", path: "/api/content/stock" },
  buildBody: (r) => r,
}

describe("resolveValue — three passes, cheapest and most certain first", () => {
  it("1 · matches EXACTLY, ignoring case and punctuation", () => {
    expect(resolveValue("Receipt", KIND).value).toBe("receipt")
    expect(resolveValue("  ADJUSTMENT ", KIND).value).toBe("adjustment")
  })

  it("2 · resolves a DECLARED alias — free, repeatable, and works with no model key", () => {
    expect(resolveValue("Goods In", KIND).value).toBe("receipt")
  })

  it("3 · resolves the AGENT's map for the long tail no list anticipates", () => {
    expect(resolveValue("Received", KIND, { Received: "receipt" }).value).toBe("receipt")
  })

  it("REFUSES a word the agent invented that isn't actually legal", () => {
    // The model may propose a mapping; it may never widen the vocabulary.
    const out = resolveValue("Received", KIND, { Received: "inbound" })
    expect(out.value).toBeUndefined()
    expect(out.reject).toContain("receipt, issue, adjustment")
  })

  it("rejects an unmappable word, and SAYS what the legal ones are", () => {
    const out = resolveValue("teleported", KIND)
    expect(out.reject).toBe(
      '"teleported" isn\'t a valid movement kind — it must be one of: receipt, issue, adjustment.'
    )
  })

  it("leaves a column with NO declared vocabulary alone", () => {
    expect(resolveValue("anything at all", { key: "sku", label: "SKU", required: true }).value).toBe(
      "anything at all"
    )
  })

  it("leaves an EMPTY cell to the required-column check, not to the vocabulary", () => {
    expect(resolveValue("", KIND).value).toBe("")
  })
})

describe("the plan predicts exactly what the run will do", () => {
  const headers = ["SKU", "Movement kind"]
  const rows = [
    ["A-1", "Received"], // needs the agent's map
    ["A-2", "Goods in"], // a declared alias
    ["A-3", "issue"], // already legal
    ["A-4", "teleported"], // unmappable → a predicted SKIP with a reason
  ]
  const mapping = { sku: "SKU", kind: "Movement kind" }

  it("predicts the unmappable row as a skip, with the reason", () => {
    const step = planStep(
      { fileId: "f1", name: "moves.csv", headers, rowCount: rows.length, rows },
      MOVEMENTS,
      mapping,
      {},
      { kind: { Received: "receipt" } }
    )
    expect(step.predictedRejects, "one row, not four, and not zero").toBe(1)
    expect(step.predictedRejections?.[0]).toMatchObject({ row: 4 })
    expect(step.predictedRejections?.[0].reason).toContain("teleported")
    expect(step.valueMaps, "the agent's map is stored IN the plan, so the run applies what was reviewed").toEqual({
      kind: { Received: "receipt" },
    })
  })

  it("the RUN resolves the same rows the same way (one scan backs both)", () => {
    const scans = scanRows(MOVEMENTS, mapping, {}, headers, rows, { kind: { Received: "receipt" } })
    expect(scans.map((s) => s.mapped.kind)).toEqual(["receipt", "receipt", "issue", "teleported"])
    expect(scans.filter((s) => s.reject).length, "exactly the one the plan predicted").toBe(1)
  })

  it("WITHOUT the agent's map, the plan still predicts honestly — it does not over-promise", () => {
    const step = planStep(
      { fileId: "f1", name: "moves.csv", headers, rowCount: rows.length, rows },
      MOVEMENTS,
      mapping,
      {}
    )
    // "Received" is now unresolvable too — and the plan SAYS so rather than
    // promising a row the door would refuse.
    expect(step.predictedRejects).toBe(2)
  })

  it("drops a value map for a column that has no vocabulary (noise, not an instruction)", () => {
    const step = planStep(
      { fileId: "f1", name: "moves.csv", headers, rowCount: 1, rows: [rows[2]] },
      MOVEMENTS,
      mapping,
      {},
      { sku: { "A-3": "A-9" } } // sku declares no `values`
    )
    expect(step.valueMaps).toBeUndefined()
  })
})

describe("the agent is told the vocabulary", () => {
  const agent = read("lib", "import-agent.ts")

  it("puts each vocabulary column's legal values in the catalog prompt", () => {
    expect(agent, "the model can only map a word onto a list it can see").toContain("one of: ")
    expect(agent).toContain("c.values")
  })

  it("asks for the mapping back, and forbids inventing a value", () => {
    expect(agent).toContain("valueMaps")
    expect(agent, "the model proposes a mapping; it may never widen the vocabulary").toMatch(
      /NEVER invent a legal value/
    )
  })

  it("parses valueMaps back through planStep (validated, never trusted raw)", () => {
    const at = agent.indexOf("const valueMaps")
    expect(at, "the reply's valueMaps must be read").toBeGreaterThan(-1)
    expect(agent).toContain("planStep(file, def, mapping, transforms, valueMaps)")
  })
})
