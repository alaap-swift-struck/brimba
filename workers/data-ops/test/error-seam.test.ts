// The error-RECORDING seam, machine-checked like the publish seam: every worker
// must record unexpected crashes into the central error_logs table from its
// central catch (ERROR-HANDLING.md). A worker whose catch stops calling
// recordWorkerError silently loses its error history.
//
// THE LIST IS DERIVED, NOT WRITTEN DOWN. Until 2026-08-25 it read
// `const WORKERS = ["auth", "tenancy", "content", "data-ops"]`, so the two
// workers that most needed it were invisible to the law that claimed to cover
// them: the PUBLIC gateway — where `GET /media/%` reaches `decodeURIComponent`
// unauthenticated and threw a bare platform 500 with no row — and realtime,
// which has held a `DB` binding the whole time. A hardcoded subject list does
// not fail when it is wrong; it passes, and says everything is covered.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { catchBodies } from "../../../shared/test/source"

const WORKERS = readdirSync(join(__dirname, "..", ".."), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

describe("error seam: every worker records crashes centrally", () => {
  it("found every worker on disk, rather than a list someone maintained", () => {
    // The tripwire the hardcoded version never had.
    expect(WORKERS.length, "the worker scan found nothing — it has gone blind").toBeGreaterThan(5)
    expect(WORKERS).toContain("gateway")
    expect(WORKERS).toContain("realtime")
  })

  for (const w of WORKERS) {
    it(`${w}'s central catch reaches the central error log`, () => {
      const src = readFileSync(join(__dirname, `../../${w}/src/index.ts`), "utf8")
      // INSIDE A CATCH, not merely somewhere in the file. Grepping the whole
      // source answered "yes" for the gateway while its central catch recorded
      // nothing — the same door name appears in the browser error-beacon route
      // below it. Proven by sabotage on 2026-08-25: the file-wide version stayed
      // green with the recording deliberately broken.
      const catches = catchBodies(src).join("\n")

      // TWO sanctioned routes, and only two.
      //
      // (a) THE SEAM, for a worker that binds a database — through `opsDatabase`,
      //     not a named binding: error_logs moved to the operations database and
      //     the seam falls back to the core one, so pinning `env.DB` would fail
      //     the moment a worker did the right thing.
      const viaSeam =
        /from "[./]*shared\/workers\/error-log"/.test(src) &&
        /recordWorkerError\(opsDatabase\(env\)/.test(catches) &&
        /from "[./]*shared\/workers\/ops-db"/.test(src)

      // (b) THE INTERNAL DOOR, for a worker that deliberately binds no database.
      //     The gateway is the one: it is the busiest worker in the base and the
      //     only public one, and giving it a D1 handle to write one row per crash
      //     is a larger change than the fault warrants. It posts to auth's
      //     existing `/internal/log-error`, which writes the same table.
      const viaDoor = /\/internal\/log-error/.test(catches) && /source: "/.test(catches)

      expect(
        viaSeam || viaDoor,
        `${w} must record a crash centrally — either recordWorkerError(opsDatabase(env), …) or a POST to /internal/log-error`
      ).toBe(true)

      // And it must have somewhere to record FROM. A worker with no catch at all
      // cannot record anything, however many seams it imports.
      expect(catches.length, `${w} must have a central catch to record from`).toBeGreaterThan(0)
    })
  }
})
