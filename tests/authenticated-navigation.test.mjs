import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("../src/data/radarAuth.ts", import.meta.url), "utf8");
const gate = fs.readFileSync(new URL("../src/components/MunicipalityAccessGate.tsx", import.meta.url), "utf8");
const context = fs.readFileSync(new URL("../src/context/MunicipalityContext.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../src/app/RadarAccessPage.tsx", import.meta.url), "utf8");

test("municipal V70 route is gated by an authenticated Supabase runtime before rendering", () => {
  assert.match(app, /MunicipalityAccessGate as MunicipalDashboard/);
  assert.match(gate, /ensureRadarAccessToken/);
  assert.match(gate, /resolveAuthorizedRadarConsumer/);
  assert.match(gate, /CanonicalMunicipalDashboard/);
  assert.match(gate, /status: "auth_required"/);
  assert.match(gate, /<Navigate to=\{`\/acceso\?next=/);
  assert.match(gate, /AuthorizedRuntimeProvider/);
  assert.doesNotMatch(gate, /public-demo/);
});

test("authenticated Intelligence exposes the existing V70 coverage block without changing canonical markup", () => {
  assert.match(gate, /section !== "inteligencia"/);
  assert.match(gate, /details\.canonical-coverage-secondary/);
  assert.match(gate, /coverage\.open = true/);
  assert.match(gate, /requestAnimationFrame/);
});

test("canonical V70 MunicipalityContext remains unchanged by auth binding", () => {
  assert.doesNotMatch(context, /radarAuth|radarAuthorizedConsumer|RadarRuntimeBundle/);
  assert.match(context, /consumer\.context\.campaign_id/);
  assert.match(context, /consumer\.context\.permissions/);
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
