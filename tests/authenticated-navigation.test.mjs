import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("../src/data/radarAuth.ts", import.meta.url), "utf8");
const gate = fs.readFileSync(new URL("../src/components/MunicipalityAccessGate.tsx", import.meta.url), "utf8");
const canonicalDashboard = fs.readFileSync(new URL("../src/components/MunicipalDashboard.tsx", import.meta.url), "utf8");
const context = fs.readFileSync(new URL("../src/context/MunicipalityContext.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../src/app/RadarAccessPage.tsx", import.meta.url), "utf8");

test("every municipal route is gated by authenticated Supabase runtime before rendering the approved V70", () => {
  assert.match(app, /MunicipalityAccessGate as MunicipalDashboard/);
  assert.match(gate, /ensureRadarAccessToken/);
  assert.match(gate, /resolveAuthorizedRadarConsumer/);
  assert.match(gate, /directV70\(section\)/);
  assert.match(gate, /<V70DirectHome0509 \/>/);
  assert.match(gate, /<V70DirectIntelligence0509 \/>/);
  assert.doesNotMatch(gate, /municipalityCode\s*===\s*["']0509["']/);
  assert.doesNotMatch(gate, /<MunicipalDashboardV70Runtime \/>/);
  assert.match(gate, /to=\{`\/municipio\/\$\{municipalityCode\}\/inicio`\}/);
  assert.match(gate, /status: "auth_required"/);
  assert.match(gate, /<Navigate to=\{`\/acceso\?next=/);
  assert.match(gate, /AuthorizedRuntimeProvider/);
  assert.doesNotMatch(gate, /public-demo/);
});

test("canonical V70 context and original dashboard remain isolated from auth/runtime binding", () => {
  assert.doesNotMatch(context, /radarAuth|radarAuthorizedConsumer|RadarRuntimeBundle/);
  assert.match(context, /consumer\.context\.campaign_id/);
  assert.match(context, /consumer\.context\.permissions/);
  assert.doesNotMatch(canonicalDashboard, /radarRuntimeCache|radarRuntimeProfile|loadRadarRuntimeBundle|loadAuthorizedGeoBundle/);
});

test("access entry uses publishable auth only and preserves a safe municipal return path", () => {
  assert.match(app, /path="acceso"/);
  assert.match(access, /signInRadar/);
  assert.match(access, /municipio/);
  assert.match(access, /\\d\{4\}/);
  assert.match(auth, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth, /grant_type=\$\{grantType\}/);
  assert.match(auth, /refresh_token/);
  assert.doesNotMatch(auth, /service[_-]?role/i);
  assert.doesNotMatch(auth, /SUPABASE_SECRET/i);
  assert.doesNotMatch(auth, /signUp|signup|register/i);
});
