// BAD INPUT ON AN ANONYMOUS DOOR MUST NOT WRITE A ROW.
//
// `POST /api/auth/email/start` is the one write-shaped door in the base that
// anyone on the internet can reach without signing in — it is how you sign in.
// Its body used to reach `normalizeEmail(body.email ?? "")` untyped, and
// `?? ""` only guards null and undefined: `{"email":123}` sails through it and
// `(123).trim()` throws a TypeError. The central catch then does exactly what it
// was built to do — records the crash — so ONE anonymous request with a number
// in it becomes ONE row in the shared operations database.
//
// This is the identical fault the gateway fixed on `GET /media/%zz` last round,
// and `decodeKey`'s comment already does the arithmetic: at 500 requests a
// second it is 10 GB in under fifteen hours, into the one database the size
// alarm does not watch and the nightly sweep cannot drain — and on a deployment
// without the OPS binding the documented fallback puts it in the CORE database,
// which stops sign-in for every tenant. A caller's own malformed body is a 400,
// recorded nowhere, exactly as ERROR-HANDLING.md says of 4xx.
//
// So the assertion is in two halves and BOTH are load-bearing: the status the
// caller gets, and the row nobody should get. A 400 that still writes a row has
// fixed the manners and left the amplification.

import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordWorkerError, logError } = vi.hoisted(() => ({
  recordWorkerError: vi.fn(async () => {}),
  logError: vi.fn(async () => {}),
}))
// Spread the original so `trace.ts`'s `recordOutbound` import still resolves —
// only the two recorders this test counts are replaced.
vi.mock("../../../shared/workers/error-log", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordWorkerError,
  logError,
}))

const worker = (await import("../src/index")).default

/** Enough env for the doors under test. Nothing here is reached by a malformed
 * body — which is the point: a bad body must be refused before any of it. */
const env = {
  DB: {
    prepare() {
      throw new Error("the database must not be touched by a malformed body")
    },
  },
  EMAIL_FROM: "noreply@x.com",
  APP_ORIGIN: "https://app",
} as never

const ctx = { waitUntil() {}, passThroughOnException() {} } as never

const post = (path: string, body: unknown) =>
  worker.fetch(
    new Request(`https://app${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    ctx
  )

beforeEach(() => {
  recordWorkerError.mockClear()
  logError.mockClear()
})

// Every JSON type that is not a string, plus the two shapes a hand-rolled client
// most often sends by accident. `null` and a missing key are deliberately absent
// here — `?? ""` already handled those, and they are covered below.
const NOT_TEXT: [string, unknown][] = [
  ["a number", 123],
  ["a boolean", true],
  ["an array", ["a@b.co"]],
  ["an object", { address: "a@b.co" }],
]

describe("the anonymous sign-in door refuses a malformed body without recording it", () => {
  for (const [what, value] of NOT_TEXT) {
    it(`answers 400 to ${what} in "email", and writes no error row`, async () => {
      const res = await post("/api/auth/email/start", { email: value })
      expect(
        res.status,
        `${what} in the email field is the caller's mistake, so it is a 400 — a 500 says the fault was ours`
      ).toBe(400)
      expect(
        recordWorkerError,
        "one anonymous request must never be able to write one row to the shared operations database"
      ).not.toHaveBeenCalled()
    })
  }

  it("still answers 400 to a missing or blank email, and still records nothing", async () => {
    for (const body of [{}, { email: null }, { email: "" }, { email: "   " }, { email: "nope" }]) {
      const res = await post("/api/auth/email/start", body)
      expect(res.status).toBe(400)
    }
    expect(recordWorkerError).not.toHaveBeenCalled()
  })

  it("caps an absurdly long email instead of carrying it any further", async () => {
    const res = await post("/api/auth/email/start", { email: `${"a".repeat(50_000)}@x.com` })
    expect(res.status).toBe(400)
    expect(recordWorkerError).not.toHaveBeenCalled()
  })
})

// THE SIX SIBLINGS. The same `?? ""`-then-`.trim()` shape sat on every other
// field of every other login door. Two of them (verify, test-login) are
// reachable without a session too; the email-change pair need one, which makes
// them cheaper to abuse and no less wrong.
describe("every sibling field on every login door has the same boundary", () => {
  const DOORS: [string, string, Record<string, unknown>][] = [
    ["email/start", "/api/auth/email/start", { email: 123 }],
    ["email/verify (email)", "/api/auth/email/verify", { email: 123, code: "123456" }],
    ["email/verify (code)", "/api/auth/email/verify", { email: "a@b.co", code: 123456 }],
    ["admin/test-login", "/api/auth/admin/test-login", { email: 123 }],
    ["email/change/start", "/api/auth/email/change/start", { email: 123 }],
    ["email/change/verify (email)", "/api/auth/email/change/verify", { email: 123, code: "123456" }],
    ["email/change/verify (code)", "/api/auth/email/change/verify", { email: "a@b.co", code: 123456 }],
  ]
  for (const [name, path, body] of DOORS) {
    it(`${name} never turns a non-string field into a recorded 500`, async () => {
      const res = await post(path, body)
      expect(
        res.status,
        `${name} answered ${res.status} — a non-string field is a 4xx refusal, never a 500`
      ).toBeLessThan(500)
      expect(
        recordWorkerError,
        `${name} recorded an error row for a caller's malformed body`
      ).not.toHaveBeenCalled()
    })
  }
})
