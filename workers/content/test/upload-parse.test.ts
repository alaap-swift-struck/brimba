// THE UPLOAD BOUNDARY — what bytes, and what MIME, are allowed to reach R2.
//
// The gateway serves these files back INLINE on the app's own origin, so the
// mime allowlist is a stored-XSS boundary, not a tidiness rule: a text/html or
// image/svg+xml upload would be a page running JavaScript in the app origin,
// riding the session of anyone who opened it.
//
// The upload used to arrive base64-encoded inside a JSON body and be parsed by
// `parseUploadDataUrl`. It now STREAMS — the file is the request body — because
// encoding it made the worker hold three copies of it, each a third larger than
// the file, inside a 128 MB isolate. The two guarantees that mattered are
// unchanged and are re-locked here against the new shape: the SAME allowlist,
// and a size cap that a lying `Content-Length` cannot get past.

import { describe, expect, it } from "vitest"

import { cappedStream, isInlineSafeUpload } from "../../../shared/workers/image"

/** A body of `chunks` × `size` bytes, delivered in pieces like a real upload. */
function bodyOf(chunks: number, size: number): ReadableStream {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent++ >= chunks) return controller.close()
      controller.enqueue(new Uint8Array(size))
    },
  })
}

async function drain(stream: ReadableStream): Promise<number> {
  const reader = stream.getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return total
    total += (value as Uint8Array).byteLength
  }
}

describe("the mime allowlist", () => {
  it("accepts the media a learning attachment actually is", () => {
    for (const t of [
      "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif",
      "video/mp4", "video/webm", "audio/mpeg", "application/pdf",
    ]) {
      expect(isInlineSafeUpload(t), `${t} should be storable`).toBe(true)
    }
  })

  it("refuses script-capable types — the stored-XSS boundary", () => {
    for (const t of [
      "text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript",
      "application/javascript", "text/xml",
    ]) {
      expect(isInlineSafeUpload(t), `${t} must never be served back on the app origin`).toBe(false)
    }
  })

  it("cannot be fooled by a safe type with something appended", () => {
    // The regex is anchored at both ends. Without the end anchor,
    // "image/png;charset=..;x=text/html" or "image/png.html" would slip through.
    expect(isInlineSafeUpload("image/png.html")).toBe(false)
    expect(isInlineSafeUpload("image/png,text/html")).toBe(false)
    expect(isInlineSafeUpload("text/html+image/png")).toBe(false)
    expect(isInlineSafeUpload("")).toBe(false)
  })
})

describe("the size cap", () => {
  it("passes a body under the cap through byte-for-byte", async () => {
    expect(await drain(cappedStream(bodyOf(4, 1000), 10_000))).toBe(4000)
  })

  it("fails a body that goes OVER, however it was declared", async () => {
    // This is the check that matters. `Content-Length` is client-supplied, so a
    // caller can promise 1 KB and send 100 MB; only counting the bytes as they
    // arrive catches that. Nothing reaches R2 after the cap is crossed.
    await expect(drain(cappedStream(bodyOf(100, 1000), 5_000))).rejects.toThrow()
  })

  it("fails on the chunk that crosses the line, not at the end", async () => {
    // A cap only checked after the whole body arrived would mean holding the
    // whole body — which is the thing this replaced.
    let delivered = 0
    const body = new ReadableStream({
      pull(controller) {
        // Bounded, though it far exceeds the cap. An endless source would let a
        // BROKEN cap hang this test instead of failing it, and a check that
        // hangs under sabotage is no better than one that stays green.
        if (delivered++ >= 50) return controller.close()
        controller.enqueue(new Uint8Array(1000))
      },
    })
    await expect(drain(cappedStream(body, 2_500))).rejects.toThrow()
    expect(delivered, "the source must be stopped, not read to completion").toBeLessThan(10)
  })

  it("allows a body exactly ON the cap", async () => {
    expect(await drain(cappedStream(bodyOf(5, 1000), 5_000))).toBe(5000)
  })
})

describe("the streaming door", () => {
  it("does not buffer the file", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const src = readFileSync(
      join(__dirname, "..", "src", "routes", "learning.ts"),
      "utf8"
    )
    const fn = src.slice(src.indexOf("export async function postUploadLearningFile"))
    expect(
      fn.includes("cappedStream(request.body, MAX_UPLOAD_BYTES)"),
      "the body must go to R2 as a stream — reading it first reintroduces the isolate ceiling"
    ).toBe(true)
    expect(
      /await request\.(json|text|arrayBuffer|blob|formData)\(\)/.test(fn.slice(0, fn.indexOf("LEARNING_MEDIA.put"))),
      "reading the body into memory before the put is exactly what was removed"
    ).toBe(false)
    expect(
      fn.includes("isInlineSafeUpload(contentType)"),
      "the streaming door must apply the same allowlist the buffered one did"
    ).toBe(true)
  })
})
