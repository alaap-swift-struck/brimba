# PLATFORMS.md — where the base can run (Cloudflare recommended; the top-10 mapped)

Brimba is **built for Cloudflare** and the `new-app` skill stands it up there end to
end (one prompt + a few credentials). But the base is deliberately built on **seams** —
a small set of swappable interfaces where it touches the platform — so it can be
*ported* to any major cloud. This doc is the honest, thorough map: what each pillar of
the base needs, which service on each of the top-10 providers backs it, and how big a
port really is.

> **The recommendation, plainly.** Use **Cloudflare**. It is the native stack: per-team
> databases (D1), the live layer (Durable Objects), the edge compute (Workers), and
> media (R2) are all first-party, and `new-app` wires them turnkey. Every other provider
> is a *port* — tractable (you swap seams, not the app), but real work. Pick another
> platform only when a hard constraint (an existing AWS estate, a data-residency rule, a
> team that only knows Azure) outweighs the turnkey path.

---

## 1 · The five pillars every platform must provide

The base leans on exactly five platform capabilities. Everything else is portable app
code. A port = back these five with the target platform's primitives.

| # | Pillar | What Brimba uses (Cloudflare) | The one seam file to swap |
|---|--------|-------------------------------|----------------------------|
| 1 | **Per-team data isolation** | one **D1** (SQLite) database *per team* + one core D1 for global identity/billing | `shared/workers/d1-rest.ts` (`d1Query` / `d1ExecScript` / `d1QueryAcross` / `sqlString`) — the ONLY place SQL runs |
| 2 | **The live layer** | the `TeamChannel` **Durable Object** fans out change pings | `shared/workers/realtime.ts` (`publishChange`) — the ONLY broadcast seam |
| 3 | **Compute** | **7 Workers** behind one public gateway | each `workers/*` + the gateway router (the shape ports; the runtime swaps) |
| 4 | **File storage** | **R2**, keyed per team | the R2 `.put/.get` calls in `content` + `gateway` (`/media/*`) |
| 5 | **Static web** | Next.js **static export** served at the edge | none — a static bundle any host can serve |

Two more are **already provider-agnostic seams** (swap by config, no port):

- **Email** — one sender in `auth` (Resend today; any SMTP/API works). BOOTSTRAP §4.
- **The AI agent brain** — `AGENT_MODEL` var (Claude when `ANTHROPIC_API_KEY` is set,
  else the keyless fallback). Point it at any provider's model.

**The multi-tenancy decision is the crux of any port.** Cloudflare gives cheap
database-per-team (D1). On a Postgres platform you choose one of: **row-level security
with a `team_id`** (recommended — one database, a policy per table), **schema-per-team**
(stronger isolation, heavier ops), or **database-per-team** (closest to Brimba, most
expensive). The base's data door (`d1-rest.ts`) is where that choice lands — rewrite
that one seam and the 7 workers keep working unchanged.

---

## 2 · The master map — the 5 pillars across the top-10 providers

Effort is for the *whole* port: **Turnkey** (a skill does it), **Moderate** (days),
**Heavy** (weeks — most primitives exist, the wiring is the work).

| Provider | Compute | Per-team data | Live layer | Storage | Static web | AI | Port effort |
|---|---|---|---|---|---|---|---|
| **Cloudflare** ⭐ | Workers | **D1** (DB/team) | **Durable Objects** | R2 | Workers static | Workers AI / Anthropic | **Turnkey** (`new-app`) |
| **Fly.io** | Machines (containers) | **LiteFS** (SQLite/team) or Fly Postgres | a WebSocket server on a Machine | Tigris (S3-API) | serve from app | any (Anthropic) | Moderate |
| **Vercel** | Vercel Functions | Vercel Postgres (Neon) + RLS | Ably / Pusher / Upstash | Vercel Blob | **native (Next.js)** | AI SDK (any) | Moderate |
| **Netlify** | Netlify Functions | Neon / Supabase + RLS | Ably / Pusher | Netlify Blobs | **native (Next.js)** | any | Moderate |
| **Render** | Web Services (containers) | Render Postgres + RLS | a WebSocket service | Render Disks / S3 | Render Static | any | Moderate |
| **DigitalOcean** | App Platform / Functions | Managed Postgres + RLS | a WebSocket service | Spaces (S3-API) | App Platform static | any / DO GenAI | Moderate |
| **Supabase** | Edge Functions (Deno) | **Postgres + RLS** (native fit) | **Supabase Realtime** | Supabase Storage | host static elsewhere | any | Moderate–Heavy |
| **AWS** | Lambda / App Runner | Aurora/RDS Postgres + RLS (or DynamoDB) | API Gateway WebSockets / AppSync | S3 | CloudFront + S3 | Bedrock | Heavy |
| **Google Cloud** | Cloud Run | Cloud SQL Postgres + RLS (or Firestore) | Firestore streams / Pub/Sub + WS | Cloud Storage | Cloud CDN + bucket | Vertex AI | Heavy |
| **Azure** | Container Apps / Functions | Azure Postgres + RLS (or Cosmos DB) | **SignalR Service** | Blob Storage | Static Web Apps | Azure OpenAI | Heavy |

⭐ = recommended / native. Email on every row: Resend, or the provider's sender (SES,
Azure Communication Services, SendGrid on GCP, etc.) — it's a config seam, not a port.

---

## 3 · How to actually port (the method — same for every provider)

Because the base is seam-isolated, a port is a **fixed, ordered checklist**, not a
rewrite. In rough effort order:

1. **Pick the tenancy model** (§1) and **rewrite the data door** (`d1-rest.ts`) to speak
   the target DB. Keep the function signatures (`d1Query`, `d1ExecScript`, `sqlString`,
   `d1QueryAcross`) — the 7 workers call only these, so nothing above changes. For a
   Postgres+RLS port, `d1QueryAcross` (the shard fan-out) collapses to a normal query.
2. **Swap the live seam** (`realtime.ts` → `publishChange`) for the platform's realtime
   (SignalR, Supabase Realtime, Ably/Pusher, or a small WebSocket server). The payload
   contract is tiny and fixed: `{ resource, id, op }` — no row data crosses it.
3. **Swap the storage calls** (R2 → S3/GCS/Blob/Supabase Storage). Same per-team key
   prefixes; most targets speak the S3 API, so this is often a client swap only.
4. **Re-home the compute.** The 7 workers are small HTTP handlers; map each to the
   platform's function/container unit (or collapse several into one service on
   container platforms like Fly/Render/Cloud Run). Keep the **one-public-door** rule —
   only the gateway is public; the rest are private/internal.
5. **Serve the static web bundle** (`web/out`) from the platform's static host (native
   on Vercel/Netlify; a bucket+CDN elsewhere).
6. **Point the config seams**: the email sender and `AGENT_MODEL`. No code.
7. **Re-run the gates**: `npm run check` (the app code is unchanged, so the Laws R1–R10
   still hold), then the platform's own smoke.

**What never changes in a port:** the app logic, the 7-worker split, the permission
spine (`requireRight`), the Laws (R1–R10), the screen engine, the glossary, the agent.
That's the payoff of the seams — you rewrite ~4 files, not the product.

---

## 4 · Provider notes (the honest specifics)

**Cloudflare ⭐ — Turnkey.** The native stack; `new-app` does the whole runbook
(BOOTSTRAP.md). Per-team D1 gives true database-per-tenant cheaply; Durable Objects give
a serverless live layer with no server to run. This is the reference — everything else
is measured against it.

**Fly.io — Moderate, closest port.** The only other stack that can keep the
**SQLite-database-per-team** model, via **LiteFS** (replicated SQLite). Run the workers
as one or a few Machines; the live layer is a small WebSocket process. If you love the
Brimba data model but not Cloudflare, this is the shortest hop.

**Vercel — Moderate, best web fit.** Next.js is native (the static export or full SSR).
You add the missing pieces from partners: Vercel Postgres (Neon) with **RLS** for
tenancy, Vercel Blob for storage, and a realtime partner (Ably/Pusher/Upstash) for the
live seam. The 7 workers become Vercel Functions. Email via Resend (a Vercel partner).

**Netlify — Moderate.** Like Vercel for the web + functions; bring Neon/Supabase for the
DB (RLS), Netlify Blobs for storage, Ably/Pusher for realtime.

**Render / DigitalOcean — Moderate.** Container platforms: run the workers as
services, managed Postgres + RLS for tenancy, a WebSocket service for the live layer,
and S3-compatible storage (Spaces on DO). Straightforward, ops-simple, no edge.

**Supabase — Moderate–Heavy, natural data fit.** Postgres + **RLS** is the textbook
multi-tenant model, and **Supabase Realtime** maps cleanly onto the `publishChange`
seam. Compute is **Edge Functions** (Deno) — the 7 workers port to Deno handlers.
Caveats: Supabase doesn't host a static SPA well (host `web/out` on Vercel/Netlify), and
you'd likely adopt **Supabase Auth** in place of the custom email-OTP (a bigger change
than the other seams). Its own AI story is thin — point `AGENT_MODEL` at Anthropic.

**AWS — Heavy, enterprise-grade.** Every primitive exists: Lambda (or App Runner) for
compute, Aurora/RDS Postgres + RLS (or DynamoDB with a `team_id` partition key) for
tenancy, **API Gateway WebSockets** or **AppSync** for the live layer, S3 for storage,
CloudFront for the web, **Bedrock** for the agent (incl. Claude), SES for email. The
work is the wiring (IAM, VPC, deploy pipeline), not any missing capability.

**Google Cloud — Heavy.** Cloud Run for compute, Cloud SQL Postgres + RLS (or Firestore
with a tenant field) for tenancy, Firestore realtime or Pub/Sub-over-WebSocket for the
live layer, Cloud Storage for media, Cloud CDN for the web, **Vertex AI** for the agent
(Claude is available on Vertex). SendGrid for email.

**Azure — Heavy.** Container Apps / Functions for compute, Azure Database for Postgres +
RLS (or Cosmos DB) for tenancy, **SignalR Service** for the live layer (a clean fit for
`publishChange`), Blob Storage for media, Static Web Apps for the web, **Azure OpenAI**
or Anthropic for the agent, Azure Communication Services for email.

---

## 5 · The bottom line

- **Cloudflare is one prompt** (`new-app`) — recommended, and the only turnkey path
  today.
- **Every other top-10 provider is a real port**, but a *bounded* one: reimplement the
  five seams in §1 (mostly the data door + the live seam), re-home the compute, and the
  entire app — Laws, permission spine, screen engine, agent — runs unchanged.
- **The single biggest decision** on any non-Cloudflare port is the tenancy model
  (§1): database-per-team (Brimba-native; keep it on Fly+LiteFS) vs. **Postgres + RLS**
  (the pragmatic default everywhere else).
- If you want a **turnkey** experience on another provider, that means building a
  `new-app`-equivalent for it (a skill per platform) — a project in its own right. Until
  then, this doc + BOOTSTRAP.md (the Cloudflare runbook to mirror) are the map.

For the Cloudflare runbook itself, see **BOOTSTRAP.md**. For *why* the base is shaped
this way (and how each seam scales), see **BASE-MANUAL.md §6**.
