import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/components/V70DirectIntelligence0509.tsx", import.meta.url), "utf8");

test("0509 Intelligence preserves the canonical electorate trace note", () => {
  const expected = "Fuentes: TSE · Ciudadanos empadronados activos 2026; INE · Censo 2018 y proyecciones municipales. Los porcentajes se calculan sobre cada universo oficial, sin imputar urbano/rural al padrón actual.";
  assert.ok(source.includes('className="trace-note"'), "Canonical trace-note class is missing.");
  assert.ok(source.includes(expected), "Canonical electorate trace copy is missing or changed.");
});
