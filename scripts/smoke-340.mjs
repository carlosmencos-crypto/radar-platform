import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const contract = JSON.parse(read("src/data/radarContract.generated.json"));
const municipalitiesSource = read("src/data/municipalities.ts");
const consumerSource = read("src/data/radarConsumer.ts");
const dashboardSource = read("src/components/MunicipalDashboard.tsx");
const contextSource = read("src/context/MunicipalityContext.tsx");
const appSource = read("src/app/App.tsx");
const layoutSource = read("src/app/Layout.tsx");
const nationalSource = read("src/app/pages.tsx");
const catalogCssSource = read("src/styles/canonical-adapter.css");
const fontSource = read("src/styles/v70/fonts.css");
const indexSource = read("index.html");

const EXPECTED_LAYER_IDS = [
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
  "ACTIVOS_RESUMEN",
  "TSE_CENTROS_GEO",
];

const EXPECTED_NATURAL_KEYS = {
  ROUTES_340: "municipality_code",
  NUCLEO_ELECTORAL: "municipality_code",
  RGM_SERVICIOS: "municipality_code",
  INAB_FORESTAL: "municipality_code",
  CONRED_INFORM: "municipality_code",
  CONAP_SIGAP: "municipality_code",
  INE_CENSO_B2_B6: "municipality_code",
  SESAN_TALLA: "municipality_code",
  PDM_PDMOT: "municipality_code",
  MSPAS_SALUD: "municipality_code",
  MINEDUC_ESCUELAS: "municipality_code + school_code",
  MINFIN_HIST: "municipality_code + period",
  MINFIN_YTD: "municipality_code",
  SNIP_2026: "municipality_code",
  GUATECOMPRAS: "municipality_code",
  ACTIVOS_RESUMEN: "municipality_code + period; row_key para cuentas",
  TSE_CENTROS_GEO: "municipality_code + center_key",
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}

const municipalityRows = [...municipalitiesSource.matchAll(
  /\{ code: "(\d{4})", departmentCode: "(\d{2})", name: "([^"]+)",(?: displayName: "[^"]+",)? department: "([^"]+)"/g,
)].map((match) => ({ code: match[1], departmentCode: match[2], name: match[3], department: match[4] }));
const municipalityCodes = new Set(municipalityRows.map((row) => row.code));
const departmentCodes = new Set(municipalityRows.map((row) => row.departmentCode));

assert(municipalityRows.length === 340, `Municipios observados: ${municipalityRows.length}`);
assert(municipalityCodes.size === 340, `Códigos municipales únicos: ${municipalityCodes.size}`);
assert(departmentCodes.size === 22, `Departamentos observados: ${departmentCodes.size}`);
for (const row of municipalityRows) {
  assert(/^\d{4}$/.test(row.code), `Código municipal inválido: ${row.code}`);
  assert(row.departmentCode === row.code.slice(0, 2), `Prefijo departamental inválido: ${row.code}`);
}

assert(contract.products.registry === "GT_RADAR_REGISTRO_CONSUMO_FRONTEND_17_v2", "Registro canónico incorrecto.");
assert(contract.products.releaseIndex === "GT_RADAR_FRONTEND_RELEASE_INDEX_340_v1", "Release index canónico incorrecto.");
assert(contract.products.navContract === "NAV_CONTRACT_340", "NAV_CONTRACT_340 ausente.");
assert(contract.products.routeModules === "ROUTE_MODULES_5780", "ROUTE_MODULES_5780 ausente.");
assert(contract.products.renderRules === "RENDER_STATE_RULES", "RENDER_STATE_RULES ausente.");
assert(contract.products.runtimeGate === "RUNTIME_GATE_340", "RUNTIME_GATE_340 ausente.");

const observedLayerIds = contract.layers.map((layer) => layer.layer_id);
assert(contract.layers.length === 17, `Capas observadas: ${contract.layers.length}`);
assert(new Set(observedLayerIds).size === 17, "layer_id duplicado.");
assert(JSON.stringify(observedLayerIds) === JSON.stringify(EXPECTED_LAYER_IDS), "Los 17 layer_id no coinciden exactamente con el contrato canónico.");

for (const [index, layer] of contract.layers.entries()) {
  assert(layer.layer_order === index + 1, `Orden inválido para ${layer.layer_id}`);
  assert(layer.natural_key === EXPECTED_NATURAL_KEYS[layer.layer_id], `natural_key incorrecta en ${layer.layer_id}`);
  assert(layer.primary_asset_url && new URL(layer.primary_asset_url).protocol === "https:", `Primary no resoluble: ${layer.layer_id}`);
  assert(layer.fallback_sheet_url && new URL(layer.fallback_sheet_url).protocol === "https:", `Fallback no resoluble: ${layer.layer_id}`);
  assert(layer.primary_asset_format && layer.preferred_mode && layer.guardrail && layer.null_semantics, `Resolver incompleto: ${layer.layer_id}`);
}

const navCodes = Object.keys(contract.nav);
const stateCodes = Object.keys(contract.route_states);
const gateCodes = Object.keys(contract.runtime_gate);
assert(navCodes.length === 340 && new Set(navCodes).size === 340, "NAV_CONTRACT_340 no contiene 340 códigos únicos.");
assert(stateCodes.length === 340 && new Set(stateCodes).size === 340, "ROUTE_MODULES_5780 no contiene 340 códigos únicos.");
assert(gateCodes.length === 340 && new Set(gateCodes).size === 340, "RUNTIME_GATE_340 no contiene 340 códigos únicos.");

const pairKeys = new Set();
const actionCounts = new Map();
const specialCounts = { NOT_PUBLISHED: 0, NO_EXPLICIT_ASSOCIATION: 0, NO_RECORD_IN_SOURCE: 0 };
const rulesByCoverage = new Map(contract.render_rules.map((rule) => [rule.coverage_status, rule]));

for (const municipality of municipalityRows) {
  const { code, departmentCode } = municipality;
  const nav = contract.nav[code];
  const actions = contract.route_states[code];
  const gate = contract.runtime_gate[code];
  assert(nav && actions && gate, `Contrato municipal incompleto: ${code}`);
  assert(nav.municipality_code === code && gate.municipality_code === code, `Cruce entre municipios: ${code}`);
  assert(nav.department_code === departmentCode && gate.department_code === departmentCode, `Cruce departamental: ${code}`);
  assert(nav.route_path === `/municipio/${code}` && gate.route_path === nav.route_path, `Ruta cruzada: ${code}`);
  assert(nav.comparator_key === code, `comparator_key cruzada: ${code}`);
  assert(actions.length === 17, `${code} tiene ${actions.length}/17 layer_id`);
  assert(gate.status === "PASS", `RUNTIME_GATE_340 bloqueó ${code}`);
  assert(gate.expected_module_rows === 17 && gate.observed_module_rows === 17, `Gate 17 inválido: ${code}`);
  assert(gate.route_path_mismatches === 0 && gate.department_mismatches === 0, `Gate territorial inválido: ${code}`);

  const visible = actions.filter((action) => action !== "HIDE_POST_LAUNCH").length;
  const empty = actions.filter((action) => action === "SHOW_WITH_EMPTY_STATE").length;
  assert(visible === gate.expected_visible_modules && visible === gate.observed_visible_modules, `Gate visible inválido: ${code}`);
  assert(empty === gate.expected_empty_state_modules && empty === gate.observed_empty_state_modules, `Gate de vacíos inválido: ${code}`);

  for (let index = 0; index < 17; index += 1) {
    const layer = contract.layers[index];
    const action = actions[index];
    const pairKey = `${code}|${layer.layer_id}`;
    assert(!pairKeys.has(pairKey), `Par duplicado: ${pairKey}`);
    pairKeys.add(pairKey);
    actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);

    let coverage = "ANY_NON_EMPTY";
    if (action === "SHOW_PARTIAL_SCOPE") coverage = "READY_PARTIAL_SCOPE";
    if (action === "HIDE_POST_LAUNCH") coverage = "POST_LAUNCH";
    if (action === "SHOW_WITH_EMPTY_STATE") coverage = contract.empty_coverage_by_layer[layer.layer_id];
    const rule = rulesByCoverage.get(coverage);
    assert(rule?.status === "PASS", `Regla de render no resoluble: ${pairKey}`);
    assert(rule.zero_semantics === "SOURCE_VALUE" || rule.zero_semantics === "NEVER_ZERO", `Semántica cero inválida: ${pairKey}`);

    if (rule.render_state === "NOT_PUBLISHED") specialCounts.NOT_PUBLISHED += 1;
    if (rule.empty_reason === "NO_EXPLICIT_ASSOCIATION") specialCounts.NO_EXPLICIT_ASSOCIATION += 1;
    if (rule.empty_reason === "NO_RECORD_IN_SOURCE") specialCounts.NO_RECORD_IN_SOURCE += 1;
  }
}

assert(pairKeys.size === 5780, `Pares canónicos: ${pairKeys.size}/5780`);
for (const rule of contract.render_rules) {
  const observed = rule.source_condition === "frontend_action=SHOW_WITH_EMPTY_STATE"
    ? [...pairKeys].filter((pair) => {
        const [code, layerId] = pair.split("|");
        const index = observedLayerIds.indexOf(layerId);
        return contract.route_states[code][index] === "SHOW_WITH_EMPTY_STATE" && contract.empty_coverage_by_layer[layerId] === rule.coverage_status;
      }).length
    : actionCounts.get(rule.source_condition.replace("frontend_action=", "")) ?? 0;
  assert(observed === rule.expected_rows && observed === rule.observed_rows, `Reconciliación RENDER_STATE_RULES falló: ${rule.empty_reason}`);
}
assert(specialCounts.NOT_PUBLISHED === 20, `NOT_PUBLISHED: ${specialCounts.NOT_PUBLISHED}/20`);
assert(specialCounts.NO_EXPLICIT_ASSOCIATION === 178, `NO_EXPLICIT_ASSOCIATION: ${specialCounts.NO_EXPLICIT_ASSOCIATION}/178`);
assert(specialCounts.NO_RECORD_IN_SOURCE === 1, `NO_RECORD_IN_SOURCE: ${specialCounts.NO_RECORD_IN_SOURCE}/1`);

assert(contract.nav["0509"].municipality_name === "San José" && contract.nav["0509"].department_name === "Escuintla", "Golden route 0509 incorrecta.");
assert(contract.nav["1901"].municipality_name === "Zacapa" && contract.nav["1901"].department_name === "Zacapa", "Ruta externa 1901 incorrecta.");
assert(consumerSource.includes("RUNTIME_GATE_340[municipalityCode]") && consumerSource.includes("gate.status !== \"PASS\""), "El consumer no aplica RUNTIME_GATE_340.");
assert(consumerSource.includes("CANONICAL_LAYER_DEFINITIONS.map") && !consumerSource.includes("publicModules") && !consumerSource.includes("campaignModules"), "El consumer conserva aliases genéricos.");
assert(appSource.includes('path="admin"') && appSource.includes('<Navigate to="/acceso-restringido" replace'), "/admin no está fail-closed.");
assert(appSource.includes('path="municipio/:municipalityCode/:section?" element={<MunicipalDashboard />}'), "La ruta municipal V70 fue modificada.");

const expectedSections = ["inicio", "inteligencia", "estrategia", "directorio", "agenda", "mapa", "dia-d", "recursos", "pulso", "ia-radar", "configuracion"];
for (const section of expectedSections) {
  assert(dashboardSource.includes(`"${section}"`), `Sidebar V70 incompleto: falta ${section}.`);
}
for (const requiredClass of ["portal-shell", "portal-sidebar", "portal-topbar", "command-hero", "home-welcome"]) {
  assert(dashboardSource.includes(requiredClass), `Shell V70 incompleto: falta ${requiredClass}.`);
}
for (const requiredGoldenUi of [
  "electorate-profile",
  "register-total",
  "sex-profile",
  "literacy-profile",
  "age-profile",
  "universe-card",
  "operational-map-toolbar",
  "map-electoral-priorities",
  "map-satellite-toggle",
]) {
  assert(dashboardSource.includes(requiredGoldenUi), `Golden UI V70 incompleta: falta ${requiredGoldenUi}.`);
}
assert(dashboardSource.includes("canonical-coverage-secondary") && dashboardSource.includes("<details"), "El contrato no quedó como información secundaria dentro de V70.");
for (const fontFile of ["inter-1ab1ad55.woff2", "inter-749a3084.woff2"]) {
  assert(fontSource.includes(fontFile), `Fuente Inter V70 no conectada: ${fontFile}.`);
}
for (const asset of [
  "/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg",
  "/brand/radar-electoral-isotipo.svg",
  "/brand/radar-isotipo.svg",
]) {
  assert(dashboardSource.includes(asset), `Asset oficial V70 no conectado: ${asset}.`);
}
for (const contextField of ["municipality_code", "municipality_name", "department_code", "department_name", "campaign_id", "user_role", "permissions"]) {
  assert(contextSource.includes(contextField), `MunicipalityContext incompleto: falta ${contextField}.`);
}
assert(!dashboardSource.includes('=== "0509"') && !consumerSource.includes('=== "0509"'), "El shell o consumer contienen lógica fijada a 0509.");
assert(consumerSource.includes("UI_PROFILE_BY_LAYER") && dashboardSource.includes("module.ui_profile_id"), "Falta el adaptador no visual V70/contrato.");
assert(dashboardSource.includes("{available}/{consumer.modules.length}") && !dashboardSource.includes("{available}/8"), "La cobertura V70 no refleja los 17 layers canónicos.");

assert(/const catalogMunicipalities = useMemo\([\s\S]*?\[\.\.\.municipalities\]\.sort\(/.test(nationalSource), "El catálogo raíz no deriva de los 340 municipios.");
assert(nationalSource.includes("catalogMunicipalities.map"), "El catálogo raíz no renderiza 340 municipios.");
assert(nationalSource.includes("national-territory-grid") && nationalSource.includes("national-territory-card"), "El catálogo no está aislado del CSS del Mapa V70.");
assert(!nationalSource.includes("priorityCodes") && !nationalSource.includes("priorityMunicipalities"), "El catálogo conserva un subconjunto prioritario.");
assert(appSource.includes('path="municipios" element={<MunicipalitiesPage />}'), "Falta la ruta pública /municipios.");
assert(nationalSource.includes("export function MunicipalitiesPage()") && nationalSource.includes("catalog-department-index"), "El catálogo nacional no permite explorar los 22 departamentos.");
assert(nationalSource.includes("data-municipality-code") && nationalSource.includes("data-department-code"), "Las tarjetas no conservan identidad territorial verificable.");
assert(nationalSource.includes("catalog-municipality-grid") && nationalSource.includes("catalog-municipality-card"), "La grilla municipal no está aislada del Mapa V70.");
assert(!/export function DepartmentPage\(\)[\s\S]*?export function MunicipalityPage\(\)/.exec(nationalSource)?.[0].includes('className="territory-card"'), "Departamento reutiliza la ficha absoluta del Mapa V70.");
assert(catalogCssSource.includes(".catalog-municipality-card") && catalogCssSource.includes("position: static"), "Las tarjetas del catálogo no neutralizan posicionamiento flotante.");
assert(catalogCssSource.includes("repeat(4, minmax(0, 1fr))") && catalogCssSource.includes("repeat(2, minmax(0, 1fr))") && catalogCssSource.includes("grid-template-columns: 1fr"), "La grilla del catálogo no cubre desktop, tablet y móvil.");
assert(layoutSource.includes('/municipios') && layoutSource.includes('/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg'), "La navegación pública no usa el catálogo o logo oficial.");
assert(indexSource.includes('/brand/radar-isotipo.svg'), "Favicon oficial RADAR ausente.");

const tseGeo = contract.layers.find((layer) => layer.layer_id === "TSE_CENTROS_GEO");
const snip = contract.layers.find((layer) => layer.layer_id === "SNIP_2026");
assert(tseGeo.guardrail.includes("geolocalización") && tseGeo.guardrail.includes("JRV y electores") && tseGeo.guardrail.includes("separadas"), "TSE geográfico mezcló JRV/electores.");
assert(snip.period === "2026" && snip.guardrail.includes("no equivalen a contratos"), "SNIP 2026 mezcló universos.");
assert(!/\b\d{13}\b/.test(read("src/data/radarContract.generated.json")), "Posible DPI detectado en contrato público.");

const preservedUiHashes = {
  "src/components/MunicipalDashboard.tsx": "18cbbc452f2b4fae9bd6ce0b4d22815d939f8b8b5da5d3f2c7bef2531280369f",
  "src/context/MunicipalityContext.tsx": "6e34556c4fbe1ce3a2f74a0c9ff30afaea8319a06cb5c18495dafbdb26857d1d",
  "src/styles/global.css": "1cf04126b387386fd370155b671d81d97271771044a1b1833a2a122d24fbed07",
  "index.html": "3c983bfcbf465c8726eda038ee2cb8dd7658a636604f4abf902bdfb1e02a8a31",
  "src/styles/v70/fonts.css": "cff4e41e8c82d1b7e8b44cc3ceeee2a435819d6d897b6c55dc7f8b62a6969e05",
  "src/styles/v70/globals.css": "72cb2595f0bd5c386c7530a30435f253244e83dfc157ef10ddd47af665bb9a57",
  "src/styles/v70/portal.css": "b7b6e1d529f36a8f57fb201d599a31f59a788d76dee68ab0f4ac9f8c5bcaf7ec",
  "src/styles/v70/radar-brand-v3.css": "2ec7c0b52fe34c51c511b74ebb0e454242e7a17247e4a248f4e23ece8f026554",
  "public/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg": "b73bd230561f9351e02ac84fc08320ab544c6f9d3c131f2823c4a0f97b0c1cec",
  "public/brand/radar-electoral-isotipo.svg": "4f5b1a88be85a10004787215037f5ea58bb5876324c43459715c4a8c28a81a7a",
  "public/brand/radar-isotipo.svg": "4f5b1a88be85a10004787215037f5ea58bb5876324c43459715c4a8c28a81a7a",
  "public/brand/radar-theme.css": "d7ca21806ae121e10edfcd302f8336cf8f7db24fe900b92f2dce66f6ed8f6271",
};
for (const [file, expectedHash] of Object.entries(preservedUiHashes)) {
  assert(sha256(file) === expectedHash, `V70 fue modificada: ${file}`);
}

console.log(
  `SMOKE_RECONCILED_OK ${pairKeys.size}/5780 pares · ${municipalityCodes.size}/340 municipios · catálogo ${municipalityCodes.size}/340 · ${departmentCodes.size}/22 departamentos · ${observedLayerIds.length}/17 layer_id · 0 duplicados · 0 cruces · 20 NOT_PUBLISHED · 178 NO_EXPLICIT_ASSOCIATION · 1 NO_RECORD_IN_SOURCE · 0509/1901 correctas · /admin fail-closed · V70 intacta`,
);
