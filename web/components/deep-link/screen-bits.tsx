// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Card, CardContent } from "@swift-struck/ui/registry/primitives/card/card"
import { Plus, Mail, Upload } from "lucide-react"

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

/** Box a collection (its title/search/filter/rows) into ONE card surface so it
 * reads as a single unit. NOTE: the engine's list already draws each row group
 * in its OWN card (screen-renderer renderList → <List> defaults to
 * surface="card"), so until the library passes surface="none" there this nests a
 * card in a card. Owner is applying that one-line library change alongside the
 * one-row header — after which this Card becomes the single clean box. */
export function CollectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

/** A list screen with a host-rendered create button above it (the engine list
 * has no "add" affordance — creating opens a ?panel form). The collection itself
 * is boxed in a CollectionCard so title/search/filter/rows read as one unit. */
export function SectionWithCreate({
  show,
  label,
  icon,
  onCreate,
  secondary,
  aboveCard,
  children,
}: {
  show: boolean
  label: string
  icon: "plus" | "mail"
  onCreate: () => void
  /** An optional second action beside the create button — today the contextual
   * "Import CSV" affordance on import-target pages (Learning / Member roles). */
  secondary?: { show: boolean; label: string; onClick: () => void }
  /** Content shown between the create row and the boxed collection, OUTSIDE the
   * card — e.g. Help's My/All raiser strip (it scopes the list, not part of it). */
  aboveCard?: React.ReactNode
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  const showSecondary = secondary?.show ?? false
  return (
    <div className="flex flex-col gap-4">
      {(show || showSecondary) && (
        <div className="flex justify-end gap-2">
          {showSecondary && secondary && (
            <Button variant="outline" onClick={secondary.onClick} className="gap-1.5">
              <Upload className="size-4" />
              {secondary.label}
            </Button>
          )}
          {show && (
            <Button onClick={onCreate} className="gap-1.5">
              <Icon className="size-4" />
              {label}
            </Button>
          )}
        </div>
      )}
      {aboveCard}
      <CollectionCard>{children}</CollectionCard>
    </div>
  )
}
