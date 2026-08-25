# The route census

**Generated — do not edit by hand.** `node scripts/route-census.mjs --write`.

Every door this app has, with the gate each one opens with, derived from the
source. It exists because a security sweep once measured 45 state-changing
routes when there were 61, and scored the app on the 45 it happened to find.
A reviewer should inherit the surface, not rediscover it.

**94 routes · 58 state-changing · 1 with no gate detected.**

| Worker | Method | Path | Handler | Kind | Gate |
|---|---|---|---|---|---|
| auth | GET | `/api/auth/activity` | `activity` | — | getSessionUser |
| auth | POST | `/api/auth/admin/test-login` | `adminTestLogin` | — | TEST_LOGIN_KEY |
| auth | POST | `/api/auth/email/change/start` | `emailChangeStart` | — | getSessionUser |
| auth | POST | `/api/auth/email/change/verify` | `emailChangeVerify` | — | getSessionUser |
| auth | POST | `/api/auth/email/start` | `emailStart` | — | **none detected** |
| auth | POST | `/api/auth/email/verify` | `emailVerify` | — | emailed code |
| auth | GET | `/api/auth/health` | `json` | — | **none detected** |
| auth | POST | `/api/auth/logout` | `logout` | — | self-scoped |
| auth | GET | `/api/auth/me` | `me` | — | getSessionUser |
| auth | POST | `/api/auth/profile` | `profile` | — | getSessionUser |
| auth | POST | `/internal/log-error` | `internalLogError` | — | INTERNAL_KEY |
| auth | POST | `/internal/mcp-session` | `internalMcpSession` | — | INTERNAL_KEY |
| auth | POST | `/internal/send-email` | `internalSendEmail` | — | INTERNAL_KEY |
| content | GET | `/api/content/help` | `getHelp` | read | gated |
| content | POST | `/api/content/help` | `postCreateHelp` | mutation | gated |
| content | POST | `/api/content/help/bulk-status` | `postBulkHelpStatus` | mutation | gated |
| content | POST | `/api/content/help/bulk-status-by-filter` | `postBulkHelpStatusByFilter` | mutation | gated |
| content | POST | `/api/content/help/reply` | `postHelpReply` | mutation | gated |
| content | GET | `/api/content/help/stakeholders` | `getHelpStakeholders` | read | gated |
| content | POST | `/api/content/help/stakeholders` | `postAddStakeholder` | mutation | gated |
| content | POST | `/api/content/help/status` | `postHelpStatus` | mutation | gated |
| content | GET | `/api/content/help/thread` | `getHelpThread` | read | gated |
| content | POST | `/api/content/help/update` | `postUpdateHelp` | mutation | gated |
| content | GET | `/api/content/learning` | `getLearning` | read | gated |
| content | POST | `/api/content/learning` | `postCreateLearning` | mutation | gated |
| content | POST | `/api/content/learning/active` | `postSetLearningActive` | mutation | gated |
| content | POST | `/api/content/learning/bulk-active` | `postBulkSetLearningActive` | mutation | gated |
| content | POST | `/api/content/learning/done` | `postLearningDone` | mutation | gated |
| content | GET | `/api/content/learning/export` | `getLearningExport` | read | gated |
| content | GET | `/api/content/learning/progress` | `getLearningProgress` | read | gated |
| content | POST | `/api/content/learning/update` | `postUpdateLearning` | mutation | gated |
| content | POST | `/api/content/learning/upload` | `postUploadLearningFile` | housekeeping | gated |
| data-ops | GET | `/api/data-ops/admin/errors` | `getErrors` | read | adminGuard |
| data-ops | POST | `/api/data-ops/admin/errors/resolve` | `postResolveError` | housekeeping | adminGuard |
| data-ops | POST | `/api/data-ops/admin/grant-credits` | `postGrantCredits` | mutation | adminGuard |
| data-ops | POST | `/api/data-ops/admin/seed-targets` | `postSeedTargets` | housekeeping | adminGuard |
| data-ops | POST | `/api/data-ops/agent/chat` | `postAgentChat` | housekeeping | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/agent/confirm` | `postAgentConfirm` | housekeeping | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/agent/thread` | `getAgentThread` | read | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/agent/threads` | `getAgentThreads` | read | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/agent/usage` | `getAgentUsage` | read | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/agent/usage-log` | `getAgentUsageLog` | read | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/import` | `postImportStart` | housekeeping | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/import/batch` | `postBatchStart` | housekeeping | requireAnyImportRight, teamContext |
| data-ops | GET | `/api/data-ops/import/batch` | `getBatch` | read | teamContext |
| data-ops | POST | `/api/data-ops/import/batch/confirm` | `postBatchConfirm` | mutation | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/import/batch/file` | `postBatchFile` | housekeeping | requireAnyImportRight, teamContext |
| data-ops | POST | `/api/data-ops/import/batch/plan` | `postBatchPlan` | housekeeping | requireAnyImportRight, teamContext |
| data-ops | GET | `/api/data-ops/import/batches` | `getBatches` | read | teamContext |
| data-ops | POST | `/api/data-ops/import/confirm` | `postImportConfirm` | mutation | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/import/file` | `postImportFile` | housekeeping | requireRight, teamContext |
| data-ops | POST | `/api/data-ops/import/mapping` | `postImportMapping` | housekeeping | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/import/preview` | `getImportPreview` | read | requireRight, teamContext |
| data-ops | GET | `/api/data-ops/import/sample` | `getImportSample` | read | teamContext |
| data-ops | GET | `/api/data-ops/import/targets` | `getImportTargets` | read | teamContext |
| mcp | GET | `/api/mcp/health` | `json` | — | **none detected** |
| mcp | GET | `/api/mcp/tokens` | `getTokens` | — | requireUser |
| mcp | POST | `/api/mcp/tokens` | `postToken` | — | requireUser |
| mcp | POST | `/api/mcp/tokens/revoke` | `postRevoke` | — | requireUser |
| mcp | POST | `/mcp` | `handleMcp` | — | bearer token |
| tenancy | GET | `/api/tenancy/active` | `active` | read | whoAmI |
| tenancy | GET | `/api/tenancy/activity` | `getActivityFeed` | read | requireRight, teamContext |
| tenancy | GET | `/api/tenancy/admin/db-sizes` | `dbSizes` | read | adminGuard |
| tenancy | POST | `/api/tenancy/admin/migrate-teams` | `migrateTeams` | housekeeping | adminGuard |
| tenancy | POST | `/api/tenancy/admin/move-module` | `moveModule` | housekeeping | adminGuard |
| tenancy | POST | `/api/tenancy/bootstrap` | `bootstrap` | mutation | whoAmI |
| tenancy | GET | `/api/tenancy/invitations` | `getReceivedInvitations` | read | whoAmI |
| tenancy | POST | `/api/tenancy/invitations/accept` | `postAcceptInvitation` | mutation | whoAmI |
| tenancy | GET | `/api/tenancy/invites` | `getInvites` | read | gated |
| tenancy | POST | `/api/tenancy/invites` | `postCreateInvite` | mutation | gated |
| tenancy | GET | `/api/tenancy/invites/audit` | `getInviteAudit` | read | gated |
| tenancy | POST | `/api/tenancy/invites/revoke` | `postRevokeInvite` | mutation | gated |
| tenancy | GET | `/api/tenancy/members` | `getMembers` | read | gated |
| tenancy | POST | `/api/tenancy/members/remove` | `postMemberRemove` | mutation | gated |
| tenancy | POST | `/api/tenancy/members/role` | `postMemberRole` | mutation | gated |
| tenancy | GET | `/api/tenancy/my-permissions` | `getMyPerms` | read | requireRight, teamContext |
| tenancy | GET | `/api/tenancy/roles` | `getRoles` | read | requireRight, teamContext |
| tenancy | POST | `/api/tenancy/roles` | `postCreateRole` | mutation | requireRight, teamContext |
| tenancy | POST | `/api/tenancy/roles/active` | `postSetRoleActive` | mutation | requireRight, teamContext |
| tenancy | GET | `/api/tenancy/roles/export` | `getRolesExport` | read | requireRight, teamContext |
| tenancy | GET | `/api/tenancy/roles/permissions` | `getRolePerms` | read | requireRight, teamContext |
| tenancy | POST | `/api/tenancy/roles/permissions` | `postRolePerms` | mutation | requireRight, teamContext |
| tenancy | POST | `/api/tenancy/roles/update` | `postUpdateRole` | mutation | requireRight, teamContext |
| tenancy | GET | `/api/tenancy/selectable` | `getSelectable` | read | gated |
| tenancy | POST | `/api/tenancy/selectable` | `postCreateSelectable` | mutation | gated |
| tenancy | POST | `/api/tenancy/selectable/active` | `postSetSelectableActive` | mutation | gated |
| tenancy | POST | `/api/tenancy/selectable/bulk-active` | `postBulkSetSelectableActive` | mutation | gated |
| tenancy | GET | `/api/tenancy/selectable/export` | `getSelectableExport` | read | gated |
| tenancy | POST | `/api/tenancy/selectable/update` | `postUpdateSelectable` | mutation | gated |
| tenancy | POST | `/api/tenancy/switch-team` | `switchActiveTeam` | housekeeping | whoAmI |
| tenancy | GET | `/api/tenancy/team-meta` | `getTeamMetaFeed` | read | teamContext |
| tenancy | POST | `/api/tenancy/teams` | `createNamedTeam` | mutation | whoAmI |
| tenancy | GET | `/api/tenancy/teams` | `myTeams` | read | whoAmI |
| tenancy | POST | `/api/tenancy/teams/update` | `postUpdateTeam` | mutation | gated |
