// THE LAWS OF THE BASE, as data. This is the single source of truth the human
// RULES.md and the machine-checks (shared/rules + the per-worker publish-seam
// tests + web/test/rules/*.test.ts) are both pinned to. A law may not be added
// without a check; a check may not exist without a law (enforced by L0 in
// web/test/rules/*.test.ts). Deny-lists are DATA here, so every exception is a
// reviewed, visible line — never a silent bypass (the proven publish-seam pattern).

export type Dimension = "arch" | "ui" | "workflow" | "ai"
export type RuleStatus = "enforced" | "aspirational"
export interface Rule {
  id: string
  dimension: Dimension
  law: string
  /** the test id that enforces it (a per-worker suite or a web rules.test case). */
  checkId: string
  status: RuleStatus
}

export const RULES_REGISTRY: Rule[] = [
  {
    id: "R1",
    dimension: "arch",
    law:
      "Every mutation route publishes a live change ping — and HOLDS it: await or ctx.waitUntil(...), never a bare publishChange(...), which the platform cancels when the isolate finishes with the response. ctx.waitUntil is the usual shape, because publishing is best-effort by contract and bounded, so the person should not wait on a ping nobody reads. Best-effort is not unwatched: the publish seam reads its answer and records a ping that did not land under the realtime-publish integration.",
    checkId: "publish-seam",
    status: "enforced",
  },
  {
    id: "R2",
    dimension: "ui",
    law: "Every record-detail screen exposes Overview + Activity tabs.",
    checkId: "record-detail-tabs",
    status: "enforced",
  },
  {
    id: "R3",
    dimension: "ui",
    law: "Collection tab strips use the library TabsView (icon + count badge) — no hand-rolled button toggles.",
    checkId: "no-handrolled-toggles",
    status: "enforced",
  },
  {
    id: "R4",
    dimension: "ui",
    law: "Every form/dialog renders through the shared FormShell (one title/subtitle · separator · fields · separator · action layout).",
    checkId: "forms-use-formshell",
    status: "enforced",
  },
  {
    id: "R5",
    dimension: "arch",
    law: "Record activity is read through ONE generic (table, id) path — any module's history, no per-module read SQL.",
    checkId: "generic-activity-path",
    status: "enforced",
  },
  {
    id: "R6",
    dimension: "ui",
    law: "Product terms live in ONE glossary (clear, brief, no over-explaining) — the app speaks one dictionary.",
    checkId: "glossary-wellformed",
    status: "enforced",
  },
  {
    id: "R7",
    dimension: "ui",
    law: "Every form dialog persists its draft per session (useFormDraft) — unsaved input survives navigating away (CACHING.md §11).",
    checkId: "forms-persist-drafts",
    status: "enforced",
  },
  {
    id: "R8",
    dimension: "ui",
    law: "Every placement:'tab' section that shows a collection declares a countCacheKey — R8 owns WHICH collection a tab's badge describes (derived from the registry, never hand-listed). The NUMBER the badge shows is owned by R16 (an exact server total through formatCount); where the two disagree, R16 prevails.",
    checkId: "tab-counts-derived",
    status: "enforced",
  },
  {
    id: "R9",
    dimension: "arch",
    law: "The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability. And it knows what the app REFUSES: a vocabulary-gated write states its call ORDER (create the dropdown value first, write the rows second, one turn) on BOTH surfaces the model reads — the tool's own description and the system rule wall. Earned by: a perfectly-planned single call refused by the vocabulary gate, ending a turn having changed nothing.",
    checkId: "agent-app-parity",
    status: "enforced",
  },
  {
    id: "R10",
    dimension: "arch",
    law: "Every state-changing route opens with a permission gate — requireRight (or the gated()/gatedBody() wrapper / requireAnyImportRight / adminGuard) — unless it is a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on whoAmI instead. No ungated door can ship.",
    checkId: "gating-seam",
    status: "enforced",
  },
  {
    id: "R11",
    dimension: "arch",
    law: "Every call that leaves a worker is bounded and guarded. EXTERNAL (a bare global fetch() to the internet — the D1 REST door, the email sender, the AI model call): an AbortSignal timeout, so a hung socket can never stall a worker. INTERNAL (a service binding): through the one seam, shared/workers/trace.ts — callService bounds it, never throws, returns NULL for \"did not answer\" as distinct from a Response that says no, and carries the request id. The internal half was added 2026-08-12; the law previously EXEMPTED service bindings as \"Cloudflare-bounded\", which the architecture review disproved — the platform bounds the worker, nothing bounds the call, and a caller could not tell an outage from a refusal. Two exceptions, each with a written reason: the gateway proxy and forwardToDoor are guarded but deliberately NOT bounded, because both carry responses of unbounded legitimate duration (the agent's streamed reply, an import batch) and a bound that truncates working output is worse than none. SCOPE, settled 2026-08-25 after three rounds each derived a different hop count from the same code: this law governs the two shapes named above — a bare global fetch and a SERVICE BINDING. A Durable Object RPC stub is OUT of scope. There are three, all in workers/realtime/src/index.ts: the broadcast() stub call and the two WebSocket-upgrade fetches. None leaves the platform for a third party; `broadcast(message: string): void` is a typed RPC method rather than a fetch, so the mechanism this law mandates — an AbortSignal — does not exist at that call site; broadcast() already swallows per-socket failures rather than propagating them (index.ts:47-55), so one dead socket can neither fail nor stall a publish; bounding a WebSocket upgrade would defeat the socket it is opening; and realtime's central catch records anything the RPC itself throws. So the honest count of hops this law governs is 21 service-binding hops, not 24.",
    checkId: "fetch-timeout",
    status: "enforced",
  },
  {
    id: "R12",
    dimension: "arch",
    law: "Every cron / scheduled handler records its failures to the error store (recordWorkerError) — unattended work has no user watching, so a swallowed background failure would be invisible in the 90-day error_logs. (A user-facing catch that shows a friendly message should record too — a documented convention, e.g. the agent's model-call catch.)",
    checkId: "cron-records",
    status: "enforced",
  },
  {
    id: "R13",
    dimension: "arch",
    law: "Shipping the code ships the capability: every module is a TargetDef in the import/export catalog or a reviewed CATALOG_EXEMPT entry — AND the core catalogue table reconciles itself against the code on READ (INSERT-only, ON CONFLICT DO NOTHING: a target the owner switched OFF stays off; only a row that never existed is created; the picker never pre-filters is_active in SQL). Earned by: staging importing two modules that production, running byte-identical code, could not — rows are data, and no deploy carries data.",
    checkId: "catalog-coverage",
    status: "enforced",
  },
  {
    id: "R14",
    dimension: "arch",
    law: "No unbounded list endpoint, and no capped GROWING one: every SELECT inside an exported list*/search* function backing a collection route carries its OWN hard cap (LIMIT n, in that statement, said in a comment) — the bound lives in the SQL, not merely somewhere in the function; only an aggregate or a primary-key equality is bounded without one — but a collection that GROWS with ordinary use (GROWING_COLLECTIONS) must PAGE instead, by KEY not offset: an opaque cursor, an exact total, and hasMore, with a client that can actually reach page two. A cap is an honest refusal to answer; paging is an answer. Earned by: one unbounded read stalling a worker under a 24,000-row catalogue — then the same catalogue proving a 1,000-row ceiling is just a slower refusal — then a scan that a CONSTANT NAMED `…_LIMIT` satisfied, passing an unbounded read because the law was checked against the body instead of the statement.",
    checkId: "bounded-lists",
    status: "enforced",
  },
  {
    id: "R15",
    dimension: "arch",
    law: "The live registry pairs up BOTH WAYS. No deaf publishers: every resource string any worker publishes must reach a listener (TEAM_RESOURCES / SIMPLE_INVALIDATIONS) or a reasoned DEAF_EXEMPT entry whose named cache keys are themselves checked. And no DEAD LISTENERS: every registered listener must have a publisher naming it — the one shape allowed without one is a second server SCOPE of a resource that has a publisher, and that is DERIVED, not written down (the scope's cache key must appear in that resource's own deps, which is the same thing as saying its pings really do reach the key). Every list fetcher the screens read through must also be a registry entry, because that map is what the reconnect catch-up walks. And every paged screen reads through the caches the shell patches (use-screen-data.ts keys off live-resources, so a page-two row is patched exactly like a page-one row). Earned by: a server-paged screen going stale on a teammate's change; the dropdown manager staling because its worker pinged a resource nothing listened to; a DEAF_EXEMPT reason that described a refresh mechanism which did not exist; the My-tickets list, which was a dep and never an entry, so a dropped socket left it stale for good; and data_import_batches, registered and idle for months with a comment politely explaining that nothing published it — the check ran one way only, and a live listener that never fires looks exactly like nothing having changed yet.",
    checkId: "live-collections",
    status: "enforced",
  },
  {
    id: "R16",
    dimension: "ui",
    law: "Every screen showing a collection shows its count, exactly once: the NUMBER is an exact server COUNT(*) rendered through the ONE formatCount seam (floored abbreviation at every magnitude, zero/loading render nothing, the only '+' is a capped SEARCH total); the PLACE is a tab badge where the screen has a counted tab, else a CollectionHeading; the ARBITRATION is a React context (CountedTabs / CountedAbove) — a counted tab WINS and the heading stands down, decided per-permission at render, never by a prop. Where R8 and R16 disagree about a number, R16 prevails (R8 owns WHICH collection a tab describes). Earned by: a 24,011-product catalogue advertising '1000' (a capped list's length), and the same '24k' shown twice on one screen.",
    checkId: "counted-collections",
    status: "enforced",
  },
  {
    id: "R17",
    dimension: "arch",
    law: "State transitions are idempotent: every deactivate/reactivate UPDATE carries the current-status predicate (deactivate: AND deactivated_at IS NULL; reactivate: IS NOT NULL — status moves: AND status <> ?), reads the changed-row count back, and when zero rows moved writes NO activity row and publishes NO change. Earned by: a double-clicked Deactivate writing two 'deactivated' rows 2.0s apart into one record's history — history says what happened, not how many times a button was pressed.",
    checkId: "idempotent-transitions",
    status: "enforced",
  },
  {
    id: "R18",
    dimension: "arch",
    law: "A cross-module read carries the caller's module rights: the team activity feed subtracts the caller's denied modules (ONE shared clause that any count over the feed must reuse), and every relatedTable a worker writes resolves to a module in ACTIVITY_GATE_MAP or a reasoned ACTIVITY_TABLE_EXEMPT entry. Earned by: a member with one read right seeing every module's before/after ('changed BIG-0000001 price from 4,500 to 3,900') through the one ungated feed.",
    checkId: "activity-gate-coverage",
    status: "enforced",
  },
  {
    id: "R19",
    dimension: "ai",
    law: "Agent/MCP filter parity: any tool sitting on a screen's list/search door EXPOSES and FORWARDS every filter that door parses — the required set is DERIVED from the door's own parameter parsing, never hand-listed. Earned by: the assistant falling back to free text and answering a DIFFERENT question — 3,465 descriptions that mentioned the words instead of the 134 records actually carrying the value.",
    checkId: "agent-filter-parity",
    status: "enforced",
  },
  {
    id: "R22",
    dimension: "ui",
    law: "Creating a MASTER record through a form OPENS that record (owner's decision, 2026-08-11). It is implemented once, in the shared form seam (FormShell's `opensRecord`), so a module gets it by declaring one thing rather than every screen remembering to navigate — a create resolves with the new record's id (which R21 makes available) and the shell opens its detail. It applies to master records created deliberately through a form container, NOT to accessory or child rows created as a side effect; exceptions are NAMED PER TABLE with their reason (CREATE_OPENS_RECORD_EXEMPT), never assumed from a missing prop.",
    checkId: "create-opens-record",
    status: "enforced",
  },
  {
    id: "R21",
    dimension: "arch",
    law: "A create door returns the CREATED RECORD, never the collection. Shipping a whole (capped) list back to add one row costs the caller a read it did not ask for, contradicts row-level live-sync (CACHING rule 3) and the paging rule — a screen reads one bounded page, never the table — and leaves the caller unable to learn the new record's id without a follow-up search. The response is `{ created, total }` (+ any honest extras like `emailSent`); the client patches that one row in through the `applyCreated` seam, exactly as an \"add\" ping would. DERIVED FROM THE GATE: a create door is any route that opens on the `create` right, so a new module is covered the moment it is gated. Earned by: POST /products returning listProducts() — a thousand rows to create one, and still no id.",
    checkId: "create-returns-row",
    status: "enforced",
  },
  {
    id: "R20",
    dimension: "ui",
    law: "Every navigable destination resolves in a FRESH TAB. The app is a static export, so THREE separate lists in three workspaces have to agree, and all three are INVISIBLE from inside the app (the client router never leaves the page, so the nav always works and the missing page shows up only when someone pastes the url): a top-level `/<segment>` exists only if a page source emits it (web/app), soft navigation to it only stays soft if TOP_LEVEL_MODULES names it (web/components/deep-link/route.ts — otherwise the framework router takes it and the static export makes that a full RELOAD that tears the shell down), and `/<segment>/<id>` resolves only if the gateway serves that module's shell for it (MODULE_SHELLS in workers/gateway). All three are DERIVED from the nav registries (NAV + TEAM_SECTIONS placement:\"sidebar\"), never hand-listed. Earned by: three modules in one fork shipping a sidebar entry with no page behind it, three separate times, with nothing red.",
    checkId: "static-destinations",
    status: "enforced",
  },
  {
    id: "R23",
    dimension: "arch",
    law: "A mutation door returns the AFFECTED ROW, never the collection. R21 established this for creates and stopped there, so every EDIT, STATUS and DEACTIVATE door still shipped the whole (capped) list back — a full list read plus a COUNT on the server and the entire collection over the wire, to change one row. It also contradicted the rule the base enforces everywhere else: a live ping makes every OTHER client patch the single changed row (CACHING rule 3), while the client that did the work replaced everything it was showing. Two update paths for one event, and the expensive one belonged to the person actually waiting. The response is `{ updated, total? }` and the client folds it in through `applyUpdated`; a NULL row is the answer, not a miss — it means the record left the list and should be dropped. DERIVED FROM THE GATE: a mutation door is any route opening on `edit` or `delete`, so a new module is covered the moment it is gated. Doors that return a count (`{ updated, skipped }` from a bulk) or a bare `{ ok: true }` are already fine — what is banned is the collection. Earned by: eleven doors in this base, and a help door that returned a whole PAGE of a growing collection on every status change.",
    checkId: "mutation-returns-row",
    status: "enforced",
  },
  {
    id: "R24",
    dimension: "arch",
    law: "A single-record write door either HAS a bulk twin or carries a written reason why it cannot — and every twin DECLARES whether its rows may run TOGETHER or must run IN ORDER. The second half is the point. A stock movement computes its balance from the balance the previous line left behind, so running ten together yields ten individually-plausible lines, a ledger that does not add up, and no way to tell afterwards which one was wrong. Most writes have no such dependency and are needlessly slow if forced sequential. The declaration lives in `shared/workers/bulk-doors.ts` keyed by handler name; a door missing from it fails the check, because DECIDING is mandatory and choosing `no twin` is not a failure. MACHINE-CHECKED: every edit/delete-gated door is declared, and an `in-order` twin must not parallelise its rows. NOT machine-checked, stated openly: whether a door declared `together` secretly depends on order — that needs the meaning of the code, not its shape, so each ordered twin owes a BEHAVIOURAL test that runs it with order-dependent rows and asserts the final state. Earned by: a fork's stock ledger, where the parallel burst was the bug nobody could untangle.",
    checkId: "bulk-twin-declared",
    status: "enforced",
  },
  {
    id: "R25",
    dimension: "arch",
    law: "A record's WHOLE LIFE lands in the one activity table — created, edited, deactivated, reactivated (master records are never hard-deleted, so deactivation IS death). The rule is stated in exactly ONE place, shared/workers/activity.ts; ARCHITECTURE.md and the team schema POINT at it rather than restate it, because when it was said in three places it drifted into three different rules and the schema's version was simply wrong. The table is APPEND-ONLY: nothing in the request path updates or deletes an activity row, so ageing is a documented retention policy, never code rewriting history. Every row carries WHO (a frozen actor snapshot), WHAT (related_table + related_row_id), WHEN, and WHICH DOOR (origin: ui/api/mcp/agent/import/job) plus the field diff as data. Earned by: an audit that could only answer 'did the assistant change this?' by reading source, and a team feed that recorded people being removed and demoted but never arriving.",
    checkId: "activity-birth-to-death",
    status: "enforced",
  },
  {
    id: "R26",
    dimension: "workflow",
    law: "The base's own identity is SWEEPABLE IN ONE COMMAND: every shipped file carrying the product name is one `scripts/fork.mjs` rewrites, so a fork renames the whole base — sources, configs, docs AND the tests that pin the literals — and `npm run check` stays green. The sweep DERIVES its subject by scanning the repo; it never carries a list of sites, because a hand-list is wrong the day after it is written. Reviewed exceptions are DATA (FORK_SWEEP_EXEMPT). Earned by: a sweep that lived as prose in a skill OUTSIDE this repository, with nothing red when it drifted — so it named one of the four copies of the session cookie (rename that one alone and every MCP call silently fails auth), listed a storage-prefix file that has no prefix while missing two that do, and left eight assertions in three test files pinning literals it renames, turning the one pre-deploy gate RED while promising green.",
    checkId: "fork-sweep-complete",
    status: "enforced",
  },
]

/** R13 — reviewed exemptions: modules that are deliberately NOT import targets,
 * each with its reason. Every other module must have a TargetDef in the catalog. */
export const CATALOG_EXEMPT: Record<string, string> = {
  teams: "team metadata is created by the team factory (one row per team), never imported",
  team_members: "membership arrives through invites (an identity flow) — a CSV cannot consent for a person",
  help: "tickets are conversations raised in-app; importing them would forge authorship and timelines",
  screens: "the screen-override subsystem was REMOVED on 2026-08-25 (no caller on any surface). The `screens` table itself remains — team migration 0002_screens is applied to every live database and migrations are append-only — so the module key still resolves and still needs a line here. It was never team data; now nothing reads it at all.",
  agent: "the assistant's threads/usage are system records, not importable content",
}

/** R18 — which permission module gates each activity `relatedTable` a worker
 * writes. The team feed (the ONE cross-module read) subtracts the caller's denied
 * modules through this map; the generic record scope resolves through it too. A
 * table a worker writes that is neither here nor exempt turns the build red —
 * a table the feed cannot NAME is a table it cannot withhold. */
export const ACTIVITY_GATE_MAP: Record<string, string> = {
  help: "help",
  learning: "learning",
  selectable_data: "selectable_data",
  member_roles: "member_roles",
  users: "team_members",
  invite_logs: "team_members",
  // A member ARRIVING is visible to exactly whoever may read the member list —
  // the same gate as the removal and role-change rows that sat beside it. Added
  // 2026-08-18 with the join event itself: the feed recorded people leaving and
  // being demoted, and never recorded them joining (R25).
  team_members: "team_members",
}

/** R15 — reviewed DEAF exemptions: resources a worker publishes that reach NO
 * listener, each with its reason. Publishing to nobody is the silent half of the
 * stale-screen bug, so every exemption is a visible, conscious line. */
/** R14 — the GROWING collections: the ones that get bigger with ordinary use, so
 * a hard cap would eventually become a refusal to answer. Each must PAGE through
 * shared/workers/paging.ts (keyset cursor + exact total + hasMore) AND be reachable
 * past page one from the client. Every OTHER list may still cap — a bounded
 * collection (roles, members, dropdown values) doesn't need a cursor to be honest.
 * DATA, not a hand-list in a test: adding a growing module means adding a line here. */
export const GROWING_COLLECTIONS: Record<
  string,
  { lib: string; fn: string; routes: string; rowsKey: string; webKey: string; listRecipe?: string; why: string }
> = {
  help: {
    lib: "workers/content/src/lib/help.ts",
    fn: "listTickets",
    routes: "workers/content/src/routes/help.ts",
    rowsKey: "tickets",
    listRecipe: "help.list",
    webKey: "helpKey(",
    why: "support tickets accumulate forever — a team that has raised 3,000 must still reach the oldest",
  },
  activity: {
    lib: "workers/tenancy/src/lib/activity-read.ts",
    fn: "getActivity",
    routes: "workers/tenancy/src/routes/team.ts",
    rowsKey: "activity",
    webKey: "activity:team:",
    why: "the fastest-growing table in the base — EVERY mutation writes a row",
  },
}

// AN EXEMPTION THAT NAMES A CACHE KEY IS CHECKED AGAINST THE CODE.
//
// `help_threads` sat here for months with a reason that was simply false — it
// said a reply pings the parent help row "whose row-level patch refreshes the
// open ticket's deps", and that deps array never contained the thread key. Two
// people on one ticket saw only their own replies. Prose cannot be trusted to
// describe a mechanism, so `live-collections` now asserts that every backticked
// key in a reason below actually appears in `web/lib/live-resources.ts`.
export const DEAF_EXEMPT: Record<string, string> = {
  help_threads:
    "a reply also pings the parent help row (op edit), and that resource's deps now include `help-thread:` and `total:help-thread:` — so the open conversation and its count both refresh",
  agent_usage:
    "the quota badge rides every chat response and the usage dialog fetches on open — there is no standing cache a ping could refresh",
}

/** R18 — reviewed exemptions, pinned EXACTLY: tables whose activity every member
 * may see, each with its reason. A new relatedTable must join the gate map above
 * or earn a visible line here — never a silent bypass. */
export const ACTIVITY_TABLE_EXEMPT: Record<string, string> = {
  teams: "team metadata (name/logo) is member-wide — the team screen itself has no module gate",
  screens: "the screen-override subsystem was REMOVED on 2026-08-25, so nothing writes this relatedTable any more; the entry stays because the table (team migration 0002_screens) does, and a historical row in an existing team's feed must still resolve. It never carried record content — only which recipe a screen rendered.",
  import: "an import summary names only counts + the target module; the imported rows' own activity is gated by their module",
  team_module_databases:
    "the module MOVER relocating a module to its own database — owner-only maintenance about where data lives, never about what any record says. It names a module and a row count, both of which every member already sees in the nav. Written by the SYSTEM actor (R25), so there is no person's rights to subtract.",
}

/** Worker test suites that enforce R1. A new mutating worker without a
 * publish-seam test is a gap — track it here. */
export const MUTATING_WORKERS = ["tenancy", "content", "data-ops"] as const

/** R2 — the bespoke (host-composed) record-detail components that MUST render the
 * Overview + Activity tabs themselves (the engine-recipe details get them for free). */
export const RECORD_DETAIL_COMPONENTS = ["help-detail", "learning-detail", "role-detail"] as const

/** R2 — reviewed bypasses. Each MUST get tabs over time; the reason is mandatory.
 * (Empty today: role-detail — the last exception — grew its Permissions/Overview/
 * Activity tabs on 2026-07-06. Every record detail now carries the tabs.) */
export const RECORD_DETAIL_EXCEPTIONS: Record<string, string> = {}

/** R8 — reviewed bypasses: placement:"tab" sections that DON'T lead with a
 * collection, so they carry no count badge (and thus no countCacheKey). Each MUST
 * name its reason; every other tab section is forced to declare a countCacheKey. */
export const TAB_COUNT_EXCEPTIONS: Record<string, string> = {
  overview: "leads with team metadata (name, logo, audit) — not a collection, so no count.",
  import: "contextual per-target action reached from a button — not a collection tab.",
}

/** R4 — the form dialogs that MUST use FormShell. */
export const FORM_DIALOGS = [
  "help-form-dialog",
  "learning-form-dialog",
  "role-form-dialog",
  "invite-dialog",
  "team-edit-dialog",
  "selectable-form-dialog",
] as const

/** R26 — the REGISTER of identity a fork does not inherit correctly from
 * `npm run fork <name>` alone, and why. Two hazards live here, both of them
 * things a TEXT sweep genuinely cannot finish:
 *
 *   1. an asset the sweep cannot read at all — a binary, where the product name
 *      is pixels rather than a literal;
 *   2. an ACCOUNT-scoped deploy host, where the sweep rewrites the app half of
 *      `<app>.<account>.workers.dev` and leaves the author's account half — more
 *      dangerous than an unswept literal, because a fork then reads its OWN name
 *      in a URL it does not own and smoke-tests against somebody else's edge.
 *
 * It was `{}` until 2026-08-25, which asserted NOTHING: the check only validated
 * entries that existed, so an empty map passed vacuously while four brand PNGs
 * and seven files naming the author's subdomain shipped unregistered. The check
 * now scans for both hazards and fails on an unregistered one, and rejects an
 * entry that is no longer either — so the map cannot rot in either direction.
 *
 * `scripts/fork.mjs` PRINTS this map when it finishes, so a forker is told what
 * is left to do by hand. Adding a line here adds a line to that closing report —
 * write the reason for the person reading it. */
export const FORK_SWEEP_EXEMPT: Record<string, string> = {
  // 1 · Generated binaries. No text sweep can rewrite pixels — so these are not
  // swept, they are REDRAWN: `scripts/gen-icons.mjs` derives the monogram from
  // `brand.name`, and `scripts/fork.mjs` runs it as its final step. Nothing to
  // do by hand unless a real logo replaces the monogram.
  "web/public/icons/icon-192.png": "Generated binary: the PWA install icon. Redrawn from shared/brand.ts by scripts/gen-icons.mjs, which scripts/fork.mjs runs last.",
  "web/public/icons/icon-512.png": "Generated binary: the PWA icon at splash size. Redrawn from shared/brand.ts by scripts/gen-icons.mjs, which scripts/fork.mjs runs last.",
  "web/public/icons/icon-maskable-512.png": "Generated binary: the Android adaptive (maskable) icon. Redrawn from shared/brand.ts by scripts/gen-icons.mjs, which scripts/fork.mjs runs last.",
  "web/public/icons/apple-touch-icon.png": "Generated binary: the iOS home-screen icon. Redrawn from shared/brand.ts by scripts/gen-icons.mjs, which scripts/fork.mjs runs last.",

  // 2 · The author's Cloudflare account subdomain. An `<app>.<account>.workers.dev`
  // host sweeps its APP label to the new name and keeps the ACCOUNT label: the
  // first half is right and the second is still ours. No rename can guess a
  // fork's own subdomain — the
  // same reason fork.mjs BLANKS the account id and the D1 database ids rather
  // than renaming them — so each of these must be pointed at the fork's own
  // account by hand, from BOOTSTRAP.md §2. Documents naming the host are left to
  // the docs pass; these are the files that actually deploy, test or link to it.
  "workers/auth/wrangler.jsonc": "Account-scoped deploy host: the routes still point at the author's workers.dev subdomain. Repoint to the fork's own account (BOOTSTRAP.md §2).",
  "workers/tenancy/wrangler.jsonc": "Account-scoped deploy host: the routes still point at the author's workers.dev subdomain. Repoint to the fork's own account (BOOTSTRAP.md §2).",
  "scripts/smoke-staging.mjs": "Account-scoped deploy host: the default SMOKE_BASE is the author's staging edge, so an unedited fork smoke-tests somebody else's app. Repoint it, or pass SMOKE_BASE.",
  "scripts/timings.mjs": "Account-scoped deploy host: the staging + production URLs it measures are the author's. Repoint them to the fork's own account.",
  "timings.json": "Account-scoped deploy host: recorded timings, stamped with the author's staging URL. Re-record against the fork's own edge; the numbers are not the fork's.",
  "web/playwright.config.ts": "Account-scoped deploy host: the default e2e BASE_URL is the author's staging edge. Repoint it, or pass BASE_URL.",
  "web/components/access-tokens.tsx": "Account-scoped deploy host: the MCP connection snippet falls back to the author's production URL when rendered server-side. Repoint the fallback.",
  "web/e2e/live-sync.spec.ts": "Account-scoped deploy host: the live-sync e2e run defaults to the author's staging edge and asserts against the author's production host. Repoint both, or pass BASE_URL.",
}

/** R21 — create doors that legitimately return something OTHER than the created
 * row. Keyed by handler name, with the reason, so every exception is a visible
 * reviewed line rather than a silent hole in the scan. */
export const CREATE_RETURNS_EXEMPT: Record<string, string> = {}

/** R23 — reviewed exemptions: mutation doors that legitimately hand back
 * something other than the affected row. A door returning a COUNT (a bulk) or a
 * bare `{ ok: true }` needs no entry — it is already not a collection. This is
 * only for a door that genuinely must return a list, with the reason. */
export const MUTATION_RETURNS_EXEMPT: Record<string, string> = {}

/** R22 — which form dialog CREATES which table, and the URL segment that table's
 * detail screen sits under. Every FORM_DIALOGS entry must appear here or in
 * CREATE_OPENS_RECORD_EXEMPT, so adding a module's form forces the decision
 * instead of quietly defaulting to "no". */
export const CREATE_OPENS_RECORD: Record<string, { table: string; segment: string }> = {
  "learning-form-dialog": { table: "learning", segment: "learning" },
  "help-form-dialog": { table: "help", segment: "help" },
  "role-form-dialog": { table: "member_roles", segment: "roles" },
  "invite-dialog": { table: "invites", segment: "invites" },
}

/** R22 — the forms that deliberately do NOT open a record, one line each, with
 * the reason. Named per TABLE (what it writes), not inferred from the absence of
 * a prop: "nobody added it" and "we decided not to" must not look the same. */
export const CREATE_OPENS_RECORD_EXEMPT: Record<string, { table: string; why: string }> = {
  "selectable-form-dialog": {
    table: "selectable_data",
    why: "A dropdown value is an accessory row, managed inline in its own list — there is no detail screen to open.",
  },
  "team-edit-dialog": {
    table: "teams",
    why: "An EDIT form, not a create. (Creating a team switches you into it, which lands you on the team's own screen by a different mechanism.)",
  },
}
