// The AGENTIC half of import planning (AGENTIC-IMPORT.md §2, §5). Given the uploaded
// files (headers + a small sample) and the catalog, the model PROPOSES, per file:
//   • which target it feeds, • the column mapping (their header → our field), and
//   • a normalizer per column from the FIXED safe vocabulary (import-plan TRANSFORMS).
// Code then re-derives everything safety-critical deterministically (references,
// dependency order, reject prediction) via planStep/orderTargets — the model can't
// invent a reference or break ordering. No key set, or an unparseable reply → the
// deterministic fallback planner. One model call per batch (bounded cost).

import type { Env } from "../env"
import type { ImportPlan, ImportPlanStep, TransformKey } from "../../../../shared/types"
import { selectModel, type ChatMessage } from "./model"
import { TARGETS } from "./targets"
import {
  buildFallbackPlan,
  isTransformKey,
  orderTargets,
  planStep,
  sortStepsByOrder,
  type PlanFile,
} from "./import-plan"

export type AnalyzeFile = PlanFile & { sampleRows: string[][] }

/** A compact, model-readable description of what each target expects. */
function catalogPrompt(): string {
  return Object.values(TARGETS)
    .map((t) => {
      // A VOCABULARY column carries its legal values into the prompt — that is
      // what lets the model map the word a human writes ("Received") onto the
      // word the door accepts ("receipt"). Without it the model can only fix
      // CASING, which is the failure this was built for.
      const cols = t.columns
        .map(
          (c) =>
            `${c.key}${c.required ? "*" : ""} (${c.label})` +
            (c.values?.length ? ` [one of: ${c.values.join(" | ")}]` : "")
        )
        .join(", ")
      const refs = (t.references ?? []).map((r) => `${r.column}→${r.target}`).join(", ")
      return `- ${t.tableKey}: columns ${cols}${refs ? `; references: ${refs}` : ""}`
    })
    .join("\n")
}

const SYSTEM = [
  "You map messy spreadsheet exports onto a fixed set of database tables for a data-import tool.",
  "For EACH file, decide which target table it feeds, map each of the target's columns to the best-matching file header (or null if none fits), and pick ONE normalizer per mapped column from this fixed list: trim, titlecase, lowercase, uppercase, iso_date, boolean.",
  "A `*` marks a required column. Only choose a target the file plausibly matches. Never invent headers or columns.",
  "A column shown as [one of: a | b | c] has a CLOSED vocabulary: only those words are legal. When the file uses a different word for one of them, map it in `valueMaps` — the file's word as the key, the legal word as the value (e.g. \"Received\" -> \"receipt\"). Map only what you are confident means the same thing; leave a genuinely unknown word out and it will be reported as a skip. NEVER invent a legal value that isn't in the list.",
  'Reply with ONLY compact JSON, no prose: {"steps":[{"fileId":"...","target":"table_key","mapping":{"ourColumnKey":"their header or null"},"transforms":{"ourColumnKey":"trim"},"valueMaps":{"ourColumnKey":{"their word":"our legal value"}},"notes":"one short sentence"}]}',
].join(" ")

function filesPrompt(files: AnalyzeFile[]): string {
  return files
    .map((f) => {
      const sample = f.sampleRows
        .slice(0, 3)
        .map((r) => r.slice(0, f.headers.length).join(" | "))
        .join("\n")
      return `FILE ${f.fileId} ("${f.name}", ${f.rowCount} rows)\nHeaders: ${f.headers.join(" | ")}\nSample:\n${sample}`
    })
    .join("\n\n")
}

type RawStep = {
  fileId?: string
  target?: string
  mapping?: Record<string, unknown>
  transforms?: Record<string, unknown>
  valueMaps?: Record<string, unknown>
  notes?: string
}

/** Parse the model's JSON (tolerant of ```json fences / surrounding prose). */
function parseSteps(text: string): RawStep[] | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(body.slice(start, end + 1)) as { steps?: RawStep[] }
    return Array.isArray(obj.steps) ? obj.steps : null
  } catch {
    return null
  }
}

/** Turn the model's raw steps into a validated plan: each step is re-shaped through
 * planStep (mapping re-checked against real headers, references + reject-prediction
 * re-derived), then the whole set is dependency-ordered. Anything the model got
 * wrong (unknown target, bogus header) is dropped safely, not trusted. */
function adaptPlan(files: AnalyzeFile[], raw: RawStep[]): ImportPlan {
  const byId = new Map(files.map((f) => [f.fileId, f]))
  const warnings: string[] = []
  const steps: ImportPlanStep[] = []
  for (const s of raw) {
    const file = s.fileId ? byId.get(s.fileId) : undefined
    const def = s.target ? TARGETS[s.target] : undefined
    if (!file || !def) {
      if (s.fileId && s.target) warnings.push(`Ignored an unrecognized target "${s.target}".`)
      continue
    }
    const mapping: Record<string, string> = {}
    for (const [k, v] of Object.entries(s.mapping ?? {})) if (typeof v === "string") mapping[k] = v
    const transforms: Record<string, TransformKey> = {}
    for (const [k, v] of Object.entries(s.transforms ?? {})) if (isTransformKey(v)) transforms[k] = v
    // Untrusted, like everything else the model returns: strings only here, and
    // planStep drops maps for columns with no vocabulary. resolveValue then
    // refuses any target word that isn't actually legal — the model can propose a
    // mapping, it can never widen the vocabulary.
    const valueMaps: Record<string, Record<string, string>> = {}
    for (const [col, m] of Object.entries(s.valueMaps ?? {})) {
      if (!m || typeof m !== "object") continue
      const pairs: Record<string, string> = {}
      for (const [from, to] of Object.entries(m as Record<string, unknown>))
        if (typeof to === "string") pairs[from] = to
      if (Object.keys(pairs).length) valueMaps[col] = pairs
    }
    steps.push({
      ...planStep(file, def, mapping, transforms, valueMaps),
      notes: typeof s.notes === "string" ? s.notes : undefined,
    })
  }
  // A file the model didn't place → fall back to detecting it deterministically.
  const placed = new Set(steps.map((s) => s.fileId))
  for (const f of files) {
    if (placed.has(f.fileId)) continue
    const fb = buildFallbackPlan([f]).steps[0]
    if (fb) steps.push(fb)
    else warnings.push(`Couldn't place "${f.name}".`)
  }
  const { order, warnings: orderWarn } = orderTargets([...new Set(steps.map((s) => s.target))])
  warnings.push(...orderWarn)
  return { order, steps: sortStepsByOrder(steps, order), warnings, bySource: "agent" }
}

/** Build the plan. Uses Claude when a key is set (one call), else the deterministic
 * fallback. The caller has already metered a credit for this. */
export async function analyzeBatch(env: Env, files: AnalyzeFile[]): Promise<ImportPlan> {
  if (!files.length) return { order: [], steps: [], warnings: ["No files to plan."], bySource: "fallback" }
  if (!env.ANTHROPIC_API_KEY) return buildFallbackPlan(files)
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM}\n\nTarget tables:\n${catalogPrompt()}` },
      { role: "user", content: filesPrompt(files) },
    ]
    const reply = await selectModel(env).complete(messages, [])
    const raw = parseSteps(reply.text)
    if (!raw) return buildFallbackPlan(files)
    return adaptPlan(files, raw)
  } catch {
    // Any model/parse hiccup → the deterministic planner still delivers a usable plan.
    return buildFallbackPlan(files)
  }
}
