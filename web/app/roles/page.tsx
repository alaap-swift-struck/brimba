"use client"

// Member roles now live at /t/<teamId>/roles (the team area's Member roles
// section). Keep this path as a redirect so old links still land in the right
// place.

import * as React from "react"
import { useRouter } from "next/navigation"

import { ShellLoading } from "@/components/app-shell"
import { useActiveTeam } from "@/lib/use-active-team"

export default function RolesRedirect() {
  const active = useActiveTeam()
  const router = useRouter()
  const teamId = active.ctx?.team?.id ?? null
  React.useEffect(() => {
    if (teamId) router.replace(`/t/${teamId}/roles`)
  }, [teamId, router])
  return <ShellLoading />
}
