// READING A NUMBER THE WAY A PERSON WROTE IT — without ever guessing.
//
// A spreadsheet exports `1,000`. A person types `1 000`. Both mean one thousand
// and both used to be refused with "must be a number", which is true of the
// string and useless to the human holding the file.
//
// But `1,5` is genuinely ambiguous: one and a half in most of Europe, fifteen
// with a stray separator elsewhere. There is no context in a CSV cell that
// settles it. So the rule here is narrow and stated:
//
//   NORMALISE what is unambiguous  ·  REFUSE what is not  ·  never guess
//
// Refusing ambiguity is a correct answer that a person can act on ("write it as
// 1.5 or 15"). Guessing is a silent, unauditable error in someone's stock ledger.
//
// EXACT STRING ARITHMETIC, ALWAYS. Nothing here calls parseFloat, Number(), or
// any float path. A quantity that round-trips through a JavaScript double is a
// quantity that can arrive as 0.30000000000000004, and an inventory built on
// that is wrong in a way that compounds every movement. The value stays a
// STRING, digits and an optional single dot, all the way to the database.

/** What a normalisation attempt produced. */
export type NumberResult =
  | { ok: true; value: string }
  | { ok: false; reason: string }

/** Thousands separators, but ONLY in the shape that cannot mean anything else:
 * one to three leading digits, then one or more groups of EXACTLY three.
 * `1,000` and `12,345,678` match. `1,5` and `1,23` do not — those are the
 * ambiguous cases, and they are refused rather than resolved. */
const GROUPED = /^\d{1,3}(,\d{3})+$/
const GROUPED_SPACED = /^\d{1,3}( \d{3})+$/

/** A plain number after separators are removed: digits, one optional dot. */
const PLAIN = /^-?\d+(\.\d+)?$/

/** A comma or space that is NOT in a valid grouping — the ambiguous shape. */
const HAS_SEPARATOR = /[, ]/

/**
 * Turn what a person wrote into an exact decimal string, or say why not.
 *
 * Accepts: `1000` · `1,000` · `1 000` · `12,345,678` · `-42` · `3.5` · `  7  `
 * Refuses: `1,5` · `1,23` · `1.2.3` · `1,000.5,2` · `abc` · `` · `1e3`
 *
 * `1e3` is refused deliberately. It is unambiguous to a machine and opaque to a
 * person checking a stock count, and accepting it would mean going through a
 * float to expand it — which is the one thing this function exists to avoid.
 */
export function normaliseNumber(raw: unknown): NumberResult {
  if (typeof raw !== "string" && typeof raw !== "number")
    return { ok: false, reason: "must be a number" }

  const text = String(raw).trim()
  if (!text) return { ok: false, reason: "must be a number" }

  const negative = text.startsWith("-")
  const body = negative ? text.slice(1) : text

  // Split off the decimal part first, so grouping is only judged on the integer
  // side. `1,234.50` is a grouped thousand with a decimal — perfectly clear.
  const dots = body.split(".")
  if (dots.length > 2) return { ok: false, reason: "has more than one decimal point" }
  const [intPart, decPart] = dots

  let cleanInt = intPart
  if (HAS_SEPARATOR.test(intPart)) {
    if (GROUPED.test(intPart)) cleanInt = intPart.replace(/,/g, "")
    else if (GROUPED_SPACED.test(intPart)) cleanInt = intPart.replace(/ /g, "")
    else
      // The ambiguous case, and the whole reason this function exists. Say what
      // to write instead, because "invalid" alone leaves the person guessing
      // which of the two readings we wanted.
      return {
        ok: false,
        reason: `"${text}" could mean two different numbers — write it as a plain number (1.5) or without separators (15)`,
      }
  }

  if (decPart !== undefined && HAS_SEPARATOR.test(decPart))
    return { ok: false, reason: "the decimal part must not contain separators" }

  const value = `${negative ? "-" : ""}${cleanInt}${decPart !== undefined ? `.${decPart}` : ""}`
  if (!PLAIN.test(value)) return { ok: false, reason: "must be a number" }

  // Trim a leading-zero run (`007` → `7`) without touching a bare `0`, so the
  // stored string is canonical and two spellings of the same quantity compare
  // equal as strings.
  const canonical = value.replace(/^(-?)0+(?=\d)/, "$1")
  return { ok: true, value: canonical }
}

/** Is this exact decimal string zero? String comparison, no float. */
export function isZero(value: string): boolean {
  return /^-?0+(\.0+)?$/.test(value)
}

/** Is this exact decimal string negative? `-0` is not negative. */
export function isNegative(value: string): boolean {
  return value.startsWith("-") && !isZero(value)
}

/** Is this exact decimal string a whole number? */
export function isInteger(value: string): boolean {
  return !value.includes(".") || /^\-?\d+\.0+$/.test(value)
}
