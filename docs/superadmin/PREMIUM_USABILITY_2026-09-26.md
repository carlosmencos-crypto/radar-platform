# Superadmin daily usability — 26 September 2026

Scope: QA superadmin only (radar-superadmin-v70-qa.netlify.app). No Hostinger/production files changed in this release.

## Changes
- Superadmin logout clears its stored authentication through the existing signOutRadar and navigates with location.replace to https://radargt.wowlatam.com/. No QA login intermediary. The account block now has a full-width, correctly sized outline logout control and a disabled progress state.
- Daily KPI cards link to contracted municipalities, available municipalities and campaign team assignments. Team rows link back to a municipal record; demos link to their dedicated section.
- Drawers close on backdrop click or Escape when idle, trap keyboard focus and restore previous focus. The overlay now covers the sidebar too.
- Daily home uses a consistent three-column grid, solid brand-color metric cards, aligned module cards, refined typography and responsive spacing. Technical controls remain in their existing collapsible section.
- Successful refreshes preserve the current workspace and open record; errors/success messages remain visible above drawers.
- The client/campaign label is explicitly internal. Municipal candidate/party branding remains separate.
- Campaign records now offer both archive/release (recoverable private data) and permanent erasure (no reactivation). Permanent erasure requires an exact municipality phrase and acknowledgment.

## Erasure boundary
Service-only radar_admin_purge_campaign_v1, verified active super_admin profile and app_metadata, reached through JWT/AAL2-protected radar-admin-api. Exact phrase ELIMINAR <municipality code> plus explicit acknowledgment required. Transactional locks protect campaign/municipality. Removes private campaign rows via foreign keys, memberships, contracts, client record, support sessions, scopes, RTD snapshots and related audit history. Unshared organization records are removed; auth users are retained, and memberships in other campaigns remain intact. Official publication records are unlinked from the customer, not deleted. data_vault is untouched.

The append-only audit trigger now recognizes only explicitly enumerated audit IDs authorized by the owner-only, RLS-closed erasure table in the same transaction. That table has no grants to public/anon/authenticated/service_role and the authorization is removed before completion. The new minimal deletion receipt holds operator, timestamp and municipality, no private before/after copy or campaign identifier. Ordinary audit mutations remain blocked.

External backups retain their independently configured retention. This feature does not claim to erase external backups or copies already downloaded. QA currently has only shared-resource/staging Storage buckets; migration to a backend with additional private attachments requires extending cleanup to those actual storage objects through the Storage API.

## Validation
- TypeScript and Vite build pass.
- 14 existing authentication/control-plane regressions pass.
- tests/sql/campaign-private-erasure.sql: rollback-only fixture test passed for confirmation/role denial, RPC grants, private data and access erasure, other-campaign isolation, exact checksums across all data_vault tables, retained append-only audit protection, permission cleanup and new assignment after erasure. No real client was deleted and no invitations sent.
- Security advisors: new private authorization table intentionally has RLS without client policies; no new public privilege warning. Existing warnings remain for protected authenticated RPCs and leaked-password protection configuration, outside this UI change.
- Full fictitious-client browser audit remains deferred as requested. The local visual-preview browser was blocked by its localhost network policy; no fixture page was included in the published bundle.
