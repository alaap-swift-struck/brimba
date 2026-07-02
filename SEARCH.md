# Search & filters — the ruleset (DESIGNED 2026-06-18)

How Brimba (and every app on this base) searches and filters records across
collections. Glide configured this at the component level and searched "anything
shown on the detail screen"; we keep that feel but make it **layered** so it
stays cheap for small lists and scales to large record counts. Search/filter is
**declared in the screen recipe** (per the [screen engine](SCREEN-ENGINE-PLAN.md));
the engine picks the right layer automatically.

## The split (who owns what)

- **Library** owns the *presentation + pure logic*: the search box, the filter
  UI, and the in-memory filter/search math, all wired into the existing
  config-driven collection system (`CollectionConfig` + `selectRows`). It exposes
  a **server-side seam** (`serverSide` + `onQueryChange`) but never queries a
  database itself. (The exact library build is tracked in [UI-GAPS.md](UI-GAPS.md)
  #7; the ready-to-paste prompt for the library session lives with that work.)
- **App / workers** own the *data*: which fields are searchable/filterable per
  recipe, the query endpoints (`?q=` + filter params), and the per-team
  **FTS5** index for record-level "search anything."

## The three layers

A collection picks exactly one based on its expected size (declared in the recipe).

### Layer 1 — client-side (small, bounded lists) · the default today
The list is already fetched and cached ([CACHING.md](CACHING.md) `useCached`), so
search + filters run **in memory** over that array — instant, zero new requests.
Right for members, roles, invites, dropdown values: lists that are bounded per
team. This is `selectRows` (limit → filter + facets → search → sort → paginate)
running in the browser. No worker work at all.

### Layer 2 — server-side query (growing lists)
When a list can outgrow "fetch it all" (hundreds+ of rows), the recipe sets
`serverSide: true`. The collection then **does not** filter in memory: it
debounces the typed query + chosen facets and calls the module's list endpoint
with `?q=` + filter params; the worker returns a filtered **page**. Reads stay
cache-first (the cache key includes the query/facets); the live channel still
invalidates on writes. The worker does the filtering with ordinary indexed
`WHERE`/`LIKE` over the per-team database.

### Layer 3 — full-text "search anything" (FTS5)
For record modules where Glide-style "match anything on the detail screen" is
wanted (learning, help, imported datasets), each per-team database gets a
**SQLite FTS5** virtual table mirroring the record table's text columns. The
worker queries it with `MATCH` and returns ranked hits. This is what makes search
span *all* of a record's fields, not just a column, at scale.

## FTS5 design (per-team, per record module)

D1 *is* SQLite, so FTS5 lives **inside each team's own database** — isolation by
physics, same as every other per-team table ([ARCHITECTURE.md](ARCHITECTURE.md) §1).
Pattern, added by the module's team-schema migration when that module is built:

```sql
-- one virtual table per searchable record table (e.g. learning)
CREATE VIRTUAL TABLE learning_fts USING fts5(
  title, description, category,          -- the text fields shown on the detail
  content='learning', content_rowid='rowid'
);
-- triggers keep it in lock-step with the base table (no app code to forget)
CREATE TRIGGER learning_ai AFTER INSERT ON learning BEGIN
  INSERT INTO learning_fts(rowid, title, description, category)
  VALUES (new.rowid, new.content_title, new.content_description, new.category);
END;
CREATE TRIGGER learning_ad AFTER DELETE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, title, description, category)
  VALUES('delete', old.rowid, old.content_title, old.content_description, old.category);
END;
CREATE TRIGGER learning_au AFTER UPDATE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, ...) VALUES('delete', old.rowid, ...);
  INSERT INTO learning_fts(rowid, ...) VALUES (new.rowid, ...);
END;
```

Query path (in the module's worker): `SELECT l.* FROM learning_fts f JOIN learning l
ON l.rowid = f.rowid WHERE learning_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?` —
then the **same permission gate** as every read runs first (a viewer with no
right gets nothing back; FTS never bypasses [permissions](ARCHITECTURE.md) §3).
Deactivated rows are filtered in the JOIN, never hard-deleted ([records rule](ARCHITECTURE.md) §4).

Rules for FTS5 here:
- **One virtual table per searchable record table**, created by that module's
  team-schema migration and rolled to every team via `migrate-teams` (the locked
  maintenance path). New module = new migration, never a change to others.
- **Triggers keep it in sync** — never write the FTS table from app code, so it
  can't drift from the base rows.
- **Mirror only the text fields the detail screen shows** (Glide parity), not ids
  or audit columns.
- The same FTS table sits behind the splitter read-path (`d1QueryAcross`) if a
  module is ever moved to its own database.

## How the recipe declares it (the one knob)

Each field in a screen recipe carries `searchable` / `filterable`; the collection
declares `searchPlaceholder`, `userFilter`, `filterFacets`, and a size hint that
maps to a layer (`serverSide` off = Layer 1; on = Layer 2; a `fullText` flag =
Layer 3). The engine wires `searchable` fields → the library `searchKeys`,
`filterable` fields → filter facets, and chooses client vs server by the hint —
so turning on search for a new screen is a recipe edit, not new plumbing.

## Status (updated 2026-07-02)

- **Layer 1 + the library search/filter UI**: SHIPPED — the library search/filter
  bar landed and the app turned it on across the collections (members / roles /
  invites / dropdowns / learning / help) via the recipes (`listCollection` +
  `withDataDrivenCollection`, which hides search/filters when a list is empty or
  a facet has no options). See UI-CONVENTIONS §6.
- **Layer 2 (server-side filters)**: available through the recipes' hints where a
  list is bounded; nothing needed beyond the shipped client-side layer at today's
  data sizes.
- **Layer 3 (FTS5 full-text)**: designed here, NOT BUILT — the content/data-ops
  workers shipped (2026-06-23) without it because client-side search over the
  cached list covers current volumes. The FTS5 migration ships with the first
  module whose data outgrows the client-side layer.
