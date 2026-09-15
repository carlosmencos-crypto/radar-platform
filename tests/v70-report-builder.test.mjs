import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const builder = fs.readFileSync(new URL("../src/components/V70DirectReportBuilder.tsx", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../src/components/V70DirectShell0509.tsx", import.meta.url), "utf8");

test("direct 0509 shell uses the canonical V70 report builder", () => {
  for (const expected of [
    "INFORME EJECUTIVO RADAR",
    "Crear reporte PDF",
    "Resumen ejecutivo",
    "Indicadores principales",
    "Áreas de control",
    "Registros vigentes",
    "Fuentes y trazabilidad",
    "Documento escrito, no solo una captura",
    "Preparar informe",
  ]) assert.ok(builder.includes(expected), `Missing canonical ReportBuilder fragment: ${expected}`);
  assert.ok(shell.includes("V70DirectReportBuilder"), "Direct shell must mount the canonical ReportBuilder.");
  assert.ok(!shell.includes("La exportación conserva la vista municipal autorizada"), "Non-canonical report modal copy must not return.");
});
