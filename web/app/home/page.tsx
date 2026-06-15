"use client"

// Home (slug: /home) — a light landing for the active team. The actual
// management lives under Settings → Teams → the team's tabs; Home orients you
// and links in. The quick-links list is bordered (a border, not a card fill).

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { useRouter } from "next/navigation"
import { Users, Settings, ChevronRight } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { useActiveTeam } from "@/lib/use-active-team"

const LINKS = [
  { title: "Team", desc: "Members, roles and invites", icon: Users, href: "/settings/team" },
  { title: "Settings", desc: "Your account and teams", icon: Settings, href: "/settings" },
] as const

export default function HomePage() {
  const active = useActiveTeam()
  const router = useRouter()
  const { loading, ctx } = active

  if (loading || !ctx) return <ShellLoading />

  return (
    <AppShell active={active}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="animate-rise flex items-center gap-4">
          <Avatar className="size-14">
            {ctx.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
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

        <div className="animate-rise divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
          {LINKS.map((l) => {
            const Icon = l.icon
            return (
              <button
                key={l.href}
                type="button"
                onClick={() => router.push(l.href)}
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
              >
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.title}</div>
                  <div className="text-muted-foreground truncate text-sm">{l.desc}</div>
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
