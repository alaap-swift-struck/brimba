"use client"

// Import screen — the AGENTIC multi-file wizard at /t/<teamId>/import
// (AGENTIC-IMPORT.md). Drop one or many spreadsheets (CSV native; XLSX converted
// in the browser), then:
//   1. the AGENT reads the files + builds a PLAN (which table each feeds, column
//      mappings, normalizations, the dependency order, predicted rejects) — metered;
//   2. you REVIEW the plan (one confirmation, not per row);
//   3. it RUNS in dependency order, writing every row through the same gated create
//      endpoint the UI uses (so imported rows get the same audit trail as typed
//      ones), and returns a per-row REPORT with reasons for anything rejected.
// Host-composed (bespoke) because the multi-file plan-review UX isn't an engine
// recipe. Gated by the caller holding create on at least one import target.

import * as React from "react"
import { Download, FileSpreadsheet, Sparkles, Upload, X } from "lucide-react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import type { ImportBatchReport, ImportBatchView } from "@shared/types"
import { ApiFailure, dataOps } from "@/lib/api"
import { usePermissions } from "@/lib/perms"

type Phase = "upload" | "review" | "done"

/** A friendly error whose message we surface verbatim (vs a generic toast). */
class UserFileError extends Error {}

/** Read a dropped file to CSV text. CSV/TSV are read directly. XLSX is intentionally
 * NOT parsed in-app yet: the only mature browser parser (SheetJS npm) ships with a
 * HIGH security advisory, and this base is meant to stay clean + reusable — so we ask
 * for a CSV (one export click in Excel/Numbers) rather than pull in a risky dep.
 * Safe direct-XLSX support is the next enhancement (UI-GAPS / AGENTIC-IMPORT §9). */
async function fileToCsv(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls"))
    throw new UserFileError(
      `Excel files aren't read directly yet. In Excel or Numbers, choose File → Export / Save As → CSV, then drop "${file.name.replace(/\.xl\w+$/i, ".csv")}" here.`
    )
  return file.text()
}

export function ImportScreen({ teamId }: { teamId: string; initialTarget?: string }) {
  const { perms, loading: permsLoading } = usePermissions(teamId)
  const canImport = perms ? Object.values(perms).some((m) => m?.create) : false

  const [phase, setPhase] = React.useState<Phase>("upload")
  const [batch, setBatch] = React.useState<ImportBatchView | null>(null)
  const [report, setReport] = React.useState<ImportBatchReport | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [busyNote, setBusyNote] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement>(null)

  const files = batch?.files ?? []

  async function addFiles(list: FileList | null) {
    if (!list || !list.length || busy) return
    setBusy(true)
    setBusyNote("Reading your files…")
    try {
      let id = batch?.id
      if (!id) id = (await dataOps.batchStart()).batch.id
      let latest: ImportBatchView | null = batch
      for (const file of Array.from(list)) {
        const csv = await fileToCsv(file)
        latest = (await dataOps.batchAddFile(id, file.name, csv)).batch
      }
      setBatch(latest)
    } catch (err) {
      const msg =
        err instanceof UserFileError || err instanceof ApiFailure ? err.message : "Couldn't read that file."
      toast.error(msg)
    } finally {
      setBusy(false)
      setBusyNote("")
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function plan() {
    if (!batch || busy) return
    setBusy(true)
    setBusyNote("The assistant is reading your files and building a plan…")
    try {
      const r = await dataOps.batchPlan(batch.id)
      setBatch(r.batch)
      setPhase("review")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't plan the import.")
    } finally {
      setBusy(false)
      setBusyNote("")
    }
  }

  async function run() {
    if (!batch || busy) return
    setBusy(true)
    setBusyNote("Importing your data…")
    try {
      const r = await dataOps.batchConfirm(batch.id)
      setReport(r.report)
      setPhase("done")
      toast.success(`Imported ${r.report.created} row(s).`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "The import didn't finish.")
    } finally {
      setBusy(false)
      setBusyNote("")
    }
  }

  function reset() {
    setBatch(null)
    setReport(null)
    setPhase("upload")
  }

  function downloadRejections() {
    if (!report?.rejections.length) return
    // Neutralize formula-injection (a file named "=cmd()") like the server exporter.
    const esc = (raw: string) => {
      const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv =
      "file,row,reason\r\n" +
      report.rejections.map((r) => [esc(r.file), r.row, esc(r.reason)].join(",")).join("\r\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }))
    a.download = "import-rejections.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---- guards (wait for rights before judging — a loading `can` reads false) ----
  if (permsLoading && perms === undefined) return <Skeleton variant="list" lines={4} />
  if (perms === undefined)
    return <p className="text-destructive text-sm">Couldn&apos;t load your access rights. Refresh to try again.</p>
  if (!canImport)
    return (
      <p className="text-muted-foreground text-sm">
        There&apos;s nothing here you can import into yet. You can import once you&apos;re allowed to create
        Roles, Learning articles or Dropdown values.
      </p>
    )

  return (
    <div className="flex flex-col gap-4">
      {busyNote && (
        <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Sparkles className="size-4 animate-pulse" aria-hidden /> {busyNote}
        </div>
      )}

      {/* 1 · UPLOAD */}
      {phase === "upload" && (
        <div className="flex flex-col gap-4">
          <label
            className="border-muted-foreground/25 hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void addFiles(e.dataTransfer.files)
            }}
          >
            <Upload className="text-muted-foreground size-6" aria-hidden />
            <span className="text-sm font-medium">Drop your spreadsheets here, or click to choose</span>
            <span className="text-muted-foreground text-xs">
              CSV files. Add several at once — the assistant sorts out how they connect. (Excel? Export
              it as CSV first.)
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,text/csv"
              multiple
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
              disabled={busy}
            />
          </label>

          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              {files.map((f) => (
                <div key={f.fileId} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">{f.rowCount} rows</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Planning uses the assistant (a few credits), so you can review before anything is written.
                </p>
                <Button onClick={() => void plan()} disabled={busy} className="gap-1.5">
                  <Sparkles className="size-4" aria-hidden /> Analyze &amp; plan
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2 · REVIEW THE PLAN */}
      {phase === "review" && batch?.plan && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Here&apos;s the plan</p>
              <p className="text-muted-foreground text-xs">
                {batch.plan.steps.length} file(s) →{" "}
                {batch.plan.order.length} table(s), in order. Review, then run once.
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {batch.plan.bySource === "agent" ? "Planned by the assistant" : "Auto-matched"}
            </Badge>
          </div>

          {batch.plan.warnings.map((w, i) => (
            <p key={i} className="text-destructive bg-destructive/10 rounded-lg p-2.5 text-xs">
              {w}
            </p>
          ))}

          {batch.plan.steps.map((step, i) => (
            <div key={step.fileId} className="flex flex-col gap-2.5 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Step {i + 1}
                </Badge>
                <span className="text-sm font-medium">{step.fileName}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="text-sm font-medium">{step.targetName}</span>
                <span className="text-muted-foreground text-xs">· {step.rowCount} rows</span>
              </div>

              {step.references.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Uses{" "}
                  {step.references.map((r) => (
                    <span key={r.column} className="text-foreground font-medium">
                      {r.column}
                    </span>
                  ))}{" "}
                  from an earlier table — that&apos;s why order matters.
                </p>
              )}

              <div className="flex flex-col gap-1">
                {Object.entries(step.mapping).map(([ourCol, theirHeader]) => (
                  <div key={ourCol} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 font-medium">{ourCol}</span>
                    <span className="text-muted-foreground">←</span>
                    {theirHeader ? (
                      <span>{theirHeader}</span>
                    ) : (
                      <span className="text-muted-foreground italic">not in your file</span>
                    )}
                    {step.transforms[ourCol] && (
                      <Badge variant="secondary" className="text-[9px]">
                        {step.transforms[ourCol]}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {step.predictedRejects > 0 && (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  ~{step.predictedRejects} row(s) may be skipped — {step.notes}
                </p>
              )}
            </div>
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPhase("upload")} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => void run()} disabled={busy || !batch.plan.order.length} className="gap-1.5">
              <Upload className="size-4" aria-hidden /> Run import
            </Button>
          </div>
        </div>
      )}

      {/* 3 · REPORT */}
      {phase === "done" && report && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Stat label="Added" value={report.created} tone="good" />
            <Stat label="Skipped" value={report.skipped} tone={report.skipped ? "warn" : "muted"} />
            <Stat label="Failed" value={report.failed} tone={report.failed ? "bad" : "muted"} />
          </div>

          {report.perTarget.map((t) => (
            <div key={t.target} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
              <span className="flex-1 font-medium">{t.targetName}</span>
              <span className="text-muted-foreground text-xs">
                {t.created} added · {t.skipped} skipped · {t.failed} failed
              </span>
            </div>
          ))}

          {report.rejections.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Rejected rows ({report.rejections.length})</p>
                <Button variant="outline" size="sm" onClick={downloadRejections} className="gap-1.5">
                  <Download className="size-3.5" aria-hidden /> Download to fix
                </Button>
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border">
                {report.rejections.slice(0, 50).map((r, i) => (
                  <div key={i} className="flex gap-2 border-b p-2 text-xs last:border-0">
                    <span className="text-muted-foreground w-24 shrink-0 truncate">
                      {r.file}:{r.row}
                    </span>
                    <span>{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={reset} className="gap-1.5">
              <Upload className="size-4" aria-hidden /> Import more
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "muted" }) {
  const color =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-500"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "bad"
          ? "text-destructive"
          : "text-muted-foreground"
  return (
    <div className="flex-1 rounded-xl border p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}
