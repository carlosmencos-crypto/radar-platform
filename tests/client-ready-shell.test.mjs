import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../src/data/radarRuntime.ts", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../src/data/radarSectionAccess.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../src/components/MunicipalDashboardV70Runtime.tsx", import.meta.url), "utf8");
const communityRls = fs.readFileSync(new URL("../supabase/migrations/20260920031500_harden_authorized_voter_communities_invoker.sql", import.meta.url), "utf8");

test("client-ready runtime is municipal, semantic and fail closed", () => {
  assert.match(runtime, /radar_authorized_runtime_v8/);
  assert.match(runtime, /RadarClientReadinessStatus/);
  assert.match(runtime, /CLIENT_READY/);
  assert.match(runtime, /INTELLIGENCE_READY/);
  assert.match(runtime, /BLOCKED/);
  assert.match(runtime, /bundle\.client_readiness\?\.municipality_code !== municipalityCode/);
  assert.match(runtime, /Array\.isArray\(bundle\.client_readiness\?\.missing_requirements\)/);
});

test("runtime shell derives navigation from campaign, role and permissions", () => {
  assert.match(access, /campaignId/);
  assert.match(access, /userRole/);
  assert.match(access, /permissions/);
  assert.match(access, /campaign_vault:read/);
  assert.match(access, /pulse:read/);
  assert.match(dashboard, /visibleSections/);
  assert.match(dashboard, /canViewRadarSection/);
  assert.match(dashboard, /data-client-readiness/);
  assert.doesNotMatch(access, /0509/);
});

test("community aggregate RPC executes with caller RLS instead of definer privileges", () => {
  assert.match(communityRls, /security invoker/);
  assert.match(communityRls, /public\.radar_authorized_context_v2/);
  assert.match(communityRls, /revoke all[\s\S]*from anon/);
  assert.match(communityRls, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(communityRls, /security definer/);
  assert.doesNotMatch(communityRls, /private\.radar_authorized_context_v2/);
});
