import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { createRadarXlsx } from "../src/data/xlsxExport.ts";

const workbook = createRadarXlsx([
  {
    name: "Resumen general",
    brandTitle: "RADAR · INTELIGENCIA ELECTORAL",
    campaignLine: "CAMPAÑA · CONTROL QA",
    title: "Control financiero general",
    description: "Validación de compatibilidad OOXML",
    headers: ["Indicador", "Monto", "Cómo se calcula"],
    rows: [
      ["Presupuesto general", 125000, "Suma de presupuestos"],
      ["Disponible", 84250.5, "Ingresos menos egresos"],
    ],
    widths: [26, 19, 63],
    currencyColumns: [1],
  },
  {
    name: "Movimientos generales",
    headers: ["Tipo", "Concepto", "Monto"],
    rows: [["Ingreso", "Aporte registrado", 1000]],
    currencyColumns: [2],
  },
  {
    name: "Presupuestos",
    headers: ["Presupuesto", "Saldo actual"],
    rows: [["Territorio", 24000]],
    currencyColumns: [1],
  },
]);

const files = unzipSync(new Uint8Array(await workbook.arrayBuffer()));
for (const required of [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
  "xl/worksheets/sheet2.xml",
  "xl/worksheets/sheet3.xml",
]) assert.ok(files[required], `Falta la parte OOXML ${required}`);

for (let index = 1; index <= 3; index += 1) {
  const xml = strFromU8(files[`xl/worksheets/sheet${index}.xml`]);
  const sheetData = xml.indexOf("<sheetData>");
  const autoFilter = xml.indexOf("<autoFilter");
  const mergeCells = xml.indexOf("<mergeCells");
  const ignoredErrors = xml.indexOf("<ignoredErrors>");
  const worksheetEnd = xml.indexOf("</worksheet>");
  assert.ok(sheetData >= 0 && worksheetEnd > sheetData, `Hoja ${index} sin datos legibles`);
  if (autoFilter >= 0 && mergeCells >= 0) assert.ok(autoFilter < mergeCells, `Hoja ${index}: autoFilter debe anteceder a mergeCells`);
  if (mergeCells >= 0) assert.ok(mergeCells < ignoredErrors, `Hoja ${index}: mergeCells debe anteceder a ignoredErrors`);
  assert.ok(ignoredErrors > sheetData && ignoredErrors < worksheetEnd, `Hoja ${index}: ignoredErrors fuera de orden`);
  assert.equal(xml.slice(xml.indexOf("</ignoredErrors>") + "</ignoredErrors>".length, worksheetEnd), "", `Hoja ${index}: hay nodos inválidos después de ignoredErrors`);
}

const workbookXml = strFromU8(files["xl/workbook.xml"]);
for (const name of ["Resumen general", "Movimientos generales", "Presupuestos"]) assert.ok(workbookXml.includes(`name="${name}"`), `Falta la hoja ${name}`);

console.log(`RADAR_XLSX_OOXML_OK ${workbook.size} bytes · 3 hojas · orden compatible con Excel`);
