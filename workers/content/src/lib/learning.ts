// Learning module — a team's how-to content, inside the team's OWN database.
// `body` is the in-app text the agent reads to answer help; `link` points at
// external material. Locked model rules enforced HERE on the server:
//   • deactivate-not-delete (ARCHITECTURE §4) — items are retired, never removed,
//     with a deactivator audit block so progress + history survive;
//   • category is pick-or-create — a free-typed category that isn't already a
//     'Learning category' selectable value gets added as one (Base v3 behaviour);
//   • per-user progress is an explicit, reversible "mark as done" upsert.

import { assertNotConflicted, versionPredicate } from "../../../../shared/workers/concurrency"
import { changedFields, describeChanges, logActivity, type Actor } from "../../../../shared/workers/activity"
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
import { EXPORT_HARD_CAP, LIST_HARD_CAP } from "../../../../shared/workers/limits"

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
  creator_name: string | null
  editor_name: string | null
  updated_at: string | null
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
    creatorName: r.creator_name,
    editorName: r.editor_name,
    updatedAt: r.updated_at,
    done: r.done === 1,
  }
}

/** Fetch a learning item (any status) in this team, or throw a clean 404. */
type LearningBefore = {
  id: string
  content_title: string
  category: string | null
  content_description: string | null
  content_type: string | null
  content_link: string | null
  content_body: string | null
  sequence: number
  is_required: number
}

async function learningOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<LearningBefore> {
  const rows = await d1Query<LearningBefore>(
    cfg,
    guard.databaseId,
    "SELECT id, content_title, category, content_description, content_type, content_link, content_body, sequence, is_required FROM learning WHERE id = ?",
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
  const id = ulid()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, ${sqlString(CATEGORY_TYPE)}, ${sqlString(clean)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  // A dropdown value created SIDEWAYS still gets a birth row (R25). This one is
  // easy to miss precisely because nobody visits a form to make it: typing a new
  // category into pick-or-create on the learning form creates a real record in
  // another module, and it used to appear in the dropdown list with no history
  // at all — the only row in `selectable_data` whose life started silently.
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Dropdown value created",
    verb: "created",
    description: `${actor.name} added the "${clean}" learning category while writing an article`,
    relatedTable: "selectable_data",
    relatedRowId: id,
  })
}

/** Every learning item (active + inactive) for the team, in display order
 * (sequence then created_at), with the CALLER's own `done` merged in from
 * learning_progress so each row shows the viewer's progress. */
const LEARNING_SELECT = `SELECT l.id, l.category, l.content_title, l.content_description, l.content_type,
            l.content_link, l.content_body, l.sequence, l.is_required, l.deactivated_at,
            l.created_at, l.creator_name, l.editor_name, l.updated_at, p.done AS done
     FROM learning l
     LEFT JOIN learning_progress p ON p.learning_id = l.id AND p.user_id = ?`

export async function listLearning(cfg: D1Rest, guard: MemberGuard): Promise<Learning[]> {
  const rows = await d1Query<LearningRow>(
    cfg,
    guard.databaseId,
    `${LEARNING_SELECT}
     ORDER BY l.sequence ASC, l.created_at ASC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [guard.userId]
  )
  return rows.map(toLearning)
}

/** ONE item by id, or null — what a create hands back (R21) and what the `?id=`
 * door resolves.
 *
 * It shares `LEARNING_SELECT` with the list so a single row can never differ in
 * shape from a listed one. It used to get that guarantee by reading the WHOLE
 * bounded list and calling `.find()`, which bought identical shape at two
 * prices: a 1,000-row read to return one row on every create, edit, status
 * change and deactivate (R21/R23 got their letter and not their spirit), and —
 * worse — `null` for any record past the list's own cap. `applyUpdated` reads a
 * null row as "this record left the list" and drops it, so editing row 1,001
 * made it disappear from the screen. Sharing the projection gives the same
 * guarantee structurally, for one row. (Scaling + speed reviews, 2026-08-25.) */
export async function oneLearning(cfg: D1Rest, guard: MemberGuard, id: string): Promise<Learning | null> {
  const rows = await d1Query<LearningRow>(
    cfg,
    guard.databaseId,
    `${LEARNING_SELECT} WHERE l.id = ? LIMIT 1`,
    [guard.userId, id]
  )
  return rows[0] ? toLearning(rows[0]) : null
}

/** R16: exact server COUNT(*) for the badge — never rows.length. */
export async function countLearning(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM learning")
  return rows[0]?.n ?? 0
}

/** Fields a create / update accepts (the editable surface).
 *
 * The optional fields are `| null` because an EDIT body is PARTIAL and the two
 * callers say two different things: the machine surface (agent / MCP) OMITS a
 * field it does not mean to touch, while the web form SENDS null for a box a
 * person actually cleared (`body: values.body || null`). Typing them as
 * `string | undefined` said the second caller did not exist. */
export type LearningInput = {
  title?: string
  category?: string | null
  description?: string | null
  contentType?: string | null
  contentLink?: string | null
  body?: string | null
  sequence?: number | null
  required?: boolean | null
}

/** Create a learning item. Title is required; everything else is optional. A
 * free-typed category is picked-or-created as a 'Learning category' selectable.
 * Returns the new item's id. */
/** Export-only reader: every article's FULL row (sequence, required, the whole
 * audit block). The shared list SELECT stays untouched — it doubles as the
 * detail source (EDGE-CASES §2); this one is read only by the CSV export. */
export type LearningExportRow = {
  content_title: string
  category: string | null
  content_description: string | null
  content_type: string | null
  content_link: string | null
  content_body: string | null
  sequence: number
  is_required: number
  deactivated_at: string | null
  deactivator_name: string | null
  created_at: string | null
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}
export async function listLearningForExport(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<LearningExportRow[]> {
  return d1Query<LearningExportRow>(
    cfg,
    guard.databaseId,
    `SELECT content_title, category, content_description, content_type, content_link, content_body,
            sequence, is_required, deactivated_at, deactivator_name,
            created_at, creator_name, updated_at, editor_name
     FROM learning ORDER BY sequence, created_at LIMIT ${EXPORT_HARD_CAP + 1}` // R14 hard cap + 1: the extra row is how we learn the export was truncated
  )
}

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
  // Through the boundary seam FIRST (NUL strip + length cap — a NUL reaching D1
  // is a 500, and every sibling field on this same statement already does it),
  // then the XSS scrub. Two different jobs; both are required.
  const body = safeBody(optionalText(input.body, "Body", TEXT_LIMITS.long))
  // Description is now DERIVED from the body (the form merged them) — a short
  // plain-text preview for list cards; an explicit description (e.g. import) wins.
  const description = optionalText(input.description, "Description", TEXT_LIMITS.long) ?? previewFromBody(body)

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO learning (id, category, content_title, content_description, content_type, content_link, content_body, sequence, is_required, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(category)}, ${sqlString(title)}, ${sqlString(description)}, ${sqlString(contentType)}, ${sqlString(safeLink(optionalText(input.contentLink, "Link", TEXT_LIMITS.link)))}, ${sqlString(body)}, ${intOr(input.sequence, 0)}, ${input.required ? 1 : 0}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Learning created",
      verb: "created",
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
  input: LearningInput,
  /** The `updated_at` the caller was shown. Given one, the write refuses to land
   * on a row that has moved on since — see shared/workers/concurrency.ts. */
  expectedVersion?: string | null
): Promise<void> {
  const before = await learningOrThrow(cfg, guard, id)
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)

  // AN OMITTED FIELD IS NOT AN EMPTY ONE — the distinction this whole block turns on.
  //
  // `undefined` means the caller never mentioned the field, so it KEEPS what is
  // stored. `null` (or "") means the field was PRESENT and empty, so it really
  // does clear. Both callers depend on that split: tool-catalog's `opt()` drops
  // an unmentioned key so JSON.parse here yields undefined, while the web form
  // sends an explicit null for a box a person cleared.
  //
  // Every content column below used to be written unconditionally, so
  // `update_learning` — which requires only id + title and is marked
  // agent.confirm: false — turned "rename this article" into an unconfirmed wipe
  // of its body, category, link and type. `== null`, which the two guarded
  // fields used, cannot express the split either: it reads the person who
  // cleared a field and the machine that never named it as the same caller.
  // (Correctness review, round 5.)
  const sentCategory = optionalText(input.category, "Category", TEXT_LIMITS.short) ?? null
  // Pick-or-create runs only on a category the caller actually SENT: doing it for
  // a preserved one would re-create a retired dropdown value, and write its birth
  // row, on an edit that never touched the category.
  if (sentCategory) await ensureCategory(cfg, guard, actor, sentCategory)
  const category = input.category === undefined ? before.category : sentCategory

  const contentType =
    input.contentType === undefined
      ? before.content_type
      : optionalText(input.contentType, "Content type", TEXT_LIMITS.short) ?? null
  // Through the boundary seam FIRST (NUL strip + length cap — a NUL reaching D1
  // is a 500, and every sibling field on this same statement already does it),
  // then the XSS scrub. Two different jobs; both are required.
  const body =
    input.body === undefined
      ? before.content_body
      : safeBody(optionalText(input.body, "Body", TEXT_LIMITS.long))
  const contentLink =
    input.contentLink === undefined
      ? before.content_link
      : safeLink(optionalText(input.contentLink, "Link", TEXT_LIMITS.link))
  // Description is DERIVED from the body (the form merged them); an explicit one
  // — an import's, say — wins. So it follows the BODY: when neither was sent, the
  // stored description is still the right one, and re-deriving would overwrite an
  // explicitly imported description with an excerpt of the body.
  const description =
    input.description !== undefined || input.body !== undefined
      ? optionalText(input.description, "Description", TEXT_LIMITS.long) ?? previewFromBody(body)
      : before.content_description
  const sequence = input.sequence === undefined ? before.sequence : intOr(input.sequence, 0)
  const required = input.required === undefined ? before.is_required === 1 : input.required === true

  const now = new Date().toISOString()
  // RETURNING turns the write into its own answer: no rows came back means
  // the predicate did not match, i.e. someone else changed this row first.
  const landed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE learning SET category = ${sqlString(category)}, content_title = ${sqlString(title)}, content_description = ${sqlString(description)}, content_type = ${sqlString(contentType)}, content_link = ${sqlString(contentLink)}, content_body = ${sqlString(body)}, sequence = ${sequence}, is_required = ${required ? 1 : 0}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(id)}${versionPredicate(expectedVersion)} RETURNING id`
  )
  assertNotConflicted(landed.length, expectedVersion)

  // Every `to` is the value that was actually WRITTEN above, never the raw
  // incoming one. The Link row used to read `safeLink(input.contentLink)` — the
  // one field whose diff was computed a second, different way from its own SET —
  // so a preserved link was reported as cleared: history describing a change that
  // never happened, which is worse than no history at all.
  const diff = [
    { label: "Title", from: before.content_title, to: title },
    { label: "Category", from: before.category, to: category },
    { label: "Description", from: before.content_description, to: description },
    { label: "Type", from: before.content_type, to: contentType },
    { label: "Link", from: before.content_link, to: contentLink },
    { label: "Body", from: before.content_body, to: body, hideValues: true },
    // Sequence and Required were absent from this diff AND defaulted in the SET
    // above, so an edit that omitted them wrote 0/false over a real value and
    // recorded nothing about it. A learning item quietly stopped being required
    // and quietly moved to the front of the order. (Dead-end review, 2026-08-25.)
    { label: "Order", from: String(before.sequence), to: String(sequence) },
    {
      label: "Required",
      from: before.is_required ? "Yes" : "No",
      to: required ? "Yes" : "No",
    },
  ]
  const changes = describeChanges(diff)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Learning edited",
      verb: "edited",
    description: `${actor.name} edited the "${title}" learning item${changes ? ` — ${changes}` : ""}`,
      changes: changedFields(diff),
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
): Promise<boolean> {
  const item = await learningOrThrow(cfg, guard, id)

  // R17: current-status predicate → a repeat (double click, retried request,
  // re-run bulk) moves zero rows → no activity row, no publish. A record's
  // history says what happened, not how many times a button was pressed.
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE learning SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE learning SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Learning activated" : "Learning deactivated",
    verb: active ? "activated" : "deactivated",
    description: `${actor.name} ${active ? "activated" : "deactivated"} the "${item.content_title}" learning item`,
    relatedTable: "learning",
    relatedRowId: id,
  })
  return true
}

/** Deactivate / reactivate MANY learning items in one call (the bulk sibling of
 * setLearningActive). Applies the SAME per-row change — same UPDATE, same audit
 * block, same activity row — and reports how many actually changed vs. were
 * skipped (an id with no matching row, or one ALREADY in the target state —
 * R17: a re-run bulk writes no duplicate history and pings nothing). Returns the
 * ids that really changed so the route publishes one row-level ping EACH. */
export async function bulkSetLearningActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  ids: string[],
  active: boolean
): Promise<{ changed: string[]; skipped: number }> {
  const changed: string[] = []
  let skipped = 0
  for (const id of ids) {
    try {
      if (await setLearningActive(cfg, guard, actor, id, active)) changed.push(id)
      else skipped++ // already in the target state — a no-op, not an event
    } catch (e) {
      // A missing item is skipped, not fatal — the rest of the batch still applies.
      if (e instanceof GuardError && e.status === 404) {
        skipped++
        continue
      }
      throw e
    }
  }
  return { changed, skipped }
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
    // R14 hard cap — progress is articles × members; move to paging before this bites.
    `SELECT learning_id, user_id, done, done_at FROM learning_progress ORDER BY updated_at DESC LIMIT ${EXPORT_HARD_CAP}`
  )
  return rows.map((r) => ({
    learningId: r.learning_id,
    userId: r.user_id,
    done: r.done === 1,
    doneAt: r.done_at,
  }))
}
