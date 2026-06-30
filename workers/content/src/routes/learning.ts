// Learning routes: list the team's how-to items (with the caller's own progress),
// create / edit / (de)activate an item, mark one done for the caller, and the
// curator progress dashboard. Mirrors tenancy's roles routes exactly: open with
// teamContext, gate with requireRight on the `learning` module, parse + 400 on
// bad input, then publishChange (row id + op) so open lists patch just that row.
// Locked module rules (pick-or-create category, deactivate-not-delete) live in
// lib/learning.

import { fail, json } from "../../../../shared/workers/http"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { parseUploadDataUrl } from "../../../../shared/workers/image"
import { ulid } from "../../../../shared/workers/id"
import { requireRight, teamContext } from "../../../../shared/workers/gating"
import {
  createLearning,
  listLearning,
  listProgress,
  setLearningActive,
  setLearningDone,
  updateLearning,
  type LearningInput,
} from "../lib/learning"
import type { Env } from "../env"

export async function getLearning(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "read")
  const items = await listLearning(cfg, guard)
  const id = new URL(request.url).searchParams.get("id") // ?id= → one item
  return json({ learning: id ? items.filter((l) => l.id === id) : items })
}

export async function postCreateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "create")
  const body = (await request.json().catch(() => ({}))) as LearningInput
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createLearning(cfg, guard, actor, body)
  // Row-level: carry the new item's id so open learning lists patch just that row.
  await publishChange(env.REALTIME, guard.teamId, "learning", id, "add")
  return json({ learning: await listLearning(cfg, guard) })
}

export async function postUpdateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "edit")
  const body = (await request.json().catch(() => ({}))) as LearningInput & { id?: string }
  if (!body.id) return fail(400, "invalid_input", "id and title are required.")
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateLearning(cfg, guard, actor, body.id, body)
  await publishChange(env.REALTIME, guard.teamId, "learning", body.id)
  return json({ learning: await listLearning(cfg, guard) })
}

/** Deactivate / reactivate a learning item — never deleted (progress survives).
 * Gated by learning:delete (deactivate is our "delete" in the deactivate model). */
export async function postSetLearningActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "delete")
  const body = (await request.json().catch(() => ({}))) as { id?: string; active?: boolean }
  if (!body.id || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  await setLearningActive(cfg, guard, actor, body.id, body.active)
  await publishChange(env.REALTIME, guard.teamId, "learning", body.id)
  return json({ learning: await listLearning(cfg, guard) })
}

/** Mark an item done / not-done for the caller (their OWN progress — any reader
 * may record their own). Publishes an "edit" on the row so open lists refresh the
 * viewer's done badge. */
export async function postLearningDone(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "read")
  const body = (await request.json().catch(() => ({}))) as { id?: string; done?: boolean }
  if (!body.id || typeof body.done !== "boolean")
    return fail(400, "invalid_input", "id and done are required.")
  await setLearningDone(cfg, guard, body.id, body.done)
  await publishChange(env.REALTIME, guard.teamId, "learning", body.id, "edit")
  return json({ ok: true })
}

/** Curator dashboard: every member's done state for the team's items. Gated on
 * learning:read for now (the curator view shares the read right). */
export async function getLearningProgress(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "read")
  return json({ progress: await listProgress(cfg, guard) })
}

/** Local file upload for a learning item (images + short clips, cap 25 MB) sent
 * as a base64 data URL — same JSON pattern as the profile-photo / team-logo
 * upload, not multipart. Stores the bytes in the team's learning-media bucket
 * under <teamId>/<ulid> and hands back the gateway URL the editor pastes into
 * the article. HOUSEKEEPING: it writes a file, NOT a record — there's no row to
 * patch, so nothing to broadcast (the create/edit that references the URL pings
 * its own row). Gated by learning:create. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export async function postUploadLearningFile(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "learning", "create")
  const body = (await request.json().catch(() => ({}))) as { dataUrl?: unknown }
  const parsed = parseUploadDataUrl(body.dataUrl, MAX_UPLOAD_BYTES)
  if (!parsed) return fail(400, "invalid_input", "That file isn't a supported upload (max 25 MB).")
  const id = ulid()
  const key = `${guard.teamId}/${id}`
  await env.LEARNING_MEDIA.put(key, parsed.bytes, {
    httpMetadata: { contentType: parsed.contentType },
  })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({
    url: `/media/learning/${guard.teamId}/${id}?v=${Date.now()}`,
    contentType: parsed.contentType,
  })
}
