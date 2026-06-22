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
import { List } from "@swift-struck/ui/registry/collections/list/list"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import type { ReceivedInvite } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { letterMark } from "@/lib/identity"
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

  // Library List (flat surface + a border to match the design language). Rows
  // aren't clickable — the trailing Accept button is the only action.
  return (
    <List
      surface="none"
      className="rounded-xl border"
      empty="No pending invitations."
      items={invites.map((inv) => ({
        id: inv.id,
        leading: (
          <Avatar className="size-9">
            {inv.teamLogoUrl && <AvatarImage src={inv.teamLogoUrl} alt={inv.teamName} />}
            <AvatarFallback className="text-xs">
              {letterMark(inv.teamName)}
            </AvatarFallback>
          </Avatar>
        ),
        title: inv.teamName,
        subtitle: "Invited to join this team.",
        trailing: (
          <Button
            size="sm"
            onClick={() => void accept(inv)}
            disabled={accepting !== null}
            className="gap-1.5"
          >
            {accepting === inv.id ? <Spinner /> : null}
            {accepting === inv.id ? "Joining…" : "Accept"}
          </Button>
        ),
      }))}
    />
  )
}
