import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Pulso keeps municipal, departmental and national surveys isolated", () => {
  const scope = read("src/data/pulseScope.ts");
  const migration = read("supabase/migrations/20260918183000_add_pulse_scope_runtime.sql");

  assert.match(scope, /ALCALDIA:\s*"MUNICIPALITY"/);
  assert.match(scope, /DIP_DIST:\s*"DEPARTMENT"/);
  assert.match(scope, /PRESIDENTE:\s*"NATIONAL"/);
  assert.match(scope, /DIP_NAC:\s*"NATIONAL"/);
  assert.match(scope, /PARLACEN:\s*"NATIONAL"/);
  assert.match(scope, /measurement\.municipalityCode === viewer\.municipalityCode/);
  assert.match(scope, /measurement\.departmentCode === viewer\.departmentCode/);
  assert.match(scope, /measurement\.status !== "PUBLICADA"/);

  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on data_vault\.pulse_measurements from public, anon, authenticated/);
  assert.match(migration, /radar_authorized_context_v2\('municipality', p_municipality_code\)/);
  assert.match(migration, /measurement\.municipality_code = ctx\.municipality_code/);
  assert.match(migration, /measurement\.department_code = ctx\.department_code/);
  assert.match(migration, /measurement\.election_type in \('PRESIDENTE','DIP_NAC','PARLACEN'\)/);
  assert.match(migration, /profile\.platform_role = 'platform_admin'/);
  assert.match(migration, /pulse results must total approximately 100 percent/);
  assert.doesNotMatch(migration, /user_metadata/);
});
