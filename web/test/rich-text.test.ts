// sanitizeRichHtml is the SECURITY BOUNDARY for user-authored article HTML (the
// Notes editor). What it returns is injected into the page, so it must keep
// formatting but drop scripts, inline handlers, and unsafe links. These lock that.

import { describe, expect, it } from "vitest"

import { richTextPlain, sanitizeRichHtml } from "@/lib/rich-text"

describe("sanitizeRichHtml", () => {
  it("keeps allowlisted formatting + lists", () => {
    const out = sanitizeRichHtml(
      "<strong>bold</strong> <em>it</em> <mark>hi</mark><ul><li>one</li><li>two</li></ul>"
    )
    expect(out).toContain("<strong>bold</strong>")
    expect(out).toContain("<em>it</em>")
    expect(out).toContain("<mark>hi</mark>")
    expect((out.match(/<li>/g) ?? []).length).toBe(2)
  })

  it("drops <script> entirely — tag and content", () => {
    const out = sanitizeRichHtml("<p>safe</p><script>window.pwned=1</script>")
    expect(out).not.toMatch(/script/i)
    expect(out).not.toContain("pwned")
    expect(out).toContain("safe")
  })

  it("drops non-allowlisted tags + handlers (img/onerror) but keeps text", () => {
    const out = sanitizeRichHtml('<img src=x onerror="alert(1)">hello')
    expect(out).not.toMatch(/img/i)
    expect(out).not.toMatch(/onerror/i)
    expect(out).toContain("hello")
  })

  it("neutralises a javascript: link (becomes a span, no anchor)", () => {
    const out = sanitizeRichHtml('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toMatch(/javascript/i)
    expect(out).not.toContain("<a ")
    expect(out).toContain("click")
  })

  it("keeps a safe https link with rel hardening", () => {
    const out = sanitizeRichHtml('<a href="https://example.com">site</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('rel="noreferrer noopener"')
  })

  it("escapes raw angle brackets in text (no injection through text nodes)", () => {
    const out = sanitizeRichHtml("a &lt;b&gt; c")
    expect(out).not.toContain("<b>")
  })
})

describe("richTextPlain", () => {
  it("strips tags to plain text (previews / assistant)", () => {
    expect(richTextPlain("<p>Hello <strong>world</strong></p>")).toBe("Hello world")
    expect(richTextPlain(null)).toBe("")
  })
})
