// A PING THAT NEVER LANDED MUST LEAVE A ROW.
//
// `publish()` is the ONE place a change ping leaves a worker (LAW R1), and it
// used to call `callService` and throw the answer away — it checked neither
// `res.ok` nor `null`. So:
//
//   • a 500 from the realtime worker was invisible. Not a row, not even a line:
//     `callService` only logs when the dependency does not answer at ALL, and a
//     500 is an answer.
//   • a no-answer (the live layer wedged, undeployed, or timing out) produced one
//     `traceError` console line and nothing else. Cloudflare keeps those about a
//     week, so the durable store with ninety days of history and a resolve
//     workflow had never heard about a publish failure. Not once.
//
// That was survivable while the caller awaited the ping. It is not now: 36 of the
// 42 publish sites moved to `ctx.waitUntil`, so the failure happens after the
// response has gone and there is nobody left to notice it at all. A wedged live
// layer is a silent outage that lasts until somebody says "my screen isn't
// updating" — which is exactly the report a stale-screen bug never generates,
// because a stale screen looks like a quiet system.
//
// The fix is the channel `proxyService` and the D1 REST door already take: an
// OPTIONAL `OutboundRecorder`, behind the same one-row-per-minute throttle. This
// file is what makes that channel real rather than plausible — it asserts a row
// arrives for both failure shapes, none arrives for a healthy ping, and the
// no-recorder path still behaves exactly as it did.

import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A FRESH MODULE REGISTRY PER TEST, and it is not tidiness.
 *
 * `recordOutbound`'s throttle map is module scope on purpose (one row per
 * (integration, kind) per minute, per isolate). Every test here publishes as the
 * same integration, so the second one in a shared registry would have its row
 * swallowed by the first one's window and read as "it recorded nothing" — a
 * false RED, or worse, a false GREEN in the mirror-image case.
 */
async function seam() {
  vi.resetModules()
  return await import("../../../shared/workers/realtime")
}

/** A recorder that just remembers what it was handed, standing in for the
 * `dbRecorder(opsDatabase(env), …)` a real worker would pass. */
function spyRecorder() {
  const rows: { place: string; message: string }[] = []
  return {
    rows,
    record: (place: string, e: unknown) =>
      void rows.push({ place, message: e instanceof Error ? e.message : String(e) }),
  }
}

/** The live layer answering with a status — including a refusal, which is an
 * ANSWER and therefore never reaches `callService`'s catch. */
const answers = (status: number) =>
  ({ fetch: async () => new Response("{}", { status }) }) as unknown as Fetcher

/** The live layer DOWN: the throw a dead or undeployed binding produces. */
const dead = {
  fetch: async () => {
    throw new TypeError("no such service")
  },
} as unknown as Fetcher

beforeEach(() => vi.restoreAllMocks())

describe("publish reads the answer instead of discarding it", () => {
  it("RECORDS a refusal from the live layer — a 500 there is silent otherwise", async () => {
    const { publishChange } = await seam()
    const sink = spyRecorder()
    await publishChange(answers(500), "T1", "members", "M1", "edit", sink.record)
    expect(
      sink.rows,
      "the realtime worker answered 500 and nothing anywhere recorded it — a publish failure has never reached error_logs"
    ).toHaveLength(1)
    expect(sink.rows[0].place, "the row must name the channel that went unheard").toContain("team:T1")
    expect(sink.rows[0].message, "and the status, or the row cannot be told from a timeout").toContain("500")
  })

  it("RECORDS a live layer that did not answer at all", async () => {
    const { publishChange } = await seam()
    const sink = spyRecorder()
    await publishChange(dead, "T2", "members", "M1", "edit", sink.record)
    expect(
      sink.rows,
      "a wedged live layer left one console line that dies within the week and nothing durable"
    ).toHaveLength(1)
    expect(sink.rows[0].message).toMatch(/upstream/)
  })

  it("records NOTHING when the ping landed", async () => {
    const { publishChange } = await seam()
    const sink = spyRecorder()
    await publishChange(answers(200), "T3", "members", "M1", "edit", sink.record)
    expect(sink.rows, "a healthy publish must not write to the error store").toEqual([])
  })

  it("covers the user channel and the sign-out ping too, not just team pings", async () => {
    const { publishUserChange } = await seam()
    const user = spyRecorder()
    await publishUserChange(answers(503), "U1", "profile", "U1", "edit", user.record)
    expect(user.rows, "an identity-channel ping fails the same way").toHaveLength(1)
    expect(user.rows[0].place).toContain("user:U1")

    const { publishSignOut } = await seam()
    const out = spyRecorder()
    await publishSignOut(dead, "U2", out.record)
    expect(
      out.rows,
      "a forced sign-out that never reached the other devices is the one worth knowing about"
    ).toHaveLength(1)
  })

  it("still swallows the failure — recording must not turn a live hiccup into a failed write", async () => {
    // LAW R1's contract: the ping is best-effort and a live-layer fault must never
    // break the write it describes. Adding a recorder must not change that, and a
    // recorder that itself throws must not either.
    const { publishChange } = await seam()
    const angry = () => {
      throw new Error("the error store is down too")
    }
    await expect(publishChange(dead, "T4", "members", "M1", "edit", angry)).resolves.toBeUndefined()
    await expect(publishChange(answers(500), "T4", "members", "M1", "edit", angry)).resolves.toBeUndefined()
  })
})

describe("the no-recorder path is unchanged", () => {
  it("publishes, and asks for nothing, when no channel is supplied", async () => {
    // Most of the 42 call sites pass no recorder. They must behave exactly as they
    // did: send the ping, swallow whatever comes back, never throw.
    const { publishChange, publishUserChange, publishSignOut } = await seam()
    for (const binding of [answers(200), answers(500), dead]) {
      await expect(publishChange(binding, "T5", "members", "M1", "edit")).resolves.toBeUndefined()
      await expect(publishUserChange(binding, "U5", "profile", "U5", "edit")).resolves.toBeUndefined()
      await expect(publishSignOut(binding, "U5")).resolves.toBeUndefined()
    }
  })

  it("sends exactly the body the realtime worker parses, once", async () => {
    const { publishChange } = await seam()
    const sent: { url: string; body: unknown }[] = []
    const spy = {
      fetch: async (url: string, init?: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
        return new Response("{}", { status: 200 })
      },
    } as unknown as Fetcher
    await publishChange(spy, "T6", "invites", "I1", "edit")
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe("https://realtime/publish")
    expect(sent[0].body).toEqual({
      channel: "team:T6",
      event: { resource: "invites", id: "I1", op: "edit" },
    })
  })
})
