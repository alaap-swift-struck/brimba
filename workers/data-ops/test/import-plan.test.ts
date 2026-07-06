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
  planStep,
  resolveRow,
  scanRows,
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
      // Every REQUIRED cell has an example (optional cells may stay empty —
      // a good file doesn't have to fill every column).
      t.columns.forEach((c, i) => {
        if (c.required) expect(row[i].trim().length, `${t.tableKey} sample "${c.label}"`).toBeGreaterThan(0)
      })
    }
  })

  it("every sample would itself import cleanly (the sample IS a good file)", () => {
    for (const t of Object.values(TARGETS)) {
      const { header, row } = sampleRows(t)
      const mapping: Record<string, string | null> = {}
      t.columns.forEach((c, i) => (mapping[c.key] = header[i]))
      const scans = scanRows(t, mapping, {}, header, [row])
      expect(scans[0].reject, `${t.tableKey} sample rejects: ${scans[0].reject}`).toBeUndefined()
    }
  })

  it("the roles sample carries permission-matrix columns (export ↔ import round-trip)", () => {
    const { header, row } = sampleRows(TARGETS.member_roles)
    const i = header.indexOf("learning.read")
    expect(i).toBeGreaterThan(-1)
    expect(row[i]).toBe("yes")
  })
})

describe("scanRows: the ONE row pass behind plan prediction AND execution", () => {
  const roles = TARGETS.member_roles
  const mapping = { title: "Role name", description: "Description" }
  const headers = ["Role name", "Description"]

  it("rejects a row missing a required value, with the run's exact wording", () => {
    const scans = scanRows(roles, mapping, {}, headers, [
      ["Editor", "Can edit"],
      ["", "No name — must reject"],
    ])
    expect(scans[0].reject).toBeUndefined()
    expect(scans[1].reject).toBe('Missing required "Role name".')
  })

  it("skips an exact duplicate of an earlier row (same required values)", () => {
    const scans = scanRows(roles, mapping, {}, headers, [
      ["Editor", "first"],
      ["editor ", "same role typed twice"],
      ["Approver", "fine"],
    ])
    expect(scans[1].reject).toBe("Duplicate of row 1 in this file — skipped.")
    expect(scans[2].reject).toBeUndefined()
  })

  it("maps + normalizes values through the chosen transforms", () => {
    const scans = scanRows(roles, mapping, { title: "titlecase" }, headers, [["  editor", "x"]])
    expect(scans[0].mapped.title).toBe("Editor")
  })
})

describe("planStep with rows: the plan predicts what the run will do", () => {
  it("predicts per-row rejections (the roles-some-broken case: 2 nameless rows of 5)", () => {
    const file: PlanFile = {
      fileId: "f1",
      name: "roles-some-broken.csv",
      headers: ["Role name", "Description"],
      rowCount: 5,
      rows: [
        ["Editor", "ok"],
        ["", "nameless"],
        ["Approver", "ok"],
        ["", "nameless too"],
        ["Auditor", "ok"],
      ],
    }
    const step = planStep(file, TARGETS.member_roles, { title: "Role name", description: "Description" }, {})
    expect(step.predictedRejects).toBe(2)
    expect(step.predictedRejections).toHaveLength(2)
    expect(step.predictedRejections?.[0]).toEqual({
      file: "roles-some-broken.csv",
      row: 2,
      reason: 'Missing required "Role name".',
    })
  })

  it("predicts 0 for a clean file and omits the list", () => {
    const file: PlanFile = {
      fileId: "f2",
      name: "clean.csv",
      headers: ["Role name"],
      rowCount: 2,
      rows: [["Editor"], ["Approver"]],
    }
    const step = planStep(file, TARGETS.member_roles, { title: "Role name" }, {})
    expect(step.predictedRejects).toBe(0)
    expect(step.predictedRejections).toBeUndefined()
  })

  it("still predicts all rows reject when a required column is unmapped (no rows needed)", () => {
    const file: PlanFile = { fileId: "f3", name: "wrong.csv", headers: ["Colour"], rowCount: 3 }
    const step = planStep(file, TARGETS.member_roles, {}, {})
    expect(step.predictedRejects).toBe(3)
  })
})

describe("member_roles buildBody: the matrix rides along only when the file carries it", () => {
  it("maps yes/true/1 matrix cells into permissions", () => {
    const body = TARGETS.member_roles.buildBody({
      title: "Editor",
      description: "",
      "learning.read": "yes",
      "learning.create": "TRUE",
      "help.read": "1",
    }) as { permissions?: Record<string, Record<string, boolean>> }
    expect(body.permissions?.learning).toEqual({ read: true, create: true, edit: false, delete: false })
    expect(body.permissions?.help.read).toBe(true)
    expect(body.permissions?.teams.read).toBe(false)
  })

  it("sends NO permissions for a plain title+description row (create right only)", () => {
    const body = TARGETS.member_roles.buildBody({ title: "Editor", description: "x" }) as Record<string, unknown>
    expect("permissions" in body).toBe(false)
  })
})
