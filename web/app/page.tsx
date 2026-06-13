"use client"

// Home — the active team's hub. Shows which team you're in, the role you hold,
// and the map of what you can manage as a flat list (no card surfaces — the
// items sit directly on the screen background). Each row lights up as its phase
// ships; until then it says so (no dead links).

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { useRouter } from "next/navigation"
import { Users, ShieldCheck, UserPlus, Settings, ChevronRight } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { useActiveTeam } from "@/lib/use-active-team"

// The team-management sections. `ready` ones link to their screen; the rest
// announce they're coming (they turn into real links as each phase ships).
const SECTIONS = [
  { key: "members", title: "Members", desc: "Who's on the team", icon: Users, ready: true, href: "/members" },
  { key: "roles", title: "Roles & permissions", desc: "What each role can do", icon: ShieldCheck, ready: true, href: "/roles" },
  { key: "invites", title: "Invites", desc: "Invite people by email", icon: UserPlus, ready: false, href: null },
  { key: "settings", title: "Team settings", desc: "Name, logo and more", icon: Settings, ready: false, href: null },
] as const

export default function HomePage() {
  const active = useActiveTeam()
  const router = useRouter()
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

        {/* Section map — a flat list, hairline-separated, no card surface */}
        <div className="animate-rise divide-border/60 flex flex-col divide-y">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  s.ready && s.href
                    ? router.push(s.href)
                    : toast.info(`${s.title} is coming in the next build.`)
                }
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-2 py-3.5 text-left transition-colors"
              >
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {s.title}
                    {!s.ready && (
                      <Badge variant="outline" className="text-[10px]">
                        Soon
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate text-sm">
                    {s.desc}
                  </div>
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
