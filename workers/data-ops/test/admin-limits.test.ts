// A NEGATIVE LIMIT IS NOT A SMALL LIMIT. IT IS NO LIMIT.
//
// `GET /api/data-ops/admin/errors?limit=N` interpolates N straight into the SQL
// (it must — D1 will not bind a LIMIT), behind `Math.min(Number(…) || 100, 200)`.
// That expression reads as a ceiling and is only half of one: `Math.min` bounds
// the TOP and nothing bounds the bottom, so `?limit=-1` survives it unchanged and
// reaches SQLite as `LIMIT -1` — which SQLite defines as **no limit at all**.
//
// The 200-row cap is the whole of R14 on this door, and one character defeats it:
// the entire `error_logs` table, every stack trace and every URL in it, in one
// response. It is owner-gated, which bounds who can do it and not what happens
// when they do — a bookmarked link with a stale query string is enough to pull a
// multi-gigabyte read out of the operations database.
//
// The sibling door `GET /agent/usage-log` already reads its limit correctly
// (`Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), 200) : 50`), so
// this is one door out of step with the pattern beside it rather than a missing
// idea. The last test here says so, from the source, so the two cannot drift
// apart again.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { getErrors } from "../src/routes/admin"

/** Captures the SQL the door actually builds. `all()` answers empty — this is
 * about the statement, and the statement is where the cap lives. */
function spyEnv() {
  const sql: string[] = []
  const env = {
    ADMIN_KEY: "k",
    DB: {
      prepare(text: string) {
        sql.push(text)
        const answer = { all: async () => ({ results: [] }) }
        return { bind: () => answer, ...answer }
      },
    },
  } as never
  return { env, sql }
}

const ask = async (query: string) => {
  const { env, sql } = spyEnv()
  await getErrors(
    new Request(`https://app/api/data-ops/admin/errors${query}`, {
      headers: { "x-admin-key": "k" },
    }),
    env
  )
  return sql[0] ?? ""
}

/** The number the statement will actually apply, read back off the SQL. */
const limitOf = (sql: string) => Number(sql.match(/LIMIT\s+(-?[\d.]+)/)?.[1] ?? NaN)

describe("the error-log door's limit is a floor as well as a ceiling", () => {
  it("does not let -1 through, because SQLite reads LIMIT -1 as unlimited", async () => {
    const sql = await ask("?limit=-1")
    expect(
      sql,
      "LIMIT -1 is SQLite's spelling of 'every row' — the one value that turns the cap into its opposite"
    ).not.toMatch(/LIMIT\s+-/)
    expect(limitOf(sql)).toBeGreaterThan(0)
    expect(limitOf(sql)).toBeLessThanOrEqual(200)
  })

  it("refuses zero too — a door that returns nothing is a broken door, not a safe one", async () => {
    expect(limitOf(await ask("?limit=0"))).toBeGreaterThan(0)
  })

  it("keeps the 200-row ceiling for anything above it", async () => {
    expect(limitOf(await ask("?limit=5000"))).toBe(200)
    expect(limitOf(await ask("?limit=201"))).toBe(200)
  })

  it("honours a sane limit exactly", async () => {
    expect(limitOf(await ask("?limit=25"))).toBe(25)
    expect(limitOf(await ask("?limit=200"))).toBe(200)
  })

  it("falls back to the default for junk, a missing value, and the tricks around it", async () => {
    for (const q of ["", "?limit=", "?limit=abc", "?limit=NaN", "?limit=1e999", "?limit=-0"])
      expect(limitOf(await ask(q)), `${q || "(no limit param)"} must fall back to the default`).toBe(100)
  })

  it("emits a whole number — a fractional LIMIT is a statement nobody meant to write", async () => {
    const n = limitOf(await ask("?limit=12.7"))
    expect(Number.isInteger(n)).toBe(true)
    expect(n).toBe(12)
  })

  it("never interpolates anything but digits, whatever the caller sends", async () => {
    for (const q of ["?limit=1;DROP TABLE error_logs", "?limit=%2D1", "?limit=  -5  "]) {
      const sql = await ask(q)
      expect(sql, `${q} reached the statement`).toMatch(/LIMIT \d+$/m)
    }
  })
})

describe("the two admin list doors read a limit the same way", () => {
  it("neither door bounds only the top", () => {
    const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8")
    for (const [name, text] of [
      ["admin.ts", src("routes", "admin.ts")],
      ["agent.ts", src("routes", "agent.ts")],
    ] as const)
      for (const line of text.split("\n"))
        if (/searchParams\.get\("limit"\)/.test(line))
          expect(
            line,
            `${name}: a limit read straight into Math.min bounds the ceiling and leaves the floor open — LIMIT -1 is unlimited`
          ).not.toMatch(/Math\.min\(\s*Number\(/)
  })
})
