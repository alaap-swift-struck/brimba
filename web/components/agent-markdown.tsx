"use client"

// AgentMarkdown — render the assistant's reply as light, XSS-safe HTML. The pure
// render logic lives in @/lib/agent-markdown-html (escape-first, safe subset,
// attribute-safe hrefs); this component just injects it with RichText's PROSE
// classes so a reply reads the same as any other rich text in the app.

import * as React from "react"

import { toHtml } from "@/lib/agent-markdown-html"
import { PROSE } from "@/components/rich-text"

export function AgentMarkdown({ text }: { text: string }) {
  const html = React.useMemo(() => toHtml(text), [text])
  if (!html) return null
  return <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
}
