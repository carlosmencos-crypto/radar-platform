import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("0509 Inteligencia restores the canonical municipio-360 export surface", () => {
  const shell = read("src/components/V70DirectShell0509.tsx");
  const exporter = read("src/components/V70DirectIntelligenceExport0509.tsx");

  assert.match(shell, /V70DirectIntelligenceExport0509/);
  assert.match(shell, /active==="inteligencia"\?<V70DirectIntelligenceExport0509/);
  assert.match(shell, /aria-label=\{active==="inteligencia"\?"Navegación principal":undefined\}/);
  assert.match(shell, /id=\{active==="inteligencia"\?"cuenta":undefined\}/);
  assert.match(shell, /aria-label=\{active==="inteligencia"\?"Abrir menú":undefined\}/);

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
