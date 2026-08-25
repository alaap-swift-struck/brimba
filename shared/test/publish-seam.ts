// THE LIVE-SYNC SEAM guard (LAW R1, CACHING.md "Every mutation publishes"), for
// every worker, from ONE scanner.
//
// It fails the build the moment a state-changing route ships without
// broadcasting a live change ping. It reads the worker's own route table and its
// handler source off disk, so a mutation that "forgets" to publish turns the
// build red rather than silently shipping stale screens to everyone else.
//
// It exists as a shared module because the three copies it replaces each carried
// a private `indexFunctions` with BOTH of the reader faults this repo spent a day
// removing: it sliced each handler to the next EXPORTED function — swallowing
// every private helper in between and reading their code as the handler's — and
// it never stripped comments, so `// publishChange(...)` in a comment would
// satisfy the very call it describes the absence of. Probing all 78 handlers on
// 2026-08-25 found zero false passes, so this was fragile rather than blind; the
// same construction WAS blind in three other checks. Fixing the readers is not
// enough if three copies of the old reader survive.

import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { declarationBody, read, stripComments } from "./source"

type RouteTable = Record<string, { handler: { name: string }; kind?: string }>

const PUBLISH_RE = /publish(Change|UserChange|SignOut)\s*\(/

/** Every `export async function NAME` body in a directory, keyed by name —
 * through the shared reader, so one declaration means one body. */
function exportedFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = read(join(dir, file))
    for (const m of code.matchAll(/export\s+async\s+function\s+(\w+)/g))
      out.set(m[1], stripComments(declarationBody(code, m.index!)))
  }
  return out
}

export function describePublishSeam(opts: {
  /** The worker's name, for the suite title. */
  worker: string
  /** Its ROUTES table, imported by the caller so this stays type-safe. */
  routes: RouteTable
  /** Its `src` directory — handlers come from `<srcDir>/routes`, indirect
   * publishers from `<srcDir>/lib`. */
  srcDir: string
  /**
   * The ONLY writes allowed to broadcast nothing, each with its reason. This is
   * the point of the list: you cannot dodge live-sync by quietly reclassifying a
   * mutation as housekeeping — the set is asserted to match the route table
   * exactly, in both directions.
   */
  housekeeping?: Record<string, string>
  /** Handlers that publish through a lib function rather than inline. Each named
   * function is itself asserted to publish, so the chain is proven, not assumed. */
  indirectPublishers?: string[]
}): void {
  const { worker, routes, srcDir, housekeeping = {}, indirectPublishers = [] } = opts
  const routeFns = exportedFunctions(join(srcDir, "routes"))
  const libFns = exportedFunctions(join(srcDir, "lib"))

  describe(`live-sync seam (${worker}): every mutation publishes`, () => {
    it("read the handlers at all", () => {
      // The tripwire the copies never had. An empty map passes every assertion
      // below by vacuous truth.
      expect(routeFns.size, `no handlers found under ${worker}/src/routes — this scan has gone blind`).toBeGreaterThan(3)
      expect(Object.keys(routes).length, `${worker}'s ROUTES table is empty`).toBeGreaterThan(3)
    })

    it("classifies every non-GET route as mutation or housekeeping (never silently read)", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (route.startsWith("GET ")) expect(def.kind, `${route} is a GET`).toBe("read")
        else expect(["mutation", "housekeeping"], `${route} must be classified`).toContain(def.kind)
      }
    })

    it("locks the housekeeping deny-list to the reviewed set", () => {
      const declared = Object.entries(routes)
        .filter(([, d]) => d.kind === "housekeeping")
        .map(([r]) => r)
      expect(new Set(declared)).toEqual(new Set(Object.keys(housekeeping)))
      for (const [route, why] of Object.entries(housekeeping))
        expect(why.length, `${route} needs a real reason for publishing nothing`).toBeGreaterThan(30)
    })

    it("every mutation handler actually broadcasts a change ping", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (def.kind !== "mutation") continue
        const body = routeFns.get(def.handler.name)
        expect(body, `handler source for ${route} (${def.handler.name})`).toBeTruthy()
        const direct = PUBLISH_RE.test(body!)
        const indirect = indirectPublishers.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(body!))
        expect(direct || indirect, `${route} must publish (directly or via a lib publisher)`).toBe(true)
      }
    })

    it("the indirect lib publishers really do publish (so the chain is honest)", () => {
      for (const fn of indirectPublishers) {
        const body = libFns.get(fn)
        expect(body, `lib source for ${fn}`).toBeTruthy()
        expect(PUBLISH_RE.test(body!), `${fn} must contain a publish call`).toBe(true)
      }
    })
  })
}
