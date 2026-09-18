import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260918075224_day_d_portal_access_v1.sql");
const adminFunction = read("supabase/functions/day-d-access-admin/index.ts");
const exchangeFunction = read("supabase/functions/day-d-access-exchange/index.ts");
const validateFunction = read("supabase/functions/day-d-access-validate/index.ts");
const dayD = read("src/components/V70DirectDayD0509.tsx");

test("Día D access credentials are server-issued and hash-only at rest", () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /code_hash text not null unique/);
  assert.match(migration, /payload=payload-'code'/);
  assert.doesNotMatch(migration, /security\s+definer/i);
  assert.match(adminFunction, /sha256\(`token:\$\{token\}`\)/);
  assert.match(adminFunction, /sha256\(`code:\$\{code\}`\)/);
  assert.doesNotMatch(adminFunction, /console\.(?:log|error)[^\n]*(?:token|code)/i);
});

test("Día D access links use an opaque token and the dashboard stores no plaintext code", () => {
  assert.match(adminFunction, /\?access=/);
  assert.doesNotMatch(adminFunction, /\?code=/);
  assert.doesNotMatch(dayD, /function accessCode/);
  assert.doesNotMatch(dayD, /payload:\s*\{[^}]*\bcode\b/s);
  assert.match(dayD, /issueFiscalAccess/);
});

test("Día D access exchange is rate limited, single-device and server-only", () => {
  assert.match(migration, /failed_attempts >= 5/);
  assert.match(migration, /day_d_fiscal_sessions_one_device_idx/);
  assert.match(migration, /current_user <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.radar_exchange_fiscal_access_v1[^;]+authenticated/);
  assert.match(exchangeFunction, /authData\.user\.is_anonymous/);
  assert.match(exchangeFunction, /RADAR_ACCESS_AUDIT_PEPPER/);
  assert.match(validateFunction, /RADAR_PORTAL_BRIDGE_SECRET/);
  assert.match(migration, /radar_validate_fiscal_session_v1/);
});

test("Día D sensitive lifecycle actions append audit events", () => {
  for (const eventName of [
    "access_issued",
    "access_regenerated",
    "access_exchanged",
  ]) assert.match(migration, new RegExp(eventName));
  assert.match(migration, /revoke update,delete,truncate on campaign_vault\.day_d_audit_events/);
});
