import assert from "node:assert/strict";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Execute the actual selector; resolve its one value import for Node's TS loader.
const modelUrl = new URL("../src/data/v70MunicipalIntelligence.ts", import.meta.url);
const publicDepthUrl = new URL("../src/data/municipalPublicDepth.ts", import.meta.url).href;
const source = stripTypeScriptTypes(fs.readFileSync(modelUrl, "utf8"))
  .replace('from "./municipalPublicDepth"', `from ${JSON.stringify(publicDepthUrl)}`);
const { buildMunicipalIntelligenceModel: build } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const root = new URL("../supabase/migrations/", import.meta.url);
const profiles = [];
for (const file of fs.readdirSync(root).filter((f) => /load_national_intelligence_profiles_part_\d+\.sql$/.test(f))) {
  for (const line of fs.readFileSync(new URL(file, root), "utf8").split("\n")) {
    const match = line.match(/^    \('(\d{4})','/);
    if (match) profiles.push(JSON.parse(line.slice(match[0].length, line.lastIndexOf("'::jsonb,")).replaceAll("''", "'")));
  }
}
const publicRows = JSON.parse(fs.readFileSync(new URL("../supabase/fixtures/municipal-public-depth.json", import.meta.url), "utf8"));
function runtime(profile) {
  const code = profile.municipality_code;
  return {
    context: { municipality_code: code, municipality_name: profile.municipality_name, department_name: profile.department_name },
    geo: { municipality: { municipality_code: code } },
    voter_roll: { municipality_code: code, aggregates: [] },
    elector_profile: { ...profile.active_voter_profile, municipality_code: code },
    intelligence_profile: { ...profile, public_context: publicRows.find((r) => r.municipality_code === code) },
    layers: [], demographics: null,
  };
}

test("the actual shared selector keeps all 340 source profiles isolated", () => {
  assert.equal(profiles.length, 340);
  assert.equal(new Set(profiles.map((p) => p.municipality_code)).size, 340);
  for (const profile of profiles) {
    const input = runtime(profile);
    const model = build(input);
    assert.equal(model.municipalityCode, profile.municipality_code);
    assert.equal(model.activeElectors, profile.active_voter_profile.total_active);
    assert.equal(model.communityCatalog.length, profile.community_catalog.records.length);
    assert.equal(model.publicDepth.municipality_code, profile.municipality_code);
    // No election source in this input: never borrow a pilot result or invent one.
    assert.equal(model.participationReference, null);
    assert.equal(model.magicNumber, null);
    const foreign = profile.municipality_code === "0509" ? "1208" : "0509";
    for (const field of ["elector_profile", "intelligence_profile", "voter_roll"]) {
      assert.throws(() => build({ ...input, [field]: { ...input[field], municipality_code: foreign } }), /CROSS_MUNICIPAL_RUNTIME_BLOCKED/);
    }
    assert.throws(() => build(input, [{layer_id: "MINFIN_YTD", payload: { municipality_code: foreign }}]), /CROSS_MUNICIPAL_LAYER_BLOCKED/);
  }
});

test("public-layer fixtures remain local across consecutive municipality changes", () => {
  for (const code of ["0509", "1208", "0101", "1901", "0301", "0608", "1208", "0509"]) {
    const input = runtime(profiles.find((p) => p.municipality_code === code));
    const { layers } = JSON.parse(fs.readFileSync(new URL(`../scripts/fixtures/public-municipal-layers-${code}.json`, import.meta.url), "utf8"));
    const model = build(input, layers);
    for (const layer of layers) assert.deepEqual(model.payload(layer.layer_id), layer.payload ?? {});
    assert.equal(model.municipalityCode, code);
    const other = code === "0509" ? "1208" : "0509";
    const { layers: foreign } = JSON.parse(fs.readFileSync(new URL(`../scripts/fixtures/public-municipal-layers-${other}.json`, import.meta.url), "utf8"));
    assert.throws(() => build(input, foreign), /CROSS_MUNICIPAL_LAYER_BLOCKED/);
  }
});
