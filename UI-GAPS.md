# UI gaps — what the library is missing (the flag list)

Rule: Brimba never invents UI. When a needed component doesn't exist in
[@swift-struck/ui](https://swift-struck-ui.pages.dev/documentation), we build a
clearly-marked placeholder in `web/components/temp/`, list it HERE, and the
library absorbs it later (built + tested there, then re-imported here and the
placeholder deleted).

| # | Missing component | Placeholder here | What the library version needs | Status |
|---|---|---|---|---|
| 1 | `code-input` (primitive) — one-time-code boxes | `web/components/temp/code-input.tsx` | Configurable length, auto-advance, backspace, paste-spread, numeric keypad on mobile, `one-time-code` autofill, disabled state | waiting on library |
| 2 | `auth-card` (collection) — full sign-in card | `web/components/temp/auth-card.tsx` | Config-driven: app name, logo, legal links; two-step email→code flow; error/busy states; uses `code-input` | waiting on library |
| 3 | ~~`permission-matrix` (collection)~~ | — | The roles access-rights grid. | **SHIPPED in the library (2026-06-13)** — live at `@swift-struck/ui/registry/collections/permission-matrix`; integrated in the Member roles detail under `/t/<teamId>/roles/<id>` (host-composed). Temp removed before it was ever needed. |
| 4 | Collection card-surface config (`data-table`, `permission-matrix`) | (overridden app-side via `className`) | The user wants NO card backgrounds. `permission-matrix` flattens cleanly with `className="bg-transparent"`, but its sticky module column keeps a `bg-card` fill (needed so scrolled cells stay opaque), and `data-table`'s frame lives on an inner div `className` can't reach. Proper fix: a `surface: "card" \| "none"` option on the collection config that also swaps the sticky fill to `bg-background`. | **nice-to-have — flag for the library** |
| 5 | ~~`dropdown-menu` (+ `glass` popovers) translucent~~ | — | Menus over page content were see-through (the `glass` 72%-opaque surface, no `bg-popover`). | **SHIPPED in the library (2026-06-18, `c31a35c`)** — `dropdown-menu`/`popover`/`hover-card` now render on an opaque `bg-popover` surface (light + dark). App-side inline stopgaps removed. |
| 6 | ~~Selectable list-row (collection)~~ | — | The role list needed a selected/active highlight; the `list` collection was hover-only. | **SHIPPED in the library (2026-06-18, `c31a35c`)** — `list` now has an opt-in `selectedId`/`onSelect` with an accessible teal accent (`aria-current`/`data-[selected]`) that reads in both themes and keeps the leading icon legible. The engine's role screens use it; the hand-built rows are gone (the old `roles-panel.tsx` host file was itself retired in the M3 engine migration). |
| 7 | ~~Collection **search + filters** (config + UI)~~ | — | The collection system had `searchable` + the `selectRows` engine but no user-facing filter UI. | **SHIPPED** — the library search/filter bar landed and the app turned search + facets ON across every collection via the recipes (2026-06-30, `listCollection` + `withDataDrivenCollection`: search/filters hide when a list is empty or a facet has no options). FTS5 server-side search remains future — see SEARCH.md Status. |
| 8 | Role-detail **Overview/Activity** around the permission matrix | (host-composed `role-detail.tsx`) | The role detail is a bespoke matrix screen without the standard Overview + Activity tabs — the reviewed R2 exception (UI-CONVENTIONS §"The enforced UI Laws"). Needs either an engine recipe that can express a matrix, or tabs composed into the bespoke screen. | **open — reviewed exception, revisit** |
| 9 | ~~AgentChat **step-row label wrap**~~ | — | Step labels truncated on phones. | **SHIPPED in the library (0.3.0, 2026-07-06)** — `break-words`, status chip first-line; host CSS override removed. |
| 10 | ~~Collection header **compact one-row mobile layout**~~ | — | Count + search + filter stacked on phones. | **SHIPPED in the library (0.3.0, 2026-07-06)** — `<640px`: one row, stretching search + funnel popover, count folded into the placeholder ("Search 36 people…"); desktop byte-for-byte unchanged. |
| 11 | Safe **XLSX → CSV** in the import wizard | (CSV only; XLSX asks the user to export CSV) | The mature browser parser (SheetJS npm `xlsx`) carries a HIGH advisory, so it's deliberately NOT bundled. Want: a vetted client-side XLSX reader (audited build / a WASM parser / server-side conversion) so users can drop `.xlsx` directly. AGENTIC-IMPORT §9. | **open — needs a secure parser (2026-07-04)** |
| 12 | `list` **surface="none" row-group rounding** | (host `CollectionCard` rounds it via `[&_.divide-y]:rounded-xl`) | When `surface="none"`, the `list` renders a flat, un-rounded `div`, so a full-bleed selected/hover row shows SQUARE corners — mismatched inside a rounded host card (the `surface="card"` List clips its rows to a rounded Card, so its highlight follows the corners). The flat variant should round + clip its own row-group the same way (or accept a `className` the engine forwards). The demo site uses `surface="card"` so it looks right there; Brimba uses `surface="none"` and had to reproduce the clip host-side. | **open — flag for the library (2026-07-06)** |

When the library ships one: re-run `npm install github:alaap-swift-struck/swift-struck-ui`,
swap the import, delete the temp file, update this table.

## Composition candidates (built from primitives here; could graduate to the library)

These work today (composed from existing primitives — NOT blocking), but the
pattern repeats across apps, so they're good candidates to become library
collections later. Not urgent.

| Pattern | Lives here | Why it could move to the library |
|---|---|---|
| `app-bar` — top bar with a team switcher + profile menu | `web/components/app-shell.tsx` | Every multi-tenant app wants the same switcher + profile pattern; config-driven (brand, switcher items, menu items) it'd be reused everywhere |
| `pwa-install-prompt` — installable-app pop-up (native `beforeinstallprompt` + iOS "Share → Add to Home Screen" walkthrough, suppress-if-installed, cooldown) | `web/components/install-prompt.tsx` (+ `web/lib/pwa.ts`) | Every PWA on this base wants the same install nudge; config-driven (copy, trigger cadence) it'd drop into any app. Built from the library `Sheet` + `Button` today. |
