// Onboarding / profile updates: first name, last name, optional photo.
// Photos arrive as a data URL (the web app downsizes them first), land in R2,
// and are served by the gateway at /media/users/<id>.

import { MAX_IMAGE_BYTES, parseDataUrl } from "../../../../shared/workers/image"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { toSessionUser, type UserRow } from "./users"

const MAX_NAME_LENGTH = 60

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

  // Snapshot what actually changed, BEFORE the write, so we only log real edits
  // (not the initial onboarding fill-in, where there's nothing to "change").
  const wasOnboarded = user.onboarding_completed_at != null
  const nameChanged =
    firstName !== (user.first_name ?? "") || lastName !== (user.last_name ?? "")
  const photoChanged = Boolean(input.imageDataUrl)

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

  // Account-activity (best-effort): record name / photo edits to the person's
  // own history. Only once they're past onboarding — the first fill-in isn't a
  // "change". Email changes are logged in the email-change flow.
  if (wasOnboarded) {
    if (nameChanged)
      await logAccountActivity(env, user.id, {
        type: "name_changed",
        description: `Changed your name to ${firstName} ${lastName}`,
      })
    if (photoChanged)
      await logAccountActivity(env, user.id, {
        type: "photo_changed",
        description: "Updated your profile photo",
      })
  }

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}
