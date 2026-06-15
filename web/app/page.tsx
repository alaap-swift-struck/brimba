"use client"

// The root just redirects to the Home slug (/home) — so the address bar always
// shows where you are. Real landing logic lives in app/home/page.tsx.

import * as React from "react"
import { useRouter } from "next/navigation"

import { ShellLoading } from "@/components/app-shell"

export default function RootRedirect() {
  const router = useRouter()
  React.useEffect(() => {
    router.replace("/home")
  }, [router])
  return <ShellLoading />
}
