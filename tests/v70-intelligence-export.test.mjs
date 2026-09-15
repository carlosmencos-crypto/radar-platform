import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

test("0509 Inteligencia restores the canonical municipio-360 shell and export surface", () => {
  const shell = read("src/components/V70DirectShell0509.tsx");
  const intelligence = read("src/components/V70DirectIntelligence0509.tsx");
  const territory = read("src/components/V70ElectoralTerritory.tsx");
  const exporter = read("src/components/V70DirectIntelligenceExport0509.tsx");

  assert.match(shell, /V70DirectIntelligenceExport0509/);
  assert.match(shell, /if \(active === "inteligencia"\)/);
  assert.match(shell, /<main id="inicio" className=/);
  assert.match(shell, /<div className="portal-main">/);
  assert.match(shell, /<nav aria-label="Navegación principal">/);
  assert.match(shell, /<div id="cuenta" className="sidebar-account">/);
  assert.match(shell, /aria-label="Abrir menú"/);
  assert.match(shell, /const intelligenceExport = active === "inteligencia" \? <V70DirectIntelligenceExport0509/);
  assert.match(shell, /electionCode=\{intelligenceExportSelection\?\.electionCode\}/);
  assert.match(shell, /centerId=\{intelligenceExportSelection\?\.centerId\}/);

  assert.match(intelligence, /intelligenceExportSelection=\{exportSelection\}/);
  assert.match(intelligence, /onSelectionChange=\{handleSelectionChange\}/);
  assert.match(intelligence, /<V70ElectoralTerritory[^>]*onSelectionChange=\{onSelectionChange\}/);
  assert.match(intelligence, /className="print-cover"/);
  assert.match(intelligence, /radar-electoral-logo-reducido-horizontal-claro\.svg/);
  assert.match(intelligence, /San José \/ Puerto San José · 0509/);
  assert.equal(sha256("public/brand/radar-electoral-logo-reducido-horizontal-claro.svg"), "3ace9bc5d121a259d6d18109be1d13693d7e4a093b3bcbafa90367fe6e13e42d", "Canonical compact municipio-360 print logo drifted.");
  assert.match(territory, /onSelectionChange\?: \(selection: SelectionChange\) => void/);
  assert.match(territory, /onSelectionChange\?\.\(\{ electionCode, centerId \}\)/);

  for (const phrase of [
    "Exportar vista",
    "Reporte PDF personalizado",
    "REPORTE EJECUTIVO",
    "Exportar esta lectura",
    "Lectura electoral municipal",
    "Detalle del centro seleccionado",
    "Comunidades y territorio",
    "Indicadores municipales",
    "Finanzas y gestión",
    "Generar PDF",
    "Guardar como PDF",
  ]) assert.ok(exporter.includes(phrase), `Missing canonical municipio-360 export copy: ${phrase}`);

  assert.ok(exporter.includes("/reporte/municipio-360?"), "Canonical municipio-360 report route is missing.");
  assert.ok(exporter.includes('"CORPORACION_MUNICIPAL"'), "Canonical default Alcaldía election context is missing.");
  assert.ok(!exporter.includes("createPortal"));
  assert.ok(!exporter.includes("querySelector"));
  assert.ok(!exporter.includes("insertAdjacentElement"));
});
