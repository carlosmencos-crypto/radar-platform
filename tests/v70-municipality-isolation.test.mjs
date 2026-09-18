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
const richMunicipality = read("src/components/V70CanonicalRichMunicipality.tsx");
const municipalModel = read("src/data/v70MunicipalIntelligence.ts");
const strategyOverview = read("src/components/V70DirectStrategy0509.tsx");
const home = read("src/components/V70DirectHome0509.tsx");
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

test("all 340 municipalities receive one canonical V70 intelligence architecture", () => {
  assert.match(intelligence, /function CanonicalMunicipalIntelligenceContent/);
  assert.match(intelligence, /data-v70-contract="electorate-profile-v70"/);
  assert.doesNotMatch(intelligence, /\bGolden0509IntelligenceContent\b|\bMunicipalIntelligenceContent\b|municipalityCode === "0509"/);
  assert.match(intelligence, /<V70CanonicalRichMunicipality \/>/);
  for (const token of [
    "PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026",
    "COMPOSICIÓN POR SEXO",
    "ALFABETISMO REGISTRADO",
    "ESTRUCTURA POR EDAD",
    "POBLACIÓN Y TERRITORIO",
    "No publicado",
  ]) assert.ok(intelligence.includes(token), `Missing canonical electorate contract token: ${token}`);
  for (const section of [
    "HISTÓRICO ELECTORAL MUNICIPAL",
    "ORGANIZACIÓN COMUNITARIA TSE",
    "FOTOGRAFÍA MUNICIPAL",
    "CAPACIDAD FISCAL Y GESTIÓN MUNICIPAL",
    "INVERSIÓN PÚBLICA · SNIP + GUATECOMPRAS",
    "EDUCACIÓN, NUTRICIÓN, SALUD Y CONDICIONES DE VIDA",
    "SEGURIDAD Y CONFLICTIVIDAD",
    "ECONOMÍA Y EMPLEO LOCAL",
    "INFRAESTRUCTURA, CONECTIVIDAD Y RIESGO",
    "LECTURA EJECUTIVA",
  ]) assert.ok(richMunicipality.includes(section), `Missing full-depth intelligence section: ${section}`);
  assert.match(report, /return <CanonicalV70Report \/>/);
  assert.doesNotMatch(report, /Golden0509Report|MunicipalV70Report|municipality_code === "0509"/);
  assert.match(report, /getInstalledRadarRuntime\(municipality_code\)/);
  assert.doesNotMatch(activityVisual, /brand\.municipality \|\| "San José/);
});

test("active client surfaces do not branch their presentation on municipality 0509", () => {
  for (const [name, source] of [["Inteligencia", intelligence], ["Inicio", home], ["Reporte", report], ["Estrategia", strategy]]) {
    assert.doesNotMatch(source, /municipality_(?:code|Code)\s*===\s*["']0509["']|municipalityCode\s*===\s*["']0509["']/, `${name} still contains a 0509-only presentation branch.`);
  }
});

test("strategy and Inicio are calculated from the active municipal runtime", () => {
  assert.match(strategyOverview, /getInstalledRadarElectoralLayers\(municipality_code\)/);
  assert.match(strategyOverview, /buildMunicipalIntelligenceModel\(runtime, electoralLayers\)/);
  assert.match(strategyOverview, /municipalReference\.projectedElectors2027/);
  assert.match(strategyOverview, /municipalReference\.participationReference/);
  assert.match(strategyOverview, /municipalReference\.magicNumber/);
  for (const leakedValue of ["41,563", "67.8%", "9,000"]) assert.doesNotMatch(strategyOverview, new RegExp(leakedValue.replace(/[,.%]/g, "\\$&")));
  assert.match(home, /municipalModel\.priorities/);
  assert.match(home, /municipalModel\.opportunities/);
  for (const layerId of ["INE_CENSO_B2_B6", "RGM_SERVICIOS", "MSPAS_SALUD", "CONRED_INFORM", "MINEDUC_ESCUELAS"]) {
    assert.match(home, new RegExp(`municipalModel\\.payload\\("${layerId}"\\)`));
  }
  assert.match(home, /getInstalledRadarElectoralLayers\(municipality_code\)/);
});

test("the shared intelligence selector fails closed on cross-municipal payloads", () => {
  assert.match(municipalModel, /RADAR_CROSS_MUNICIPAL_RUNTIME_BLOCKED/);
  assert.match(municipalModel, /RADAR_CROSS_MUNICIPAL_LAYER_BLOCKED/);
  assert.match(municipalModel, /payload\.municipality_code/);
  assert.match(municipalModel, /nestedMunicipality\.municipality_code/);
  assert.match(municipalModel, /Math\.pow\(active \/ registered2023, 1 \/ 3\)/);
  assert.match(municipalModel, /TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL/);
  assert.match(municipalModel, /electoralLayers: AuthorizedLayerRecord\[\]/);
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
