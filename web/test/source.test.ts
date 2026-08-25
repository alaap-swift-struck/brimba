// The source reader reads its own repository. Everything below is a fault that
// SHIPPED in the hand-rolled versions this module replaced.

import { describe, expect, it } from "vitest"

import { existsSync } from "node:fs"
import { join } from "node:path"

import { ROOT, catchBodies, declarationBody, namedBody, stripComments, serverSources, workerNames, workerSources } from "@shared/test/source"

describe("stripComments", () => {
  it("removes both comment forms", () => {
    expect(stripComments("a // gone\nb")).toContain("a")
    expect(stripComments("a // gone\nb")).not.toContain("gone")
    expect(stripComments("a /* gone */ b").replace(/\s+/g, " ")).toBe("a b")
  })

  it("does NOT let a block-open inside a LINE comment eat the code after it", () => {
    // The fault, exactly: a path like `icons/*` in a line comment opened a block
    // comment for the regex version, which then ran to the next terminator and
    // swallowed every line between — including real, rendered JSX.
    const src = [
      "// the brand monogram (web/public/icons/*).",
      "const KEEP_ME = 1",
      "/* a genuine block */",
      "const ALSO_KEEP = 2",
    ].join("\n")
    expect(stripComments(src)).toContain("KEEP_ME")
    expect(stripComments(src)).toContain("ALSO_KEEP")
  })

  it("does not treat a URL's slashes as a comment", () => {
    expect(stripComments('const u = "https://example.com/x"')).toContain("https://example.com/x")
  })

  // THE SECOND SCANNER FAULT, found 2026-08-25 by the fork sweep. Without a
  // notion of a regex literal, `/["]/` reads as a slash then an opening quote —
  // and that "string" runs to the next quote ANYWHERE in the file, so every
  // comment in between survives into what a Law check reads as code. Sixteen
  // files leaked. The direction matters: a check that finds its word in a
  // comment believes it found the code.
  it("does not let a regex containing a quote swallow the rest of the file", () => {
    for (const re of ['/["]/', "/[']/", "/[`]/", '/a\\/"b/']) {
      const out = stripComments(`const r = ${re}\nconst z = 1\n// GONE\nreal()`)
      expect(out, `${re} desynchronised the scanner`).not.toContain("GONE")
      expect(out, `${re} was not preserved`).toContain(re.slice(0, 3))
    }
  })

  it("still treats a division as a division", () => {
    const out = stripComments("const n = a / b\n// GONE\nreal()")
    expect(out).not.toContain("GONE")
    expect(out).toContain("a / b")
  })

  it("keeps a regex returned straight from an arrow function", () => {
    // `=>` is the most common shape in this repo's own checks, and the character
    // before the slash is `>` — which is why `>` is in the opens-a-regex set.
    const out = stripComments('const f = () => /filename="([^"]+)"/.exec(s)\n// GONE\nreal()')
    expect(out).not.toContain("GONE")
  })

  it("leaves a template literal whole, so SQL keeps its LIMIT", () => {
    expect(stripComments("const q = `SELECT 1 LIMIT ${n}`")).toContain("LIMIT ${n}")
  })
})

describe("the readers' own footing", () => {
  it("workerNames skips node_modules — vitest's cache lives there", () => {
    // Running ANY worker suite creates workers/node_modules/.vite. Every check
    // that walked workers/* and assumed each entry was a worker then threw on
    // `.../node_modules/src`, and on 2026-08-25 that turned THIRTEEN law checks
    // red at once. Running the tests was poisoning the law checks.
    const names = workerNames()
    expect(names, "the scan has gone blind").toContain("tenancy")
    expect(names).not.toContain("node_modules")
    for (const n of names) expect(existsSync(join(ROOT, "workers", n, "src")), `${n} has no src`).toBe(true)
  })

  it("a path in a failure message keeps its first character", () => {
    // `p.slice(ROOT.length)` ate one character whenever ROOT was ".", because
    // join(".", "workers") normalises the dot away — so `workers/x` came back as
    // `orkers/x`. Cosmetic in a message; NOT cosmetic in the checks that exempt
    // by path prefix, where an exemption for `workers/…` matched nothing at all.
    const [firstPath] = workerSources()[0]
    expect(firstPath.startsWith("workers/") || firstPath.includes("/workers/")).toBe(true)
  })
})

describe("declarationBody", () => {
  const src = ["export function a() {", "  return 1", "}", "", "export function b() {", "  FORBIDDEN", "}"].join("\n")

  it("stops at the next top-level declaration, not at end of file", () => {
    // `src.slice(src.indexOf(name))` read every function below the target too, so
    // an assertion could be satisfied by unrelated code further down. One check
    // was green for two months on other functions' text.
    expect(declarationBody(src, src.indexOf("export function a"))).not.toContain("FORBIDDEN")
  })

  it("returns empty rather than the whole file when the name is gone", () => {
    // So a rename makes its check FAIL instead of silently passing on everything.
    expect(namedBody(src, "export function missing")).toBe("")
  })
})

describe("catchBodies", () => {
  it("returns only what is inside the catch", () => {
    const src = 'try { A() } catch (e) { RECORD(e) }\nfunction other() { RECORD(1) }'
    expect(catchBodies(src).join()).toContain("RECORD(e)")
    expect(catchBodies(src).join()).not.toContain("function other")
  })
})

describe("serverSources", () => {
  it("sees the shared seams, not just the workers", () => {
    // R11's scan walked `workers/*/src` only while carrying an exemption keyed to
    // a `shared/` path — the exemption was the proof it was blind.
    const paths = serverSources().map(([p]) => p)
    expect(paths.some((p) => p.includes("shared/workers/"))).toBe(true)
    expect(paths.some((p) => p.includes("workers/gateway/src"))).toBe(true)
  })
})
