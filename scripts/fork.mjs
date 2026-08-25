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

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
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

/** R26's reviewed register of what a rename CANNOT finish — read as data, so
 * this closing report and the law can never disagree about the list. Regexed
 * rather than imported: this script reads .ts off disk everywhere else too, and
 * stays free of a TypeScript loader. */
function unsweepable() {
  const src = readFileSync(join(ROOT, "shared/rules/registry.ts"), "utf8")
  const from = src.indexOf("export const FORK_SWEEP_EXEMPT")
  const block = src.slice(from, from === -1 ? 0 : src.indexOf("\n}", from))
  return [...block.matchAll(/^\s*"([^"]+)":\s*"([^"]+)"/gm)].map(([, f, why]) => ({ f, why }))
}

console.log(
  `${dry ? "would sweep" : "swept"} ${changed} files · ${hits} × "${from.slug}" → "${to.slug}" (${from.display} → ${to.display})\n` +
    `${dry ? "would blank" : "blanked"} ${blanked} account-scoped ids in wrangler.jsonc — BOOTSTRAP.md §2 fills them`,
)

if (dry) {
  console.log(`would then redraw the icons from the new brand, and run the gate (npm run check)`)
  process.exit(0)
}

// THE FINAL STEP: the app's FACE. This sweep is textual and an icon is not text
// — it renames the SVG's `aria-label` to the new product and leaves the drawn
// letter of the old one underneath, which is worse than not sweeping at all.
// gen-icons redraws the monogram from the brand this sweep has just rewritten,
// so it must run here, last, and never before.
const icons = spawnSync("node", [join(ROOT, "scripts/gen-icons.mjs")], { cwd: ROOT, stdio: "inherit" })
if (icons.status !== 0)
  console.log("! icons NOT redrawn — run `node scripts/gen-icons.mjs` once `npm install` has brought sharp in")

// AND WHAT A RENAME CANNOT DO FOR YOU. Printed, because a fork that is never
// told keeps the author's icons and deploys at the author's account.
const left = unsweepable()
console.log(`\n${left.length} things a rename cannot finish — check each by hand:`)
for (const { f, why } of left) console.log(`  · ${f}\n      ${why}`)

// THE GATE. R26 promises `npm run check` stays green through a fork. A script
// that PRINTS that promise and never tests it is exactly how the prose sweep it
// replaced was able to drift — so this runs it, and its exit code is ours.
if (!existsSync(join(ROOT, "node_modules"))) {
  console.log("\nnext: npm install && npm run check")
  process.exit(0)
}
console.log("\nrunning the gate — npm run check ...")
const gate = spawnSync("npm", ["run", "check"], { cwd: ROOT, stdio: "inherit" })
console.log(
  gate.status === 0
    ? `\ncheck: GREEN — ${to.display} is ready. Next: BOOTSTRAP.md §2 (account id, database ids, the deploy host).`
    : `\ncheck: RED (exit ${gate.status}) — fix the above, then re-run npm run check.`,
)
process.exit(gate.status ?? 1)
