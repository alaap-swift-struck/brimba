// A FILTER THAT FORCES A FULL SCAN TRADES ONE PROBLEM FOR ANOTHER.
//
// `getActivity` gained server-side filters (verb / origin / from / to) so a feed
// can be narrowed without shipping pages to the browser to be thrown away. That
// is only a win if an index actually serves the new shapes: the activity table is
// the biggest one in any team database (SCALING.md §4), so a filtered read that
// scanned it would cost more than the client-side discarding it replaced.
//
// So this asks SQLite, not a person. The schema is built from the REAL
// `TEAM_MIGRATIONS` rather than a copy, which means dropping or renaming an index
// in the team schema turns this red instead of quietly making every filtered feed
// a table scan. `ANALYZE` runs first because without statistics the planner
// guesses, and a plan produced from a guess proves nothing about production.

import { DatabaseSync } from "node:sqlite"
import { beforeAll, describe, expect, it } from "vitest"

import { TEAM_MIGRATIONS } from "../src/team-schema"
import { PAGE_SIZE } from "../../../shared/workers/paging"

let db: DatabaseSync

beforeAll(() => {
  db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)

  // Enough rows, spread over enough distinct values, that the planner has a real
  // choice to make between a seek and a scan.
  const verbs = ["created", "edited", "deactivated", "activated", "removed", "status"]
  const origins = ["ui", "api", "mcp", "agent", "import", "job"]
  const tables = ["learning", "help", "users", "member_roles", "selectable_data"]
  const ins = db.prepare(
    `INSERT INTO activity (id, type, description, related_table, related_row_id,
                           created_at, creator_id, creator_email, creator_name, origin, verb)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
  for (let i = 0; i < 20_000; i++) {
    ins.run(
      String(i).padStart(26, "0"),
      "Learning edited",
      "someone changed something",
      tables[i % tables.length],
      `row${i % 500}`,
      new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
      `u${i % 20}`,
      "a@b.c",
      "Ada",
      origins[i % origins.length],
      verbs[i % verbs.length]
    )
  }
  db.exec("ANALYZE;")
})

const plan = (sql: string) =>
  db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all()
    .map((r) => String((r as { detail: string }).detail))
    .join(" | ")

const LIMIT = PAGE_SIZE + 1
const page = (where: string) =>
  `SELECT id, type, description, created_at, creator_name, origin, verb FROM activity WHERE ${where}
   ORDER BY created_at DESC, id DESC LIMIT ${LIMIT}`
const count = (where: string) => `SELECT COUNT(*) AS n FROM activity WHERE ${where}`

/** The shapes the reader can now produce. A SEARCH is a seek into a b-tree; a
 * SCAN reads the table. Only one of those is a filter. */
const FILTERED = {
  "verb alone": "verb = 'edited'",
  "origin alone": "origin = 'agent'",
  "a time window": "created_at >= '2026-02-01' AND created_at <= '2026-03-01T23:59:59.999Z'",
  "verb + window": "verb = 'edited' AND created_at >= '2026-02-01' AND created_at <= '2026-03-01'",
  "origin + window": "origin = 'agent' AND created_at >= '2026-02-01' AND created_at <= '2026-03-01'",
  "verb + origin": "verb = 'edited' AND origin = 'agent'",
  "the R18 team clause + verb":
    "(related_table IS NULL OR related_table IN ('learning','help')) AND verb = 'edited'",
  "a record scope + verb": "related_table = 'learning' AND related_row_id = 'row3' AND verb = 'edited'",
}

describe("the new activity filters are served by an index, not by a scan", () => {
  it("the fixture actually has the indexes — a planner with nothing to choose proves nothing", () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity'")
      .all()
      .map((r) => String((r as { name: string }).name))
    for (const needed of ["idx_activity_recent", "idx_activity_verb", "idx_activity_origin"])
      expect(names, `${needed} is missing from the team schema`).toContain(needed)
  })

  for (const [name, where] of Object.entries(FILTERED)) {
    it(`${name} — the page read seeks`, () => {
      const p = plan(page(where))
      expect(p, `filtered page read falls back to a table scan: ${p}`).toContain("SEARCH")
      expect(p, "and it must not sort the result in memory").not.toContain("TEMP B-TREE")
    })

    it(`${name} — the COUNT seeks too`, () => {
      // R16's exact total runs on every paged read, so if only the page read is
      // indexed the filter has bought nothing.
      const p = plan(count(where))
      expect(p, `filtered COUNT falls back to a table scan: ${p}`).toContain("SEARCH")
    })
  }

  it("a filtered page keeps reading the keyset cursor off the index", () => {
    // R14: filtering must not quietly turn paging back into a scan-and-sort.
    const p = plan(
      page("verb = 'edited' AND (created_at < '2026-02-01' OR (created_at = '2026-02-01' AND id < 'z'))")
    )
    expect(p).toContain("SEARCH")
    expect(p).not.toContain("TEMP B-TREE")
  })

  it("and the UNfiltered feed still reads straight off idx_activity_recent", () => {
    // The baseline this must not regress: no filter is the common case.
    const p = plan(page("1 = 1"))
    expect(p).toContain("idx_activity_recent")
    expect(p).not.toContain("TEMP B-TREE")
  })
})
