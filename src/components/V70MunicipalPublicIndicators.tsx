import type { MunicipalIntelligenceModel } from "../data/v70MunicipalIntelligence";
import { finite, formatDecimal, formatInteger, formatPercent, textValue } from "../data/v70MunicipalIntelligence";

const householdIndicators = [
  ["water_pipe_inside_pct", "Agua entubada dentro de la vivienda"],
  ["electric_grid_pct", "Conexión a red eléctrica"],
  ["sanitary_drainage_pct", "Servicio sanitario conectado a drenaje"],
  ["sanitary_none_pct", "Sin servicio sanitario"],
  ["garbage_collection_pct", "Recolección de basura"],
  ["garbage_burned_pct", "Quema de basura"],
  ["cooking_firewood_pct", "Leña como combustible para cocinar"],
  ["internet_pct", "Internet en el hogar"],
  ["computer_pct", "Computadora en el hogar"],
  ["refrigerator_pct", "Refrigeradora en el hogar"],
] as const;

export function V70MunicipalPublicIndicators({ model }: { model: MunicipalIntelligenceModel }) {
  const census = model.payload("INE_CENSO_B2_B6");
  const nutrition = model.payload("SESAN_TALLA");
  const schools = model.payload("MINEDUC_ESCUELAS");
  const health = model.payload("MSPAS_SALUD");
  const services = model.payload("RGM_SERVICIOS");
  const pdm = model.payload("PDM_PDMOT");
  const period = (id: string) => model.layer(id)?.period || "Período no publicado";
  const documentUrl = textValue(pdm.drive_url);
  const verifiedDocumentUrl = documentUrl?.startsWith("https://drive.google.com/file/d/") ? documentUrl : null;
  const cards = [
    { label: "AGUA EN LA VIVIENDA", value: finite(census.water_pipe_inside_pct), share: true, detail: `${formatInteger(finite(census.total_households))} hogares censados`, source: `INE · ${period("INE_CENSO_B2_B6")}` },
    { label: "RED ELÉCTRICA", value: finite(census.electric_grid_pct), share: true, detail: "Conexión domiciliar a la red", source: `INE · ${period("INE_CENSO_B2_B6")}` },
    { label: "PREVALENCIA DE TALLA BAJA", value: finite(nutrition.stunting_prevalence_pct), share: false, percent: true, detail: `${formatInteger(finite(nutrition.analyzed_students))} escolares analizados`, source: `SESAN / MINEDUC · ${period("SESAN_TALLA")}` },
    { label: "RED EDUCATIVA", value: finite(schools.records), detail: `${formatInteger(finite(schools.level_primaria))} primaria · ${formatInteger(finite(schools.level_basico))} básico`, source: `MINEDUC · ${period("MINEDUC_ESCUELAS")}` },
    { label: "RED DE SALUD", value: finite(health.records), detail: `${formatInteger(finite(health.map_publishable))} establecimientos georreferenciados`, source: `MSPAS · ${period("MSPAS_SALUD")}` },
  ];
  return <section className="section municipal-photo exportable include-print">
    <div className="section-head"><div><p className="eyebrow">FOTOGRAFÍA MUNICIPAL</p><h2>Condiciones de vida y servicios públicos</h2></div><p>Datos de {model.municipalityName}, con fuente, período y universo visibles. Las líneas base históricas no describen automáticamente la situación actual.</p></div>
    <div className="insight-grid national-insight-grid">{cards.map((item, index) => <article className={`insight ${index === 0 ? "dark" : ""}`} key={item.label}>
      <small>{item.label}</small><b>{item.share ? formatPercent(item.value) : item.percent ? formatPercent(item.value, false) : formatInteger(item.value)}</b>
      {item.value !== null && (item.share || item.percent) ? <div className="meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, item.value * (item.share ? 100 : 1)))}%` }} /></div> : null}
      <p>{item.detail}</p><em>{item.source}</em>
    </article>)}</div>
    <div className="municipal-households">
      <header><div><small>INE · CENSO {period("INE_CENSO_B2_B6")}</small><h3>Servicios y equipamiento de los hogares</h3></div><p><b>{formatInteger(finite(census.total_households))}</b> hogares · indicadores independientes; no se suman entre sí.</p></header>
      <div className="household-indicator-grid">{householdIndicators.map(([key, label]) => { const value = finite(census[key]); return <article key={key}><span>{label}</span><b>{formatPercent(value)}</b><div className="household-track" aria-hidden="true">{value !== null ? <i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /> : null}</div></article>; })}</div>
    </div>
    <div className="priority-gaps national-service-baseline"><div className="priority-head"><span>SERVICIOS MUNICIPALES</span><h3>Cobertura urbana y rural</h3><p>SEGEPLAN · RGM {period("RGM_SERVICIOS")}. Universo distinto del Censo; un cero reportado se conserva y un dato ausente permanece sin publicar.</p></div><div className="priority-grid">
      {[["agua_cobertura_urbana", "AGUA · URBANA"], ["agua_cobertura_rural", "AGUA · RURAL"], ["residuos_recoleccion_urbana", "RESIDUOS · URBANA"], ["residuos_recoleccion_rural", "RESIDUOS · RURAL"]].map(([key, label]) => <article key={key}><span>{label}</span><b>{formatPercent(finite(services[key]))}</b><small>Indicador histórico RGM</small></article>)}
      <article><span>ÍNDICE DE SERVICIOS PÚBLICOS</span><b>{formatDecimal(finite(services.indice_servicios_publicos), 3)}</b><small>{textValue(services.indice_servicios_publicos_categoria) ?? "Categoría no publicada"}</small></article>
    </div></div>
    <div className="municipal-document-source"><div><small>PLANIFICACIÓN MUNICIPAL · SEGEPLAN</small><b>{textValue(pdm.file_name) ?? "Documento municipal no vinculado"}</b><p>{verifiedDocumentUrl ? "Consultá el diagnóstico territorial, las metas y los proyectos documentados en el plan municipal." : "No hay un documento municipal vinculado para consulta."}</p></div>{verifiedDocumentUrl ? <a href={verifiedDocumentUrl} target="_blank" rel="noreferrer">Consultar PDM / PDM-OT ↗</a> : null}</div>
  </section>;
}
