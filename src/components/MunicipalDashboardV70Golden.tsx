import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { getInstalledRadarGeoBundle, getInstalledRadarRuntime } from "../data/radarRuntimeCache";
import type { RadarRuntimeBundle } from "../data/radarRuntime";
import { MunicipalDashboardV70Runtime } from "./MunicipalDashboardV70Runtime";
import { V70ElectoralMap, type V70VotingCenterPoint } from "./V70ElectoralMap";

const fmt = new Intl.NumberFormat("es-GT");
const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

const sections = [
  ["⌂", "Inicio", "inicio", "CENTRO DE MANDO"],
  ["◎", "Inteligencia Municipal", "inteligencia", "INTELIGENCIA MUNICIPAL"],
  ["◇", "Estrategia", "estrategia", "ESTRATEGIA"],
  ["♙", "Directorio", "directorio", "DIRECTORIO"],
  ["▥", "Agenda", "agenda", "OPERACIÓN"],
  ["⌖", "Mapa Inteligente", "mapa", "TERRITORIO Y OPERACIÓN"],
  ["▤", "Día D", "dia-d", "OPERACIÓN ELECTORAL"],
  ["▣", "Recursos", "recursos", "RECURSOS"],
  ["◒", "Pulso Electoral", "pulso", "PULSO ELECTORAL"],
  ["✦", "IA RADAR", "ia-radar", "IA RADAR"],
  ["⚙", "Configuración", "configuracion", "CONFIGURACIÓN"],
] as const;

const electionTabs = ["Presidencia", "Lista nacional", "Distrito", "Alcaldía", "Parlacen"];
const ageDefinitions = [
  ["18_25", "18–25"], ["26_30", "26–30"], ["31_35", "31–35"], ["36_40", "36–40"],
  ["41_45", "41–45"], ["46_50", "46–50"], ["51_55", "51–55"], ["56_60", "56–60"],
  ["61_65", "61–65"], ["66_70", "66–70"], ["70_plus", "70+"],
] as const;

type RadarTheme = "light" | "dark";
type RadarTextSize = "normal" | "large";

type GoldenElectorProfile = {
  municipality_code: string;
  cutoff_at: string;
  total_active: number;
  women_active: number;
  men_active: number;
  women_literate: number;
  women_illiterate: number;
  men_literate: number;
  men_illiterate: number;
  age_total: Record<string, number>;
  age_women: Record<string, number>;
  age_men: Record<string, number>;
  source_id: string;
  source_label: string;
  source_status: string;
};

type GoldenCenter = V70VotingCenterPoint & {
  address: string | null;
  zone: string | null;
  registered_voters: number;
  jrv_initial: number;
  jrv_final: number;
  jrv_total: number;
  institution: string | null;
  grouping_codes: string | null;
};

type GoldenCenterDirectory = {
  municipality_code: string;
  center_count: number;
  jrv_total: number;
  registered_voters_total: number;
  centers: GoldenCenter[];
};

type GoldenRuntime = RadarRuntimeBundle & {
  elector_profile?: GoldenElectorProfile | null;
  voting_centers?: GoldenCenterDirectory | null;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function asNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function asText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function routeFor(code: string, slug: string) { return slug === "inicio" ? `/municipio/${code}` : `/municipio/${code}/${slug}`; }

function useRadarPreferences() {
  const [theme, setTheme] = useState<RadarTheme>("light");
  const [textSize, setTextSize] = useState<RadarTextSize>("normal");
  useLayoutEffect(() => {
    const initialTheme: RadarTheme = window.localStorage.getItem("radar-theme") === "dark" ? "dark" : "light";
    const initialTextSize: RadarTextSize = window.localStorage.getItem("radar-text-size-v3") === "large" ? "large" : "normal";
    document.documentElement.dataset.theme = initialTheme;
    document.documentElement.dataset.textSize = initialTextSize;
    setTheme(initialTheme); setTextSize(initialTextSize);
  }, []);
  const toggleTheme = () => setTheme((value) => {
    const next: RadarTheme = value === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; window.localStorage.setItem("radar-theme", next); return next;
  });
  const increaseTextSize = () => setTextSize((value) => {
    const next: RadarTextSize = value === "normal" ? "large" : "normal";
    document.documentElement.dataset.textSize = next; window.localStorage.setItem("radar-text-size-v3", next); return next;
  });
  return { theme, textSize, toggleTheme, increaseTextSize };
}

function PortalControls({ theme, textSize, onTextSize, onTheme }: { theme: RadarTheme; textSize: RadarTextSize; onTextSize: () => void; onTheme: () => void }) {
  const { municipality_code } = useMunicipalityContext();
  return <div className="top-actions">
    <button className="print-top-action" type="button" onClick={() => window.print()}><span className="control-icon" aria-hidden="true">⇩</span><span className="control-label">Reporte PDF</span></button>
    <button className="text-size-action" type="button" onClick={onTextSize} aria-label={`Tamaño de texto ${textSize}`}>A<span>A</span></button>
    <button className="theme-switch" type="button" onClick={onTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}><span className="control-icon" aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span><span className="control-label">{theme === "dark" ? "Claro" : "Oscuro"}</span></button>
    <span className="pilot">Municipio <b>{municipality_code}</b></span><span className="country-flag" role="img" aria-label="Versión Guatemala">🇬🇹</span>
  </div>;
}

function SectionBanner({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="section-banner"><div className="section-banner-copy"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div></section>;
}

function GoldenIntelligenceShell() {
  const { municipality_code, municipality_name, department_name } = useMunicipalityContext();
  const runtime = getInstalledRadarRuntime(municipality_code) as GoldenRuntime | undefined;
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);
  const baseProfile = findMunicipalProfile(municipality_code);
  const elector = runtime?.elector_profile ?? null;
  const centerDirectory = runtime?.voting_centers ?? null;
  const electoralLayer = runtime?.layers.find((item) => item.layer_id === "NUCLEO_ELECTORAL");
  const electoralPayload = asRecord(electoralLayer?.payload);
  const electoralMunicipality = asRecord(electoralPayload?.municipality);
  const communities = asRecord(electoralPayload?.communities);
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCenter, setSelectedCenter] = useState<number | null>(centerDirectory?.centers[0]?.center_correlative ?? null);
  const [layers, setLayers] = useState({ electoral: true, schools: true, territory: false, health: true });
  const { theme, textSize, toggleTheme, increaseTextSize } = useRadarPreferences();

  useEffect(() => { setNavCollapsed(window.localStorage.getItem("radar-sidebar") === "collapsed"); }, []);
  useEffect(() => { if (centerDirectory?.centers.length && selectedCenter === null) setSelectedCenter(centerDirectory.centers[0].center_correlative); }, [centerDirectory, selectedCenter]);

  const registered2023 = asNumber(electoralMunicipality?.registered_voters_2023);
  const active2026 = elector?.total_active ?? asNumber(electoralMunicipality?.active_voters_2026) ?? 0;
  const women = elector?.women_active ?? asNumber(electoralMunicipality?.women_2026) ?? 0;
  const men = elector?.men_active ?? Math.max(active2026 - women, 0);
  const womenShare = active2026 ? women / active2026 : 0;
  const menShare = active2026 ? men / active2026 : 0;
  const literate = elector ? elector.women_literate + elector.men_literate : Math.round(active2026 * (asNumber(electoralMunicipality?.literacy_share_2026) ?? 0));
  const illiterate = elector ? elector.women_illiterate + elector.men_illiterate : Math.max(active2026 - literate, 0);
  const literacyRate = active2026 ? literate / active2026 : 0;
  const womenLiteracy = women && elector ? elector.women_literate / women : 0;
  const menLiteracy = men && elector ? elector.men_literate / men : 0;
  const growth = registered2023 !== undefined ? active2026 - registered2023 : undefined;
  const growthRate = registered2023 ? growth! / registered2023 : undefined;
  const ages = ageDefinitions.map(([key, label]) => ({ label, value: elector?.age_total?.[key] ?? 0 })).filter((item) => item.value > 0);
  const maxAgeShare = Math.max(...ages.map((item) => active2026 ? item.value / active2026 : 0), 0.01);
  const youngTo40 = elector ? ["18_25", "26_30", "31_35", "36_40"].reduce((sum, key) => sum + (elector.age_total[key] ?? 0), 0) : 0;
  const projection = runtime?.demographics?.population_total;
  const projectionMen = runtime?.demographics?.population_male;
  const projectionWomen = runtime?.demographics?.population_female;
  const censusPopulation = baseProfile?.intelligence?.censusPopulation;
  const censusUrban = baseProfile?.intelligence?.censusUrban;
  const censusRural = baseProfile?.intelligence?.censusRural;
  const censusUrbanShare = baseProfile?.intelligence?.censusUrbanShare;
  const censusRuralShare = baseProfile?.intelligence?.censusRuralShare;
  const centers = centerDirectory?.centers ?? [];
  const filteredCenters = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    if (!term) return centers;
    return centers.filter((center) => `${center.center_correlative} ${center.center_name} ${center.community ?? ""} ${center.address ?? ""}`.toLocaleLowerCase("es").includes(term));
  }, [centers, query]);
  const selected = centers.find((center) => center.center_correlative === selectedCenter) ?? centers[0];

  const toggleSidebar = () => setNavCollapsed((value) => {
    const next = !value; window.localStorage.setItem("radar-sidebar", next ? "collapsed" : "expanded"); return next;
  });

  return <main id="inicio" className={`portal-shell ${navCollapsed ? "sidebar-is-collapsed" : ""}`}>
    <button className={`nav-scrim ${navOpen ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />
    <aside className={`portal-sidebar ${navOpen ? "open" : ""} ${navCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src="/brand/radar-electoral-isotipo.svg" alt="RADAR" /></div></div>
      <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={navCollapsed ? "Expandir menú" : "Contraer menú"}>{navCollapsed ? "›" : "‹"}</button>
      <nav aria-label="Navegación principal">{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(municipality_code, slug)} className={slug === "inteligencia" ? "active" : ""} onClick={() => setNavOpen(false)}><span>{icon}</span><b>{label}</b>{label === "Día D" ? <small>PRÓXIMO</small> : null}</Link>)}</nav>
      <div className="sidebar-account"><button type="button"><i>GT</i><span><b>Vista autorizada</b><small>{municipality_code} · {municipality_name}</small></span><em>⌄</em></button></div>
    </aside>

    <div className="portal-main">
      <header className="portal-topbar"><button className="mobile-menu" aria-label="Abrir menú" onClick={() => setNavOpen(true)}>☰</button><img className="topbar-mark" src="/brand/radar-isotipo.svg" alt="" aria-hidden="true" /><div><small>EXPEDIENTE MUNICIPAL 360</small><b>{municipality_name}</b></div><PortalControls theme={theme} textSize={textSize} onTextSize={increaseTextSize} onTheme={toggleTheme} /></header>

      <SectionBanner eyebrow={`EXPEDIENTE MUNICIPAL 360 · ${department_name.toUpperCase()} — ${municipality_name.toUpperCase()}`} title="Inteligencia Municipal" description="Fotografía estratégica del municipio para definir mensajes y prioridades" />

      <section className="kpis" aria-label="Indicadores principales">
        <article><small>Población proyectada 2026</small><b>{projection ? fmt.format(projection) : "—"}</b><em>INE · proyección oficial</em></article>
        <article><small>Padrón electoral activo 2026</small><b>{active2026 ? fmt.format(active2026) : "—"}</b><em>{women ? `${fmt.format(women)} mujeres · ${fmt.format(men)} hombres` : "TSE"}</em></article>
        <article><small>Centros electorales geolocalizados</small><b>{centerDirectory?.center_count ?? geoBundle?.feature_counts.tse_voting_center ?? "—"} <i>centros</i></b><em>{centerDirectory ? `${fmt.format(centerDirectory.jrv_total)} JRV · auditoría TSE` : "Geolocalización TSE 2023"}</em></article>
        <article><small>Organización comunitaria TSE</small><b>{asNumber(communities?.communities_count) !== undefined ? fmt.format(asNumber(communities?.communities_count)!) : "—"} <i>registros</i></b><em>{asNumber(communities?.group_count) !== undefined ? `${fmt.format(asNumber(communities?.group_count)!)} agrupaciones territoriales del municipio` : "Núcleo electoral municipal"}</em></article>
      </section>

      <section className="section electorate-profile exportable">
        <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026</p><h2>Quiénes pueden votar hoy</h2></div><p>Sexo, edad y alfabetismo provienen del padrón activo del TSE. La distribución urbana/rural pertenece al Censo 2018 y se muestra aparte para no mezclar universos.</p></div>
        <div className="electorate-hero">
          <article className="register-total"><span>PADRÓN ACTIVO</span><b>{active2026 ? fmt.format(active2026) : "—"}</b><p>Corte oficial: {elector ? "12 julio 2026" : "2026"}</p>{growth !== undefined && growthRate !== undefined ? <div><strong>{growth >= 0 ? "+" : "−"}{fmt.format(Math.abs(growth))}</strong><small>personas frente al padrón electoral 2023<br/>comparación indicativa: {growthRate >= 0 ? "+" : "−"}{Math.abs(growthRate * 100).toFixed(1)}%</small></div> : null}</article>
          <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span><b>Brecha: {fmt.format(Math.abs(women - men))}</b></div><div className="split-meter"><i style={{ width: `${womenShare * 100}%` }} /><em style={{ width: `${menShare * 100}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{fmt.format(women)}</b><small>{pct(womenShare)}</small></span><span><i />Hombres <b>{fmt.format(men)}</b><small>{pct(menShare)}</small></span></div></article>
          <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{active2026 ? pct(literacyRate) : "—"}</b><small>{literate ? `${fmt.format(literate)} personas` : "Fuente TSE"}</small></div><div className="literacy-detail"><span>Mujeres <b>{elector ? pct(womenLiteracy) : "—"}</b></span><span>Hombres <b>{elector ? pct(menLiteracy) : "—"}</b></span><span>Sin alfabetismo registrado <b>{illiterate ? fmt.format(illiterate) : "—"}</b></span></div></article>
        </div>
        <div className="age-and-territory">
          <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>{elector && active2026 ? `${(youngTo40 / active2026 * 100).toFixed(1)}% tiene entre 18 y 40 años` : "Detalle TSE 2026"}</b></div><div className="age-bars">{ages.length ? ages.map((item) => { const share = item.value / active2026; return <div key={item.label}><span>{item.label}</span><i><em style={{ width: `${share / maxAgeShare * 100}%` }} /></i><b>{fmt.format(item.value)}</b><small>{pct(share)}</small></div>; }) : <p className="preliminary-note">Detalle de 11 rangos de edad en incorporación para este municipio.</p>}</div></article>
          <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{active2026 ? fmt.format(active2026) : "—"}</b><small>Ciudadanos empadronados activos. La fuente actual no publica urbano/rural.</small></div>{censusPopulation ? <div className="universe-block census"><span>INE · CENSO 2018</span><b>{censusPopulation}</b>{censusUrbanShare !== undefined && censusRuralShare !== undefined ? <><div className="rural-bar"><i style={{ width: `${censusUrbanShare}%` }} /><em style={{ width: `${censusRuralShare}%` }} /></div><p><strong>{censusUrban} urbanos · {censusUrbanShare.toFixed(1)}%</strong><strong>{censusRural} rurales · {censusRuralShare.toFixed(1)}%</strong></p></> : null}</div> : <div className="universe-block census"><span>INE · CENSO 2018</span><b>—</b><small>Desagregación urbano/rural municipal en enlace canónico; RADAR no imputa.</small></div>}<div className="universe-block projection"><span>INE · PROYECCIÓN 2026</span><b>{projection ? fmt.format(projection) : "—"}</b><small>{projectionMen && projectionWomen ? `${fmt.format(projectionMen)} hombres · ${fmt.format(projectionWomen)} mujeres. ` : ""}Proyección poblacional, no padrón.</small></div></article>
        </div>
        <p className="trace-note">Fuentes: TSE · Ciudadanos empadronados activos 2026; INE · Censo 2018 y proyecciones municipales. Los porcentajes se calculan sobre cada universo oficial, sin imputar urbano/rural al padrón actual.</p>
      </section>

      <section id="mapa" className="map-section exportable">
        <div className="section-head map-heading"><div><p className="eyebrow">INTELIGENCIA ELECTORAL TERRITORIAL</p><h2>El voto centro por centro</h2></div><p>No mostramos únicamente al ganador: cambia la elección, compara participación, margen, cobertura de actas y las cinco fuerzas principales de cada centro.</p></div>
        <div className="election-switch" role="tablist" aria-label="Tipo de elección">{electionTabs.map((tab) => <button key={tab} className={tab === "Alcaldía" ? "active" : ""} type="button"><span>{tab}</span><small>2023 · TSE</small></button>)}</div>
        <div className="map-workspace">
          <aside className="directory"><div className="directory-head"><div><p className="eyebrow">DIRECTORIO ELECTORAL</p><h3>{centerDirectory ? `${centerDirectory.center_count} centros · ${fmt.format(centerDirectory.jrv_total)} JRV` : "Centros TSE 2023"}</h3></div><span>{filteredCenters.length}</span></div><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro o comunidad" /></label><div className="center-list">{filteredCenters.map((center) => <button type="button" key={center.center_correlative} className={`center-row ${center.center_correlative === selectedCenter ? "selected" : ""}`} onClick={() => setSelectedCenter(center.center_correlative)}><span className="center-code">{String(center.center_correlative).padStart(3, "0")}</span><span className="center-copy"><b>{center.center_name}</b><small>{center.community ?? "Centro electoral"} · JRV {center.jrv_initial}–{center.jrv_final}</small></span><span className="center-result"><b>{fmt.format(center.jrv_total)} JRV</b><small>{fmt.format(center.registered_voters)} emp.</small></span></button>)}</div><div className="directory-note"><b>Scroll independiente</b><span>Selecciona cualquier centro para mantener visibles su JRV, cobertura y desglose electoral.</span></div></aside>
          <div className="map-panel"><div className="intelligence-map-toolbar" aria-label="Controles del mapa de Inteligencia Municipal"><div className="metric-switch"><button className="active" type="button">Ganador</button><button type="button" title="Pendiente de enlace TREP centro por centro">Participación</button><button type="button" title="Pendiente de enlace TREP centro por centro">Margen</button><button type="button" title="Pendiente de enlace TREP centro por centro">Actas</button></div><div className="layer-switch"><button type="button" className={`layer-electoral ${layers.electoral ? "on" : ""}`} onClick={() => setLayers((value) => ({ ...value, electoral: !value.electoral }))}><i className="electoral-dot" />Electoral</button><button type="button" className={`layer-schools ${layers.schools ? "on" : ""}`} onClick={() => setLayers((value) => ({ ...value, schools: !value.schools }))}><i className="school-dot" />Escuelas <b>{geoBundle?.feature_counts.school ?? 0}</b></button><button type="button" className={`layer-territory ${layers.territory ? "on" : ""}`} onClick={() => setLayers((value) => ({ ...value, territory: !value.territory }))}><i className="territory-dot" />CEM</button><button type="button" className={`layer-health ${layers.health ? "on" : ""}`} onClick={() => setLayers((value) => ({ ...value, health: !value.health }))}><i className="health-dot" />Salud <b>{geoBundle?.feature_counts.health_facility ?? 0}</b></button></div></div><div className="active-reading"><span>Visualizando</span><b>Alcaldía · Centros y JRV TSE 2023</b><small>El resultado electoral por centro se enlazará únicamente desde TREP validado; no se infiere.</small></div>{runtime?.geo.bbox && centers.length ? <V70ElectoralMap municipalityName={municipality_name} centers={centers} selectedCenter={selectedCenter} bbox={runtime.geo.bbox} onSelect={setSelectedCenter} /> : <div className="real-map canonical-map-pending"><b>Cartografía electoral en validación</b></div>}<div className="map-source"><span>Mapa base OpenFreeMap · centros geolocalizados y auditados</span><span>TSE 2023 · logística/JRV preservada como universo separado</span></div>{selected ? <article className="center-card" aria-live="polite"><div className="center-card-head"><span>CV {String(selected.center_correlative).padStart(3, "0")}</span><div><b>{selected.center_name}</b><small>{selected.community ?? "Centro electoral"} · {selected.institution ?? "TSE"}</small></div></div><div className="center-stats"><div><small>Empadronados</small><b>{fmt.format(selected.registered_voters)}</b></div><div><small>JRV</small><b>{selected.jrv_initial}–{selected.jrv_final}</b></div><div><small>Total JRV</small><b>{fmt.format(selected.jrv_total)}</b></div><div><small>Zona</small><b>{selected.zone || "—"}</b></div></div><div className="result-heading"><span>Resultado · Alcaldía</span><b>TREP por centro en enlace validado</b></div><p className="preliminary-note">La ficha conserva exactamente el espacio de resultado V70. Hasta reconciliar TREP con este centro no se publica ganador, participación, margen ni cobertura de actas.</p></article> : null}</div>
        </div>
      </section>

      <section className="section electoral-depth exportable"><div className="section-head"><div><p className="eyebrow">LECTURA ELECTORAL MUNICIPAL</p><h2>Corporación Municipal 2023</h2></div><p>La lectura municipal se publica con el universo oficial disponible; el ranking completo por organización se incorporará desde la fuente TREP validada.</p></div><div className="election-summary"><div className="election-kpis"><article><small>Liderazgo municipal</small><b>{asText(electoralMunicipality?.winner_2023) ?? "—"}</b><span>{asNumber(electoralMunicipality?.winner_votes_2023) !== undefined ? `${fmt.format(asNumber(electoralMunicipality?.winner_votes_2023)!)} votos` : "TSE 2023"}</span></article><article><small>Segunda fuerza</small><b>{asText(electoralMunicipality?.runner_up_2023) ?? "—"}</b><span>{asNumber(electoralMunicipality?.runner_up_votes_2023) !== undefined ? `${fmt.format(asNumber(electoralMunicipality?.runner_up_votes_2023)!)} votos` : "TSE 2023"}</span></article><article><small>Margen</small><b>{asNumber(electoralMunicipality?.margin_votes_2023) !== undefined ? fmt.format(asNumber(electoralMunicipality?.margin_votes_2023)!) : "—"}</b><span>votos frente al segundo lugar</span></article><article><small>Organizaciones</small><b>{asNumber(electoralMunicipality?.organizations_2023) ?? "—"}</b><span>competencia registrada</span></article><article><small>Padrón oficial 2023</small><b>{registered2023 !== undefined ? fmt.format(registered2023) : "—"}</b><span>universo municipal TSE</span></article></div></div><p className="preliminary-note">RADAR conserva separados los resultados municipales, la logística de centros/JRV y la geolocalización. Ningún dato faltante se convierte en cero.</p></section>

      <section id="historico" className="section historical-section exportable"><div className="section-head"><div><p className="eyebrow">HISTÓRICO ELECTORAL MUNICIPAL · TSE</p><h2>Cuatro elecciones, una trayectoria política</h2></div><p>La estructura V70 se conserva mientras RADAR completa cada detalle histórico desde las memorias oficiales, sin rellenar vacíos por inferencia.</p></div><div className="history-tabs" role="tablist" aria-label="Año electoral">{[2011,2015,2019,2023].map((year) => { const key = `winner_${year}`; const winner = asText(electoralMunicipality?.[key]); return <button key={year} className={year === 2023 ? "active" : ""} type="button"><b>{year}</b><span>{winner ?? "En validación"}</span></button>; })}</div><div className="history-timeline">{[2011,2015,2019,2023].map((year,index) => { const winner = asText(electoralMunicipality?.[`winner_${year}`]); return <article key={year}><i/><small>{year}</small><b>{winner ?? "—"}</b><span>Memoria TSE</span>{index < 3 ? <em>→</em> : null}</article>; })}</div></section>

      <section className="section"><div className="section-head"><div><p className="eyebrow">EXPEDIENTE MUNICIPAL 360</p><h2>Lo que define el municipio</h2></div><p>Lectura ejecutiva adicional aprobada para el escalamiento nacional. Complementa V70; no sustituye ninguna sección del piloto.</p></div><div className="module-card-grid canonical-module-grid">{baseProfile?.modules.filter((module) => ["territorio","educacion","salud","finanzas","obras"].includes(module.id)).map((module) => <article key={module.id}><h2>{module.title}</h2><p>{module.summary}</p>{module.metrics.slice(0,6).map((metric) => <div className="canonical-metric" key={metric.label}><b>{metric.value}</b><span>{metric.label} · {metric.detail}</span></div>)}</article>)}</div></section>
    </div>
  </main>;
}

export function MunicipalDashboardV70Golden() {
  const { municipalityCode, section } = useParams();
  if (section !== "inteligencia") return <MunicipalDashboardV70Runtime />;
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}><GoldenIntelligenceShell /></MunicipalityProvider>;
}
