import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/components/V70DirectIntelligence0509.tsx", import.meta.url), "utf8");

test("Intelligence preserves the canonical electorate trace note without mixing municipal universes", () => {
  const expected = "Fuentes: TSE · padrón activo 2026 y padrón detallado 2023; INE · Censo 2018 y proyecciones municipales. Un vacío permanece visible y nunca se rellena ni se mezcla con otro universo.";
  assert.ok(source.includes('className="trace-note"'), "Canonical trace-note class is missing.");
  assert.ok(source.includes(expected), "Canonical electorate trace copy is missing or changed.");
});
