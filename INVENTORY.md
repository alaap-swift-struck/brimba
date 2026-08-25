# INVENTORY.md — everything that is NOT in this repository

The code is all here. A rebuild still fails without this list, because nobody
knew the app needed a Cloudflare account, a mail provider and a domain.

**Who to contact for access to any of it:** Swift Struck — alaap@swiftstruck.com

---

## Third-party services

| Service | What it does | Without it |
|---|---|---|
| **Cloudflare Workers** (Paid, $5/mo) | runs all seven workers | nothing runs |
| **Cloudflare D1** | the core database, the operations database, one per team | no data |
| **Cloudflare R2** | uploaded files — profile photos, team logos, learning attachments | uploads fail; existing files 404 |
| **Cloudflare Durable Objects** | the live channel (`TeamChannel`) | screens stop updating live; everything else works |
| **Cloudflare Workers AI** | the keyless fallback model for the agent | the agent needs `ANTHROPIC_API_KEY` instead |
| **Anthropic API** | the agent's working model | falls back to Workers AI |
| **Resend** | outbound email — login codes, invites, @mention notices | nobody can sign in |
| **GitHub** | the only remote copy of this repository | see "Single points of failure" below |

## Who owns each resource

Every Cloudflare resource lives in **one Cloudflare account**, owned by Swift
Struck. The account id is in each worker's `wrangler.jsonc`; the API tokens are
in the vault (`SECRETS.md`). GitHub repository: `alaap-swift-struck/brimba`.

Which account a project folder is wired to can be confirmed with the
`platform_setup` skill, which calls both APIs and reports live.

## Databases

| Name | Purpose |
|---|---|
| `brimba-core` / `brimba-core-staging` | identity, teams, memberships, sessions, invites, AI credits |
| `brimba-ops` / `brimba-ops-staging` | `error_logs` + `agent_usage_log` (SCALING.md §4.9) |
| `team-<ulid>` (one per team) | everything a team owns |

Buckets — **three**, and their `-staging` twins: `brimba-media` (profile and
account media, bound by auth, tenancy and the gateway), `brimba-learning-media`
(learning attachments, bound by tenancy, content and the gateway), and
`brimba-help-media` (help-ticket attachments, bound by content). Create all three
per environment: miss the last one and Help attachments have nowhere to land.

## Domains and DNS

Today both environments run on Cloudflare's own `workers.dev` subdomains, so
**no custom domain or DNS record is required to rebuild**:

- production — `https://brimba.swift-struck.workers.dev`
- staging — `https://brimba-staging.swift-struck.workers.dev`

If a custom domain is ever attached, record it here with its registrar and its
DNS records, because that is the one part of this list nothing else can infer.

## Data that must exist before the app is usable

| What | Where it comes from |
|---|---|
| core schema | `db/core/*.sql` via `wrangler d1 migrations apply` |
| operations schema | every file in `db/ops/` in order — `0001_operations.sql`, `0002_error_request_id.sql` today |
| per-team schema | created at team birth by the tenancy worker (`team-schema.ts`) |
| import catalogue | seeded through the owner endpoint — BOOTSTRAP.md; self-heals against the code, so a fresh environment is never empty |

Everything else is created by using the app. There is no fixture data to restore.

## Invisible moving parts

| Thing | Where | What it does |
|---|---|---|
| nightly cron `10 3 * * *` | tenancy worker | sizes every database, sweeps retention, raises live-channel shard counts, deletes orphaned uploads |
| rate-limit namespaces | gateway, tenancy, content, data-ops | ids 1001/1002/1003 — labels, not resources; nothing to create |
| MCP personal access tokens | issued in-app by each user | outside tools authenticate with these; revocable, and revocation bites immediately |

## Single points of failure

1. **One git remote.** GitHub is the only copy. A second remote costs one command — see the recommendation in `ocean-review.md`.
2. **The vault passphrase.** Once `npm run vault:save` has been run, `secrets.vault` will be encrypted with a passphrase held by one person and stored nowhere in this repository. **It has not been run yet.** If it is lost, `SECRETS.md` §4 regenerates everything by hand — an afternoon, not a catastrophe.
3. **One maintainer.** Named above. `BOOTSTRAP.md` is the mitigation: it rebuilds the whole system from nothing, command by command.
