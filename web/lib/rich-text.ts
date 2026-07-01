// Sanitize user-authored rich text (the library Notes editor emits HTML) to a SAFE
// HTML string. We parse with DOMParser — a DETACHED document where <script> never
// executes and inline handlers never fire — keep only an ALLOWLIST of formatting tags
// with their text HTML-escaped, drop scripts/handlers entirely, and allow only
// http/https/mailto links. The result is safe to inject (same model as DOMPurify);
// the <RichText> component does exactly that. richTextPlain strips everything to
// plain text (list/card previews, and the copy the assistant reads).

// DOM tag (uppercase, as the parser reports) → the element we emit.
const TAG_MAP: Record<string, string> = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  MARK: "mark",
  U: "u",
  S: "s",
  DEL: "s",
  CODE: "code",
  P: "p",
  DIV: "p",
  BR: "br",
  HR: "hr",
  BLOCKQUOTE: "blockquote",
  UL: "ul",
  OL: "ol",
  LI: "li",
  H1: "h3", // clamp heading levels — a body shouldn't outrank the page title
  H2: "h3",
  H3: "h4",
  H4: "h4",
  A: "a",
  SPAN: "span",
}
// Tags whose CONTENT is dropped entirely (never even render their text).
const DROP_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE"])
const VOID_TAGS = new Set(["br", "hr"])

export const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
// Attribute-value escaper — like escapeText but ALSO encodes the double-quote, so a
// value interpolated into `attr="..."` can never break out of the quotes (an href
// with a stray `"` otherwise injects a live event handler — attribute-breakout XSS).
export const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function safeHref(raw: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const u = new URL(raw, "https://x.invalid")
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? raw : undefined
  } catch {
    return undefined
  }
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === 3) return escapeText(node.textContent ?? "") // text
  if (node.nodeType !== 1) return "" // comments / others
  const el = node as Element
  if (DROP_CONTENT.has(el.tagName)) return ""
  const children = Array.from(el.childNodes).map(serializeNode).join("")
  const mapped = TAG_MAP[el.tagName]
  if (!mapped) return children // unknown tag → unwrap, keep its (escaped) text
  if (VOID_TAGS.has(mapped)) return `<${mapped}>`
  if (mapped === "a") {
    const href = safeHref(el.getAttribute("href"))
    return href
      ? `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer noopener">${children}</a>`
      : `<span>${children}</span>`
  }
  return `<${mapped}>${children}</${mapped}>`
}

/** Parse + allowlist user HTML into a safe HTML string (safe to inject). */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return ""
  // SSR / build (no DOM): degrade to escaped plain text; the client re-renders richly.
  if (typeof DOMParser === "undefined") return escapeText(richTextPlain(html))
  const doc = new DOMParser().parseFromString(html, "text/html")
  return Array.from(doc.body.childNodes).map(serializeNode).join("")
}

/** Strip all tags → plain text (list/card previews, the assistant's reading copy). */
export function richTextPlain(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
}
