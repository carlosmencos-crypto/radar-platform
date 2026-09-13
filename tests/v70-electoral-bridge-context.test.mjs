import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V70 electoral parity bridge consumes the authenticated runtime context", async () => {
  const bridge = await text("src/components/V70ElectoralParityBridge.tsx");
  const gate = await text("src/components/MunicipalityAccessGate.tsx");

  assert.ok(bridge.includes('useAuthorizedRadarRuntime'));
  assert.ok(bridge.includes('../context/AuthorizedRuntimeContext'));
  assert.equal(bridge.includes('useMunicipalityContext'), false);
  assert.equal(bridge.includes('../context/MunicipalityContext'), false);

  assert.ok(gate.includes('<AuthorizedRuntimeProvider consumer={state.consumer}>'));
  assert.ok(gate.includes('<V70ElectoralParityBridge />'));
  assert.ok(bridge.includes('getInstalledRadarElectoralLayers'));
  assert.ok(bridge.includes('getInstalledRadarGeoBundle'));
  assert.ok(bridge.includes('V70ElectoralTerritoryUnavailable'));
});
