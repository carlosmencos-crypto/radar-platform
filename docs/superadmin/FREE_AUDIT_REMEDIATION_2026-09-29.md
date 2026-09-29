# Free audit remediation 2026-09-29

Base source: 93888ae9e1fc7a00294b2441eaf5f217a5dadb44.
Fiscal source imported from the connected project's deployed fiscal-api version 3.
No production deployment or schema mutation is included in this remediation branch.

## Changes

- Update smoke assertions to the approved admin gate, personalized account, resources and Groq flows. Static hashes for global.css/index.html now represent the approved base release; files themselves were not changed.
- Include the integration branch in the quality workflow push filter. Branch protection and deploy dependency on this check still require verification; a workflow trigger alone is not a release gate.
- Fiscal evidence uses a deterministic path containing subject, assignment and SHA-256 instead of a fresh UUID per retry. Existing UNIQUE(object_path) arbitrates concurrent inserts.
- Recover an already committed evidence row after a unique conflict. Do not remove shared objects on insert failures: retries repair interrupted inserts. Orphan reconciliation remains a separate operational requirement.
- Enforce a bounded multipart body before parsing, with a 12 MiB file limit and 256 KiB form overhead.
- Resolve incident idempotency conflicts by returning the existing authorized incident; unrelated assignments remain denied.

## Executed verification

- npm test: 155 passed, 0 failed (Node 24.19.0; project declares Node 22).
- npm run smoke:340: 340 municipalities, 5,780 pairs passed.
- npm run smoke-v70-parity: 11 routes passed.
- npm run typecheck: passed (frontend scope, not Deno backend type validation).
- npm run lint: 0 errors, 2 pre-existing warnings.
- node scripts/fiscal-retry-simulation.mjs: 122,135 synthetic evidence identities; 366,405 attempts; 122,135 accepted, 244,270 retries neutralized.
- Dedicated helper tests: 100 concurrent attempts, interrupted persistence recovery, denied upload, declared/streamed body size rejection, valid multipart content.

The simulation uses in-memory storage doubles. It is neither a PostgreSQL concurrency test nor a network/load/throughput benchmark. No real acta bytes, accounts, mail, OCR requests or production writes were generated.

## Before deployment

1. Re-fetch fiscal-api and compare against deployed version 3; reconcile any work from the fiscal portal branch rather than replacing it.
2. Run Deno type checks and integration tests against an isolated Supabase instance. This execution environment has no Docker, PostgreSQL or Deno installed.
3. Test the full fiscal upload handler, concurrent PostgreSQL conflicts and actual Storage duplicate response, plus retry after network interruption. Existing historical UUID uploads are not retroactively deduplicated.
4. Verify same file in different subjects/campaigns remains independent. Submitted RTD remains immutable.
5. Exercise role/session/revocation matrix and backup/restore of both database and objects with synthetic fixtures locally.
6. Run the CI suite on Node 22; confirm included Actions quota before triggering large workflows under the no-additional-spend constraint.
7. Only after successful verification publish the fiscal function. Preserve existing custom-auth verify_jwt=false setting; do not weaken requireSession.

No restoration, live email delivery or production-sized load capacity is certified by this branch.
