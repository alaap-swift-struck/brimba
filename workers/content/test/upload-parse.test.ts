// parseUploadDataUrl is the upload boundary for learning files — it decides what
// bytes reach R2. It must accept inline-safe media, decode correctly, and refuse
// non-strings, malformed input, over-cap payloads, AND script-capable types (the
// stored-XSS boundary: the gateway serves these back on the app origin). These lock that.

import { describe, expect, it } from "vitest"

import { parseUploadDataUrl } from "../../../shared/workers/image"

const b64 = (s: string) => btoa(s)

describe("parseUploadDataUrl", () => {
  it("parses a valid data URL into contentType + bytes", () => {
    const out = parseUploadDataUrl(`data:image/png;base64,${b64("hello")}`, 1000)
    expect(out?.contentType).toBe("image/png")
    expect(out && new TextDecoder().decode(out.bytes)).toBe("hello")
  })

  it("accepts non-image media types (video / audio / pdf)", () => {
    expect(parseUploadDataUrl(`data:video/mp4;base64,${b64("x")}`, 1000)?.contentType).toBe("video/mp4")
    expect(parseUploadDataUrl(`data:audio/mpeg;base64,${b64("x")}`, 1000)?.contentType).toBe("audio/mpeg")
    expect(parseUploadDataUrl(`data:application/pdf;base64,${b64("x")}`, 1000)?.contentType).toBe(
      "application/pdf"
    )
  })

  it("rejects script-capable types (the stored-XSS boundary): text/html, svg, xhtml", () => {
    expect(parseUploadDataUrl(`data:text/html;base64,${b64("<script>alert(1)</script>")}`, 9999)).toBeNull()
    expect(parseUploadDataUrl(`data:image/svg+xml;base64,${b64("<svg onload=alert(1)>")}`, 9999)).toBeNull()
    expect(
      parseUploadDataUrl(`data:application/xhtml+xml;base64,${b64("<html/>")}`, 9999)
    ).toBeNull()
  })

  it("rejects a non-string", () => {
    expect(parseUploadDataUrl(123, 1000)).toBeNull()
    expect(parseUploadDataUrl(null, 1000)).toBeNull()
    expect(parseUploadDataUrl({ data: "x" }, 1000)).toBeNull()
  })

  it("rejects a malformed data URL (no base64, no mime, junk)", () => {
    expect(parseUploadDataUrl("not a data url", 1000)).toBeNull()
    expect(parseUploadDataUrl("data:image/png,plain", 1000)).toBeNull()
    expect(parseUploadDataUrl("data:;base64,xxxx", 1000)).toBeNull()
  })

  it("enforces the max-size cap (over → null, under → ok)", () => {
    const big = b64("a".repeat(2000))
    expect(parseUploadDataUrl(`data:image/png;base64,${big}`, 100)).toBeNull()
    expect(parseUploadDataUrl(`data:image/png;base64,${big}`, 5000)).not.toBeNull()
  })
})
