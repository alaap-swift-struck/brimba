"use client"

// The Invitations inbox — where the invite email's "Join" button lands. A content
// component rendered inside the one deep-link shell (the shell provides AppShell chrome).

import { InvitationsPanel } from "@/components/invitations"
import type { ActiveTeam } from "@/lib/use-active-team"

export function InvitationsScreen({ active }: { active: ActiveTeam }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Invitations
      </h2>
      <InvitationsPanel active={active} />
    </div>
  )
}
