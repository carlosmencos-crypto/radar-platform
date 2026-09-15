import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260912080500_fix_geo_bundle_authorization.sql"),
  "utf8",
);

test("detailed municipal geography is scoped through authorized context", () => {
  assert.match(migration, /radar_authorized_context_v2\('municipality', p_municipality_code\)/);
  assert.match(migration, /join public\.municipalities m/);
  assert.match(migration, /m\.id = c\.municipality_id/);
  assert.match(migration, /m\.country_code = c\.country_code/);
  assert.match(migration, /m\.is_synthetic = false/);
  assert.match(migration, /from target m/);
});

test("geo bundle RPC remains authenticated-only", () => {
  assert.match(migration, /revoke all on function public\.radar_municipality_geo_bundle\(text, text\[\]\) from public/);
  assert.match(migration, /revoke all on function public\.radar_municipality_geo_bundle\(text, text\[\]\) from anon/);
  assert.match(migration, /grant execute on function public\.radar_municipality_geo_bundle\(text, text\[\]\) to authenticated/);
});
