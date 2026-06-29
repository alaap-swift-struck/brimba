"use client"

// Help status as a left-to-right STEPPER (not a dropdown): Open → In progress →
// Resolved, conveying start / in-motion / done by colour + fill (left-to-right fill
// = progress). `reopened` is not a track stage — it sits at "Open" with a small
// "Reopened" pill (needs attention again). Clicking a stage moves the ticket there
// (gated by help:edit); clicking Open while Resolved is a REOPEN. The server (lib/help
// setStatus) validates the fixed lifecycle, so the stepper can't invent an illegal
// state. Host-side for now; flagged for library absorption as `status-stepper`.

import { Check } from "lucide-react"

export type HelpStatusValue = "open" | "in_progress" | "resolved" | "reopened"

const STAGES = [
  { value: "open", label: "Open", hint: "Just raised" },
  { value: "in_progress", label: "In progress", hint: "Being worked on" },
  { value: "resolved", label: "Resolved", hint: "All sorted" },
] as const

// Per-stage tone (start / in-motion / done) — the same token palette the library
// Badge variants use, so the stepper matches the rest of the app's status colours.
const TONE = [
  "bg-secondary text-secondary-foreground",
  "bg-warning text-warning-foreground",
  "bg-success text-success-foreground",
]

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
  const order = ["open", "in_progress", "resolved"] as const
  const activeIndex = status === "reopened" ? 0 : order.indexOf(status as (typeof order)[number])

  function click(stage: (typeof order)[number]) {
    if (!canEdit || busy) return
    // The one nuance vs the raw stage: clicking Open while Resolved is a reopen.
    const next: HelpStatusValue = stage === "open" && status === "resolved" ? "reopened" : stage
    if (next !== status) onChange(next)
  }

  return (
    <div role="group" aria-label="Ticket status" className="flex w-full max-w-full items-stretch gap-1.5">
      {STAGES.map((stage, i) => {
        const reached = i <= activeIndex
        const isActive = i === activeIndex
        return (
          <div key={stage.value} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => click(stage.value)}
              aria-current={isActive ? "step" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-opacity disabled:cursor-default ${
                reached
                  ? `${TONE[i]} border-transparent`
                  : "bg-muted/40 text-muted-foreground border-border/60"
              } ${canEdit && !busy ? "cursor-pointer hover:opacity-90" : ""}`}
            >
              <span className="flex w-full items-center gap-1 text-xs font-medium">
                {i < activeIndex && <Check className="size-3 shrink-0" aria-hidden />}
                <span className="truncate">{stage.label}</span>
                {isActive && status === "reopened" && (
                  <span className="ml-auto rounded-full border border-current px-1.5 text-[10px] leading-tight">
                    Reopened
                  </span>
                )}
              </span>
              <span className="truncate text-[10px] opacity-80">{stage.hint}</span>
            </button>
            {i < STAGES.length - 1 && <span className="h-px w-3 shrink-0 bg-border" aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}
