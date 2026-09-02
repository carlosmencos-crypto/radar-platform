import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import type { AvailabilityState } from "../types/radar";

const sections = [
  ["⌂", "Inicio", "inicio"], ["◎", "Inteligencia Municipal", "inteligencia"],
  ["◇", "Estrategia", "estrategia"], ["♙", "Directorio", "directorio"],
  ["▥", "Agenda", "agenda"], ["⌖", "Mapa Inteligente", "mapa"],
  ["▤", "Día D", "dia-d"], ["▣", "Recursos", "recursos"],
  ["✦", "IA RADAR", "ia-radar"], ["⚙", "Configuración", "configuracion"],
] as const;

const labels: Record<AvailabilityState, string> = {
  disponible: "Disponible", parcial: "Parcial", pendiente: "Pendiente", no_publicado: "No publicado",
};

function Status({ state }: { state: AvailabilityState }) {
  return <span className={`radar-state radar-state--${state}`}>{labels[state]}</span>;
}

function ProtectedModule({ title }: { title: string }) {
  return <section className="radar-locked">
    <div className="radar-lockmark" aria-hidden="true">◇</div>
    <span className="radar-kicker">Campaign Vault</span>
    <h2>{title}</h2>
    <p>La interfaz está lista para operar con una sesión autorizada por municipio y campaña. La demostración pública no carga ni expone información privada.</p>
    <div className="radar-context-line"><b>Acceso requerido</b><span>Rol municipal y permisos verificados por servidor</span></div>
  </section>;
}

function MapModule({ code }: { code: string }) {
  const consumer = resolveRadarConsumer(code)!;
  const isGolden = code === "0509";
  return <div className="radar-stack">
    <section className="radar-banner radar-banner--light"><div><span className="radar-kicker">Mapa Inteligente</span><h1>{isGolden ? "San José / Puerto San José" : consumer.municipality.name}</h1><p>Lectura territorial · {consumer.municipality.department}</p></div><Status state={isGolden ? "disponible" : "parcial"} /></section>
    <section className="radar-map-card">
      {isGolden ? <iframe title="Mapa de San José, Escuintla" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=-90.88%2C13.80%2C-90.68%2C13.99&layer=mapnik" /> : <div className="radar-map-empty"><span className="radar-kicker">Cobertura parcial</span><h2>Cartografía municipal en preparación</h2><p>La ruta está activa, pero RADAR no publicará puntos ni agregados hasta validar su correspondencia con el municipio.</p></div>}
      <aside><span className="radar-kicker">Capas públicas</span><h3>Cobertura territorial</h3><p><i /> Límites y referencias</p><p><i /> Centros de votación</p><p className="muted">Las capas privadas requieren sesión.</p></aside>
    </section>
  </div>;
}

function Intelligence({ code }: { code: string }) {
  const profile = findMunicipalProfile(code);
  const consumer = resolveRadarConsumer(code)!;
  return <div className="radar-stack">
    <section className="radar-banner radar-banner--light">
      <div><span className="radar-kicker">Inteligencia Municipal</span><h1>{consumer.municipality.name}</h1><p>{consumer.municipality.department} · Código {code}</p></div>
      <Status state={code === "0509" ? "disponible" : "parcial"} />
    </section>
    <section className="radar-card">
      <div className="radar-section-heading"><div><span className="radar-kicker">Data Vault</span><h2>Cobertura pública por módulo</h2></div><small>Los vacíos permanecen explícitos.</small></div>
      <div className="radar-module-grid">{consumer.modules.filter((m) => m.vault === "data").map((module) => <article key={module.id}><Status state={module.state} /><h3>{module.label}</h3><p>{module.state === "pendiente" ? "Información en validación; no se imputa ningún valor." : module.source}</p></article>)}</div>
    </section>
    {profile && <section className="radar-card"><div className="radar-section-heading"><div><span className="radar-kicker">Expediente 0509</span><h2>Indicadores validados</h2></div></div><div className="radar-module-grid">{profile.modules.slice(0, 4).map((m) => <article key={m.id}><h3>{m.title}</h3>{m.metrics.slice(0, 2).map(metric => <p key={metric.label}><b>{metric.value}</b> · {metric.label}</p>)}</article>)}</div></section>}
  </div>;
}

function Start({ code }: { code: string }) {
  const consumer = resolveRadarConsumer(code)!;
  const { municipality } = consumer;
  return <div className="radar-stack">
    <section className="radar-banner">
      <div><span className="radar-kicker">RADAR Electoral · Guatemala</span><h1>{code === "0509" ? "San José / Puerto San José" : municipality.name}</h1><p>{municipality.department} · Municipio {municipality.code}</p></div>
      <div className="radar-banner-seal"><span>R</span><small>Contexto municipal</small></div>
    </section>
    <section className="radar-kpis">
      <article><span>Cobertura</span><strong>{municipality.coverage === "complete" ? "Disponible" : "Parcial"}</strong><small>según contrato nacional</small></article>
      <article><span>Data Vault</span><strong>{consumer.modules.filter(m => m.vault === "data" && m.state === "disponible").length}</strong><small>módulos disponibles</small></article>
      <article><span>Municipio</span><strong>{municipality.code}</strong><small>{municipality.department}</small></article>
      <article><span>Campaña</span><strong>Sin iniciar</strong><small>Campaign Vault protegido</small></article>
    </section>
    <section className="radar-card radar-welcome"><div><span className="radar-kicker">Centro de campaña</span><h2>Un solo tablero, contexto municipal persistente</h2><p>La información oficial disponible se resuelve por municipio. Los módulos operativos se habilitan únicamente al autenticar una campaña y sus permisos.</p></div><Link to={`/municipio/${code}/inteligencia`}>Abrir Inteligencia Municipal →</Link></section>
  </div>;
}

export function MunicipalDashboard() {
  const { municipalityCode, section } = useParams();
  const consumer = useMemo(() => resolveRadarConsumer(municipalityCode), [municipalityCode]);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = section ?? "inicio";
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [active, municipalityCode]);
  if (!consumer) return <Navigate to="/" replace />;
  if (!sections.some(([, , slug]) => slug === active)) return <Navigate to={`/municipio/${consumer.municipality.code}`} replace />;
  const title = sections.find(([, , slug]) => slug === active)?.[1] ?? "Inicio";

  return <div className="radar-shell">
    <aside className={`radar-sidebar ${menuOpen ? "is-open" : ""}`}>
      <Link className="radar-logo" to={`/municipio/${consumer.municipality.code}`}><b>R</b><span><strong>radar</strong><small>electoral</small></span></Link>
      <nav>{sections.map(([icon, label, slug]) => <Link key={slug} className={active === slug ? "active" : ""} to={slug === "inicio" ? `/municipio/${consumer.municipality.code}` : `/municipio/${consumer.municipality.code}/${slug}`}><i>{icon}</i><b>{label}</b></Link>)}</nav>
      <div className="radar-account"><i>GT</i><span><b>Vista pública</b><small>{consumer.municipality.code} · Sin datos privados</small></span></div>
    </aside>
    <button className={`radar-scrim ${menuOpen ? "visible" : ""}`} aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />
    <main className="radar-main">
      <header className="radar-topbar"><button onClick={() => setMenuOpen(true)} aria-label="Abrir menú">☰</button><div><small>{consumer.municipality.code === "0509" ? "San José / Puerto San José" : consumer.municipality.name} · {consumer.municipality.department}</small><b>{title}</b></div><Link to="/" title="Cambiar municipio" aria-label="Cambiar municipio">◎</Link></header>
      <div className="radar-content">{active === "inicio" ? <Start code={consumer.municipality.code} /> : active === "inteligencia" ? <Intelligence code={consumer.municipality.code} /> : active === "mapa" ? <MapModule code={consumer.municipality.code} /> : <ProtectedModule title={title} />}</div>
    </main>
  </div>;
}
