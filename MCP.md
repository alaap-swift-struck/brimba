# MCP.md — the machine door (how outside tools use Brimba)

Brimba has an **external machine surface**: an AI agent, a script, or an automation
can do the same things a person can — invite/manage members, read and write learning
and help, run imports, pull CSV exports, even talk to the in-app assistant — over the
**Model Context Protocol (MCP)**. This is the `mcp` worker (ARCHITECTURE → the MCP
front desk). This doc is for the **developer** who wants to connect a tool to it.

The one sentence to remember: **a machine acts AS a real person, in ONE team, capped
by that person's live role — never more.** There is no separate "API key with god
powers." A token is just that person, reached by a machine.

---

## 1 · Who can use it

Anyone who can sign into the app and holds a role that allows the actions they want.
There is no separate developer account system — the machine borrows a human's rights.

So to give a teammate/contractor machine access:

1. **Invite them to the team** (Settings → Members → Invite, or the app's invite flow).
   They sign in with **email + a 6-digit code** (no passwords). Hand them the app URL:
   - Staging: `https://brimba-staging.swift-struck.workers.dev`
   - Production: `https://brimba.swift-struck.workers.dev`
2. **Give them the right role.** The token can only do what their role allows (see the
   cost note in §4 — a role *without* the AI-agent right can't spend any AI budget).
   For a pure "read + import + export" integration, a role with those rights and **no
   agent access** is the safe, zero-AI-cost choice.
3. They **make their own token** (next section). You never see or handle their secret.

Prefer a **service account** for an unattended integration: create one app account
(e.g. `ci@yourco.com`), invite it with a tightly-scoped role, and let it hold the
token — so a person leaving doesn't break the automation, and you can revoke it alone.

---

## 2 · Get a token (once, in the app)

1. Sign in → **Settings → Access tokens → New token**.
2. Give it a name (what will use it — "CI importer", "Zapier", "Claude Desktop").
3. Copy the secret **immediately** — it's shown **once** and never again (only its hash
   is stored). It looks like `brimba_mcp_<64 hex chars>`.
4. The token is **pinned to the team you were in** when you made it, and **capped by
   your role at call time** (change the role later and the token's power changes with
   it). Revoke it any time from the same screen — revocation takes effect on the very
   next call.

Treat the secret like a password. Anyone holding it can act as you, in that team.

---

## 3 · Connect a tool

The endpoint is **`POST https://<app-host>/mcp`** (JSON-RPC 2.0), authenticated with
`Authorization: Bearer <your token>`. It speaks standard MCP: `initialize`,
`tools/list`, `tools/call`.

**Quick check with curl:**

```bash
# List the tools this token can call
curl -s https://brimba.swift-struck.workers.dev/mcp \
  -H "Authorization: Bearer brimba_mcp_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call one — who am I, and which team is this token pinned to?
curl -s https://brimba.swift-struck.workers.dev/mcp \
  -H "Authorization: Bearer brimba_mcp_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

**An MCP client that speaks HTTP + a bearer header** (e.g. an agent framework, or a
custom client) points at that URL with the header. For clients that only launch a
local stdio command (e.g. **Claude Desktop**), put a thin MCP-over-HTTP bridge in
front with the standard `mcp-remote` shim — drop this into the client's MCP config:

```json
{
  "mcpServers": {
    "brimba": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://brimba.swift-struck.workers.dev/mcp",
        "--header", "Authorization: Bearer brimba_mcp_YOUR_TOKEN"
      ]
    }
  }
}
```

### Hand it to any AI (Claude / Gemini / GPT) — copy-paste prompt

The app does this for you: after you create a token, **Settings → Access tokens** shows
a **"Copy setup prompt for any AI"** button (and an **Instructions** button on every
active token) that copies the block below with the live host filled in. Paste it into
any assistant that can speak MCP:

```
Connect to my Brimba workspace over MCP (Model Context Protocol).

Endpoint: https://brimba.swift-struck.workers.dev/mcp
Auth header: Authorization: Bearer brimba_mcp_YOUR_TOKEN
Protocol: MCP over HTTP — JSON-RPC 2.0 (initialize, tools/list, tools/call)

Then call tools/list to see what I can do. You act as me, in one team, capped by my
role — reads, exports and imports are free; only the assistant tools (agent_chat,
agent_confirm, plan_import) use the team's AI quota.
```

(Staging is the same, on `https://brimba-staging.swift-struck.workers.dev/mcp`.)

### The tools

Confirm the live list with `tools/list` (it's generated, so it's always current).
Today it covers:

- **Read:** `whoami`, `list_members`, `list_roles`, `list_dropdown_values`,
  `list_learning`, `list_help_tickets`, `list_imports`.
- **Export (full-field CSV):** `export_roles_csv`, `export_learning_csv`,
  `export_dropdown_values_csv`.
- **Write — deterministic create / edit / deactivate** (free, no AI; each needs the
  matching role right, e.g. `member_roles:create`):
  - roles — `create_role`, `update_role`, `set_role_active`, `set_role_permissions`
  - members — `set_member_role`, `remove_member` (people join via **invite**)
  - invites — `create_invite`, `revoke_invite`
  - dropdown values — `create_dropdown_value`, `update_dropdown_value`, `set_dropdown_value_active`
  - learning — `create_learning`, `update_learning`, `set_learning_active`
  - help — `create_help_ticket`, `update_help_ticket`, `set_help_status`, `reply_help_ticket`
- **Bulk create:** the import pipeline — `start_import` → `add_import_file` →
  `plan_import` → `run_import`.
- **The in-app assistant:** `agent_chat`, `agent_confirm`.

Every tool is a thin forward to the **same gated door the app's own screens use** — so
input is validated, **your live role is re-checked** (a Viewer's `create_role` is
refused, exactly as in the UI), and the change gets the same audit trail and live-sync
as if a person had done it in the UI. The **deactivate-not-delete** model holds (nothing
is hard-deleted) and the locked guards fire even here (you can't remove yourself or the
last admin). A test (`workers/mcp/test/catalog.test.ts`) fails the build if the catalog
ever drifts from those real doors.

There is deliberately **no confirm step on the direct write tools** — calling
`remove_member` *is* the intent (like clicking through the UI's confirm). Route
genuinely uncertain, natural-language actions through `agent_chat` instead: it proposes,
you approve with `agent_confirm`.

---

## 4 · Who pays? (the cost model — read this)

**Most tools cost you nothing beyond a normal API request.** Reads, exports, imports,
and token management are just calls to our Cloudflare Workers + databases — cheap, no
AI involved. The developer does **not** bring their own AI billing, and does **not**
pay Anthropic — they're hitting our endpoints.

**Two kinds of tool DO draw the team's AI budget** (because they use the assistant):

| Tool | AI cost | Bounded by |
|---|---|---|
| `agent_chat`, `agent_confirm` | Yes — one assistant turn each | The **team's AI quota** (free per day + purchased credits) AND needs the **AI-agent right** |
| `plan_import` | Yes — one assistant unit per plan | The team's AI quota |
| everything else | No | — |

That AI cost lands on **the team's quota** (our Anthropic key), **not** on the
developer. So two levers keep it under control:

1. **The quota is the ceiling.** All AI use — humans in the app + every machine token
   on the team — draws the same daily allowance (`AGENT_FREE_DAILY`, plus any
   top-up). When it's spent, `agent_chat` / `plan_import` return a clean "out of AI
   requests" (HTTP 429) until it resets or an admin adds credits. A runaway script
   can't run up an unbounded bill — it hits the quota wall.
2. **Scope the role.** A token can only call `agent_chat` / `agent_confirm` if its
   role holds the **AI-agent create right**. Give a developer a role **without** it and
   those tools return 403 — their token literally cannot spend agent AI budget. Reads,
   exports, and running a *pre-planned* import stay available. (`plan_import` is the one
   import step that uses AI — bounded by the quota like everything else.)

So your instinct is right for the cheap tools ("they're just hitting our endpoints") —
and for the AI tools, the quota + the role are how you keep the cost yours-but-bounded,
or zero, by choice.

---

## 5 · Security posture (what a token can't do)

- **Acts AS the owner, capped by their LIVE role** — re-checked on every call. Demote
  the person and the token weakens the same instant.
- **One team only.** The token is pinned to the team it was made in; it can never read
  or write another team's data (isolation by physics — separate databases).
- **No god mode.** The tool catalog is **opt-in** — only the listed, gated actions are
  exposed. Internal/maintenance endpoints, other people's device sessions, deleting the
  team: not in the catalog, structurally unreachable.
- **Revoke bites immediately.** The token is re-verified on every request, so revoking
  it stops the next call — even if a session was mid-flight.
- **Hashed at rest.** Only the token's hash is stored; the secret is shown once.

**One honest limit:** the assistant/import tools are bounded by the team's AI quota,
but the *cheap* tools (reads, exports) aren't application-rate-limited today — they
lean on the fact that a token is a trusted, role-scoped, instantly-revocable party
behind Cloudflare's protection, and they expose nothing the holder couldn't already
read in the app. If you ever hand a token to a *less*-trusted integration, prefer a
tightly-scoped role and watch `last_used_at`; a per-token rate limit is a small future
add if you need it.

---

## 6 · For maintainers (where it lives)

`workers/mcp/` — `POST /mcp` (JSON-RPC) + session-gated token management under
`/api/mcp/tokens*`; the human-facing card is `web/components/access-tokens.tsx`
(Settings → Access tokens). Tokens live in the core DB (`mcp_tokens`, migration
`0013`); a token is bridged to a **short-lived team-pinned session** via auth's
`/internal/mcp-session` (INTERNAL_KEY, fail-closed). The gateway routes `/mcp` +
`/api/mcp/*` to the worker (it's the only public door; the mcp worker is
`workers_dev:false`). See ARCHITECTURE.md (the `mcp` row) and DATA-MODEL.md
(`mcp_tokens` + `sessions.team_pin`).
