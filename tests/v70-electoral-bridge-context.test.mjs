import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V70 direct intelligence consumes authenticated runtime without a DOM bridge", async () => {
  const direct = await text("src/components/V70DirectIntelligence0509.tsx");
  const gate = await text("src/components/MunicipalityAccessGate.tsx");

  assert.ok(direct.includes("useAuthorizedRadarRuntime"));
  assert.ok(direct.includes('../context/AuthorizedRuntimeContext'));
  assert.ok(gate.includes('<AuthorizedRuntimeProvider consumer={state.consumer}>'));
  assert.ok(gate.includes('<V70DirectIntelligence0509 />'));
  assert.ok(direct.includes('getInstalledRadarElectoralLayers'));
  assert.ok(direct.includes('getInstalledRadarGeoBundle'));
  assert.ok(direct.includes('V70ElectoralTerritoryUnavailable'));
  assert.ok(direct.includes('V70CanonicalRich0509'));
  assert.equal(direct.includes('createPortal'), false);
  assert.equal(direct.includes('querySelector'), false);
  assert.equal(direct.includes('insertAdjacentElement'), false);
});
