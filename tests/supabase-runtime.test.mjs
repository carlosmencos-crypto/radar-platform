import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../src/data/supabaseRuntime.ts", import.meta.url), "utf8");
const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("runtime uses the RLS-safe public RPC boundary", () => {
  assert.match(runtime, /radar_runtime_identity/);
  assert.match(runtime, /radar_municipality_bundle/);
  assert.match(runtime, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(runtime, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test("runtime never embeds privileged Supabase credentials", () => {
  assert.doesNotMatch(runtime, /service_role/i);
  assert.doesNotMatch(runtime, /SUPABASE_SECRET/i);
  assert.doesNotMatch(envExample, /service_role/i);
  assert.match(envExample, /^VITE_SUPABASE_URL=/m);
  assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=/m);
});

test("municipality runtime remains keyed by the canonical four-digit code", () => {
  assert.match(runtime, /\^\\d\{4\}\$/);
  assert.match(runtime, /p_municipality_code: municipalityCode/);
  assert.match(runtime, /municipalities:navigate_all/);
});

test("platform admin maps to the canonical national role", () => {
  assert.match(runtime, /identity\.platform_role === "platform_admin"/);
  assert.match(runtime, /return "national_admin"/);
  assert.match(runtime, /campaign_id: membership\?\.campaign_id \?\? "platform-admin"/);
});
