"use client"

// Dropdown values ("selectable data") manager — host-composed, a tab on the team
// Settings area. Lists the team's values grouped by TYPE, and lets admins add a
// value (pick-or-create its type), rename one, or remove (deactivate) one. Gated
// by the selectable_data module; the server re-checks every write. Library
// primitives only.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Skeleton } from "@swift-struck/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { Plus, Pencil, X, Check } from "lucide-react"

import type { SelectableValue } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@/lib/store"

export function SelectableScreen({ teamId }: { teamId: string }) {
  const { can } = usePermissions(teamId)
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )

  const canCreate = can("selectable_data", "create")
  const canEdit = can("selectable_data", "edit")
  const canDelete = can("selectable_data", "delete")

  // Add form — pick-or-create the type via a datalist of the existing types.
  const [newType, setNewType] = React.useState("")
  const [newValue, setNewValue] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // Inline rename state (one row at a time).
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")

  const values = valuesQ.data ?? []
  const types = Array.from(new Set(values.map((v) => v.type))).sort()
  const grouped = types.map((t) => ({ type: t, items: values.filter((v) => v.type === t) }))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!newType.trim() || !newValue.trim()) return
    setBusy(true)
    try {
      const added = newValue.trim()
      const { values: next } = await tenancy.createSelectable(newType, newValue)
      primeCache(`selectable:${teamId}`, next)
      setNewValue("")
      toast.success(`Added "${added}".`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that value.")
    } finally {
      setBusy(false)
    }
  }

  async function saveRename(id: string) {
    if (!editValue.trim()) return
    try {
      const { values: next } = await tenancy.updateSelectable(id, editValue)
      primeCache(`selectable:${teamId}`, next)
      setEditingId(null)
      toast.success("Renamed.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't rename that value.")
    }
  }

  async function remove(v: SelectableValue) {
    try {
      const { values: next } = await tenancy.setSelectableActive(v.id, false)
      primeCache(`selectable:${teamId}`, next)
      toast.success(`Removed "${v.value}".`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't remove that value.")
    }
  }

  if (valuesQ.error)
    return <p className="text-destructive text-sm">Couldn&apos;t load dropdown values.</p>
  if (valuesQ.data === undefined) return <Skeleton variant="list" lines={5} />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dropdown values</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The options behind your team&apos;s dropdowns — Learning categories, Help types and more.
          Pick an existing type or name a new one.
        </p>
      </div>

      {canCreate && (
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input
            list="dropdown-types"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="Type (e.g. Help type)"
            disabled={busy}
            className="w-full sm:w-56"
          />
          <datalist id="dropdown-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="New value"
            disabled={busy}
            className="w-full"
          />
          <Button
            type="submit"
            disabled={busy || !newType.trim() || !newValue.trim()}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Add
          </Button>
        </form>
      )}

      {grouped.length === 0 ? (
        <p className="text-muted-foreground text-sm">No dropdown values yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map((g) => (
            <div key={g.type} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">{g.type}</h2>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((v) => (
                  <li
                    key={v.id}
                    className="border-border/60 flex items-center gap-2 rounded-lg border px-3 py-1.5"
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
                            onClick={() => void remove(v)}
                            aria-label={`Remove ${v.value}`}
                          >
                            <X className="size-4" />
                          </Button>
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
