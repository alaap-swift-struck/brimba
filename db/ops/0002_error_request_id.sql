-- The request id on an error row (architecture review, 2026-08-12).
--
-- THE OPERATIONS DATABASE, not core: error_logs moved here in db/ops/0001. This
-- file was first written into db/core by mistake, which would have failed on a
-- missing table at deploy time — caught by the ship gate, 2026-08-12.
--
-- One click can be handled by seven workers. Until the trace seam existed, an
-- error_logs row said WHICH worker failed and WHAT it said, but nothing tied it
-- to the other six workers' log lines for the same request — so reading an
-- incident meant matching timestamps by eye and hoping no two users clicked at
-- once. `shared/workers/trace.ts` mints the id at the gateway and carries it on
-- every internal hop; this column is where it lands durably.
--
-- Additive and nullable on purpose: every existing row keeps working, every
-- existing query keeps working, and rows written by an older worker mid-rollout
-- simply have no id rather than failing to insert.
ALTER TABLE error_logs ADD COLUMN request_id TEXT;

-- Fetching every worker's view of one failed request is THE query this column
-- exists for, so it gets an index rather than a table scan of the error history.
CREATE INDEX IF NOT EXISTS idx_error_logs_request ON error_logs (request_id);
