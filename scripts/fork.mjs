#!/usr/bin/env node
// fork — turn this base into a NEW app, in ONE command (Law R26).
//
//   node scripts/fork.mjs <new-name> [--display "New Name"] [--dry-run]
//   node scripts/fork.mjs --list        every file the sweep covers (R26 reads this)
//
// WHY THIS IS A SCRIPT. The sweep used to be prose, in a skill, OUTSIDE this
// repository — so nothing went red when it drifted, and it drifted twice: four
// copies of the session cookie name with one documented (rename that one alone
// and every MCP call silently fails auth), and eight assertions in three test
// files pinning literals the sweep renames, so following it exactly turned
// `npm run check` RED while the procedure promised green.
//
// The fix is not a longer list. A hand-list is wrong the day after it is
// written. This scans the repo, so a literal added tomorrow is swept tomorrow —
// tests included, which is what keeps the check green through a fork.

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// The sweep's REACH, as data. A shipped file that carries the product name and
// is not reachable here fails Law R26 by name (web/test/fork.test.ts) — add its
// type below, or give it a reasoned FORK_SWEEP_EXEMPT line. Never widen this to
// "every file": a rename script must only rewrite formats it understands.
const EXT = [".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc", ".md", ".sql", ".svg", ".css", ".yml", ".yaml", ".html", ".txt", ".example"]
const NAMES = ["LICENSE"]
const SKIP = new Set([".git", "node_modules", ".next", "out", ".wrangler", ".dev-state", ".session-notes"])

const ROOT = new URL("..", import.meta.url).pathname
const rel = (p) => p.slice(ROOT.length)

function sweepFiles(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sweepFiles(p, out)
    else if (NAMES.includes(e.name) || EXT.some((x) => e.name.endsWith(x))) out.push(rel(p))
  }
  return out.sort()
}

/** Who this app is TODAY — read off disk, never hardcoded, so the script keeps
 * working on a fork of a fork. */
function identity() {
  const slug = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name
  const display = /name:\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "shared/brand.ts"), "utf8"))?.[1]
  if (!slug || !display) throw new Error("fork: could not read the current identity from package.json + shared/brand.ts")
  return { slug, display }
}

const files = sweepFiles()
if (process.argv.includes("--list")) {
  console.log(files.join("\n"))
  process.exit(0)
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const dry = process.argv.includes("--dry-run")
const name = args[0]
if (!name) {
  console.error('usage: node scripts/fork.mjs <new-name> [--display "New Name"] [--dry-run]')
  process.exit(1)
}
const from = identity()
const flag = process.argv.indexOf("--display")
const to = {
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  display: (flag === -1 ? "" : process.argv[flag + 1]) || name[0].toUpperCase() + name.slice(1),
}

// One case-preserving pass: `brimba-auth` → `acme-auth`, `Brimba's assistant` →
// `Acme's assistant`, `BRIMBA` → `ACME`. Every copy of the cookie name, the
// storage prefixes, the token prefix, the worker names and the tests that pin
// them move together, because they are all the same word.
const token = new RegExp(from.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
const recase = (m) => (m === m.toLowerCase() ? to.slug : m === m.toUpperCase() ? to.slug.toUpperCase() : to.display)

// The author's account-scoped ids are not a name — no rename can guess them, and
// shipping them ONWARD is worse than shipping nothing: the fork's rows land in
// the base's own databases. Blank them so the deploy fails loudly and
// BOOTSTRAP.md §2 fills them in.
const ids = /("(?:CF_ACCOUNT_ID|database_id)":\s*)"[0-9a-f-]{32,36}"/g

let changed = 0
let hits = 0
let blanked = 0
for (const f of files) {
  const src = readFileSync(join(ROOT, f), "utf8")
  let out = src.replace(token, (m) => (hits++, recase(m)))
  if (f.endsWith("wrangler.jsonc")) out = out.replace(ids, (_, k) => (blanked++, `${k}""`))
  if (out === src) continue
  changed++
  if (!dry) writeFileSync(join(ROOT, f), out)
}

console.log(
  `${dry ? "would sweep" : "swept"} ${changed} files · ${hits} × "${from.slug}" → "${to.slug}" (${from.display} → ${to.display})\n` +
    `${dry ? "would blank" : "blanked"} ${blanked} account-scoped ids in wrangler.jsonc — BOOTSTRAP.md §2 fills them\n` +
    `next: npm install && npm run check`,
)
