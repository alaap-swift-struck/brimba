// Money-safety invariants for the agent credit meter, checked by READING the source
// off disk (like publish-seam) — so a future refactor of credits.ts can't quietly
// drop the guard that keeps a paid balance from going negative. The concurrency rule
// (CONCURRENCY.md): the PAID decrement must be atomic + never-negative; the FREE
// counter is deliberately best-effort (over-serving a free unit costs nothing).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const CREDITS = readFileSync(join(__dirname, "../src/lib/credits.ts"), "utf8")

describe("credit meter money-safety (source invariants)", () => {
  it("decrements the paid balance atomically and NEVER below zero", () => {
    // One UPDATE that both subtracts and guards `balance > 0` in the same statement —
    // so two concurrent spends can't drive real money negative (D1 applies each atomically).
    expect(CREDITS).toMatch(/UPDATE\s+agent_credits\s+SET\s+balance\s*=\s*balance\s*-\s*1/i)
    expect(CREDITS).toMatch(/WHERE[^;]*balance\s*>\s*0/i)
  })

  it("treats a no-op decrement (nothing changed) as out-of-credits, not success", () => {
    // If the guarded UPDATE changed 0 rows, the balance was already empty → block.
    expect(CREDITS).toMatch(/changes/)
  })

  it("keeps the free daily allowance configurable per env (AGENT_FREE_DAILY)", () => {
    // A hard-coded number here is the drift the docs kept tripping on — lock the knob.
    expect(CREDITS).toMatch(/AGENT_FREE_DAILY/)
    expect(CREDITS).toMatch(/FREE_DAILY\s*=\s*\d+/)
  })
})
