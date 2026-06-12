"use client"

// Home — shows who you are and the team(s) you belong to. The full app shell
// (team hop button, modules nav) arrives with the next phase.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@swift-struck/ui/registry/primitives/card/card"
import { Separator } from "@swift-struck/ui/registry/primitives/separator/separator"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import type { SessionUser, TeamSummary } from "@shared/types"

import { auth, tenancy } from "@/lib/api"

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [teams, setTeams] = React.useState<TeamSummary[]>([])
  const [currentTeamId, setCurrentTeamId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const { user } = await auth.me()
        if (!user.onboardingComplete) {
          router.replace("/onboarding")
          return
        }
        setUser(user)
        const mine = await tenancy.teams()
        setTeams(mine.teams)
        setCurrentTeamId(mine.currentTeamId)
        setLoading(false)
      } catch {
        router.replace("/login")
      }
    }
    void load()
  }, [router])

  if (loading || !user) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center">
        <Spinner />
      </main>
    )
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ")

  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <Card className="animate-rise w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Avatar className="size-16">
            {user.imageUrl && <AvatarImage src={user.imageUrl} alt={fullName} />}
            <AvatarFallback className="text-lg">
              {`${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-2xl">Hey, {user.firstName}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Your teams
          </p>
          <div className="flex flex-col gap-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="hover-lift flex items-center gap-3 rounded-lg border p-3"
              >
                <Avatar className="size-8">
                  {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
                  <AvatarFallback>{team.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {team.name}
                </span>
                {team.id === currentTeamId && <Badge>Current</Badge>}
              </div>
            ))}
            {teams.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No team yet — finish onboarding to create one.
              </p>
            )}
          </div>
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
