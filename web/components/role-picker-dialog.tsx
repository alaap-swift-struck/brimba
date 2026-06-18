"use client"

// Role-picker dialog — pick one role from the team's roles for a given member.
// Reusable: the Members screen uses it to change a member's role; the Roles
// screen will reuse it later. Library primitives (Dialog + RadioGroup).

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import {
  RadioGroup,
  RadioGroupItem,
} from "@swift-struck/ui/registry/primitives/radio-group/radio-group"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import type { TeamRole } from "@shared/types"
import { ApiFailure } from "@/lib/api"

export function RolePickerDialog({
  open,
  onOpenChange,
  roles,
  currentRoleId,
  subjectName,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: TeamRole[]
  /** The role the subject currently holds. When set, it's hidden from the list
   * (shown as static "Current role: …" text) so you can only pick a different one. */
  currentRoleId: string | null
  /** Who the role is for — shown in the description (e.g. a member's name). */
  subjectName: string | null
  onPick: (roleId: string) => Promise<void>
}) {
  // No preselection: the current role isn't in the list, so start empty and let
  // the person pick a *different* role.
  const [selected, setSelected] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Re-seed (clear) the selection each time the dialog opens for a (new) subject.
  React.useEffect(() => {
    if (open) setSelected(null)
  }, [open, currentRoleId])

  // Hide the member's CURRENT role from the choices — you can only pick a
  // different one. Only filter when we know their current role.
  const currentTitle =
    currentRoleId != null
      ? (roles.find((r) => r.id === currentRoleId)?.title ?? null)
      : null
  const choices =
    currentRoleId != null ? roles.filter((r) => r.id !== currentRoleId) : roles

  async function save() {
    if (!selected) return
    setBusy(true)
    try {
      await onPick(selected)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't change the role."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            {subjectName
              ? `Pick the role for ${subjectName}.`
              : "Pick a role."}
          </DialogDescription>
        </DialogHeader>

        {currentTitle && (
          <p className="text-muted-foreground text-sm">
            Current role: <span className="text-foreground font-medium">{currentTitle}</span>
          </p>
        )}

        <RadioGroup
          value={selected ?? undefined}
          onValueChange={setSelected}
          className="gap-2"
        >
          {choices.map((r) => (
            <label
              key={r.id}
              htmlFor={`role-${r.id}`}
              className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
            >
              <RadioGroupItem
                id={`role-${r.id}`}
                value={r.id}
                className="mt-0.5"
                disabled={busy}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{r.title}</div>
                {r.description && (
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {r.description}
                  </div>
                )}
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
              </span>
            </label>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button
            onClick={() => void save()}
            disabled={busy || !selected}
          >
            {busy ? <Spinner /> : null}
            {busy ? "Saving…" : "Save role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
