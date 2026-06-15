"use client"

// Members moved into Settings → Teams → [team] → Members tab. Keep this path as
// a redirect so old links still land in the right place.

import * as React from "react"
import { useRouter } from "next/navigation"

import { ShellLoading } from "@/components/app-shell"

export default function MembersRedirect() {
  const router = useRouter()
  React.useEffect(() => {
    router.replace("/settings/team?tab=members")
  }, [router])
  return <ShellLoading />
}
