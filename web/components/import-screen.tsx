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

export function ImportScreen({ teamId }: { teamId: string }) {
  const { can } = usePermissions(teamId)
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

  async function pickTarget(t: ImportableTarget) {
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
  }

  // Turn a target-keyed preview into the wizard's row[][] (target-field order).
  const toRows = React.useCallback(
    (rows: Record<string, string>[]): string[][] =>
      target ? rows.map((r) => target.columns.map((c) => r[c.key] ?? "")) : [],
    [target]
  )

  async function onFile(file: File) {
    if (!session) return
    setStageStatus({ valid: false, message: "Reading file…" })
    try {
      const csv = await file.text()
      const { session: s, preview } = await dataOps.uploadCsv(session.id, file.name, csv)
      setSession(s)
      setPreviewRows(toRows(preview.rows))
      setStageStatus({
        valid: preview.issues.length === 0,
        message:
          preview.issues.length === 0
            ? `Looks good — ${preview.totalCount} row${preview.totalCount === 1 ? "" : "s"} ready.`
            : preview.issues[0],
      })
    } catch (err) {
      setStageStatus({
        valid: false,
        message: err instanceof ApiFailure ? err.message : "Couldn't read that file.",
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
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't apply that mapping.")
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

  if (targetsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load import targets.</p>
  if (targetsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (allowed.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        You don&apos;t have permission to import into anything yet. You need create access on a
        supported table (Member roles or Learning).
      </p>
    )

  // After a write — show the outcome + a "Import more" reset.
  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Import complete</h1>
        <ul className="text-sm">
          <li>
            <span className="font-medium">{result.created}</span> created
          </li>
          <li>
            <span className="font-medium">{result.skipped}</span> skipped
          </li>
          {result.failed > 0 && (
            <li className="text-destructive">
              <span className="font-medium">{result.failed}</span> failed
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
            Import more
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
          <h1 className="text-2xl font-semibold tracking-tight">Import data</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bring rows in from a CSV. Pick what you&apos;re importing into.
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
          <h1 className="text-2xl font-semibold tracking-tight">Import — {target.displayName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload a CSV, check the preview, then import.
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
          Change target
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
