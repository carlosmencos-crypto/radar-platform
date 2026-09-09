import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Valle Nexo loads every existing dataset through authenticated RPCs", () => {
  const consumer = read("src/data/radarConsumer.ts");
  const loader = read("src/data/demoVault.ts");
  const dashboard = read("src/components/MunicipalDashboard.tsx");
  const modules = read("src/components/DemoModules.tsx");
  const map = read("src/components/DemoMap.tsx");

  assert.match(consumer, /context\.is_demo \? await loadDemoBundle/);
  assert.match(loader, /radar_demo_bundle/);
  for (const dataset of [
    "geo_features", "candidates", "contacts", "fiscales", "activities", "incidents",
    "rtd_results", "commitments", "resources", "strategy_items", "pulse_snapshots",
  ]) assert.match(`${loader}\n${modules}\n${map}`, new RegExp(dataset));

  for (const section of ["DemoStrategy", "DemoDirectory", "DemoAgenda", "DemoDayD", "DemoResources", "DemoPulse", "DemoConfiguration"]) {
    assert.match(dashboard, new RegExp(section));
  }
  assert.match(map, /MAPA DEMO · NO CORRESPONDE A UN MUNICIPIO REAL/);
  assert.match(modules, /SIMULACIÓN/);
  assert.match(dashboard, /DEMO · SINTÉTICO/);
  assert.match(dashboard, /DEMO · SIMULACIÓN: los 17 módulos/);
});

test("demo mutations are campaign-scoped and reset refreshes all queries", () => {
  const loader = read("src/data/demoVault.ts");
  const modules = read("src/components/DemoModules.tsx");
  for (const rpc of [
    "radar_demo_save_contact", "radar_demo_delete_contact",
    "radar_demo_save_activity", "radar_demo_delete_activity", "reset_demo_campaign",
  ]) assert.match(`${loader}\n${modules}`, new RegExp(rpc));
  assert.match(modules, /await refresh\(\)/);
});

test("binding migration is invoker-only and never seeds or touches real vault rows", () => {
  const sql = read("supabase/migrations/20260909042933_valle_nexo_v70_binding_rpc.sql");
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /private\.can_use_demo_campaign/);
  assert.match(sql, /private\.can_manage_demo_campaign/);
  assert.doesNotMatch(sql, /insert into\s+(?:data_vault|campaign_vault)/i);
  assert.doesNotMatch(sql, /delete from\s+(?:data_vault|campaign_vault)/i);
  assert.doesNotMatch(sql, /create table|drop table|truncate/i);
  assert.doesNotMatch(sql, /seed_/i);
  assert.match(sql, /revoke all on function public\.radar_demo_bundle\(uuid\) from public, anon/i);
});
