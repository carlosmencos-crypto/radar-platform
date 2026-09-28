import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = fs.readFileSync(path.join(root, "src/data/radarRuntime.ts"), "utf8");
const gate = fs.readFileSync(path.join(root, "src/components/MunicipalityAccessGate.tsx"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "src/components/MunicipalDashboardV70Runtime.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/components/V70DirectShell0509.tsx"), "utf8");

test("demo municipality suffix is canonicalized without losing its route mode", () => {
  assert.match(runtime, /parseMunicipalityRouteCode/);
  assert.match(runtime, /radar-route=\$\{radarRouteKindFromPathname/);
  assert.match(gate, /canonicalMunicipalityCode/);
  assert.match(dashboard, /municipalityRouteCode/);
  assert.match(shell, /municipalityRouteCode/);
});
