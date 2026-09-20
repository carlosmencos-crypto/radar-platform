import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(
  new URL("../supabase/qa/client_ready_role_isolation_v1.sql", import.meta.url),
  "utf8",
);

test("authenticated role QA is transactional, deterministic and self-cleaning", () => {
  assert.match(sql, /^begin;/);
  assert.match(sql, /create temporary table client_ready_role_qa/);
  assert.match(sql, /set local role authenticated/);
  assert.match(sql, /reset role;/);
  assert.match(sql, /delete from auth\.users/);
  assert.match(sql, /'ephemeral_cleanup'/);
  assert.match(sql, /commit;/);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bservice_role\b/i);
  assert.doesNotMatch(sql, /create\s+table\s+(?!client_ready_role_qa)/i);
});

test("role QA covers campaign roles, platform administration and clean-client denial", () => {
  for (const role of [
    "campaign_admin",
    "campaign_editor",
    "campaign_viewer",
    "platform_admin",
  ]) {
    assert.match(sql, new RegExp(role));
  }

  for (const assertion of [
    "campaign_admin_context",
    "campaign_admin_isolation",
    "campaign_admin_write",
    "campaign_editor_context",
    "campaign_editor_write",
    "campaign_editor_delete_denied",
    "campaign_viewer_context",
    "campaign_viewer_write_denied",
    "campaign_viewer_data_vault",
    "clean_client_default_deny",
    "platform_admin_clean_context",
    "platform_admin_national_read",
  ]) {
    assert.match(sql, new RegExp(`'${assertion}'`));
  }
});

test("role QA uses two real authorized campaigns and proves cross-campaign isolation", () => {
  assert.match(sql, /municipality_code = '0509'/);
  assert.match(sql, /municipality_code = '1208'/);
  assert.match(sql, /current_setting\('qa\.campaign_2'\)/);
  assert.match(sql, /foreign_contacts/);
  assert.match(sql, /count\(\*\) = 3/);
  assert.match(sql, /count\(\*\) filter[\s\S]*= 0/);
});

test("role QA keeps Campaign Vault and intelligence fail closed for a new client", () => {
  const cleanClientGate = sql.match(
    /select 'clean_client_default_deny',[\s\S]*?\);\n\nselect set_config\('request\.jwt\.claim\.sub','00000000-0000-4000-8000-0000000000a5'/,
  );
  assert.ok(cleanClientGate, "clean-client gate must be present before platform-admin context");
  assert.match(cleanClientGate[0], /radar_authorized_context_v2/);
  assert.match(cleanClientGate[0], /public\.campaigns/);
  assert.match(cleanClientGate[0], /campaign_vault\.contacts/);
  assert.match(cleanClientGate[0], /data_vault\.municipality_intelligence_profiles_v1/);
  assert.match(cleanClientGate[0], /= 0/);
});
