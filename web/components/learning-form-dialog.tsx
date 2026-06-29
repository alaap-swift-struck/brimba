"use client"

// Learning form dialog — create a new article OR edit an existing one's content.
// `initial` present = edit mode (prefilled). Title is required; Category and Content
// type are PICK-OR-CREATE (choose an existing dropdown value or type a new one).
// The in-app body is what the assistant later reads to answer Help. Uses the shared
// FormShell layout. Library primitives.

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
import { Textarea } from "@swift-struck/ui/registry/primitives/textarea/textarea"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShell, fieldSpacing } from "@/components/form-shell"

const titleField = { ...defaultFieldConfig, label: "Title", required: true }
const categoryField = { ...defaultFieldConfig, label: "Category", required: false }
const descField = { ...defaultFieldConfig, label: "Description", required: false }
const typeField = { ...defaultFieldConfig, label: "Content type", required: false }
const linkField = { ...defaultFieldConfig, label: "External link", required: false }
const bodyField = { ...defaultFieldConfig, label: "Article body", required: false }

/** What the form prefills from / submits — the editable surface of a Learning. */
export type LearningFormValues = {
  title: string
  category: string
  description: string
  contentType: string
  contentLink: string
  body: string
}

export function LearningFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  categoryOptions = [],
  contentTypeOptions = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode (prefilled); absent = create mode */
  initial?: LearningFormValues | null
  onSubmit: (values: LearningFormValues) => Promise<void>
  /** existing "Learning category" values — pick one or type a new one. */
  categoryOptions?: string[]
  /** existing "File type" values — pick one or type a new one. */
  contentTypeOptions?: string[]
}) {
  const isEdit = !!initial
  const [values, setValues] = React.useState<LearningFormValues>({
    title: "",
    category: "",
    description: "",
    contentType: "",
    contentLink: "",
    body: "",
  })
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setValues({
        title: initial?.title ?? "",
        category: initial?.category ?? "",
        description: initial?.description ?? "",
        contentType: initial?.contentType ?? "",
        contentLink: initial?.contentLink ?? "",
        body: initial?.body ?? "",
      })
    }
  }, [open, initial])

  const set =
    (k: keyof LearningFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        category: values.category.trim(),
        description: values.description.trim(),
        contentType: values.contentType.trim(),
        contentLink: values.contentLink.trim(),
        body: values.body,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the article.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>{isEdit ? "Edit this article" : "Write a how-to"}</DialogTitle>}
          subtitle={
            <DialogDescription>
              {isEdit
                ? "Update what this article teaches. The body is also what the assistant reads to help your team."
                : "Share a how-to your team can read right here. The body also helps the assistant answer questions."}
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
              onChange={set("title")}
              placeholder="How to onboard a new client"
              disabled={busy}
              autoFocus
            />
          </Field>
          <Field config={categoryField} htmlFor="learning-category" className={fieldSpacing}>
            <Input
              id="learning-category"
              list="learning-categories"
              value={values.category}
              onChange={set("category")}
              placeholder="Pick a category or type a new one"
              disabled={busy}
            />
            <datalist id="learning-categories">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field config={descField} htmlFor="learning-desc" className={fieldSpacing}>
            <Input
              id="learning-desc"
              value={values.description}
              onChange={set("description")}
              placeholder="A one-line summary (optional)."
              disabled={busy}
            />
          </Field>
          <Field config={typeField} htmlFor="learning-type" className={fieldSpacing}>
            <Input
              id="learning-type"
              list="learning-content-types"
              value={values.contentType}
              onChange={set("contentType")}
              placeholder="Guide, Video, Checklist…"
              disabled={busy}
            />
            <datalist id="learning-content-types">
              {contentTypeOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field config={linkField} htmlFor="learning-link" className={fieldSpacing}>
            <Input
              id="learning-link"
              type="url"
              value={values.contentLink}
              onChange={set("contentLink")}
              placeholder="https://… (optional)"
              disabled={busy}
            />
          </Field>
          <Field config={bodyField} htmlFor="learning-body" className={fieldSpacing}>
            <Textarea
              id="learning-body"
              value={values.body}
              onChange={set("body")}
              placeholder="Write the article. **bold**, # headings and - bullets are supported."
              disabled={busy}
              rows={6}
            />
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
