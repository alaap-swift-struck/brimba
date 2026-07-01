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

/** "2026-06-30 21:50" — the timestamp for activity-feed rows. The library
 * ActivityFeed both re-sorts by this string (localeCompare) AND shows it raw, so
 * it must be sortable-and-readable: 24-hour, zero-padded, so lexical order equals
 * chronological order. ONE source, like the other formatters. */
export function formatActivityWhen(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** "just now" · "5m ago" · "3h ago" · "2d ago", then falls back to a date — for
 * conversation timestamps (ticket replies) where recency matters more than the
 * exact clock time. ONE source, like the other formatters. */
export function formatRelative(iso?: string | null): string {
  if (!iso) return ""
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
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
