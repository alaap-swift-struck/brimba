"use client"

// The sign-in screen. All real logic lives in the temp AuthCard placeholder
// (see UI-GAPS.md — the library will absorb it as `auth-card`).

import { useRouter } from "next/navigation"

import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"

import { AuthCard } from "@/components/temp/auth-card"

export default function LoginPage() {
  const router = useRouter()
  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <AuthCard onSignedIn={() => router.replace("/home")} />
    </main>
  )
}
