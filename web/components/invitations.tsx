"use client"

// Invitations inbox — invites the signed-in person has RECEIVED (by email).
// The fix for "I was invited but have no way to see/accept it": this works for
// ANY signed-in user, not just a teamless one at onboarding. Accepting joins the
// team AND makes it active (the locked "join + switch" choice). Cache-first via
// useCached, with one shared key so the page, the Settings section and the
// switcher badge all stay in sync.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import type { ReceivedInvite } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { primeCache, useCached } from "@/lib/store"
import type { ActiveTeam } from "@/lib/use-active-team"

/** The signed-in person's pending received invitations. Shared cache key so the
 * inbox page, the Settings section and the switcher badge stay in lock-step. */
export function useReceivedInvites() {
  return useCached<ReceivedInvite[]>("invitations", () =>
    tenancy.receivedInvitations().then((r) => r.invitations)
  )
}

export function InvitationsPanel({ active }: { active: ActiveTeam }) {
  const router = useRouter()
  const invitesQ = useReceivedInvites()
  const invites = invitesQ.data
  const [accepting, setAccepting] = React.useState<string | null>(null)

  async function accept(inv: ReceivedInvite) {
    setAccepting(inv.id)
    try {
      const res = await tenancy.acceptInvitation(inv.id)
      primeCache("invitations", res.invitations)
      // Join + switch: refresh reloads the context, whose active team is now the
      // one just joined.
      await active.refresh()
      toast.success(`Joined ${inv.teamName}`)
      if (res.invitations.length === 0) router.push("/home")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't accept the invitation."
      )
    } finally {
      setAccepting(null)
    }
  }

  if (invitesQ.error)
    return <p className="text-destructive text-sm">Couldn&apos;t load your invitations.</p>
  if (invites === undefined) return <Skeleton variant="list" lines={2} />
  if (invites.length === 0)
    return (
      <p className="text-muted-foreground border-border/60 rounded-xl border py-8 text-center text-sm">
        No pending invitations.
      </p>
    )

  return (
    <div className="divide-border/60 overflow-hidden rounded-xl border divide-y">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar className="size-9 shrink-0">
              {inv.teamLogoUrl && <AvatarImage src={inv.teamLogoUrl} alt={inv.teamName} />}
              <AvatarFallback className="text-xs">
                {inv.teamName[0]?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{inv.teamName}</div>
              <div className="text-muted-foreground text-xs">Invited to join this team.</div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void accept(inv)}
            disabled={accepting !== null}
            className="w-full gap-1.5 sm:w-auto sm:shrink-0"
          >
            {accepting === inv.id ? <Spinner /> : null}
            {accepting === inv.id ? "Joining…" : "Accept"}
          </Button>
        </div>
      ))}
    </div>
  )
}
