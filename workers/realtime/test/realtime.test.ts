// The realtime worker's gate + publish contract, tested with fakes (the
// Durable Object itself is exercised live by the staging smoke). Covers: the
// connection gate only admits active team members, and a publish lands as a
// well-formed ping to the team's channel.
import { describe, expect, it } from "vitest"

import { isActiveMember } from "../../../shared/workers/membership"
import { publishChange } from "../../../shared/workers/realtime"

/** A one-row D1 stub: the membership query returns `row` (or null = not a member). */
function fakeDb(row: unknown) {
  return {
    prepare() {
      return {
        bind() {
          return { first: async () => row }
        },
      }
    },
  } as unknown as Parameters<typeof isActiveMember>[0]
}

describe("isActiveMember (WebSocket connection gate)", () => {
  it("admits an active member", async () => {
    expect(await isActiveMember(fakeDb({ 1: 1 }), "U", "T")).toBe(true)
  })
  it("rejects a non-member", async () => {
    expect(await isActiveMember(fakeDb(null), "U", "T")).toBe(false)
  })
})

describe("publishChange (the change ping)", () => {
  it("posts a team-scoped, data-free event to /publish", async () => {
    const calls: { url: string; body: unknown }[] = []
    const realtime = {
      fetch: async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return new Response(null)
      },
    } as unknown as Parameters<typeof publishChange>[0]

    await publishChange(realtime, "TEAM1", "members")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/publish")
    expect(calls[0].body).toEqual({
      channel: "team:TEAM1",
      event: { resource: "members" },
    })
  })

  it("never throws — a live-layer hiccup can't break the write it describes", async () => {
    const realtime = {
      fetch: async () => {
        throw new Error("realtime down")
      },
    } as unknown as Parameters<typeof publishChange>[0]
    await expect(publishChange(realtime, "T", "members")).resolves.toBeUndefined()
  })
})
