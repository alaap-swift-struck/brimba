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
// Survives navigations (cleared on sign-out / auth failure).
let sessionCache: Session | null = null

export function useActiveTeam(): ActiveTeam {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(sessionCache?.user ?? null)
  const [ctx, setCtx] = React.useState<ActiveContext | null>(sessionCache?.ctx ?? null)
  const [loading, setLoading] = React.useState(!sessionCache)

  React.useEffect(() => {
    let alive = true
    async function load() {
      try {
        const me = await auth.me()
        if (!me.user.onboardingComplete) {
          router.replace("/onboarding")
          return
        }
        const next: Session = { user: me.user, ctx: await tenancy.active() }
        sessionCache = next
        if (!alive) return
        setUser(next.user)
        setCtx(next.ctx)
        setLoading(false)
      } catch {
        sessionCache = null
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
  }, [router])

  const switchTeam = React.useCallback(async (teamId: string) => {
    const nextCtx = await tenancy.switchTeam(teamId)
    if (sessionCache) sessionCache = { ...sessionCache, ctx: nextCtx }
    setCtx(nextCtx)
  }, [])

  const createTeam = React.useCallback(async (name: string) => {
    const nextCtx = await tenancy.createTeam(name)
    if (sessionCache) sessionCache = { ...sessionCache, ctx: nextCtx }
    setCtx(nextCtx)
  }, [])

  const refresh = React.useCallback(async () => {
    // reload both identity (profile edits) and context (member counts, etc.)
    const [me, nextCtx] = await Promise.all([auth.me(), tenancy.active()])
    sessionCache = { user: me.user, ctx: nextCtx }
    setUser(me.user)
    setCtx(nextCtx)
  }, [])

  return { loading, user, ctx, switchTeam, createTeam, refresh }
}
