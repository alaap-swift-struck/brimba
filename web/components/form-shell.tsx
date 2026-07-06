"use client"

// FormShell — the ONE layout every form/dialog uses, so create / edit screens are
// predictable and identical across modules (the owner's design-language law):
//
//   title + subtitle   ·   ─── separator ───   ·   the fields   ·   ─── separator ───   ·   action
//
// A host-side recipe assembled from library primitives — NOT a new library
// component. Pass the title as a <DialogTitle> and subtitle as a <DialogDescription>
// (so Radix Dialog a11y stays intact) and the action button(s) as `footer`.

import * as React from "react"

import { Separator } from "@swift-struck/ui/registry/primitives/separator/separator"

export function FormShell({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /** Pass a <DialogDescription>…</DialogDescription>. */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** The action button(s). */
  footer: React.ReactNode
  onSubmit?: (e: React.FormEvent) => void
}) {
  return (
    <form className="flex flex-col" onSubmit={onSubmit}>
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
