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
| 3 | `permission-matrix` (collection) — the roles access-rights grid | (temp built when Roles UI lands) | **Needed for Phase B (roles).** A grid: rows = modules (config: `{key,label}[]`), columns = Read / Create / Edit / Delete, cells = toggles. Value = `{ [moduleKey]: {read,create,edit,delete} }` + onChange. BAKED-IN RULE: switching ON any of create/edit/delete auto-switches Read ON and locks it on (the "any write needs read" rule), shown visibly. Modes: editable, read-only (view a role), fully-disabled (the locked Admin role). Must work on a narrow phone screen (horizontal scroll or stacked). | **NEEDED — please build in the library** |

When the library ships one: re-run `npm install github:alaap-swift-struck/swift-struck-ui`,
swap the import, delete the temp file, update this table.

## Composition candidates (built from primitives here; could graduate to the library)

These work today (composed from existing primitives — NOT blocking), but the
pattern repeats across apps, so they're good candidates to become library
collections later. Not urgent.

| Pattern | Lives here | Why it could move to the library |
|---|---|---|
| `app-bar` — top bar with a team/workspace switcher + profile menu | `web/components/app-shell.tsx` | Every multi-tenant app wants the same switcher + profile pattern; config-driven (brand, switcher items, menu items) it'd be reused everywhere |
