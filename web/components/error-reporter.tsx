"use client"

// Mounts the global error/unhandled-rejection listeners once, at the app root,
// so async crashes (which React error boundaries can't catch) are reported with
// their real message + stack. Renders nothing. See web/lib/log.ts.

import * as React from "react"

import { installGlobalErrorReporting } from "@/lib/log"

export function ErrorReporter() {
  React.useEffect(() => {
    installGlobalErrorReporting()
  }, [])
  return null
}
