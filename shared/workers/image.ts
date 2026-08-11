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
 * Pass a body through unchanged, failing the stream the moment it exceeds a cap.
 *
 * Why this exists: an upload used to arrive as base64 inside a JSON body, which
 * meant the worker held the whole file THREE times — the JSON string, the base64
 * substring, and the decoded bytes — and base64 is a third larger than what it
 * encodes. A 25 MB video was therefore ~100 MB of a 128 MB isolate, and the
 * failure mode at the edge is the isolate being killed, which reads to the user
 * as "it just didn't work".
 *
 * Streaming instead means memory is one chunk, whatever the file size. The cap
 * still has to be enforced, and it cannot be enforced from `Content-Length`
 * alone — a client is free to declare one size and send another. So the bytes
 * are counted as they pass.
 */
export function cappedStream(body: ReadableStream, maxBytes: number): ReadableStream {
  let seen = 0
  return body.pipeThrough(
    new TransformStream({
      transform(chunk: Uint8Array, controller) {
        seen += chunk.byteLength
        if (seen > maxBytes) {
          // Erroring the stream aborts the R2 write in progress. R2 puts are
          // atomic, so an aborted one leaves no partial object behind.
          controller.error(new Error("upload_too_large"))
          return
        }
        controller.enqueue(chunk)
      },
    })
  )
}


