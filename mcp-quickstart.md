# Connect to Brimba over MCP — quickstart

Hand this one file to a developer. It's the short version of [MCP.md](MCP.md).

A machine (an AI agent, a script, an automation) can do the same things you can do in
Brimba — over the **Model Context Protocol (MCP)**. It acts **as you, in one team,
capped by your role** — never more. There's no separate "API key with god powers."

---

## 1 · Get in

1. **Sign in** to the app (email + a 6-digit code — no passwords):
   - Production: `https://brimba.swift-struck.workers.dev`
   - Staging: `https://brimba-staging.swift-struck.workers.dev`
   (If you're not on the team yet, ask the owner to invite you.)
2. **Settings → Access tokens → New token.** Name it, then **copy the secret now** —
   it's shown once and looks like `brimba_mcp_…`. Treat it like a password.

## 2 · The endpoint

`POST https://brimba.swift-struck.workers.dev/mcp` — JSON-RPC 2.0, authenticated with
`Authorization: Bearer <your token>`. (Staging: same path on the staging host.)

## 3 · Connect

**Any HTTP MCP client** (agent framework, custom client): point it at that URL with the
`Authorization: Bearer …` header.

**Claude Desktop** (or any stdio-only client) — add this to its MCP config:

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

**Any AI (Claude / Gemini / GPT)** — paste this prompt (the app's "Copy setup prompt for
any AI" button gives you this with your host + token already filled in):

```
Connect to my Brimba workspace over MCP (Model Context Protocol).

Endpoint: https://brimba.swift-struck.workers.dev/mcp
Auth header: Authorization: Bearer brimba_mcp_YOUR_TOKEN
Protocol: MCP over HTTP — JSON-RPC 2.0 (initialize, tools/list, tools/call)

Then call tools/list to see what I can do. You act as me, in one team, capped by my
role — reads, exports and imports are free; only the assistant tools (agent_chat,
agent_confirm, plan_import) use the team's AI quota.
```

**Test with curl:**

```bash
curl -s https://brimba.swift-struck.workers.dev/mcp \
  -H "Authorization: Bearer brimba_mcp_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 4 · What it costs

Reads, CSV exports, and imports are **free** — just endpoint calls. Only the assistant
tools (`agent_chat`, `agent_confirm`, and the `plan_import` step) use the **team's AI
quota**, and only if your role has the AI-agent right. A role without it can't spend any
AI budget — reads/exports still work.

## 5 · Good to know

- **Revoke any time** from the same screen — it stops the next call instantly.
- **One team only.** The token is pinned to the team you made it in.
- **Your live role is the cap.** Change the role and the token's power changes with it —
  you never touch the token.

Full detail (tool list, security posture, cost table): [MCP.md](MCP.md).
