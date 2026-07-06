// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Card, CardContent } from "@swift-struck/ui/registry/primitives/card/card"
import { Plus, Mail, Upload, Download } from "lucide-react"

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
 * reads as a single unit. The engine renders each list as surface="none" (a flat,
 * un-rounded div — the library's screen-renderer passes it so this Card is the
 * single box, no card-in-a-card). The catch: a flat list's full-bleed selected/
 * hover row shows SQUARE corners inside this rounded card — the library's own
 * surface="card" List avoids that by clipping its rows to a rounded Card. We
 * reproduce that clip here: round + hide-overflow on the list row-group (the
 * element the library marks `divide-y`), so the highlight follows the corners
 * exactly like the library demo. Host-side interim; the proper fix is the library
 * rounding its own surface="none" list — tracked as UI-GAPS #12. */
export function CollectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 [&_.divide-y]:overflow-hidden [&_.divide-y]:rounded-xl">
        {children}
      </CardContent>
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
  download,
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
  /** An optional DOWNLOAD action (Export CSV): a plain link so the browser saves
   * the file with the session cookie — export needs only READ, so it shows for
   * anyone who can see the screen (hidden while the list is empty). */
  download?: { show: boolean; label: string; href: string }
  /** Content shown between the create row and the boxed collection, OUTSIDE the
   * card — e.g. Help's My/All raiser strip (it scopes the list, not part of it). */
  aboveCard?: React.ReactNode
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  const showSecondary = secondary?.show ?? false
  const showDownload = download?.show ?? false
  return (
    <div className="flex flex-col gap-4">
      {(show || showSecondary || showDownload) && (
        // flex-wrap: on a narrow phone a row of action buttons (Export/Import/New)
        // must REFLOW to a new line, never clip. `justify-end` alone pushes overflow
        // off the LEFT edge where the container hides it (the owner's cut-off button).
        // Global UI rule — see UI-CONVENTIONS "Action-button rows never clip".
        <div className="flex flex-wrap justify-end gap-2">
          {showDownload && download && (
            <Button asChild variant="outline" className="gap-1.5">
              <a href={download.href}>
                <Download className="size-4" />
                {download.label}
              </a>
            </Button>
          )}
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
