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

  /** Cloudflare Workers AI — the cheap/default model (help drafts, classification,
   *  and the no-key answer path). Always available, no external key. */
  AI: Ai
  /** The agentic model id used WHEN a Claude key is set (one config swap). */
  AGENT_MODEL?: string
  /** Reasoning effort for the Claude path: low | medium | high | xhigh | max.
   *  Defaults to "low" (cheap). Raise it when more capability is worth the cost. */
  AGENT_EFFORT?: string
  /** Daily free agent turns per team; defaults to FREE_DAILY. Set very high to
   *  effectively remove the cap. */
  AGENT_FREE_DAILY?: string
  /** The Workers AI model id for the cheap/fallback path. */
  WORKERS_AI_MODEL?: string
  // Secret (wrangler secret put): when set, the agentic path upgrades to Claude;
  // when absent, the agent answers via Workers AI (acting is limited).
  ANTHROPIC_API_KEY?: string
}
