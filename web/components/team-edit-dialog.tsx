"use client"

// Edit-team dialog: the team's name + optional logo. The logo lands in R2 (via
// the tenancy worker) and is served at /media/teams/<id>. Library primitives.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { FileUpload } from "@swift-struck/ui/registry/primitives/file-upload/file-upload"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import type { TeamSummary } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { letterMark } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"

const nameField = { ...defaultFieldConfig, label: "Team name", required: true }

export function TeamEditDialog({
  open,
  onOpenChange,
  team,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: TeamSummary | null
  onSaved: () => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [logo, setLogo] = React.useState<string | undefined>()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(team?.name ?? "")
      setLogo(undefined)
    }
  }, [open, team])

  async function handlePhoto(files: File[]) {
    if (!files[0]) return
    try {
      setLogo(await fileToDataUrl(files[0]))
    } catch {
      toast.error("Couldn't read that image — try another one.")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await tenancy.updateTeam(name.trim(), logo)
      await onSaved()
      onOpenChange(false)
      toast.success("Team updated.")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't save the team."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit team</DialogTitle>
          <DialogDescription>Your team&apos;s name and logo.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col items-center gap-3">
            <Avatar className="size-20">
              {(logo || team?.logoUrl) && (
                <AvatarImage src={logo || (team?.logoUrl as string)} alt="Team logo" />
              )}
              <AvatarFallback className="text-xl">
                {letterMark(name)}
              </AvatarFallback>
            </Avatar>
            <FileUpload accept="image/*" multiple={false} onChange={handlePhoto} />
          </div>
          <Field config={nameField} htmlFor="team-name">
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
