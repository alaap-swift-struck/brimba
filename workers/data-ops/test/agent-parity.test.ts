// Law R9 — agent-app parity (`agent-app-parity`). The agent's system prompt must
// carry a capability brief GENERATED from the import/export catalog, plus the
// glossary — read straight off the same code the screens render from. If a target,
// sample, export or product term exists in the app but not in the agent's head,
// this test goes red: the agent can never again tell a user a capability doesn't
// exist while the UI shows it (the "no bulk import for dropdown values" bug class).

import { describe, expect, it } from "vitest"

import { GLOSSARY } from "../../../shared/glossary"
import { capabilityBrief } from "../src/lib/app-brief"
import { SYSTEM } from "../src/lib/agent"
import { TARGETS } from "../src/lib/targets"

describe("agent-app parity (Law R9): the agent knows what the app can do", () => {
  it("the system prompt carries the generated capability brief", () => {
    expect(SYSTEM).toContain(capabilityBrief())
  })

  it("every import target is in the agent's head, by its exact display name", () => {
    for (const t of Object.values(TARGETS)) {
      expect(SYSTEM, `agent must know the "${t.displayName}" import`).toContain(t.displayName)
    }
  })

  it("the agent knows about sample files and the Import screen", () => {
    expect(SYSTEM).toMatch(/SAMPLE file/i)
    expect(SYSTEM).toContain("Import screen")
  })

  it("every exportable table is presented as exportable", () => {
    const brief = capabilityBrief()
    for (const t of Object.values(TARGETS)) {
      if (!t.exportPath) continue
      const line = brief.split("\n").find((l) => l.startsWith(`- ${t.displayName}`))
      expect(line, `brief line for ${t.displayName}`).toBeDefined()
      expect(line, `${t.displayName} must be presented as exportable`).toContain("EXPORT")
    }
  })

  it("every glossary term rides in the prompt (one dictionary — Law R6 meets R9)", () => {
    for (const g of Object.values(GLOSSARY)) {
      expect(SYSTEM, `glossary term "${g.term}"`).toContain(g.term)
    }
  })
})
