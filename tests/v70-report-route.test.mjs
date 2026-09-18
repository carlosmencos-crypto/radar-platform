import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

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
  assert.ok(builder.includes('import.meta.env.BASE_URL') && builder.includes('reporte/inicio?${query.toString()}'), "Universal ReportBuilder must retain the deployed base path.");
  assert.ok(exporter.includes('import.meta.env.BASE_URL') && exporter.includes('reporte/municipio-360?'), "Municipio-360 report must retain the deployed base path.");

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

  assert.ok(report.includes('dark?"radar-electoral-logo-horizontal-oscuro-transparente.svg":"radar-electoral-logo-horizontal-claro.svg"'), "Canonical light/dark report logo selection drifted.");
  assert.equal(sha256("public/brand/radar-electoral-logo-horizontal-claro.svg"), "9b40108347693adce301a58173a4ee1625b8e7190e81c97ac3ad293d1338dd2a", "Canonical light report logo asset drifted.");
  assert.ok(report.includes('window.print()'), "Canonical browser print/PDF action is missing.");
  assert.ok(!report.includes("createPortal"));
  assert.ok(!report.includes("querySelector"));
  assert.ok(!report.includes("insertAdjacentElement"));
});
