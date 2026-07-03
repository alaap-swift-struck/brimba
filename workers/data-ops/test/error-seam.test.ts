// The error-RECORDING seam, machine-checked like the publish seam: every worker
// that binds the core DB must record unexpected crashes into the central
// error_logs table from its central catch (ERROR-HANDLING.md). A worker whose
// catch stops calling recordWorkerError silently loses its error history — this
// test reads the four switchboards off disk so that can't happen quietly.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WORKERS = ["auth", "tenancy", "content", "data-ops"]

describe("error seam: every core-bound worker records crashes centrally", () => {
  for (const w of WORKERS) {
    it(`${w}'s central catch calls recordWorkerError`, () => {
      const src = readFileSync(join(__dirname, `../../${w}/src/index.ts`), "utf8")
      expect(src, `${w} must import the seam`).toMatch(/from "\.\.\/\.\.\/\.\.\/shared\/workers\/error-log"/)
      expect(src, `${w} must record in its catch`).toMatch(/recordWorkerError\(env\.DB/)
    })
  }
})
