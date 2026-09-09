import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readMigrations = () => fs.readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(`supabase/migrations/${name}`))
  .join("\n");

test("municipal and demo routes are guarded and preserve returnTo", () => {
  const app = read("src/app/App.tsx");
  const guard = read("src/auth/RequireAuth.tsx");
  const login = read("src/auth/LoginPage.tsx");
  assert.match(app, /<Route element={<RequireAuth \/>}>/);
  assert.match(app, /path="municipio\/:municipalityCode\/:section\?"/);
  assert.match(app, /path="demo\/valle-nexo\/:section\?"/);
  assert.match(guard, /\/login\?returnTo=/);
  assert.match(login, /value\.startsWith\("\/\/"\)/);
  assert.match(login, /navigate\(returnTo, \{ replace: true \}\)/);
});

test("frontend uses publishable configuration and never service-role", () => {
  const client = read("src/lib/supabase.ts");
  const source = [
    client,
    read("src/auth/AuthContext.tsx"),
    read("src/data/radarConsumer.ts"),
    read(".env.example"),
  ].join("\n");
  assert.match(source, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.match(source, /signInWithPassword/);
});

test("public catalog contains territorial identity only", () => {
  const catalog = read("src/app/pages.tsx");
  const municipalities = read("src/data/municipalities.ts");
  for (const forbidden of ["coverage", "electors", "population", "visibleModules", "source_label", "dataset"]) {
    const pattern = new RegExp(`\\b${forbidden}\\b`, "i");
    assert.equal(pattern.test(catalog), false, `catalog leaked ${forbidden}`);
    assert.equal(pattern.test(municipalities), false, `territorial catalog leaked ${forbidden}`);
  }
});

test("SQL boundary is fail-closed and demo reset cannot touch immutable vaults", () => {
  const sql = readMigrations();
  assert.match(sql, /revoke all on all tables in schema data_vault from anon/i);
  assert.match(sql, /revoke all on all tables in schema campaign_vault from anon/i);
  assert.match(sql, /revoke all on all tables in schema demo_vault from anon/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /c\.is_demo = true/i);
  assert.doesNotMatch(sql, /delete from\s+(?:data_vault|campaign_vault)/i);
});
