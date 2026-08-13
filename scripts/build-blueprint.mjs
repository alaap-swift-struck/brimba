// REGENERATE THE ARCHITECTURE BLUEPRINT — `npm run blueprint`.
//
// `architecture-blueprint.html` is gitignored on the grounds that it is
// "regenerable, not source" (.gitignore). This file is what makes that sentence
// true. Without it the claim was false: the map existed only on one laptop, and
// the ocean review's whole question is what survives that laptop.
//
// WHAT IS DERIVED vs WHAT IS WRITTEN
//
//   DERIVED from disk, every run: the workers and what each is bound to, the
//   migration counts, the per-team table list, the R2 buckets, the shared seams,
//   the documents. Rename a worker or add a migration and the map follows.
//
//   WRITTEN here: the plain-English sentences. No script can infer that auth
//   "knows who you are" or why the storage rule is one room per module.
//
// The two are joined by name, and a name on disk with no sentence beside it is a
// HARD FAILURE rather than a silent gap — so adding a worker forces someone to
// say what it does instead of shipping a map that quietly omits it.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TEMPLATE = join(homedir(), ".claude/skills/architecture_blueprint/assets/blueprint-template.html")
const OUT = join(ROOT, "architecture-blueprint.html")

// ── read the repo ────────────────────────────────────────────────────────────

/** A wrangler.jsonc, with its comments stripped so JSON.parse can read it. */
const wrangler = (dir) =>
  JSON.parse(
    readFileSync(join(ROOT, "workers", dir, "wrangler.jsonc"), "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
  )

const workerDirs = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, "workers", e.name, "wrangler.jsonc")))
  .map((e) => e.name)

const WORKERS = Object.fromEntries(workerDirs.map((d) => [d, wrangler(d)]))
const sqlCount = (d) => readdirSync(join(ROOT, "db", d)).filter((f) => f.endsWith(".sql")).length
const CORE_MIGRATIONS = sqlCount("core")
const OPS_MIGRATIONS = sqlCount("ops")

const TEAM_TABLES = [
  ...new Set(
    (readFileSync(join(ROOT, "workers/tenancy/src/team-schema.ts"), "utf8").match(
      /CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/g
    ) ?? []).map((m) => m.split(" ").pop())
  ),
].sort()

const BUCKETS = [
  ...new Set(Object.values(WORKERS).flatMap((w) => (w.r2_buckets ?? []).map((b) => b.bucket_name))),
].sort()

const SEAMS = readdirSync(join(ROOT, "shared/workers"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort()

const DOC_COUNT = readdirSync(ROOT).filter((f) => f.endsWith(".md")).length

// ── the sentences (the part no script can infer) ─────────────────────────────

const SAY = {
  gateway: {
    h: "The front desk", icon: "ti-building-arch", cat: "gateway",
    d: "The single door to the whole system. Nothing else is reachable from the internet. It hands out the screens, serves uploaded files, decides which specialist should answer each request, and holds the only rate limit in the app. It also stamps every request with an id so all seven specialists' logs can be read together afterwards.",
  },
  auth: {
    h: "Knows who you are", icon: "ti-key", cat: "worker",
    d: "Email sign-in codes, your session, your name and picture. Every other specialist asks this one 'who is calling?' before doing anything — which makes it the piece the whole system leans on. If it stops answering, everything that needs a signed-in person stops with it, and says so honestly rather than pretending you are logged out.",
  },
  tenancy: {
    h: "Who may do what", icon: "ti-users-group", cat: "worker",
    d: "Teams, members, roles, invitations, and the dropdown lists a team keeps. It owns the permission sheet every other specialist checks. It also runs a nightly job that watches how big each team's database is getting and raises an alarm well before it becomes a problem.",
  },
  content: {
    h: "Learning and help", icon: "ti-book", cat: "worker",
    d: "Your team's how-to articles and its help desk — tickets, replies, who is involved. Files attached to either go to their own storage room. Nothing here is shared between teams; it all lives in that team's own database.",
  },
  "data-ops": {
    h: "Imports files, runs the assistant", icon: "ti-sparkles", cat: "worker",
    d: "Two jobs. It reads a CSV you upload, shows you exactly what it will create before it creates anything, and refuses rows it cannot read honestly rather than guessing. And it runs the in-app assistant — which acts AS YOU, through the same doors you would use, so it can never do anything you could not do yourself.",
  },
  mcp: {
    h: "Lets other software in", icon: "ti-plug", cat: "worker",
    d: "The door for machines rather than people: another tool can hold a personal access token and use the app through it. That token is pinned to one team, checked on every single request, and stops working the instant it is revoked. It calls exactly the same permission-checked doors the screens do — never a private shortcut.",
  },
  realtime: {
    h: "Tells every screen what changed", icon: "ti-broadcast", cat: "realtime",
    d: "When anyone changes anything, this announces it to everyone's open screens — which is why a colleague's edit appears on your screen without you refreshing. The announcement carries only 'this row changed', never the contents, so it can never show someone something they are not allowed to see. Their browser then asks for that one row through the normal permission check.",
  },
}

// THE HARD FAILURE. A worker on disk with no sentence beside it would otherwise
// appear as an unexplained box, or vanish — both worse than a failed build.
const undescribed = workerDirs.filter((d) => !SAY[d])
if (undescribed.length) {
  console.error(
    `\nBlueprint build FAILED — these workers exist on disk but nobody has said what they do:\n` +
      undescribed.map((d) => `  • workers/${d}`).join("\n") +
      `\n\nAdd an entry to SAY in scripts/build-blueprint.mjs. A map that quietly omits a\n` +
      `worker is worse than no map: it reads as complete.\n`
  )
  process.exit(1)
}

const SEAM_SAY = {
  gating: "Who is calling, are they on this team, and may they do this? Every worker opens with it.",
  trace: "The one way a worker calls another worker — bounded, guarded, and carrying the request id.",
  "d1-rest": "The ONLY place SQL runs. Swap this one file and the whole app could move to another database.",
  realtime: "The ONLY place a change announcement leaves a worker.",
  validate: "Checks what arrived from the browser before anything trusts it.",
  http: "One shape for every answer, and one shape for every error.",
  paging: "Reading a long list one page at a time, with an exact total.",
  limits: "The hard ceilings on how much any one read may return.",
  concurrency: "Stops a double-click, or two people at once, corrupting anything.",
  "rate-limit": "The only thing bounding how FAST requests may arrive.",
  "bulk-doors": "Which actions may run many rows at once, and which must go in order.",
  numbers: "Reads a number the way a person wrote it, and refuses what is ambiguous.",
  "error-log": "The one way an unexpected failure gets recorded.",
  "tool-catalog": "What the assistant and outside software are allowed to do.",
  activity: "The one way anything gets written into a record's history.",
  csv: "Reading and writing spreadsheets.",
  image: "Checking an uploaded file is what it claims to be.",
  retention: "How long things are kept before being cleared out.",
  "ops-db": "Points a worker at the engine-room database rather than the address book.",
  id: "Generates the ids every row gets.",
  membership: "Is this person still an active member of this team?",
  route: "The shape every worker's list of doors follows.",
  bulk: "Shared helpers for many-rows-at-once actions.",
  "email-template": "The look of every email the system sends.",
}

const TABLE_SAY = {
  learning: "The team's how-to articles.",
  learning_progress: "Who has read what.",
  help: "Help desk tickets.",
  help_threads: "Replies on those tickets.",
  help_stakeholders: "Who else is involved in a ticket.",
  member_roles: "The roles this team has invented.",
  role_permissions: "Exactly what each role may do.",
  selectable_data: "The team's dropdown lists.",
  activity: "The history of everything that happened.",
  invite_logs: "Invitations sent and what became of them.",
  screens: "This team's own screen layouts.",
  agent_threads: "Saved assistant conversations.",
  agent_messages: "The messages inside them.",
  data_import_sessions: "A spreadsheet import in progress.",
  data_import_batches: "A multi-file import in progress.",
  _migrations: "Which schema updates this database has had.",
}

const BUCKET_SAY = {
  "brimba-media": "Profile pictures and anything general. Shared by every team, but each team's files sit under their own team id inside it — so one storage room, never one per customer.",
  "brimba-learning-media": "Pictures and attachments on learning articles. Same rule: one room for the whole module, each team's files under their own prefix.",
  "brimba-help-media": "Attachments on help tickets. Files nobody references any more are swept away nightly, but only after a seven-day grace period.",
}

const DOC_SAY = [
  ["CLAUDE.md", "The rules any agent working here must follow. Read first."],
  ["ARCHITECTURE.md", "The locked decisions, including which piece is the single point of failure."],
  ["RULES.md", "The laws, each with the test that enforces it."],
  ["DATA-MODEL.md", "Every table, and who owns it."],
  ["OPERATIONS.md", "How it builds, ships, and is restored — with the restore drill actually performed."],
  ["BASE-MANUAL.md", "How the whole thing works, and why."],
  ["BUILD-A-MODULE.md", "The checklist for adding something new."],
  ["BOOTSTRAP.md", "How to rebuild all of this from nothing."],
  ["SCALING.md", "What breaks first, and at roughly what size."],
  ["SECRETS.md", "What could not be recovered if this laptop vanished."],
]

// ── assemble ─────────────────────────────────────────────────────────────────

const C = {
  web: "#6EE7C8", gateway: "#7AA2FF", worker: "#B39DFF", realtime: "#FFC46B",
  db: "#7FD4A0", file: "#FF9E9E", planned: "#5A6270", gray: "#8B93A0",
}

const bindingLine = (d) => {
  const w = WORKERS[d]
  const svc = (w.services ?? []).map((s) => s.binding).join(", ")
  return svc ? `calls: ${svc}` : "calls nothing else"
}

const nodeFor = (dir) => {
  const s = SAY[dir], w = WORKERS[dir]
  return {
    h: s.h, t: `${dir} — ${w.name}`, c: s.cat, i: s.icon,
    f: `workers/${dir}/src/index.ts · ${bindingLine(dir)}`,
    d: s.d,
  }
}

const N = {
  web: {
    h: "The screens you use", t: "web — a static site", c: "web", i: "ti-device-laptop",
    f: "web/ (built to web/out)",
    d: "Everything you look at: sign-in, your team, learning, help, the assistant. It is a plain set of files — there is no separate server for screens. The front desk hands them to your browser, and from then on your browser does the moving between pages without ever reloading.",
  },
  gateway: nodeFor("gateway"), auth: nodeFor("auth"), tenancy: nodeFor("tenancy"),
  content: nodeFor("content"), dataops: nodeFor("data-ops"), mcp: nodeFor("mcp"),
  realtime: nodeFor("realtime"),
  coredb: {
    h: "The shared address book", t: "brimba-core — one global database", c: "db", i: "ti-database",
    f: `db/core/ — ${CORE_MIGRATIONS} migrations`,
    d: "The one list that has to be the same for everybody: people, teams, who belongs to which team, sign-in codes, sessions, machine tokens, and the assistant's allowance. It holds nothing that belongs to a single team's work — that all lives elsewhere.",
  },
  opsdb: {
    h: "The engine room log", t: "brimba-ops — the operations database", c: "db", i: "ti-clipboard-list",
    f: `db/ops/ — ${OPS_MIGRATIONS} migrations`,
    d: "Where the system writes about itself: every unexpected error, and every use of the assistant. Kept apart from the address book on purpose — this is the fastest-growing data in the system, and it must never be able to slow down signing in. Each error also carries the id of the request that caused it, so one failure can be followed across all seven specialists.",
  },
  teamdb: {
    h: "One private database per team", t: `team-<id> — ${TEAM_TABLES.length} tables each`, c: "db", i: "ti-lock",
    f: "workers/tenancy/src/team-schema.ts",
    d: "Every team gets its own separate database, created when the team is created. Learning, help, activity history, imports, assistant conversations, roles — all of it. This is the strongest possible answer to 'can one customer see another's data': they are not in the same database, so there is no query that could accidentally cross over.",
  },
  d_core: {
    h: "The shared address book", t: "brimba-core — one, for everybody", c: "db", i: "ti-database", f: "db/core/",
    d: "People, teams, memberships, sessions, sign-in codes, machine tokens, assistant allowance. One copy, shared. Staging and production each have their own, so test data can never mix with real data.",
  },
  d_ops: {
    h: "The engine room log", t: "brimba-ops — one, for everybody", c: "db", i: "ti-clipboard-list", f: "db/ops/",
    d: "Errors and assistant usage. Split off from the address book because it grows fastest and must never slow down signing in.",
  },
  d_t1: {
    h: "Acme Ltd's database", t: "team-01KZR8… — theirs alone", c: "db", i: "ti-lock", f: "created when the team is created",
    d: "Everything Acme does: their learning articles, their help tickets, their history, their roles. No other team's data is in this file at all.",
  },
  d_t2: {
    h: "Globex's database", t: "team-01KZP2… — theirs alone", c: "db", i: "ti-lock", f: "created when the team is created",
    d: "The same tables, holding only Globex's work. Two customers cannot see each other because they are not in the same database — not because a filter remembered to exclude them.",
  },
  d_t3: {
    h: "Every new team gets one", t: "created automatically", c: "planned", i: "ti-plus", f: "workers/tenancy/src/team-schema.ts",
    d: "When someone creates a team, a fresh database is built for it from the same table plan and marked ready. Nothing is shared with anyone else's.",
  },
  d_files: {
    h: "Uploaded files", t: `R2 — ${BUCKETS.length} storage rooms`, c: "file", i: "ti-folder", f: BUCKETS.join(" · "),
    d: "One room per MODULE, not one per customer. Inside each room, a team's files sit under that team's own id. This is the deliberate choice: thousands of customers would mean thousands of rooms to manage, and the prefix gives the same separation with none of that.",
  },
}

const chip = (label, detail) => [label, 0, detail ?? ""]

const MODEL = {
  title: "Brimba — architecture blueprint",
  colors: C,
  cat: {
    web: "The app you see", gateway: "Front desk", worker: "Worker (a specialist)",
    db: "Database", file: "File storage", realtime: "Live updates",
    planned: "Coming soon", gray: "Document",
  },
  legend: ["web", "gateway", "worker", "realtime", "db", "file", "planned"],
  tabs: [
    { v: "how", label: "How it works", icon: "ti-eye" },
    { v: "data", label: "Where data lives", icon: "ti-database" },
    { v: "code", label: "Where the code lives", icon: "ti-folders" },
  ],
  walkthroughView: "how",
  nodes: N,
  views: {
    how: {
      zones: [
        { x: 20, y: 270, w: 232, h: 160, l: "You" },
        { x: 292, y: 270, w: 232, h: 160, l: "The only public door" },
        { x: 576, y: 40, w: 252, h: 620, l: "The specialists" },
        { x: 884, y: 40, w: 470, h: 620, l: "Where everything is kept" },
      ],
      nodes: {
        web: [30, 315], gateway: [302, 315],
        auth: [596, 75], tenancy: [596, 175], content: [596, 275],
        dataops: [596, 375], mcp: [596, 480], realtime: [596, 575],
        coredb: [910, 80], opsdb: [910, 180], teamdb: [910, 280],
      },
      groups: [{
        id: "files", x: 910, y: 390, w: 420, h: 150,
        l: "File storage — R2 (one room per module)",
        cc: "file", cs: "a storage bucket", ci: "ti-folder",
        chips: BUCKETS.map((b) => chip(b, BUCKET_SAY[b])),
      }],
      edges: [
        ["web", "gateway"],
        ["gateway", "auth"], ["gateway", "tenancy"], ["gateway", "content"],
        ["gateway", "dataops"], ["gateway", "mcp"], ["gateway", "realtime"],
        ["auth", "coredb"], ["auth", "opsdb"],
        ["tenancy", "teamdb"], ["content", "teamdb"], ["dataops", "teamdb"], ["mcp", "teamdb"],
        ["realtime", "web"],
      ],
      orient: "h",
    },
    data: {
      // y=210 and x=620, not the top-left corner: the legend is pinned to the
      // screen there, so anything drawn under it is drawn underneath the legend.
      zones: [
        { x: 40, y: 210, w: 520, h: 290, l: "Shared by everybody" },
        { x: 40, y: 530, w: 520, h: 170, l: "Uploaded files" },
        { x: 620, y: 60, w: 600, h: 640, l: "Private to one team — a whole database each" },
      ],
      nodes: { d_core: [70, 260], d_ops: [70, 375], d_files: [70, 580], d_t1: [650, 135], d_t2: [650, 290], d_t3: [650, 445] },
      groups: [
        {
          id: "coretables", x: 300, y: 250, w: 240, h: 225, l: "What is in the shared one",
          cc: "db", cs: "a shared table", ci: "ti-table",
          chips: [
            chip("users", "Every person, once. Their name, email and picture."),
            chip("teams", "Every team, and which database is theirs."),
            chip("team_members", "Who belongs to which team, and in which role."),
            chip("sessions", "Who is currently signed in, on which device."),
            chip("mcp_tokens", "Machine access tokens — stored scrambled, never readable."),
            chip("agent_credits", "How much assistant use a team has left."),
          ],
        },
        {
          id: "teamtables", x: 880, y: 110, w: 310, h: 470,
          l: `The ${TEAM_TABLES.length} tables every team gets`,
          cc: "db", cs: "a per-team table", ci: "ti-table",
          chips: TEAM_TABLES.map((t) => chip(t, TABLE_SAY[t])),
        },
      ],
      edges: [["d_t1", "d_t3"], ["d_t2", "d_t3"]],
      orient: "v",
    },
    code: {
      zones: [
        { x: 40, y: 210, w: 430, h: 180, l: "The seven specialists" },
        { x: 40, y: 420, w: 430, h: 180, l: "The screens" },
        { x: 520, y: 120, w: 440, h: 370, l: "Shared code — written once, used by all seven" },
        { x: 1010, y: 120, w: 390, h: 480, l: "Databases and the written canon" },
      ],
      nodes: {},
      groups: [
        {
          id: "g_workers", x: 65, y: 248, w: 380, h: 128, l: "workers/ — one folder each",
          cc: "worker", cs: "a worker", ci: "ti-server",
          chips: workerDirs.map((d) => chip(d, `${SAY[d].h}. ${bindingLine(d)}.`)),
        },
        {
          id: "g_web", x: 65, y: 458, w: 380, h: 128, l: "web/ — the screens, built to web/out",
          cc: "web", cs: "a part of the app you see", ci: "ti-device-laptop",
          chips: [
            chip("app", "One folder per page you can reach."),
            chip("components", "The screens themselves, assembled from the shared library."),
            chip("lib", "The client's own helpers: the API caller, the cache, the screen recipes."),
            chip("test", "The laws of the base, checked against the real code on every build."),
            chip("e2e", "Whole-journey tests driven through a real browser."),
            chip("public", "Icons, images, and the security headers."),
          ],
        },
        {
          id: "g_shared", x: 545, y: 158, w: 390, h: 318,
          l: `shared/workers/ — ${SEAMS.length} seams`,
          cc: "worker", cs: "a shared seam", ci: "ti-puzzle",
          chips: SEAMS.map((s) => chip(s, SEAM_SAY[s])),
        },
        {
          id: "g_db", x: 1035, y: 158, w: 340, h: 112, l: "db/ — how each database is built",
          cc: "db", cs: "a schema change", ci: "ti-database",
          chips: [
            chip(`db/core — ${CORE_MIGRATIONS} steps`, "The shared address book, built up one change at a time. Each one runs once, in order."),
            chip(`db/ops — ${OPS_MIGRATIONS} steps`, "The engine-room database: errors and assistant usage."),
            chip("team-schema.ts", `The ${TEAM_TABLES.length}-table plan every new team's private database is built from.`),
          ],
        },
        {
          id: "g_docs", x: 1035, y: 320, w: 340, h: 266,
          l: `The written canon — ${DOC_COUNT} documents`,
          cc: "gray", cs: "a document", ci: "ti-file-text",
          chips: DOC_SAY.map(([n, d]) => chip(n, d)),
        },
      ],
      edges: [],
      orient: "h",
    },
  },
  tops: {
    how: "One public door, six specialists behind it, and a private database per team. Click any box for the plain-English version — or press play.",
    data: "One shared list for people and teams. Everything a team actually does lives in a database only they have. That is the isolation.",
    code: `Seven workers, ${SEAMS.length} shared seams written once, one screen app, and ${DOC_COUNT} documents that are checked against the code on every build.`,
  },
  steps: [
    null,
    { nodes: ["web"], groups: [], edges: [], cap: "1 — You open the app. What loads is a plain set of files: pages, styles, pictures. There is no server building a screen for you." },
    { nodes: ["web", "gateway"], groups: [], edges: [["web", "gateway"]], cap: "2 — Everything goes through one door. The front desk is the only piece reachable from the internet; the six specialists behind it have no public address at all." },
    { nodes: ["gateway", "auth"], groups: [], edges: [["gateway", "auth"]], cap: "3 — First question, every time: who is calling? The front desk asks auth, and auth is the only piece that can answer it." },
    { nodes: ["auth", "coredb"], groups: [], edges: [["auth", "coredb"]], cap: "4 — Auth looks you up in the shared address book — the one list that must be the same for everybody: people, teams, and who belongs where." },
    { nodes: ["gateway", "tenancy"], groups: [], edges: [["gateway", "tenancy"]], cap: "5 — Second question: are you allowed? Tenancy holds your team's roles and exactly what each one may do. A screen hiding a button is never the protection — this check is." },
    { nodes: ["tenancy", "content", "dataops", "teamdb"], groups: [], edges: [["tenancy", "teamdb"], ["content", "teamdb"], ["dataops", "teamdb"]], cap: "6 — Only now does anyone touch your team's data — and it is in your team's OWN database. Another customer's work is not in that file at all." },
    { nodes: ["content", "dataops"], groups: ["files"], edges: [], cap: "7 — Files you upload go to a storage room per module, with your team's id in front of every filename. One room per module, never one per customer." },
    { nodes: ["realtime", "web"], groups: [], edges: [["realtime", "web"]], cap: "8 — When anything changes, the announcer tells every open screen. It says only 'this row changed' — never what it says — so nothing can leak to someone who should not see it." },
    { nodes: ["mcp", "gateway"], groups: [], edges: [["gateway", "mcp"]], cap: "9 — Other software can come in the same door, holding a token pinned to one team. It gets exactly your permissions, checked afresh on every request, and dies the moment you revoke it." },
    { nodes: ["auth", "opsdb"], groups: [], edges: [["auth", "opsdb"]], cap: "10 — And if anything goes wrong, it is written down in the engine room with the id of the request that caused it — so one failure can be read across all seven specialists at once." },
  ],
}

if (!existsSync(TEMPLATE)) {
  console.error(
    `\nBlueprint build FAILED — the template is missing:\n  ${TEMPLATE}\n\n` +
      `It ships with the architecture_blueprint skill. Install the skill, or run\n` +
      `/architecture_blueprint, which regenerates this file and the template together.\n`
  )
  process.exit(1)
}

writeFileSync(OUT, readFileSync(TEMPLATE, "utf8").replace("__MODEL_JSON__", JSON.stringify(MODEL)))
console.log(`architecture-blueprint.html rebuilt from the live repo`)
console.log(
  `  ${workerDirs.length} workers · ${CORE_MIGRATIONS} core + ${OPS_MIGRATIONS} ops migrations · ` +
    `${TEAM_TABLES.length} team tables · ${BUCKETS.length} buckets · ${SEAMS.length} seams · ${DOC_COUNT} docs`
)
