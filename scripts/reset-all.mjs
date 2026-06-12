// reset-all — wipe Brimba back to a clean slate, per environment.
//
//   node scripts/reset-all.mjs staging
//   node scripts/reset-all.mjs production
//   node scripts/reset-all.mjs both
//
// For each environment it:
//   1. finds that env's team databases — ONLY the ones its own global `teams`
//      table points at (never touches databases from other projects in the
//      account, e.g. acrymold), then DELETES those databases outright;
//   2. blanks the global core database — every row from every table removed,
//      but the schema (tables + columns) and migration history stay intact;
//   3. reads everything back and TESTS it: all global tables must be empty,
//      the schema must still be there, and the deleted team databases must be
//      gone. Exits non-zero if anything is off.
//
// Uses the locally-authenticated wrangler CLI (no API token needed).

import { execSync } from "node:child_process"
import { writeFileSync, unlinkSync } from "node:fs"

const GLOBAL_DB = { staging: "brimba-core-staging", production: "brimba-core" }
const KEEP = new Set(["d1_migrations"]) // migration history survives a reset

const arg = process.argv[2]
const ENVS = arg === "both" ? ["staging", "production"] : [arg]
if (!ENVS.every((e) => GLOBAL_DB[e])) {
  console.error("Usage: node scripts/reset-all.mjs <staging|production|both>")
  process.exit(2)
}

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })

/** Run a read query against a database, return its rows. */
function query(db, sql) {
  const out = sh(
    `npx wrangler d1 execute ${db} --remote --json --command ${JSON.stringify(sql)}`
  )
  const json = JSON.parse(out.slice(out.indexOf("[")))
  return json[0]?.results ?? []
}

/** Run a multi-statement script against a database (no return). */
function exec(db, script) {
  const file = `/tmp/brimba-reset-${db}-${process.pid}.sql`
  writeFileSync(file, script)
  try {
    sh(`npx wrangler d1 execute ${db} --remote --file ${file} -y`)
  } finally {
    unlinkSync(file)
  }
}

let failures = 0
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`)
  if (!ok) failures++
}

const nameByUuid = Object.fromEntries(
  JSON.parse(sh("npx wrangler d1 list --json")).map((d) => [d.uuid, d.name])
)

for (const env of ENVS) {
  const db = GLOBAL_DB[env]
  console.log(`\n=== RESET ${env.toUpperCase()} (${db}) ===`)

  // 1 · This env's team databases — only what its own teams table references.
  const teamDbIds = [
    ...new Set(
      [
        ...query(db, "SELECT database_id AS id FROM teams WHERE database_id IS NOT NULL"),
        ...query(db, "SELECT database_id AS id FROM team_module_databases"),
      ].map((r) => r.id)
    ),
  ]
  console.log(`team databases to delete: ${teamDbIds.length}`)
  for (const id of teamDbIds) {
    const name = nameByUuid[id]
    if (!name) {
      console.log(`  (already gone: ${id})`)
      continue
    }
    sh(`npx wrangler d1 delete ${name} -y`)
    console.log(`  deleted ${name}`)
  }

  // 2 · Blank the global core DB — rows out, schema + migrations stay.
  const tables = query(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  )
    .map((r) => r.name)
    .filter((t) => !KEEP.has(t))
  exec(
    db,
    "PRAGMA defer_foreign_keys=TRUE;\n" +
      tables.map((t) => `DELETE FROM "${t}";`).join("\n")
  )
  console.log(`blanked ${tables.length} tables`)

  // 3 · Read back + TEST.
  console.log("verifying:")
  for (const t of tables) {
    const [{ n }] = query(db, `SELECT COUNT(*) AS n FROM "${t}"`)
    check(`${t} is empty`, n === 0, `${n} rows left`)
  }
  const stillThere = query(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  ).map((r) => r.name)
  check("schema intact (tables still present)", stillThere.length >= tables.length)
  const remaining = JSON.parse(sh("npx wrangler d1 list --json")).map((d) => d.uuid)
  check(
    "team databases are gone",
    teamDbIds.every((id) => !remaining.includes(id)),
    "some team DB still exists"
  )
}

console.log(failures ? `\nRESET FAILED (${failures} check(s))` : "\nRESET OK — all checks passed")
process.exit(failures ? 1 : 0)
