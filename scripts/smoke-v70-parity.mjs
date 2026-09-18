import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const gate = read("src/components/MunicipalityAccessGate.tsx");
const shell = read("src/components/V70DirectShell0509.tsx");
const operationalMap = read("src/components/V70OperationalMap.tsx");
const ecosystem = read("src/components/V70Ecosystem0509.tsx");
const goldenLock = JSON.parse(read("reference/v70/V70_GOLDEN_SOURCE_LOCK.json"));
const routes = [
  ["inicio", "V70DirectHome0509.tsx", "V70DirectHome0509"], ["inteligencia", "V70DirectIntelligence0509.tsx", "V70DirectIntelligence0509"], ["estrategia", "V70DirectStrategy0509.tsx", "V70DirectStrategy0509"], ["directorio", "V70DirectDirectory0509.tsx", "V70DirectDirectory0509"], ["agenda", "V70DirectAgenda0509.tsx", "V70DirectAgenda0509"], ["mapa", "V70DirectMap0509.tsx", "V70DirectMap0509"], ["dia-d", "V70DirectDayD0509.tsx", "V70DirectDayD0509"], ["recursos", "V70DirectResources0509.tsx", "V70DirectResources0509"], ["pulso", "V70DirectPulse0509.tsx", "V70DirectPulse0509"], ["ia-radar", "V70DirectAi0509.tsx", "V70DirectAi0509"], ["configuracion", "V70DirectConfiguration0509.tsx", "V70DirectConfiguration0509"],
];
assert(goldenLock.source_archive?.sha256 === "964d06fb25ea95832b3c28c49b192de315e3b42337be4abb44940d499a2e41d2", "Canonical V70 source archive lock drifted.");
assert(gate.includes('municipalityCode === "0509"'), "0509 direct routing gate is missing.");
assert(gate.includes("direct0509(section)"), "0509 direct route dispatcher is not active.");
for (const [slug, file, component] of routes) { const source = read(`src/components/${file}`); assert(gate.includes(`<${component} />`), `0509 ${slug} is not routed through ${component}.`); assert(!source.includes("createPortal"), `${component} must not use React portals.`); assert(!source.includes("querySelector"), `${component} must not query/mutate the existing shell DOM.`); assert(!source.includes("insertAdjacentElement"), `${component} must not splice DOM nodes.`); assert(source.includes("V70DirectShell0509"), `${component} must use the direct canonical shell.`); }
for (const bridge of ["V70HomeParityBridge","V70ElectoralParityBridge","V70StrategyParityBridge","V70DirectoryParityBridge","V70AgendaParityBridge","V70MapParityBridge","V70DayDParityBridge","V70ResourcesParityBridge","V70PulseParityBridge","V70AiParityBridge","V70ConfigurationParityBridge","V70ClientChromeParityBridge","V70ProductParityBridge"]) assert(!gate.includes(bridge), `Legacy DOM bridge still mounted by access gate: ${bridge}`);

assert(!shell.includes("createPortal") && !shell.includes("querySelector"), "Direct 0509 shell must not mutate a pre-existing shell.");
assert(shell.includes("Carlos Mencos") && shell.includes("Sesión protegida") && shell.includes("Cerrar sesión"), "Canonical V70 account block is incomplete.");
for (const asset of ["radar-electoral-logo-horizontal-oscuro-transparente.svg","radar-electoral-isotipo.svg","radar-isotipo.svg"]) assert(shell.includes(asset), `Official V70 asset missing: ${asset}`);
assert(shell.includes("Reporte PDF") && shell.includes("Municipio <b>0509</b>"), "Canonical V70 top controls are incomplete.");
assert(shell.includes('slug==="dia-d"&&dayDNext') && shell.includes("PRÓXIMO"), "Canonical Intelligence-only Día D próximo marker support is missing.");

const directHome = read("src/components/V70DirectHome0509.tsx");
const campaignIdentity = read("src/components/V70CampaignIdentity.tsx");
const directMap = read("src/components/V70DirectMap0509.tsx");
const directIntelligence = read("src/components/V70DirectIntelligence0509.tsx");
const directDirectory = read("src/components/V70DirectDirectory0509.tsx");
const directStrategy = read("src/components/V70DirectStrategy0509.tsx");
const directAgenda = read("src/components/V70DirectAgenda0509.tsx");
const directDayD = read("src/components/V70DirectDayD0509.tsx");
const directResources = read("src/components/V70DirectResources0509.tsx");
const directPulse = read("src/components/V70DirectPulse0509.tsx");
const directAi = read("src/components/V70DirectAi0509.tsx");
const directConfiguration = read("src/components/V70DirectConfiguration0509.tsx");

assert(directHome.includes("BUENOS DÍAS") && directHome.includes("BUENAS TARDES") && directHome.includes("BUENAS NOCHES") && directHome.includes("CARLOS"), "Canonical time-aware Carlos greeting is missing from Inicio.");
assert(campaignIdentity.includes("Perfil de ${candidateName}") && campaignIdentity.includes("Candidato a alcalde · {municipality_name}"), "Canonical 0509 campaign identity copy drifted on Inicio.");
assert(campaignIdentity.includes('className="party-signature party-signature-trigger"') && campaignIdentity.includes("saveCampaignIdentity") && directHome.includes("TERRITORIO CUBIERTO") && directHome.includes("Planilla Municipal"), "Canonical Inicio structure or persisted identity action is incomplete.");
assert(!directHome.includes("Campaign Vault listo para asociar"), "Non-canonical Campaign Vault placeholder returned to Inicio.");

for (const forbidden of ["QA-000", "Persona de prueba", "5555 000", "QA PRIVADO", "PRIVADO · QA"]) assert(!directDirectory.includes(forbidden), `Invented private directory fixture leaked into V70 parity: ${forbidden}`);
assert(directDirectory.includes("36_878") && directDirectory.includes("148") && directDirectory.includes("RESULTADOS") && directDirectory.includes("loadAuthorizedVoterDirectory"), "Canonical V70 elector-directory baseline/runtime drifted.");
assert(directDirectory.includes("CAMPAIGN VAULT · PRIVADO") && directDirectory.includes("El Directorio está listo para recibir tu base."), "Canonical empty team-directory state is missing.");
assert(!directStrategy.includes("sesión QA") && !directAgenda.includes("Campaign Vault QA"), "QA-only copy leaked into direct V70 client surfaces.");

assert(directDayD.includes("window.location.hash") && directDayD.includes("23-${id.padStart(3") && directDayD.includes("CEM ·") && directDayD.includes("radar-portal-fiscal.carlos-mencos.chatgpt.site") && directDayD.includes("JRV con RTD recibido"), "Canonical Día D navigation/reference controls drifted.");
for (const label of ["Manuales","Checklists","Plantillas","Tutoriales y Capacitación","Fotografías oficiales","Logotipos","Piezas de campaña","Material para medios"]) assert(directResources.includes(label), `Canonical Recursos label missing: ${label}`);
assert(directResources.includes("BIBLIOTECA · DOCUMENTOS PRECARGADOS") && directResources.includes("BANCO OFICIAL") && directResources.includes("Banco oficial listo para recibir piezas."), "Canonical Recursos initial modal/empty states are incomplete.");
assert(directPulse.includes("SIMULACIÓN VISUAL") && directPulse.includes("No es una encuesta ni un resultado electoral."), "Canonical Pulso demonstration guardrail drifted.");
assert(directAi.includes("https://js.puter.com/v2/") && directAi.includes("Conectar Puter") && directAi.includes("radar-ai-workbench") && directAi.includes("Preparar propuesta"), "Canonical IA RADAR Puter workbench is incomplete.");
assert(directConfiguration.includes("radar-user-photo-v2") && directConfiguration.includes("/signout-with-chatgpt?return_to=%2Flogin") && directConfiguration.includes("El alcance está protegido por la sesión."), "Canonical Configuración session/profile behavior drifted.");

assert(directMap.includes("<V70OperationalMap />") && directMap.includes('eyebrow="TERRITORIO Y OPERACIÓN"'), "Direct 0509 map does not render canonical operational map chrome.");
assert(operationalMap.includes("TERRITORIOS DE RADAR") && operationalMap.includes("LUGARES Y DIRECCIONES") && operationalMap.includes("nominatim.openstreetmap.org/search"), "Canonical territorial map search is incomplete.");
assert(directAgenda.includes("saveCampaignActivity") && directAgenda.includes("Nueva actividad"), "Agenda activity creation is not connected to Campaign Vault.");
for (const source of [directHome, directStrategy, directAgenda, directDayD, directConfiguration]) assert(!source.includes('to="../'), "A direct V70 control can still escape its municipal route.");
for (const mapToken of [
  'className="operational-map-toolbar"',
  'className="map-head-stats"',
  'className="map-search-wrap map-toolbar-search"',
  'className="map-search"',
  'className="map-search-suggestions"',
  'className="smart-layers toolbar-layers"',
  'className="activity-filter toolbar-activity-filter"',
  'className="route-visibility"',
  'className="map-satellite-toggle"',
  'className="map-electoral-priorities"',
  'className="smart-map-shell map-v3"',
]) assert(operationalMap.includes(mapToken), `Canonical operational map token missing: ${mapToken}`);
assert(operationalMap.includes("map-layer-${key}"), "Canonical operational map dynamic layer class vocabulary is missing.");
assert(operationalMap.includes("getInstalledRadarVoterCommunities"), "Authorized aggregate community runtime is missing from operational map.");
assert(!operationalMap.includes("map-stat-chip") && !operationalMap.includes('className="map-privacy"'), "Non-canonical operational map chrome returned.");
assert(directIntelligence.includes("<V70ElectoralTerritory") && directIntelligence.includes("<V70CanonicalRich0509") && directIntelligence.includes("<V70Ecosystem0509"), "Direct Intelligence is missing canonical V70 depth components.");
assert(directIntelligence.includes('eyebrow="EXPEDIENTE MUNICIPAL 360"') && directIntelligence.includes('topbarTitle="San José / Puerto San José"') && directIntelligence.includes('accountRole="Cuenta del municipio"') && directIntelligence.includes("dayDNext"), "Intelligence chrome drifted from canonical V70 0509.");
assert(directIntelligence.includes("EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — PUERTO SAN JOSÉ") && !directIntelligence.includes("FUENTES Y TRAZABILIDAD") && !directIntelligence.includes("canonical-coverage-secondary"), "Canonical Intelligence copy/tail guardrail failed.");
assert(ecosystem.includes("PORTAL RADAR · VISIÓN DE PRODUCTO") && ecosystem.includes("De la evidencia a la operación diaria") && ecosystem.includes("RADAR Data Vault") && ecosystem.includes("Campaign Vault") && ecosystem.includes("≠"), "Canonical product-vision footer is incomplete.");

console.log(`V70_PARITY_SMOKE_OK ${routes.length}/11 routes direct-rendered · canonical source lock verified · no mounted portal bridges · no invented directory fixtures · direct route controls guarded`);
