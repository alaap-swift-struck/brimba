// Shared identity display helpers — ONE source for turning a person or team into
// a display name, two-letter initials, or a single-letter avatar fallback, so
// every screen renders the same person the same way (no per-component drift).

/** A person's display name: "First Last", falling back to their email, else "". */
export function personName(p: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || (p.email ?? "")
}

/** Two-letter initials for a person-avatar fallback (e.g. "AK"); "?" if unknown. */
export function personInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?"
}

/** Single-letter mark for a team / single-name avatar fallback; "?" if blank. */
export function letterMark(name?: string | null): string {
  return name?.[0]?.toUpperCase() ?? "?"
}
