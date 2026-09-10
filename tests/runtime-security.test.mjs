import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = fs.readFileSync(path.join(root, "src/data/radarRuntime.ts"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

test("runtime Supabase is fail-closed and uses authenticated RPCs only", () => {
  assert.match(runtime, /Sesión autenticada requerida/);
  assert.match(runtime, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(runtime, /radar_authorized_context_v2/);
  assert.match(runtime, /radar_authorized_layers_v2/);
  assert.match(runtime, /radar_municipality_geo_bundle/);
  assert.match(runtime, /campaign_id: string \| null/);
  assert.doesNotMatch(runtime, /service[_-]?role/i);
  assert.doesNotMatch(runtime, /public-demo/);
});

test("client config documents publishable values only", () => {
  assert.match(envExample, /VITE_SUPABASE_URL=/);
  assert.match(envExample, /VITE_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(envExample, /SERVICE_ROLE/i);
  assert.doesNotMatch(envExample, /SECRET/i);
});
