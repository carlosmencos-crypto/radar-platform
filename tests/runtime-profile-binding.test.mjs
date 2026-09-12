import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const gate = read("src/components/MunicipalityAccessGate.tsx");
const cache = read("src/data/radarRuntimeCache.ts");
const consumer = read("src/data/radarConsumer.ts");
const profiles = read("src/data/municipalProfiles.ts");
const runtime = read("src/data/radarRuntime.ts");
const geoRuntime = read("src/data/radarGeoRuntime.ts");
const runtimeProfile = read("src/data/radarRuntimeProfile.ts");
const dashboard = read("src/components/MunicipalDashboard.tsx");
const enrichedDashboard = read("src/components/MunicipalDashboardV70Runtime.tsx");
const visibleRuntimeMigration = read("supabase/migrations/20260909205200_radar_authorized_runtime_v3_visible_layers_fix.sql");
const voterRuntimeMigration = read("supabase/migrations/20260909220500_radar_voter_roll_runtime_v4.sql");
const demographicRuntimeMigration = read("supabase/migrations/20260912001500_add_demographic_projection_runtime_v5.sql");
const assetsDataMigration = read("supabase/migrations/20260912044000_promote_validated_activos_resumen_5.sql");
const runtimeV6Migration = read("supabase/migrations/20260912044100_radar_authorized_runtime_v6_optional_assets.sql");
const voterCanonicalCodeFix = read("supabase/migrations/20260909232000_fix_padron_2023_canonical_department_codes.sql");

test("authorized runtime is installed before enriched V70 renders", () => {
  assert.match(gate, /installRadarRuntime\(consumer\.runtime\)/);
  assert.match(gate, /setState\(\{ status: "authorized", consumer \}\)/);
  assert.match(gate, /clearInstalledRadarRuntime\(municipalityCode\)/);
  assert.match(cache, /new Map<string, RadarRuntimeBundle>\(\)/);
  assert.match(gate, /MunicipalDashboardV70Runtime/);
  assert.doesNotMatch(cache, /localStorage|sessionStorage|service[_-]?role/i);
});

test("canonical consumer binds session context while original V70 remains isolated", () => {
  assert.match(consumer, /getInstalledRadarRuntime\(municipality\.code\)/);
  assert.match(consumer, /authorizedRuntime\.context\.campaign_id/);
  assert.match(consumer, /authorizedRuntime\.context\.permissions/);
  assert.match(consumer, /canonicalUserRole\(authorizedRuntime\.context\.user_role\)/);
  assert.doesNotMatch(dashboard, /radarRuntimeCache|radarRuntimeProfile|loadRadarRuntimeBundle|loadAuthorizedGeoBundle/);
  assert.match(enrichedDashboard, /findMunicipalProfile/);
});

test("municipal profile derives rich intelligence and map metrics from authorized Data Vault", () => {
  assert.match(profiles, /buildRuntimeMunicipalProfile\(municipalityCode, municipalProfiles\[municipalityCode\]\)/);
  for (const source of [
    "NUCLEO_ELECTORAL",
    "TSE_CENTROS_GEO",
    "INE_CENSO_B2_B6",
    "MINEDUC_ESCUELAS",
    "MSPAS_SALUD",
    "MINFIN_HIST",
    "MINFIN_YTD",
    "SNIP_2026",
    "GUATECOMPRAS",
  ]) assert.match(runtimeProfile, new RegExp(source));
  assert.match(runtimeProfile, /runtime\.geo\.feature_counts/);
  assert.match(runtimeProfile, /runtime\.geo\.feature_total/);
  assert.match(runtimeProfile, /runtime\.geo\.bbox/);
  assert.match(runtimeProfile, /runtime\.demographics\?\.population_total/);
  assert.match(runtimeProfile, /buildIntelligence/);
  assert.match(runtimeProfile, /openstreetmap\.org\/export\/embed\.html/);
  assert.doesNotMatch(runtimeProfile, /localStorage|sessionStorage|service[_-]?role/i);
});

test("V70 gate loads compact authorized runtime v6 while retaining point bundle on demand", () => {
  assert.match(runtime, /radar_municipality_geo_summary/);
  assert.match(runtime, /loadAuthorizedGeoSummary/);
  assert.match(runtime, /loadAuthorizedGeoBundle/);
  assert.match(runtime, /radar_authorized_runtime_v6/);
  const loader = runtime.match(/export async function loadRadarRuntimeBundle[\s\S]*$/)?.[0] ?? "";
  assert.match(loader, /radar_authorized_runtime_v6/);
  assert.doesNotMatch(loader, /Promise\.all/);
  assert.doesNotMatch(loader, /loadAuthorizedGeoBundle\(municipalityCode, accessToken\)/);
  assert.match(demographicRuntimeMigration, /radar_authorized_runtime_v5/);
  assert.match(demographicRuntimeMigration, /municipality_demographic_aggregates/);
  assert.match(runtimeV6Migration, /radar_authorized_runtime_v6/);
  assert.match(runtimeV6Migration, /ACTIVOS_RESUMEN/);
  assert.match(runtimeV6Migration, /data_present/);
  assert.match(runtimeV6Migration, /grant execute on function public\.radar_authorized_runtime_v6\(text\) to authenticated/);
});

test("detailed public geography is loaded only for mapa and reconciles fail closed", () => {
  assert.match(gate, /section === "mapa"/);
  assert.match(gate, /loadAuthorizedGeoBundle\(municipalityCode, accessToken, \[\.\.\.RADAR_PUBLIC_MAP_FEATURE_TYPES\]\)/);
  assert.match(gate, /assertGeoBundleMatchesRuntime\(consumer\.runtime, geoBundle\)/);
  assert.match(gate, /installRadarGeoBundle\(geoBundle\)/);
  assert.match(cache, /new Map<string, MunicipalityGeoBundle>\(\)/);
  assert.match(cache, /clearInstalledRadarGeoBundle/);
  for (const featureType of ["populated_place", "tse_voting_center", "school", "health_facility"]) {
    assert.match(geoRuntime, new RegExp(`"${featureType}"`));
    assert.match(enrichedDashboard, new RegExp(`${featureType}`));
  }
  assert.match(geoRuntime, /actual !== bundleCount \|\| actual !== runtimeCount/);
  assert.match(geoRuntime, /bundle\.features\.length !== runtime\.geo\.feature_total/);
  assert.match(enrichedDashboard, /RuntimeGeoOverlay/);
  assert.doesNotMatch(dashboard, /loadAuthorizedGeoBundle|assertGeoBundleMatchesRuntime|installRadarGeoBundle/);
});

test("runtime keeps 16-layer national baseline and adds validated assets only for five canonical municipalities", () => {
  const baselineLayers = [
    "ROUTES_340",
    "NUCLEO_ELECTORAL",
    "RGM_SERVICIOS",
    "INAB_FORESTAL",
    "CONRED_INFORM",
    "CONAP_SIGAP",
    "INE_CENSO_B2_B6",
    "SESAN_TALLA",
    "PDM_PDMOT",
    "MSPAS_SALUD",
    "MINEDUC_ESCUELAS",
    "MINFIN_HIST",
    "MINFIN_YTD",
    "SNIP_2026",
    "GUATECOMPRAS",
    "TSE_CENTROS_GEO",
  ];
  for (const layerId of baselineLayers) assert.match(visibleRuntimeMigration, new RegExp(`'${layerId}'`));
  assert.doesNotMatch(visibleRuntimeMigration, /ACTIVOS_RESUMEN/);
  for (const code of ["0312", "0916", "1610", "1709", "1901"]) assert.match(assetsDataMigration, new RegExp(`'${code}'`));
  assert.match(assetsDataMigration, /GT_RADAR_ACTIVOS_MUNICIPALES_5_DASHBOARD_READY_v1/);
  assert.match(runtimeV6Migration, /coalesce\(l\.payload->>'data_present', 'false'\) = 'true'/);
});

test("voter aggregates stay authenticated, aggregate-only and universe-separated", () => {
  assert.match(voterRuntimeMigration, /radar_authorized_voter_roll_summary_v1/);
  assert.match(voterRuntimeMigration, /PADRON_DETALLADO_2023/);
  assert.match(voterRuntimeMigration, /NUCLEO_ELECTORAL_2026/);
  assert.match(voterRuntimeMigration, /GT_RADAR_PADRON_2023_AGREGADOS_340_v1/);
  assert.match(voterRuntimeMigration, /GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6/);
  assert.match(voterRuntimeMigration, /voter_roll_community_aggregates/);
  assert.match(voterRuntimeMigration, /revoke all on function public\.radar_authorized_voter_roll_summary_v1\(text\) from anon/);
  assert.match(voterRuntimeMigration, /grant execute on function public\.radar_authorized_voter_roll_summary_v1\(text\) to authenticated/);
  assert.match(runtimeProfile, /Empadronados oficiales 2023/);
  assert.match(runtimeProfile, /Registros detallados 2023/);
  assert.match(runtimeProfile, /universo separado|universos separados|padrón detallado agregado/i);
  assert.doesNotMatch(voterRuntimeMigration, /full_name|phone|dpi|address_text/i);
});

test("2023 detailed voter aggregates are remapped to canonical department codes and fail closed at 340", () => {
  assert.match(voterCanonicalCodeFix, /GT_RADAR_PADRON_2023_AGREGADOS_340_v1/);
  for (const municipalityCode of ["0201", "0208", "0301", "0316", "0401", "0409", "0416"]) {
    assert.match(voterCanonicalCodeFix, new RegExp(`'${municipalityCode}'`));
  }
  assert.match(voterCanonicalCodeFix, /on conflict \(municipality_id, source_year\) do update/);
  assert.match(voterCanonicalCodeFix, /v_rows <> 340/);
  assert.match(voterCanonicalCodeFix, /v_electors <> 8947471/);
  assert.match(voterCanonicalCodeFix, /v_reconciliation_failures <> 0/);
  assert.doesNotMatch(voterCanonicalCodeFix, /full_name|phone|dpi|address_text/i);
});
