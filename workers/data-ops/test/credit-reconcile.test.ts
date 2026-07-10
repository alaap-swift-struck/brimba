// A confirmed command must stay ONE reconciling history entry. A command that pauses for a
// yes/no confirm spans two turns (propose + confirm); if the confirm-continuation wrote its
// own "(continued)" usage-log row, the history read as 1 + 1 while the balance dropped by 2
// (the reconciliation bug a teammate reported: balance -3, history 1+1). The confirm turn
// must instead FOLD its units into the propose row. These source-scans lock that in — no DB,
// like publish-seam / import-idempotency.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const credits = readFileSync(join(__dirname, "..", "src", "lib", "credits.ts"), "utf8")
const agent = readFileSync(join(__dirname, "..", "src", "lib", "agent.ts"), "utf8")

const confirmBody = (() => {
  const start = agent.indexOf("export async function confirmAndRun")
  const next = agent.indexOf("\nexport ", start + 1)
  return agent.slice(start, next === -1 ? undefined : next)
})()

describe("credit history reconciles with the balance (one row per command)", () => {
  it("foldUsageIntoLatest folds units into the latest command row (an UPDATE, not a new row)", () => {
    const start = credits.indexOf("export async function foldUsageIntoLatest")
    expect(start, "foldUsageIntoLatest must exist").toBeGreaterThan(-1)
    const body = credits.slice(start, credits.indexOf("\nexport ", start + 1))
    // It UPDATEs the newest row for this team+actor (the propose row) — not a fresh INSERT.
    expect(/UPDATE agent_usage_log/.test(body), "must UPDATE the existing row").toBe(true)
    expect(/ORDER BY created_at DESC LIMIT 1/.test(body), "must target the LATEST row").toBe(true)
    expect(/credits = credits \+ \?/.test(body), "must ADD the units, not overwrite").toBe(true)
    // Mixing pools flips the row to 'mixed' (free row + a credit unit → mixed).
    expect(/'mixed'/.test(body)).toBe(true)
  })

  it("confirmAndRun FOLDS its units instead of writing a separate '(continued)' row", () => {
    expect(confirmBody, "confirmAndRun must exist").toBeTruthy()
    // The confirm continuation folds (both the failure wrap-up path and the resumed loop).
    expect(/foldUsageIntoLatest/.test(confirmBody), "confirm turn must fold its units").toBe(true)
    expect(/fold: true/.test(confirmBody), "the resumed loop runs in fold mode").toBe(true)
    // It must NOT write its own row via logUsage — that was the split "(continued)" row.
    expect(/\blogUsage\(/.test(confirmBody), "confirm path must fold, never logUsage a new row").toBe(false)
  })
})
