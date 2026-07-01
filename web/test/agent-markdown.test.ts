// The agent's reply is UNTRUSTED text. These lock the markdown renderer's XSS
// boundary: raw HTML is escaped, only http/https/mailto links survive, and — the
// bug security_sentry caught — a crafted URL can't break out of the href attribute.

import { describe, expect, it } from "vitest"

import { toHtml } from "@/lib/agent-markdown-html"

describe("AgentMarkdown toHtml — XSS-safe", () => {
  it("neutralizes an attribute-breakout link (a stray quote in the href)", () => {
    const html = toHtml('click [here](https://a.com/"onmouseover="alert(document.cookie))')
    // the injected quote is encoded (&quot;) so it stays INSIDE the href value —
    // no literal `"onmouseover` breaks out into a live event handler
    expect(html).not.toContain('"onmouseover')
    expect(html).toContain("&quot;onmouseover")
  })

  it("drops a javascript: link to plain (escaped) text", () => {
    const html = toHtml("[x](javascript:alert(1))")
    expect(html).not.toContain("<a ")
  })

  it("escapes raw HTML in the reply", () => {
    expect(toHtml("<img src=x onerror=alert(1)>")).not.toContain("<img")
    expect(toHtml("<script>alert(1)</script>")).not.toContain("<script>")
  })

  it("still renders a normal link, bold, and a list", () => {
    expect(toHtml("see [docs](https://x.com)")).toContain('href="https://x.com"')
    expect(toHtml("**bold**")).toContain("<strong>bold</strong>")
    expect(toHtml("- one\n- two")).toContain("<ul>")
  })
})
