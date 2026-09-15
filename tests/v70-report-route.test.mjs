import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("0509 report actions resolve to an authorized V70 executive-report surface", () => {
  const app = read("src/app/App.tsx");
  const gate = read("src/components/V70DirectReportAccessGate0509.tsx");
  const report = read("src/components/V70DirectReport0509.tsx");
  const builder = read("src/components/V70DirectReportBuilder.tsx");
  const exporter = read("src/components/V70DirectIntelligenceExport0509.tsx");

  assert.ok(app.includes('path="reporte/:section" element={<V70DirectReportAccessGate0509 />}'), "Authorized executive report route is not mounted.");
  assert.ok(app.includes('import { V70DirectReportAccessGate0509 }'), "Authorized report gate is not imported.");
  assert.ok(gate.includes('ensureRadarAccessToken()'), "Report route does not verify the active RADAR session.");
  assert.ok(gate.includes('resolveAuthorizedRadarConsumer("0509", accessToken)'), "Report route does not verify authorized 0509 context.");
  assert.ok(gate.includes('<V70DirectReport0509 />'), "Authorized gate does not render the canonical report.");
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
