import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70CampaignIdentity } from "./V70CampaignIdentity";
import { V70DirectShell0509 } from "./V70DirectShell0509";

const campaignSlate = [
  ["Nombre Apellido", "Candidato a alcalde", "ALCALDE"],
  ["Nombre Apellido", "Síndico I", "SÍNDICOS"],
  ["Nombre Apellido", "Síndico II", "SÍNDICOS"],
  ["Nombre Apellido", "Síndico III", "SÍNDICOS"],
  ["Nombre Apellido", "Concejal I", "CONCEJALES"],
  ["Nombre Apellido", "Concejal II", "CONCEJALES"],
  ["Nombre Apellido", "Concejal III", "CONCEJALES"],
  ["Nombre Apellido", "Concejal IV", "CONCEJALES"],
  ["Nombre Apellido", "Concejal V", "CONCEJALES"],
  ["Nombre Apellido", "Concejal VI", "CONCEJALES"],
  ["Nombre Apellido", "Concejal VII", "CONCEJALES"],
  ["Nombre Apellido", "Concejal VIII", "CONCEJALES"],
] as const;
const priorityThemes = [
  [
    {
      title: "Acceso al agua",
      detail: "Continuidad, calidad y cobertura del servicio por comunidad.",
    },
    {
      title: "Transporte y movilidad",
      detail: "Conexión entre comunidades, casco urbano, empleo y servicios.",
    },
    {
      title: "Prevención de inundaciones",
      detail: "Drenajes, rutas críticas y respuesta en zonas expuestas.",
    },
  ],
  [
    {
      title: "Residuos",
      detail: "Recolección, disposición final y alternativas a la quema.",
    },
    {
      title: "Seguridad comunitaria",
      detail: "Prevención, iluminación y coordinación institucional.",
    },
    {
      title: "Educación media",
      detail: "Acceso a básico y diversificado para jóvenes del municipio.",
    },
  ],
] as const;
const opportunityThemes = [
  [
    {
      title: "Economía diversificada",
      detail: "Puerto, industria, turismo, pesca, comercio y agro.",
    },
    {
      title: "Conectividad estratégica",
      detail: "Posición logística y acceso a corredores nacionales.",
    },
    {
      title: "Inversión municipal",
      detail: "Capacidad para priorizar obras con impacto territorial.",
    },
  ],
  [
    {
      title: "Identidad costera",
      detail: "Turismo, cultura local y recuperación de espacios públicos.",
    },
    {
      title: "Juventud y empleo",
      detail: "Formación vinculada con la actividad portuaria e industrial.",
    },
    {
      title: "Red comunitaria",
      detail: "Organización territorial para escuchar y ejecutar mejor.",
    },
  ],
] as const;
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function SlateMember({
  member,
}: {
  member: readonly [string, string, string];
}) {
  const { municipality_code } = useMunicipalityContext();
  return (
    <article className="slate-member">
      <span className="slate-member-avatar">
        <i>{initials(member[0])}</i>
      </span>
      <span className="slate-member-identity">
        <b className="slate-member-name slate-member-name-static">
          {member[0]}
        </b>
        <em>{member[1]}</em>
      </span>
      <nav>
        <Link to={`/municipio/${municipality_code}/agenda`}>Agenda</Link>
        <Link to={`/municipio/${municipality_code}/recursos`}>Documentos</Link>
      </nav>
    </article>
  );
}
function greetingForGuatemala() {
  const hour = Number(
    new Intl.DateTimeFormat("es-GT", {
      timeZone: "America/Guatemala",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 12) return "BUENOS DÍAS";
  if (hour < 19) return "BUENAS TARDES";
  return "BUENAS NOCHES";
}
function HomeContent() {
  const { municipality_code } = useMunicipalityContext();
  const today = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const rotation = useMemo(
    () =>
      Math.abs(
        Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
            604800000,
        ),
      ) % priorityThemes.length,
    [],
  );
  const mayor = campaignSlate.filter((item) => item[2] === "ALCALDE");
  const syndics = campaignSlate.filter((item) => item[2] === "SÍNDICOS");
  const councilors = campaignSlate.filter((item) => item[2] === "CONCEJALES");
  return (
    <>
      <section className="command-hero home-welcome">
        <div className="home-welcome-copy">
          <p>{greetingForGuatemala()}, CARLOS</p>
          <small>Centro de control electoral 2027</small>
          <h1>San José / Puerto San José</h1>
          <span className="campaign-type">Campaña Alcaldía</span>
        </div>
        <V70CampaignIdentity />
      </section>
      <section
        className="home-reminder-bar"
        aria-label="Resumen de la fecha y cobertura territorial"
      >
        <div>
          <small>{today.toUpperCase()}</small>
        </div>
        <div className="territory-coverage">
          <small>TERRITORIO CUBIERTO</small>
          <b>0%</b>
          <i aria-label="Calculado con actividades geolocalizadas">RADAR</i>
        </div>
        <Link to={`/municipio/${municipality_code}/agenda`}>
          Revisar pendientes →
        </Link>
      </section>
      <section
        className="command-kpis"
        aria-label="Indicadores operativos en vivo"
      >
        <article>
          <small>Actividades de hoy</small>
          <b>0</b>
        </article>
        <article>
          <small>Compromisos abiertos</small>
          <b>0</b>
        </article>
        <article>
          <small>Territorios con actividades</small>
          <b>0</b>
        </article>
      </section>
      <section className="slate-overview" aria-labelledby="slate-title">
        <header>
          <div>
            <small>CAMPAÑA MUNICIPAL</small>
            <h2 id="slate-title">Planilla Municipal</h2>
            <p>
              Vista rápida del equipo, avance de su agenda y documentos legales
            </p>
          </div>
        </header>
        <div className="slate-groups slate-groups-compact">
          <section className="slate-group-mayor">
            <header>
              <h3>Alcalde</h3>
              <b>{mayor.length}</b>
            </header>
            <div className="slate-member-list">
              {mayor.map((member, index) => (
                <SlateMember key={`m-${index}`} member={member} />
              ))}
            </div>
          </section>
          <section className="slate-group-syndics">
            <header>
              <h3>Síndicos</h3>
              <b>{syndics.length}</b>
            </header>
            <div className="slate-member-list">
              {syndics.map((member, index) => (
                <SlateMember key={`s-${index}`} member={member} />
              ))}
            </div>
          </section>
          <section className="slate-group-councilors">
            <header>
              <h3>Concejales</h3>
              <b>{councilors.length}</b>
            </header>
            <div className="slate-member-list slate-member-list-councilors">
              {councilors.map((member, index) => (
                <SlateMember key={`c-${index}`} member={member} />
              ))}
            </div>
          </section>
        </div>
      </section>
      <section
        className="home-municipality-context"
        aria-labelledby="municipal-context-title"
      >
        <header>
          <small>CONTEXTO MUNICIPAL</small>
          <h2 id="municipal-context-title">San José</h2>
        </header>
        <p>
          <b>San José es un municipio costero, portuario e industrial</b> con
          una población proyectada de 72,156 habitantes para 2026. Su actividad
          se concentra entre el casco urbano, la zona portuaria-industrial y la
          costa; esa ventaja convive con presión sobre los servicios y alta
          exposición a inundaciones.
        </p>
        <div>
          <article>
            <small>SERVICIOS BÁSICOS</small>
            <b>Agua y residuos</b>
            <span>Brechas históricas de cobertura y manejo domiciliar.</span>
          </article>
          <article>
            <small>SALUD</small>
            <b>5 establecimientos</b>
            <span>La atención obstétrica muestra dependencia externa.</span>
          </article>
          <article>
            <small>SEGURIDAD</small>
            <b>Prevención prioritaria</b>
            <span>
              Violencia contra la mujer y seguridad vial requieren atención.
            </span>
          </article>
          <article>
            <small>EDUCACIÓN</small>
            <b>44 sedes físicas</b>
            <span>76 servicios educativos registrados en el municipio.</span>
          </article>
        </div>
        <Link to={`/municipio/${municipality_code}/inteligencia`}>
          Abrir Inteligencia Municipal →
        </Link>
      </section>
      <section
        className="home-talking-points"
        aria-labelledby="talking-points-title"
      >
        <header>
          <small>GUÍA DINÁMICA</small>
          <h2 id="talking-points-title">¿De qué hablar?</h2>
        </header>
        <div>
          <article className="priority">
            <h3>Temas prioritarios</h3>
            <p>Lo que requiere atención</p>
            <ul>
              {priorityThemes[rotation].map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="opportunity">
            <h3>Oportunidades</h3>
            <p>Fortalezas aprovechables</p>
            <ul>
              {opportunityThemes[rotation].map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  );
}
export function V70DirectHome0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="inicio"
        eyebrow="CENTRO DE MANDO"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <HomeContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
