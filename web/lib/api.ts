// The ONE place the web app talks to the workers. Same-origin /api calls —
// the gateway routes them — so cookies flow automatically, no config needed.

import type { ApiError, SessionUser } from "@shared/types"

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

  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
}
