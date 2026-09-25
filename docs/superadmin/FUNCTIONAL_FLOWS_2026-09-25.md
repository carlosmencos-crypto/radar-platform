# Superadmin functional flows — QA, 25 September 2026

Environment: djldhumkmuppzxiaontb and radar-superadmin-v70-qa.netlify.app. No production changes.

## Implemented
- Users and permissions: select campaign, search members, invite by email, assign existing accounts without modifying their global role or password, change campaign role, remove campaign membership.
- Real campaigns: administrator, editor, viewer. Demo roles remain validated by the database but the invitation UI is restricted to real campaigns because QA demo routing uses a separate context. No invented commercial seat limit.
- Membership operations lock the campaign, validate the active superadmin, require a reason, audit before/after, and reject removal/demotion of the last active administrator. RPC callable only by service role; Edge also requires authenticated AAL2.
- Membership removal preserves campaign data and all other memberships. RLS checks membership immediately.
- First invitation: create password (12+ characters), then municipality route. Internal operator invitation still proceeds through administrative MFA.
- Password recovery from access page, with a generic response to avoid account enumeration.
- Municipal logout calls Supabase logout and clears local session/callback. Account name comes from authenticated identity, not a hardcoded person.
- Contract release: exact reference confirmation + reason; atomically end selected contract, pause linked campaign, remove its memberships, retain private data and audit the removed memberships. Other contracts are unaffected.
- Snapshot paginates account/member lists rather than silently truncating at 1,000.

## Verification
- Typecheck, production build, 11 control-plane tests passed.
- QA SQL transactions in tests/sql/campaign-member-management.sql and contract-release.sql passed and rolled back all fixtures.
- Tested role boundaries, permission revocation, last administrator guard, wrong confirmation rejection, contract ending, campaign retention, audit events, anonymous/authenticated RPC denial.
- Bundle audit passed: no secrets, private CampaignVault records or sensitive PII.
- Existing Edge version 3 matched local base before deployment; deployed with JWT verification.
- No invitations sent to real people. The deployed password recovery form was checked in the browser. SMTP delivery, invitation acceptance and authenticated visual end-to-end testing remain unverified. QA Auth redirect allowlist must accept the QA /acceso?next=... URLs.

## Remaining scope
- Demo reset needs a versioned initial dataset and clear handling of local browser state before enabling restore; no destructive reset shipped.
- Backups need a verified schedule, Storage-object coverage and an actual restore test. This release does not claim backup coverage.
- Resources upload, timed announcements/push and realtime RTD vote/acta consolidation are not implemented in this release.
- Production landing uses a separate Supabase project; QA accounts cannot authenticate there. Promotion requires the existing production release process.
- No global account deletion: removing membership is the supported action that preserves history.
- Supabase advisor existing warnings: leaked-password protection disabled; authorized pulse SECURITY DEFINER RPC needs its existing authorization reviewed. Closed admin tables intentionally have RLS with no client policies.
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
