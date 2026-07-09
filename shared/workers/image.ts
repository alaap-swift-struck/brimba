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

/** General data-URL parser for learning attachments: base64-decodes, enforces a
 * caller-supplied byte cap, and — critically — accepts ONLY an inline-safe media mime
 * (`INLINE_SAFE_UPLOAD`; never text/html or svg). Returns null if the input isn't a
 * well-formed base64 data URL, the mime isn't allow-listed, or the decoded payload is
 * over `maxBytes`. (parseDataUrl above is the tighter images-only sibling.) */
export function parseUploadDataUrl(
  dataUrl: unknown,
  maxBytes: number
): { contentType: string; bytes: Uint8Array } | null {
  if (typeof dataUrl !== "string") return null
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  if (!INLINE_SAFE_UPLOAD.test(match[1])) return null // reject script-capable types (XSS)
  try {
    const binary = atob(match[2])
    if (binary.length > maxBytes) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { contentType: match[1], bytes }
  } catch {
    return null
  }
}
