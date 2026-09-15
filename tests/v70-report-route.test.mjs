import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("0509 report actions resolve to the V70 executive-report surface", () => {
  const app = read("src/app/App.tsx");
  const report = read("src/components/V70DirectReport0509.tsx");
  const builder = read("src/components/V70DirectReportBuilder.tsx");
  const exporter = read("src/components/V70DirectIntelligenceExport0509.tsx");

  assert.ok(app.includes('path="reporte/:section" element={<V70DirectReport0509 />}'), "Executive report route is not mounted.");
  assert.ok(app.includes('import { V70DirectReport0509 }'), "Executive report component is not imported.");
  assert.ok(builder.includes('/reporte/${encodeURIComponent(section)}?parts='), "Generic ReportBuilder destination drifted.");
  assert.ok(exporter.includes('/reporte/municipio-360?'), "Municipio-360 report destination drifted.");

  for (const phrase of [
    "report-shell",
    "report-actions",
    "Guardar / Imprimir PDF",
    "Copiar enlace",
    "EXPEDIENTE MUNICIPAL 360",
    "Inteligencia Municipal",
    "FUENTES Y TRAZABILIDAD",
    "DATA VAULT",
    "CAMPAIGN VAULT",
  ]) assert.ok(report.includes(phrase), `Missing canonical report surface/copy: ${phrase}`);

  assert.ok(report.includes('window.print()'), "Canonical browser print/PDF action is missing.");
  assert.ok(!report.includes("createPortal"));
  assert.ok(!report.includes("querySelector"));
  assert.ok(!report.includes("insertAdjacentElement"));
});
