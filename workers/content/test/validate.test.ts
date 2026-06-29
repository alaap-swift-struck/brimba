// The INPUT-BOUNDARY contract (shared/workers/validate.ts). Adversarial probing of
// staging found that the old `body.field?.trim()` pattern threw a TypeError → 500
// on a non-string / over-long / NUL-containing value instead of a clean 400. These
// helpers are the fix; this test locks their behavior so the 500s can't come back.

import { describe, expect, it } from "vitest"

import { GuardError } from "../../../shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "../../../shared/workers/validate"

const NUL = String.fromCharCode(0)

function thrown(fn: () => unknown): GuardError | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof GuardError ? e : null
  }
}

describe("requireText", () => {
  it("returns the trimmed string for valid input", () => {
    expect(requireText("  hello  ", "Field")).toBe("hello")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [12345, ["a"], { x: 1 }, true, null, undefined]) {
      const err = thrown(() => requireText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
      expect(err?.code).toBe("invalid_input")
    }
  })

  it("throws a 400 for blank / whitespace-only", () => {
    expect(thrown(() => requireText("", "Field"))?.status).toBe(400)
    expect(thrown(() => requireText("   ", "Field"))?.status).toBe(400)
  })

  it("throws a 400 when over the length cap", () => {
    const ok = "a".repeat(TEXT_LIMITS.short)
    expect(requireText(ok, "Field", TEXT_LIMITS.short)).toBe(ok)
    expect(thrown(() => requireText("a".repeat(TEXT_LIMITS.short + 1), "Field", TEXT_LIMITS.short))?.status).toBe(400)
  })

  it("strips embedded NUL bytes (SQLite rejects them → was a 500)", () => {
    expect(requireText(`a${NUL}b`, "Field")).toBe("ab")
  })
})

describe("optionalText", () => {
  it("maps null/undefined/blank to undefined", () => {
    expect(optionalText(undefined, "Field")).toBeUndefined()
    expect(optionalText(null, "Field")).toBeUndefined()
    expect(optionalText("   ", "Field")).toBeUndefined()
  })

  it("returns the trimmed string for a present value, NULs stripped", () => {
    expect(optionalText("  hi  ", "Field")).toBe("hi")
    expect(optionalText(`x${NUL}y`, "Field")).toBe("xy")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [5, ["a"], { a: 1 }, true]) {
      const err = thrown(() => optionalText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
    }
  })

  it("throws a 400 when over the length cap", () => {
    expect(thrown(() => optionalText("a".repeat(TEXT_LIMITS.long + 1), "Field", TEXT_LIMITS.long))?.status).toBe(400)
  })
})
