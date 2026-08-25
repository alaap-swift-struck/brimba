// Brimba MCP worker — the external machine surface (ARCHITECTURE: the MCP front
// desk). This file is the SWITCHBOARD:
//
//   POST /mcp                    -> the MCP endpoint (JSON-RPC 2.0 over HTTP):
//                                   initialize · tools/list · tools/call.
//                                   Auth: `Authorization: Bearer <token>` — a
//                                   personal access token, verified on EVERY
//                                   request, bridged to a team-pinned session.
//   GET  /api/mcp/tokens         -> the signed-in caller's tokens (never hashes)
//   POST /api/mcp/tokens         -> create one (label; pinned to the CURRENT team;
//                                   the secret is returned ONCE)
//   POST /api/mcp/tokens/revoke  -> revoke one of the caller's own tokens
//   GET  /api/mcp/health
//
// THE LIVE-SYNC SEAM (CACHING.md "Every mutation publishes"): the token routes are
// housekeeping — a token row is CALLER-PRIVATE bookkeeping in the core DB (the
// settings screen refetches synchronously after each action; no other member can
// see it), the same reviewed class as auth's session rows. Tool calls themselves
// mutate nothing here — the REAL doors they forward to publish their own pings.

import { brandSlug } from "../../../shared/brand"
import { opsDatabase } from "../../../shared/workers/ops-db"
import { IDEMPOTENCY_HEADER } from "../../../shared/workers/concurrency"
import { fail, json } from "../../../shared/workers/http"
import { GuardError, whoAmI } from "../../../shared/workers/gating"
import { requireText, TEXT_LIMITS } from "../../../shared/workers/validate"
import { recordWorkerError } from "../../../shared/workers/error-log"
import type { Env } from "./env"
import { createToken, listTokens, revokeToken, verifyToken } from "./lib/tokens"
import { dropCachedSession, sessionCookieFor } from "./lib/bridge"
import { forwardTool, getMcpTool, MCP_TOOLS } from "./lib/tools"
import { REQUEST_ID_HEADER } from "../../../shared/workers/trace"
import { logAccountActivity } from "../../../shared/workers/account-activity"

const PROTOCOL_VERSION = "2025-06-18"

/* ------------------------------- JSON-RPC bits ------------------------------- */

type RpcRequest = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }

const rpcResult = (id: number | string | null, result: unknown) =>
  json({ jsonrpc: "2.0", id, result })
const rpcError = (id: number | string | null, code: number, message: string) =>
  json({ jsonrpc: "2.0", id, error: { code, message } })

/** One MCP request: verify the bearer token, dispatch the method. Stateless —
 * no server-held MCP session; every request re-verifies the token (so a revoke
 * bites immediately) and rides a cached-or-fresh team-pinned session cookie. */
async function handleMcp(request: Request, env: Env): Promise<Response> {
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!bearer)
    return fail(401, "no_token", "Send a personal access token: Authorization: Bearer <token>.")
  const token = await verifyToken(env, bearer)

  const rpc = (await request.json().catch(() => null)) as RpcRequest | null
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string")
    return rpcError(null, -32600, "Expected a JSON-RPC 2.0 request.")
  const id = rpc.id ?? null
  // A machine client retrying a dropped POST /mcp re-sends the same headers, so
  // this is all it takes for the MCP surface to inherit the web app's retry
  // protection — the door already knows what to do with it.
  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER)

  switch (rpc.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        // From the ONE brand file (shared/brand.ts), not a second copy of the
        // name — see the note beside `brandSlug`. scripts/smoke-staging.mjs
        // asserts this value and must derive it the same way.
        serverInfo: { name: `${brandSlug}-mcp`, version: "1.0.0" },
        instructions:
          "Brimba's machine surface. Every tool acts AS the token's owner, capped by their live role, inside the token's pinned team only. AI-costed tools (plan_import, agent_chat) draw from the team's assistant quota.",
      })
    case "notifications/initialized":
      return new Response(null, { status: 202 })
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
    case "tools/call": {
      const name = String(rpc.params?.name ?? "")
      const tool = getMcpTool(name)
      if (!tool) return rpcError(id, -32602, `No such tool: ${name}.`)
      const input = (rpc.params?.arguments ?? {}) as Record<string, unknown>
      const cookie = await sessionCookieFor(env, token)
      const out = await forwardTool(env, tool, input, cookie, idempotencyKey, request.headers.get(REQUEST_ID_HEADER))
      return rpcResult(id, {
        content: [{ type: "text", text: out.text }],
        isError: !out.ok,
        // Say it in the RESULT, not only inside the text a program won't read: a
        // capped payload is a partial answer, and a caller that can't tell will
        // treat it as the whole one.
        ...(out.truncated ? { truncated: true } : {}),
      })
    }
    default:
      return rpcError(id, -32601, `Unknown method: ${rpc.method}.`)
  }
}

/* ----------------------------- token management ----------------------------- */

/** The signed-in caller (session cookie via the gateway) — token management is a
 * HUMAN action from the app, never available to a bearer token itself. */
async function requireUser(request: Request, env: Env) {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")
  return user
}

async function getTokens(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rows = await listTokens(env, user.id)
  return json({
    tokens: rows.map((t) => ({
      id: t.id,
      label: t.label,
      teamId: t.team_id,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
      revokedAt: t.revoked_at,
    })),
  })
}

async function postToken(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (!user.currentTeamId)
    return fail(409, "no_team", "Pick a team first — a token is pinned to one team.")
  const body = (await request.json().catch(() => ({}))) as { label?: unknown }
  const label = requireText(body.label, "Name", TEXT_LIMITS.short)
  const { row, secret } = await createToken(env, user.id, user.currentTeamId, label)
  // MINTING ACCESS LEAVES A TRACE. A personal access token is the most
  // access-granting object in the app, and until 2026-08-18 it could be created
  // and revoked with no record anywhere (activity_log_review, finding 1). It
  // lands in the IDENTITY log, not a team feed: a token belongs to the person.
  await logAccountActivity(env, user.id, {
    type: "mcp_token_created",
    description: `Created the access token "${label}"`,
  })
  // The ONE time the secret leaves the server.
  return json({
    token: { id: row.id, label: row.label, teamId: row.team_id, createdAt: row.created_at },
    secret,
  })
}

async function postRevoke(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = (await request.json().catch(() => ({}))) as { id?: string }
  if (!body.id) return fail(400, "invalid_input", "A token id is required.")
  const revoked = await revokeToken(env, user.id, body.id)
  dropCachedSession(body.id)
  // Revocation matters more than creation: it is the moment access is TAKEN
  // AWAY, and the one an incident review asks about first.
  await logAccountActivity(env, user.id, {
    type: "mcp_token_revoked",
    description: `Revoked the access token "${revoked.label}"`,
  })
  return json({ ok: true })
}

/* --------------------------------- switchboard -------------------------------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`
    try {
      switch (route) {
        case "POST /mcp":
          return await handleMcp(request, env)
        case "GET /api/mcp/tokens":
          return await getTokens(request, env)
        case "POST /api/mcp/tokens":
          return await postToken(request, env)
        case "POST /api/mcp/tokens/revoke":
          return await postRevoke(request, env)
        case "GET /api/mcp/health":
          // BOOLEANS ONLY — unauthenticated door. Whether a binding is
          // configured, never what it holds and never which one is missing.
          return json({ ok: true, bindings: { ops: !!env.OPS, internalKey: !!env.INTERNAL_KEY } })
        default:
          return fail(404, "not_found", "No such MCP action.")
      }
    } catch (e) {
      // A 5xx GuardError IS an outage, and it was returning without a row.
      //
      // `GuardError` carries both refusals and failures. A 403 is the system
      // working — the person may not do that, and recording it would fill the
      // table with correct behaviour. But `whoAmI` throws a 503 when AUTH does
      // not answer, and `whoAmI` is the busiest call in the base: an auth outage
      // 503s every screen for everyone, and left its only evidence in an absence.
      // The one incident you would most want a record of produced none.
      //
      // So the branch splits on the status, not on the type. (Error-log review,
      // 2026-08-25.)
      if (e instanceof GuardError) {
        if (e.status >= 500)
          await recordWorkerError(opsDatabase(env), "mcp", `${request.method} ${new URL(request.url).pathname}`, e, request)
        return fail(e.status, e.code, e.message)
      }
      console.error("mcp worker error:", e)
      await recordWorkerError(opsDatabase(env), "mcp", `${request.method} ${pathname}`, e, request)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>
