// The pure core of agentic import (AGENTIC-IMPORT.md): target detection, the
// deterministic fallback planner, dependency ordering, the value normalizers, and
// the reference resolver. No network/DB/model — this is the safety-critical logic
// execution trusts, so it's fully unit-tested.

import { describe, expect, it } from "vitest"

import {
  applyTransform,
  buildFallbackPlan,
  detectTarget,
  orderTargets,
  resolveRow,
  TRANSFORMS,
  type PlanFile,
} from "../src/lib/import-plan"
import { sampleRows, TARGETS, type ReferenceDef } from "../src/lib/targets"

describe("detectTarget: pick the table a file feeds by its required columns", () => {
  it("matches learning by title (+ fuzzy headers)", () => {
    expect(detectTarget(["Title", "Category", "Body"])).toBe("learning")
  })
  it("matches dropdown values by group/value", () => {
    expect(detectTarget(["Group", "Value"])).toBe("selectable_data")
  })
  it("matches member roles by role name", () => {
    expect(detectTarget(["Role Name", "Description"])).toBe("member_roles")
  })
  it("returns null when nothing matches a required column", () => {
    expect(detectTarget(["colour", "shape"])).toBeNull()
  })
})

describe("orderTargets: parents before children (the dependency topo-sort)", () => {
  it("orders dropdown values BEFORE learning (learning.category → selectable_data)", () => {
    const { order, warnings } = orderTargets(["learning", "selectable_data"])
    expect(order.indexOf("selectable_data")).toBeLessThan(order.indexOf("learning"))
    expect(warnings).toEqual([])
  })
  it("a single independent target just returns itself", () => {
    expect(orderTargets(["member_roles"]).order).toEqual(["member_roles"])
  })
})

describe("normalizers: the fixed safe vocabulary", () => {
  it("boolean maps common truthy/falsey to yes/no", () => {
    expect(TRANSFORMS.boolean("TRUE")).toBe("yes")
    expect(TRANSFORMS.boolean("0")).toBe("no")
    expect(TRANSFORMS.boolean("maybe")).toBe("maybe")
  })
  it("iso_date parses D/M/Y and M/D/Y to YYYY-MM-DD", () => {
    expect(TRANSFORMS.iso_date("25/12/2026")).toBe("2026-12-25") // day>12 ⇒ D/M/Y
    expect(TRANSFORMS.iso_date("07/04/2026")).toBe("2026-07-04") // ambiguous ⇒ M/D/Y
    expect(TRANSFORMS.iso_date("2026-07-04T09:00Z")).toBe("2026-07-04")
    expect(TRANSFORMS.iso_date("not a date")).toBe("not a date")
  })
  it("applyTransform falls back to trim for an unknown/absent key", () => {
    expect(applyTransform("  hi  ", undefined)).toBe("hi")
    expect(applyTransform(" HI ", "lowercase")).toBe("hi")
  })
})

describe("buildFallbackPlan: a usable plan with no model", () => {
  const files: PlanFile[] = [
    { fileId: "f1", name: "articles.csv", headers: ["Title", "Category"], rowCount: 3 },
    { fileId: "f2", name: "cats.csv", headers: ["Group", "Value"], rowCount: 2 },
  ]
  it("detects both targets, orders dropdowns first, maps the required columns", () => {
    const plan = buildFallbackPlan(files)
    expect(plan.bySource).toBe("fallback")
    expect(plan.order.indexOf("selectable_data")).toBeLessThan(plan.order.indexOf("learning"))
    const learning = plan.steps.find((s) => s.target === "learning")!
    expect(learning.mapping.title).toBe("Title") // required column mapped
    expect(learning.predictedRejects).toBe(0)
  })
  it("predicts every row rejects when a required column is unmapped", () => {
    const plan = buildFallbackPlan([{ fileId: "f3", name: "x.csv", headers: ["Value"], rowCount: 5 }])
    // Only "Value" → detected as selectable_data, whose OTHER required column (type) is unmapped.
    const step = plan.steps[0]
    expect(step.predictedRejects).toBe(5)
    expect(step.notes).toMatch(/not matched/)
  })
})

describe("resolveRow: the id-mode foreign-key resolver (pure)", () => {
  const refs: ReferenceDef[] = [
    { column: "product", target: "products", by: "sku", mode: "id", onMissing: "reject" },
  ]
  it("injects the parent's new id, matched by normalized natural key", () => {
    const resolved = new Map([["products", new Map([["widgeta", "prod_123"]])]])
    const out = resolveRow({ product: "Widget A" }, refs, resolved)
    expect(out.error).toBeUndefined()
    expect(out.refs.product).toBe("prod_123")
  })
  it("rejects the row when a required reference can't be found", () => {
    const out = resolveRow({ product: "Ghost" }, refs, new Map([["products", new Map()]]))
    expect(out.error).toMatch(/No products matches "Ghost"/)
  })
  it("value-mode references are left to the child endpoint (no id injected)", () => {
    const valueRef: ReferenceDef[] = [
      { column: "category", target: "selectable_data", by: "value", mode: "value", onMissing: "create" },
    ]
    const out = resolveRow({ category: "Getting Started" }, valueRef, new Map())
    expect(out.error).toBeUndefined()
    expect(out.refs).toEqual({})
  })
})

describe("every import target yields a downloadable sample (AGENTIC-IMPORT §10)", () => {
  it("produces a header + one example row per catalog target, always", () => {
    for (const t of Object.values(TARGETS)) {
      const { header, row } = sampleRows(t)
      expect(header.length, `${t.tableKey} header`).toBe(t.columns.length)
      expect(row.length, `${t.tableKey} row`).toBe(t.columns.length)
      // No empty example cells — a required column with no `sample` still gets a hint.
      expect(row.every((c) => c.trim().length > 0), `${t.tableKey} has no blank sample cells`).toBe(true)
    }
  })
})
