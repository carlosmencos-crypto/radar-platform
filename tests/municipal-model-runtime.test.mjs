import assert from "node:assert/strict";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { attachRecoveredElectoralData } from "../scripts/qa-national-profile.mjs";

// Execute the actual selector; resolve its one value import for Node's TS loader.
const modelUrl = new URL("../src/data/v70MunicipalIntelligence.ts", import.meta.url);
const publicDepthUrl = new URL("../src/data/municipalPublicDepth.ts", import.meta.url).href;
const source = stripTypeScriptTypes(fs.readFileSync(modelUrl, "utf8"))
  .replace('from "./municipalPublicDepth"', `from ${JSON.stringify(publicDepthUrl)}`);
const { buildMunicipalIntelligenceModel: build, municipalPublicTrajectories: trajectories } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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


test("public histories reuse local candidacies and councils without asserting identity", () => {
  const history = { trajectories: [], elections: [
    { year: 2011, results: [{ candidate: "JUAN JOSÉ PEÑA LÓPEZ", party: "A" }] },
    { year: 2015, results: [{ candidate: "Juan Jose Peña Lopez", party: "B" }] },
    { year: 2019, results: [{ candidate: "JUAN JOSE PENA LOPEZ", party: "C" }] },
  ], councils: [{ year: 2023, members: [
    { name: "JUAN JOSÉ PEÑA LÓPEZ", office: "CONCEJAL I", party: "D", source_page: 14 },
    { name: "JUAN JOSÉ PEÑA LÓPEZ", office: "CONCEJAL I", party: "D", source_page: 14 },
  ] }] };
  const before = structuredClone(history);
  const matches = trajectories(history);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].years, [2011, 2015, 2023]);
  assert.equal(matches[0].elections, 3);
  assert.match(matches[0].route, /Candidatura a alcaldía/);
  assert.match(matches[0].route, /CONCEJAL I.*adjudicación, p. 14/);
  assert.equal(matches[0].route.split("CONCEJAL I").length - 1, 1);
  assert.match(matches[0].caution, /no confirma identidad ni afiliación vigente/);
  assert.deepEqual(history, before);
});

test("legacy public routes survive while previously absent years are added", () => {
  const original = "2011: SÍNDICO I (A) → 2015: CONCEJAL II (B)";
  const output = trajectories({ trajectories: [{ name: "ANA MARÍA LÓPEZ PÉREZ", years: [2011, 2015], route: original, caution: "Advertencia original" }],
    councils: [{ year: 2023, members: [{ name: "ANA MARIA LOPEZ PEREZ", office: "CONCEJAL III", party: "C" }] }] });
  assert.equal(output.length, 1);
  assert.ok(output[0].route.startsWith(original));
  assert.deepEqual(output[0].years, [2011, 2015, 2023]);
  assert.match(output[0].caution, /Advertencia original/);
});

test("one election, reordered names, initials and unavailable names do not create trajectories", () => {
  const names = ["ANA MARIA LOPEZ PEREZ", "LOPEZ PEREZ ANA MARIA", "A. MARIA LOPEZ", "NO PUBLICADO EN FUENTE"];
  const elections = names.map((candidate, i) => ({year: [2011, 2015, 2019, 2023][i], results: [{ candidate, party: "A" }]}));
  elections.push({year: 2015, results: [{candidate: "A. MARIA LOPEZ", party: "B"}, {candidate: "NO PUBLICADO EN FUENTE", party: "B"}]});
  assert.deepEqual(trajectories({elections}), []);
});

test("all 340 municipal histories preserve stored routes and only use local public names", () => {
  for (const profile of profiles) {
    const input = runtime(profile);
    const before = structuredClone(input);
    const output = build(input).politicalTrajectories;
    const history = profile.electoral_history;
    const key = (name) => name.normalize("NFD").replace(/n\u0303/gi, "ñ").replace(/\p{M}/gu, "").toUpperCase().trim().replace(/\s+/g, " ");
    const localNames = new Set([
      ...history.trajectories.map((r) => r.name),
      ...history.councils.flatMap((c) => c.members.map((r) => r.name)),
      ...history.elections.flatMap((e) => [e.winner_candidate, ...e.results.map((r) => r.candidate)]),
    ].filter(Boolean).map(key));
    for (const row of output) assert.ok(localNames.has(key(row.name)), profile.municipality_code);
    for (const old of history.trajectories) assert.ok(output.some((r) => r.route.includes(old.route)), profile.municipality_code);
    assert.deepEqual(input, before);
  }
  const fraijanes = profiles.find((p) => p.municipality_code === "0113");
  assert.ok(build(runtime(fraijanes)).politicalTrajectories.length > fraijanes.electoral_history.trajectories.length);
});


test("Fraijanes uses the recovered 2023 council, preserves its original match and exposes earlier records", () => {
  const profile = attachRecoveredElectoralData(structuredClone(profiles.find((p) => p.municipality_code === "0113")));
  const actual = build(runtime(profile)).politicalTrajectories;
  assert.ok(actual.length > 1);
  assert.ok(actual.some((p) => p.years.includes(2011) && p.years.includes(2015)));
  const original = profile.electoral_history.trajectories[0];
  assert.ok(actual.some((p) => p.route.includes(original.route)));
  console.log(`Fraijanes public name matches: ${profile.electoral_history.trajectories.length} stored → ${actual.length} reconciled`);
});
