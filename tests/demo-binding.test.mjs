import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Valle Nexo loads every existing dataset through authenticated RPCs", () => {
  const consumer = read("src/data/radarConsumer.ts");
  const loader = read("src/data/demoVault.ts");
  const dashboard = read("src/components/MunicipalDashboard.tsx");
  const modules = read("src/components/CampaignModules.tsx");
  const map = read("src/components/OperationalMap.tsx");

  assert.match(consumer, /context\.is_demo \? await loadDemoBundle/);
  assert.match(loader, /radar_demo_bundle/);
  for (const dataset of [
    "geo_features", "candidates", "contacts", "fiscales", "activities", "incidents",
    "rtd_results", "commitments", "resources", "strategy_items", "pulse_snapshots",
  ]) assert.match(`${loader}\n${modules}\n${map}`, new RegExp(dataset));

  for (const section of ["CampaignStrategy", "CampaignDirectory", "CampaignAgenda", "CampaignDayD", "CampaignResources", "CampaignPulse", "RadarAIModule", "CampaignConfiguration"]) {
    assert.match(dashboard, new RegExp(section));
  }
  assert.doesNotMatch(dashboard, /Demo(?:Strategy|Directory|Agenda|DayD|Resources|Pulse|Configuration|Map)/);
  assert.match(map, /MAPA OPERATIVO · NO CORRESPONDE A UN MUNICIPIO REAL/);
  assert.match(modules, /SIMULACIÓN/);
  assert.match(dashboard, /DEMO · SINTÉTICO/);
  assert.match(dashboard, /DEMO · SIMULACIÓN: los 17 módulos/);
});

test("Día D exposes every canonical V70 submodule and operational capability", () => {
  const modules = read("src/components/CampaignModules.tsx");
  for (const tab of ["Centro de control", "Centros de votación", "JRV", "Fiscales", "Incidencias", "Logística", "RTD"]) {
    assert.match(modules, new RegExp(tab));
  }
  for (const capability of [
    "Carnet", "Asignación de fiscal", "Check-in", "DETALLE DE CENTRO",
    "TOTALES RTD", "Centro/JRV", "Reportar incidencia", "RECURSOS DISPONIBLES",
  ]) assert.match(modules, new RegExp(capability, "i"));
  assert.match(modules, /data-centers-count/);
  assert.match(modules, /data-jrv-count/);
  assert.match(modules, /data-fiscales-count/);
  assert.match(modules, /data-rtd-count/);
});

test("demo mutations are campaign-scoped and reset refreshes all queries", () => {
  const loader = read("src/data/demoVault.ts");
  const modules = read("src/components/CampaignModules.tsx");
  for (const rpc of [
    "radar_demo_save_contact", "radar_demo_delete_contact",
    "radar_demo_save_activity", "radar_demo_delete_activity",
    "radar_demo_save_fiscal", "radar_demo_save_incident", "radar_demo_save_resource",
    "reset_demo_campaign",
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

test("operational parity migration writes demo_vault only and is invoker-only", () => {
  const sql = read("supabase/migrations/20260909054500_demo_operational_parity_rpc.sql");
  for (const rpc of ["radar_demo_save_fiscal", "radar_demo_save_incident", "radar_demo_save_resource"]) {
    assert.match(sql, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /private\.can_manage_demo_campaign/g);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+(?:data_vault|campaign_vault)/i);
  assert.doesNotMatch(sql, /create table|drop table|truncate|seed_/i);
  assert.match(sql, /revoke all on function public\.radar_demo_save_fiscal\(uuid, uuid, jsonb\) from public, anon/i);
});
