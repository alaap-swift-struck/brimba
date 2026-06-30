"use client"

// AgentPanel — the app-wide AI co-pilot, mounted as a right-side sheet from the
// deep-link host (which owns go() + runAction() + the cache), so the agent can
// drive real screens. Built on the library AgentChat: each turn POSTs to
// dataOps.agentChat(message, threadId). A turn either finishes (done:true → an
// assistant reply) or PAUSES for confirmation (done:false → needsConfirm:
// PendingCall[]). When it pauses we surface the proposed actions with RunSteps and
// ask the user to approve (→ agentConfirm(threadId, true, calls)) or decline (→
// agentConfirm(threadId, false, [])). The AI quota (free daily + credits) shows in
// the header. Using the agent needs agent:create; viewing past threads needs
// agent:read.

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
import { ApiFailure, dataOps } from "@/lib/api"
import { usePermissions } from "@/lib/perms"

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

  async function send(text: string) {
    if (busy) return
    const thinkingId = newId()
    // Optimistic + Intercom rhythm: the user's message appears instantly, and an
    // empty assistant row shows the animated "thinking" dots (driven by `streaming`)
    // until the reply lands and fills it in.
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: text },
      { id: thinkingId, role: "assistant", content: "" },
    ])
    setBusy(true)
    setPending(null)
    try {
      const out = await dataOps.agentChat(text, threadId)
      setThreadId(out.threadId)
      setQuota(out.quota)
      const replyText = out.done ? out.reply : (out.assistantText ?? "")
      setItems((prev) =>
        replyText
          ? prev.map((it) => (it.id === thinkingId ? { ...it, content: replyText } : it))
          : prev.filter((it) => it.id !== thinkingId)
      )
      if (!out.done) setPending({ calls: out.needsConfirm, text })
    } catch (err) {
      const msg = err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
      setItems((prev) => prev.map((it) => (it.id === thinkingId ? { ...it, content: msg } : it)))
    } finally {
      setBusy(false)
    }
  }

  async function resolve(approve: boolean) {
    if (!pending || !threadId || busy) return
    const calls = pending.calls
    setBusy(true)
    const thinkingId = newId()
    // Reflect each proposed action as a tool row (done on approve, else skipped),
    // then a thinking bubble while the assistant wraps up.
    setItems((prev) => [
      ...prev,
      ...calls.map(
        (c): AgentChatItem => ({
          id: newId(),
          role: "tool",
          actionLabel: c.summary,
          status: approve ? "done" : "failed",
        })
      ),
      { id: thinkingId, role: "assistant", content: "" },
    ])
    setPending(null)
    try {
      const r = await dataOps.agentConfirm(threadId, approve, approve ? calls : [])
      setQuota(r.quota)
      setItems((prev) =>
        r.reply
          ? prev.map((it) => (it.id === thinkingId ? { ...it, content: r.reply } : it))
          : prev.filter((it) => it.id !== thinkingId)
      )
    } catch (err) {
      const msg = err instanceof ApiFailure ? err.message : "I couldn't make those changes. Please try again."
      setItems((prev) => prev.map((it) => (it.id === thinkingId ? { ...it, content: msg } : it)))
    } finally {
      setBusy(false)
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
               * card-in-a-card with a double border. */}
              <AgentChat
                className="h-full rounded-none border-0 bg-transparent"
                items={items}
                streaming={busy && !pending}
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
