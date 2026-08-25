// R25, the parts a source scan cannot see.
//
// The scan in `web/test/rules/activity.test.ts` proves the log is append-only, that the
// rule is stated once, and that the origin column exists. It cannot prove what
// the writer actually PUTS in a row — and every one of the properties below is
// the kind that fails silently: a row still gets written, it just says less than
// you think it does, and nobody notices until the day someone needs it.

import { describe, expect, it, vi } from "vitest"

import { ACTIVITY_GATE_MAP, ACTIVITY_TABLE_EXEMPT } from "../../../shared/rules/registry"
import { read, ROOT, serverSources, stripComments } from "../../../shared/test/source"

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

  // THE GAP MARKER HAS TO OUTLIVE THE CONSOLE. Until now a failed log line went
  // to `traceError` and nowhere else — Cloudflare keeps those for about a week,
  // so after seven days the fact that a record's history has a HOLE in it was
  // gone, while the history itself still looked complete. The one thing an audit
  // trail must never do is lose the record of its own failure.
  const failing = async () => {
    const { d1ExecScript } = await import("../../../shared/workers/d1-rest")
    vi.mocked(d1ExecScript).mockRejectedValueOnce(new Error("database on fire"))
  }
  type Gap = { place: string; message: string }
  const collector = () => {
    const seen: Gap[] = []
    return {
      seen,
      record: (place: string, e: unknown) => {
        seen.push({ place, message: e instanceof Error ? e.message : String(e) })
      },
    }
  }

  it("hands the gap to the recorder, NAMING the record whose history now has a hole", async () => {
    const { seen, record } = collector()
    await failing()
    await logActivity(
      cfg,
      "db1",
      actor,
      { type: "x", description: "y", relatedTable: "help", relatedRowId: "help-42" },
      record
    )
    expect(seen, "the failure must reach the durable store, not just the console").toHaveLength(1)
    expect(seen[0].place, "a gap nobody can locate is not a repair list").toContain("help")
    expect(seen[0].place).toContain("help-42")
    expect(seen[0].message, "and it must carry what actually went wrong").toContain("database on fire")
  })

  it("the account logger follows the SAME contract", async () => {
    const { logAccountActivity } = await import("../../../shared/workers/account-activity")
    const { seen, record } = collector()
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error("core database on fire")
            },
          }),
        }),
      },
    }
    await expect(
      logAccountActivity(env, "user-1", { type: "Email changed", description: "z" }, record)
    ).resolves.toBeUndefined()
    expect(seen).toHaveLength(1)
    expect(seen[0].place).toContain("Email changed")
    expect(seen[0].message).toContain("core database on fire")
  })

  it("records NOTHING when the write succeeds", async () => {
    // A gap marker that fires on the happy path is a gap marker nobody reads.
    const { seen, record } = collector()
    await logActivity(cfg, "db1", actor, { type: "x", description: "y" }, record)
    expect(seen).toEqual([])
  })

  it("with NO recorder, behaves exactly as it did before — swallow, never throw", async () => {
    // The seam is OPTIONAL on purpose: a worker with no way to record must get
    // "not recorded", never a crash inside the error path.
    await failing()
    await expect(
      logActivity(cfg, "db1", actor, { type: "x", description: "y" })
    ).resolves.toBeUndefined()
  })

  it("a recorder that ITSELF throws still cannot break the caller", async () => {
    // The error path is the one place a second failure is most likely — the
    // store it writes to is often the thing that just went down.
    await failing()
    await expect(
      logActivity(cfg, "db1", actor, { type: "x", description: "y" }, () => {
        throw new Error("the error store is down too")
      })
    ).resolves.toBeUndefined()
  })
})

describe("the verbs are a closed set", () => {
  it("covers every lifecycle stage a record has", () => {
    for (const v of ["created", "edited", "deactivated", "activated"]) {
      expect(ACTIVITY_VERBS as readonly string[]).toContain(v)
    }
  })

  it("and every one of them is actually WRITTEN somewhere", () => {
    // The assertion above cannot fail: it checks that a constant contains the
    // strings listed on the line above it. It passed happily while THREE of the
    // six verbs — deactivated, activated, status — were produced by no code path
    // at all, because all five deactivate/status log sites simply omitted `verb`.
    // `idx_activity_verb`'s own documented example query, "every deactivation
    // this month", returned zero rows for ever. A closed set nothing writes into
    // is a schema, not a record. (Activity-log review, 2026-08-25.)
    const written = new Set<string>()
    for (const [, src] of serverSources())
      for (const m of stripComments(src).matchAll(/verb:\s*(?:\w+\s*\?\s*)?"(\w+)"(?:\s*:\s*"(\w+)")?/g)) {
        written.add(m[1])
        if (m[2]) written.add(m[2])
      }
    expect(written.size, "no verbs found in the source at all — the scan has gone blind").toBeGreaterThan(3)
    expect(
      ACTIVITY_VERBS.filter((v) => !written.has(v)),
      "these verbs are declared but nothing writes them — either write them or drop them from the set"
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// R25's LAST CLAUSE: "what is deliberately NOT logged is written down in the
// same file." That sentence has been in RULES.md since the law was written and
// nothing checked it, so the list drifted: sixteen write sites were defensible
// and undocumented, which from the outside is indistinguishable from sixteen
// somebody forgot. The difference matters at exactly one moment — when a person
// asks why a change left no trace — and that is the worst moment to have to go
// and read the source to find out.
//
// The subject list is DERIVED, never hand-written here: every table server code
// writes to, minus every table an activity row is able to NAME. What is left is
// the set no feed can ever show, and each one has to be accounted for.
// ---------------------------------------------------------------------------

describe("the not-logged list is complete (R25)", () => {
  /** Every table written anywhere in worker or shared server code. */
  const written = () => {
    const tables = new Map<string, Set<string>>()
    for (const [path, src] of serverSources())
      for (const m of stripComments(src).matchAll(
        /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi
      )) {
        const t = m[1]
        if (/^(SET|FROM|INTO)$/i.test(t)) continue
        if (!tables.has(t)) tables.set(t, new Set())
        tables.get(t)!.add(path)
      }
    return tables
  }

  /** The stated list, sliced out of the preamble so a table named elsewhere in
   * the file (the INSERT itself names `activity`) cannot stand in for a reason. */
  const statedList = () => {
    const src = read(`${ROOT}/shared/workers/activity.ts`)
    const from = src.indexOf("WHAT IS DELIBERATELY NOT LOGGED")
    const to = src.indexOf("THE TWO TABLES.")
    expect(from, "the not-logged block has been renamed or removed — this check is now blind").toBeGreaterThan(-1)
    expect(to, "the block's end marker has moved — this check is now blind").toBeGreaterThan(from)
    return src.slice(from, to)
  }

  it("finds real write sites — a scan that reads nothing reports all clear", () => {
    const tables = written()
    expect(tables.size, "no INSERT/UPDATE/DELETE found in server source at all").toBeGreaterThan(15)
    expect([...tables.keys()], "the sanity anchor: the log's own writer").toContain("activity")
  })

  /** A table an activity row can name is, by definition, one a feed can show —
   * R18 already forces every such table into one of these two registries, so
   * subtracting them leaves exactly the tables no history will ever mention. */
  const unloggable = () => {
    const named = new Set([...Object.keys(ACTIVITY_GATE_MAP), ...Object.keys(ACTIVITY_TABLE_EXEMPT)])
    return [...written()].filter(([t]) => !named.has(t))
  }

  it("the subject list is not empty — a check with nothing to check is decoration", () => {
    // Without this, a registry that happened to name every table would make the
    // assertion below pass vacuously for ever. It is the exact failure mode this
    // campaign found fifteen times.
    expect(unloggable().length, "no unloggable tables derived at all").toBeGreaterThan(10)
  })

  it("every table no activity row can NAME is accounted for in activity.ts", () => {
    const list = statedList()
    const missing: string[] = []
    for (const [table, where] of unloggable()) {
      if (new RegExp(`\\b${table}\\b`).test(list)) continue
      missing.push(`${table} (written by ${[...where].join(", ")})`)
    }
    expect(
      missing,
      `these tables are written by server code, can never appear in any activity feed, and are not written down in shared/workers/activity.ts — a reader cannot tell "deliberately not logged" from "someone forgot": ${missing.join("; ")}`
    ).toEqual([])
  })
})
