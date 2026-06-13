"use client"

// Onboarding (locked flow): first name + last name + optional photo, then the
// tenancy worker either accepts waiting invites or creates "{First}'s team"
// with its own database. Everything here is library components.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@swift-struck/ui/registry/primitives/avatar/avatar"
import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { FileUpload } from "@swift-struck/ui/registry/primitives/file-upload/file-upload"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { ModeToggle } from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure, auth, tenancy } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { fileToDataUrl } from "@/lib/image"

const firstNameField = { ...defaultFieldConfig, label: "First name", required: true }
const lastNameField = { ...defaultFieldConfig, label: "Last name", required: true }

export default function OnboardingPage() {
  const router = useRouter()
  const [checking, setChecking] = React.useState(true)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [photo, setPhoto] = React.useState<string | undefined>()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    auth
      .me()
      .then(({ user }) => {
        // Already fully set up? Straight to the app.
        if (user.onboardingComplete && user.currentTeamId) router.replace("/")
        else {
          setFirstName(user.firstName ?? "")
          setLastName(user.lastName ?? "")
          setChecking(false)
        }
      })
      .catch(() => router.replace("/login"))
  }, [router])

  async function handlePhoto(files: File[]) {
    if (!files[0]) return
    try {
      setPhoto(await fileToDataUrl(files[0]))
    } catch {
      toast.error("Couldn't read that image — try another one.")
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await auth.updateProfile({ firstName, lastName, imageDataUrl: photo })
      await tenancy.bootstrap()
      router.replace("/")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
      )
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center">
        <Spinner />
      </main>
    )
  }

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?"

  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <div className="animate-rise w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="mb-1" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Set up your profile
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tell us who you are — your team gets created right after.
          </p>
        </div>
        <form className="mt-6 flex flex-col gap-4" onSubmit={finish}>
            <div className="flex flex-col items-center gap-3">
              <Avatar className="size-20">
                {photo && <AvatarImage src={photo} alt="Your photo" />}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <FileUpload accept="image/*" multiple={false} onChange={handlePhoto} />
            </div>

            <Field config={firstNameField} htmlFor="first-name">
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Chris"
                disabled={busy}
                autoFocus
              />
            </Field>
            <Field config={lastNameField} htmlFor="last-name">
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Martin"
                disabled={busy}
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !firstName.trim() || !lastName.trim()}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Creating your team…" : "Continue"}
            </Button>
          </form>
      </div>
    </main>
  )
}
