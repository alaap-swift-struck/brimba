// Rule B (idempotency · CONCURRENCY.md): confirmBatch must ATOMICALLY claim the batch
// (planned → running) BEFORE it writes any rows, so a retried or concurrent confirm can't
// run the same import twice and duplicate every row. A plain read-then-check races (two
// confirms both see 'planned' and both run). This source-scan locks the claim in place.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const src = readFileSync(join(__dirname, "..", "src", "lib", "import-batch.ts"), "utf8")
const confirmBody = (() => {
  const start = src.indexOf("export async function confirmBatch")
  const next = src.indexOf("\nexport ", start + 1)
  return src.slice(start, next === -1 ? undefined : next)
})()

describe("import is idempotent — no double-run on retry", () => {
  it("confirmBatch atomically claims planned→running before writing", () => {
    expect(confirmBody, "confirmBatch must exist").toBeTruthy()
    // A conditional UPDATE to 'running' GUARDED on the current status being 'planned' —
    // so only the one confirm that wins the flip proceeds; the rest are refused.
    expect(/overall_status = 'running'/.test(confirmBody)).toBe(true)
    expect(/WHERE[\s\S]*overall_status = 'planned'/.test(confirmBody)).toBe(true)
    // The claim must come BEFORE the row-writing loop (writeRow), not after.
    const claimAt = confirmBody.indexOf("overall_status = 'running'")
    const writeAt = confirmBody.indexOf("writeRow(")
    expect(claimAt).toBeGreaterThan(-1)
    expect(writeAt).toBeGreaterThan(claimAt)
  })
})
