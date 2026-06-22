// The standard opening every team-scoped handler shares (who's calling, the
// Cloudflare config, a validated membership guard for the ACTIVE team) now lives
// in the SHARED gating seam (shared/workers/gating.ts), used by every domain
// worker. Re-exported here so tenancy's `./context` imports keep working unchanged.
export {
  whoAmI,
  toActor,
  teamContext,
  adminGuard,
  type TeamCtx,
} from "../../../shared/workers/gating"
