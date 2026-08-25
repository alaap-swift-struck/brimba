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

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import { stripComments } from "../../../shared/test/source"
import { publishChange } from "../../../shared/workers/realtime"

/** The seam's source, comments removed — the parameter list below is read out of
 * it, and a JSDoc block naming a type would otherwise be read as a parameter. */
const SEAM = stripComments(
  readFileSync(join(__dirname, "..", "..", "..", "shared", "workers", "realtime.ts"), "utf8")
)

/** The DECLARED parameters of one exported publisher, one per entry. */
function paramsOf(fn: string): string[] {
  const at = SEAM.indexOf(`export async function ${fn}(`)
  if (at < 0) return [`${fn} is not declared in the seam`]
  const open = SEAM.indexOf("(", at)
  return SEAM.slice(open + 1, SEAM.indexOf(")", open))
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

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
    // THIS USED TO BE `publishChange.length <= 5`, which is a PROXY for the thing
    // that matters and not the thing itself. The invariant is that no parameter
    // can carry row content; a count was standing in for "and here is what each
    // one is". It did its job — it went red the moment a sixth parameter arrived
    // — and the honest repair is to say what the six are rather than to raise the
    // number, because a raised number would have accepted a seventh silently.
    //
    // So the parameter list is PINNED. Every entry is a scalar the client already
    // knows or a callback that cannot reach the wire, and adding anything at all
    // breaks this test by name and gets reviewed.
    expect(
      paramsOf("publishChange"),
      "a new parameter on the live seam is a security decision, not a refactor"
    ).toEqual([
      "realtime: Fetcher", //          the binding — no data
      "teamId: string", //             addresses the channel; the subscriber is already on it
      "resource: string", //           a module tag, e.g. "help"
      "id?: string", //                the row id, which the client re-pulls through the gated door
      'op?: ChangeEvent["op"]', //     add | edit | remove | session — a closed set
      "record?: OutboundRecorder", //  a callback INTO the error store; nothing it takes goes out
    ])
    // And the same for the other two doors out, so a payload cannot be added to
    // the quiet one instead.
    expect(paramsOf("publishUserChange")).toEqual([
      "realtime: Fetcher",
      "userId: string",
      "resource: string",
      "id?: string",
      'op?: ChangeEvent["op"]',
      "record?: OutboundRecorder",
    ])
    expect(paramsOf("publishSignOut")).toEqual([
      "realtime: Fetcher",
      "userId: string",
      "record?: OutboundRecorder",
    ])
  })

  it("the recorder cannot put anything on the wire", async () => {
    // The pinned list says `record` is a callback into the error store. This is
    // the behavioural half: supplying one must not change a single byte of what
    // is broadcast, or the parameter would be a payload channel after all.
    const bodies: string[] = []
    const realtime = {
      fetch: vi.fn(async (_url: string, init?: { body?: string }) => {
        bodies.push(init?.body ?? "")
        return new Response("{}", { status: 200 })
      }),
    }
    await publishChange(realtime as never, "team-1", "help", "row-9", "edit")
    await publishChange(realtime as never, "team-1", "help", "row-9", "edit", () => {
      throw new Error("a recorder must never influence the ping")
    })
    expect(bodies[1], "the ping is identical with and without a recorder").toBe(bodies[0])
  })
})
