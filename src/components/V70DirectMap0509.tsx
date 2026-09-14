import { useEffect, useLayoutEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70OperationalMap } from "./V70OperationalMap";

type RadarTheme = "light" | "dark";
type RadarTextSize = "normal" | "large";

const sections = [
  ["⌂", "Inicio", "inicio"],
  ["◎", "Inteligencia Municipal", "inteligencia"],
  ["◇", "Estrategia", "estrategia"],
  ["♙", "Directorio", "directorio"],
  ["▥", "Agenda", "agenda"],
  ["⌖", "Mapa Inteligente", "mapa"],
  ["▤", "Día D", "dia-d"],
  ["▣", "Recursos", "recursos"],
  ["◒", "Pulso Electoral", "pulso"],
  ["✦", "IA RADAR", "ia-radar"],
  ["⚙", "Configuración", "configuracion"],
] as const;

function routeFor(code: string, section: string) {
  return section === "inicio" ? `/municipio/${code}` : `/municipio/${code}/${section}`;
}

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

function DirectMapShell() {
  const { municipality_code } = useMunicipalityContext();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { theme, textSize, toggleTheme, increaseTextSize } = useRadarPreferences();

  useEffect(() => {
    setOpen(false);
    setProfileOpen(false);
    window.scrollTo(0, 0);
  }, [municipality_code]);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("radar-sidebar") === "collapsed");
  }, []);

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("radar-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return <div className={`portal-shell ${collapsed ? "sidebar-is-collapsed" : ""}`} data-municipality-code={municipality_code}>
    <aside className={`portal-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src="/brand/radar-electoral-isotipo.svg" alt="RADAR" /></div></div>
      <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"}>{collapsed ? "›" : "‹"}</button>
      <nav>{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(municipality_code, slug)} className={slug === "mapa" ? "active" : ""} onClick={() => setOpen(false)}><span>{icon}</span><b>{label}</b></Link>)}</nav>
      <div className="sidebar-account">
        <button type="button" onClick={() => setProfileOpen((value) => !value)}><i>CM</i><span><b>Carlos Mencos</b><small>Dirección de campaña</small></span><em>⌄</em></button>
        {profileOpen ? <div className="account-menu"><b>San José / Puerto San José · Escuintla</b><span>Cuenta del municipio</span><Link to="/">Cambiar municipio</Link></div> : null}
      </div>
    </aside>
    <button className={`nav-scrim ${open ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setOpen(false)} />
    <main className="portal-main module-page">
      <header className="portal-topbar">
        <button className="mobile-menu" type="button" onClick={() => setOpen(true)}>☰</button>
        <img className="topbar-mark" src="/brand/radar-isotipo.svg" alt="" aria-hidden="true" />
        <div><small>TERRITORIO Y OPERACIÓN</small><b>San José / Puerto San José · Escuintla</b></div>
        <div className="top-actions">
          <button className="print-top-action" type="button" onClick={() => setReportOpen(true)}><span className="control-icon" aria-hidden="true">⇩</span><span className="control-label">Reporte PDF</span></button>
          <button className="text-size-action" type="button" onClick={increaseTextSize} title="Cambiar tamaño del texto" aria-label={`Tamaño de texto ${textSize === "large" ? "cómodo" : "compacto"}`}>A<span>A</span></button>
          <button className="theme-switch" type="button" onClick={toggleTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}><span className="control-icon" aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span><span className="control-label">{theme === "dark" ? "Claro" : "Oscuro"}</span></button>
          <span className="pilot">Municipio <b>0509</b></span><span className="country-flag" role="img" aria-label="Versión Guatemala" title="Versión Guatemala">🇬🇹</span>
        </div>
      </header>
      <V70OperationalMap />
    </main>
    {reportOpen ? <div className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="map-report-title"><div className="simple-campaign-modal canonical-report-modal"><header><div><small>REPORTE RADAR</small><h2 id="map-report-title">Reporte de San José / Puerto San José</h2></div><button type="button" onClick={() => setReportOpen(false)} aria-label="Cerrar">×</button></header><p>La exportación conserva la vista municipal autorizada y separa Data Vault de Campaign Vault.</p><footer><button type="button" onClick={() => setReportOpen(false)}>Cerrar</button><button type="button" onClick={() => window.print()}>Imprimir reporte</button></footer></div></div> : null}
  </div>;
}

export function V70DirectMap0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509") return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}><DirectMapShell /></MunicipalityProvider>;
}
