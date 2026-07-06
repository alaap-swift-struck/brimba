// THE LAWS OF THE BASE, as data. This is the single source of truth the human
// RULES.md and the machine-checks (shared/rules + the per-worker publish-seam
// tests + web/test/rules.test.ts) are both pinned to. A law may not be added
// without a check; a check may not exist without a law (enforced by L0 in
// web/test/rules.test.ts). Deny-lists are DATA here, so every exception is a
// reviewed, visible line — never a silent bypass (the proven publish-seam pattern).

export type Dimension = "arch" | "ui" | "workflow" | "ai"
export type RuleStatus = "enforced" | "aspirational"
export interface Rule {
  id: string
  dimension: Dimension
  law: string
  /** the test id that enforces it (a per-worker suite or a web rules.test case). */
  checkId: string
  status: RuleStatus
}

export const RULES_REGISTRY: Rule[] = [
  {
    id: "R1",
    dimension: "arch",
    law: "Every mutation route publishes a live change ping.",
    checkId: "publish-seam",
    status: "enforced",
  },
  {
    id: "R2",
    dimension: "ui",
    law: "Every record-detail screen exposes Overview + Activity tabs.",
    checkId: "record-detail-tabs",
    status: "enforced",
  },
  {
    id: "R3",
    dimension: "ui",
    law: "Collection tab strips use the library TabsView (icon + count badge) — no hand-rolled button toggles.",
    checkId: "no-handrolled-toggles",
    status: "enforced",
  },
  {
    id: "R4",
    dimension: "ui",
    law: "Every form/dialog renders through the shared FormShell (one title/subtitle · separator · fields · separator · action layout).",
    checkId: "forms-use-formshell",
    status: "enforced",
  },
  {
    id: "R5",
    dimension: "arch",
    law: "Record activity is read through ONE generic (table, id) path — any module's history, no per-module read SQL.",
    checkId: "generic-activity-path",
    status: "enforced",
  },
  {
    id: "R6",
    dimension: "ui",
    law: "Product terms live in ONE glossary (clear, brief, no over-explaining) — the app speaks one dictionary.",
    checkId: "glossary-wellformed",
    status: "enforced",
  },
  {
    id: "R7",
    dimension: "ui",
    law: "Every form dialog persists its draft per session (useFormDraft) — unsaved input survives navigating away (CACHING.md §11).",
    checkId: "forms-persist-drafts",
    status: "enforced",
  },
  {
    id: "R8",
    dimension: "ui",
    law: "Every team collection tab derives its count from its loaded rows — a placement:'tab' section that shows a collection must declare a countCacheKey.",
    checkId: "tab-counts-derived",
    status: "enforced",
  },
  {
    id: "R9",
    dimension: "arch",
    law: "The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability.",
    checkId: "agent-app-parity",
    status: "enforced",
  },
]

/** Worker test suites that enforce R1. A new mutating worker without a
 * publish-seam test is a gap — track it here. */
export const MUTATING_WORKERS = ["tenancy", "content", "data-ops"] as const

/** R2 — the bespoke (host-composed) record-detail components that MUST render the
 * Overview + Activity tabs themselves (the engine-recipe details get them for free). */
export const RECORD_DETAIL_COMPONENTS = ["help-detail", "learning-detail", "role-detail"] as const

/** R2 — reviewed bypasses. Each MUST get tabs over time; the reason is mandatory.
 * (Empty today: role-detail — the last exception — grew its Permissions/Overview/
 * Activity tabs on 2026-07-06. Every record detail now carries the tabs.) */
export const RECORD_DETAIL_EXCEPTIONS: Record<string, string> = {}

/** R8 — reviewed bypasses: placement:"tab" sections that DON'T lead with a
 * collection, so they carry no count badge (and thus no countCacheKey). Each MUST
 * name its reason; every other tab section is forced to declare a countCacheKey. */
export const TAB_COUNT_EXCEPTIONS: Record<string, string> = {
  overview: "leads with team metadata (name, logo, audit) — not a collection, so no count.",
  import: "contextual per-target action reached from a button — not a collection tab.",
}

/** R4 — the form dialogs that MUST use FormShell. */
export const FORM_DIALOGS = [
  "help-form-dialog",
  "learning-form-dialog",
  "role-form-dialog",
  "invite-dialog",
  "team-edit-dialog",
] as const
