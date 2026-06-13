"use client"

// Create-role dialog — a name + optional description. The new role starts with
// no rights; the admin grants them in the permission matrix. Library primitives.

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
import { Textarea } from "@swift-struck/ui/registry/primitives/textarea/textarea"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure } from "@/lib/api"

const titleField = { ...defaultFieldConfig, label: "Role name", required: true }
const descField = { ...defaultFieldConfig, label: "Description", required: false }

export function CreateRoleDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (title: string, description: string) => Promise<void>
}) {
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle("")
      setDescription("")
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onCreate(title.trim(), description.trim())
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't create the role."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a role</DialogTitle>
          <DialogDescription>
            It starts with no access — you&apos;ll switch on what it can do next.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field config={titleField} htmlFor="role-title">
            <Input
              id="role-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Editor"
              disabled={busy}
              autoFocus
            />
          </Field>
          <Field config={descField} htmlFor="role-desc">
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for (optional)."
              disabled={busy}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Creating…" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
