import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { getInstalledRadarElectoralLayers, getInstalledRadarGeoBundle } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectionCode, type V70ElectoralViewModel } from "../data/v70ElectoralAdapter";
import { V70CanonicalRich0509 } from "./V70CanonicalRich0509";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70Ecosystem0509 } from "./V70Ecosystem0509";
import { V70ElectoralTerritory } from "./V70ElectoralTerritory";
import { V70ElectoralTerritoryUnavailable } from "./V70ElectoralTerritoryUnavailable";

type ActiveVoterProfile = { total_active?: number; cutoff_at?: string; age_total?: Record<string, number> };
type ExportSelection = { electionCode?: V70ElectionCode; centerId?: string };
const AGE_BANDS = [["18_25","18–25"],["26_30","26–30"],["31_35","31–35"],["36_40","36–40"],["41_45","41–45"],["46_50","46–50"],["51_55","51–55"],["56_60","56–60"],["61_65","61–65"],["66_70","66–70"],["70_plus","70+"]] as const;

function numberFromText(value?: string) { if (!value) return undefined; const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : undefined; }
function canonicalAsset(path: string) { const base = import.meta.env.BASE_URL || "/"; return `${base}${path.replace(/^\//, "")}`; }
function resolveViewModel(municipalityCode: string): V70ElectoralViewModel | null { const layers = getInstalledRadarElectoralLayers(municipalityCode) ?? []; if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null; try { return adaptAuthorizedElectoralTerritoryLayers(layers); } catch (error) { console.error("RADAR_V70_ELECTORAL_ADAPTER_FAIL_CLOSED", municipalityCode, error); return null; } }

function Golden0509IntelligenceContent({ onSelectionChange }: { onSelectionChange: (selection: { electionCode: V70ElectionCode; centerId: string }) => void }) {
  const authorized = useAuthorizedRadarRuntime();
  const activeProfile = (authorized.runtime as typeof authorized.runtime & { elector_profile?: ActiveVoterProfile | null }).elector_profile ?? null;
  const profile = findMunicipalProfile("0509");
  const intelligence = profile?.intelligence;
  const geoBundle = getInstalledRadarGeoBundle("0509");
  const electoralView = useMemo(() => resolveViewModel("0509"), []);
  const women = numberFromText(intelligence?.voterWomen); const men = numberFromText(intelligence?.voterMen); const sexTotal = (women ?? 0) + (men ?? 0);
  const womenShare = sexTotal > 0 && women !== undefined ? women / sexTotal * 100 : 0; const menShare = sexTotal > 0 && men !== undefined ? men / sexTotal * 100 : 0; const sexGap = women !== undefined && men !== undefined ? Math.abs(women - men) : undefined;
  const activeAges = useMemo(() => { const total = activeProfile?.total_active ?? 0; const ageTotal = activeProfile?.age_total; if (!ageTotal || total <= 0) return []; return AGE_BANDS.flatMap(([key,label]) => { const value = ageTotal[key]; return typeof value === "number" && Number.isFinite(value) ? [{ key, label, value, share: value / total * 100 }] : []; }); }, [activeProfile]);
  const fallbackAges = intelligence?.ages ?? [];
  const ageRows = activeAges.length ? activeAges : fallbackAges.map((item) => ({ key: item.label, label: item.label, value: Number(String(item.value).replace(/[^0-9.-]/g, "")) || 0, share: item.share }));
  const maxAgeShare = Math.max(...ageRows.map((item) => item.share), 1);
  const young = activeProfile?.age_total ? ["18_25","26_30","31_35","36_40"].reduce((sum,key)=>sum+(activeProfile.age_total?.[key] ?? 0),0) : 0;
  const youngShare = young > 0 && (activeProfile?.total_active ?? 0) > 0 ? young / (activeProfile?.total_active ?? 1) * 100 : null;

  if (!intelligence) return <section className="section"><div className="canonical-vault-notice"><span>NO_PUBLICADO</span><h3>Expediente municipal no disponible</h3><p>RADAR mantiene el vacío sin imputar datos.</p></div></section>;

  return <>
    <div className="print-cover"><div className="radar-brand compact"><img src={canonicalAsset("/brand/radar-electoral-logo-reducido-horizontal-claro.svg")} alt="RADAR Electoral" /></div><div><b>San José / Puerto San José · 0509</b><span>Reporte generado: </span></div></div>
    <section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — PUERTO SAN JOSÉ</p><h1>Inteligencia Municipal</h1><span>Fotografía estratégica del municipio para definir mensajes y prioridades</span></div></section>
    <section className="kpis" aria-label="Indicadores principales">
      <article><small>Población proyectada 2026</small><b>{intelligence.populationProjection || "—"}</b><em>INE · proyección oficial</em></article>
      <article><small>Padrón electoral activo 2026</small><b>{intelligence.voterRegister}</b><em>{intelligence.voterWomen ? `${intelligence.voterWomen} mujeres` : "TSE"}{intelligence.voterMen ? ` · ${intelligence.voterMen} hombres` : ""}</em></article>
      <article><small>Centros electorales geolocalizados</small><b>{intelligence.votingCenters || "—"} <i>centros</i></b><em>103 JRV · auditoría completada</em></article>
      <article><small>ORGANIZACIÓN COMUNITARIA TSE</small><b>{intelligence.communityRecords || "—"} <i>registros</i></b><em>9 agrupaciones territoriales del municipio</em></article>
    </section>
    <section className="section electorate-profile">
      <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026</p><h2>Quiénes pueden votar hoy</h2></div><p>Sexo, edad y alfabetismo provienen del padrón activo del TSE. La distribución urbana/rural pertenece al Censo 2018 y se muestra aparte para no mezclar universos.</p></div>
      <div className="electorate-hero">
        <article className="register-total"><span>PADRÓN ACTIVO</span><b>{intelligence.voterRegister}</b><p>Corte oficial: {intelligence.registerCut || "2026"}</p>{intelligence.registerGrowth ? <div><strong>{intelligence.registerGrowth}</strong><small>personas frente al padrón electoral 2023<br />comparación indicativa: +5.0%</small></div> : null}</article>
        {women !== undefined && men !== undefined ? <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span>{sexGap !== undefined ? <b>Brecha: {new Intl.NumberFormat("es-GT").format(sexGap)}</b> : null}</div><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{intelligence.voterWomen}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{intelligence.voterMen}</b><small>{menShare.toFixed(1)}%</small></span></div></article> : null}
        {intelligence.literacyRate ? <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{intelligence.literacyRate}</b>{intelligence.literatePeople ? <small>{intelligence.literatePeople} personas</small> : null}</div><div className="literacy-detail">{intelligence.womenLiteracy ? <span>Mujeres <b>{intelligence.womenLiteracy}</b></span> : null}{intelligence.menLiteracy ? <span>Hombres <b>{intelligence.menLiteracy}</b></span> : null}{intelligence.literacyUnregistered ? <span>Sin alfabetismo registrado <b>{intelligence.literacyUnregistered}</b></span> : null}</div></article> : null}
      </div>
      <div className="age-and-territory">
        {ageRows.length ? <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>{youngShare === null ? "Padrón activo" : `${youngShare.toFixed(1)}% tiene entre 18 y 40 años`}</b></div><div className="age-bars">{ageRows.map((item) => <div key={item.key}><span>{item.label}</span><i><em style={{ width: `${item.share / maxAgeShare * 100}%` }} /></i><b>{new Intl.NumberFormat("es-GT").format(item.value)}</b><small>{item.share.toFixed(1)}%</small></div>)}</div></article> : null}
        <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{intelligence.voterRegister}</b><small>Ciudadanos empadronados activos. La fuente actual no publica urbano/rural.</small></div>{intelligence.censusPopulation ? <div className="universe-block census"><span>INE · CENSO 2018</span><b>{intelligence.censusPopulation}</b><div className="rural-bar"><i style={{ width: `${intelligence.censusUrbanShare}%` }} /><em style={{ width: `${intelligence.censusRuralShare}%` }} /></div><p><strong>{intelligence.censusUrban} urbanos · {intelligence.censusUrbanShare.toFixed(1)}%</strong><strong>{intelligence.censusRural} rurales · {intelligence.censusRuralShare.toFixed(1)}%</strong></p></div> : null}{intelligence.populationProjection ? <div className="universe-block projection"><span>INE · PROYECCIÓN 2026</span><b>{intelligence.populationProjection}</b><small>{intelligence.projectionMen ? `${intelligence.projectionMen} hombres` : ""}{intelligence.projectionMen && intelligence.projectionWomen ? " · " : ""}{intelligence.projectionWomen ? `${intelligence.projectionWomen} mujeres` : ""}. Proyección poblacional, no padrón.</small></div> : null}</article>
      </div>
      <p className="trace-note">Fuentes: TSE · Ciudadanos empadronados activos 2026; INE · Censo 2018 y proyecciones municipales. Los porcentajes se calculan sobre cada universo oficial, sin imputar urbano/rural al padrón actual.</p>
    </section>
    {electoralView ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle ?? undefined} onSelectionChange={onSelectionChange} /> : <V70ElectoralTerritoryUnavailable municipalityName="San José / Puerto San José" geoBundle={geoBundle ?? undefined} state="NO_PUBLICADO" />}
    <V70CanonicalRich0509 />
    <V70Ecosystem0509 />
  </>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function integer(value: unknown) { const number = finite(value); return number === null ? "No publicado" : new Intl.NumberFormat("es-GT").format(number); }
function decimal(value: unknown, digits = 1) { const number = finite(value); return number === null ? "No publicado" : number.toLocaleString("es-GT", { maximumFractionDigits: digits }); }
function pct(value: unknown, fraction = false) { const number = finite(value); return number === null ? "No publicado" : `${(fraction ? number * 100 : number).toLocaleString("es-GT", { maximumFractionDigits: 1 })}%`; }
function gtq(value: unknown) { const number = finite(value); return number === null ? "No publicado" : new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", maximumFractionDigits: 0 }).format(number); }

function MunicipalIntelligenceContent({ onSelectionChange }: { onSelectionChange: (selection: { electionCode: V70ElectionCode; centerId: string }) => void }) {
  const { runtime } = useAuthorizedRadarRuntime();
  const { municipality_code, municipality_name, department_name } = useMunicipalityContext();
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);
  const electoralView = useMemo(() => resolveViewModel(municipality_code), [municipality_code]);
  const layer = (id: string) => runtime.layers.find((item) => item.layer_id === id);
  const payload = (id: string) => record(layer(id)?.payload);
  const nucleus = payload("NUCLEO_ELECTORAL");
  const electoralMunicipality = record(nucleus.municipality);
  const centersJrv = record(nucleus.centers_jrv);
  const communities = record(nucleus.communities);
  const activeElectors = finite(electoralMunicipality.active_voters_2026) ?? runtime.voter_roll.aggregates.find((item) => item.universe === "NUCLEO_ELECTORAL_2026")?.elector_count ?? null;
  const registered2023 = finite(electoralMunicipality.registered_voters_2023) ?? runtime.voter_roll.aggregates.find((item) => item.universe === "PADRON_DETALLADO_2023")?.elector_count ?? null;
  const women = finite(electoralMunicipality.women_2026);
  const men = women !== null && activeElectors !== null ? activeElectors - women : null;
  const womenShare = women !== null && activeElectors ? women / activeElectors * 100 : null;
  const menShare = men !== null && activeElectors ? men / activeElectors * 100 : null;
  const centerCount = finite(centersJrv.physical_locations) ?? electoralView?.centers.length ?? null;
  const jrvCount = finite(centersJrv.jrv) ?? electoralView?.centers.reduce((sum, center) => sum + center.jrv, 0) ?? null;
  const geoCount = runtime.geo.feature_total;
  const population = runtime.demographics?.population_total ?? null;
  const census = payload("INE_CENSO_B2_B6");
  const services = payload("RGM_SERVICIOS");
  const health = payload("MSPAS_SALUD");
  const schools = payload("MINEDUC_ESCUELAS");
  const risk = payload("CONRED_INFORM");
  const forest = payload("INAB_FORESTAL");
  const protectedAreas = payload("CONAP_SIGAP");
  const nutrition = payload("SESAN_TALLA");
  const finance = payload("MINFIN_YTD");
  const financeHistory = payload("MINFIN_HIST");
  const projects = payload("SNIP_2026");
  const contracts = payload("GUATECOMPRAS");
  const insightCards = [
    { eyebrow: "HOGARES · INE 2018", title: "Agua dentro de la vivienda", value: pct(census.water_pipe_inside_pct, true), detail: `${integer(census.total_households)} hogares en el universo censal.` },
    { eyebrow: "SERVICIOS PÚBLICOS", title: "Índice histórico", value: decimal(services.indice_servicios_publicos, 3), detail: String(services.indice_servicios_publicos_categoria ?? "Categoría no publicada") },
    { eyebrow: "SALUD · MSPAS", title: "Establecimientos", value: integer(health.records), detail: `${integer(health.map_publishable)} georreferenciados.` },
    { eyebrow: "EDUCACIÓN · MINEDUC", title: "Registros", value: integer(schools.records), detail: `${integer(schools.level_primaria)} primaria · ${integer(schools.level_basico)} básico · alcance parcial documentado.` },
    { eyebrow: "RIESGO · CONRED 2021", title: "INFORM", value: decimal(risk.inform_risk), detail: `Puesto nacional ${integer(risk.national_rank)} · vulnerabilidad ${decimal(risk.vulnerability)}.` },
    { eyebrow: "BOSQUE · INAB", title: "Cobertura 2020", value: `${decimal(forest.forest_cover_2020_ha)} ha`, detail: `${String(forest.trend ?? "Tendencia no publicada")} · cambio neto ${decimal(forest.net_change_ha)} ha.` },
    { eyebrow: "ÁREAS PROTEGIDAS · CONAP", title: "Asociación explícita", value: integer(protectedAreas.explicit_protected_area_count), detail: String(protectedAreas.management_categories ?? "Sin asociación explícita publicada") },
    { eyebrow: "NUTRICIÓN · SESAN 2024", title: "Prevalencia de talla baja", value: pct(nutrition.stunting_prevalence_pct), detail: `${integer(nutrition.analyzed_students)} estudiantes analizados · ${String(nutrition.nutritional_vulnerability_category ?? "categoría no publicada")}.` },
    { eyebrow: "FINANZAS · 2026 YTD", title: "Presupuesto vigente", value: gtq(finance.current_budget_amount), detail: `Ejecución ${pct(finance.budget_execution_pct)} · corte oficial abierto.` },
    { eyebrow: "FINANZAS · 2016–2025", title: "Ingresos percibidos", value: gtq(financeHistory.ingresos_percibidos_10y), detail: `${integer(financeHistory.years_available)} años comparables.` },
    { eyebrow: "INVERSIÓN · SNIP 2026", title: "Proyectos", value: integer(projects.project_count), detail: `${gtq(projects.requested_amount)} solicitados.` },
    { eyebrow: "GUATECOMPRAS · 2025–2026", title: "Contratos publicados", value: integer(contracts.contracts_total), detail: `${gtq((finite(contracts.contract_value_2025_gtq) ?? 0) + (finite(contracts.contract_value_2026_ytd_gtq) ?? 0))} publicados; no equivale a ejecución física.` },
  ];
  return <>
    <div className="print-cover"><div className="radar-brand compact"><img src={canonicalAsset("/brand/radar-electoral-logo-reducido-horizontal-claro.svg")} alt="RADAR Electoral" /></div><div><b>{municipality_name} · {municipality_code}</b><span>{department_name} · expediente municipal autorizado</span></div></div>
    <section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE MUNICIPAL 360 · {department_name.toUpperCase()} — {municipality_name.toUpperCase()}</p><h1>Inteligencia Municipal</h1><span>Fotografía estratégica del municipio para definir mensajes y prioridades</span></div></section>
    <section className="kpis" aria-label="Indicadores principales">
      <article><small>Población proyectada {runtime.demographics?.projection_year ?? ""}</small><b>{population === null ? "—" : population.toLocaleString("es-GT")}</b><em>{runtime.demographics?.source_label ?? "INE · no publicado"}</em></article>
      <article><small>Padrón electoral activo 2026</small><b>{activeElectors === null ? "—" : activeElectors.toLocaleString("es-GT")}</b><em>{women === null ? "TSE" : `${women.toLocaleString("es-GT")} mujeres · ${men?.toLocaleString("es-GT")} hombres`}</em></article>
      <article><small>Centros electorales geolocalizados</small><b>{centerCount === null ? "—" : centerCount.toLocaleString("es-GT")} <i>centros</i></b><em>{jrvCount === null ? "JRV no publicadas" : `${jrvCount.toLocaleString("es-GT")} JRV`} · TREP 2023</em></article>
      <article><small>COBERTURA TERRITORIAL</small><b>{geoCount.toLocaleString("es-GT")} <i>puntos</i></b><em>{integer(communities.communities_count)} comunidades en núcleo electoral</em></article>
    </section>
    <section className="section electorate-profile"><div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO</p><h2>Quiénes pueden votar hoy</h2></div><p>El padrón activo y el padrón detallado mantienen universos separados. RADAR no rellena vacíos ni mezcla cortes.</p></div><div className="electorate-hero">
      <article className="register-total"><span>PADRÓN ACTIVO 2026</span><b>{activeElectors === null ? "—" : activeElectors.toLocaleString("es-GT")}</b><p>TSE · municipio {municipality_code}</p>{registered2023 !== null && activeElectors !== null ? <div><strong>{activeElectors - registered2023 >= 0 ? "+" : ""}{(activeElectors - registered2023).toLocaleString("es-GT")}</strong><small>variación frente al padrón 2023<br />comparación indicativa</small></div> : null}</article>
      {women !== null && men !== null && womenShare !== null && menShare !== null ? <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span><b>2026</b></div><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{women.toLocaleString("es-GT")}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{men.toLocaleString("es-GT")}</b><small>{menShare.toFixed(1)}%</small></span></div></article> : null}
      <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{pct(electoralMunicipality.literacy_share_2026, true)}</b><small>TSE · padrón activo 2026</small></div><div className="literacy-detail"><span>18–35 años <b>{integer(electoralMunicipality.age_18_35_2026)}</b></span><span>Participación 18–35 <b>{pct(electoralMunicipality.age_18_35_share_2026, true)}</b></span></div></article>
    </div><p className="trace-note">Fuentes: TSE · núcleo electoral 2023–2026; INE · proyecciones municipales. Cada tarjeta conserva su período y universo.</p></section>
    {electoralView ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle ?? undefined} onSelectionChange={onSelectionChange} /> : <V70ElectoralTerritoryUnavailable municipalityName={municipality_name} geoBundle={geoBundle ?? undefined} state="NO_PUBLICADO" />}
    <section className="section"><div className="section-head"><div><p className="eyebrow">EXPEDIENTE MUNICIPAL 360</p><h2>Datos que ayudan a decidir</h2></div><p>Servicios, hogares, riesgo, ambiente, finanzas e inversión sin mezclar períodos.</p></div><section className="module-card-grid canonical-module-grid">{insightCards.map((item) => <article key={item.eyebrow}><span className="canonical-state canonical-state--disponible">Disponible</span><small>{item.eyebrow}</small><h2>{item.title}</h2><div className="canonical-metric"><b>{item.value}</b><span>{item.detail}</span></div></article>)}</section></section>
    <section className="section"><div className="section-head"><div><p className="eyebrow">TRAZABILIDAD</p><h2>Fuentes autorizadas</h2></div><p>{runtime.layers.length} capas visibles para {municipality_name}.</p></div><div className="source-list">{runtime.layers.filter((item) => !item.layer_id.startsWith("TREP_2023_CENTER_RESULTS_")).map((item) => <article key={item.layer_id}><b>{item.layer_id}</b><span>{item.source_label ?? "Fuente no publicada"}</span><small>{item.period ?? "Sin período"} · {item.source_status ?? "Sin estado"}</small></article>)}</div></section>
  </>;
}

export function V70DirectIntelligence0509() {
  const { municipalityCode } = useParams();
  const [exportSelection, setExportSelection] = useState<ExportSelection>({});
  const handleSelectionChange = useCallback((selection: { electionCode: V70ElectionCode; centerId: string }) => setExportSelection(selection), []);
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || !municipalityCode) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="inteligencia" eyebrow="EXPEDIENTE MUNICIPAL 360" topbarTitle={municipalityTitle} accountRole="Cuenta del municipio" dayDNext intelligenceExportSelection={exportSelection}>{municipalityCode === "0509" ? <Golden0509IntelligenceContent onSelectionChange={handleSelectionChange} /> : <MunicipalIntelligenceContent onSelectionChange={handleSelectionChange} />}</V70DirectShell0509></MunicipalityProvider>;
}
