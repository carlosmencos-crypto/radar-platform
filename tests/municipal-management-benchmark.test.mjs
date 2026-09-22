import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { municipalManagementBenchmark } from "../src/data/municipalManagementBenchmark.ts";
import { loadRecoveredManagementBenchmark } from "../scripts/qa-national-profile.mjs";

test("recovered official RGM covers all 340 municipalities with six bound dimensions", () => {
  const bases = JSON.parse(fs.readFileSync(new URL("../supabase/fixtures/tse-agreement-327-bases.json", import.meta.url), "utf8"));
  for (const { municipality_code: code } of bases) {
    const benchmark = loadRecoveredManagementBenchmark(code);
    assert.ok(municipalManagementBenchmark(benchmark, code), code);
    assert.equal(municipalManagementBenchmark(benchmark, code === "1208" ? "0509" : "1208"), null);
  }
});

test("incomplete or invalid management data stays unavailable, while reported zero is retained", () => {
  const benchmark = loadRecoveredManagementBenchmark("1208");
  assert.equal(municipalManagementBenchmark({...benchmark, dimensions: benchmark.dimensions.slice(1)}, "1208"), null);
  const invalid = structuredClone(benchmark);
  invalid.dimensions[0].score = 1.2;
  assert.equal(municipalManagementBenchmark(invalid, "1208"), null);
  invalid.dimensions[0].score = 0;
  assert.equal(municipalManagementBenchmark(invalid, "1208").dimensions[0].score, 0);
});
