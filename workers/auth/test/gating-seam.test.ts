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
//
// And the ONE door that reaches no gate — email/start, the public front door of
// authentication — is held to the bounds it claims INSTEAD of a gate, rather than
// to the length of the sentence claiming them. See OPEN_BY_DESIGN.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { declarationBody, namedBody, stripComments } from "../../../shared/test/source"

const SRC = join(__dirname, "..", "src")
const index = stripComments(readFileSync(join(SRC, "index.ts"), "utf8"))

// The two files the ONE open door leans on instead of a gate. Read here so the
// bounds below assert against code rather than against the sentence describing
// it — comments are stripped, so a comment about a cap cannot satisfy the cap.
const loginCodes = stripComments(readFileSync(join(SRC, "lib", "login-codes.ts"), "utf8"))
const constants = stripComments(readFileSync(join(SRC, "lib", "constants.ts"), "utf8"))
const mint = namedBody(loginCodes, "async function mintLoginCode(")

/** A numeric constant's VALUE. NaN when it is missing or is no longer a plain
 * number — and NaN fails every comparison, so a renamed constant turns the
 * bound that reads it RED instead of quietly skipping it. */
function constantOf(name: string): number {
  const m = constants.match(new RegExp(`\\b${name}\\s*=\\s*([\\d_]+)\\b`))
  return m ? Number(m[1].replace(/_/g, "")) : NaN
}

/** Is `first` in `src` AND before `second`? BOTH must be present. A missing
 * needle is -1, and -1 sorts before everything, so the naive index comparison
 * answers "yes, it comes first" about text that is not in the file at all. */
function before(src: string, first: string, second: string): boolean {
  const a = src.indexOf(first)
  const b = src.indexOf(second)
  return a !== -1 && b !== -1 && a < b
}

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

/** The doors that are DELIBERATELY open, each with its reason AND — because
 * prose cannot fail — the BOUNDS that reason claims, as predicates over the code.
 *
 * This is the same bargain `describeGatingSeam` makes with `identityGated`: you
 * may not dodge the rule by quietly listing a route, you have to say why, in
 * writing, here. Until 2026-08-25 the saying was the WHOLE of it: this record
 * held a string, and the check measured `reason.length > 40` and then `return`ed
 * — so the one deliberately-open door in the base was the one door no assertion
 * touched. Delete its input validation, delete its rate cap, and the suite
 * stayed green. An exemption that asserts nothing is a comment wearing a test's
 * clothes, and it is worse than no entry at all, because the list READS as
 * coverage. Every neighbouring exemption list already knew better: `identityGated`
 * proves `whoAmI` is really called, `DEAF_EXEMPT` proves its named cache keys
 * really exist, the mcp suite proves token verification precedes the body parse.
 *
 * So `bounds` is what stands in for the gate — same shape as GATES above, one
 * named claim per predicate, the name printed when it breaks. An open door that
 * declares no bounds is not an exemption, it is an unlocked door; the suite says
 * so below rather than trusting the next author to remember. */
const OPEN_BY_DESIGN: Record<string, { why: string; bounds: Record<string, (b: string) => boolean> }> = {
  "POST /api/auth/email/start": {
    why:
      "the front door of authentication — there is no session yet, and there cannot be. Asking for a code proves nothing and gains nothing: the code is emailed to the ADDRESS, so requesting one for someone else's account simply mails that person. What stands in for a gate is the bounds below: the address is validated before any work happens, and every mint goes through mintLoginCode's throttle — a resend cooldown that refuses with a 429, and an hourly cap past which the live code is ROTATED in place rather than a row being added. So an anonymous flood can neither grow the table nor lock the owner of the inbox out of their own account.",
    bounds: {
      // BOTH halves and in that ORDER, for the reason the `session` gate gives:
      // a lookup whose result is never checked proves nothing — and a check that
      // runs after the work has happened is not a boundary.
      "validates the address at the boundary, before anything is minted": (b) =>
        /!\s*isValidEmail\s*\(/.test(b) &&
        /fail\s*\(\s*400\b/.test(b) &&
        before(b, "isValidEmail", "mintLoginCode"),

      // The throttle lives in mintLoginCode, so this door is only as capped as
      // its route to it: a handler that INSERTed its own row would be uncapped
      // while still, truthfully, calling the function.
      "mints only through the throttled seam, never with its own INSERT": (b) =>
        /mintLoginCode\s*\(/.test(b) && !/INSERT\s+INTO\s+login_codes/i.test(b),

      // ...and the seam's cap is real code. Three linked facts, because any one
      // alone is satisfiable by something that caps nothing: it COUNTS the
      // address's codes over a time window, it COMPARES that to the cap, and the
      // comparison governs a ROTATE — an UPDATE of the live row, not a new one.
      "mintLoginCode counts the hour, compares it to the cap, and ROTATES rather than growing": () =>
        /SELECT COUNT\(\*\)[^"]*FROM login_codes[^"]*created_at > \?/i.test(mint) &&
        />=\s*MAX_CODES_PER_HOUR/.test(mint) &&
        /UPDATE login_codes SET code_hash/i.test(mint),

      // The cooldown is the half that actually limits SENDING (see the comment
      // on RESEND_COOLDOWN_SECONDS in constants.ts — the hourly cap bounds ROWS).
      // It was not named in this exemption's prose until it was asserted here.
      "mintLoginCode refuses a too-soon resend with a 429": () =>
        /RESEND_COOLDOWN_SECONDS/.test(mint) && /status:\s*429/.test(mint),

      // A cap is a NUMBER, not a shape. `MAX_CODES_PER_HOUR = 1_000_000` passes
      // every pattern above and caps nothing, so the magnitude is asserted too.
      // The ceilings are generous on purpose — this is the line between a bound
      // and a decoration, not a review of today's policy.
      "the cap and the cooldown are small finite numbers": () => {
        const perHour = constantOf("MAX_CODES_PER_HOUR")
        const cooldown = constantOf("RESEND_COOLDOWN_SECONDS")
        return perHour >= 1 && perHour <= 100 && cooldown >= 1 && cooldown <= 3600
      },
    },
  },
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

  it("every open-by-design door is still a door", () => {
    // DEAF_EXEMPT's bargain, applied here: an exemption naming something the
    // code no longer has is dead data, and dead data in an exemption list reads
    // as coverage. A renamed or deleted route must break its own excuse.
    const live = new Set(routes.map((r) => `${r.method} ${r.path}`))
    for (const door of Object.keys(OPEN_BY_DESIGN))
      expect(live.has(door), `${door} is listed open by design but is no longer a route in auth's switch`).toBe(true)
  })

  for (const r of routes.filter((r) => r.method !== "GET")) {
    it(`${r.method} ${r.path} (${r.handler})`, () => {
      const door = `${r.method} ${r.path}`
      const body = handlerBody(r.handler)
      expect(body, `could not read ${r.handler}'s source`).not.toBe("")

      const open = OPEN_BY_DESIGN[door]
      if (open) {
        expect(open.why.length, `${door} is open by design and needs a real reason, not a placeholder`).toBeGreaterThan(40)
        // The tripwire on the exemption itself: bounds are what replace the
        // gate, so an entry with none asserts nothing and must not pass.
        expect(
          Object.keys(open.bounds).length,
          `${door} is exempt from R10 but declares no bounds — prose is not a gate`
        ).toBeGreaterThan(0)
        for (const [claim, holds] of Object.entries(open.bounds))
          expect(
            holds(body),
            `${door} is ungated ONLY because it ${claim} — and the code no longer does that, so the exemption has outlived its reason`
          ).toBe(true)
        return
      }
      const found = Object.entries(GATES).filter(([, ok]) => ok(body)).map(([k]) => k)
      expect(
        found.length,
        `${r.method} ${r.path} changes state and reaches no gate — it must check the session, the internal key, its own secret, possession of an emailed code, or act only on the caller own cookie`
      ).toBeGreaterThan(0)
    })
  }
})
