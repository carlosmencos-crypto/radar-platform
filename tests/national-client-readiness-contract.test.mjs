import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const report = JSON.parse(read("supabase/migrations/national-client-readiness-report.json"));
const schema = read("supabase/migrations/20260919090000_add_national_intelligence_profile_runtime_v8.sql");
const generator = read("scripts/generate-national-client-readiness.py");
const runtime = read("src/data/radarRuntime.ts");
const profile = read("src/data/radarRuntimeProfile.ts");
const model = read("src/data/v70MunicipalIntelligence.ts");
const intelligence = read("src/components/V70DirectIntelligence0509.tsx");
const directory = read("src/components/V70DirectDirectory0509.tsx");
const operationalMap = read("src/components/V70OperationalMap.tsx");
const genericRich = read("src/components/V70CanonicalRichMunicipality.tsx");
const territory = read("src/components/V70ElectoralTerritory.tsx");
const unavailableTerritory = read("src/components/V70ElectoralTerritoryUnavailable.tsx");
const fullscreen = read("src/components/V70MapFullscreen.tsx");
const css = read("src/styles/canonical-adapter.css");
const dataMigrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((name) => /^20260919(?:10|11)\d{4}_load_national_intelligence_profiles_part_\d+\.sql$/.test(name));

test("national intelligence manifest is fail-closed at exactly 340 municipalities", () => {
  assert.equal(report.status, "PASS");
  assert.equal(report.municipalities, 340);
  assert.equal(report.active_profiles, 340);
  assert.equal(report.census_profiles, 340);
  assert.equal(report.electoral_histories, 340);
  assert.equal(report.community_records, 32_438);
  assert.equal(report.voting_centers, 3_445);
  assert.match(generator, /if len\(codes\) != 340/);
  assert.match(generator, /assert_complete\(name, mapping, codes\)/);
  assert.match(generator, /sexo no reconcilia con total/);
  assert.match(generator, /edades no reconcilian con total/);
  assert.match(generator, /alfabetismo no reconcilia por sexo/);
  assert.match(generator, /Censo 2018 no reconcilia/);
  const seen = new Set();
  for (const file of dataMigrations) {
    const content = read(`supabase/migrations/${file}`);
    assert.ok(Buffer.byteLength(content, "utf8") <= 300_000, `${file} excede el máximo transaccional`);
    for (const match of content.matchAll(/\('([0-9]{4})','\{"municipality_code"/g)) {
      assert.ok(!seen.has(match[1]), `municipio duplicado: ${match[1]}`);
      seen.add(match[1]);
    }
  }
  assert.equal(seen.size, 340);
});

test("Sibinal has the same intelligence universes as the approved V70 contract", () => {
  assert.deepEqual(report.sibinal, {
    active: 11_067,
    age_bands: 11,
    census_total: 15_733,
    urban: 2_517,
    rural: 13_216,
    history_years: [2011, 2015, 2019, 2023],
    communities: 53,
    centers: 8,
  });
  for (const ageKey of ["18_25", "26_30", "31_35", "36_40", "41_45", "46_50", "51_55", "56_60", "61_65", "66_70", "70_plus"]) {
    assert.match(profile, new RegExp(ageKey));
    assert.match(intelligence, new RegExp(ageKey));
  }
  assert.match(profile, /women_literate/);
  assert.match(profile, /men_literate/);
  assert.match(profile, /census2018\?\.urban/);
  assert.match(profile, /census2018\?\.rural/);
});

test("national runtime uses one municipality-scoped contract with no 0509 content fork", () => {
  assert.match(runtime, /radar_authorized_runtime_v8/);
  assert.match(runtime, /bundle\.intelligence_profile\?\.municipality_code !== municipalityCode/);
  assert.match(runtime, /bundle\.client_readiness\?\.municipality_code !== municipalityCode/);
  assert.match(model, /runtime\.intelligence_profile/);
  assert.match(model, /electoral_history\.elections/);
  assert.match(model, /community_catalog\.records/);
  assert.doesNotMatch(genericRich, /0509|Puerto San Jos[eé]/i);
  assert.doesNotMatch(model, /municipalityCode\s*===\s*["']0509["']/);
});

test("historical and territorial depth are rendered instead of two-party summaries", () => {
  assert.match(genericRich, /history\.results\.map/);
  assert.match(genericRich, /model\.councils/);
  assert.match(genericRich, /model\.politicalTrajectories/);
  assert.match(genericRich, /model\.communityCatalog/);
  assert.match(model, /winner_candidate/);
  assert.match(model, /startsWith\("ALCALDE"\)/);
  assert.match(generator, /elected_mayor/);
});

test("client readiness distinguishes public intelligence from private voter directory", () => {
  assert.match(schema, /'CLIENT_READY'/);
  assert.match(schema, /'INTELLIGENCE_READY'/);
  assert.match(schema, /CAMPAIGN_VOTER_DIRECTORY/);
  assert.match(schema, /possible_voters_loaded/);
  assert.match(directory, /readiness\?\.campaign_connected && readiness\.possible_voters_loaded/);
  assert.match(directory, /loadNominalDirectoryAvailability/);
  assert.match(directory, /Módulo listo para una campaña autorizada/);
  assert.doesNotMatch(directory, /no existe una fuente autorizada con nombres y DPI/);
  assert.match(directory, /complete y verifique la carga correspondiente a este municipio/);
  assert.match(operationalMap, /const mapAvailable = Boolean\(runtime\?\.geo\.bbox\)/);
  assert.match(operationalMap, /Mapa operativo aún no publicado/);
  assert.match(operationalMap, /RADAR mantiene la estructura sin inventar ubicaciones/);
  assert.match(schema, /private\.can_read_data_vault\(country_code, municipality_id\)/);
  assert.match(schema, /revoke all on data_vault\.municipality_intelligence_profiles_v1 from public, anon, authenticated/);
  assert.doesNotMatch(schema, /grant select on data_vault\.municipality_intelligence_profiles_v1 to anon/);
});

test("fullscreen intelligence preserves election tabs and keeps every layer control visible", () => {
  assert.match(territory, /className="intelligence-fullscreen-frame"/);
  assert.match(territory, /className="election-switch"/);
  assert.match(unavailableTerritory, /className="intelligence-fullscreen-frame"/);
  assert.match(css, /intelligence-fullscreen-frame:is\(:fullscreen,\.is-fullscreen\)>\.election-switch/);
  assert.match(css, /intelligence-fullscreen-frame:is\(:fullscreen,\.is-fullscreen\) \.intelligence-map-toolbar \.layer-switch\{justify-content:flex-end;overflow-x:auto\}/);
  assert.match(css, /map-fullscreen-frame:is\(:fullscreen,\.is-fullscreen\) \.operational-map-toolbar\{grid-template-columns:minmax\(210px,\.72fr\)/);
  assert.match(css, /intelligence-fullscreen-frame:is\(:fullscreen,\.is-fullscreen\) \.intelligence-map-toolbar \.metric-switch\{grid-column:1\}/);
  assert.match(css, /intelligence-fullscreen-frame:is\(:fullscreen,\.is-fullscreen\) \.intelligence-map-toolbar \.layer-switch\{grid-column:3\}/);
  assert.match(fullscreen, /event\.key !== "Escape"/);
  assert.match(fullscreen, /document\.exitFullscreen\(\)/);
});
