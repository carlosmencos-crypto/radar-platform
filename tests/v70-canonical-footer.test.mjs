import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/components/V70Ecosystem0509.tsx", import.meta.url), "utf8");

test("0509 Intelligence preserves the canonical V70 product footer", () => {
  for (const expected of [
    'id="fuentes"',
    "Fuentes oficiales integradas",
    "TSE · INE · SEGEPLAN · MINFIN · MINEDUC · MSPAS · GUATECOMPRAS · CONRED",
    "Versión navegable · 21 julio 2026",
    "Cierre técnico condicionado a coordenadas · sin datos privados de campaña",
    "radar-electoral-logo-horizontal-oscuro-transparente.svg",
  ]) assert.ok(source.includes(expected), `Missing canonical footer fragment: ${expected}`);
});
