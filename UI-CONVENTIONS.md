# UI-CONVENTIONS.md — UI conventions (enforced)

This is the law-book for **how Brimba's screens are built** — the counterpart to
ARCHITECTURE.md (the workers + data layer) on the client side. Most of what's here
is not a style preference; it is **machine-checked**. A change that breaks a UI law
turns `npm run check` red, exactly like breaking a worker seam.

Read this before you add a screen, a form, a card, a tab, or a word of copy. If you
came here to "just add a button", you still owe this doc the action-icon mapping and
the voice section.

The one-line mental model:

> **The library (`@swift-struck/ui`) is the lego. `web/` is the instructions for
> this particular model. Whole screens are described as _data_ (recipes) and rendered
> by the library engine; the few screens the engine can't express are host-composed
> from the same primitives. Everything speaks one dictionary and obeys one set of
> laws.**

---

## 1. The library is lego — never fork it into the host

Brimba's primitives and collections come from **`@swift-struck/ui`**, a **separate
repo** (`github:alaap-swift-struck/swift-struck-ui`), pinned in both
`package.json` and `web/package.json`. The host imports them by their registry path:

```ts
// web/components/app-shell.tsx
import { Breadcrumbs } from "@swift-struck/ui/registry/primitives/breadcrumbs/breadcrumbs"
import { ModeToggle }  from "@swift-struck/ui/registry/primitives/mode-toggle/mode-toggle"
import { toast }       from "@swift-struck/ui/registry/primitives/sonner/sonner"
```

The theme itself is imported, not copied — `web/app/globals.css`:

```css
/* THE theme — imported straight from the library package. ONE master copy
 * (swift-struck-ui repo, styles.css); this app never carries its own. */
@import "@swift-struck/ui/styles.css";
```

**The rule:** `web/` **assembles** recipes from library lego. It does **not** edit
the library, and it does **not** re-implement a primitive locally because one is
awkward.

### When a primitive needs to change

You (the agent) cannot edit `@swift-struck/ui` from this repo — it's owned and
deployed separately (the owner runs it). So:

1. **Surface it.** Say plainly which primitive is wrong and what it needs.
2. **Hand the owner a prompt** — a self-contained change request they run against the
   library repo.
3. **Work in-rule in the meantime.** If a host-side workaround is unavoidable, it must
   be a small, *documented* seam that names the library change it's standing in for,
   and that gets removed once the library lands it. Two live examples:

   - `web/app/globals.css` overrides `.glass` opacity, with the comment: *"A library
     prompt tracks adopting this as the default; remove this override once it lands."*
   - `web/components/deep-link/screen-bits.tsx` (`CollectionCard`) notes that the
     engine's list draws its own card, so it double-nests *"until the library passes
     `surface="none"` there … Owner is applying that one-line library change."*

Both are visible, reasoned, and self-terminating. That's the pattern: a library gap is
a *tracked note*, never a silent fork.

### Host-composed ≠ new library component

`FormShell` (`web/components/form-shell.tsx`) is the tell. It is a **host-side recipe
assembled from library primitives** (`Separator`, `<form>`), not a new library widget:

```tsx
// FormShell — a host-side recipe assembled from library primitives — NOT a new
// library component.
```

If you find yourself building something that *feels* like a primitive (a generic,
reusable, app-agnostic control), that's a signal it belongs in the library — surface
it. If it's this-app-specific assembly, it belongs in `web/components/`.

---

## 2. Two ways to build a screen — the engine vs. bespoke

Every screen is one of two kinds. Pick by a single question: **can the screen engine
express it?**

### 2a. Engine-expressible → a recipe (the default)

A screen is described as **data** (a `ScreenRecipe`) in `web/lib/screens.ts`, and the
library `ScreenRenderer` draws it. The host (`web/components/deep-link-screen.tsx`)
shapes app types into the flat rows/records the recipe references, supplies the
per-module rights, dispatches named actions, and owns the router.

The recipe registry, keyed `<module>.<view>`:

```ts
// web/lib/screens.ts
export const BASE_RECIPES: Record<string, ScreenRecipe> = {
  "team.detail":    teamDetailRecipe,
  "members.list":   membersListRecipe,
  "members.detail": memberDetailRecipe,
  "roles.list":     rolesListRecipe,
  "invites.list":   invitesListRecipe,
  "invites.detail": inviteDetailRecipe,
  "learning.list":  learningListRecipe,
  "help.list":      helpListRecipe,
}
```

A recipe is a `type` (`list` / `detail`), a `binding`, a `gate` (module + right),
`fields`, `actions`, and — for details — the `tabs`. Example, the member detail's
Overview + Activity tabs (note this is *data*, not JSX):

```ts
// web/lib/screens.ts — memberDetailRecipe.tabs
tabs: [
  { key: "overview", label: "Overview", icon: CONCEPT_ICON.overview,
    block: { kind: "description", columns: 1, rows: [
      { label: "Role", column: "role" },
      { label: "Joined", column: "joined" },
      { label: "Email", column: "email" },
    ] } },
  { key: "activity", label: "Activity", icon: CONCEPT_ICON.activity,
    block: { kind: "activity", source: "activity" } },
]
```

Recipes are **overridable per team at runtime**: a team's JSON override (from the
config store) wins over the in-code base. `resolveRecipe()` merges override-over-base
and — critically — is **defensive**: a missing, unparseable, or shape-incomplete
override falls back to the base via `isScreenRecipe()`, so a bad override can never
blank a screen team-wide.

### 2b. Not engine-expressible → a host-composed component

When a screen needs a control the engine has no block for, the host composes it from
library primitives itself. The canonical example is **`role-detail.tsx`**: a role's
permission grid is a bespoke `PermissionMatrix` with no screen-engine block, so
`screens.ts` deliberately has **no `roles.detail` recipe** —

```ts
// web/lib/screens.ts (registry comment)
// Roles DETAIL has no recipe — its permission grid has no engine block, so the
// host composes it from the library PermissionMatrix (see role-detail.tsx).
```

The current bespoke details are **`role-detail`**, **`learning-detail`**, and
**`help-detail`** — each a full record screen (its own header, tabs, actions) wired by
hand because it carries a control (permission matrix / rich-text article body + media /
ticket thread + status stepper) the engine doesn't render.

### The decision, in one table

| The screen is…                                             | Build it as…                          | Example |
|------------------------------------------------------------|---------------------------------------|---------|
| A bounded list of shaped rows                              | a `list` recipe                        | `membersListRecipe` |
| A detail whose tabs are description-lists + activity        | a `detail` recipe                      | `memberDetailRecipe`, `inviteDetailRecipe` |
| A detail carrying a control the engine has no block for     | a host-composed component              | `role-detail`, `learning-detail`, `help-detail` |
| A generic, app-agnostic control you keep re-needing         | **not here** — surface it to the library | — |

The `deep-link-screen.tsx` resolver holds both worlds together: it renders a
`<ScreenRenderer>` for recipe screens and delegates to `<RoleDetailScreen>` /
`<LearningDetailScreen>` / `<HelpDetailScreen>` for the bespoke ones.

### The screen engine's URL grammar

One static shell (`deep-link-screen.tsx`) backs the whole `/t/*` tree.
`/t/<teamId>/<module>/<id>` is resolved **client-side** (a static export can't
prerender ids). Learning and Help also have clean top-level URLs (`/learning`,
`/help`) that run against the active team. The friendly URL segment maps to the real
permission module the server enforces:

```ts
// web/lib/screens.ts
export const MODULE_PERMISSION: Record<string, string> = {
  team: "teams", members: "team_members", roles: "member_roles",
  invites: "team_members", dropdowns: "selectable_data",
  learning: "learning", help: "help",
}
```

Navigation *inside* `/t/*` uses the History API, never the framework router — a static
export would otherwise full-reload and wipe the warm in-memory cache. Write UI is
URL-driven (`?panel` / `?confirm`) so Back closes it and links are shareable.

---

## 3. The Laws of the Base that touch the UI

These live in **RULES.md** (the human table) pinned to **`shared/rules/registry.ts`**
(the same laws as data), and are enforced by **`web/test/rules.test.ts`**, which reads
the source *straight off disk* — so a check can't be fooled by anything but the real
code. The UI laws:

| ID | Law (plain English) | Check id |
|----|---------------------|----------|
| **R2** | Every record-detail screen exposes **Overview + Activity** tabs. | `record-detail-tabs` |
| **R3** | Collection tab strips use the library **`TabsView`** — no hand-rolled button toggles. | `no-handrolled-toggles` |
| **R4** | Every form/dialog renders through the shared **`FormShell`**. | `forms-use-formshell` |
| **R6** | Product terms live in **ONE glossary** — the app speaks one dictionary. | `glossary-wellformed` |
| **R7** | Every form dialog persists its draft per session (**`useFormDraft`**). | `forms-persist-drafts` |
| **R8** | Every team collection tab derives its **count from its loaded rows** (declares a `countCacheKey`). | `tab-counts-derived` |

(`R1` and `R5` are the arch/data laws — mutations publish a live change; activity is
read through one generic path — covered in CACHING.md / DATA-MODEL.md. `R5`'s web half
does show up in `rules.test.ts`: the app must read record activity through the one
`recordActivity` fetcher.)

### R2 — record detail = Overview + Activity, via `TabsView` + `ActivityFeed`

Every record you can open has, at minimum, an **Overview** tab (the key facts at a
glance) and an **Activity** tab (what changed and who changed it). Recipe details get
these as recipe data (see §2a). The **bespoke** details must render them themselves —
and the check verifies exactly that, reading the source for the two library names:

```ts
// web/test/rules.test.ts
for (const c of RECORD_DETAIL_COMPONENTS) {          // ["help-detail", "learning-detail"]
  const src = read(join(WEB, "components", `${c}.tsx`))
  expect(src, `${c} must use library TabsView`).toContain("TabsView")
  expect(src, `${c} must render an ActivityFeed (the Activity tab)`).toContain("ActivityFeed")
}
```

`learning-detail.tsx` is the model: a `TabsView` whose panels are `Article` /
`Overview` (a `DescriptionList` of `auditItems(...)`) / `Activity` (an `ActivityFeed`
fed by the generic `tenancy.recordActivity("learning", id)` path).

**Reviewed exception:** `role-detail` is listed in `RECORD_DETAIL_EXCEPTIONS` with a
mandatory reason (*"permission grid is a bespoke matrix with no Overview/Activity yet
— tracked in UI-GAPS"*). Exceptions are **data** in the registry, so every bypass is a
visible, conscious line — never a silent skip. A new bespoke record detail must either
join `RECORD_DETAIL_COMPONENTS` (and get the tabs) or earn a reasoned exception.

### R3 — no hand-rolled toggles

Any tab strip / segmented toggle uses the library **`TabsView`** (icon + count badge).
The check hunts the tell-tale of a fake toggle — a `Button` whose variant flips on a
comparison — across *every* `.tsx` under `web/components`:

```ts
// web/test/rules.test.ts
const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
expect(offenders, `use the library TabsView instead of hand-rolled toggles`).toEqual([])
```

Real `TabsView` usage — the learning list's Articles / Team-progress strip and the
Help list's All / My raiser strip in `deep-link-screen.tsx` — is `variant: "line"`
config with `tabs`, `badge`, `badgeVariant`, and an `onValueChange` that drives the URL
(`?tab=…`) so Back works.

### R4 — every form goes through `FormShell`

One layout, everywhere: **title + subtitle · separator · fields · separator ·
action**. `FormShell` (`web/components/form-shell.tsx`) is that layout, assembled from
library primitives. The check asserts each form dialog imports it:

```ts
// web/test/rules.test.ts — FORM_DIALOGS is the enforced list
for (const d of FORM_DIALOGS) {                       // help-form-dialog, learning-form-dialog,
  const src = read(join(WEB, "components", `${d}.tsx`))//  role-form-dialog, invite-dialog, team-edit-dialog
  expect(src, `${d} must use FormShell`).toContain("form-shell")
}
```

Inside a `FormShell`, each field is a library `<Field>` with `className={fieldSpacing}`
(a touch more label→input air than the library default). Pass the title as a
`<DialogTitle>` and the subtitle as a `<DialogDescription>` so Radix Dialog
accessibility stays intact.

### R6 — the glossary is the single source of terms

Product terms live once, in **`shared/glossary.ts`** — one canonical term per concept,
each with a plain, brief definition (≤140 chars), for a 45–55-year-old manager. Copy
uses **these** words; you never invent a synonym for a concept already there. The check
proves the dictionary stays well-formed:

```ts
// web/test/rules.test.ts
expect(entry.def.length, `${key}.def must be brief (≤140 chars), never over-explained`)
  .toBeLessThanOrEqual(140)
expect(terms.has(entry.term), `duplicate term "${entry.term}"`).toBe(false)
```

The canonical terms include: **Team**, **Member**, **Role**, **Access right**
(not "permission" in copy), **Invite**, **Revoke**, **Activate / deactivate** (not
"delete"), **Ticket**, **Conversation**, **Stakeholder**, **Learning**, **Article**,
**Category**, **Done**, **Dropdown values**, **Import**, **Assistant**, **Activity**,
**Overview**, **Status**. When writing UI copy, reach for this list first.

### R7 — forms persist their draft per session

A half-filled form whose screen unmounts (you navigated away in the same tab) must come
back filled. Every form dialog persists via **`useFormDraft`** (backed by
`sessionStorage`, keyed by a stable `draftKey` the caller supplies, e.g.
`learning:new:<teamId>` / `learning:edit:<recordId>`). Cleared on submit or explicit
dismiss (Esc / backdrop / close); *preserved* on navigation. The check mirrors R4 —
each `FORM_DIALOGS` entry must contain `useFormDraft`. See CACHING.md §11.

### R8 — tab counts derive from rows

A team collection tab's badge is the length of the rows it shows — never a hand-typed
number that can drift. Any `placement: "tab"` section that leads with a collection
must declare a **`countCacheKey`** (`web/lib/pages.ts`), and the host builds every
badge by *iterating* that field:

```ts
// web/components/deep-link-screen.tsx
for (const s of TEAM_SECTIONS) {
  if (!s.countCacheKey) continue
  const rows = loadedByCacheKey[s.countCacheKey]
  if (rows !== undefined) sectionCounts[s.key] = rows.length
}
```

The check enforces both halves — every collection tab declares a `countCacheKey` (or is
a reasoned `TAB_COUNT_EXCEPTIONS` entry), *and* `deep-link-screen.tsx` still derives the
badges generically (it must contain `s.countCacheKey`, so no per-section literal can
creep back). Reviewed exceptions: `overview` (leads with team metadata, not a
collection) and `import` (a contextual per-target action, not a tab).

### How the whole scheme is keystoned — `registry-integrity`

You **cannot add a law without its check, and cannot add a check without its law.** The
keystone test asserts RULES.md lists *exactly* the law ids in `RULES_REGISTRY`:

```ts
// web/test/rules.test.ts — L0, the keystone
const ids   = RULES_REGISTRY.map((r) => r.id)
const inDoc = [...md.matchAll(/^\|\s*(R\d+[a-z]?)\s*\|/gm)].map((m) => m[1])
expect(new Set(inDoc)).toEqual(new Set(ids))
```

And a companion test asserts every *enforced* law maps to a known check id. So the flow
to add a UI law is fixed: **RULES.md row ⇄ `registry.ts` entry ⇄ a real check in
`rules.test.ts`** — all three or the build is red.

```
 RULES.md (the human table)  ⇄  shared/rules/registry.ts (the law as data)
                              ⇘   ⇙
                    web/test/rules.test.ts (the check that reads source off disk)
                    keystoned by  registry-integrity (L0)
```

---

## 4. The action-icon mapping

Action buttons carry an icon (lucide), placed **before** the label, sized **`size-3.5`**
on inline action buttons. Keep the icon-for-action mapping identical across the app —
add a concept to the vocabulary, never a one-off icon at a call site.

| Action | Icon | Notes |
|--------|------|-------|
| Edit | `Pencil` | e.g. "Edit", "Edit details" — wired (`role-detail`, `learning-detail`, `help-detail`) |
| Deactivate / switch off | `Power` | our deactivate-only model — never "delete" — wired |
| Remove (from team) | `UserMinus` | the canonical icon for a remove action |
| Revoke (an invite) | `Ban` | the canonical icon for a revoke action |
| Create / add | `Plus` | "New role", "New article", "Raise ticket" — wired (`screen-bits`) |
| Import | `Upload` | "Import CSV" — wired (`screen-bits`) |
| Invite | `Mail` | the one create action with its own concept icon — wired |

Remove and Revoke currently run through the engine's `?confirm=` route (a `destructive`
text button, not yet an icon button); when they *do* carry an icon, use `UserMinus` and
`Ban` respectively. The mapping is the law regardless of whether a given action is wired
with its icon yet — do not pick a different icon at a call site.

Real usage (`role-detail.tsx`, `learning-detail.tsx`):

```tsx
<Button variant="outline" size="sm" onClick={() => setEditingOpen(true)} className="shrink-0 gap-1.5">
  <Pencil className="size-3.5" /> Edit details
</Button>
```

```tsx
<Button variant="outline" size="sm" onClick={() => void setActive(false)}
  className="text-destructive hover:text-destructive gap-1.5">
  {busyActive ? <Spinner /> : <Power className="size-3.5" />} Deactivate
</Button>
```

**Rules of thumb:**

- **Destructive = red + confirm.** Destructive actions use the destructive colour
  (`text-destructive`) *and* a confirm step (an `AlertDialog`, or a `?confirm=` URL
  route in the engine). Deactivate and Remove both do this.
- **Concept icons are one vocabulary.** Page/section/record concepts get their icon from
  `CONCEPT_ICON` in `web/lib/pages.ts` (`members: "users"`, `roles: "shield-half"`,
  `activity: "history"`, …) and reuse it at page, tab, and button level so "members"
  always looks the same.
- **Icon-only is acceptable on narrow screens** — but keep an `aria-label`.
- On a create/import row the icon sits at **`size-4`** (a larger primary button); inline
  record actions use **`size-3.5`**. Match the neighbours.

---

## 5. Voice

Write for a **45–55-year-old manager who wants things simple**. The voice is **warm,
plain, sentence case, no jargon, no emoji**, and it uses the **glossary terms**.

- **Sentence case** everywhere — titles, buttons, labels. "New article", not "New
  Article".
- **No emoji.** Anywhere. (This is a hard design-language rule.)
- **Use the dictionary.** "Activate / deactivate", never "delete". "Access right", not
  "permission", in user-facing copy. "Ticket", "Conversation", "Stakeholder" as defined.
- **Warm and concrete.** Real examples from the code:
  - Empty states: *"No members yet."*, *"No learning yet."*, *"No tickets yet."*
  - Placeholders that teach: *"How to onboard a new client"*, *"Write the article —
    bold, italic, highlight, and lists are supported."*
  - Explain the *why*, briefly: *"The content is also what the assistant reads to help
    your team."*
  - Reassure on a scary action: *"Members who have it keep their access, but you can't
    give it to anyone new. You can activate it again later."*
- **Say what a control does, not how it's implemented.** No worker names, no "D1", no
  "publishChange" in the UI. Ever.

When in doubt, read `shared/glossary.ts` and copy its tone.

---

## 6. Cards, one-row collection headers, and dynamic search/filters

### Collections are boxed as one unit

A collection — its title, search, filters, and rows — reads as a single card. The host
wraps engine lists in **`CollectionCard`** (`screen-bits.tsx`), and a list with a
host-rendered create button uses **`SectionWithCreate`** (the create/import row sits
*above* the boxed collection, right-aligned).

### Search and filters are data-driven — hidden when empty

Every bounded list searches its already-cached rows **client-side, zero new requests**
(SEARCH.md · Layer 1). A list recipe turns this on with `listCollection(...)`
(`searchable: true`, an `inline` header, and optional `filterFacets`). But we **never
render dead UI** — `withDataDrivenCollection()` tunes the chrome to the actual rows
before render:

```ts
// web/lib/screens.ts
if (rows.length === 0) {
  // no rows → hide search + filters entirely; the empty state stands alone
  return { ...recipe, collection: { ...collection, searchable: false, userFilter: false } }
}
const facets = collection.filterFacets.filter((f) =>
  rows.some((row) => row[f.field] != null && String(row[f.field]).trim() !== "")
) // keep a facet only if at least one row carries a value — an all-empty facet is a useless dropdown
```

So: **empty list → no search bar, no filters** (just the empty message).
**Rows present → search on, and a filter facet appears only when its column has values.**
`filterFacets` reference real columns on the *shaped* rows (e.g. members filter by
`role`, roles by `state`, help by `status`); their options are auto-derived from the
data. A cleared dropdown shows a clear-X (see the learning form's category/type selects).

### One-row headers

Collection headers use `headerLayout: "inline"` — title, search, and filters on a
single row, not stacked. (The library's `surface="none"` on the engine list is the
in-flight change that lets `CollectionCard` be the single clean box rather than a
card-in-a-card — see the tracked note in `screen-bits.tsx`.)

---

## 7. The living background and immovable, contentless pages

### Living background

Every screen renders over the library's **`AmbientBackground`**, mounted once in
`web/app/layout.tsx`:

```tsx
// web/app/layout.tsx
import { AmbientBackground } from "@swift-struck/ui/registry/primitives/ambient-background/ambient-background"
// …
<AmbientBackground />
```

Surfaces that float over it (dialogs, sheets, the mobile bars) use the frosted
**`.glass`** class. Because the living background shows through, the host bumps
`.glass` to a mostly-opaque surface so text stays readable — a *tracked* override that
points at the library change meant to replace it (§1).

### Immovable, contentless pages

The app should feel like a **native shell**, not a zoomable web page. The viewport is
locked in `layout.tsx`:

```ts
// web/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false,
  // "the design language has no zoomable surfaces"
}
```

The shell frame is fixed and doesn't scroll away: the desktop sidebar and the mobile
top bar + bottom tab bar (`AppShell`) are persistent; only the `<main>` content region
scrolls. The frame never moves, the page never pinch-zooms, and the background stays
alive underneath — that's the "immovable, contentless page" feel.

---

## 8. Checklist — before you ship a UI change

- [ ] New primitive-shaped control? **Surface it to the library** — don't fork it here.
- [ ] New screen? Recipe if the engine can express it; a host-composed component only if
      it carries a control the engine has no block for (like `role-detail`).
- [ ] New record detail? It has **Overview + Activity** tabs (R2) — recipe data, or, if
      bespoke, `TabsView` + `ActivityFeed`, and it's registered (or a reasoned
      exception) in `shared/rules/registry.ts`.
- [ ] Any tab strip / toggle uses the library **`TabsView`** (R3) — no `variant={x===y?…}`.
- [ ] New form? Through **`FormShell`** (R4) *and* **`useFormDraft`** (R7), added to
      `FORM_DIALOGS`.
- [ ] New collection tab? Declares a **`countCacheKey`** (R8).
- [ ] Every new product word is in **`shared/glossary.ts`** (R6) — one term, one brief
      definition — and the copy uses it.
- [ ] Action buttons carry the **right icon** (Pencil / Power / UserMinus / Ban / Plus /
      Upload), `size-3.5` inline; destructive = red + confirm.
- [ ] Copy is warm, plain, sentence case, no jargon, no emoji.
- [ ] Search/filters are wired through `listCollection` + `withDataDrivenCollection` so
      they **hide when empty**.
- [ ] `npm run check` is green (TypeScript + the full test suite, including
      `web/test/rules.test.ts`).
