"use client"

// The assistant's history view: the caller's past conversations, tap one to
// reopen it (works across devices — the list is server-side, so a chat started
// on the laptop is here on the phone). Self-contained: lazily loads each open
// so a just-run turn's thread shows at the top.

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { ScrollArea } from "@swift-struck/ui/registry/primitives/scroll-area/scroll-area"

import type { AgentThread } from "@shared/types"
import { dataOps } from "@/lib/api"
import { formatActivityWhen } from "@/lib/format"

export function AgentHistoryDialog({
  open,
  onOpenChange,
  busy,
  currentThreadId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  currentThreadId?: string
  onPick: (threadId: string) => void
}) {
  const [threads, setThreads] = React.useState<AgentThread[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(false)
    dataOps
      .agentThreads()
      .then((r) => alive && setThreads(r.threads))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your conversations</DialogTitle>
          <DialogDescription>Pick up any chat where you left off — on any device.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load your conversations. Try again.
          </p>
        ) : threads && threads.length > 0 ? (
          <ScrollArea className="max-h-80">
            <ul className="flex flex-col gap-1 pr-3">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false)
                      onPick(t.id)
                    }}
                    disabled={busy}
                    className="hover:bg-muted focus-visible:ring-ring flex w-full flex-col items-start gap-0.5 rounded-md p-2 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  >
                    <span className="line-clamp-1 text-sm font-medium">
                      {t.title || "Conversation"}
                      {t.id === currentThreadId ? " · current" : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatActivityWhen(t.lastMessageAt ?? t.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">No conversations yet.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
