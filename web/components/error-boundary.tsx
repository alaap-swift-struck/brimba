"use client"

// A small render-error catcher. When the wrapped UI throws, instead of Next.js
// nuking the whole page with the generic "a client-side exception has occurred",
// we show the ACTUAL error message inline (and log the stack) so a crash on
// staging is diagnosable on the spot. React error boundaries must be classes.

import * as React from "react"

import { Button } from "@swift-struck/ui/registry/primitives/button/button"

type Props = { label?: string; children: React.ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surfaced in the browser console with the component stack for diagnosis.
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-xl border p-4 text-sm">
          <p className="text-destructive font-medium">
            Something broke{this.props.label ? ` in ${this.props.label}` : ""}.
          </p>
          <p className="text-muted-foreground break-words font-mono text-xs">
            {this.state.error.message || String(this.state.error)}
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
