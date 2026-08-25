// R10 (widened) — the EXTERNAL machine surface gets its own gating seam. The other
// workers gate writes with requireRight (their gating-seam suites); the mcp worker's
// writes are IDENTITY-gated instead — a bearer token (verified per request) or the
// signed-in session user — so this suite asserts every non-GET route opens with
// token/user verification. Reads handler source off disk (rules-test style) so no
// ungated door can ship on this surface either.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { stripComments } from "../../../shared/test/source"

const src = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")

/** Comments are NOT code — a comment naming a seam must never stand in for
 * calling it (the same flaw that let a deleted gate stay green in the other
 * workers' suites). Block comments first; line comments only when the `//` isn't
 * part of a `https://` URL. */

/** The body of a top-level `async function <name>(` in index.ts. */
function fnBody(name: string): string {
  const start = src.indexOf(`async function ${name}(`)
  expect(start, `handler ${name} must exist in mcp/src/index.ts`).toBeGreaterThan(-1)
  const next = src.indexOf("\nasync function ", start + 1)
  const end = next === -1 ? src.indexOf("\n/* ", start + 1) : next
  return stripComments(src.slice(start, end === -1 ? undefined : end))
}

describe("gating-seam (mcp): every non-GET route opens with identity verification", () => {
  // Parse the switchboard: every `case "METHOD /path": return await handler(...)`.
  const cases = [...src.matchAll(/case "(GET|POST|PUT|PATCH|DELETE) ([^"]+)":\s*\n\s*return (?:await )?(\w+)\(/g)].map(
    (m) => ({ method: m[1], path: m[2], handler: m[3] })
  )

  it("finds the switchboard (the scan itself must not silently go blind)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(4)
    expect(cases.some((c) => c.path === "/mcp")).toBe(true)
  })

  it("every non-GET handler verifies the caller (bearer token or session user) first", () => {
    for (const c of cases) {
      if (c.method === "GET") continue
      const body = fnBody(c.handler)
      expect(
        /(?<![A-Za-z0-9_$.])(?:verifyToken|requireUser)\s*(?:<[^(<>]*>)?\s*\(/.test(body),
        `${c.method} ${c.path} (${c.handler}) must open with verifyToken (bearer) or requireUser (session) — no unverified write ships on the machine surface`
      ).toBe(true)
    }
  })

  it("the /mcp door verifies the bearer BEFORE reading the request body", () => {
    const body = fnBody("handleMcp")
    const verifyAt = body.indexOf("verifyToken(")
    const parseAt = body.indexOf("request.json")
    expect(verifyAt, "handleMcp must verify the token").toBeGreaterThan(-1)
    expect(parseAt, "handleMcp parses the JSON-RPC body").toBeGreaterThan(-1)
    // An unauthenticated caller must cost a hash lookup at most — never a parse.
    expect(verifyAt).toBeLessThan(parseAt)
  })

  it("requireUser fails closed (throws when signed out)", () => {
    const body = fnBody("requireUser")
    expect(body).toContain('GuardError(401, "signed_out"')
  })

  // The only unauthenticated route is the health check — a new one must be a
  // conscious, reviewed decision, not a drift.
  it("GET /api/mcp/health is the ONLY route with no verification", () => {
    for (const c of cases) {
      if (c.path === "/api/mcp/health") continue
      const body = fnBody(c.handler)
      expect(
        /(?<![A-Za-z0-9_$.])(?:verifyToken|requireUser)\s*(?:<[^(<>]*>)?\s*\(/.test(body),
        `${c.method} ${c.path} must verify its caller (only /api/mcp/health is open)`
      ).toBe(true)
    }
  })
})
