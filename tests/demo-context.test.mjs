import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = stripTypeScriptTypes(readFileSync(new URL("../src/data/radarDemo.ts", import.meta.url), "utf8"));
const { assertDemoContext } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("demo entry rejects real, missing, foreign and changed contexts", () => {
  const context = { is_demo: true, campaign_id: "demo-a", municipality_code: "0101" };
  assert.doesNotThrow(() => assertDemoContext(context, "0101", "demo-a"));
  for (const change of [{is_demo:false}, {is_demo:undefined}, {campaign_id:null}, {municipality_code:"0509"}, {campaign_id:"demo-b"}]) {
    assert.throws(() => assertDemoContext({...context,...change}, "0101", "demo-a"), /RADAR_DEMO_CONTEXT_REQUIRED/);
  }
});

test("demo route propagates an explicit demo scope through every bootstrap RPC", () => {
  const gate = readFileSync(new URL("../src/components/MunicipalityAccessGate.tsx", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../src/data/radarRuntime.ts", import.meta.url), "utf8");
  assert.match(gate, /demoRequested \? "demo" : "municipality"/);
  assert.match(gate, /loadAuthorizedRadarContext\(municipalityCode, accessToken, "demo"\)/);
  assert.match(runtime, /radar_authorized_runtime_v9/);
  assert.match(runtime, /radar_municipality_geo_bundle_v2/);
  assert.match(runtime, /radar_authorized_voter_communities_v2/);
});

test("demo context survives municipal navigation and report generation", () => {
  const gate = readFileSync(new URL("../src/components/MunicipalityAccessGate.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/V70DirectShell0509.tsx", import.meta.url), "utf8");
  const reportBuilder = readFileSync(new URL("../src/components/V70DirectReportBuilder.tsx", import.meta.url), "utf8");
  const intelligenceExport = readFileSync(new URL("../src/components/V70DirectIntelligenceExport0509.tsx", import.meta.url), "utf8");
  const reportGate = readFileSync(new URL("../src/components/V70DirectReportAccessGate0509.tsx", import.meta.url), "utf8");
  assert.match(shell, /consumer\.context\.is_demo === true/);
  assert.match(shell, /demo \? `\$\{path\}\?demo=1` : path/);
  assert.match(shell, /topbar-demo-label/);
  assert.match(shell, /isDemo \? <span className="topbar-demo-label">DEMO<\/span> : null/);
  assert.doesNotMatch(gate, /radar-demo-badge/);
  assert.match(gate, /getInstalledRadarRuntime\(municipalityCode\)/);
  assert.match(gate, /stickyDemoRequested/);
  assert.match(gate, /demoParams\.set\("demo", "1"\)/);
  assert.match(reportBuilder, /query\.set\("demo", "1"\)/);
  assert.match(intelligenceExport, /query\.set\("demo", "1"\)/);
  assert.match(reportGate, /demoRequested \? "demo" : "municipality"/);
  assert.match(reportGate, /assertDemoContext\(consumer\.runtime\.context, municipalityCode\)/);
});

test("0509 demo provisioning is isolated and has no real-campaign fallback", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260925044904_enable_demo_0509_isolation.sql", import.meta.url), "utf8");
  assert.match(migration, /'radar-demo-0509', true, 'active'/);
  assert.match(migration, /member_role\)\s*select[\s\S]*'demo_admin'/);
  assert.match(migration, /route_kind = 'demo'[\s\S]*c\.is_demo = true/);
  assert.match(migration, /m\.is_synthetic = false and cm\.member_role in \('demo_admin','demo_viewer'\)/);
  assert.match(migration, /candidate_count = 1/);
  assert.match(migration, /demo_vault\.campaign_records/);
  assert.match(migration, /c\.is_demo=false/);
});
