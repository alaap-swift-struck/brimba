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

- **Read:** `whoami`, `list_members`, `list_roles`, `list_invites`,
  `list_dropdown_values`, `list_learning`, `list_help_tickets`, `list_imports`. Each
  list tool that sits on a door with an `?id=` filter now EXPOSES + FORWARDS it (R19
  parity) — pass `id` to fetch one record instead of pulling the whole collection
  (`list_help_tickets` also takes `scope`).

  **One asymmetry worth stating plainly.** The in-app assistant now stops for a yes/no
  panel before every write that decides who-can-do-what — derived from the gate map,
  so anything gated on `member_roles:` or `team_members:` is included (EDGE-CASES §5). The MCP
  surface has **no such panel and cannot have one**: the confirming UI belongs to your
  client, not to Brimba. That is not a capability gap — the same door, the same gate, the
  same audit row — but it means the operator of an MCP client is the one deciding when to
  confirm. If your client drives an LLM that reads team data (tickets, articles), treat
  those tools the way Brimba does and put a human in front of them.

  **`list_help_tickets` is PAGED** (R14 — tickets are a growing collection). One call
  returns one page plus `total` (the exact server count, not the page length),
  `hasMore`, and an opaque `nextCursor`. To read further, call again passing that
  value as `cursor`; never construct or mutate one — a cursor the server didn't issue
  is refused with a 400. When `hasMore` is false you have reached the end. A client
  that ignores the cursor still works: it simply sees the newest page.
  **Every edit tool takes an optional `expectedVersion`** — the `updated_at` you were
  shown when you read the record (a row that has never been edited uses its
  `created_at`). Send it back and the door refuses to land on a row that has moved on
  since, answering `409 changed_elsewhere` instead of silently overwriting someone's
  work; omit it and your edit wins any concurrent race. It is optional because a
  caller that genuinely hasn't read the row first has nothing to send — supplying it
  is how a machine caller opts INTO the protection the web app gets by default.

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

**Intentionally NOT on the MCP surface (a reasoned exclusion, not a gap):** the
multi-row *mutation* tools the in-app assistant uses — `bulk_set_help_status`,
`bulk_set_learning_active`, `bulk_set_dropdown_active`, and the set-shaped
`set_help_status_by_filter` — are agent-only. They're built around the app's yes/no
CONFIRM panel (a person approves the true count before a high-blast write runs); a
headless MCP client has no such panel, so exposing them would be a blind mass-write. A
machine client that needs the same effect composes the single-record writes above (each
gated + audited identically). The bulk READ path — filtering a list to one record via
`id` — IS on MCP (R19 parity).

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
  team: not in the catalog, structurally unreachable. Every write route gates on a
  permission (machine-checked — Law R10), so a tool can't skip the gate.
- **Writes are reversible + audited.** The write tools deactivate, never hard-delete;
  every change stamps an audit block (who + when) and the locked guards fire even here —
  you can't remove yourself or the last admin.
- **Revoke bites immediately.** The token is re-verified on every request, so revoking
  it stops the next call — even if a session was mid-flight.
- **Hashed at rest.** Only the token's hash is stored; the secret is shown once.

### What is deliberately NOT a tool

The catalogue is opt-in, so an absence is a decision. Here is every one, named —
because an undocumented absence is indistinguishable from an oversight, and the
next person maintaining this needs to tell them apart.

**Every claim below is machine-checked** against BOTH machine catalogues by
`workers/mcp/test/catalog.test.ts` — the MCP's own tools and the in-app
assistant's. Until 2026-08-25 nothing checked it at all, and it was wrong: it
claimed that creating an invite, revoking an invite and setting role permissions
were "deliberately kept to the UI", while `create_invite`, `revoke_invite` and
`set_role_permissions` had all been live tools since 8 July. `git log -S` traces
those rows to the commit of an MCP-parity audit that scored 98/100 — the audit
had found a coverage gap and closed it by writing a doc saying the gap was
intentional. The doc was false the day it shipped, and nothing could notice,
because the claim and its evidence had the same author. (Historical: those three
are live tools today and are listed in §3.)

The check written that day was narrower than the fault. It read one catalogue,
so five rows stayed false for another fortnight: they said "not exposed" of
endpoints an ASSISTANT tool forwards to. **So the list is split by surface**, and
each half says which machine it is about. A capability withheld from a headless
script is not the same decision as one withheld from every machine, and writing
them in one table made both unreadable.

That is the general lesson, and it is why the check exists: **a documented
exclusion must be checked against the code it excludes — on every surface that
could contradict it.**

#### Not on MCP — the in-app assistant has it

These are live agent tools. The assistant runs inside a signed-in person's own
session, in front of a screen that can stop and ask; a token is often held by an
unattended script. Where that difference decides the matter, the capability sits
on one surface and not the other.

| Not exposed | Why |
|---|---|
| `learning/bulk-active`, `help/bulk-status`, `help/bulk-status-by-filter`, `selectable/bulk-active` | Bulk writes. Each is built around the app's yes/no confirm panel — a person approves the TRUE count before a high-blast write runs — and MCP has no panel to show, because the confirming UI belongs to your client, not to Brimba. A machine client composes the single-record writes, or uses `plan_import`, which shows what it will do first. |
| `learning/done` | Per-person progress, written on someone's behalf. The assistant is driven by the person whose progress it is, so "mark this done" is unambiguous there. A token may belong to a service account, whose own learning progress means nothing — so MCP leaves this to the person. |
| `teams/update` | Renaming the team. The assistant renames it for the person driving it. A token is PINNED to one team, and letting it rewrite that team's identity is a larger act than the token's purpose — so it is not on MCP. |
| `get_role_permissions` (the read side of a role's matrix) | MCP already serves the same data more completely, through `export_roles_csv`: every role, full fields, the flattened permission matrix, in one call. A second door for one role would be a narrower duplicate, not a missing capability. |

#### Not on any machine surface

Neither the MCP catalogue nor the assistant's forwards to these.

| Not exposed | Why |
|---|---|
| `help/thread` (a ticket's replies) | **A known gap, named as one rather than defended.** A machine caller can list tickets, move them along their lifecycle and ADD a reply — but cannot read the conversation it is replying to. The door is gated on `help:read`, the same right `list_help_tickets` already needs, so nothing is being withheld; the tool simply does not exist yet. Until it does, treat a machine ticket workflow as write-mostly. |
| `admin/migrate-teams`, `admin/move-module`, `admin/db-sizes`, `admin/errors`, `admin/seed-targets`, `admin/grant-credits` | Owner-only maintenance, gated by `ADMIN_KEY` (`adminGuard`) rather than by a role — rolling team-schema migrations, relocating a module's database, sizing every tenant, reading and resolving the central error log, seeding the import catalogue, topping up a team's AI credits. A token holder is a USER; these are operator actions, and no tenant's rights can reach them. |
| `admin/test-login` | A non-production test door with its own key, refused outright when the environment is production. |
| `bootstrap`, `switch-team`, `invitations`, `invitations/accept`, `tenancy/teams`, `tenancy/active` | Identity-sensitive self-actions and the cross-team view. A token is pinned to ONE team by design; these doors either move the caller between teams or answer with EVERY team the person belongs to, which would tell a token about tenancies it may never read. |
| `teams` (create) | Creating a tenant. A token is pinned to one team, so a door that makes a new one has nothing to pin to. |
| `my-permissions` | The caller's own rights, which the app reads once to decide which screens to draw. A machine caller learns the same thing from the doors themselves — a refusal names the missing right ("your role is missing the `edit` right on …") — so a separate rights-introspection tool would be a second source of truth for something the gate already says out loud. |
| `team-meta` | The team's Overview block (name, who created it, when it last changed) — a rendering convenience assembled for one panel, not a record with a life of its own. |
| `tenancy/activity`, `auth/activity` | The activity feeds: the team's audit trail and a person's own account history. Handing any token a complete history of everyone's actions is a monitoring capability, and a different product decision from a record read — so it is named here as a decision not yet taken, rather than left as an absence. |
| `help/stakeholders` | A ticket's stakeholders. The list is a HYBRID and mostly DERIVED at read time — the raiser, the current admins and everyone @mentioned in the thread — with only manual adds stored, and no remove path anywhere. A machine caller changes it by replying with a mention, which is the same thing a person does. |
| `learning/progress` | The curator dashboard: every member's done state in one read. It is a management VIEW over the per-person write above, and that write is not on the machine surface either. |
| `learning/upload` | Binary upload; the raw-body wire format is not a good fit for a JSON-RPC tool. |
| `media/learning` (and the `/media` objects generally) | Not an API door at all — the gateway serves these to any GET that has the URL, so a machine client holding an article already holds its attachments. The URL is the only thing guarding the object, so a tool would add no access anyone did not already have. |
| `auth/profile`, `auth/logout`, `auth/email/start`, `auth/email/verify`, `auth/email/change/start`, `auth/email/change/verify` | The person's own identity: signing in and out, their name and photo, and the email their account is keyed on. A token carries a person's RIGHTS, not their identity — a token that could change the email it authenticates against would outlive the person's control of the account. |
| `mcp/tokens`, `tokens/revoke` | Minting, listing and revoking access tokens. These doors are session-gated (a signed-in browser, via `whoAmI`), so a bearer token structurally cannot reach them: you get a token by signing in, and no token can mint another or extend its own life. That is what makes "revoke bites immediately" true. |
| `agent/thread`, `agent/threads`, `agent/usage`, `agent/usage-log` | The assistant's own bookkeeping. Conversations are scoped to the caller who had them (`creator_id`), and `agent_chat` already returns everything a machine caller needs from its own turn; the usage views are a billing screen for an admin, not an integration surface. |
| `import/targets`, `import/sample` | The import wizard's scaffolding — the catalogue of importable targets and a blank sample CSV. `plan_import` is where a machine caller learns what a file will become: it reads the same catalogue and answers about the actual file rather than in the abstract. |
| `import`, `import/file`, `import/mapping`, `import/preview`, `import/confirm` | The single-target import session — a stateful multi-step flow over the caller's own draft. The batch tools (`start_import` → `add_import_file` → `plan_import` → `run_import`) are the supported machine path and cover the same ground in one shape. |

Everything else — reading and writing the actual records — is exposed, and each
tool forwards to the same gated route the web app posts to.

**`config/screens` is gone from this list because the subsystem is gone.** It sat
here as an exclusion — "changes what every member of the team SEES" — but the door
had no caller on ANY surface, so the row was describing something unreachable
rather than a decision anyone had made. Offered the choice between finishing it and
removing it, the owner chose removal on 2026-08-25: the table, the migration, the
gate, the validator, the permission row, the renderer and the client merge all
went. There is nothing to exclude.

*(This paragraph was itself broken for an hour. The edit that removed the deleted
tool's name took out one line from the middle of a sentence and left the rest
advertising a tool with no code behind it — a regex deletion on prose, which is the
same class of mistake as a regex scanner on source. `story_checks_out` round 4
found it.)*

**Two honest limits:**

1. **No per-token rate limit yet.** The non-AI tools (reads, exports, **and now
   writes**) aren't application-rate-limited — they lean on a token being a trusted,
   role-scoped, instantly-revocable party behind Cloudflare, and every write is
   reversible (deactivate-not-delete), audited, and one-team. If you hand a token to a
   *less*-trusted integration, prefer a tightly-scoped role, watch `last_used_at`, and
   a per-token rate limit is a small future add.
2. **`member_roles:edit` is a powerful right.** Anyone who can edit roles can grant
   permissions — including to their own role — exactly as in the UI (there's no separate
   admin tier). So give a machine token that right only when the integration genuinely
   manages roles; a read/import/export integration never needs it.

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
