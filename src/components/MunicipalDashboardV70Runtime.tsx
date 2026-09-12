import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { getInstalledRadarGeoBundle, getInstalledRadarRuntime } from "../data/radarRuntimeCache";
import type { GeoFeatureRecord } from "../data/radarRuntime";
import type { AvailabilityState } from "../types/radar";

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

const labels: Record<AvailabilityState, string> = {
  disponible: "Disponible",
  parcial: "Parcial",
  pendiente: "Pendiente",
  no_publicado: "No publicado",
};

const profileLabels = {
  validated: "Disponible",
  partial: "Cobertura oficial",
  pending: "En incorporación",
} as const;

type RadarTheme = "light" | "dark";
type RadarTextSize = "normal" | "large";

function useRadarPreferences() {
  const [theme, setTheme] = useState<RadarTheme>("light");
  const [textSize, setTextSize] = useState<RadarTextSize>("normal");

  useLayoutEffect(() => {
    const savedTheme = window.localStorage.getItem("radar-theme");
    const savedTextSize = window.localStorage.getItem("radar-text-size-v3");
    const initialTheme: RadarTheme = savedTheme === "dark" ? "dark" : "light";
    const initialTextSize: RadarTextSize = savedTextSize === "large" ? "large" : "normal";
    document.documentElement.dataset.theme = initialTheme;
    document.documentElement.dataset.textSize = initialTextSize;
    window.localStorage.setItem("radar-text-size-v3", initialTextSize);
    setTheme(initialTheme);
    setTextSize(initialTextSize);
  }, []);

  function toggleTheme() {
    const next: RadarTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("radar-theme", next);
  }

  function increaseTextSize() {
    const next: RadarTextSize = textSize === "normal" ? "large" : "normal";
    setTextSize(next);
    document.documentElement.dataset.textSize = next;
    window.localStorage.setItem("radar-text-size-v3", next);
  }

  return { theme, textSize, toggleTheme, increaseTextSize };
}

type PortalControlsProps = {
  theme: RadarTheme;
  textSize: RadarTextSize;
  onExport: () => void;
  onTextSize: () => void;
  onTheme: () => void;
};

function PortalControls({ theme, textSize, onExport, onTextSize, onTheme }: PortalControlsProps) {
  const { municipality_code } = useMunicipalityContext();
  const textSizeLabel = textSize === "large" ? "cómodo" : "compacto";
  return <div className="top-actions">
    <button className="print-top-action" type="button" onClick={onExport}><span className="control-icon" aria-hidden="true">⇩</span><span className="control-label">Reporte PDF</span></button>
    <button className="text-size-action" type="button" onClick={onTextSize} title="Cambiar tamaño del texto" aria-label={`Tamaño de texto ${textSizeLabel}`}>A<span>A</span></button>
    <button className="theme-switch" type="button" onClick={onTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}><span className="control-icon" aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span><span className="control-label">{theme === "dark" ? "Claro" : "Oscuro"}</span></button>
    <span className="pilot">Municipio <b>{municipality_code}</b></span>
    <span className="country-flag" role="img" aria-label="Versión Guatemala" title="Versión Guatemala">🇬🇹</span>
  </div>;
}

function routeFor(code: string, section: string) {
  return section === "inicio" ? `/municipio/${code}` : `/municipio/${code}/${section}`;
}

function Status({ state }: { state: AvailabilityState }) {
  return <span className={`canonical-state canonical-state--${state}`}>{labels[state]}</span>;
}

function SectionBanner({ eyebrow, title, description, status }: { eyebrow: string; title: string; description: string; status?: AvailabilityState }) {
  return <section className="section-banner"><div className="section-banner-copy"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{status ? <div className="section-banner-actions"><Status state={status} /></div> : null}</section>;
}

function numberFromText(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function PublicHome() {
  const { consumer, municipality_name: municipality } = useMunicipalityContext();
  const profile = findMunicipalProfile(consumer.municipality.code);
  const runtime = getInstalledRadarRuntime(consumer.municipality.code);
  const available = runtime?.layers.length ?? consumer.modules.filter((module) => module.vault === "data" && module.state === "disponible").length;
  const today = new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase();

  return <>
    <section className="command-hero home-welcome">
      <div className="home-welcome-copy"><h3>HOLA</h3><small>CENTRO DE CONTROL ELECTORAL 2027</small><h1>{municipality}</h1><span className="campaign-type">Campaña Alcaldía</span></div>
      <aside className="campaign-identity" aria-label="Identidad de campaña"><div className="candidate-photo-wrap"><i aria-label="Perfil de campaña">—</i><span>PERFIL DE CAMPAÑA</span></div><div className="candidate-copy"><small>CANDIDATO A LA ALCALDÍA</small><b>Campaña no configurada</b><span>Contexto municipal · {municipality}</span><div className="party-signature"><span className="party-logo-button"><i>LOGO</i></span><span><small>ORGANIZACIÓN POLÍTICA</small><strong>Campaign Vault listo para asociar</strong></span></div></div></aside>
    </section>
    <section className="home-reminder-bar" aria-label="Resumen del municipio"><div><small>{today}</small></div><div className="territory-coverage"><small>DATA VAULT MUNICIPAL</small><b>{available}/16</b><i>RADAR</i></div><Link to={routeFor(consumer.municipality.code, "inteligencia")}>Revisar inteligencia →</Link></section>
    <section className="command-kpis" aria-label="Indicadores operativos de campaña"><article><small>Actividades de hoy</small><b>—</b></article><article><small>Compromisos abiertos</small><b>—</b></article><article><small>Territorios con actividades</small><b>—</b></article></section>
    <section className="slate-overview canonical-locked-slate" aria-labelledby="slate-title"><header><div><small>CAMPAÑA MUNICIPAL</small><h2 id="slate-title">Planilla Municipal</h2><p>Vista rápida del equipo, avance de su agenda y documentos legales</p></div></header><div className="canonical-vault-notice"><span>CAMPAIGN VAULT</span><h3>Operación de campaña separada del Data Vault</h3><p>La inteligencia municipal ya está disponible. Equipo, contactos, agenda y documentos se activan al asociar una campaña autorizada.</p></div></section>
    <section className="home-municipality-context" aria-labelledby="municipal-context-title"><header><small>CONTEXTO MUNICIPAL</small><h2 id="municipal-context-title">{municipality}</h2></header>{profile ? <><p><b>Expediente municipal conectado.</b> Cada indicador conserva su fuente, período y universo; RADAR no convierte faltantes en cero.</p><div>{profile.modules.slice(0, 4).map((module) => <article key={module.id}><small>{module.title.toUpperCase()}</small><b>{module.metrics[0]?.value ?? profileLabels[module.status]}</b><span>{module.metrics[0]?.label ?? module.summary}</span></article>)}</div></> : null}<Link to={routeFor(consumer.municipality.code, "inteligencia")}>Abrir Inteligencia Municipal →</Link></section>
  </>;
}

function Intelligence() {
  const { consumer, municipality_name, department_name } = useMunicipalityContext();
  const profile = findMunicipalProfile(consumer.municipality.code);
  const intelligence = profile?.intelligence;
  const publicModules = consumer.modules.filter((module) => module.vault === "data");
  const overallState: AvailabilityState = profile?.controlStatus === "CONTROL_VALIDADO" ? "disponible" : consumer.municipality.coverage === "pending" ? "pendiente" : "parcial";
  const women = numberFromText(intelligence?.voterWomen);
  const men = numberFromText(intelligence?.voterMen);
  const sexTotal = (women ?? 0) + (men ?? 0);
  const womenShare = sexTotal > 0 && women !== undefined ? women / sexTotal * 100 : 0;
  const menShare = sexTotal > 0 && men !== undefined ? men / sexTotal * 100 : 0;
  const sexGap = women !== undefined && men !== undefined ? Math.abs(women - men) : undefined;
  const maxAgeShare = Math.max(...(intelligence?.ages.map((item) => item.share) ?? [1]), 1);

  const coverage = <details className="canonical-coverage-secondary" open><summary><span><small>EXPEDIENTE MUNICIPAL 360</small><b>Capas de inteligencia y trazabilidad</b></span><Status state={overallState} /></summary><section className="module-card-grid canonical-module-grid">{publicModules.map((module) => { const detail = profile?.modules.find((item) => item.id === module.ui_profile_id); return <article key={module.id}><Status state={module.state === "pendiente" && detail?.metrics.length ? "disponible" : module.state} /><h2>{module.label}</h2><p>{detail?.summary ?? "Cobertura oficial conectada al expediente municipal."}</p>{detail?.metrics.slice(0, 3).map((item) => <div className="canonical-metric" key={item.label}><b>{item.value}</b><span>{item.label} · {item.detail}</span></div>)}<small className="canonical-source">{detail?.source ?? module.source ?? "RADAR Data Vault"}</small></article>; })}</section></details>;

  return <>
    <SectionBanner eyebrow={`EXPEDIENTE MUNICIPAL 360 · ${department_name.toUpperCase()} — ${municipality_name.toUpperCase()}`} title="Inteligencia Municipal" description="Fotografía estratégica del municipio para definir mensajes y prioridades" status={overallState} />
    {intelligence ? <>
      <section className="kpis" aria-label="Indicadores principales">
        <article><small>Población proyectada 2026</small><b>{intelligence.populationProjection || "—"}</b><em>INE · proyección oficial al 30 de junio</em></article>
        <article><small>Padrón electoral activo 2026</small><b>{intelligence.voterRegister}</b><em>{intelligence.voterWomen ? `${intelligence.voterWomen} mujeres` : "TSE"}{intelligence.voterMen ? ` · ${intelligence.voterMen} hombres` : ""}</em></article>
        <article><small>Centros electorales geolocalizados</small><b>{intelligence.votingCenters || "—"} <i>centros</i></b><em>{intelligence.votingBoards ? `${intelligence.votingBoards} JRV · ` : ""}TSE 2023</em></article>
        <article><small>Organización territorial</small><b>{intelligence.communityRecords || "—"} <i>comunidades</i></b><em>{intelligence.territorialGroups ? `${intelligence.territorialGroups} agrupaciones territoriales` : "Núcleo electoral municipal"}</em></article>
      </section>
      <section className="section electorate-profile">
        <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO</p><h2>Quiénes pueden votar hoy</h2></div><p>RADAR mantiene separados padrón activo, padrón detallado, Censo y proyecciones para evitar cruces de universos incompatibles.</p></div>
        <div className="electorate-hero">
          <article className="register-total"><span>PADRÓN ACTIVO 2026</span><b>{intelligence.voterRegister}</b><p>Corte oficial: {intelligence.registerCut || "2026"}</p>{intelligence.registerGrowth ? <div><strong>{intelligence.registerGrowth}</strong><small>personas frente al padrón oficial 2023<br />variación: {intelligence.registerGrowthRate}</small></div> : null}</article>
          {women !== undefined && men !== undefined ? <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span>{sexGap !== undefined ? <b>Brecha: {new Intl.NumberFormat("es-GT").format(sexGap)}</b> : null}</div><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{intelligence.voterWomen}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{intelligence.voterMen}</b><small>{menShare.toFixed(1)}%</small></span></div></article> : null}
          {intelligence.literacyRate ? <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{intelligence.literacyRate}</b>{intelligence.literatePeople ? <small>{intelligence.literatePeople} personas</small> : null}</div><div className="literacy-detail">{intelligence.womenLiteracy ? <span>Mujeres <b>{intelligence.womenLiteracy}</b></span> : null}{intelligence.menLiteracy ? <span>Hombres <b>{intelligence.menLiteracy}</b></span> : null}{intelligence.literacyUnregistered ? <span>Sin alfabetismo registrado <b>{intelligence.literacyUnregistered}</b></span> : null}</div></article> : null}
        </div>
        <div className="age-and-territory">
          {intelligence.ages.length ? <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>Padrón detallado · universo separado</b></div><div className="age-bars">{intelligence.ages.map((item) => <div key={item.label}><span>{item.label}</span><i><em style={{ width: `${item.share / maxAgeShare * 100}%` }} /></i><b>{item.value}</b><small>{item.share.toFixed(1)}%</small></div>)}</div></article> : null}
          <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{intelligence.voterRegister}</b><small>Ciudadanos empadronados activos.</small></div>{intelligence.censusPopulation ? <div className="universe-block census"><span>INE · CENSO 2018</span><b>{intelligence.censusPopulation}</b><div className="rural-bar"><i style={{ width: `${intelligence.censusUrbanShare}%` }} /><em style={{ width: `${intelligence.censusRuralShare}%` }} /></div><p><strong>{intelligence.censusUrban} urbanos · {intelligence.censusUrbanShare.toFixed(1)}%</strong><strong>{intelligence.censusRural} rurales · {intelligence.censusRuralShare.toFixed(1)}%</strong></p></div> : null}{intelligence.populationProjection ? <div className="universe-block projection"><span>INE · PROYECCIÓN 2026</span><b>{intelligence.populationProjection}</b><small>{intelligence.projectionMen ? `${intelligence.projectionMen} hombres` : ""}{intelligence.projectionMen && intelligence.projectionWomen ? " · " : ""}{intelligence.projectionWomen ? `${intelligence.projectionWomen} mujeres` : ""}. Proyección poblacional, no padrón.</small></div> : null}</article>
        </div>
        <p className="trace-note"><Status state="disponible" /> Fuentes oficiales conectadas al Data Vault. Cuando una publicación no ofrece una desagregación comparable, RADAR conserva el universo disponible y lo documenta en trazabilidad en lugar de imputarlo.</p>
      </section>
    </> : null}
    {coverage}
  </>;
}

const featurePresentation: Record<string, { label: string; detail: string; color: string }> = {
  populated_place: { label: "Lugares poblados", detail: "INE · coordenadas publicables", color: "var(--radar-petroleo)" },
  tse_voting_center: { label: "Centros de votación", detail: "TSE 2023 · geolocalización canónica", color: "var(--radar-morado)" },
  school: { label: "Educación", detail: "establecimientos georreferenciados", color: "var(--radar-grafito)" },
  health_facility: { label: "Salud", detail: "establecimientos georreferenciados", color: "var(--radar-salvia)" },
};

function mercatorY(lat: number) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }

function RuntimeGeoOverlay({ features, activeTypes, query, bbox }: { features: GeoFeatureRecord[]; activeTypes: Set<string>; query: string; bbox: { south: number; north: number; west: number; east: number } }) {
  const latPadding = Math.max((bbox.north - bbox.south) * 0.08, 0.01);
  const lonPadding = Math.max((bbox.east - bbox.west) * 0.08, 0.01);
  const south = bbox.south - latPadding;
  const north = bbox.north + latPadding;
  const west = bbox.west - lonPadding;
  const east = bbox.east + lonPadding;
  const northY = mercatorY(north);
  const southY = mercatorY(south);
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visible = features.filter((feature) => {
    if (!activeTypes.has(feature.feature_type) || feature.latitude === null || feature.longitude === null) return false;
    if (!normalizedQuery) return true;
    const haystack = `${feature.feature_name ?? ""} ${Object.values(feature.properties ?? {}).join(" ")}`.toLocaleLowerCase("es");
    return haystack.includes(normalizedQuery);
  });
  return <svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-label="Capas geográficas RADAR" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }}>
    {visible.map((feature) => {
      const x = (feature.longitude! - west) / (east - west) * 1000;
      const y = (northY - mercatorY(feature.latitude!)) / (northY - southY) * 600;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 600) return null;
      const presentation = featurePresentation[feature.feature_type] ?? featurePresentation.populated_place;
      return <circle key={`${feature.feature_type}:${feature.source_key}`} cx={x} cy={y} r={feature.feature_type === "tse_voting_center" ? 5 : 3.5} fill={presentation.color} stroke="white" strokeWidth="1.4" opacity="0.9"><title>{feature.feature_name ?? presentation.label}</title></circle>;
    })}
  </svg>;
}

function MapModule() {
  const { consumer, municipality_name } = useMunicipalityContext();
  const map = findMunicipalProfile(consumer.municipality.code)?.map;
  const runtime = getInstalledRadarRuntime(consumer.municipality.code);
  const geoBundle = getInstalledRadarGeoBundle(consumer.municipality.code);
  const territoryState = consumer.modules.find((module) => module.layer_id === "TSE_CENTROS_GEO")?.state ?? "pendiente";
  const [satellite, setSatellite] = useState(false);
  const [query, setQuery] = useState("");
  const availableTypes = useMemo(() => Object.keys(featurePresentation).filter((type) => (geoBundle?.feature_counts[type] ?? 0) > 0), [geoBundle]);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(Object.keys(featurePresentation)));
  const toggleType = (type: string) => setActiveTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; });

  return <>
    <section className="map-product-head"><div><small>TERRITORIO Y OPERACIÓN · {municipality_name.toUpperCase()}</small><h1>Mapa Inteligente</h1><p>Territorio, infraestructura pública y centros electorales en una sola vista</p></div><div className="map-head-stats"><span><b>{geoBundle?.features.length ?? runtime?.geo.feature_total ?? 0}</b> puntos</span><span><b>{availableTypes.length}</b> capas</span><Status state={map ? "disponible" : territoryState} /></div></section>
    <section className="operational-map-toolbar"><label className="map-toolbar-search"><span className="map-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Buscar comunidad, escuela, centro de votación…" aria-label="Buscar territorio" /></span></label><label className="toolbar-select"><span>Contexto territorial</span><select aria-label="Contexto territorial" defaultValue="municipal"><option value="municipal">Municipio</option></select></label><details className="map-more-filters" open><summary>Capas <span>⌄</span></summary><div className="map-more-panel"><div className="toolbar-layer-block"><small>CAPAS VISIBLES</small><div className="smart-layers toolbar-layers">{availableTypes.map((type) => { const item = featurePresentation[type]; return <button type="button" className={activeTypes.has(type) ? "on" : ""} key={type} onClick={() => toggleType(type)}><i style={{ background: item.color }} /><span>{item.label}</span><em>{geoBundle?.feature_counts[type] ?? 0}</em></button>; })}</div></div><p className="canonical-filter-note">Las capas muestran únicamente coordenadas validadas para este municipio.</p></div></details><button type="button" className="map-new-activity" disabled title="Disponible al asociar Campaign Vault">+ Nueva actividad</button><button type="button" className="map-satellite-toggle" onClick={() => setSatellite((value) => !value)}>{satellite ? "Vista mapa" : "Vista satelital"}</button></section>
    <section className="smart-map-shell map-v3"><div className="map-stage">{map ? <><iframe className="smart-map-canvas" title={`Mapa de ${municipality_name}, ${consumer.municipality.department}`} loading="lazy" src={satellite && map.satelliteEmbedUrl ? map.satelliteEmbedUrl : map.embedUrl} />{!satellite && geoBundle && runtime?.geo.bbox ? <RuntimeGeoOverlay features={geoBundle.features} activeTypes={activeTypes} query={query} bbox={runtime.geo.bbox} /> : null}<aside className="map-electoral-priorities" style={{ zIndex: 3 }}><header><small>COBERTURA TERRITORIAL</small><div><b>Data Vault</b><span>{geoBundle?.features.length ?? runtime?.geo.feature_total ?? 0} puntos</span></div></header>{availableTypes.map((type) => { const item = featurePresentation[type]; return <button type="button" key={type} className={activeTypes.has(type) ? "on" : ""} onClick={() => toggleType(type)}><span><b>{item.label.toUpperCase()}</b><small>{item.detail}</small></span><em>{geoBundle?.feature_counts[type] ?? 0}</em></button>; })}</aside></> : <div className="smart-map-canvas canonical-map-pending"><span>{labels[territoryState].toUpperCase()}</span><h2>Contexto territorial en preparación</h2><p>RADAR habilita únicamente coordenadas que correspondan al municipio autorizado.</p></div>}<div className="map-boundary-note">Municipio {consumer.municipality.code} · Data Vault</div><div className="map-privacy"><b>CAPAS MUNICIPALES</b><span>Fuentes oficiales georreferenciadas.</span></div></div></section>
  </>;
}

function ProtectedModule({ title, eyebrow }: { title: string; eyebrow: string }) {
  const { consumer, municipality_name } = useMunicipalityContext();
  return <><SectionBanner eyebrow={eyebrow} title={title} description={`${municipality_name} · módulo operativo de campaña`} status="no_publicado" /><section className="canonical-protected-page"><div className="canonical-lockmark" aria-hidden="true">◇</div><small>CAMPAIGN VAULT</small><h2>Módulo listo para una campaña autorizada</h2><p>La inteligencia municipal funciona de forma independiente. Contactos, estrategia, agenda, fiscales, incidencias y operación se activan al asociar una campaña y sus permisos.</p><dl><div><dt>Municipio</dt><dd>{consumer.municipality.code} · {municipality_name}</dd></div><div><dt>Campaña</dt><dd>{consumer.context.campaign_id ?? "Por configurar"}</dd></div><div><dt>Rol</dt><dd>{consumer.context.user_role}</dd></div><div><dt>Permisos</dt><dd>{consumer.context.permissions.join(", ")}</dd></div></dl></section></>;
}

export function MunicipalDashboardV70Runtime() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}><MunicipalDashboardShell /></MunicipalityProvider>;
}

function MunicipalDashboardShell() {
  const { section } = useParams();
  const { consumer, municipality_code, municipality_name, department_name, campaign_id, user_role, permissions } = useMunicipalityContext();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { theme, textSize, toggleTheme, increaseTextSize } = useRadarPreferences();
  const active = section ?? "inicio";

  useEffect(() => { setOpen(false); setProfileOpen(false); window.scrollTo(0, 0); }, [active, municipality_code]);
  useEffect(() => { setCollapsed(window.localStorage.getItem("radar-sidebar") === "collapsed"); }, []);
  const selected = sections.find(([, , slug]) => slug === active);
  if (!selected) return <Navigate to={`/municipio/${consumer.municipality.code}`} replace />;
  function toggleSidebar() { setCollapsed((value) => { const next = !value; window.localStorage.setItem("radar-sidebar", next ? "collapsed" : "expanded"); return next; }); }
  const title = selected[1];
  const eyebrow = selected[3];
  const name = `${municipality_name} · ${department_name}`;
  const accountLabel = user_role === "platform_admin" ? "Acceso nacional" : "Sesión autorizada";
  const accountDetail = user_role === "platform_admin" ? `${municipality_code} · Data Vault` : `${municipality_code} · ${user_role}`;

  return <div className={`portal-shell ${collapsed ? "sidebar-is-collapsed" : ""}`} data-municipality-code={municipality_code} data-campaign-id={campaign_id ?? ""} data-user-role={user_role} data-permissions={permissions.join(",")}>
    <aside className={`portal-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}><div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src="/brand/radar-electoral-isotipo.svg" alt="RADAR" /></div></div><button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"}>{collapsed ? "›" : "‹"}</button><nav>{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(consumer.municipality.code, slug)} className={active === slug ? "active" : ""} onClick={() => setOpen(false)}><span>{icon}</span><b>{label}</b></Link>)}</nav><div className="sidebar-account"><button type="button" onClick={() => setProfileOpen((value) => !value)}><i>GT</i><span><b>{accountLabel}</b><small>{accountDetail}</small></span><em>⌄</em></button>{profileOpen ? <div className="account-menu"><b>{name}</b><span>{user_role === "platform_admin" ? "Usuario universal · Guatemala" : "Contexto municipal autorizado"}</span><Link to="/">Cambiar municipio</Link></div> : null}</div></aside>
    <button className={`nav-scrim ${open ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setOpen(false)} />
    <main className="portal-main module-page"><header className="portal-topbar"><button className="mobile-menu" type="button" onClick={() => setOpen(true)}>☰</button><img className="topbar-mark" src="/brand/radar-isotipo.svg" alt="" aria-hidden="true" /><div><small>{eyebrow}</small><b>{name}</b></div><PortalControls theme={theme} textSize={textSize} onExport={() => setReportOpen(true)} onTextSize={increaseTextSize} onTheme={toggleTheme} /></header>{active === "inicio" ? <PublicHome /> : active === "inteligencia" ? <Intelligence /> : active === "mapa" ? <MapModule /> : <ProtectedModule title={title} eyebrow={eyebrow} />}</main>
    {reportOpen ? <div className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="public-report-title"><div className="simple-campaign-modal canonical-report-modal"><header><div><small>REPORTE RADAR</small><h2 id="public-report-title">Reporte de {municipality_name}</h2></div><button type="button" onClick={() => setReportOpen(false)} aria-label="Cerrar">×</button></header><p>La exportación incluye únicamente información autorizada del Data Vault. Los reportes operativos de Campaign Vault se habilitan al asociar una campaña.</p><footer><button type="button" onClick={() => setReportOpen(false)}>Cerrar</button><button type="button" onClick={() => window.print()}>Imprimir reporte</button></footer></div></div> : null}
  </div>;
}
