import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("../src/data/radarAuth.ts", import.meta.url), "utf8");
const context = fs.readFileSync(new URL("../src/context/MunicipalityContext.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../src/app/RadarAccessPage.tsx", import.meta.url), "utf8");

test("municipal V70 requires an authenticated Supabase session before rendering", () => {
  assert.match(context, /ensureRadarAccessToken/);
  assert.match(context, /resolveAuthorizedRadarConsumer/);
  assert.match(context, /status: "auth_required"/);
  assert.match(context, /<Navigate to=\{`\/acceso\?next=/);
  assert.match(context, /runtime: authorization\.runtime/);
  assert.doesNotMatch(context, /public-demo/);
});

test("access entry uses publishable auth only and preserves a safe municipal return path", () => {
  assert.match(app, /path="acceso"/);
  assert.match(access, /signInRadar/);
  assert.match(access, /\^\\\/municipio\\\/\\d\{4\}/);
  assert.match(auth, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth, /grant_type=\$\{grantType\}/);
  assert.match(auth, /refresh_token/);
  assert.doesNotMatch(auth, /service[_-]?role/i);
  assert.doesNotMatch(auth, /SUPABASE_SECRET/i);
  assert.doesNotMatch(auth, /signUp|signup|register/i);
});

test("authorized runtime role is mapped to the canonical V70 context key", () => {
  assert.match(context, /platform_admin.*national_admin/);
  assert.match(context, /campaign_admin.*municipal_admin/);
  assert.match(context, /campaign_operator/);
  assert.match(context, /authorized\.context\.permissions/);
  assert.match(context, /authorized\.context\.campaign_id/);
});
