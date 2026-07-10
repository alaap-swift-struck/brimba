"use client"

// Loads the signed-in person + their active-team context, and exposes the
// actions the app shell needs (switch team, create team, refresh). The session
// is cached at MODULE level, so the FIRST screen loads it (with a skeleton) and
// every screen after paints instantly and just revalidates in the background —
// no more spinner on every navigation.

import * as React from "react"
import { useRouter } from "next/navigation"

import type { ActiveContext, SessionUser } from "@shared/types"

import { auth, tenancy } from "@/lib/api"

export type ActiveTeam = {
  loading: boolean
  user: SessionUser | null
  ctx: ActiveContext | null
  switchTeam: (teamId: string) => Promise<void>
  createTeam: (name: string) => Promise<void>
  refresh: () => Promise<void>
}

type Session = { user: SessionUser; ctx: ActiveContext }
// Survives navigations (cleared on sign-out / auth failure). REACTIVE: every write goes
// through setSessionCache, which notifies all mounted useActiveTeam instances. This is
// what lets a component mounted BEFORE login (the root AgentHost) pick up the session the
// moment another instance logs in / creates a team — without it, its icon only appeared
// after a manual reload (the launcher-needs-reload bug).
let sessionCache: Session | null = null
const sessionSubs = new Set<() => void>()
function setSessionCache(next: Session | null): void {
  sessionCache = next
  for (const fn of sessionSubs) fn()
}

export function useActiveTeam(): ActiveTeam {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(sessionCache?.user ?? null)
  const [ctx, setCtx] = React.useState<ActiveContext | null>(sessionCache?.ctx ?? null)
  const [loading, setLoading] = React.useState(!sessionCache)

  // Re-sync from the shared cache whenever ANY instance changes it (login, create/switch
  // team, refresh, sign-out) — so this instance updates even if the change happened
  // elsewhere. State setters no-op when unchanged, so this can't loop.
  React.useEffect(() => {
    const onChange = () => {
      setUser(sessionCache?.user ?? null)
      setCtx(sessionCache?.ctx ?? null)
      if (sessionCache) setLoading(false)
    }
    sessionSubs.add(onChange)
    return () => {
      sessionSubs.delete(onChange)
    }
  }, [])

  // A teamless context (e.g. just removed from your last team) means there's no
  // app screen to show — bounce to onboarding and DON'T cache the empty ctx, so
  // returning here re-checks once a team exists. Shared by load() + refresh().
  const sendToOnboardingIfTeamless = React.useCallback(
    (ctx: ActiveContext): boolean => {
      if (ctx.teams.length === 0) {
        setSessionCache(null)
        router.replace("/onboarding")
        return true
      }
      return false
    },
    [router]
  )

  React.useEffect(() => {
    let alive = true
    async function load() {
      try {
        const me = await auth.me()
        if (!me.user.onboardingComplete) {
          router.replace("/onboarding")
          return
        }
        const ctx = await tenancy.active()
        if (sendToOnboardingIfTeamless(ctx)) return
        const next: Session = { user: me.user, ctx }
        setSessionCache(next)
        if (!alive) return
        setUser(next.user)
        setCtx(next.ctx)
        setLoading(false)
      } catch {
        setSessionCache(null)
        router.replace("/login")
      }
    }
    // Cached → show instantly + revalidate quietly; else load (skeleton shows).
    if (sessionCache) {
      setUser(sessionCache.user)
      setCtx(sessionCache.ctx)
      setLoading(false)
    }
    void load()
    return () => {
      alive = false
    }
  }, [router, sendToOnboardingIfTeamless])

  const switchTeam = React.useCallback(async (teamId: string) => {
    const nextCtx = await tenancy.switchTeam(teamId)
    if (sessionCache) setSessionCache({ ...sessionCache, ctx: nextCtx })
    setCtx(nextCtx)
  }, [])

  const createTeam = React.useCallback(async (name: string) => {
    const nextCtx = await tenancy.createTeam(name)
    if (sessionCache) setSessionCache({ ...sessionCache, ctx: nextCtx })
    setCtx(nextCtx)
  }, [])

  const refresh = React.useCallback(async () => {
    // reload both identity (profile edits) and context (member counts, etc.)
    const [me, nextCtx] = await Promise.all([auth.me(), tenancy.active()])
    if (sendToOnboardingIfTeamless(nextCtx)) return
    setSessionCache({ user: me.user, ctx: nextCtx })
    setUser(me.user)
    setCtx(nextCtx)
  }, [sendToOnboardingIfTeamless])

  return { loading, user, ctx, switchTeam, createTeam, refresh }
}
