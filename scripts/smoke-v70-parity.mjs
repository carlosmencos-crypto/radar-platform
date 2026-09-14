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
  ["inicio", "V70DirectHome0509.tsx", "V70DirectHome0509"],
  ["inteligencia", "V70DirectIntelligence0509.tsx", "V70DirectIntelligence0509"],
  ["estrategia", "V70DirectStrategy0509.tsx", "V70DirectStrategy0509"],
  ["directorio", "V70DirectDirectory0509.tsx", "V70DirectDirectory0509"],
  ["agenda", "V70DirectAgenda0509.tsx", "V70DirectAgenda0509"],
  ["mapa", "V70DirectMap0509.tsx", "V70DirectMap0509"],
  ["dia-d", "V70DirectDayD0509.tsx", "V70DirectDayD0509"],
  ["recursos", "V70DirectResources0509.tsx", "V70DirectResources0509"],
  ["pulso", "V70DirectPulse0509.tsx", "V70DirectPulse0509"],
  ["ia-radar", "V70DirectAi0509.tsx", "V70DirectAi0509"],
  ["configuracion", "V70DirectConfiguration0509.tsx", "V70DirectConfiguration0509"],
];

assert(goldenLock.source_archive?.sha256 === "964d06fb25ea95832b3c28c49b192de315e3b42337be4abb44940d499a2e41d2", "Canonical V70 source archive lock drifted.");
assert(gate.includes('municipalityCode === "0509"'), "0509 direct routing gate is missing.");
assert(gate.includes("direct0509(section)"), "0509 direct route dispatcher is not active.");
for (const [slug, file, component] of routes) {
  const source = read(`src/components/${file}`);
  assert(gate.includes(`<${component} />`), `0509 ${slug} is not routed through ${component}.`);
  assert(!source.includes("createPortal"), `${component} must not use React portals.`);
  assert(!source.includes("querySelector"), `${component} must not query/mutate the existing shell DOM.`);
  assert(!source.includes("insertAdjacentElement"), `${component} must not splice DOM nodes.`);
  assert(source.includes("V70DirectShell0509"), `${component} must use the direct canonical shell.`);
}

for (const bridge of ["V70HomeParityBridge","V70ElectoralParityBridge","V70StrategyParityBridge","V70DirectoryParityBridge","V70AgendaParityBridge","V70MapParityBridge","V70DayDParityBridge","V70ResourcesParityBridge","V70PulseParityBridge","V70AiParityBridge","V70ConfigurationParityBridge","V70ClientChromeParityBridge","V70ProductParityBridge"]) assert(!gate.includes(bridge), `Legacy DOM bridge still mounted by access gate: ${bridge}`);

assert(!shell.includes("createPortal"), "Direct 0509 shell must not use React portals.");
assert(!shell.includes("querySelector"), "Direct 0509 shell must not mutate/query a pre-existing shell.");
assert(shell.includes("Carlos Mencos") && shell.includes("Sesión protegida") && shell.includes("Cerrar sesión"), "Canonical V70 account block is incomplete.");
assert(shell.includes("radar-electoral-logo-horizontal-oscuro-transparente.svg"), "Official V70 expanded logo is missing.");
assert(shell.includes("radar-electoral-isotipo.svg"), "Official V70 collapsed logo is missing.");
assert(shell.includes("radar-isotipo.svg"), "Official V70 topbar mark is missing.");
assert(shell.includes("Reporte PDF") && shell.includes("Municipio <b>0509</b>"), "Canonical V70 top controls are incomplete.");
assert(!shell.includes("PRÓXIMO"), "Non-canonical navigation marker was added to the V70 shell.");

const directHome = read("src/components/V70DirectHome0509.tsx");
const directMap = read("src/components/V70DirectMap0509.tsx");
const directIntelligence = read("src/components/V70DirectIntelligence0509.tsx");
const directDirectory = read("src/components/V70DirectDirectory0509.tsx");
const directStrategy = read("src/components/V70DirectStrategy0509.tsx");
const directAgenda = read("src/components/V70DirectAgenda0509.tsx");
const directPulse = read("src/components/V70DirectPulse0509.tsx");

assert(directHome.includes("BUENOS DÍAS") && directHome.includes("BUENAS TARDES") && directHome.includes("BUENAS NOCHES") && directHome.includes("CARLOS"), "Canonical time-aware Carlos greeting is missing from Inicio.");
assert(directHome.includes('aria-label="Perfil de Nombre Apellido">NA</i>') && directHome.includes("Candidato a alcalde · San José / Puerto San José"), "Canonical 0509 campaign identity copy drifted on Inicio.");
assert(directHome.includes('className="party-signature party-signature-trigger"'), "Canonical campaign identity trigger structure is missing on Inicio.");
assert(directHome.includes("TERRITORIO CUBIERTO") && directHome.includes("Revisar pendientes →") && directHome.includes("Planilla Municipal"), "Canonical Inicio operational summary is incomplete.");
assert(!directHome.includes("Campaign Vault listo para asociar"), "Non-canonical Campaign Vault placeholder returned to the configured V70 home hero.");

for (const forbidden of ["QA-000", "Persona de prueba", "5555 000", "QA PRIVADO", "PRIVADO · QA"]) assert(!directDirectory.includes(forbidden), `Invented private directory fixture leaked into V70 parity: ${forbidden}`);
assert(directDirectory.includes("36,878") && directDirectory.includes("148") && directDirectory.includes("RESULTADOS"), "Canonical V70 elector-directory baseline drifted.");
assert(directDirectory.includes("CAMPAIGN VAULT · PRIVADO") && directDirectory.includes("El Directorio está listo para recibir tu base."), "Canonical empty team-directory state is missing.");
assert(!directStrategy.includes("sesión QA") && !directAgenda.includes("Campaign Vault QA"), "QA-only copy leaked into direct V70 client surfaces.");
assert(directPulse.includes("SIMULACIÓN VISUAL") && directPulse.includes("No es una encuesta ni un resultado electoral."), "Canonical Pulso demonstration guardrail drifted.");

assert(directMap.includes("<V70OperationalMap />"), "Direct 0509 map does not render the canonical operational map component.");
assert(directMap.includes('eyebrow="TERRITORIO Y OPERACIÓN"') && directMap.includes('topbarTitle="San José / Puerto San José · Escuintla"'), "Direct map chrome drifted from V70 0509.");
assert(operationalMap.includes('className="operational-map-toolbar"'), "Canonical map toolbar is missing.");
assert(operationalMap.includes('className="map-satellite-toggle"'), "Canonical satellite control is missing.");
assert(operationalMap.includes("getInstalledRadarVoterCommunities"), "Canonical map is not connected to authorized voter-community aggregates.");
assert(directIntelligence.includes("<V70ElectoralTerritory") && directIntelligence.includes("<V70CanonicalRich0509") && directIntelligence.includes("<V70Ecosystem0509"), "Direct Intelligence is missing canonical V70 depth components.");
assert(directIntelligence.includes('eyebrow="EXPEDIENTE MUNICIPAL 360"') && directIntelligence.includes('topbarTitle="San José / Puerto San José"') && directIntelligence.includes('accountRole="Cuenta del municipio"'), "Intelligence chrome drifted from the canonical V70 0509 reference.");
assert(directIntelligence.includes("EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — PUERTO SAN JOSÉ") && directIntelligence.includes("Fotografía estratégica del municipio para definir mensajes y prioridades"), "Canonical Intelligence heading copy is missing.");
assert(!directIntelligence.includes("FUENTES Y TRAZABILIDAD") && !directIntelligence.includes("canonical-coverage-secondary"), "Non-canonical traceability tail returned to Intelligence.");
assert(ecosystem.includes("PORTAL RADAR · VISIÓN DE PRODUCTO") && ecosystem.includes("De la evidencia a la operación diaria"), "Canonical V70 product-vision footer is missing.");
assert(ecosystem.includes("RADAR Data Vault") && ecosystem.includes("Campaign Vault") && ecosystem.includes("≠"), "Canonical Data Vault / Campaign Vault separation is missing.");

console.log(`V70_PARITY_SMOKE_OK ${routes.length}/11 routes direct-rendered · canonical source lock verified · no mounted portal bridges · no QA directory fixtures · canonical 0509 home/intelligence/map copy preserved`);
