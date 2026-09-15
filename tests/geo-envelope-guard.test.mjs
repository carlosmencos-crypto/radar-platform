import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const geoRuntime = fs.readFileSync(path.join(root, "src/data/radarGeoRuntime.ts"), "utf8");

test("detailed map geography is restricted to plausible Guatemala bounds", () => {
  assert.match(geoRuntime, /GUATEMALA_MAP_BOUNDS/);
  assert.match(geoRuntime, /south: 13\.5/);
  assert.match(geoRuntime, /north: 18/);
  assert.match(geoRuntime, /west: -92\.3/);
  assert.match(geoRuntime, /east: -88/);
});

test("runtime bbox must reconcile with the detailed feature envelope", () => {
  assert.match(geoRuntime, /const bbox = runtime\.geo\.bbox/);
  assert.match(geoRuntime, /withinTolerance\(south, bbox\.south\)/);
  assert.match(geoRuntime, /withinTolerance\(north, bbox\.north\)/);
  assert.match(geoRuntime, /withinTolerance\(west, bbox\.west\)/);
  assert.match(geoRuntime, /withinTolerance\(east, bbox\.east\)/);
  assert.match(geoRuntime, /runtime\.geo\.bbox !== null/);
});
