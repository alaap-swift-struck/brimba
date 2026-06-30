"use client"

// Learning form dialog — create a new article OR edit an existing one's content.
// `initial` present = edit mode (prefilled). Title is required. Category and Content
// type are pure DROPDOWNS from the team's dropdown values (with a gated "Manage
// dropdowns" link to add options). The single rich-text CONTENT field (library Notes
// editor → sanitized HTML) is the article — what your team reads and the assistant
// reads to answer Help. Shared FormShell layout; per-session draft (CACHING.md §11).

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Notes } from "@swift-struck/ui/registry/primitives/notes/notes"
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
import { FormShell, fieldSpacing } from "@/components/form-shell"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"

const titleField = { ...defaultFieldConfig, label: "Title", required: true }
const categoryField = { ...defaultFieldConfig, label: "Category", required: false }
const typeField = { ...defaultFieldConfig, label: "Content type", required: false }
const linkField = { ...defaultFieldConfig, label: "External link", required: false }
const bodyField = { ...defaultFieldConfig, label: "Content", required: false }

// Radix Select can't hold an empty value, so "no choice" uses a sentinel.
const NONE = "__none__"

/** What the form prefills from / submits — the editable surface of a Learning. */
export type LearningFormValues = {
  title: string
  category: string
  contentType: string
  contentLink: string
  /** the article content — rich text as sanitized HTML */
  body: string
}

export function LearningFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  draftKey,
  teamId,
  categoryOptions = [],
  contentTypeOptions = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode (prefilled); absent = create mode */
  initial?: LearningFormValues | null
  onSubmit: (values: LearningFormValues) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** the active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
  /** existing "Learning category" values to pick from */
  categoryOptions?: string[]
  /** existing "File type" values to pick from */
  contentTypeOptions?: string[]
}) {
  const isEdit = !!initial
  const initialValues: LearningFormValues = {
    title: initial?.title ?? "",
    category: initial?.category || NONE,
    contentType: initial?.contentType || NONE,
    contentLink: initial?.contentLink ?? "",
    body: initial?.body ?? "",
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  // `seed` re-keys the uncontrolled rich-text editor so it remounts with the draft.
  const [values, setValues, clearDraft, seed] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        category: values.category === NONE ? "" : values.category,
        contentType: values.contentType === NONE ? "" : values.contentType,
        contentLink: values.contentLink.trim(),
        body: values.body,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the article.")
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
          title={<DialogTitle>{isEdit ? "Edit this article" : "Write a how-to"}</DialogTitle>}
          subtitle={
            <DialogDescription>
              {isEdit
                ? "Update what this article teaches. The content is also what the assistant reads to help your team."
                : "Share a how-to your team can read right here. The content also helps the assistant answer questions."}
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !values.title.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create article"}
            </Button>
          }
        >
          <Field config={titleField} htmlFor="learning-title" className={fieldSpacing}>
            <Input
              id="learning-title"
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              placeholder="How to onboard a new client"
              disabled={busy}
              autoFocus
            />
          </Field>

          <Field config={categoryField} htmlFor="learning-category" className={fieldSpacing}>
            <Select
              value={values.category}
              onValueChange={(category) => setValues((v) => ({ ...v, category }))}
              disabled={busy}
            >
              <SelectTrigger id="learning-category">
                <SelectValue placeholder="Choose a category (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field config={typeField} htmlFor="learning-type" className={fieldSpacing}>
            <Select
              value={values.contentType}
              onValueChange={(contentType) => setValues((v) => ({ ...v, contentType }))}
              disabled={busy}
            >
              <SelectTrigger id="learning-type">
                <SelectValue placeholder="Choose a type (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No type</SelectItem>
                {contentTypeOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ManageDropdownsLink teamId={teamId ?? null} />
          </Field>

          <Field config={linkField} htmlFor="learning-link" className={fieldSpacing}>
            <Input
              id="learning-link"
              type="url"
              value={values.contentLink}
              onChange={(e) => setValues((v) => ({ ...v, contentLink: e.target.value }))}
              placeholder="https://… (optional)"
              disabled={busy}
            />
          </Field>

          <Field config={bodyField} htmlFor="learning-body" className={fieldSpacing}>
            <Notes
              key={seed}
              defaultValue={values.body}
              onChange={(html) => setValues((v) => ({ ...v, body: html }))}
              placeholder="Write the article — bold, italic, highlight, and lists are supported."
              className="min-h-40"
            />
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
