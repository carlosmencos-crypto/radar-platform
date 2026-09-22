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

Five additive migrations have now been applied for the nominal recovery and query estimate correction. New private staging tables have RLS enabled,
no anonymous/authenticated direct table access, and an inactive source by default.
New authenticated read RPCs require an active platform administrator plus
`private.can_read_data_vault` authorization for the requested municipality. Existing
campaign directory records, write RPCs, runtime V8/V7 and readiness classifications
are unchanged. QA can show the original nominal register in explicit read-only mode
after activation. Campaign editing remains on the existing campaign directory.

895 immutable import batches have hashes registered on the server. The temporary
ingest endpoint requires a strong expiring token and the exact registered payload
hash; its service RPC is unavailable to anon/authenticated.

The initial automatic approval rejection was resolved by the user's subsequent
explicit authorization to execute this transfer and the required loads. The import
job was reopened for this private Supabase destination. At 2026-09-22 22:24 UTC,
more than 1.7 million records had server acknowledgements. The source remains
inactive until all 895 batches and all 340 municipal counts reconcile. Do not infer
completion from this intermediate checkpoint; query the manifest on resume.

Transport uses bounded gzip requests with up to three independently validated,
transactional batches. A repeated acknowledged batch returns its receipt without
reinserting records. Six concurrent requests encountered SQLSTATE 57014; the active
loader uses two workers. Incomplete receipts never mark a local batch complete.
The prepared activation transaction independently checks the full manifest, total,
municipal identity/counts, retained duplicate groups and age quality flags before
building summaries, closing ingestion and activating the source atomically.

The authenticated browser reproduced a runtime 500. EXPLAIN showed the default
1000-row context estimate caused a nationwide layer scan before municipal filtering.
Only the public context function's ROWS estimate was changed to 1; no function body,
permission or V7 dependency was replaced. The resulting plan uses the existing
municipal index. Runtime JSON hashes for 1208, 0509, 0101 and 1901 were unchanged.
Sibinal subsequently opened in an authenticated browser without a runtime-load error.
After query plans refreshed, authenticated V8 for Sibinal measured 553.52 ms
(compared with 4502.64 ms before the estimate correction). Final nationwide
performance acceptance remains pending.

Privileged nominal implementations now reside in the private schema behind public
SECURITY INVOKER wrappers. Active-admin, municipal authorization and source-active
checks remain inside the private functions. No anonymous execution was granted.

Local validation: 85 tests (including four synthetic transport checks), typecheck, lint (zero errors/warnings), XLSX, smoke 340,
V70 parity and build passed. Final private browsing, persistence, isolation and
performance acceptance remain pending full activation. Universal admin municipal
contexts were verified for all 340 municipalities; the live browser also authenticated.

Advisors were executed: security reports leaked-password protection disabled and
informational RLS-without-policy notices on private staging tables. Performance
reports existing index/query-policy recommendations. No unrelated database settings
were changed. Remediation documentation:
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Live browser follow-up

Checkpoint `e631b1a45187bc87524480fef20310fa72012bbf` was published only on QA.
Quality run 35792637386 passed; Cloudflare Pages succeeded; shared Pages deploy
remained skipped. The live authenticated Sibinal start and intelligence routes load.
Native fullscreen was denied by the browser with `TypeError: not granted`. A shared
viewport fallback now handles that rejection, unsupported browsers, button exit and
Escape without changing the municipality or map contents. CI checks both native
and denied-native paths for both maps across the four existing municipal samples.

A sixth migration sets a bounded 20-second timeout only on the temporary service-only
import RPC. Six concurrent uploads caused cancellations; bounded transport groups
run with at most three concurrent requests. Interactive role limits are unchanged.
The source is still inactive until complete independent reconciliation.

## Import paused by renewed automatic approval rejection

At 2026-09-22 22:38 UTC, automatic review rejected the resumed upload again,
stating that broad load authorization did not explicitly authorize disclosure of
names and DPI to this Supabase destination. No alternative transfer was attempted.
The job was closed immediately. Server manifest: **280/895 loaded batches,
2,800,000 acknowledged rows**, source still inactive. Query actual state before
resuming; never infer completion or rebuild the source. Remaining expected rows:
6,147,471. Resumption requires explicit destination-specific consent for original
names and DPI to the private project `xxobbhnhxhcjkdxmjmwj`.
The previous explicit consent resolved the first rejection, but did not prevent this
renewed review block. Preserve both the staged rows and immutable batch manifest.

The user subsequently provided explicit consent again: "la autorizacion es expresa
para subir los datos de nombres y dpi" in direct response to the named private
Supabase destination. Import resumed at 22:43 UTC from retained batches; at 22:44 UTC
298 batches / 2,980,000 records were confirmed. This supersedes the preceding paused
state. Never re-request the same authorization without a new specific review block.

Native-denial visual checks confirmed both live map fallbacks. Follow-up fixes reset
the enclosing shell zoom only while expanded and restore the page scroll on exit.
The CI fallback reentry check now waits for the inactive button state before clicking
again, avoiding the React layout transition. Final CI result must be checked for the
latest checkpoint, rather than inferred from prior passing runs.

## Checkpoint after capacity recovery — 2026-09-22 23:07 UTC

Published QA commit `5d32dcd05b7ee55c4a2c48e55eabf6970550602e` passed
Quality run 35794355435 and Cloudflare Pages. Native fullscreen and denied-native
fallback checks passed across 0509, 1208, 0101 and 1901, with interaction checks.
The live authenticated fallback also covered viewport dimensions and Escape.

The private import stopped safely after PGRST002 and SQLSTATE 53100. Reconciliation
found 418 committed batches, including transactions completed after the first
failure response. Supabase's infrastructure dashboard subsequently showed 8 GB
provisioned, 1.93 GB used and spend cap enabled. No billing, compute or disk setting
was changed by this task. Upload resumed only after capacity was verified, first
with one worker and then three bounded workers. At 23:07 UTC the server confirmed
**476/895 batches**, with database size 1413 MB. These are intermediate counts;
query the manifest on resume. Source remains inactive. Explicit names/DPI upload
consent remains valid; no renewed approval block is present.

A measured name search in Guatemala scanned 816,683 records and took 47 seconds
while loading. Migrations `index_nominal_name_search` and
`index_nominal_identity_search` are prepared but **not yet applied**: build them
after import, before activation. They preserve substring matching, municipal scope
and private permissions. QA's nominal name input waits for at least three letters;
campaign input behavior remains unchanged. Short-query guidance clears when a
cached valid result is restored.

Transport now retries the transient schema-cache restart code with the existing
bounded retry policy. Capacity errors still stop immediately, without receipts or
blind retries. Six synthetic transport scenarios pass, including these two cases.
Lint (zero warnings), typecheck and all 85 tests pass after this adjustment.
Full source reconciliation, activation, live nominal browsing/search/detail/DPI
isolation, final advisors and the final build/smokes remain pending.
