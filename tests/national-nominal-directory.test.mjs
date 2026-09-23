import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const report = JSON.parse(read("docs/qa/national-nominal-source-report.json"));

test("recovered original nominal source reconciles all 340 municipalities without deleting duplicates", () => {
  assert.equal(report.status, "PASS");
  assert.equal(report.source_year, 2023);
  assert.equal(report.total_rows, 8947471);
  assert.equal(Object.keys(report.municipal_counts).length, 340);
  assert.equal(Object.values(report.municipal_counts).reduce((a,b) => a+b, 0), report.total_rows);
  assert.equal(report.municipal_counts["1208"], 9406);
  assert.equal(report.municipal_counts["0509"], 36878);
  assert.equal(report.duplicate_identity_groups, 11013);
  assert.equal(report.public_payload_contains_personal_data, false);
  assert.equal(report.name_review.source_sha256, report.source_sha256);
});

test("private national reads require active source, active administrator and authorized municipality", () => {
  const sql = read("supabase/migrations/20260922180100_authorize_national_register_qa_read.sql");
  assert.match(sql, /p\.is_active and p\.platform_role='platform_admin'/);
  assert.match(sql, /private\.can_read_data_vault\('GT',p_municipality_id\)/);
  assert.match(sql, /r\.municipality_id=muni/);
  assert.match(sql, /s\.active/);
  assert.match(sql, /from public,anon/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
  assert.doesNotMatch(sql, /update campaign_vault\.voter_directory/i);
  const importSql = read("supabase/migrations/20260922180000_stage_private_national_register.sql");
  assert.match(importSql, /active boolean not null default false/);
  assert.match(importSql, /batch_row\.payload_sha256 <> encode/);
  assert.match(importSql, /import_expires_at <= now\(\)/);
  assert.match(importSql, /from public,anon,authenticated/);
});

test("QA directory preserves campaign editing and keeps original source separate from private contact updates", () => {
  const ui = read("src/components/V70DirectDirectory0509.tsx");
  const runtime = read("src/data/radarRuntime.ts");
  assert.match(ui, /Base inicial 2023/);
  assert.match(ui, /saveAuthorizedContactProfile/);
  assert.match(ui, /addAuthorizedContactInteraction/);
  assert.match(ui, /detail\.read_only/);
  assert.match(ui, /disabled=\{nationalRegister \|\| !campaign_id\}/);
  assert.doesNotMatch(ui, /communityOptions\.length \|\| 148/);
  assert.match(runtime, /result\.items\.some\(\(row\) => row\.municipality_code !== municipalityCode \|\| row\.id >= 0\)/);
});
