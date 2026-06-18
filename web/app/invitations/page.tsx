"use client"

// The Invitations inbox screen — where the invite email's "Join" button lands.
// An already-signed-in user sees and accepts their pending invites here; a
// teamless user is bounced to onboarding (which auto-accepts) by useActiveTeam.

import { AppShell, ShellLoading } from "@/components/app-shell"
import { InvitationsPanel } from "@/components/invitations"
import { useActiveTeam } from "@/lib/use-active-team"

export default function InvitationsPage() {
  const active = useActiveTeam()
  if (active.loading || !active.ctx) return <ShellLoading />
  return (
    <AppShell active={active} breadcrumbs={[{ label: "Invitations" }]}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Invitations
        </h2>
        <InvitationsPanel active={active} />
      </div>
    </AppShell>
  )
}
