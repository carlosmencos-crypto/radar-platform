import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { municipalSlateSlots } from "../src/data/municipalSlate.ts";
import { electoralPartyColor } from "../src/data/electoralPartyColors.ts";
const bases = JSON.parse(fs.readFileSync(new URL("../supabase/fixtures/tse-agreement-327-bases.json", import.meta.url), "utf8"));

test("all 340 official municipal bases produce the documented titular and substitute offices", () => {
  assert.equal(bases.length, 340);
  assert.equal(new Set(bases.map((b) => b.municipality_code)).size, 340);
  for (const basis of bases) {
    const slots = municipalSlateSlots(basis, basis.municipality_code);
    assert.equal(slots.length, basis.all_positions, basis.municipality_code);
    assert.equal(slots.filter((s) => !s[1].includes("suplente")).length, basis.titular_positions);
    assert.equal(new Set(slots.map((s) => s[0])).size, slots.length);
    assert.equal(new Set(slots.map((s) => s[1])).size, slots.length);
  }
});
test("Sibinal and San José preserve their official counts and reject cross-municipality bases", () => {
  const sibinal = bases.find((b) => b.municipality_code === "1208");
  const sanJose = bases.find((b) => b.municipality_code === "0509");
  assert.equal(sibinal.published_population_total, 17988);
  assert.equal(sanJose.published_population_total, 72156);
  assert.equal(municipalSlateSlots(sibinal, "1208").length, 10);
  assert.equal(municipalSlateSlots(sanJose, "0509").length, 14);
  assert.deepEqual(municipalSlateSlots(sanJose, "1208"), []);
  assert.deepEqual(municipalSlateSlots(null, "1208"), []);
  assert.deepEqual(municipalSlateSlots({...sibinal, all_positions: 11}, "1208"), []);
});
test("historical colors retain the approved palette and stay stable outside the pilot", () => {
  assert.equal(electoralPartyColor("VALOR"), "#ef684f");
  assert.equal(electoralPartyColor(" cabal "), electoralPartyColor("CABAL"));
  assert.notEqual(electoralPartyColor("UNE"), electoralPartyColor("VAMOS"));
});
