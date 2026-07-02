// The streaming co-pilot's WIRE + PARSE contract, unit-tested with no network:
//  • sseFrame / terminalEvent — the SSE serialization the route writes (each event →
//    exactly `data: {...}\n\n`; a done outcome → `final`, a pause → `confirm`), and
//  • ClaudeModel's SSE PARSING — parseAnthropicStream fed a hand-built Messages stream
//    (text_delta chunks + a tool_use assembled from input_json_delta + message_stop):
//    onText must receive each text delta, and the returned ModelReply must carry the
//    joined text + the fully-parsed tool call.

import { describe, expect, it } from "vitest"

import { sseFrame, terminalEvent } from "../src/routes/agent"
import { parseAnthropicStream } from "../src/lib/model"
import type { ChatOutcome, StreamEvent } from "../../../shared/types"
import type { AgentQuota } from "../../../shared/types"

const QUOTA: AgentQuota = {
  freeDaily: 25,
  freeUsedToday: 1,
  freeRemaining: 24,
  creditBalance: 0,
  remaining: 24,
  blocked: false,
}

/** A ReadableStream of one or more UTF-8 chunks — mimics the fetch Response body the
 * parser reads, and (by splitting a frame across chunks) proves the buffer stitches
 * partial frames back together. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

describe("sseFrame: each event serializes to one data: frame", () => {
  it("wraps every event shape as `data: <json>\\n\\n`", () => {
    const cases: StreamEvent[] = [
      { t: "text", d: "hello" },
      { t: "step_start", tool: "invite_member", summary: "Invite a@b.com as role r1" },
      { t: "step_end", tool: "invite_member", ok: true, summary: "Invite a@b.com as role r1" },
      // A failed step carries the door's short reason so the red row can say WHY.
      {
        t: "step_end",
        tool: "create_role",
        ok: false,
        summary: 'Create the role "Sub admin"',
        error: 'You don\'t have permission to do that — your role is missing the "create" right on member roles.',
      },
      { t: "confirm", calls: [{ name: "remove_member", input: { userId: "u1" }, summary: "Remove Jane Doe" }], text: "About to remove" },
      { t: "error", message: "safe message" },
    ]
    for (const ev of cases) {
      const frame = sseFrame(ev)
      expect(frame.startsWith("data: ")).toBe(true)
      expect(frame.endsWith("\n\n")).toBe(true)
      // The payload is exactly the JSON of the event (round-trips cleanly).
      expect(JSON.parse(frame.slice("data: ".length, -2))).toEqual(ev)
    }
  })

  it("keeps the terse keys stable (t/d, no extra whitespace between frames)", () => {
    expect(sseFrame({ t: "text", d: "hi" })).toBe('data: {"t":"text","d":"hi"}\n\n')
  })
})

describe("terminalEvent: a ChatOutcome becomes the single terminal event", () => {
  it("a finished outcome → final (carrying the whole outcome)", () => {
    const outcome: ChatOutcome = { done: true, threadId: "t1", reply: "All set.", quota: QUOTA }
    expect(terminalEvent(outcome)).toEqual({ t: "final", outcome })
  })

  it("a pause-for-confirm outcome → confirm (carrying the pending calls + lead-in)", () => {
    const outcome: ChatOutcome = {
      done: false,
      threadId: "t1",
      assistantText: "I'll remove them once you confirm.",
      needsConfirm: [{ name: "remove_member", input: { userId: "u1" }, summary: "Remove Jane Doe" }],
      quota: QUOTA,
    }
    const ev = terminalEvent(outcome)
    expect(ev).toEqual({
      t: "confirm",
      calls: outcome.needsConfirm,
      text: "I'll remove them once you confirm.",
    })
  })

  it("a confirm with empty lead-in text drops the text key", () => {
    const outcome: ChatOutcome = {
      done: false,
      threadId: "t1",
      assistantText: "",
      needsConfirm: [{ name: "revoke_invite", input: { inviteId: "i1" }, summary: "Revoke the invite for a@b.com" }],
      quota: QUOTA,
    }
    expect(terminalEvent(outcome)).toEqual({ t: "confirm", calls: outcome.needsConfirm })
  })
})

describe("parseAnthropicStream: parses the Messages SSE into text + tool calls", () => {
  // A realistic (trimmed) Anthropic Messages stream: two text deltas, then a tool_use
  // block whose JSON input arrives across two input_json_delta chunks, then message_stop.
  const frames = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Invit"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ing them now."}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_9","name":"invite_member","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"email\\":\\"a@b.com\\","}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"roleId\\":\\"r1\\"}"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ]

  it("fires onText for each text delta and returns the joined text + parsed tool call", async () => {
    const deltas: string[] = []
    const reply = await parseAnthropicStream(bodyOf(frames.join("")), (d) => deltas.push(d))

    // Text deltas arrived in order, and only the text (not the JSON) was streamed.
    expect(deltas).toEqual(["Invit", "ing them now."])
    expect(reply.text).toBe("Inviting them now.")

    // The tool_use block's input JSON — split across two input_json_delta chunks — was
    // stitched back together and parsed into the real object.
    expect(reply.toolCalls).toHaveLength(1)
    expect(reply.toolCalls[0]).toEqual({
      id: "toolu_9",
      name: "invite_member",
      input: { email: "a@b.com", roleId: "r1" },
    })
  })

  it("stitches a frame split across two body chunks (partial-frame buffering)", async () => {
    // Break the stream mid-frame to prove the decoder buffers until the `\n\n` boundary.
    const whole = frames.join("")
    const cut = Math.floor(whole.length / 2)
    const deltas: string[] = []
    const reply = await parseAnthropicStream(bodyOf(whole.slice(0, cut), whole.slice(cut)), (d) =>
      deltas.push(d)
    )
    expect(reply.text).toBe("Inviting them now.")
    expect(reply.toolCalls[0].input).toEqual({ email: "a@b.com", roleId: "r1" })
  })

  it("a text-only turn yields no tool calls", async () => {
    const textOnly = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello there."}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join("")
    const deltas: string[] = []
    const reply = await parseAnthropicStream(bodyOf(textOnly), (d) => deltas.push(d))
    expect(deltas).toEqual(["Hello there."])
    expect(reply.text).toBe("Hello there.")
    expect(reply.toolCalls).toEqual([])
  })
})
