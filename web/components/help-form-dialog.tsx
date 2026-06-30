"use client"

// Help form dialog — raise a NEW ticket, or EDIT one (when `initial` is present).
// Description is required; Type is an optional DROPDOWN drawn from the team's
// "Help type" dropdown values (selectable_data). Every member can see every ticket
// (the My/All tabs are just a raiser filter), so there's no audience picker.
// Library primitives.

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
import { Textarea } from "@swift-struck/ui/registry/primitives/textarea/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@swift-struck/ui/registry/primitives/select/select"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@/lib/use-form-draft"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"

const descField = { ...defaultFieldConfig, label: "What do you need help with?", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }

// Radix Select can't hold an empty value, so "no type" uses a sentinel.
const NONE = "__none__"

export function HelpFormDialog({
  open,
  onOpenChange,
  onSubmit,
  helpTypeOptions,
  initial,
  draftKey,
  teamId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { description: string; helpType?: string }) => Promise<void>
  /** The team's active "Help type" dropdown values. */
  helpTypeOptions: string[]
  /** Present = EDIT mode (prefilled). */
  initial?: { description: string; helpType?: string | null }
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
}) {
  const isEdit = !!initial
  const initialValues = {
    description: initial?.description ?? "",
    helpType: initial?.helpType || NONE,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        description: values.description.trim(),
        helpType: values.helpType === NONE ? undefined : values.helpType,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? "Couldn't save the ticket."
            : "Couldn't raise the ticket."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) clearDraft() // dismissing the form (Esc / backdrop / close) discards the draft
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>{isEdit ? "Edit this ticket" : "Raise a ticket"}</DialogTitle>}
          subtitle={
            <DialogDescription>
              {isEdit
                ? "Update what you're asking for. Everyone on the ticket will see the change."
                : "Describe the problem you're facing. Chat with others, or use this ticket as a forum to discuss solutions."}
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !values.description.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? (isEdit ? "Saving…" : "Raising…") : isEdit ? "Save changes" : "Raise ticket"}
            </Button>
          }
        >
          <Field config={descField} htmlFor="help-desc" className={fieldSpacing}>
            <Textarea
              id="help-desc"
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="Tell us what's going on — e.g. I can't invite a new member, the button is greyed out."
              disabled={busy}
              rows={4}
              autoFocus
            />
          </Field>
          <Field config={typeField} htmlFor="help-type" className={fieldSpacing}>
            <Select
              value={values.helpType}
              onValueChange={(helpType) => setValues((v) => ({ ...v, helpType }))}
              disabled={busy}
            >
              <SelectTrigger id="help-type">
                <SelectValue placeholder="Choose a type (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No type</SelectItem>
                {helpTypeOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ManageDropdownsLink teamId={teamId ?? null} />
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
