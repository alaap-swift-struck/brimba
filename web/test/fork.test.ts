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
import { ROOT, read, stripComments } from "../../shared/test/source"

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean)

/** What actually ships: tracked files PLUS untracked ones git would take. A new
 * file carrying a new hardcoded name must be visible before it is committed. */
const shipped = () => run("git", ["ls-files", "-c", "-o", "--exclude-standard"])

/** COMMITTED files only. The binary scan below uses this rather than `shipped()`
 * on purpose: an untracked binary in the working tree is almost always machine
 * output — a Playwright failure screenshot, a build artefact — and a law that
 * turns red because somebody ran the e2e suite is a law people learn to ignore.
 * A binary that actually ships is committed, and is covered the moment it is. */
const tracked = () => run("git", ["ls-files", "-c"])

/** What the sweep reaches — from the script itself, never re-implemented here. */
const swept = () => new Set(run("node", ["scripts/fork.mjs", "--list"]))

/** This app's name, read the way the script reads it. */
const slug: string = JSON.parse(read(join(ROOT, "package.json"))).name
const display = /name:\s*"([^"]+)"/.exec(read(join(ROOT, "shared/brand.ts")))?.[1] ?? ""
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const identity = new RegExp(`${esc(slug)}|${esc(display)}`, "i")

/** A file is BINARY when it holds a NUL byte AND the sweep does not understand
 * its type. The NUL alone is not enough: two source files carry a legitimate NUL
 * sentinel (app-shell.tsx's record-key prefix, import-plan.ts's fingerprint
 * join), and a content-only test called both of them binary and skipped them. */
const isBinary = (f: string, reach: Set<string>) => !reach.has(f) && readFileSync(join(ROOT, f)).includes(0)

/** Does the file NAME us in text? NULs are stripped first, for the same reason. */
const carries = (f: string) => identity.test(readFileSync(join(ROOT, f)).toString("utf8").replace(/\0/g, ""))

/** An ACCOUNT-scoped deploy host: `<app>.<account>.workers.dev`. The sweep
 * rewrites the app label and CANNOT know the account label, so every one of
 * these survives a fork pointing at the author's edge. Derived as a shape, never
 * as the author's literal subdomain — which would itself be an unswept name, and
 * would keep asserting OUR account after somebody else forked this. */
const ACCOUNT_HOST = /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i
/** Prose naming the host is documentation drift, not a fork hazard — these are
 * the files that actually deploy to it, test against it, or link a user to it.
 * COMMENTS ARE STRIPPED for the same reason: a comment explaining the hazard (in
 * the register, or right here) is not the hazard, and a scan that cannot tell
 * the difference reports its own documentation. */
const namesAccountHost = (f: string) =>
  !f.endsWith(".md") && ACCOUNT_HOST.test(stripComments(readFileSync(join(ROOT, f)).toString("utf8")))

describe("R26 — the fork sweep reaches every identity literal", () => {
  it("fork-sweep-complete: every shipped file carrying the product name is one scripts/fork.mjs rewrites", () => {
    const reach = swept()
    const missed = shipped().filter((f) => !reach.has(f) && !(f in FORK_SWEEP_EXEMPT) && carries(f))
    expect(
      missed,
      `hardcoded "${slug}" where the fork sweep cannot reach it — add the file type to EXT/NAMES in scripts/fork.mjs, or give it a reasoned FORK_SWEEP_EXEMPT line: ${missed.join(", ")}`,
    ).toEqual([])
  })

  // THE HALF THE TEXT SCAN CANNOT SEE. Above asks "does this file SAY our name?",
  // which a PNG can never answer — `carries` used to return false for every
  // binary, so four brand icons shipped invisibly to the one law that exists to
  // find them. A binary outside the sweep's reach is brand-shaped by default: it
  // is registered with a reason, or it is a finding.
  it("every shipped BINARY outside the sweep's reach is registered — a text scan cannot read pixels", () => {
    const reach = swept()
    const unregistered = tracked().filter((f) => isBinary(f, reach) && !(f in FORK_SWEEP_EXEMPT))
    expect(
      unregistered,
      `binary assets a fork inherits unchanged, with nothing saying so — give each a FORK_SWEEP_EXEMPT reason naming how a fork gets its own: ${unregistered.join(", ")}`,
    ).toEqual([])
  })

  // AND THE HALF THE SWEEP GETS *HALF* RIGHT. An `<app>.<account>.workers.dev`
  // host sweeps its APP label to the new name and keeps the author's ACCOUNT
  // label — which reads as correct and is not.
  //
  // (The hosts here are written as placeholders on purpose. `stripComments` is
  // desynchronised by a quote inside a template literal's interpolation — see
  // the line above this suite — so comments downstream of one survive the strip
  // and a spelled-out example host would report ITSELF. That only ever adds a
  // false positive, never hides a real one, but a check reporting its own
  // documentation is a check nobody trusts.)
  it("every file naming an ACCOUNT-scoped workers.dev host is registered — the sweep renames the app, never the account", () => {
    const unregistered = shipped().filter((f) => namesAccountHost(f) && !(f in FORK_SWEEP_EXEMPT))
    expect(
      unregistered,
      `these deploy to, test against or link to an account subdomain no rename can guess — register each with what a fork must repoint: ${unregistered.join(", ")}`,
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

  // The map must not rot in the OTHER direction either. An entry whose hazard is
  // gone is a line telling a forker to do work that no longer exists, and — worse
  // — a line the closing fork report prints as if it still mattered.
  it("every fork-sweep exemption is a real shipped file that is still one of the two hazards", () => {
    const reach = swept()
    const ship = new Set(shipped())
    const entries = Object.entries(FORK_SWEEP_EXEMPT)
    expect(entries.length, "the register is empty, so every case above passes on nothing — see the R26 comment in shared/rules/registry.ts").toBeGreaterThan(0)
    for (const [f, why] of entries) {
      expect(ship.has(f), `${f} is registered but does not ship — drop the entry`).toBe(true)
      expect(why.length, `${f} needs a written reason a forker can act on`).toBeGreaterThan(20)
      expect(
        isBinary(f, reach) || namesAccountHost(f) || (!reach.has(f) && carries(f)),
        `${f} is no longer unsweepable — it carries no account host, is not a binary outside the sweep, and holds no identity literal. Drop the exemption.`,
      ).toBe(true)
    }
  })

  // Both new scans must actually FIND their hazard. If the reach ever widened to
  // swallow every binary, or the host shape stopped matching, the two cases above
  // would go green on an empty set and nobody would know.
  it("neither new scan can pass vacuously — both hazards are really present", () => {
    const reach = swept()
    expect(tracked().filter((f) => isBinary(f, reach)).length, "no committed binaries found at all — the binary scan has gone blind").toBeGreaterThan(0)
    expect(shipped().filter(namesAccountHost).length, "no account-scoped host found at all — the host scan has gone blind").toBeGreaterThan(0)
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

  // AND THE LOCKFILE, which is what `npm install` actually obeys.
  //
  // Fixing the manifests was not enough: both pinned v0.16.0 while
  // package-lock.json still resolved the git SHA of v0.4.0, so a FRESH CLONE of
  // main did not compile. This check read the manifests and never opened the
  // lockfile.
  //
  // THE FIRST FIX COULD NOT FAIL EITHER. It accepted any 40-hex SHA and sliced
  // `entry` to end of file, so regressing the lockfile to v0.4.0 with a bogus SHA
  // passed 4/4. Third attempt at this same fault in one session, and each earlier
  // one looked finished. So it now resolves the tag to its ACTUAL commit with
  // `git ls-remote` and demands that exact SHA — there is no shape left to satisfy
  // without being correct. (ocean round 4.)
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { resolved?: string }>
  }
  const spec = [...versions.values()][0]
  const tag = spec.split("#")[1]
  expect(tag, "the pin carries no version tag").toMatch(/^v\d+\.\d+\.\d+$/)

  const entries = Object.entries(lock.packages ?? {}).filter(([k]) => k.includes("@swift-struck/ui"))
  expect(entries.length, "the lockfile has no @swift-struck/ui entry at all").toBeGreaterThan(0)

  const wanted = execFileSync("git", ["ls-remote", "https://github.com/alaap-swift-struck/swift-struck-ui.git", `refs/tags/${tag}^{}`], {
    encoding: "utf8",
  })
    .split(/\s/)[0]
    ?.trim()
  expect(wanted, `git ls-remote could not resolve ${tag} — this check has gone blind`).toMatch(/^[0-9a-f]{40}$/)

  for (const [name, e] of entries) {
    const sha = /#([0-9a-f]{40})/.exec(e.resolved ?? "")?.[1]
    expect(
      sha,
      `${name} has no resolved commit in package-lock.json — run \`npm update @swift-struck/ui\``
    ).toBeTruthy()
    expect(
      sha,
      `package-lock.json resolves ${name} to ${sha}, but ${tag} is ${wanted}. A fresh clone installs the LOCKFILE, not the manifest — run \`npm update @swift-struck/ui\`.`
    ).toBe(wanted)
  }
})
