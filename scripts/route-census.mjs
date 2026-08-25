// THE ROUTE CENSUS — every door this app has, derived from the code.
//
// Why this exists. On 12 August a security sweep measured "45/45 state-changing
// routes gated" and scored 99/100. The doors it never saw were all of auth's POST
// doors, all of mcp's, realtime's publish door and the gateway beacon — and the
// one route in the base with no caller check at all was in that missing set. The
// score was not wrong because the reading was careless; it was wrong because
// every reviewer has to REDISCOVER the surface, and each one discovers a slightly
// different surface.
//
// So the surface is written down, generated from the source, and checked. The next
// review inherits it instead of guessing at it. (security_sentry, 2026-08-25 —
// its own words: "the durable fix isn't a higher score, it's a committed route
// census".)
//
// THIS HEADER NO LONGER STATES A TOTAL, and that is deliberate. It used to say
// "There are 61"; the rules test said 58 in its own prose; a review said 61
// again — three hand-typed counts, none of them the number this script actually
// produces, each free to drift on its own. A count maintained by hand in three
// places is three chances to be wrong and no way to tell which one is. The only
// place the number lives is the generated ROUTE-CENSUS.md, and the rules test
// compares it door-for-door.
//
//   node scripts/route-census.mjs          print it
//   node scripts/route-census.mjs --write  update ROUTE-CENSUS.md

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/** The gates a door may open with. Named, so "gated" is a fact and not a vibe.
 *
 * `(?:<[^(<>]*>)?` is load-bearing and I got it wrong first: these helpers are
 * generic, and the real call sites read `gatedBody<TicketInput>(request, …)`. A
 * pattern demanding `(` immediately after the name matched none of them, so the
 * first run of this census reported 25 ungated doors — eleven of which are gated,
 * plainly, on the line under their signature. Writing a scanner that cannot see
 * the thing it scans for, on the very afternoon spent removing eleven of exactly
 * those, is the campaign's own lesson landing on its author. */
const GATES = [
  ["requireRight", /requireRight\s*(?:<[^(<>]*>)?\s*\(/],
  ["gated", /\bgatedBody\s*(?:<[^(<>]*>)?\s*\(|\bgated\s*(?:<[^(<>]*>)?\s*\(/],
  ["requireAnyImportRight", /requireAnyImportRight\s*(?:<[^(<>]*>)?\s*\(/],
  ["adminGuard", /adminGuard\s*(?:<[^(<>]*>)?\s*\(/],
  ["whoAmI", /(?<![A-Za-z0-9_$.])whoAmI\s*(?:<[^(<>]*>)?\s*\(/],
  ["getSessionUser", /getSessionUser\s*(?:<[^(<>]*>)?\s*\(/],
  // Membership resolution IS a gate: it proves you are an active member of the
  // team whose data you are asking for, and throws if you are not. A read door
  // that does no more than this is gated — it just has no per-right question to ask.
  ["teamContext", /teamContext\s*(?:<[^(<>]*>)?\s*\(/],
  ["requireUser", /requireUser\s*(?:<[^(<>]*>)?\s*\(/],
  // Acts only on the caller's own cookie, so it cannot reach anyone else.
  ["self-scoped", /destroySession\s*\(/],
  ["INTERNAL_KEY", /INTERNAL_KEY|x-internal-key/],
  ["TEST_LOGIN_KEY", /TEST_LOGIN_KEY/],
  ["emailed code", /login_codes|code_hash/i],
  ["bearer token", /verifyToken|Bearer|requireToken/],
  // A PROXY DOES NO WORK, so it has no gate of its own — it hands the caller's
  // own Request to a worker whose every door is enumerated in this same census
  // and checked individually. That is a real, checkable safety property and it
  // deserves a name: `**none detected**` on the gateway's branches would be six
  // permanent false alarms, and a census nobody believes is a census nobody
  // reads. The property is only true while the door behind it is in the census,
  // which is why the rules test asserts EVERY worker directory has rows.
  //
  // `return <call>(env.<BINDING>` — the branch's whole body is the handover.
  // NOT a bare mention of a binding: the client-error beacon calls
  // `callService(env.AUTH, …/me)` to VERIFY a session before recording, which is
  // the opposite of proxying, and labelling it "proxied" would put a sentence
  // into a generated security document that is not true.
  [
    "proxied",
    /return\s+(?:proxyService|forwardToDoor)\s*\(|return\s+[A-Za-z_$][\w$]*\(\s*env\.(?:AUTH|TENANCY|CONTENT|DATAOPS|MCP|REALTIME)\b/,
  ],
]

/** Does this test OPEN its own `if`, or is it one clause of a wider condition?
 *
 * `pathname === "/mcp"` appears twice in the gateway: once as the door, and once
 * thirty lines above inside the rate limiter's `|| ` chain. The first was read as
 * the second — so the census concluded the JSON-RPC door forwards nothing — and
 * the guard's other clauses were enumerated as doors that do not exist. A clause
 * of a wider condition is a guard that happens to mention a path. */
const opensIf = (src, at) => /if\s*\($/.test(src.slice(Math.max(0, at - 8), at))

/** Does this branch carry a caller's non-GET request onward?
 *
 * A methoded route answers this with its method. An `ANY` branch — a router arm
 * with no method test at all — does not, and "exclude ANY" is how `ANY /mcp`
 * became invisible to the one check that asks whether a door is gated: the
 * JSON-RPC endpoint the whole external machine surface arrives through, a door
 * that takes POSTs all day, classified as neither read nor write because the
 * ROUTER never mentions a method. Not "found ungated" — unclassifiable.
 *
 * So an `ANY` branch is classified by BEHAVIOUR. Handing the request object to
 * another worker forwards its POSTs by construction; answering inline with a
 * literal (a health probe) or serving a static asset does not. Both errors this
 * census has already made are still avoided: `/t/` and the health branches stay
 * out of the state-changing set, and `/mcp` joins it. */
const FORWARDS_REQUEST =
  /proxyService\s*\(|forwardToDoor\s*\(|\.fetch\(\s*request\b|\(\s*env\.(?:AUTH|TENANCY|CONTENT|DATAOPS|MCP|REALTIME)\b/

/** One top-level declaration's body, bounded by the next one. */
function body(src, from) {
  const re = /\n(?:export |async function |function |const |class |type |interface )/g
  re.lastIndex = from + 1
  const next = re.exec(src)
  return src.slice(from, next ? next.index : undefined)
}

/** The body of ONE inline branch, brace-matched from its own test — not the
 * router that contains it.
 *
 * Reading the whole router was the second wrong answer this census gave. It made
 * every inline door look gated, because SOME door in that router is: realtime's
 * `POST /publish` reported `whoAmI` while having no caller verification at all,
 * which security_sentry has filed as a standing finding. Under-reporting the
 * surface was the first wrong answer; over-crediting it is worse, because a
 * census that says a door is guarded is a reason to stop looking at it.
 *
 * Two tests reach an inline door: `pathname === "/x"` (and `.startsWith`), and
 * `route === "GET /x"` — the `${method} ${pathname}` form three workers use for
 * their health probe. The second was unknown here, so those three doors were not
 * in the census at all. */
function inlineBranch(src, path, method) {
  // Escape the whole path, not just its slashes. A `.` in a route would
  // otherwise match any character — the quiet way a scanner reads the wrong
  // branch and reports its gate.
  const p = path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
  const re = new RegExp(
    `(?:url\\.)?pathname\\s*(?:===\\s*|\\.startsWith\\()\\s*"${p}"` +
      (method && method !== "ANY" ? `|\\broute\\s*===\\s*"${method} ${p}"` : ""),
    "g"
  )
  // THE RIGHT BRANCH, not the first mention — see `opensIf`.
  const all = [...src.matchAll(re)]
  if (all.length === 0) return ""
  const m = all.find((x) => opensIf(src, x.index)) ?? all[0]

  // The end of the `if (…)` test: from the start of its line, the offset where
  // paren depth falls back to zero.
  let i = src.lastIndexOf("\n", m.index) + 1
  let parens = 0
  let started = false
  for (; i < src.length; i++) {
    if (src[i] === "(") {
      parens++
      started = true
    } else if (src[i] === ")" && --parens === 0 && started) break
  }
  // A BLOCK body: brace-match it.
  const rest = src.slice(i + 1)
  const lead = rest.match(/^\s*/)[0]
  if (rest[lead.length] === "{") {
    let depth = 0
    for (let j = i + 1 + lead.length; j < src.length; j++) {
      if (src[j] === "{") depth++
      else if (src[j] === "}" && --depth === 0) return src.slice(m.index, j + 1)
    }
    return src.slice(m.index)
  }
  // A BARE body — one statement, which may WRAP (`return proxyService(env.X,\n
  // request, { … })`). Ending it at the first newline read only the test and
  // reported the door ungated. It ends at the first newline where nothing is
  // still open.
  let depth = 0
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j]
    if (c === "(" || c === "{" || c === "[") depth++
    else if (c === ")" || c === "}" || c === "]") depth--
    else if (c === "\n" && depth <= 0 && j > i + 1 + lead.length) return src.slice(m.index, j)
  }
  return src.slice(m.index)
}

function handlerSource(worker, name, path, method) {
  if (name === "fetch")
    return inlineBranch(readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8"), path, method)
  const dirs = [join(ROOT, "workers", worker, "src", "routes"), join(ROOT, "workers", worker, "src")]
  for (const dir of dirs) {
    // `existsSync`, not a swallowed throw: not every worker has a `src/routes`
    // directory, which is a fact to test for — while a directory that exists and
    // cannot be READ is a fault, and must not look like a worker with no routes.
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8")
      for (const marker of [`export async function ${name}`, `async function ${name}(`]) {
        const at = src.indexOf(marker)
        if (at !== -1) return body(src, at)
      }
    }
  }
  return ""
}

export function census() {
  const rows = []
  for (const worker of readdirSync(join(ROOT, "workers"), { withFileTypes: true })) {
    if (!worker.isDirectory()) continue
    // NO try/catch. A worker directory with no readable `src/index.ts` used to be
    // skipped in silence, which is the one failure mode this census cannot
    // afford: it does not report an error, it reports a SMALLER NUMBER — and a
    // smaller number reads exactly like a passing run. Every previous wrong
    // answer this file has given had that shape. Let it throw.
    const index = readFileSync(join(ROOT, "workers", worker.name, "src", "index.ts"), "utf8")
    // Both dispatch shapes in this base: a declarative ROUTES table, and auth's switch.
    const seen = new Set()
    const add = (method, path, handler, kind) => {
      const key = `${method} ${path}`
      if (seen.has(key)) return
      seen.add(key)
      const src = handlerSource(worker.name, handler, path, method)
      const gates = GATES.filter(([, re]) => re.test(src)).map(([n]) => n)
      // Behaviour, not method — see FORWARDS_REQUEST. A methoded route says so
      // itself; an `ANY` branch is asked what it DOES with the request.
      const changes = method === "ANY" ? FORWARDS_REQUEST.test(src) : method !== "GET"
      rows.push({ worker: worker.name, method, path, handler, kind, gates, changes })
    }
    for (const m of index.matchAll(/"([A-Z]+) ([^"]+)": \{ handler: (\w+)(?:, kind: "(\w+)")?/g))
      add(m[1], m[2], m[3], m[4] ?? "")
    // THE SWITCH SHAPE — the label first, its body second. This used to be one
    // pattern demanding `return` IMMEDIATELY after the colon, and on 2026-08-25
    // auth's and mcp's health doors each grew an explanatory comment between the
    // two and disappeared from the census. Two doors gone, no error, just a
    // smaller number — the same failure this file keeps making in a new costume.
    // The exact door-for-door comparison in the rules test is what surfaced it;
    // the floor it replaced (`> 90`) would have shrugged at both.
    for (const m of index.matchAll(/case "([A-Z]+) ([^"]+)":/g)) {
      // The arm runs to the next label. Line comments are dropped so a `return`
      // written in prose cannot be mistaken for the handler.
      const after = index.slice(m.index + m[0].length)
      const end = after.search(/\n\s*(?:case "|default:)/)
      const arm = (end === -1 ? after : after.slice(0, end)).replace(/\/\/[^\n]*/g, "")
      const call = /return (?:await\s+)?(\w+)\(/.exec(arm)
      add(m[1], m[2], call ? call[1] : "fetch", "")
    }
    // THE FOURTH SHAPE: `if (route === "GET /api/<worker>/health")`, answered
    // inline ABOVE the ROUTES-table lookup so a health probe needs no entry in
    // it. Three workers do this — content, data-ops and tenancy — and the census
    // saw none of them, because it knew the table, the switch and the pathname
    // if-chain, and this is a fifth thing. Small doors, but the point of a census
    // is that the number is the number: a surface written down with three doors
    // missing is a surface a reviewer will trust and be wrong about.
    for (const m of index.matchAll(/\broute === "([A-Z]+) ([^"]+)"/g)) add(m[1], m[2], "fetch", "")
    // THE THIRD SHAPE: an if-chain on the pathname. realtime and the gateway route
    // this way and have no ROUTES table and no switch, so the first census found
    // NOTHING in either — it shipped a checked document that under-reported the
    // very attack surface it exists to write down, on the two workers that most
    // need writing down: the only public one, and the one holding every socket.
    // Found by lean_mean and security_sentry independently, from opposite sides.
    for (const m of index.matchAll(
      // `pathname\s*` — a LITERAL SPACE lived here, and `pathname.startsWith(` has
      // none, so the startsWith branch never matched anything. Dead since it was
      // written, hiding both `/media/*` doors: the census's third wrong answer, and
      // the third to print a confident number. (scaling round 4.)
      /(?:url\.)?pathname\s*(?:===\s*|\.startsWith\()\s*"([^"]+)"\)?(?:\s*&&\s*request\.method === "([A-Z]+)")?/g
    )) {
      const path = m[1]
      if (path === "/api/") continue // the rate-limit prefix guard, not a door
      // …and neither is any other clause of that guard. It grew a `/media/` arm,
      // which the census promptly reported as a door — `ANY /media/`, a
      // duplicate of the real `GET /media/` two hundred lines below, invented out
      // of a rate-limit condition. A door OPENS an `if`.
      if (!opensIf(index, m.index)) continue
      // An if-chain door answers inline; name the worker's handler as its own.
      add(m[2] ?? "ANY", path, "fetch", "")
    }
  }
  return rows.sort((a, b) => `${a.worker}${a.path}`.localeCompare(`${b.worker}${b.path}`))
}

export function render(rows) {
  // `ANY` is a router branch with no method test — a WebSocket upgrade, a health
  // check, a proxy prefix. Counting all of those as state-changing over-reported
  // the ungated set, which is the opposite error to the one this census was built
  // to fix and just as misleading. The first version under-reported by 5 doors;
  // the second over-reported by 3. Both read as fine.
  //
  // So the third version stopped counting `ANY` at all — and that quietly made
  // `ANY /mcp` unclassifiable: the JSON-RPC door the entire external machine
  // surface arrives through, excluded from the gate question by a filter written
  // to be careful. `r.changes` asks each branch what it DOES instead (see
  // FORWARDS_REQUEST), so a door is counted on its behaviour, not on what the
  // router happened to say.
  const mutating = rows.filter((r) => r.changes)
  const ungated = mutating.filter((r) => r.gates.length === 0)
  const lines = [
    "# The route census",
    "",
    "**Generated — do not edit by hand.** `node scripts/route-census.mjs --write`.",
    "",
    "Every door this app has, with the gate each one opens with, derived from the",
    "source. It exists because a security sweep once counted 45 state-changing",
    "routes, scored the app on the 45 it happened to find, and never saw the rest —",
    "including the one door with no caller check at all. A reviewer should inherit",
    "the surface, not rediscover it. The count above is the only one: it is",
    "generated, and the rules test compares this table to the code door for door.",
    "",
    `**${rows.length} routes · ${mutating.length} state-changing · ${ungated.length} with no gate detected.**`,
    "",
    "A route whose method reads `ANY` is a router branch with no method test. It",
    "counts as state-changing when its branch carries non-GET requests onward (a",
    "proxy, a socket upgrade) and not when it answers inline (a health probe, a",
    "static shell) — behaviour, because the router did not say.",
    "",
    "| Worker | Method | Path | Handler | Kind | Gate |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) => `| ${r.worker} | ${r.method} | \`${r.path}\` | \`${r.handler}\` | ${r.kind || "—"} | ${r.gates.join(", ") || "**none detected**"} |`
    ),
    "",
  ]
  return lines.join("\n")
}

// CLI only. Importing this module must not print or write — the rules test
// imports `census`/`render` to compare the committed file against the code, and a
// module that acts on import turns that into noise at best and a write at worst.
if (process.argv[1] && process.argv[1].endsWith("route-census.mjs")) {
  const rows = census()
  const out = render(rows)
  if (process.argv.includes("--write")) {
    writeFileSync(join(ROOT, "ROUTE-CENSUS.md"), out)
    console.log(`Wrote ROUTE-CENSUS.md — ${rows.length} routes.`)
  } else {
    console.log(out)
  }
}
