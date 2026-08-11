// Shared image helper: turn a base64 data URL (the web app downsizes images
// before upload) into bytes + content type for R2. Pure + web-safe (atob is a
// browser/worker global). Used for profile photos AND team logos — one copy.

export const MAX_IMAGE_BYTES = 2_500_000 // ~2.5MB after the client-side downsize

/** data:image/png;base64,AAAA... -> bytes + content type, or null if invalid. */
export function parseDataUrl(
  dataUrl: string
): { contentType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { contentType: match[1], bytes }
  } catch {
    return null
  }
}

// Uploaded media is served BACK by the gateway with the declared content type, on
// the SAME origin as the app + /api. So the mime MUST be inline-safe: a script-capable
// type (text/html, application/xhtml+xml, image/svg+xml) would be stored XSS — a member
// could upload a page that runs JS in the app origin and rides any viewer's session.
// This allowlist is the boundary that stops it. Raster images, short A/V clips, and PDFs
// only — exactly what a learning attachment is.
const INLINE_SAFE_UPLOAD =
  /^(image\/(png|jpe?g|webp|gif|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp4|webm|ogg)|application\/pdf)$/

/** Is this a mime we are willing to store and serve back inline? The allowlist
 * above, exposed so a STREAMING upload (which never sees a data URL) applies
 * exactly the same rule as the buffered one. Two upload paths with two different
 * ideas of "safe" is how a stored-XSS hole gets reopened. */
export function isInlineSafeUpload(contentType: string): boolean {
  return INLINE_SAFE_UPLOAD.test(contentType)
}

/**
 * THE SIZE CAP ON A STREAMED UPLOAD, and why it is a header check.
 *
 * The first attempt at this piped the body through a counting TransformStream
 * so the cap could be enforced on the bytes themselves rather than on a
 * client-supplied `Content-Length`. Every unit test passed and every upload
 * failed, because R2 refuses a stream whose length it cannot know:
 *
 *   "Provided readable stream must have a known length
 *    (request/response body or readable half of FixedLengthStream)"
 *
 * `request.body` HAS a known length — piping it through a transform is what
 * throws that away. So the counter was not extra safety, it was the bug.
 *
 * Content-Length is safe to trust HERE, which is the part worth stating because
 * it is normally not: the runtime frames the incoming body by that header, so a
 * caller declaring 1 KB cannot then deliver 100 MB — the extra bytes are not
 * part of the request at all. What a caller CAN do is omit the header entirely
 * (a chunked body), and that is refused rather than guessed at: an unbounded
 * body is exactly what the cap exists to prevent.
 */
export function uploadLengthProblem(request: Request, maxBytes: number): "unknown" | "too_large" | null {
  const header = request.headers.get("Content-Length")
  if (header === null) return "unknown"
  const declared = Number(header)
  if (!Number.isFinite(declared) || declared <= 0) return "unknown"
  return declared > maxBytes ? "too_large" : null
}
