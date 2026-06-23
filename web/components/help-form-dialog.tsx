"use client"

// Help form dialog — raise a new support ticket. Description is required; a short
// type label (Bug, Question…) is optional cosmetic. Every member can see every
// ticket (the My/All tabs are just a raiser filter), so there's no audience
// picker here. Submits to content.createHelp. Library primitives.

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

const descField = { ...defaultFieldConfig, label: "What do you need help with?", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }

export function HelpFormDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { description: string; helpType?: string }) => Promise<void>
}) {
  const [description, setDescription] = React.useState("")
  const [helpType, setHelpType] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setDescription("")
      setHelpType("")
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        description: description.trim(),
        helpType: helpType.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't raise the ticket.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a ticket</DialogTitle>
          <DialogDescription>
            Describe what you&apos;re stuck on. The assistant drafts a first reply, and the team can
            jump in.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field config={descField} htmlFor="help-desc">
            <Textarea
              id="help-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="I can't invite a new member — the button is greyed out."
              disabled={busy}
              rows={4}
              autoFocus
            />
          </Field>
          <Field config={typeField} htmlFor="help-type">
            <Input
              id="help-type"
              value={helpType}
              onChange={(e) => setHelpType(e.target.value)}
              placeholder="Bug, Question, Request… (optional)"
              disabled={busy}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !description.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Raising…" : "Raise ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
