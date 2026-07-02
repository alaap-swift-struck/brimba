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
// The 3-dot typing indicator shows on the trailing empty assistant bubble whenever a
// turn is running with no reply text yet — the pre-first-event gap, every gap between
// step_end and the next step_start, and the wait for the first reply delta.
// The AI quota (free daily + credits) shows in the header. Using the agent needs
// agent:create; the server re-gates every action AS the signed-in user.
//
// REAL-SCREEN TRACING: on each step_start, if the tool maps to a screen (traceFor)
// we ask the deep-link host to gently move there + ring the control (emitTrace). If
// the user isn't inside /t (e.g. on /home), the host ignores it and we just narrate
// the step — crossing a static route into /t would hard-reload, so we never do that.

import * as React from "react"
import { Plus } from "lucide-react"

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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { ScrollArea } from "@swift-struck/ui/registry/primitives/scroll-area/scroll-area"
import {
  AgentChat,
  type AgentChatItem,
} from "@swift-struck/ui/registry/collections/agent-chat/agent-chat"
import { RunSteps, type RunStep } from "@swift-struck/ui/registry/collections/run-steps/run-steps"

import type { AgentMessage, AgentQuota, PendingCall } from "@shared/types"
import { ApiFailure, dataOps, type AgentStreamEvent, type UsageLogRow } from "@/lib/api"
import { emitTrace, traceFor } from "@/lib/agent-trace"
import { usePermissions } from "@/lib/perms"
import { formatActivityWhen } from "@/lib/format"
import { AgentMarkdown } from "@/components/agent-markdown"

let nextId = 0
const newId = () => `m${++nextId}`

// We remember the last thread per team so reopening the panel resumes it (instead of
// minting a fresh thread each time). localStorage is per-device and best-effort —
// every access is guarded so a locked-down browser never breaks the panel.
const lastThreadKey = (teamId: string) => `brimba:agent:lastThread:${teamId}`
const readLastThread = (teamId: string): string | null => {
  try {
    return localStorage.getItem(lastThreadKey(teamId))
  } catch {
    return null
  }
}
const writeLastThread = (teamId: string, id: string) => {
  try {
    localStorage.setItem(lastThreadKey(teamId), id)
  } catch {
    /* ignore — resume is a nicety, not a requirement */
  }
}
const clearLastThread = (teamId: string) => {
  try {
    localStorage.removeItem(lastThreadKey(teamId))
  } catch {
    /* ignore */
  }
}

/** Map a saved thread's messages back onto chat rows: user/assistant become bubbles
 * (markdown-rendered like a live reply), tool rows become the compact status line
 * with the outcome the server RECORDED (done/failed + the failed step's reason).
 * Rows saved before outcomes were recorded fall back to the fenced content's own
 * verdict ("FAILED: …" vs "OK. …") — never a false green. */
const toChatItems = (messages: AgentMessage[]): AgentChatItem[] =>
  messages.map((m): AgentChatItem =>
    m.role === "tool"
      ? {
          id: m.id,
          role: "tool",
          actionLabel: m.toolCalls?.[0]?.summary ?? m.toolCalls?.[0]?.tool ?? "Action",
          status: m.toolCalls?.[0]?.status ?? (m.content?.startsWith("FAILED") ? "failed" : "done"),
        }
      : { id: m.id, role: m.role, content: <AgentMarkdown text={m.content ?? ""} /> }
  )

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
  const [quota, setQuota] = React.useState<AgentQuota | null>(null)
  // A paused turn awaiting the user's go-ahead — the proposed actions + the text.
  const [pending, setPending] = React.useState<{ calls: PendingCall[]; text: string } | null>(null)

  // The usage view (behind the quota badge): its own open flag + a lazily-loaded
  // log (fetched only when opened) with loading / error states.
  const [usageOpen, setUsageOpen] = React.useState(false)
  const [usageRows, setUsageRows] = React.useState<UsageLogRow[] | null>(null)
  const [usageLoading, setUsageLoading] = React.useState(false)
  const [usageError, setUsageError] = React.useState(false)

  // On open: pull the quota (cheap; not cached — it changes per turn) and, if this is
  // a fresh panel (no messages yet) with a remembered thread for this team, resume it.
  // Rehydrate is best-effort — a failed load must never keep the panel from opening.
  React.useEffect(() => {
    if (!open || !canUse) return
    let alive = true
    dataOps
      .agentUsage()
      .then((r) => alive && setQuota(r.quota))
      .catch(() => {})

    if (teamId && items.length === 0) {
      const stored = readLastThread(teamId)
      if (stored) {
        dataOps
          .agentThread(stored)
          .then((r) => {
            if (!alive) return
            setItems(toChatItems(r.messages))
            setThreadId(stored)
          })
          .catch(() => {
            // The stored thread is gone or unreadable — forget it and start clean.
            if (alive) clearLastThread(teamId)
          })
      }
    }
    return () => {
      alive = false
    }
    // items.length is read as an open-time snapshot, not a trigger — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canUse, teamId])

  // Load the usage log the moment the usage view opens (newest-first, team-scoped).
  // Lazy — the list can be long, so we only fetch on demand, and refetch each open
  // so it reflects the turns just run.
  React.useEffect(() => {
    if (!usageOpen) return
    let alive = true
    setUsageLoading(true)
    setUsageError(false)
    dataOps
      .agentUsageLog(50)
      .then((r) => {
        if (alive) setUsageRows(r.rows)
      })
      .catch(() => {
        if (alive) setUsageError(true)
      })
      .finally(() => {
        if (alive) setUsageLoading(false)
      })
    return () => {
      alive = false
    }
  }, [usageOpen])

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
    const stepIdByTool = new Map<string, string>()

    await run((ev) => {
      switch (ev.t) {
        case "text": {
          replyText += ev.d
          const html = <AgentMarkdown text={replyText} />
          setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: html } : it)))
          break
        }
        case "step_start": {
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
          // A failed step shows WHY on the row itself (the door's short reason, e.g.
          // which permission was missing) — same combined label the server persists.
          const label = ev.ok || !ev.error ? ev.summary : `${ev.summary} — ${ev.error}`
          setItems((prev) =>
            prev.map((it) =>
              it.id === stepId
                ? { ...it, actionLabel: label, status: ev.ok ? "done" : "failed" }
                : it
            )
          )
          break
        }
        case "confirm": {
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
          const out = ev.outcome
          setThreadId(out.threadId)
          // Remember this thread so reopening the panel resumes it (best-effort).
          if (teamId && out.threadId) writeLastThread(teamId, out.threadId)
          setQuota(out.quota)
          const finalText = out.done ? out.reply : (out.assistantText ?? replyText)
          // The server streams EVERYTHING the assistant says as text events, so the
          // accumulated text wins — a lead-in ("I can't create teams, but…") is never
          // overwritten by a later wrap-up note. `final`'s reply is the fallback for
          // a turn that streamed nothing; drop a bubble that stayed empty.
          const text = replyText || finalText
          setItems((prev) =>
            text
              ? prev.map((it) => (it.id === assistantId ? { ...it, content: <AgentMarkdown text={text} /> } : it))
              : prev.filter((it) => it.id !== assistantId)
          )
          break
        }
        case "error": {
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
    // carries the animated 3-dot indicator (showTyping) until reply text streams.
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setBusy(true)
    setPending(null)
    try {
      await consume((onEvent) => dataOps.agentChatStream({ message: text, threadId }, onEvent), assistantId)
    } catch (err) {
      const msg = err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
      setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
    } finally {
      setBusy(false)
    }
  }

  async function resolve(approve: boolean) {
    if (!pending || !threadId || busy) return
    const calls = pending.calls
    const assistantId = newId()
    setBusy(true)
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
    }
  }

  // Start a fresh conversation: clear the transcript + the paused turn, forget the
  // thread (so the next turn mints a new one), and drop the remembered thread so a
  // later reopen doesn't resume this one.
  function newChat() {
    if (busy) return
    setItems([])
    setThreadId(undefined)
    setPending(null)
    if (teamId) clearLastThread(teamId)
  }

  // Animated 3-dot indicator: live while a turn runs and the trailing assistant
  // bubble still has no text — so it fills the gap before the first event, every
  // step_end→step_start gap, and the wait for the first reply delta, then vanishes
  // the moment reply text streams (or a confirm/final drops the empty bubble).
  const lastAssistant = [...items].reverse().find((it) => it.role === "assistant")
  const showTyping = busy && !pending && !lastAssistant?.content

  // The proposed actions as RunSteps (pending until the user decides).
  const confirmSteps: RunStep[] = pending
    ? pending.calls.map((c) => ({ label: c.summary, status: "pending" as const }))
    : []

  const quotaLabel = quota
    ? quota.blocked
      ? "You're out of assistant credits for today"
      : `${quota.remaining} left today${quota.creditBalance > 0 ? ` · ${quota.creditBalance} credits` : ""}`
    : ""

  // The usage view's header line: free left today + purchased balance.
  const usageSummary = quota
    ? `${quota.freeRemaining} of ${quota.freeDaily} free left today · balance ${quota.creditBalance}`
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Assistant</SheetTitle>
            <div className="flex items-center gap-2">
              {quotaLabel && (
                <button
                  type="button"
                  onClick={() => setUsageOpen(true)}
                  className="rounded-full focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                  title="See where your assistant credits went"
                >
                  <Badge
                    variant={quota?.blocked ? "destructive" : "secondary"}
                    className="cursor-pointer text-[10px]"
                  >
                    {quotaLabel}
                  </Badge>
                </button>
              )}
              {canUse && items.length > 0 && (
                <Button variant="outline" size="sm" onClick={newChat} disabled={busy}>
                  <Plus className="size-3.5" aria-hidden /> New chat
                </Button>
              )}
            </div>
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
                streaming={showTyping}
                disabled={busy || quota?.blocked || !!pending}
                // Stacked, email-free example prompts: an inline address gets auto-
                // detected (underlined) on phones and breaks the centred line mid-quote.
                emptyState={
                  <div className="flex max-w-64 flex-col gap-1">
                    <span>Try “invite a teammate as an Editor”</span>
                    <span>or “what changed this week?”</span>
                  </div>
                }
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

      {/* Usage view — where credits went + why. Opened from the quota badge. */}
      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assistant usage</DialogTitle>
            {usageSummary && <DialogDescription>{usageSummary}</DialogDescription>}
          </DialogHeader>
          {usageLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
          ) : usageError ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Couldn&apos;t load usage. Try again.
            </p>
          ) : usageRows && usageRows.length > 0 ? (
            <ScrollArea className="max-h-80">
              <ul className="flex flex-col gap-3 pr-3">
                {usageRows.map((row) => (
                  <li key={row.id} className="border-b pb-3 text-sm last:border-0 last:pb-0">
                    <p className="text-muted-foreground text-xs">
                      {formatActivityWhen(row.createdAt)}
                      {row.actorName ? ` · ${row.actorName}` : ""} · {row.credits}{" "}
                      {row.credits === 1 ? "credit" : "credits"}
                    </p>
                    <p className="mt-0.5">{row.summary}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">No usage yet today.</p>
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
