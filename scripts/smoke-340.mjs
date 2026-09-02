import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const municipalitiesSource = read("src/data/municipalities.ts");
const consumerSource = read("src/data/radarConsumer.ts");
const dashboardSource = read("src/components/MunicipalDashboard.tsx");
const contextSource = read("src/context/MunicipalityContext.tsx");
const appSource = read("src/app/App.tsx");
const nationalSource = read("src/app/pages.tsx");
const fontSource = read("src/styles/v70/fonts.css");

const municipalityRows = [...municipalitiesSource.matchAll(
  /\{ code: "(\d{4})", departmentCode: "(\d{2})", name: "([^"]+)",(?: displayName: "[^"]+",)? department: "([^"]+)"/g,
)].map((match) => ({ code: match[1], departmentCode: match[2], name: match[3], department: match[4] }));
const unique = new Set(municipalityRows.map((row) => row.code));
const expectedSections = [
  "inicio",
  "inteligencia",
  "estrategia",
  "directorio",
  "agenda",
  "mapa",
  "dia-d",
  "recursos",
  "pulso",
  "ia-radar",
  "configuracion",
];

function fail(message) {
  throw new Error(message);
}

if (municipalityRows.length !== 340 || unique.size !== 340) {
  fail(`Contrato inválido: ${municipalityRows.length} filas, ${unique.size} códigos únicos.`);
}

for (const row of municipalityRows) {
  if (!/^\d{4}$/.test(row.code) || row.departmentCode !== row.code.slice(0, 2)) {
    fail(`Código territorial inválido: ${JSON.stringify(row)}`);
  }
  for (const section of expectedSections) {
    const route = section === "inicio" ? `/municipio/${row.code}` : `/municipio/${row.code}/${section}`;
    if (!route.startsWith(`/municipio/${row.code}`)) fail(`Contexto perdido: ${route}`);
  }
}

const golden = municipalityRows.find((row) => row.code === "0509");
const external = municipalityRows.find((row) => row.code === "1901");
if (golden?.name !== "San José" || golden.department !== "Escuintla") {
  fail(`Golden route 0509 incorrecta: ${JSON.stringify(golden)}`);
}
if (external?.name !== "Zacapa" || external.department !== "Zacapa") {
  fail(`Ruta externa 1901 incorrecta: ${JSON.stringify(external)}`);
}

const publicContract = consumerSource.match(/const publicModules = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
const campaignContract = consumerSource.match(/const campaignModules = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
const publicCount = [...publicContract.matchAll(/\["[^"]+",\s*"[^"]+"\]/g)].length;
const campaignCount = [...campaignContract.matchAll(/\["[^"]+",\s*"[^"]+"\]/g)].length;
if (publicCount + campaignCount !== 17) {
  fail(`Consumer distinto de 340×17: ${publicCount} públicos + ${campaignCount} privados.`);
}

for (const section of expectedSections) {
  if (!dashboardSource.includes(`"${section}"`)) fail(`Sidebar incompleto: falta ${section}.`);
}
for (const requiredClass of ["portal-shell", "portal-sidebar", "portal-topbar", "command-hero", "home-welcome"]) {
  if (!dashboardSource.includes(requiredClass)) fail(`Shell V70 incompleto: falta ${requiredClass}.`);
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
  if (!dashboardSource.includes(requiredGoldenUi)) fail(`Golden UI V70 incompleta: falta ${requiredGoldenUi}.`);
}
if (!dashboardSource.includes("canonical-coverage-secondary") || !dashboardSource.includes("<details")) {
  fail("La cobertura 340×17 no quedó como información secundaria de Inteligencia Municipal.");
}
for (const fontFile of ["inter-1ab1ad55.woff2", "inter-749a3084.woff2"]) {
  if (!fontSource.includes(fontFile)) fail(`Fuente canónica V70 no conectada: ${fontFile}.`);
}
for (const asset of [
  "/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg",
  "/brand/radar-electoral-isotipo.svg",
  "/brand/radar-isotipo.svg",
]) {
  if (!dashboardSource.includes(asset)) fail(`Asset oficial no conectado: ${asset}.`);
}
if (!dashboardSource.includes("data-municipality-code") || !dashboardSource.includes("data-campaign-id") || !dashboardSource.includes("data-user-role")) {
  fail("La clave de contexto completa no está materializada en el shell.");
}
for (const contextField of ["municipality_code", "municipality_name", "department_code", "department_name", "campaign_id", "user_role", "permissions"]) {
  if (!contextSource.includes(contextField)) fail(`MunicipalityContext incompleto: falta ${contextField}.`);
}
if (dashboardSource.includes('=== "0509"') || consumerSource.includes('=== "0509"')) {
  fail("El shell o consumer contienen lógica municipal fijada a 0509.");
}
if (!appSource.includes('path="admin"') || !appSource.includes("<Navigate to=\"/acceso-restringido\" replace")) {
  fail("/admin no está fail-closed.");
}

const catalogBlock = nationalSource.match(/const catalogMunicipalities = useMemo\(\(\) =>([\s\S]*?),\n    \[\],\n  \);/)?.[1] ?? "";
if (!catalogBlock.includes("[...municipalities].sort")) {
  fail("El catálogo raíz no deriva de los 340 municipios nacionales.");
}
if (!nationalSource.includes("catalogMunicipalities.map")) {
  fail("El catálogo raíz no renderiza el listado municipal completo.");
}
if (!nationalSource.includes("national-territory-grid") || !nationalSource.includes("national-territory-card")) {
  fail("El catálogo raíz no está aislado de los selectores CSS del Mapa V70.");
}
if (!nationalSource.includes("<h2>Municipios de Guatemala</h2>")) {
  fail("Falta el encabezado del catálogo nacional.");
}
if (nationalSource.includes("priorityCodes") || nationalSource.includes("priorityMunicipalities")) {
  fail("El catálogo raíz conserva el listado prioritario parcial como fuente principal.");
}

const htaccess = read("public/.htaccess");
const redirects = read("public/_redirects");
if (!htaccess.includes("RewriteRule . /index.html [L]") || !redirects.includes("/* /index.html 200")) {
  fail("Falta el fallback SPA para refresh directo.");
}

const dist = path.join(root, "dist");
if (fs.existsSync(dist)) {
  const files = fs.readdirSync(dist);
  for (const forbiddenFile of ["campaign-candidate-demo.jpg", "campaign-party-logo-demo.jpg"]) {
    if (files.includes(forbiddenFile)) fail(`Asset de campaña incluido en dist: ${forbiddenFile}`);
  }
  const js = fs.readdirSync(path.join(dist, "assets"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => read(path.join("dist/assets", file)))
    .join("\n");
  for (const forbiddenText of ["Carlos Enrique Mencos Morales", "Ana Ruiz", "María José Garrido"]) {
    if (js.includes(forbiddenText)) fail(`Dato privado o de prueba incluido en bundle: ${forbiddenText}`);
  }
}

console.log(
  `SMOKE_OK ${unique.size}/340 municipios · catálogo ${unique.size}/340 · 17 módulos · ${expectedSections.length} secciones · ${unique.size * expectedSections.length} rutas contextuales · 0509 y 1901 correctas`,
);
