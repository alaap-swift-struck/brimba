// AN OMITTED FIELD IS NOT AN EMPTY ONE.
//
// Both content edit doors take a PARTIAL body. Two different callers send two
// different things, and the door has to tell them apart:
//
//   the MACHINE surface (agent / MCP) OMITS a field it does not mean to touch —
//     tool-catalog's `opt()` returns undefined, JSON.stringify drops the key, and
//     the door's JSON.parse yields `undefined`;
//   the WEB form SENDS null for a field a person actually cleared —
//     `body: values.body || null` — so the key is present and explicitly empty.
//
// Both doors used to write every content column unconditionally, so "rename this
// article" through `update_learning` (id + title, agent.confirm: false) wiped the
// body, category, link and type with no confirmation and no way to notice. The
// distinction that fixes it is `=== undefined` (absent → keep) versus anything
// else (present → apply). `== null` cannot express it: it treats the person who
// cleared the field and the machine that never mentioned it as the same caller.
//
// So these tests drive the REAL doors and read the SQL they would really send.
// A source-scan would have passed against the broken code — the columns were all
// present in the statement; being assigned the wrong value is not something a
// grep can see.

import { describe, expect, it, vi } from "vitest"

// Hoisted: vitest lifts `vi.mock` above the file, so the fixtures the factory
// closes over have to be lifted with it.
const H = vi.hoisted(() => ({
  statements: [] as string[],
  LEARNING_BEFORE: {
    id: "L1",
    content_title: "How to log in",
    category: "Getting started",
    content_description: "Step-by-step sign-in guide",
    content_type: "Article",
    content_link: "https://example.com/guide",
    content_body: "<p>Open the app and enter your email.</p>",
    sequence: 7,
    is_required: 1,
  },
  TICKET_BEFORE: {
    id: "H1",
    help_type: "Bug",
    description: "The dashboard is blank",
    screen_recording_link: "https://example.com/clip.mp4",
    source_screen: "Learning",
    status: "open",
    resolved: 0,
    resolved_at: null,
    creator_id: "U1",
    creator_name: "Ada Green",
    editor_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
  },
}))

// Only the D1 door itself is faked — `sqlString` and every rule in the two libs
// stay real, so what is asserted below is the statement the door would send.
vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  return {
    ...actual,
    d1Query: async (_cfg: unknown, _db: string, sql: string) => {
      H.statements.push(sql)
      if (sql.startsWith("UPDATE")) return [{ id: "R1" }] // the write landed
      if (/FROM selectable_data/.test(sql)) return [{ id: "S1" }] // category already exists
      if (/FROM learning WHERE id/.test(sql)) return [H.LEARNING_BEFORE]
      if (/FROM help WHERE id/.test(sql)) return [H.TICKET_BEFORE]
      return []
    },
    d1ExecScript: async (_cfg: unknown, _db: string, sql: string) => {
      H.statements.push(sql)
    },
  }
})

import { updateLearning } from "../src/lib/learning"
import { updateTicket } from "../src/lib/help"
import type { D1Rest } from "../../../shared/workers/d1-rest"
import type { MemberGuard } from "../../../shared/workers/gating"
import type { Actor } from "../../../shared/workers/activity"

const CFG = { accountId: "acct", apiToken: "tok" } as D1Rest
const GUARD: MemberGuard = {
  userId: "U1",
  teamId: "T1",
  roleId: "R1",
  databaseId: "db1",
  movedModules: 0,
}
const ACTOR: Actor = { id: "U1", email: "ada@example.com", name: "Ada Green" }

/** Run a door, then hand back the UPDATE it would really have sent. */
async function updateSql(table: "learning" | "help", run: () => Promise<void>): Promise<string> {
  H.statements.length = 0
  await run()
  const sql = H.statements.find((s) => s.startsWith(`UPDATE ${table} SET`))
  expect(sql, `the door sent no UPDATE ${table}`).toBeTruthy()
  return sql as string
}

describe("the learning door tells an omitted field from a cleared one", () => {
  // The reported bug, in the shape the agent actually produces it: `update_learning`
  // requires only id + title and is marked non-dangerous, so "rename that article"
  // is one unconfirmed call carrying two fields.
  it("a rename that never mentions the body keeps the body, category, link and type", async () => {
    const sql = await updateSql("learning", () =>
      updateLearning(CFG, GUARD, ACTOR, "L1", { title: "How to sign in" })
    )

    expect(sql).toContain("content_title = 'How to sign in'") // the one field it meant to change
    expect(
      sql.includes("content_body = '<p>Open the app and enter your email.</p>'"),
      "a rename wiped the article body — the whole article, gone, unconfirmed"
    ).toBe(true)
    expect(sql).toContain("category = 'Getting started'")
    expect(sql).toContain("content_link = 'https://example.com/guide'")
    expect(sql).toContain("content_type = 'Article'")
    // The description is stored as written — an import may have set one that is
    // NOT an excerpt of the body — so a rename must leave it exactly alone rather
    // than re-derive it from a body that also did not move.
    expect(sql).toContain("content_description = 'Step-by-step sign-in guide'")
  })

  it("the derived preview FOLLOWS the body when the body is what changed", async () => {
    // Description is derived from the body, so an edit that replaces the body and
    // says nothing about the description must re-derive it. Preserving it here
    // would leave every list card describing the article's previous contents.
    const sql = await updateSql("learning", () =>
      updateLearning(CFG, GUARD, ACTOR, "L1", {
        title: "How to log in",
        body: "<p>Tap Sign in, then use the code we email you.</p>",
      })
    )

    expect(sql).toContain("content_body = '<p>Tap Sign in, then use the code we email you.</p>'")
    expect(sql).toContain("content_description = 'Tap Sign in, then use the code we email you.'")
  })

  it("a field the person actually CLEARED still clears", async () => {
    // The web form's own payload shape: present and explicitly null.
    const sql = await updateSql("learning", () =>
      updateLearning(CFG, GUARD, ACTOR, "L1", {
        title: "How to log in",
        body: null,
        category: null,
        contentType: null,
        contentLink: null,
      })
    )

    expect(sql).toContain("content_body = NULL")
    expect(sql).toContain("category = NULL")
    expect(sql).toContain("content_link = NULL")
    expect(sql).toContain("content_type = NULL")
  })

  it("order and required are guarded the same way — absent keeps, explicit applies", async () => {
    // These two were already guarded, but with `== null`, which cannot tell the
    // two callers apart. Absent must keep 7/1; an explicit value must land.
    const kept = await updateSql("learning", () =>
      updateLearning(CFG, GUARD, ACTOR, "L1", { title: "How to log in" })
    )
    expect(kept).toContain("sequence = 7")
    expect(kept).toContain("is_required = 1")

    const moved = await updateSql("learning", () =>
      updateLearning(CFG, GUARD, ACTOR, "L1", { title: "How to log in", sequence: 2, required: false })
    )
    expect(moved).toContain("sequence = 2")
    expect(moved).toContain("is_required = 0")
  })
})

describe("the help door tells an omitted field from a cleared one", () => {
  // `update_help_ticket` has the same shape: id + description required,
  // agent.confirm false, everything else optional.
  it("an edit that never mentions them keeps the type, recording link and source", async () => {
    const sql = await updateSql("help", () =>
      updateTicket(CFG, GUARD, ACTOR, "H1", { description: "The dashboard is still blank" })
    )

    expect(sql).toContain("description = 'The dashboard is still blank'")
    expect(
      sql.includes("help_type = 'Bug'"),
      "editing the description silently reclassified the ticket"
    ).toBe(true)
    expect(
      sql.includes("screen_recording_link = 'https://example.com/clip.mp4'"),
      "editing the description threw away the reporter's screen recording"
    ).toBe(true)
    expect(sql).toContain("source_screen = 'Learning'")
  })

  it("a field the person actually CLEARED still clears", async () => {
    const sql = await updateSql("help", () =>
      updateTicket(CFG, GUARD, ACTOR, "H1", {
        description: "The dashboard is blank",
        helpType: null,
        screenRecordingLink: null,
        sourceScreen: null,
      })
    )

    expect(sql).toContain("help_type = NULL")
    expect(sql).toContain("screen_recording_link = NULL")
    expect(sql).toContain("source_screen = NULL")
  })
})

describe("the activity row reports what really changed", () => {
  // The diff is how a person finds out a field moved. If it compares against the
  // INCOMING value rather than the value actually written, a preserved field gets
  // reported as cleared — the record's history describing a change that never
  // happened, which is worse than silence.
  it("a rename records the title and nothing else", async () => {
    H.statements.length = 0
    await updateLearning(CFG, GUARD, ACTOR, "L1", { title: "How to sign in" })
    const activity = H.statements.find((s) => s.includes("INSERT INTO activity")) ?? ""

    expect(activity).toContain("Title")
    for (const field of ["Body", "Category", "Link", "Type", "Order", "Required"])
      expect(
        activity.includes(`"${field}"`),
        `the history claims ${field} changed on a rename that never sent it`
      ).toBe(false)
  })
})
