"use client"

// Learning detail — one article as a tabbed record: Article / Overview / Activity
// (the standard every record gets). Article = the prose (library ArticleBody) + your
// own Done toggle + Deactivate/Activate. Overview = audit metadata (DescriptionList).
// Activity = the article's history via the GENERIC record-activity feed. Edit gated
// by learning:edit; deactivate by learning:delete. Host-composed, like role/help.

import * as React from "react"

import { Badge } from "@swift-struck/ui/registry/primitives/badge/badge"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { ArticleBody } from "@swift-struck/ui/registry/collections/article-body/article-body"
import { ProgressToggle } from "@swift-struck/ui/registry/primitives/progress-toggle/progress-toggle"
import { TabsView, defaultTabsConfig } from "@swift-struck/ui/registry/primitives/tabs/tabs"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@swift-struck/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem as ActivityFeedItem,
} from "@swift-struck/ui/registry/collections/activity-feed/activity-feed"
import { Pencil } from "lucide-react"

import type { ActivityItem, Learning, SelectableValue } from "@shared/types"
import { LearningFormDialog, type LearningFormValues } from "@/components/learning-form-dialog"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"

export function LearningDetailScreen({ teamId, learningId }: { teamId: string; learningId: string }) {
  const learningQ = useCached<Learning[]>(`learning:${teamId}`, () =>
    content.learning().then((r) => r.learning)
  )
  const item = learningQ.data?.find((l) => l.id === learningId) ?? null

  const activityQ = useCached<ActivityItem[]>(`activity:record:learning:${learningId}`, () =>
    tenancy.recordActivity("learning", learningId)
  )
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const categoryOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "File type")
    .map((v) => v.value)

  const { can } = usePermissions(teamId)
  const canEdit = can("learning", "edit")
  const canDeactivate = can("learning", "delete")

  const [tab, setTab] = React.useState("article")
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [busyDone, setBusyDone] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)

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
    invalidateActivity()
    toast.success("Article updated.")
  }

  function invalidateActivity() {
    // refresh the Activity tab after an edit/(de)activate
    void tenancy.recordActivity("learning", learningId).then((a) =>
      primeCache(`activity:record:learning:${learningId}`, a)
    )
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { learning: nextList } = await content.setLearningActive(learningId, activeNext)
      primeCache(`learning:${teamId}`, nextList)
      invalidateActivity()
      toast.success(activeNext ? "Article switched back on." : "Article switched off.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the article.")
    } finally {
      setBusyActive(false)
    }
  }

  if (learningQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the article.</p>
  if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!item) return <p className="text-muted-foreground text-sm">That article doesn&apos;t exist.</p>

  const overviewItems = [
    { label: "Category", value: item.category || "" },
    { label: "Content type", value: item.contentType || "" },
    { label: "Description", value: item.description || "" },
    { label: "Link", value: item.contentLink || "" },
    { label: "Added", value: formatRelative(item.createdAt) },
    { label: "Status", value: item.active ? "Switched on" : "Switched off" },
  ]

  const activityItems: ActivityFeedItem[] = (activityQ.data ?? []).map((a) => ({
    id: a.id,
    description: a.description,
    actor: a.actorName ?? undefined,
    timestamp: a.createdAt,
  }))

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "article", label: "Article", icon: "book-open", badge: "", badgeVariant: "" as const },
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      { value: "activity", label: "Activity", icon: "history", badge: "", badgeVariant: "" as const },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{item.title}</span>
            {!item.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Switched off
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

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )
          if (t.value === "activity")
            return (
              <ActivityFeed
                config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                items={activityItems}
              />
            )
          return (
            <div className="flex flex-col gap-6">
              <ArticleBody
                title={null}
                contentType={item.contentType ?? undefined}
                body={item.body ?? undefined}
                externalUrl={item.contentLink ?? undefined}
              />
              <div className="flex flex-wrap items-center gap-2">
                {item.active && <ProgressToggle done={!!item.done} onToggle={() => void toggleDone()} />}
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
                      Switch off
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void setActive(true)}
                      disabled={busyActive}
                      className="gap-1.5"
                    >
                      {busyActive ? <Spinner /> : null}
                      Switch on
                    </Button>
                  ))}
              </div>
            </div>
          )
        }}
      />

      <LearningFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        categoryOptions={categoryOptions}
        contentTypeOptions={contentTypeOptions}
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
