// R25, the parts a source scan cannot see.
//
// The scan in `web/test/rules.test.ts` proves the log is append-only, that the
// rule is stated once, and that the origin column exists. It cannot prove what
// the writer actually PUTS in a row — and every one of the properties below is
// the kind that fails silently: a row still gets written, it just says less than
// you think it does, and nobody notices until the day someone needs it.

import { describe, expect, it, vi } from "vitest"

const scripts: string[] = []
vi.mock("../../../shared/workers/d1-rest", async () => {
  const actual = await vi.importActual<typeof import("../../../shared/workers/d1-rest")>("../../../shared/workers/d1-rest")
  return {
    ...actual,
    d1ExecScript: vi.fn(async (_c: unknown, _d: string, sql: string) => {
      scripts.push(sql)
      return []
    }),
  }
})

const { logActivity, changedFields, describeChanges, originFrom, ORIGIN_HEADER, SYSTEM_ACTOR, ACTIVITY_VERBS } =
  await import("../../../shared/workers/activity")
type Actor = import("../../../shared/workers/activity").Actor

const cfg = {} as never
const actor: Actor = { id: "u1", email: "a@b.c", name: "Ada" }
const write = async (entry: Parameters<typeof logActivity>[3], who = actor) => {
  scripts.length = 0
  await logActivity(cfg, "db1", who, entry)
  return scripts[0] ?? ""
}

describe("which door the change came through", () => {
  it("reads a known origin off the request", () => {
    for (const o of ["mcp", "agent", "import", "job", "api", "ui"]) {
      const r = new Request("https://x/", { headers: { [ORIGIN_HEADER]: o } })
      expect(originFrom(r)).toBe(o)
    }
  })

  it("REFUSES an origin it does not know, rather than writing it into the trail", () => {
    // The header is caller-supplied and lands in an audit row. An unchecked value
    // would let anyone write whatever they liked into the log's own provenance —
    // the one column whose entire job is being trustworthy.
    for (const bad of ["", "root", "UI; DROP", "../job", "x".repeat(200)]) {
      const r = new Request("https://x/", { headers: { [ORIGIN_HEADER]: bad } })
      expect(originFrom(r), `${JSON.stringify(bad)} must not reach a row`).toBe("ui")
    }
  })

  it("is case-insensitive, so a client that shouts still gets recorded correctly", () => {
    expect(originFrom(new Request("https://x/", { headers: { [ORIGIN_HEADER]: "MCP" } }))).toBe("mcp")
  })

  it("defaults to the app when nothing says otherwise", () => {
    expect(originFrom(new Request("https://x/"))).toBe("ui")
  })
})

describe("what actually lands in the row", () => {
  it("carries the actor's origin without any call site passing it", async () => {
    // The whole point of putting origin on the ACTOR: two dozen existing log
    // sites gained provenance without being edited, and a new module gets it
    // without knowing it exists.
    const sql = await write({ type: "Learning created", description: "x" }, { ...actor, origin: "agent" })
    expect(sql).toContain("'agent'")
  })

  it("an explicit entry origin beats the actor's", async () => {
    const sql = await write({ type: "x", description: "y", origin: "job" }, { ...actor, origin: "mcp" })
    expect(sql).toContain("'job'")
  })

  it("falls back to the app rather than writing an empty provenance", async () => {
    const sql = await write({ type: "x", description: "y" })
    expect(sql).toContain("'ui'")
  })

  it("writes the field diff as JSON beside the sentence", async () => {
    const sql = await write({
      type: "Learning edited",
      description: "Ada edited it",
      changes: [{ label: "Title", from: "Old", to: "New" }],
    })
    expect(sql, "the human sentence stays").toContain("Ada edited it")
    expect(sql, "and the machine-readable diff rides along").toContain("Title")
    expect(sql).toContain("Old")
    expect(sql).toContain("New")
  })

  it("writes NULL, not an empty array, when nothing changed", async () => {
    // "no fields changed" and "this door does not send diffs yet" are different
    // facts. An empty array would merge them into one and quietly lose the
    // difference exactly when someone is trying to work out which it was.
    const sql = await write({ type: "x", description: "y", changes: [] })
    expect(sql).toMatch(/,\s*NULL\s*\)/)
  })

  it("never lets a quote in a value break the statement", async () => {
    const sql = await write({
      type: "x",
      description: "y",
      changes: [{ label: "Name", from: "O'Brien", to: "d'Arcy" }],
    })
    expect(sql).toContain("''")
  })
})

describe("the human sentence and the data never disagree", () => {
  const fields = [
    { label: "Title", from: "A", to: "B" },
    { label: "Body", from: "same", to: "same" },
    { label: "Category", from: "", to: "Safety" },
  ]

  it("both describe exactly the fields that moved", () => {
    const kept = changedFields(fields)
    expect(kept.map((f) => f.label), "the unchanged field is dropped from both").toEqual(["Title", "Category"])
    const prose = describeChanges(fields)
    expect(prose).toContain("Title")
    expect(prose).toContain("Category")
    expect(prose, "and the unchanged one appears in neither").not.toContain("Body")
  })

  it("treats whitespace-only edits as no change, in both", () => {
    const f = [{ label: "Title", from: " A ", to: "A" }]
    expect(changedFields(f)).toEqual([])
    expect(describeChanges(f)).toBe("")
  })
})

describe("background work signs its own rows", () => {
  it("has a system actor rather than a blank one", async () => {
    // "Who deactivated this?" answering "" reads as nobody knows. It should read
    // as the scheduled job, which is a real answer.
    expect(SYSTEM_ACTOR.name).toBeTruthy()
    const sql = await write({ type: "Module relocated", description: "moved" }, SYSTEM_ACTOR)
    expect(sql).toContain(SYSTEM_ACTOR.name)
  })
})

describe("a logging failure is loud in the record, not silent", () => {
  it("never throws to the caller, whatever the database does", async () => {
    const { d1ExecScript } = await import("../../../shared/workers/d1-rest")
    vi.mocked(d1ExecScript).mockRejectedValueOnce(new Error("database on fire"))
    // The contract: a logging hiccup must never break the action it describes.
    await expect(logActivity(cfg, "db1", actor, { type: "x", description: "y" })).resolves.toBeUndefined()
  })
})

describe("the verbs are a closed set", () => {
  it("covers every lifecycle stage a record has", () => {
    for (const v of ["created", "edited", "deactivated", "activated"]) {
      expect(ACTIVITY_VERBS as readonly string[]).toContain(v)
    }
  })
})
