"use client"

// Invite dialog — invite someone by email to an active role. Opened from the
// Invites screen (?panel=add) and closed via the URL (Back dismisses it). The
// caller does the actual create + cache refresh; this owns the form + busy +
// error toast. Library primitives.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { FormShell, fieldSpacing } from "@/components/form-shell"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@swift-struck/ui/registry/primitives/select/select"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Mail } from "lucide-react"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import type { TeamRole } from "@shared/types"
import { ApiFailure } from "@/lib/api"
import { reportError } from "@/lib/log"

const emailField = { ...defaultFieldConfig, label: "Email", required: true }
const roleField = { ...defaultFieldConfig, label: "Role", required: true }

export function InviteDialog({
  open,
  onOpenChange,
  roles,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active roles only — the caller pre-filters (the server rejects inactive). */
  roles: TeamRole[]
  onSubmit: (email: string, roleId: string) => Promise<void>
}) {
  const [email, setEmail] = React.useState("")
  const [roleId, setRoleId] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Re-seed each open: clear the email, default the role to the first non-Admin.
  React.useEffect(() => {
    if (!open) return
    setEmail("")
    setRoleId((roles.find((r) => !r.isDefault) ?? roles[0])?.id ?? "")
  }, [open, roles])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !roleId) return
    setBusy(true)
    try {
      await onSubmit(email.trim(), roleId)
      onOpenChange(false)
    } catch (err) {
      // ApiFailure carries the server's specific reason (e.g. "They're already on
      // this team."). Anything else is a network/runtime fault — log it so a
      // generic toast is never mistaken for a permission block.
      if (!(err instanceof ApiFailure)) reportError("invite:send", err)
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't send the invite — please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>Invite someone to the team</DialogTitle>}
          subtitle={
            <DialogDescription>
              We&apos;ll email them an invite to join in the role you pick.
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !email.trim() || !roleId} className="gap-1.5">
              {busy ? <Spinner /> : <Mail className="size-4" />}
              {busy ? "Sending…" : "Send invite"}
            </Button>
          }
        >
          <Field config={emailField} htmlFor="invite-email" className={fieldSpacing}>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={busy}
              autoFocus
            />
          </Field>
          <Field config={roleField} htmlFor="invite-role" className={fieldSpacing}>
            <Select value={roleId} onValueChange={setRoleId} disabled={busy}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
