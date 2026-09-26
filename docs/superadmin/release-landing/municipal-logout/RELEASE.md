# Municipal logout correction — 2026-09-26

User clarified that the logout problem is in the municipal client on Hostinger, not the QA superadmin.

Production repository commit: 577f9890e225875007cd1f5960ce85f775ee7041 on deploy-hostinger. Changes are limited to radar-app.html, the legacy access-gate filename, and new content-versioned assets/radar-access-gate-61c30bcb9128.js. Approved application bundle, municipal data, landing layout, authentication and backend authorization remain unchanged.

Logout now removes local session/callback/persistence state synchronously, sends best-effort revocation via keepalive, and navigates immediately to /. It does not await a potentially slow revoke request or enter the login page. Duplicate logout clicks and pending gate login redirects are guarded. The module filename changes to invalidate cached gate code. Existing open tabs must reload once to pick up the new document/module.

Six local VM regressions pass: account-menu link, settings button, demo path, legacy signout link, unauthenticated access guard and unrelated-button behavior. Revocation stays unresolved in the navigation tests to reproduce the latency/race case.

Publishing the deploy branch was followed by the live files already matching this new release when the guarded SSH deployment ran. Its old-hash guard correctly aborted without writes (run 36226326494). A subsequent read-only SSH inspection (36226372684) confirmed that the live legacy gate and HTML had the exact new hashes. Do not repeat the publishing mutation or assume that a failed old-hash guard means the release is absent; compare the intended new hashes first. The original release files remain recoverable from the parent Git commit. No new custom SSH backup was created by the aborted workflow.

Expected hashes:
- Both gate filenames: 61c30bcb9128972f410a0578fa546c774448b5180ccc0bb60c35d27bf0ad3859
- radar-app.html: 17eea95c72a58e3860e9f33c71df45cf2b215a4d5e85b693acbadcca0fb60854

Browser testing with the user's actual authenticated session remains for user confirmation. No passwords, tokens or sessions were requested or exposed; no campaign data was changed.

Final read-only verification run 36226422650 completed successfully, asserting all three published file hashes. The deployment workflow was then restored to manual read-only preflight.
