// The ONE place the web app talks to the workers. Same-origin /api calls —
// the gateway routes them — so cookies flow automatically, no config needed.

import type {
  ActiveContext,
  ApiError,
  SessionUser,
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

  /** Everyone on the active team (identity + role + the guard flags). */
  members: () => api<{ members: TeamMember[] }>("/api/tenancy/members"),

  /** Every role in the active team (for the role picker). */
  roles: () => api<{ roles: TeamRole[] }>("/api/tenancy/roles"),

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
}
