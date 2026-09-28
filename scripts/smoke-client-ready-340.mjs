import assert from "node:assert/strict";
import fs from "node:fs";
import { canViewRadarSection } from "../src/data/radarSectionAccess.ts";

const contract = JSON.parse(fs.readFileSync(new URL("../src/data/radarContract.generated.json", import.meta.url), "utf8"));
const runtime = fs.readFileSync(new URL("../src/data/radarRuntime.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../src/components/MunicipalDashboardV70Runtime.tsx", import.meta.url), "utf8");
const gate = fs.readFileSync(new URL("../src/components/MunicipalityAccessGate.tsx", import.meta.url), "utf8");

const municipalityCodes = Object.keys(contract.nav);
assert.equal(municipalityCodes.length, 340, "El contrato client-ready debe cubrir 340 municipios.");
assert.equal(new Set(Object.values(contract.nav).map((item) => item.department_code)).size, 22, "La cobertura client-ready debe incluir 22 departamentos.");
for (const code of municipalityCodes) {
  assert.match(code, /^\d{4}$/);
  assert.equal(contract.nav[code].route_path, `/municipio/${code}`);
  assert.equal(contract.nav[code].municipality_code, code);
  assert.equal(contract.runtime_gate[code].municipality_code, code);
  assert.equal(contract.runtime_gate[code].status, "PASS");
}

assert.match(runtime, /radar_authorized_runtime_v8/);
assert.match(runtime, /client_readiness/);
assert.match(gate, /resolveAuthorizedRadarConsumer/);
assert.match(gate, /AuthorizedRuntimeProvider/);
assert.match(dashboard, /data-municipality-code/);
assert.match(dashboard, /data-campaign-id/);
assert.match(dashboard, /data-user-role/);
assert.match(dashboard, /data-permissions/);

const allSections = ["inicio", "inteligencia", "estrategia", "directorio", "agenda", "mapa", "dia-d", "recursos", "pulso", "ia-radar", "configuracion"];
const platform = { campaignId: "", userRole: "national_admin", permissions: ["data_vault:read", "admin:access"] };
const newClient = { campaignId: "", userRole: "campaign_viewer", permissions: ["data_vault:read"] };
const campaignViewer = { campaignId: "campaign-1", userRole: "campaign_viewer", permissions: ["data_vault:read", "campaign_vault:read"] };
const pulseViewer = { ...campaignViewer, permissions: [...campaignViewer.permissions, "pulse:read"] };

for (const section of ["inicio", "inteligencia", "mapa", "ia-radar"]) {
  assert.equal(canViewRadarSection(section, platform), true, `${section} debe estar disponible para administración nacional.`);
  assert.equal(canViewRadarSection(section, newClient), true, `${section} debe estar disponible en estado limpio.`);
}
for (const section of ["estrategia", "directorio", "agenda", "dia-d", "recursos"]) {
  assert.equal(canViewRadarSection(section, newClient), false, `${section} no debe abrirse sin campaña.`);
  assert.equal(canViewRadarSection(section, campaignViewer), true, `${section} debe abrirse con Campaign Vault autorizado.`);
}
assert.equal(canViewRadarSection("pulso", campaignViewer), false, "Pulso debe permanecer fuera del carril client-ready general.");
assert.equal(canViewRadarSection("pulso", pulseViewer), true, "Pulso requiere permiso explícito de su carril.");
assert.equal(allSections.filter((section) => canViewRadarSection(section, { campaignId: "", userRole: "campaign_viewer", permissions: [] })).length, 0, "Un contexto sin permisos debe cerrarse por completo.");

console.log("CLIENT_READY_340_SMOKE_OK 340/340 rutas · 22/22 departamentos · runtime v8 · navegación fail-closed");
