// The PURE core of agentic import (AGENTIC-IMPORT.md): target detection, the
// deterministic fallback planner, the dependency topo-sort, the value normalizers,
// and the reference resolver. No network, no DB, no model — so it's all unit-tested.
// The agent (import-agent.ts) PROPOSES a plan; this file both backs the fallback and
// provides the deterministic pieces execution (import-batch.ts) trusts.

import type { ImportColumn, ImportPlan, ImportPlanStep, ImportRejection, TransformKey } from "../../../../shared/types"
import { BULK_MAX_ROWS } from "../../../../shared/workers/limits"
import { autoMap, norm, TARGETS, type ReferenceDef, type TargetDef } from "./targets"

/** One parsed file the planner reasons over. `rows` is optional (header-only
 * callers still work) — when present, planStep predicts per-ROW rejections. */
export type PlanFile = { fileId: string; name: string; headers: string[]; rowCount: number; rows?: string[][] }

/* -------------------------------- normalizers -------------------------------- */

/** The fixed, SAFE vocabulary — a transform key → a pure string function. The agent
 * may only pick a key from here, so no arbitrary code ever runs on user data. */
export const TRANSFORMS: Record<TransformKey, (v: string) => string> = {
  trim: (v) => v.trim(),
  titlecase: (v) => v.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
  lowercase: (v) => v.trim().toLowerCase(),
  uppercase: (v) => v.trim().toUpperCase(),
  boolean: (v) => (/^(1|y|yes|true|t)$/i.test(v.trim()) ? "yes" : /^(0|n|no|false|f)$/i.test(v.trim()) ? "no" : v.trim()),
  iso_date: (v) => {
    const s = v.trim()
    // Already ISO-ish → keep the date part.
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    // D/M/Y or M/D/Y with - or / — assume D/M/Y only when day > 12 is unambiguous,
    // else M/D/Y (US export default). Best-effort; unparseable stays as-is.
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
    if (!m) return s
    let [, a, b, y] = m
    if (y.length === 2) y = `20${y}`
    const first = Number(a)
    const second = Number(b)
    const [mm, dd] = first > 12 ? [second, first] : [first, second]
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return s
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
  },
}

const VALID_TRANSFORMS = new Set(Object.keys(TRANSFORMS))
export function isTransformKey(k: unknown): k is TransformKey {
  return typeof k === "string" && VALID_TRANSFORMS.has(k)
}

/** Apply a column's chosen normalizer (trim is the floor — always applied). */
export function applyTransform(value: string, key: TransformKey | undefined): string {
  const fn = key && TRANSFORMS[key] ? TRANSFORMS[key] : TRANSFORMS.trim
  return fn(value)
}

/* -------------------------------- vocabulary --------------------------------- */

// WHERE SYNONYM MAPPING BELONGS (the argument, so nobody re-litigates it):
//
// A column with a closed set of legal values gets its word resolved in THREE
// passes, cheapest and most certain first. The order is the whole design.
//
//   1. EXACT, normalised — "Receipt", "receipt", "RECEIPT" are one word. Free,
//      deterministic, no maintenance.
//   2. DECLARED ALIASES — the synonyms this domain knows for sure. Free,
//      deterministic, reviewable, and — the reason they exist at all — they work
//      with NO MODEL KEY, so the fallback planner is not a lesser importer
//      (AGENTIC-IMPORT §8: degrade gracefully is a locked property of this base).
//   3. THE AGENT — everything left. This is the long tail no list anticipates,
//      which is the entire point of an agentic import: a human writes the word
//      they say out loud. It costs nothing extra: the plan is ALREADY one model
//      call per batch, so the vocabulary rides in that same prompt.
//
// Not "agent OR aliases" — both, in that order. Aliases alone go stale the first
// time somebody types a word nobody listed. The agent alone is non-deterministic
// (the same file could map differently twice) and useless without a key. Putting
// determinism first means a repeat import behaves the same way, and the model is
// only asked about what actually needs judgement.
//
// And whatever resolves it, it happens HERE — inside the one scan that backs both
// the plan and the run — so the plan can never promise "423 will import" and then
// import 14. That is the failure this exists to prevent.

/** Resolve one cell against its column's vocabulary. Returns the legal value, or
 * the reason it can't be resolved. A column with no `values` is unconstrained. */
export function resolveValue(
  raw: string,
  col: ImportColumn,
  agentMap?: Record<string, string>
): { value: string; reject?: undefined } | { value?: undefined; reject: string } {
  if (!col.values?.length) return { value: raw }
  if (raw === "") return { value: raw } // empty is the required-column check's business, not ours
  const legalByNorm = new Map(col.values.map((v) => [norm(v), v]))

  const exact = legalByNorm.get(norm(raw)) // 1 · exact, normalised
  if (exact) return { value: exact }

  for (const [from, to] of Object.entries(col.aliases ?? {})) // 2 · declared aliases
    if (norm(from) === norm(raw)) {
      const legal = legalByNorm.get(norm(to))
      if (legal) return { value: legal }
    }

  const mapped = agentMap?.[raw] ?? agentMap?.[raw.trim()] // 3 · the agent's map
  if (mapped) {
    const legal = legalByNorm.get(norm(mapped))
    if (legal) return { value: legal }
  }

  return {
    reject: `"${raw}" isn't a valid ${col.label.toLowerCase()} — it must be one of: ${col.values.join(", ")}.`,
  }
}

/* ------------------------------ target detection ----------------------------- */

/** Best target for a file: the one whose REQUIRED columns are most covered by the
 * file's headers (fuzzy), with OPTIONAL-column coverage as the tiebreaker — so a
 * `["Title","Category"]` file is Learning (title+category) not Member roles (whose
 * `title` column also matches). Returns null if no required column matches at all. */
export function detectTarget(headers: string[]): string | null {
  const normed = new Set(headers.map(norm))
  const matches = (c: { key: string; label: string }) => normed.has(norm(c.key)) || normed.has(norm(c.label))
  let best: { key: string; score: number } | null = null
  for (const t of Object.values(TARGETS)) {
    const req = t.columns.filter((c) => c.required)
    if (!req.length) continue
    const reqCoverage = req.filter(matches).length / req.length
    if (reqCoverage === 0) continue
    const optionalHit = t.columns.filter((c) => !c.required && matches(c)).length
    const score = reqCoverage + optionalHit * 0.01 // required dominates; optionals break ties
    if (!best || score > best.score) best = { key: t.tableKey, score }
  }
  return best ? best.key : null
}

/* ------------------------------ bulk parcelling ------------------------------ */

/** How many rows may ride in ONE bulk call to this target — the MINIMUM of the
 * pipeline's global ceiling and the target door's own.
 *
 * The global cap alone is the bug: a door that caps at 200 refuses a 2,000-row
 * parcel WHOLE, so a 400-row import fails all 400 and reads like 400 bad rows.
 * A door only accepts what it says it accepts, so its number wins whenever it is
 * smaller; a target that declares a LARGER one is still held to the global cap
 * (that ceiling is about what one request should carry, not what the door will
 * tolerate). A nonsense declaration (0, negative, NaN) falls back to the global
 * cap rather than producing empty parcels forever. */
export function parcelSize(def: Pick<TargetDef, "bulk">, globalCap = BULK_MAX_ROWS): number {
  const declared = def.bulk?.maxRows
  if (typeof declared !== "number" || !Number.isFinite(declared) || declared < 1) return globalCap
  return Math.min(declared, globalCap)
}

/** Split rows into parcels no bigger than this target's ceiling. Pure, so the
 * arithmetic that decides how a whole import is chunked is unit-testable without
 * a database, a door, or a model. */
export function packParcels<T>(rows: T[], def: Pick<TargetDef, "bulk">, globalCap = BULK_MAX_ROWS): T[][] {
  const size = parcelSize(def, globalCap)
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/* -------------------------------- topo sort ---------------------------------- */

/** Dependency order (parents before children) over the targets present, from each
 * target's declared `references`. Returns the order + any warnings (a cycle leaves
 * the offending targets out of `order` and adds a warning — execution refuses them). */
export function orderTargets(targets: string[]): { order: string[]; warnings: string[] } {
  const present = new Set(targets)
  const warnings: string[] = []
  // edges: child → [parents]
  const parents = new Map<string, string[]>()
  for (const key of targets) {
    const def = TARGETS[key]
    const deps = (def?.references ?? [])
      .map((r) => r.target)
      .filter((p) => present.has(p) && p !== key)
    parents.set(key, [...new Set(deps)])
  }
  const order: string[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()
  const visit = (key: string): boolean => {
    if (done.has(key)) return true
    if (visiting.has(key)) {
      warnings.push(`Circular dependency involving "${key}" — it won't be imported.`)
      return false
    }
    visiting.add(key)
    let ok = true
    for (const p of parents.get(key) ?? []) if (!visit(p)) ok = false
    visiting.delete(key)
    if (ok) {
      done.add(key)
      order.push(key)
    }
    return ok
  }
  for (const key of targets) visit(key)
  return { order, warnings }
}

/* ---------------------------- the fallback planner --------------------------- */

/** Deterministic plan (used when no model key is set, or the model reply won't
 * parse): detect each file's target, fuzzy-map its columns, trim-normalize, carry
 * the declared references, order by dependency, predict rejects from required-but-
 * unmapped columns. The model planner returns the SAME shape, just smarter. */
export function buildFallbackPlan(files: PlanFile[]): ImportPlan {
  const warnings: string[] = []
  const rawSteps: ImportPlanStep[] = []
  for (const f of files) {
    const targetKey = detectTarget(f.headers)
    if (!targetKey) {
      warnings.push(`Couldn't tell which table "${f.name}" belongs to — skipped.`)
      continue
    }
    rawSteps.push(planStep(f, TARGETS[targetKey], autoMap(f.headers, TARGETS[targetKey].columns), {}))
  }
  const { order, warnings: orderWarn } = orderTargets(rawSteps.map((s) => s.target))
  warnings.push(...orderWarn)
  return { order, steps: sortStepsByOrder(rawSteps, order), warnings, bySource: "fallback" }
}

/** One row's scan outcome: its mapped + normalized values, or the reason it
 * rejects (missing required value / duplicate of an earlier row). This ONE pass
 * backs BOTH plan-time prediction and execution, so the plan can never promise
 * something the run won't do — same checks, same wording. */
export type RowScan = { mapped: Record<string, string>; reject?: string }

export function scanRows(
  def: TargetDef,
  mapping: Record<string, string | null>,
  transforms: Record<string, TransformKey>,
  headers: string[],
  rows: string[][],
  valueMaps: Record<string, Record<string, string>> = {}
): RowScan[] {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i
  })
  const required = def.columns.filter((c) => c.required)
  // Two rows with identical REQUIRED values are the same record typed twice —
  // import the first, skip the rest (an accidental copy-paste shouldn't double data).
  const seen = new Map<string, number>()
  return rows.map((raw, i) => {
    const mapped: Record<string, string> = {}
    let vocabReject: string | undefined
    for (const col of def.columns) {
      const src = mapping[col.key]
      const value = src != null && idx[src] != null ? (raw[idx[src]] ?? "") : ""
      const normalized = applyTransform(value, transforms[col.key])
      // Casing is a transform's job; VOCABULARY is this one's. Resolving it here
      // — in the scan the plan and the run BOTH use — is what stops a plan
      // promising rows the door will refuse.
      const out = resolveValue(normalized, col, valueMaps[col.key])
      mapped[col.key] = out.value ?? normalized
      if (out.reject && !vocabReject) vocabReject = out.reject
    }
    if (vocabReject) return { mapped, reject: vocabReject }
    const missing = required.find((c) => !mapped[c.key])
    if (missing) return { mapped, reject: `Missing required "${missing.label}".` }
    if (required.length) {
      const fingerprint = required.map((c) => norm(mapped[c.key])).join(" ")
      const first = seen.get(fingerprint)
      if (first) return { mapped, reject: `Duplicate of row ${first} in this file — skipped.` }
      seen.set(fingerprint, i + 1)
    }
    return { mapped }
  })
}

/** Keep a plan's stored rejection list bounded (the COUNT stays exact). */
const MAX_PREDICTED_LIST = 200

/** Shape one file + a mapping into a plan step (shared by fallback + the model
 * adapter): normalize the mapping to our columns, attach declared references +
 * transforms, and predict the rejections — from the actual ROWS when we have them
 * (via the same scanRows execution uses), else from unmapped required columns. */
export function planStep(
  file: PlanFile,
  def: TargetDef,
  rawMapping: Record<string, string>,
  transforms: Record<string, TransformKey>,
  rawValueMaps: Record<string, Record<string, string>> = {}
): ImportPlanStep {
  const mapping: Record<string, string | null> = {}
  for (const col of def.columns) {
    const src = rawMapping[col.key]
    mapping[col.key] = typeof src === "string" && file.headers.includes(src) ? src : null
  }
  const cleanTransforms: Record<string, TransformKey> = {}
  for (const col of def.columns) {
    const t = transforms[col.key]
    if (isTransformKey(t)) cleanTransforms[col.key] = t
  }
  // Only keep value maps for columns that actually HAVE a vocabulary — the model
  // proposing a map for a free-text column is noise, not an instruction.
  const cleanValueMaps: Record<string, Record<string, string>> = {}
  for (const col of def.columns) {
    const m = rawValueMaps[col.key]
    if (!col.values?.length || !m || typeof m !== "object") continue
    const pairs: Record<string, string> = {}
    for (const [from, to] of Object.entries(m)) if (typeof from === "string" && typeof to === "string") pairs[from] = to
    if (Object.keys(pairs).length) cleanValueMaps[col.key] = pairs
  }

  // A required column with no mapped header → every row rejects; flag it.
  const requiredUnmapped = def.columns.filter((c) => c.required && !mapping[c.key])
  let predictedRejects = requiredUnmapped.length ? file.rowCount : 0
  let predictedRejections: ImportRejection[] | undefined
  if (!requiredUnmapped.length && file.rows?.length) {
    const rejects: ImportRejection[] = []
    scanRows(def, mapping, cleanTransforms, file.headers, file.rows, cleanValueMaps).forEach((s, i) => {
      if (s.reject) rejects.push({ file: file.name, row: i + 1, reason: s.reject })
    })
    predictedRejects = rejects.length
    if (rejects.length) predictedRejections = rejects.slice(0, MAX_PREDICTED_LIST)
  }
  return {
    fileId: file.fileId,
    fileName: file.name,
    target: def.tableKey,
    targetName: def.displayName,
    mapping,
    transforms: cleanTransforms,
    valueMaps: Object.keys(cleanValueMaps).length ? cleanValueMaps : undefined,
    references: (def.references ?? []).map((r) => ({ column: r.column, target: r.target, mode: r.mode })),
    rowCount: file.rowCount,
    predictedRejects,
    predictedRejections,
    notes: requiredUnmapped.length
      ? `Required column${requiredUnmapped.length > 1 ? "s" : ""} ${requiredUnmapped.map((c) => `"${c.label}"`).join(", ")} not matched — those rows will be rejected.`
      : undefined,
  }
}

export function sortStepsByOrder(steps: ImportPlanStep[], order: string[]): ImportPlanStep[] {
  const rank = new Map(order.map((t, i) => [t, i]))
  return [...steps]
    .filter((s) => rank.has(s.target)) // drop steps whose target fell out (cycle/unknown)
    .sort((a, b) => (rank.get(a.target) ?? 0) - (rank.get(b.target) ?? 0))
}

/* --------------------------- reference resolution ---------------------------- */

/** Resolve one row's references to the parent ids/values it needs (PURE). Given the
 * row, the target's references, and `resolved` (parentTarget → naturalKey(normalized)
 * → newId), returns the `refs` for buildBody, or an error string when a REQUIRED
 * id-reference can't be found (→ the caller rejects the row with that reason). */
export function resolveRow(
  row: Record<string, string>,
  references: ReferenceDef[],
  resolved: Map<string, Map<string, string>>
): { refs: Record<string, string>; error?: string } {
  const refs: Record<string, string> = {}
  for (const ref of references) {
    if (ref.mode !== "id") continue // value-mode keeps the string; ordering did its job
    const key = norm(row[ref.column] ?? "")
    const found = key ? resolved.get(ref.target)?.get(key) : undefined
    if (found) {
      refs[ref.column] = found
    } else if (ref.onMissing === "reject") {
      return { refs, error: `No ${ref.target} matches "${row[ref.column] ?? ""}" for ${ref.column}.` }
    }
    // onMissing "blank"/"create" → leave it out; buildBody handles the absence.
  }
  return { refs }
}
