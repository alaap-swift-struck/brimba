-- The CREDIT half of the agent quota (owner's credit-based model). A team gets a
-- free daily allowance (metered in agent_usage with a 'YYYY-MM-DD' period — the
-- free counter) and, once that's used up, spends from this purchasable balance.
-- Lives in the global core DB so the shared agent gate can check + spend a unit
-- without opening a team database. Top-ups are an owner/admin action for now; real
-- payments wire in later against this same balance (the seam is the grant action).
CREATE TABLE agent_credits (
  team_id TEXT PRIMARY KEY REFERENCES teams (id),
  balance INTEGER NOT NULL DEFAULT 0,          -- AI credits remaining (never negative)
  lifetime_granted INTEGER NOT NULL DEFAULT 0, -- total ever granted (for admin view)
  updated_at TEXT
);
