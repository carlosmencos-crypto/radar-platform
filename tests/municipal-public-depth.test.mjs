import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { municipalPublicDepth } from "../src/data/municipalPublicDepth.ts";
import { municipalPublicDepthReport } from "../src/data/municipalPublicDepthReport.ts";

const rows = JSON.parse(fs.readFileSync(new URL("../supabase/fixtures/municipal-public-depth.json", import.meta.url), "utf8"));
const get = (code) => structuredClone(rows.find((row) => row.municipality_code === code));

test("report retains every validated entry, unknown magnitudes and unit caveats", () => {
  for (const code of ["0501", "0502", "0509", "0513", "0101", "1208"]) {
    const value = municipalPublicDepth(get(code), code);
    const cards = municipalPublicDepthReport(value);
    const text = cards.flatMap((c) => c.items).join("\n");
    for (const entry of [...value.planning.priorities, ...value.planning.indicators]) assert.ok(text.includes(entry.label));
    assert.ok(cards.every((c) => c.items.length <= 3));
    assert.ok(cards.some((c) => c.text.includes("no equivalen")));
  }
  assert.match(municipalPublicDepthReport(municipalPublicDepth(get("0509"), "0509")).flatMap((c) => c.items).join("\n"), /tasa PDM/);
});

test("recovered Vault products bind every official municipality without inventing missing values", () => {
  const official = JSON.parse(fs.readFileSync(new URL("../supabase/fixtures/tse-agreement-327-bases.json", import.meta.url), "utf8"));
  assert.deepEqual(rows.map((r) => r.municipality_code).sort(), official.map((r) => r.municipality_code).sort());
  for (const row of rows) {
    const value = municipalPublicDepth(row, row.municipality_code);
    assert.ok(value?.poverty, row.municipality_code);
    assert.ok(value?.planning, row.municipality_code);
    assert.equal(municipalPublicDepth(row, row.municipality_code === "0509" ? "1208" : "0509"), null);
  }
  assert.equal(rows.filter((r) => r.poverty.extreme_pct === null).length, 23);
  assert.equal(rows.filter((r) => r.planning.document.source_qa === "FAIL_CLOSED").length, 128);
  assert.deepEqual(rows.filter((r) => r.planning.review_status === "NO_DOCUMENT_IN_INVENTORY").map((r) => r.municipality_code), ["0101", "0115", "0116", "0201", "1333"]);
  assert.equal(rows.reduce((n, r) => n + r.planning.priorities.length, 0), 64);
  assert.equal(rows.reduce((n, r) => n + r.planning.indicators.length, 0), 12);
  assert.equal(rows.filter((r) => r.planning.review_status === "PARTIAL_VALIDATED_CONTENT").length, 6);
});

test("prior validated PDM units, unknown years, unknown magnitudes, and source zeros survive", () => {
  const { planning, poverty } = municipalPublicDepth(get("0509"), "0509");
  assert.equal(poverty.general_pct, 26.3);
  const indicators = new Map(planning.indicators.map((r) => [r.id, r]));
  assert.equal(indicators.get("EDU_TNC_PRIMARY").baseline, 102.1);
  assert.equal(indicators.get("WATER_COVERAGE_INDEX").baseline, 0.178);
  assert.equal(indicators.get("WATER_COVERAGE_INDEX").baseline_unit, "índice");
  assert.equal(indicators.get("CLANDESTINE_DUMPS").baseline, null);
  assert.equal(indicators.get("CLANDESTINE_DUMPS").target, 0);
  assert.equal(indicators.get("WASTEWATER_PLANTS").baseline, 0);
  assert.equal(indicators.get("WASTEWATER_PLANTS").baseline_year, null);
  assert.equal(indicators.get("MORTALITY_INFANT").baseline_unit, "tasa PDM");
});

test("cross-municipality nested evidence and wrong provenance fail closed", () => {
  for (const change of [
    (r) => { r.planning.indicators[0].municipality_code = "1208"; },
    (r) => { r.planning.indicators[0].source_id = "GT-SEGEPLAN-PDMOT-1208-001"; },
    (r) => { r.planning.document.file_name = "1208_PDM_OT_SIBINAL.pdf"; },
    (r) => { r.planning.document.url = "https://example.org/foreign.pdf"; },
    (r) => { r.planning.indicators[0].reference = "Coincidencia léxica"; },
    (r) => { r.planning.indicators[0].baseline = "0"; },
    (r) => { r.planning.indicators[0].status = "PENDING_SEMANTIC_REVIEW"; },
    (r) => { r.planning.review_status = "CLIENT_READY"; },
  ]) {
    const row = get("0509"); change(row);
    assert.equal(municipalPublicDepth(row, "0509").planning, null);
    assert.ok(municipalPublicDepth(row, "0509").poverty);
  }
  const row = get("0501"); row.planning.priorities[0].pdf_page = 0;
  assert.equal(municipalPublicDepth(row, "0501").planning, null);
});

test("inventory or lexical counts alone cannot become validated planning content", () => {
  const row = get("1207");
  row.planning.themes = { agua: 200, turismo: 50 };
  assert.equal(municipalPublicDepth(row, "1207").planning.indicators.length, 0);
  row.planning.review_status = "PARTIAL_VALIDATED_CONTENT";
  assert.equal(municipalPublicDepth(row, "1207").planning, null);
  const poverty = get("0102"); poverty.poverty.municipality_code = "0509";
  assert.equal(municipalPublicDepth(poverty, "0102").poverty, null);
});

test("direct PDF reviews remain historical, source-bound, and incomplete", () => {
  for (const code of ["0102", "1208"]) {
    const row = get(code);
    const plan = municipalPublicDepth(row, code).planning;
    assert.ok(plan.priorities.length > 0);
    assert.equal(plan.indicators.length, 0, "National targets and conflicting percentages must not be imported");
    assert.equal(plan.review_status, "PARTIAL_VALIDATED_CONTENT");
    assert.equal(plan.document.source_qa, "FAIL_CLOSED");
    assert.ok(plan.review_notes.length > 0);
    const report = municipalPublicDepthReport(municipalPublicDepth(row, code));
    for (const note of plan.review_notes) assert.ok(report.some(card => card.items.includes(note)));
    for (const change of [
      p => { p.product_url = get(code === "0102" ? "1208" : "0102").planning.document.url; },
      p => { p.evidence_scope = "CURRENT_MEASUREMENT"; },
      p => { delete p.source_pdf_sha256; },
    ]) {
      const invalid = get(code); change(invalid.planning.priorities[0]);
      assert.equal(municipalPublicDepth(invalid, code).planning, null);
    }
  }
});
