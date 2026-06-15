"use client"

// Member roles moved into Settings → Teams → [team] → Member roles tab. Keep
// this path as a redirect so old links still land in the right place.

import * as React from "react"
import { useRouter } from "next/navigation"

import { ShellLoading } from "@/components/app-shell"

export default function RolesRedirect() {
  const router = useRouter()
  React.useEffect(() => {
    router.replace("/settings/team?tab=roles")
  }, [router])
  return <ShellLoading />
}
