// Personal access tokens (the MCP front desk's front door). The secret is shown
// ONCE at creation and only its sha256 is stored; a token is pinned to ONE team
// and revocable (revoked_at — deactivate-not-delete). Verification happens on
// EVERY MCP request, so revoking bites immediately even while a bridged session
// is still alive.

import { GuardError } from "../../../../shared/workers/gating"
import { ulid } from "../../../../shared/workers/id"
import type { Env } from "../env"

export type McpTokenRow = {
  id: string
  user_id: string
  team_id: string
  label: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** 32 random bytes, hex — prefixed so a leaked string is recognizable in scans. */
export function newTokenSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `brimba_mcp_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

/** Create a token for the signed-in caller, pinned to their CURRENT team. The
 * plain secret is returned ONCE — only its hash is stored. */
export async function createToken(
  env: Env,
  userId: string,
  teamId: string,
  label: string
): Promise<{ row: McpTokenRow; secret: string }> {
  const secret = newTokenSecret()
  const id = ulid()
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO mcp_tokens (id, user_id, team_id, label, token_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, teamId, label, await sha256Hex(secret), now)
    .run()
  return {
    row: { id, user_id: userId, team_id: teamId, label, created_at: now, last_used_at: null, revoked_at: null },
    secret,
  }
}

/** The caller's own tokens (never the hashes). */
export async function listTokens(env: Env, userId: string): Promise<McpTokenRow[]> {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, team_id, label, created_at, last_used_at, revoked_at
     FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC`
  )
    .bind(userId)
    .all<McpTokenRow>()
  return rows.results ?? []
}

/** Revoke ONE of the caller's own tokens (idempotent). */
export async function revokeToken(env: Env, userId: string, tokenId: string): Promise<void> {
  const res = await env.DB.prepare(
    "UPDATE mcp_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  )
    .bind(new Date().toISOString(), tokenId, userId)
    .run()
  if (!res.meta.changes)
    throw new GuardError(404, "token_not_found", "That token doesn't exist or is already revoked.")
}

/** Verify a bearer secret → the live token row (or a clean 401). Stamps
 * last_used_at (best-effort). Called on EVERY MCP request. */
export async function verifyToken(env: Env, bearer: string): Promise<McpTokenRow> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, team_id, label, created_at, last_used_at, revoked_at
     FROM mcp_tokens WHERE token_hash = ?`
  )
    .bind(await sha256Hex(bearer))
    .first<McpTokenRow>()
  if (!row || row.revoked_at)
    throw new GuardError(401, "bad_token", "That access token isn't valid (wrong, or revoked).")
  await env.DB.prepare("UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id)
    .run()
  return row
}
