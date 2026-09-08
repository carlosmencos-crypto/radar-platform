import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const contract = JSON.parse(
  fs.readFileSync(new URL("../src/data/radarContract.generated.json", import.meta.url), "utf8"),
);

test("the canonical contract exposes 340 municipalities and 17 layers", () => {
  assert.equal(Object.keys(contract.nav).length, 340);
  assert.equal(Object.keys(contract.route_states).length, 340);
  assert.equal(Object.keys(contract.runtime_gate).length, 340);
  assert.equal(contract.layers.length, 17);
});

test("each municipality resolves one state for every canonical layer", () => {
  for (const [code, states] of Object.entries(contract.route_states)) {
    assert.match(code, /^\d{4}$/);
    assert.equal(states.length, 17, code);
    assert.equal(contract.runtime_gate[code].status, "PASS", code);
  }
});

test("special empty-state taxonomy remains explicit", () => {
  const counts = new Map();
  for (const states of Object.values(contract.route_states)) {
    states.forEach((state, index) => {
      if (state !== "SHOW_WITH_EMPTY_STATE") return;
      const layerId = contract.layers[index].layer_id;
      const coverage = contract.empty_coverage_by_layer[layerId];
      counts.set(coverage, (counts.get(coverage) ?? 0) + 1);
    });
  }
  assert.equal(counts.get("NO_DOCUMENT_IN_INVENTORY"), 5);
  assert.equal(counts.get("NO_CONTRACTS_PUBLISHED"), 15);
  assert.equal(counts.get("NO_EXPLICIT_ASSOCIATION_IN_SOURCE"), 178);
  assert.equal(counts.get("NO_RECORD_IN_SOURCE"), 1);
});

test("0509 and 1901 keep their canonical municipal context", () => {
  assert.deepEqual(
    [contract.nav["0509"].municipality_name, contract.nav["0509"].department_name],
    ["San José", "Escuintla"],
  );
  assert.deepEqual(
    [contract.nav["1901"].municipality_name, contract.nav["1901"].department_name],
    ["Zacapa", "Zacapa"],
  );
});
