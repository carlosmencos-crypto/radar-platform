import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const municipalities = read("src/data/municipalities.ts");
const intelligence = read("src/components/V70DirectIntelligence0509.tsx");
const rich = read("src/components/V70CanonicalRichMunicipality.tsx").replace(
  "<V70MunicipalPublicIndicators model={model} />", read("src/components/V70MunicipalPublicIndicators.tsx"),
);
const home = read("src/components/V70DirectHome0509.tsx");
const strategy = read("src/components/V70DirectStrategyArea0509.tsx");
const report = read("src/components/V70DirectReport0509.tsx");
const runtime = read("src/data/radarRuntime.ts");

test("the 340-route catalog is bound to one V70 presentation contract", () => {
  assert.equal((municipalities.match(/code:\s*"\d{4}"/g) ?? []).length, 340);
  assert.equal((intelligence.match(/data-v70-contract="electorate-profile-v70"/g) ?? []).length, 1);
  assert.match(intelligence, /<CanonicalMunicipalIntelligenceContent onSelectionChange=/);
  assert.doesNotMatch(intelligence, /\bGolden0509IntelligenceContent\b|\bMunicipalIntelligenceContent\b/);
  assert.doesNotMatch(report, /Golden0509Report|MunicipalV70Report/);
  assert.match(report, /return <CanonicalV70Report \/>/);
});

test("the Golden electorate blocks are structural and missing data stays visible", () => {
  for (const token of [
    "register-total",
    "sex-profile",
    "literacy-profile",
    "age-profile",
    "universe-card",
    "INE · CENSO 2018",
    "INE · PROYECCIÓN",
    "No publicado",
    "PADRÓN DETALLADO 2023 · UNIVERSO SEPARADO",
  ]) assert.ok(intelligence.includes(token), `Missing structural token ${token}`);
  assert.match(runtime, /bundle\.elector_profile != null/);
  assert.match(runtime, /bundle\.elector_profile\?\.municipality_code !== municipalityCode/);
});

test("the active client surfaces contain no municipality-specific presentation fork", () => {
  const forbidden = /municipality_code\s*===\s*["']0509["']|municipalityCode\s*===\s*["']0509["']/;
  for (const [name, source] of [["Inteligencia", intelligence], ["Inicio", home], ["Estrategia", strategy], ["Reporte", report]]) {
    assert.doesNotMatch(source, forbidden, `${name} still forks the UI for 0509.`);
  }
});

test("the complete Intelligence section order is shared by every municipality", () => {
  const ordered = [
    "HISTÓRICO ELECTORAL MUNICIPAL · TSE",
    "ORGANIZACIÓN COMUNITARIA TSE · 2023",
    "FOTOGRAFÍA MUNICIPAL",
    "FINANZAS MUNICIPALES · 2026 YTD",
    "RANKING DE GESTIÓN 2020–2021",
    "CAPACIDAD FISCAL Y GESTIÓN MUNICIPAL",
    "INVERSIÓN PÚBLICA · SNIP + GUATECOMPRAS",
    "EDUCACIÓN, NUTRICIÓN, SALUD Y CONDICIONES DE VIDA",
    "SEGURIDAD Y CONFLICTIVIDAD",
    "ECONOMÍA Y EMPLEO LOCAL",
    "INFRAESTRUCTURA, CONECTIVIDAD Y RIESGO",
    "LECTURA EJECUTIVA",
  ];
  let position = -1;
  for (const heading of ordered) {
    const next = rich.indexOf(heading);
    assert.ok(next > position, `Missing or reordered V70 section: ${heading}`);
    position = next;
  }
});
