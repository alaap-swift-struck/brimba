// THE LIVE-SYNC SEAM guard (CACHING.md "Every mutation publishes"). This test is
// the structural can't-forget guarantee: it fails CI the moment someone adds a
// state-changing route without broadcasting a live change ping. It reads the
// route table from the worker and the handler source straight off disk — so a
// new mutation that "forgets" to publish turns the build red, not silently ships
// stale screens. See workers/tenancy/src/index.ts (ROUTES) + decision #5.

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
// asserted below to publish itself, so the chain is real, not assumed.
const INDIRECT_PUBLISHERS = ["createTeam", "acceptPendingInvites", "acceptInvite"]

// The ONLY writes allowed to broadcast nothing. Changing this set is a conscious,
// reviewed decision — that's the point: you can't dodge live-sync by quietly
// flipping a mutation to "housekeeping".
const HOUSEKEEPING = new Set([
  "POST /api/tenancy/switch-team", // flips the caller's own current-team pointer
  "POST /api/tenancy/admin/migrate-teams", // ops: roll team-schema migrations
  "POST /api/tenancy/admin/move-module", // ops: relocate a module's DB
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

// THE PERMISSION-GATING SEAM guard (LAW R10) — the security counterpart to the
// live-sync seam above. Every state-changing (non-GET) route must open with a
// permission gate: requireRight / requireAnyImportRight, the gated()/gatedBody()
// wrapper that calls it, or adminGuard for an owner endpoint. The ONE reviewed
// exception is an IDENTITY-gated write — a teamless / own-pointer / ownership action
// with no team-right to check, which gates on whoAmI instead. Reads handler source
// off disk, so a new write that forgets to gate turns the build red: no ungated door
// can ship.
const GATED_RE = /require\w*Right|\bgated|adminGuard/
const IDENTITY_GATED = new Set<string>([
  "POST /api/tenancy/bootstrap", // teamless onboarding — no team-right exists yet
  "POST /api/tenancy/switch-team", // flips the caller's OWN current-team pointer
  "POST /api/tenancy/teams", // create a team — any signed-in user, no prior membership
  "POST /api/tenancy/invitations/accept", // accept a received invite — gates on email ownership
])

describe("permission-gating seam (R10): every write gates", () => {
  it("every non-GET handler gates on a right — or is a reviewed identity-gated write", () => {
    for (const [route, def] of Object.entries(ROUTES)) {
      if (route.startsWith("GET ")) continue
      const body = routeFns.get(def.handler.name)
      expect(body, `handler source for ${route} (${def.handler.name})`).toBeTruthy()
      if (IDENTITY_GATED.has(route)) {
        expect(/whoAmI/.test(body!), `${route} must still gate on identity (whoAmI)`).toBe(true)
      } else {
        expect(GATED_RE.test(body!), `${route} must gate (requireRight / gated / adminGuard)`).toBe(true)
      }
    }
  })

  it("the identity-gated allow-list has no stale entries", () => {
    const all = new Set(Object.keys(ROUTES))
    for (const route of IDENTITY_GATED)
      expect(all.has(route), `${route} is allow-listed but no longer a route`).toBe(true)
  })
})
