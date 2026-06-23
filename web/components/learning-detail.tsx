"use client"

// Learning detail — one article at /t/<teamId>/learning/<id>. The article's body
// has no screen-engine block (it's bespoke prose), so the host composes it here
// from the library ArticleBody while the learning LIST is engine-driven. Self-
// contained, like role-detail: it fetches the item cache-first (from the same
// row-level list cache the live registry patches), owns its Done toggle (your own
// progress), Edit (the form dialog → updateLearning), and Deactivate / Activate.
// Items are never deleted — deactivate-only (holders keep their progress).

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ArticleBody } from "@swift-struck/ui/registry/collections/article-body/article-body"
import { ProgressToggle } from "@swift-struck/ui/registry/primitives/progress-toggle/progress-toggle"
import { Pencil } from "lucide-react"

import type { Learning } from "@shared/types"
import { LearningFormDialog, type LearningFormValues } from "@/components/learning-form-dialog"
import { ApiFailure, content } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"

export function LearningDetailScreen({ teamId, learningId }: { teamId: string; learningId: string }) {
  // Read from the SAME list cache the live registry patches row-by-row, so a
  // remote edit / a Done toggle elsewhere reflects here without its own fetch.
  const learningQ = useCached<Learning[]>(`learning:${teamId}`, () =>
    content.learning().then((r) => r.learning)
  )
  const item = learningQ.data?.find((l) => l.id === learningId) ?? null

  const { can } = usePermissions(teamId)
  const canEdit = can("learning", "edit")
  const canDeactivate = can("learning", "delete")

  const [editingOpen, setEditingOpen] = React.useState(false)
  const [busyDone, setBusyDone] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)

  // Patch just THIS row in the cached list (the row-level pattern) — no full
  // refetch, and the live ping our own write triggers won't clobber it.
  function patchItem(next: Partial<Learning>) {
    const cur = learningQ.data
    if (!cur) return
    primeCache(
      `learning:${teamId}`,
      cur.map((l) => (l.id === learningId ? { ...l, ...next } : l))
    )
  }

  async function toggleDone() {
    if (!item) return
    const next = !item.done
    setBusyDone(true)
    try {
      await content.markLearningDone(learningId, next)
      patchItem({ done: next })
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update your progress.")
    } finally {
      setBusyDone(false)
    }
  }

  async function updateDetails(values: LearningFormValues) {
    const { learning: nextList } = await content.updateLearning({
      id: learningId,
      title: values.title,
      category: values.category || null,
      description: values.description || null,
      contentType: values.contentType || null,
      contentLink: values.contentLink || null,
      body: values.body || null,
    })
    primeCache(`learning:${teamId}`, nextList)
    toast.success("Article updated.")
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { learning: nextList } = await content.setLearningActive(learningId, activeNext)
      primeCache(`learning:${teamId}`, nextList)
      toast.success(activeNext ? "Article reactivated." : "Article deactivated.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the article.")
    } finally {
      setBusyActive(false)
    }
  }

  if (learningQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the article.</p>
  if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!item) return <p className="text-muted-foreground text-sm">That article doesn&apos;t exist.</p>

  return (
    <div className="flex flex-col gap-6">
      {/* Header — title, the inactive flag, and Edit (gated by learning:edit). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{item.title}</span>
            {!item.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Inactive
              </Badge>
            )}
            {item.required && (
              <Badge variant="secondary" className="text-[10px]">
                Required
              </Badge>
            )}
          </h1>
          {item.category && <p className="text-muted-foreground mt-1 text-sm">{item.category}</p>}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
      </div>

      <ArticleBody
        title={null}
        contentType={item.contentType ?? undefined}
        body={item.body ?? undefined}
        externalUrl={item.contentLink ?? undefined}
      />

      {/* Your own progress — only meaningful while the item is active. */}
      <div className="flex flex-wrap items-center gap-2">
        {item.active && (
          <ProgressToggle done={!!item.done} onToggle={() => void toggleDone()} />
        )}
        {busyDone && <Spinner />}
        {canDeactivate &&
          (item.active ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setActive(false)}
              disabled={busyActive}
              className="text-destructive hover:text-destructive gap-1.5"
            >
              {busyActive ? <Spinner /> : null}
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void setActive(true)}
              disabled={busyActive}
              className="gap-1.5"
            >
              {busyActive ? <Spinner /> : null}
              Reactivate
            </Button>
          ))}
      </div>

      <LearningFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        initial={{
          title: item.title,
          category: item.category ?? "",
          description: item.description ?? "",
          contentType: item.contentType ?? "",
          contentLink: item.contentLink ?? "",
          body: item.body ?? "",
        }}
        onSubmit={updateDetails}
      />
    </div>
  )
}
