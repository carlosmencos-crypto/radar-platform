import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("src/app/App.tsx");
const municipalRtd = read("src/components/V70DirectDayD0509.tsx");
const nationalRtd = read("src/admin/NationalRtd.tsx");
const migration = read("supabase/migrations/20260928191500_connect_canonical_rtd_dashboards.sql");

test("integral release retains municipal, access and superadmin routes", () => {
  assert.match(app, /path="mis-municipios"/);
  assert.match(app, /path="admin\/:section\?"/);
  assert.match(app, /path="municipio\/:municipalityCode\/:section\?"/);
  assert.match(app, /path="municipios\/:demoCode"/);
});

test("municipal RTD derives coverage and results from canonical folios", () => {
  assert.match(municipalRtd, /record\.category === "RTD_FOLIO"/);
  assert.match(municipalRtd, /Boolean\(record\.payload\.is_demo\) === is_demo/);
  assert.match(municipalRtd, /!record\.payload\.is_test/);
  assert.match(municipalRtd, /new Set\(submittedRtdRows\.map/);
  assert.match(municipalRtd, /rtdResultRows\.map/);
  assert.match(municipalRtd, /Los folios demo nunca se suman a resultados reales/);
});

test("superadmin RTD requests an environment-isolated canonical rollup", () => {
  assert.match(nationalRtd, /runAdminAction<Rollup>\("national_rtd"/);
  assert.match(nationalRtd, /data_mode: mode/);
  assert.match(nationalRtd, /option value="REAL"/);
  assert.match(nationalRtd, /option value="DEMO"/);
  for (const election of ["CORPORACION_MUNICIPAL", "DIP_DIST", "DIP_NAC", "DIP_PAR", "PRESIDENTE"]) {
    assert.match(nationalRtd, new RegExp(`"${election}"`));
  }
});

test("database publication and national aggregation preserve demo isolation and service boundaries", () => {
  assert.match(migration, /case when folio_row\.is_demo then 'demo_vault' else 'campaign_vault' end/);
  assert.match(migration, /where c\.is_demo = \(data_mode = 'DEMO'\)/);
  assert.match(migration, /and f\.is_demo = \(data_mode = 'DEMO'\)/);
  assert.match(migration, /and not f\.is_test/);
  assert.match(migration, /r\.status in \('ENVIADO', 'VALIDADO', 'CORREGIDO'\)/);
  assert.match(migration, /raw_app_meta_data->>'platform_role' = 'super_admin'/);
  assert.match(migration, /revoke all on function public\.radar_admin_national_rtd_v1\(uuid, text, jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.radar_admin_national_rtd_v1\(uuid, text, jsonb\) to service_role/);
});
