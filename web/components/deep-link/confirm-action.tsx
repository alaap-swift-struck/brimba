// The destructive-confirm AlertDialog for remove-member / revoke-invite, driven
// by ?confirm. Owns its in-flight (busy) state; the parent does the mutation +
// navigation. Gated by `canRun` so a deep link can't reach it (block at every step).

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@swift-struck/ui/registry/primitives/alert-dialog/alert-dialog"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { type ScreenQuery } from "@swift-struck/ui/lib/recipe"

import { personName } from "@/lib/identity"
import type { TeamMember } from "@shared/types"

export function ConfirmAction({
  query,
  canRun,
  memberName,
  onCancel,
  onConfirm,
}: {
  query: ScreenQuery
  /** false → the viewer lacks the delete right; never open (block at every step). */
  canRun: boolean
  memberName: TeamMember | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const open =
    canRun && (query.confirm === "members.remove" || query.confirm === "invites.revoke")
  const isRemove = query.confirm === "members.remove"
  const title = isRemove
    ? `Remove ${memberName ? personName(memberName) : "this member"}?`
    : "Revoke this invite?"
  const body = isRemove
    ? "They lose access to this team right away. You can invite them back later."
    : "They won't be able to join with this invite. You can send a new one later."

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              setBusy(true)
              void onConfirm().finally(() => setBusy(false))
            }}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            {isRemove ? "Remove" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
