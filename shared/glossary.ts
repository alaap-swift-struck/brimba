// THE BRIMBA DICTIONARY — one canonical term per product concept, each with a
// plain, brief definition (correct word, explained simply, never over-explained).
// Audience: 45–55yo managers who want things simple. The whole app speaks THESE
// words; copy should never invent a synonym for a concept that's already here.
// Enforced well-formed by web/test/rules.test.ts (R6: glossary-wellformed).

export interface GlossaryEntry {
  term: string
  /** one line, ≤140 chars — clear enough for a five-year-old, but the right word. */
  def: string
}

export const GLOSSARY = {
  team: { term: "Team", def: "Your shared workspace — the people and data you work on together." },
  member: { term: "Member", def: "A person on your team." },
  role: { term: "Role", def: "What a member is allowed to see and do." },
  permission: { term: "Access right", def: "A single thing a role can do: read, create, edit, or delete." },
  invite: { term: "Invite", def: "An email asking someone to join your team in a role you choose." },
  revoke: { term: "Revoke", def: "Cancel an invite before it's accepted." },
  deactivate: { term: "Activate / deactivate", def: "Turn a record on or off without deleting it — it's retired, not removed, so its history and access survive." },
  ticket: { term: "Ticket", def: "A question or request raised in Help, so the team can discuss it and sort it out together." },
  helpThread: { term: "Conversation", def: "The back-and-forth messages on a ticket." },
  stakeholder: { term: "Stakeholder", def: "Someone kept in the loop on a ticket — the person who raised it, your admins, and anyone mentioned." },
  learning: { term: "Learning", def: "Your team's how-to articles, read right here in the app." },
  article: { term: "Article", def: "One how-to in Learning." },
  category: { term: "Category", def: "A label that groups your learning articles." },
  progress: { term: "Done", def: "Whether you've personally finished a learning article." },
  dropdownValues: { term: "Dropdown values", def: "The options behind your team's dropdowns — like Help types and Learning categories." },
  importCsv: { term: "Import", def: "Bring rows in from a spreadsheet (CSV) instead of typing them one by one." },
  exportCsv: { term: "Export", def: "Download what you can see as a spreadsheet (CSV) file." },
  assistant: { term: "Assistant", def: "Your in-app helper — it can find things, explain them, and make changes for you." },
  activity: { term: "Activity", def: "A history of what changed on a record, and who changed it." },
  overview: { term: "Overview", def: "The key facts about a record at a glance." },
  status: { term: "Status", def: "Where a ticket is in its lifecycle: open, in progress, or resolved." },
} as const satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY
