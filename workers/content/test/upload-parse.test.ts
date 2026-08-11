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

import { isInlineSafeUpload, uploadLengthProblem } from "../../../shared/workers/image"

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
  const req = (headers: Record<string, string>) =>
    new Request("https://app.example/api/content/learning/upload", { method: "POST", headers })

  it("passes a declared size under the cap", () => {
    expect(uploadLengthProblem(req({ "Content-Length": "1000" }), 25_000)).toBeNull()
  })

  it("refuses a declared size over the cap BEFORE a byte moves", () => {
    expect(uploadLengthProblem(req({ "Content-Length": "99999" }), 25_000)).toBe("too_large")
  })

  it("allows a body exactly ON the cap", () => {
    expect(uploadLengthProblem(req({ "Content-Length": "25000" }), 25_000)).toBeNull()
  })

  it("REFUSES a body whose size it cannot know", () => {
    // A chunked upload has no Content-Length, so nothing bounds it. Guessing
    // "probably fine" here would hand R2 an unbounded stream, which is exactly
    // what the cap exists to prevent — and R2 would refuse it anyway, as a 500
    // rather than as an answer the caller can act on.
    expect(uploadLengthProblem(req({}), 25_000)).toBe("unknown")
    expect(uploadLengthProblem(req({ "Content-Length": "0" }), 25_000)).toBe("unknown")
    expect(uploadLengthProblem(req({ "Content-Length": "banana" }), 25_000)).toBe("unknown")
    expect(uploadLengthProblem(req({ "Content-Length": "-5" }), 25_000)).toBe("unknown")
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
      fn.includes("env.LEARNING_MEDIA.put(key, request.body, "),
      "the body must reach R2 UNWRAPPED — a transform replaces a known-length stream with an unknown-length one, and R2 refuses those outright"
    ).toBe(true)
    expect(
      /put\(key, \w+\(request\.body/.test(fn),
      "nothing may wrap request.body on the way to R2 — that is the bug this door already had once"
    ).toBe(false)
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
