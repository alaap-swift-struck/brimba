// Screen-trace parity: every WRITE tool in the agent's catalog must map to a real
// screen (agent-trace.ts) or sit on the explicit SCREENLESS list with a reason —
// so the co-pilot's "watch it happen on the real screen" can never silently rot
// as tools are added. agent-trace.ts is deliberately pure/DOM-free so this
// worker-side test can import it.

import { describe, expect, it } from "vitest"

import { SCREENLESS_WRITE_TOOLS, traceFor } from "../../../web/lib/agent-trace"
import { TOOL_CATALOG } from "../src/lib/tools"

describe("screen-trace parity: the co-pilot can show every write on a real screen", () => {
  it("every write tool traces to a screen (or is explicitly screenless)", () => {
    for (const t of TOOL_CATALOG) {
      if (!t.write || t.identityBlocked) continue
      if (SCREENLESS_WRITE_TOOLS.includes(t.name)) continue
      const target = traceFor(t.name, { id: "x", roleId: "x", userId: "x", inviteId: "x", helpId: "x", batchId: "x" }, "team1")
      expect(target, `write tool "${t.name}" must map to a screen in agent-trace.ts (or join SCREENLESS_WRITE_TOOLS with a reason)`).not.toBeNull()
      expect(target?.path.startsWith("/t/team1"), `"${t.name}" must target the team host`).toBe(true)
    }
  })

  it("detail-target tools land on the RECORD when ids are present", () => {
    expect(traceFor("update_role", { roleId: "R1" }, "tm")?.path).toBe("/t/tm/roles/R1")
    expect(traceFor("set_member_role", { userId: "U1" }, "tm")?.path).toBe("/t/tm/members/U1")
    expect(traceFor("run_import_batch", { batchId: "B1" }, "tm")?.path).toBe("/t/tm/import")
  })

  it("reads stay quiet (no screen driving for list_*)", () => {
    expect(traceFor("list_roles", {}, "tm")).toBeNull()
  })
})
