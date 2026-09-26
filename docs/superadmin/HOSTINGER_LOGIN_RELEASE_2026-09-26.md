# Hostinger login release — 2026-09-26

User explicitly authorized production publication and accepted trust on first use after matching the ED25519 fingerprint observed on their Mac and GitHub Actions. Pinned fingerprint: SHA256:mNDWDdfOkgNeXMA6wNx/QkX81OagTOj3lq1aej7eVkg. StrictHostKeyChecking=yes; batch public-key authentication succeeded. Credentials remain GitHub Actions secrets.

Production root: ~/domains/radargt.wowlatam.com/public_html. Backup: ~/radar-deploy-backups/login-20260926T031139Z, outside webroot, including manifest and original HTML. Changed only index.html, radar-app.html, assets/radar-access-gate-20260926.js, landing-assets/radar-login-20260926.js. Existing municipal bundle assets/index-f2ULqrmd.js and styles retained. No production database changes or session revocation.

Successful deployment run: https://github.com/carlosmencos-crypto/radar-platform/actions/runs/36214035873. Matching deploy-hostinger commit: c695dbee889ac6bcbebe7d39a1ad98c1ed028997.

Verified remotely written hashes and browser redirects for unauthenticated /0101d and /municipio/0509 to landing login modal with preserved next path. Local gate checks cover anonymous, denied, authorized and demo route_kind handling. Actual universal-account password login/logout remains to be checked by the user. Full fictitious-client isolation audit remains deferred. Frontend entry gate complements existing backend authorization; this is not a new backend security audit.

The one-time publishing workflow was replaced with a manual read-only SSH check to avoid accidental repeat writes. Future changes require constructing a targeted release with expected live hashes and backups. The QA admin functionality has not been promoted into the municipal production bundle.
