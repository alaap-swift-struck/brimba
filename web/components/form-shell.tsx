"use client"

// FormShell — the ONE layout every form/dialog uses, so create / edit screens are
// predictable and identical across modules (the owner's design-language law):
//
//   title + subtitle   ·   ─── separator ───   ·   the fields   ·   ─── separator ───   ·   action
//
// A host-side recipe assembled from library primitives — NOT a new library
// component. Pass the title as a <DialogTitle> and subtitle as a <DialogDescription>
// (so Radix Dialog a11y stays intact) and the action button(s) as `footer`.

// It is ALSO where LAW R22 lives: creating a MASTER record through a form opens
// that record's detail screen as soon as the row is submitted. It belongs here,
// not in each screen, for the same reason the layout does — a module should get
// the behaviour by declaring one thing, and a screen should not be able to
// forget it.

import * as React from "react"

import { Separator } from "@swift-struck/ui/registry/primitives/separator/separator"

import { openRecord } from "@/lib/nav"

export function FormShell({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
  opensRecord,
}: {
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /** Pass a <DialogDescription>…</DialogDescription>. */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** The action button(s). */
  footer: React.ReactNode
  /** Resolve with the new record's id to trigger `opensRecord` (R21 gives the
   * create doors that id); resolve with nothing for an edit. */
  onSubmit?: (e: React.FormEvent) => void | Promise<void | string | undefined>
  /** LAW R22 — this form CREATES a master record: name the URL segment its
   * detail lives under (+ the active team) and the shell opens the new record.
   * Omit it when the form is EDITING, and for a table named in
   * `CREATE_OPENS_RECORD_EXEMPT` (an accessory row with no detail screen). */
  opensRecord?: { segment: string; teamId: string | null } | null
}) {
  async function handleSubmit(e: React.FormEvent) {
    const id = await onSubmit?.(e)
    // Only a real id navigates: a failed submit throws (the dialog stays open and
    // shows why) and an edit resolves with nothing.
    if (opensRecord && typeof id === "string" && id) openRecord(opensRecord.segment, opensRecord.teamId, id)
  }
  return (
    <form className="flex flex-col" onSubmit={(e) => void handleSubmit(e)}>
      <div className="flex flex-col gap-1.5 pb-4">
        {title}
        {subtitle}
      </div>
      <Separator />
      <div className="flex flex-col gap-4 py-4">{children}</div>
      <Separator />
      <div className="flex flex-wrap justify-end gap-2 pt-4">{footer}</div>
    </form>
  )
}

// Standard label→input spacing for a Field inside a FormShell — a touch more air
// than the library default so the label never looks glued to the input border.
export const fieldSpacing = "gap-2"
