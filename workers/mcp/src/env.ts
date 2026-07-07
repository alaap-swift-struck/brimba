export interface Env {
  /** the global core DB (native binding) — mcp_tokens live here */
  DB: D1Database
  /** account id (GatingEnv shape — whoAmI/team gating helpers expect it) */
  CF_ACCOUNT_ID: string
  AUTH: Fetcher
  TENANCY: Fetcher
  CONTENT: Fetcher
  DATAOPS: Fetcher
  /** the worker-to-worker shared secret (the auth session-mint bridge) */
  INTERNAL_KEY?: string
}
