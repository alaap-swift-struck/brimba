// Onboarding / profile updates: first name, last name, optional photo.
// Photos arrive as a data URL (the web app downsizes them first), land in R2,
// and are served by the gateway at /media/users/<id>.

import type { Env } from "../env"
import { toSessionUser, type UserRow } from "./users"

const MAX_NAME_LENGTH = 60
const MAX_IMAGE_BYTES = 2_500_000 // ~2.5MB after the client-side downsize

export type ProfileInput = {
  firstName?: string
  lastName?: string
  imageDataUrl?: string
}

export async function updateProfile(
  env: Env,
  user: UserRow,
  input: ProfileInput
): Promise<{ user: ReturnType<typeof toSessionUser> } | { error: string; message: string }> {
  const firstName = (input.firstName ?? "").trim()
  const lastName = (input.lastName ?? "").trim()
  if (!firstName || !lastName)
    return { error: "name_required", message: "First and last name are required." }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH)
    return { error: "name_too_long", message: "That name is too long." }

  let imageUrl = user.image_url
  if (input.imageDataUrl) {
    const parsed = parseDataUrl(input.imageDataUrl)
    if (!parsed)
      return { error: "bad_image", message: "That image format isn't supported." }
    if (parsed.bytes.byteLength > MAX_IMAGE_BYTES)
      return { error: "image_too_large", message: "That image is too large." }

    const key = `users/${user.id}`
    await env.MEDIA.put(key, parsed.bytes, {
      httpMetadata: { contentType: parsed.contentType },
    })
    // ?v= busts caches when the photo changes; the gateway ignores the query.
    imageUrl = `/media/${key}?v=${Date.now()}`
  }

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE users SET
       first_name = ?, last_name = ?, image_url = ?,
       onboarding_completed_at = COALESCE(onboarding_completed_at, ?),
       updated_at = ?
     WHERE id = ?`
  )
    .bind(firstName, lastName, imageUrl, now, now, user.id)
    .run()

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}

/** data:image/png;base64,AAAA... -> bytes + content type. */
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
