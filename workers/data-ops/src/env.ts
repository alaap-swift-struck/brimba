// Everything the data-ops worker is given from outside. This shape structurally
// satisfies the shared GatingEnv (AUTH + DB + the Cloudflare D1 credentials), so
// teamContext / requireRight / adminGuard work here exactly as in the other workers.
export type Env = {
  /** The global core database (users, teams, importable_databases) — read by
   *  gating + the import catalog. */
  DB: D1Database
  /** The auth worker — answers "who is making this request?". */
  AUTH: Fetcher
  /** The realtime worker — pinged after the final write so open lists refresh. */
  REALTIME: Fetcher
  /** The content worker — import writes Learning rows through its gated create
   *  endpoint (act-as-user: the caller's cookie is forwarded). */
  CONTENT: Fetcher
  /** The tenancy worker — import writes Member-role rows through its gated create
   *  endpoint (act-as-user). */
  TENANCY: Fetcher

  /** Cloudflare account id (plain var) — for reaching per-team databases. */
  CF_ACCOUNT_ID: string

  // Secrets (wrangler secret put):
  /** API token scoped to Account → D1 → Edit (reach per-team DBs over the REST door). */
  CF_D1_TOKEN?: string
  /** Shared secret for internal worker-to-worker calls (defense-in-depth). */
  INTERNAL_KEY?: string
  /** Owner-only key guarding the import-catalog seed/maintenance endpoints. */
  ADMIN_KEY?: string
}
