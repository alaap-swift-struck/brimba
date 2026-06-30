"use client"

// Display user-authored rich text (the library Notes editor's HTML) safely. The
// content is first run through sanitizeRichHtml (parse → strict allowlist → escaped),
// so what we inject is known-safe — scripts, handlers, and unsafe links are already
// gone. The prose classes mirror the editor so highlights, lists, and links read the
// same in display as while writing.

import * as React from "react"

import { sanitizeRichHtml } from "@/lib/rich-text"

const PROSE =
  "text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_hr]:border-border [&_hr]:my-3 [&_li]:my-0.5 [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded [&_mark]:px-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"

export function RichText({
  html,
  className,
}: {
  html: string | null | undefined
  className?: string
}) {
  const safe = React.useMemo(() => sanitizeRichHtml(html), [html])
  if (!safe) return null
  return <div className={`${PROSE} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: safe }} />
}
