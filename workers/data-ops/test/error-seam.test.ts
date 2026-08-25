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

import { catchBodies, declarationBody, stripComments } from "../../../shared/test/source"

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
      // COMMENTS STRIPPED, and only the ENTRY-POINT catch. The first version of
      // this check had both faults, and error_log_review proved both by
      // simulation in the re-measure: a comment reading
      // `// TODO: post to /internal/log-error` turned it green with the real call
      // deleted, and joining EVERY catch body meant one worker's cron recorder
      // covered for a neutered central catch. The recorder has to be in the catch
      // that wraps the request, or a crash on the request path records nothing.
      // THE `fetch` HANDLER'S OWN CATCH. Not the file (a recorder anywhere passes),
      // not the whole default export (which also holds `scheduled` — and a
      // sabotage of tenancy's REQUEST catch stayed green because the CRON's
      // recorder, twenty lines below in the same object, covered for it).
      // A crash on the request path has to be recorded by the request path.
      const code = stripComments(src)
      // BRACE-MATCHED, not sliced to `async scheduled(`. Only tenancy has a
      // scheduled handler, so on the other six workers that slice ran to END OF
      // FILE — the exact fault this suite was rewritten to remove, reintroduced
      // in the rewrite. (speed/error_log round 3, 2026-08-25.)
      // From `export default`, because the FIRST `async fetch(` in a file is not
      // necessarily the worker's: realtime declares a Durable Object with its own
      // fetch eighty lines above, and anchoring on the first match brace-matched
      // that one instead — which has no recorder, and correctly said so about the
      // wrong function.
      const exported = code.indexOf("export default")
      const start = exported === -1 ? -1 : code.indexOf("async fetch(", exported)
      let entry = ""
      if (start !== -1) {
        const open = code.indexOf("{", start)
        let depth = 0
        let i = open
        while (i < code.length) {
          if (code[i] === "{") depth++
          else if (code[i] === "}" && --depth === 0) break
          i++
        }
        entry = code.slice(start, i + 1)
      }
      expect(start, `${w} has no fetch handler — this scan has gone blind`).toBeGreaterThan(-1)
      const inline = catchBodies(entry).join("\n")

      // A catch may DELEGATE to a helper in the same file, and on 2026-08-25 the
      // gateway's started to: its central catch and its new downstream-failure
      // recorder were writing the same row two different ways, which is how two
      // copies of one body drift apart. Hoisting them into one `sendErrorRow`
      // was right — and it turned this check red, because the check was reading
      // for the literal INSIDE the catch rather than asking whether the request
      // path reaches the recorder.
      //
      // So: follow the helpers the catch ACTUALLY CALLS, one level, and only
      // ones declared in this same file. That is the honest widening. Searching
      // the whole file instead would pass on a recorder the catch never calls —
      // which is the exact fault the comment above records this check having had.
      const called = new Set([...inline.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1]))
      const helpers = [...called]
        .map((name) => {
          const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(code)
          return decl ? declarationBody(code, decl.index) : ""
        })
        .join("\n")
      const catches = `${inline}\n${helpers}`

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

// A 5xx GuardError is an OUTAGE, not a refusal, and must leave a row.
//
// `GuardError` carries both. A 403 is the system working — recording it would
// fill the table with correct behaviour. But `whoAmI` throws 503 when AUTH does
// not answer, and it is the busiest call in the base: an auth outage 503s every
// screen for everyone and used to leave its only evidence in an absence. Every
// central catch returned on `instanceof GuardError` BEFORE reaching the recorder.
describe("a 5xx refusal is recorded; a 4xx one is not", () => {
  for (const w of WORKERS) {
    const src = readFileSync(join(__dirname, `../../${w}/src/index.ts`), "utf8")
    if (!/instanceof GuardError/.test(src)) continue
    it(`${w} splits its GuardError branch on the status`, () => {
      // ONE regex spanning both halves, not two over a fixed window. The first
      // version took 600 characters from `instanceof GuardError` and asked
      // separately for `status >= 500` and for `recordWorkerError` — and the
      // GENERIC catch's recorder sits inside that window, 292–316 characters
      // away. So deleting the 5xx branch's own recorder left it GREEN on all four
      // workers: it was checking that two unrelated things existed near each
      // other. (error_log round 3, 2026-08-25.)
      const code = stripComments(src)
      expect(
        code,
        `${w} must record a GuardError whose status is 5xx — an outage that returns without a row is the one incident you cannot investigate`
      ).toMatch(/status\s*>=\s*500\s*\)?\s*\n?\s*await recordWorkerError\(/)
    })
  }
})
