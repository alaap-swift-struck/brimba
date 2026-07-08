"use client"

// Dropdown values ("selectable data") manager — host-composed, a tab on the team
// Settings area. Lists the team's values grouped by TYPE (with the standard search +
// status filter), and lets admins add a value (via the shared form dialog — Law R4,
// like every other create), rename one, or deactivate/reactivate one. Gated by the
// selectable_data module; the server re-checks every write. Library primitives only.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@swift-struck/ui/registry/primitives/select/select"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Plus, Pencil, X, Check, Upload, Download, Power, Search } from "lucide-react"

import type { SelectableValue } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { SelectableFormDialog } from "@/components/selectable-form-dialog"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"

export function SelectableScreen({
  teamId,
  onImport,
}: {
  teamId: string
  /** Host-provided soft-nav to the import wizard (pre-targeted to dropdown values). */
  onImport?: () => void
}) {
  const { can } = usePermissions(teamId)
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )

  const canCreate = can("selectable_data", "create")
  const canEdit = can("selectable_data", "edit")
  const canDelete = can("selectable_data", "delete")

  // Add via the shared form dialog (Law R4); the screen just toggles it open.
  const [addOpen, setAddOpen] = React.useState(false)
  // Inline rename state (one row at a time).
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")
  // Collection filter chrome — the SAME shape the other collections (roles,
  // learning, help) use: a text search + a status filter defaulting to Active, so
  // deactivated values hide until you ask for them (then show greyed with Activate).
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<"active" | "inactive" | "all">("active")

  const values = valuesQ.data ?? []
  // The add form's group datalist offers EVERY existing type (not just the filtered
  // ones), so you can always add to any group.
  const types = Array.from(new Set(values.map((v) => v.type))).sort()
  // The list is the filtered set, grouped by type.
  const q = query.trim().toLowerCase()
  const filtered = values.filter(
    (v) =>
      (status === "all" || (status === "active" ? v.active : !v.active)) &&
      (q === "" || v.value.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
  )
  const grouped = Array.from(new Set(filtered.map((v) => v.type)))
    .sort()
    .map((t) => ({ type: t, items: filtered.filter((v) => v.type === t) }))

  // Create — the dialog calls this; it throws on failure so the dialog surfaces the
  // reason and stays open, and closes itself on success.
  async function addValue(type: string, value: string) {
    const { values: next } = await tenancy.createSelectable(type, value)
    primeCache(`selectable:${teamId}`, next)
    toast.success(`Added "${value}".`)
  }

  async function saveRename(id: string) {
    if (!editValue.trim()) return
    try {
      const { values: next } = await tenancy.updateSelectable(id, editValue)
      primeCache(`selectable:${teamId}`, next)
      setEditingId(null)
      toast.success("Renamed.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't rename that option.")
    }
  }

  // Deactivate / reactivate one value. A deactivated value is retired, not deleted:
  // it stays visible here (greyed, with an Activate button) so it's never a dead end,
  // and drops out of the form pickers. Same key the pickers read, so both refresh.
  async function setActive(v: SelectableValue, next: boolean) {
    try {
      const { values: list } = await tenancy.setSelectableActive(v.id, next)
      primeCache(`selectable:${teamId}`, list)
      toast.success(next ? `Activated "${v.value}".` : `Deactivated "${v.value}".`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update that option.")
    }
  }

  if (valuesQ.error)
    return <p className="text-destructive text-sm">Couldn&apos;t load dropdown values.</p>
  if (valuesQ.data === undefined) return <Skeleton variant="list" lines={5} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dropdown values</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The options behind your team&apos;s dropdowns — Help types, Learning categories and more.
            Pick a group, or start a new one.
          </p>
        </div>
        {/* Actions — New value / Import / Export. flex-wrap so the buttons never
         * clip on a phone (UI-CONVENTIONS action-row rule). New records go through
         * the shared form dialog (Law R4), never an inline row. */}
        <div className="flex flex-wrap justify-end gap-2">
          {values.length > 0 && (
            <Button asChild variant="outline" className="gap-1.5">
              <a href="/api/tenancy/selectable/export">
                <Download className="size-4" aria-hidden /> Export CSV
              </a>
            </Button>
          )}
          {canCreate && onImport && (
            <Button variant="outline" onClick={onImport} className="gap-1.5">
              <Upload className="size-4" aria-hidden /> Import CSV
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="size-4" aria-hidden /> New value
            </Button>
          )}
        </div>
      </div>

      {canCreate && (
        <SelectableFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          types={types}
          onSubmit={addValue}
          draftKey={`selectable-add:${teamId}`}
        />
      )}

      {/* Filter bar — search + status, matching the other collections. Deactivated
       * values are hidden under the Active default; switch to Inactive/All to see and
       * reactivate them. flex-wrap so the controls never clip on a phone. */}
      {values.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1 text-sm">
            Showing {filtered.length} of {values.length}
          </span>
          <div className="relative w-full sm:w-56">
            <Search
              className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search values…"
              className="h-9 pl-8"
              aria-label="Search dropdown values"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {values.length === 0
            ? "No options yet. Add your first above."
            : "No values match your search or filter."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map((g) => (
            <div key={g.type} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">{g.type}</h2>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((v) => (
                  <li
                    key={v.id}
                    className={`border-border/60 flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                      v.active ? "" : "opacity-60"
                    }`}
                  >
                    {editingId === v.id ? (
                      <>
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void saveRename(v.id)}
                          aria-label="Save"
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{v.value}</span>
                        {!v.active && (
                          <span className="text-muted-foreground text-xs">Deactivated</span>
                        )}
                        {v.active ? (
                          <>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(v.id)
                                  setEditValue(v.value)
                                }}
                                aria-label={`Rename ${v.value}`}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void setActive(v, false)}
                                aria-label={`Deactivate ${v.value}`}
                              >
                                <Power className="size-4" />
                              </Button>
                            )}
                          </>
                        ) : (
                          canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void setActive(v, true)}
                              className="gap-1.5"
                              aria-label={`Activate ${v.value}`}
                            >
                              <Power className="size-3.5" /> Activate
                            </Button>
                          )
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
