import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { V70DirectIntelligenceExport0509 } from "./V70DirectIntelligenceExport0509";
import { V70DirectModalEscape } from "./V70DirectModalEscape";
import { V70DirectReportBuilder } from "./V70DirectReportBuilder";

type RadarTheme = "light" | "dark";
type RadarTextSize = "normal" | "large";
type SectionSlug = "inicio" | "inteligencia" | "estrategia" | "directorio" | "agenda" | "mapa" | "dia-d" | "recursos" | "pulso" | "ia-radar" | "configuracion";
type Props = { active: SectionSlug; eyebrow: string; topbarTitle: string; accountRole?: string; children: ReactNode; dayDNext?: boolean };

const sections: ReadonlyArray<readonly [string, string, SectionSlug]> = [
  ["⌂", "Inicio", "inicio"], ["◎", "Inteligencia Municipal", "inteligencia"], ["◇", "Estrategia", "estrategia"],
  ["♙", "Directorio", "directorio"], ["▥", "Agenda", "agenda"], ["⌖", "Mapa Inteligente", "mapa"],
  ["▤", "Día D", "dia-d"], ["▣", "Recursos", "recursos"], ["◒", "Pulso Electoral", "pulso"],
  ["✦", "IA RADAR", "ia-radar"], ["⚙", "Configuración", "configuracion"],
];

function routeFor(code: string, section: SectionSlug) { return section === "inicio" ? `/municipio/${code}` : `/municipio/${code}/${section}`; }
function canonicalAsset(path: string) { const base = import.meta.env.BASE_URL || "/"; return `${base}${path.replace(/^\//, "")}`; }

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
  function toggleTheme() { const next: RadarTheme = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem("radar-theme", next); }
  function increaseTextSize() { const next: RadarTextSize = textSize === "normal" ? "large" : "normal"; setTextSize(next); document.documentElement.dataset.textSize = next; window.localStorage.setItem("radar-text-size-v3", next); }
  return { theme, textSize, toggleTheme, increaseTextSize };
}

export function V70DirectShell0509({ active, eyebrow, topbarTitle, accountRole = "Dirección de campaña", children, dayDNext = false }: Props) {
  const { municipality_code, campaign_id, user_role, permissions } = useMunicipalityContext();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [userPhoto, setUserPhoto] = useState("");
  const { theme, textSize, toggleTheme, increaseTextSize } = useRadarPreferences();

  useEffect(() => { setOpen(false); setProfileOpen(false); setReportOpen(false); window.scrollTo(0, 0); }, [active, municipality_code]);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("radar-sidebar") === "collapsed");
    const syncPhoto = () => setUserPhoto(window.localStorage.getItem("radar-user-photo-v2") || "");
    syncPhoto();
    window.addEventListener("radar-profile-updated", syncPhoto);
    return () => window.removeEventListener("radar-profile-updated", syncPhoto);
  }, []);

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("radar-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  const userLabel = "Carlos Mencos";
  const avatar = userPhoto ? <img src={userPhoto} alt="" /> : "CM";
  const accountMenu = <div className="account-menu"><b>{userLabel}</b><span>Sesión protegida</span><a href="/signout-with-chatgpt?return_to=%2F">Cerrar sesión</a></div>;
  const intelligenceExport = active === "inteligencia" ? <V70DirectIntelligenceExport0509 open={reportOpen} onOpen={() => setReportOpen(true)} onClose={() => setReportOpen(false)} /> : null;

  const controls = <div className="top-actions">
    <button className="print-top-action" type="button" onClick={() => setReportOpen(true)}><span className="control-icon" aria-hidden="true">⇩</span><span className="control-label">Reporte PDF</span></button>
    <button className="text-size-action" type="button" onClick={increaseTextSize} title="Cambiar tamaño del texto" aria-label={`Tamaño de texto ${textSize === "large" ? "cómodo" : "compacto"}`}>A<span>A</span></button>
    <button className="theme-switch" type="button" onClick={toggleTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}><span className="control-icon" aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span><span className="control-label">{theme === "dark" ? "Claro" : "Oscuro"}</span></button>
    <span className="pilot">Municipio <b>0509</b></span><span className="country-flag" role="img" aria-label="Versión Guatemala" title="Versión Guatemala">🇬🇹</span>
  </div>;

  if (active === "inteligencia") {
    return <main id="inicio" className={`portal-shell ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      <button className={`nav-scrim ${open ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setOpen(false)} />
      <aside className={`portal-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src={canonicalAsset("/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg")} alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src={canonicalAsset("/brand/radar-electoral-isotipo.svg")} alt="RADAR" /></div></div>
        <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"}>{collapsed ? "›" : "‹"}</button>
        <nav aria-label="Navegación principal">{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(municipality_code, slug)} className={active === slug ? "active" : ""} onClick={() => setOpen(false)}><span>{icon}</span><b>{label}</b>{slug === "dia-d" && dayDNext ? <small>PRÓXIMO</small> : null}</Link>)}</nav>
        <div id="cuenta" className="sidebar-account">{profileOpen ? accountMenu : null}<button type="button" onClick={() => setProfileOpen((value) => !value)}><i>{avatar}</i><span><b>{userLabel}</b><small>{accountRole}</small></span><em>⌄</em></button></div>
      </aside>
      <div className="portal-main">
        <header className="portal-topbar"><button className="mobile-menu" type="button" aria-label="Abrir menú" onClick={() => setOpen(true)}>☰</button><img className="topbar-mark" src={canonicalAsset("/brand/radar-isotipo.svg")} alt="" aria-hidden="true" /><div><small>{eyebrow}</small><b>{topbarTitle}</b></div>{controls}</header>
        {children}
      </div>
      {intelligenceExport}
    </main>;
  }

  return <div className={`portal-shell ${collapsed ? "sidebar-is-collapsed" : ""}`} data-municipality-code={municipality_code} data-campaign-id={campaign_id ?? ""} data-user-role={user_role} data-permissions={permissions.join(",")}>
    <V70DirectModalEscape />
    <aside className={`portal-sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-logo"><div className="radar-brand"><img className="sidebar-logo-expanded" src={canonicalAsset("/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg")} alt="RADAR Electoral" /><img className="sidebar-logo-collapsed" src={canonicalAsset("/brand/radar-electoral-isotipo.svg")} alt="RADAR" /></div></div>
      <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"}>{collapsed ? "›" : "‹"}</button>
      <nav>{sections.map(([icon, label, slug]) => <Link key={slug} to={routeFor(municipality_code, slug)} className={active === slug ? "active" : ""} onClick={() => setOpen(false)}><span>{icon}</span><b>{label}</b>{slug === "dia-d" && dayDNext ? <small>PRÓXIMO</small> : null}</Link>)}</nav>
      <div className="sidebar-account"><button type="button" onClick={() => setProfileOpen((value) => !value)}><i>{avatar}</i><span><b>{userLabel}</b><small>{accountRole}</small></span><em>⌄</em></button>{profileOpen ? accountMenu : null}</div>
    </aside>
    <button className={`nav-scrim ${open ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setOpen(false)} />
    <main className="portal-main module-page"><header className="portal-topbar"><button className="mobile-menu" type="button" onClick={() => setOpen(true)}>☰</button><img className="topbar-mark" src={canonicalAsset("/brand/radar-isotipo.svg")} alt="" aria-hidden="true" /><div><small>{eyebrow}</small><b>{topbarTitle}</b></div>{controls}</header>{children}</main>
    {reportOpen ? <V70DirectReportBuilder section={active} onClose={() => setReportOpen(false)} /> : null}
  </div>;
}
