// Learning module — a team's how-to content, inside the team's OWN database.
// `body` is the in-app text the agent reads to answer help; `link` points at
// external material. Locked model rules enforced HERE on the server:
//   • deactivate-not-delete (ARCHITECTURE §4) — items are retired, never removed,
//     with a deactivator audit block so progress + history survive;
//   • category is pick-or-create — a free-typed category that isn't already a
//     'Learning category' selectable value gets added as one (Base v3 behaviour);
//   • per-user progress is an explicit, reversible "mark as done" upsert.

import { logActivity, type Actor } from "../../../../shared/workers/activity"
import {
  d1ExecScript,
  d1Query,
  sqlString,
  type D1Rest,
} from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import type { Learning, LearningProgressEntry } from "../../../../shared/types"
import { GuardError, type MemberGuard } from "../../../../shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"

/** The dropdown `type` a learning item's category is stored under. */
const CATEGORY_TYPE = "Learning category"

/** Coerce an untrusted JSON value to a SAFE integer literal before it's
 * interpolated into SQL. The route types `sequence` as number but doesn't
 * validate at runtime, so a string could otherwise slip in raw — coerce it. */
function intOr(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** Allow only safe link schemes (http/https/mailto). A `javascript:` / `data:` /
 * `vbscript:` content_link is a stored-XSS payload the moment a reader clicks it, so
 * anything else is dropped (defence-in-depth beside the renderer's own check). */
function safeLink(url: unknown): string | null {
  const v = typeof url === "string" ? url.trim() : ""
  if (!v) return null
  try {
    const u = new URL(v, "https://x.invalid")
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? v : null
  } catch {
    return null
  }
}

/** Server-side defence-in-depth for an article body (now rich-text HTML from the
 * Notes editor; previously markdown). The RENDER path (web `RichText`) is the real
 * boundary — an allowlist parse that drops scripts/handlers/unsafe links — so this
 * just scrubs the obvious dangers before they're stored: script/style/embed blocks,
 * inline on* handlers, dangerous-scheme href/src (and the old markdown-link form,
 * harmless to keep). */
function safeBody(body: unknown): string | null {
  if (typeof body !== "string") return null
  return body
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|noscript|template)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')?\s*(?:javascript|data|vbscript):/gi, "$1=$2#")
    .replace(/\]\(\s*(?:javascript|data|vbscript)\s*:/gi, "](#")
}

/** A short plain-text preview from a (possibly HTML) body — for list/card subtitles
 * (content_description) and the assistant's reading copy. */
function previewFromBody(html: string | null): string | null {
  if (!html) return null
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
  return text ? text.slice(0, 140) : null
}

/** Raw learning row (DB column names) joined with the caller's own progress. */
type LearningRow = {
  id: string
  category: string | null
  content_title: string
  content_description: string | null
  content_type: string | null
  content_link: string | null
  content_body: string | null
  sequence: number
  is_required: number
  deactivated_at: string | null
  created_at: string
  done: number | null
}

/** Shape one DB row into the shared `Learning` type the client + agent share. */
function toLearning(r: LearningRow): Learning {
  return {
    id: r.id,
    category: r.category,
    title: r.content_title,
    description: r.content_description,
    contentType: r.content_type,
    contentLink: r.content_link,
    body: r.content_body,
    sequence: r.sequence,
    required: r.is_required === 1,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    done: r.done === 1,
  }
}

/** Fetch a learning item (any status) in this team, or throw a clean 404. */
async function learningOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{ id: string; content_title: string }> {
  const rows = await d1Query<{ id: string; content_title: string }>(
    cfg,
    guard.databaseId,
    "SELECT id, content_title FROM learning WHERE id = ?",
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "learning_not_found", "That learning item doesn't exist.")
  return rows[0]
}

/** Pick-or-create a 'Learning category' selectable: if the team doesn't already
 * have this category as an active dropdown value, add it (so the picker offers it
 * next time). Free-typed categories never silently vanish. */
async function ensureCategory(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  category: string
): Promise<void> {
  const clean = category.trim()
  if (!clean) return
  const existing = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM selectable_data WHERE type = ? AND value = ? AND deactivated_at IS NULL",
    [CATEGORY_TYPE, clean]
  )
  if (existing[0]) return
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(ulid())}, ${sqlString(CATEGORY_TYPE)}, ${sqlString(clean)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
}

/** Every learning item (active + inactive) for the team, in display order
 * (sequence then created_at), with the CALLER's own `done` merged in from
 * learning_progress so each row shows the viewer's progress. */
export async function listLearning(cfg: D1Rest, guard: MemberGuard): Promise<Learning[]> {
  const rows = await d1Query<LearningRow>(
    cfg,
    guard.databaseId,
    `SELECT l.id, l.category, l.content_title, l.content_description, l.content_type,
            l.content_link, l.content_body, l.sequence, l.is_required, l.deactivated_at,
            l.created_at, p.done AS done
     FROM learning l
     LEFT JOIN learning_progress p ON p.learning_id = l.id AND p.user_id = ?
     ORDER BY l.sequence ASC, l.created_at ASC`,
    [guard.userId]
  )
  return rows.map(toLearning)
}

/** Fields a create / update accepts (the editable surface). */
export type LearningInput = {
  title?: string
  category?: string
  description?: string
  contentType?: string
  contentLink?: string
  body?: string
  sequence?: number
  required?: boolean
}

/** Create a learning item. Title is required; everything else is optional. A
 * free-typed category is picked-or-created as a 'Learning category' selectable.
 * Returns the new item's id. */
export async function createLearning(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: LearningInput
): Promise<string> {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)

  const category = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null
  if (category) await ensureCategory(cfg, guard, actor, category)

  const contentType = optionalText(input.contentType, "Content type", TEXT_LIMITS.short) ?? null
  const body = safeBody(input.body)
  // Description is now DERIVED from the body (the form merged them) — a short
  // plain-text preview for list cards; an explicit description (e.g. import) wins.
  const description = optionalText(input.description, "Description", TEXT_LIMITS.long) ?? previewFromBody(body)

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO learning (id, category, content_title, content_description, content_type, content_link, content_body, sequence, is_required, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(category)}, ${sqlString(title)}, ${sqlString(description)}, ${sqlString(contentType)}, ${sqlString(safeLink(input.contentLink))}, ${sqlString(body)}, ${intOr(input.sequence, 0)}, ${input.required ? 1 : 0}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Learning created",
    description: `${actor.name} added the "${title}" learning item`,
    relatedTable: "learning",
    relatedRowId: id,
  })

  return id
}

/** Edit a learning item's content. Title stays required; a (possibly new)
 * category is picked-or-created. Stamps the editor audit block. */
export async function updateLearning(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: LearningInput
): Promise<void> {
  await learningOrThrow(cfg, guard, id)
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)

  const category = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null
  if (category) await ensureCategory(cfg, guard, actor, category)

  const contentType = optionalText(input.contentType, "Content type", TEXT_LIMITS.short) ?? null
  const body = safeBody(input.body)
  const description = optionalText(input.description, "Description", TEXT_LIMITS.long) ?? previewFromBody(body)

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE learning SET category = ${sqlString(category)}, content_title = ${sqlString(title)}, content_description = ${sqlString(description)}, content_type = ${sqlString(contentType)}, content_link = ${sqlString(safeLink(input.contentLink))}, content_body = ${sqlString(body)}, sequence = ${intOr(input.sequence, 0)}, is_required = ${input.required ? 1 : 0}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)};`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Learning edited",
    description: `${actor.name} edited the "${title}" learning item`,
    relatedTable: "learning",
    relatedRowId: id,
  })
}

/** Deactivate or reactivate a learning item. Deactivate-only model (ARCHITECTURE
 * §4): the row + everyone's progress are NEVER deleted — deactivating just retires
 * the item (hidden from the active list, history preserved). Stamps the
 * deactivator audit block; reactivating clears it. */
export async function setLearningActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<void> {
  const item = await learningOrThrow(cfg, guard, id)

  const now = new Date().toISOString()
  const sql = active
    ? `UPDATE learning SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
    : `UPDATE learning SET deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(id)};`
  await d1ExecScript(cfg, guard.databaseId, sql)

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Learning activated" : "Learning deactivated",
    description: `${actor.name} ${active ? "activated" : "deactivated"} the "${item.content_title}" learning item`,
    relatedTable: "learning",
    relatedRowId: id,
  })
}

/** Mark a learning item done / not-done FOR THE CALLER (the agent uses its own
 * progress too). Upserts the one (learning_id, user_id) progress row — done bool
 * + done_at timestamp. */
export async function setLearningDone(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  done: boolean
): Promise<void> {
  await learningOrThrow(cfg, guard, id)

  const now = new Date().toISOString()
  const doneAt = done ? sqlString(now) : "NULL"
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO learning_progress (id, learning_id, user_id, done, done_at, updated_at)
VALUES (${sqlString(ulid())}, ${sqlString(id)}, ${sqlString(guard.userId)}, ${done ? 1 : 0}, ${doneAt}, ${sqlString(now)})
ON CONFLICT(learning_id, user_id) DO UPDATE SET
  done = excluded.done, done_at = excluded.done_at, updated_at = excluded.updated_at;`
  )
}

/** Curator dashboard: every member's done state for the team's learning items
 * (one row per recorded progress entry). The screen joins these against the
 * member + item lists it already holds. */
export async function listProgress(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<LearningProgressEntry[]> {
  const rows = await d1Query<{
    learning_id: string
    user_id: string
    done: number
    done_at: string | null
  }>(
    cfg,
    guard.databaseId,
    "SELECT learning_id, user_id, done, done_at FROM learning_progress ORDER BY updated_at DESC"
  )
  return rows.map((r) => ({
    learningId: r.learning_id,
    userId: r.user_id,
    done: r.done === 1,
    doneAt: r.done_at,
  }))
}
