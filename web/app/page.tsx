"use client"

// Home — for now just proof of being signed in (name, email, sign out).
// Onboarding + teams replace this next.

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@swift-struck/ui/registry/primitives/card/card"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import type { SessionUser } from "@shared/types"

import { auth } from "@/lib/api"

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [checking, setChecking] = React.useState(true)

  React.useEffect(() => {
    auth
      .me()
      .then((res) => setUser(res.user))
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false))
  }, [router])

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="animate-rise w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-2xl">You&apos;re in 🎉</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Login works end-to-end. Next up: onboarding and your first team.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              void auth.logout().then(() => router.replace("/login"))
            }
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
