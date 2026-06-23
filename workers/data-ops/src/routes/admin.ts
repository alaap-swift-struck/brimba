// Owner-only import-catalog maintenance (x-admin-key, like tenancy's maintenance
// endpoints). The import catalog (importable_databases) is global + owner-maintained;
// for now it's seeded to exactly the two allowed targets — member roles + learning.
// Re-running the seed is idempotent (upsert by table_key), so it's safe at deploy.

import { json } from "../../../../shared/workers/http"
import { adminGuard } from "../../../../shared/workers/gating"
import { DEFAULT_CATALOG } from "../lib/targets"
import { seedDefaultCatalog } from "../lib/import"
import type { Env } from "../env"

/** POST /api/data-ops/admin/seed-targets — upsert the default import catalog. */
export async function postSeedTargets(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const actor = { id: "owner", email: "owner", name: "Owner" }
  const count = await seedDefaultCatalog(env, actor, DEFAULT_CATALOG)
  return json({ seeded: count, targets: DEFAULT_CATALOG.map((d) => d.tableKey) })
}
