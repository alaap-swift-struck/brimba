// THE KEYSTONE CHECKS — the laws about the laws, and about the surface itself.
// L0 registry integrity (the doc, the data and the table can't drift) · R20
// every navigable destination resolves in a fresh tab · the ROUTE CENSUS (every
// door this app has, with its gate) · and the rule that a law cannot exist
// without a check that exists.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { RULES_REGISTRY } from "@shared/rules/registry"
import { NAV, TEAM_SECTIONS } from "@/lib/pages"

import { ROOT, WEB, read } from "./_paths"

describe("RULES — the keystone", () => {
  // L0 — the keystone: the doc, the data, and the table can't drift.
  it("registry-integrity: RULES.md lists exactly the law ids in RULES_REGISTRY", () => {
    const ids = RULES_REGISTRY.map((r) => r.id)
    expect(new Set(ids).size, "no duplicate law ids").toBe(ids.length)
    const md = read(join(ROOT, "RULES.md"))
    const inDoc = [...md.matchAll(/^\|\s*(R\d+[a-z]?)\s*\|/gm)].map((m) => m[1])
    expect(new Set(inDoc)).toEqual(new Set(ids))

    // AND EVERY OTHER DOCUMENT THAT STATES A RANGE. This check read exactly one
    // file, which is precisely why RULES.md was the one law list that stayed
    // right: four others drifted because nothing looked at them. On 2026-08-25
    // README.md said R1–R19, PLATFORMS.md said R1–R10 twice, CLAUDE.md said
    // R1–R23, and BASE-MANUAL.md said R1–R8 while offering R9 as "a natural next
    // Law" — R9 having been enforced since 4 August with a different meaning.
    //
    // The general rule, and the one worth carrying to the next base: a fact
    // stated in more than one document needs exactly one machine-checked source.
    const top = Math.max(...ids.map((i) => Number(i.replace(/\D/g, ""))))
    const stale: string[] = []
    for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".md"))) {
      for (const m of read(join(ROOT, f)).matchAll(/R1\s*[–-]\s*R(\d+)/g))
        if (Number(m[1]) !== top) stale.push(`${f} says R1–R${m[1]}, the registry holds R1–R${top}`)
    }
    expect(stale, `a document states a law range that is not the registry's: ${stale.join("; ")}`).toEqual([])
  })

  // R20 — every navigable destination resolves in a FRESH TAB. This app is a
  // static export: `/<segment>` only exists if a page source emits it, and a
  // sub-path like `/<segment>/<id>` only resolves if the gateway serves that
  // module's shell for it. Neither is visible from inside the app — the client
  // router never leaves the page, so clicking the nav always works and the
  // missing page shows up only when someone pastes the url somewhere. A fork hit
  // this three times on three different modules before anything said a word.
  //
  // DERIVED from the registries, never hand-listed, so a new section is covered
  // the moment it is declared rather than the moment someone remembers.
  it("static-destinations: every rail destination has a page, and every module shell is served", () => {
    const sidebar = TEAM_SECTIONS.filter((s) => s.placement === "sidebar")
    // Tripwires. Renaming `placement: "sidebar"` (or emptying NAV) would leave
    // the loops below iterating nothing and reporting all clear — the exact
    // silent-disable this law exists to prevent.
    expect(
      sidebar.length,
      'no TEAM_SECTIONS section has placement "sidebar" — the value was renamed and this check went blind'
    ).toBeGreaterThan(0)
    expect(NAV.length, "NAV is empty — this check went blind").toBeGreaterThan(1)

    // (a) A page source for every top-level rail destination.
    const pageFor = (segment: string) =>
      [join(WEB, "app", segment, "page.tsx"), join(WEB, "app", segment, "[[...rest]]", "page.tsx")].find(
        existsSync
      )
    for (const path of [...NAV.map((n) => n.path), ...sidebar.map((s) => `/${s.segment}`)])
      expect(
        pageFor(path.slice(1)),
        `${path} is in the nav but has no page source — it works when clicked and 404s in a fresh tab. Add web/app${path}/[[...rest]]/page.tsx`
      ).toBeDefined()

    // (b) A sidebar section has RECORD sub-paths (/learning/<id>), so its page
    // must be the catch-all shell, not a plain page.
    for (const s of sidebar)
      expect(
        existsSync(join(WEB, "app", s.segment, "[[...rest]]", "page.tsx")),
        `/${s.segment} needs the catch-all shell (web/app/${s.segment}/[[...rest]]/page.tsx) — a record url like /${s.segment}/<id> has nothing to resolve it`
      ).toBe(true)

    // (c) …and the client's route parser must know the path is IN-APP. A path
    // missing from TOP_LEVEL_MODULES makes `isInAppPath` false, so softNavigate
    // hands it to the framework router — which, in a static export, is a full
    // page RELOAD: the shell tears down, the cache empties, a running agent dies.
    // Same failure family as (a) and (b): invisible from a click, three separate
    // lists in three workspaces, and nothing tied them together until now.
    const inApp = read(join(WEB, "components", "deep-link", "route.ts"))
    const declared = /TOP_LEVEL_MODULES = \[([^\]]*)\]/.exec(inApp)
    expect(
      declared,
      "TOP_LEVEL_MODULES could not be found — it was renamed and this third of the check went blind"
    ).not.toBeNull()
    const inAppPaths = [...declared![1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    for (const seg of [...NAV.map((n) => n.slug), ...sidebar.map((s) => s.segment)])
      expect(
        inAppPaths,
        `"${seg}" is a rail destination but isn't in TOP_LEVEL_MODULES — navigating to it would RELOAD the page instead of swapping the screen`
      ).toContain(seg)

    // (d) …and the gateway must serve that shell for those sub-paths.
    const gateway = read(join(ROOT, "workers", "gateway", "src", "index.ts"))
    const shells = /const MODULE_SHELLS = \[([^\]]*)\]/.exec(gateway)
    expect(
      shells,
      "the gateway's MODULE_SHELLS list could not be found — it was renamed and this half of the check went blind"
    ).not.toBeNull()
    expect(
      [...shells![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort(),
      "the gateway serves a different set of module shells than the sidebar declares — a /<segment>/<id> url will 404 in a fresh tab"
    ).toEqual(sidebar.map((s) => s.segment).sort())
  })

  it("route-census-current: the written surface matches the code", async () => {
    // On 12 August a security sweep measured "45/45 state-changing routes gated"
    // and scored 99/100. The doors it never saw were all of auth's POST doors,
    // all of mcp's, realtime's publish door and the gateway beacon — and the one
    // route with no caller check at all was in that missing set.
    //
    // The score was not wrong because the reading was careless. It was wrong
    // because every reviewer has to REDISCOVER the surface, and each one discovers
    // a slightly different surface. So the surface is written down, generated from
    // the source, and checked — the next review inherits it instead of guessing.
    // (security_sentry's own recommendation, 2026-08-25.)
    //
    // HOW MANY DOORS THERE ARE IS DELIBERATELY NOT WRITTEN IN THIS COMMENT. It
    // used to say "There are 58"; `scripts/route-census.mjs` said 61 four lines
    // into its own header; a review said 61 again. Three hand-typed counts, none
    // of them the number the census actually found, each drifting on its own
    // schedule — which is the "45/45" fault one level up, committed by the file
    // that exists to prevent it. ROUTE-CENSUS.md is generated, and is the only
    // place the number lives.
    const { census, render } = await import("../../../scripts/route-census.mjs")
    const rows: {
      worker: string
      method: string
      path: string
      gates: string[]
      changes: boolean
    }[] = census()

    // (a) THE GATES — asserted FIRST, because a door with no lock is a security
    // fact and the document being stale is a bookkeeping one. When the equality
    // in (c) ran first, sabotaging a gate reported "ROUTE-CENSUS.md is out of
    // date" and never named the route.
    //
    // `r.changes`, NOT `method !== "GET"`. The filter used to read
    // `method !== "GET" && method !== "ANY"`, and `ANY` is what a router branch
    // with no method test is called — so `ANY /mcp`, the JSON-RPC door the whole
    // external machine surface arrives through, was excluded from the one check
    // that asks whether a door is gated. Not "found ungated": UNCLASSIFIABLE, by
    // a filter written to avoid over-reporting. The census now decides by
    // BEHAVIOUR — does this branch carry non-GET requests onward — so a door is
    // in or out on what it does, never on what the router happened to say.
    const OPEN_BY_DESIGN: Record<string, string> = {
      "POST /api/auth/email/start":
        "the front door of authentication — there is no session yet and there cannot be. The code is emailed to the ADDRESS, so asking for one gains nothing, and the hourly mint cap bounds it.",
      "POST /publish":
        "realtime's internal fan-out door, reachable ONLY over a service binding: `workers_dev` is false so the worker has no public URL, and the gateway has no route to it (`/publish` is not under `/api/`). Surface minimization IS the gate here — asserted below, because a reason that depends on a config value must be checked against that value.",
    }
    const ungated = rows.filter((r) => r.changes && r.gates.length === 0).map((r) => `${r.method} ${r.path}`)
    expect(
      ungated.filter((r) => !OPEN_BY_DESIGN[r]),
      `a state-changing route has no gate and is not a named exception: ${ungated.join(", ")}`
    ).toEqual([])
    for (const [route, why] of Object.entries(OPEN_BY_DESIGN))
      expect(why.length, `${route} needs a real reason, not a placeholder`).toBeGreaterThan(60)

    // `POST /publish`'s exemption RESTS on realtime having no public URL. A reason
    // that depends on a config value is only as true as that value, so it is
    // checked here — flip `workers_dev` to true and the exemption stops holding,
    // loudly, instead of quietly becoming false.
    for (const w of ["realtime", "auth", "tenancy", "content", "data-ops", "mcp"]) {
      const cfg = read(join(ROOT, "workers", w, "wrangler.jsonc"))
      expect(
        /"workers_dev"\s*:\s*false/.test(cfg),
        `${w} must not have a public workers.dev URL — only the gateway is public`
      ).toBe(true)
    }

    // (b) EVERY WORKER, and EXACTLY the doors the document holds.
    //
    // The worker list is DERIVED from the directories, not the hand-written four
    // it used to name — a new worker is covered the day it is created rather than
    // the day someone remembers this line. It matters more than it looks: the
    // gateway's proxy branches are credited `proxied`, whose whole meaning is
    // "the gate lives on the door behind it", and that is only true while the
    // door behind it is in this census.
    for (const w of readdirSync(join(ROOT, "workers"), { withFileTypes: true }).filter((e) => e.isDirectory()))
      expect(
        rows.some((r) => r.worker === w.name),
        `the census found no routes in ${w.name} — it is blind to that worker's routing shape`
      ).toBe(true)

    // The count was `toBeGreaterThan(90)` against an actual 108: eighteen doors
    // of slack, so eighteen could vanish without a word. A floor far below the
    // truth is not a tripwire, it is a formality — the same fault as the "45/45"
    // it was written to prevent. The document is generated, so exactness is free;
    // what it buys is that a door LOST names itself instead of shrinking a total.
    const documented = [...read(join(ROOT, "ROUTE-CENSUS.md")).matchAll(/^\| (\S+) \| ([A-Z]+) \| `([^`]+)`/gm)].map(
      (m) => `${m[1]} ${m[2]} ${m[3]}`
    )
    const found = rows.map((r) => `${r.worker} ${r.method} ${r.path}`)
    expect(
      documented.length,
      "no rows could be read out of ROUTE-CENSUS.md — the table parser has gone blind"
    ).toBeGreaterThan(0)
    const vanished = documented.filter((d) => !found.includes(d))
    expect(
      vanished,
      `ROUTE-CENSUS.md holds doors the census can no longer see — a door was deleted, or the parser stopped understanding its shape: ${vanished.join(", ")}`
    ).toEqual([])
    const appeared = found.filter((f) => !documented.includes(f))
    expect(
      appeared,
      `these doors exist in the code and are not written down — run \`node scripts/route-census.mjs --write\`: ${appeared.join(", ")}`
    ).toEqual([])
    expect(found.length, "the census and the document disagree about how many doors there are").toBe(
      documented.length
    )

    // (c) …and the rest of the document — gates, kinds, totals.
    expect(
      render(rows),
      "ROUTE-CENSUS.md is out of date — run `node scripts/route-census.mjs --write`"
    ).toBe(read(join(ROOT, "ROUTE-CENSUS.md")))
  })

  // Every enforced law in the registry maps to one of the checks above (or a
  // per-worker seam test) — a law can't exist without a check.
  it("every enforced law has a check that EXISTS", () => {
    // This compared the registry to a HAND-WRITTEN Set of check ids. So it could
    // tell you a law had no id in the list — and could not tell you the named
    // check did not exist, which is the failure that matters. Its own comment was
    // stale by two suites when story_checks_out found it.
    //
    // The list is now derived: every enforced law's `checkId` must appear in a real
    // test file, as an `it(...)` title, a suite name, or the file's own name. A law
    // pointing at a check nobody wrote now fails the build. (story_checks_out,
    // round 2, 2026-08-25.)
    const tests: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next") continue
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.test\.tsx?$/.test(e.name) || /^(gating|publish)-seam\.ts$/.test(e.name))
          tests.push(`${e.name}\n${read(full)}`)
      }
    }
    for (const d of ["web", "workers", "shared"]) walk(join(ROOT, d))
    const haystack = tests.join("\n")
    expect(tests.length, "no test files found — this scan has gone blind").toBeGreaterThan(20)

    const missing = RULES_REGISTRY.filter((r) => r.status === "enforced" && !haystack.includes(r.checkId)).map(
      (r) => `${r.id} names "${r.checkId}"`
    )
    expect(
      missing,
      `an enforced law names a check that exists nowhere in any test file: ${missing.join(", ")}`
    ).toEqual([])
  })

  // SOURCE IS TEXT, and a NUL byte is the one character that decides otherwise.
  //
  // Two files carried literal NULs as key sentinels — `web/components/app-shell.tsx`
  // (the live-sync fan-out, both sockets, the coalescer, the reconnect catch-up)
  // and `workers/data-ops/src/lib/import-plan.ts` (the deterministic core of
  // agentic import). Everything downstream treats a file with a NUL in it as
  // binary: `file(1)` called both `data`, `grep ConnectionStatus app-shell.tsx`
  // came back empty while line 34 imported it, and `git diff` printed "Binary
  // files differ" — so the file owning the hardest-to-reason-about subsystem in
  // the app was the one file nobody could review a diff of. Nothing failed. It is
  // not a bug in any behaviour, which is exactly why it survived.
  //
  // The irony, on the record: `shared/workers/validate.ts` strips NUL out of every
  // request body because a NUL reaching D1 is a 500. We refused it at the front
  // door and typed it into our own source.
  //
  // BYTES, not the decoded string, because that is the level the tools work at.
  it("sources-are-text: no source file contains a NUL byte", () => {
    const binary: string[] = []
    let scanned = 0
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === "out") continue
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(ts|tsx|js|mjs|jsx|sql|json|jsonc|md|css)$/.test(e.name)) {
          scanned++
          if (readFileSync(full).includes(0)) binary.push(full.slice(ROOT.length + 1))
        }
      }
    }
    for (const d of ["web", "workers", "shared", "scripts", "db"]) walk(join(ROOT, d))
    expect(scanned, "no source files found — this scan has gone blind").toBeGreaterThan(200)
    expect(
      binary,
      `a NUL byte makes a source file binary to grep, file(1) and git diff — use a printable sentinel such as \\x1f: ${binary.join(", ")}`
    ).toEqual([])
  })
})
