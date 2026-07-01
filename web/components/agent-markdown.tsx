"use client"

// AgentMarkdown — render the assistant's reply (a markdown STRING) as light HTML.
// The agent's output is UNTRUSTED, so we ESCAPE the raw text first (escapeText),
// THEN convert only a tiny, safe subset: inline code, links (each URL run through
// safeHref — http/https/mailto only), bold, italic, bullet + numbered lists, and
// blank-line paragraphs / soft line breaks. Escaping before converting keeps it
// XSS-safe (the base's boundary-sanitization rule), and we reuse RichText's PROSE
// classes so a reply reads the same as any other rich text in the app.

import * as React from "react"

import { escapeText, safeHref } from "@/lib/rich-text"
import { PROSE } from "@/components/rich-text"

// Inline spans, applied to ALREADY-ESCAPED text. Code runs first so its contents
// can't be re-interpreted as bold/italic; links before emphasis so a URL's own
// characters aren't mangled. `[^`]+` etc. avoid crossing markers.
function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
      // The URL was escaped, so &amp; is back to & for the protocol check.
      const href = safeHref(url.replace(/&amp;/g, "&"))
      return href
        ? `<a href="${escapeText(href)}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : m
    })
    .replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => `<strong>${b}</strong>`)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre: string, i: string) => `${pre}<em>${i}</em>`)
}

// Group escaped lines into paragraphs and lists. Consecutive "- "/"* " lines
// become one <ul>; "1." lines one <ol>; other runs become a <p> with soft
// newlines as <br>. A blank line ends the current block.
function toHtml(text: string): string {
  const lines = escapeText(text).replace(/\r\n?/g, "\n").split("\n")
  const out: string[] = []
  let para: string[] = []
  let list: { tag: "ul" | "ol"; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`)
    list = null
  }

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      if (list?.tag !== "ul") flushList(), (list = { tag: "ul", items: [] })
      list.items.push(bullet[1])
    } else if (numbered) {
      flushPara()
      if (list?.tag !== "ol") flushList(), (list = { tag: "ol", items: [] })
      list.items.push(numbered[1])
    } else if (line.trim() === "") {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return out.join("")
}

export function AgentMarkdown({ text }: { text: string }) {
  const html = React.useMemo(() => toHtml(text), [text])
  if (!html) return null
  return <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
}
