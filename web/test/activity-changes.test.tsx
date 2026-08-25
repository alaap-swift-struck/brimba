// THE DIFF NOBODY COULD SEE.
//
// Three modules — learning, help and member_roles — have written a field-level
// before/after into every edit's activity row for months. The reader now hands it
// back on a record-scoped feed. Until this, nothing on a screen read it: the whole
// chain was paid for end to end and stopped one step short of a person's eyes.
//
// WHAT THESE LOCK, and each is a rule that would be quietly wrong otherwise:
//
//  · COLLAPSED BY DEFAULT. An activity row is a sentence; the diff is the detail
//    behind it. A feed that opens every diff by default is a wall of old values
//    where a timeline used to be.
//  · `hideValues` IS HONOURED ON THE CLIENT TOO. The server strips those values
//    before they travel — so the client is asserted against a diff that still
//    CARRIES them, which is the only way to prove the flag is obeyed here rather
//    than merely never tested. A field the writer chose not to show must not
//    reappear because a second layer forgot the decision.
//  · THE VALUES ARE PRINTED AS RECEIVED. They arrive clipped to 200 characters
//    server-side; the client must never re-derive or re-expand them.
//  · A PERSON IS SHOWN BY NAME. Never an id, never an email address.
//  · ONE SEAM, THREE SCREENS. The rules above live in one place, because three
//    copies of them is three chances to drift.

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"
import { afterEach, describe, expect, it } from "vitest"

import { activityFeedItems } from "@/components/activity-changes"
import type { ActivityItem } from "@shared/types"

// The ONE set of source readers every check in this repo shares — a per-check
// reader is how a check goes blind (see shared/test/source.ts).
import { componentFiles, read, workerSources } from "./rules/_paths"

// This workspace runs vitest WITHOUT globals, so testing-library's automatic
// cleanup never registers — without this the previous test's node is still in the
// document and a "it is hidden" assertion passes on a stale one.
afterEach(cleanup)

/** One record-scoped row, exactly as the reader shapes it. */
const row = (extra: Partial<ActivityItem> = {}): ActivityItem => ({
  id: "a1",
  type: "Role edited",
  description: "Ada Lovelace edited the Editor role",
  actorName: "Ada Lovelace",
  createdAt: "2026-08-20T09:00:00.000Z",
  verb: "edited",
  origin: "ui",
  ...extra,
})

const feed = (items: ActivityItem[]) =>
  render(<ActivityFeed config={defaultActivityFeedConfig} items={activityFeedItems(items)} />)

const expander = () => screen.queryByRole("button", { name: /what changed/i })

describe("the Activity tab shows what changed, behind an expander", () => {
  it("is COLLAPSED by default — the row is a sentence, the diff is the detail", () => {
    feed([row({ changes: [{ label: "Name", from: "Editor", to: "Senior editor" }] })])
    expect(screen.getByText(/edited the Editor role/)).toBeTruthy()
    expect(expander(), "a row carrying a diff must offer the expander").toBeTruthy()
    expect(
      screen.queryByText(/Senior editor/),
      "the old and new values must not be on screen until asked for"
    ).toBeNull()
  })

  it("opens to name the field, old → new", () => {
    feed([
      row({
        changes: [
          { label: "Name", from: "Editor", to: "Senior editor" },
          { label: "Description", from: "", to: "Runs the desk" },
          { label: "Link", from: "https://x.com/a", to: null },
        ],
      }),
    ])
    fireEvent.click(expander()!)
    expect(screen.getByText("Name")).toBeTruthy()
    expect(screen.getByText("Editor → Senior editor")).toBeTruthy()
    expect(screen.getByText("Set to Runs the desk")).toBeTruthy()
    expect(screen.getByText("Cleared (was https://x.com/a)")).toBeTruthy()
  })

  it("honours hideValues — the field NAME, never the values, even when opened", () => {
    // The stored diff carries the whole article body twice; the reader strips it.
    // Feeding it back UNSTRIPPED is the point: the client must obey the writer's
    // decision on its own, not because the values happened to be missing.
    feed([
      row({
        changes: [
          { label: "Body", from: "the old article body", to: "the new article body", hideValues: true },
        ],
      }),
    ])
    fireEvent.click(expander()!)
    expect(screen.getByText("Body"), "the label survives").toBeTruthy()
    expect(screen.queryByText(/old article body/), "the hidden value must not render").toBeNull()
    expect(screen.queryByText(/new article body/)).toBeNull()
    expect(document.body.textContent, "and it says so plainly").toMatch(/aren't shown/i)
  })

  it("prints a clipped value exactly as it arrived — never re-expanded", () => {
    const clipped = `${"z".repeat(199)}…`
    feed([row({ changes: [{ label: "Notes", from: clipped, to: "short" }] })])
    fireEvent.click(expander()!)
    expect(screen.getByText(`${clipped} → short`)).toBeTruthy()
  })

  it("shows no expander at all when the row carries no diff", () => {
    feed([row()])
    expect(expander(), "most rows are a sentence and nothing more").toBeNull()
    feed([row({ id: "a2", changes: [] })])
    expect(expander(), "an empty diff is not a diff").toBeNull()
  })

  it("names the person by NAME, and shows nothing when there is no name", () => {
    const named = activityFeedItems([row({ changes: [{ label: "Name", to: "Senior editor" }] })])
    expect(named[0].actor, "the actor line carries the name").toBe("Ada Lovelace")
    feed([row({ changes: [{ label: "Name", from: "Editor", to: "Senior editor" }] })])
    expect(screen.getAllByText(/Ada Lovelace/).length).toBeGreaterThan(0)
    cleanup()
    // No name → no attribution. Never a user id or an email address in its place:
    // "01J2X…" or "ada@x.com" tells you who in the one form nobody recognises.
    const items = activityFeedItems([row({ actorName: null })])
    expect(items[0].actor).toBeUndefined()
  })
})

/**
 * Every table whose door WRITES a field diff — derived from the writers, never
 * hand-listed. Hand-listing is what let this whole feature sit unread for months:
 * a list of "the three modules that diff" agrees with itself forever, including
 * on the day a fourth one starts.
 */
function diffingTables(): string[] {
  const out = new Set<string>()
  for (const [, src] of workerSources()) {
    let i = -1
    while ((i = src.indexOf("changedFields(", i + 1)) !== -1) {
      // The `relatedTable` of the SAME logActivity call the diff is passed to.
      const m = /relatedTable: "([a-z_]+)"/.exec(src.slice(i, i + 400))
      if (m) out.add(m[1])
    }
  }
  return [...out].sort()
}

/** The screens that show that table's record activity, by the one generic
 * fetcher (R5) — so a new module's screen is found without being named here. */
const screensFor = (table: string) =>
  componentFiles().filter((f) => read(f).includes(`recordActivity("${table}"`))

describe("every module that WRITES a diff has a screen that SHOWS it", () => {
  const tables = diffingTables()

  it("finds the diff writers (the scan must not silently go blind)", () => {
    expect(tables).toEqual(["help", "learning", "member_roles"])
  })

  for (const table of tables) {
    it(`${table}'s record screen renders the diff through the one seam`, () => {
      const screens = screensFor(table)
      expect(screens.length, `nothing on a screen reads ${table}'s record activity`).toBeGreaterThan(0)
      for (const s of screens) {
        const src = read(s)
        expect(
          src.includes("activityFeedItems"),
          `${s} shows ${table}'s activity but throws its diff away`
        ).toBe(true)
        expect(
          /actor: a\.actorName/.test(src),
          `${s} keeps its own copy of the row mapping — the render rules would drift`
        ).toBe(false)
      }
    })
  }
})
