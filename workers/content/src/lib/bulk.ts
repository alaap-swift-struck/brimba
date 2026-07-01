// Boundary validation for the BULK batch endpoints. A batch body carries an
// `ids` array — untrusted, so it's checked here the same way validate.ts checks a
// text field: reject anything that isn't a non-empty array of non-empty strings,
// and cap the batch so one request can't fan out unboundedly. Throws the clean 400
// GuardError the worker already maps (bad input is a 400, never a 500).

import { GuardError } from "../../../../shared/workers/gating"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"

/** The most ids a single batch may carry (a bulk change is high-blast). */
export const BULK_IDS_LIMIT = 500

/** Validate an untrusted `ids` value into a clean string[]: must be a non-empty
 * array, at most BULK_IDS_LIMIT entries, each a non-empty string (NULs stripped,
 * trimmed, capped like any short id). De-dupes so one id can't be double-counted.
 * Throws a 400 GuardError on anything else. */
export function requireIdList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new GuardError(400, "invalid_input", "ids must be a non-empty list.")
  if (value.length > BULK_IDS_LIMIT)
    throw new GuardError(400, "invalid_input", `Too many ids (max ${BULK_IDS_LIMIT} per batch).`)
  const seen = new Set<string>()
  for (const raw of value) {
    // requireText throws a clean 400 on a non-string / blank / over-long id.
    seen.add(requireText(raw, "id", TEXT_LIMITS.short))
  }
  return [...seen]
}
