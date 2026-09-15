import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70DirectShell0509 } from "./V70DirectShell0509";

const preliminaryElectionDate = new Date("2027-06-27T00:00:00-06:00");
const milestones = [
  {
    date: "2027-01-22",
    label: "22 ENE 2027",
    title: "Convocatoria a elecciones",
  },
  {
    date: "2027-03-28",
    label: "23 ENE–28 MAR",
    title: "Postulación e inscripción de candidatos",
  },
  {
    date: "2027-03-20",
    label: "20 MAR 2027",
    title: "Cierre de inscripción de ciudadanos",
  },
  {
    date: "2027-03-29",
    label: "29 MAR 2027",
    title: "Inicio del período de campaña electoral",
  },
  {
    date: "2027-04-30",
    label: "24–30 ABR",
    title: "Publicación del padrón electoral",
  },
  {
    date: "2027-04-28",
    label: "28 ABR 2027",
    title: "Definición del número de JRV por municipio",
  },
  {
    date: "2027-05-28",
    label: "28 MAY 2027",
    title: "Publicidad del financiamiento",
  },
  {
    date: "2027-06-25T12:00:00-06:00",
    label: "25 JUN · 12:00",
    title: "Cierre de campaña, propaganda y publicación de encuestas",
  },
  { date: "2027-06-27", label: "27 JUN 2027", title: "Elecciones generales" },
] as const;
const areas = [
  {
    name: "Plan de campaña",
    detail: "Diagnóstico, objetivos y decisiones vigentes",
    section: "inteligencia",
    mark: "01",
  },
  {
    name: "Comunicación",
    detail: "Banco oficial de fotografías, logos y piezas",
    section: "recursos",
    mark: "02",
  },
  {
    name: "Control Financiero",
    detail: "Ingresos, egresos, comprobantes y presupuesto",
    section: "recursos",
    mark: "03",
  },
  {
    name: "Legal",
    detail: "Expedientes de candidatos y documentos del partido",
    section: "recursos",
    mark: "04",
  },
] as const;
function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}
function StrategyContent() {
  const { municipality_code } = useMunicipalityContext();
  const [values, setValues] = useState({
    conservador: "",
    base: "",
    optimista: "",
  });
  const [saved, setSaved] = useState("");
  const days = daysUntil(preliminaryElectionDate);
  const next = useMemo(
    () =>
      milestones
        .map((item) => ({
          ...item,
          time: new Date(
            item.date.includes("T") ? item.date : `${item.date}T23:59:00-06:00`,
          ).getTime(),
        }))
        .filter((item) => item.time >= Date.now())
        .sort((a, b) => a.time - b.time)[0] ?? null,
    [],
  );
  const nextDays = next
    ? Math.max(0, Math.ceil((next.time - Date.now()) / 86_400_000))
    : null;
  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>DIRECCIÓN DE CAMPAÑA</p>
          <h1>Estrategia</h1>
          <span>
            Objetivos, decisiones y ejecución conectada de la campaña municipal
          </span>
        </div>
      </section>
      <section className="campaign-command-center campaign-command-clean">
        <div className="campaign-election-row">
          <aside
            className="election-countdown compact"
            aria-label="Cuenta regresiva electoral"
          >
            <div>
              <strong>{days} días</strong>
              <span>para las elecciones</span>
            </div>
            <small>
              Fecha preliminar: 27 de junio de 2027 · pendiente de convocatoria
              oficial del TSE
            </small>
          </aside>
          {next ? (
            <aside
              className="campaign-legal-deadline"
              aria-label="Próximo hito del calendario electoral"
            >
              <small>PRÓXIMO HITO TSE · PRELIMINAR</small>
              <div>
                <b>{next.title}</b>
                <span>
                  {next.label}
                  {nextDays === null ? "" : ` · faltan ${nextDays} días`}
                </span>
              </div>
              <Link to={`/municipio/${municipality_code}/agenda`}>
                Ver calendario →
              </Link>
            </aside>
          ) : null}
        </div>
        <section
          className="strategy-goals"
          aria-labelledby="strategy-goals-title"
        >
          <header>
            <div>
              <small>RADAR + CAMPAÑA</small>
              <h2 id="strategy-goals-title">Metas y Escenarios</h2>
            </div>
            <p>
              Los datos superiores son referencias calculadas por RADAR. Los
              escenarios son objetivos internos definidos por la campaña, no
              predicciones.
            </p>
          </header>
          <div className="strategy-goals-radar">
            <article>
              <small>Padrón estimado 2027</small>
              <b>41,563</b>
            </article>
            <article>
              <small>Participación de referencia</small>
              <b>67.8%</b>
            </article>
            <article className="magic">
              <small>Número mágico</small>
              <b>9,000</b>
              <i>Estimación RADAR</i>
            </article>
          </div>
          <div className="strategy-scenarios">
            <label>
              <span>Escenario conservador</span>
              <input
                inputMode="numeric"
                value={values.conservador}
                onChange={(event) =>
                  setValues({
                    ...values,
                    conservador: event.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="Votos objetivo"
              />
              <small>Definido por la campaña</small>
            </label>
            <label>
              <span>Escenario base</span>
              <input
                inputMode="numeric"
                value={values.base}
                onChange={(event) =>
                  setValues({
                    ...values,
                    base: event.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="Votos objetivo"
              />
              <small>Definido por la campaña</small>
            </label>
            <label>
              <span>Escenario optimista</span>
              <input
                inputMode="numeric"
                value={values.optimista}
                onChange={(event) =>
                  setValues({
                    ...values,
                    optimista: event.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="Votos objetivo"
              />
              <small>Definido por la campaña</small>
            </label>
          </div>
          <footer>
            <span>
              Base: elecciones municipales 2011–2023, crecimiento del padrón y
              participación observada.
            </span>
            <button
              type="button"
              onClick={() => setSaved("Escenarios guardados.")}
            >
              Guardar escenarios
            </button>
          </footer>
          {saved ? <p className="strategy-goals-message">{saved}</p> : null}
        </section>
        <section
          className="campaign-state-clean"
          aria-labelledby="campaign-state-title"
        >
          <header>
            <small>ÁREAS DE TRABAJO</small>
            <h2 id="campaign-state-title">Estado de la Campaña</h2>
          </header>
          <div>
            {areas.map((area) => (
              <Link
                to={`/municipio/${municipality_code}/${area.section}`}
                key={area.name}
              >
                <i>{area.mark}</i>
                <span>
                  <b>{area.name}</b>
                  <small>{area.detail}</small>
                </span>
                <em>Entrar →</em>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
export function V70DirectStrategy0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="estrategia"
        eyebrow="ESTRATEGIA"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <StrategyContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
