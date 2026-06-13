"use client"

// Loads the signed-in person + their active-team context once, and exposes the
// actions the app shell needs (switch team, create team, refresh). Every
// in-app page uses this so the shell and the page share ONE source of truth.

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

export function useActiveTeam(): ActiveTeam {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [ctx, setCtx] = React.useState<ActiveContext | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const me = await auth.me()
        if (!me.user.onboardingComplete) {
          router.replace("/onboarding")
          return
        }
        setUser(me.user)
        setCtx(await tenancy.active())
        setLoading(false)
      } catch {
        router.replace("/login")
      }
    }
    void load()
  }, [router])

  const switchTeam = React.useCallback(async (teamId: string) => {
    setCtx(await tenancy.switchTeam(teamId))
  }, [])

  const createTeam = React.useCallback(async (name: string) => {
    setCtx(await tenancy.createTeam(name))
  }, [])

  const refresh = React.useCallback(async () => {
    setCtx(await tenancy.active())
  }, [])

  return { loading, user, ctx, switchTeam, createTeam, refresh }
}
