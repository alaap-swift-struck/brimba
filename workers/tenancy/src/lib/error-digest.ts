// THE NIGHTLY ERROR DIGEST — the one thing in this base that actually tells a
// person something is wrong.
//
// Until this existed, every failure path ended in the same place: a row in
// `error_logs`, in a table nobody opens, on a screen nobody visits at 3am. LAW
// R12 says unattended work records its failures, and it did — recording is not
// alerting. A record with no reader is a diary, not an alarm.
//
// WHY SEVEN DAYS AND NOT TWENTY-FOUR HOURS. A 24-hour count can only answer "how
// many". The two questions an operator actually has are "is this NEW?" and "is
// this getting WORSE?", and both need yesterday's shape to compare against. One
// GROUP BY over a 7-day window answers all three at once: `n24` is last night,
// `avg_prior` is the six days before it, and `first_seen` says whether the
// signature existed at all before tonight. No second query, no state to keep.
//
// SILENCE IS THE ALL-CLEAR. A clean night returns null and NOTHING is sent. That
// is the most important line in this file: a digest that mails "0 errors" every
// night trains the one person who reads it to delete it unread, and the night it
// matters it is deleted unread too. So the mail arriving IS the signal.
//
// WHICH IS EXACTLY WHY A SILENT FAILURE TO SEND IS THE WORST BUG THIS FILE COULD
// HAVE. `sendMail` returns whether auth confirms the mail actually went — it
// returns false when RESEND_API_KEY is unset — and a digest that could not be
// delivered records an error instead of returning quietly. Without that check,
// an unconfigured mailer and a healthy system look identical from the outside,
// which is the precise failure this feature exists to prevent.

import { brand } from "../../../../shared/brand"
import { brandedEmail } from "../../../../shared/workers/email-template"
import { recordWorkerError } from "../../../../shared/workers/error-log"
import { opsDatabase } from "../../../../shared/workers/ops-db"
import { lastCronRunAt } from "./sharding"
import type { Env } from "../env"

/** R14 — a bounded read. The digest is a summary, not an export: twenty
 * signatures is already more than anyone acts on in one morning, and the rows
 * are ordered by last night's count so the twenty kept are the twenty that
 * matter. An unbounded GROUP BY here would be the same mistake as an unbounded
 * list endpoint, just at 3am instead of in front of someone. */
const DIGEST_LIMIT = 20

/** A cron that stops firing is invisible: no errors arrive, so the digest stays
 * silent, and silence is what a healthy night looks like. The heartbeat is what
 * separates the two. 26 hours, not 24 — a nightly job's runs drift by minutes,
 * and an alarm that cries wolf on a normal 24h-and-3-minutes gap gets muted. */
const HEARTBEAT_STALE_MS = 26 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

type DigestRow = {
  source: string
  place: string
  first_seen: string
  n24: number
  avg_prior: number
  sample: string
}

export type Digest = { subject: string; html: string; text: string }

/**
 * Build last night's error digest, or NULL when there is nothing to say.
 *
 * Also asserts the cron actually ran last night, and records an error if it did
 * not — that check lives here rather than beside the heartbeat write because
 * this is the one place with a reader: an error recorded here is picked up by
 * the very query below and mailed the same night.
 */
export async function buildErrorDigest(env: Env): Promise<Digest | null> {
  const now = Date.now()
  const since24 = new Date(now - DAY_MS).toISOString()
  const since7d = new Date(now - 7 * DAY_MS).toISOString()

  // 1 · Did last night's cron actually happen? Checked BEFORE the digest query
  //     so a missed run lands in `error_logs` in time to be reported by it — the
  //     alarm and its delivery are the same pass.
  //
  //     A MISSING heartbeat is not a missed run. On the first night after this
  //     ships (and on a fresh environment) there is no history at all, and
  //     "I have never run before" is not evidence that anything is broken. Only
  //     a heartbeat that EXISTS and is STALE means a night went by unworked.
  const lastRun = await lastCronRunAt(env)
  if (lastRun && now - Date.parse(lastRun) > HEARTBEAT_STALE_MS) {
    await recordWorkerError(
      opsDatabase(env),
      "tenancy",
      "cron/heartbeat",
      new Error(
        `the nightly job last completed at ${lastRun} — more than 26 hours ago, so at least one night's sizing, retention and orphan sweep did not run`
      )
    )
  }

  // 2 · One statement, three answers: how many last night (`n24`), how many a
  //     normal day looks like (`avg_prior`, the six days before it), and whether
  //     the signature is new at all (`first_seen`). Grouped by the signature —
  //     source + place — so twelve copies of one bug read as one line.
  //     `at` is an ISO-8601 string, so a string comparison IS a time comparison,
  //     and `idx_error_logs_at` already serves the window. No new index.
  const rows = await opsDatabase(env)
    .prepare(
      `SELECT source, place, MIN(at) AS first_seen,
              SUM(CASE WHEN at >= ?1 THEN 1 ELSE 0 END) AS n24,
              SUM(CASE WHEN at <  ?1 THEN 1 ELSE 0 END) / 6.0 AS avg_prior,
              MIN(substr(message,1,160)) AS sample
         FROM error_logs
        WHERE at >= ?2 AND status = 'open'
        GROUP BY source, place
        ORDER BY n24 DESC
        LIMIT ${DIGEST_LIMIT}`
    )
    .bind(since24, since7d)
    .all<DigestRow>()

  // Only last night is news. A signature that fired four days ago and has been
  // quiet since is history — mailing it again every night for a week is how a
  // digest becomes noise, and noise is how the real one gets missed.
  const active = (rows.results ?? []).filter((r) => r.n24 > 0)
  if (active.length === 0) return null // THE ALL-CLEAR. No mail is the good news.

  const isNew = (r: DigestRow) => r.first_seen >= since24
  // A spike needs BOTH tests. The ratio alone turns 1 error yesterday and 4
  // today into an alarm; the floor alone fires on any busy-but-steady signature.
  const isSpike = (r: DigestRow) => r.n24 > 3 * r.avg_prior && r.n24 >= 5

  const fresh = active.filter(isNew).length
  const spikes = active.filter((r) => !isNew(r) && isSpike(r)).length
  const total = active.reduce((n, r) => n + r.n24, 0)

  const headline = [
    fresh ? `${fresh} new` : "",
    spikes ? `${spikes} spiking` : "",
  ]
    .filter(Boolean)
    .join(" and ")
  const subject = headline
    ? `${brand.name}: ${headline} (${total} errors overnight)`
    : `${brand.name}: ${total} errors overnight`

  // Each signature on its own line. The plaintext part renders these as a real
  // list; the HTML part collapses the newlines, so every line carries its own
  // bullet and stays scannable either way. Everything here is escaped by
  // `brandedEmail` — `sample` is a crash message and therefore attacker-shaped.
  const lines = active.map((r) => {
    const tag = isNew(r) ? "NEW" : isSpike(r) ? "SPIKE" : "•"
    const normal = r.avg_prior > 0 ? `, usually ${r.avg_prior.toFixed(1)}/day` : ""
    return `${tag} ${r.source} · ${r.place} — ${r.n24} in 24h${normal}: ${r.sample}`
  })

  const { html, text } = brandedEmail({
    heading: headline ? `Overnight: ${headline}` : `Overnight: ${total} errors`,
    intro: `${total} error(s) were recorded in the last 24 hours, across ${active.length} signature(s). Counts are compared against the previous six days.\n\n${lines.join("\n")}`,
    footnote:
      "You only get this email on a night that had errors — no email means nothing was recorded.",
  })
  return { subject, html, text }
}
