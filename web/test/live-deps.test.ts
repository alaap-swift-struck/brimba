// A DEP MUST NAME A KEY SOMETHING ACTUALLY READS (R15's small print).
//
// `TEAM_RESOURCES[x].deps` lists cache keys the shell invalidates when a row
// changes. Nothing checks them at runtime: `invalidate()` on a key no screen
// reads is a silent no-op, so a typo, a renamed key, or a dep written from
// memory looks exactly like a working one. That is how `learning` shipped with
// no deps at all and `help` without the single-row key its detail screen reads —
// the code read as if those screens were live, and they were not.
//
// So every key every `deps` produces must be findable where a screen reads it.
// Two things this check has to get right, both learned the hard way in this repo:
//   • a COMMENT is not a reader. Comments are stripped from the whole corpus —
//     the explanation of a fix tends to contain the very key it is explaining.
//   • a DECLARATION is not a reader. The deps arrays are stripped out of
//     live-resources.ts first, or a misspelled key would find itself.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { stripComments } from "@shared/test/source"
import { describe, expect, it } from "vitest"

import { TEAM_RESOURCES } from "@/lib/live-resources"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const LIVE = join(WEB, "lib", "live-resources.ts")
const read = (p: string) => readFileSync(p, "utf8")

const TEAM = "TEAMID"
const ROW = "ROWID"

/** Keys their reader builds from a VARIABLE scope, so no literal prefix exists
 * to search for. Each names the expression that reads it — and that expression
 * is checked, because an exclusion nobody verifies is how a false one survives. */
const COMPUTED_READERS: Record<string, { file: string; expr: string }> = {
  "activity:invite:": {
    file: "lib/use-screen-data.ts",
    expr: "`activity:${activityScope}:${recordId}`",
  },
  "activity:user:": {
    file: "lib/use-screen-data.ts",
    expr: "`activity:${activityScope}:${recordId}`",
  },
}

/** Every source file the app is built from (never the tests, never the build). */
function webSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "out", "test", "e2e"].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) webSources(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** live-resources.ts with its `deps` arrays removed — a declaration is not a reader. */
function liveWithoutDeps(): string {
  return stripComments(read(LIVE)).replace(/deps:\s*\([^)]*\)\s*=>\s*\[[^\]]*\]/g, "")
}

/** The literal head of a key, with the interpolated ids taken back off — e.g.
 * `activity:record:help:ROWID` → `activity:record:help:`. That head is what a
 * reader spells out in its own source. */
function prefixOf(key: string): string {
  const at = [key.indexOf(TEAM), key.indexOf(ROW)].filter((i) => i >= 0)
  return key.slice(0, at.length ? Math.min(...at) : key.length)
}

describe("every live dep names a cache key something reads", () => {
  const corpus =
    webSources(WEB)
      .filter((f) => f !== LIVE)
      .map((f) => stripComments(read(f)))
      .join("\n") + liveWithoutDeps()

  it("finds a reader for every key every resource depends on", () => {
    const orphans: string[] = []
    for (const [resource, r] of Object.entries(TEAM_RESOURCES)) {
      for (const key of r.deps?.(TEAM, ROW) ?? []) {
        const prefix = prefixOf(key)
        expect(prefix.length, `${resource}: a dep key must have a literal head`).toBeGreaterThan(0)
        if (corpus.includes(prefix) || COMPUTED_READERS[prefix]) continue
        orphans.push(`${resource} → "${prefix}"`)
      }
    }
    expect(
      orphans,
      `a live dep invalidates a key nothing reads, so the ping lands nowhere: ${orphans.join("; ")}`
    ).toEqual([])
  })

  it("every computed-reader exclusion still points at real code", () => {
    for (const [prefix, r] of Object.entries(COMPUTED_READERS))
      expect(read(join(WEB, r.file)), `${prefix} claims ${r.file} reads it, and it does not`).toContain(
        r.expr
      )
  })

  it("the record-detail screens are reachable by a ping (the gap this closed)", () => {
    // Named explicitly: these are the ones that were missing, and the generic
    // check above would go green again the moment someone deleted them.
    const learning = TEAM_RESOURCES.learning.deps?.(TEAM, ROW) ?? []
    expect(learning).toContain(`learning-one:${ROW}`)
    expect(learning).toContain(`activity:record:learning:${ROW}`)
    expect(TEAM_RESOURCES.help.deps?.(TEAM, ROW)).toContain(`help-one:${ROW}`)
    expect(TEAM_RESOURCES.member_roles.deps?.(TEAM, ROW)).toContain(
      `activity:record:member_roles:${ROW}`
    )
  })

  it("strips declarations before searching, so a typo cannot find itself", () => {
    // The machinery's own check. `help-one:` appears in live-resources.ts ONLY
    // inside a deps array (and in a comment about it), so if either strip stopped
    // working the check above would quietly start passing on its own declaration.
    expect(liveWithoutDeps()).not.toContain("help-one:")
  })
})
