// The PURE core of agentic import (AGENTIC-IMPORT.md): target detection, the
// deterministic fallback planner, the dependency topo-sort, the value normalizers,
// and the reference resolver. No network, no DB, no model — so it's all unit-tested.
// The agent (import-agent.ts) PROPOSES a plan; this file both backs the fallback and
// provides the deterministic pieces execution (import-batch.ts) trusts.

import type { ImportPlan, ImportPlanStep, TransformKey } from "../../../../shared/types"
import { autoMap, norm, TARGETS, type ReferenceDef, type TargetDef } from "./targets"

/** One parsed file the planner reasons over. */
export type PlanFile = { fileId: string; name: string; headers: string[]; rowCount: number }

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

/** Shape one file + a mapping into a plan step (shared by fallback + the model
 * adapter): normalize the mapping to our columns, attach declared references +
 * transforms, and predict how many rows lack a required value. */
export function planStep(
  file: PlanFile,
  def: TargetDef,
  rawMapping: Record<string, string>,
  transforms: Record<string, TransformKey>
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
  // A required column with no mapped header → every row rejects; flag it.
  const requiredUnmapped = def.columns.filter((c) => c.required && !mapping[c.key])
  return {
    fileId: file.fileId,
    fileName: file.name,
    target: def.tableKey,
    targetName: def.displayName,
    mapping,
    transforms: cleanTransforms,
    references: (def.references ?? []).map((r) => ({ column: r.column, target: r.target, mode: r.mode })),
    rowCount: file.rowCount,
    predictedRejects: requiredUnmapped.length ? file.rowCount : 0,
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
