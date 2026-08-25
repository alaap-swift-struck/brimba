// WHAT A CREATE ACTION FORWARDS TO THE DOOR — with the "Raised from" field that
// was reaching the wire by accident.
//
// `createHelp` took `{ description, helpType? }` and passed the whole object on by
// reference, so `sourceScreen` — the screen name the help form auto-fills off the
// breadcrumb, and the only thing that has ever filled the "Raised from" row on a
// ticket — arrived at the door despite no type anywhere in this function admitting
// it existed. It worked because of a style choice. Rewriting the call as
// `createHelp({ description, helpType })`, which is what tidying a forwarded object
// normally looks like, would have deleted the feature in silence.
//
// Two locks, because the fault had two halves:
//   • RUNTIME — the door is handed the field (this file). Destructure the object
//     and these go red.
//   • COMPILE — the calls below pass object LITERALS, so TypeScript's excess
//     property check fails `npm run check` if the parameter type ever narrows back
//     to one that does not mention `sourceScreen`. A type that under-describes
//     what it forwards is a trap laid for the next reader, not a small untidiness.

import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The REAL door's input type (a type-only import, so the mock below still
// replaces the module at runtime). Taking it from `api.ts` rather than writing it
// out again is what keeps the stand-in honest: if the door stops accepting
// `sourceScreen`, this stops compiling here too, instead of the test quietly
// asserting a shape the server no longer has.
import type { content as helpDoor } from "@/lib/api"
type CreateHelpInput = Parameters<typeof helpDoor.createHelp>[0]

// `vi.hoisted`, because `vi.mock`'s factory is lifted above every import and
// cannot close over an ordinary top-level const.
const { createHelpDoor } = vi.hoisted(() => ({
  createHelpDoor: vi.fn(async (_input: { description: string; helpType?: string; sourceScreen?: string }) => ({
    created: { id: "ticket-1", description: "The printer is jammed" },
    total: 1,
    mineTotal: 1,
  })),
}))
// The stand-in must be assignable to the real door — a mock that has drifted from
// the thing it stands in for proves nothing about the thing it stands in for.
const _doorShapeMatches: (input: CreateHelpInput) => unknown = createHelpDoor

vi.mock("@/lib/api", () => ({
  content: { createHelp: createHelpDoor, createLearning: vi.fn() },
  tenancy: {},
  auth: {},
}))
vi.mock("@swift-struck/ui/registry/primitives/sonner/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useScreenActions } from "@/lib/use-screen-actions"

function actions() {
  return renderHook(() => useScreenActions("team-1")).result.current
}

describe("raising a ticket forwards where it was raised from", () => {
  it("hands the door the sourceScreen the form filled in", async () => {
    createHelpDoor.mockClear()
    await actions().createHelp({
      description: "The printer is jammed",
      helpType: "Problem",
      sourceScreen: "Members",
    })

    expect(createHelpDoor).toHaveBeenCalledTimes(1)
    expect(
      createHelpDoor.mock.calls[0][0],
      'the ticket must carry where it was raised from, or every "Raised from" row reads blank'
    ).toMatchObject({ description: "The printer is jammed", helpType: "Problem", sourceScreen: "Members" })
  })

  it("still forwards the fields it always did, and returns the new id (R22)", async () => {
    createHelpDoor.mockClear()
    const id = await actions().createHelp({ description: "No sound on the video" })

    expect(createHelpDoor.mock.calls[0][0]).toMatchObject({ description: "No sound on the video" })
    expect(id, "FormShell opens the record a create returns").toBe("ticket-1")
  })
})
