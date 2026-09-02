import { useEffect, useLayoutEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
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
  partial: "Parcial",
  pending: "Pendiente",
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
    <button className="print-top-action" type="button" onClick={onExport}>
      <span className="control-icon" aria-hidden="true">⇩</span><span className="control-label">Reporte PDF</span>
    </button>
    <button className="text-size-action" type="button" onClick={onTextSize} title="Cambiar tamaño del texto" aria-label={`Tamaño de texto ${textSizeLabel}`}>A<span>A</span></button>
    <button className="theme-switch" type="button" onClick={onTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}>
      <span className="control-icon" aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span><span className="control-label">{theme === "dark" ? "Claro" : "Oscuro"}</span>
    </button>
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
  return <section className="section-banner">
    <div className="section-banner-copy">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
    {status ? <div className="section-banner-actions"><Status state={status} /></div> : null}
  </section>;
}

function PublicHome() {
  const { consumer, municipality_name: municipality } = useMunicipalityContext();
  const profile = findMunicipalProfile(consumer.municipality.code);
  const available = consumer.modules.filter((module) => module.vault === "data" && module.state === "disponible").length;
  const today = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date()).toUpperCase();

  return <>
    <section className="command-hero home-welcome">
      <div className="home-welcome-copy">
        <h3>HOLA</h3>
        <small>CENTRO DE CONTROL ELECTORAL 2027</small>
        <h1>{municipality}</h1>
        <span className="campaign-type">Campaña Alcaldía</span>
      </div>
      <aside className="campaign-identity" aria-label="Identidad de campaña protegida">
        <div className="candidate-photo-wrap"><i aria-label="Perfil de campaña">—</i><span>PERFIL DE CAMPAÑA</span></div>
        <div className="candidate-copy">
          <small>CANDIDATO A LA ALCALDÍA</small>
          <b>Campaña no configurada</b>
          <span>Contexto municipal · {municipality}</span>
          <div className="party-signature"><span className="party-logo-button"><i>LOGO</i></span><span><small>ORGANIZACIÓN POLÍTICA</small><strong>Sesión autorizada requerida</strong></span></div>
        </div>
      </aside>
    </section>

    <section className="home-reminder-bar" aria-label="Resumen del municipio">
      <div><small>{today}</small></div>
      <div className="territory-coverage"><small>COBERTURA PÚBLICA</small><b>{available}/8</b><i>RADAR</i></div>
      <Link to={routeFor(consumer.municipality.code, "inteligencia")}>Revisar información →</Link>
    </section>

    <section className="command-kpis" aria-label="Indicadores operativos protegidos">
      <article><small>Actividades de hoy</small><b>—</b></article>
      <article><small>Compromisos abiertos</small><b>—</b></article>
      <article><small>Territorios con actividades</small><b>—</b></article>
    </section>

    <section className="slate-overview canonical-locked-slate" aria-labelledby="slate-title">
      <header><div><small>CAMPAÑA MUNICIPAL</small><h2 id="slate-title">Planilla Municipal</h2><p>Vista rápida del equipo, avance de su agenda y documentos legales</p></div></header>
      <div className="canonical-vault-notice"><span>CAMPAIGN VAULT</span><h3>Información protegida por campaña</h3><p>La estructura está lista. Los nombres, contactos, agenda y documentos solo se cargarán después de verificar campaña, rol y permisos en el servidor.</p></div>
    </section>

    <section className="home-municipality-context" aria-labelledby="municipal-context-title">
      <header><small>CONTEXTO MUNICIPAL</small><h2 id="municipal-context-title">{municipality}</h2></header>
      {profile ? <>
        <p><b>Expediente público validado.</b> Los indicadores mantienen su fuente, período y estado de cobertura; los faltantes nunca se convierten en cero.</p>
        <div>{profile.modules.slice(0, 4).map((module) => <article key={module.id}><small>{module.title.toUpperCase()}</small><b>{module.metrics[0]?.value ?? profileLabels[module.status]}</b><span>{module.metrics[0]?.label ?? module.summary}</span></article>)}</div>
      </> : <>
        <p><b>{consumer.municipality.name}, {consumer.municipality.department}.</b> La ruta municipal está activa con cobertura nacional; cada dato aparecerá únicamente al completar su validación.</p>
        <div>{consumer.modules.filter((module) => module.vault === "data").slice(0, 4).map((module) => <article key={module.id}><small>{module.label.toUpperCase()}</small><b>{labels[module.state]}</b><span>{module.state === "pendiente" ? "Información en validación." : "Cobertura según contrato 340×17."}</span></article>)}</div>
      </>}
      <Link to={routeFor(consumer.municipality.code, "inteligencia")}>Abrir Inteligencia Municipal →</Link>
    </section>
  </>;
}

function Intelligence() {
  const { consumer, municipality_name } = useMunicipalityContext();
  const profile = findMunicipalProfile(consumer.municipality.code);
  const publicModules = consumer.modules.filter((module) => module.vault === "data");
  return <>
    <SectionBanner eyebrow="DATA VAULT" title="Inteligencia Municipal" description={`${municipality_name} · información pública, cobertura y trazabilidad`} status={profile?.controlStatus === "CONTROL_VALIDADO" ? "disponible" : consumer.municipality.coverage === "pending" ? "pendiente" : "parcial"} />
    <section className="canonical-coverage-heading"><div><small>CONTRATO NACIONAL 340×17</small><h2>Cobertura pública por módulo</h2></div><p>Los vacíos permanecen explícitos.</p></section>
    <section className="module-card-grid canonical-module-grid">
      {publicModules.map((module) => {
        const detail = profile?.modules.find((item) => item.id === module.id || (module.id === "finanzas_publicas" && item.id === "finanzas"));
        return <article key={module.id}>
          <Status state={module.state} />
          <h2>{module.label}</h2>
          <p>{detail?.summary ?? (module.state === "pendiente" ? "Información en validación; RADAR no imputa valores." : "Cobertura disponible según el contrato nacional vigente.")}</p>
          {detail?.metrics.slice(0, 2).map((metric) => <div className="canonical-metric" key={metric.label}><b>{metric.value}</b><span>{metric.label} · {metric.detail}</span></div>)}
          <small className="canonical-source">{detail?.source ?? module.source ?? "Fuente pendiente"}</small>
        </article>;
      })}
    </section>
  </>;
}

function MapModule() {
  const { consumer, municipality_name } = useMunicipalityContext();
  const map = findMunicipalProfile(consumer.municipality.code)?.map;
  const territoryState = consumer.modules.find((module) => module.id === "territorio")?.state ?? "pendiente";
  return <>
    <section className="map-product-head">
      <div><small>MAPA INTELIGENTE</small><h1>{municipality_name}</h1><p>Territorio, información pública y operación autorizada en una sola vista</p></div>
      <div className="map-head-stats"><span><b>{map?.populatedPlacesWithCoordinates ?? "—"}</b> puntos validados</span><span><b>{map?.votingCenters ?? "—"}</b> centros</span><Status state={map ? "disponible" : territoryState} /></div>
    </section>
    <section className="operational-map-toolbar canonical-map-toolbar">
      <label className="map-toolbar-search"><span className="map-search"><input type="search" placeholder={`Buscar en ${municipality_name}`} aria-label="Buscar territorio" /></span></label>
      <button type="button">Capas</button><button type="button">Más filtros</button><button type="button" disabled>+ Nueva actividad</button>
    </section>
    <section className="smart-map-shell map-v3 canonical-public-map">
      <div className="map-stage">
        {map ? <iframe className="smart-map-canvas" title={`Mapa público de ${municipality_name}, ${consumer.municipality.department}`} loading="lazy" src={map.embedUrl} /> : <div className="smart-map-canvas canonical-map-pending"><span>{labels[territoryState].toUpperCase()}</span><h2>Cartografía municipal en validación</h2><p>RADAR no publicará puntos ni agregados hasta comprobar su correspondencia con {consumer.municipality.name}.</p></div>}
        <div className="map-boundary-note">Municipio {consumer.municipality.code} · contexto limitado</div>
        <div className="map-privacy"><b>VISTA PÚBLICA</b><span>Las capas de campaña requieren sesión autorizada.</span></div>
      </div>
    </section>
  </>;
}

function ProtectedModule({ title, eyebrow }: { title: string; eyebrow: string }) {
  const { consumer, municipality_name } = useMunicipalityContext();
  return <>
    <SectionBanner eyebrow={eyebrow} title={title} description={`${municipality_name} · módulo operativo de campaña`} status="no_publicado" />
    <section className="canonical-protected-page">
      <div className="canonical-lockmark" aria-hidden="true">◇</div>
      <small>CAMPAIGN VAULT</small>
      <h2>Acceso protegido por municipio y campaña</h2>
      <p>La interfaz y el módulo están preparados, pero la vista pública no carga contactos, estrategia, agenda, fiscales, incidencias ni otros registros privados.</p>
      <dl>
        <div><dt>Municipio</dt><dd>{consumer.municipality.code} · {municipality_name}</dd></div>
        <div><dt>Campaña</dt><dd>{consumer.context.campaign_id}</dd></div>
        <div><dt>Rol</dt><dd>{consumer.context.user_role}</dd></div>
        <div><dt>Permisos</dt><dd>{consumer.context.permissions.join(", ")}</dd></div>
      </dl>
    </section>
  </>;
}

export function MunicipalDashboard() {
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

  useEffect(() => {
    setOpen(false);
    setProfileOpen(false);
    window.scrollTo(0, 0);
  }, [active, municipality_code]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("radar-sidebar") === "collapsed");
  }, []);

  const selected = sections.find(([, , slug]) => slug === active);
  if (!selected) return <Navigate to={`/municipio/${consumer.municipality.code}`} replace />;

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("radar-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  const title = selected[1];
  const eyebrow = selected[3];
  const name = `${municipality_name} · ${department_name}`;

  return <div className={`portal-shell ${collapsed ? "sidebar-is-collapsed" : ""}`} data-municipality-code={municipality_code} data-campaign-id={campaign_id} data-user-role={user_role} data-permissions={permissions.join(",")}>
    <aside className={`portal-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src="/brand/radar-electoral-isotipo.svg" alt="RADAR" /></div></div>
      <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"}>{collapsed ? "›" : "‹"}</button>
      <nav>{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(consumer.municipality.code, slug)} className={active === slug ? "active" : ""} onClick={() => setOpen(false)}><span>{icon}</span><b>{label}</b></Link>)}</nav>
      <div className="sidebar-account">
        <button type="button" onClick={() => setProfileOpen((value) => !value)}><i>GT</i><span><b>Vista pública</b><small>{consumer.municipality.code} · Sin datos privados</small></span><em>⌄</em></button>
        {profileOpen ? <div className="account-menu"><b>{name}</b><span>Contexto público nacional</span><Link to="/">Cambiar municipio</Link></div> : null}
      </div>
    </aside>
    <button className={`nav-scrim ${open ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setOpen(false)} />
    <main className="portal-main module-page">
      <header className="portal-topbar">
        <button className="mobile-menu" type="button" onClick={() => setOpen(true)}>☰</button>
        <img className="topbar-mark" src="/brand/radar-isotipo.svg" alt="" aria-hidden="true" />
        <div><small>{eyebrow}</small><b>{name}</b></div>
        <PortalControls theme={theme} textSize={textSize} onExport={() => setReportOpen(true)} onTextSize={increaseTextSize} onTheme={toggleTheme} />
      </header>
      {active === "inicio" ? <PublicHome /> : active === "inteligencia" ? <Intelligence /> : active === "mapa" ? <MapModule /> : <ProtectedModule title={title} eyebrow={eyebrow} />}
    </main>
    {reportOpen ? <div className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="public-report-title"><div className="simple-campaign-modal canonical-report-modal"><header><div><small>REPORTE RADAR</small><h2 id="public-report-title">Reporte de {municipality_name}</h2></div><button type="button" onClick={() => setReportOpen(false)} aria-label="Cerrar">×</button></header><p>La exportación pública incluirá únicamente información autorizada del Data Vault. Los reportes operativos requieren una sesión de campaña válida.</p><footer><button type="button" onClick={() => setReportOpen(false)}>Cerrar</button><button type="button" onClick={() => window.print()}>Imprimir vista pública</button></footer></div></div> : null}
  </div>;
}
