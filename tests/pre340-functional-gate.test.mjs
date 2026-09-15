import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const gate = read("src/components/MunicipalityAccessGate.tsx");
const runtime = read("src/data/radarRuntime.ts");
const migration = read("supabase/migrations/20260915044929_add_pre340_campaign_runtime.sql");
const refinementMigration = read("supabase/migrations/20260915065105_restore_map_rtd_and_optimize_directory.sql");
const directoryStatsMigration = read("supabase/migrations/20260915065757_cache_authorized_voter_directory_totals.sql");

test("municipal navigation retains one authorized runtime across section changes", () => {
  assert.match(gate, /useEffect\([\s\S]*?\}, \[municipalityCode\]\);/);
  assert.doesNotMatch(gate, /\[municipalityCode, section\]/);
  assert.match(gate, /installRadarGeoBundle\(geoBundle\)/);
  assert.match(gate, /installRadarVoterCommunities\(municipalityCode, voterCommunities\)/);
});

test("direct V70 actions stay inside the municipal route", () => {
  for (const file of [
    "V70DirectHome0509.tsx",
    "V70DirectStrategy0509.tsx",
    "V70DirectAgenda0509.tsx",
    "V70DirectDayD0509.tsx",
    "V70DirectConfiguration0509.tsx",
  ]) {
    assert.doesNotMatch(read(`src/components/${file}`), /to="\.\.\//, file);
  }
});

test("Campaign Vault additions are authenticated, RLS-scoped and absent from the public bundle", () => {
  assert.match(migration, /alter table campaign_vault\.campaign_identity enable row level security/);
  assert.match(migration, /alter table campaign_vault\.voter_directory enable row level security/);
  assert.match(migration, /revoke all on campaign_vault\.voter_directory from public, anon/);
  assert.match(migration, /private\.is_campaign_member/);
  assert.match(migration, /security invoker/g);
  assert.doesNotMatch(migration, /service_role|\b\d{13}\b/);
});

test("party identity, agenda and voter directory use authorized RPCs", () => {
  for (const rpc of [
    "radar_campaign_bundle_v1",
    "radar_save_campaign_identity_v1",
    "radar_save_activity_v1",
    "radar_authorized_voter_directory_v1",
  ]) assert.match(runtime, new RegExp(rpc));
});

test("campaign identity modal escapes the canonical hero stacking context", () => {
  const identity = read("src/components/V70CampaignIdentity.tsx");
  assert.match(identity, /createPortal/);
  assert.match(identity, /campaign-identity-backdrop/);
});

test("map search waits for an explicit choice and exact activity points persist", () => {
  const map = read("src/components/V70OperationalMap.tsx");
  const agenda = read("src/components/V70DirectAgenda0509.tsx");
  assert.doesNotMatch(map, /if \(!mapReady \|\| !query\.trim\(\)\) return/);
  assert.match(map, /PUNTO EXACTO SELECCIONADO/);
  assert.match(map, /&lat=\$\{activityPoint\.lat\}&lon=\$\{activityPoint\.lon\}/);
  assert.match(agenda, /Punto exacto del mapa/);
  assert.match(refinementMigration, /latitude_value/);
  assert.match(refinementMigration, /activity coordinates outside Guatemala/);
});

test("RTD restores JRV coverage and the canonical fiscal portal", () => {
  const dayD = read("src/components/V70DirectDayD0509.tsx");
  assert.match(dayD, /JRV con RTD recibido/);
  assert.match(dayD, /0\/\{totalJrv\}/);
  assert.match(dayD, /radar-portal-fiscal\.carlos-mencos\.chatgpt\.site/);
});

test("voter directory uses indexed page order and an in-memory revisit cache", () => {
  const directory = read("src/components/V70DirectDirectory0509.tsx");
  assert.match(directory, /directoryCache/);
  assert.match(refinementMigration, /voter_directory_campaign_name_page_idx/);
  assert.match(refinementMigration, /filtered as not materialized/);
  assert.match(directoryStatsMigration, /campaign_vault\.voter_directory_stats/);
  assert.match(directoryStatsMigration, /where not i\.has_filters/);
});
