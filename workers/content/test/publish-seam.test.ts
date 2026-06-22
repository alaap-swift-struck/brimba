// THE LIVE-SYNC SEAM guard (CACHING.md "Every mutation publishes"). This test is
// the structural can't-forget guarantee: it fails CI the moment someone adds a
// state-changing route without broadcasting a live change ping. It reads the
// route table from the worker and the handler source straight off disk — so a
// new mutation that "forgets" to publish turns the build red, not silently ships
// stale screens. See workers/content/src/index.ts (ROUTES) + decision #5.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROUTES } from "../src/index"

const SRC = join(__dirname, "..", "src")

// Pull every `export async function NAME(...) { ... }` body out of a dir of .ts
// files, keyed by function name (each body runs to the next top-level export).
function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = readFileSync(join(dir, file), "utf8")
    const starts = [...code.matchAll(/export\s+async\s+function\s+(\w+)/g)]
    starts.forEach((m, i) => {
      const body = code.slice(m.index, starts[i + 1]?.index ?? code.length)
      out.set(m[1], body)
    })
  }
  return out
}

const routeFns = indexFunctions(join(SRC, "routes"))
const libFns = indexFunctions(join(SRC, "lib"))

const PUBLISH_RE = /publish(Change|UserChange|SignOut)\s*\(/
// A handler may publish indirectly through one of these lib functions; each is
// asserted below to publish itself, so the chain is real, not assumed. (None
// today — every content mutation publishes directly in its route handler.)
const INDIRECT_PUBLISHERS: string[] = []

// The ONLY writes allowed to broadcast nothing. Changing this set is a conscious,
// reviewed decision — that's the point: you can't dodge live-sync by quietly
// flipping a mutation to "housekeeping". (None today.)
const HOUSEKEEPING = new Set<string>([])

describe("live-sync seam: every mutation publishes", () => {
  it("classifies every non-GET route as mutation or housekeeping (never silently read)", () => {
    for (const [route, def] of Object.entries(ROUTES)) {
      if (route.startsWith("GET ")) {
        expect(def.kind, `${route} is a GET`).toBe("read")
      } else {
        expect(["mutation", "housekeeping"], `${route} must be classified`).toContain(def.kind)
      }
    }
  })

  it("locks the housekeeping deny-list to the reviewed set", () => {
    const declared = Object.entries(ROUTES)
      .filter(([, d]) => d.kind === "housekeeping")
      .map(([r]) => r)
    expect(new Set(declared)).toEqual(HOUSEKEEPING)
  })

  it("every mutation handler actually broadcasts a change ping", () => {
    for (const [route, def] of Object.entries(ROUTES)) {
      if (def.kind !== "mutation") continue
      const body = routeFns.get(def.handler.name)
      expect(body, `handler source for ${route} (${def.handler.name})`).toBeTruthy()
      const direct = PUBLISH_RE.test(body!)
      const indirect = INDIRECT_PUBLISHERS.some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(body!))
      expect(direct || indirect, `${route} must publish (directly or via a lib publisher)`).toBe(
        true
      )
    }
  })

  it("the indirect lib publishers really do publish (so the chain is honest)", () => {
    for (const fn of INDIRECT_PUBLISHERS) {
      const body = libFns.get(fn)
      expect(body, `lib source for ${fn}`).toBeTruthy()
      expect(PUBLISH_RE.test(body!), `${fn} must contain a publish call`).toBe(true)
    }
  })
})
