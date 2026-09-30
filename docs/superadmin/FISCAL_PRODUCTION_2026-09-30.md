# Fiscal portal production configuration

Canonical production URL: https://radargt.wowlatam.com/fiscales/

`.env.production` supplies the existing `VITE_FISCAL_PORTAL_URL` configuration to both municipal access generation and the superadmin fiscal portal. Keep one production URL; no additional fiscal backend, data store or functional implementation is introduced.

The approved main application source is `fb82c56aa96118f5a4726987fd505a4a1b84da3f`; the fiscal artifact is `9b6f24e8226e1d84d05a977a39b36871f8687e98`. Recovery workflow `ops/fiscal-recovery-20260930` changes only the configured URL and static resource paths, scopes the fiscal manifest and service worker to `/fiscales/`, and preserves the main landing, municipal design and existing API in project `xxobbhnhxhcjkdxmjmwj`.

Production publication: GitHub Actions run 36690513458 succeeded. Server-side hashes for all 44 release files matched. Public verification matched all 12 main manifest files and 34 fiscal files byte for byte; four raster images are transformed by the delivery layer, with matching dimensions and identical PNG pixels. The live fiscal access form rendered successfully. Root landing remained byte-identical. No authenticated fiscal-to-municipal-to-superadmin browser round trip has been verified by this recovery.

The dedicated `fiscales.wowlatam.com` domain is not provisioned in this Hostinger account and has no DNS record. Keep the working canonical URL until provisioning and TLS have been separately verified. The QA hostname remains a test environment and must not replace production links.

For future releases, build main production with the checked-in `VITE_FISCAL_PORTAL_URL` value; preserve the `/fiscales/` deployment. The fiscal source must continue to be built/rebased for that base path, including assets, OCR resources, PWA scope and service-worker scope. Preserve `no-store` headers for the fiscal HTML, runtime config and service worker. The recovery preparation and backup/rollback workflow is in the operations branch above. No layout or operational features were rewritten.

Database recovery invalidates only the two reviewed obsolete demo fiscal assignments whose source was removed by a subsequent `RESET_DEMO`. All previous flags are retained in private audit entries under `RECOVERY_REVOKE_RESET_DEMO_FISCAL`. RTD folios, votes, incidents and evidence are preserved; real assignments are outside the repair scope. The transaction was rehearsed with rollback before applying. Do not replay a broad reset or recreate deleted demo source records to repair an obsolete access.
