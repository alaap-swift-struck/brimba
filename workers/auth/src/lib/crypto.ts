// Small crypto helpers. We never store raw codes or session tokens — only
// their SHA-256 hashes, so a leaked database can't be replayed against us.

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  )
  return new Uint8Array(digest)
}

export function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

/** 256-bit random, URL-safe — used for session tokens and OAuth state. */
export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** The 6-digit login code, zero-padded ("004217" is valid). */
export function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, "0")
}
