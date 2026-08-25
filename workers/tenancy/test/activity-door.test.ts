// THE ACTIVITY DOOR — the filters it never parsed, and the diff type it now
// hands back.
//
// THE FILTERS THE DOOR NEVER PARSED.
//
// `getActivity` grew four server-side filters — verb, origin, from, to — validated
// at the reader because three surfaces call it. The route that fronts it for the
// app parsed NONE of them, so the whole feature was reachable only by calling the
// reader in TypeScript: narrowing to "every deactivation the assistant made last
// week" still meant pulling pages and discarding them in the browser.
//
// WHY THIS DRIVES THE REAL HANDLER rather than scanning its source. A scan can see
// `searchParams.get("verb")` and stay green while the value is dropped on the floor
// one line later, or forwarded to ONE of the three getActivity call sites. The only
// thing that proves a filter arrived is the SQL that came out of it — so these run
// `getActivityFeed` end to end over the real reader and read the statements off the
// mocked data door.
//
// AND AS A BOUND PARAMETER, not spliced text. `activity-scope.test.ts` asserts this
// shape from the reader's end for the same reason: a filter that reaches a WHERE
// clause as text is an injection, and a test that only checks the clause EXISTS
// passes either way.

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ActivityItem } from "../../../shared/types"
import type { ActivityFeedItem } from "../src/lib/activity-read"

/** every statement the door issued, with its bound values. */
const calls: { sql: string; params: unknown[] }[] = []
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  d1Query: vi.fn(async (_cfg: unknown, _db: string, sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return sql.includes("COUNT(*)") ? [{ n: 0 }] : []
  }),
}))

const cfg = { accountId: "a", apiToken: "t" }
const guard = { userId: "ME", teamId: "T", roleId: "R", databaseId: "db", movedModules: 0 }
vi.mock("../src/context", () => ({
  teamContext: vi.fn(async () => ({ user: { id: "ME" }, actor: { id: "ME" }, cfg, guard })),
  toActor: vi.fn(),
  whoAmI: vi.fn(),
}))
vi.mock("../src/lib/permissions", () => ({ requireRight: vi.fn(async () => undefined) }))
// The caller may read ONE module, so the team scope's R18 clause is non-empty and
// a filter that REPLACED the scope instead of ANDing onto it would show up.
vi.mock("../src/lib/roles", () => ({
  getMyPermissions: vi.fn(async () => ({ learning: { read: true } })),
}))

const { getActivityFeed } = await import("../src/routes/team")

const env = {} as never
const call = (query: string) =>
  getActivityFeed(new Request(`https://x/api/tenancy/activity${query}`), env)

/** the page read and the COUNT — a filter must ride both, or the total counts rows
 * the list will never show (the R16 failure the reader shares its WHERE to avoid). */
const both = () => calls

beforeEach(() => {
  calls.length = 0
})

describe("the activity door parses its filters and forwards them (R14/R16)", () => {
  it("verb reaches the SQL as a BOUND parameter, on the record scope", async () => {
    await call("?scope=record&table=learning&id=row-1&verb=edited")
    expect(both().length, "a page read and a count").toBe(2)
    for (const c of both()) {
      expect(c.sql, `verb missing from: ${c.sql}`).toContain("verb = ?")
      expect(c.params, "the value must be BOUND, never interpolated").toContain("edited")
      expect(c.sql, "and never spliced in as text").not.toContain("'edited'")
      expect(c.sql, "the record scope must survive the filter").toContain("related_table = ?")
    }
  })

  it("origin reaches the SQL bound, on the TEAM scope, without losing R18", async () => {
    await call("?scope=team&origin=agent")
    expect(both().length).toBe(2)
    for (const c of both()) {
      expect(c.sql).toContain("origin = ?")
      expect(c.params).toContain("agent")
      expect(c.sql).not.toContain("'agent'")
      expect(c.sql, "R18 must still subtract denied modules").toContain("related_table")
    }
  })

  it("from and to reach the SQL bound, and a bare `to` covers the whole day", async () => {
    await call("?scope=record&table=learning&id=row-1&from=2026-08-01&to=2026-08-31")
    for (const c of both()) {
      expect(c.sql).toContain("created_at >= ?")
      expect(c.sql).toContain("created_at <= ?")
      expect(c.params).toContain("2026-08-01")
      expect(c.params, "a date-only `to` must reach the end of that day").toContain(
        "2026-08-31T23:59:59.999Z"
      )
    }
  })

  it("the THIRD call site — the user/role/invite tail — forwards them too", async () => {
    // Three call sites, one door. The tail is the one a reader skims past, and a
    // filter that works on two scopes and silently does nothing on the third is
    // worse than one that works nowhere.
    await call("?scope=user&id=user-9&verb=removed&origin=mcp")
    expect(both().length).toBe(2)
    for (const c of both()) {
      expect(c.sql, "the user scope must survive").toContain("related_table = 'users'")
      expect(c.sql).toContain("verb = ?")
      expect(c.sql).toContain("origin = ?")
      expect(c.params).toContain("removed")
      expect(c.params).toContain("mcp")
    }
  })

  it("all four ride one request together", async () => {
    await call("?scope=record&table=help&id=t-1&verb=status&origin=ui&from=2026-08-01&to=2026-08-31")
    const page = both().find((c) => !c.sql.includes("COUNT(*)"))!
    for (const clause of ["verb = ?", "origin = ?", "created_at >= ?", "created_at <= ?"])
      expect(page.sql, `${clause} missing`).toContain(clause)
    expect(page.sql, "the hard cap must stay (R14)").toMatch(/LIMIT \d+/)
  })

  it("a bad filter is the reader's clean 400 — the route adds no second validation", async () => {
    // Deliberately NOT validated here: three surfaces call the same reader, so a
    // filter checked at one door is checked at none. The route's job is to pass it
    // on and let the central catch map the GuardError.
    const e = await call("?scope=team&verb=deleted").then(
      () => null,
      (err: { status?: number; code?: string }) => err
    )
    expect(e, "an unknown verb must be refused, not passed to the database").not.toBeNull()
    expect(e!.status).toBe(400)
    expect(e!.code).toBe("invalid_input")
    expect(
      both().filter((c) => c.sql.includes("FROM activity")),
      "the refusal must come before the feed is read"
    ).toEqual([])
  })

  it("no filters at all issues exactly today's SQL", async () => {
    await call("?scope=team")
    for (const c of both()) {
      expect(c.sql).not.toContain("verb = ?")
      expect(c.sql).not.toContain("origin = ?")
      expect(c.sql).not.toContain("created_at >=")
    }
  })
})

// ---------------------------------------------------------------------------
// THE READER'S LOCAL ALIAS, COLLAPSED ONTO THE SHARED TYPE.
//
// `ActivityFeedItem` was a deliberate LOCAL widening, with its own note saying
// what would end it: "when the Activity tab grows its expander, `ActivityItem`
// gains `changes?: FieldDiff[]` and this alias collapses back to it". The tab
// has grown its expander, so the diff now travels on the type both sides read.
//
// The proof is COMPILE-TIME, and it is written from the SHARED side on purpose.
// Building the row as an `ActivityFeedItem` proves nothing — the alias declares
// `changes` itself, so it stays green with the shared type untouched (checked: it
// did). A fresh object literal typed `ActivityItem` is the assertion that bites,
// because an excess-property check fails the moment the field is only local
// again. The round trip then shows the alias adds nothing the shared type lacks.
// ---------------------------------------------------------------------------

describe("the diff rides the SHARED type", () => {
  it("an ActivityItem carries the diff, and the reader's alias adds nothing to it", () => {
    const shared: ActivityItem = {
      id: "a1",
      type: "Learning edited",
      description: "Ada edited it",
      actorName: "Ada Lovelace",
      createdAt: "2026-08-20T09:00:00.000Z",
      changes: [
        { label: "Title", from: "Old title", to: "New title" },
        // A hidden field arrives with its label and nothing else — the shape the
        // screen must be able to describe without inventing a value.
        { label: "Body", hideValues: true },
      ],
    }
    const asReaderRow: ActivityFeedItem = shared
    const andBack: ActivityItem = asReaderRow
    expect(andBack.changes?.map((c) => c.label)).toEqual(["Title", "Body"])
    expect(andBack.changes?.[1].from, "a hidden field carries no values at all").toBeUndefined()
  })
})
