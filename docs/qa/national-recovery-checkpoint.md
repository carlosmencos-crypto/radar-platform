# National QA recovery checkpoint

Recovery starts from published commit 4c375d42f63a4423f63bfe7352329e60a4de5ee7.
The unavailable local commits b0606ab and 1061521 have not been recovered or represented as recovered.

Verified Supabase state on 2026-09-22: 340 intelligence profiles, 340 active voter profiles,
340 TSE Agreement 327 bases, zero basis/profile municipality mismatches,
340 profiles with four historical councils and 340 documented 2023 mayors.

The five restored SQL files were read from supabase_migrations.schema_migrations;
they were not regenerated or reapplied. The bases fixture is a read-only export of
public municipal electoral bases. It contains no private campaign records.

This checkpoint restores official population binding, municipal slate slots including
substitutes, historical party colors, official council sources, notes and titular bar totals.

Validation: 79 tests; typecheck; lint (zero warnings/errors); XLSX; 340 smoke;
V70 parity smoke; production build. Local environment uses Node 24; CI uses Node 22.
Browser/authenticated QA remains pending. PDM semantic integration, full premium
section parity, fiscal benchmark and full final acceptance remain pending.

National QA must deploy only to its dedicated Cloudflare project. Its GitHub Pages
deploy job is skipped to avoid replacing the shared Pages/Golden destination.

## Published recovery checkpoints

- 3189d4b4f5c0d12b7c5bdb952a2dd90a59681c0e: official population, municipal offices and historical councils.
- 3243b22457db70b3fad4979c91b39fda1efa362d: QA source fixtures and directory candidate positions.
- Quality workflow 35779378801 passed for the second checkpoint, including four municipality browser suites (0509, 1208, 0101, 1901), both fullscreen modes and interactive workflows.

## Management recovery

Four additional RGM SQL migrations were recovered verbatim from migration history,
not reapplied. Read-only reconciliation: 340 municipal rows, 340 matching codes,
and six official dimensions in every row. The shared component now uses the existing
Golden benchmark layout with each municipality's six scores, ranks and departmental
and national averages. Missing or mismatched data remains unavailable.
Local validation after this change: 81 tests, lint and typecheck passed; build passed.
Browser CI assertions now require all six dimensions to be rendered.

## Access verification

A read-only SQL transaction under authenticated role and an existing authorized
platform-admin identity successfully called runtime V8 for 1208. Returned context and
profile codes were 1208, official population 17988, readiness INTELLIGENCE_READY;
serialized runtime contained neither 0509 nor Puerto San José. Transaction rolled back.
This checks database authorization, not browser login or campaign writes.
RLS verified on intelligence profiles, electoral bases and layer records: enabled,
no anon SELECT, authenticated SELECT governed by private.can_read_data_vault.
V8 still calls V7. No Supabase schema or data was changed during recovery.

The live Cloudflare QA site loads its login screen. This browser has no authenticated
session; a live authenticated visual tour remains pending. Do not report complete
visual parity or campaign persistence based on fixture tests.
PDM semantic integration, the remaining lower premium sections and private directory
coverage remain pending. No national private voter source was created or copied.

Advisors were executed: security reports leaked-password protection disabled and
informational RLS-without-policy notices on private staging tables. Performance
reports existing index/query-policy recommendations. No unrelated database settings
were changed. Remediation documentation:
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
