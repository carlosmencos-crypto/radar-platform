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

## Import checkpoint — 2026-09-22 23:28 UTC

QA `e7931f87bea6d54e625bd7cf19a0ed46422fffe8` passed Quality run 35796021996
and Cloudflare Pages; shared Pages deploy remained skipped. All local required
checks also passed (lint, typecheck, 85 tests, XLSX, smoke 340, V70 parity, build).
The existing 0509 campaign directory still renders 25 rows per page, 36,878 total
records and 148 communities in the authenticated browser.

Two bounded 90-batch windows completed successfully with two workers after a
transient network interruption. **734/895 batches / 7,340,000 records** are now
acknowledged. The next window is running. No source activation has occurred.
No billing, compute, spend-cap, Golden, main or production-host change was made.
The remaining source count is 1,607,471; always query current server state on resume.

The prepared identity index now starts with source_id, allowing source-scoped
DPI grouping without fetching every heap row solely to filter its source. Both
new indexes remain pending until all imports finish. Activation has a transaction-
local bounded 10-minute timeout and 32 MB work memory for the full reconciliation;
interactive limits remain unchanged. `verify-national-register-runtime.sql` is
prepared for authenticated checks of all 340 availability scopes plus four sampled
directories, pagination, masked details, name/DPI lookup and cross-municipal denial.
It returns no personal values and is executed in a rollback transaction after
activation. These post-load tests have not yet run.

## National nominal source activated — 2026-09-23 00:06 UTC

This checkpoint supersedes every intermediate import count and pending activation
status above. All **895/895 batches and 8,947,471 original records** are loaded.
Activation reconciled all **340 municipal totals** against the retained original
source, verified municipal foreign keys and zero cross-municipal associations,
and atomically closed the import job. The source is active. Its 26,011 community
labels belong to the nominal directory, not the separate public community catalog.
All 11,013 duplicate-DPI groups, 36 missing ages and 16 age outliers were preserved;
no person was invented or removed to make counts agree. The source is **2023**, with
age explicitly estimated to 2026; it is not the active TSE 2026 aggregate register.

Both prepared search indexes are applied, valid and analyzed. The broad Guatemala
name search took 18.4 seconds with lossy bitmaps; scoped 32 MB work memory reduced
the measured authenticated query to 4.2 seconds. Migration
`bound_nominal_search_memory` changes only the private directory function. Global
memory, interactive timeouts, billing and compute settings remain unchanged. One
initial live broad-name request still timed out; subsequent MARI and MAR requests
succeeded with 96,872 and 162,355 matches. Failed queries now show an unavailable
total and explicit error state instead of presenting zero records/no matches.

Authenticated contract verification passed for all 340 availability scopes and
four sampled directories (0101, 0509, 1208, 1901): exact counts, disjoint pages,
municipal binding, masked DPI, read-only detail, name/DPI searches, audited reveal
and cross-municipal denial. The SQL test returned no personal values and rolled
back its reveal audit. Separate anonymous and unauthorized-user denial checks
passed. All five national tables retain RLS and deny direct SELECT to anon and
authenticated; authorized private functions enforce active administrator status
and `private.can_read_data_vault`.

Live QA with the existing universal administrator verified:

| Municipality | Directory total | Rows per page | Source behavior |
| --- | ---: | ---: | --- |
| Guatemala 0101 | 816,683 | 25 | National, read only; name search verified |
| San José 0509 | 36,878 | 25 | Existing campaign retained |
| Sibinal 1208 | 9,406 | 25 | National, read only; detail and audited DPI reveal |
| Zacapa 1901 | 39,798 | 25 | National, read only |

No private rows, names, DPI, credentials or import tokens are in this checkpoint.
National consultation does not create campaign associations or claim CLIENT_READY.
Existing 0509 campaign editing is preserved. Prior native/fallback fullscreen and
Escape checks remain passed for the four-municipality sample.

After the final UI adjustment, lint (zero errors/warnings), typecheck, 85 tests,
six synthetic transport scenarios, XLSX, smoke:340 (5,780 pairs, zero crosses),
V70 parity (11 routes and Golden lock) and build all passed. The existing bundle
size warning remains. Final published SHA and its CI/deployment must be verified
after this checkpoint is pushed only to `qa/v70-national-client-readiness`.

Advisors rerun at 00:05 UTC: 17 informational closed-RLS tables, one existing
[leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
15 informational [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
14 informational unused indexes, 18 existing
[multiple-permissive-policy warnings](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies),
and one informational Auth connection allocation notice. No unrelated policy or
Auth setting was changed. This closes nominal import/access verification, not all
outstanding historical/PDM content and premium visual refinements.

## 2026-09-23 — complete contact sheets and public municipal detail

Base: `ad6cdb944402ae87f53c2ab6934f2ef82a7c6fb7`, QA branch only.

- Restored the pilot contact form for the national directory: photo, optional front/back document images, phones, address, responsible person, manually provided fields, notes and contact history. An owner-scoped private overlay preserves the original source. Existing campaign editing RPCs are unchanged; no campaigns were fabricated and no source records were reloaded or modified.
- Applied migrations `add_private_contact_workspace`, `index_private_contact_municipality`, `add_fast_contact_directory_pages`. Public endpoints are security invoker; private helpers verify the active actor, municipal scope, source activation and exact record. Tables are RLS protected and unavailable to anon/direct authenticated table reads.
- `supabase/tests/private-contact-workspace.sql` passed with authenticated role: save/reopen, photo/document fields, history, saved-field filtering, fast-page filtering, empty pages, denied cross-municipal writes, unauthorized actor, anon, unsafe image schemes and source immutability. Test annotations are rolled back.
- Search first-page rendering no longer waits for an exact filtered count. Extra-row sentinel determines Next availability; unknown totals are explicit, never estimated. Exact count is user-requested. Measured broad capital search `MAR`: previous combined count/page 14,559 ms (cold); new authorized first page 58.435 ms (warm), database timings only, not a network SLA. Obsolete browser requests are aborted and repeated pages remain cached.
- Electoral adapter accepts nested matrix objects, singleton-wrapped objects and flat row-major matrices, with dimensions, integer/nonnegative votes, totals and municipal scope checked. Complete party rankings are retained. Local leader/runner/margin derive from reconciled center votes; municipal leader summary fields are not treated as the local winner.
- Six checked-in PUBLIC aggregate fixtures (0101,0301,0509,0608,1208,1901) exercise all five election types. No individual contact data is in these fixtures or the public bundle. National source has results for 338 municipalities; 0104 and 1104 still lack center-result layers and must remain explicit missing-source states.
- Party palettes use the complete set of parties, preserving pilot colors and assigning distinct remaining swatches. Exact names/ranks/votes remain visible.
- Municipal photo: compact shared cards, 10 census household indicators, source/year, urban/rural service baseline and municipal planning document link. Fiscal view: 2016–2025 annual income/budget/accrued/paid/execution table; procurement periods shown separately. Missing data is not converted to zero. Planning PDFs are linked; deeper semantic extraction for all 340 has NOT been claimed complete.
- Local: 97/97 tests PASS; lint zero warnings/errors; typecheck PASS; XLSX PASS; 340 municipal smoke + V70 parity PASS; production build PASS; bundle security and 340 deep-link checks PASS.
- Supabase advisors: no new security warning; preexisting leaked-password-protection warning remains. Newly detected municipal FK index was added; remaining workspace unused-index notices are expected for new tables. Existing unrelated permissive-policy notices were not modified.
- Browser limitation in this session: local preview blocked by the cloud browser; deployed QA requires fresh sign-in. CI render fixtures now include actual public layers and exercise national contact-sheet save/reopen. CI results and screenshots must be reviewed before final visual signoff.

### Visual review follow-up

Published checkpoint `951caed989ae249b62fd6923efba2c5fa9ddd001`: Quality run `35811189569`, Deploy preview run `35811189661` and Cloudflare Pages check all succeeded. CI covered 44 route renders (0509, 1208, 0101, 1901), native/fallback fullscreen and Escape, exports, navigation, and national contact profile save/reopen. Downloaded and inspected the 0509/1208 screenshots.

Visual inspection found inherited agenda form styles restricting the contact sheet to 680 px inside its wider dialog. Scoped adapter overrides restore full available width, remove nested scrolling/shadow, and span document fields across the form. The render gate now measures actual form/document width to detect recurrence. Public source periods use readable Spanish directory labels; indicator/fiscal anchors leave room for the fixed toolbar. Local lint, typecheck, 97 tests, XLSX, national smoke, V70 parity, build and bundle audit passed again. A real authenticated browser walkthrough still requires a fresh QA sign-in; fixture-based CI is not represented as that walkthrough.

Document preview follow-up: uploaded document images now open inside the authorized contact sheet using an expandable preview. This avoids browser restrictions on opening data URLs in a new tab. The render test opens a synthetic 1-pixel image and verifies decoding; no real identity-document fixture is published.

### User-approved visual correction — screenshot 1

Carlos explicitly identified screenshot 1 (0301 contact sheet) as the approved design. The full-width form change in `1fd21349cb4fe6627a574022bd8144aa932692a0` was therefore not an approved redesign. Removed the three adapter overrides affecting form/history width, padding, shadow and document-grid span, restoring the existing canonical pilot CSS for every municipality. Restored the Campaign Vault private label. Kept saved fields, owner-scoped persistence, image preview, faster search and public municipal corrections. The CI layout assertion now checks the approved 680px card, 24px padding, shadow and internal scrolling instead of rewarding full-width expansion. This entry supersedes the earlier layout interpretation.

Approved controls: responsible person uses the pilot select in all municipal directories; national manual names remain available through “Agregar responsable…”. Both map and Agenda actions remain visible; Agenda is disabled with an explicit campaign requirement when no campaign is linked. No campaign was created and no permission changed.

### 2026-09-23 — unordered directory names

- Applied migration `20260923042507_contact_directory_unordered_name_search`:
  the shared authorized national page and exact count now require all literal
  name fragments in any order. Municipal source and owner restrictions remain.
- Existing trigram index is used for the first two longest fragments, with all
  additional fragments checked. No national private source rows were changed.
- Authenticated SQL checks passed for 0101, 0509 and 1208: reversed order,
  spacing/case, count/page consistency, pagination, literal wildcard handling,
  invalid municipality denial and no anonymous execution.
- Measured database execution for the 0101 two-token sample: 127.762 ms.
  This is one measurement, not an end-to-end latency guarantee.
- Frontend hint updated locally; full QA release remains pending other work.

### 2026-09-23 — continuation recovered; nationwide fiscal coverage and search parity

- Recovered the intact workspace at `/workspace/scratch/8fbec0f80899/radar-national-recovery`, branch `qa/v70-national-client-readiness`. Local `b05621a` and remote `726804b` had identical trees; merged their histories without discarding either checkpoint. Golden/main/Hostinger remain untouched.
- User reconfirmed that all changes must apply across all 340 municipalities and retain the approved premium experience. No municipality-specific UI patch is acceptable.
- Shared fiscal indicator now displays percentage and unique assigned JRV / municipal total. It validates center/range membership, deduplicates tables, binds records to the current campaign and distinguishes unavailable/loading/no-campaign states from zero assignments.
- Fresh read-only Supabase verification: 340 municipal center indexes, 3,445 centers, zero missing indexes and zero municipality/source-code mismatches. Public aggregate count/range fixture only: `scripts/fixtures/public-national-jrv-coverage.json`. Tests exercise empty/full/duplicate/other-campaign assignments against every municipality, including 103 JRV for 0509 and 27 for 1208. No private assignment or voter rows exported.
- Found and fixed a remaining search discrepancy: campaign-bound directory RPCs still used the previous phrase/fuzzy predicate. Applied `20260923045130_campaign_directory_unordered_name_search` to both existing signatures. Literal fragments in any order now match the national path. Stable normalized ranking preserves reordered-query pagination. Municipal authorization, membership, invoker security, grants, filters and original records are preserved.
- Authenticated SQL verification passed before and after applying the migration: actual campaign search, reversed/comma/case variants, both signatures, literal wildcards, unauthorized actor and anonymous denial. Only result booleans were returned; verification transactions rolled back.
- Local verification: 106/106 tests, lint (zero warnings/errors), typecheck, XLSX, 340/340 smoke (5,780 pairs; zero crossings), V70 parity and production build/bundle audit passed. Build retains the known large-chunk warning. Browser gate now checks the fiscal coverage display and captures it in each of the four existing municipality runs. Final SHA CI/deploy still to be verified after publication.
- Security advisor shows the same preexisting leaked-password-protection warning and 17 informational closed-RLS notices; no new security finding. Existing warning reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No unrelated Auth setting changed.
- Remaining acceptance limits: PDM/PDM-OT deep semantic homologation is incomplete, center election results remain unavailable for 0104 and 1104, real-session final walkthrough is outstanding, and campaigns must be genuinely authorized. Source documents are not to be re-extracted by restarting the closed extraction task. This checkpoint does not claim universal CLIENT_READY or zero possible defects.

#### Published verification and community-filter follow-up

- Exact published code SHA `b7284890549ca51811585e26512c34e6d7f8e7fc`: Quality run `35820234926` succeeded, all 44 route renders/four municipal suites and interactive checks succeeded, Deploy preview `35820234936` succeeded, Cloudflare Pages check `107050436276` succeeded. This closes the release verification for fiscal coverage, shared removable logo and both unordered-name search paths.
- User reported HTTP 500 on `/municipio/0101/directorio?community=COLONIA%20MIRAFLORES`, with stale overall count and pagination remaining visible. The live review browser is at the login screen; no authenticated REST reproduction was claimed. Authenticated SQL returned matching rows but measured 3049.576 ms warm, with 22,489 buffer hits. The table lacked a community lookup index and the API role has an 8-second statement timeout.
- Applied `20260923045849_index_national_directory_community`, indexing `(municipality_id, community, id)` across the immutable national source. Source records, security, timeouts and billing settings were not changed. The same measured SQL call then took 160.455 ms. These are individual database measurements, not network SLAs.
- `supabase/tests/community-directory.sql` passed authenticated community queries for 340/340 municipalities, checking every returned row's municipality/community. Maximum sampled query time was 107.565 ms. Miraflores returned 25 rows on its first page; second page was disjoint; exact count and nonexistent-community behavior passed. Only aggregate verification results were returned and the test transaction rolled back.
- Shared directory clears stale rows/count/pagination on a new request and on failure, disables navigation on errors, uses a user-facing failure message and offers retry. Browser CI now simulates a community query 500 after successful results, checks stale-state removal and retries successfully for the three national directory samples. Its new published SHA must be checked after release; do not infer it from b728489.
- Security advisor remains unchanged. Broader PDM semantic and authenticated final-review limits above still apply. Do not restart unrelated paused extraction/audit tasks.

### 2026-09-23 — reuse of previously organized Vault products

User authorized completing the remaining national stage and explicitly requested
checking prior Vault work before repeating document processing. The current
ETAPA2 control and Master Sources confirm 335 inventoried PDFs, five missing
municipal documents, and earlier validated structured products. Inventory and
DR-102 lexical signals are not semantic acceptance.

Recovered without modifying or re-extracting original documents:

- Poverty 2023 DASHBOARD_READY (`1ZiPFKH3sHWjKqgI7Hpzv4uuQw1PKIpac`), validated
  against `1w14I2Or93U86ozKSaQBLToiS2scRo-SR`: all 340 municipalities, 23
  unpublished extreme-poverty estimates preserved as null, modeled municipal
  estimates never attributed to individuals, communities or JRV.
- PDM priorities DASHBOARD_READY (`19lzoDvf9xQ8256mRGk7mqj-wsIEng2b9`), validation
  `14ingI8BGz3ADPJonfN3b2sZH89NBbYKE`: 36 page-referenced priorities for
  0501/0502/0513. Documented area/population conflicts were not imported as facts.
- PDM infrastructure CLEAN (`17C8sS9MS0o1qdbdZeu6-KNaYa73gydmp`), validation
  `1N5a-CjAr1lfEfltxQoEX-l3XN2yivULU`: 12 baseline/target indicators for 0509.
  Historical years, source zeros, unknown years/magnitudes, rate-unit caveats,
  and water index 0.178 (not household coverage) remain explicit.

Four recover_validated_municipal_public_depth migrations were applied to the
existing municipality intelligence profiles. Read-back: 340 profiles, zero
municipal crossings, 23 null extreme estimates, five missing PDM documents,
128 unresolved catalog discrepancies, 36 priorities, 12 indicators and only
four PARTIAL_VALIDATED_CONTENT municipalities. Readiness flags and source
records were not changed; existing authorization and RLS remain in force.

One shared validator, municipal display and printable report consume these
products for all municipalities. Nested wrong-code/source evidence fails closed.
The recovery script, public fixture and SQL provide reproducible provenance;
readable-export hashes identify the inputs, not the original binary hashes.

Local checks: 111 tests pass, typecheck/build pass, lint clean, XLSX/national
smoke/parity pass; bundle audit finds no secrets, source maps or private data.
The known bundle size warning remains. Local Chrome download failed with a
proxy timeout, so desktop/mobile public-content screenshots and report PDFs
are required in the pushed SHA's CI artifacts before visual signoff.

This is a recovered integration increment, not national stage closure. Deep PDM
review remains incomplete; missing documents (0101/0115/0116/0201/1333), source
conflicts and missing center results (0104/1104) are unresolved. No Hostinger,
Golden, main, mobile, fiscal portal, superadministrator or paused extraction
lane was changed. Next publication target is only the existing national QA.

## 2026-09-23 · Reused INE EGM 2024 national products

The prior publication c29c2c1b03e46b1986f15dfc92a9db88635e3742 passed
Quality 35907069609 and Deploy Preview 35907069711. Cloudflare published
https://b580e8b1.radar-v70-national-qa.pages.dev for that SHA. Its recovered
content report was reviewed as six correctly numbered PDF pages, not five
numbered sheets overflowing onto six physical pages.

The Vault already contained GT_INE_2024_EGM_340_CLEAN_v1.xlsx and its validation
workbook. The shared security panel had not consumed them. This increment
reuses their 23 indicator rows per municipality, with original units, year,
source sheet/table/row, readable-export SHA256 and validation links. It does
not use cached Dashboard Ready rate formulas: some turned missing counts
into zero. Population projections remain distinct from electoral counts;
transit affected people are not accident counts, phone lines are not internet
coverage, and these historical finance values do not replace MINFIN.

Four transactional migrations applied to the existing authorized profiles:
340 municipalities, 7,820 indicators, 6,571 numeric records, 1,249 null values,
zero crossed municipality codes, verified by a fresh aggregate SQL query.
The 27 absent-table values and the three wrong-municipality transit values
for 1201 remain null. The age/population source inconsistency for 1002 stays
explicit. Readiness, RLS and original Vault products remain unchanged.

Shared UI and municipio-360 report now consume the same source-bound contract.
Tests execute the real shared municipal model for all 340 profiles, reject
foreign runtime/layer codes and preserve null strategy references when the
required election evidence is absent. This checks isolation, not the validity
of a strategic prediction. Local tests: 115 passed; typecheck, build, lint,
national smoke, parity and bundle security audit passed. The existing large
bundle warning remains. New EGM desktop/mobile and actual PDF-page gates are
included in CI; publication/visual evidence for this increment is pending.

National acceptance remains OPEN: deep PDM semantic review is not complete;
five missing documents, 128 catalog discrepancies and center-result sources
0104/1104 are unresolved. Neither these tests nor the sample visual routes
constitute integral visual/functional acceptance for all 340 municipalities.

## 2026-09-23 · Direct review of historical plan diagnoses

EGM publication f6902d19a79fc4dc80030ef9260ee75907bc39b1 completed Quality
35909291434 successfully (115 tests and the four municipal render samples),
Deploy Preview 35909291488 successfully, and Cloudflare published the same SHA:
https://4a02de96.radar-v70-national-qa.pages.dev. Reviewed the 0509 mobile EGM
capture and generated PDF: ten physical pages, with readable administrative
records. Found a site-wide footer style leaking into report pages; this increment
removes that inherited background/padding on white report pages so page numbers
are legible. The frozen canonical stylesheet remains unchanged.

The reusable direct-PDF review path imports explicit reviewed diagnoses into
the existing shared planning component; it does not branch the UI by code.
The review ledger binds the original Vault file ID, PDF hash, layout-text hash,
page number, historical scope and exclusions. Anchor checks only verify the
location of a reviewed statement; they never generate or validate a claim.

Initial reviewed content:
- 0102: nine plan diagnoses/potentialities. PDF pp. 34–35 and 45–46. The national
  employment percentages in the right-hand MED column are excluded. The
  2018/2020 editorial inconsistency is not resolved by these content checks.
- 1208: nineteen diagnoses/potentialities from PDF pp. 76–88. The plan itself
  describes this section as qualitative/perception-based. No current factual
  measurement or campaign recommendation is inferred. Conflicting diversified
  education coverage (18.42% on PDF p. 82 versus 56.75% on p. 88) is excluded.
  The original unresolved DR-68A observation stays visible.

One guarded migration changes only these plans' priorities, review notes and
partial-content status, refusing unexpected existing reviews or foreign source
IDs. Read-back: 340 profiles, 64 priorities, six PARTIAL_VALIDATED_CONTENT plans,
128 unresolved catalog discrepancies and five missing documents. No readiness
or acceptance flag changes. The separate 12 prior baseline/target indicators
remain unchanged. Both source observations and review exclusions appear in the
shared screen and PDF. Local tests: 116 passed, typecheck/build/lint passed.
QA publication and render evidence for this increment remain to be verified.

The national semantic review is still incomplete. This is not a closure or a
claim that inspecting two additional plans homologates all 340 municipalities.

### Verified publication and incremental import

537c013ff506dc13e00d90f0addc3e36c140f8f4 passed Quality 35910804470
and Deploy Preview 35910804505. Cloudflare published the same SHA at
https://53511fb3.radar-v70-national-qa.pages.dev. Reviewed Sibinal's mobile
planning capture and the 12-page generated report; the 19 source-referenced
priorities, partial-content warning and legible page numbering are present.

The review importer now skips exact already-integrated entries, including their
source hashes and review notes. A repeated run needs no source reread, changes
no fixture and creates no duplicate migration. A mixed-batch check confirmed
that one new review generates one guarded update, leaving the existing review
untouched. Different existing reviews still require explicit reconciliation.
This tooling change does not modify runtime data or count as new semantic coverage.

Current planning coverage: 329 pending reviews, six partial plans, five absent
documents. The shared model isolates municipal runtime inputs; the strategy
reference remains null when required local election inputs are absent. These
technical checks do not validate a prediction or close national acceptance.
