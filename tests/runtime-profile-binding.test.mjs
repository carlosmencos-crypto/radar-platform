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
const runtimeProfile = read("src/data/radarRuntimeProfile.ts");
const dashboard = read("src/components/MunicipalDashboard.tsx");
const visibleRuntimeMigration = read("supabase/migrations/20260909205200_radar_authorized_runtime_v3_visible_layers_fix.sql");

test("authorized runtime is installed before canonical V70 renders", () => {
  assert.match(gate, /installRadarRuntime\(consumer\.runtime\);\s*setState\(\{ status: "authorized", consumer \}\)/);
  assert.match(gate, /clearInstalledRadarRuntime\(municipalityCode\)/);
  assert.match(cache, /new Map<string, RadarRuntimeBundle>\(\)/);
  assert.doesNotMatch(cache, /localStorage|sessionStorage|service[_-]?role/i);
});

test("canonical consumer binds session context without modifying V70", () => {
  assert.match(consumer, /getInstalledRadarRuntime\(municipality\.code\)/);
  assert.match(consumer, /authorizedRuntime\.context\.campaign_id/);
  assert.match(consumer, /authorizedRuntime\.context\.permissions/);
  assert.match(consumer, /canonicalUserRole\(authorizedRuntime\.context\.user_role\)/);
  assert.doesNotMatch(dashboard, /radarRuntimeCache|radarRuntimeProfile|loadRadarRuntimeBundle/);
});

test("municipal profile derives map and operational metrics from authorized Data Vault only", () => {
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
  assert.match(runtimeProfile, /openstreetmap\.org\/export\/embed\.html/);
  assert.doesNotMatch(runtimeProfile, /localStorage|sessionStorage|service[_-]?role/i);
});

test("V70 gate loads one compact authorized runtime RPC while retaining point bundle on demand", () => {
  assert.match(runtime, /radar_municipality_geo_summary/);
  assert.match(runtime, /loadAuthorizedGeoSummary/);
  assert.match(runtime, /loadAuthorizedGeoBundle/);
  assert.match(runtime, /radar_authorized_runtime_v3/);
  const loader = runtime.match(/export async function loadRadarRuntimeBundle[\s\S]*$/)?.[0] ?? "";
  assert.match(loader, /radar_authorized_runtime_v3/);
  assert.doesNotMatch(loader, /Promise\.all/);
  assert.doesNotMatch(loader, /loadAuthorizedGeoBundle\(municipalityCode, accessToken\)/);
});

test("server runtime exposes exactly the 16 V70 launch layers and excludes post-launch assets", () => {
  const visibleLayers = [
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
  for (const layerId of visibleLayers) assert.match(visibleRuntimeMigration, new RegExp(`'${layerId}'`));
  assert.doesNotMatch(visibleRuntimeMigration, /ACTIVOS_RESUMEN/);
  assert.match(visibleRuntimeMigration, /revoke all on function public\.radar_authorized_runtime_v3\(text\) from anon/);
  assert.match(visibleRuntimeMigration, /grant execute on function public\.radar_authorized_runtime_v3\(text\) to authenticated/);
});
