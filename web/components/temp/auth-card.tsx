"use client"

// ⚠️ TEMPORARY PLACEHOLDER — flagged in UI-GAPS.md.
// The library has no auth/login card collection yet. This stand-in is built
// ENTIRELY from library primitives (Card, Button, Input, Field, Separator,
// Spinner, toast) so when @swift-struck/ui ships `auth-card`, swapping is
// a one-file change. No styles or components invented here beyond layout.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@swift-struck/ui/registry/primitives/card/card"
import { Field } from "@swift-struck/ui/registry/primitives/field/field"
import { Input } from "@swift-struck/ui/registry/primitives/input/input"
import { Separator } from "@swift-struck/ui/registry/primitives/separator/separator"
import { Spinner } from "@swift-struck/ui/registry/primitives/spinner/spinner"
import { toast } from "@swift-struck/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@swift-struck/ui/lib/config"

import { ApiFailure, auth } from "@/lib/api"
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

  // Surface errors Google login bounced back with (?error=... on /login).
  React.useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error")
    if (reason === "google_not_ready")
      toast.error("Google sign-in isn't switched on yet — use email below.")
    else if (reason === "google_failed")
      toast.error("Google sign-in didn't complete. Try again or use email.")
    else if (reason === "deactivated")
      toast.error("This account is deactivated.")
  }, [])

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
    <Card className="animate-rise w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome to Brimba</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Sign in or create your account"
            : `Enter the 6-digit code sent to ${email}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "email" ? (
          <>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => (window.location.href = "/api/auth/google/start")}
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">or</span>
              <Separator className="flex-1" />
            </div>

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
          </>
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
      </CardContent>
    </Card>
  )
}

/** Google's "G", inline — no extra dependency for one logo. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3c-1.07.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12.02 12.02 0 0 0 0 10.74l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.43-3.43A11.98 11.98 0 0 0 1.28 6.63l3.99 3.09C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  )
}
