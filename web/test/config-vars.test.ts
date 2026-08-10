// CONFIG PARSING — two bugs of one family, in opposite directions, both invisible
// until someone deliberately chooses the boundary value (which is exactly when it
// matters):
//
//   Number(env.X) || DEFAULT   →  a deliberate 0 becomes the DEFAULT.
//                                 Set the AI allowance to zero, silently grant 50/day.
//   Number(env.X)              →  unset becomes 0.
//                                 A team cap that refuses every account its first team.
//
// So every numeric env var goes through ONE parse, and this file both tests that
// parse at the boundaries and scans the workers so the raw spellings can't return.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { numberVar } from "@shared/workers/limits"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function serverSources(): [string, string][] {
  const out: [string, string][] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".ts")) out.push([p.slice(ROOT.length), readFileSync(p, "utf8")])
    }
  }
  walk(join(ROOT, "shared", "workers"))
  for (const w of readdirSync(join(ROOT, "workers"), { withFileTypes: true }))
    if (w.isDirectory()) walk(join(ROOT, "workers", w.name, "src"))
  return out
}

// A REQUEST FIELD MUST MEET THE SEAM BEFORE IT MEETS THE DATABASE. sqlString()
// escapes quotes — that is all it does. It does not strip NUL bytes (SQLite
// rejects them, so the row write 500s instead of returning a clean 400) and it
// does not cap length. Interpolating a raw request field is therefore how a
// stored string skips validation entirely; the import filename did exactly that.
describe("stored request fields go through the validation seam", () => {
  it("no request field is interpolated into SQL straight off the body", () => {
    const offenders: string[] = []
    for (const [path, src] of serverSources()) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
      for (const m of code.matchAll(/sql(?:String|Value)\(\s*(body|input)\.(\w+)/g))
        offenders.push(`${path} → sqlString(${m[1]}.${m[2]}) — wrap it in requireText/optionalText first`)
    }
    expect(
      offenders,
      `a raw request field reaches the database unvalidated: ${offenders.join("; ")}`
    ).toEqual([])
  })
})

describe("numeric env vars parse at the boundaries", () => {
  it("honours a deliberate ZERO — the value someone sets to mean 'none'", () => {
    expect(numberVar("0", 25), "0 must mean 0, not 'fall back to 25'").toBe(0)
    expect(numberVar(" 0 ", 25)).toBe(0)
  })

  it("falls back when the var is UNSET or empty — never to 0", () => {
    expect(numberVar(undefined, 5), "unset must be the fallback, not 0").toBe(5)
    expect(numberVar("", 5)).toBe(5)
    expect(numberVar("   ", 5)).toBe(5)
  })

  it("falls back on nonsense rather than propagating NaN", () => {
    expect(numberVar("lots", 5)).toBe(5)
    expect(numberVar("12abc", 5)).toBe(5)
  })

  it("passes ordinary values through, including negatives", () => {
    expect(numberVar("50", 25)).toBe(50)
    expect(numberVar("-1", 25), "a negative is a real choice, not an error").toBe(-1)
  })

  // The scan: neither raw spelling may come back anywhere on the server side.
  it("no worker reads a numeric env var without the one parse", () => {
    const offenders: string[] = []
    for (const [path, src] of serverSources()) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
      for (const m of code.matchAll(/(?:Number|parseInt|parseFloat)\s*\(\s*env\.(\w+)/g))
        offenders.push(`${path} → ${m[0].trim()}… (use numberVar(env.${m[1]}, DEFAULT))`)
    }
    expect(
      offenders,
      `a numeric env var parsed by hand — 0 and unset both go wrong: ${offenders.join("; ")}`
    ).toEqual([])
  })
})
