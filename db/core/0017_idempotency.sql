-- 0017 · SCALE: making a retried mutation safe to retry.
--
-- An HTTP request can arrive twice — a double-tapped button, a client retrying
-- after a timeout on a response the server actually sent, a mobile connection
-- resending. Nothing in this base noticed: the second request was simply a
-- second create, and the team quietly got two of whatever it was.
--
-- This table is the memory that makes the second one a REPLAY instead. A client
-- sends `Idempotency-Key: <random>`; the first request claims the key here and
-- stores its outcome; any retry with the same key gets that outcome back without
-- the work running again.
--
-- WHY THE PRIMARY KEY IS THE WHOLE LOCK: two retries landing at the same instant
-- both try to INSERT this row. SQLite serialises writers, so exactly one wins
-- and the other raises — no advisory lock, no coordination object, no second
-- moving part to get wrong.
--
-- WHY IT LIVES IN THE CORE DATABASE: the claim has to happen before the handler
-- resolves which team it is acting on, and the core database is reached over a
-- native binding rather than the REST door — so the check costs one fast query
-- instead of an HTTP round-trip. It is also pure exhaust and is swept (see
-- shared/workers/retention.ts), which is why it may live in the shared database
-- without growing without bound.
--
-- Found by the scaling review, 2026-08-11 — see SCALING.md and CONCURRENCY.md.

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,        -- the client's random key; the mutual exclusion
  owner TEXT NOT NULL,         -- SHA-256 of the claimer's session cookie, never the token
  route TEXT NOT NULL,         -- so one key cannot answer for a different action
  status INTEGER,              -- NULL while the work is still running
  body TEXT,                   -- the response to replay (NULL if it was too large to keep)
  created_at TEXT NOT NULL
);

-- The retention sweep deletes by age, so age is what it must be able to seek on.
CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);
