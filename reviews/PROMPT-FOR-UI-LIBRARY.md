# Paste this into a session in `swift-struck-ui`

Two jobs, in this order. The second is the bigger one.

---

## Job 1 — four gaps the app cannot work around

These come from a sixteen-review audit of `brimba` (2026-08-25). Each one caps a
review's score in the APP, and cannot be fixed there: `CLAUDE.md` forbids the host
from forking the library, so the host raised them instead of working around them.

**1 · `CollectionFrame` empty states cannot hold an action.**
`collection-frame.tsx:241` renders `{config.emptyText}` and nothing else, and
`emptyText` is typed `string`. A recipe therefore *physically cannot* put a button
in an empty state. Result in the app: 19 of 21 empty states are absences — "No
learning yet." — and a brand-new team is told what it does not have and never what
to do. Add an optional `emptyAction?: ReactNode` (or `emptyState?: ReactNode`
superseding `emptyText`) so a recipe can offer the obvious next step.

**2 · `PermissionMatrix` hard-codes four rights columns for every module.**
The app has modules where `create` and `delete` are meaningless, so it renders live
toggles that enforce nothing — 9 of 32 switches at last count. An admin ticks a box,
sees it stick, and believes they restricted something. Accept a per-module rights
list so a module can declare which of read/create/edit/delete it actually has.

**3 · No connection-state primitive.**
There is no way to show "live / reconnecting / offline". The app's realtime layer is
strong (hibernating objects, sharded fan-out, diff-patch reconnect) and completely
invisible, so a stale screen and a live one look identical. A small, quiet indicator
— not a banner — that a shell can drive from its socket state.

**4 · No list virtualisation.**
Collections render every row. The app's scaling target is 250,000 people in one
tenant, and client rendering is the first thing that breaks. This is the one that
needs design thought, not just a prop.

---

## Job 2 — write the assembly rules, and make them checkable

The app now has 25 machine-checked Laws. The library has components and taste. The
gap between those two is where drift happens, and we have just spent a day proving
what that costs.

**The finding that should shape this work:** in `brimba`, **eleven rule checks were
found to be incapable of failing.** Not weak — incapable. A check that hardcoded
which files to inspect. A check that filtered for a pattern no file contained. A
check that asserted a constant held words written on the line above it. Every one
of them had been green since the day it was written, and every Law they claimed to
enforce was decoration.

So: **a design rule with no check is a preference, and preferences rot.** Whatever
you write, ship it with a lint that reads the library's own source and fails.

### What the rules must optimise for

Three properties, in this order, because they trade against each other and someone
has to say which wins:

1. **Low cognitive load** — the person is a busy 45–55-year-old manager doing their
   fourth task of the morning, not a designer admiring a screen.
2. **High intuitiveness** — they can predict what a control does before touching it.
3. **High fidelity** — every state is designed, not just the one in the mockup.

### The shape I would write, as a starting point — argue with it

**A · The general laws.** Small, composable, each one checkable by looking at a
screen and answering yes or no:

- **One screen, one job.** If you cannot say what a screen is for in one sentence,
  it is two screens.
- **One primary action per view.** Exactly one filled button. Everything else is
  outline or text. Two competing buttons make a person stop and choose, and
  choosing is the expensive part.
- **The same thing lives in the same place.** Title, primary action, tabs, row
  actions — fixed positions across every composition, so spatial memory does the
  work instead of attention.
- **Recognition over recall.** Never require someone to remember a value from a
  previous screen. Show it.
- **Every state is designed**: loading, empty, one, many, too many, error,
  no-permission. An empty state that only says what is absent is unfinished.
- **Progressive disclosure by default.** The 20% that covers 80%; the rest behind a
  clearly named door. A wall of fields is a failure of editing, not of layout.
- **Colour carries meaning or is not used.** One accent for interactive. Red only
  destructive. Green only success. Never decoration.
- **Two weights, one type scale.** Size carries hierarchy; weight-stacking is how a
  screen starts shouting.
- **Spacing is a rhythm, not a guess.** One scale. Related things closer than
  unrelated things — proximity is the cheapest grouping signal there is.
- **Every action visibly happened.** Silence reads as broken.
- **A destructive action names its target.** "Delete" is not enough. "Delete the Q3
  report?" is.
- **Sentence case, plain words, glossary terms.** The interface is mostly text.

**B · The four compositions, each a FIXED skeleton.** This is the part that makes it
assemblable rather than tasteful — a person or an agent should be able to build a
correct screen by filling in a shape, not by having judgement:

- **Collection** — heading with an exact count → filters → rows → paging.
- **Record** — heading with identity and status → tabs (Overview first, Activity
  last) → per-tab content.
- **Form** — one column, labels above fields, related fields grouped, primary action
  bottom-right, cancel to its left, destructive nowhere near either.
- **Conversation** — history above, composer pinned below, newest at the bottom,
  the other party's state always visible.

**C · A decision table.** "If you are showing ___, use ___." One row per situation,
so the question "which component?" has an answer instead of an opinion.

**D · The lint.** For every rule above that can be read off the source — two filled
buttons in one view, a colour used outside its meaning, a spacing value off the
scale, an empty state with no action, a composition that skips a slot in its
skeleton — write a check that reads the registry and fails. **Prove each one by
breaking the thing it guards and watching it go red before you keep it.** That
sentence is the entire lesson of the audit; a check nobody has watched fail is
usually not a check.

Deliver it as `UI-RULES.md` (the law-book), plus the lint. If a rule cannot be
checked, mark it `judgement` explicitly, so the unenforced ones are a short visible
list rather than an assumption.
