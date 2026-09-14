import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const gate = read("src/components/MunicipalityAccessGate.tsx");
const shell = read("src/components/V70DirectShell0509.tsx");
const operationalMap = read("src/components/V70OperationalMap.tsx");
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

for (const bridge of [
  "V70HomeParityBridge",
  "V70ElectoralParityBridge",
  "V70StrategyParityBridge",
  "V70DirectoryParityBridge",
  "V70AgendaParityBridge",
  "V70MapParityBridge",
  "V70DayDParityBridge",
  "V70ResourcesParityBridge",
  "V70PulseParityBridge",
  "V70AiParityBridge",
  "V70ConfigurationParityBridge",
  "V70ClientChromeParityBridge",
  "V70ProductParityBridge",
]) assert(!gate.includes(bridge), `Legacy DOM bridge still mounted by access gate: ${bridge}`);

assert(!shell.includes("createPortal"), "Direct 0509 shell must not use React portals.");
assert(!shell.includes("querySelector"), "Direct 0509 shell must not mutate/query a pre-existing shell.");
assert(shell.includes("Carlos Mencos"), "Canonical 0509 account copy is missing.");
assert(shell.includes("radar-electoral-logo-horizontal-oscuro-transparente.svg"), "Official V70 expanded logo is missing.");
assert(shell.includes("radar-electoral-isotipo.svg"), "Official V70 collapsed logo is missing.");
assert(shell.includes("radar-isotipo.svg"), "Official V70 topbar mark is missing.");
assert(shell.includes("Reporte PDF") && shell.includes("Municipio <b>0509</b>"), "Canonical V70 top controls are incomplete.");

const directMap = read("src/components/V70DirectMap0509.tsx");
const directIntelligence = read("src/components/V70DirectIntelligence0509.tsx");
assert(directMap.includes("<V70OperationalMap />"), "Direct 0509 map does not render the canonical operational map component.");
assert(operationalMap.includes('className="operational-map-toolbar"'), "Canonical map toolbar is missing.");
assert(operationalMap.includes('className="map-satellite-toggle"'), "Canonical satellite control is missing.");
assert(operationalMap.includes("getInstalledRadarVoterCommunities"), "Canonical map is not connected to authorized voter-community aggregates.");
assert(directIntelligence.includes("<V70ElectoralTerritory") && directIntelligence.includes("<V70CanonicalRich0509") && directIntelligence.includes("<V70Ecosystem0509"), "Direct Intelligence is missing canonical V70 depth components.");
assert(!directIntelligence.includes("FUENTES Y TRAZABILIDAD") && !directIntelligence.includes("canonical-coverage-secondary"), "Non-canonical traceability tail returned to Intelligence.");

console.log(`V70_PARITY_SMOKE_OK ${routes.length}/11 routes direct-rendered · no mounted portal bridges · canonical 0509 shell preserved`);
