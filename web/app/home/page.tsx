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
import { List } from "@swift-struck/ui/registry/collections/list/list"
import { useRouter } from "next/navigation"
import { Users, Settings, ChevronRight } from "lucide-react"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { letterMark } from "@/lib/identity"
import { useActiveTeam } from "@/lib/use-active-team"

export default function HomePage() {
  const active = useActiveTeam()
  const router = useRouter()
  const { loading, ctx } = active

  if (loading || !ctx) return <ShellLoading />

  // The team area lives at /t/<teamId> now (members / roles / invites are its
  // sections); Settings is your account + teams.
  const LINKS = [
    {
      title: "Team",
      desc: "Members, roles and invites",
      icon: Users,
      href: ctx.team ? `/t/${ctx.team.id}` : "/settings",
    },
    { title: "Settings", desc: "Your account and teams", icon: Settings, href: "/settings" },
  ]

  return (
    <AppShell active={active}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="animate-rise flex items-center gap-4">
          <Avatar className="size-14">
            {ctx.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
            <AvatarFallback className="text-xl">
              {letterMark(ctx.team?.name)}
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

        <List
          surface="none"
          className="animate-rise rounded-xl border"
          onItemClick={(item) => router.push(item.id)}
          items={LINKS.map((l) => {
            const Icon = l.icon
            return {
              id: l.href,
              leading: (
                <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </span>
              ),
              title: l.title,
              subtitle: l.desc,
              trailing: <ChevronRight className="text-muted-foreground size-4" />,
            }
          })}
        />
      </div>
    </AppShell>
  )
}
