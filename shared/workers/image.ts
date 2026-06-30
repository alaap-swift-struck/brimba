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

/** General data-URL parser for learning attachments: accepts ANY mime type
 * (image/*, video/*, audio/*, application/pdf, …), base64-decodes, and enforces
 * a caller-supplied byte cap. Returns null if the input isn't a well-formed
 * base64 data URL or the decoded payload is over `maxBytes`. Unlike parseDataUrl
 * (images only, fixed cap) the mime is whatever the client declared — the
 * gateway serves it back verbatim, so callers cap the size at the boundary. */
export function parseUploadDataUrl(
  dataUrl: unknown,
  maxBytes: number
): { contentType: string; bytes: Uint8Array } | null {
  if (typeof dataUrl !== "string") return null
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
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
