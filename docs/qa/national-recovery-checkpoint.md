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

## Nominal source recovered and reconciled (2026-09-22)

The user's original `Departamentos.zip` was recovered from the retained August 22
attachment. The earlier assumption that a national nominal source was unavailable
was incorrect. Source SHA-256:
`f40a375207e45335f3a9e5c2ca38dbc2a992b152c649f1ba2391f28ad75416e2`.

Full extraction independently reconciles the preserved pipeline report:
8,947,471 rows; 340 municipalities; 22 workbooks; 24 sheets; 11,013 duplicate
identity groups retained; 36 missing ages and 16 age-range flags. Sibinal has
9,406 nominal source records from 2023; San José has 36,878. These are distinct
from the active 2026 aggregate universe. Three spelling variants were reviewed
against matching department and municipality codes. No municipality was remapped
by fuzzy name matching. `national-nominal-source-report.json` contains aggregates
and provenance only. Private rows, original workbooks and import tokens are not
in this repository or the public build.

Three additive migrations were applied. New private staging tables have RLS enabled,
no anonymous/authenticated direct table access, and an inactive source by default.
New authenticated read RPCs require an active platform administrator plus
`private.can_read_data_vault` authorization for the requested municipality. Existing
campaign directory records, write RPCs, runtime V8/V7 and readiness classifications
are unchanged. QA can show the original nominal register in explicit read-only mode
after activation. Campaign editing remains on the existing campaign directory.

895 immutable import batches have hashes registered on the server. The temporary
ingest endpoint requires a strong expiring token and the exact registered payload
hash; its service RPC is unavailable to anon/authenticated. Before any private
records were transferred, automatic approval review rejected the first upload
because it requires explicit authorization to transfer names and DPI to this
Supabase destination. Verification after rejection: **0 staged records, 0 loaded
batches, 0 active sources**. The import job was closed immediately. Do not retry
upload or activate the source until the user explicitly authorizes that transfer.
There is no alternative upload path approved by this checkpoint.

Local validation: 84 tests, typecheck, lint (zero errors/warnings), XLSX, smoke 340,
V70 parity and build passed. Private live-data browsing and performance acceptance
remain pending the authorized import. Source recovery is complete; live directory
coverage is not yet complete. The universal platform-admin account was verified
read-only across all 340 municipal contexts. This is not a browser login test.

Advisors were executed: security reports leaked-password protection disabled and
informational RLS-without-policy notices on private staging tables. Performance
reports existing index/query-policy recommendations. No unrelated database settings
were changed. Remediation documentation:
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
