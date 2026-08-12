// Everything the tenancy worker is given from outside.
export type Env = {
  /** The global core database (users, teams, team_members, invite_index). */
  DB: D1Database
  /** The OPERATIONS database — error_logs + agent_usage_log. Optional: absent
   * in a fork that has not created it, and in `wrangler dev`. When absent the
   * ops seam falls back to DB, so everything works exactly as it did. */
  OPS?: D1Database
  /** The auth worker — used to answer "who is making this request?". */
  AUTH: Fetcher
  /** The realtime worker — pinged after a write so open screens refresh live. */
  REALTIME: Fetcher
  /** Team logos (uploaded), served by the gateway at /media/teams/<id>. */
  MEDIA: R2Bucket
  /** The learning attachments bucket — read only by the nightly orphan sweep. */
  LEARNING_MEDIA: R2Bucket

  /** Cloudflare account id (plain var) — for creating/querying team DBs. */
  CF_ACCOUNT_ID: string
  /** The public WEB origin the SPA is served on (the gateway's public URL),
   *  used for links in outbound emails. Set per env in wrangler vars. */
  PUBLIC_APP_URL?: string

  // Secrets (wrangler secret put):
  /** API token scoped to Account → D1 → Edit. Without it, team databases
   *  can't be created or queried — bootstrap fails with a clear message. */
  CF_D1_TOKEN?: string
  /** Protects the migrate-all-team-DBs maintenance endpoint. */
  ADMIN_KEY?: string
  /** Shared secret sent to auth's /internal/send-email (must match auth's
   * INTERNAL_KEY). Defense-in-depth alongside workers_dev:false. */
  INTERNAL_KEY?: string
  /** Per-user ceiling on CREATED teams (each provisions a database). The owner's
   * override: set it higher per environment; unset falls back to the code default. */
  MAX_TEAMS_PER_USER?: string
}
