// R10 FOR AUTH — the worker the gating scan could not see.
//
// `describeGatingSeam` takes a declarative ROUTES table (CONVENTIONS.md's handler
// shape). auth dispatches with a `switch` instead, so it matched nothing and had
// no R10 coverage at all: ten state-changing doors, including the one that mints
// a login code, were checked by no law. The 12 August security sweep measured
// "45/45 state-changing routes gated" — auth's ten were not among the 45.
//
// auth is also the one worker where `requireRight` is mostly the WRONG gate:
// signing in has no team yet, and its `/internal/*` doors are reached only over a
// service binding and gate on a shared secret. So this asserts the honest thing —
// every state-changing door reaches SOME gate, and each kind is named.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { declarationBody, stripComments } from "../../../shared/test/source"

const SRC = join(__dirname, "..", "src")
const index = stripComments(readFileSync(join(SRC, "index.ts"), "utf8"))

/** Every `case "<METHOD> <path>": return [await] <handler>(` in the switch.
 *
 * `await` OPTIONAL. The first version required it, so a door written
 * `return handler(request, env)` — legal, identical in behaviour — was invisible
 * to this scan and the suite stayed green with an ungated route added. Proven
 * with a planted `POST /api/auth/danger`. (Security sentry, round 2, 2026-08-25.) */
const routes = [...index.matchAll(/case "([A-Z]+) ([^"]+)":\s*return (?:await\s+)?(\w+)\(/g)].map((m) => ({
  method: m[1],
  path: m[2],
  handler: m[3],
}))

/** Every `case "<METHOD> <path>":` in the switch, however it is answered. The
 * count below must MATCH — an equality, not a floor, so a door the handler regex
 * cannot parse fails loudly instead of being skipped. */
const allCases = [...index.matchAll(/case "([A-Z]+) ([^"]+)":/g)]

/** A handler's body. auth keeps its handlers in `index.ts` beside the switch
 * rather than under `src/routes/` — another way it diverges from the shape the
 * scanner expects, and part of why it was never covered. */
function handlerBody(name: string): string {
  const at = index.indexOf(`async function ${name}(`)
  return at === -1 ? "" : declarationBody(index, at)
}

/** The gates auth ACTUALLY uses. Written from the handlers rather than from the
 * shape the other workers use — auth resolves identity with `getSessionUser`,
 * not the shared `whoAmI`, which is one more reason nothing generic covered it. */
const GATES: Record<string, (b: string) => boolean> = {
  // A signed-in caller, refused loudly when absent. BOTH halves required: the
  // lookup alone proves nothing if its result is never checked.
  session: (b) => /getSessionUser\s*\(|whoAmI\s*\(/.test(b) && /signed_out|401/.test(b),
  // Reached only over a service binding, and gated on the shared secret.
  internalKey: (b) => /INTERNAL_KEY|x-internal-key/.test(b),
  // The non-production test door, on its own secret, refused in production.
  ownSecret: (b) => /TEST_LOGIN_KEY/.test(b),
  // Possession of the emailed code IS the proof — this is how you sign in, so
  // there is no session to check yet. It must consume a real code row.
  emailedCode: (b) => /login_codes|code_hash/i.test(b),
  // Acts only on the caller's OWN cookie, so it cannot reach anyone else.
  selfScoped: (b) => /destroySession\s*\(/.test(b),
}

/** The doors that are DELIBERATELY open, each with its reason. This is the same
 * bargain `describeGatingSeam` makes with `identityGated`: you may not dodge the
 * rule by quietly listing a route — you have to say why, in writing, here. */
const OPEN_BY_DESIGN: Record<string, string> = {
  "POST /api/auth/email/start":
    "the front door of authentication — there is no session yet, and there cannot be. Asking for a code proves nothing and gains nothing: the code is emailed to the ADDRESS, so requesting one for someone else's account simply mails that person. Bounded by the hourly mint cap in mintLoginCode (which rotates rather than refuses) and by isValidEmail at the boundary.",
}

describe("auth: every state-changing door reaches a gate (R10)", () => {
  it("found the switch at all", () => {
    // The tripwire. If auth ever moves to a ROUTES table this scan must FAIL
    // rather than quietly find nothing and report all clear — at which point
    // delete this file and add auth to `describeGatingSeam` instead.
    expect(routes.length, "no routes parsed out of auth's switch — this scan has gone blind").toBeGreaterThan(8)
    // EQUALITY. A floor lets a door the handler regex cannot parse slip through
    // unnoticed; this makes the unparsed door the failure.
    expect(
      routes.length,
      `auth has ${allCases.length} route cases but only ${routes.length} could be parsed — the unparsed ones are ungoverned`
    ).toBe(allCases.length)
  })

  for (const r of routes.filter((r) => r.method !== "GET")) {
    it(`${r.method} ${r.path} (${r.handler})`, () => {
      const reason = OPEN_BY_DESIGN[`${r.method} ${r.path}`]
      if (reason) {
        expect(reason.length, "an open door needs a real reason, not a placeholder").toBeGreaterThan(40)
        return
      }
      const body = handlerBody(r.handler)
      expect(body, `could not read ${r.handler}'s source`).not.toBe("")
      const found = Object.entries(GATES).filter(([, ok]) => ok(body)).map(([k]) => k)
      expect(
        found.length,
        `${r.method} ${r.path} changes state and reaches no gate — it must check the session, the internal key, its own secret, possession of an emailed code, or act only on the caller own cookie`
      ).toBeGreaterThan(0)
    })
  }
})
