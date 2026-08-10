// A LIVE PING SAYS *WHAT CHANGED*, NEVER *WHAT IT SAYS*.
//
// Every team member's browser is subscribed to the same channel, so anything a
// ping carries is broadcast to people whose role may not let them read it. The
// contract is therefore `{resource, id, op}` and nothing else: on a ping the
// client re-pulls the row through the GATED door, which is where the caller's
// rights are re-checked. A payload would route around that gate entirely.
//
// This was the one security invariant in the sweep with no automated test —
// held only by the shape of publishChange's signature and a line in CACHING.md.

import { describe, expect, it, vi } from "vitest"

import { publishChange } from "../../../shared/workers/realtime"

describe("live pings carry no row content", () => {
  it("sends only {resource, id, op} — never a row, a body, or a name", async () => {
    let sent: Record<string, unknown> = {}
    const realtime = {
      fetch: vi.fn(async (_url: string, init?: { body?: string }) => {
        sent = JSON.parse(init?.body ?? "{}")
        return new Response("{}", { status: 200 })
      }),
    }
    await publishChange(realtime as never, "team-1", "help", "row-9", "edit")

    // The wire shape is { channel, event } — the channel names WHO hears it, the
    // event says WHAT changed. The event's field set is the whole contract.
    expect(Object.keys(sent).sort(), "the envelope is channel + event, nothing else").toEqual([
      "channel",
      "event",
    ])
    expect(sent.channel, "a team ping goes to that team's channel only").toBe("team:team-1")
    for (const key of Object.keys(sent.event as object))
      expect(
        ["resource", "id", "op"],
        `a ping may not carry "${key}" — a subscriber who can't read the row would receive it`
      ).toContain(key)
    // …and nothing in the payload may look like content.
    const flat = JSON.stringify(sent)
    for (const leak of ["description", "body", "email", "title", "name", "content"])
      expect(flat, `"${leak}" must never ride a ping`).not.toContain(leak)
  })

  it("the signature cannot express a payload — the seam is the guarantee", () => {
    // publishChange(binding, teamId, resource, id?, op?) — five positional
    // arguments, all scalars. There is no object parameter to smuggle a row in.
    expect(publishChange.length, "adding a payload parameter must break this").toBeLessThanOrEqual(5)
  })
})
