// R18, the part a source-scan cannot see. The team activity feed is the one read
// that returns EVERY module's rows behind a single gate, so its visibility filter
// is load-bearing — and the way it failed was not a missing gate but an omission:
// `?scope=user` with no `id` matched no branch, left the WHERE empty, and handed
// the whole team's cross-module history (with before→after values) to anyone with
// team_members:read. A scan that asserts "the clause exists" stays green through
// that. So this test RUNS the reader over every scope/id shape it can be called
// with and asserts the SQL that comes out is never an unfiltered whole-table read.

import { beforeEach, describe, expect, it, vi } from "vitest"

const queries: string[] = []
/** the same reads, with their BOUND VALUES — a filter that reached the SQL as
 * text rather than as a parameter would satisfy `queries` and still be an
 * injection. */
const calls: { sql: string; params: unknown[] }[] = []
vi.mock("../../../shared/workers/d1-rest", () => ({
  d1Query: vi.fn(async (_cfg: unknown, _db: string, sql: string, params: unknown[] = []) => {
    queries.push(sql)
    calls.push({ sql, params })
    return sql.includes("COUNT(*)") ? [{ n: 0 }] : []
  }),
}))

const { getActivity } = await import("../src/lib/activity-read")

const cfg = {} as never
const guard = { databaseId: "db", teamId: "t", userId: "u" } as never
/** the caller may read ONE module — the R18 filter must appear in every read. */
const ALLOWED = ["learning"]

/** true when a statement reads the feed with no WHERE at all. */
const unfiltered = (sql: string) => /FROM activity(?!\s|\S)/.test(sql) || !/WHERE/i.test(sql)

beforeEach(() => {
  queries.length = 0
  calls.length = 0
})

describe("activity scopes fail CLOSED (R18)", () => {
  it("the team feed always carries the visibility filter", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED)
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q, `unfiltered team read: ${q}`).toMatch(/WHERE/i)
      expect(q, "the R18 clause must ride BOTH the page read and the COUNT").toContain("related_table")
    }
  })

  it("an id-scope with NO id returns nothing — never the whole feed", async () => {
    for (const scope of ["user", "role", "invite", "record"] as const) {
      queries.length = 0
      const out = await getActivity(cfg, guard, scope, undefined, undefined, null)
      expect(out.rows, `${scope} without an id must return no rows`).toEqual([])
      expect(out.total, `${scope} without an id must report no total`).toBe(0)
      expect(queries.filter(unfiltered), `${scope} without an id issued an unfiltered read`).toEqual([])
    }
  })

  it("a record scope with no table returns nothing", async () => {
    const out = await getActivity(cfg, guard, "record", "row1", undefined, null)
    expect(out.rows).toEqual([])
    expect(queries.filter(unfiltered)).toEqual([])
  })

  it("an UNKNOWN scope string still gets the team filter, never a bare read", async () => {
    // The route validates the scope, but the reader must not depend on that:
    // two independent layers, because the cost of this one being wrong is a leak.
    await getActivity(cfg, guard, "everything" as never, undefined, undefined, ALLOWED)
    for (const q of queries) expect(q, `unfiltered read for an unknown scope: ${q}`).toMatch(/WHERE/i)
  })

  it("a caller allowed NOTHING sees only rows that name no record", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, [])
    for (const q of queries) expect(q).toContain("related_table IS NULL")
  })

  it("an id-scope WITH its id is scoped to that record", async () => {
    queries.length = 0
    await getActivity(cfg, guard, "user", "user-9", undefined, null)
    expect(queries.every((q) => /related_table = 'users'/.test(q))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SERVER-SIDE FILTERS. Without them, narrowing a feed to "every deactivation
// the assistant made last week" meant pulling pages and discarding them in the
// browser — the client reading the whole table to show six rows of it. The
// filters are validated HERE rather than in the route because three surfaces
// call this reader (the screen, the agent, MCP) and a filter validated at only
// one of them is validated nowhere.
// ---------------------------------------------------------------------------

/** every statement the reader issued — page read AND count. Both must carry a
 * filter, or the badge counts rows the list will never show. */
const both = () => calls

describe("filters narrow the read on the SERVER (R14 stays intact)", () => {
  it("verb rides both the page read and the COUNT, as a bound parameter", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, { verb: "deactivated" })
    expect(both().length, "a page read and a count").toBe(2)
    for (const c of both()) {
      expect(c.sql, `verb missing from: ${c.sql}`).toContain("verb = ?")
      expect(c.params, "the value must be BOUND, never interpolated").toContain("deactivated")
      expect(c.sql, "and never spliced in as text").not.toContain("'deactivated'")
    }
  })

  it("origin rides both, as a bound parameter", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, { origin: "agent" })
    expect(both().length).toBe(2)
    for (const c of both()) {
      expect(c.sql).toContain("origin = ?")
      expect(c.params).toContain("agent")
      expect(c.sql).not.toContain("'agent'")
    }
  })

  it("from and to bound the window on both", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, {
      from: "2026-08-01",
      to: "2026-08-31",
    })
    expect(both().length).toBe(2)
    for (const c of both()) {
      expect(c.sql).toContain("created_at >= ?")
      expect(c.sql).toContain("created_at <= ?")
      expect(c.params).toContain("2026-08-01")
    }
  })

  it("a date-only `to` covers the WHOLE of that day", async () => {
    // The stored value is a full `toISOString()` timestamp, so a bare
    // `created_at <= '2026-08-31'` would silently drop everything that happened
    // on the 31st after midnight — a filter that answers a different question
    // than the one asked is worse than no filter.
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, { to: "2026-08-31" })
    expect(both()[0].params).toContain("2026-08-31T23:59:59.999Z")
  })

  it("filters compose with the record scope without losing it", async () => {
    await getActivity(cfg, guard, "record", "row-1", "learning", null, null, { verb: "edited" })
    for (const c of both()) {
      expect(c.sql, "the record scope must survive").toContain("related_table = ?")
      expect(c.sql, "and the filter must be added, not substituted").toContain("verb = ?")
    }
  })

  it("filters compose with the R18 visibility clause, never replace it", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, { origin: "mcp" })
    for (const c of both()) {
      expect(c.sql, "R18 must still subtract denied modules").toContain("related_table")
      expect(c.sql).toContain("origin = ?")
    }
  })

  it("paging survives filtering — the cap and the keyset predicate both stand (R14)", async () => {
    const cursor = Buffer.from(JSON.stringify({ k: "2026-08-10T00:00:00.000Z", id: "z" })).toString(
      "base64url"
    )
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, cursor, { verb: "edited" })
    const page = both().find((c) => !c.sql.includes("COUNT(*)"))!
    expect(page.sql, "the hard cap must stay in the statement").toMatch(/LIMIT \d+/)
    expect(page.sql, "the keyset predicate must stay").toContain("created_at <")
    expect(page.sql, "and the filter rides alongside it").toContain("verb = ?")
    const count = both().find((c) => c.sql.includes("COUNT(*)"))!
    expect(count.sql, "the COUNT must NOT carry the cursor — it counts the whole filtered set").not.toContain(
      "created_at <"
    )
  })

  it("no filters at all issues exactly today's SQL", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null)
    for (const c of both()) {
      expect(c.sql).not.toContain("verb = ?")
      expect(c.sql).not.toContain("origin = ?")
      expect(c.sql).not.toContain("created_at >=")
    }
  })
})

describe("filters are validated at the boundary — a bad one is a 400, never a 500", () => {
  const bad = async (filters: Record<string, unknown>) => {
    try {
      await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, filters)
      return null
    } catch (e) {
      return e as { status?: number; code?: string }
    }
  }

  it("refuses a verb outside the closed set", async () => {
    const e = await bad({ verb: "deleted" })
    expect(e, "an unknown verb must be refused, not passed to the database").not.toBeNull()
    expect(e!.status).toBe(400)
    expect(e!.code).toBe("invalid_input")
  })

  it("refuses an origin outside the closed set", async () => {
    const e = await bad({ origin: "root" })
    expect(e).not.toBeNull()
    expect(e!.status).toBe(400)
  })

  it("refuses a from/to that is not a date", async () => {
    for (const v of ["yesterday", "2026-13-99x", "'; DROP TABLE activity--"]) {
      const e = await bad({ from: v })
      expect(e, `${v} must be refused`).not.toBeNull()
      expect(e!.status).toBe(400)
    }
  })

  it("refuses a NON-STRING filter rather than crashing on .trim()", async () => {
    // The exact shape the validation seam exists for: `{verb: 42}` makes
    // `.trim` undefined and a TypeError becomes a 500. Bad input is a 400.
    for (const v of [42, [], {}, true]) {
      const e = await bad({ verb: v })
      expect(e, `${JSON.stringify(v)} must be a clean refusal`).not.toBeNull()
      expect(e!.status).toBe(400)
    }
  })

  it("treats blank/absent filters as no filter, not as an error", async () => {
    await expect(
      getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, {
        verb: "",
        origin: null,
        from: undefined,
      })
    ).resolves.toBeTruthy()
    for (const c of both()) expect(c.sql).not.toContain("verb = ?")
  })
})
