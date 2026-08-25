// THE WORKER-RUNTIME LAWS, machine-checked (see RULES.md + shared/rules/registry.ts).
// R11 bounded calls (external + internal) · R12 recorded background failures ·
// R14 bounded reads (a hard cap, or real keyset paging when the collection
// grows). Each `it` reads source straight off disk, so the checks can't be
// fooled by anything but the real code.

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { GROWING_COLLECTIONS } from "@shared/rules/registry"
import { BASE_RECIPES } from "@/lib/screens"

import {
  ROOT,
  componentFiles,
  declarationBody,
  read,
  serverSources,
  stringLiterals,
  stripComments,
  workerSources,
} from "./_paths"

describe("RULES — the worker-runtime laws", () => {
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
})
