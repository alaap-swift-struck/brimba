import { describe, expect, it } from "vitest"

import { letterMark, personInitials, personName } from "@/lib/identity"

describe("personName", () => {
  it('joins "First Last"', () => {
    expect(personName({ firstName: "Alaap", lastName: "Kanchwala" })).toBe("Alaap Kanchwala")
  })

  it("uses just the part it has when one name is missing", () => {
    expect(personName({ firstName: "Alaap", lastName: null })).toBe("Alaap")
    expect(personName({ firstName: null, lastName: "Kanchwala" })).toBe("Kanchwala")
  })

  it("falls back to email when there is no name", () => {
    expect(personName({ firstName: null, lastName: null, email: "a@x.com" })).toBe("a@x.com")
  })

  it('returns "" when there is neither a name nor an email', () => {
    expect(personName({ firstName: null, lastName: null, email: null })).toBe("")
    expect(personName({})).toBe("")
  })
})

describe("personInitials", () => {
  it('builds two-letter initials uppercased ("AK")', () => {
    expect(personInitials("alaap", "kanchwala")).toBe("AK")
  })

  it('returns "?" when blank/unknown', () => {
    expect(personInitials(null, null)).toBe("?")
    expect(personInitials(undefined, undefined)).toBe("?")
    expect(personInitials("", "")).toBe("?")
  })
})

describe("letterMark", () => {
  it('returns the first letter uppercased ("A")', () => {
    expect(letterMark("acme")).toBe("A")
  })

  it('returns "?" when blank/undefined', () => {
    expect(letterMark("")).toBe("?")
    expect(letterMark(null)).toBe("?")
    expect(letterMark(undefined)).toBe("?")
  })
})
