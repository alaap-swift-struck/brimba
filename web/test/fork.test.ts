// R26 — THE BASE'S OWN IDENTITY IS SWEEPABLE IN ONE COMMAND.
//
// Every file that ships must be one `scripts/fork.mjs` can rewrite, so
// `node scripts/fork.mjs <new-name>` renames the whole base — sources, configs,
// docs AND the tests that pin the literals — and `npm run check` stays green.
//
// The check asks the question the prose sweep could not: is there a hardcoded
// product name somewhere the sweep cannot reach? Two rounds of base-fork review
// found four copies of the session cookie name with one documented, and eight
// assertions in three test files pinning literals the sweep renames. A list in a
// document cannot notice the ninth. This does.
//
// It is deliberately built so it CAN fail: the shipped list comes from git, the
// swept list from running the script itself, and the identity from
// package.json + shared/brand.ts. Three independent sources — a wrong one
// disagrees instead of quietly agreeing with itself.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { FORK_SWEEP_EXEMPT } from "@shared/rules/registry"
import { ROOT, read } from "../../shared/test/source"

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean)

/** What actually ships: tracked files PLUS untracked ones git would take. A new
 * file carrying a new hardcoded name must be visible before it is committed. */
const shipped = () => run("git", ["ls-files", "-c", "-o", "--exclude-standard"])

/** What the sweep reaches — from the script itself, never re-implemented here. */
const swept = () => new Set(run("node", ["scripts/fork.mjs", "--list"]))

/** This app's name, read the way the script reads it. */
const slug: string = JSON.parse(read(join(ROOT, "package.json"))).name
const display = /name:\s*"([^"]+)"/.exec(read(join(ROOT, "shared/brand.ts")))?.[1] ?? ""
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const identity = new RegExp(`${esc(slug)}|${esc(display)}`, "i")

/** Binary files are skipped, not exempted: no text sweep can rewrite them, and a
 * product name inside one is pixels, not a literal. */
const carries = (f: string) => {
  const buf = readFileSync(join(ROOT, f))
  return !buf.includes(0) && identity.test(buf.toString("utf8"))
}

describe("R26 — the fork sweep reaches every identity literal", () => {
  it("fork-sweep-complete: every shipped file carrying the product name is one scripts/fork.mjs rewrites", () => {
    const reach = swept()
    const missed = shipped().filter((f) => !reach.has(f) && !(f in FORK_SWEEP_EXEMPT) && carries(f))
    expect(
      missed,
      `hardcoded "${slug}" where the fork sweep cannot reach it — add the file type to EXT/NAMES in scripts/fork.mjs, or give it a reasoned FORK_SWEEP_EXEMPT line: ${missed.join(", ")}`,
    ).toEqual([])
  })

  // The guard the campaign earned: a check that cannot fail is decoration. If the
  // identity goes blank, the script stops listing, or nothing carries the name any
  // more, the case above passes on an empty set — so each of those is asserted.
  it("the check cannot pass vacuously — identity, reach and subject are all real", () => {
    expect(slug, "package.json must name this app").toMatch(/^[a-z][a-z0-9-]*$/)
    expect(display.length, "shared/brand.ts must name this app").toBeGreaterThan(1)
    const reach = swept()
    for (const f of ["package.json", "shared/brand.ts", "web/test/fork.test.ts"])
      expect(reach.has(f), `the sweep must reach ${f}`).toBe(true)
    expect(shipped().filter(carries).length, "the identity regex must match real files").toBeGreaterThan(20)
  })

  it("every fork-sweep exemption is a real file that really carries the name", () => {
    for (const [f, why] of Object.entries(FORK_SWEEP_EXEMPT)) {
      expect(why.length, `${f} needs a written reason`).toBeGreaterThan(20)
      expect(carries(f), `${f} no longer carries the product name — drop the exemption`).toBe(true)
    }
  })
})

// A FORK MUST INSTALL THE SAME LIBRARY THIS REPO IS BUILT AGAINST.
//
// Proven by actually forking: a clean clone was swept to a new name, installed and
// checked, and the gate went RED — not because the sweep missed anything (it
// reached 135 files and 644 occurrences, leaving zero mentions of the old name)
// but because the ROOT package.json pinned no version of the UI library while
// web/package.json pinned v0.16.0. The fork installed an older library with no
// `ConnectionStatus`, and two files failed to resolve it.
//
// A fork inheriting a DIFFERENT library from the base it was forked from is the
// same fault class as inheriting the base's database ids: a fresh environment
// quietly differing from the one it was copied out of.
it("every workspace pins the SAME UI library version", () => {
  const versions = new Map<string, string>()
  // Every workspace that declares it — and the ROOT deliberately does not. It did
  // until 2026-08-25, unpinned, and npm hoisted that older resolution OVER web's
  // correct one: `npm install` at the root silently downgraded the library the app
  // is built against, and two files stopped resolving. Nothing outside `web/`
  // imports it, so the dependency was dead AND harmful.
  for (const f of ["package.json", "web/package.json"]) {
    const pkg = JSON.parse(readFileSync(join(ROOT, f), "utf8")) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const v = pkg.dependencies?.["@swift-struck/ui"] ?? pkg.devDependencies?.["@swift-struck/ui"]
    if (v) versions.set(f, v)
  }
  expect(versions.size, "the UI library is declared nowhere — this scan has gone blind").toBeGreaterThan(0)
  expect(
    versions.has("package.json"),
    "the ROOT must not declare the UI library: nothing outside web/ imports it, and npm hoists the root's resolution over web's"
  ).toBe(false)
  const unpinned = [...versions].filter(([, v]) => !/#v\d+\.\d+\.\d+/.test(v)).map(([f]) => f)
  expect(unpinned, `these pin no version, so a fresh install gets whatever is on the default branch: ${unpinned.join(", ")}`).toEqual([])
  expect(new Set(versions.values()).size, `workspaces disagree on the UI library version: ${[...versions].map(([f, v]) => `${f}=${v}`).join(", ")}`).toBe(1)
})
