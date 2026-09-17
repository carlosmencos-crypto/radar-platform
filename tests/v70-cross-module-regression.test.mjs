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
  assert.match(directory, /className="crm-table crm-table-v2"/);
  assert.match(directory, /className="crm-row crm-head"/);
  assert.match(directory, /className="agenda-create-link"/);
  assert.match(directory, /createRadarXlsx/);
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
  assert.match(agenda, /Persona, comunidad o grupo beneficiario/);
  assert.match(agenda, /origin_activity_id/);
  assert.match(agenda, /uploadCampaignVaultFile/);
  assert.match(visual, /canvas\.toBlob/);
  assert.match(agenda, /className="agenda-actions"/);
  assert.match(agenda, /className="agenda-print-action"/);
  assert.match(agenda, /className="agenda-delete-action"/);
});

test("strategy workspaces keep the approved V70 vocabulary and functional exports", () => {
  const strategy = read("src/components/V70DirectStrategyArea0509.tsx");
  const xlsx = read("src/data/xlsxExport.ts");
  for (const source of ["PDM-OT", "INE 2018", "PDM-OT 2015", "Perfil municipal"]) assert.match(strategy, new RegExp(source));
  assert.match(strategy, /communication-folder-delete/);
  assert.match(strategy, /createRadarXlsx/);
  assert.match(strategy, /finance-budget-detail/);
  assert.match(strategy, /candidate-upload-grid/);
  assert.match(xlsx, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(xlsx, /xl\/worksheets\/sheet/);
});

test("report exports retain the deployed application base path", () => {
  const builder = read("src/components/V70DirectReportBuilder.tsx");
  const intelligence = read("src/components/V70DirectIntelligenceExport0509.tsx");
  const report = read("src/components/V70DirectReport0509.tsx");
  assert.match(builder, /import\.meta\.env\.BASE_URL/);
  assert.match(intelligence, /import\.meta\.env\.BASE_URL/);
  assert.match(builder, /Gráficas ejecutivas/);
  assert.match(report, /report-candidate-grid/);
  assert.match(report, /report-chart-grid/);
  assert.match(report, /Plan de campaña y próximas actividades/);
  assert.match(report, /partyLogoUrl/);
  assert.match(report, /candidate\.photo_url/);
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
  assert.match(dayD, /Movilización de electores/);
  assert.match(dayD, /Equipo del centro/);
  assert.match(dayD, /rtdElectionTypes/);
  assert.match(dayD, /day-d-actas-progress/);
  assert.match(dayD, /SUPERVISIÓN EN TIEMPO REAL/);
  assert.match(dayD, /Rutas \/ traslados/);
  assert.match(dayD, /Porciones de comida previstas/);
  assert.match(dayD, /Recargas planificadas/);
});

test("responsible voter filtering stays server-side and campaign-scoped", () => {
  const directory = read("src/components/V70DirectDirectory0509.tsx");
  const runtime = read("src/data/radarRuntime.ts");
  const migration = read("supabase/migrations/20260916193139_filter_voter_directory_by_responsible.sql");
  assert.match(directory, /responsible,/);
  assert.match(runtime, /p_responsible: filters\.responsible/);
  assert.match(migration, /p_responsible uuid/);
  assert.match(migration, /v\.assigned_contact_id=p_responsible/);
  assert.match(migration, /security invoker/);
});

test("V70 typography uses the canonical variable font without synthetic weight", () => {
  const styles = read("src/styles/canonical-adapter.css");
  const fonts = read("src/styles/v70/fonts.css");
  assert.match(styles, /font-synthesis:\s*none/);
  assert.match(fonts, /font-weight:\s*100 900/);
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
