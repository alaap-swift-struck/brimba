"use client"

// The agent chat's STATE MACHINE, extracted from agent-panel.tsx so the panel
// stays a render shell. Owns: the transcript, the active thread (+ per-device
// resume via localStorage and cross-device resume via the server's newest
// thread), the SSE stream consumer (text deltas, live step rows, the confirm
// pause, the terminal settle), the broken-stream re-sync (show the SAVED truth,
// never a false failure), staged file attachments (the chat import), and the
// send / confirm-resolve / new-chat / open-thread actions.

import * as React from "react"

import type { AgentChatItem } from "@swift-struck/ui/registry/collections/agent-chat/agent-chat"
import type { RunStep } from "@swift-struck/ui/registry/collections/run-steps/run-steps"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"

import type { AgentMessage, AgentQuota, PendingCall } from "@shared/types"
import { ApiFailure, dataOps, type AgentStreamEvent } from "@/lib/api"
import { fileToCsv, UserFileError } from "@/lib/file-to-csv"
import { emitTrace, traceFor } from "@/lib/agent-trace"
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

export function useAgentChat(teamId: string | null, open: boolean, canUse: boolean) {
  const [items, setItems] = React.useState<AgentChatItem[]>([])
  const [threadId, setThreadId] = React.useState<string | undefined>(undefined)
  // CSV files staged for the NEXT message (the chat import): picked or dropped,
  // sent with the message, planned server-side, run via the normal confirm panel.
  const [attached, setAttached] = React.useState<{ name: string; csv: string }[]>([])
  const [busy, setBusy] = React.useState(false)
  const [quota, setQuota] = React.useState<AgentQuota | null>(null)
  // A paused turn awaiting the user's go-ahead — the proposed actions + the text.
  const [pending, setPending] = React.useState<{ calls: PendingCall[]; text: string } | null>(null)

  // On open: pull the quota (cheap; not cached — it changes per turn) and, if this is
  // a fresh panel (no messages yet), RESUME the right conversation. Resume order:
  //   1. the thread this DEVICE last used (localStorage) — instant, offline-friendly;
  //   2. else the caller's NEWEST thread on the SERVER — this is what makes a chat you
  //      started on the laptop show up when you open the phone (cross-device resume).
  // A brand-new user with no threads just starts empty. Best-effort throughout — a
  // failed load must never keep the panel from opening.
  React.useEffect(() => {
    if (!open || !canUse) return
    let alive = true
    dataOps
      .agentUsage()
      .then((r) => alive && setQuota(r.quota))
      .catch(() => {})

    if (teamId && items.length === 0) {
      const stored = readLastThread(teamId)
      const pickThreadId = async (): Promise<string | undefined> => {
        if (stored) return stored
        // No local memory on this device — fall back to the server's newest thread.
        const r = await dataOps.agentThreads().catch(() => null)
        return r?.threads[0]?.id
      }
      void pickThreadId().then((id) => {
        if (!alive || !id) return
        dataOps
          .agentThread(id)
          .then((r) => {
            if (!alive) return
            setItems(toChatItems(r.messages))
            setThreadId(id)
            // Remember it on THIS device so the next open resumes instantly.
            if (teamId) writeLastThread(teamId, id)
          })
          .catch(() => {
            // The thread is gone or unreadable — forget the local pointer, start clean.
            if (alive && stored) clearLastThread(teamId)
          })
      })
    }
    return () => {
      alive = false
    }
    // items.length is read as an open-time snapshot, not a trigger — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canUse, teamId])

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

  /** The stream broke mid-turn (phones drop long-held connections when the screen
   * locks or the network blips) — but the SERVER almost always FINISHED the turn
   * and saved every step + the reply. Re-load the saved thread and show the truth
   * instead of a scary "something went wrong" that makes completed work look
   * failed (the owner hit exactly this on 5G). Returns false if even the re-sync
   * fails, so the caller can fall back to the plain message. */
  async function resyncAfterDrop(): Promise<boolean> {
    try {
      // The turn may have CREATED the thread server-side before we ever got its id.
      const id = threadId ?? (await dataOps.agentThreads()).threads[0]?.id
      if (!id) return false
      const r = await dataOps.agentThread(id)
      setItems(toChatItems(r.messages))
      setThreadId(id)
      setPending(null)
      if (teamId) writeLastThread(teamId, id)
      dataOps
        .agentUsage()
        .then((u) => setQuota(u.quota))
        .catch(() => {})
      return true
    } catch {
      return false
    }
  }

  async function addAttachments(list: FileList | null) {
    if (!list || !list.length || busy) return
    const next = [...attached]
    for (const file of Array.from(list)) {
      if (next.length >= 8) {
        toast.error("Attach up to 8 files at a time.")
        break
      }
      try {
        const csv = await fileToCsv(file)
        if (csv.length > 5_000_000) {
          toast.error(`"${file.name}" is too large (up to about 5 MB).`)
          continue
        }
        next.push({ name: file.name, csv })
      } catch (err) {
        toast.error(err instanceof UserFileError ? err.message : `Couldn't read "${file.name}".`)
      }
    }
    setAttached(next)
  }

  function removeAttachment(index: number) {
    setAttached((prev) => prev.filter((_, j) => j !== index))
  }

  async function send(text: string) {
    if (busy) return
    const assistantId = newId()
    const files = attached.length ? attached : undefined
    // Same attachment note the server saves, so the optimistic bubble matches history.
    const shown = files ? `${text}\n(Attached: ${files.map((f) => f.name).join(", ")})` : text
    // Optimistic: the user's message appears instantly, and an empty assistant row
    // carries the animated 3-dot indicator (showTyping) until reply text streams.
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: shown },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setBusy(true)
    setPending(null)
    setAttached([])
    try {
      await consume((onEvent) => dataOps.agentChatStream({ message: text, threadId, files }, onEvent), assistantId)
    } catch (err) {
      if (!(await resyncAfterDrop())) {
        const msg = err instanceof ApiFailure ? err.message : "The connection dropped. Reopen the chat to see what happened."
        setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
      }
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
      if (!(await resyncAfterDrop())) {
        const msg =
          err instanceof ApiFailure ? err.message : "The connection dropped. Reopen the chat to see what happened."
        setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
      }
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

  // Reopen a past conversation (from the history view): load its messages, make it
  // the active thread, and remember it on this device. Best-effort — a failed load
  // just leaves the current chat as-is.
  async function openThread(id: string) {
    if (busy) return
    try {
      const r = await dataOps.agentThread(id)
      setItems(toChatItems(r.messages))
      setThreadId(id)
      setPending(null)
      if (teamId) writeLastThread(teamId, id)
    } catch {
      /* leave the current conversation in place */
    }
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

  return {
    items,
    threadId,
    attached,
    busy,
    quota,
    pending,
    showTyping,
    confirmSteps,
    quotaLabel,
    usageSummary,
    addAttachments,
    removeAttachment,
    send,
    resolve,
    newChat,
    openThread,
  }
}
