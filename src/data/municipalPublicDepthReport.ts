import type { MunicipalPublicDepth } from "./municipalPublicDepth";

/** Small report cards retain source units and keep PDF pages within their layout. */
export function municipalPublicDepthReport(value: MunicipalPublicDepth | null) {
  const sections: Array<{key: string; eyebrow: string; title: string; text: string; items: string[]}> = [];
  const display = (n: number | null, unit: string) => n === null ? "No publicado" : `${n.toLocaleString("es-GT", {maximumFractionDigits: 3})} ${unit}`;
  if (value?.poverty) {
    const p = value.poverty;
    sections.push({key: "indicators", eyebrow: "SEGEPLAN · 2023", title: "Pobreza municipal estimada", text: "Estimaciones modeladas a escala municipal. No se atribuyen a personas, comunidades, centros ni JRV.", items: [
      `Pobreza general: ${display(p.general_pct, "%")}; extrema: ${display(p.extreme_pct, "%")}.`,
      `Brecha general: ${display(p.gap_pct, "%")}; consumo por persona: ${display(p.consumption_per_capita_month_gtq, "Q/mes")}.`,
      `Fuente: ${p.source_id}.`,
    ]});
  }
  const planning = value?.planning;
  if (!planning) return sections;
  const entries = [
    ...planning.priorities.map((p) => `${p.kind === "PROBLEMA" ? "Problema" : "Potencialidad"} del plan: ${p.label}. PDF p. ${p.pdf_page}.`),
    ...planning.indicators.map((p) => `${p.label}: base ${display(p.baseline, p.baseline_unit)} (${p.baseline_year ?? "año no especificado"}); meta ${display(p.target, p.target_unit)} (${p.target_year ?? "año individual no especificado"}). ${p.reference}. ${p.note}`),
  ];
  if (!entries.length) entries.push(planning.document.file_id ? "Documento localizado; diagnóstico y metas pendientes de integración validada." : "Documento ausente en el inventario. Pendiente de evidencia institucional.");
  for (let index = 0; index < entries.length; index += 3) {
    sections.push({key: "indicators", eyebrow: "PDM / PDM-OT · REFERENCIA HISTÓRICA", title: `Diagnóstico y metas del plan · ${Math.floor(index / 3) + 1}`,
      text: "Contenido parcial del plan; las metas no equivalen a obras ejecutadas ni a mediciones actuales.", items: entries.slice(index, index + 3)});
  }
  sections.push({key: "indicators", eyebrow: "TRAZABILIDAD DOCUMENTAL", title: "Fuente y límites del plan", text: planning.document.file_name ?? "Documento no localizado", items: [
    planning.document.source_qa === "FAIL_CLOSED" ? planning.document.source_observation ?? "Observación documental pendiente." : "Se conservan los períodos y universos originales del plan.",
    planning.document.url ?? "Ausencia documental no resuelta.",
  ]});
  for (let index = 0; index < (planning.review_notes?.length ?? 0); index += 2) {
    sections.push({key: "indicators", eyebrow: "ALCANCE DE LA REVISIÓN", title: "Datos excluidos y observaciones", text: "Se preservan las discrepancias; el diagnóstico no acredita hechos actuales ni ejecución de metas.", items: planning.review_notes!.slice(index, index + 2)});
  }
  return sections;
}
