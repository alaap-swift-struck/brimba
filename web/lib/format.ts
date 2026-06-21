// Shared display formatters — ONE source so dates look identical everywhere
// (members list, activity feed, overview tabs). No duplication of date logic.

/** "13 Jun 2026" — for dates where the time of day doesn't matter. */
export function formatDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

/** "13 Jun 2026, 14:05" — for activity rows where the moment matters. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

/** Compact a count for a badge: 6 → "6", 189 → "189", 1180000 → "1.18M". Keeps
 * tab/section count chips short even when a collection grows into the millions
 * (the server lazy-loads rows; the badge is just the total). */
export function abbreviateCount(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return ""
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n)
}
