// The ONE place the web app talks to the workers. Same-origin /api calls —
// the gateway routes them — so cookies flow automatically, no config needed.

import type {
  ActiveContext,
  ActivityItem,
  AgentMessage,
  AgentQuota,
  AgentThread,
  ApiError,
  ChatOutcome,
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  ImportBatchReport,
  ImportBatchSummary,
  McpTokenSummary,
  ImportBatchView,
  ImportColumn,
  ImportableTarget,
  ImportPreview,
  Invite,
  InviteAudit,
  Learning,
  LearningProgressEntry,
  PendingCall,
  PermissionValue,
  ReceivedInvite,
  RolePermissions,
  SelectableValue,
  SessionUser,
  TeamMeta,
  TeamMember,
  TeamRole,
  TeamSummary,
} from "@shared/types"

/** The import session as the data-ops worker returns it (a view, not the raw row). */
export type ImportSessionView = {
  id: string
  tableKey: string
  tableName: string | null
  status: string
  fileValidated: boolean
  extractionComplete: boolean
  importComplete: boolean
  createdAt: string
}
export type ImportResultView = { created: number; skipped: number; failed: number; errors: string[] }
export type ImportTargetView = { tableKey: string; displayName: string; columns: ImportColumn[] }

/** One row of the agent usage log (written once per turn): who ran it, when, how
 * many AI units it used, whether that was free / credit / mixed, and a short line. */
export type UsageLogRow = {
  id: string
  createdAt: string
  actorName?: string
  credits: number
  source: string
  summary: string
}

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

/** One Server-Sent Event from an agent turn. `text` deltas + `step_*` may repeat any
 * number of times; exactly one TERMINAL event (`confirm` | `final` | `error`) ends the
 * stream. Everything the assistant says arrives as `text` events — `final` only
 * settles the turn. Keys are terse + stable — the wire contract data-ops emits. */
export type AgentStreamEvent =
  | { t: "text"; d: string }
  | { t: "step_start"; tool: string; summary: string; ids?: Record<string, string> }
  | { t: "step_end"; tool: string; ok: boolean; summary: string; error?: string }
  | { t: "confirm"; calls: PendingCall[]; text?: string }
  | { t: "final"; outcome: ChatOutcome }
  | { t: "error"; message: string }

/** Read a POST's `text/event-stream` body, splitting on the blank-line record
 * separator and calling `onEvent` for each `data:` line's JSON. Shared by the two
 * streaming agent callers. Throws ApiFailure if the response isn't OK (before any
 * event flows) so callers surface a clean message like the non-streaming path. */
async function streamSse(
  path: string,
  body: unknown,
  onEvent: (ev: AgentStreamEvent) => void
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiFailure(res.status, err?.error ?? "unknown", err?.message ?? "Something went wrong. Try again.")
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  // Events are separated by a blank line ("\n\n"); a partial record stays buffered
  // until its terminator arrives. Parse each record's `data:` payload as one event.
  const flush = (raw: string) => {
    const line = raw.split("\n").find((l) => l.startsWith("data:"))
    if (!line) return
    const json = line.slice(5).trim()
    if (!json) return
    try {
      onEvent(JSON.parse(json) as AgentStreamEvent)
    } catch {
      /* skip a malformed frame rather than break the stream */
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      flush(buffer.slice(0, sep))
      buffer = buffer.slice(sep + 2)
    }
  }
  // A final record with no trailing blank line (some servers omit it on close).
  if (buffer.trim()) flush(buffer)
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiFailure(
      res.status,
      body?.error ?? "unknown",
      body?.message ?? "Something went wrong. Try again."
    )
  }
  return (await res.json()) as T
}

export const auth = {
  /** Request a 6-digit code. devCode comes back only on staging/dev (TEMP). */
  startEmail: (email: string) =>
    api<{ ok: true; devCode?: string }>("/api/auth/email/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyEmail: (email: string, code: string) =>
    api<{ user: SessionUser; isNew: boolean }>("/api/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  me: () => api<{ user: SessionUser }>("/api/auth/me"),

  /** Your own account activity (name / photo / email changes) — identity-level,
   * not tied to any team. */
  activity: () => api<{ activity: ActivityItem[] }>("/api/auth/activity"),

  /** Onboarding / profile edit: names + optional photo (as a data URL). */
  updateProfile: (input: {
    firstName: string
    lastName: string
    imageDataUrl?: string
  }) =>
    api<{ user: SessionUser }>("/api/auth/profile", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Change email, step 1: send a 6-digit code to the NEW address. devCode
   * comes back only on staging/dev (same as login). */
  startEmailChange: (email: string) =>
    api<{ ok: true; devCode?: string }>("/api/auth/email/change/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** Change email, step 2: verify the code → switched email (other devices are
   * signed out server-side; the old address is warned). */
  verifyEmailChange: (email: string, code: string) =>
    api<{ user: SessionUser }>("/api/auth/email/change/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
}

export const tenancy = {
  /** After onboarding: accept waiting invites OR create the personal team. */
  bootstrap: () =>
    api<{ teams: TeamSummary[]; currentTeamId: string | null }>(
      "/api/tenancy/bootstrap",
      { method: "POST" }
    ),

  teams: () =>
    api<{ teams: TeamSummary[]; currentTeamId: string | null }>(
      "/api/tenancy/teams"
    ),

  /** Current working context: active team + your role + member count + teams. */
  active: () => api<ActiveContext>("/api/tenancy/active"),

  /** Switch the active team (one at a time); returns the new context. */
  switchTeam: (teamId: string) =>
    api<ActiveContext>("/api/tenancy/switch-team", {
      method: "POST",
      body: JSON.stringify({ teamId }),
    }),

  /** Create a new team (its own database, you as Admin); returns the context. */
  createTeam: (name: string) =>
    api<ActiveContext>("/api/tenancy/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  /** Edit the active team's name + optional logo (data URL). Needs teams:edit. */
  updateTeam: (name: string, logoDataUrl?: string) =>
    api<{ ok: true }>("/api/tenancy/teams/update", {
      method: "POST",
      body: JSON.stringify({ name, logoDataUrl }),
    }),

  /** Everyone on the active team (identity + role + the guard flags). */
  members: () => api<{ members: TeamMember[] }>("/api/tenancy/members"),

  /** ONE member by id (for row-level live patching) — null if they're no longer
   * an active member (the read passes the same filter as the list). */
  member: (userId: string) =>
    api<{ members: TeamMember[] }>(
      `/api/tenancy/members?id=${encodeURIComponent(userId)}`
    ).then((r) => r.members[0] ?? null),

  /** ONE role by id — null if it's gone. */
  role: (roleId: string) =>
    api<{ roles: TeamRole[] }>(`/api/tenancy/roles?id=${encodeURIComponent(roleId)}`).then(
      (r) => r.roles[0] ?? null
    ),

  /** ONE invite by id — null if it's gone. */
  invite: (inviteId: string) =>
    api<{ invites: Invite[] }>(
      `/api/tenancy/invites?id=${encodeURIComponent(inviteId)}`
    ).then((r) => r.invites[0] ?? null),

  /** The per-team invite_logs audit for one invite (inviter snapshot +
   * acceptance + shelf life) — null if there's no audit row. For the detail. */
  inviteAudit: (inviteId: string): Promise<InviteAudit | null> =>
    api<{ audit: InviteAudit | null }>(
      `/api/tenancy/invites/audit?id=${encodeURIComponent(inviteId)}`
    ).then((r) => r.audit),

  /** YOUR own effective rights for the active team — powers the page guard. */
  myPermissions: () =>
    api<{ permissions: PermissionValue }>("/api/tenancy/my-permissions"),

  /** Every role in the active team (for the role picker + roles screen). */
  roles: () => api<{ roles: TeamRole[] }>("/api/tenancy/roles"),

  /** One role's permission matrix (modules + saved value + locked flag). */
  rolePermissions: (roleId: string) =>
    api<RolePermissions>(
      `/api/tenancy/roles/permissions?roleId=${encodeURIComponent(roleId)}`
    ),

  /** Save a role's permission matrix (server re-applies auto-flip-read). */
  saveRolePermissions: (roleId: string, value: PermissionValue) =>
    api<{ ok: true }>("/api/tenancy/roles/permissions", {
      method: "POST",
      body: JSON.stringify({ roleId, value }),
    }),

  /** Create a new role (starts with no rights); returns the refreshed list. */
  createRole: (title: string, description: string) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles", {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),

  /** Rename / re-describe a role (not the locked Admin); returns the list. */
  updateRole: (roleId: string, title: string, description: string) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles/update", {
      method: "POST",
      body: JSON.stringify({ roleId, title, description }),
    }),

  /** Deactivate / reactivate a role (never deleted; holders keep access). Needs
   * member_roles:delete. Returns the refreshed role list. */
  setRoleActive: (roleId: string, active: boolean) =>
    api<{ roles: TeamRole[] }>("/api/tenancy/roles/active", {
      method: "POST",
      body: JSON.stringify({ roleId, active }),
    }),

  /** The team's dropdown values ("selectable data"), ordered for grouping by type. */
  selectable: () => api<{ values: SelectableValue[] }>("/api/tenancy/selectable"),

  /** Add a dropdown value to a type group (pick-or-create the type). Needs
   * selectable_data:create. Returns the refreshed value list. */
  createSelectable: (type: string, value: string) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable", {
      method: "POST",
      body: JSON.stringify({ type, value }),
    }),

  /** Rename a dropdown value (its type stays). Needs selectable_data:edit. */
  updateSelectable: (id: string, value: string) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable/update", {
      method: "POST",
      body: JSON.stringify({ id, value }),
    }),

  /** Deactivate / reactivate a dropdown value (deactivate-only). Needs
   * selectable_data:delete. Returns the refreshed value list. */
  setSelectableActive: (id: string, active: boolean) =>
    api<{ values: SelectableValue[] }>("/api/tenancy/selectable/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),

  /** Change a member's role; returns the refreshed member list. */
  setMemberRole: (userId: string, roleId: string) =>
    api<{ members: TeamMember[] }>("/api/tenancy/members/role", {
      method: "POST",
      body: JSON.stringify({ userId, roleId }),
    }),

  /** Remove (deactivate) a member; returns the refreshed member list. */
  removeMember: (userId: string) =>
    api<{ members: TeamMember[] }>("/api/tenancy/members/remove", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  /** Every invite for the active team (pending / accepted / revoked / expired). */
  invites: () => api<{ invites: Invite[] }>("/api/tenancy/invites"),

  /** Invite someone by email to a role; returns the refreshed invite list. */
  createInvite: (email: string, roleId: string) =>
    api<{ invites: Invite[] }>("/api/tenancy/invites", {
      method: "POST",
      body: JSON.stringify({ email, roleId }),
    }),

  /** Revoke ("redact") a pending invite; returns the refreshed invite list. */
  revokeInvite: (inviteId: string) =>
    api<{ invites: Invite[] }>("/api/tenancy/invites/revoke", {
      method: "POST",
      body: JSON.stringify({ inviteId }),
    }),

  /** Invitations I've RECEIVED (by my email) — the inbox. Works for any
   * signed-in user, not just teamless ones. */
  receivedInvitations: () =>
    api<{ invitations: ReceivedInvite[] }>("/api/tenancy/invitations"),

  /** Accept one received invite → join + switch to that team. */
  acceptInvitation: (inviteId: string) =>
    api<{ invitations: ReceivedInvite[]; joinedTeamId: string }>(
      "/api/tenancy/invitations/accept",
      { method: "POST", body: JSON.stringify({ inviteId }) }
    ),

  /** The team's activity feed, or one record's (scope = team | user | role |
   * invite). For invite scope, `id` is the GLOBAL invite id (server maps it). */
  activity: (scope: "team" | "user" | "role" | "invite" = "team", id?: string) =>
    api<{ activity: ActivityItem[] }>(
      `/api/tenancy/activity?scope=${scope}${id ? `&id=${encodeURIComponent(id)}` : ""}`
    ),

  /** One record's activity slice (generic — any module's rows by table+id; e.g.
   * a help ticket's history). Gated server-side by that module's read right. */
  recordActivity: (table: string, id: string): Promise<ActivityItem[]> =>
    api<{ activity: ActivityItem[] }>(
      `/api/tenancy/activity?scope=record&table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`
    ).then((r) => r.activity),

  /** The active team's Overview metadata (created by/when, last updated). */
  teamMeta: () => api<TeamMeta>("/api/tenancy/team-meta"),

  /** The active team's screen-recipe OVERRIDES ({ module: recipeJSON }). The web
   * app merges these over the in-code base recipes (override wins per screen). */
  screenOverrides: () =>
    api<{ screens: Record<string, string> }>("/api/tenancy/config/screens"),

  /** Set (author) a team's override for one screen — runtime-editable, no deploy.
   * Needs teams:edit. */
  setScreenOverride: (module: string, recipe: unknown) =>
    api<{ screens: Record<string, string> }>("/api/tenancy/config/screens", {
      method: "POST",
      body: JSON.stringify({ module, recipe }),
    }),
}

const enc = encodeURIComponent
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) })

/** Content worker — Learning + Help (team-DB content modules). */
export const content = {
  learning: () => api<{ learning: Learning[] }>("/api/content/learning"),
  learningOne: (id: string) =>
    api<{ learning: Learning[] }>(`/api/content/learning?id=${enc(id)}`).then((r) => r.learning[0] ?? null),
  createLearning: (input: Partial<Learning>) =>
    api<{ learning: Learning[] }>("/api/content/learning", post(input)),
  updateLearning: (input: Partial<Learning> & { id: string }) =>
    api<{ learning: Learning[] }>("/api/content/learning/update", post(input)),
  setLearningActive: (id: string, active: boolean) =>
    api<{ learning: Learning[] }>("/api/content/learning/active", post({ id, active })),
  /** Upload a file for an article (gated by learning:create). Send the raw
   * base64 data URL; get back the served /media URL + its content type. */
  uploadLearningFile: (dataUrl: string, filename?: string) =>
    api<{ url: string; contentType: string }>(
      "/api/content/learning/upload",
      post({ dataUrl, filename })
    ),
  markLearningDone: (id: string, done: boolean) =>
    api<{ ok: true }>("/api/content/learning/done", post({ id, done })),
  learningProgress: () =>
    api<{ progress: LearningProgressEntry[] }>("/api/content/learning/progress"),

  help: (scope: "mine" | "all" = "all") =>
    api<{ tickets: HelpTicket[] }>(`/api/content/help?scope=${scope}`),
  helpOne: (id: string) =>
    api<{ tickets: HelpTicket[] }>(`/api/content/help?id=${enc(id)}`).then((r) => r.tickets[0] ?? null),
  helpThread: (id: string) =>
    api<{ replies: HelpMessage[] }>(`/api/content/help/thread?id=${enc(id)}`),
  createHelp: (input: { description: string; helpType?: string; sourceScreen?: string }) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help", post(input)),
  updateHelp: (input: { id: string; description: string; helpType?: string }) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/update", post(input)),
  setHelpStatus: (id: string, status: HelpTicket["status"]) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/status", post({ id, status })),
  replyHelp: (helpId: string, body: string, taggedUserIds?: string[]) =>
    api<{ replies: HelpMessage[] }>("/api/content/help/reply", post({ helpId, body, taggedUserIds })),
  helpStakeholders: (id: string) =>
    api<{ stakeholders: HelpStakeholder[] }>(`/api/content/help/stakeholders?id=${enc(id)}`),
  addStakeholder: (id: string, userId: string) =>
    api<{ stakeholders: HelpStakeholder[] }>("/api/content/help/stakeholders", post({ id, userId })),
}

/** Data-ops worker — the 3-stage import + the AI agent. */
export const dataOps = {
  importTargets: () => api<{ targets: ImportableTarget[] }>("/api/data-ops/import/targets"),
  startImport: (tableKey: string) =>
    api<{ session: ImportSessionView; target: ImportTargetView }>("/api/data-ops/import", post({ tableKey })),
  uploadCsv: (sessionId: string, fileName: string, csv: string) =>
    api<{ session: ImportSessionView; preview: ImportPreview }>(
      "/api/data-ops/import/file",
      post({ sessionId, fileName, csv })
    ),
  setMapping: (sessionId: string, mapping: Record<string, string>) =>
    api<{ session: ImportSessionView; preview: ImportPreview }>(
      "/api/data-ops/import/mapping",
      post({ sessionId, mapping })
    ),
  importPreview: (id: string) =>
    api<{ session: ImportSessionView; preview: ImportPreview | null; columns: ImportColumn[] }>(
      `/api/data-ops/import/preview?id=${enc(id)}`
    ),
  confirmImport: (sessionId: string) =>
    api<{ session: ImportSessionView; result: ImportResultView }>(
      "/api/data-ops/import/confirm",
      post({ sessionId })
    ),

  /** A downloadable sample CSV href for a target — a good-file template. */
  importSampleHref: (tableKey: string) => `/api/data-ops/import/sample?tableKey=${enc(tableKey)}`,
  // Agentic multi-file batch import (AGENTIC-IMPORT.md).
  batchStart: () => api<{ batch: ImportBatchView }>("/api/data-ops/import/batch", post({})),
  batchAddFile: (batchId: string, name: string, csv: string) =>
    api<{ batch: ImportBatchView }>("/api/data-ops/import/batch/file", post({ batchId, name, csv })),
  batchPlan: (batchId: string) =>
    api<{ batch: ImportBatchView; quota: AgentQuota }>("/api/data-ops/import/batch/plan", post({ batchId })),
  importBatches: () => api<{ batches: ImportBatchSummary[] }>("/api/data-ops/import/batches"),
  batchConfirm: (batchId: string) =>
    api<{ report: ImportBatchReport }>("/api/data-ops/import/batch/confirm", post({ batchId })),
  batchGet: (id: string) => api<{ batch: ImportBatchView }>(`/api/data-ops/import/batch?id=${enc(id)}`),

  agentUsage: () => api<{ quota: AgentQuota }>("/api/data-ops/agent/usage"),
  /** The team's agent usage log — one row per turn, newest-first. Powers the
   * "where did my credits go" view behind the quota badge. */
  agentUsageLog: (limit?: number) =>
    api<{ rows: UsageLogRow[] }>(
      "/api/data-ops/agent/usage-log" + (limit ? `?limit=${limit}` : "")
    ),
  agentChat: (message: string, threadId?: string) =>
    api<ChatOutcome>("/api/data-ops/agent/chat", post({ message, threadId })),
  agentConfirm: (threadId: string, approve: boolean, calls: PendingCall[]) =>
    api<{ reply: string; quota: AgentQuota; overQuota?: boolean }>(
      "/api/data-ops/agent/confirm",
      post({ threadId, approve, calls })
    ),

  /** Streaming chat turn: text arrives word-by-word, each tool run bookended by
   * step_start/step_end, ending in one terminal event (confirm | final | error).
   * The non-streaming agentChat above stays as a fallback. */
  agentChatStream: (
    body: { message: string; threadId?: string; files?: { name: string; csv: string }[] },
    onEvent: (ev: AgentStreamEvent) => void
  ) => streamSse("/api/data-ops/agent/chat", body, onEvent),

  /** Streaming confirm continuation — approving a paused turn resumes it as a
   * stream too, so steps accumulate across the confirm boundary. */
  agentConfirmStream: (
    body: { threadId: string; approve: boolean; calls: PendingCall[] },
    onEvent: (ev: AgentStreamEvent) => void
  ) => streamSse("/api/data-ops/agent/confirm", body, onEvent),
  agentThreads: () => api<{ threads: AgentThread[] }>("/api/data-ops/agent/threads"),
  agentThread: (id: string) =>
    api<{ messages: AgentMessage[] }>(`/api/data-ops/agent/thread?id=${enc(id)}`),
}

/** The MCP front desk (personal access tokens; the /mcp endpoint itself is for
 * machines with a Bearer token, not this session client). */
export const mcp = {
  tokens: () => api<{ tokens: McpTokenSummary[] }>("/api/mcp/tokens"),
  createToken: (label: string) =>
    api<{ token: { id: string; label: string; teamId: string; createdAt: string }; secret: string }>(
      "/api/mcp/tokens",
      post({ label })
    ),
  revokeToken: (id: string) => api<{ ok: true }>("/api/mcp/tokens/revoke", post({ id })),
}
