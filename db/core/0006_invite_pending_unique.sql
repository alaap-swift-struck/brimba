-- Race-safety: at most ONE pending invite per (team, email). A PARTIAL unique
-- index — revoked / accepted / expired rows still coexist freely, but two
-- simultaneous "invite the same person" requests can't both insert a pending
-- row. Backstops the check-then-insert in createInvite (the DB is the authority;
-- the pre-check is just the friendly/fast path). See CONCURRENCY.md.
CREATE UNIQUE INDEX idx_invite_pending_unique
  ON invite_index (team_id, email) WHERE status = 'pending';
