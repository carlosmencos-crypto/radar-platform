import type { MunicipalIntelligenceModel } from "../data/v70MunicipalIntelligence";
import { formatDecimal, formatInteger, formatPercent } from "../data/v70MunicipalIntelligence";

export function V70MunicipalPoverty({ model }: { model: MunicipalIntelligenceModel }) {
  const data = model.publicDepth?.poverty;
  if (!data) return null;
  return <div className="municipal-poverty-depth">
    <header><div><small>SEGEPLAN · MAPAS DE POBREZA 2023</small><h3>Condiciones económicas de la población</h3></div><span>Estimación municipal modelada</span></header>
    <div className="poverty-indicator-grid">
      <article><span>Pobreza general</span><b>{formatPercent(data.general_pct, false)}</b><small>{formatInteger(data.general_population)} personas estimadas</small></article>
      <article><span>Pobreza extrema</span><b>{formatPercent(data.extreme_pct, false)}</b><small>{data.extreme_population === null ? "La fuente no publica una estimación utilizable" : `${formatInteger(data.extreme_population)} personas estimadas`}</small></article>
      <article><span>Brecha de pobreza general</span><b>{formatPercent(data.gap_pct, false)}</b><small>Intensidad de la pobreza estimada</small></article>
      <article><span>Consumo por persona</span><b>Q {formatDecimal(data.consumption_per_capita_month_gtq, 2)}</b><small>Promedio mensual estimado</small></article>
    </div>
    <p className="trace-note">Estimaciones para {model.municipalityName}, 2023. No describen hogares individuales y no se atribuyen a comunidades, centros de votación ni JRV. Los valores no publicados permanecen vacíos. <a href={data.product_url} target="_blank" rel="noreferrer">Consultar fuente y metodología ↗</a></p>
  </div>;
}

const measurement = (value: number | null, unit: string) => value === null ? "No publicado" : `${formatDecimal(value, 3)} ${unit}`;

export function V70MunicipalPlanning({ model }: { model: MunicipalIntelligenceModel }) {
  const planning = model.publicDepth?.planning;
  if (!planning) return null;
  const doc = planning.document;
  const hasContent = planning.priorities.length > 0 || planning.indicators.length > 0;
  return <div className="municipal-planning-depth">
    <header><div><small>PLANIFICACIÓN MUNICIPAL · PDM / PDM-OT</small><h3>Diagnóstico, líneas base y metas del plan</h3></div><span>{hasContent ? "Contenido documentado parcial" : doc.file_id ? "Contenido pendiente de integración" : "Documento no disponible en el inventario"}</span></header>
    <p>La lectura corresponde al documento de {model.municipalityName}; sus diagnósticos históricos y metas no prueban la situación actual ni la ejecución de obras.</p>
    {doc.source_qa === "FAIL_CLOSED" ? <p className="planning-source-note"><b>Observación documental pendiente:</b> {doc.source_observation}</p> : null}
    {planning.review_notes?.length ? <details className="planning-source-note"><summary>Alcance de la revisión y datos excluidos</summary><ul>{planning.review_notes.map(note => <li key={note}>{note}</li>)}</ul></details> : null}
    {!hasContent ? <p className="planning-empty">{doc.file_id ? "El documento está localizado. Su diagnóstico, indicadores y metas todavía no están incorporados con validación suficiente." : "El inventario nacional no contiene un documento para este municipio. La ausencia permanece pendiente de evidencia institucional."}</p> : null}
    {planning.priorities.length ? <div className="planning-priorities">{(["PROBLEMA", "POTENCIALIDAD"] as const).map((kind) => <article key={kind}>
      <small>{kind === "PROBLEMA" ? "PROBLEMAS DOCUMENTADOS EN EL PLAN" : "POTENCIALIDADES DOCUMENTADAS EN EL PLAN"}</small>
      <ul>{planning.priorities.filter((item) => item.kind === kind).map((item) => <li key={`${item.pdf_page}-${item.label}`}><b>{item.label}</b><a href={`${doc.url}#page=${item.pdf_page}`} target="_blank" rel="noreferrer">PDF p. {item.pdf_page} ↗</a></li>)}</ul>
    </article>)}</div> : null}
    {planning.indicators.length ? <div className="planning-indicator-scroll" role="region" aria-label={`Líneas base y metas del plan de ${model.municipalityName}`} tabIndex={0}>
      <table><thead><tr><th>Indicador del plan</th><th>Línea base</th><th>Año de base</th><th>Meta del plan</th><th>Referencia y alcance</th></tr></thead><tbody>{planning.indicators.map((item) => <tr key={item.id}>
        <th scope="row">{item.label}</th><td>{measurement(item.baseline, item.baseline_unit)}</td><td>{item.baseline_year ?? "No especificado"}</td><td>{measurement(item.target, item.target_unit)}<small>{item.target_year ?? "Año individual no especificado"}</small></td><td><b>{item.reference}</b><span>{item.note}</span></td>
      </tr>)}</tbody></table>
    </div> : null}
    {hasContent ? <p className="trace-note">{planning.priorities.length ? `${planning.priorities.length} prioridades` : `${planning.indicators.length} indicadores`} contrastados con su fuente documental. Las prioridades describen lo que identifica el plan, no hechos actuales comprobados. La revisión integral del plan permanece pendiente. {Array.from(new Map([...planning.priorities, ...planning.indicators].map((item) => [item.product_url, item])).values()).map((item) => <a key={item.product_url} href={item.product_url} target="_blank" rel="noreferrer">Consultar evidencia ↗ </a>)}</p> : null}
    <div className="municipal-document-source"><div><small>FUENTE MUNICIPAL</small><b>{doc.file_name ?? "Documento no localizado"}</b><p>{doc.publication_year ? `Año editorial registrado: ${doc.publication_year}. ` : "Año editorial no confirmado. "}{doc.source_qa === "FAIL_CLOSED" ? "El horizonte del plan requiere revisión de la observación documental." : doc.plan_start && doc.plan_end ? `Horizonte registrado: ${doc.plan_start}–${doc.plan_end}.` : "Horizonte completo no confirmado."}</p></div>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">Consultar PDM / PDM-OT ↗</a> : null}</div>
  </div>;
}
