import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const gate = read("src/components/MunicipalityAccessGate.tsx");
const directMap = read("src/components/V70DirectMap0509.tsx");
const operationalMap = read("src/components/V70OperationalMap.tsx");

assert(gate.includes('municipalityCode === "0509" && section === "mapa"'), "0509 map is not routed through the direct V70 surface.");
assert(gate.includes("<V70DirectMap0509 />"), "Direct 0509 map surface is not mounted.");
assert(!gate.includes("V70MapParityBridge"), "Legacy map portal bridge is still mounted by the access gate.");
assert(!directMap.includes("createPortal"), "Direct 0509 map surface must not use React portals.");
assert(!directMap.includes("querySelector"), "Direct 0509 map surface must not mutate/query the existing DOM shell.");
assert(!directMap.includes("insertAdjacentElement"), "Direct 0509 map surface must not splice DOM nodes.");
assert(directMap.includes("<V70OperationalMap />"), "Direct 0509 map does not render the canonical operational map component.");
assert(directMap.includes("San José / Puerto San José · Escuintla"), "0509 canonical chrome copy is missing from the direct map surface.");
assert(operationalMap.includes('className="operational-map-toolbar"'), "Canonical map toolbar is missing.");
assert(operationalMap.includes('className="map-satellite-toggle"'), "Canonical satellite control is missing.");
assert(operationalMap.includes("getInstalledRadarVoterCommunities"), "Canonical map is not connected to authorized voter-community aggregates.");

console.log("V70_PARITY_SMOKE_OK 0509 map direct-rendered · no portal bridge · canonical controls present");
