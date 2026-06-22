"use client"

// Edit-your-profile dialog (Settings → Account): first/last name + optional
// photo. Reuses the same auth.updateProfile endpoint onboarding uses. Library
// primitives.

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

import type { SessionUser } from "@shared/types"
import { ApiFailure, auth } from "@/lib/api"
import { personInitials } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"

const firstField = { ...defaultFieldConfig, label: "First name", required: true }
const lastField = { ...defaultFieldConfig, label: "Last name", required: true }

export function ProfileDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: SessionUser | null
  onSaved: () => Promise<void>
}) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [photo, setPhoto] = React.useState<string | undefined>()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setFirstName(user?.firstName ?? "")
      setLastName(user?.lastName ?? "")
      setPhoto(undefined)
    }
  }, [open, user])

  async function handlePhoto(files: File[]) {
    if (!files[0]) return
    try {
      setPhoto(await fileToDataUrl(files[0]))
    } catch {
      toast.error("Couldn't read that image — try another one.")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await auth.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        imageDataUrl: photo,
      })
      await onSaved()
      onOpenChange(false)
      toast.success("Profile updated.")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't save your profile."
      )
    } finally {
      setBusy(false)
    }
  }

  const initials = personInitials(firstName, lastName)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>Your name and photo across the app.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col items-center gap-3">
            <Avatar className="size-20">
              {(photo || user?.imageUrl) && (
                <AvatarImage src={photo || (user?.imageUrl as string)} alt="Your photo" />
              )}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <FileUpload accept="image/*" multiple={false} onChange={handlePhoto} />
          </div>
          <Field config={firstField} htmlFor="pf-first">
            <Input
              id="pf-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field config={lastField} htmlFor="pf-last">
            <Input
              id="pf-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={busy}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !firstName.trim() || !lastName.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
