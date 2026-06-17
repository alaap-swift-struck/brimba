"use client"

// Change-your-email dialog (Settings → Account): enter a new address → a 6-digit
// code goes to THAT address → verify. On success the email switches, the old
// address is warned, and other devices are signed out (server-side). Two-step,
// mirroring the login card; reuses the CodeInput temp + library primitives.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@swift-struck/ui/registry/primitives/dialog/dialog"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure, auth } from "@/lib/api"
import { CodeInput } from "@/components/temp/code-input"

const emailField = { ...defaultFieldConfig, label: "New email", required: true }

export function EmailChangeDialog({
  open,
  onOpenChange,
  currentEmail,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail: string
  onSaved: () => Promise<void>
}) {
  const [step, setStep] = React.useState<"email" | "code">("email")
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  React.useEffect(() => {
    if (open) {
      setStep("email")
      setEmail("")
      setCode("")
      setError(undefined)
      setBusy(false)
    }
  }, [open])

  async function sendCode() {
    setBusy(true)
    setError(undefined)
    try {
      const res = await auth.startEmailChange(email.trim())
      setStep("code")
      setCode("")
      if (res.devCode) {
        // TEMP until the Resend key is wired: staging shows the code here.
        toast.info(`TEMP (staging only): your code is ${res.devCode}`, {
          duration: 30000,
        })
      } else {
        toast.success(`Code sent — check ${email.trim()}.`)
      }
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't send the code.")
    } finally {
      setBusy(false)
    }
  }

  async function verify(fullCode: string) {
    setBusy(true)
    setError(undefined)
    try {
      await auth.verifyEmailChange(email.trim(), fullCode)
      await onSaved()
      onOpenChange(false)
      toast.success("Email changed. Your other devices were signed out.")
    } catch (e) {
      setCode("")
      setError(e instanceof ApiFailure ? e.message : "That didn't work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change your email</DialogTitle>
          <DialogDescription>
            {step === "email"
              ? `You currently sign in with ${currentEmail}.`
              : `Enter the 6-digit code sent to ${email.trim()}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "email" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
          >
            <Field config={emailField} htmlFor="ec-email" error={error}>
              <Input
                id="ec-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </Field>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Sending…" : "Email me a code"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <CodeInput
              value={code}
              disabled={busy}
              onChange={(next) => {
                setCode(next)
                if (next.length === 6) void verify(next)
              }}
            />
            {error && <p className="text-destructive text-center text-xs">{error}</p>}
            {busy && (
              <div className="flex justify-center">
                <Spinner />
              </div>
            )}
            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setStep("email")
                  setError(undefined)
                }}
              >
                Use a different email
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sendCode()}>
                Resend code
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
