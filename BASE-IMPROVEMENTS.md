# BASE-IMPROVEMENTS.md — the honest backlog

The living list of known base issues and their status, from an **objective third-party
review** (2026-07-09): a fresh multi-agent `security_sentry` on this repo + an independent
four-audit pass (`lean_mean_check` · `security_sentry` · `error_analyst` · `story_checks_out`)
run against a *pristine* clone by the first real `new-app` fork (testco). Two reviewers with
no prior context converging on the same findings is the signal to trust.

Keep this current: when an item ships, move it to **Fixed** with the commit.

---

## Fixed (2026-07-13) — the invite + credit-fairness round (team testing on staging)

Three real bugs a teammate (chilavert) hit exercising the AI co-pilot's invite flow.
(A fourth report — "chat creates a role but also opens an empty form" — was already fixed
by the one-shell round; re-verified live, no change needed.)

| Sev | Issue | Fix |
|---|---|---|
| MED | **Agent accepted a self / existing-member invite** — asked "which role?" and only failed at the door, wasting a turn (and credits). No explicit self-invite guard existed (blocked only transitively via already-member). | Added a `self_invite` guard in `createInvite` (clear "you can't invite yourself" message) + system-prompt guidance so the agent checks membership and refuses UPFRONT. Verified live: it now says "that's your own email — you're already on the team." (`workers/tenancy/src/lib/invites.ts`, `agent.ts` SYSTEM; `integration.test.ts`) |
| MED | **Dishonest email narration** — the invite email was fire-and-forget, and the agent's "no email was sent" line was free model text, not bound to the real outcome; a *successful* invite mis-narrated as a duplicate would send an email while the bot claimed it hadn't. | `createInvite` now AWAITS the send and returns `emailSent`; the route returns it (first); the agent is told to report it honestly and never claim an email was sent when it wasn't. The invite still succeeds if mail fails (the invite_index row routes acceptance; accept in-app). (`invites.ts`, `routes/invites.ts`, `tool-catalog.ts`, `agent.ts`; `integration.test.ts`) |
| MED | **Charged for refused actions + mislabeled** — a turn that only asked a clarifying question or hit a refused action still cost credits and was titled by the read it ran ("List roles"), not what the user did. | A turn that changed NOTHING (a refused action or a model hiccup) now REFUNDS its metered units (`refundAiUnits` reverses both pools) — a blocked action costs 0. Usage rows title by WRITES only, so a read-only clarify turn reads as the question. Verified live in the credit log (a failed invite → **0 credits**). (`credits.ts`, `agent.ts`; `credit-reconcile.test.ts`) |

## Fixed (2026-07-10) — the unification + one-shell round

The two big structural moves the owner asked for after the hardening round.

| Sev | Issue | Fix |
|---|---|---|
| P1 #2 | **Two tool catalogs drift.** The agent (data-ops) + MCP each hand-declared the same ~two dozen tenancy/content endpoints, so a capability had to be added twice and they could diverge (the drift the owner hit adding list_invites). | Collapsed the 24 overlapping endpoints into ONE `shared/workers/tool-catalog.ts` (SHARED_TOOLS); each surface PROJECTS them (`toAgentTool` / `toMcpTool`) + adds its surface-only tools. `mcpName` preserves the 3 external MCP names. Bonus: the agent gained `list_dropdown_values` (a parity gap). Adding a CRUD tool is now one edit. |
| P1 (new) | **Navigating into a team screen HARD-RELOADED** (static-export boundary), tearing down the SPA + a running agent; the agent's screen-trace couldn't drive across it. | The **whole post-auth app is now ONE shell** — `/home`, `/settings`, `/invitations` render `<DeepLinkScreen/>` like `/t`, `/learning`, `/help`; all in-app nav is soft History-API (`softNavigate` / `go()`), no reload anywhere. Only pre-auth (`/login`, `/onboarding`) is a real navigation. The trace now soft-drives from any screen (EDGE-CASES §1). |

## Fixed (2026-07-10) — the agent hardening round (team testing on staging)

A sweep of real bugs surfaced by the team exercising the AI co-pilot on staging.

| Sev | Issue | Fix |
|---|---|---|
| HIGH | **Agent panel died when the trace entered `/t`** — the off-host screen-trace `router.push`ed into a deep `/t` path, a hard reload (static export) that tore down the running agent + its live steps | The co-pilot is mounted once at the ROOT (`agent-host.tsx`) + its open state mirrors to `sessionStorage` (survives a real refresh; `agent-host.test.ts`). Trace first NARRATED off-host — then **superseded by the one-shell round (above): with no reload boundary left, the trace soft-drives from anywhere** (EDGE-CASES §1). |
| HIGH | **First-turn confirm buttons dead** — a brand-new chat's first dangerous action paused at a confirm whose Go-ahead/Not-now no-op'd (the event omitted `threadId`) | `threadId` added to the `confirm` stream event; client adopts it (EDGE-CASES §6; `stream.test.ts`) |
| MED | **Credit history didn't reconcile** — a confirmed command split into a row + a cryptic "(continued)" row, so it didn't sum to the balance | The confirm turn FOLDS its units into the command's one row; rows are titled by the ACTION taken, not the prompt (DATA-MODEL; `credit-reconcile.test.ts`) |
| MED | **Screen-trace opened a blank input form** and left it open after the record already existed | Trace lands on the RESULT (detail/list), never a dialog; `TraceTarget` has no query field by construction (`trace-parity.test.ts`) |
| MED | **Agent over-confirmed** — it asked before ordinary building (create a role, invite) | Confirm relaxed to **destructive-only** (removals + deactivations + bulk); constructive writes run free (EDGE-CASES §5) |
| MED | **Agent couldn't revoke an invite by email** — `revoke_invite` needs an id but there was no way to list pending invites | Added a `list_invites` read tool to the agent + MCP catalogs (`agent.test.ts`) |
| LOW | **Launcher needed a reload on first login** — the root host mounts before login and its non-reactive session copy never updated | `useActiveTeam` session cache made reactive (pub-sub); the launcher appears the instant you sign in (`agent-host.test.ts`) |
| LOW | **"Blank pills"** — empty tool-only assistant turns painted as empty bubbles on resume | `toChatItems` drops blank-content assistant turns (kept server-side for replay) |

---

## Fixed (2026-07-09)

| Sev | Issue | Fix |
|---|---|---|
| HIGH | Agent could make privilege/identity writes (rename team, change roles, set permissions, invite) with **no confirmation** — reproduced live (a read-only question silently renamed a team) | `confirm: true` on the 7 privilege/identity tools; `agent.test.ts` flipped to the safe contract (`workers/data-ops/src/lib/tools.ts`). **Superseded 2026-07-10:** by owner decision the confirm rule was relaxed to **destructive-only** (removals + deactivations + bulk); the privilege-confirm defense-in-depth was traded for a smoother agent — the fence (untrusted content as DATA) + act-as-user gating + audit remain the primary defenses. See EDGE-CASES §5. |
| HIGH | **Stored XSS**: `parseUploadDataUrl` accepted any MIME (`text/html`, `svg`); gateway served `/media/learning/*` back with it on the app origin (worker-built response, so `_headers` didn't apply) → attacker JS rides a viewer's session, cross-team | Allow-listed inline-safe MIME at the boundary + `mediaHeaders()` adds `CSP: default-src 'none'; sandbox` + `nosniff` on both gateway media branches (`shared/workers/image.ts`, `workers/gateway/src/index.ts`) |
| MEDIUM | AI usage-log returned **every member's raw prompt** to any teammate who opened it | `readUsageLog` redacts the summary to the viewer's own rows (`workers/data-ops/src/lib/credits.ts`) |
| MEDIUM | No anti-clickjacking / MIME / referrer headers served | `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy` in `web/public/_headers` |
| LOW | Boundary validation gaps: role `description`, team `name`, member/invite ids not type-checked → a non-string body was a **500, not a 400** | `optionalText` / `requireText` / `typeof` guards (tenancy routes) |
| CRIT (forks) | `mcp` binds the core DB but docs said "**five** core-bound workers" → a fork on a shared account silently binds mcp to the ORIGINAL core DB (cross-tenant) | "SIX core-bound workers" everywhere (BOOTSTRAP, OPERATIONS, new-app); OPERATIONS now lists migration 0013 + mcp in the `INTERNAL_KEY` set |
| — | Fork sweep left `brimba.swift-struck.workers.dev` host URLs in the MCP docs | new-app sweep now treats host URLs as live references, not history |

---

## Open — ranked (the "three moves that each kill several findings" first)

### P1 · resilience + leanness — high leverage, real refactors
1. **One `callInternal(path, {cookie, timeout})` seam** (`shared/workers/`). Kills THREE findings at once: the cookie-forward internal-fetch dance is copy-pasted 5+ times (DRY), **no `fetch` has an `AbortSignal`** anywhere — the D1 REST door (`cf()`), cross-worker calls, and the agent's model calls all lack a timeout, so one hung socket stalls a whole worker (resilience) — and the forward executors flatten 403/409/500 into one generic string (status preservation; also the cause of the agent's "stuck pending step"). **Highest-leverage single change.**
2. ~~**Unify the two tool catalogs.**~~ **DONE 2026-07-10** — one `shared/workers/tool-catalog.ts` both surfaces project from (see Fixed above).
3. **Idempotency + partial-failure cleanup on the fleet writes.** `import-confirm` has no idempotency (retry → duplicate rows); `migrateTeams` aborts the whole fleet on the first bad team and leaves schema drift; the module-mover can orphan a DB / double-count on interruption. Add an idempotency guard + per-item try/catch + cleanup.
4. **Close the two error-log blind spots.** The nightly cron catch and the agent model-call catch swallow unexpected errors (console-only / nothing) — invisible in the 90-day `error_logs` table meant to catch exactly those. Add `recordWorkerError` in both.
5. **`d1QueryAcross` uses `Promise.all`** → one slow/failed shard fails an entire split-module read. Use `allSettled` + record the degraded shard.

### P2 · deploy + docs
6. **realtime↔auth cold-start cut.** A genuinely fresh-account first deploy dies `code 10143` (realtime binds auth, auth binds realtime). Document the one-time binding cut as a first-class BOOTSTRAP step AND make `deploy:*` tolerate it — not the current footnote ("in practice auth already exists" — false for `new-app`).
7. **`DEV_ECHO_CODES=1` on staging** echoes login codes in API responses even with Resend live. Fine for a test rig — add a one-line note that it's a staging-only convenience, never a real-user staging.

### P3 · structure / honesty
8. **Eight god-files >400 LOC** (`agent.ts` ~570, both `tools.ts`, `api.ts` ~535…) — split by seam. Largely dissolved by #1 + #2.
9. **Reconcile the lean score.** A fresh honest `lean_mean_check` scores **~84–90 (B/A-)**, not the committed report's 93 — the leanness dimension (~73) is dragged by #1 + #2 + the god-files. Either land #1/#2 (which genuinely raises it) or regenerate the report honestly. Don't ship an over-stated score.

---

## The meta-lesson (worth its own guardrail)

Two of the worst issues (the agent confirm gap, the fork-sweep leaving live URLs) **slipped past our own checks because a check encoded the wrong intent** — a test that asserted the vulnerable behaviour as correct, and a sweep rule that treated a live URL as "history." An incumbent review rationalises what's already there. **Schedule a periodic fresh, no-prior-context review** (a clean clone, independent agents) — it finds what the incumbent gate accepts. This is why the base now recommends running the audits against a *pristine* clone, not the working tree.
