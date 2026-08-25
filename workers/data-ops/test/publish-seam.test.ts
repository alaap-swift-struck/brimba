// R1 for data-ops. The scan itself lives in `shared/test/publish-seam.ts`, shared by
// every mutating worker — the three copies this replaces each carried a private
// reader that sliced to the next EXPORTED function and never stripped comments.

import { join } from "node:path"

import { describePublishSeam } from "../../../shared/test/publish-seam"
import { ROUTES } from "../src/index"

describePublishSeam({
  worker: "data-ops",
  routes: ROUTES,
  srcDir: join(__dirname, "..", "src"),
  housekeeping: {
    // The three-stage import SESSION. Each step shapes only the caller's own
    // session and hands the result back in the same response; no other screen has
    // anything to show yet. Only /import/confirm writes shared rows, and it is
    // classified "mutation" and publishes.
    "POST /api/data-ops/import":
      "starts an import session for this caller only — the rows it will eventually write do not exist yet, so no screen is stale",
    "POST /api/data-ops/import/file":
      "parses the caller's uploaded file into their own session; nothing is written to a team table, so there is no row to patch",
    "POST /api/data-ops/import/mapping":
      "records how the caller wants their columns mapped, inside their own session — a decision about a future write, not a write",
    "POST /api/data-ops/admin/seed-targets":
      "an owner operation that seeds the import catalogue; R13 self-heals the catalogue against the code on every read, so no client is holding a stale copy to refresh",
    // The BATCH steps, same shape as the session above.
    "POST /api/data-ops/import/batch":
      "the batch draft shapes the caller's OWN batch, returned in the same response — only /batch/confirm writes shared rows, and only it publishes",
    "POST /api/data-ops/import/batch/file":
      "parses a file into the caller's own batch draft; no team table is touched, so nothing can be stale on anyone else's screen",
    "POST /api/data-ops/import/batch/plan":
      "computes what the batch WOULD write and shows it back to the caller — the whole point is that nothing has been written yet",
    // The AGENT. Its conversation is private; anything it actually changes is
    // published by the gated door its executor calls, exactly as a person's click
    // would be.
    "POST /api/data-ops/agent/chat":
      "writes only the caller's own private conversation; any team-visible effect is published by the gated endpoint the executor calls",
    "POST /api/data-ops/agent/confirm":
      "confirms a step in the caller's own private conversation; the resulting change is published by the gated door that performs it",
    "POST /api/data-ops/admin/errors/resolve":
      "private maintainer bookkeeping in the operations database (owner-only, x-admin-key) — no team screen shows an error row, so there is nothing to broadcast",
  },
  indirectPublishers: [],
})
