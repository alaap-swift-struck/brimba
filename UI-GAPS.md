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

When the library ships one: re-run `npm install github:alaap-swift-struck/swift-struck-ui`,
swap the import, delete the temp file, update this table.
