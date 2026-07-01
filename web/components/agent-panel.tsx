"use client"

// AgentPanel — the app-wide AI co-pilot, mounted as a right-side sheet from the
// deep-link host (which owns go() + runAction() + the cache), so the agent can
// drive real screens. Built on the library AgentChat.
//
// STREAMING: each turn POSTs to dataOps.agentChatStream and consumes a Server-Sent
// event stream. `text` deltas grow the current assistant bubble word-by-word; each
// tool run shows as a LIVE STEP ROW that goes pending → done (green) / failed (red)
// with the server's name-resolved summary. Exactly one terminal event ends a turn:
//   • confirm → the turn PAUSED for a yes/no (only the two destructive acts do this);
//     we surface the proposed actions + approve / decline. Approving resumes via
//     dataOps.agentConfirmStream, so the continuation ALSO streams and the step rows
//     accumulate across the confirm boundary.
//   • final   → the run finished; settle the reply + quota + threadId.
//   • error   → show a clean message.
// The 3-dot typing indicator shows only for the brief gap before the first event.
// The AI quota (free daily + credits) shows in the header. Using the agent needs
// agent:create; the server re-gates every action AS the signed-in user.
//
// REAL-SCREEN TRACING: on each step_start, if the tool maps to a screen (traceFor)
// we ask the deep-link host to gently move there + ring the control (emitTrace). If
// the user isn't inside /t (e.g. on /home), the host ignores it and we just narrate
// the step — crossing a static route into /t would hard-reload, so we never do that.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@swift-struck/ui/registry/primitives/sheet/sheet"
import {
  AgentChat,
  type AgentChatItem,
} from "@swift-struck/ui/registry/collections/agent-chat/agent-chat"
import { RunSteps, type RunStep } from "@swift-struck/ui/registry/collections/run-steps/run-steps"

import type { AgentQuota, PendingCall } from "@shared/types"
import { ApiFailure, dataOps, type AgentStreamEvent } from "@/lib/api"
import { emitTrace, traceFor } from "@/lib/agent-trace"
import { usePermissions } from "@/lib/perms"
import { AgentMarkdown } from "@/components/agent-markdown"

let nextId = 0
const newId = () => `m${++nextId}`

export function AgentPanel({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { can } = usePermissions(teamId)
  const canUse = can("agent", "create")

  const [items, setItems] = React.useState<AgentChatItem[]>([])
  const [threadId, setThreadId] = React.useState<string | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)
  // True only between "turn started" and "first event landed" — drives the lone
  // 3-dot indicator. Once text/steps flow, the growing content carries the rhythm.
  const [awaitingFirst, setAwaitingFirst] = React.useState(false)
  const [quota, setQuota] = React.useState<AgentQuota | null>(null)
  // A paused turn awaiting the user's go-ahead — the proposed actions + the text.
  const [pending, setPending] = React.useState<{ calls: PendingCall[]; text: string } | null>(null)

  // Pull the quota when the panel opens (cheap; not cached — it changes per turn).
  React.useEffect(() => {
    if (!open || !canUse) return
    let alive = true
    dataOps
      .agentUsage()
      .then((r) => alive && setQuota(r.quota))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open, canUse])

  /** Consume one agent stream (chat or confirm-continuation) into the live UI.
   * `assistantId` is the empty assistant bubble already appended for this turn —
   * text deltas fill it, steps insert tool rows before it, and the terminal event
   * settles the turn. Shared by send() and resolve() so behaviour is identical
   * across the confirm boundary. */
  async function consume(
    run: (onEvent: (ev: AgentStreamEvent) => void) => Promise<void>,
    assistantId: string
  ) {
    // The assistant reply text accrues here so we don't chase stale state on each
    // rapid delta; step rows are keyed by tool so step_end can flip the right one.
    let replyText = ""
    let firstSeen = false
    const stepIdByTool = new Map<string, string>()

    const markFirst = () => {
      if (firstSeen) return
      firstSeen = true
      setAwaitingFirst(false)
    }

    await run((ev) => {
      switch (ev.t) {
        case "text": {
          markFirst()
          replyText += ev.d
          const html = <AgentMarkdown text={replyText} />
          setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: html } : it)))
          break
        }
        case "step_start": {
          markFirst()
          const stepId = newId()
          stepIdByTool.set(ev.tool, stepId)
          // Insert the pending tool row BEFORE the assistant bubble (steps run, then
          // the reply lands under them).
          setItems((prev) => {
            const idx = prev.findIndex((it) => it.id === assistantId)
            const row: AgentChatItem = { id: stepId, role: "tool", actionLabel: ev.summary, status: "pending" }
            if (idx < 0) return [...prev, row]
            return [...prev.slice(0, idx), row, ...prev.slice(idx)]
          })
          // Real-screen trace: drive the matching screen if the host is showing this
          // team (it ignores the request otherwise, and we just narrate the step).
          // step_start carries only tool + summary (no input), so a detail-target
          // tool resolves to its record path with an empty id — the host parses that
          // as the LIST level, i.e. the collection where the row updates live. We
          // strip the dangling "/" so it's a clean list URL, not "…/members/".
          if (teamId) {
            const target = traceFor(ev.tool, {}, teamId)
            if (target)
              emitTrace({ teamId, target: { ...target, path: target.path.replace(/\/$/, "") } })
          }
          break
        }
        case "step_end": {
          const stepId = stepIdByTool.get(ev.tool)
          setItems((prev) =>
            prev.map((it) =>
              it.id === stepId
                ? { ...it, actionLabel: ev.summary, status: ev.ok ? "done" : "failed" }
                : it
            )
          )
          break
        }
        case "confirm": {
          markFirst()
          // Terminal: a destructive act needs a yes/no. Drop the empty bubble (the
          // confirm panel carries the lead-in) unless the model sent lead-in text.
          setItems((prev) =>
            ev.text
              ? prev.map((it) =>
                  it.id === assistantId ? { ...it, content: <AgentMarkdown text={ev.text as string} /> } : it
                )
              : prev.filter((it) => it.id !== assistantId)
          )
          setPending({ calls: ev.calls, text: ev.text ?? "" })
          break
        }
        case "final": {
          markFirst()
          const out = ev.outcome
          setThreadId(out.threadId)
          setQuota(out.quota)
          const finalText = out.done ? out.reply : (out.assistantText ?? replyText)
          // Prefer the streamed text if the final omitted it; drop an empty bubble.
          const text = finalText || replyText
          setItems((prev) =>
            text
              ? prev.map((it) => (it.id === assistantId ? { ...it, content: <AgentMarkdown text={text} /> } : it))
              : prev.filter((it) => it.id !== assistantId)
          )
          break
        }
        case "error": {
          markFirst()
          setItems((prev) =>
            prev.map((it) => (it.id === assistantId ? { ...it, content: ev.message } : it))
          )
          break
        }
      }
    })
  }

  async function send(text: string) {
    if (busy) return
    const assistantId = newId()
    // Optimistic: the user's message appears instantly, and an empty assistant row
    // shows the 3-dot indicator (awaitingFirst) until the first event arrives.
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setBusy(true)
    setAwaitingFirst(true)
    setPending(null)
    try {
      await consume((onEvent) => dataOps.agentChatStream({ message: text, threadId }, onEvent), assistantId)
    } catch (err) {
      const msg = err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
      setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
    } finally {
      setBusy(false)
      setAwaitingFirst(false)
    }
  }

  async function resolve(approve: boolean) {
    if (!pending || !threadId || busy) return
    const calls = pending.calls
    const assistantId = newId()
    setBusy(true)
    setAwaitingFirst(true)
    setPending(null)
    // On decline, reflect each proposed action as a skipped (failed) row, then wrap
    // up. On approve we DON'T pre-render the rows — the streamed step_* events do it
    // live (with the real ok/failed outcome), so the rows match what actually ran.
    setItems((prev) => [
      ...prev,
      ...(approve
        ? []
        : calls.map(
            (c): AgentChatItem => ({ id: newId(), role: "tool", actionLabel: c.summary, status: "failed" })
          )),
      { id: assistantId, role: "assistant", content: "" },
    ])
    try {
      await consume(
        (onEvent) =>
          dataOps.agentConfirmStream({ threadId, approve, calls: approve ? calls : [] }, onEvent),
        assistantId
      )
    } catch (err) {
      const msg =
        err instanceof ApiFailure ? err.message : "I couldn't make those changes. Please try again."
      setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
    } finally {
      setBusy(false)
      setAwaitingFirst(false)
    }
  }

  // The proposed actions as RunSteps (pending until the user decides).
  const confirmSteps: RunStep[] = pending
    ? pending.calls.map((c) => ({ label: c.summary, status: "pending" as const }))
    : []

  const quotaLabel = quota
    ? quota.blocked
      ? "You're out of assistant credits for today"
      : `${quota.remaining} left today${quota.creditBalance > 0 ? ` · ${quota.creditBalance} credits` : ""}`
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Assistant</SheetTitle>
            {quotaLabel && (
              <Badge variant={quota?.blocked ? "destructive" : "secondary"} className="text-[10px]">
                {quotaLabel}
              </Badge>
            )}
          </div>
          <SheetDescription>Ask me anything, or tell me what to change — I&apos;ll only do what you can do.</SheetDescription>
        </SheetHeader>

        {!canUse ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
            The assistant isn&apos;t available for your role here.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {/* Fill the sheet and shed the component's own card chrome (it ships
               * as a standalone fixed-height card) so it reads as one panel, not a
               * card-in-a-card with a double border. The 3-dot indicator shows only
               * in the gap before the first streamed event. */}
              <AgentChat
                className="h-full rounded-none border-0 bg-transparent"
                items={items}
                streaming={awaitingFirst}
                disabled={busy || quota?.blocked || !!pending}
                emptyState="Try “invite sam@acme.com as an Editor” or “what changed this week?”"
                onSend={(t) => void send(t)}
              />
            </div>

            {/* A paused turn: the proposed actions + approve / decline. */}
            {pending && (
              <div className="flex flex-col gap-3 border-t p-4">
                <p className="text-sm font-medium">I&apos;d like to make these changes:</p>
                <RunSteps steps={confirmSteps} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => void resolve(false)} disabled={busy}>
                    Not now
                  </Button>
                  <Button size="sm" onClick={() => void resolve(true)} disabled={busy}>
                    Go ahead
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
