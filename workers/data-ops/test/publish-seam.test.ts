// THE LIVE-SYNC SEAM guard (CACHING.md "Every mutation publishes"), per the content
// worker's. It fails CI the moment a state-changing route is added without a live
// change ping — unless it's a consciously reviewed housekeeping write. Here the
// import session steps (start/file/mapping) and the owner catalog seed are
// housekeeping (the caller's own draft / global owner data, no team broadcast); only
// the confirm WRITE creates shared rows, so only it publishes.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ROUTES } from "../src/index"

const SRC = join(__dirname, "..", "src")

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
const INDIRECT_PUBLISHERS: string[] = []

// The ONLY writes allowed to broadcast nothing — a conscious, reviewed decision.
const HOUSEKEEPING = new Set<string>([
  "POST /api/data-ops/import",
  "POST /api/data-ops/import/file",
  "POST /api/data-ops/import/mapping",
  "POST /api/data-ops/admin/seed-targets",
  // The batch draft/file/plan steps only shape the caller's OWN batch (returned in
  // the same response) — no other screen needs a ping. Only /batch/confirm writes
  // shared rows, so only it publishes (it's classified "mutation").
  "POST /api/data-ops/import/batch",
  "POST /api/data-ops/import/batch/file",
  "POST /api/data-ops/import/batch/plan",
  // The agent's chat/confirm write only the caller's own private conversation; any
  // team-visible effect is published by the gated endpoint the executor calls.
  "POST /api/data-ops/agent/chat",
  "POST /api/data-ops/agent/confirm",
  // Resolving an error-log row is private maintainer bookkeeping in the core DB
  // (owner-only, x-admin-key) — no team screen shows it, so nothing to broadcast.
  "POST /api/data-ops/admin/errors/resolve",
])

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
