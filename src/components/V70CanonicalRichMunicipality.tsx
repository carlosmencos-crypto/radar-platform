import { V70MunicipalPublicIndicators } from "./V70MunicipalPublicIndicators";
import { municipalManagementBenchmark } from "../data/municipalManagementBenchmark";
import { buildElectoralPartyPalette } from "../data/electoralPartyColors";
import { useMemo, useState } from "react";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { getInstalledRadarElectoralLayers } from "../data/radarRuntimeCache";
import {
  buildMunicipalIntelligenceModel,
  finite,
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatPercent,
  record,
  textValue,
} from "../data/v70MunicipalIntelligence";

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function stateLabel(value: string | null | undefined) {
  if (!value) return "Sin estado";
  return value.replaceAll("_", " ");
}

export function V70CanonicalRichMunicipality() {
  const { runtime } = useAuthorizedRadarRuntime();
  const { municipality_code } = useMunicipalityContext();
  const electoralLayers = getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const model = useMemo(
    () => buildMunicipalIntelligenceModel(runtime, electoralLayers),
    [runtime, electoralLayers],
  );
  const [historyYear, setHistoryYear] = useState<2011 | 2015 | 2019 | 2023>(2023);
  const [communitySearch, setCommunitySearch] = useState("");
  const [communityGroup, setCommunityGroup] = useState("ALL");
  const communities = model.communityCatalog;
  const normalizedSearch = communitySearch.trim().toLocaleLowerCase("es-GT");
  const filteredCommunities = communities.filter((item) => {
    const matchesGroup = communityGroup === "ALL" || item.groupCode === communityGroup;
    const matchesSearch = !normalizedSearch || [item.name, item.category, item.group, item.reference ?? ""]
      .join(" ")
      .toLocaleLowerCase("es-GT")
      .includes(normalizedSearch);
    return matchesGroup && matchesSearch;
  });
  const history = model.historicalElections.find((item) => item.year === historyYear) ?? model.historicalElections[3];
  const partyColors = buildElectoralPartyPalette([
    ...model.historicalElections.flatMap((item) => item.results.map((result) => result.party)),
    ...model.councils.flatMap((item) => item.groups.map((group) => group.party)),
  ]);
  const council = model.councils.find((item) => item.year === historyYear);
  const communitySummary = record(model.communitySummary);
  const communityGroups = records(communitySummary.groups);
  const communityCategories = records(communitySummary.categories);
  const communityRecords = finite(communitySummary.records) ?? communities.length;
  const communityUrban = finite(communitySummary.urban) ?? 0;
  const communityRural = finite(communitySummary.rural) ?? 0;
  const firstHistoricalRegister = model.historicalElections.find((item) => item.year === 2011)?.registeredVoters ?? null;
  const lastHistoricalRegister = model.historicalElections.find((item) => item.year === 2023)?.registeredVoters ?? model.registered2023;
  const registerGrowth = firstHistoricalRegister !== null && lastHistoricalRegister !== null
    ? lastHistoricalRegister - firstHistoricalRegister
    : null;
  const registerGrowthShare = registerGrowth !== null && firstHistoricalRegister
    ? registerGrowth / firstHistoricalRegister
    : null;
  const census = model.payload("INE_CENSO_B2_B6");
  const services = model.payload("RGM_SERVICIOS");
  const benchmark = municipalManagementBenchmark(services.management_benchmark, municipality_code);
  const health = model.payload("MSPAS_SALUD");
  const schools = model.payload("MINEDUC_ESCUELAS");
  const risk = model.payload("CONRED_INFORM");
  const forest = model.payload("INAB_FORESTAL");
  const protectedAreas = model.payload("CONAP_SIGAP");
  const nutrition = model.payload("SESAN_TALLA");
  const finance = model.payload("MINFIN_YTD");
  const financeHistory = model.payload("MINFIN_HIST");
  const projects = model.payload("SNIP_2026");
  const contracts = model.payload("GUATECOMPRAS");
  const annualFinance = records(financeHistory.annual);
  const latestFinance = [...annualFinance].sort((a, b) => (finite(b.year) ?? 0) - (finite(a.year) ?? 0))[0] ?? {};
  const contract2025 = finite(contracts.contract_value_2025_gtq);
  const contract2026 = finite(contracts.contract_value_2026_ytd_gtq);
  const contractValue = contract2025 !== null && contract2026 !== null ? contract2025 + contract2026 : null;


  return <>
    <section id="historico" className="section historical-section exportable include-print">
      <div className="section-head"><div><p className="eyebrow">HISTÓRICO ELECTORAL MUNICIPAL · TSE</p><h2>Cuatro elecciones, una trayectoria política</h2></div><p>Compara padrón, competencia, fuerzas políticas y alcalde electo con el mismo contrato nacional. Un vacío documental permanece visible y nunca se estima.</p></div>
      <div className="history-tabs" role="tablist" aria-label="Año electoral">
        {model.historicalElections.map((item) => <button type="button" key={item.year} className={item.year === historyYear ? "active" : ""} onClick={() => setHistoryYear(item.year)}><b>{item.year}</b><span>{item.winner ?? "No publicado"}{item.winnerVotes === null ? "" : ` · ${formatInteger(item.winnerVotes)}`}</span></button>)}
      </div>
      <div className="history-workspace">
        <div className="history-profile">
          <span className="history-year">ELECCIÓN {history.year}</span>
          <h3>{history.mayor ?? "Alcalde no publicado"}</h3><p>Alcalde electo · {history.winner ?? "organización no publicada"}</p>
          <div className="history-kpis"><div><small>Padrón</small><b>{formatInteger(history.registeredVoters)}</b></div><div><small>Votos por organización</small><b>{formatInteger(history.partyVotes)}</b></div><div><small>Organizaciones</small><b>{formatInteger(history.organizations)}</b></div><div><small>Margen ganador</small><b>{formatInteger(history.marginVotes)}</b></div></div>
          <div className="history-quality"><span>Participación</span><b>{formatPercent(history.turnout)}</b><small>{history.votesCast === null ? "Total emitido no publicado para este año." : `${formatInteger(history.votesCast)} emitidos · ${formatInteger(history.nullVotes)} nulos · ${formatInteger(history.blankVotes)} blancos`}</small></div>
        </div>
        <div className="history-ranking"><div className="history-ranking-head"><b>Resultado completo</b><span>Porcentaje sobre votos por organización</span></div>{history.results.map((result) => <div className="history-row" key={`${history.year}-${result.party}-${result.rank}`}><span>{result.rank}</span><b>{result.party}</b><i><em style={{ width: `${Math.max(0, Math.min(100, result.share * 100))}%`, background: partyColors[result.party] }} /></i><strong>{formatInteger(result.votes)}</strong><small>{formatPercent(result.share)}</small></div>)}{!history.results.length ? <p className="trace-note">La fuente histórica no publicó el ranking completo para este corte.</p> : null}</div>
      </div>
      <div className="history-timeline">{model.historicalElections.map((item, index) => <article key={item.year}><i /><small>{item.year}</small><b>{item.winner ?? "No publicado"}</b><span>{item.winnerVotes === null ? "sin cifra publicada" : `${formatInteger(item.winnerVotes)} votos`}</span>{index < model.historicalElections.length - 1 && <em>→</em>}</article>)}</div>
      <div className="continuity-panel"><div><span>PADRÓN 2011 → 2023</span><b>{registerGrowth === null ? "No publicado" : `${registerGrowth >= 0 ? "+" : "−"}${formatInteger(Math.abs(registerGrowth))} personas`}</b><small>{registerGrowthShare === null ? "Universos oficiales conservados por año" : `${registerGrowthShare >= 0 ? "+" : "−"}${formatPercent(Math.abs(registerGrowthShare))} en doce años`}</small></div><div><span>CONTINUIDADES DOCUMENTADAS</span><ul>{model.politicalTrajectories.slice(0, 4).map((item) => <li key={`continuity-${item.name}`}>{item.name} · {item.years.join(" / ")}</li>)}{!model.politicalTrajectories.length ? <li>No se publicaron coincidencias nominales validadas.</li> : null}</ul></div><p>Las coincidencias corresponden a nombres y candidaturas documentadas en memorias electorales. Se presentan como trayectoria pública, no como afiliación vigente.</p></div>
      <div className="political-intelligence-grid">
        <article className="council-card">
          <div className="premium-label"><span>CONCEJO MUNICIPAL ADJUDICADO</span><b>{historyYear}</b></div>
          {council ? <><div className="seat-summary"><div><strong>{council.total}</strong><span>cargos o escaños documentados</span></div><div className="seat-bar">{council.groups.map((group) => <i key={group.party} title={`${group.party}: ${group.seats}`} style={{ width: council.titularTotal ? `${group.seats / council.titularTotal * 100}%` : "0%", background: partyColors[group.party] }} />)}</div></div><div className="seat-legend">{council.groups.map((group) => <span key={group.party}><i style={{ background: partyColors[group.party] }} /><b>{group.party}</b>{group.seats}</span>)}</div><div className="council-list">{council.members.map((member) => <div key={`${member.office}-${member.name}`}><span>{member.office}</span><b>{member.name}</b><em>{member.party}</em></div>)}</div>{!council.members.length ? <p>La fuente disponible para {historyYear} publica distribución de escaños, pero no el listado nominal completo.</p> : null}</> : <div className="canonical-vault-notice"><span>NO PUBLICADO</span><h3>Integración nominal no disponible</h3><p>RADAR no asigna cargos sin adjudicación oficial documentada para este año.</p></div>}
          {council?.sourceUrl && council.sourceUrl.startsWith("https://tse.org.gt/") ? <p><a href={council.sourceUrl} target="_blank" rel="noreferrer">Consultar adjudicación oficial TSE · {historyYear}</a></p> : null}
          {council?.detailStatus === "OFFICIAL_AGREEMENT_WITH_SOURCE_NOTE" ? <p className="trace-note">La adjudicación contiene una omisión o salvedad documental. Consulte el acuerdo oficial.</p> : null}
          {council?.warnings.map((warning) => <p className="trace-note" key={warning}>{warning}</p>)}
          <p>La distribución por partido muestra cargos titulares. La lista nominal incluye los suplentes documentados.</p>
        </article>
        <article className="trajectory-card">
          <div className="premium-label"><span>TRAYECTORIAS PÚBLICAS DETECTADAS</span><b>{model.politicalTrajectories.length}</b></div>
          <div className="trajectory-list">{model.politicalTrajectories.map((person) => <div key={person.name}><span>{person.elections} ELECCIONES</span><div><b>{person.name}</b><p>{person.route}</p><small>{person.caution}</small></div></div>)}{!model.politicalTrajectories.length ? <p>No se encontraron coincidencias nominales repetidas en las memorias disponibles.</p> : null}</div>
          <p className="method-note">Regla nacional: cruza nombres normalizados, cargo, año y organización dentro de las memorias oficiales del municipio. Toda coincidencia queda marcada para revisión antes de usarse en una decisión sensible.</p>
        </article>
      </div>
      <p className="trace-note">Fuentes: memorias oficiales TSE 2011, 2015, 2019 y 2023 · municipio {municipality_code}. Cada año conserva su propio universo y estado documental.</p>
    </section>

    <section className="section territory-section exportable include-print">
      <div className="section-head"><div><p className="eyebrow">ORGANIZACIÓN COMUNITARIA TSE · 2023</p><h2>El municipio más allá de la cabecera</h2></div><p>Catálogo oficial para organizar recorridos y prioridades. La estructura es idéntica en los 340 municipios; el contenido se filtra por código municipal.</p></div>
      <div className="territory-grid">
        <div className="territory-overview"><div><b>{formatInteger(communityRecords)}</b><span>registros comunitarios</span></div><div><b>{formatInteger(communityGroups.length)}</b><span>agrupaciones territoriales</span></div><div><b>{formatInteger(model.centers)}</b><span>centros de votación</span></div><div className="urban-rural"><span><i style={{ width: communityRecords ? `${communityUrban / communityRecords * 100}%` : "0%" }} /></span><small>{formatInteger(communityUrban)} urbanos · {formatInteger(communityRural)} rurales</small></div></div>
        <div className="group-list">{communityGroups.map((group) => <article key={textValue(group.code) ?? `${textValue(group.name)}-${textValue(group.scope)}`}><span>{textValue(group.code) ?? "—"}</span><div><b>{textValue(group.name) ?? "Sin nombre publicado"}</b><small>{stateLabel(textValue(group.scope))} · {formatInteger(finite(group.records))} comunidades/localidades</small></div></article>)}</div>
        <div className="category-list"><h3>Composición del catálogo</h3>{communityCategories.map((category) => <div key={textValue(category.name) ?? "SIN_CATEGORIA"}><span>{textValue(category.name) ?? "Sin categoría"}</span><i><em style={{ width: communityRecords ? `${(finite(category.count) ?? 0) / communityRecords * 100}%` : "0%" }} /></i><b>{formatInteger(finite(category.count))}</b></div>)}</div>
      </div>
      <div className="community-directory">
        <div className="community-directory-head"><div><p className="eyebrow">DIRECTORIO OFICIAL</p><h3>{formatInteger(communityRecords)} comunidades y localidades consultables</h3></div><span>{filteredCommunities.length} resultados</span></div>
        <div className="community-filters"><label className="search"><span>⌕</span><input value={communitySearch} onChange={(event) => setCommunitySearch(event.target.value)} placeholder="Buscar comunidad, categoría o referencia" /></label><select aria-label="Agrupación territorial" value={communityGroup} onChange={(event) => setCommunityGroup(event.target.value)}><option value="ALL">Todas las agrupaciones</option>{communityGroups.map((group) => <option key={textValue(group.code) ?? `${textValue(group.name)}-${textValue(group.scope)}`} value={textValue(group.code) ?? ""}>{textValue(group.code) ?? "—"} · {textValue(group.name) ?? "Sin nombre"}</option>)}</select></div>
        <div className="community-table"><div className="community-table-head"><span>Comunidad / localidad</span><span>Categoría</span><span>Agrupación</span><span>Referencia oficial</span><span>Trazabilidad</span></div><div className="community-scroll">{filteredCommunities.map((item, index) => <article key={`${item.groupCode}-${item.name}-${index}`}><div><b>{item.name}</b><small>{stateLabel(item.scope)}{item.zone ? ` · Zona ${item.zone}` : ""}</small></div><span>{item.category}</span><span>{item.groupCode} · {item.group}</span><span>{item.reference ?? "Sin referencia publicada"}</span><small>{item.sourcePage === null ? "página no publicada" : `p. ${item.sourcePage}`}</small></article>)}</div></div>
        {!communities.length ? <div className="canonical-vault-notice"><span>NO PUBLICADO</span><h3>Detalle comunitario pendiente</h3><p>El municipio no recibió filas comunitarias del producto nacional autorizado; no se inventan sustitutos.</p></div> : null}
      </div>
      <div className="territory-caveat"><b>Qué representan las agrupaciones CEM</b><p>Son referencias organizativas de la fuente, no límites geográficos oficiales. La fuente aporta nombres, categoría y agrupación; RADAR no inventa población, hogares, coordenadas ni polígonos por comunidad.</p><span>La agenda, responsables, acuerdos y observaciones privadas se almacenan aparte en Campaign Vault.</span></div>
    </section>

    <V70MunicipalPublicIndicators model={model} />

    <section className="section split-section exportable include-print">
      <div className="finance-card"><p className="eyebrow">FINANZAS MUNICIPALES · 2026 YTD</p><h2>Ejecución y capacidad de inversión</h2><div className="finance-main"><div><small>Presupuesto vigente</small><b>{formatCurrency(finite(finance.current_budget_amount))}</b></div><div><small>Devengado</small><b>{formatCurrency(finite(finance.accrued_amount))}</b></div></div><div className="execution"><div><span>Ejecución</span><b>{formatPercent(finite(finance.budget_execution_pct), false)}</b></div><div className="finance-progress"><i style={{ width: `${Math.max(0, Math.min(100, finite(finance.budget_execution_pct) ?? 0))}%` }} /></div></div><div className="finance-sub"><div><b>{formatInteger(finite(projects.project_count))}</b><span>proyectos SNIP<br /><small>{formatCurrency(finite(projects.requested_amount))} solicitados</small></span></div><div><b>{formatInteger(finite(contracts.contracts_total))}</b><span>contratos publicados<br /><small>{formatCurrency(contractValue)}</small></span></div></div><p className="source-line">MINFIN, SNIP y Guatecompras se presentan como universos separados.</p></div>
      <div className="management-card"><p className="eyebrow">RANKING DE GESTIÓN 2020–2021</p><h2>Capacidad institucional</h2><div className="management-ranks"><article><span>{formatDecimal(finite(services.indice_servicios_publicos), 3)}</span><div><b>Índice de servicios públicos</b><p>{textValue(services.indice_servicios_publicos_categoria) ?? "Categoría no publicada"}</p></div></article><article><span>{formatPercent(finite(services.agua_cobertura_urbana))}</span><div><b>Cobertura urbana de agua</b><p>Indicador histórico RGM</p></div></article><article className="breach"><span>{formatPercent(finite(services.residuos_recoleccion_urbana))}</span><div><b>Recolección urbana de residuos</b><p>Brecha a verificar localmente</p></div></article></div><p className="source-line">SEGEPLAN · Ranking de Gestión Municipal 2020–2021. No predice intención de voto.</p></div>
    </section>

    <section className="section fiscal-management-depth exportable include-print">
      <div className="section-head"><div><p className="eyebrow">CAPACIDAD FISCAL Y GESTIÓN MUNICIPAL</p><h2>De dónde vienen los recursos y cómo se comparan</h2></div><p>El corte 2026 YTD se separa de la serie cerrada 2016–2025 para evitar comparaciones engañosas.</p></div>
      <div className="fiscal-kpis"><article><small>PRESUPUESTO 2026 YTD</small><b>{formatCurrency(finite(finance.current_budget_amount))}</b><span>vigente</span><em>Corte parcial oficial</em></article><article><small>INVERSIÓN VIGENTE</small><b>{formatCurrency(finite(finance.investment_current_amount))}</b><span>{formatCurrency(finite(finance.investment_accrued_amount))} devengado</span><em>Universo presupuestario</em></article><article><small>CIERRE {finite(latestFinance.year) ?? "NO PUBLICADO"}</small><b>{formatPercent(finite(latestFinance.pct_ejecucion_egresos))}</b><span>{formatCurrency(finite(latestFinance.egresos_devengado))} devengados</span><em>Serie histórica validada</em></article><article><small>HISTÓRICO</small><b>{formatInteger(finite(financeHistory.years_available))} años</b><span>{formatCurrency(finite(financeHistory.ingresos_percibidos_10y))} percibidos</span><em>2016–2025</em></article></div>
      <div className="municipal-finance-series">
        <header><div><small>MINFIN · SERIE ANUAL</small><h3>Ingresos y ejecución, año por año</h3></div><p>Los cierres anuales se mantienen separados del corte parcial 2026. El saldo mostrado es percibido menos devengado; no es efectivo disponible.</p></header>
        <div className="finance-series-scroll" tabIndex={0} role="region" aria-label="Serie financiera municipal"><table><thead><tr><th>Año</th><th>Ingresos percibidos</th><th>Presupuesto de egresos</th><th>Devengado</th><th>Pagado</th><th>Ejecución</th><th>Saldo de referencia</th></tr></thead><tbody>{[...annualFinance].sort((a, b) => (finite(a.year) ?? 0) - (finite(b.year) ?? 0)).map((year) => <tr key={String(year.year)}><th scope="row">{String(year.year)}</th><td>{formatCurrency(finite(year.ingresos_percibido))}</td><td>{formatCurrency(finite(year.egresos_vigente))}</td><td>{formatCurrency(finite(year.egresos_devengado))}</td><td>{formatCurrency(finite(year.egresos_pagado))}</td><td><b>{formatPercent(finite(year.pct_ejecucion_egresos))}</b><span className="annual-execution-track"><i style={{ width: `${Math.max(0, Math.min(100, (finite(year.pct_ejecucion_egresos) ?? 0) * 100))}%` }} /></span></td><td>{formatCurrency(finite(year.balance_percibido_menos_devengado))}</td></tr>)}</tbody></table></div>
        {!annualFinance.length ? <p className="trace-note">Detalle anual no publicado en la capa municipal autorizada.</p> : null}
      </div>
      <div className="management-benchmark">
        <div className="benchmark-head"><div><span>BENCHMARK NACIONAL · 2020–2021</span><h3>Seis dimensiones comparables</h3></div><p>La barra principal representa {model.municipalityName}; las marcas muestran el promedio de {model.departmentName} y el nacional. Es una línea base histórica, no una medición de la administración actual.</p></div>
        {benchmark ? <>
          <div className="benchmark-list">{benchmark.dimensions.map((indicator) => <article key={indicator.code}><div><span>{indicator.code}</span><b>{indicator.name}</b><small>{indicator.category} · posición {indicator.national_rank}/340 · departamental {indicator.department_rank}</small></div><div className="benchmark-track"><i style={{ width: `${indicator.score * 100}%` }} /><em className="department-marker" style={{ left: `${indicator.department_average * 100}%` }} title={`Promedio ${model.departmentName}: ${formatDecimal(indicator.department_average, 4)}`} /><em className="national-marker" style={{ left: `${indicator.national_average * 100}%` }} title={`Promedio nacional: ${formatDecimal(indicator.national_average, 4)}`} /></div><strong>{formatDecimal(indicator.score, 4)}</strong></article>)}</div>
          <div className="benchmark-legend"><span><i />{model.municipalityName}</span><span><i />Promedio {model.departmentName}</span><span><i />Promedio nacional</span>{benchmark.source_url?.startsWith("https://docs.google.com/spreadsheets/") ? <a href={benchmark.source_url} target="_blank" rel="noreferrer">Consultar Ranking oficial ↗</a> : null}</div>
          {benchmark.zero_reported_by_source ? <p className="trace-note">La fuente reporta valores cero. No se interpretan como ausencia de servicios ni como evaluación de la administración actual.</p> : null}
        </> : <p className="trace-note">Comparación municipal no publicada: faltan las seis dimensiones oficiales verificadas para este municipio.</p>}
      </div>
      <p className="trace-note">Fuentes: MINFIN · ejecución municipal 2016–2025 y egresos municipales 2026 YTD. Montos redondeados solo para presentación.</p>
    </section>

    <section className="section public-works-section exportable include-print">
      <div className="section-head"><div><p className="eyebrow">INVERSIÓN PÚBLICA · SNIP + GUATECOMPRAS</p><h2>Obras, contratos y señales de seguimiento</h2></div><p>Proyectos y contratos permanecen separados. La plataforma no atribuye proveedor ni avance físico sin un vínculo oficial.</p></div>
      <div className="works-kpis"><article><small>PROYECTOS SNIP</small><b>{formatInteger(finite(projects.project_count))}</b><span>corte 2026</span></article><article><small>MONTO SOLICITADO</small><b>{formatCurrency(finite(projects.requested_amount))}</b><span>universo SNIP</span></article><article><small>CONTRATOS PUBLICADOS</small><b>{formatInteger(finite(contracts.contracts_total))}</b><span>2025–2026 YTD</span></article><article><small>VALOR PUBLICADO</small><b>{formatCurrency(contractValue)}</b><span>no equivale a ejecución física</span></article></div>
      <div className="procurement-periods">{[{year: "2025 · AÑO CERRADO", count: finite(contracts.contracts_2025), amount: contract2025, documents: finite(contracts.documents_2025)}, {year: "2026 · CORTE PARCIAL", count: finite(contracts.contracts_2026_ytd), amount: contract2026, documents: finite(contracts.documents_2026_ytd)}].map((item) => <article key={item.year}><small>GUATECOMPRAS · {item.year}</small><b>{formatCurrency(item.amount)}</b><span>{formatInteger(item.count)} contratos · {formatInteger(item.documents)} documentos</span><em>Extracción: {textValue(contracts.extraction_date) ?? "fecha no publicada"}</em></article>)}</div>
      <div className="procurement-boundary"><div><span>SNIP / SEGEPLAN</span><b>Proyecto y monto solicitado</b><small>{formatInteger(finite(projects.project_count))} registros</small></div><i>≠</i><div><span>GUATECOMPRAS</span><b>Concurso y contrato</b><small>{formatInteger(finite(contracts.contracts_total))} contratos publicados</small></div><i>≠</i><div><span>MINFIN</span><b>Devengado y pagado</b><small>Corte financiero separado</small></div></div>
    </section>

    <section className="section social-panorama">
      <div className="section-head"><div><p className="eyebrow">EDUCACIÓN, NUTRICIÓN, SALUD Y CONDICIONES DE VIDA</p><h2>Indicadores sociales con año visible</h2></div><p>Los datos provienen de fuentes oficiales distintas; cada indicador conserva su período y alcance.</p></div>
      <div className="social-grid"><article><small>RED EDUCATIVA</small><b>{formatInteger(finite(schools.records))}</b><span>{formatInteger(finite(schools.level_primaria))} primaria · {formatInteger(finite(schools.level_basico))} básico</span><em>MINEDUC · alcance documentado</em></article><article><small>RETARDO EN TALLA · 2024</small><b>{formatPercent(finite(nutrition.stunting_prevalence_pct), false)}</b><span>{formatInteger(finite(nutrition.analyzed_students))} escolares · {stateLabel(textValue(nutrition.nutritional_vulnerability_category))}</span><em>SESAN / MINEDUC</em></article><article><small>ESTABLECIMIENTOS DE SALUD</small><b>{formatInteger(finite(health.records))}</b><span>{formatInteger(finite(health.map_publishable))} puntos publicables</span><em>MSPAS</em></article><article><small>AGUA DENTRO DEL HOGAR · 2018</small><b>{formatPercent(finite(census.water_pipe_inside_pct))}</b><span>{formatInteger(finite(census.total_households))} hogares censados</span><em>INE · Censo 2018</em></article><article><small>DRENAJE SANITARIO · 2018</small><b>{formatPercent(finite(census.sanitary_drainage_pct))}</b><span>Universo de hogares</span><em>INE · Censo 2018</em></article><article><small>INTERNET EN EL HOGAR · 2018</small><b>{formatPercent(finite(census.internet_pct))}</b><span>Conectividad domiciliar</span><em>INE · Censo 2018</em></article></div>
    </section>

    <section className="section security-panorama">
      <div className="section-head"><div><p className="eyebrow">SEGURIDAD Y CONFLICTIVIDAD</p><h2>Señales municipales para prevención y territorio</h2></div><p>El bloque canónico permanece visible. Solo publica tasas cuando existe una capa oficial municipal comparable; una ausencia no se interpreta como cero incidentes.</p></div>
      <div className="security-grid">
        {[
          ["HOMICIDIOS", "PNC · tasa municipal"],
          ["VIOLENCIA CONTRA LA MUJER", "Ministerio Público · razón municipal"],
          ["MUJERES AGRAVIADAS", "Ministerio Público · tasa municipal"],
          ["FALTAS JUDICIALES", "Organismo Judicial · proporción municipal"],
          ["ACCIDENTES DE TRÁNSITO", "PNC · concentración municipal"],
        ].map(([label, source], index) => <article className={index < 2 ? "security-critical" : ""} key={label}><small>{label}</small><b>No publicado</b><span>Sin indicador municipal comparable en el contrato actual</span><em>{source}</em></article>)}
      </div>
      <div className="security-reading"><div><span>LECTURA RADAR</span><b>La prevención requiere evidencia local y verificación humana.</b><p>Antes de convertir señales administrativas en propuestas o mensajes, deben contrastarse con PNC local, Bomberos, liderazgos comunitarios y registros de atención.</p></div></div>
    </section>

    <section className="section economy-panorama">
      <div className="section-head"><div><p className="eyebrow">ECONOMÍA Y EMPLEO LOCAL</p><h2>Qué mueve al municipio y dónde se concentra</h2></div><p>La arquitectura canónica conserva este espacio para el diagnóstico municipal. No atribuye tasas nacionales de empleo, informalidad o actividad económica al municipio.</p></div>
      <div className="economy-kpis">
        <article className="economy-dark"><small>MOTORES DOCUMENTADOS</small><b>No publicado</b><span>Requiere clasificación explícita del PDM-OT</span></article>
        <article><small>TRABAJO ESTACIONAL</small><b>No publicado</b><span>Sin ventana municipal comparable</span></article>
        <article><small>INTERNET EN EL HOGAR · 2018</small><b>{formatPercent(finite(census.internet_pct))}</b><span>Conectividad productiva · universo censal</span></article>
        <article><small>ACCESOS PRINCIPALES</small><b>No publicado</b><span>Requiere inventario vial municipal trazable</span></article>
      </div>
      <div className="economy-layout"><div className="engine-list"><div className="economy-title"><span>MOTORES ECONÓMICOS</span><b>Lectura territorial</b></div><div className="canonical-vault-notice compact"><span>NO PUBLICADO</span><h3>Clasificación económica pendiente</h3><p>El PDM-OT se conserva como fuente; RADAR no inventa motores ni conteos de empleo.</p></div></div><div className="mobility-card"><div className="economy-title"><span>MOVILIDAD PARA TRABAJO Y COMERCIO</span><b>PDM-OT</b></div><h3>Validación territorial pendiente</h3><div className="employment-gap"><b>Brecha conservada</b><p>Empleo formal, desempleo, ocupación por rama e informalidad requieren una fuente municipal comparable.</p></div></div></div>
      <p className="trace-note">Fuente prevista: PDM-OT e INE · Censo 2018. El bloque mantiene la estructura V70 y muestra explícitamente qué datos no están publicados.</p>
    </section>

    <section className="section infrastructure-risk">
      <div className="section-head"><div><p className="eyebrow">INFRAESTRUCTURA, CONECTIVIDAD Y RIESGO</p><h2>Accesibilidad con exposición territorial</h2></div><p>Los indicadores describen sus fuentes y períodos; no sustituyen mapas de amenaza ni verificación en campo.</p></div>
      <div className="infrastructure-layout"><div className="access-card"><div className="risk-title"><span>AMBIENTE</span><b>INAB + CONAP</b></div><div className="access-list"><article><i>↗</i><div><b>{formatDecimal(finite(forest.forest_cover_2020_ha))} ha de bosque</b><p>Cobertura 2020 · cambio neto {formatDecimal(finite(forest.net_change_ha))} ha desde 2016.</p></div></article><article><i>↗</i><div><b>{formatInteger(finite(protectedAreas.explicit_protected_area_count))} áreas protegidas asociadas</b><p>{textValue(protectedAreas.management_categories) ?? "Sin asociación explícita publicada"}</p></div></article></div></div><div className="risk-card"><div className="risk-title"><span>RIESGO INFORM</span><b>CONRED · 2021</b></div><div className="risk-kpis"><article className="risk-critical"><small>RIESGO</small><b>{formatDecimal(finite(risk.inform_risk))}</b><span>Puesto nacional {formatInteger(finite(risk.national_rank))}</span></article><article><small>VULNERABILIDAD</small><b>{formatDecimal(finite(risk.vulnerability))}</b><span>Índice histórico</span></article><article><small>AMENAZA / EXPOSICIÓN</small><b>{formatDecimal(finite(risk.hazard_exposure))}</b><span>CONRED INFORM</span></article><article><small>FALTA DE CAPACIDAD</small><b>{formatDecimal(finite(risk.lack_coping_capacity))}</b><span>Lectura preventiva</span></article></div></div></div>
    </section>

    <section className="section territory-opportunities">
      <div className="section-head"><div><p className="eyebrow">LECTURA EJECUTIVA</p><h2>Alertas y oportunidades territoriales</h2></div><p>Señales calculadas únicamente con datos del municipio {municipality_code}; orientan verificación y presencia territorial.</p></div>
      <div className="opportunity-grid">{model.priorities.map((item) => <article className="alert" key={`p-${item.title}`}><span>ALERTA</span><h3>{item.title}</h3><b>{item.value}</b><p>{item.detail}</p><small>{item.source}</small></article>)}{model.opportunities.map((item) => <article className="opportunity" key={`o-${item.title}`}><span>OPORTUNIDAD</span><h3>{item.title}</h3><b>{item.value}</b><p>{item.detail}</p><small>{item.source}</small></article>)}</div>
    </section>

  </>;
}
