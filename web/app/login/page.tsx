"use client"

// The sign-in screen. All real logic lives in the temp AuthCard placeholder
// (see UI-GAPS.md — the library will absorb it as `auth-card`).

import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"

import { AuthCard } from "@/components/temp/auth-card"
import { softNavigate } from "@/lib/nav"

// A transition that changes AUTH STATE is a HARD navigation, never a client-side
// router.replace: the whole shell (session, active team, live channel, caches)
// must re-initialise for the new identity, and a soft nav would carry the old
// one across. It also keeps the app off the framework's RSC-payload URLs, which
// a static export serves as text/plain — see CONVENTIONS "Navigating after the
// identity changes".
export default function LoginPage() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <AuthCard onSignedIn={() => softNavigate("/home")} />
    </main>
  )
}
