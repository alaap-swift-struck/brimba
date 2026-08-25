// R15 — EVERY PUBLISHED RESOURCE REACHES A LISTENER, AND EVERY LISTENER HAS A
// PUBLISHER (see RULES.md + shared/rules/registry.ts). Read source straight off
// disk, and derive BOTH sides from it.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { DEAF_EXEMPT } from "@shared/rules/registry"
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES, listFetch } from "@/lib/live-resources"

import { ROOT, WEB, componentFiles, read, serverSources, stripComments } from "./_paths"

/** Sentinel ids: the registry's `key` / `deps` functions are asked for their
 * SHAPE, and neither of these can collide with anything real. */
const TEAM = "TEAMID"
const ROW = "ROWID"

/** Every resource string the server publishes, derived from the publish call
 * sites themselves — never hand-listed.
 *
 * `team` is what a TEAM channel carries, so it is the set the deaf-publisher
 * direction needs a listener for. `any` adds the user channel and the forced
 * sign-out, because the dead-listener direction asks a different question —
 * "does anything at all publish this?" — and a user-channel resource is
 * published by a real write even though this registry is not where it lands.
 *
 * COMMENTS ARE STRIPPED, and that is not tidiness. The reverse direction below
 * takes a publish call site as PROOF that a listener is alive, so a
 * commented-out publish — or a comment explaining one — would vouch for code
 * that does not run. This file already carries a scar from reading raw source;
 * that one hid a missing dep, and this one would hide a dead feature. */
function publishers(): { team: Set<string>; any: Set<string> } {
  const team = new Set<string>()
  const any = new Set<string>()
  for (const [, raw] of serverSources()) {
    const src = stripComments(raw)
    // publishChange(env.REALTIME, <team>, "resource"…
    for (const m of src.matchAll(/publishChange\([^,]+,[^,]+,\s*"([a-z_]+)"/g)) team.add(m[1])
    for (const m of src.matchAll(/publishUserChange\([^,]+,[^,]+,\s*"([a-z_]+)"/g)) any.add(m[1])
  }
  // Dynamic resources: the import engine publishes each TargetDef's module.
  const targets = stripComments(read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts")))
  for (const m of targets.matchAll(/module: "([a-z_]+)"/g)) team.add(m[1])
  // `publishSignOut` names its resource INSIDE the helper rather than at the
  // call site, so it is read from the helper. Writing "session" down here would
  // be the hand-list this whole check exists to avoid.
  const helpers = stripComments(read(join(ROOT, "shared", "workers", "realtime.ts")))
  for (const m of helpers.matchAll(/resource:\s*"([a-z_]+)"/g)) any.add(m[1])
  for (const r of team) any.add(r)
  return { team, any }
}

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
    const published = publishers().team
    // A TRIPWIRE, because the scan above is the whole check. An empty publisher
    // set reports all clear, which is the shape of blindness this repo has
    // found eleven times.
    expect(published.size, "no publishers found at all — this scan has gone blind").toBeGreaterThan(5)
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

  // R15, THE OTHER WAY ROUND. For its whole life this law ran in one direction:
  // it proved every publisher had a listener, and never once that a listener had
  // a publisher. So a listener nothing publishes to sat green for ever — and a
  // live listener that never fires looks exactly like "nothing has changed yet",
  // which is why nobody notices.
  //
  // `data_import_batches` is the one that cost months: registered, subscribed by
  // a real screen (Past imports), and pinged by nothing, with a comment in
  // live-resources.ts politely explaining that nothing published it. The comment
  // was true, the check was green, and the feature simply did not work. Its
  // publisher landed on 2026-08-25; this is what stops the next one.
  //
  // A listener may be registered without a publisher of its OWN in exactly one
  // shape: a second server SCOPE of a resource that does have one (My tickets is
  // the `help` resource under a different door, R14). That is not an exception
  // written down anywhere — it is DERIVED: the scope's cache key must appear in
  // the published resource's own `deps`, which is the same thing as saying a
  // ping on that resource really does reach it.
  it("live-collections: every registered listener has a publisher (no dead listeners)", () => {
    const published = publishers().any
    expect(published.size, "no publishers found at all — this scan has gone blind").toBeGreaterThan(5)

    // Every cache key a PUBLISHED resource's deps refresh — the keys a real ping
    // demonstrably reaches.
    const reached = new Set<string>()
    for (const [resource, r] of Object.entries(TEAM_RESOURCES))
      if (published.has(resource)) for (const dep of r.deps?.(TEAM, ROW) ?? []) reached.add(dep)

    const dead: string[] = []
    for (const [resource, r] of Object.entries(TEAM_RESOURCES))
      if (!published.has(resource) && !reached.has(r.key(TEAM)))
        dead.push(`${resource} (patches \`${r.key(TEAM)}\`)`)
    for (const [resource, keys] of Object.entries(SIMPLE_INVALIDATIONS))
      if (!published.has(resource) && !keys(TEAM).every((k) => reached.has(k)))
        dead.push(`${resource} (drops ${keys(TEAM).map((k) => `\`${k}\``).join(", ")})`)
    for (const resource of Object.keys(DEAF_EXEMPT))
      if (!published.has(resource))
        dead.push(`${resource} (a DEAF_EXEMPT reason for a publisher that no longer exists)`)

    expect(
      dead,
      `registered but never published (R15) — nothing can ever refresh these, and a dead listener looks exactly like "nothing has changed yet". Publish the resource from the write that changes it, or delete the listener: ${dead.join(", ")}`
    ).toEqual([])
  })

  // AND THE LIST FETCHERS, which is the same disease one layer down. `listFetch`
  // is shared by the screen reads and the reconnect catch-up — but only the
  // entries a TEAM_RESOURCES row names as its `fetchList` are ever reconciled,
  // because that map is what the shell walks when a socket comes back. A fetcher
  // the screens read through and the registry does not name is a cache key that
  // stays stale after a drop, for ever, under a dot reading "Live".
  //
  // That was `helpMine`: `help-mine:<teamId>` was a dep of `help` and nothing
  // more, and a dep carries the TEAM id rather than a row id — so the
  // record-prefix pass on reconnect skipped it (rightly; it is a list) and
  // `reconcile` never visited it either.
  //
  // "A declaration is not a reader" — the listFetch object is cut out before the
  // search, the same way live-deps.test.ts cuts out the deps arrays, or every
  // fetcher would find its own name.
  it("live-collections: every list fetcher is a registry entry, so a reconnect reconciles it", () => {
    const src = stripComments(read(join(WEB, "lib", "live-resources.ts")))
    const decl = src.indexOf("export const listFetch")
    expect(decl, "listFetch is gone — this check has gone blind").toBeGreaterThan(0)
    const end = src.indexOf("\n}", decl)
    const readers = src.slice(0, decl) + src.slice(end)
    const names = Object.keys(listFetch)
    expect(names.length, "no list fetchers found — this check has gone blind").toBeGreaterThan(3)
    const orphans = names.filter((n) => !readers.includes(`listFetch.${n}`))
    expect(
      orphans,
      `a list fetcher no TEAM_RESOURCES entry names, so a dropped socket leaves its list stale: ${orphans.join(", ")}`
    ).toEqual([])

    // …and the shell really does drive the map. Both halves of the catch-up are
    // derived from this registry, so if either loop is renamed away the whole
    // rule above stops meaning anything.
    const shell = stripComments(read(join(WEB, "components", "app-shell.tsx")))
    expect(
      shell,
      "the reconnect catch-up must reconcile every TEAM_RESOURCES entry's list"
    ).toMatch(/Object\.values\(TEAM_RESOURCES\)[\s\S]{0,120}?reconcile\(\s*r\.key\(teamId\)/)
    expect(
      shell,
      "the reconnect catch-up must drop the record-scoped keys by prefix (deps-derived)"
    ).toMatch(/RECORD_KEY_PREFIXES\)\s*invalidatePrefix\(/)
  })
})
