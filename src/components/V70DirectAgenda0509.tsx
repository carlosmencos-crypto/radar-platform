import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  loadCampaignBundle,
  saveCampaignActivity,
  type CampaignActivityRecord,
  type CampaignCommitmentRecord,
} from "../data/radarRuntime";
import { getInstalledRadarVoterCommunities } from "../data/radarRuntimeCache";
import { V70DirectShell0509 } from "./V70DirectShell0509";

const electoralMilestones = [
  ["convocatoria", "22 ENE 2027", "Convocatoria a elecciones", "CANDIDATURA"],
  [
    "postulacion",
    "23 ENE–28 MAR",
    "Postulación e inscripción de candidatos",
    "CANDIDATURA",
  ],
  [
    "ciudadanos",
    "20 MAR 2027",
    "Cierre de inscripción de ciudadanos",
    "OPERACIÓN",
  ],
  [
    "campana-inicio",
    "29 MAR 2027",
    "Inicio del período de campaña electoral",
    "CAMPAÑA",
  ],
  ["padron", "24–30 ABR", "Publicación del padrón electoral", "OPERACIÓN"],
  [
    "jrv-municipio",
    "28 ABR 2027",
    "Definición del número de JRV por municipio",
    "OPERACIÓN",
  ],
  ["financiamiento", "28 MAY 2027", "Publicidad del financiamiento", "CAMPAÑA"],
  [
    "campana-cierre",
    "25 JUN · 12:00",
    "Cierre de campaña, propaganda y publicación de encuestas",
    "CAMPAÑA",
  ],
  ["eleccion", "27 JUN 2027", "Elecciones generales", "OPERACIÓN"],
  [
    "revision",
    "28 JUN–2 JUL",
    "Audiencias de revisión de escrutinios",
    "CANDIDATURA",
  ],
] as const;
const activityTypes = [
  "VISITA",
  "REUNIÓN",
  "MITIN",
  "CAMINATA",
  "EVENTO",
  "RECORRIDO",
  "CAPACITACIÓN",
  "OTRA",
] as const;
const emptyActivity = {
  title: "",
  activity_type: "REUNIÓN",
  starts_at: "",
  community: "",
  notes: "",
  status: "planned",
  latitude: null as number | null,
  longitude: null as number | null,
};
function initialActivity() {
  const params = new URLSearchParams(window.location.search);
  const latitudeParam = params.get("lat");
  const longitudeParam = params.get("lon");
  const latitude = latitudeParam === null ? Number.NaN : Number(latitudeParam);
  const longitude = longitudeParam === null ? Number.NaN : Number(longitudeParam);
  return {
    ...emptyActivity,
    community: params.get("community") ?? "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const pad = (first.getDay() + 6) % 7;
  return [
    ...Array<null>(pad).fill(null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
}
function displayActivityDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AgendaContent() {
  const { campaign_id, municipality_code } = useMunicipalityContext();
  const communities =
    getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [commitments, setCommitments] = useState<CampaignCommitmentRecord[]>(
    [],
  );
  const [open, setOpen] = useState(
    () => new URLSearchParams(window.location.search).get("new") === "1",
  );
  const [form, setForm] = useState(initialActivity);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const days = useMemo(() => monthCells(month), [month]);
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    if (!campaign_id) return;
    void ensureRadarAccessToken()
      .then((token) => loadCampaignBundle(campaign_id, token))
      .then((bundle) => {
        if (cancelled) return;
        setActivities(bundle.activities);
        setCommitments(bundle.commitments);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : "No se pudo cargar la agenda.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [campaign_id]);

  const upcoming = useMemo(
    () =>
      activities
        .filter(
          (activity) =>
            activity.starts_at &&
            new Date(activity.starts_at).getTime() >= Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.starts_at ?? 0).getTime() -
            new Date(b.starts_at ?? 0).getTime(),
        ),
    [activities],
  );
  const monthActivities = useMemo(
    () =>
      activities.filter((activity) => {
        if (!activity.starts_at) return false;
        const date = new Date(activity.starts_at);
        return (
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear()
        );
      }),
    [activities, month],
  );
  const openCommitments = commitments.filter(
    (item) => item.status !== "cumplido",
  );
  const overdueCommitments = openCommitments.filter(
    (item) =>
      item.due_date &&
      new Date(`${item.due_date}T23:59:59`).getTime() < Date.now(),
  );

  async function createActivity(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const startsAt = form.starts_at
        ? new Date(form.starts_at).toISOString()
        : null;
      const saved = await saveCampaignActivity(
        campaign_id,
        { ...form, starts_at: startsAt },
        token,
      );
      setActivities((current) => [...current, saved]);
      setForm(emptyActivity);
      setOpen(false);
      setMessage("Actividad creada correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la actividad.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>OPERACIÓN</p>
          <h1>Agenda</h1>
          <span>Actividades, responsables, participantes y compromisos</span>
        </div>
        <div className="section-banner-actions">
          <button type="button" onClick={() => setOpen(true)}>
            + Nueva actividad
          </button>
        </div>
      </section>
      {message ? (
        <p className="agenda-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="agenda-next">
        {upcoming[0] ? (
          <article>
            <div>
              <small>PRÓXIMA ACTIVIDAD EN LA AGENDA</small>
              <h2>{upcoming[0].title}</h2>
              <p>
                {displayActivityDate(upcoming[0].starts_at)}
                {upcoming[0].community ? ` · ${upcoming[0].community}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(true)}>
              + Nueva actividad
            </button>
          </article>
        ) : (
          <article className="empty">
            <div>
              <small>PRÓXIMA ACTIVIDAD EN LA AGENDA</small>
              <h2>No hay actividades programadas</h2>
              <p>Crea una actividad para verla destacada aquí.</p>
            </div>
            <button type="button" onClick={() => setOpen(true)}>
              + Nueva actividad
            </button>
          </article>
        )}
      </section>
      <section className="agenda-viewbar">
        <div>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendario
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            Lista
          </button>
        </div>
        <Link to={`/municipio/${municipality_code}/mapa`}>
          Ver actividades en el mapa →
        </Link>
      </section>
      <section className="agenda-workspace">
        <div className="agenda-calendar">
          <header>
            <div>
              <small>AGENDA COMPARTIDA</small>
              <h2>
                {view === "calendar"
                  ? month.toLocaleDateString("es-GT", {
                      month: "long",
                      year: "numeric",
                    })
                  : "Próximas actividades"}
              </h2>
            </div>
            {view === "calendar" ? (
              <nav>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  ←
                </button>
                <button onClick={() => setMonth(new Date())}>Hoy</button>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  →
                </button>
              </nav>
            ) : null}
          </header>
          {view === "calendar" ? (
            <div className="month-grid">
              <div className="month-week">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                  (label) => (
                    <span key={label}>{label}</span>
                  ),
                )}
              </div>
              <div className="month-days">
                {days.map((day, index) =>
                  day ? (
                    <article
                      className={
                        day === now.getDate() &&
                        month.getMonth() === now.getMonth() &&
                        month.getFullYear() === now.getFullYear()
                          ? "today"
                          : ""
                      }
                      key={day}
                    >
                      <b>{day}</b>
                      {monthActivities
                        .filter(
                          (activity) =>
                            new Date(activity.starts_at ?? 0).getDate() === day,
                        )
                        .slice(0, 2)
                        .map((activity) => (
                          <small key={activity.id} title={activity.title}>
                            {activity.title}
                          </small>
                        ))}
                    </article>
                  ) : (
                    <article className="blank" key={`b${index}`} />
                  ),
                )}
              </div>
            </div>
          ) : upcoming.length ? (
            upcoming.map((activity) => (
              <article key={activity.id}>
                <time>
                  <b>{new Date(activity.starts_at ?? 0).getDate()}</b>
                  <span>
                    {new Date(activity.starts_at ?? 0).toLocaleDateString(
                      "es-GT",
                      { month: "short" },
                    )}
                  </span>
                </time>
                <i style={{ background: "#552676" }} />
                <div>
                  <small>{activity.activity_type || "ACTIVIDAD"}</small>
                  <h3>{activity.title}</h3>
                  <p>{activity.community || "Sin comunidad"}</p>
                </div>
                <em>{displayActivityDate(activity.starts_at)}</em>
              </article>
            ))
          ) : (
            <div className="agenda-empty">
              <b>No hay actividades próximas.</b>
              <span>
                Crea una actividad con responsable del Directorio y
                participantes opcionales.
              </span>
              <button onClick={() => setOpen(true)}>Crear actividad</button>
            </div>
          )}
        </div>
        <aside>
          <small>CALENDARIO ELECTORAL</small>
          <h2>Guatemala 2027</h2>
          <p className="electoral-note">
            Fechas preliminares del TSE, sujetas al decreto oficial de
            convocatoria.
          </p>
          <div className="electoral-date-list">
            {electoralMilestones.map(([id, date, title, scope]) => (
              <article className="electoral-date" key={id}>
                <time>{date}</time>
                <b>{title}</b>
                <span>{scope} · PRELIMINAR</span>
              </article>
            ))}
          </div>
          <a
            href="https://tse.org.gt/comunicacion/noticias/tse-presenta-cronograma-electoral-preliminar-para-las-elecciones-generales-y-de-diputados-al-parlamento-centroamericano-2027"
            target="_blank"
            rel="noreferrer"
          >
            Consultar fuente oficial TSE ↗
          </a>
        </aside>
      </section>
      <section className="commitments-section">
        <header>
          <div>
            <small>SEGUIMIENTO DE ACUERDOS</small>
            <h2>Compromisos adquiridos</h2>
            <p>
              Cada compromiso tiene responsable, fecha límite, prioridad y
              evidencia de cumplimiento.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Disponible en el siguiente bloque funcional"
          >
            + Nuevo compromiso
          </button>
        </header>
        <div className="commitment-kpis">
          <span>
            <b>{openCommitments.length}</b> abiertos
          </span>
          <span>
            <b>{overdueCommitments.length}</b> vencidos
          </span>
          <span>
            <b>{commitments.length - openCommitments.length}</b> cumplidos
          </span>
        </div>
        <div className="commitment-list">
          <div className="agenda-empty">
            <b>
              {commitments.length
                ? "Compromisos cargados en Campaign Vault."
                : "No hay compromisos registrados."}
            </b>
            <span>
              {commitments.length
                ? "El detalle se habilitará en el bloque de seguimiento."
                : "Créalos al terminar una reunión o directamente desde este panel."}
            </span>
          </div>
        </div>
      </section>
      {open ? (
        <div
          className="agenda-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-activity-title"
        >
          <form onSubmit={createActivity}>
            <header>
              <div>
                <small>AGENDA</small>
                <h2 id="new-activity-title">Nueva actividad</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className="agenda-form-grid">
              <label className="wide">
                <span>Título *</span>
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Tipo</span>
                <select
                  value={form.activity_type}
                  onChange={(event) =>
                    setForm({ ...form, activity_type: event.target.value })
                  }
                >
                  {activityTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fecha y hora</span>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) =>
                    setForm({ ...form, starts_at: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                <span>Comunidad</span>
                <input
                  list="agenda-community-options"
                  value={form.community}
                  onChange={(event) =>
                    setForm({ ...form, community: event.target.value })
                  }
                />
                <datalist id="agenda-community-options">
                  {communities.map((item) => (
                    <option
                      key={item.community_normalized}
                      value={item.community_label}
                    />
                  ))}
                </datalist>
              </label>
              {form.latitude !== null && form.longitude !== null ? (
                <p className="agenda-map-point wide">
                  Punto exacto del mapa · {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                </p>
              ) : null}
              <label className="wide">
                <span>Notas</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>
            </div>
            {message ? <p className="form-error">{message}</p> : null}
            <footer>
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button disabled={saving}>
                {saving ? "Guardando…" : "Crear actividad"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function V70DirectAgenda0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="agenda"
        eyebrow="OPERACIÓN"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <AgendaContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
