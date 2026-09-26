# Superadmin refinement and national RTD — QA, 2026-09-26

## Delivered
Scoped typography, spacing, radii and lighter controls throughout superadmin. KPI and municipality cards no longer use HTML footer elements: municipal global footer CSS caused oversized dark blocks. Municipal global styles remain untouched.

RTD is a primary navigation destination and daily action. National console supports Alcaldía, Diputados distritales, Lista nacional and Presidencia, with year, presidential round, department and municipality filters. It displays registered fiscales, reception, counted acts, pending/conflicting reports and valid/blank/null votes, with a 30-second refresh and explicit stale/error states. Municipal and district election rankings remain separate territories.

## Access and counting
Edge action national_rtd and service-only RPC radar_admin_national_rtd_v1 require an active authenticated super_admin; existing MFA requirements remain. No public or municipal cross-client access is introduced. Active non-demo campaigns only. Confirmed/validated, complete, nonnegative canonical results only. Identical submissions per municipality/center/JRV count once; conflicts are excluded. JRV 001 and 1 are identical. Election cycle and round are required to avoid mixing elections.

Canonical result array: [{party_id: canonical ID, party_name: label, candidate_name: optional label, votes: nonnegative integer}]. Blank/null and total_ballots must reconcile. District results require electoral_district_code. The producer must validate this against the authoritative electoral district catalog; department is not used as a district substitute.

## Deployment boundary
QA Supabase djldhumkmuppzxiaontb only; radar-admin-api version 8. Production fiscal submissions are NOT connected to this QA consolidator. Production integration must map actual fiscal reports into the canonical contract, populate year/round and authoritative district IDs, and verify physical acta identity before promotion. Zero actual QA reports are displayed honestly. No contracts were edited or sent; client disclosure of national RADAR access is planned as explicitly requested by the owner.

## Verification
Build and 70 existing tests passed. SQL regression tests passed inside a rollback transaction: identical reports including JRV 001/1, conflicting reports, pending/negative values, old election years, demo exclusion, municipal filtering, municipal/district/national scopes and privilege denial. No persistent test clients or acts remain. No authenticated visual session was available for screenshot verification.
