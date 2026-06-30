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

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
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

  agentUsage: () => api<{ quota: AgentQuota }>("/api/data-ops/agent/usage"),
  agentChat: (message: string, threadId?: string) =>
    api<ChatOutcome>("/api/data-ops/agent/chat", post({ message, threadId })),
  agentConfirm: (threadId: string, approve: boolean, calls: PendingCall[]) =>
    api<{ reply: string; quota: AgentQuota; overQuota?: boolean }>(
      "/api/data-ops/agent/confirm",
      post({ threadId, approve, calls })
    ),
  agentThreads: () => api<{ threads: AgentThread[] }>("/api/data-ops/agent/threads"),
  agentThread: (id: string) =>
    api<{ messages: AgentMessage[] }>(`/api/data-ops/agent/thread?id=${enc(id)}`),
}
