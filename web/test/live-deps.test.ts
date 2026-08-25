// A DEP MUST NAME A KEY SOMETHING ACTUALLY READS (R15's small print).
//
// `TEAM_RESOURCES[x].deps` is a list of cache keys the shell invalidates when a
// row changes. Nothing checks them at runtime: `invalidate()` on a key no screen
// reads is a silent no-op, so a typo, a renamed key, or a dep written from
// memory looks exactly like a working one. That is how `learning` shipped with
// no deps at all and `member_roles` with two of the three it needed — the code
// read as if the Activity tab were live, and it was not.
//
// So: every key every `deps` produces must appear somewhere a screen could read
// it. The declaration itself does not count as a reader, which is why the deps
// arrays are stripped out of live-resources.ts before the search — otherwise a
// misspelled key would find itself and the check would pass on its own typo.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { TEAM_RESOURCES } from "@/lib/live-resources"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const LIVE = join(WEB, "lib", "live-resources.ts")

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

/** live-resources.ts WITHOUT its `deps` arrays — a declaration is not a reader. */
function liveSourceWithoutDeps(): string {
  return readFileSync(LIVE, "utf8").replace(/deps:\s*\([^)]*\)\s*=>\s*\[[^\]]*\]/g, "")
}

const TEAM = "TEAMID"
const ROW = "ROWID"

/** The literal prefix of a key, with the interpolated ids taken back off — e.g.
 * `activity:record:help:ROWID` → `activity:record:help:`. That prefix is what a
 * reader spells out in its own source. */
function prefixOf(key: string): string {
  const cut = Math.min(
    ...[key.indexOf(TEAM), key.indexOf(ROW)].filter((i) => i >= 0).concat([key.length])
  )
  return key.slice(0, cut)
}

describe("every live dep names a cache key something reads", () => {
  const corpus =
    webSources(WEB)
      .filter((f) => f !== LIVE)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n") + liveSourceWithoutDeps()

  it("finds a reader for every key every resource depends on", () => {
    const orphans: string[] = []
    for (const [resource, r] of Object.entries(TEAM_RESOURCES)) {
      for (const key of r.deps?.(TEAM, ROW) ?? []) {
        const prefix = prefixOf(key)
        expect(prefix.length, `${resource}: a dep key must have a literal prefix`).toBeGreaterThan(0)
        if (!corpus.includes(prefix)) orphans.push(`${resource} → "${prefix}"`)
      }
    }
    expect(
      orphans,
      `a live dep invalidates a key nothing reads, so the ping lands nowhere: ${orphans.join("; ")}`
    ).toEqual([])
  })

  it("the two record-detail screens are reachable by a ping (the gap this closed)", () => {
    // Named explicitly, because these are the ones that were missing and a
    // generic check would go green again the moment someone deleted them.
    expect(TEAM_RESOURCES.learning.deps?.(TEAM, ROW)).toContain(`learning-one:${ROW}`)
    expect(TEAM_RESOURCES.learning.deps?.(TEAM, ROW)).toContain(`activity:record:learning:${ROW}`)
    expect(TEAM_RESOURCES.help.deps?.(TEAM, ROW)).toContain(`help-one:${ROW}`)
    expect(TEAM_RESOURCES.member_roles.deps?.(TEAM, ROW)).toContain(
      `activity:record:member_roles:${ROW}`
    )
  })

  it("strips the deps arrays before searching (so a typo cannot find itself)", () => {
    // The machinery's own check: `help-one:` exists in live-resources.ts ONLY
    // inside a deps array, so if the strip stopped working this would fail and
    // the check above would quietly start passing on its own declarations.
    expect(liveSourceWithoutDeps()).not.toContain("help-one:")
  })
})
