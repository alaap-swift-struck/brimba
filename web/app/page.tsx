"use client"

// Home — the active team's hub. Shows which team you're in, the role you hold,
// and the map of what you can manage. Each section card lights up as its phase
// ships; until then it says so (no dead links).

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@swift-struck/ui/registry/primitives/card/card"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Users, ShieldCheck, UserPlus, Settings } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { useActiveTeam } from "@/lib/use-active-team"

// The team-management sections. `ready: false` ones announce they're coming
// (they turn into real links as each phase ships).
const SECTIONS = [
  { key: "members", title: "Members", desc: "Who's on the team", icon: Users, ready: false },
  { key: "roles", title: "Roles & permissions", desc: "What each role can do", icon: ShieldCheck, ready: false },
  { key: "invites", title: "Invites", desc: "Invite people by email", icon: UserPlus, ready: false },
  { key: "settings", title: "Team settings", desc: "Name, logo and more", icon: Settings, ready: false },
] as const

export default function HomePage() {
  const active = useActiveTeam()
  const { loading, ctx } = active

  if (loading || !ctx) return <ShellLoading />

  return (
    <AppShell active={active}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {/* Team identity */}
        <div className="animate-rise flex items-center gap-4">
          <Avatar className="size-14">
            {ctx.team?.logoUrl && (
              <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />
            )}
            <AvatarFallback className="text-xl">
              {ctx.team?.name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {ctx.team?.name}
            </h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              {ctx.role && <Badge variant="secondary">{ctx.role.title}</Badge>}
              <span>
                {ctx.memberCount} member{ctx.memberCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        {/* Section map */}
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <Card
                key={s.key}
                role="button"
                tabIndex={0}
                onClick={() =>
                  s.ready
                    ? undefined
                    : toast.info(`${s.title} is coming in the next build.`)
                }
                className="hover-lift animate-rise cursor-pointer"
              >
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {s.title}
                      {!s.ready && (
                        <Badge variant="outline" className="text-[10px]">
                          Soon
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {s.desc}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
