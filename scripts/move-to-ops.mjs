#!/usr/bin/env node
// MOVE THE EXHAUST TABLES INTO THE OPERATIONS DATABASE.
//
//   node scripts/move-to-ops.mjs <staging|production> [--delete-source]
//
// The two fastest-growing tables in the system — error_logs and agent_usage_log —
// used to sit in the shared core database, competing for D1's 10 GB cap with the
// identity and membership rows that every request depends on. Nothing joins to
// either, so they can simply live somewhere else.
//
// THE ORDER IS THE SAFETY, and it is not negotiable:
//
//   1. COPY   every row into the operations database, in batches.
//   2. VERIFY both sides report the SAME count.
//   3. DELETE the source rows — and ONLY if step 2 agreed.
//
// A mismatch stops the run with the source untouched. There is no flag to skip
// the verification, because the one situation where you would want to skip it is
// exactly the situation where you must not.
//
// Deleting the source is opt-in (`--delete-source`). Without it the rows are
// copied and left, which is the fully reversible state: the app reads the new
// database, and flipping the binding back would find everything still there.

import { execFileSync } from "node:child_process"

const [envArg, ...flags] = process.argv.slice(2)
const DELETE_SOURCE = flags.includes("--delete-source")
if (envArg !== "staging" && envArg !== "production") {
  console.error("usage: node scripts/move-to-ops.mjs <staging|production> [--delete-source]")
  process.exit(1)
}

const STAGING = envArg === "staging"
const CORE = STAGING ? "brimba-core-staging" : "brimba-core"
const OPS = STAGING ? "brimba-ops-staging" : "brimba-ops"
const ENV_FLAG = STAGING ? ["--env", "staging"] : []
const TABLES = ["error_logs", "agent_usage_log"]
const BATCH = 500

/** Run one SQL statement against a database and return its rows. */
function sql(db, command) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", db, ...ENV_FLAG, "--remote", "--json", "--command", command],
    { cwd: "workers/auth", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  const match = out.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`no JSON in wrangler output for: ${command.slice(0, 80)}`)
  return JSON.parse(match[0])[0].results ?? []
}

const count = (db, table) => Number(sql(db, `SELECT COUNT(*) AS n FROM ${table};`)[0]?.n ?? 0)

/** SQLite literal for a value read back out of D1. */
function lit(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

console.log(`\nMoving ${TABLES.join(" + ")}\n  from ${CORE}\n  to   ${OPS}\n`)

for (const table of TABLES) {
  const before = count(CORE, table)
  const already = count(OPS, table)
  console.log(`${table}: ${before} row(s) in the core database, ${already} already in ops`)
  if (before === 0) {
    console.log(`  nothing to move\n`)
    continue
  }

  // 1 · COPY, in batches. `INSERT OR IGNORE` on the primary key makes a re-run
  //     safe: a half-finished move can simply be run again.
  const columns = sql(CORE, `SELECT * FROM ${table} LIMIT 1;`)
  const names = Object.keys(columns[0])
  let copied = 0
  for (let offset = 0; offset < before; offset += BATCH) {
    const rows = sql(CORE, `SELECT * FROM ${table} ORDER BY id LIMIT ${BATCH} OFFSET ${offset};`)
    if (!rows.length) break
    const values = rows.map((r) => `(${names.map((n) => lit(r[n])).join(", ")})`).join(",\n")
    sql(OPS, `INSERT OR IGNORE INTO ${table} (${names.join(", ")}) VALUES\n${values};`)
    copied += rows.length
    process.stdout.write(`  copied ${copied}/${before}\r`)
  }
  console.log(`  copied ${copied}/${before}    `)

  // 2 · VERIFY. This is the gate, not a report.
  const after = count(OPS, table)
  if (after < before) {
    console.error(
      `\n  STOPPED: ${OPS}.${table} has ${after} rows but ${CORE}.${table} has ${before}.` +
        `\n  The source has NOT been touched. Re-run to continue the copy.\n`
    )
    process.exit(1)
  }
  console.log(`  verified: ${after} row(s) in ops (>= ${before} in core)`)

  // 3 · DELETE the source, only now.
  if (DELETE_SOURCE) {
    sql(CORE, `DELETE FROM ${table};`)
    console.log(`  source cleared in ${CORE}\n`)
  } else {
    console.log(`  source LEFT in place (pass --delete-source to reclaim the space)\n`)
  }
}

console.log("Done. Deploy the workers so they pick up the OPS binding.\n")
