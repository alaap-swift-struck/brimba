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
| 3 | ~~`permission-matrix` (collection)~~ | — | The roles access-rights grid. | **SHIPPED in the library (2026-06-13)** — live at `@swift-struck/ui/registry/collections/permission-matrix`; integrated on `/roles`. Temp removed before it was ever needed. |
| 4 | Collection card-surface config (`data-table`, `permission-matrix`) | (overridden app-side via `className`) | The user wants NO card backgrounds. `permission-matrix` flattens cleanly with `className="bg-transparent"`, but its sticky module column keeps a `bg-card` fill (needed so scrolled cells stay opaque), and `data-table`'s frame lives on an inner div `className` can't reach. Proper fix: a `surface: "card" \| "none"` option on the collection config that also swaps the sticky fill to `bg-background`. | **nice-to-have — flag for the library** |

When the library ships one: re-run `npm install github:alaap-swift-struck/swift-struck-ui`,
swap the import, delete the temp file, update this table.

## Composition candidates (built from primitives here; could graduate to the library)

These work today (composed from existing primitives — NOT blocking), but the
pattern repeats across apps, so they're good candidates to become library
collections later. Not urgent.

| Pattern | Lives here | Why it could move to the library |
|---|---|---|
| `app-bar` — top bar with a team/workspace switcher + profile menu | `web/components/app-shell.tsx` | Every multi-tenant app wants the same switcher + profile pattern; config-driven (brand, switcher items, menu items) it'd be reused everywhere |
