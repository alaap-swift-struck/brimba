// One source for the verification-code policy, shared by the login flow
// (index.ts) and the email-change flow (email-change.ts) — so the TTL, attempt
// cap and per-hour throttle can never drift between the two.
export const CODE_TTL_MINUTES = 10
export const MAX_CODE_ATTEMPTS = 5
export const MAX_CODES_PER_HOUR = 5
