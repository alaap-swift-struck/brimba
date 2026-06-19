// The ONE place the web app talks to the workers. Same-origin /api calls —
// the gateway routes them — so cookies flow automatically, no config needed.

import type {
  ActiveContext,
  ActivityItem,
  ApiError,
  Invite,
  PermissionValue,
  ReceivedInvite,
  RolePermissions,
  SessionUser,
  TeamMeta,
  TeamMember,
  TeamRole,
  TeamSummary,
} from "@shared/types"

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

  /** The team's activity feed, or one record's (scope = team | user | role). */
  activity: (scope: "team" | "user" | "role" = "team", id?: string) =>
    api<{ activity: ActivityItem[] }>(
      `/api/tenancy/activity?scope=${scope}${id ? `&id=${encodeURIComponent(id)}` : ""}`
    ),

  /** The active team's Overview metadata (created by/when, last updated). */
  teamMeta: () => api<TeamMeta>("/api/tenancy/team-meta"),
}
