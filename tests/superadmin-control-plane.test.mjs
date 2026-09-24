import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260918183100_superadmin_national_control_plane_v1.sql");
const hardening = read("supabase/migrations/20260918183200_superadmin_security_hardening_v1.sql");
const performance = read("supabase/migrations/20260918183300_superadmin_performance_hardening_v1.sql");
const edge = read("supabase/functions/radar-admin-api/index.ts");
const client = read("src/admin/radarAdminApi.ts");
const app = read("src/app/App.tsx");
const access = read("src/app/RadarAccessPage.tsx");
const auth = read("src/data/radarAuth.ts");

test("superadmin route is a distinct authenticated control plane", () => {
  assert.match(app, /path="admin\/:section\?" element=\{<SuperAdminAccessGate/);
  assert.doesNotMatch(app, /path="admin" element=\{<Navigate/);
  assert.match(edge, /userData\.user\.app_metadata\?\.platform_role/);
  assert.match(edge, /jwtPayload\(token\)\.aal !== "aal2"/);
  assert.match(access, /prepareRadarAdminMfa/);
  assert.match(access, /Activa la seguridad administrativa/);
  assert.match(auth, /factor_type: "totp"/);
  assert.match(auth, /RADAR Administrador/);
  assert.match(auth, /\/factors\/\$\{factor\.id\}\/challenge/);
  assert.match(auth, /\/factors\/\$\{challenge\.factorId\}\/verify/);
});

test("service role is confined to the server function", () => {
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(client, /service[_-]?role/i);
  assert.doesNotMatch(auth, /service[_-]?role/i);
});

test("administrative invitations finish with password setup and mandatory MFA", () => {
  assert.match(app, /radarAuthCallbackType\(\)/);
  assert.match(auth, /rawType === "invite" \|\| rawType === "recovery"/);
  assert.match(auth, /password\.length < 12/);
  assert.match(auth, /Authorization: `Bearer \$\{callback\.access_token\}`/);
  assert.match(auth, /window\.history\.replaceState/);
  assert.match(auth, /sessionStorage\.setItem\(CALLBACK_STORAGE_KEY/);
  assert.match(auth, /window\.location\.pathname\.endsWith\("\/acceso"\)/);
  assert.match(auth, /const refreshToken = values\.get\("refresh_token"\) \?\? ""/);
  assert.match(auth, /if \(!accessToken\) return storedRadarAuthCallback\(\)/);
  assert.match(auth, /if \(!session\.refresh_token\)/);
  assert.match(access, /useState\(\(\) => radarAuthCallbackType\(\)\)/);
  assert.match(access, /completeRadarPasswordSetup/);
  assert.match(access, /Continuar con MFA/);
  assert.match(edge, /redirectTo:?[\s\S]*\/acceso\?next=\/admin/);
});

test("admin vault is closed, RLS enabled, and privileged RPCs are service-only", () => {
  assert.match(migration, /create schema if not exists admin_vault/);
  assert.match(migration, /revoke all on schema admin_vault from public, anon, authenticated/);
  for (const table of ["operator_scopes", "commercial_contracts", "publication_batches", "publication_issues", "audit_events", "support_sessions"]) {
    assert.match(migration, new RegExp(`alter table admin_vault\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on all tables in schema admin_vault from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.radar_admin_snapshot_v1\(uuid,text,text\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.radar_admin_snapshot_v1\([^\n]+\) to authenticated/);
});

test("commercial exclusivity is a database exclusion constraint", () => {
  assert.match(migration, /contract_period daterange generated always/);
  assert.match(migration, /commercial_contracts_exclusivity exclude using gist/);
  assert.match(migration, /municipality_id with =/);
  assert.match(migration, /contract_period with &&/);
  assert.match(migration, /active protected contract required/);
});

test("publication flow is versioned and never exposes direct browser writes", () => {
  for (const state of ["UPLOADED", "PREVALIDATED", "APPROVED", "PUBLISHED", "ROLLED_BACK"]) assert.match(migration, new RegExp(`'${state}'`));
  assert.match(migration, /dataset_releases_current_unique_idx/);
  assert.match(migration, /rolled_back_from_release_id/);
  assert.match(edge, /radar-admin-staging/);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge, /crypto\.randomUUID\(\).*safePathPart\(uploadedFile\.name\)/);
  assert.match(edge, /upsert: false/);
  assert.match(migration, /blocking validation issues remain/);
  assert.match(migration, /publication_batches \+ dataset_releases/);
  assert.doesNotMatch(migration, /versioning_status='ENABLED'/);
});

test("the canonical Data Vault contract has exactly 17 seeded layers", () => {
  const seed = migration.match(/insert into admin_vault\.canonical_layers[\s\S]*?on conflict \(layer_id\)/)?.[0] ?? "";
  const ids = [...seed.matchAll(/\('([A-Z0-9_]+)',\d+,/g)].map((match) => match[1]);
  assert.equal(ids.length, 17);
  assert.equal(new Set(ids).size, 17);
  assert.deepEqual(ids.slice(0, 2), ["ROUTES_340", "NUCLEO_ELECTORAL"]);
  assert.equal(ids.at(-1), "TSE_CENTROS_GEO");
});

test("Pulso preserves three scopes and requires preview before publication", () => {
  assert.match(migration, /election_value='ALCALDIA'[\s\S]*scope_value:='MUNICIPALITY'/);
  assert.match(migration, /election_value='DIP_DIST'[\s\S]*scope_value:='DEPARTMENT'/);
  assert.match(migration, /'PRESIDENTE','DIP_NAC','PARLACEN'[\s\S]*scope_value:='NATIONAL'/);
  assert.match(migration, /pulse publication requires preview, validation and approval/);
  assert.match(migration, /approved or published pulse is immutable; create a new version/);
  assert.match(migration, /pulse source_id required/);
  assert.match(migration, /pulse technical_sheet required/);
});

test("support diagnostics are temporary and do not implement impersonation", () => {
  assert.match(migration, /access_mode in \('READ_ONLY','MINIMAL_DIAGNOSTIC'\)/);
  assert.match(hardening, /p_expires_at<=now\(\) or p_expires_at>now\(\)\+interval '8 hours'/);
  assert.match(hardening, /support campaign municipality mismatch/);
  assert.match(hardening, /support territorial scope denied/);
  assert.match(hardening, /revoke all on all functions in schema admin_vault from public,anon,authenticated/);
  assert.doesNotMatch(edge, /impersonat|suplant/i);
});

test("scoped operators are filtered again before the snapshot reaches the browser", () => {
  assert.match(edge, /function recordWithinScope/);
  assert.match(edge, /function scopedSnapshot/);
  assert.match(edge, /scope\.municipality_code !== municipality/);
  assert.match(edge, /scope\.department_code !== department/);
  assert.match(edge, /scope\.campaign_id !== campaign/);
  assert.match(migration, /operator_has_scope/);
});

test("control-plane foreign keys are indexed and trigger helpers are not RPCs", () => {
  assert.match(performance, /revoke all on function public\.handle_new_user\(\) from public,anon,authenticated/);
  for (const index of [
    "publication_batches_campaign_idx",
    "dataset_releases_batch_idx",
    "audit_events_actor_idx",
    "support_sessions_campaign_idx",
    "pulse_measurements_supersedes_idx",
  ]) assert.match(performance, new RegExp(`create index if not exists ${index}`));
});
