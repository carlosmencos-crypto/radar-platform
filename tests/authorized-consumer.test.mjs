import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapter = fs.readFileSync(path.join(root, "src/data/radarAuthorizedConsumer.ts"), "utf8");

test("authorized V70 adapter stays fail-closed and contract-bound", () => {
  assert.match(adapter, /loadRadarRuntimeBundle/);
  assert.match(adapter, /HIDE_POST_LAUNCH/);
  assert.match(adapter, /capas duplicadas/);
  assert.match(adapter, /contrato visible 340×17/);
  assert.match(adapter, /runtime\.context\.campaign_id/);
  assert.match(adapter, /runtime\.context\.permissions/);
  assert.doesNotMatch(adapter, /public-demo/);
  assert.doesNotMatch(adapter, /service[_-]?role/i);
});
