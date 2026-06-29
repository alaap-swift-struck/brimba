// Input-boundary validation for worker request handlers. The bare
// `body.field?.trim()` pattern only guards null/undefined — a non-string (number,
// array, object, boolean) makes `.trim` undefined and throws a TypeError, which the
// central catch turns into a 500. SQLite (D1) also rejects embedded NUL bytes
// (U+0000) → another 500. And nothing capped text length, so a multi-MB string
// either bloated a row or 500'd. These helpers type-check, strip NULs, cap length,
// and throw a GuardError the worker already maps to a clean 400 — one validation seam.

import { GuardError } from "./gating"

// Sane per-kind caps — generous for prose, tight for short labels.
export const TEXT_LIMITS = {
  short: 200, // titles, names, categories, type/value labels
  link: 2_048, // URLs
  long: 20_000, // descriptions, article bodies, replies
  message: 10_000, // agent chat turns
} as const

const NUL = String.fromCharCode(0)
const stripNul = (s: string) => s.split(NUL).join("")

/** A REQUIRED text field: must be a non-empty string after NUL-strip + trim, within
 * `max` chars. Throws a clean 400 GuardError on a non-string, blank, or over-long value. */
export function requireText(value: unknown, field: string, max: number = TEXT_LIMITS.long): string {
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) throw new GuardError(400, "invalid_input", `${field} is required.`)
  if (clean.length > max)
    throw new GuardError(400, "invalid_input", `${field} is too long (max ${max} characters).`)
  return clean
}

/** An OPTIONAL text field: null/undefined/blank → undefined; otherwise must be a
 * string within `max` chars (NULs stripped, trimmed). Throws a clean 400 GuardError
 * on a non-string or over-long value. */
export function optionalText(
  value: unknown,
  field: string,
  max: number = TEXT_LIMITS.long
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new GuardError(400, "invalid_input", `${field} must be text.`)
  const clean = stripNul(value).trim()
  if (!clean) return undefined
  if (clean.length > max)
    throw new GuardError(400, "invalid_input", `${field} is too long (max ${max} characters).`)
  return clean
}
