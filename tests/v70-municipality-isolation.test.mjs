import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) =>
  fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const gate = read("src/components/MunicipalityAccessGate.tsx");
const runtime = read("src/data/radarRuntime.ts");
const cache = read("src/data/radarRuntimeCache.ts");
const brand = read("src/components/useV70CampaignBrand.ts");
const directory = read("src/components/V70DirectDirectory0509.tsx");
const intelligence = read("src/components/V70DirectIntelligence0509.tsx");
const report = read("src/components/V70DirectReport0509.tsx");
const pulse = read("src/components/V70DirectPulse0509.tsx");
const activityVisual = read("src/components/V70ActivityVisual.tsx");
const strategy = read("src/components/V70DirectStrategyArea0509.tsx");

test("every municipal route loads and installs only its requested municipality", () => {
  assert.match(gate, /loadMunicipalityRuntime\(municipalityCode, accessToken\)/);
  assert.match(gate, /assertGeoBundleMatchesRuntime\(consumer\.runtime, geoBundle\)/);
  assert.match(gate, /installRadarElectoralLayers\(municipalityCode, electoralLayers\)/);
  assert.match(gate, /installRadarVoterCommunities\(municipalityCode, voterCommunities\)/);
  assert.match(runtime, /bundle\.context\?\.municipality_code !== municipalityCode/);
  assert.match(runtime, /bundle\.geo\?\.municipality\?\.municipality_code !== municipalityCode/);
  assert.match(runtime, /bundle\.voter_roll\?\.municipality_code !== municipalityCode/);
  assert.match(cache, /new Map<string, RadarRuntimeBundle>/);
  assert.match(cache, /return authorizedRuntimeByMunicipality\.get\(municipalityCode\)/);
});

test("campaign data fails closed when a response belongs to another campaign", () => {
  assert.match(runtime, /bundle\.identity\?\.campaign_id && bundle\.identity\.campaign_id !== campaignId/);
  assert.match(runtime, /bundle\.activities\.some\(\(activity\) => activity\.campaign_id !== campaignId\)/);
  assert.match(runtime, /contacts\.some\(\(contact\) => contact\.campaign_id !== campaignId\)/);
  assert.match(runtime, /record\.campaign_id !== campaignId \|\| record\.module_key !== moduleKey/);
  assert.match(brand, /setContacts\(\[\]\)/);
  assert.match(brand, /setIdentity\(\{\}\)/);
  assert.match(brand, /requestVersion\.current !== version/);
});

test("voter and pulse responses are checked against municipal scope", () => {
  assert.match(runtime, /detail\.elector\.municipality_code !== municipalityCode/);
  assert.match(runtime, /measurement\.municipality_code !== municipalityCode/);
  assert.match(runtime, /measurement\.department_code !== municipalityCode\.slice\(0, 2\)/);
  assert.match(directory, /getInstalledRadarRuntime\(municipality_code\)/);
  assert.match(directory, /item\.universe === "PADRON_DETALLADO_2023"/);
  assert.doesNotMatch(directory, /useState\(36_878\)/);
  assert.match(pulse, /survey\.electionType==="ALCALDIA"\?municipality_name/);
  assert.match(pulse, /survey\.electionType==="DIP_DIST"\?department_name/);
});

test("0509 golden content is explicitly isolated from the national municipal renderer", () => {
  assert.match(intelligence, /municipalityCode === "0509" \? <Golden0509IntelligenceContent[\s\S]*: <MunicipalIntelligenceContent/);
  assert.match(report, /municipality_code === "0509" \? <Golden0509Report\/> : <MunicipalV70Report\/>/);
  assert.match(report, /getInstalledRadarRuntime\(municipality_code\)/);
  assert.doesNotMatch(activityVisual, /brand\.municipality \|\| "San José/);
});

test("municipal problems are derived from the active runtime and preserve missing evidence", () => {
  for (const layerId of ["PDM_PDMOT", "INE_CENSO_B2_B6", "SESAN_TALLA", "CONRED_INFORM"]) {
    assert.match(strategy, new RegExp(`layerPayload\\("${layerId}"\\)`));
  }
  assert.match(strategy, /El documento corresponde exclusivamente a \$\{municipality_name\}/);
  assert.match(strategy, /La capa municipal no confirma una línea base 2015/);
  assert.match(strategy, /source: "PDM-OT"/);
  assert.match(strategy, /source: "INE 2018"/);
  assert.match(strategy, /source: "PDM-OT 2015"/);
  assert.match(strategy, /source: "Perfil municipal"/);
});
