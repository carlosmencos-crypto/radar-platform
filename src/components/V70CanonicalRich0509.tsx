import { useEffect, useMemo, useState } from "react";
import { loadV70Canonical0509Payload } from "../v70canonical/payload0509";

const fmt = new Intl.NumberFormat("es-GT");
const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const money = (value: number) => `Q ${new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(value)}`;
const partyColors: Record<string, string> = {
  VALOR: "#ef684f", "VALOR UNIONISTA": "#ef684f", UNE: "#2e78bd", VAMOS: "#782f96",
  PPN: "#e4a229", ELEFANTE: "#24a68a", VIVA: "#316e56", SEMILLA: "#6d9f3a", TODOS: "#6b7780",
};

export function V70CanonicalRich0509() {
  const [payload, setPayload] = useState<any | null>(null);
  const [historyYear, setHistoryYear] = useState(2023);
  const [communityQuery, setCommunityQuery] = useState("");
  const [communityGroup, setCommunityGroup] = useState("ALL");
  useEffect(() => {
    let active = true;
    void loadV70Canonical0509Payload().then((value) => { if (active) setPayload(value); });
    return () => { active = false; };
  }, []);
  const historicalElections = payload?.historicalElections ?? [];
  const councilCompositions = payload?.councilCompositions ?? [];
  const documentedPoliticalContinuities = payload?.documentedPoliticalContinuities ?? [];
  const politicalTrajectories = payload?.politicalTrajectories ?? [];
  const communitySummary = payload?.communitySummary ?? { records: 0, urban: 0, rural: 0, groups: [], categories: [] };
  const communityRecords = payload?.communityRecords ?? [];
  const publicWorks = payload?.publicWorks ?? [];
  const verifiedProcurements = payload?.verifiedProcurements ?? [];
  const verifiedProcurementTotal = payload?.verifiedProcurementTotal ?? 0;
  const municipalSecurity = payload?.municipalSecurity ?? {};
  const economyInfrastructure = payload?.economyInfrastructure ?? { economicEngines: [], accessCorridors: [] };
  const territorialRisk = payload?.territorialRisk ?? { exposedSystems: [] };
  const fiscalCapacity = payload?.fiscalCapacity ?? {};
  const managementBenchmark = payload?.managementBenchmark ?? { dimensions: [] };
  const operationalRisk = payload?.operationalRisk ?? { futureCrosses: [] };
  const history = historicalElections.find((item: any) => item.year === historyYear) ?? historicalElections[3];
  const council = councilCompositions.find((item: any) => item.year === historyYear) ?? councilCompositions[3];
  const filteredCommunities = useMemo(() => {
    const term = communityQuery.trim().toLocaleLowerCase("es");
    return communityRecords.filter((row: any) => {
      const matchesGroup = communityGroup === "ALL" || row.groupCode === communityGroup;
      const matchesTerm = !term || [row.name, row.category, row.group, row.reference ?? ""].join(" ").toLocaleLowerCase("es").includes(term);
      return matchesGroup && matchesTerm;
    });
  }, [communityGroup, communityQuery, communityRecords]);

  if (!payload || !history || !council) return null;

  return <>
<section id="historico" className="section historical-section exportable include-print">
  <div className="section-head"><div><p className="eyebrow">HISTÓRICO ELECTORAL MUNICIPAL · TSE</p><h2>Cuatro elecciones, una trayectoria política</h2></div><p>Compara padrón, competencia, fuerzas políticas y alcalde electo. Los vacíos de 2019 y 2023 se mantienen vacíos cuando la fuente histórica no publica el dato.</p></div>
  <div className="history-tabs" role="tablist" aria-label="Año electoral">
    {historicalElections.map((item: any) => <button key={item.year} className={item.year === historyYear ? "active" : ""} onClick={() => setHistoryYear(item.year)}><b>{item.year}</b><span>{item.winner} · {fmt.format(item.winnerVotes)}</span></button>)}
  </div>
  <div className="history-workspace">
    <div className="history-profile">
      <span className="history-year">ELECCIÓN {history.year}</span>
      <h3>{history.mayor}</h3><p>Alcalde electo · {history.winner}</p>
      <div className="history-kpis"><div><small>Padrón</small><b>{fmt.format(history.register)}</b></div><div><small>Votos por organización</small><b>{fmt.format(history.partyVotes)}</b></div><div><small>Organizaciones</small><b>{history.organizations}</b></div><div><small>Margen ganador</small><b>{fmt.format(history.margin)}</b></div></div>
      <div className="history-quality"><span>Participación</span><b>{history.turnout === null ? "" : pct(history.turnout, 2)}</b><small>{history.votesCast === null ? "" : `${fmt.format(history.votesCast)} emitidos · ${fmt.format(history.nullVotes)} nulos · ${fmt.format(history.blankVotes)} blancos`}</small></div>
    </div>
    <div className="history-ranking"><div className="history-ranking-head"><b>Resultado completo</b><span>Porcentaje sobre votos por organización</span></div>{history.results.map(([party, votes]: [string, number], index: number) => <div className="history-row" key={party}><span>{index + 1}</span><b>{party}</b><i><em style={{ width: `${votes / history.partyVotes * 100}%`, background: partyColors[party] ?? "#657b83" }} /></i><strong>{fmt.format(votes)}</strong><small>{pct(votes / history.partyVotes, 2)}</small></div>)}</div>
  </div>
  <div className="history-timeline">{historicalElections.map((item: any, index: number) => <article key={item.year}><i /><small>{item.year}</small><b>{item.winner}</b><span>{fmt.format(item.winnerVotes)} votos</span>{index < historicalElections.length - 1 && <em>→</em>}</article>)}</div>
  <div className="continuity-panel"><div><span>PADRÓN 2011 → 2023</span><b>+12,312 personas</b><small>+46.2% en doce años</small></div><div><span>CONTINUIDADES DOCUMENTADAS</span><ul>{documentedPoliticalContinuities.map((item: string) => <li key={item}>{item}</li>)}</ul></div><p>Las coincidencias corresponden a nombres y candidaturas documentadas en las memorias electorales. Se presentan como trayectoria pública, no como afiliación vigente.</p></div>
  <div className="political-intelligence-grid">
    <article className="council-card">
      <div className="premium-label"><span>CONCEJO MUNICIPAL ADJUDICADO</span><b>{historyYear}</b></div>
      <div className="seat-summary"><div><strong>{council.total}</strong><span>cargos titulares</span></div><div className="seat-bar">{council.groups.map((group: any) => <i key={group.party} title={`${group.party}: ${group.seats}`} style={{ width: `${group.seats / council.total * 100}%`, background: partyColors[group.party] ?? "#7f8d88" }} />)}</div></div>
      <div className="seat-legend">{council.groups.map((group: any) => <span key={group.party}><i style={{ background: partyColors[group.party] ?? "#7f8d88" }} /><b>{group.party}</b>{group.seats}</span>)}</div>
      <div className="council-list">{council.members.map(([office, name, party]: [string, string, string]) => <div key={`${office}-${name}`}><span>{office}</span><b>{name}</b><em>{party}</em></div>)}</div>
      <p>Alcalde y síndicos: mayoría relativa. Concejalías: representación proporcional de minorías, art. 203 LEPP. RADAR muestra la adjudicación oficial del TSE; no recalcula ni simula cargos.</p>
    </article>
    <article className="trajectory-card">
      <div className="premium-label"><span>TRAYECTORIAS PÚBLICAS DETECTADAS</span><b>{politicalTrajectories.length}</b></div>
      <div className="trajectory-list">{politicalTrajectories.map((person: any) => <div key={person.name}><span>{person.tag}</span><div><b>{person.name}</b><p>{person.route}</p><small>{person.note}</small></div></div>)}</div>
      <p className="method-note">Regla escalable: cruza nombres normalizados, cargo, año y organización dentro de las memorias oficiales de cada municipio. Toda coincidencia nominal queda marcada para revisión antes de usarse en una decisión sensible.</p>
    </article>
  </div>
  <p className="trace-note">Fuente: memorias electorales oficiales TSE 2011, 2015, 2019 y 2023 · Producto validado: GT_TSE_2011_2023_HISTORICO_0509_VALIDACION_v1.xlsx.</p>
</section>

<section className="section territory-section exportable include-print">
  <div className="section-head"><div><p className="eyebrow">ORGANIZACIÓN COMUNITARIA TSE · 2023</p><h2>El municipio más allá de la cabecera</h2></div><p>Catálogo oficial para organizar recorridos y prioridades. No se dibujan polígonos ni se asignan coordenadas que la fuente no contiene.</p></div>
  <div className="territory-grid">
    <div className="territory-overview"><div><b>{communitySummary.records}</b><span>registros comunitarios</span></div><div><b>{communitySummary.groups.length}</b><span>agrupaciones territoriales</span></div><div><b>22 / 340</b><span>departamentos / municipios cubiertos</span></div><div className="urban-rural"><span><i style={{ width: `${communitySummary.urban / communitySummary.records * 100}%` }} /></span><small>75 urbanos · 130 rurales</small></div></div>
    <div className="group-list">{communitySummary.groups.map((group: any) => <article key={group.code}><span>{group.code}</span><div><b>{group.name}</b><small>{group.scope} · {group.records} comunidades/localidades</small></div></article>)}</div>
    <div className="category-list"><h3>Composición del catálogo</h3>{communitySummary.categories.map((category: any) => <div key={category.name}><span>{category.name}</span><i><em style={{ width: `${category.count / 106 * 100}%` }} /></i><b>{category.count}</b></div>)}</div>
  </div>
  <div className="community-directory">
    <div className="community-directory-head"><div><p className="eyebrow">DIRECTORIO OFICIAL</p><h3>205 comunidades y localidades consultables</h3></div><span>{filteredCommunities.length} resultados</span></div>
    <div className="community-filters"><label className="search"><span>⌕</span><input value={communityQuery} onChange={(event) => setCommunityQuery(event.target.value)} placeholder="Buscar comunidad, categoría o referencia" /></label><select value={communityGroup} onChange={(event) => setCommunityGroup(event.target.value)}><option value="ALL">Todas las agrupaciones</option>{communitySummary.groups.map((group: any) => <option key={group.code} value={group.code}>{group.code} · {group.name}</option>)}</select></div>
    <div className="community-table"><div className="community-table-head"><span>Comunidad / localidad</span><span>Categoría</span><span>Agrupación</span><span>Referencia oficial</span><span>Trazabilidad</span></div><div className="community-scroll">{filteredCommunities.map((row: any, index: number) => <article key={`${row.groupCode}-${row.name}-${index}`}><div><b>{row.name}</b><small>{row.scope}{row.zone ? ` · Zona ${row.zone}` : ""}</small></div><span>{row.category}</span><span>{row.groupCode} · {row.group}</span><span>{row.reference || "Sin referencia publicada"}</span><small>p. {row.sourcePage}</small></article>)}</div></div>
  </div>
  <div className="territory-caveat"><b>Qué representan los círculos CEM</b><p>Son referencias visuales alrededor del centro asociado, no límites oficiales. El TSE aporta nombres y agrupación, pero no población, hogares, coordenadas ni polígonos por comunidad. RADAR no inventa esos datos.</p><span>La demografía oficial disponible permanece a escala municipal. En Operación territorial se podrán agregar cobertura, responsables, acuerdos y observaciones privadas sin alterar la fuente pública.</span></div>
</section>

<section className="section municipal-photo exportable include-print">
  <div className="section-head"><div><p className="eyebrow">FOTOGRAFÍA MUNICIPAL</p><h2>Indicadores para mensajes y prioridades</h2></div><p>Cada cifra conserva fuente y año. Un valor desconocido permanece vacío.</p></div>
  <div className="insight-grid">
    <article className="insight dark"><small>POBREZA GENERAL · 2023</small><b>26.3%</b><div className="meter"><i style={{ width: "26.3%" }} /></div><p>Pobreza extrema: <strong>2.3%</strong></p><em>SEGEPLAN · estimación oficial</em></article>
    <article className="insight"><small>CRECIMIENTO POBLACIONAL</small><b>+24.4%</b><p>Entre 2015 y 2030</p><div className="trend"><span>2018<br/><b>62,801</b></span><i>→</i><span>2030<br/><b>75,671</b></span></div><em>INE · Censo y proyecciones</em></article>
    <article className="insight"><small>COBERTURA DE AGUA · 2016</small><b>17.8%</b><p>Línea base PDM-OT</p><div className="target"><i style={{ width: "27.4%" }} /><span>Meta 65%</span></div><em>SEGEPLAN · PDM-OT 2019–2032</em></article>
    <article className="insight"><small>MORTALIDAD INFANTIL</small><b>34.68</b><p>Indicador de línea base</p><div className="tag danger">BRECHA CRÍTICA</div><em>SEGEPLAN · PDM-OT</em></article>
    <article className="insight"><small>ESCUELAS PRIORIZADAS · 2017</small><b>34</b><p>Servicios oficiales de primaria</p><div className="trend"><span>Alumnos<br/><b>7,712</b></span><i>·</i><span>Uso<br/><b>Histórico</b></span></div><em>MINEDUC · sin geolocalización imputada</em></article>
  </div>
  <div className="priority-gaps"><div className="priority-head"><span>BRECHAS PARA AGENDA Y MENSAJE</span><h3>Datos que convierten el diagnóstico en prioridades</h3><p>Líneas base históricas del PDM-OT. Sirven para orientar preguntas, propuestas y verificación; no describen automáticamente la situación 2026.</p></div><div className="priority-grid">
    <article><span>EDUCACIÓN BÁSICA · 2015</span><b>59.63%</b><small>Cobertura neta</small></article>
    <article><span>DIVERSIFICADO · 2015</span><b>34.16%</b><small>Cobertura neta</small></article>
    <article><span>DESNUTRICIÓN CRÓNICA · 2015</span><b>15.6%</b><small>Línea base municipal</small></article>
    <article><span>AGUA · 2016</span><b>17.8%</b><small>Meta PDM-OT: 65%</small></article>
    <article><span>TRATAMIENTO DE AGUAS</span><b>0 <i>/ 3</i></b><small>Plantas base / meta PDM-OT</small></article>
  </div></div>
  <div className="department-context">
    <div className="department-context-head"><div><span>CONTEXTO DEPARTAMENTAL · ESCUINTLA</span><h3>El entorno que condiciona al municipio</h3></div><p>Estos valores describen el departamento de Escuintla. No se atribuyen al municipio 0509 ni a su Municipalidad.</p></div>
    <div className="department-context-grid">
      <article><small>DESARROLLO HUMANO · HISTÓRICO</small><b>0.516</b><span>Índice de Desarrollo Humano</span><em>2014 · PNUD / SEGEPLAN · PND 103</em></article>
      <article><small>PROTECCIÓN SOCIAL</small><b>24.07%</b><span>Mujeres con prestaciones de maternidad</span><em>2023 · IGSS / SEGEPLAN · PND 257</em></article>
      <article><small>APRENDIZAJE · HISTÓRICO</small><b>11%</b><span>Fluidez lectora al finalizar primaria</span><em>2014 · MINEDUC / SEGEPLAN · PND 361</em></article>
    </div>
    <div className="department-boundary"><b>NIVEL: DEPARTAMENTAL</b><span>Uso recomendado: contexto para mensajes y prioridades; no diagnóstico municipal ni evaluación de la gestión local.</span></div>
  </div>
</section>

<section className="section split-section exportable include-print">
  <div className="finance-card"><p className="eyebrow">FINANZAS MUNICIPALES · 2025</p><h2>Ejecución y capacidad de inversión</h2><div className="finance-main"><div><small>Presupuesto vigente</small><b>{money(232175535.29)}</b></div><div><small>Devengado</small><b>{money(194015295.60)}</b></div></div><div className="execution"><div><span>Ejecución</span><b>83.6%</b></div><div className="finance-progress"><i style={{ width: "83.6%" }} /></div></div><div className="finance-sub"><div><b>24</b><span>proyectos municipales<br/><small>Q 76.4 M vigentes</small></span></div><div><b>7</b><span>proyectos CODEDE<br/><small>Q 33.1 M · universo separado</small></span></div></div><p className="source-line">MINFIN y CODEDE se reconcilian sin mezclar presupuestos.</p></div>
  <div className="management-card"><p className="eyebrow">RANKING DE GESTIÓN 2020–2021</p><h2>Capacidad institucional</h2><div className="management-ranks"><article><span>10<small>/340</small></span><div><b>Gestión financiera</b><p>Índice 0.4945</p></div></article><article><span>48<small>/340</small></span><div><b>Gestión administrativa</b><p>Índice 0.5605</p></div></article><article className="breach"><span>0.0000</span><div><b>Participación ciudadana</b><p>Brecha principal de gobernanza</p></div></article></div><p className="source-line">SEGEPLAN · benchmark nacional. No predice intención de voto.</p></div>
</section>

<section className="section fiscal-management-depth exportable include-print">
  <div className="section-head"><div><p className="eyebrow">CAPACIDAD FISCAL Y GESTIÓN MUNICIPAL</p><h2>De dónde vienen los recursos y cómo se comparan</h2></div><p>Los indicadores fiscales usan el cierre 2025. Los valores por habitante emplean la proyección INE 2026 como denominador de referencia y se muestran separados del presupuesto SNIP.</p></div>
  <div className="fiscal-kpis">
    <article><small>INGRESOS PROPIOS</small><b>{pct(fiscalCapacity.ownRevenueShare, 1)}</b><span>{money(fiscalCapacity.ownRevenue)} percibidos</span><em>{money(fiscalCapacity.ownRevenuePerResident)} por residente de referencia</em></article>
    <article className="fiscal-warning"><small>DEPENDENCIA DE TRANSFERENCIAS</small><b>{pct(fiscalCapacity.transferDependencyShare, 1)}</b><span>{money(fiscalCapacity.transfers)} corrientes y de capital</span><em>No equivale automáticamente a debilidad fiscal</em></article>
    <article><small>INVERSIÓN EN EL GASTO</small><b>{pct(fiscalCapacity.investmentShare, 1)}</b><span>{money(fiscalCapacity.investmentAccrued)} devengados</span><em>{money(fiscalCapacity.investmentPerResident)} por residente de referencia</em></article>
    <article><small>FUNCIONAMIENTO</small><b>{pct(1 - fiscalCapacity.investmentShare, 1)}</b><span>{money(fiscalCapacity.operatingAccrued)} devengados</span><em>Universo presupuestario municipal 2025</em></article>
  </div>
  <div className="management-benchmark">
    <div className="benchmark-head"><div><span>BENCHMARK NACIONAL · {managementBenchmark.cycle}</span><h3>Seis dimensiones comparables</h3></div><p>La barra principal es San José; las marcas muestran el promedio de Escuintla y el nacional. Es una línea base institucional, no una medición de la administración actual.</p></div>
    <div className="benchmark-list">{managementBenchmark.indicators.map((indicator: any) => <article key={indicator.code}><div><span>{indicator.code}</span><b>{indicator.name}</b><small>{indicator.category}{indicator.rank ? ` · posición ${indicator.rank}/340` : " · valor cero reportado"}</small></div><div className="benchmark-track"><i style={{ width: `${indicator.score * 100}%` }} /><em className="department-marker" style={{ left: `${indicator.department * 100}%` }} title={`Promedio Escuintla ${indicator.department.toFixed(4)}`} /><em className="national-marker" style={{ left: `${indicator.national * 100}%` }} title={`Promedio nacional ${indicator.national.toFixed(4)}`} /></div><strong>{indicator.score.toFixed(4)}</strong></article>)}</div>
    <div className="benchmark-legend"><span><i />San José</span><span><i />Promedio Escuintla</span><span><i />Promedio nacional</span><a href={managementBenchmark.sourceUrl} target="_blank" rel="noreferrer">Consultar Ranking oficial ↗</a></div>
  </div>
  <p className="trace-note">Fuentes: MINFIN · ingresos y egresos municipales 2025; INE · proyección municipal 2026; SEGEPLAN · Ranking de Gestión Municipal 2020–2021. Ingreso propio = ingresos tributarios, no tributarios, operación, rentas y venta de bienes/servicios; no incluye transferencias, deuda ni disminución de activos.</p>
</section>

<section className="section public-works-section exportable include-print">
  <div className="section-head"><div><p className="eyebrow">INVERSIÓN PÚBLICA · SNIP + GUATECOMPRAS</p><h2>Obras, contratos y señales de seguimiento</h2></div><p>Los proyectos SNIP permanecen separados de los contratos. RADAR solo vincula una adjudicación cuando coinciden el proyecto y su NOG oficial.</p></div>
  <div className="works-kpis">
    <article><small>OBRAS FÍSICAS</small><b>47</b><span>44 con ubicación publicable</span></article>
    <article><small>PRESUPUESTO VIGENTE</small><b>Q240.0 M</b><span>Universo SNIP · no contratos</span></article>
    <article><small>EJECUTADO REPORTADO</small><b>Q68.7 M</b><span>28.6% agregado</span></article>
    <article className="critical"><small>SUSPENDIDAS</small><b>2</b><span>Requieren seguimiento documental</span></article>
  </div>
  <div className="works-layout">
    <div className="works-sectors"><div className="works-title"><span>DISTRIBUCIÓN SECTORIAL</span><b>47 obras</b></div>{[
      ["Transporte",34,72.3],["Agua y saneamiento",7,14.9],["Educación",2,4.3],["Salud",1,2.1],["Otros",3,6.4],
    ].map(([label,count,share]) => <div className="sector-row" key={String(label)}><span>{label}</span><i><em style={{ width: `${share}%` }} /></i><b>{count}</b><small>{share}%</small></div>)}<p>La concentración sectorial describe cantidad de proyectos, no distribución del monto.</p></div>
    <div className="works-priority"><div className="works-title"><span>PROYECTOS DE MAYOR PRESUPUESTO VIGENTE</span><b>Seguimiento</b></div>{[...publicWorks].sort((a: any,b: any) => b.current - a.current).slice(0,5).map((work: any) => <article key={work.snip}><div><span>SNIP {work.snip}</span><b>{work.name}</b><small>{work.entity}</small></div><div><strong>{money(work.current)}</strong><em>{work.status}</em></div><i><span style={{ width: `${Math.min(work.financial,100)}%` }} /></i><p>Ejecución financiera {work.financial.toFixed(1)}% · avance físico {work.physical.toFixed(1)}%</p></article>)}</div>
  </div>
  <div className="procurement-verified">
    <div className="procurement-summary"><div><span>CRUCE CONTRACTUAL VERIFICADO</span><h3>{verifiedProcurements.length} contratos vinculados por SNIP + NOG</h3><p>{money(verifiedProcurementTotal)} adjudicados. Las otras 44 obras físicas permanecen pendientes de conciliación; no se les asigna proveedor por similitud de nombre.</p></div><b>{verifiedProcurements.length}<small> / 47 obras</small></b></div>
    <div className="procurement-list">{verifiedProcurements.map((record: any) => <article key={record.nog}><div><span>SNIP {record.snip} · NOG {record.nog}</span><b>{record.name}</b><small>{record.supplier}</small></div><div><strong>{money(record.amount)}</strong><em>{record.method}</em><a href={record.sourceUrl} target="_blank" rel="noreferrer">Ver fuente oficial ↗</a></div></article>)}</div>
  </div>
  <div className="procurement-boundary"><div><span>SNIP / SEGEPLAN</span><b>Proyecto y avance reportado</b><small>Integrado · 47 obras físicas</small></div><i>≠</i><div><span>GUATECOMPRAS</span><b>Concurso, adjudicatario y contrato</b><small>3 confirmados · 44 pendientes</small></div><i>≠</i><div><span>MINFIN</span><b>Devengado y pagado</b><small>Universo financiero separado</small></div></div>
  <p className="trace-note">Fuentes: SEGEPLAN, cierre SNIP diciembre 2025; Guatecompras OCDS, consulta verificada en julio 2026. Tres coordenadas ilógicas fueron excluidas del mapa. Monto SNIP, adjudicación contractual y pago no se suman entre sí.</p>
</section>

<section className="section social-panorama">
  <div className="section-head"><div><p className="eyebrow">EDUCACIÓN, NUTRICIÓN, SALUD Y CONDICIONES DE VIDA</p><h2>Indicadores sociales con año visible</h2></div><p>Los datos provienen de fuentes oficiales distintas. RADAR conserva el año y el universo de cada indicador para evitar comparaciones engañosas.</p></div>
  <div className="social-grid">
    <article><small>RED EDUCATIVA · 2024</small><b>44</b><span>sedes físicas · 76 servicios educativos</span><em>MINEDUC / SEGEPLAN</em></article>
    <article><small>RETARDO EN TALLA · 2024</small><b>13.7%</b><span>1,421 escolares evaluados · vulnerabilidad baja</span><em>SESAN / MINEDUC</em></article>
    <article><small>NACIMIENTOS · 2024</small><b>963</b><span>13.70 por cada 1,000 habitantes</span><em>INE · residencia de la madre</em></article>
    <article><small>PARTOS INSTITUCIONALES · 2024</small><b>97.1%</b><span>82.0% ocurrieron fuera del municipio</span><em>INE · nacimientos</em></article>
    <article><small>SANEAMIENTO MEJORADO · 2018</small><b>90.9%</b><span>Drenajes: 30.5%</span><em>INE · Censo 2018</em></article>
    <article><small>INTERNET EN EL HOGAR · 2018</small><b>9.3%</b><span>17,161 hogares censados</span><em>INE · Censo 2018</em></article>
  </div>
</section>

<section className="section security-panorama">
  <div className="section-head"><div><p className="eyebrow">SEGURIDAD Y CONFLICTIVIDAD · {municipalSecurity.year}</p><h2>Señales municipales para prevención y territorio</h2></div><p>Registros administrativos oficiales. Miden hechos denunciados o registrados; no equivalen por sí solos a percepción ciudadana ni muestran la ubicación exacta de cada incidente.</p></div>
  <div className="security-grid">
    <article className="security-critical"><small>HOMICIDIOS</small><b>{municipalSecurity.homicideRatePer10k.toFixed(1)}</b><span>víctimas por cada 10,000 habitantes</span><em>PNC · tasa municipal</em></article>
    <article className="security-critical"><small>VIOLENCIA CONTRA LA MUJER</small><b>{municipalSecurity.violenceAgainstWomenComplaintRatePer10kWomen.toFixed(1)}</b><span>denuncias por cada 10,000 mujeres</span><em>Ministerio Público · mayor razón departamental</em></article>
    <article><small>MUJERES AGRAVIADAS</small><b>{municipalSecurity.womenVictimRatePer10kWomen.toFixed(1)}</b><span>por cada 10,000 mujeres</span><em>Ministerio Público · mayor tasa departamental</em></article>
    <article><small>FALTAS JUDICIALES</small><b>{municipalSecurity.departmentalJudicialFaultsShare.toFixed(2)}%</b><span>del total registrado en Escuintla</span><em>Organismo Judicial · mayor proporción departamental</em></article>
    <article><small>ACCIDENTES DE TRÁNSITO</small><b>{municipalSecurity.departmentalTrafficAccidentShare.toFixed(2)}%</b><span>del total departamental</span><em>PNC · segunda concentración municipal</em></article>
  </div>
  <div className="security-reading"><div><span>LECTURA RADAR</span><b>La prevención debe combinar seguridad ciudadana, atención a mujeres y seguridad vial.</b><p>Antes de convertir estas señales en propuestas o mensajes, conviene validarlas con PNC local, Bomberos, liderazgos comunitarios y registros de atención. La ausencia de denuncias no demuestra ausencia de violencia.</p></div><a href={municipalSecurity.sourceUrl} target="_blank" rel="noreferrer">Consultar perfil oficial ↗</a></div>
</section>

<section className="section economy-panorama">
  <div className="section-head"><div><p className="eyebrow">ECONOMÍA Y EMPLEO LOCAL</p><h2>Qué mueve al municipio y dónde se concentra</h2></div><p>El diagnóstico municipal identifica motores, flujos y estacionalidad. No se publica una tasa municipal reciente de desempleo o informalidad porque la fuente no la ofrece.</p></div>
  <div className="economy-kpis">
    <article className="economy-dark"><small>MOTORES DOCUMENTADOS</small><b>{economyInfrastructure.economicEngines.length}</b><span>Puerto-industria, turismo, pesca-comercio y agro</span></article>
    <article><small>TRABAJO ESTACIONAL</small><b>{economyInfrastructure.seasonalWorkWindow}</b><span>Zafra, sal y actividades asociadas</span></article>
    <article><small>INTERNET EN EL HOGAR · {economyInfrastructure.censusYear}</small><b>{economyInfrastructure.internetHouseholdsShare.toFixed(1)}%</b><span>Brecha de conectividad productiva</span></article>
    <article><small>ACCESOS PRINCIPALES</small><b>{economyInfrastructure.mainRoadAccesses}</b><span>Conexiones hacia la CA-9</span></article>
  </div>
  <div className="economy-layout">
    <div className="engine-list"><div className="economy-title"><span>MOTORES ECONÓMICOS</span><b>Lectura territorial</b></div>{economyInfrastructure.economicEngines.map((engine: any, index: number) => <article key={engine.name}><i>{String(index + 1).padStart(2, "0")}</i><div><b>{engine.name}</b><p>{engine.note}</p></div></article>)}</div>
    <div className="mobility-card"><div className="economy-title"><span>MOVILIDAD PARA TRABAJO Y COMERCIO</span><b>PDM-OT 2019</b></div><h3>Tres polos concentran los flujos</h3><div className="mobility-poles"><span><i>01</i><b>Casco urbano</b><small>Servicios, comercio, transporte y administración</small></span><span><i>02</i><b>Zona industrial-portuaria</b><small>Puerto Quetzal, industria y logística</small></span><span><i>03</i><b>Zona costera</b><small>Turismo, hoteles, restaurantes y comercio</small></span></div><div className="employment-gap"><b>Brecha pendiente</b><p>RADAR todavía necesita empleo formal, desempleo, ocupación por rama e informalidad con nivel municipal comparable. Las tasas nacionales no se atribuyen a San José.</p></div></div>
  </div>
  <p className="trace-note">Fuentes: INE · Censo 2018; SEGEPLAN y Municipalidad de San José · PDM-OT 2019–2032. Los motores económicos son una clasificación documental, no un conteo de empresas ni de empleos.</p>
</section>

<section className="section infrastructure-risk">
  <div className="section-head"><div><p className="eyebrow">INFRAESTRUCTURA, CONECTIVIDAD Y RIESGO</p><h2>Accesibilidad con exposición territorial</h2></div><p>La conectividad estratégica convive con amenazas que pueden interrumpir vías, servicios y actividad económica. Los datos describen el diagnóstico territorial de 2019.</p></div>
  <div className="infrastructure-layout">
    <div className="access-card"><div className="risk-title"><span>CONECTIVIDAD VIAL</span><b>{economyInfrastructure.mainRoadAccesses} accesos</b></div><div className="access-list">{economyInfrastructure.accessCorridors.map((corridor: any) => <article key={corridor.name}><i>↗</i><div><b>{corridor.name}</b><p>{corridor.note}</p></div></article>)}</div><div className="access-metrics"><span><small>Cabecera departamental</small><b>{economyInfrastructure.departmentSeatDistanceKm} km</b></span><span><small>Hospital de referencia</small><b>≈ {economyInfrastructure.referralHospitalTravelMinutes} min</b></span></div></div>
    <div className="risk-card"><div className="risk-title"><span>EXPOSICIÓN TERRITORIAL</span><b>PDM-OT</b></div><div className="risk-kpis"><article className="risk-critical"><small>INUNDACIÓN</small><b>{territorialRisk.floodTrend}</b><span>{territorialRisk.mainFloodDrivers}</span></article><article className="risk-critical"><small>SALINIZACIÓN DEL ACUÍFERO</small><b>{territorialRisk.aquiferSalinization}</b><span>Presión sobre agua subterránea</span></article><article><small>ELEVACIÓN</small><b>{territorialRisk.terrainElevation}</b><span>Territorio costero bajo</span></article><article><small>PENDIENTE GENERAL</small><b>{territorialRisk.maximumGeneralSlope}</b><span>Favorece acumulación de agua</span></article></div></div>
  </div>
  <div className="risk-impact"><span>SISTEMAS EXPUESTOS</span>{territorialRisk.exposedSystems.map((system: string) => <b key={system}>{system}</b>)}<p>La identificación de riesgo orienta verificación y prevención; no sustituye polígonos oficiales ni pronóstico de eventos.</p></div>
  <div className="official-risk-map"><div><span>MAPA OFICIAL INCORPORADO</span><h3>{operationalRisk.mapTitle}</h3><p>{operationalRisk.methodology} La referencia ya forma parte del expediente; no se clasifican puntos manualmente mirando el PDF.</p></div><div className="risk-map-status"><b>{operationalRisk.currentStatus}</b><small>{operationalRisk.pendingStatus}</small><div>{operationalRisk.futureCrosses.map((item: string) => <em key={item}>{item}</em>)}</div><a href={operationalRisk.mapUrl} target="_blank" rel="noreferrer">Abrir mapa CONRED ↗</a></div></div>
  <p className="trace-note">Fuente: SEGEPLAN y Municipalidad de San José · PDM-OT 2019–2032, análisis de amenazas, movilidad y conectividad. No se dibujan zonas inundables sin una capa geoespacial oficial validada.</p>
</section>

<section className="section territory-opportunities">
  <div className="section-head"><div><p className="eyebrow">LECTURA EJECUTIVA</p><h2>Alertas y oportunidades territoriales</h2></div><p>Señales para priorizar verificación, propuestas y presencia territorial. No sustituyen el trabajo de campo.</p></div>
  <div className="opportunity-grid">
    <article className="alert"><span>ALERTA</span><h3>Violencia contra la mujer</h3><b>134.8</b><p>denuncias por cada 10,000 mujeres en 2023, la razón más alta del departamento.</p></article>
    <article className="alert"><span>ALERTA</span><h3>Gestión de residuos</h3><b>63.3%</b><p>de los hogares reportó quemar la basura en el Censo 2018. Conviene verificar cambios recientes por comunidad.</p></article>
    <article className="alert"><span>ALERTA</span><h3>Atención fuera del municipio</h3><b>82.0%</b><p>de los nacimientos de residentes ocurrió fuera de San José durante 2024.</p></article>
    <article className="opportunity"><span>OPORTUNIDAD</span><h3>Red educativa territorial</h3><b>44 sedes</b><p>La capa geolocalizada permite cruzar cobertura educativa, comunidades y centros de votación.</p></article>
    <article className="opportunity"><span>OPORTUNIDAD</span><h3>Nutrición escolar</h3><b>−1.9 pp</b><p>Mejora del retardo en talla frente a 2015; el municipio está en categoría de vulnerabilidad baja.</p></article>
    <article className="opportunity"><span>OPORTUNIDAD</span><h3>Economía portuaria y turística</h3><b>4 motores</b><p>La concentración de actividad permite diseñar agendas distintas para empleo, comercio, turismo y producción.</p></article>
    <article className="alert"><span>ALERTA</span><h3>Riesgo de inundación</h3><b>Alto</b><p>El territorio bajo y plano puede afectar vías, vivienda, comercio, turismo, industria y cultivos.</p></article>
  </div>
</section>
  </>;
}
