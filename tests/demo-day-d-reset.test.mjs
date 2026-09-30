import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260930051000_reset_demo_day_d_state.sql", import.meta.url),
  "utf8",
);
const reconciliation = readFileSync(
  new URL("../supabase/migrations/20260930052000_reconcile_day_d_dashboard_mirrors.sql", import.meta.url),
  "utf8",
);

test("demo reset removes canonical fiscal state without touching real campaigns", () => {
  assert.match(migration, /where id = p_campaign_id\s+and is_demo = true/);
  assert.match(migration, /delete from public\.day_d_evidence where campaign_id = p_campaign_id/);
  assert.match(migration, /delete from public\.day_d_incidents where campaign_id = p_campaign_id/);
  assert.match(migration, /delete from public\.day_d_rtd_folios where campaign_id = p_campaign_id/);
  assert.match(migration, /delete from public\.day_d_fiscal_sessions where campaign_id = p_campaign_id/);
  assert.match(migration, /delete from public\.day_d_fiscal_access_grants where campaign_id = p_campaign_id/);
  assert.match(migration, /delete from public\.day_d_jrv_assignments where campaign_id = p_campaign_id/);
});

test("superadmin reset archives Day D state before purging it", () => {
  const snapshot = migration.indexOf("admin_vault.demo_day_d_state_snapshot(campaign.id)");
  const audit = migration.indexOf("public.radar_admin_audit_v1");
  const purge = migration.indexOf("admin_vault.purge_demo_day_d_state(campaign.id)");
  assert.ok(snapshot >= 0 && audit > snapshot && purge > audit);
});

test("dashboard reconciliation republishes assignments, incidents and RTD folios", () => {
  assert.match(reconciliation, /publish_day_d_assignment_status\(assignment_id\)/);
  assert.match(reconciliation, /publish_day_d_incident\(incident_id\)/);
  assert.match(reconciliation, /publish_day_d_rtd_folio\(folio_id\)/);
});
