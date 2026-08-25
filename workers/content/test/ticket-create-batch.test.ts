// ONE CROSSING, AND NOTHING ESCAPES ITS QUOTES.
//
// Raising a ticket used to be four separate HTTPS calls to the D1 REST door —
// insert, activity row, read the row back, count — for four statements that each
// execute in about 0.2ms. The distance was the whole cost. `d1Batch` sends all
// four as ONE call.
//
// The reason this file exists rather than a comment: the REST door refuses
// `params` alongside multiple statements (a hard 400, code 7400), so every value
// in that call is INLINE. `sqlString` is the only thing standing between a
// support-ticket description — text any member can write — and the SQL it lands
// in. The insert already had that property; the two SELECTs used to carry bound
// parameters and now do not, and the activity row arrived last.
//
// THE ACTIVITY ROW IS THE FOURTH STATEMENT, AND IT IS NOT WRITTEN HERE. The audit
// trail has exactly one author (`shared/workers/activity.ts`), and re-typing its
// INSERT in this module to save a crossing would give it two — which is how two
// copies of one table's columns drift apart, and how one of them quietly stops
// escaping something. So the seam EXPOSES its statement (`activityStatement`) and
// `logActivity` writes through the same builder. This file asserts both halves:
// that the crossing was folded, and that folding it did not fork the author.
//
// So this asserts the things that could go wrong and would not show up as a
// failing feature: the batch is really ONE call whose result sets line up with
// the statements that produced them, and text built to break out of its quotes —
// in the ticket AND in the name of the person raising it — does not.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import { stripComments } from "../../../shared/test/source"

/** Every call the door was asked to make, in order. `sql` is the whole payload,
 * so a statement that slipped into a second call is visible as a second entry. */
const calls: { sql: string; params?: unknown }[] = []

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  return {
    ...actual,
    // Each door records the payload it was handed and answers with nothing. The
    // second half of this file is about the SQL the create SENDS, not what comes
    // back — and `d1Batch` itself is exercised for real in the first half, where
    // only the socket underneath it is replaced.
    d1Batch: async (_c: unknown, _d: string, statements: string[]) => {
      calls.push({ sql: statements.join("\n") })
      return statements.map(() => [])
    },
    d1Query: async (_c: unknown, _d: string, sql: string, params?: unknown) => {
      calls.push({ sql, params })
      return []
    },
    d1ExecScript: async (_c: unknown, _d: string, sql: string) => {
      calls.push({ sql })
      return []
    },
  }
})

// `d1ExecScript` stays mocked because the activity seam still uses it everywhere
// ELSE. If a second call ever reappears on this path it is recorded and the
// one-crossing assertion below fails, which is the point of keeping it.
import { createTicket } from "../src/lib/help"
import { sqlString } from "../../../shared/workers/d1-rest"

// The REAL `d1Batch`, reached past the mock — the first describe is about what it
// puts on the wire, so a stand-in would prove nothing.
const { d1Batch } = await vi.importActual<typeof import("../../../shared/workers/d1-rest")>(
  "../../../shared/workers/d1-rest"
)

const GUARD = { userId: "U'1", teamId: "T1", roleId: "R1", databaseId: "db1", movedModules: 0 }
const ACTOR = { id: "U'1", email: "ada@example.com", name: "Ada Green" }

/** One of the two source files this fold is spread across, read off disk — the
 * "one author" property is a shape, not a behaviour, so nothing a call can
 * observe would ever catch a second copy appearing. */
const readSource = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", "..", ...parts), "utf8")

/** Remove every well-formed SQLite string literal, leaving only what the engine
 * would read as CODE. A doubled quote is the escape, so `'a''b'` is one literal.
 * This is how "the payload is inside the quotes" and "the payload broke out of
 * them" are told apart — in the raw text they look identical. */
function withoutStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "@")
}

/** A D1 REST door that records the request and answers with one result set per
 * statement, exactly as the live endpoint does. */
function restSpy(answers: unknown[][]) {
  const sent: { body: unknown; url: string }[] = []
  const fetchSpy = vi.fn(async (url: string, init?: { body?: string }) => {
    sent.push({ url, body: JSON.parse(init?.body ?? "{}") })
    return new Response(
      JSON.stringify({ success: true, errors: [], result: answers.map((results) => ({ results })) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  })
  return { sent, fetchSpy }
}

describe("d1Batch: several statements, one crossing, every answer back", () => {
  it("sends ONE request carrying every statement, and never a params array", async () => {
    const { sent, fetchSpy } = restSpy([[], [{ id: "t1" }], [{ n: 2 }]])
    vi.stubGlobal("fetch", fetchSpy)
    try {
      await d1Batch({ accountId: "a", apiToken: "t" }, "db1", [
        "INSERT INTO help (id) VALUES ('t1');",
        "SELECT id FROM help WHERE id = 't1';",
        "SELECT COUNT(*) AS n FROM help;",
      ])
    } finally {
      vi.unstubAllGlobals()
    }

    expect(sent, "three statements must cost one crossing, not three").toHaveLength(1)
    const body = sent[0].body as { sql: string; params?: unknown }
    for (const fragment of ["INSERT INTO help", "SELECT id FROM help", "COUNT(*)"])
      expect(body.sql).toContain(fragment)
    // The 400 this shape exists to avoid: the endpoint rejects params alongside
    // multiple statements outright (code 7400), so the key must not be there at
    // all — not present-and-empty.
    expect("params" in body, "params alongside multiple statements is a hard 400").toBe(false)
  })

  it("returns one row-array per statement, in the order given", async () => {
    const { fetchSpy } = restSpy([[], [{ id: "t1" }], [{ n: 2 }]])
    vi.stubGlobal("fetch", fetchSpy)
    try {
      const [written, row, count] = await d1Batch<[unknown[], { id: string }[], { n: number }[]]>(
        { accountId: "a", apiToken: "t" },
        "db1",
        ["INSERT INTO help (id) VALUES ('t1');", "SELECT id FROM help;", "SELECT COUNT(*) AS n FROM help;"]
      )
      // The INSERT's empty set is what keeps the indexes honest — drop it and
      // every SELECT below shifts up one and reads the wrong answer.
      expect(written).toEqual([])
      expect(row[0].id).toBe("t1")
      expect(count[0].n).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("raising a ticket inlines every value through sqlString", () => {
  /** Text engineered to end the string literal, finish the statement and start a
   * new one — the payload the whole inlining question is about. */
  const HOSTILE = "'; DROP TABLE help; --"

  it("a description that tries to close its own quote stays one string", async () => {
    calls.length = 0
    const { ticket } = await createTicket({ accountId: "a", apiToken: "t" } as never, GUARD as never, ACTOR, {
      description: HOSTILE,
      helpType: HOSTILE,
      screenRecordingLink: HOSTILE,
      sourceScreen: HOSTILE,
    })
    // No row comes back from the stub; what matters is the SQL that was sent.
    expect(ticket).toBeNull()

    const batch = calls[0].sql
    expect(batch, "the create must go through the batched door").toContain("INSERT INTO help")
    // Every apostrophe doubled, so the payload is escaped text inside a literal.
    expect(batch).toContain(sqlString(HOSTILE))
    // And the proof it STAYED inside one.
    expect(
      /DROP TABLE help/i.test(withoutStringLiterals(batch)),
      "an apostrophe in a ticket description ended its literal and started a statement"
    ).toBe(false)
  })

  it("inlines the ids the two reads used to bind, and nothing from the body", async () => {
    calls.length = 0
    await createTicket({ accountId: "a", apiToken: "t" } as never, GUARD as never, ACTOR, {
      description: "The printer is jammed",
    })
    const batch = calls[0].sql
    // The count's filter is the SESSION's user id, not anything a caller sent —
    // and it is quoted, so an id carrying an apostrophe cannot end the literal.
    expect(batch).toContain(`creator_id = ${sqlString(GUARD.userId)}`)
    expect(
      withoutStringLiterals(batch),
      "no bound-parameter placeholder may survive into an inlined statement"
    ).not.toContain("?")
  })

  it("carries the audit trail in the SAME crossing as the row it describes", async () => {
    calls.length = 0
    const { id } = await createTicket({ accountId: "a", apiToken: "t" } as never, GUARD as never, ACTOR, {
      description: "The printer is jammed",
    })
    expect(calls, "raising a ticket is now ONE crossing, not two").toHaveLength(1)
    const batch = calls[0].sql
    expect(batch).toContain("INSERT INTO help")
    expect(batch, "the trail must ride with the row").toContain("INSERT INTO activity")
    // And it must point AT that row: a trail entry whose related_row_id is not the
    // ticket just written is a trail entry for nothing.
    expect(batch).toContain(sqlString(id))
    expect(batch).toContain(sqlString("help"))
  })

  it("escapes the ACTOR'S NAME, which is the value a person controls here", async () => {
    // The ticket text never reaches the activity statement — its description is
    // "<name> raised a support ticket". The name does, and a person can set it on
    // their own profile, so this is the injection surface the fold created.
    calls.length = 0
    await createTicket(
      { accountId: "a", apiToken: "t" } as never,
      GUARD as never,
      { ...ACTOR, name: HOSTILE },
      { description: "The printer is jammed" }
    )
    const batch = calls[0].sql
    expect(batch).toContain(sqlString(HOSTILE))
    expect(
      /DROP TABLE help/i.test(withoutStringLiterals(batch)),
      "an apostrophe in someone's NAME ended its literal and started a statement"
    ).toBe(false)
    expect(
      withoutStringLiterals(batch),
      "no bound-parameter placeholder may survive into the inlined activity row"
    ).not.toContain("?")
  })

  it("does not fork the author of the audit trail", () => {
    // The whole reason the fourth crossing waited: saving it by re-typing the
    // INSERT here would give one table two authors, and the copy that is not the
    // seam is the one that stops escaping something. So the statement is BUILT by
    // the seam and used by both writers.
    //
    // READ THROUGH `stripComments`, because this file's own prose says
    // "INSERT INTO activity" while explaining that there must be only one of
    // them. A check that counts its own documentation is the exact fault this
    // campaign spent a day removing from three other scanners.
    const help = stripComments(readSource("workers", "content", "src", "lib", "help.ts"))
    const activity = stripComments(readSource("shared", "workers", "activity.ts"))
    expect(help, "the module must ask the seam for the statement").toContain("activityStatement(")
    expect(
      help.includes("INSERT INTO activity"),
      "a hand-copied INSERT here is a second author of the audit trail"
    ).toBe(false)
    expect(activity, "the seam must expose it").toMatch(/export function activityStatement/)
    // …and USE it. A builder the seam exports but does not write through is two
    // copies wearing one name — the drift this was avoiding, one file over.
    const logActivity = activity.slice(activity.indexOf("export async function logActivity"))
    expect(
      logActivity,
      "logActivity must write through the same builder, or the fold created the second author it was avoiding"
    ).toContain("activityStatement(actor, entry)")
    expect(
      (activity.match(/INSERT INTO activity/g) ?? []).length,
      "exactly one INSERT INTO activity may exist in the seam"
    ).toBe(1)
  })
})
