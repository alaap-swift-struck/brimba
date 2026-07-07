"use client"

// AgentPanel — the app-wide AI co-pilot, mounted as a right-side sheet from the
// deep-link host (which owns go() + runAction() + the cache), so the agent can
// drive real screens. Built on the library AgentChat.
//
// This file is the RENDER SHELL only. The whole state machine — the transcript,
// streaming consumption (text deltas / live step rows / the confirm pause /
// terminal settle), per-device + cross-device thread resume, the broken-stream
// re-sync, staged file attachments (the chat import) and the send / confirm /
// new-chat / open-thread actions — lives in web/lib/use-agent-chat.tsx. The
// usage + history dialogs are self-contained components beside this one.
//
// The AI quota (free daily + credits) shows in the header. Using the agent needs
// agent:create; the server re-gates every action AS the signed-in user.

import * as React from "react"
import { History, Plus } from "lucide-react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@swift-struck/ui/registry/primitives/sheet/sheet"
import { AgentChat } from "@swift-struck/ui/registry/collections/agent-chat/agent-chat"
import { RunSteps } from "@swift-struck/ui/registry/collections/run-steps/run-steps"

import { AgentHistoryDialog } from "@/components/agent-history-dialog"
import { AgentUsageDialog } from "@/components/agent-usage-dialog"
import { useAgentChat } from "@/lib/use-agent-chat"
import { usePermissions } from "@/lib/perms"

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

  const chat = useAgentChat(teamId, open, canUse)
  const [usageOpen, setUsageOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Hand focus to the composer once the sheet has animated in — Radix focuses the
  // PANEL by default, so keystrokes hit it (and paint a focus ring around the whole
  // slide-in) instead of the message box. Best-effort: if the textarea isn't there
  // (no rights), nothing happens.
  React.useEffect(() => {
    if (!open || !canUse) return
    const t = setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(".agent-chat-host textarea")?.focus()
    }, 120)
    return () => clearTimeout(t)
  }, [open, canUse])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* outline-none: the Radix panel itself takes focus on open — without this,
       * pressing Enter/arrows draws the browser's focus ring around the WHOLE
       * slide-in (the owner's "weird outline"). Harmless but ugly; the effect
       * above moves focus into the composer instead. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 outline-none sm:max-w-lg">
        {/* pe-12 reserves room on the right for the Sheet's own absolute close ✕
         * (top-4 right-4) — without it the ✕ sits on top of the New chat button and
         * swallows its taps (the bug the owner hit). */}
        <SheetHeader className="border-b p-4 pe-12">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Assistant</SheetTitle>
            {canUse && (
              <div className="flex items-center gap-1.5">
                {chat.quotaLabel && (
                  <button
                    type="button"
                    onClick={() => setUsageOpen(true)}
                    className="rounded-full focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                    title="See where your assistant credits went"
                  >
                    <Badge
                      variant={chat.quota?.blocked ? "destructive" : "secondary"}
                      className="cursor-pointer text-[10px]"
                    >
                      {chat.quotaLabel}
                    </Badge>
                  </button>
                )}
                {/* History: past conversations (resume any, incl. one started on
                 * another device). size-10 ≈ a real thumb target (the size-8 pair
                 * was too small to hit on a phone); bordered so they read as
                 * buttons, not decorations. */}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10"
                  onClick={() => setHistoryOpen(true)}
                  disabled={chat.busy}
                  title="Past conversations"
                  aria-label="Past conversations"
                >
                  <History className="size-5" aria-hidden />
                </Button>
                {chat.items.length > 0 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    onClick={chat.newChat}
                    disabled={chat.busy}
                    title="New chat"
                    aria-label="New chat"
                  >
                    <Plus className="size-5" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
          <SheetDescription>Ask me anything, or tell me what to change — I&apos;ll only do what you can do.</SheetDescription>
        </SheetHeader>

        {!canUse ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
            The assistant isn&apos;t available for your role here.
          </div>
        ) : (
          // agent-chat-host scopes the composer autofocus selector. Dropping files
          // anywhere on the panel stages them for the chat import, same as the
          // composer's own paperclip (library 0.4.0 attach slot).
          <div
            className="agent-chat-host flex min-h-0 flex-1 flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void chat.addAttachments(e.dataTransfer.files)
            }}
          >
            <div className="min-h-0 flex-1">
              {/* Fill the sheet and shed the component's own card chrome (it ships
               * as a standalone fixed-height card) so it reads as one panel, not a
               * card-in-a-card with a double border. The 3-dot indicator shows only
               * in the gap before the first streamed event. */}
              <AgentChat
                className="h-full rounded-none border-0 bg-transparent"
                items={chat.items}
                streaming={chat.showTyping}
                disabled={chat.busy || chat.quota?.blocked || !!chat.pending}
                // Stacked, email-free example prompts: an inline address gets auto-
                // detected (underlined) on phones and breaks the centred line mid-quote.
                emptyState={
                  <div className="flex max-w-64 flex-col gap-1">
                    <span>Try “invite a teammate as an Editor”</span>
                    <span>or “what changed this week?”</span>
                  </div>
                }
                onSend={(t) => void chat.send(t)}
                // The chat import: the composer's own paperclip (files go to the
                // import batch engine with the next message; the run passes through
                // the normal confirm panel).
                onAttachFiles={(files) => void chat.addAttachments(files)}
                attachAccept=".csv,.tsv,.xlsx,.xls,text/csv"
                attachments={chat.attached}
                onRemoveAttachment={chat.removeAttachment}
              />
            </div>

            {/* A paused turn: the proposed actions + approve / decline. */}
            {chat.pending && (
              <div className="flex flex-col gap-3 border-t p-4">
                <p className="text-sm font-medium">I&apos;d like to make these changes:</p>
                <RunSteps steps={chat.confirmSteps} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void chat.resolve(false)}
                    disabled={chat.busy}
                  >
                    Not now
                  </Button>
                  <Button size="sm" onClick={() => void chat.resolve(true)} disabled={chat.busy}>
                    Go ahead
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>

      <AgentUsageDialog open={usageOpen} onOpenChange={setUsageOpen} summary={chat.usageSummary} />
      <AgentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        busy={chat.busy}
        currentThreadId={chat.threadId}
        onPick={(id) => void chat.openThread(id)}
      />
    </Sheet>
  )
}
