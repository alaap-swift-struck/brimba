// THE LAWS OF THE BASE, machine-checked (see RULES.md + shared/rules/registry.ts).
// Each `it` is the enforcement for one law — break a law and this build goes red.
// It reads source straight off disk (like the publish-seam tests) so the checks
// can't be fooled by anything but the real code.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { GLOSSARY } from "@shared/glossary"
import {
  ACTIVITY_GATE_MAP,
  ACTIVITY_TABLE_EXEMPT,
  CREATE_OPENS_RECORD,
  CREATE_OPENS_RECORD_EXEMPT,
  CREATE_RETURNS_EXEMPT,
  MUTATION_RETURNS_EXEMPT,
  DEAF_EXEMPT,
  FORM_DIALOGS,
  GROWING_COLLECTIONS,
  RECORD_DETAIL_COMPONENTS,
  RULES_REGISTRY,
  TAB_COUNT_EXCEPTIONS,
} from "@shared/rules/registry"
import { BULK_DOORS, ORDERED_TWINS } from "@shared/workers/bulk-doors"
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES } from "../lib/live-resources"
import { NAV, TEAM_SECTIONS } from "../lib/pages"
import { BASE_RECIPES } from "../lib/screens"

// R11's check once walked `workers/*/src` only while carrying an exemption for
// `shared/workers/http.ts` — a path it could never reach. Every source reader in
// this file now comes from ONE module, so a blind walk cannot be reinvented per
// check. See shared/test/source.ts for the eight faults that produced it.
import {
  componentFiles,
  declarationBody,
  namedBody,
  read,
  serverSources,
  stringLiterals,
  stripComments,
  workerSources,
} from "../../shared/test/source"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const WEB = join(HERE, "..") // web/
const ROOT = join(WEB, "..") // repo root

describe("RULES — the laws of the base", () => {
  // L0 — the keystone: the doc, the data, and the table can't drift.
  it("registry-integrity: RULES.md lists exactly the law ids in RULES_REGISTRY", () => {
    const ids = RULES_REGISTRY.map((r) => r.id)
    expect(new Set(ids).size, "no duplicate law ids").toBe(ids.length)
    const md = read(join(ROOT, "RULES.md"))
    const inDoc = [...md.matchAll(/^\|\s*(R\d+[a-z]?)\s*\|/gm)].map((m) => m[1])
    expect(new Set(inDoc)).toEqual(new Set(ids))
  })

  // R2 — every record-detail screen exposes Overview + Activity tabs. The
  // engine-recipe details (team/members/invites) carry them as recipe data; the
  // bespoke ones must render them themselves.
  it("record-detail-tabs: bespoke record details render tabs + an Activity feed", () => {
    for (const c of RECORD_DETAIL_COMPONENTS) {
      const src = read(join(WEB, "components", `${c}.tsx`))
      expect(src, `${c} must use library TabsView`).toContain("TabsView")
      expect(src, `${c} must render an ActivityFeed (the Activity tab)`).toContain("ActivityFeed")
    }
  })

  // R3 — collection tab strips use TabsView; no hand-rolled <Button> toggles
  // (a selected-state toggle has the tell-tale `variant={x === y ? … : …}`).
  it("no-handrolled-toggles: no component fakes a tab strip with Button variants", () => {
    const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
    expect(offenders, `use the library TabsView instead of hand-rolled toggles: ${offenders.join(", ")}`).toEqual([])
  })

  // R4 — every form dialog renders through the shared FormShell.
  it("forms-use-formshell: every form dialog imports FormShell", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must use FormShell (one shared form layout)`).toContain("form-shell")
    }
  })

  // R7 — every form dialog persists its draft per session, so unsaved input survives
  // navigating away (CACHING.md §11). The draft hook is the single seam.
  it("forms-persist-drafts: every form dialog persists its draft via useFormDraft", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must persist its draft (useFormDraft — CACHING.md §11)`).toContain("useFormDraft")
    }
  })

  // R8 — every team collection tab derives its count from its loaded rows. A
  // placement:"tab" section that shows a collection MUST declare a countCacheKey
  // (so the badge is derived, never a forgotten hand-listed key), AND the host
  // must build the counts by iterating that field — not a per-key literal.
  it("tab-counts-derived: every collection tab declares a countCacheKey, derived generically", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.placement !== "tab") continue
      if (s.countCacheKey === undefined) {
        expect(
          TAB_COUNT_EXCEPTIONS[s.key],
          `team tab "${s.key}" shows a collection → it must declare a countCacheKey (or be a reviewed TAB_COUNT_EXCEPTIONS entry)`
        ).toBeTruthy()
      } else {
        expect(s.countCacheKey.trim(), `team tab "${s.key}" countCacheKey must be non-empty`).not.toBe("")
      }
    }
    // Anti-regression: the host derives the badges by iterating countCacheKey — no
    // hand-listed per-section literal can creep back in.
    const src = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(src, "deep-link-screen must derive tab counts from countCacheKey").toContain("s.countCacheKey")
  })

  // R5 — record activity is read through the ONE generic (table, id) path.
  it("generic-activity-path: the activity read path has a generic record scope", () => {
    const src = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(src, "activity-read must support the generic `record` scope").toContain('scope === "record"')
    const api = read(join(WEB, "lib", "api.ts"))
    expect(api, "the web app reads record activity through the one fetcher").toContain("recordActivity")
  })

  // R6 — the glossary is the single, well-formed dictionary of product terms.
  it("glossary-wellformed: every term is present, brief, and unique", () => {
    const terms = new Set<string>()
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.trim(), `${key}.term`).not.toBe("")
      expect(entry.def.trim(), `${key}.def`).not.toBe("")
      expect(entry.def.length, `${key}.def must be brief (≤140 chars), never over-explained`).toBeLessThanOrEqual(140)
      expect(terms.has(entry.term), `duplicate term "${entry.term}"`).toBe(false)
      terms.add(entry.term)
    }
  })

  // R11 — every EXTERNAL fetch (a bare global fetch() to the internet) carries an
  // AbortSignal timeout, so a hung socket can't stall a worker. Service-binding calls
  // (X.fetch()) are Cloudflare-bounded and exempt (the bare-fetch regex skips them).
  it("fetch-timeout: every external fetch carries an AbortSignal timeout", () => {
    const serverDirs = [
      join(ROOT, "shared", "workers"),
      // Directories only — skip stray files (e.g. a macOS .DS_Store) so the scan can't
      // try to walk `<file>/src` and die with ENOTDIR.
      ...readdirSync(join(ROOT, "workers"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(ROOT, "workers", e.name, "src")),
    ]
    const tsFiles = (dir: string): string[] => {
      const out: string[] = []
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p)
        }
      }
      walk(dir)
      return out
    }
    const offenders: string[] = []
    for (const dir of serverDirs) {
      for (const file of tsFiles(dir)) {
        const src = read(file)
        // `await fetch(` = an awaited call to the GLOBAL fetch (an external socket).
        // This excludes service bindings (`X.fetch`), the Worker `async fetch(` handler,
        // and type annotations (`{ fetch(url…) }`) — all of which aren't external calls.
        const re = /\bawait fetch\(/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          const window = src.slice(m.index, m.index + 600)
          if (!/signal:\s*AbortSignal\.timeout/.test(window))
            offenders.push(`${file.slice(ROOT.length)} @${m.index}`)
        }
      }
    }
    expect(offenders, `external fetch without an AbortSignal timeout (R11): ${offenders.join(", ")}`).toEqual([])
  })

  // R11, second half — the INTERNAL hop. R11 used to EXEMPT service bindings, on the
  // grounds that they are "Cloudflare-bounded". The architecture review (2026-08-18)
  // disproved that in the way that matters: the platform bounds the WORKER, but nothing
  // bounds the CALL — so a slow auth held every request in every worker open, and worse,
  // a caller could not tell "auth says no" from "auth said nothing" and an outage logged
  // everyone out. Both now go through `shared/workers/trace.ts`.
  //
  // WHAT THIS CHECKS, said plainly, because a check that overclaims is worse than none:
  // that no worker calls a service binding DIRECTLY. It canNOT check that a caller then
  // treats null (no answer) differently from a refusal — that needs the meaning of the
  // code, not its shape. The honest cover for that is the behavioural test in
  // `workers/gateway/test/trace.test.ts`.
  it("service-calls-bounded: no worker calls a service binding directly (R11)", () => {
    // The one seam allowed to touch a binding — it IS the bound.
    const SEAM = "shared/workers/trace.ts"
    // Reviewed exceptions, each named with its reason, so adding one is a decision.
    const EXEMPT: Record<string, string> = {
      "shared/workers/http.ts":
        "forwardToDoor — the act-as-user seam. Deliberately unbounded: the doors it forwards to do real work of unbounded duration (an import batch), and a bound that cuts a working import off is worse than none. It DOES carry the trace id.",
    }
    // The seven WORKERS. `ASSETS` is deliberately absent: it is Cloudflare's static
    // asset serving, not a separately-deployed worker that can be missing, wedged or
    // mid-rollout — it is not a node in the blast-radius map at all. And the guard's
    // fallback is a JSON 503, which for a page load would be worse than the platform's
    // own error page: the browser is asking for HTML.
    const BINDINGS = ["AUTH", "TENANCY", "CONTENT", "DATAOPS", "MCP", "REALTIME"]
    const offenders: string[] = []
    // serverSources, NOT workerSources. This check walked `workers/*/src` only for
    // its first week — while carrying, three lines above, an exemption keyed
    // `shared/workers/http.ts`: a path it could not reach. The exemption was the
    // proof it was blind and nobody read it that way.
    for (const [path, src] of serverSources()) {
      const rel = path.replace(/^\//, "")
      if (rel.endsWith(SEAM) || EXEMPT[rel]) continue
      const code = stripComments(src)
      for (const b of BINDINGS) {
        // `env.AUTH.fetch(` is the direct shape. A binding handed to a helper as an
        // ARGUMENT is fine — that helper is where the bound lives, which is the whole
        // point of having a seam.
        if (new RegExp(`env\\.${b}\\.fetch\\(`).test(code)) offenders.push(`${rel} -> env.${b}.fetch`)
      }
      // THE ALIAS. `const fetcher = x ? env.CONTENT : env.TENANCY` followed by
      // `fetcher.fetch(...)` is the same unbounded, untraced hop with a local name
      // in front of it. Three of them lived on the import path, invisible to the
      // direct-shape regex above, each fanning one request into thousands of door
      // calls with no timeout and no request id. (Architecture review, 2026-08-25.)
      const alias = /(?:const|let)\s+(\w+)\s*(?::[^=\n]*)?=\s*([^\n;]*)/g
      let a: RegExpExecArray | null
      while ((a = alias.exec(code))) {
        const [, name, rhs] = a
        if (!BINDINGS.some((b) => new RegExp(`env\\.${b}\\b`).test(rhs))) continue
        if (new RegExp(`\\b${name}\\.fetch\\(`).test(code)) offenders.push(`${rel} -> ${name}.fetch (aliased binding)`)
      }
    }
    // The tripwire this check never had: it must SEE the shared seams, or it is
    // reading a fraction of the base and reporting all clear.
    expect(
      serverSources().some(([p]) => p.includes("shared/workers/")),
      "R11's scan cannot see shared/workers — the seams every worker imports are where its own exemption lives"
    ).toBe(true)
    expect(
      offenders,
      `service binding called directly instead of through callService/proxyService (R11): ${offenders.join(", ")}`
    ).toEqual([])
  })

  // R12 — every cron / scheduled handler records its failures to the error store.
  // Unattended work has no user watching, so a swallowed background failure would be
  // invisible in the 90-day error_logs. (The request dispatcher already records; this
  // guards the background handlers.)
  it("cron-records: every scheduled handler records failures via recordWorkerError", () => {
    const offenders: string[] = []
    for (const w of readdirSync(join(ROOT, "workers"))) {
      const idx = join(ROOT, "workers", w, "src", "index.ts")
      if (!existsSync(idx)) continue
      const src = read(idx)
      const m = /async scheduled\s*\(/.exec(src)
      if (!m) continue // no cron in this worker
      // The scheduled handler runs to the end of the file — it must record.
      if (!/recordWorkerError/.test(src.slice(m.index)))
        offenders.push(w)
    }
    expect(offenders, `cron handler that swallows failures without recording (R12): ${offenders.join(", ")}`).toEqual([])
  })

  // R14 — no unbounded list endpoint: every exported list*/search* function in a
  // worker lib either pages or carries a hard-cap LIMIT (one unbounded read
  // stalls a worker at 100k rows — the 24k-catalogue failure).
  //
  // THE BOUND MUST BE IN THE SQL, NOT IN THE FUNCTION. This check used to ask
  // "does the token LIMIT appear anywhere in this body?", which a NON-SQL
  // occurrence answered for free: a constant named `BULK_IDS_LIMIT`, a parameter
  // called `limit`, a type. The law is about a clause in a statement, so the scan
  // now reads STATEMENTS: every SQL string literal in the body that SELECTs must
  // carry its own LIMIT. A variable name is code, not SQL, and no longer counts.
  //
  // It does NOT flag legitimate delegation, and that is the reason for the shape:
  // a function that hands its bound to a helper (or to the paging seam) has no
  // SELECT literal of its own, so there is nothing to examine — a stricter scan
  // over the whole BODY is what would have flagged those.
  it("bounded-lists: every SELECT inside an exported list*/search* carries its own LIMIT", () => {
    // The two shapes that return a bounded number of rows BY CONSTRUCTION, so a
    // LIMIT would say nothing: an aggregate (one row, or one per group) and a
    // primary-key equality (`id = ?` — `team_id = ?` does not match: `_` is a
    // word character, so there is no boundary before that `id`).
    const AGGREGATE = /\b(?:COUNT|SUM|AVG|MIN|MAX|TOTAL|GROUP_CONCAT)\s*\(/i
    const KEY_LOOKUP = /\bWHERE\b[\s\S]*?(?:^|[\s.(])id\s*=\s*[?$]/i

    const offenders: string[] = []
    let seen = 0
    let statements = 0
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/lib/")) continue
      // BOTH export shapes. A scan that only knows `export function listX` goes
      // silently blind the day someone writes `export const listX = async () =>`
      // — the read is then unbounded AND invisible, which is worse than either.
      const re = /export (?:async )?function ((?:list|search)\w*)|export const ((?:list|search)\w*)\s*(?::[^=;\n]*)?=/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        seen++
        const body = stripComments(declarationBody(src, m.index))
        for (const sql of stringLiterals(body)) {
          if (!/\bSELECT\b/i.test(sql)) continue
          statements++
          if (AGGREGATE.test(sql) || KEY_LOOKUP.test(sql) || /\bLIMIT\b/i.test(sql)) continue
          offenders.push(`${path} → ${m[1] ?? m[2]}: ${sql.replace(/\s+/g, " ").trim().slice(0, 80)}`)
        }
      }
    }
    // TWO tripwires, because this check has two ways to go blind and both report
    // "all clear" exactly like a passing run: finding no list functions, and
    // finding functions but extracting no SQL out of them.
    expect(seen, "the bounded-lists scan found no list functions at all — it has gone blind").toBeGreaterThan(15)
    expect(
      statements,
      "the bounded-lists scan read no SQL statements at all — the literal extractor has gone blind"
    ).toBeGreaterThan(15)
    expect(
      offenders,
      `unbounded list read (R14) — add a hard-cap LIMIT (with its comment) or real paging: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // R22 — creating a MASTER record through a form OPENS that record (owner's
  // decision, 2026-08-11). Implemented ONCE, in the shared form seam, so a module
  // declares `opensRecord` and gets the behaviour — rather than every screen
  // remembering to navigate, which is how one module ends up behaving
  // differently from the rest.
  it("create-opens-record: every create form opens its record, or is a NAMED exception", () => {
    // Derived from FORM_DIALOGS: a new form must land in exactly one of the two
    // maps, so adding one forces the decision instead of defaulting to silence.
    for (const dialog of FORM_DIALOGS) {
      const opens = CREATE_OPENS_RECORD[dialog]
      const exempt = CREATE_OPENS_RECORD_EXEMPT[dialog]
      expect(
        Boolean(opens) !== Boolean(exempt),
        `${dialog} must be in exactly ONE of CREATE_OPENS_RECORD / CREATE_OPENS_RECORD_EXEMPT — "nobody decided" and "we decided not to" must not look the same`
      ).toBe(true)
      if (exempt)
        expect(exempt.why.length, `${dialog} is exempt from R22 — say WHY, per table`).toBeGreaterThan(20)
      if (!opens) continue
      const src = read(join(WEB, "components", `${dialog}.tsx`))
      expect(src, `${dialog} must declare opensRecord on its FormShell (R22)`).toContain("opensRecord=")
      expect(
        src,
        `${dialog} must open the "${opens.segment}" segment its detail screen lives under`
      ).toContain(`segment: "${opens.segment}"`)
      // …and the create path must actually RESOLVE with an id, or opensRecord is
      // a declaration that never fires.
      expect(
        /return createdId/.test(src),
        `${dialog} declares opensRecord but never resolves with the created id — the record would never open`
      ).toBe(true)
      // …and it must NOT close itself on the create path. The host's close is
      // `router.back()`, which is ASYNCHRONOUS: it fires after FormShell's push
      // and pops straight back off the record just opened. Every check here was
      // green while the law did nothing, on staging, in a browser — so this is
      // the assertion that would have caught it: the close is GUARDED by the id.
      expect(
        /if \(!createdId\) onOpenChange\(false\)/.test(src),
        `${dialog} closes itself on the create path — the host's close is router.back(), which fires AFTER the navigation and pops off the new record. Guard it: \`if (!createdId) onOpenChange(false)\``
      ).toBe(true)
    }
    // The seam itself: the navigation lives in FormShell, not in the screens.
    const shell = read(join(WEB, "components", "form-shell.tsx"))
    expect(shell, "FormShell owns R22 — it opens the record the create resolved with").toContain("openRecord(")
  })

  // R21 — a create door returns the CREATED RECORD, never the collection. Handing
  // the whole list back to add one row costs the caller a capped list it did not
  // ask for, contradicts row-level live-sync (CACHING rule 3) and the paging rule
  // (a screen reads one bounded page, never the table), and — the part that
  // actually bites — leaves the caller unable to learn the new record's id
  // without a follow-up search.
  //
  // DERIVED FROM THE GATE, not a hand-list of handler names: a create door is a
  // route that opens on the `create` right. A new module's create door is covered
  // the moment it is gated, which is the moment it exists.
  it("create-returns-row: a create door returns the created record, never the collection", () => {
    const offenders: string[] = []
    const seen = new Set<string>()
    const namedCreators: string[] = []
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      for (const n of src.matchAll(/export async function (postCreate\w+)/g)) namedCreators.push(n[1])
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        // `(?:<[^(<>]*>)?` — gatedBody carries a type argument at most call sites;
        // a scan that doesn't allow for it silently skips every one of them.
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (CREATE_RETURNS_EXEMPT[name]) continue
        seen.add(name)
        if (/:\s*await\s+(?:list|search)\w*\(/.test(body) || /return\s+\w*Page\(/.test(body))
          offenders.push(`${path} → ${name} hands back a COLLECTION (return the created row + its exact total)`)
        if (/await\s+create\w*\(/.test(body) && !/\bcreated:/.test(body))
          offenders.push(`${path} → ${name} creates a record but never returns it as \`created\``)
      }
    }
    // THE TRIPWIRE, cross-checked rather than a magic number. A handler NAMED
    // postCreate* is a create door by construction; the scan finds doors by their
    // GATE. Two independent signals, so a gate regex that quietly stops matching
    // (e.g. forgetting that `gatedBody` carries a type argument) is caught by the
    // other one instead of reporting all clear.
    expect(namedCreators.length, "no postCreate* handlers found at all — the scan has gone blind").toBeGreaterThan(3)
    expect(
      namedCreators.filter((n) => !seen.has(n) && !CREATE_RETURNS_EXEMPT[n]),
      "these handlers are named like create doors but the gate-derived scan never saw them — the scan is blind to some of the doors it is meant to cover"
    ).toEqual([])
    expect(offenders, `a create door returned a collection (R21): ${offenders.join("; ")}`).toEqual([])
  })

  // R24 — a single-record write door either HAS a bulk twin or a written reason
  // why it cannot, and every twin declares whether its rows may run TOGETHER or
  // must run IN ORDER.
  //
  // The ordering half is the point. A stock movement computes its balance from
  // what the previous line left behind; ten run together give ten
  // individually-plausible lines and a ledger nobody can untangle. Most writes
  // have no such dependency and are needlessly slow if forced sequential.
  //
  // WHAT THIS CHECK CAN AND CANNOT SEE — stated here because a check that
  // overclaims is worse than none. It CAN prove every door decided, and that an
  // `in-order` twin does not parallelise. It CANNOT prove a `together` door is
  // really order-independent; that needs meaning, not shape, so each ordered
  // twin owes a behavioural test instead.
  it("bulk-twin-declared: every write door decides about bulk, and ordered twins stay ordered", () => {
    const missing: string[] = []
    const parallelised: string[] = []
    const seen = new Set<string>()

    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"(?:edit|delete)"\s*\)/.test(body)) continue
        if (/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (/^postBulk/.test(name)) continue // a twin is not itself a single door
        seen.add(name)
        if (!BULK_DOORS[name])
          missing.push(`${path} → ${name} has not decided about bulk (add a twin or a reason to shared/workers/bulk-doors.ts)`)
      }

      // An ORDERED twin must not fan its rows out. This is the fault the law is
      // for, and it IS visible in the shape of the code.
      for (const twin of ORDERED_TWINS) {
        const at = src.indexOf(`export async function ${twin}`)
        if (at === -1) continue
        const body = stripComments(declarationBody(src, at))
        if (/Promise\.all\(|\.map\(\s*async/.test(body))
          parallelised.push(`${path} → ${twin} is declared in-order but hands its rows to Promise.all`)
      }
    }

    // The tripwire: if the gate scan stops matching, `seen` empties and the
    // whole check passes vacuously while enforcing nothing.
    expect(seen.size, "no edit/delete-gated doors found at all — the scan has gone blind").toBeGreaterThan(5)
    expect(missing, missing.join("; ")).toEqual([])
    expect(parallelised, parallelised.join("; ")).toEqual([])

    // A declared twin must actually exist. A registry naming a handler nobody
    // wrote is a law that reads as satisfied and protects nothing.
    const handlers = new Set<string>()
    for (const [p2, src] of workerSources())
      if (p2.includes("/src/routes/"))
        for (const n of src.matchAll(/export async function (\w+)/g)) handlers.add(n[1])
    const phantom = Object.values(BULK_DOORS)
      .flatMap((d) => ("twin" in d ? [d.twin] : []))
      .filter((t) => !handlers.has(t))
    expect(phantom, `declared twins that do not exist: ${phantom.join(", ")}`).toEqual([])
  })

  // R23 — a MUTATION door returns the affected row, never the collection.
  //
  // R21 established this for creates and stopped there. Every edit, status and
  // deactivate door still handed back the whole capped list: a full list read
  // plus a COUNT on the server, and the entire collection over the wire, to
  // change one row. Worse, it contradicted the rule this base enforces
  // everywhere else — a live ping makes every OTHER client patch the single
  // changed row (CACHING rule 3), while the client that did the work replaced
  // everything it was showing. Two update paths for one event, and the
  // expensive one belonged to the person actually waiting for it.
  //
  // What is banned is the COLLECTION, not "anything that isn't a row": a bulk
  // door honestly returns `{ updated, skipped }` and a toggle may return
  // `{ ok: true }`. Both are fine — neither ships a list.
  //
  // DERIVED FROM THE GATE, like R21: a mutation door is a route opening on the
  // `edit` or `delete` right, so a new module is covered the moment it is gated.
  it("mutation-returns-row: an edit/deactivate door returns the affected row, never the collection", () => {
    const offenders: string[] = []
    const seen = new Set<string>()
    const namedMutators: string[] = []
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/routes/")) continue
      for (const n of src.matchAll(/export async function (postUpdate\w+|postSet\w+Active)/g))
        namedMutators.push(n[1])
      const re = /export async function (\w+)\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const name = m[1]
        const body = stripComments(declarationBody(src, m.index))
        // Same shape as R21's gate scan — `gatedBody` carries a type argument at
        // most call sites, and a scan blind to that skips nearly every door.
        if (!/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"(?:edit|delete)"\s*\)/.test(body))
          continue
        // A door that ALSO gates on `create` is a CREATE door and belongs to
        // R21, not here — `postCreateRole` demands edit as well, because
        // creating a role WITH a permission matrix is create-plus-edit in one
        // move. A create legitimately returns the new total, since a create is
        // the only thing that can move it. Without this, the two derived rules
        // overlap and R23 contradicts R21 on the same handler.
        if (/(?:gatedBody|gated|requireRight)(?:<[^(<>]*>)?\([^)]*"create"\s*\)/.test(body)) continue
        if (MUTATION_RETURNS_EXEMPT[name]) continue
        seen.add(name)
        if (/:\s*await\s+(?:list|search)\w*\(/.test(body) || /return\s+\w*Page\(/.test(body))
          offenders.push(`${path} → ${name} hands back a COLLECTION (return the affected row + its exact total)`)
        // …and it must not COUNT either. Every one of these counts is an
        // unfiltered COUNT(*), and the base is deactivate-not-delete, so no
        // edit — not even a deactivate — can change how many rows a collection
        // HAS. Only a create can. A full-table count on the hot path of every
        // edit, to return a number that provably did not move, is the most
        // avoidable query in the app.
        if (/:\s*await\s+count\w*\(/.test(body))
          offenders.push(`${path} → ${name} runs a COUNT an edit cannot have changed (drop it — only a create moves the total)`)
      }
    }
    // The same two-signal tripwire R21 uses. A handler named postUpdate* or
    // postSet*Active is a mutation door by construction; the scan finds doors by
    // their GATE. If the gate regex quietly stops matching, the name-derived
    // list catches it instead of the check reporting all clear.
    expect(
      namedMutators.length,
      "no postUpdate*/postSet*Active handlers found at all — the scan has gone blind"
    ).toBeGreaterThan(3)
    expect(
      namedMutators.filter((n) => !seen.has(n) && !MUTATION_RETURNS_EXEMPT[n]),
      "these handlers are named like mutation doors but the gate-derived scan never saw them — the scan is blind to some of the doors it is meant to cover"
    ).toEqual([])
    expect(offenders, `a mutation door returned a collection (R23): ${offenders.join("; ")}`).toEqual([])
  })

  it("mutation-returns-row: the single-row reader reads ONE row, not the whole list (R23)", () => {
    // R23's letter is "return the affected row". Every `one*` reader obeyed it by
    // reading the WHOLE capped list and calling `.find()` — so the law removed a
    // full list read from the WIRE and left it in the DATABASE, on the hot path of
    // every create, edit, status change and deactivate.
    //
    // And it was not only wasteful. Past `LIST_HARD_CAP` the `.find()` misses and
    // the reader returns `null`, which `applyUpdated` reads as "this record left
    // the list" — so editing row 1,001 made it vanish from the screen. The shape
    // guarantee those readers were buying (a single row identical to a listed one)
    // is better bought by SHARING the projection, which is what they do now.
    // (Scaling + speed reviews, 2026-08-25.)
    const offenders: string[] = []
    let seen = 0
    for (const [path, src] of serverSources()) {
      if (!path.includes("/src/lib/")) continue
      const re = /export async function (one[A-Z]\w*)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        seen++
        const body = stripComments(declarationBody(src, m.index))
        if (/await\s+(?:list|search)\w*\(/.test(body) && /\.find\(/.test(body))
          offenders.push(`${path} → ${m[1]} reads a whole list to return one row`)
      }
    }
    expect(seen, "no one* single-row readers found at all — the scan has gone blind").toBeGreaterThan(3)
    expect(
      offenders,
      `a single-row reader read the whole collection (R23) — give it its own WHERE id = ?, sharing the list's projection: ${offenders.join("; ")}`
    ).toEqual([])
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

  // R14, the other half — a cap is an honest REFUSAL to answer, so a collection
  // that grows with ordinary use must PAGE instead: keyset (never OFFSET, which
  // re-scans everything skipped and duplicates rows under concurrent writes), an
  // exact total, hasMore, an opaque cursor — and a client that can actually reach
  // page two. Paging no one can reach is dead code wearing a law's clothes.
  it("bounded-lists: every GROWING collection pages by key, end to end", () => {
    for (const [name, c] of Object.entries(GROWING_COLLECTIONS)) {
      const lib = read(join(ROOT, c.lib))
      const at = lib.indexOf(`export async function ${c.fn}`)
      expect(at, `${name}: ${c.fn} must exist in ${c.lib}`).toBeGreaterThan(-1)
      const next = lib.indexOf("\nexport ", at + 1)
      const body = lib.slice(at, next === -1 ? undefined : next)
      for (const seam of ["decodeCursor", "keysetAfter", "toPage"])
        expect(body, `${name} (${c.why}) must page through the ${seam} seam, not a hard cap`).toContain(seam)
      expect(body, `${name} must not page by OFFSET — keyset only`).not.toMatch(/OFFSET/i)

      // The door must hand the WHOLE contract back, through the one pagedJson
      // seam — a door assembling its own response literal can (and did) ship with
      // half the contract, and the client then silently loses page two.
      const routes = read(join(ROOT, c.routes))
      expect(routes, `${c.routes} must answer ${name} through the pagedJson seam`).toContain("pagedJson")
      // …and NOTHING may hand these rows back any other way: a response built by
      // hand is how a door ships half the contract (rows + total, no cursor).
      const handBuilt = [...routes.matchAll(/(?<![A-Za-z])json\(/g)].filter((m) =>
        new RegExp(`\\b${c.rowsKey}\\s*:`).test(routes.slice(m.index, (m.index ?? 0) + 300))
      )
      expect(
        handBuilt.length,
        `${c.routes} hands \`${c.rowsKey}\` back through a hand-built json() — every page must go through pagedJson`
      ).toBe(0)

      // …and something in web must be able to ask for page two.
      const wired = componentFiles().some((f) => {
        const src = read(f)
        return src.includes("<LoadMore") && src.includes(c.webKey)
      })
      expect(wired, `${name} pages on the server but nothing in web can reach page two`).toBe(true)

      // R14 meets R16: the collection frame's own "Showing X of Y" counts the
      // LOADED prefix, so on a paged screen it under-reports — and it is a
      // second count besides. The exact one above is the only one.
      if (c.listRecipe) {
        const recipe = BASE_RECIPES[c.listRecipe]
        expect(recipe, `${name}: recipe ${c.listRecipe} must exist`).toBeDefined()
        expect(
          recipe.collection?.showCount,
          `${name} is paged, so its recipe must not render the frame's own "Showing X of Y" (it counts the loaded prefix)`
        ).toBe(false)
      }
    }
  })

  // R17 — state transitions are idempotent: every deactivate/reactivate UPDATE
  // carries the current-status predicate (a double click must move ZERO rows and
  // write no duplicate history), and the writers read the changed count back.
  it("idempotent-transitions: every deactivate/reactivate UPDATE carries the status predicate", () => {
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      let idx = -1
      while ((idx = src.indexOf("SET deactivated_at =", idx + 1)) !== -1) {
        // The statement window: from its UPDATE keyword to just past the match.
        const from = src.lastIndexOf("UPDATE", idx)
        const stmt = src.slice(from, Math.min(src.length, idx + 500))
        // An upsert's DO UPDATE (excluded.*) re-activates by design — exempt.
        if (/excluded\./.test(stmt)) continue
        if (!/deactivated_at IS (NOT )?NULL/.test(stmt)) offenders.push(`${path} @${idx}`)
      }
      // Status moves too: a help status UPDATE must carry `status <> ?`.
      let s = -1
      while ((s = src.indexOf("UPDATE help SET status", s + 1)) !== -1) {
        const stmt = src.slice(s, Math.min(src.length, s + 500))
        if (!/status <>/.test(stmt)) offenders.push(`${path} @${s} (status move without <> predicate)`)
      }
    }
    expect(
      offenders,
      `state transition without the current-status predicate (R17): ${offenders.join(", ")}`
    ).toEqual([])
    // The three transition writers read the changed count back (RETURNING id) so
    // a zero-row move can skip the activity row + the publish.
    for (const [file, fn] of [
      ["workers/tenancy/src/lib/roles.ts", "setRoleActive"],
      ["workers/tenancy/src/lib/selectable.ts", "setSelectableActive"],
      ["workers/content/src/lib/learning.ts", "setLearningActive"],
      ["workers/content/src/lib/help.ts", "setStatus"],
    ] as const) {
      const src = read(join(ROOT, ...file.split("/")))
      // `declarationBody`, NOT slice-to-end-of-file. The old form sliced from the
      // function to the END OF THE FILE and grepped for `return false` in all of
      // it — so ANY later function's `return false` satisfied it. Proven blind on
      // 2026-08-18: the row-count check was deleted from setLearningActive, an
      // unrelated `return false` was added forty lines below, and this check went
      // GREEN with the exact bug R17 exists to prevent sitting in the file.
      const body = declarationBody(src, src.indexOf(`export async function ${fn}`))
      expect(/RETURNING id/.test(body), `${fn} must read the changed-row count (RETURNING id)`).toBe(true)
      expect(
        /return false/.test(body),
        `${fn} must skip activity/publish when zero rows moved — and the check now reads ONLY this function's body`
      ).toBe(true)
    }
  })

  // R18 — a cross-module read carries the caller's module rights. Every
  // relatedTable any worker writes must resolve through the gate map (or a
  // pinned, reasoned exemption); the team feed subtracts denied modules through
  // ONE shared clause any count must reuse.
  it("activity-gate-coverage: every relatedTable resolves to a gated module or a pinned exemption", () => {
    const known = new Set([...Object.keys(ACTIVITY_GATE_MAP), ...Object.keys(ACTIVITY_TABLE_EXEMPT)])
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      for (const m of src.matchAll(/relatedTable: "([a-z_]+)"/g))
        if (!known.has(m[1])) offenders.push(`${path} writes relatedTable "${m[1]}"`)
    }
    // Dynamic writer: the import engine logs relatedTable: target.tableKey — so
    // every TargetDef key must be in the gate map (imports write real module rows).
    const targetsSrc = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    for (const m of targetsSrc.matchAll(/tableKey: "([a-z_]+)"/g))
      if (!(m[1] in ACTIVITY_GATE_MAP)) offenders.push(`targets.ts TargetDef "${m[1]}" not in ACTIVITY_GATE_MAP`)
    expect(
      offenders,
      `a table the feed cannot NAME is a table it cannot withhold (R18) — add it to ACTIVITY_GATE_MAP or (with a reason) ACTIVITY_TABLE_EXEMPT: ${offenders.join(", ")}`
    ).toEqual([])

    // The ONE clause: the reader exposes the shared builder, the team scope uses
    // it, and the route builds `allowed` from the registry map + the caller's rights.
    const reader = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(reader).toContain("export function activityVisibilityClause")
    expect(reader).toContain('scope === "team"')
    const route = read(join(ROOT, "workers", "tenancy", "src", "routes", "team.ts"))
    expect(route).toContain("ACTIVITY_GATE_MAP")
    expect(route).toContain("getMyPermissions")
  })

  // R15 — every paged screen consumes the live channel, AND no deaf publishers:
  // every resource any worker publishes must reach a listener (the row-level
  // registry, a coarse invalidation, or a reasoned exemption). Publishing to
  // nobody is the silent half of the stale-screen bug. The publisher set is
  // DERIVED by scanning publishChange calls — never hand-listed.
  it("root-layout-renders-what-it-imports: an import that goes nowhere is not a mount", () => {
    // ERROR-HANDLING.md C1 says the root error boundary wraps the app. It was
    // IMPORTED into web/app/layout.tsx on 19 June and never rendered — `git log -S`
    // shows it was never in that tree at all — while the ruleset and a test both
    // said it was there. `noUnusedLocals` is off, so an import that went nowhere
    // kept the gate green for two months and a render crash showed a blank page.
    //
    // The root layout is where "mounted at the root" claims live, so every
    // component it imports must actually appear in its JSX. (Error-log review,
    // 2026-08-25.)
    const src = stripComments(read(join(WEB, "app", "layout.tsx")))
    const imported: string[] = []
    for (const m of src.matchAll(/^import \{([^}]+)\} from "[@./]/gm))
      for (const name of m[1].split(",").map((n) => n.trim().split(" as ").pop()!.trim()))
        if (/^[A-Z]/.test(name)) imported.push(name)
    expect(imported.length, "no components found in the root layout's imports — the scan has gone blind").toBeGreaterThan(4)
    const unmounted = imported.filter((n) => !new RegExp(`<${n}[\\s/>]`).test(src))
    expect(
      unmounted,
      `imported into the root layout and never rendered: ${unmounted.join(", ")}`
    ).toEqual([])
  })

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
      for (const m of why.matchAll(/`([a-z-]+:[a-z-]*)`/g))
        if (!liveSrc.includes(m[1])) unbacked.push(`${resource} claims \`${m[1]}\` which live-resources.ts does not contain`)
    expect(
      unbacked,
      `a DEAF_EXEMPT reason named a cache key that does not exist: ${unbacked.join("; ")}`
    ).toEqual([])

    // The paged half: the refetch seam exists and the shell fans pings + reconnects
    // into it; any component fetching a /search door must subscribe.
    const bus = read(join(WEB, "lib", "use-live-refetch.ts"))
    expect(bus).toContain("subscribeLive")
    const shell = read(join(WEB, "components", "app-shell.tsx"))
    expect(shell, "the shell must fan every ping into the bus").toContain('emitLive({ kind: "ping"')
    expect(shell, "the shell must replay on reconnect").toContain('emitLive({ kind: "reconnect" })')
    const offenders = componentFiles().filter((f) => {
      const src = read(f)
      return /\/search\?|usePagedList/.test(src) && !src.includes("useLiveRefetch")
    })
    expect(
      offenders,
      `paged screen without a live subscription (R15 — useLiveRefetch): ${offenders.join(", ")}`
    ).toEqual([])
  })

  // R16 — every screen showing a collection shows its count exactly once: the
  // NUMBER through the one formatCount seam (never rows.length), the PLACE a
  // counted tab or a CollectionHeading, the ARBITRATION a context (a counted tab
  // wins; the heading stands down).
  it("counted-collections: server totals through ONE seam, one place, arbitrated", () => {
    // (i) THE NUMBER — no component builds a count badge from a loaded list's length.
    const lengthBadges = componentFiles().filter((f) => /badge:[^,\n]*\.length/.test(read(f)))
    expect(
      lengthBadges,
      `a capped list's length is a ceiling, not a total (R16) — badge from the server total via formatCount: ${lengthBadges.join(", ")}`
    ).toEqual([])
    // …and the badge builders route through the seam.
    expect(read(join(WEB, "components", "team-section-nav.tsx"))).toContain("formatCount")
    const moduleContent = read(join(WEB, "components", "deep-link", "module-content.tsx"))
    expect(moduleContent).toContain("formatCount")

    // (ii) THE PLACE — every registry section with a count key whose placement
    // isn't "tab" renders a CollectionHeading (derived, never hand-listed).
    for (const s of TEAM_SECTIONS) {
      if (!s.countCacheKey || s.placement === "tab") continue
      const rendered = componentFiles().some((f) =>
        read(f).includes(`<CollectionHeading sectionKey="${s.key}"`)
      )
      expect(rendered, `sidebar collection "${s.key}" must render a CollectionHeading (R16 ii)`).toBe(true)
    }

    // (iii) THE ARBITRATION — the context exists; the heading consults it ABOVE
    // its early return and returns null when marked; the tab host marks badged
    // panels only; a file with both a counted tab and a heading imports the seam.
    const counted = read(join(WEB, "components", "counted-tabs.tsx"))
    expect(counted).toContain("createContext")
    expect(counted).toContain("CountedAbove")
    const heading = read(join(WEB, "components", "collection-heading.tsx"))
    const hookAt = heading.indexOf("useCountStandsDown()")
    const returnAt = heading.indexOf("return null")
    expect(hookAt, "the heading must consult the arbitration hook").toBeGreaterThan(-1)
    expect(returnAt, "the heading must stand down (return null) when marked").toBeGreaterThan(hookAt)
    const host = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(host, "the tab host marks badged panels via CountedTabs").toContain("<CountedTabs badged=")
    for (const f of componentFiles()) {
      const src = read(f)
      if (/badge: (formatCount|[a-z]+Badge)/.test(src) && /<CollectionHeading/.test(src))
        expect(
          /CountedAbove|CountedTabs/.test(src),
          `${f} shows a counted tab AND a heading — it must import the arbitration seam (R16 iii)`
        ).toBe(true)
    }
  })

  // R25 — a record's whole life lands in the ONE activity table, the rule is
  // stated in ONE place, and the table is APPEND-ONLY.
  //
  // WHAT THIS CHECKS, said plainly: that no code path updates or deletes an
  // activity row, that the two other documents point at the seam rather than
  // restating the rule, and that the seam names what is deliberately not logged.
  // It canNOT check that every new module remembers to log — that needs the
  // meaning of the code. The behavioural cover for the write itself is
  // `workers/content/test/idempotent-transitions.test.ts`, which asserts a real
  // transition writes exactly one row and a repeat writes none.
  it("activity-birth-to-death: the log is append-only and the rule is stated once (R25)", () => {
    // (a) APPEND-ONLY. An UPDATE or DELETE against the log in the request path
    // turns a trail into a draft. The retention sweep is the ONE exception and
    // is a documented policy, not request-path code.
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      if (path.endsWith("/retention.ts")) continue
      const code = stripComments(src)
      for (const re of [/UPDATE\s+activity\b/gi, /DELETE\s+FROM\s+activity\b/gi, /UPDATE\s+account_activity\b/gi]) {
        if (re.test(code)) offenders.push(`${path} → ${re.source}`)
      }
    }
    expect(
      offenders,
      `activity rows must never be rewritten in the request path (R25): ${offenders.join(", ")}`
    ).toEqual([])

    // (b) STATED ONCE. The seam owns the rule; the other two point at it. When
    // this was stated in three places they drifted into three different rules,
    // and the schema's version excluded creations the code had always logged.
    const seam = read(join(ROOT, "shared", "workers", "activity.ts"))
    expect(seam, "the seam must carry the law id").toContain("LAW R25")
    expect(seam, "and name what is deliberately NOT logged, so the gaps are decisions").toMatch(
      /DELIBERATELY NOT LOGGED/i
    )
    const schema = read(join(ROOT, "workers", "tenancy", "src", "team-schema.ts"))
    expect(
      /stated ONCE/i.test(schema),
      "the team schema must POINT at the seam, not restate the rule (it drifted once already)"
    ).toBe(true)

    // (c) THE ROW SAYS WHICH DOOR. Without origin, "did the agent do this?" is
    // answerable only by reading source — no use at all mid-incident.
    expect(seam, "the origin header must be named in the seam").toContain("ORIGIN_HEADER")
    expect(schema, "and the column must exist in the team schema").toContain("origin TEXT")
  })

  // Every enforced law in the registry maps to one of the checks above (or a
  // per-worker seam test) — a law can't exist without a check.
  it("every enforced law has a known check", () => {
    const known = new Set([
      "publish-seam", // the 3 per-worker publish-seam.test.ts suites
      "gating-seam", // R10: the 3 per-worker gating-seam suites + the mcp identity-gate suite
      "fetch-timeout", // R11 external half: the global-fetch scan above
      // R11 internal half — the same law, two checks, because the two halves fail
      // differently: a source scan finds a direct binding call, and only a
      // behavioural test can prove a no-answer is not treated as a refusal.
      "service-calls-bounded", // + workers/gateway/test/trace.test.ts
      "cron-records", // R12: the scheduled-handler scan below
      "record-detail-tabs",
      "no-handrolled-toggles",
      "forms-use-formshell",
      "generic-activity-path",
      "glossary-wellformed",
      "forms-persist-drafts",
      "tab-counts-derived",
      "agent-app-parity", // workers/data-ops/test/agent-parity.test.ts
      "bounded-lists", // R14: the source-scan above
      "idempotent-transitions", // R17: the source-scan above
      "activity-gate-coverage", // R18: the source-scan above
      "live-collections", // R15: the deaf-publisher + paged-subscription scan above
      "counted-collections", // R16: the seam/place/arbitration scan above + format-count.test.ts
      "catalog-coverage", // R13: workers/data-ops/test/catalog-coverage.test.ts
      "agent-filter-parity", // R19: workers/mcp/test/filter-parity.test.ts
      "static-destinations", // R20: the page + gateway-shell scan above
      "create-returns-row", // R21: the create-door response scan above
      "create-opens-record", // R22: the form-seam scan above
      "mutation-returns-row", // R23: the mutation-door response scan above
      "bulk-twin-declared", // R24: the bulk-door scan above
      "activity-birth-to-death", // R25: the append-only + single-source scan above
    ])
    for (const r of RULES_REGISTRY) {
      if (r.status === "enforced")
        expect(known.has(r.checkId), `law ${r.id} (${r.checkId}) needs a real check`).toBe(true)
    }
  })
})
