"use client"

// The sign-in screen. All real logic lives in the temp AuthCard placeholder
// (see UI-GAPS.md — the library will absorb it as `auth-card`).

import { useRouter } from "next/navigation"

import { AuthCard } from "@/components/temp/auth-card"

export default function LoginPage() {
  const router = useRouter()
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <AuthCard onSignedIn={() => router.replace("/")} />
    </main>
  )
}
