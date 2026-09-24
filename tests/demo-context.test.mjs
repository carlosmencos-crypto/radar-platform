import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = stripTypeScriptTypes(readFileSync(new URL("../src/data/radarDemo.ts", import.meta.url), "utf8"));
const { assertDemoContext } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("demo entry rejects real, missing, foreign and changed contexts", () => {
  const context = { is_demo: true, campaign_id: "demo-a", municipality_code: "0101" };
  assert.doesNotThrow(() => assertDemoContext(context, "0101", "demo-a"));
  for (const change of [{is_demo:false}, {is_demo:undefined}, {campaign_id:null}, {municipality_code:"0509"}, {campaign_id:"demo-b"}]) {
    assert.throws(() => assertDemoContext({...context,...change}, "0101", "demo-a"), /RADAR_DEMO_CONTEXT_REQUIRED/);
  }
});
