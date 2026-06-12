// Everything the auth worker is given from outside (bindings, vars, secrets).
export type Env = {
  DB: D1Database
  /** Profile photos (and other uploads) — served by the gateway at /media/*. */
  MEDIA: R2Bucket

  /** The app's public address — used for redirects and Google's callback. */
  APP_ORIGIN: string
  /** From-address for code emails, e.g. "Brimba <onboarding@resend.dev>". */
  EMAIL_FROM: string
  /** "1" = include the login code in the API response (staging/dev ONLY). */
  DEV_ECHO_CODES: string
  /** Google OAuth client id; empty string = Google login not wired yet. */
  GOOGLE_CLIENT_ID: string

  // Secrets (wrangler secret put) — optional until the user provides them.
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_KEY?: string

  /** "1" only in local dev (.dev.vars) — lets the cookie work on http://localhost. */
  INSECURE_COOKIE?: string
}
