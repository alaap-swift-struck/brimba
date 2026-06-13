"use client"

// TEMPORARY PLACEHOLDER — flagged in UI-GAPS.md.
// The library has no auth/login collection yet. This stand-in is built ENTIRELY
// from library primitives (Button, Input, Field, Spinner, toast) so when
// @swift-struck/ui ships `auth-card`, swapping is a one-file change. Flat (no
// card surface), matching the app-wide flat look. No styles invented beyond layout.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"
import { brand } from "@shared/brand"

import { ApiFailure, auth } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { CodeInput } from "./code-input"

const emailFieldConfig = {
  ...defaultFieldConfig,
  label: "Email",
  required: true,
}

export function AuthCard({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = React.useState<"email" | "code">("email")
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  async function sendCode() {
    setBusy(true)
    setError(undefined)
    try {
      const res = await auth.startEmail(email)
      setStep("code")
      setCode("")
      if (res.devCode) {
        // TEMP until the Resend key is wired: staging shows the code here.
        toast.info(`TEMP (staging only): your code is ${res.devCode}`, {
          duration: 30000,
        })
      } else {
        toast.success("Code sent — check your email.")
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
      await auth.verifyEmail(email, fullCode)
      onSignedIn()
    } catch (e) {
      setCode("")
      setError(e instanceof ApiFailure ? e.message : "That didn't work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-rise w-full max-w-sm">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="mb-1" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to {brand.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {step === "email"
            ? brand.motto
            : `Enter the 6-digit code sent to ${email}`}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {step === "email" ? (
          <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void sendCode()
              }}
            >
              <Field config={emailFieldConfig} htmlFor="email" error={error}>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy || !email}>
                {busy ? <Spinner /> : null}
                Email me a code
              </Button>
            </form>
        ) : (
          <>
            <CodeInput
              value={code}
              disabled={busy}
              onChange={(next) => {
                setCode(next)
                if (next.length === 6) void verify(next)
              }}
            />
            {error && (
              <p className="text-destructive text-center text-xs">{error}</p>
            )}
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
                onClick={() => setStep("email")}
              >
                Change email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void sendCode()}
              >
                Resend code
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

