// R10 — THE GATING SEAM, scanned once for every worker that gates with rights.
//
// The security counterpart to publish-seam: it fails CI the moment a
// state-changing route ships without a permission gate. It reads the worker's own
// route table and its handler source straight off disk, so an ungated door cannot
// hide behind a comment or a helper name.
//
// WHY THIS IS SHARED. Three workers (tenancy, content, data-ops) had a
// near-identical 90-line copy of this scan, and the count went from three to four
// the day the mcp worker landed — the shape of a duplication that keeps growing.
// Worse than the line count: a fix to one copy is a fix to one copy, so the
// STRONGEST version of a security check silently stops being the version most
// workers run. Both hard-won lessons below now live in exactly one place:
//
//   • COMMENTS ARE NOT CODE. This repo comments heavily and its comments discuss
//     the very seams being scanned ("no requireRight (it's about you)"), and a
//     handler's slice runs to the next top-level export, so it swallows the doc
//     comment introducing the next function. Without stripping, a handler whose
//     real gate was DELETED stayed green, satisfied by prose thirty lines below.
//
//   • THE LEADING BOUNDARY IS LOAD-BEARING. Without `(?<![A-Za-z0-9_$.])`, the
//     string `ungatedBody(` contains `gatedBody(`, so a removed gate reads as a
//     present one and the scan passes its own sabotage.
//
// The mcp worker keeps its own suite: its writes are identity-gated (a bearer
// token or the session user) rather than right-gated, so it is a different
// assertion, not a different parameter of this one.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { declarationBody, stripComments } from "./source"
import { describe, expect, it } from "vitest"

/** The shape of a worker's ROUTES table this scan needs. */
type RouteTable = Record<string, { handler: { name: string }; kind?: string }>

/** Every `export async function NAME` body in a directory, keyed by name. */
function exportedFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = readFileSync(join(dir, file), "utf8")
    for (const m of code.matchAll(/export\s+async\s+function\s+(\w+)/g))
      // `declarationBody`, NOT a slice to the next EXPORTED function. The old
      // version swallowed every non-exported helper in between and read their
      // text as the handler's own — so deleting `postImportConfirm`'s
      // `requireRight` left this suite GREEN, because the slice ran past the
      // closing brace into the private `requireAnyImportRight`, whose
      // declaration line matches the gate pattern below. A security check that
      // passes over a removed gate is worse than no check: it is a reason not to
      // look. (Security sentry, 2026-08-25.)
      out.set(m[1], declarationBody(code, m.index!))
  }
  return out
}

/** The permission gates. Any ONE of these opening a handler satisfies R10. */
const GATE_RE =
  /(?<![A-Za-z0-9_$.])(?:requireRight|gatedBody|gated|requireAnyImportRight|adminGuard)\s*(?:<[^(<>]*>)?\s*\(/

/** whoAmI, matched with the same leading boundary so a `notWhoAmI(` wrapper
 * cannot read as the real thing. */
const WHOAMI_RE = /(?<![A-Za-z0-9_$.])whoAmI\s*\(/

export function describeGatingSeam(opts: {
  /** The worker's name, for the suite title and messages. */
  worker: string
  /** Its ROUTES table, imported by the caller so this stays type-safe. */
  routes: RouteTable
  /** Its `src` directory — handlers are read from `<srcDir>/routes`. */
  srcDir: string
  /** A tripwire: the scan must not silently go blind if the table moves or is
   * renamed. Set it just below today's real count. */
  minRoutes: number
  /**
   * The reviewed IDENTITY-gated writes: they cannot ask "does your ROLE allow
   * this?" because the answer is about WHO you are, not what you may do. Each
   * gates on whoAmI and proves ownership itself. Adding a line here is a
   * conscious decision — which is the point: you cannot dodge the gate by
   * quietly listing a route as an exception without saying why.
   */
  identityGated?: Record<string, string>
}): void {
  const { worker, routes, srcDir, minRoutes, identityGated = {} } = opts
  const routeFns = exportedFunctions(join(srcDir, "routes"))

  describe(`gating-seam (${worker}): no ungated door can ship`, () => {
    it("finds the route table (the scan itself must not go blind)", () => {
      expect(Object.keys(routes).length).toBeGreaterThanOrEqual(minRoutes)
      expect(Object.values(routes).some((r) => r.kind === "mutation")).toBe(true)
    })

    it("every non-GET route opens with a permission gate", () => {
      for (const [route, def] of Object.entries(routes)) {
        if (route.startsWith("GET ")) continue
        const name = def.handler.name
        const body = routeFns.get(name)
        expect(body, `handler ${name} (${route}) must be an exported async function in routes/`).toBeDefined()
        const code = stripComments(body as string)
        if (identityGated[route]) {
          expect(
            WHOAMI_RE.test(code),
            `${route} is a reviewed identity-gated write (${identityGated[route]}) — it must still verify WHO the caller is via whoAmI`
          ).toBe(true)
          continue
        }
        expect(
          GATE_RE.test(code),
          `${route} (${name}) changes state with no permission gate — open it with requireRight / gated / gatedBody / requireAnyImportRight / adminGuard, or add it to identityGated with a reason`
        ).toBe(true)
      }
    })

    it("every identity-gated exception still names a route that exists", () => {
      for (const route of Object.keys(identityGated))
        expect(routes[route], `identityGated lists ${route}, which is not a route`).toBeDefined()
    })
  })
}
