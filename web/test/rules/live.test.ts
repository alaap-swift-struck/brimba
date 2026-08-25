// R15 — EVERY PUBLISHED RESOURCE REACHES A LISTENER, machine-checked
// (see RULES.md + shared/rules/registry.ts). Read source straight off disk.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { DEAF_EXEMPT } from "@shared/rules/registry"
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES } from "@/lib/live-resources"

import { ROOT, WEB, componentFiles, read, stripComments, workerSources } from "./_paths"

describe("RULES — the live layer", () => {
  // R15 — every paged screen consumes the live channel, AND no deaf publishers:
  // every resource any worker publishes must reach a listener (the row-level
  // registry, a coarse invalidation, or a reasoned exemption). Publishing to
  // nobody is the silent half of the stale-screen bug. The publisher set is
  // DERIVED by scanning publishChange calls — never hand-listed.
  //
  // (That paragraph spent a month sitting above `runbook-migrations-current`,
  // a BOOTSTRAP.md check it has nothing to do with, while this — the law it
  // describes — carried no comment at all. Splitting the file is what made the
  // mismatch visible: a comment is only attached to what follows it by
  // convention, and nothing checks convention.)
  it("live-collections: every published resource reaches a listener (no deaf publishers)", () => {
    const published = new Set<string>()
    for (const [, src] of workerSources()) {
      // Literal resources: publishChange(env.REALTIME, <team>, "resource"…
      for (const m of src.matchAll(/publishChange\([^,]+,[^,]+,\s*"([a-z_]+)"/g)) published.add(m[1])
    }
    // Dynamic resources: the import engine publishes each TargetDef's module.
    const targetsSrc = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    for (const m of targetsSrc.matchAll(/module: "([a-z_]+)"/g)) published.add(m[1])
    const listeners = new Set([
      ...Object.keys(TEAM_RESOURCES),
      ...Object.keys(SIMPLE_INVALIDATIONS),
      ...Object.keys(DEAF_EXEMPT),
    ])
    const deaf = [...published].filter((r) => !listeners.has(r))
    expect(
      deaf,
      `published to nobody (R15) — add a TEAM_RESOURCES/SIMPLE_INVALIDATIONS listener or a reasoned DEAF_EXEMPT entry: ${deaf.join(", ")}`
    ).toEqual([])
    // AN EXEMPTION THAT NAMES A KEY MUST NAME A REAL ONE. A DEAF_EXEMPT reason is
    // prose, and prose was how `help_threads` stayed deaf: its reason described a
    // refresh mechanism that did not exist. Any `backticked` cache key in a reason
    // is now checked against live-resources.ts, so the excuse has to be true.
    // (The general lesson, from the MCP exclusion table that was false the day it
    // shipped: a documented exclusion must be machine-checked against the code it
    // excludes.)
    // stripComments, because the first version of this check read the raw file —
    // and the COMMENT explaining the fix contained the very key it was looking
    // for, so deleting the real deps left it green. Caught by sabotage, on the
    // same afternoon the comments-are-not-code rule was written down. The lesson
    // is not "remember to strip comments"; it is that a check is only known to
    // work once you have watched it fail.
    const liveSrc = stripComments(read(join(WEB, "lib", "live-resources.ts")))
    const unbacked: string[] = []
    for (const [resource, why] of Object.entries(DEAF_EXEMPT))
      // TWO or more segments, not one. The first version was `[a-z-]+:[a-z-]*`,
      // which matched `help-thread:` and silently SKIPPED `total:help-thread:` —
      // so deleting the badge key alone left this green and the stale reply count
      // came back. A key the parser cannot express must FAIL, not vanish.
      // (Realtime review, round 2, 2026-08-25.)
      for (const m of why.matchAll(/`([a-z-]+(?::[a-z-]*)+)`/g))
        if (!liveSrc.includes(m[1])) unbacked.push(`${resource} claims \`${m[1]}\` which live-resources.ts does not contain`)
    expect(
      unbacked,
      `a DEAF_EXEMPT reason named a cache key that does not exist: ${unbacked.join("; ")}`
    ).toEqual([])

    // THE PAGED HALF, pointed at the paging this app actually has. This filter
    // read `/search?|usePagedList` and NO component in the repo contains either —
    // all fetching is wrapped in `web/lib/api.ts` — so its offender list was
    // always empty and the check could not fail. It had never once been capable
    // of catching anything. (Realtime review, 2026-08-25.)
    //
    // What actually delivers liveness to a paged screen here is not a subscription
    // but the CACHE KEY: `use-screen-data.ts` reads every collection through
    // `useCached` under the same key the shell patches on a ping, and `LoadMore`
    // appends into that same key. So a page-two row is patched exactly like a
    // page-one row. That is the mechanism R15 needs on this surface, so that is
    // what is asserted — and if paging ever moves off the shared cache, this goes
    // red instead of staying silent.
    const paging = read(join(WEB, "lib", "use-screen-data.ts"))
    expect(
      paging,
      "paged screens must read through useCached, or a live ping cannot reach page two"
    ).toContain("useCached")
    expect(
      stripComments(paging),
      "paged screens must key off live-resources, so their key is the one the shell patches"
    ).toMatch(/from "@\/lib\/live-resources"/)
    const pagers = componentFiles().filter((f) => /LoadMore|nextCursor/.test(stripComments(read(f))))
    expect(
      pagers.length,
      "no paging surface found at all — this check has gone blind, as its predecessor was"
    ).toBeGreaterThan(0)
  })
})
