# Screen Engine + Team Management — the plan

The blueprint for Brimba's runtime, config-driven screen system (our own lean
"mini-Glide") and the first feature built on it: home + team management
(members, roles, invites). Decided with the user 2026-06-12/13.

> North star: screens are **described by data** ("recipes") stored in a
> database and served at runtime, so an admin **or an AI agent** can
> reconfigure a screen live — no code deploy. Every screen is
> **permission-gated**; every button calls a **named, agent-callable action**.
> We build this by making the library's *already config-driven* components
> runtime-served — an extension of what exists, not a parallel system.

## STATUS (2026-06-21) — what's shipped vs the plan below

This plan's phases map to shipped milestones as follows:

- **M1 — deep-link foundation + member detail via engine: SHIPPED.** §8-A
  (foundation) + the §10 record-spine deep links + first record detail.
- **M2 — per-team screen-recipe config store: SHIPPED** — but it lives in the
  **TENANCY worker** at `GET/POST /api/tenancy/config/screens`; the planned
  `workers/config` (§2/§5/§10) was folded into tenancy. There is no separate
  config worker.
- **M3 — members/roles/invites lists + detail + actions on `/t` URLs, the
  section switcher, and collapsing breadcrumbs: SHIPPED.** §8-B…F. The role
  permission grid is currently **host-composed** (no engine recipe block yet).
- **Phase 3 / §8-G (custom-screen capability + live config editing) — NOT yet
  built.** The recipe store and engine exist; runtime authoring/editing of a
  bespoke screen by an admin or agent is the remaining work.

The old `/settings/team` + `/settings/team/member` routes are RETIRED;
top-level `/members` and `/roles` are thin redirects to `/t/<teamId>/members`
and `/t/<teamId>/roles`.

## 1 · Why this isn't bloat

The library already renders from config objects (`lib/config.ts`: BaseConfig /
FieldConfig / CollectionConfig, the visibility rule engine, `useIsVisible`) and
ships `collection-frame`, `detail-view`, `form`, `field`, inputs, `dialog`,
`sheet`. The engine **composes those existing pieces from a recipe**. So the
new surface is: one recipe schema, one engine, one recipe store (in the tenancy
worker — see STATUS) — each earning
its place by adding live-reconfigurability, per-team customization, and
agent-editable screens. Lean *within* a robust design.

## 2 · The pieces

| Piece | Where | What it does |
|---|---|---|
| **Recipe schema** | library `@swift-struck/ui` `lib/recipe.ts` (`ScreenRecipe`) | Typed, serializable shapes for a screen: type, presentation, data binding, fields, layout, actions, permission gates. The contract both the worker and the engine speak. The LIBRARY owns it (see §10), so the app + engine import the same type. |
| **Config / recipe store** | ~~`workers/config` (new)~~ → **UPDATED 2026-06-21: the TENANCY worker**, `GET/POST /api/tenancy/config/screens` (there is NO separate `workers/config`; it was folded into tenancy) | Stores + serves recipes. Merges GLOBAL base recipes (the shipped defaults) with a team's own custom screens/overrides. CRUD actions are agent-callable (an agent can author a screen). |
| **Screen engine** | library `registry/collections/screen-*` | React components that fetch a recipe + data and render the right library pieces, permission-aware. |
| **Tenancy actions** | `workers/tenancy` | Members / roles / invites read+write + the guard rules. |
| **App shell** | `web/` | Top bar + team switcher + bottom tabs (mobile); renders module screens through the engine. |

## 3 · The recipe schema (the heart)

A screen recipe is serializable JSON, typed in the library (`@swift-struck/ui` `lib/recipe.ts`, `ScreenRecipe` — see §10):

- **type**: `list` | `detail` | `edit` | `add` | `confirm` | `custom`
- **presentation**: `responsive` (default — overlay on desktop, full-screen/
  sheet on mobile) | `overlay` | `sheet` | `fullscreen`
- **binding**: which module/table + which team-scoped data source
- **fields[]**: each wraps the library's `FieldConfig` (type, label, validation,
  required) + how it binds to a column; field types incl. text, number, choice
  (dropdown from `selectable_data`), image (R2), date, switch, notes
- **actions[]**: buttons → a **named action** (e.g. `members.changeRole`) the
  engine calls; declares confirm/before/after — same names agents call via MCP
- **gate**: `{ module, right }` — who may see/run this; **default hide** when
  the user lacks it; `showWhenDenied: "hidden" | "disabled"` (hidden default).
  **Blocked at every step**: `?panel`/`?confirm` overlays are permission-gated
  on open (client) AND each action re-checks `requireRight` on the server, so
  the guarantee is never UI-only.
- **layout** (for `custom`): a tree of library components composed freely — the
  general custom-screen capability (first-class, this batch)
- **confirm** (for `confirm`): title/body/variant for delete/deactivate/activate

`confirm` covers the delete / deactivate / activate modals; `custom` is the
blank-canvas builder.

## 4 · Permissions (server AND UI, every action)

- The active team's **effective rights** for the user (per module: r/c/e/d,
  read from the team DB `role_permissions` tall sheet) are resolved once and
  handed to the engine.
- The engine **auto-hides** any gated element the user can't use (no per-button
  wiring) — default hide; opt-in `disabled`.
- Every domain action **re-checks on the server** via the existing
  `requireMember` / `requireRight` seam. The UI gate is convenience; the server
  gate is the guarantee.
- **Blocked at every step**: `?panel`/`?confirm` overlays are permission-gated
  on open (client) AND the action re-checks `requireRight` on the server — the
  guarantee is never UI-only.

## 5 · Config storage (proposed — confirm)

- **Global config DB** (new, or a table set in `brimba-core`): the **base**
  recipes for the standard app screens — one definition, every team uses it.
- **Per-team custom**: a team's bespoke screens + overrides live in **that
  team's own database** (fits the per-team-DB architecture). The config worker
  serves `base ⊕ team-override` for the user's active team.

> UPDATED 2026-06-21: there is no separate config worker — the recipe store
> lives in the **TENANCY worker** at `GET/POST /api/tenancy/config/screens`.

## 6 · Data-model additions

- `invite_logs` (per-team DB): full invite records (inviter, invitee, role,
  timestamps) — the global `invite_index` stays the routing index.
- config tables: `screens` (recipe rows) in the global config store + per-team
  `screens` for custom/overrides.

## 7 · Team-management specifics

> REALISED 2026-06-21: the originally-planned tabbed **Settings → Team** area
> (Members / Roles / Invites) is now rendered by the screen ENGINE on the §10
> `/t/<teamId>/<module>/<id>` deep-link record-spine — the section switcher +
> URL-derived breadcrumbs replace the tabs. So §7 is shipped *through* §10, not
> as a standalone tabbed Settings page (the old `/settings/team` routes are
> retired). No contradiction: the same specifics, the §10 grammar.

- **Members**: list (photo/name/email/role); change role; remove = deactivate.
- **Roles**: list; create; **edit (applies to all holders live)**;
  **deactivate-only — never delete** (holders keep the role + rights; deleting
  would break every holder). The **permission grid** (modules × r/c/e/d, with
  auto-flip-read) is a bespoke `custom` screen — proving the custom capability.
- **Invites**: send (email + role) → writes `invite_index` + `invite_logs` +
  Resend email; list pending; retract.
- **Guards (server-enforced)**: team always keeps ≥1 active Admin; can't
  change/remove yourself; invite=create / role-change=edit / remove=delete on
  `team_members`; remove = deactivate.

## 8 · Build sub-phases (each ships to staging + is tested)

- **A · Foundation**: recipe schema + config worker (serve a base recipe) +
  engine skeleton that renders a `list`/`detail`/`edit`/`add`/`confirm` from a
  recipe, with presentation modes + permission gating. Proof: a throwaway demo
  recipe renders end-to-end.
- **B · Tenancy actions**: members/roles/invites read+write + guard rules +
  unit/integration tests + smoke.
- **C · App shell**: top bar, team switcher (2-second hop), bottom tabs, Home
  hub. Server-gated nav. _REALISED 2026-06-21: shipped as the §10 `/t` deep-link
  record-spine — section switcher + URL-derived collapsing breadcrumbs in place
  of the originally-planned tabbed Settings→Team page._
- **D · Members** module via the engine.
- **E · Roles + permission grid** (the bespoke custom screen).
- **F · Invites** (send/retract; needs Resend for the email).
- **G · Custom-screen capability + live config editing** (an admin/agent
  authors or tweaks a screen at runtime).

Order and batching confirmed with the user before each phase.

## 9 · Agentic by default

Every action (members.*, roles.*, invites.*, config.*) is a named worker
endpoint → a row in ARCHITECTURE.md's actions table → an MCP-catalogued tool.
The engine and any agent call the **same** actions. Authoring a screen is
itself an action, so agents can build/modify screens — the runtime-config
choice is what makes that possible.

## 10 · Locked decisions (2026-06-18) — engine + deep links

Decided with the user; do not relitigate without them.

- **Build the FULL config-driven engine** (not a thin route-convention first).
- **The library OWNS the engine + the recipe contract.** `ScreenRecipe` (the
  recipe schema) and the `screen-renderer` collection live in `@swift-struck/ui`
  (`lib/recipe.ts` + `registry/collections/screen-renderer`), so EVERY app on
  the base inherits them. The engine **renders** a recipe + speaks the URL
  grammar; it does NOT fetch data, call APIs, store recipes, or own the router —
  those are the host app's job (a recipe store + the app's
  catch-all route + server-side permission checks). _UPDATED 2026-06-21: the
  recipe store is the **TENANCY worker** at `/api/tenancy/config/screens`, not a
  separate `workers/config`._
- **Self-describing deep links (URL grammar).** PATH = the record spine
  `/t/<teamId>/<module>/<id>/<childModule>/<childId>/…` (teamId in the URL so a
  shared link auto-resolves the tenant + auto-switches the active team for a
  user who has access). QUERY = the transient layer that sits on top:
  `?panel=edit|add` (+`module`), `?confirm=<action>&id=`, `?tab=`. Back closes an
  overlay. Static-export safe: ONE catch-all `web/app/t/[[...path]]/page.tsx`
  parses the path client-side + a ~3-line gateway rule serves `/t.html` for any
  `/t/*` depth. **Blocked at every step**: every deep-linked level and every
  `?panel`/`?confirm` overlay is permission-gated on open (client gate) AND the
  action re-checks `requireRight` on the **server** — never UI-only.
  In-shell hops use the **History API** (`pushState`/`replaceState` per
  CACHING.md "Navigation never reloads"), **never** the framework `router.push`
  (which would trigger a static-export full-page reload); the router is only for
  entering/leaving the `/t` shell. Breadcrumbs are DERIVED from the URL + page
  registry and collapse the middle on small screens (no horizontal scroll).
- **Record detail = a full route per record** (members, invites, future types),
  Overview + Activity tabs, via the library `RecordDetail`/`DescriptionList`/
  `ActivityFeed`. **Invites get the full `invite_logs` audit table** (per-team:
  inviter snapshot, accepted-by, richer trail) + an `invite` activity scope.
- **Build sequence (sequential, ship each):** the library builds the engine
  first (the long pole). Then, in the app, Phase 2 = the recipe store (SHIPPED
  in the **TENANCY worker** at `/api/tenancy/config/screens`, not a separate
  `workers/config`) + the
  deep-link catch-all + gateway rule + recipe-driven screens + URL breadcrumbs;
  folded in: `invite_logs` + invite detail, migrate the remaining hand-built
  lists onto the library `List`, adopt the library search/filters. Phase 3 =
  custom-screen + live config editing. Then full cross-device test + audits.
- **Engine/recipe UI conventions (locked 2026-06-21).** _Count badges_ — when a
  tab/section leads with a collection it shows a count = **what the collection
  displays**, compacted (`6` / `189` / `1.18M` via `abbreviateCount`) and
  **HIDDEN when 0**. _Concept icons_ — one distinct lucide icon per concept,
  centralised in `web/lib/pages.ts` `CONCEPT_ICON`, reused at page / section-tab
  / button level (one icon per concept, everywhere).
