"use client"

// Import screen — the host-composed 3-stage data import at /t/<teamId>/import.
// Pick a target (from the owner-maintained catalog, filtered to the ones you can
// CREATE — import has no permission key of its own, it borrows the target
// module's create right), then drive the library ImportWizard:
//   • onFile   → read the CSV text, uploadCsv (the server auto-maps + previews)
//   • onMapping→ setMapping (re-preview with an adjusted mapping)
//   • onConfirm→ confirmImport (act-as-you writes through the gated endpoints)
// The result (created / skipped / failed) is shown after the write. The whole
// screen is gated by the caller having create on at least one target.
//
// NOTE: the library wizard keys its column-map UI off SOURCE columns; the
// fetchers surface the server's already-applied auto-mapping + a target-keyed
// preview, not the raw file headers — so the stage-2 remap is seeded from the
// target schema and the happy path leans on the server's auto-map. Surfacing the
// source headers for a richer remap is a deferred back-end change.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import {
  ImportWizard,
  type ImportStageStatus,
} from "@swift-struck/ui/registry/collections/import-wizard/import-wizard"

import type { ImportableTarget } from "@shared/types"
import {
  ApiFailure,
  dataOps,
  type ImportResultView,
  type ImportSessionView,
  type ImportTargetView,
} from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { useCached } from "@/lib/store"

export function ImportScreen({
  teamId,
  initialTarget,
}: {
  teamId: string
  /** A tableKey to import into straight away (from /t/<team>/import/<tableKey>) —
   * skips the picker. Falls back to the picker if it isn't an allowed target. */
  initialTarget?: string
}) {
  const { can, perms, loading: permsLoading } = usePermissions(teamId)
  const targetsQ = useCached<ImportableTarget[]>(`import-targets:${teamId}`, () =>
    dataOps.importTargets().then((r) => r.targets)
  )

  // The targets you may import into — gated by `create` on the target's module
  // (tableKey === module for the supported targets).
  const allowed = (targetsQ.data ?? []).filter((t) => t.active && can(t.tableKey, "create"))

  // The flow state — a chosen target/session, the latest preview, the result.
  const [session, setSession] = React.useState<ImportSessionView | null>(null)
  const [target, setTarget] = React.useState<ImportTargetView | null>(null)
  const [stageStatus, setStageStatus] = React.useState<ImportStageStatus | undefined>(undefined)
  const [previewRows, setPreviewRows] = React.useState<string[][]>([])
  const [result, setResult] = React.useState<ImportResultView | null>(null)

  const pickTarget = React.useCallback(async (t: ImportableTarget) => {
    try {
      const { session: s, target: tv } = await dataOps.startImport(t.tableKey)
      setSession(s)
      setTarget(tv)
      setStageStatus(undefined)
      setPreviewRows([])
      setResult(null)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't start the import.")
    }
  }, [])

  // Pre-target from the URL (the "Import CSV" buttons on Learning / Member roles
  // land on /t/<team>/import/<tableKey>) — auto-start that target once, so the
  // user lands straight in the wizard instead of the picker.
  const autoPicked = React.useRef(false)
  React.useEffect(() => {
    if (autoPicked.current || !initialTarget || targetsQ.data === undefined) return
    const t = targetsQ.data.find(
      (x) => x.active && x.tableKey === initialTarget && can(x.tableKey, "create")
    )
    if (t) {
      autoPicked.current = true
      void pickTarget(t)
    }
  }, [initialTarget, targetsQ.data, can, pickTarget])

  // Turn a target-keyed preview into the wizard's row[][] (target-field order).
  const toRows = React.useCallback(
    (rows: Record<string, string>[]): string[][] =>
      target ? rows.map((r) => target.columns.map((c) => r[c.key] ?? "")) : [],
    [target]
  )

  async function onFile(file: File) {
    if (!session) return
    setStageStatus({ valid: false, message: "Reading your file…" })
    try {
      const csv = await file.text()
      const { session: s, preview } = await dataOps.uploadCsv(session.id, file.name, csv)
      setSession(s)
      setPreviewRows(toRows(preview.rows))
      setStageStatus({
        valid: preview.issues.length === 0,
        message:
          preview.issues.length === 0
            ? `Looks good — ${preview.totalCount} row${preview.totalCount === 1 ? "" : "s"} ready to import.`
            : preview.issues[0],
      })
    } catch (err) {
      setStageStatus({
        valid: false,
        message: err instanceof ApiFailure ? err.message : "I couldn't read that file. Make sure it's a CSV.",
      })
    }
  }

  async function onMappingChange(mapping: Record<string, string>) {
    if (!session) return
    try {
      const { session: s, preview } = await dataOps.setMapping(session.id, mapping)
      setSession(s)
      setPreviewRows(toRows(preview.rows))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the columns. Please try again.")
    }
  }

  async function onConfirm() {
    if (!session) return
    try {
      const { result: r } = await dataOps.confirmImport(session.id)
      setResult(r)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't finish the import.")
    }
  }

  if (targetsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load what you can import into.</p>
  // Wait for BOTH the catalog AND your rights — `can` answers false while rights
  // are still loading, so deciding "nothing to import into" before they're known
  // showed an Admin the wrong message (the bug the owner hit on mobile).
  if (targetsQ.data === undefined || (perms === undefined && permsLoading))
    return <Skeleton variant="list" lines={4} />
  if (perms === undefined)
    return <p className="text-destructive text-sm">Couldn&apos;t load your access rights. Refresh to try again.</p>
  if (allowed.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        There&apos;s nothing here you can import into yet. You can import once you&apos;re allowed
        to create Roles or Learning articles.
      </p>
    )

  // After a write — show the outcome + a "Import more" reset.
  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">All done</h1>
        <ul className="text-sm">
          <li>
            <span className="font-medium">{result.created}</span> added
          </li>
          <li>
            <span className="font-medium">{result.skipped}</span> skipped
          </li>
          {result.failed > 0 && (
            <li className="text-destructive">
              <span className="font-medium">{result.failed}</span> couldn&apos;t add
            </li>
          )}
        </ul>
        {result.errors.length > 0 && (
          <ul className="text-muted-foreground list-disc pl-5 text-xs">
            {result.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setSession(null)
              setTarget(null)
              setResult(null)
            }}
          >
            Import another file
          </Button>
        </div>
      </div>
    )
  }

  // Target picker — until a target/session is chosen.
  if (!session || !target) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import from a spreadsheet</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bring rows in from a CSV file. First, pick what you&apos;re importing into.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {allowed.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void pickTarget(t)}
              className="border-border/60 hover:bg-muted/50 flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors"
            >
              <span className="font-medium">{t.displayName}</span>
              {t.description && (
                <span className="text-muted-foreground text-sm">{t.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // The chosen target's schema = the wizard's target fields + the seed mapping.
  const targetSchema = {
    fields: target.columns.map((c) => ({ key: c.key, label: c.label, required: c.required })),
  }
  // Seed the wizard's stage-2 map from the target schema (identity) — the server
  // has already auto-mapped the file; this keeps required-field validation happy.
  const suggestedMapping: Record<string, string> = Object.fromEntries(
    target.columns.map((c) => [c.key, c.key])
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import into {target.displayName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload your file, check the preview, then import.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSession(null)
            setTarget(null)
          }}
        >
          Choose something else
        </Button>
      </div>
      <ImportWizard
        // Remount per session so the wizard re-reads the seed mapping cleanly.
        key={session.id}
        targetSchema={targetSchema}
        suggestedMapping={suggestedMapping}
        previewRows={previewRows}
        stageStatus={stageStatus}
        onFile={(f) => void onFile(f)}
        onMappingChange={(m) => void onMappingChange(m)}
        onConfirm={() => void onConfirm()}
      />
    </div>
  )
}
