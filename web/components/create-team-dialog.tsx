"use client"

// Create-team dialog — a name, then the tenancy worker spins up a brand-new
// team with its OWN database (and switches you into it). Library primitives.

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
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure } from "@/lib/api"

const nameField = { ...defaultFieldConfig, label: "Team name", required: true }

export function CreateTeamDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Reset the field whenever the dialog opens fresh.
  React.useEffect(() => {
    if (open) setName("")
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onCreate(name.trim())
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't create the team."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a team</DialogTitle>
          <DialogDescription>
            It gets its own private space. You&apos;ll be its admin.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field config={nameField} htmlFor="team-name">
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              disabled={busy}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
