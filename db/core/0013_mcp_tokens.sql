-- 0013 — the MCP front desk (ARCHITECTURE: the external machine surface).
-- Personal access tokens: hashed at rest (the secret is shown ONCE at creation),
-- pinned to ONE team, revocable. The mcp worker bridges a valid token to a real,
-- short-lived, TEAM-PINNED session — so every downstream door re-checks the
-- caller's live membership + role exactly as it does for a browser.

CREATE TABLE mcp_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  team_id TEXT NOT NULL REFERENCES teams (id),
  label TEXT NOT NULL,                 -- the human name ("CI importer", "Zapier")
  token_hash TEXT NOT NULL UNIQUE,     -- sha256 of the secret; the secret is never stored
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT                      -- deactivate-not-delete, like everything else
);

CREATE INDEX idx_mcp_tokens_user ON mcp_tokens (user_id);

-- A session minted for an MCP token is PINNED to the token's team: /me answers
-- with this team regardless of the human's current app team, so a token can
-- never act outside the team it was created for. NULL = a normal web session.
ALTER TABLE sessions ADD COLUMN team_pin TEXT;
