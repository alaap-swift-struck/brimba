// THE ROUTE CENSUS — every door this app has, derived from the code.
//
// Why this exists. On 12 August a security sweep measured "45/45 state-changing
// routes gated" and scored 99/100. There are 61. The sixteen it never saw were
// all of auth's POST doors, all of mcp's, realtime's publish door and the gateway
// beacon — and the one route in the base with no caller check at all was in that
// missing set. The score was not wrong because the reading was careless; it was
// wrong because every reviewer has to REDISCOVER the surface, and each one
// discovers a slightly different surface.
//
// So the surface is written down, generated from the source, and checked. The next
// review inherits it instead of guessing at it. (security_sentry, 2026-08-25 —
// its own words: "the durable fix isn't a higher score, it's a committed route
// census".)
//
//   node scripts/route-census.mjs          print it
//   node scripts/route-census.mjs --write  update ROUTE-CENSUS.md

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
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
]

/** One top-level declaration's body, bounded by the next one. */
function body(src, from) {
  const re = /\n(?:export |async function |function |const |class |type |interface )/g
  re.lastIndex = from + 1
  const next = re.exec(src)
  return src.slice(from, next ? next.index : undefined)
}

function handlerSource(worker, name) {
  const dirs = [join(ROOT, "workers", worker, "src", "routes"), join(ROOT, "workers", worker, "src")]
  for (const dir of dirs) {
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    } catch {
      continue
    }
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
    let index = ""
    try {
      index = readFileSync(join(ROOT, "workers", worker.name, "src", "index.ts"), "utf8")
    } catch {
      continue
    }
    // Both dispatch shapes in this base: a declarative ROUTES table, and auth's switch.
    const seen = new Set()
    const add = (method, path, handler, kind) => {
      const key = `${method} ${path}`
      if (seen.has(key)) return
      seen.add(key)
      const src = handlerSource(worker.name, handler)
      const gates = GATES.filter(([, re]) => re.test(src)).map(([n]) => n)
      rows.push({ worker: worker.name, method, path, handler, kind, gates })
    }
    for (const m of index.matchAll(/"([A-Z]+) ([^"]+)": \{ handler: (\w+)(?:, kind: "(\w+)")?/g))
      add(m[1], m[2], m[3], m[4] ?? "")
    for (const m of index.matchAll(/case "([A-Z]+) ([^"]+)":\s*return (?:await\s+)?(\w+)\(/g))
      add(m[1], m[2], m[3], "")
  }
  return rows.sort((a, b) => `${a.worker}${a.path}`.localeCompare(`${b.worker}${b.path}`))
}

export function render(rows) {
  const mutating = rows.filter((r) => r.method !== "GET")
  const ungated = mutating.filter((r) => r.gates.length === 0)
  const lines = [
    "# The route census",
    "",
    "**Generated — do not edit by hand.** `node scripts/route-census.mjs --write`.",
    "",
    "Every door this app has, with the gate each one opens with, derived from the",
    "source. It exists because a security sweep once measured 45 state-changing",
    "routes when there were 61, and scored the app on the 45 it happened to find.",
    "A reviewer should inherit the surface, not rediscover it.",
    "",
    `**${rows.length} routes · ${mutating.length} state-changing · ${ungated.length} with no gate detected.**`,
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

const rows = census()
const out = render(rows)
if (process.argv.includes("--write")) {
  writeFileSync(join(ROOT, "ROUTE-CENSUS.md"), out)
  console.log(`Wrote ROUTE-CENSUS.md — ${rows.length} routes.`)
} else {
  console.log(out)
}
