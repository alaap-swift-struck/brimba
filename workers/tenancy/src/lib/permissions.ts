// Permission enforcement now lives in the SHARED gating seam
// (shared/workers/gating.ts) so EVERY domain worker — tenancy, content, data-ops —
// enforces membership + rights identically, with no duplication. Re-exported here
// so tenancy's existing `./lib/permissions` imports keep working unchanged.
// Locked rule: every server request validates membership + rights.
export {
  GuardError,
  requireMember,
  hasRight,
  requireRight,
  type Right,
  type MemberGuard,
} from "../../../../shared/workers/gating"
