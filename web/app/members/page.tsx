"use client"

// Members now live at /t/<teamId>/members (the team area's Members section). Keep
// this path as a redirect so old links still land in the right place.

import * as React from "react"
import { useRouter } from "next/navigation"

import { ShellLoading } from "@/components/app-shell"
import { useActiveTeam } from "@/lib/use-active-team"

export default function MembersRedirect() {
  const active = useActiveTeam()
  const router = useRouter()
  const teamId = active.ctx?.team?.id ?? null
  React.useEffect(() => {
    if (teamId) router.replace(`/t/${teamId}/members`)
  }, [teamId, router])
  return <ShellLoading />
}
