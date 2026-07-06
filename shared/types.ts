// Shared contract between the workers (who produce these) and the web app
// (who consumes them). ONE master copy — never redeclare these shapes.

/** A signed-in person, as the auth worker returns them to the browser. */
export type SessionUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  /** true once the onboarding screen (name + optional photo) is completed */
  onboardingComplete: boolean
  /** the team this person is currently working in (one at a time, locked) */
  currentTeamId: string | null
}

/** One team as the tenancy worker lists them for the signed-in person. */
export type TeamSummary = {
  id: string
  name: string
  logoUrl: string | null
  /** the member_roles row id (inside the team's own database) this person holds */
  roleId: string
  /** creating | ready | failed — a team is usable once 'ready' */
  dbStatus: string
}

/** One member of a team — membership (per-team) joined with identity (global,
 * read fresh from the users table) and their role title (from the team's DB). */
export type TeamMember = {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  roleId: string
  roleTitle: string
  /** true if this is the signed-in viewer */
  isYou: boolean
  /** true if they hold the team's locked Admin role */
  isAdmin: boolean
  joinedAt: string
}

/** The four access switches for one module (matches the library
 * PermissionMatrix component's RightSet). */
export type RightSet = {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

/** A whole role's permission sheet: one RightSet per module key. */
export type PermissionValue = Record<string, RightSet>

/** A per-team dropdown value ("selectable data"): a `value` inside a `type` group
 * (e.g. "Video link" in "File type"). Managed on the team Settings page; powers
 * the Learning-category / Help-type pickers. */
export type SelectableValue = {
  id: string
  type: string
  value: string
  isDefault: boolean
}

/** A role's permission matrix as the tenancy worker returns it: the module rows
 * (key + label), the saved value, the role title, and whether it's the locked
 * Admin role (shown view-only). */
export type RolePermissions = {
  modules: { key: string; label: string }[]
  value: PermissionValue
  isDefault: boolean
  title: string
  /** whether the signed-in viewer may edit roles (member_roles:edit) — drives
   * the screen's edit-vs-view mode and whether Save shows. */
  canEdit: boolean
}

/** One invite to a team. `status` is the display status — "pending" past its
 * expiry is reported as "expired"; an admin-cancelled one is "revoked". */
export type Invite = {
  id: string
  email: string
  roleId: string
  roleTitle: string
  status: "pending" | "accepted" | "revoked" | "expired"
  createdAt: string
  expiresAt: string
}

/** An invite the signed-in person has RECEIVED (matched by their email) — for
 * the Invitations inbox. Read from the global invite_index + teams row, so it
 * works for ANY signed-in user without opening a team database. */
export type ReceivedInvite = {
  id: string
  teamId: string
  teamName: string
  teamLogoUrl: string | null
  roleId: string
  createdAt: string
  expiresAt: string
}

/** The per-team invite_logs audit for ONE invite (M4) — surfaced on the invite
 * detail beside the routing data. The inviter snapshot is FROZEN at invite time
 * (it won't change if the inviter later edits their profile). */
export type InviteAudit = {
  inviterName: string | null
  inviterEmail: string | null
  inviterImageUrl: string | null
  /** did the invitee already have an account when invited? */
  inviteeHasAccount: boolean
  accepted: boolean
  acceptedAt: string | null
  shelfLifeHours: number
}

/** One role in a team (from the team's own member_roles table). */
export type TeamRole = {
  id: string
  title: string
  description: string | null
  /** the locked Admin role (cannot be edited or deleted) */
  isDefault: boolean
  /** how many active members currently hold this role */
  memberCount: number
  /** false = deactivated (kept, never deleted; holders keep their access) */
  active: boolean
  /** the audit block, for the detail Overview tab (same shape every record shows) */
  createdAt?: string | null
  createdByName?: string | null
  updatedAt?: string | null
  editedByName?: string | null
}

/** The signed-in person's current working context — powers the app shell. */
export type ActiveContext = {
  /** the team you're currently working in (null only if you have no teams) */
  team: TeamSummary | null
  /** your role in that team (id + title, read from the team's own database) */
  role: { id: string; title: string } | null
  /** how many active members the current team has */
  memberCount: number
  /** every team you belong to — feeds the team switcher */
  teams: TeamSummary[]
}

/** One row of a record's Activity tab (and the team-wide feed). The same row
 * surfaces in the team / user / role scopes by the relation it carries. */
export type ActivityItem = {
  id: string
  /** short type, e.g. "Member role changed" */
  type: string
  /** the human sentence shown in the feed */
  description: string
  /** who did it (name snapshot), or null if unknown */
  actorName: string | null
  createdAt: string
}

/** A team's Overview-tab metadata (who made it + when). */
export type TeamMeta = {
  name: string
  createdAt: string
  creatorName: string | null
  creatorEmail: string | null
  updatedAt: string | null
}

/** Every /api error body looks like this. */
export type ApiError = {
  error: string
  /** plain-English message safe to show the user */
  message: string
}

/* ----------------------------- next-build modules ----------------------------- */

/** A learning (how-to) item. `body` is the in-app text the agent reads to answer
 * help; `done` is the viewing user's own progress (merged in by the read). */
export type Learning = {
  id: string
  category: string | null
  title: string
  description: string | null
  contentType: string | null
  contentLink: string | null
  body: string | null
  sequence: number
  required: boolean
  active: boolean
  createdAt: string
  creatorName: string | null
  editorName: string | null
  updatedAt: string | null
  done?: boolean
}

/** One member's completion of one learning item (for the curator progress view). */
export type LearningProgressEntry = {
  learningId: string
  userId: string
  done: boolean
  doneAt: string | null
}

/** A support ticket (team-wide; the My/All tabs filter by raiser). The built-in
 * `status` is the source of truth; `helpType` is a cosmetic selectable value. */
export type HelpTicket = {
  id: string
  helpType: string | null
  description: string
  screenRecordingLink: string | null
  sourceScreen: string | null
  status: "open" | "in_progress" | "resolved" | "reopened"
  resolved: boolean
  resolvedAt: string | null
  raiserId: string
  raiserName: string | null
  editorName: string | null
  createdAt: string
  updatedAt: string | null
}

/** One reply on a ticket. `isAgent` marks the AI-drafted first reply; a mention
 * is notification-only (every member can see every ticket via the All tab). */
export type HelpMessage = {
  id: string
  ticketId: string
  body: string
  taggedUserIds: string[]
  isAgent: boolean
  authorId: string
  authorName: string | null
  createdAt: string
}

/** One stakeholder on a ticket. Origin tells the UI why they're here (and that
 * derived ones can't be removed — nothing on a ticket can). No assignee. */
export type HelpStakeholder = {
  userId: string
  name: string | null
  email: string
  imageUrl: string | null
  origin: "raiser" | "admin" | "mentioned" | "added"
}

/** A target in the owner-maintained global import catalog. */
export type ImportableTarget = {
  id: string
  tableKey: string
  displayName: string
  description: string | null
  requiredColumns: { key: string; label: string; required: boolean }[]
  active: boolean
}

/** A 3-stage data-import session (file validation → extraction → import). */
export type ImportSession = {
  id: string
  tableId: string
  tableName: string | null
  overallStatus: string
  fileValidated: boolean
  extractionComplete: boolean
  importComplete: boolean
  createdAt: string
}

/** A saved agent conversation thread (per team — the agent's memory). */
export type AgentThread = {
  id: string
  title: string | null
  lastMessageAt: string | null
  createdAt: string
}

/** One message in an agent thread. `toolCalls` records the actions the agent took
 * (and their status); `source` is in-app vs which MCP client. */
export type AgentMessage = {
  id: string
  threadId: string
  role: "user" | "assistant" | "tool"
  content: string | null
  toolCalls?: { tool: string; status: "pending" | "done" | "failed"; summary?: string }[]
  source: string | null
  createdAt: string
}

/** A team's AI quota snapshot (the credit-based model): a free daily allowance plus
 * a purchasable credit balance. `remaining` = free left today + credits; `blocked`
 * means both are exhausted (the agent warns, then hard-stops for the day). */
export type AgentQuota = {
  freeDaily: number
  freeUsedToday: number
  freeRemaining: number
  creditBalance: number
  remaining: number
  blocked: boolean
}

/** One row of the agent usage log — a plain trail of what the AI did, one per turn.
 * `credits` = AI units the turn consumed; `source` = where they came from; `summary` =
 * the user's message, trimmed. Newest-first; team-scoped. */
export type UsageLogRow = {
  id: string
  createdAt: string
  actorName: string | null
  credits: number
  source: "free" | "credit" | "mixed"
  summary: string
}

/** One column an import maps a file onto (matches a catalog target's columns). */
export type ImportColumn = { key: string; label: string; required: boolean }

/** The preview an import session produces — a capped sample of mapped rows + issues. */
export type ImportPreview = {
  columns: ImportColumn[]
  rows: Record<string, string>[]
  totalCount: number
  issues: string[]
}

/* ---- Agentic multi-file import (AGENTIC-IMPORT.md) ---- */

/** The safe, fixed vocabulary of per-column normalizers the agent may pick from
 * (no arbitrary code runs — a transform key maps to a pure function). */
export type TransformKey = "trim" | "titlecase" | "lowercase" | "uppercase" | "iso_date" | "boolean"

/** One file's step in the plan: which target it feeds, how its columns map, the
 * chosen normalizations, the references it carries, and a reject prediction. */
export type ImportPlanStep = {
  fileId: string
  fileName: string
  target: string
  targetName: string
  mapping: Record<string, string | null> // our column key → their header (null = unmapped)
  transforms: Record<string, TransformKey> // our column key → normalizer
  references: { column: string; target: string; mode: "id" | "value" }[]
  rowCount: number
  predictedRejects: number
  /** The predicted rejections themselves (row + reason), computed from the file's
   * ROWS at plan time so a bad file is visible BEFORE running — capped in size (the
   * count above is always the full number). Uses the same scan as execution, so the
   * plan never over- or under-promises what the run will do. */
  predictedRejections?: ImportRejection[]
  notes?: string
}

/** The reviewable plan: the ordered steps + any warnings (cycle, unknown target…). */
export type ImportPlan = {
  order: string[] // tableKeys, dependency order (parents first)
  steps: ImportPlanStep[] // one per file, already in run order
  warnings: string[]
  bySource: "agent" | "fallback" // did the model plan it, or the deterministic fallback?
}

export type ImportRejection = { file: string; row: number; reason: string }

/** The per-target tally + every rejected row's reason, produced by execution. */
export type ImportBatchReport = {
  perTarget: { target: string; targetName: string; created: number; skipped: number; failed: number }[]
  created: number
  skipped: number
  failed: number
  rejections: ImportRejection[]
}

/** The whole batch as the wizard sees it (files + plan + report + status). */
export type ImportBatchView = {
  id: string
  status: string
  files: { fileId: string; name: string; headers: string[]; rowCount: number }[]
  plan: ImportPlan | null
  report: ImportBatchReport | null
  createdAt: string
}

/** One line of the team's import HISTORY (who ran what, when, into which tables,
 * with the totals) — summaries only, never row contents. */
export type ImportBatchSummary = {
  id: string
  status: string
  by: string
  at: string
  completedAt: string | null
  files: { name: string; rowCount: number }[]
  targets: string[]
  created: number
  skipped: number
  failed: number
}

/** One action the agent proposes that needs the user's confirmation before it runs. */
export type PendingCall = { name: string; input: Record<string, unknown>; summary: string }

/** The result of one agent chat turn: a finished reply, or a pause for confirmation. */
export type ChatOutcome =
  | { done: true; threadId: string; reply: string; quota: AgentQuota; overQuota?: boolean }
  | {
      done: false
      threadId: string
      assistantText: string
      needsConfirm: PendingCall[]
      quota: AgentQuota
    }

/** One event on the agent's SSE stream (wire format: `data: <json>\n\n`). Keys are
 * terse + stable. `text` + `step_*` may repeat any number of times; exactly ONE terminal
 * event (confirm | final | error) ends every stream. EVERYTHING the assistant says
 * arrives as `text` events (streamed deltas, or one chunk for a non-streaming model /
 * a server note) — `final` only settles the turn (thread/quota/reply fallback), so the
 * client renders the accumulated text and never loses an earlier explanation. The
 * `summary` on step_* uses the same name-resolved logic as the confirm-panel summaries. */
export type StreamEvent =
  /** append this delta to the current assistant reply bubble (word-by-word). */
  | { t: "text"; d: string }
  /** a tool is about to run (human, id→name-resolved summary). */
  | { t: "step_start"; tool: string; summary: string }
  /** that tool finished — ok true, or false on failure (`error` = the door's short,
   * human reason, e.g. which permission was missing — shown on the failed step row). */
  | { t: "step_end"; tool: string; ok: boolean; summary: string; error?: string }
  /** TERMINAL: needs confirmation; the client shows the yes/no panel. */
  | { t: "confirm"; calls: PendingCall[]; text?: string }
  /** TERMINAL: run complete; carries the full ChatOutcome (reply/quota/threadId). */
  | { t: "final"; outcome: ChatOutcome }
  /** TERMINAL: something went wrong; a safe message to show. */
  | { t: "error"; message: string }
