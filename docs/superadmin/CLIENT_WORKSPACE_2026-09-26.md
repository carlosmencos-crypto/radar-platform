# RADAR client workspace — QA delivery

## User decisions
- Daily operations separate from technical administration.
- Assign municipality + campaign name + administrator name/email + seat cap + end date in one form.
- 10 or 15 seats including the administrator; temporary fiscal access does not count.
- Activation link, not emailed passwords. Administrators can manage editor/viewer accounts from Configuration; RADAR controls the principal administrator and quota.
- Archive and revoke all campaign memberships when ending; preserve private data. Reactivation restores the campaign, with deliberate reassignment of users.
- Pulse: municipal, district, national list, presidency; no new Parlacen option.
- Shared resources and timed in-app notices; private demo reset.
- Customer audit with fictitious accounts explicitly deferred by user.

## Published in QA
New daily home and municipality cards with integrated client drawers, onboarding with generated identifiers and idempotency key, server-side seat cap, account listing, roles, revoke, contract release and reactivation. Existing technical modules are under a collapsible Technical administration section.
Resources upload to a private Storage bucket, draft/review/publish/archive, one municipality or all, version/category. Customer Resources reads authorized shared content and downloads under Storage policy.
Notices have title/body, scope and validity; recipients acknowledge once per user. In-app only; native push is not wired.
Demo reset only targets demo_vault contacts, activities, candidates, fiscales, incidents and RTD; logs private before-state for recovery and retains official data/members. Applies only to QA's demo schema, not the 340 production demo runtime.
Campaign team Edge API validates the current user and membership on every operation; only campaign administrators can manage editors/viewers. The principal admin cannot be removed through self service. Seats and current contract checked server-side.
Activation screen includes a first-steps guide. Custom welcome email template including the tutorial is not yet configured; default Auth invitation remains in use. Email delivery is unverified.

## Production blocker
Automatic browser approval rejected opening Hostinger hPanel, citing the previous QA-only restriction. No production mutation or global session revocation was made.
Prepared scripts are in release-landing/. They retain the currently deployed app entry, authenticate the landing modal against production Auth, share the existing session storage contract, verify identity + municipality authorization before loading protected routes, including demo links, and clear session on logout.
To publish after explicit production approval: re-check live app entry and SHA; add login-bridge.js after landing-assets/script.js; replace radar-app.html's entry script with access-gate.js. Do not deploy QA's older municipal app over production. The guard's app entry must be refreshed if another branch deploys in the meantime.
Public modal destination is /municipios for universal user, or a safe return route. Per-customer direct landing routing and full integration of QA contracts with production remain part of production promotion, not claimed here.

## Verification and limits
Typecheck and build passed; 11 existing control-plane tests passed. Transactional SQL smoke covered onboarding retry, quota rejection, notice delivery/acknowledgement, access revocation and reactivation. All smoke data rolled back, no emails sent.
Authenticated end-to-end customer audit and mailbox delivery deferred. No backup/restore guarantee added. RLS remains closed for admin tables; only service-role administrative RPCs, with authenticated scoped content readers and receipts.
Hostinger, production schema, real customer data and global logout were untouched.
