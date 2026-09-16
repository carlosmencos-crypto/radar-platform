import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("candidate documents open the individual V70 legal dossier", () => {
  const home = read("src/components/V70DirectHome0509.tsx");
  const strategy = read("src/components/V70DirectStrategyArea0509.tsx");
  assert.match(home, /estrategia-legal\?candidate=\$\{member\.code\}/);
  assert.match(home, /member\.photoUrl/);
  assert.match(strategy, /candidateCategories/);
  assert.match(strategy, /candidate-upload-grid/);
  assert.match(strategy, /uploadCampaignVaultFile/);
  assert.match(strategy, /file_path/);
});

test("directory search updates the canonical result list without an overlay", () => {
  const directory = read("src/components/V70DirectDirectory0509.tsx");
  assert.doesNotMatch(directory, /setSuggestionsOpen/);
  assert.doesNotMatch(directory, /className="elector-name-suggestions"/);
  assert.match(directory, /className="elector-history"/);
  assert.match(directory, /zipSync/);
  assert.match(directory, /carnetPng/);
  assert.match(directory, /V70PhotoEditor/);
  assert.match(directory, /candidatePositions\.map/);
});

test("campaign brand stays synchronized across Inicio, CRM, Communication and Legal", () => {
  const brand = read("src/components/useV70CampaignBrand.ts");
  const identity = read("src/components/V70CampaignIdentity.tsx");
  const strategy = read("src/components/V70DirectStrategyArea0509.tsx");
  const report = read("src/components/V70DirectReport0509.tsx");
  const configuration = read("src/components/V70DirectConfiguration0509.tsx");
  assert.match(brand, /loadCampaignContacts/);
  assert.match(brand, /candidate_position === "Alcalde"/);
  assert.match(identity, /candidatePhotoUrl/);
  assert.match(strategy, /VINCULADO AUTOMÁTICAMENTE/);
  assert.match(strategy, /candidateMember\.photoUrl/);
  assert.match(report, /useV70CampaignBrand/);
  assert.match(report, /Candidato a alcalde: \$\{candidateName\}/);
  assert.match(configuration, /candidatePhotoUrl/);
  assert.match(configuration, /partyName/);
});

test("agenda routes, exports and commitments persist", () => {
  const agenda = read("src/components/V70DirectAgenda0509.tsx");
  const visual = read("src/components/V70ActivityVisual.tsx");
  assert.match(agenda, /V70RouteSnapshot/);
  assert.match(agenda, /downloadActivityPng/);
  assert.match(agenda, /saveCampaignRecord/);
  assert.match(agenda, /COMPROMISO/);
  assert.match(visual, /canvas\.toBlob/);
});

test("report exports retain the deployed application base path", () => {
  const builder = read("src/components/V70DirectReportBuilder.tsx");
  const intelligence = read("src/components/V70DirectIntelligenceExport0509.tsx");
  assert.match(builder, /import\.meta\.env\.BASE_URL/);
  assert.match(intelligence, /import\.meta\.env\.BASE_URL/);
});

test("map renders persisted activity points and routes", () => {
  const map = read("src/components/V70OperationalMap.tsx");
  const styles = read("src/styles/canonical-adapter.css");
  assert.match(map, /loadCampaignBundle/);
  assert.match(map, /visibleActivities/);
  assert.match(map, /L\.polyline/);
  assert.match(map, /agenda-map-marker/);
  assert.match(map, /activity-coverage-zone/);
  assert.match(map, /radius: 1500/);
  assert.match(map, /Referencia territorial aproximada dentro del municipio/);
  assert.match(map, /setStatusFilter/);
  assert.match(map, /setResponsibleFilter/);
  assert.match(map, /useState\("todos"\)/);
  assert.match(map, /concentracion: false/);
  assert.match(map, /agenda: true/);
  assert.match(map, /viewBox="0 0 36 42"/);
  assert.doesNotMatch(styles, /\.agenda-map-marker\{[^}]*rotate\(-45deg\)/);
});

test("Día D consumes CRM fiscales and persists JRV assignments", () => {
  const dayD = read("src/components/V70DirectDayD0509.tsx");
  assert.match(dayD, /loadCampaignContacts/);
  assert.match(dayD, /ASIGNACION_JRV/);
  assert.match(dayD, /saveCampaignRecord/);
  assert.match(dayD, /day-d-center-jrv-list/);
  assert.match(dayD, /assignmentRows\.length/);
  assert.match(dayD, /Generar acceso/);
  assert.match(dayD, /ACCESO_FISCAL/);
  assert.match(dayD, /LOGISTICA/);
  assert.match(dayD, /saveLogistics/);
});

test("Inicio reflects Agenda and commitment state", () => {
  const home = read("src/components/V70DirectHome0509.tsx");
  assert.match(home, /loadCampaignBundle/);
  assert.match(home, /loadCampaignRecords/);
  assert.match(home, /activitiesToday/);
  assert.match(home, /coveredTerritories/);
  assert.match(home, /coveredTerritories \/ 81/);
});

test("private files and Recursos persist instead of exposing inert controls", () => {
  const runtime = read("src/data/radarRuntime.ts");
  const resources = read("src/components/V70DirectResources0509.tsx");
  const storage = read("supabase/migrations/20260916145500_campaign_vault_private_storage.sql");
  assert.match(runtime, /uploadCampaignVaultFile/);
  assert.match(runtime, /downloadCampaignVaultFile/);
  assert.match(runtime, /deleteCampaignVaultFile/);
  assert.match(resources, /saveCampaignRecord/);
  assert.match(resources, /uploadCampaignVaultFile/);
  assert.match(resources, /onSubmit=\{submit\}/);
  assert.match(resources, /onSubmit=\{createFolder\}/);
  assert.match(resources, /onSubmit=\{uploadAsset\}/);
  assert.match(storage, /public = excluded\.public/);
  assert.match(storage, /for select to authenticated/);
  assert.match(storage, /for insert to authenticated/);
  assert.match(storage, /private\.is_campaign_member/);
  assert.doesNotMatch(storage, /service_role/);
});
