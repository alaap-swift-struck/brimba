// Learning routes: list the team's how-to items (with the caller's own progress),
// create / edit / (de)activate an item, mark one done for the caller, and the
// curator progress dashboard. Mirrors tenancy's roles routes exactly: open with
// the shared gated opening (teamContext + requireRight on the `learning` module
// + defensive body read), parse + 400 on bad input, then publishChange (row id +
// op) so open lists patch just that row. Locked module rules (pick-or-create
// category, deactivate-not-delete) live in lib/learning.

import { fail, json } from "../../../../shared/workers/http"
import { boundExport, csvResponse, toCsv } from "../../../../shared/workers/csv"
import { EXPORT_HARD_CAP } from "../../../../shared/workers/limits"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { isInlineSafeUpload, uploadLengthProblem } from "../../../../shared/workers/image"
import { ulid } from "../../../../shared/workers/id"
import { gated, gatedBody } from "../../../../shared/workers/route"
import { requireIdList } from "../lib/bulk"
import {
  bulkSetLearningActive,
  createLearning,
  listLearning,
  oneLearning,
  listProgress,
  setLearningActive,
  setLearningDone,
  updateLearning,
  listLearningForExport,
  type LearningInput,
  countLearning,
} from "../lib/learning"
import type { Env } from "../env"

export async function getLearning(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  const items = await listLearning(cfg, guard)
  const id = new URL(request.url).searchParams.get("id") // ?id= → one item
  // R16: the exact server total rides every list response (badges never use rows.length).
  return json({ learning: id ? items.filter((l) => l.id === id) : items, total: await countLearning(cfg, guard) })
}

/** GET /api/content/learning/export — the team's articles as a CSV download.
 * The cross-cutting rule: EXPORT NEEDS READ (import needs create). Team-bound by
 * construction — teamContext resolves the caller's own team database and rows come
 * only from there. Columns lead with the import format (title, category,
 * description, contentType, contentLink, body) so an exported file round-trips
 * straight back through the CSV importer; `active` rides along as information. */
export async function getLearningExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  const all = await listLearningForExport(cfg, guard)
  // R14 says cap the read; honesty says SAY when the cap bit. A silent 10,000
  // of 250,000 is a file that looks complete and is not.
  const { rows: items, truncated } = await boundExport(all, EXPORT_HARD_CAP, () => countLearning(cfg, guard))
  const csv = toCsv(
    [
      "title", "category", "description", "contentType", "contentLink", "body",
      "sequence", "required", "active",
      "created_at", "created_by", "updated_at", "updated_by", "deactivated_at", "deactivated_by",
    ],
    items.map((l) => [
      l.content_title, l.category, l.content_description, l.content_type, l.content_link, l.content_body,
      l.sequence, l.is_required === 1, l.deactivated_at == null,
      l.created_at, l.creator_name, l.updated_at, l.editor_name, l.deactivated_at, l.deactivator_name,
    ])
  )
  return csvResponse("learning.csv", csv, truncated)
}

export async function postCreateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<LearningInput>(request, env, "learning", "create")
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createLearning(cfg, guard, actor, body)
  // Row-level: carry the new item's id so open learning lists patch just that row.
  await publishChange(env.REALTIME, guard.teamId, "learning", id, "add")
  // R21: the CREATED ROW, not the collection. Shipping the whole list back to add
  // one row contradicts row-level live-sync (CACHING rule 3) and the paging rule,
  // and left the caller unable to learn the new id without a follow-up search.
  return json({ created: await oneLearning(cfg, guard, id), total: await countLearning(cfg, guard) })
}

export async function postUpdateLearning(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<LearningInput & { id?: string; expectedVersion?: string }>(request, env, "learning", "edit")
  if (!body.id) return fail(400, "invalid_input", "id and title are required.")
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateLearning(cfg, guard, actor, body.id, body, body.expectedVersion)
  await publishChange(env.REALTIME, guard.teamId, "learning", body.id)
  // R23: the AFFECTED ROW, never the collection — see RULES.md.
  return json({ updated: await oneLearning(cfg, guard, body.id), total: await countLearning(cfg, guard) })
}

/** Deactivate / reactivate a learning item — never deleted (progress survives).
 * Gated by learning:delete (deactivate is our "delete" in the deactivate model). */
export async function postSetLearningActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: string; active?: boolean }>(request, env, "learning", "delete")
  if (!body.id || typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  // R17: no-op repeat → no ping, no duplicate history (see setLearningActive).
  const changed = await setLearningActive(cfg, guard, actor, body.id, body.active)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "learning", body.id)
  // R23: the AFFECTED ROW, never the collection — see RULES.md.
  return json({ updated: await oneLearning(cfg, guard, body.id), total: await countLearning(cfg, guard) })
}

/** Deactivate / reactivate MANY learning items in one call (the bulk sibling of
 * the single active endpoint). Gated ONCE by the SAME right (learning:delete),
 * validates ids at the boundary (non-empty array of non-empty strings, cap 500 →
 * clean 400), applies the same per-row change to every matching item, and — the
 * live-sync law — publishes ONE row-level ping per CHANGED row (patch that row,
 * never refetch the list). Returns { updated, skipped }. */
export async function postBulkSetLearningActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ ids?: unknown; active?: unknown }>(request, env, "learning", "delete")
  const ids = requireIdList(body.ids)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "active must be true or false.")
  const { changed, skipped } = await bulkSetLearningActive(cfg, guard, actor, ids, body.active)
  // Row-level live-sync: one ping per changed item (same row shape the single
  // endpoint patches) — no list refetch.
  for (const id of changed) await publishChange(env.REALTIME, guard.teamId, "learning", id)
  return json({ updated: changed.length, skipped })
}

/** Mark an item done / not-done for the caller (their OWN progress — any reader
 * may record their own). Publishes an "edit" on the row so open lists refresh the
 * viewer's done badge. */
export async function postLearningDone(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ id?: string; done?: boolean }>(request, env, "learning", "read")
  if (!body.id || typeof body.done !== "boolean")
    return fail(400, "invalid_input", "id and done are required.")
  await setLearningDone(cfg, guard, body.id, body.done)
  await publishChange(env.REALTIME, guard.teamId, "learning", body.id, "edit")
  return json({ ok: true })
}

/** Curator dashboard: every member's done state for the team's items. Gated on
 * learning:read for now (the curator view shares the read right). */
export async function getLearningProgress(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "learning", "read")
  return json({ progress: await listProgress(cfg, guard) })
}

/** Local file upload for a learning item (images + short clips, cap 25 MB).
 * Stores the bytes in the team's learning-media bucket under <teamId>/<ulid> and
 * hands back the gateway URL the editor pastes into the article. HOUSEKEEPING:
 * it writes a file, NOT a record — there's no row to patch, so nothing to
 * broadcast (the create/edit that references the URL pings its own row). Gated
 * by learning:create.
 *
 * THE BYTES ARE STREAMED, NOT BUFFERED. This used to take a base64 data URL in a
 * JSON body, which held the file three times over in a 128 MB isolate — the JSON
 * string, the base64 substring, and the decoded array — with base64 a third
 * larger than the file itself. 25 MB of video was most of the isolate, and
 * running out of one does not produce an error a user can act on; it just dies.
 * Now the request body goes straight to R2 through a counter, so memory is one
 * chunk regardless of size. (Scaling review, 2026-08-11.)
 *
 * The mime comes from the Content-Type header and goes through the SAME
 * allowlist the data-URL path used — this file is served back inline on the app
 * origin, so a script-capable type would be stored XSS. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export async function postUploadLearningFile(request: Request, env: Env): Promise<Response> {
  const { guard } = await gated(request, env, "learning", "create")

  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim()
  if (!isInlineSafeUpload(contentType))
    return fail(400, "invalid_input", "That file type isn't one we can store.")
  if (!request.body) return fail(400, "invalid_input", "No file was sent.")

  const problem = uploadLengthProblem(request, MAX_UPLOAD_BYTES)
  if (problem === "too_large")
    return fail(413, "file_too_large", "That file is over the 25 MB limit.")
  if (problem === "unknown")
    return fail(411, "length_required", "We couldn't tell how big that file is. Try uploading it again.")

  const id = ulid()
  const key = `${guard.teamId}/${id}`
  // The request body goes to R2 UNTOUCHED. Wrapping it in a transform (to count
  // bytes, say) replaces a known-length stream with an unknown-length one, and
  // R2 refuses those outright — see uploadLengthProblem for the whole story.
  await env.LEARNING_MEDIA.put(key, request.body, { httpMetadata: { contentType } })

  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({
    url: `/media/learning/${guard.teamId}/${id}?v=${Date.now()}`,
    contentType,
  })
}
