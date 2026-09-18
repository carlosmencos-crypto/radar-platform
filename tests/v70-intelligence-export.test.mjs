import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

test("0509 Inteligencia preserves the canonical shell and opens the universal report", () => {
  const shell = read("src/components/V70DirectShell0509.tsx");
  const intelligence = read("src/components/V70DirectIntelligence0509.tsx");
  const territory = read("src/components/V70ElectoralTerritory.tsx");
  const builder = read("src/components/V70DirectReportBuilder.tsx");

  assert.match(shell, /V70DirectReportBuilder/);
  assert.match(shell, /if \(active === "inteligencia"\)/);
  assert.match(shell, /<main id="inicio" className=/);
  assert.match(shell, /<div className="portal-main">/);
  assert.match(shell, /<nav aria-label="Navegación principal">/);
  assert.match(shell, /<div id="cuenta" className="sidebar-account">/);
  assert.match(shell, /aria-label="Abrir menú"/);
  assert.match(shell, /const intelligenceExport = active === "inteligencia"/);
  assert.match(shell, /Reporte PDF integral/);
  assert.match(shell, /V70DirectReportBuilder section="inicio"/);

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
    "INFORME EJECUTIVO RADAR",
    "Actividades incluidas",
    "Todas",
    "Pasadas",
    "Programadas",
    "Próximos 7 días",
    "Preparar informe",
  ]) assert.ok(builder.includes(phrase), `Missing universal report copy: ${phrase}`);

  assert.ok(builder.includes("import.meta.env.BASE_URL") && builder.includes("reporte/inicio?"), "Universal report route must retain the deployed base path.");
  assert.ok(!builder.includes("createPortal"));
  assert.ok(!builder.includes("querySelector"));
  assert.ok(!builder.includes("insertAdjacentElement"));
});
