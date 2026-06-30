"use client"

// Help status as a left-to-right STEPPER (not a dropdown): Open → In progress →
// Resolved, conveying start / in-motion / done by colour + fill (left-to-right fill
// = progress). `reopened` is not a track stage — it sits at "Open" with a small
// "Reopened" pill (needs attention again). Clicking a stage moves the ticket there
// (gated by help:edit); clicking Open while Resolved is a REOPEN. The server (lib/help
// setStatus) validates the fixed lifecycle, so the stepper can't invent an illegal
// state. Now built on the library StatusStepper primitive; this host keeps the help
// status mapping (the reopen nuance + the "Reopened" pill) and the same external
// props so help-detail needs no change.

import { StatusStepper, type StepperTone } from "@swift-struck/ui/registry/primitives/status-stepper/status-stepper"

export type HelpStatusValue = "open" | "in_progress" | "resolved" | "reopened"

// The three track stages, in order. `reopened` is folded onto "open" (below).
const STAGES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
]

// Per-stage tone (start / in-motion / done) — the same semantic tokens the library
// Badge variants use, so the stepper matches the rest of the app's status colours.
const TONES: Record<string, StepperTone> = {
  open: "neutral",
  in_progress: "warning",
  resolved: "success",
}

export function HelpStatusStepper({
  status,
  canEdit,
  onChange,
  busy,
}: {
  status: HelpStatusValue
  canEdit: boolean
  onChange: (next: HelpStatusValue) => void
  busy?: boolean
}) {
  // `reopened` isn't a track stage — show it sitting at "Open" with a "Reopened" pill.
  const reopened = status === "reopened"
  const current = reopened ? "open" : status
  const stages = reopened
    ? STAGES.map((s) => (s.value === "open" ? { ...s, label: "Open · Reopened" } : s))
    : STAGES

  function change(stage: string) {
    // The one nuance vs the raw stage: clicking Open while Resolved is a reopen.
    const next: HelpStatusValue =
      stage === "open" && status === "resolved" ? "reopened" : (stage as HelpStatusValue)
    if (next !== status) onChange(next)
  }

  return (
    <StatusStepper
      stages={stages}
      value={current}
      tones={TONES}
      disabled={!canEdit || busy}
      onChange={canEdit ? change : undefined}
    />
  )
}
