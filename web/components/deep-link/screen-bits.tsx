// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Plus, Mail } from "lucide-react"

export function NoAccess() {
  return (
    <p className="text-muted-foreground text-sm">
      You don&apos;t have access to this, or it doesn&apos;t exist.
    </p>
  )
}

export function NotFound() {
  return <p className="text-muted-foreground text-sm">That screen doesn&apos;t exist.</p>
}

export function LoadError({ what }: { what: string }) {
  return <p className="text-destructive text-sm">Couldn&apos;t load {what}.</p>
}

/** A list screen with a host-rendered create button above it (the engine list
 * has no "add" affordance — creating opens a ?panel form). */
export function SectionWithCreate({
  show,
  label,
  icon,
  onCreate,
  children,
}: {
  show: boolean
  label: string
  icon: "plus" | "mail"
  onCreate: () => void
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  return (
    <div className="flex flex-col gap-4">
      {show && (
        <div className="flex justify-end">
          <Button onClick={onCreate} className="gap-1.5">
            <Icon className="size-4" />
            {label}
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}
