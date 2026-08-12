// Everything the auth worker is given from outside (bindings, vars, secrets).
export type Env = {
  DB: D1Database
  /** The OPERATIONS database — error_logs + agent_usage_log. Optional: absent
   * in a fork that has not created it, and in `wrangler dev`. When absent the
   * ops seam falls back to DB, so everything works exactly as it did. */
  OPS?: D1Database
  /** Profile photos (and other uploads) — served by the gateway at /media/*. */
  MEDIA: R2Bucket
  /** The live switchboard — auth publishes identity events (account activity,
   * profile, forced sign-out) to a user's OWN channel. */
  REALTIME: Fetcher

  /** The app's public address — used in login emails and redirects. */
  APP_ORIGIN: string
  /** Verified-sender from-address for transactional email
   * (e.g. "noreply@updates.swiftstruck.com"). */
  EMAIL_FROM: string

  // Secrets (wrangler secret put) — optional until the user provides them.
  RESEND_API_KEY?: string
  /** STAGING ONLY — gates the /api/auth/admin/test-login door (mints a login
   * code and returns it once, so automated tests can sign in now that codes are
   * never echoed anywhere). The holder can sign in as ANY account on the
   * environment: NEVER set this on the production auth worker. Fails closed
   * when unset — production simply has no test door. */
  /** Owner-only maintenance key (shared name across workers — NEVER the
   * test-login door's key; see TEST_LOGIN_KEY). */
  ADMIN_KEY?: string
  /** The test-login door's OWN secret. Its holder can sign in as any account, so
   * it is set on NON-PRODUCTION environments only — and the door additionally
   * refuses outright when ENVIRONMENT is "production". */
  TEST_LOGIN_KEY?: string
  /** Which environment this worker is: "production" | "staging" | … Set as a var
   * in wrangler.jsonc, so it ships with the deploy and can't be forgotten. */
  ENVIRONMENT?: string
  /** Shared secret guarding /internal/send-email (defense-in-depth alongside
   * workers_dev:false). When set, the route rejects callers lacking the header. */
  INTERNAL_KEY?: string

  /** "1" only in local dev (.dev.vars) — lets the cookie work on http://localhost. */
  INSECURE_COOKIE?: string
}
